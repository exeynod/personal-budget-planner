import styles from './AuroraBg.module.css';

/**
 * AuroraBg — кремовый Liquid-Glass фон c 4 размытыми цветными blob'ами.
 * Используется на: Home, Transactions, Management hub, Subscriptions, Template,
 * Categories, Settings, Access. Монтируется первым ребёнком экрана; контент
 * оборачивается в `position:relative; z-index:1` обёртку.
 */
export function AuroraBg() {
  return (
    <div className={styles.root} aria-hidden="true">
      <div className={`${styles.blob} ${styles.blobOrange}`} />
      <div className={`${styles.blob} ${styles.blobPink}`} />
      <div className={`${styles.blob} ${styles.blobLavender}`} />
      <div className={`${styles.blob} ${styles.blobButter}`} />
    </div>
  );
}
