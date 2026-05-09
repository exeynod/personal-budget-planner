# Design System · Maximal Poster

> Источник правды по визуалу. Все токены ниже должны стать переменными в коде.

---

## 1. Палитра

```css
--cream:  #F4EAD9;   /* светлый фон (AI, аналитика, счета) */
--ink:    #1B1A18;   /* основной текст на светлом, фон на тёмных */
--paper:  #FFF6E8;   /* светлый текст на тёмном (теплее белого) */
--black:  #0E0E0E;   /* фон Mgmt, Add, Account Detail */
--coral:  #FF5A3C;   /* hero-цвет (Главная, Подписки, Онбординг) */
--cobalt: #1B2A6B;   /* hero-цвет (Реестр, Категория, PLAN) */
--yellow: #FFE76E;   /* акцент: суммы +, активные tab, FAB, CTA */
--red:    #C24A2A;   /* warning: превышения, OVER */
```

**Правила применения:**

| Контекст            | Фон     | Текст   | Акцент           |
|---------------------|---------|---------|------------------|
| Главная (default)   | coral   | paper   | yellow           |
| Главная (alt)       | cobalt  | paper   | yellow           |
| Главная (light)     | cream   | ink     | cobalt           |
| Реестр              | cobalt  | paper   | yellow           |
| AI                  | cream   | ink     | red (italic accent) |
| Категория (норма)   | cobalt  | paper   | yellow           |
| Категория (over)    | red     | paper   | yellow           |
| Управление          | black   | paper   | yellow           |
| Аналитика           | cream   | ink     | yellow + red     |
| PLAN мая            | cobalt  | paper   | yellow           |
| Подписки            | coral   | paper   | yellow           |
| Счета               | cream   | ink     | yellow           |
| Счёт детальный      | black   | paper   | yellow           |
| Копилка             | black   | paper   | yellow           |
| Add Sheet           | black   | paper   | yellow           |
| Онбординг           | coral   | paper   | paper            |

**Tab bar:** инвертирован относительно текущего экрана (если фон тёмный — bar
чёрный; если светлый — bar paper).

---

## 2. Типографика

### Шрифты

| Family                       | Использование                                                | Вес    |
|------------------------------|--------------------------------------------------------------|--------|
| **Archivo Black**            | Заголовки заголовков (UPPERCASE), названия экранов, CTA-плашки | 900    |
| **DM Serif Display Italic**  | Сериф-Italic для акцентных фраз, AI-наблюдений, дат («Сегодня»), фраз-обращений | 400 italic |
| **JetBrains Mono**           | Все цифры, eyebrow-метки, suffix-подписи                     | 400/600/700 |
| **Manrope**                  | Основной body-text (списки, подписи)                         | 400/500/600/700/800 |

### Шкала размеров

| Token              | Размер | Применение                                  |
|--------------------|--------|---------------------------------------------|
| `text-eye`         | 11px   | Eyebrow (моно, letter-spacing 0.18em, UPPERCASE) |
| `text-mono-sm`     | 11px   | Подписи в моно                              |
| `text-body-sm`     | 12px   | Меньший body                                |
| `text-body`        | 13px   | Основной body                               |
| `text-mono-md`     | 14px   | Цифры в строках, заголовки строк            |
| `text-italic-md`   | 17–24px| Сериф-Italic параграф                       |
| `text-display-sm`  | 28px   | Дата-сериф «Сегодня»                        |
| `text-display`     | 56–88px| Hero-числа JetBrains Mono                   |
| `text-mass`        | 56–90px| Mass-заголовок (Archivo Black uppercase)    |
| `text-mass-italic` | 28–70px| Mass-заголовок DM Serif italic              |

### Letter-spacing

- Eyebrow / CTA: `0.14em–0.18em`
- Hero-числа: `-0.04em`
- Mass: `-0.04em`
- Body: `0` или `0.04em` для UPPERCASE-меток

---

## 3. Расстояния (spacing)

```
4   8   10   12   14   18   22   24   28   40   56
```

**Стандартные паддинги экрана:** `padding: 56px 22px 90px` (top × side × bottom для
отступа под tab bar).

**Между блоками:** `margin-top: 18px / 22px / 24px`.

**Внутри строки списка:** `padding: 12px 0` или `14px 0`, `borderTop: 1px solid` с
прозрачностью 0.18–0.22.

---

## 4. Радиусы и тени

**Радиусы:** **0** на 95% компонентов. Это «постер», не «пузырь».

Исключения:

- iOS-фрейм устройства: 48px (только в прототипе).
- Tab bar dot/indicator: 0px (плоская полоска).
- FAB: 0px (квадрат).
- Toast: 0px.

**Тени:**

- Tab bar: `0 12px 30px rgba(0,0,0,0.45)`.
- FAB: `0 6px 16px rgba(255,231,110,0.35)` (жёлтый-glow).
- Слайдер-thumb: `0 2px 6px rgba(0,0,0,0.25)`.

---

## 5. Иконография

**Не используется в продукте.** Вместо иконок:

- **Eyebrow** (моно, заглавные) — служит «иконкой раздела».
- **Числа в моно** с порядковым номером (`01`, `02`…) — заменяют list-bullets.
- **Глифы в tab bar** (`▣ ◊ ✦ ⌘`) — единственное место, где используются «декоративные» символы.

**Запрещено:** Эмодзи, эмодзи-иконки, line-icons (Material/Heroicons и т.п.).

---

## 6. Компоненты

### 6.1 Eyebrow

```jsx
<div style={{
  fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 600,
  letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.7,
}}>VOL.04 · MAY 2026</div>
```

### 6.2 Mass (заголовок экрана)

Два варианта:

- **Archivo Black uppercase** — для номерных / технических («PLAN МАЯ.»)
- **DM Serif Display italic** — для смысловых («Реестр.», «Подписки.»)

Размер 56–88px, line-height 0.85, letter-spacing -0.04em.

### 6.3 BigFig (hero-число)

JetBrains Mono 64–88px, lh 0.92, letter-spacing -0.04em. Suffix («₽») — 36% от
основного размера, opacity 0.7, верхний индекс.

### 6.4 Plate (информационная плашка)

```css
padding: 14px;
background: <inverted>;     /* черный на светлом, paper на тёмном */
color: <contrast>;
border-radius: 0;
```

### 6.5 Кнопки / CTA

**Primary (жёлтая):**
```css
background: yellow; color: ink;
font: 'Archivo Black' 11–13px; letter-spacing: 0.14–0.18em;
padding: 10–18px 0; text-align: center; cursor: pointer;
```

**Ghost (на тёмном фоне):**
```css
background: transparent; border: 1px solid rgba(255,246,232,0.45);
color: paper;
```

**Destructive:**
```css
background: red; color: paper;
```

### 6.6 Чипы / Segmented

```css
padding: 6–8px 10–11px;
border: 1px solid rgba(...,0.35);
font: 'Archivo Black' 11px; letter-spacing: 0.12–0.14em;
text-transform: uppercase;

/* active */
background: yellow; color: cobalt; border: none;
```

### 6.7 Slider (бюджет / онбординг)

- Track: 2px height, 25% opacity paper.
- Filled: paper.
- Thumb: 22×22px, paper, border-radius 50%, shadow `0 2px 6px rgba(0,0,0,0.25)`.
- `:active` thumb scale 1.08, cursor grabbing.

### 6.8 Tab bar

- 5 колонок: `1fr 1fr 64px 1fr 1fr`, FAB по центру.
- Высота 68px, margin 0 14px 18px (плавающая нижняя плашка).
- Активный tab: цвет yellow, поп-анимация глифа 0.45s, sliding-indicator снизу 2px.

### 6.9 FAB

48×48px, квадрат, жёлтый, символ `+` Archivo Black 24px. На тапе вращается
`scale(0.88) rotate(-90deg)`.

### 6.10 Toast

Позиция top:64, по центру, фон yellow, текст ink, моно 11px UPPERCASE.
Анимация in: scale + translateY (cubic-bezier 0.34,1.56,0.64,1), 1700ms жизни.
Чек-марк `<svg>` рисуется с stroke-dashoffset.

---

## 7. Анимации

### 7.1 Easing-кривые

| Token         | Кривая                                     | Где                                      |
|---------------|--------------------------------------------|------------------------------------------|
| `easeOut`     | `cubic-bezier(0.22, 0.61, 0.36, 1)`        | основной (90% переходов, появлений строк)|
| `overshoot`   | `cubic-bezier(0.34, 1.56, 0.64, 1)`        | FAB-press, Toast-in, tab-pop             |
| `sheetEase`   | `cubic-bezier(0.32, 0.72, 0, 1)`           | bottom-sheet slide-up / slide-down       |
| `cubicOut`    | `1 - (1-t)^3`                              | count-up чисел (JS-easing, не CSS)       |

### 7.2 Keyframes (полный список)

```css
/* Появление строк списка (stagger) */
@keyframes posterRowIn {
  from { opacity:0; transform:translate3d(0, 8px, 0) }
  to   { opacity:1; transform:none }
}
/* Длительность 420–450ms; delay = 0.08 + i*0.045 (или *0.05–0.07) */

/* Появление крупных hero-блоков */
@keyframes posterRiseIn {
  from { opacity:0; transform:translateY(14px) }
  to   { opacity:1; transform:none }
}
/* 500–600ms; staggered delays 0, 0.08, 0.14, 0.18s для слоёв (eyebrow → mass → italic → big-fig) */

/* Заливка прогресс-баров (категории, цели, аналитика) */
@keyframes posterBarFill {
  from { transform:scaleX(0) }
  to   { transform:scaleX(1) }
}
/* 700–850ms easeOut; transformOrigin: left center */

/* Поп активного tab при переключении */
@keyframes posterTabPop {
  0%   { transform:scale(1) }
  35%  { transform:scale(1.35) translateY(-2px) }
  100% { transform:scale(1) }
}
/* 450ms overshoot; срабатывает только на новом active */

/* Появление с overshoot (зарезервировано) */
@keyframes posterPopIn {
  0%   { opacity:0; transform:scale(0.86) }
  60%  { opacity:1; transform:scale(1.04) }
  100% { opacity:1; transform:scale(1) }
}

/* Чек-марк в Toast (рисуется stroke) */
@keyframes posterCheck {
  from { stroke-dashoffset:24 }
  to   { stroke-dashoffset:0 }
}
/* 350ms easeOut, delay 0.12s; SVG path stroke-dasharray:24 */

/* AI typing — три точки */
@keyframes posterDot {
  0%, 80%, 100% { opacity:0.3; transform:translateY(0) }
  40%           { opacity:1;   transform:translateY(-3px) }
}
/* 1.2s ease-in-out infinite; точки с delay 0, 0.18s, 0.36s */

/* Push-переход экрана (вперёд) */
@keyframes posterSlideInFwd {
  from { opacity:0; transform:translate3d(28px, 0, 0) }
  to   { opacity:1; transform:none }
}
/* 420ms easeOut */

/* Pop-переход экрана (назад) */
@keyframes posterSlideInBack {
  from { opacity:0; transform:translate3d(-28px, 0, 0) }
  to   { opacity:1; transform:none }
}
/* 420ms easeOut */

/* Переключение таба (без направления) */
@keyframes posterTabSwap {
  0%   { opacity:0; transform:translate3d(0, 8px, 0) }
  100% { opacity:1; transform:none }
}
/* 350ms easeOut */

/* Всплытие тоста (overshoot) */
@keyframes posterToastIn {
  0%   { opacity:0; transform:translateY(-8px) scale(0.9) }
  60%  { opacity:1; transform:translateY(2px) scale(1.04) }
  100% { opacity:1; transform:translateY(0)   scale(1) }
}
/* 500ms overshoot; жизнь тоста 1700ms, fade-out не нужен (mount/unmount) */

/* Базовый фейд (запасной) */
@keyframes posterFade {
  from { opacity:0 } to { opacity:1 }
}
```

### 7.3 Не-keyframe анимации (transition / requestAnimationFrame)

| Что                              | Длительность | Easing       | Реализация                              |
|----------------------------------|--------------|--------------|------------------------------------------|
| Bottom-sheet slide-up            | 350ms        | sheetEase    | `transform: translateY(110% → 0)`        |
| Sheet backdrop fade              | 280ms        | linear       | `background rgba(0,0,0,0 → 0.55)`        |
| Tab-bar sliding indicator        | 350ms        | sheetEase    | `left: calc(activeIdx * 20%)`            |
| Tab glyph color                  | 250ms        | linear       | `color` transition                       |
| Кнопка (poster-press) press-down | 150ms        | ease         | `transform: scale(0.97)` на :active      |
| FAB press (`+`)                  | 250ms        | overshoot    | `scale(0.88) rotate(-90deg)` mousedown   |
| Slider thumb :active             | мгновенно    | —            | `transform: scale(1.08)`                 |
| Бейдж OVER появление             | 420ms        | easeOut      | `posterRiseIn`                           |
| Прогресс категории (детальный)   | 850ms        | easeOut      | `posterBarFill` + delay 250ms            |
| Текст инпута focus               | 200ms        | linear       | `border-bottom-color`                    |

### 7.4 JS-driven анимации

**Count-up чисел** (`useCountUp`, `<CountUp value>`):

- Длительность 900–1100ms.
- Easing `1 - (1 - t)^3` (cubicOut).
- Применяется к: дневной темп (Главная), факт по категории (детальный экран),
  суммы в KPI-плашках при первом монтировании.
- `requestAnimationFrame` цикл; пересчитывает на каждом кадре, форматирует с тонкими пробелами.

**Stagger-индексы для списков:**

```
строки категорий:       delay = 0.08 + i * 0.045s
группы дней (реестр):   delay = 0.05 + i * 0.07s
строки операций:        delay = 0.30 + i * 0.045s   (после hero)
подсказки AI:           delay = 0.18 + i * 0.08s
строки регулярок:       delay = 0.32 + i * 0.09s    (после prog-bar)
```

### 7.5 Маппинг на iOS (SwiftUI)

| CSS keyframe        | SwiftUI                                                                 |
|---------------------|--------------------------------------------------------------------------|
| `posterRowIn`       | `.opacity` + `.offset(y:)` с `.transition`, `.animation(.easeOut(0.42))` |
| `posterRiseIn`      | то же, offset 14px                                                       |
| `posterBarFill`     | `.scaleEffect(x: progress, anchor: .leading)`                            |
| `posterTabPop`      | `.scaleEffect(active ? 1.35 : 1)` с `.spring(response:0.45, damping:0.55)` |
| `posterCheck`       | `Path.trim(from: 0, to: drawn)` + animate                                |
| `posterDot`         | `Timer.publish(every: 0.18)` + opacity loop                              |
| `posterSlideInFwd`  | `.transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity), removal: .move(edge: .leading)))` |
| Sheet slide-up      | `.sheet { ... }` (iOS 16+ — нативный) ИЛИ `.presentationDetents` |
| FAB rotate          | `.rotationEffect(.degrees(pressed ? -90 : 0))` + `.scaleEffect`          |
| Count-up            | `withAnimation(.easeOut(duration: 0.9)) { value = target }` + `Text(value, format: ...)` |

---

## 8. Форматтеры

```ts
// Тысячи: thin space (U+202F), а не обычный пробел.
fmt(142380)  →  "142 380"   // на самом деле 142\u202F380

// Знак: '+' для положительных, '−' (U+2212) для отрицательных, '' для нуля.
sign(-340)   →  "−"

// Валюта: всегда после числа, через тонкий пробел: "142 380 ₽".
// Дробная часть: для рублей — отбрасывается на витринах (не нужна).
```
