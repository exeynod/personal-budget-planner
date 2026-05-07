import { useEffect, useState } from 'react';
import { useUser } from './hooks/useUser';
import { OnboardingRequiredError } from './api/client';
import { useAiConversation } from './hooks/useAiConversation';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { HomeScreen } from './screens/HomeScreen';
import { CategoriesScreen } from './screens/CategoriesScreen';
import { TemplateScreen } from './screens/TemplateScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SubscriptionsScreen } from './screens/SubscriptionsScreen';
import { TransactionsScreen } from './screens/TransactionsScreen';
import { ManagementScreen, type ManagementView } from './screens/ManagementScreen';
import { AccessScreen } from './screens/AccessScreen';
import { AnalyticsScreen } from './screens/AnalyticsScreen';
import { AiScreen } from './screens/AiScreen';
import { BottomNav, type TabId } from './components/BottomNav';
import styles from './App.module.css';

export default function App() {
  const { user, loading, error, refetch } = useUser();
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [managementView, setManagementView] = useState<ManagementView | null>(null);
  const [historyFilter, setHistoryFilter] = useState<number | null>(null);
  // Поднимаем состояние AI-чата на уровень App, чтобы оно переживало
  // переключение нижних табов (AiScreen unmount-ится при смене вкладки).
  const aiConversation = useAiConversation();
  const [pendingOnboarding, setPendingOnboarding] = useState<boolean>(false);

  useEffect(() => {
    function onUnhandled(ev: PromiseRejectionEvent) {
      // Phase 14 D-14-01: stale /me + 409 race → force OnboardingScreen.
      if (ev.reason instanceof OnboardingRequiredError) {
        ev.preventDefault();
        setPendingOnboarding(true);
      }
    }
    window.addEventListener('unhandledrejection', onUnhandled);
    return () => window.removeEventListener('unhandledrejection', onUnhandled);
  }, []);

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

  if (!isOnboarded || pendingOnboarding) {
    return (
      <div className={styles.appWrapper}>
        <div className={styles.appRoot}>
          <OnboardingScreen
            user={user}
            onRefreshUser={refetch}
            onComplete={() => {
              setPendingOnboarding(false);
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
          {managementView === 'access' && (
            <AccessScreen onBack={() => setManagementView(null)} />
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
          {!managementView && activeTab === 'ai' && <AiScreen {...aiConversation} />}
          {!managementView && activeTab === 'management' && (
            <ManagementScreen onNavigate={(screen) => setManagementView(screen)} />
          )}
        </div>
        <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
      </div>
    </div>
  );
}
