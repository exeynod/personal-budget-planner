import { useCallback, useEffect, useRef, useState } from 'react';
import { getSettings, updateSettings } from '../api/settings';
import { Stepper } from '../components/Stepper';
import { MainButton } from '../components/MainButton';
import { ScreenHeader } from '../components/ScreenHeader';
import styles from './SettingsScreen.module.css';

export interface SettingsScreenProps {
  onBack: () => void;
}

/**
 * Settings editor (SET-01 UI).
 *
 * Loads current cycle_start_day from /settings on mount; user edits via
 * Stepper (1..28, wrap-around enabled to match Onboarding behaviour).
 * MainButton "Сохранить" is enabled only when draft != current (`dirty`).
 *
 * On save:
 *  - PATCH /settings with new cycle_start_day
 *  - Sync `current` from response (so MainButton goes back to disabled)
 *  - Show "✓ Сохранено" toast for ~1.5 s
 *
 * Disclaimer below the stepper communicates SET-01 contract: change applies
 * only to the *next* period; the current period keeps its existing dates.
 */
export function SettingsScreen({ onBack }: SettingsScreenProps) {
  const [current, setCurrent] = useState<number | null>(null);
  const [draft, setDraft] = useState<number>(5);
  const [currentNotifyDays, setCurrentNotifyDays] = useState<number | null>(null);
  const [notifyDays, setNotifyDays] = useState<number>(2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saving, setSaving] = useState(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear pending flash timer on unmount to avoid state updates on unmounted component.
  useEffect(() => {
    return () => {
      if (flashTimerRef.current !== null) {
        clearTimeout(flashTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getSettings()
      .then((s) => {
        if (!active) return;
        setCurrent(s.cycle_start_day);
        setDraft(s.cycle_start_day);
        setCurrentNotifyDays(s.notify_days_before);
        setNotifyDays(s.notify_days_before);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const dirty =
    (current !== null && draft !== current) ||
    (currentNotifyDays !== null && notifyDays !== currentNotifyDays);

  const handleSave = useCallback(async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateSettings({
        cycle_start_day: draft,
        notify_days_before: notifyDays,
      });
      setCurrent(updated.cycle_start_day);
      setDraft(updated.cycle_start_day);
      setCurrentNotifyDays(updated.notify_days_before);
      setNotifyDays(updated.notify_days_before);
      setSavedFlash(true);
      if (flashTimerRef.current !== null) {
        clearTimeout(flashTimerRef.current);
      }
      flashTimerRef.current = setTimeout(() => setSavedFlash(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [dirty, draft, notifyDays, saving]);

  return (
    <div className={styles.root}>
      <ScreenHeader title="Настройки" onBack={onBack} />

      {loading && <div className={styles.muted}>Загрузка…</div>}
      {error && <div className={styles.error}>Ошибка: {error}</div>}

      {!loading && current !== null && (
        <section className={styles.card}>
          <div className={styles.cardTitle}>День начала периода</div>
          <Stepper value={draft} min={1} max={28} onChange={setDraft} wrap />
          <div className={styles.disclaimer}>
            ⓘ Изменение применится со следующего периода. Текущий период продолжается с
            тем же днём начала.
          </div>
        </section>
      )}

      {!loading && currentNotifyDays !== null && (
        <section className={styles.card}>
          <div className={styles.cardTitle}>Уведомления о подписках</div>
          <label className={styles.notifyLabel}>
            Напоминать за (дней до списания)
            <input
              type="number"
              min={0}
              max={30}
              value={notifyDays}
              onChange={(e) =>
                setNotifyDays(Math.max(0, Math.min(30, Number(e.target.value) || 0)))
              }
              className={styles.notifyInput}
            />
          </label>
          <div className={styles.disclaimer}>
            ⓘ Применяется только к новым подпискам. Существующие имеют свой настроенный
            override.
          </div>
        </section>
      )}

      {savedFlash && <div className={styles.savedToast}>✓ Сохранено</div>}

      <MainButton
        text={saving ? 'Сохранение…' : 'Сохранить'}
        enabled={dirty && !saving}
        onClick={handleSave}
      />
    </div>
  );
}
