// Phase 27-06 Task 2: SettingsMount — fetches /settings + /me, wires
// optimistic PATCHes to SettingsView.
//
// Data sources:
//   - GET /settings → { cycle_start_day, notify_days_before,
//                       enable_ai_categorization, is_bot_bound }
//   - GET /me      → { ai_spending_cap_cents } (read-only display)
//
// Mutations: every change PATCHes /settings with the single delta. Optimistic
// local state ensures the stepper feels instant; on error we revert to the
// last-known server snapshot and surface the message via window.alert.

import { useCallback, useEffect, useState } from 'react';
import { getSettings, updateSettings } from '../../api/settings';
import { getMeV10 } from '../../api/me';
import type { SettingsRead, SettingsUpdatePayload } from '../../api/types';
import { usePosterRouter } from '../common';
import { SettingsView } from './SettingsView';

const FALLBACK_CYCLE_DAY = 1;
const FALLBACK_NOTIFY_DAYS = 2;

export function SettingsMount() {
  const router = usePosterRouter();
  const [settings, setSettings] = useState<SettingsRead | null>(null);
  const [aiCapCents, setAiCapCents] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getSettings(), getMeV10()])
      .then(([s, me]) => {
        if (cancelled) return;
        setSettings(s);
        setAiCapCents(me.ai_spending_cap_cents);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Не удалось загрузить настройки');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = useCallback(
    async (delta: SettingsUpdatePayload) => {
      if (settings === null) return;
      const previous = settings;
      // Optimistic merge.
      setSettings({ ...settings, ...delta } as SettingsRead);
      try {
        const updated = await updateSettings(delta);
        setSettings(updated);
      } catch (e: unknown) {
        // Rollback + alert.
        setSettings(previous);
        const msg = e instanceof Error ? e.message : 'Не удалось сохранить';
        if (typeof window !== 'undefined') {
          window.alert(`Ошибка сохранения: ${msg}`);
        }
      }
    },
    [settings],
  );

  const handleChangeCycleDay = useCallback(
    (d: number) => {
      void patch({ cycle_start_day: d });
    },
    [patch],
  );
  const handleChangeNotifyDays = useCallback(
    (d: number) => {
      void patch({ notify_days_before: d });
    },
    [patch],
  );
  const handleToggleAiCat = useCallback(
    (enabled: boolean) => {
      void patch({ enable_ai_categorization: enabled });
    },
    [patch],
  );

  return (
    <SettingsView
      cycle_start_day={settings?.cycle_start_day ?? FALLBACK_CYCLE_DAY}
      notify_days_before={settings?.notify_days_before ?? FALLBACK_NOTIFY_DAYS}
      ai_categorization_enabled={settings?.enable_ai_categorization ?? true}
      ai_spend_cap_cents={aiCapCents}
      loading={loading}
      error={error}
      onChangeCycleDay={handleChangeCycleDay}
      onChangeNotifyDays={handleChangeNotifyDays}
      onToggleAiCat={handleToggleAiCat}
      canPop={router.canPop}
      onBack={() => router.pop()}
    />
  );
}
