# Tomato Farm design system

## CSS ownership

The cascade order is the `STYLE_ENTRY_SOURCES` array in `scripts/generate-style-entry.mjs`.

1. `styles/tokens.css` owns design tokens.
2. `styles/components.css` and `styles/primitives.css` own reusable components and fields.
3. `styles/features/*.css` owns feature surfaces. A selector stays under its feature root.
4. `styles/compatibility.css` contains temporary compatibility only. Every removal is recorded in `docs/COMPATIBILITY.md`.
5. `admin/admin-hig.css` owns the isolated admin hierarchy and does not define general app primitives.
6. `styles/workout/expert-mode.css` owns the isolated expert-mode scene.
7. `test-mode-v2.css` is a shipped workout growth-board surface consumed by `workout/test-v2/*`, not test scaffolding. It owns only the `tm2-` namespace.
8. `styles/accessibility.css` loads last and is the final focus, touch-target, assistive-text, and reduced-motion layer for every surface above.

Root `style.css` is a generated standalone WebView bundle. Never edit it directly. Change an owner stylesheet, run the generator, and use `node scripts/generate-style-entry.mjs --check` to verify that the tracked bundle is current.

All owner stylesheets and the generated bundle must remain in `runtime-assets.js`. Moving a rule between files requires checking the generator's declared order; filename order is not the cascade contract. `tests/design-system-accessibility.test.js` locks the final accessibility layer after the isolated expert-mode scene.

## Selector rules

- Shared components use the `tds-` prefix; feature classes keep their established feature prefix.
- New rules do not depend on a later `!important` override.
- Feature selectors do not leak outside their screen/controller root.
- Layout data that belongs to a runtime scene is passed through CSS variables rather than duplicated as hard-coded coordinates in several stylesheets.

## Interaction contract

- Prefer native `button`, `a`, `input`, `select`, and `textarea` elements.
- Custom controls require an accessible name, keyboard behavior, and the relevant `aria-*` state.
- Primary touch targets are at least `44px` by `44px` through `--touch-target-min`.
- Opening a dialog moves focus into it; closing restores focus to the opener.
- Loading surfaces use `aria-busy`; empty, offline, error, and success feedback use `.tds-feedback` with `data-state`.
- Motion respects `prefers-reduced-motion` in the final accessibility layer.

## Visual verification

UI completion requires the real composed screen at phone and tablet widths. Verify enabled and disabled controls, focus/keyboard behavior, modal close paths, loading/error states, and reduced motion. Source regexes and isolated asset dimensions are not visual approval.
