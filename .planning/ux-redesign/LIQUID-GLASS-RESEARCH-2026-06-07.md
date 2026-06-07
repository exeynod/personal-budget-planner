# Liquid Glass — ресёрч по awesome-liquid-glass (2026-06-07)

Источник: github.com/carolhsiaoo/awesome-liquid-glass. Контекст: Telegram Mini App
(веб = React+Vite+CSS Modules, на iOS = WKWebView/WebKit) + нативное iOS-приложение
(SwiftUI, target iOS 26). Владелец просит тастефул, премиально, но НЕЙТРАЛЬНО
(фон уже нейтральный #EEF1F6, без оптического перегруза).

## Главный вывод

- **Веб:** ни одна из web-рекреаций не пригодна как зависимость. Все строят киллер-фичу
  (warp-рефракцию) на SVG `feDisplacementMap`, который **не рендерится в WebKit/iOS** и
  завязан на мышь (desktop). Лицензии грязные (см. ниже). Берём только **CSS-приёмы**
  (specular-кромка + blur/saturate), которые у нас уже есть — можно подкрутить значения.
- **iOS:** настоящий Liquid Glass — **бесплатный и нативный** (iOS 26 `glassEffect` +
  авто-стеклянный `TabView`). Это единственный честный путь к реальному эффекту. Здесь и
  стоит его делать.
- **Дизайн-значения:** Apple точных чисел не публикует; калиброванные оценки из разборов
  ниже. Целиться в поведение **Regular + Tinted** (не Clear) для светлого фона.

## Кандидаты из awesome-list → вердикт для нас

| Ресурс                                           | Техника                                  | iOS-WebKit                       | Тач        | Лицензия                              | Вердикт                              |
| ------------------------------------------------ | ---------------------------------------- | -------------------------------- | ---------- | ------------------------------------- | ------------------------------------ |
| rdev/liquid-glass-react                          | SVG displacement + mouse                 | ❌ displacement невидим          | мышь       | MIT                                   | SKIP (платформа/мышь/перегруз)       |
| shuding/liquid-glass                             | ваниль JS буклет, SVG-shaders            | ❌                               | drag-мышь  | MIT                                   | SKIP (демо-toy)                      |
| lucasromerodb/...-macos                          | CSS `backdrop-filter` + SVG displacement | частично (blur да, warp нет)     | статик     | **нет LICENSE** = all rights reserved | BORROW приём кромки (идея, не файлы) |
| Muggleee/liquid-glass-vue                        | WebGL2 GLSL, рефрактит ТЕКСТУРУ (не DOM) | canvas да, но не «над контентом» | mouse-only | MIT заявлен, **LICENSE-файла нет**    | BORROW идею WebGL-фона (не код)      |
| Shadertoy WftXD2                                 | GLSL fragment shader                     | как WebGL-фон да; не над DOM     | iMouse     | **CC BY-NC-SA** (запрет коммерции)    | SKIP (лицензия+вес)                  |
| Flutter (2 шт.)                                  | —                                        | —                                | —          | —                                     | N/A (мы не Flutter)                  |
| Figma iOS 26 components / Apple Design Resources | дизайн-спеки                             | —                                | —          | —                                     | TAKE как референс значений           |
| Apple HIG / WWDC25 219+356 / dev docs            | официальная дока                         | —                                | —          | —                                     | TAKE для iOS-имплементации           |

## Путь A — Web (CSS, iOS-совместимо, нейтрально)

Никакого SVG-displacement/WebGL. Стекло на chrome (таб-бар, карточки, круглые кнопки)
чистым CSS, работает в WKWebView, не зависит от мыши. Целевые токены (оценки из разборов
Josh Comeau / DEV / NN-g, помечено [оценка]; форма/правила [Apple]):

```
--lgn-tint-light: rgba(255,255,255,.12);   /* regular tint на светлом [оценка] */
--lgn-tint-dark:  rgba(28,28,32,.52);
--lgn-blur: 16px;                            /* frosting [оценка] */
--lgn-saturate: 150%;                        /* vibrancy, не мутный [оценка] */
--lgn-brightness: 1.05;
--lgn-edge-top: rgba(255,255,255,.7);        /* тонкая верхняя specular-кромка */
--lgn-sheen: inset 0 1px 1px rgba(255,255,255,.3);  /* лёгкий, НЕ толстый glow */
--lgn-shadow-float: 0 6px 24px rgba(17,24,39,.10);  /* мягкая низкоконтрастная тень */
--lgn-radius-pill: 999px;  --lgn-radius-card: 18px;  --lgn-radius-button: 14px;
--lgn-fallback-light: #F4F6FA;  --lgn-fallback-dark: #1C1C1E;
```

Композит chrome: `background: var(--lgn-tint-light); -webkit-backdrop-filter / backdrop-filter:
blur(16px) saturate(150%) brightness(1.05); border-top:1px solid var(--lgn-edge-top);
box-shadow: var(--lgn-sheen), var(--lgn-shadow-float);`

DO: стекло только на chrome/floating; Regular+Tinted; тонкая кромка; 16/150%; continuous
радиусы; текст ≥4.5:1; фолбэк `@media (prefers-reduced-transparency)` / `prefers-contrast`.
DON'T: Clear над светлым; толстый inner-glow / двойные ::after-блики (это «туториальное
стекло»); saturation >180% (ловит цвет); стекло на плотном контенте/полях ввода; warp.

## Путь B — iOS (нативный Liquid Glass, реальный эффект)

iOS 26 API (target наш — iOS 26, попадаем нативно; добавить `#available` фолбэк):

- `.glassEffect(.regular, in: shape)`; варианты `.regular`/`.clear`/`.identity`,
  `.regular.tint(Color)` (только семантика), `.regular.interactive()`.
- **Таб-бар стеклянный АВТОМАТИЧЕСКИ** через нативный `TabView` (не городить кастом) +
  `tabBarMinimizeBehavior(.onScrollDown)`, `tabViewBottomAccessory { ... }` (быстрый «+»).
- Кнопки: `.buttonStyle(.glass)` (круглые: + `.buttonBorderShape(.circle)`,
  `.controlSize(.large)`; для primary `.glassProminent`, но круглые держать на `.glass` —
  артефакт в бетах).
- Карточки: НЕ делать крупные контентные поверхности стеклянными; стекло на мелких
  плавающих контролах, группировать в `GlassEffectContainer(spacing:)`, морфинг через
  `glassEffectID(_:in:)`. Убирать явный `.background(...)` (гасит стекло).
- HIG: стекло = навигационный слой НАД контентом; не на списках/полях; тинт семантический.
- Доступность авто-адаптируется (Reduce Transparency → матовое; Increase Contrast; Reduce
  Motion); проверить 5 режимов + light/dark + текст ≥4.5:1.
- Фолбэк-обёртка:

```swift
@ViewBuilder func glassed(in s: some Shape = Capsule()) -> some View {
  if #available(iOS 26.0, *) { self.glassEffect(.regular, in: s) }
  else { self.background(s.fill(.ultraThinMaterial)) }
}
```

## Рекомендация

1. **Веб:** оставить нейтральное направление; ОПЦИОНАЛЬНО подкрутить наши `--lgn-*` под
   значения Пути A (тонкая specular-кромка + blur 16/saturate 150 на таб-баре/карточках/
   кнопках) + фолбэк `prefers-reduced-transparency`. Маленькая правка, без перегруза.
2. **iOS:** поднять нативный Liquid Glass (стеклянный `TabView`, `.buttonStyle(.glass)` на
   круглых кнопках/FAB, `GlassEffectContainer` на сводке) — это даёт реальный эффект, которого
   на вебе iOS не будет.
3. Никакие сторонние liquid-glass либы как зависимость не тащить (платформа/мышь/лицензии).

Источники: Apple HIG Materials, WWDC25 (219 Meet Liquid Glass, 356), developer.apple.com
glassEffect/GlassEffectContainer/GlassButtonStyle docs; NN/g «Liquid Glass Is Cracked»;
Josh W. Comeau backdrop-filter; разборы CSS-реконструкций (DEV/Medium). Web-репо — GitHub
source (styles.css/LiquidGlass.vue/fragment.glsl), Shadertoy terms (CC BY-NC-SA).
