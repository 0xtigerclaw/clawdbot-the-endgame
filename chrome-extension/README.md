# Clawdbot the Endgame Form Filler Extension

Chrome extension that fills the active form tab using Clawdbot the Endgame backend APIs.

## Features

- Scan live form fields in the active tab (including auth-protected forms).
- Generate context-aware answers from Clawdbot the Endgame (`/api/form-filler/live-suggest`).
- Auto-fill fields directly in the current page.
- Regenerate one field at a time.
- One-click `Run All` (scan -> generate -> fill).
- Group current form tab with the Form Filler dashboard tab.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the `chrome-extension/` folder from this repo.

## Use

1. Open the target form in Chrome and sign in if needed.
2. Open extension popup.
3. Set `API Base` (local dev default: `http://127.0.0.1:3000`).
4. Click `Run All` for full auto flow, or run `Scan Fields` -> `Generate` -> `Auto Fill`.
5. Review answers in-page and submit manually.

## Notes

- Backend state and RAG stay in Clawdbot the Endgame/Convex.
- Extension only reads/writes the active tab fields.
- `Auto Fill` now generates answers first if needed.
- Popup logs include frame + match diagnostics (`filled/missed`, `foundById`, `foundByLabel`, `writeFailed`).

## Validation

- Live page probe (Hub71) without extension UI:
  - `node scripts/test_hub71_scan_fill.mjs`
  - Current pass signal: scanned fields > 0, filled > 0, verification > 0.
