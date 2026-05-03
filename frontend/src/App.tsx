import { useState } from 'react';
import { useUser } from './hooks/useUser';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { HomeScreen } from './screens/HomeScreen';
import styles from './App.module.css';

type Screen = 'onboarding' | 'home' | 'categories' | 'settings';

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
  // categories | settings — placeholders until Plan 02-07
  return (
    <div className={styles.placeholderScreen}>
      <button
        type="button"
        className={styles.backBtn}
        onClick={() => setOverrideScreen('home')}
      >
        ← Назад
      </button>
      <h2>{screen === 'categories' ? 'Категории' : 'Настройки'}</h2>
      <p>Этот экран реализован в Plan 02-07.</p>
    </div>
  );
}
