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
// last-known server snapshot and surface the message via <Toast> (P2-11).

import { useCallback, useEffect, useState } from 'react';
import { getSettings, updateSettings } from '../../api/settings';
import { getMeV10 } from '../../api/me';
import { getBalance } from '../../api/actual';
import { reconcileBalance } from '../../api/v10';
import type { SettingsRead, SettingsUpdatePayload } from '../../api/types';
import { usePosterRouter } from '../common';
import { NativeToast } from '../native/NativeToast';
import {
  NativeSettingsView,
  type SettingsViewProps,
} from './NativeSettingsView';

const FALLBACK_CYCLE_DAY = 1;
const FALLBACK_NOTIFY_DAYS = 2;

export function SettingsMount() {
  const router = usePosterRouter();
  const [settings, setSettings] = useState<SettingsRead | null>(null);
  const [aiCapCents, setAiCapCents] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // v1.1 — «Привести остаток»: current computed balance + reconcile in-flight.
  const [balanceNowCents, setBalanceNowCents] = useState<number | null>(null);
  const [reconciling, setReconciling] = useState(false);
  // P2-11: PATCH error surface (single toast slot, last error wins).
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getSettings(), getMeV10(), getBalance()])
      .then(([s, me, balance]) => {
        if (cancelled) return;
        setSettings(s);
        setAiCapCents(me.ai_spending_cap_cents);
        setBalanceNowCents(balance.balance_now_cents);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : 'Не удалось загрузить настройки',
        );
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
        setToastMsg(`Ошибка сохранения: ${msg}`);
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

  // v1.1 — reconcile: write a balancing adjustment so the displayed balance
  // becomes `targetCents`, then refresh the shown balance from the response.
  const handleReconcileBalance = useCallback(async (targetCents: number) => {
    setReconciling(true);
    try {
      const res = await reconcileBalance(targetCents);
      setBalanceNowCents(res.balance_now_cents);
      setToastMsg(
        res.adjustment_txn_id == null
          ? 'Остаток уже совпадает'
          : '✓ Остаток приведён',
      );
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : 'Не удалось привести остаток';
      setToastMsg(`Ошибка: ${msg}`);
    } finally {
      setReconciling(false);
    }
  }, []);

  const viewProps: SettingsViewProps = {
    cycle_start_day: settings?.cycle_start_day ?? FALLBACK_CYCLE_DAY,
    notify_days_before: settings?.notify_days_before ?? FALLBACK_NOTIFY_DAYS,
    ai_categorization_enabled: settings?.enable_ai_categorization ?? true,
    ai_spend_cap_cents: aiCapCents,
    loading,
    error,
    onChangeCycleDay: handleChangeCycleDay,
    onChangeNotifyDays: handleChangeNotifyDays,
    onToggleAiCat: handleToggleAiCat,
    canPop: router.canPop,
    onBack: () => router.pop(),
    balanceNowCents,
    onReconcileBalance: handleReconcileBalance,
    reconciling,
  };

  return (
    <>
      <NativeSettingsView {...viewProps} />
      <NativeToast
        message={toastMsg ?? ''}
        visible={toastMsg !== null}
        onDismiss={() => setToastMsg(null)}
        duration={4000}
      />
    </>
  );
}
