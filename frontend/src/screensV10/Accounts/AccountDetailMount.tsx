// Phase 27-04 Task 3: AccountDetailMount — data fetcher for one account.
//
// Lifecycle:
//   1. On mount with accountId, parallel-fetch:
//        - listAccounts()    (then filter to id)
//        - listCategoriesV10()
//        - getCurrentPeriod() (for tx range filter on the «В МАЕ» KPI)
//      Then sequential listActualV10(period.id) when period exists.
//   2. Filter actuals client-side to this account_id (no per-account
//      backend filter today; period scope keeps the list small).
//   3. Render <AccountDetailView>.
//   4. onBack → router.pop().
//
// Re-fetch is not auto-wired (no mutations on this screen yet); future
// Tx-edit-from-detail can add a reloadToken if needed.

import { useEffect, useState } from 'react';
import { usePosterRouter } from '../common';
import {
  listAccounts,
  listActualV10,
  listCategoriesV10,
  type AccountResponse,
  type ActualV10Read,
  type CategoryV10,
} from '../../api/v10';
import { getCurrentPeriod } from '../../api/periods';
import { filterByAccount } from './computeAccounts';
import { AccountDetailView } from './AccountDetailView';

// TODO P2 (period switching): the «В <месяце>» KPI tx-range still pins to
// getCurrentPeriod(). Scoping it to the viewed period is deferred — account
// balances are point-in-time (not period-scoped), so showing a past period's
// movements alongside the live balance needs a dedicated design (out of P2).

export interface AccountDetailMountProps {
  accountId: number;
}

export function AccountDetailMount({ accountId }: AccountDetailMountProps) {
  const router = usePosterRouter();

  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [actuals, setActuals] = useState<ActualV10Read[]>([]);
  const [categories, setCategories] = useState<CategoryV10[]>([]);
  const [period, setPeriod] = useState<{
    period_start: string;
    period_end: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        const [accs, cats, periodRow] = await Promise.all([
          listAccounts(),
          listCategoriesV10(),
          getCurrentPeriod(),
        ]);
        if (cancelled) return;

        const found = accs.find((a) => a.id === accountId) ?? null;
        setAccount(found);
        setCategories(cats);
        setPeriod(
          periodRow
            ? {
                period_start: periodRow.period_start,
                period_end: periodRow.period_end,
              }
            : null,
        );

        if (periodRow) {
          const acts = await listActualV10(periodRow.id);
          if (cancelled) return;
          // Filter client-side to this account.
          setActuals(filterByAccount(acts, accountId));
        } else {
          setActuals([]);
        }
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : 'Не удалось загрузить счёт',
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  return (
    <AccountDetailView
      account={account}
      actuals={actuals}
      categories={categories}
      period={period}
      loading={loading}
      error={error}
      canPop
      onBack={() => router.pop()}
      onTxRowTap={() => {
        /* MVP no-op — defer deep-link into Transactions registry to polish */
      }}
    />
  );
}
