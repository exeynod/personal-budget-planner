import styles from './HomeScreen.module.css';

export interface HomeScreenProps {
  onNavigate: (screen: 'categories' | 'template' | 'planned' | 'settings') => void;
}

/**
 * Home/dashboard placeholder.
 *
 * The real dashboard arrives in Phase 5 (DSH-*); for now Home exposes
 * navigation buttons to the screens that exist today: Categories (Phase 2),
 * Шаблон / План (Phase 3), Settings (Phase 2).
 */
export function HomeScreen({ onNavigate }: HomeScreenProps) {
  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.title}>TG Budget</div>
      </header>
      <div className={styles.placeholder}>
        Дашборд будет в Phase 5.
        <br />
        Сейчас доступны категории, шаблон, план и настройки.
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
          onClick={() => onNavigate('template')}
        >
          Шаблон
        </button>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => onNavigate('planned')}
        >
          План
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
