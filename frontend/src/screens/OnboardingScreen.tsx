import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Plus, Sparkle, ChartBar } from '@phosphor-icons/react';
import { apiFetch, openTelegramLink, ApiError } from '../api/client';
import type { OnboardingCompleteRequest, MeResponse } from '../api/types';
import { SunsetBg } from '../components/SunsetBg';
import { MainButton } from '../components/MainButton';
import styles from './OnboardingScreen.module.css';

const BOT_USERNAME = 'tg_budget_planner_bot';

/** Цикл-day пресеты + опция «другое» (показывает свободный ввод). */
const CYCLE_PRESETS = [1, 5, 10, 15, 20, 25, 28];

function parseRubles(input: string): number | null {
  const cleaned = input.replace(/\s/g, '').replace(',', '.');
  if (cleaned === '' || cleaned === '-') return null;
  const value = Number.parseFloat(cleaned);
  if (Number.isNaN(value)) return null;
  return Math.round(value * 100);
}

export interface OnboardingScreenProps {
  user: MeResponse;
  onRefreshUser: () => Promise<void>;
  onComplete: () => void;
}

/**
 * OnboardingScreen — Liquid Glass Sunset.
 * Source: more-screens.jsx OnboardingScreen.
 */
export function OnboardingScreen({ user, onRefreshUser, onComplete }: OnboardingScreenProps) {
  const [balanceStr, setBalanceStr] = useState<string>('');
  const initialDay = user.cycle_start_day || 5;
  const [cycleDay, setCycleDay] = useState<number>(initialDay);
  const [customDayMode, setCustomDayMode] = useState<boolean>(
    !CYCLE_PRESETS.includes(initialDay),
  );
  const [seedCats, setSeedCats] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const balanceCents = parseRubles(balanceStr);
  const isValid =
    balanceCents !== null &&
    cycleDay >= 1 &&
    cycleDay <= 28 &&
    !submitting;

  // Polling: when chat is not bound yet, refresh /me every 2s (max 30s) so the
  // UI flips to "✓ Привязано" without manual reload after the user taps /start.
  useEffect(() => {
    if (user.chat_id_known) return;
    let cancelled = false;
    let attempts = 0;
    const tick = async () => {
      if (cancelled || attempts >= 15) return;
      attempts += 1;
      await onRefreshUser();
    };
    const id = window.setInterval(() => { void tick(); }, 2000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [user.chat_id_known, onRefreshUser]);

  const handleOpenBot = useCallback(() => {
    openTelegramLink(`https://t.me/${BOT_USERNAME}?start=onboard`);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!isValid || balanceCents === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: OnboardingCompleteRequest = {
        starting_balance_cents: balanceCents,
        cycle_start_day: cycleDay,
        seed_default_categories: seedCats,
      };
      await apiFetch('/onboarding/complete', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      onComplete();
    } catch (e) {
      // 409 means already onboarded — proceed (server is source of truth).
      if (e instanceof ApiError && e.status === 409) {
        onComplete();
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }, [isValid, balanceCents, cycleDay, seedCats, onComplete]);

  const headingText = user.role === 'member'
    ? 'Добро пожаловать\nв команду'
    : 'Бюджет\nв одном касании';

  const subtitleText = user.role === 'member'
    ? 'Несколько шагов и вы готовы вести бюджет'
    : 'Записывайте траты, держите план,\nсмотрите тренды — без таблиц.';

  return (
    <div className={styles.root}>
      <SunsetBg />
      <div className={styles.content}>
        {/* Hero glass orb */}
        <div className={styles.heroWrap}>
          <div className={styles.orb}>
            <div className={styles.orbGlow} />
            <div className={`glass-dark--high ${styles.orbGlass}`} />
            <div className={styles.orbSymbol}>₽</div>
          </div>
        </div>

        {/* Heading */}
        <div className={styles.headingBlock}>
          <div className={styles.heading}>
            {headingText.split('\n').map((line, i) => (
              <span key={i}>
                {line}
                {i < headingText.split('\n').length - 1 && <br />}
              </span>
            ))}
          </div>
          <div className={styles.subtitle}>
            {subtitleText.split('\n').map((line, i) => (
              <span key={i}>
                {line}
                {i < subtitleText.split('\n').length - 1 && <br />}
              </span>
            ))}
          </div>
        </div>

        {/* Section: bot bind */}
        <Card>
          <div className={styles.cardLabel}>
            {user.chat_id_known ? 'Бот подключён' : 'Подключите бота'}
          </div>
          <div className={styles.cardSub}>
            {user.chat_id_known
              ? `@${BOT_USERNAME} · готов отправлять уведомления`
              : 'Нужен для напоминаний и быстрого ввода трат'}
          </div>
          <div className={styles.cardBody}>
            {user.chat_id_known ? (
              <div className={styles.botRow}>
                <span className={styles.botStatusDot} />
                <span className={styles.botStatusText}>Привязано</span>
              </div>
            ) : (
              <button type="button" className={styles.openBotBtn} onClick={handleOpenBot}>
                Открыть @{BOT_USERNAME} в Telegram
              </button>
            )}
          </div>
        </Card>

        {/* Section: starting balance */}
        <Card>
          <div className={styles.cardLabel}>Стартовый баланс</div>
          <div className={styles.cardSub}>
            Можно ввести 0 или отрицательное (долг)
          </div>
          <div className={styles.cardBody}>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0 ₽"
              value={balanceStr}
              onChange={(e) => setBalanceStr(e.target.value)}
              className={styles.balanceInput}
            />
          </div>
        </Card>

        {/* Section: cycle day picker */}
        <Card>
          <div className={styles.cardLabel}>День начала бюджета</div>
          <div className={styles.cardSub}>Например, день зарплаты</div>
          <div className={styles.cardBody}>
            <div className={styles.dayGrid}>
              {CYCLE_PRESETS.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`${styles.dayPill} ${
                    !customDayMode && cycleDay === d ? styles.dayPillActive : ''
                  }`}
                  onClick={() => { setCustomDayMode(false); setCycleDay(d); }}
                >
                  {d}
                </button>
              ))}
              <button
                type="button"
                className={`${styles.dayPill} ${styles.dayPillCustom} ${
                  customDayMode ? styles.dayPillActive : ''
                }`}
                onClick={() => setCustomDayMode(true)}
              >
                другое
              </button>
            </div>
            {customDayMode && (
              <input
                type="number"
                min={1}
                max={28}
                inputMode="numeric"
                placeholder="1..28"
                value={cycleDay}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isNaN(n)) setCycleDay(Math.max(1, Math.min(28, n)));
                }}
                className={styles.dayInput}
              />
            )}
          </div>
        </Card>

        {/* Section: seed categories */}
        <Card>
          <div className={styles.cardBody}>
            <label className={styles.toggleRow}>
              <span
                className={`${styles.checkbox} ${seedCats ? styles.checkboxOn : ''}`}
                onClick={(e) => { e.preventDefault(); setSeedCats((v) => !v); }}
              >
                {seedCats && <span className={styles.checkmark}>✓</span>}
              </span>
              <span>
                Добавить 14 готовых категорий (Продукты, Дом, Транспорт и т.&nbsp;д.)
                — можно отредактировать позже.
              </span>
            </label>
          </div>
        </Card>

        {/* Decorative feature pills */}
        <div className={styles.features}>
          <Feature
            icon={<Plus size={16} weight="bold" />}
            text="Запись траты — 2 секунды"
          />
          <Feature
            icon={<Sparkle size={16} weight="fill" />}
            text="AI-ассистент знает твой бюджет"
          />
          <Feature
            icon={<ChartBar size={16} weight="regular" />}
            text="Прогноз на конец месяца"
          />
        </div>

        <div className={styles.spacer} />

        {error && <div className={styles.errorBanner}>Ошибка: {error}</div>}

        <MainButton
          text={submitting ? 'Сохранение…' : 'Начать'}
          enabled={isValid}
          onClick={handleSubmit}
        />
      </div>
    </div>
  );
}

/** Inline glass-dark карточка для секций onboarding. */
function Card({ children }: { children: ReactNode }) {
  return <div className={`glass-dark ${styles.card}`}>{children}</div>;
}

function Feature({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className={`glass-dark ${styles.featurePill}`}>
      <div className={styles.featureBody}>
        <div className={styles.featureIcon}>{icon}</div>
        <span className={styles.featureText}>{text}</span>
      </div>
    </div>
  );
}
