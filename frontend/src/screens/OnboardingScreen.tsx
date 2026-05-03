import { useCallback, useEffect, useState } from 'react';
import { apiFetch, openTelegramLink, ApiError } from '../api/client';
import type { OnboardingCompleteRequest, MeResponse } from '../api/types';
import { SectionCard } from '../components/SectionCard';
import { Stepper } from '../components/Stepper';
import { MainButton } from '../components/MainButton';
import styles from './OnboardingScreen.module.css';

const BOT_USERNAME = 'tg_budget_planner_bot'; // matches settings.BOT_USERNAME default

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

export function OnboardingScreen({ user, onRefreshUser, onComplete }: OnboardingScreenProps) {
  const [balanceStr, setBalanceStr] = useState<string>('');
  const [cycleDay, setCycleDay] = useState<number>(user.cycle_start_day || 5);
  const [seedCats, setSeedCats] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const balanceCents = parseRubles(balanceStr);
  const isValid =
    user.chat_id_known &&
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
    const id = window.setInterval(() => {
      void tick();
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
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
      // 409 means already onboarded — proceed to home (server is source of truth).
      if (e instanceof ApiError && e.status === 409) {
        onComplete();
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }, [isValid, balanceCents, cycleDay, seedCats, onComplete]);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.title}>Добро пожаловать</div>
      </header>

      <div className={styles.intro}>
        <div className={styles.heroIcon}>💸</div>
        <div className={styles.heroTitle}>Несколько шагов</div>
        <div className={styles.heroHint}>Заполните по порядку — займёт минуту</div>
      </div>

      {/* Section 1: bot bind */}
      <SectionCard
        number={1}
        title={user.chat_id_known ? 'Бот подключён' : 'Подключите бота'}
        done={user.chat_id_known}
      >
        {user.chat_id_known ? (
          <div className={styles.sectionMuted}>
            @{BOT_USERNAME} · готов отправлять уведомления
          </div>
        ) : (
          <button type="button" className={styles.openBotBtn} onClick={handleOpenBot}>
            Открыть @{BOT_USERNAME} в Telegram
          </button>
        )}
      </SectionCard>

      {/* Section 2: starting balance */}
      <SectionCard number={2} title="Стартовый баланс">
        <div className={styles.field}>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={balanceStr}
            onChange={(e) => setBalanceStr(e.target.value)}
            className={styles.balanceInput}
          />
          <div className={styles.fieldHint}>
            Будет начальной точкой для текущего периода. Можно ввести 0 или отрицательное (долг).
          </div>
        </div>
      </SectionCard>

      {/* Section 3: cycle day */}
      <SectionCard number={3} title="День начала периода">
        <Stepper value={cycleDay} min={1} max={28} onChange={setCycleDay} wrap />
        <div className={styles.fieldHint}>
          Например, 5 = период с 5-го одного месяца по 4-е следующего. Можно поменять в Настройках.
        </div>
      </SectionCard>

      {/* Section 4: seed categories */}
      <SectionCard number={4} title="Стартовые категории">
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={seedCats}
            onChange={(e) => setSeedCats(e.target.checked)}
          />
          <span>Засеять 14 стартовых категорий (Продукты, Дом, Машина и т.д.)</span>
        </label>
        <div className={styles.fieldHint}>
          Можно отредактировать или добавить свои в разделе «Категории».
        </div>
      </SectionCard>

      {error && <div className={styles.errorBanner}>Ошибка: {error}</div>}

      <MainButton
        text={submitting ? 'Сохранение…' : 'Готово'}
        enabled={isValid}
        onClick={handleSubmit}
      />
    </div>
  );
}
