// Phase 27-06 Task 1: MgmtHubMount — data wrapper that fetches role and
// pushes corresponding screens via PosterRouter.
//
// Contract:
//   - On mount: fetchMeV10() to determine isOwner (role === 'owner').
//     Default to false on error (fail-closed for «ДОСТУП» visibility).
//   - Row tap → router.push(<Mount />) for the corresponding section.
//
// Sibling-Mount imports note:
//   AccountsListMount / AnalyticsMount / SavingsMount / AiMount come from
//   Phase 27 plans 27-04 / 27-05 / 27-03 / 27-02 (parallel wave). When they
//   ship their barrel exports we import from there; until then we route
//   through `_externalMountStubs.tsx` so the hub navigation works end-to-end.

import { useEffect, useState } from 'react';
import { getMeV10 } from '../../api/me';
import { usePosterRouter } from '../common';
import { MgmtHubView, type MgmtRowId } from './MgmtHubView';
import { PlanMount } from '../Plan';
import { SettingsMount } from './SettingsMount';
import { AccessMount } from './AccessMount';
import { AccountsListMount } from '../Accounts';
import { AnalyticsMount } from '../Analytics';

export function MgmtHubMount() {
  const router = usePosterRouter();
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMeV10()
      .then((me) => {
        if (cancelled) return;
        setIsOwner(me.role === 'owner');
      })
      .catch(() => {
        // Fail-closed: leave isOwner=false so «ДОСТУП» row stays hidden.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleRowTap(id: MgmtRowId) {
    if (id === 'plan') {
      router.push(<PlanMount />);
    } else if (id === 'accounts') {
      router.push(<AccountsListMount />);
    } else if (id === 'analytics') {
      router.push(<AnalyticsMount />);
    } else if (id === 'settings') {
      router.push(<SettingsMount />);
    } else if (id === 'access') {
      router.push(<AccessMount />);
    }
  }

  return (
    <MgmtHubView
      isOwner={isOwner}
      onRowTap={handleRowTap}
      canPop={router.canPop}
      onBack={() => router.pop()}
    />
  );
}
