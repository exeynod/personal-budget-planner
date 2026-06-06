// Phase 27-04 Task 3: AccountsListMount — data fetcher + new-account sheet wiring.
//
// Lifecycle:
//   1. On mount, fetch listAccounts() (re-fetch on reloadToken bump).
//   2. Render <AccountsListView> wired to:
//      - onAccountTap(id) → router.push(<AccountDetailMount accountId={id} />)
//      - onAddAccount → setSheet('newAccount') → opens <NewAccountSheet>
//      - onTransfer → no-op (button disabled in view)
//      - onBack → router.pop()
//   3. <NewAccountSheet> POST handler → createAccount → close + reload.
//   4. canPop is taken from the router (true when this Mount is on a deeper
//      stack frame; false when it's a tab-root in V10MainShell).
//
// Reachability:
//   - Phase 27-06 will mount this from V10MainShell tab='savings' or Mgmt-хаб
//     «02 СЧЕТА» row. This plan only ships the Mount — no shell wiring.
//
// Failure mode (P2-11 / R5): mutation errors surface via <Toast> (parity with
// TransactionsMount / SubscriptionsMount); replaces the old alert.

import { useCallback, useEffect, useState } from 'react';
import { usePosterRouter, PosterSheet } from '../common';
import { Toast } from '../../componentsV10';
import {
  listAccounts,
  createAccount,
  type AccountResponse,
  type AccountCreatePayload,
} from '../../api/v10';
import { AccountsListView } from './AccountsListView';
import { NativeAccountsListView } from './NativeAccountsListView';
import { useShellVariant } from '../native/ShellVariant';
import { AccountDetailMount } from './AccountDetailMount';
import { NewAccountSheet } from './NewAccountSheet';

export interface AccountsListMountProps {
  /** Whether ← НАЗАД is rendered. Defaults to false (tab-root usage). */
  canPop?: boolean;
}

export function AccountsListMount(props: AccountsListMountProps = {}) {
  const router = usePosterRouter();
  const variant = useShellVariant();
  const canPop = props.canPop ?? false;

  const [accounts, setAccounts] = useState<AccountResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'none' | 'newAccount'>('none');
  const [submitting, setSubmitting] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  // P2-11: mutation error surface (single toast slot, last error wins).
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // ─────────── fetch ───────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const list = await listAccounts();
        if (cancelled) return;
        setAccounts(list);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : 'Не удалось загрузить счета',
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  // ─────────── handlers ───────────
  const onAccountTap = useCallback(
    (id: number) => {
      router.push(<AccountDetailMount accountId={id} />);
    },
    [router],
  );

  const onAddAccount = useCallback(() => setSheet('newAccount'), []);
  const onTransfer = useCallback(() => {
    /* disabled CTA — no-op (DF-V11-01 deferred per plan threat model T-27-04-04) */
  }, []);
  const onBack = useCallback(() => router.pop(), [router]);
  const onSheetClose = useCallback(() => setSheet('none'), []);

  const handleNewAccountSave = useCallback(
    async (payload: AccountCreatePayload) => {
      if (submitting) return;
      setSubmitting(true);
      try {
        await createAccount(payload);
        setSheet('none');
        setReloadToken((n) => n + 1);
      } catch {
        setToastMsg('Не удалось создать счёт — попробуйте снова');
      } finally {
        setSubmitting(false);
      }
    },
    [submitting],
  );

  // Liquid Glass v2: same props feed the native or poster list view. The
  // NewAccountSheet («+» action) + Toast wrappers are shared by both variants.
  const listView =
    variant === 'native' ? (
      <NativeAccountsListView
        accounts={accounts}
        loading={loading}
        error={error}
        onAccountTap={onAccountTap}
        onAddAccount={onAddAccount}
        onTransfer={onTransfer}
        canPop={canPop}
        onBack={onBack}
      />
    ) : (
      <AccountsListView
        accounts={accounts}
        loading={loading}
        error={error}
        onAccountTap={onAccountTap}
        onAddAccount={onAddAccount}
        onTransfer={onTransfer}
        canPop={canPop}
        onBack={onBack}
      />
    );

  return (
    <>
      {listView}
      <PosterSheet
        isOpen={sheet === 'newAccount'}
        onClose={onSheetClose}
        backgroundColor="var(--poster-paper)"
        testId="new-account-poster-sheet"
      >
        <NewAccountSheet
          onSave={handleNewAccountSave}
          onClose={onSheetClose}
          submitting={submitting}
        />
      </PosterSheet>
      <Toast
        message={toastMsg ?? ''}
        visible={toastMsg !== null}
        onDismiss={() => setToastMsg(null)}
        duration={4000}
      />
    </>
  );
}
