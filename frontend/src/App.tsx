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
import styles from './App.module.css';

type Screen =
  | 'onboarding'
  | 'home'
  | 'categories'
  | 'template'
  | 'planned'
  | 'actual'
  | 'settings'
  | 'subscriptions';

export default function App() {
  const { user, loading, error, refetch } = useUser();
  const [overrideScreen, setOverrideScreen] = useState<Screen | null>(null);

  if (loading && !user) {
    return <div className={styles.loadingRoot}>Загрузка…</div>;
  }
  if (error || !user) {
    return (
      <div className={styles.errorRoot}>
        Не удалось загрузить пользователя.
        <br />
        {error && <code>{error}</code>}
      </div>
    );
  }

  const isOnboarded = user.onboarded_at !== null;
  const screen: Screen = overrideScreen ?? (isOnboarded ? 'home' : 'onboarding');

  if (screen === 'onboarding') {
    return (
      <OnboardingScreen
        user={user}
        onRefreshUser={refetch}
        onComplete={() => {
          setOverrideScreen('home');
          void refetch(); // sync onboarded_at
        }}
      />
    );
  }
  if (screen === 'home') {
    return <HomeScreen onNavigate={(s) => setOverrideScreen(s)} />;
  }
  if (screen === 'categories') {
    return <CategoriesScreen onBack={() => setOverrideScreen('home')} />;
  }
  if (screen === 'template') {
    return <TemplateScreen onBack={() => setOverrideScreen('home')} />;
  }
  if (screen === 'planned') {
    return (
      <PlannedScreen
        onBack={() => setOverrideScreen('home')}
        onNavigateToTemplate={() => setOverrideScreen('template')}
      />
    );
  }
  if (screen === 'actual') {
    return <ActualScreen onBack={() => setOverrideScreen('home')} />;
  }
  if (screen === 'subscriptions') {
    return <SubscriptionsScreen onBack={() => setOverrideScreen('home')} />;
  }
  return <SettingsScreen onBack={() => setOverrideScreen('home')} />;
}
