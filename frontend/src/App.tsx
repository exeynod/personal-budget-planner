import { useState } from 'react';
import { useUser } from './hooks/useUser';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { HomeScreen } from './screens/HomeScreen';
import { CategoriesScreen } from './screens/CategoriesScreen';
import { TemplateScreen } from './screens/TemplateScreen';
import { PlannedScreen } from './screens/PlannedScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { BottomNav, type TabId } from './components/BottomNav';
import styles from './App.module.css';

type SubScreen = 'categories' | 'template' | 'settings' | 'planned';

export default function App() {
  const { user, loading, error, refetch } = useUser();
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [subScreen, setSubScreen] = useState<SubScreen | null>(null);

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
          {subScreen === 'planned' && (
            <PlannedScreen
              onBack={() => setSubScreen(null)}
              onNavigateToTemplate={() => setSubScreen('template')}
            />
          )}
          {!subScreen && activeTab === 'home' && (
            <HomeScreen
              onNavigateToSub={(s) => setSubScreen(s)}
              onNavigateToHistory={() => {
                setActiveTab('transactions');
              }}
            />
          )}
          {/* TODO(07-03): TransactionsScreen (История+План sub-tabs) */}
          {!subScreen && activeTab === 'transactions' && (
            <div style={{ padding: 16, color: 'var(--color-text-muted)' }}>Транзакции — coming in Plan 03</div>
          )}
          {/* TODO(07-04): AnalyticsScreen */}
          {!subScreen && activeTab === 'analytics' && (
            <div style={{ padding: 16, color: 'var(--color-text-muted)' }}>Аналитика — coming in Phase 8</div>
          )}
          {/* TODO(07-05): AIScreen */}
          {!subScreen && activeTab === 'ai' && (
            <div style={{ padding: 16, color: 'var(--color-text-muted)' }}>AI — coming in Phase 9</div>
          )}
          {/* TODO(07-04): ManagementScreen (Подписки+Шаблон+Категории+Настройки) */}
          {!subScreen && activeTab === 'management' && (
            <div style={{ padding: 16, color: 'var(--color-text-muted)' }}>Управление — coming in Plan 04</div>
          )}
        </div>
        <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
      </div>
    </div>
  );
}
