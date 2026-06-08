import {
  Bag,
  Coffee,
  House,
  Car,
  Heart,
  Ticket,
  Gift,
  Stack,
  CurrencyRub,
  Sparkle,
  type Icon,
} from '@phosphor-icons/react';

/** Визуальный пресет категории: phosphor-иконка + цвет (CSS-переменная). */
export interface CategoryVisual {
  Icon: Icon;
  /** CSS-цвет (hex) — для inline-стилей gradient-tile. */
  color: string;
  /** Имя CSS-переменной без `--` (для использования в module.css). */
  cssVar: string;
}

/** Палитра по «семантическим» ключам (соответствует --cat-* в tokens.css). */
const PALETTE: Record<string, CategoryVisual> = {
  food: { Icon: Bag, color: '#F39A4C', cssVar: 'cat-food' },
  cafe: { Icon: Coffee, color: '#E36B5A', cssVar: 'cat-cafe' },
  home: { Icon: House, color: '#B583E8', cssVar: 'cat-home' },
  transit: { Icon: Car, color: '#6CA6E8', cssVar: 'cat-transit' },
  health: { Icon: Heart, color: '#E26F8E', cssVar: 'cat-health' },
  fun: { Icon: Ticket, color: '#F0C04A', cssVar: 'cat-fun' },
  gifts: { Icon: Gift, color: '#7CC68F', cssVar: 'cat-gifts' },
  subs: { Icon: Stack, color: '#9C8FE8', cssVar: 'cat-subs' },
  salary: { Icon: CurrencyRub, color: '#7CC68F', cssVar: 'cat-salary' },
  side: { Icon: Sparkle, color: '#F0C04A', cssVar: 'cat-side' },
};

// ---------------------------------------------------------------------------
// 0035 — INDEPENDENT icon + colour sets (iOS-Shortcuts style).
//
// Previously the picker offered bundled {icon+colour} presets
// (CATEGORY_ICON_OPTIONS, kept below for back-compat). Now the glyph and the
// colour are chosen *independently*: pick any ICON_SET glyph and any COLOR_SET
// colour. `category.icon` stores the glyph key, `category.color` the colour key.
// ---------------------------------------------------------------------------

/** Один glyph-пресет для icon-пикера: стабильный ключ + подпись + glyph. */
export interface IconOption {
  /** Стабильный ключ (хранится в `category.icon`, e.g. `'food'`). */
  key: string;
  /** Человекочитаемая подпись для пикера. */
  label: string;
  /** phosphor-glyph (рендерится в любом выбранном цвете). */
  Icon: Icon;
}

/** Один colour-пресет для colour-пикера: стабильный ключ + hex + подпись. */
export interface ColorOption {
  /** Стабильный ключ (хранится в `category.color`, e.g. `'orange'`). */
  key: string;
  /** CSS-цвет (hex). */
  color: string;
  /** Человекочитаемая подпись для пикера. */
  label: string;
}

/**
 * Стабильный, упорядоченный список glyph'ов для icon-пикера (без цвета).
 * Ключи совпадают с `PALETTE` / `category.icon` на бэке.
 */
export const ICON_SET: ReadonlyArray<IconOption> = [
  { key: 'food', label: 'Продукты', Icon: Bag },
  { key: 'cafe', label: 'Кафе', Icon: Coffee },
  { key: 'home', label: 'Дом', Icon: House },
  { key: 'transit', label: 'Транспорт', Icon: Car },
  { key: 'health', label: 'Здоровье', Icon: Heart },
  { key: 'fun', label: 'Развлечения', Icon: Ticket },
  { key: 'gifts', label: 'Подарки', Icon: Gift },
  { key: 'subs', label: 'Подписки', Icon: Stack },
  { key: 'salary', label: 'Зарплата', Icon: CurrencyRub },
  { key: 'side', label: 'Доп. доход', Icon: Sparkle },
];

/**
 * Стабильный, упорядоченный список цветов для colour-пикера (без glyph'а).
 * Ключи хранятся в `category.color`. Палитра выровнена с --cat-* токенами.
 */
export const COLOR_SET: ReadonlyArray<ColorOption> = [
  { key: 'orange', color: '#F39A4C', label: 'Оранжевый' },
  { key: 'red', color: '#E36B5A', label: 'Красный' },
  { key: 'purple', color: '#B583E8', label: 'Фиолетовый' },
  { key: 'blue', color: '#6CA6E8', label: 'Синий' },
  { key: 'pink', color: '#E26F8E', label: 'Розовый' },
  { key: 'yellow', color: '#F0C04A', label: 'Жёлтый' },
  { key: 'green', color: '#7CC68F', label: 'Зелёный' },
  { key: 'violet', color: '#9C8FE8', label: 'Сиреневый' },
];

/** Быстрый lookup hex по colour-ключу. */
const COLOR_BY_KEY: Record<string, string> = Object.fromEntries(
  COLOR_SET.map((c) => [c.key, c.color]),
);

/** Быстрый lookup glyph по icon-ключу. */
const ICON_BY_KEY: Record<string, Icon> = Object.fromEntries(
  ICON_SET.map((o) => [o.key, o.Icon]),
);

/** Один пресет иконки для (legacy) bundled-пикера: ключ + подпись + визуал. */
export interface CategoryIconOption {
  /** Стабильный ключ (хранится в `category.icon`, e.g. `'food'`). */
  key: string;
  /** Человекочитаемая подпись для пикера. */
  label: string;
  Icon: Icon;
  /** CSS-цвет (hex) пресета. */
  color: string;
}

/**
 * LEGACY (back-compat) — bundled {icon+colour} пресеты.
 *
 * Заменён независимыми `ICON_SET` + `COLOR_SET` (0035), но сохранён, чтобы не
 * сломать внешних потребителей, импортирующих этот список. Новый UI выбирает
 * glyph и цвет раздельно.
 */
export const CATEGORY_ICON_OPTIONS: ReadonlyArray<CategoryIconOption> =
  ICON_SET.map((o) => ({
    key: o.key,
    label: o.label,
    Icon: o.Icon,
    color: PALETTE[o.key]?.color ?? COLOR_SET[0].color,
  }));

/**
 * Разрешает категорию в визуальный пресет (glyph + цвет).
 *
 * 0035: glyph и цвет резолвятся НЕЗАВИСИМО:
 *   - glyph = `icon`-ключ (если задан и известен ICON_SET), иначе name-based
 *     fallback по PALETTE / хешу id (старое поведение).
 *   - цвет  = `color`-ключ (если задан и известен COLOR_SET), иначе name-based
 *     / hash fallback из того же name-based пресета (старое поведение).
 *
 * Категории без явных `icon`/`color` выглядят как раньше (backward-compatible).
 */
export function visualForCategory(
  name: string,
  id?: number,
  icon?: string | null,
  color?: string | null,
): CategoryVisual {
  const base = nameBasedVisual(name, id);

  // glyph: explicit icon key wins (when known).
  let Icon = base.Icon;
  if (icon != null) {
    const key = icon.trim().toLowerCase();
    if (key in ICON_BY_KEY) Icon = ICON_BY_KEY[key];
  }

  // colour: explicit colour key wins (when known); fall back to name-based.
  let resolvedColor = base.color;
  let cssVar = base.cssVar;
  if (color != null) {
    const ckey = color.trim().toLowerCase();
    if (ckey in COLOR_BY_KEY) {
      resolvedColor = COLOR_BY_KEY[ckey];
      cssVar = `cat-${ckey}`;
    }
  }

  return { Icon, color: resolvedColor, cssVar };
}

/**
 * Старое name/hash-based разрешение (до 0034/0035) — возвращает bundled
 * пресет, используемый как fallback когда явные icon/color не заданы.
 */
function nameBasedVisual(name: string, id?: number): CategoryVisual {
  const norm = name.trim().toLowerCase();

  // Явные маппинги по подстроке
  if (norm.includes('продукт') || norm.includes('еда') || norm === 'food')
    return PALETTE.food;
  if (
    norm.includes('кафе') ||
    norm.includes('ресторан') ||
    norm.includes('cafe')
  )
    return PALETTE.cafe;
  if (
    norm.includes('дом') ||
    norm.includes('жил') ||
    norm.includes('коммунал') ||
    norm === 'home'
  )
    return PALETTE.home;
  if (
    norm.includes('транспорт') ||
    norm.includes('такси') ||
    norm === 'transit'
  )
    return PALETTE.transit;
  if (
    norm.includes('здоров') ||
    norm.includes('медиц') ||
    norm.includes('аптек') ||
    norm === 'health'
  )
    return PALETTE.health;
  if (
    norm.includes('развлеч') ||
    norm.includes('досуг') ||
    norm.includes('кино') ||
    norm === 'fun'
  )
    return PALETTE.fun;
  if (norm.includes('подарк') || norm.includes('подарок') || norm === 'gifts')
    return PALETTE.gifts;
  if (norm.includes('подписк') || norm === 'subs' || norm.includes('сервис'))
    return PALETTE.subs;
  if (norm.includes('зарплат') || norm.includes('оклад') || norm === 'salary')
    return PALETTE.salary;
  if (
    norm.includes('подработк') ||
    norm.includes('фриланс') ||
    norm.includes('бонус') ||
    norm === 'side'
  )
    return PALETTE.side;

  // Fallback: детерминированно выбираем из палитры по id (или хешу имени).
  const keys = Object.keys(PALETTE) as (keyof typeof PALETTE)[];
  const hash = id !== undefined ? Math.abs(id) : hashString(norm);
  return PALETTE[keys[hash % keys.length]];
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}
