// Phase 27-06 Task 1: MgmtHubMount — data wrapper that fetches role and
// pushes corresponding screens via PosterRouter.
//
// Contract:
//   - On mount: fetchMeV10() to determine isOwner (role === 'owner').
//     Default to false on error (fail-closed for «ДОСТУП» visibility).
//   - Row tap → router.push(<Mount />) for the corresponding section.
//
import { useEffect, useState } from 'react';
import { getMeV10 } from '../../api/me';
import { usePosterRouter } from '../common';
import { NativeMgmtHubView, type MgmtRowId } from './NativeMgmtHubView';
import { SettingsMount } from './SettingsMount';
import { AccessMount } from './AccessMount';
import { CategoriesMount } from './CategoriesMount';
import { AnalyticsMount } from '../Analytics';
import { SubscriptionsMount } from '../Subscriptions';

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
    if (id === 'analytics') {
      router.push(<AnalyticsMount />);
    } else if (id === 'subscriptions') {
      router.push(<SubscriptionsMount />);
    } else if (id === 'categories') {
      router.push(<CategoriesMount />);
    } else if (id === 'settings') {
      router.push(<SettingsMount />);
    } else if (id === 'access') {
      router.push(<AccessMount />);
    }
  }

  const viewProps = {
    isOwner,
    onRowTap: handleRowTap,
    canPop: router.canPop,
    onBack: () => router.pop(),
  };

  return <NativeMgmtHubView {...viewProps} />;
}
