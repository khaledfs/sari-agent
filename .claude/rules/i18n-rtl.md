# i18n & RTL

Migrated from `docs/WORKING_INSTRUCTIONS.md` §2, §4 (+ the established CSS conventions).

## Three locales — always all three
Any user-visible string added in UI gets keys in **all three** files:
- `src/i18n/messages/en.json` · `src/i18n/messages/he.json` · `src/i18n/messages/ar.json`

Keep key namespaces consistent (`cart.*`, `orders.*`, `products.*`, `adminDashboard.*`, …). Keep the JSON valid (all three files must parse).

## RTL
- Hebrew AND Arabic are RTL (`dir` on the html element; Hebrew is the primary language).
- **Logical CSS properties only** (`inset-inline`, `margin-block`, `inline-size`, `padding-inline-end`, …) — never hard-coded `left`/`right`/`margin-left` where start/end is meant.
- Verify Hebrew/Arabic layouts still read naturally after UI changes (mirroring, alignment, icons).

## Motion
- Every animation must be disabled under `@media (prefers-reduced-motion: reduce)` (shared block at the bottom of `sari-enhance.css` for customer-dashboard styles).
