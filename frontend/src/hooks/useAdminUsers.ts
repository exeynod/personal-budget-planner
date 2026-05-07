import { useCallback, useEffect, useRef, useState } from 'react';
import {
  inviteAdminUser,
  listAdminUsers,
  revokeAdminUser,
} from '../api/admin';
import type { AdminUserResponse } from '../api/types';

export interface UseAdminUsersResult {
  users: AdminUserResponse[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  /** Invite by tg_user_id; resolves to created user; rejects with ApiError on 409/422 */
  invite: (tg_user_id: number) => Promise<AdminUserResponse>;
  /** Revoke (cascade purge); optimistic UI removes row immediately, rolls back on error */
  revoke: (userId: number) => Promise<void>;
}

/**
 * Phase 13 admin users hook (ADM-03..06).
 *
 * Fetch + invite + revoke (optimistic). Owner-only — calling this hook
 * from a member-context will surface a 403 error, but the AccessScreen
 * will not render in that case (ManagementScreen filters the menu item
 * via useUser().role).
 */
export function useAdminUsers(): UseAdminUsersResult {
  const [users, setUsers] = useState<AdminUserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAdminUsers();
      if (mountedRef.current) setUsers(data);
    } catch (e: unknown) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : 'load failed');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    listAdminUsers()
      .then((data) => {
        if (!cancelled && mountedRef.current) setUsers(data);
      })
      .catch((e: unknown) => {
        if (!cancelled && mountedRef.current) {
          setError(e instanceof Error ? e.message : 'load failed');
        }
      })
      .finally(() => {
        if (!cancelled && mountedRef.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const invite = useCallback(async (tg_user_id: number) => {
    // Backend assigns id + created_at — wait for server response then append.
    const created = await inviteAdminUser({ tg_user_id });
    if (mountedRef.current) {
      setUsers((prev) => {
        // Insert keeping owner-first sort: append at end (member position).
        return [...prev, created];
      });
    }
    return created;
  }, []);

  const revoke = useCallback(async (userId: number) => {
    // Optimistic: remove immediately; rollback on failure (CONTEXT decision).
    let snapshot: AdminUserResponse[] = [];
    if (mountedRef.current) {
      setUsers((prev) => {
        snapshot = prev;
        return prev.filter((u) => u.id !== userId);
      });
    }
    try {
      await revokeAdminUser(userId);
    } catch (e) {
      // Rollback to snapshot.
      if (mountedRef.current && snapshot.length) {
        setUsers(snapshot);
      }
      throw e;
    }
  }, []);

  return { users, loading, error, refetch, invite, revoke };
}
