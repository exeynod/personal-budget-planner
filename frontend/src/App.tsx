import { useState } from 'react';
import { useUser } from './hooks/useUser';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { HomeScreen } from './screens/HomeScreen';
import { CategoriesScreen } from './screens/CategoriesScreen';
import { TemplateScreen } from './screens/TemplateScreen';
import { PlannedScreen } from './screens/PlannedScreen';
import { ActualScreen } from './screens/ActualScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SubscriptionsScreen } from './screens/SubscriptionsScreen';
import { MoreScreen } from './screens/MoreScreen';
import { BottomNav, type TabId } from './components/BottomNav';
import styles from './App.module.css';

type SubScreen = 'categories' | 'template' | 'settings';

export default function App() {
  const { user, loading, error, refetch } = useUser();
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [subScreen, setSubScreen] = useState<SubScreen | null>(null);
  const [historyFilter, setHistoryFilter] = useState<number | null>(null);

  if (loading && !user) {
    return (
      <div className={styles.appWrapper}>
        <div className={styles.loadingRoot}>Загрузка…</div>
      </div>
    );
  }
  if (error || !user) {
    return (
      <div className={styles.appWrapper}>
        <div className={styles.errorRoot}>
          Не удалось загрузить пользователя.
          <br />
          {error && <code>{error}</code>}
        </div>
      </div>
    );
  }

  const isOnboarded = user.onboarded_at !== null;

  if (!isOnboarded) {
    return (
      <div className={styles.appWrapper}>
        <div className={styles.appRoot}>
          <OnboardingScreen
            user={user}
            onRefreshUser={refetch}
            onComplete={() => {
              setActiveTab('home');
              void refetch();
            }}
          />
        </div>
      </div>
    );
  }

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    setSubScreen(null);
    if (tab !== 'history') setHistoryFilter(null);
  };

  return (
    <div className={styles.appWrapper}>
      <div className={styles.appRoot}>
        <div className={styles.screenContainer}>
          {subScreen === 'categories' && (
            <CategoriesScreen onBack={() => setSubScreen(null)} />
          )}
          {subScreen === 'template' && (
            <TemplateScreen onBack={() => setSubScreen(null)} />
          )}
          {subScreen === 'settings' && (
            <SettingsScreen onBack={() => setSubScreen(null)} />
          )}
          {!subScreen && activeTab === 'home' && (
            <HomeScreen
              onNavigateToSub={(s) => setSubScreen(s)}
              onNavigateToHistory={(categoryId) => {
                setHistoryFilter(categoryId ?? null);
                setActiveTab('history');
              }}
            />
          )}
          {!subScreen && activeTab === 'history' && (
            <ActualScreen
              categoryFilter={historyFilter}
              onClearFilter={() => setHistoryFilter(null)}
            />
          )}
          {!subScreen && activeTab === 'planned' && (
            <PlannedScreen
              onBack={() => handleTabChange('home')}
              onNavigateToTemplate={() => setSubScreen('template')}
            />
          )}
          {!subScreen && activeTab === 'subscriptions' && <SubscriptionsScreen />}
          {!subScreen && activeTab === 'more' && (
            <MoreScreen onNavigate={(s) => setSubScreen(s)} />
          )}
        </div>
        <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
      </div>
    </div>
  );
}
