import { useState } from 'react';
import { AuroraBg } from '../components/AuroraBg';
import { ScreenHeader } from '../components/ScreenHeader';
import { SubTabBar, type SubTabItem } from '../components/SubTabBar';
import { Fab } from '../components/Fab';
import { UsersList } from '../components/UsersList';
import { InviteSheet } from '../components/InviteSheet';
import { RevokeConfirmDialog } from '../components/RevokeConfirmDialog';
import { CapEditSheet } from '../components/CapEditSheet';
import { AiUsageList } from '../components/AiUsageList';
import { useAdminUsers } from '../hooks/useAdminUsers';
import { useAdminAiUsage } from '../hooks/useAdminAiUsage';
import type { AdminUserResponse } from '../api/types';
import styles from './AccessScreen.module.css';

type AccessTab = 'users' | 'ai-usage';

const TABS: SubTabItem<AccessTab>[] = [
  { id: 'users', label: 'Пользователи' },
  { id: 'ai-usage', label: 'AI Usage' },
];

export interface AccessScreenProps {
  onBack: () => void;
}

/**
 * Phase 13 ADM-01..05 + AIUSE-01..03 — главный экран «Доступ» (owner-only).
 *
 * Visibility-гейт реализован в ManagementScreen (filter ITEMS по
 * useUser().role); прямой переход на этот экран member'а блокируется
 * также в App.tsx routing — невозможно попасть кроме как через
 * ManagementScreen, который пункт скрывает.
 *
 * State:
 *   activeTab: 'users' | 'ai-usage'
 *   inviteOpen: BottomSheet open flag (Invite)
 *   revokeTarget: AdminUserResponse | null (Revoke confirm; null = closed)
 *   toast: temporary message (auto-hide 3s)
 *
 * Optimistic revoke (snapshot rollback) handled внутри useAdminUsers hook;
 * мы только catch'им rethrown ApiError для toast-уведомления.
 */
export function AccessScreen({ onBack }: AccessScreenProps) {
  const [activeTab, setActiveTab] = useState<AccessTab>('users');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<AdminUserResponse | null>(null);
  const [capEditTarget, setCapEditTarget] = useState<AdminUserResponse | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const usersHook = useAdminUsers();
  const usageHook = useAdminAiUsage();

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
  };

  const handleInvite = async (tg_user_id: number) => {
    // Rethrow on error so InviteSheet может показать inline error и НЕ
    // закрыть sheet (CONTEXT decision для 409 invite_exists).
    await usersHook.invite(tg_user_id);
    showToast('Приглашение создано');
    // AI usage list also benefits from refresh (new user appears with zeroes).
    void usageHook.refetch();
  };

  const handleUpdateCap = async (userId: number, cents: number) => {
    await usersHook.updateCap(userId, cents);
    showToast('Лимит обновлён');
  };

  const handleRevokeConfirm = async () => {
    if (!revokeTarget) return;
    try {
      await usersHook.revoke(revokeTarget.id);
      setRevokeTarget(null);
      showToast('Пользователь отозван');
      void usageHook.refetch();
    } catch (e: unknown) {
      // Hook rolled back state already; surface error to user.
      const msg = e instanceof Error ? e.message : 'Ошибка отзыва';
      showToast(`Ошибка: ${msg}`);
      setRevokeTarget(null);
    }
  };

  return (
    <div className={styles.wrap}>
      <AuroraBg />
      <div className={styles.scroll}>
      <ScreenHeader title="Доступ" subtitle="Whitelist и AI usage" onBack={onBack} />
      <div className={styles.tabsWrap}>
        <SubTabBar<AccessTab>
          active={activeTab}
          onChange={setActiveTab}
          tabs={TABS}
          variant="accent"
          tint="light"
        />
      </div>

      {toast && <div className={styles.toast} role="status">{toast}</div>}

      {activeTab === 'users' && (
        <div className={styles.content}>
          {usersHook.loading && <p className={styles.muted}>Загрузка…</p>}
          {usersHook.error && (
            <p className={styles.error}>Ошибка: {usersHook.error}</p>
          )}
          {!usersHook.loading && !usersHook.error && (
            <UsersList
              users={usersHook.users}
              onRevoke={setRevokeTarget}
              onEditCap={setCapEditTarget}
            />
          )}
        </div>
      )}

      {activeTab === 'ai-usage' && (
        <div className={styles.content}>
          {usageHook.loading && <p className={styles.muted}>Загрузка…</p>}
          {usageHook.error && (
            <p className={styles.error}>Ошибка: {usageHook.error}</p>
          )}
          {!usageHook.loading && !usageHook.error && usageHook.data && (
            <AiUsageList users={usageHook.data.users} />
          )}
        </div>
      )}
      </div>

      {activeTab === 'users' && (
        <Fab
          onClick={() => setInviteOpen(true)}
          ariaLabel="Пригласить пользователя"
        />
      )}

      <InviteSheet
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onSubmit={handleInvite}
      />
      <RevokeConfirmDialog
        target={revokeTarget}
        onConfirm={handleRevokeConfirm}
        onCancel={() => setRevokeTarget(null)}
      />
      <CapEditSheet
        target={capEditTarget}
        onClose={() => setCapEditTarget(null)}
        onSubmit={handleUpdateCap}
      />
    </div>
  );
}
