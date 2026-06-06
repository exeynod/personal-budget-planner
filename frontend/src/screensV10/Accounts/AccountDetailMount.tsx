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

import { useCallback } from 'react';
import { usePosterRouter, useResource } from '../common';
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

interface AccountDetailPayload {
  account: AccountResponse | null;
  actuals: ActualV10Read[];
  categories: CategoryV10[];
  period: { period_start: string; period_end: string } | null;
}

export function AccountDetailMount({ accountId }: AccountDetailMountProps) {
  const router = usePosterRouter();

  const fetchAccountDetail = useCallback(
    async (isCancelled: () => boolean): Promise<AccountDetailPayload> => {
      const [accs, cats, periodRow] = await Promise.all([
        listAccounts(),
        listCategoriesV10(),
        getCurrentPeriod(),
      ]);

      const account = accs.find((a) => a.id === accountId) ?? null;
      const period = periodRow
        ? {
            period_start: periodRow.period_start,
            period_end: periodRow.period_end,
          }
        : null;

      let actuals: ActualV10Read[] = [];
      if (periodRow) {
        const acts = await listActualV10(periodRow.id);
        if (isCancelled())
          return { account, actuals: [], categories: cats, period };
        // Filter client-side to this account.
        actuals = filterByAccount(acts, accountId);
      }
      return { account, actuals, categories: cats, period };
    },
    [accountId],
  );

  const { status, data, error } = useResource<AccountDetailPayload>(
    fetchAccountDetail,
    [accountId],
  );

  // The View keeps consuming loading/error props (it renders its own inline
  // skeleton + error states), so we adapt useResource's status back to the
  // boolean/null shape it expects — behaviour identical to the prior useState.
  const loading = status === 'loading';

  return (
    <AccountDetailView
      account={data?.account ?? null}
      actuals={data?.actuals ?? []}
      categories={data?.categories ?? []}
      period={data?.period ?? null}
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
