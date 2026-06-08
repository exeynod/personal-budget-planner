// ADR-0007 — «Регулярные платежи» (прогноз кэшфлоу) screen.
//
// Reachable from the Management hub. Shows GET /subscriptions/recurring/cashflow:
//   - таймлайн ближайших списаний (date · name · amount, grouped by date),
//   - проекция остатка (balance_after_cents; negative points flagged red),
//   - месячная нагрузка (monthly_burden_cents).
// Tapping a timeline item opens the RecurringEditor for that payment (resolved
// from the recurring list by subscription_id) — the same form used in the
// template fork.

import { useCallback, useState } from 'react';
import {
  getRecurringCashflow,
  listRecurring,
  listCategoriesV10,
  listAccounts,
  updateRecurring,
  deleteRecurring,
  type CashflowProjectionResponse,
  type SubscriptionV10Read,
  type CategoryV10,
  type AccountResponse,
  type RecurringCreatePayload,
  type RecurringUpdatePayload,
} from '../../api/v10';
import {
  StatePlate,
  usePosterRouter,
  useResource,
} from '../common';
import { NativeToast } from '../native/NativeToast';
import { NativeRecurringCashflowView } from './NativeRecurringCashflowView';

interface DataPayload {
  cashflow: CashflowProjectionResponse;
  recurring: SubscriptionV10Read[];
  categories: CategoryV10[];
  accounts: AccountResponse[];
}

export function RecurringCashflowMount() {
  const router = usePosterRouter();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<
    { text: string; tone: 'success' | 'error' } | null
  >(null);

  const fetchData = useCallback(
    async (): Promise<DataPayload> => {
      const [cashflow, recurring, categories, accounts] = await Promise.all([
        getRecurringCashflow(90),
        listRecurring(),
        listCategoriesV10(),
        listAccounts(),
      ]);
      return { cashflow, recurring, categories, accounts };
    },
    [],
  );

  const { status, data, error, reload } = useResource<DataPayload>(
    fetchData,
    [],
    { keepPreviousData: true },
  );

  const handleUpdate = useCallback(
    async (id: number, payload: RecurringUpdatePayload) => {
      setBusy(true);
      try {
        await updateRecurring(id, payload);
        reload();
        setToast({ text: '✓ Сохранено', tone: 'success' });
      } catch (e) {
        setToast({
          text: `Ошибка: ${e instanceof Error ? e.message : 'не удалось сохранить'}`,
          tone: 'error',
        });
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  const handleDelete = useCallback(
    async (id: number) => {
      setBusy(true);
      try {
        await deleteRecurring(id);
        reload();
        setToast({ text: 'Платёж удалён', tone: 'success' });
      } catch (e) {
        setToast({
          text: `Ошибка: ${e instanceof Error ? e.message : 'не удалось удалить'}`,
          tone: 'error',
        });
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  // The editor's onCreate is never used here (cashflow only edits existing
  // payments), but the prop is required by RecurringEditor — provide a no-op.
  const noopCreate = useCallback((_payload: RecurringCreatePayload) => {}, []);

  const handleBack = useCallback(() => router.pop(), [router]);

  if (status === 'loading') {
    return <StatePlate variant="loading" testId="recurring-cashflow-loading" />;
  }
  if (status === 'error' || data === null) {
    return (
      <StatePlate
        variant="error"
        testId="recurring-cashflow-error"
        message={error ?? 'Не удалось загрузить прогноз'}
        onRetry={reload}
        onBack={handleBack}
      />
    );
  }

  return (
    <>
      <NativeRecurringCashflowView
        cashflow={data.cashflow}
        recurring={data.recurring}
        categories={data.categories}
        accounts={data.accounts}
        busy={busy}
        onCreate={noopCreate}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        onBack={handleBack}
      />
      <NativeToast
        message={toast?.text ?? ''}
        tone={toast?.tone ?? 'success'}
        visible={toast !== null}
        onDismiss={() => setToast(null)}
        duration={2500}
      />
    </>
  );
}
