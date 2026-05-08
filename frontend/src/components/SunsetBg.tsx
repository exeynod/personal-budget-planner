import styles from './SunsetBg.module.css';

/**
 * SunsetBg — закатный градиент Liquid Glass: фиолетовый → пурпур → коралл → амбра,
 * с двумя blob'ами и тонкой светящейся линией горизонта. Используется на Onboarding.
 */
export function SunsetBg() {
  return (
    <div className={styles.root} aria-hidden="true">
      <div className={`${styles.blob} ${styles.blobWarm}`} />
      <div className={`${styles.blob} ${styles.blobMagenta}`} />
      <div className={styles.horizon} />
    </div>
  );
}
