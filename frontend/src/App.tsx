import { useState } from 'react';
import { useUser } from './hooks/useUser';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { HomeScreen } from './screens/HomeScreen';
import { CategoriesScreen } from './screens/CategoriesScreen';
import { TemplateScreen } from './screens/TemplateScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SubscriptionsScreen } from './screens/SubscriptionsScreen';
import { TransactionsScreen } from './screens/TransactionsScreen';
import { ManagementScreen, type ManagementView } from './screens/ManagementScreen';
import { AnalyticsScreen } from './screens/AnalyticsScreen';
import { AiScreen } from './screens/AiScreen';
import { BottomNav, type TabId } from './components/BottomNav';
import styles from './App.module.css';

export default function App() {
  const { user, loading, error, refetch } = useUser();
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [managementView, setManagementView] = useState<ManagementView | null>(null);
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
    setManagementView(null);
    if (tab !== 'transactions') setHistoryFilter(null);
  };

  return (
    <div className={styles.appWrapper}>
      <div className={styles.appRoot}>
        <div className={styles.screenContainer}>
          {/* Management sub-screens (рендерятся поверх всего) */}
          {managementView === 'subscriptions' && (
            <SubscriptionsScreen onBack={() => setManagementView(null)} />
          )}
          {managementView === 'template' && (
            <TemplateScreen onBack={() => setManagementView(null)} />
          )}
          {managementView === 'categories' && (
            <CategoriesScreen onBack={() => setManagementView(null)} />
          )}
          {managementView === 'settings' && (
            <SettingsScreen onBack={() => setManagementView(null)} />
          )}

          {/* Main tabs (скрыты когда показывается management sub-screen) */}
          {!managementView && activeTab === 'home' && (
            <HomeScreen
              onNavigateToSub={(s) => {
                // s может быть 'planned' (cross-tab) или 'template'|'categories'|'settings'
                if (s === 'planned') {
                  setActiveTab('transactions');
                } else {
                  setManagementView(s as ManagementView);
                }
              }}
              onNavigateToHistory={(categoryId) => {
                setHistoryFilter(categoryId ?? null);
                setActiveTab('transactions');
              }}
            />
          )}
          {!managementView && activeTab === 'transactions' && (
            <TransactionsScreen
              categoryFilter={historyFilter}
              onClearFilter={() => setHistoryFilter(null)}
            />
          )}
          {!managementView && activeTab === 'analytics' && <AnalyticsScreen />}
          {!managementView && activeTab === 'ai' && <AiScreen />}
          {!managementView && activeTab === 'management' && (
            <ManagementScreen onNavigate={(screen) => setManagementView(screen)} />
          )}
        </div>
        <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
      </div>
    </div>
  );
}
