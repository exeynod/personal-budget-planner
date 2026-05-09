# ADR-001: Cyrillic Font Fallback Strategy для DM Serif Display Italic

**Дата:** 2026-05-09
**Статус:** ✅ Decided
**Phase:** 23 (Design System Foundation)

## Context

DM Serif Display Italic — главный типографический акцент во всём design-system Maximal Poster (AI наблюдение Hero, day-grouping в Transactions, Goal input, Final onboarding, mass-italic заголовки экранов). Семейство **не имеет полноценного кириллического subset на Google Fonts** — только Latin / Latin-Extended / Vietnamese.

Без решения этого вопроса `acceptance §14.7 «нет FOUT-моментов»` невозможно для русскоязычного приложения.

## Decision

**Web: dual-font через CSS `unicode-range`.** DM Serif Display Italic для Latin glyphs + **PT Serif Italic** (Google Fonts, cyrillic-ready) для кириллицы. Fallback chain в `tokens.css`:

```css
@font-face {
  font-family: 'PosterSerif';
  src: url('/fonts/dm-serif-display-italic.woff2') format('woff2');
  unicode-range: U+0000-024F, U+1E00-1EFF, U+2000-206F;  /* Latin + extras */
  font-display: swap;
}
@font-face {
  font-family: 'PosterSerif';
  src: url('/fonts/pt-serif-italic.woff2') format('woff2');
  unicode-range: U+0400-04FF, U+0500-052F;  /* Cyrillic */
  font-display: swap;
}
```

Использование: `font-family: 'PosterSerif', Georgia, serif;` — браузер сам выбирает glyph-source.

**iOS: единый PT Serif Italic** как pragmatic fallback. Composite UIFont сложнее в SwiftUI, не оправдан для single-platform pixel-perfect QA. Designer review: брендовое расхождение приемлемо при сохранении charact: serif + italic.

## Alternatives Considered

| Вариант | Pros | Cons |
|---|---|---|
| Везде PT Serif Italic (web + iOS) | Простее maintain, parity Web↔iOS | Brand divergence от prototype во всех latin-вкраплениях |
| Custom cyrillic add-on от designer | Точное соответствие prototype | Time + cost; не для pet |
| Composite UIFont на iOS | Полная parity Web↔iOS | ~50 LOC boilerplate, font cache headaches |

## Consequences

- Phase 23 закладывает PT Serif Italic в TTF bundle iOS и в @fontsource на web
- Phase 28 acceptance §14.7 переформулирован: «нет FOUT для cyrillic glyphs»
- При фразах вида «Май в плюсе» Web получает hybrid-rendering (Май = PT Serif, плюсе = PT Serif), iOS = uniform PT Serif Italic — minor visual divergence, acceptable
- `tokens.css` и `PosterTokens.swift` оба используют alias `PosterSerif` — designer commits изменяет mapping в одном месте

## Implementation

- Phase 23 add npm: `@fontsource/pt-serif@5.2.8` (Italic 400)
- Phase 23 add iOS bundle: `Resources/Fonts/PTSerif-Italic.ttf`
- `tokens.css`: alias + unicode-range fallback chain
- `PosterTokens.swift`: `PosterFont.serifItalic = .custom("PTSerif-Italic", size: ...)`
- Phase 23 verification: `pyftsubset --unicodes='U+0410-044F'` smoke + side-by-side скриншот «Май» vs prototype
