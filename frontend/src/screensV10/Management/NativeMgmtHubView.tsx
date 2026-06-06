// Liquid Glass v2 — native iOS Management hub view.
//
// Faithful port of the iOS MainShell Management tab
// (.planning/ios-native-screens/03-management.jpg):
//   - large title «Управление»
//   - white user card (avatar tile + «Пользователь» + role subtitle)
//   - «Меню» section header
//   - inset-grouped list of menu rows (colored icon tile + title + subtitle +
//     chevron); the «Доступ» row (owner-only) carries an OWNER badge.
//
// Pure presentational. Mirrors MgmtHubView's props 1:1 (isOwner / onRowTap /
// canPop / onBack) — the SAME six rows + nav targets the poster uses. Row
// visibility, owner-gating of «Доступ», and the push targets are owned by
// MgmtHubMount.handleRowTap; this view only decides icon/copy/order.
//
// The reference is a tab root (no back chevron), like the native Home view, so
// `canPop` / `onBack` are accepted (prop-parity with the poster) but unused —
// the native shell owns the bottom tab bar and never pushes the hub.

import { Fragment, memo } from 'react';
import {
  ChartBar,
  Wallet,
  Stack,
  GearSix,
  Users,
  PiggyBank,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import {
  NativeLargeTitle,
  SectionHeader,
  InsetGroup,
  InsetRow,
} from '../native/NativePrimitives';
import { usePosterRouterOptional } from '../common';
import { SavingsMount } from '../Savings';
import type { MgmtHubViewProps, MgmtRowId } from './MgmtHubView';
import styles from './NativeMgmtHubView.module.css';

interface NativeRowDef {
  id: MgmtRowId;
  title: string;
  subtitle: string;
  Icon: PhosphorIcon;
  /** Hex/var background for the icon tile (distinct per row). */
  tint: string;
  ownerOnly?: boolean;
  ownerBadge?: boolean;
}

// SAME ids + order + nav targets as the poster MgmtHubView ROWS. Only the
// presentation (iOS copy + colored phosphor tile) differs.
const ROWS: NativeRowDef[] = [
  {
    id: 'plan',
    title: 'План месяца',
    subtitle: 'Повторяющийся план для нового периода',
    Icon: ChartBar,
    tint: 'var(--lgn-accent)',
  },
  {
    id: 'accounts',
    title: 'Счета',
    subtitle: 'Кошельки и остатки',
    Icon: Wallet,
    tint: '#FF9F43',
  },
  {
    id: 'analytics',
    title: 'Аналитика',
    subtitle: 'Тренды и прогноз бюджета',
    Icon: ChartBar,
    tint: '#FF6B6B',
  },
  {
    id: 'subscriptions',
    title: 'Подписки',
    subtitle: 'Регулярные платежи и напоминания',
    Icon: Stack,
    tint: '#FF8A65',
  },
  {
    id: 'settings',
    title: 'Настройки',
    subtitle: 'День цикла, напоминания',
    Icon: GearSix,
    tint: '#FFB037',
  },
  {
    id: 'access',
    title: 'Доступ',
    subtitle: 'Whitelist пользователей и AI usage',
    Icon: Users,
    tint: '#E8693C',
    ownerOnly: true,
    ownerBadge: true,
  },
];

function NativeMgmtHubViewInner(props: MgmtHubViewProps) {
  const { isOwner, onRowTap } = props;

  // The native shell has only 4 tabs (no «Копилка» tab), so Savings would be
  // unreachable under the native design. Surface it here as an EXTRA menu row
  // that pushes the Savings screen directly via the poster router. This is the
  // ONLY added row — it lives outside the shared MgmtRowId / onRowTap path so
  // the poster MgmtHubView (which has no savings row) is untouched.
  const router = usePosterRouterOptional();

  // Mirror the poster gate: «Доступ» (owner-only) hidden for members.
  const visible = ROWS.filter((r) => !r.ownerOnly || isOwner);

  // The poster view receives no user name/role beyond `isOwner`; the iOS
  // reference shows a static «Пользователь» label + a role subtitle, so we
  // derive both from the single prop available.
  const userName = 'Пользователь';
  const avatarLetter = userName.charAt(0).toUpperCase();
  const roleSubtitle = `${isOwner ? 'owner' : 'member'} · —`;

  return (
    <div className={styles.root} data-testid="native-mgmt-hub-view">
      <NativeLargeTitle title="Управление" />

      {/* User card */}
      <InsetGroup>
        <InsetRow
          testId="native-mgmt-user"
          leading={
            <span className={styles.avatar} aria-hidden="true">
              {avatarLetter}
            </span>
          }
          title={userName}
          subtitle={roleSubtitle}
        />
      </InsetGroup>

      <SectionHeader>Меню</SectionHeader>

      <InsetGroup>
        {visible.map((row) => {
          const { Icon } = row;
          return (
            <Fragment key={row.id}>
              <InsetRow
                testId={`native-mgmt-row-${row.id}`}
                leading={
                  <span
                    className={styles.iconTile}
                    style={{ background: row.tint }}
                    aria-hidden="true"
                  >
                    <Icon size={18} weight="fill" color="#fff" />
                  </span>
                }
                title={
                  row.ownerBadge ? (
                    <span className={styles.titleRow}>
                      {row.title}
                      <span className={styles.ownerBadge}>OWNER</span>
                    </span>
                  ) : (
                    row.title
                  )
                }
                subtitle={row.subtitle}
                chevron
                onClick={() => onRowTap(row.id)}
              />
              {/* Reachability fix: «Копилка» has no native tab → push it from
                  the Management hub. Placed right after «Подписки». */}
              {row.id === 'subscriptions' && (
                <InsetRow
                  testId="native-mgmt-row-savings"
                  leading={
                    <span
                      className={styles.iconTile}
                      style={{ background: '#30B0C7' }}
                      aria-hidden="true"
                    >
                      <PiggyBank size={18} weight="fill" color="#fff" />
                    </span>
                  }
                  title="Копилка"
                  subtitle="Накопления и цели"
                  chevron
                  onClick={() => router?.push(<SavingsMount />)}
                />
              )}
            </Fragment>
          );
        })}
      </InsetGroup>
    </div>
  );
}

export const NativeMgmtHubView = memo(NativeMgmtHubViewInner);
