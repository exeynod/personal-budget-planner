import { Sparkle } from '@phosphor-icons/react';
import { PageTitle } from '../components/PageTitle';
import styles from './AiScreen.module.css';

export function AiScreen() {
  return (
    <div className={styles.root}>
      <PageTitle title="AI" />
      <div className={styles.comingSoon}>
        <Sparkle size={48} weight="thin" color="#a78bfa" />
        <p className={styles.text}>Скоро будет</p>
        <p className={styles.sub}>Conversational AI-помощник с доступом к данным бюджета появится в следующем обновлении</p>
      </div>
    </div>
  );
}
