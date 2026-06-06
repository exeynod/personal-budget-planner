// Phase 4 (UX refactor, 2026-06): guard that the Liquid Glass theme produces a
// genuinely distinct iOS look — and, critically, that Maximal Poster (the
// shipping default, covered by Playwright pixel snapshots) is NOT changed.
//
// The theme is delivered purely as scoped CSS in `stylesV10/liquid-glass.css`.
// jsdom's getComputedStyle resolves `[data-theme='liquid_glass']` :root var
// overrides AND `[class*='Plate']` attribute-substring rules (verified), so we
// can assert real computed values rather than string-matching the CSS.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const LG_CSS = fs.readFileSync(
  path.resolve(__dirname, '../liquid-glass.css'),
  'utf8',
);
// tokens.css holds the default `:root` poster values (MP guard reference).
const TOKENS_CSS = fs.readFileSync(
  path.resolve(__dirname, '../tokens.css'),
  'utf8',
);

function injectStyles(): void {
  for (const css of [TOKENS_CSS, LG_CSS]) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }
}

beforeAll(() => {
  injectStyles();
});

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.body.innerHTML = '';
});

describe('Liquid Glass theme (data-theme="liquid_glass")', () => {
  it('rounds plate/card surfaces to a non-zero iOS radius', () => {
    document.documentElement.setAttribute('data-theme', 'liquid_glass');
    const el = document.createElement('div');
    // Mimics a hashed CSS-module class name (source name kept as substring).
    el.className = '_summaryPlate_a1b2c';
    document.body.appendChild(el);

    const radius = getComputedStyle(el).borderRadius;
    expect(radius).toBe('14px');
    expect(radius).not.toBe('0px');
  });

  it('uses an -apple-system / SF stack for display headings (not DM Serif)', () => {
    document.documentElement.setAttribute('data-theme', 'liquid_glass');
    const root = getComputedStyle(document.documentElement);

    const heading = root.getPropertyValue('--poster-font-dm-serif-italic');
    expect(heading).toMatch(/-apple-system|SF Pro/);
    expect(heading).not.toMatch(/DM Serif/);

    const body = root.getPropertyValue('--poster-font-pt-serif-italic');
    expect(body).toMatch(/-apple-system|SF Pro/);
    expect(body).not.toMatch(/PT Serif/);
  });

  it('re-maps the real surface tokens screens consume to iOS values', () => {
    document.documentElement.setAttribute('data-theme', 'liquid_glass');
    const root = getComputedStyle(document.documentElement);
    // `--poster-black` is the real dark-surface token (NOT `--poster-noir`).
    expect(root.getPropertyValue('--poster-black').trim()).toBe('#1c1c1e');
    // `--poster-coral` (poster brand) → system grey under LG.
    expect(
      root.getPropertyValue('--poster-coral').trim().toLowerCase(),
    ).toContain('lg-bg');
  });
});

describe('Maximal Poster (default :root) is untouched', () => {
  it('keeps the poster serif heading font (no data-theme)', () => {
    // No data-theme attribute → default Maximal Poster.
    const root = getComputedStyle(document.documentElement);
    const heading = root.getPropertyValue('--poster-font-dm-serif-italic');
    expect(heading.trim()).toContain('DM Serif');
    expect(heading).not.toMatch(/-apple-system/);
  });

  it('keeps the poster black surface token at its poster hex', () => {
    const root = getComputedStyle(document.documentElement);
    expect(root.getPropertyValue('--poster-black').trim().toUpperCase()).toBe(
      '#0E0E0E',
    );
  });

  it('does not round plate surfaces (poster keeps sharp corners by default)', () => {
    // Under MP there is no theme rule forcing radius; an unstyled element has 0.
    const el = document.createElement('div');
    el.className = '_summaryPlate_a1b2c';
    document.body.appendChild(el);
    const radius = getComputedStyle(el).borderRadius;
    // No LG override applies → default initial value (empty/0).
    expect(radius === '' || radius === '0px').toBe(true);
  });
});
