// Phase 25-06 → 25-10: V10MainShell — single root composing PosterRouterProvider +
// BottomNavV10 + AddSheet PosterSheet binding for the v1.0 web app.
//
// Architecture (per Plan 25-06 Task 2 final resolution):
//
//   AppV10
//     └── <V10MainShell>
//           ├── <PosterRouterProvider root={<OnboardingMount />}>
//           │     └── <ShellChrome>   (consumes router, renders view + nav)
//           │           ├── <PosterRouterView />   (top-of-stack)
//           │           └── <BottomNavV10 />
//           └── <PosterSheet isOpen={isAddSheetOpen}>
//                 └── <AddSheet />        (Plan 25-10: real keypad + form)
//
// OnboardingMount is the PosterRouter root (NOT HomeMount) because the
// gateway logic — fetch /me, branch on onboarded_at — must run BEFORE we
// can decide whether to mount HomeMount. HomeMount lives one level deeper,
// inside OnboardingMount's onboarded branch (Task 2 wires that). Either way,
// HomeMount's usePosterRouter() works because it is rendered inside the
// PosterRouterProvider tree.
//
// FAB / AddSheet contract:
//   - FAB sits at the BottomNavV10 center slot (component-local concern).
//   - FAB tap → setAddSheet(true) → PosterSheet opens with the real AddSheet body.
//   - While sheet is open, BottomNavV10.isHidden=true → nav unmounted (no DOM).
//   - Sheet dismissal: AddSheet's own × button (with dirty-form gate),
//     Escape key, backdrop tap, drag-to-close → setAddSheet(false) → nav reappears.
//   - On successful submit (createActualV10 ok) → onSubmitted(_id) → close sheet
//     AND bump `refetchToken` so HomeMount/TransactionsMount re-run their fetch
//     effect (Phase 30-02 DEBT-02). The token is a monotonic counter; both
//     mounts include it in their `useEffect` deps array via the `refetchToken`
//     prop. Tests can observe the bump via the `parent-refetched` sentinel
//     rendered alongside each mount.
//
// Tab-tap routing (Phase 27 wiring — Plan 27-06 connects Mgmt-hub for real,
// Savings/AI use temporary stubs from Management/_externalMountStubs.tsx until
// Phase 27 plans 27-02 (AiMount) and 27-03 (SavingsMount) ship their barrel
// exports — then this file swaps the imports):
//   - home    → router.popToRoot()  (return to OnboardingMount/HomeMount root)
//   - savings → router.push(<SavingsMountStub />)   // Plan 27-03 swap target
//   - ai      → router.push(<AiMountStub />)         // Plan 27-02 swap target
//   - mgmt    → router.push(<MgmtHubMount />)        // Plan 27-06 — REAL
//
// Note: the v0.6 Transactions tab is intentionally absent (TXN-V10-06).

import { useState } from 'react';
import {
  PosterRouterProvider,
  PosterRouterView,
  PosterSheet,
  BottomNavV10,
  RefetchTokenProvider,
  usePosterRouter,
} from './common';
import type { TabId } from '../componentsV10';
import { OnboardingMount } from './Onboarding/OnboardingMount';
import { AddSheet } from './AddSheet';
import { MgmtHubMount } from './Management';
import { SavingsMount } from './Savings';
import { AiMount } from './Ai';
import styles from './V10MainShell.module.css';

// ─────────────────── ShellChrome ───────────────────
//
// Lives INSIDE PosterRouterProvider so it can call usePosterRouter() and
// translate BottomNav tab events into router push/pop actions. Keeps
// V10MainShell's outer layer free of router-context concerns.

interface ShellChromeProps {
  active: TabId;
  onTab: (id: TabId) => void;
  onFab: () => void;
  isAddSheetOpen: boolean;
}

function ShellChrome({ active, onTab, onFab, isAddSheetOpen }: ShellChromeProps) {
  const router = usePosterRouter();

  const handleTab = (id: TabId) => {
    onTab(id);
    if (id === 'home') {
      // Pop everything pushed on top — return to root (OnboardingMount/HomeMount).
      router.popToRoot();
      return;
    }
    if (id === 'savings') {
      router.push(<SavingsMount />);
      return;
    }
    if (id === 'ai') {
      router.push(<AiMount />);
      return;
    }
    if (id === 'mgmt') {
      router.push(<MgmtHubMount />);
      return;
    }
  };

  return (
    <div className={styles.shellRoot} data-testid="v10-shell">
      <div className={styles.content}>
        <PosterRouterView />
      </div>
      <div className={styles.navWrap}>
        <BottomNavV10
          active={active}
          onTab={handleTab}
          onFab={onFab}
          isHidden={isAddSheetOpen}
          dark={false}
        />
      </div>
    </div>
  );
}

// ─────────────────── V10MainShell ───────────────────

export function V10MainShell() {
  const [active, setActive] = useState<TabId>('home');
  const [isAddSheetOpen, setAddSheet] = useState(false);
  // Phase 30-02 (DEBT-02): monotonic counter — bumped on AddSheet submit
  // success. HomeMount / TransactionsMount include the token in their
  // `useEffect` deps so a fresh fetch fires immediately after submit.
  const [refetchToken, setRefetchToken] = useState(0);

  const closeSheet = () => setAddSheet(false);

  return (
    <>
      <RefetchTokenProvider value={refetchToken}>
        <PosterRouterProvider root={<OnboardingMount />}>
          <ShellChrome
            active={active}
            onTab={setActive}
            onFab={() => setAddSheet(true)}
            isAddSheetOpen={isAddSheetOpen}
          />
        </PosterRouterProvider>
        <PosterSheet
          isOpen={isAddSheetOpen}
          onClose={closeSheet}
          backgroundColor="#0E0E0E"
        >
          <AddSheet
            onSubmitted={(_id) => {
              // Phase 30-02 (DEBT-02): close the sheet AND bump refetchToken
              // so HomeMount / TransactionsMount re-fetch with fresh actuals.
              // Replaces the Plan 25-10 «refetch deferred to 25-12» note.
              setAddSheet(false);
              setRefetchToken((t) => t + 1);
            }}
            onClose={closeSheet}
          />
        </PosterSheet>
      </RefetchTokenProvider>
    </>
  );
}
