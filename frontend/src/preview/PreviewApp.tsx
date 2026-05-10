import { useState } from 'react';
import {
  Eyebrow,
  Mass,
  BigFig,
  Plate,
  PosterButton,
  Chip,
  PosterSlider,
  TabBar,
  Toast,
  type TabId,
} from '../componentsV10';
import styles from './PreviewApp.module.css';

// All 11 keyframes from stylesV10/animations.css — each gets a trigger button
// that re-mounts a target element via key-bump to replay the animation.
const ANIMATION_NAMES = [
  'poster-row-in',
  'poster-rise-in',
  'poster-bar-fill',
  'poster-tab-pop',
  'poster-pop-in',
  'poster-check',
  'poster-dot',
  'poster-slide-in-fwd',
  'poster-slide-in-back',
  'poster-tab-swap',
  'poster-toast-in',
] as const;

const PLATE_TONES = ['inverted', 'yellow', 'red', 'paper', 'dark'] as const;

const CHIP_LABELS = ['ВСЕ', 'КАФЕ', 'ПРОДУКТЫ', 'ТРАНСПОРТ', 'ПОДПИСКИ'];

export default function PreviewApp() {
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [chipActive, setChipActive] = useState(0);
  const [sliderValue, setSliderValue] = useState(7500);
  const [toastVisible, setToastVisible] = useState(false);
  const [animKey, setAnimKey] = useState<Record<string, number>>({});

  const triggerAnim = (name: string) => {
    setAnimKey((k) => ({ ...k, [name]: (k[name] ?? 0) + 1 }));
  };

  return (
    <div className={styles.app}>
      <header className={styles.head}>
        <Eyebrow>VOL.23 / DESIGN SYSTEM PREVIEW</Eyebrow>
        <Mass italic size={64}>
          Maximal Poster.
        </Mass>
      </header>

      {/* ─── ADR-001 cyrillic glyph routing proof ─── */}
      <section className={styles.section}>
        <Eyebrow>1. ADR-001 ROUTING</Eyebrow>
        <div className={styles.glyphRow}>
          <Mass italic size={56}>
            May
          </Mass>
          <Mass italic size={56}>
            Май
          </Mass>
        </div>
        <p className={styles.note}>
          Слева — DM Serif Italic (Latin); справа — PT Serif Italic (Cyrillic).
          Браузер маршрутизирует через unicode-range в `PosterSerifItalic`.
        </p>
      </section>

      {/* ─── BigFig with count-up ─── */}
      <section className={styles.section}>
        <Eyebrow>2. BIGFIG · COUNT-UP</Eyebrow>
        <BigFig
          value={142380}
          sup="₽"
          size={80}
          color="var(--poster-paper)"
        />
      </section>

      {/* ─── Plates × 5 tones ─── */}
      <section className={styles.section}>
        <Eyebrow>3. PLATE · 5 TONES</Eyebrow>
        <div className={styles.plateGrid}>
          {PLATE_TONES.map((t) => (
            <Plate key={t} tone={t}>
              <Eyebrow opacity={0.7}>{t.toUpperCase()}</Eyebrow>
            </Plate>
          ))}
        </div>
      </section>

      {/* ─── PosterButton × 3 variants ─── */}
      <section className={styles.section}>
        <Eyebrow>4. POSTERBUTTON · 3 VARIANTS</Eyebrow>
        <div className={styles.btnStack}>
          <PosterButton variant="primary" onClick={() => {}}>
            СОХРАНИТЬ
          </PosterButton>
          <PosterButton variant="ghost" onClick={() => {}}>
            ОТМЕНА
          </PosterButton>
          <PosterButton variant="destructive" onClick={() => {}}>
            УДАЛИТЬ
          </PosterButton>
        </div>
      </section>

      {/* ─── Chips ─── */}
      <section className={styles.section}>
        <Eyebrow>5. CHIPS · SINGLE-SELECT</Eyebrow>
        <div className={styles.chipRow}>
          {CHIP_LABELS.map((label, i) => (
            <Chip
              key={label}
              active={i === chipActive}
              onClick={() => setChipActive(i)}
            >
              {label}
            </Chip>
          ))}
        </div>
      </section>

      {/* ─── PosterSlider ─── */}
      <section className={styles.section}>
        <Eyebrow>6. POSTERSLIDER · STEP 500</Eyebrow>
        <PosterSlider
          value={sliderValue}
          max={30000}
          step={500}
          onChange={setSliderValue}
          label="ПРОДУКТЫ"
        />
      </section>

      {/* ─── 11 Animations gallery ─── */}
      <section className={styles.section}>
        <Eyebrow>7. ANIMATIONS · 11 KEYFRAMES</Eyebrow>
        <div className={styles.animGrid}>
          {ANIMATION_NAMES.map((name) => (
            <div key={name} className={styles.animCell}>
              <button
                type="button"
                className={styles.animTrigger}
                onClick={() => triggerAnim(name)}
              >
                ▶ {name}
              </button>
              <div
                key={`${name}-${animKey[name] ?? 0}`}
                className={`${styles.animTarget} ${name}`}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ─── Toast ─── */}
      <section className={styles.section}>
        <Eyebrow>8. TOAST · 1700ms LIFE</Eyebrow>
        <PosterButton
          variant="primary"
          onClick={() => setToastVisible(true)}
        >
          ПОКАЗАТЬ TOAST
        </PosterButton>
        <Toast
          message="✓ Сохранено · −480 ₽"
          visible={toastVisible}
          onDismiss={() => setToastVisible(false)}
        />
      </section>

      {/* ─── Spacer for fixed bottom bar ─── */}
      <div style={{ height: 100 }} />

      {/* ─── TabBar (includes FAB internally — single FAB on screen per spec) ─── */}
      <TabBar
        active={activeTab}
        dark
        onTab={setActiveTab}
        onFab={() => setToastVisible(true)}
      />
    </div>
  );
}
