# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Vite dev server (host: true — accessible on LAN for mobile testing)
npm run build        # Generates houses, then Vite build → dist/
npm run typecheck    # tsc --noEmit (strict)
npm run preview      # Preview the dist/ build locally

npm run generate-houses  # Regenerate src/houses.generated.ts from SVG (runs automatically on build)
```

`npm run build` runs `generate-houses` as a prebuild hook — if you edit the SVG, run build or `generate-houses` explicitly before typechecking.

## Architecture

Vanilla TypeScript SPA, no UI framework, no React/Vue/Svelte.

**Entry flow**: `src/main.ts` → builds the DOM shell → wires modules together.

**State** (`src/state.ts`): Pub/sub singleton. Single `State` object (`{ campaign, done: ReadonlySet<HouseId>, issue: ReadonlySet<HouseId>, updatedAt }`). Persisted to `localStorage` key `slobodaState/v2`. `subscribe(fn)` returns an unsubscribe callback; mutations (`cycleStatus`, `setStatus`, `setCampaign`, `clearAll`, `replaceState`) all call `emit()` → subscribers re-render.

**House list** (`src/houses.ts`): Single source of truth. `HOUSES` array and `DISABLED_HOUSE_IDS` set come from `src/houses.generated.ts` (auto-generated from SVG `<text id>` elements by `scripts/generate-houses.ts`). `ACTIVE_HOUSE_COUNT = 68`. If the SVG changes (houses added/renamed/disabled), update `DISABLED_HOUSE_IDS` in `houses.ts` and rebuild.

**SVG interaction** (`src/map.ts`): `initMap(svg)` attaches a single delegated `click` listener on the SVG element. Clicks bubble up from `<text id="...">` elements. `paint()` toggles `is-done` / `is-issue` / `is-disabled` CSS classes. Status cycle: `none → done → issue → none` (Ctrl/Meta+click → force `issue`).

**Pan/zoom** (`src/ui/gestures.ts`): Pointer Events for drag + pinch. `enablePanZoom(viewport, stage, { fitOnInit: true })` — `fitOnInit` centers and scales the map to fill the viewport on first render (inside `requestAnimationFrame`, at the end of the function after all helpers are defined to avoid TDZ issues).

**Cross-device sync** (`src/url-state.ts`): Encodes state as `#s=1.<done_b64url>.<issue_b64url>.<ts_b36>.<campaign_b64url>` using 9-byte bitsets for 72 house slots. On load, if `#s=` is present, `showImportBanner()` asks the user to accept or discard. Accepting calls `replaceState()` and clears the hash.

**UI components** (`src/ui/`):
- `sheet.ts` — bottom-sheet (mobile < 640 px) / sidebar (desktop ≥ 640 px). Contains Share, Export JSON, Import JSON, Bulk input, Clear. Also exports `showToast(msg, type)`.
- `stats.ts` — stats pill (`done / total · pct%`). Sets `--stats-fill` CSS variable for gradient.
- `title.ts` — `contenteditable="plaintext-only"` campaign name. Enter/blur commits, Escape cancels.
- `banner.ts` — import confirmation overlay with age display.

**Styles** (`src/styles/main.css`): Design tokens in `:root` (dark glass palette: `--bg`, `--glass`, `--color-done: #39ff14`, `--color-issue: #ff4444`). `env(safe-area-inset-*)` for notch support. Responsive breakpoint at 640 px for sheet vs. sidebar layout.

## Deployment

GitHub Actions (`.github/workflows/deploy.yml`) triggers on push to `main`: `npm ci → typecheck → build → deploy to Pages`. `vite.config.ts` uses `base: "./"` so `dist/index.html` works both on GitHub Pages and when opened directly.

Live URL: **https://metal0k.github.io/sloboda_utils/**

## Key constraints

- SVG house IDs follow the pattern `_N` or `_N_2` (e.g., `_1`, `_7_2`). CSS-escape dots/slashes when querying.
- `dist/` is gitignored and built by CI — never commit it.
- `src/houses.generated.ts` is committed (so `npm run dev` works without pre-generating); regenerate via `npm run generate-houses` when the SVG changes.
- The `creds` / `creds.txt` / `*.token` files are gitignored — never stage them.
