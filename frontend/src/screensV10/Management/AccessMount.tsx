// Phase 27-06 Task 2: AccessMount — fetches admin users + AI usage,
// drives AccessView through tab state.
//
// Owner-gate (defence-in-depth): backend admin routes already require
// `owner` role; we additionally trap 403 errors and surface a friendly
// «Только для владельца» message instead of leaving raw error text.

import { useEffect, useState } from 'react';
import { listAdminUsers, getAdminAiUsage } from '../../api/admin';
import { ApiError } from '../../api/client';
import { usePosterRouter } from '../common';
import { useShellVariant } from '../native/ShellVariant';
import {
  AccessView,
  type AccessAiUsage,
  type AccessTab,
  type AccessUser,
} from './AccessView';
import { NativeAccessView } from './NativeAccessView';

export function AccessMount() {
  const router = usePosterRouter();
  const variant = useShellVariant();
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [aiUsage, setAiUsage] = useState<AccessAiUsage[]>([]);
  const [activeTab, setActiveTab] = useState<AccessTab>('users');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([listAdminUsers(), getAdminAiUsage()])
      .then(([adminUsers, usageResp]) => {
        if (cancelled) return;
        // Map AdminUserResponse → AccessUser (slim view-model).
        setUsers(
          adminUsers.map((u) => ({
            id: u.id,
            tg_user_id: u.tg_user_id,
            // AdminUserResponse has no display name — use null; view falls back to tg_user_id.
            username: null,
            role: u.role,
          })),
        );
        // Map AdminAiUsageRow → AccessAiUsage (compact totals view).
        setAiUsage(
          usageResp.users.map((row) => ({
            user_id: row.user_id,
            name: row.name,
            tokens: row.current_month.total_tokens,
            cost_cents: row.est_cost_cents_current_month,
          })),
        );
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 403) {
          setError('Только для владельца');
        } else {
          setError(e instanceof Error ? e.message : 'Не удалось загрузить');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const viewProps = {
    users,
    aiUsage,
    activeTab,
    onSwitchTab: setActiveTab,
    loading,
    error,
    canPop: router.canPop,
    onBack: () => router.pop(),
  };

  // Liquid Glass native shell → native iOS Access view. Same props/handlers.
  if (variant === 'native') return <NativeAccessView {...viewProps} />;

  return <AccessView {...viewProps} />;
}
