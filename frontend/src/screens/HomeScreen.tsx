import styles from './HomeScreen.module.css';

export interface HomeScreenProps {
  onNavigate: (screen: 'categories' | 'settings') => void;
}

export function HomeScreen({ onNavigate }: HomeScreenProps) {
  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.title}>TG Budget</div>
      </header>
      <div className={styles.placeholder}>
        Дашборд будет в Phase 5.
        <br />
        Сейчас доступны только настройки и категории.
      </div>
      <div className={styles.nav}>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => onNavigate('categories')}
        >
          Категории
        </button>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => onNavigate('settings')}
        >
          Настройки
        </button>
      </div>
    </div>
  );
}
