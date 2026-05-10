// Phase 25-06: V10MainShell — single root composing PosterRouterProvider +
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
//                 └── <AddSheetPlaceholderContent />
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
//   - FAB tap → setAddSheet(true) → PosterSheet opens with placeholder content.
//   - While sheet is open, BottomNavV10.isHidden=true → nav unmounted (no DOM).
//   - Sheet dismissal (Escape, backdrop tap, drag-to-close, explicit Close
//     button) → setAddSheet(false) → BottomNavV10 reappears.
//
// AddSheet content is a placeholder until Plan 25-10 ships the real keypad +
// category picker. The placeholder is intentionally non-functional but renders
// the «WIP» eyebrow + Mass headline + close button so users get clear signal.
//
// Tab-tap routing (CONTEXT D-Defer — 4-tab + FAB nav, WIP placeholders for
// non-Home tabs until Phase 27 lands real Savings / AI / Mgmt):
//   - home    → router.popToRoot()  (return to OnboardingMount/HomeMount root)
//   - savings → router.push(<AccountsListPlaceholder />)
//   - ai      → router.push(<PlanViewPlaceholder />)
//   - mgmt    → router.push(<PlanViewPlaceholder />)
//
// Note: the v0.6 Transactions tab is intentionally absent (TXN-V10-06).

import { useState } from 'react';
import {
  PosterRouterProvider,
  PosterRouterView,
  PosterSheet,
  BottomNavV10,
  usePosterRouter,
} from './common';
import type { TabId } from '../componentsV10';
import { Eyebrow, Mass } from '../componentsV10';
import { OnboardingMount } from './Onboarding/OnboardingMount';
import {
  AccountsListPlaceholder,
  PlanViewPlaceholder,
} from './_placeholders';
import styles from './V10MainShell.module.css';

// ─────────────────── AddSheet placeholder ───────────────────
//
// Temporary content rendered inside PosterSheet until Plan 25-10 wires the
// real Add Sheet (custom 3×4 numeric keypad + category picker + account
// picker + save handler).

interface AddSheetPlaceholderContentProps {
  onClose: () => void;
}

function AddSheetPlaceholderContent({ onClose }: AddSheetPlaceholderContentProps) {
  return (
    <div className={styles.sheetPlaceholder} data-testid="add-sheet-placeholder">
      <Eyebrow color="var(--poster-paper)">NEW ENTRY · WIP</Eyebrow>
      <Mass italic size={36} style={{ color: 'var(--poster-paper)' }}>
        AddSheet —
      </Mass>
      <div className={styles.sheetHint}>
        WIP — Real AddSheet ships in Plan 25-10.
      </div>
      <button type="button" className={styles.closeBtn} onClick={onClose}>
        × ЗАКРЫТЬ
      </button>
    </div>
  );
}

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
      router.push(<AccountsListPlaceholder />);
      return;
    }
    // 'ai' and 'mgmt' both reuse PlanViewPlaceholder until Phase 27 ships
    // real screens. Distinct screens are cheap to add later — same push
    // contract.
    router.push(<PlanViewPlaceholder />);
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

  const closeSheet = () => setAddSheet(false);

  return (
    <>
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
        <AddSheetPlaceholderContent onClose={closeSheet} />
      </PosterSheet>
    </>
  );
}
