import { Crown, Trash } from '@phosphor-icons/react';
import type { AdminUserResponse } from '../api/types';
import styles from './UsersList.module.css';

export interface UsersListProps {
  users: AdminUserResponse[];
  onRevoke: (user: AdminUserResponse) => void;
}

function lastSeenLabel(iso: string | null): string {
  if (!iso) return 'не заходил';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'не заходил';
  const days = Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'вчера';
  return `${days} дн. назад`;
}

function roleLabel(role: AdminUserResponse['role']): string {
  if (role === 'owner') return 'владелец';
  if (role === 'member') return 'участник';
  return 'отозван';
}

/**
 * Phase 13 ADM-03 list (CONTEXT layout).
 *
 * Owner row: Crown icon + «владелец» badge, БЕЗ revoke-кнопки (T-13-07-04
 * UI guard; backend `require_owner` отдаёт 403 даже если запрос пройдёт).
 * Member rows: numeric tg_user_id + last_seen метка + inline trash button.
 * Sort обеспечивается backend (owner-pinned), фронт не дублирует.
 */
export function UsersList({ users, onRevoke }: UsersListProps) {
  if (users.length === 0) {
    return (
      <p className={styles.empty}>
        Никого не приглашено — нажмите «+» чтобы пригласить.
      </p>
    );
  }
  return (
    <ul className={styles.list}>
      {users.map((u) => {
        const isOwner = u.role === 'owner';
        const isRevoked = u.role === 'revoked';
        const badgeCls = [
          styles.badge,
          isOwner ? styles.badgeOwner : '',
          isRevoked ? styles.badgeRevoked : '',
        ].filter(Boolean).join(' ');
        return (
          <li key={u.id} className={styles.row}>
            <span className={styles.iconWrap} aria-hidden="true">
              {isOwner ? (
                <Crown size={18} weight="fill" color="var(--color-accent)" />
              ) : (
                <span className={styles.iconCircle}>
                  {String(u.tg_user_id).slice(-2)}
                </span>
              )}
            </span>
            <div className={styles.body}>
              <div className={styles.nameLine}>
                <span className={styles.name}>{u.tg_user_id}</span>
                <span className={badgeCls}>{roleLabel(u.role)}</span>
              </div>
              <div className={styles.subLine}>{lastSeenLabel(u.last_seen_at)}</div>
            </div>
            {!isOwner && !isRevoked && (
              <button
                type="button"
                className={styles.revokeBtn}
                aria-label={`Отозвать пользователя ${u.tg_user_id}`}
                onClick={() => onRevoke(u)}
              >
                <Trash size={18} weight="regular" />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
