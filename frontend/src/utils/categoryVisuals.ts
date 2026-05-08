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
  food:    { Icon: Bag,         color: '#F39A4C', cssVar: 'cat-food' },
  cafe:    { Icon: Coffee,      color: '#E36B5A', cssVar: 'cat-cafe' },
  home:    { Icon: House,       color: '#B583E8', cssVar: 'cat-home' },
  transit: { Icon: Car,         color: '#6CA6E8', cssVar: 'cat-transit' },
  health:  { Icon: Heart,       color: '#E26F8E', cssVar: 'cat-health' },
  fun:     { Icon: Ticket,      color: '#F0C04A', cssVar: 'cat-fun' },
  gifts:   { Icon: Gift,        color: '#7CC68F', cssVar: 'cat-gifts' },
  subs:    { Icon: Stack,       color: '#9C8FE8', cssVar: 'cat-subs' },
  salary:  { Icon: CurrencyRub, color: '#7CC68F', cssVar: 'cat-salary' },
  side:    { Icon: Sparkle,     color: '#F0C04A', cssVar: 'cat-side' },
};

/**
 * Разрешает русское название категории в визуальный пресет.
 *
 * API не хранит icon_id у категорий — мапим по нормализованному имени.
 * Подсчёт детерминированный: при незнакомом имени fallback на «food» по
 * хешу id (стабильный цвет/иконка между перерендерами).
 */
export function visualForCategory(name: string, id?: number): CategoryVisual {
  const norm = name.trim().toLowerCase();

  // Явные маппинги по подстроке
  if (norm.includes('продукт') || norm.includes('еда') || norm === 'food') return PALETTE.food;
  if (norm.includes('кафе') || norm.includes('ресторан') || norm.includes('cafe')) return PALETTE.cafe;
  if (norm.includes('дом') || norm.includes('жил') || norm.includes('коммунал') || norm === 'home') return PALETTE.home;
  if (norm.includes('транспорт') || norm.includes('такси') || norm === 'transit') return PALETTE.transit;
  if (norm.includes('здоров') || norm.includes('медиц') || norm.includes('аптек') || norm === 'health') return PALETTE.health;
  if (norm.includes('развлеч') || norm.includes('досуг') || norm.includes('кино') || norm === 'fun') return PALETTE.fun;
  if (norm.includes('подарк') || norm.includes('подарок') || norm === 'gifts') return PALETTE.gifts;
  if (norm.includes('подписк') || norm === 'subs') return PALETTE.subs;
  if (norm.includes('зарплат') || norm.includes('оклад') || norm === 'salary') return PALETTE.salary;
  if (norm.includes('подработк') || norm.includes('фриланс') || norm.includes('бонус') || norm === 'side') return PALETTE.side;

  // Fallback: детерминированно выбираем из палитры по id (или хешу имени).
  const keys = Object.keys(PALETTE) as (keyof typeof PALETTE)[];
  const hash = id !== undefined ? Math.abs(id) : hashString(norm);
  return PALETTE[keys[hash % keys.length]];
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}
