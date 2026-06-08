// Liquid Glass v2 — native iOS shell (web port of the iOS MainShell).
//
// Renders only when `ui.theme === 'liquid_glass'` (dispatched in AppV10). It
// REUSES the entire design-agnostic data stack — the same providers and Mount
// components as the poster V10MainShell — and only swaps the presentational
// chrome + per-screen views (selected via ShellVariant = 'native').
//
// Navigation model (owner reference #24/#26): two discrete floating glass
// objects instead of one edge-to-edge bar —
//   - a glass PILL with the sections we work in: Главная / Транзакции /
//     Управление (active = brand orange)
//   - a SEPARATE round glass AI bubble to the right (the «блок сообщений»)
//   Routing still has 4 tabs (home/transactions/ai/management); only AI is
//   visually split out into its own bubble. See NativeTabBar.
//   - «+» lives in the Home header (top-right circle) → opens AddSheet
//   - pushed detail screens (CategoryDetail, Plan, Accounts, Settings…) use a
//     native nav bar with a back chevron (provided by each native view).

import { useState } from 'react';
import {
  PosterRouterProvider,
  PosterSheet,
  RefetchTokenProvider,
  SelectedPeriodProvider,
  usePosterRouter,
} from '../common';
import { OnboardingMount } from '../Onboarding/OnboardingMount';
import { NativeAddSheet } from '../AddSheet';
import { MgmtHubMount } from '../Management';
import { AiMount } from '../Ai';
import { TransactionsMount } from '../Transactions';
import { NativeTabBar, type NativeTabId } from './NativeTabBar';
import { ShellVariantProvider } from './ShellVariant';
import {
  AddSheetHostProvider,
  type AddSheetKind,
  type AddSheetMode,
} from './AddSheetHost';
import type { ActualV10Read } from '../../api/v10';
import { NavLevelProvider } from './NavLevel';
import styles from './NativeShell.module.css';

// ─────────────────── Router view (native push animation) ───────────────────

function NativeRouterView() {
  const { stack, direction } = usePosterRouter();
  const top = stack[stack.length - 1];
  const animClass =
    direction === 'forward' ? styles.slideFwd : styles.slideBack;
  return (
    <div key={top.id} className={`${styles.viewWrap} ${animClass}`}>
      {top.node}
    </div>
  );
}

// ─────────────────── Chrome (tab bar + router-aware routing) ───────────────────

function NativeChrome({
  active,
  onTab,
}: {
  active: NativeTabId;
  onTab: (id: NativeTabId) => void;
}) {
  const router = usePosterRouter();

  const handleTab = (id: NativeTabId) => {
    onTab(id);
    if (id === 'home') {
      router.popToRoot();
      return;
    }
    if (id === 'transactions') {
      router.push(
        <NavLevelProvider isRoot>
          <TransactionsMount />
        </NavLevelProvider>,
      );
      return;
    }
    if (id === 'ai') {
      router.push(
        <NavLevelProvider isRoot>
          <AiMount />
        </NavLevelProvider>,
      );
      return;
    }
    if (id === 'management') {
      router.push(
        <NavLevelProvider isRoot>
          <MgmtHubMount />
        </NavLevelProvider>,
      );
      return;
    }
  };

  return (
    <div className={styles.shellRoot} data-testid="native-shell">
      <div className={styles.content}>
        <NativeRouterView />
      </div>
      <div className={styles.navWrap}>
        <NativeTabBar active={active} onTab={handleTab} />
      </div>
    </div>
  );
}

// ─────────────────── Shell ───────────────────

export function NativeShell() {
  const [active, setActive] = useState<NativeTabId>('home');
  const [isAddOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<AddSheetMode>('fact');
  // CategoryDetail «Добавить транзакцию» deep-link: which category to pre-select
  // in the sheet (undefined = none, e.g. Home/Plan «+»).
  const [addCategoryId, setAddCategoryId] = useState<number | undefined>(
    undefined,
  );
  // REQ 4a: income/expense context the sheet opens for (undefined = derive).
  const [addKind, setAddKind] = useState<AddSheetKind | undefined>(undefined);
  // REQ 7: the actual being edited (undefined = create flow).
  const [editActual, setEditActual] = useState<ActualV10Read | undefined>(
    undefined,
  );
  const [refetchToken, setRefetchToken] = useState(0);

  const closeSheet = () => setAddOpen(false);

  const openAddSheet = (
    mode: AddSheetMode = 'fact',
    categoryId?: number,
    kind?: AddSheetKind,
  ) => {
    setEditActual(undefined);
    setAddMode(mode);
    setAddCategoryId(categoryId);
    setAddKind(kind);
    setAddOpen(true);
  };

  const openEditSheet = (actual: ActualV10Read) => {
    // Edit always targets a real fact; category/kind/date seed from the row.
    setAddMode('fact');
    setAddCategoryId(undefined);
    setAddKind(undefined);
    setEditActual(actual);
    setAddOpen(true);
  };

  return (
    <SelectedPeriodProvider>
      <RefetchTokenProvider value={refetchToken}>
        <ShellVariantProvider value="native">
          <AddSheetHostProvider
            openAddSheet={openAddSheet}
            openEditSheet={openEditSheet}
          >
            <PosterRouterProvider root={<OnboardingMount />}>
              <NativeChrome active={active} onTab={setActive} />
            </PosterRouterProvider>
            {/* Native add-transaction sheet — a LIGHT iOS bottom sheet
                (systemGroupedBackground #F2F2F7), not the dark poster sheet.
                Reuses PosterSheet purely for the bottom-sheet chrome (backdrop,
                drag handle, drag-to-close, Escape, scroll-lock). Wiring is
                unchanged: openAddSheet (Home «+») opens it; onSubmitted bumps the
                RefetchToken (HomeMount/TransactionsMount refetch) + closes;
                onClose dismisses. */}
            <PosterSheet
              isOpen={isAddOpen}
              onClose={closeSheet}
              backgroundColor="#F2F2F7"
            >
              <NativeAddSheet
                mode={addMode}
                initialCategoryId={addCategoryId}
                kind={addKind}
                editActual={editActual}
                onSubmitted={() => {
                  setAddOpen(false);
                  setRefetchToken((t) => t + 1);
                }}
                onClose={closeSheet}
              />
            </PosterSheet>
          </AddSheetHostProvider>
        </ShellVariantProvider>
      </RefetchTokenProvider>
    </SelectedPeriodProvider>
  );
}
