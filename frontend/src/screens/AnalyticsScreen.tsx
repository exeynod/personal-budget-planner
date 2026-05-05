import { ChartBar } from '@phosphor-icons/react';
import { PageTitle } from '../components/PageTitle';
import styles from './AnalyticsScreen.module.css';

export function AnalyticsScreen() {
  return (
    <div className={styles.root}>
      <PageTitle title="Аналитика" />
      <div className={styles.comingSoon}>
        <ChartBar size={48} weight="thin" color="var(--color-text-muted)" />
        <p className={styles.text}>Скоро будет</p>
        <p className={styles.sub}>Тренды расходов, топ категорий и прогноз остатка появятся в следующем обновлении</p>
      </div>
    </div>
  );
}
