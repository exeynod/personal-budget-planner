import styles from './MeshDarkBg.module.css';

/**
 * MeshDarkBg — тёмный mesh-фон Liquid Glass с тремя цветными blob'ами и
 * полупрозрачной grid-сеткой. Используется на: Analytics, AI.
 */
export function MeshDarkBg() {
  return (
    <div className={styles.root} aria-hidden="true">
      <div className={`${styles.blob} ${styles.blobOrange}`} />
      <div className={`${styles.blob} ${styles.blobBlue}`} />
      <div className={`${styles.blob} ${styles.blobPurple}`} />
      <div className={styles.grid} />
    </div>
  );
}
