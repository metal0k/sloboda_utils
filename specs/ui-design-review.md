# UI Design Review — Sloboda Utils

> **Note for execution phase:** per the project's `CLAUDE.md`, plans/specs
> live in `specs/`. After approval, copy this file to
> `D:\Dev\PROJECTS\WEB\sloboda_utils\specs\ui-design-review.md` (rename
> on the way). Implementation should not start from this single doc —
> each improvement tier below is independently shippable and should be
> picked off one PR at a time.

---

## Context

Recent UI work landed three focused fixes (compact dropdown, wider stats
pill with progress fill, multi-project state). With those in place this
is a good moment to step back and look at the **whole visual language**
through a frontend-design lens — what feels designed, what feels stock,
and where the cheapest wins are.

Two agents (one for tokens/typography/motion, one for components +
share PNG) audited the current build. Full notes live in this turn's
chat history; this document is the prioritized improvement list
distilled from them.

### The single most important finding

**The share PNG (`src/ui/share-image.ts`) has a stronger, more specific
brand voice than the live UI.** It paints a deep near-black-green
background (`#060b06`), 52 px bold title, green stats line, segmented
done/issue progress bar, and a pale-green legend / watermark
(`rgba(215, 255, 215, 0.6)` / `0.4`) — that warm-green-on-black is
distinctly *Sloboda*. The web chrome, by contrast, is correct MD3
neutral. The biggest win is **closing the gap by pulling the share PNG's
voice into the live UI**, not inventing a new aesthetic.

### Current character (what's already good)

- Two custom map-marker tokens (`--color-done`, `--color-issue`)
  deliberately split from MD3 primary so they stay legible against the
  satellite image.
- Genuinely thoughtful micro-interactions: contenteditable title with
  `white-space: pre` on focus only, two-tap destructive confirms with
  glyph swaps (`delete` → `delete_forever`), three-state theme cycle,
  per-project zoom persistence, hover-revealed dropdown actions, the
  `+N / −N` diff hint under list textareas.
- Bottom sheet vs desktop side-rail differentiation (`28 px` top corners
  vs `16 px` left corners) — a real responsive design choice, not just
  a width swap.
- Stats pill `::before` progress fill with feathered leading edge and a
  bumped 100 % state — a designed component, not a default.

### Current weaknesses (what reads as stock MD3)

- **Roboto Flex** loaded as variable but never *used* as variable — every
  weight is hard-coded `400/500/600/700`, no `opsz` axis tuning per
  surface. It's the most default web-app font choice in 2024–25.
- **Material Symbols** at default `wght 400 / GRAD 0 / FILL 0` — never
  tuned per state (e.g. filled when active, lighter when inactive).
- **Predictable rounded rectangles everywhere.** Every shape uses one of
  six radius tokens. No asymmetry, no callouts, no organic forms.
- **No glass / depth in the chrome.** Zero `backdrop-filter`, no body
  gradient, no atmosphere. Everything floats on flat opaque MD3
  surfaces.
- **No motion personality.** All transitions are 120–280 ms ease.
  No spring, no stagger, no overshoot, no celebration.
- **No `prefers-reduced-motion` handling** — accessibility gap.
- **Manifest mis-configured** — `theme_color: #fafafa` against a
  `#111410` dark default; empty `name` / `short_name`.
- **Ad-hoc type scale** — eight distinct sizes between `0.75–0.95rem`
  (`0.78`, `0.8`, `0.82`, `0.85`, `0.875`, `0.9`, `0.92`, `0.95`) with
  no rationale or token names.
- **No spacing tokens** — magic numbers on a 4 px grid.
- **No empty/loading states** — new-user, single-project, and offline
  flows aren't designed.
- **No logo / wordmark / brand element anywhere in the chrome** — the
  Sloboda identity exists only in the page `<title>` and the map
  itself.

---

## Improvements — prioritized by impact ÷ effort

Each item carries:
**Impact** (1–5, how visible the win is) ·
**Effort** (XS / S / M / L) ·
**Files**.

Tier A is "do these first" — cheap, visible, no behaviour risk.
Tier B is the "make it feel branded" tier — slightly more design work.
Tier C is bigger swings and structural cleanup.

### Tier A — Quick wins (do first)

#### A1. Tune Material Symbols by state, not globally
**Impact 4 · Effort S · Files:** `src/styles/main.css:112-119`,
new rules per active/inactive selector.

Right now every glyph uses `font-variation-settings: "FILL" 0, "wght"
400, "GRAD" 0, "opsz" 24`. Change the global to `wght 350` for a
slimmer baseline, then bump active states to `FILL 1, wght 500`.
Targets:
- `.toolbar__chevron--open` → `FILL 1`
- `.zoom-btn:active` → `wght 500`
- `.project-dropdown__row--active .project-dropdown__check` → `FILL 1, wght 500`
- `.toolbar__theme[data-theme=light/dark]` → `FILL 1` for the resolved state
- `.btn-icon:hover` → animate `wght` from 350 → 450 over 150 ms

This single change makes the iconography stop looking like a default
Material demo. Variable-axis transitions on `font-variation-settings`
are CSS-only.

#### A2. Use Roboto Flex's `opsz` axis where size warrants it
**Impact 3 · Effort S · Files:** `src/styles/main.css` typography rules.

Roboto Flex was loaded with `opsz 8..144` (`index.html:13`) but never
exercised. Add `font-variation-settings: 'opsz' <size>` to:
- `.toolbar__name` (`1.1rem`) → `'opsz' 18`
- `.sheet-title` (`1rem`) → `'opsz' 16`
- `.zoom-btn--label` (`0.62rem`) → `'opsz' 11` (small-optical for the
  micro-label — visibly different)
- Any `<= 0.78rem` label → `'opsz' 12`
- `.share-dialog-action` (`1rem`) → `'opsz' 16`

The micro-labels in particular benefit — `opsz 11` widens letterforms
and improves rendering at tiny sizes.

#### A3. Add `prefers-reduced-motion` handling
**Impact 4 · Effort XS · Files:** `src/styles/main.css` (one block at end).

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```
Plus: special-case the sheet open/close (still need a transform, just
near-instant). Closes a real accessibility gap.

#### A4. Fix the manifest mismatch
**Impact 2 · Effort XS · Files:** `site.webmanifest`, `index.html`.

- `site.webmanifest` line 11: `theme_color: "#fafafa"` → `"#111410"`
  (matches dark default which is the active theme for almost all users).
- Fill in `name` and `short_name` — currently empty strings.
- Add `<meta name="theme-color" content="#111410" media="(prefers-color-scheme: dark)">`
  and a light counterpart in `index.html`. This colors the mobile
  status bar / iOS PWA chrome, currently default white.

#### A5. Define spacing tokens (rip the band-aid off)
**Impact 2 · Effort S · Files:** `src/styles/main.css:1-90` (token block),
followed by a global find-replace pass.

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
```

Doesn't change a single pixel today — sets up future consistency.
Optional: collapse the 8 ad-hoc 0.7-0.95 rem font-sizes into a
`--text-xs/sm/md/lg` token set the same way.

#### A6. Housekeeping cleanup
**Impact 1 · Effort XS · Files:** as listed.

- `main.css:756` — replace hard-coded `border-radius: 12px` on
  `.share-preview__img` with `var(--radius-md)`.
- `public/sloboda_house_numbers.svg:5-27` — the embedded `lawngreen` /
  `darkred` / `lightgray` classes are completely overridden at runtime.
  Either delete them or swap the SVG fills to `currentColor` so the
  outer CSS owns colour 100%.
- `main.css:266` — `.btn-icon { font-size: 1.3rem }` is a no-op
  (children are `.material-symbols-outlined` with their own size).
  Delete or repurpose.
- `title.ts:85-87` swaps `expand_more` ↔ `expand_less` *and* CSS
  rotates the chevron 180° (`main.css:185-191`). Pick one — the
  rotation is more consistent with MD3 (icon stays the same shape,
  rotates), the swap is more familiar to Russian users. Recommendation:
  drop the JS swap, keep the rotation.

### Tier B — Brand voice (raise the personality floor)

#### B1. Bring the share PNG's voice into the live chrome
**Impact 5 · Effort M · Files:** `src/styles/main.css:1-90`,
optional new background SVG/canvas.

The share PNG paints `#060b06` (deep near-black-green). The live app
paints `#111410` (warm-greenish neutral). Pull the PNG's deeper green
into the live `--md-sys-color-background` for dark mode (or one tier
deeper, e.g. `#0A0E0A`) and let the surface ladder rebuild on top.
Combined with...

A subtle pale-green watermark echo on dark-mode backgrounds:
```css
body {
  background:
    radial-gradient(ellipse 80% 60% at 50% 0%,
      rgba(76, 175, 80, 0.06), transparent 60%),
    var(--md-sys-color-background);
}
```
A barely-there green halo behind the toolbar. Light mode gets the
mirror (warm cream tint). This is the single biggest "feels designed"
move.

#### B2. Glass-tinted toolbar + sheet (depth against the map)
**Impact 4 · Effort S · Files:** `src/styles/main.css:128-140`
(`.toolbar`), `main.css:354-376` (`.sheet-panel`).

Replace the opaque `surface-container` fill with translucent + backdrop
blur. The map sits *under* both surfaces; making the chrome glassy ties
it to the satellite image as a unified plane.

```css
.toolbar {
  background: color-mix(in srgb,
    var(--md-sys-color-surface-container) 78%, transparent);
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
}
.sheet-panel {
  background: color-mix(in srgb,
    var(--md-sys-color-surface-container-low) 86%, transparent);
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
}
```
Add `@supports not (backdrop-filter: blur(1px))` fallback that keeps
opaque fill, so non-supporting browsers degrade cleanly.

#### B3. Real 100 % celebration
**Impact 3 · Effort S · Files:** `src/styles/main.css:240-246`,
`src/ui/stats.ts:50-53`, optional new `@keyframes`.

The current 100 % state bumps the white-tint alpha from ~0.14 to 0.18
— almost imperceptible. Make it a moment:

```css
@keyframes pillCelebrate {
  0%   { box-shadow: 0 0 0 0   rgba(76, 175, 80, 0.55); }
  60%  { box-shadow: 0 0 0 10px rgba(76, 175, 80, 0);    }
  100% { box-shadow: 0 0 0 0   rgba(76, 175, 80, 0);    }
}
.stats-pill[data-progress="100"] {
  border-color: var(--color-done);
  animation: pillCelebrate 800ms ease-out;
}
.stats-pill[data-progress="100"]::before {
  background: linear-gradient(to right,
    color-mix(in srgb, var(--color-done) 22%, transparent) 0%,
    color-mix(in srgb, var(--color-done) 22%, transparent) 100%);
}
```
Tie the 100 % colour to `--color-done` (the brand green) instead of
white. That binds the pill to the map markers it summarises. Throttle
the animation so it only fires when transitioning *into* `100`, not on
every render.

#### B4. Tune house-number visual on the map
**Impact 4 · Effort M · Files:** `src/styles/main.css:316-326`,
`public/sloboda_house_numbers.svg`.

The numerals are currently white with the SVG's built-in Gaussian-blur
drop shadow. Three layered improvements:

1. **Active marker badge.** Currently `is-done` and `is-issue` are pure
   colour swaps. Add a CSS halo (paint-order trick or SVG filter) so
   completed/issue houses have a soft coloured glow:
   ```css
   .map-stage__svg text.is-done {
     fill: var(--color-done);
     filter: drop-shadow(0 0 6px color-mix(in srgb, var(--color-done) 50%, transparent));
   }
   .map-stage__svg text.is-issue {
     fill: var(--color-issue);
     filter: drop-shadow(0 0 6px color-mix(in srgb, var(--color-issue) 50%, transparent));
   }
   ```
2. **Disabled houses** — currently `fill: #999; opacity: 0.4`. Replace
   with `fill: var(--md-sys-color-outline); opacity: 0.5; font-weight: 600`
   so they look intentionally off-roster, not broken.
3. **Click-feedback ripple.** When a house cycles status, a 1-frame
   scale pulse via `transform: scale(1.15)` on the `<text>` element.
   The current 120 ms `transition: fill` is too quiet for the primary
   gesture in the app.

#### B5. A tiny brand mark in the toolbar
**Impact 3 · Effort M · Files:** new SVG asset, `src/main.ts:126-137`.

Currently the toolbar opens flush against the title. A 24 × 24 SVG
mark on the left — even just an abstracted house silhouette in
`--color-done` — gives the chrome an identity beyond Material defaults.
Important: not "Material-flat" — make it feel hand-drawn or stamp-like
(thicker stroke, slight skew, irregular line ends) to differentiate
from the geometric Material Symbols around it.

Acceptable alternative: a custom wordmark "Слобода" rendered in a
non-Roboto display font (e.g. *Unbounded*, *Bricolage Grotesque*, or a
Cyrillic-supporting display face like *PT Serif Pro*). One non-Roboto
typeface, used in exactly one place (the toolbar wordmark and the share
PNG title), is the cheapest "this is a brand" move.

#### B6. Staggered reveal on sheet open
**Impact 3 · Effort S · Files:** `src/ui/sheet.ts:357-370` open path,
`src/styles/main.css:336-376`.

The sheet currently slides up as a single solid block. Add a 60 ms
stagger to the section reveals via CSS:

```css
.sheet-panel.sheet-panel--open .sheet-section {
  animation: sectionFadeUp 280ms cubic-bezier(0.2, 0, 0, 1) backwards;
}
.sheet-panel.sheet-panel--open .sheet-section:nth-child(1) { animation-delay: 80ms; }
.sheet-panel.sheet-panel--open .sheet-section:nth-child(2) { animation-delay: 140ms; }
.sheet-panel.sheet-panel--open .sheet-section:nth-child(3) { animation-delay: 200ms; }
@keyframes sectionFadeUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
```
Disable inside `prefers-reduced-motion`. The toast already has motion
character; the sheet should match.

### Tier C — Larger swings (when time permits)

#### C1. Empty / first-run state
**Impact 4 · Effort M · Files:** `src/ui/project-dropdown.ts`,
new component for the map viewport.

When a fresh user opens the app, they see the map with zero state and
no clue what to do. Design a first-run overlay:
- A single tooltip arrow pointing at the FAB ("Нажмите дом, чтобы
  отметить как «готово»").
- A faded "0 / 68 · 0%" pill that pulses gently for 2 s, then settles.
- After first interaction, the overlay is dismissed and never returns.

#### C2. Light mode pass
**Impact 3 · Effort M · Files:** `src/styles/main.css:57-90`,
`stats.ts`, share image.

The token set exists but the app is clearly designed dark-first:
- Stats-pill progress fill is white-on-near-white in light mode →
  near-invisible at low %. Switch to a green tint in light mode
  (`color-mix(in srgb, var(--color-done) 12%, transparent)`).
- Map house numerals are bright white over satellite — fine in dark,
  but in light mode they don't contrast meaningfully with the
  background page. The map itself is dark imagery so it works, but
  test thoroughly.
- The share PNG always uses the dark-mode (`#060b06`) background
  regardless of theme. That's a defensible choice (consistent share
  artefact) but worth a conscious decision.

#### C3. Custom display typeface for project name + share PNG title
**Impact 4 · Effort M · Files:** `index.html` (font load),
`src/styles/main.css` (typography), `src/ui/share-image.ts:130-144`.

Pair Roboto Flex (body) with one display face used only for:
- `.toolbar__name` (the live title)
- The 52 px title on the share PNG

Recommended candidates for Cyrillic + character:
- **Unbounded** (Google Fonts, geometric, has Cyrillic)
- **Bricolage Grotesque** (Google, Cyrillic, expressive)
- **Onest** (Google, Cyrillic, neutral but distinct)

This is the single most "feels designed" move and aligns the live UI
with the share PNG, where the title currently falls back to
`sans-serif` (so it renders as Arial / Helvetica on most platforms).
Loading one display face via `<link rel="preload">` is ~30–50 KB.

#### C4. Asymmetric / decorative element somewhere
**Impact 3 · Effort M · Files:** wherever it lands.

Right now everything is rectangular. Pick one place to break the grid
— for example:
- A diagonal corner fold on the import banner (`clip-path: polygon(...)` )
- An angled accent strip behind the FAB
- A handwritten/marker-style underline beneath the active project's
  name in the dropdown
- A tilted "version" stamp in the sheet footer

One unexpected break is enough. The skill guide is explicit: "Bold
maximalism and refined minimalism both work — the key is intentionality,
not intensity." This is the intentionality lever.

#### C5. Motion language refresh
**Impact 3 · Effort M · Files:** `src/styles/main.css` global.

Build out a shared transition token vocabulary:
```css
--motion-duration-fast: 120ms;
--motion-duration-base: 220ms;
--motion-duration-slow: 360ms;
--motion-ease-standard: cubic-bezier(0.2, 0, 0, 1);   /* MD3 emphasized decel */
--motion-ease-spring:   cubic-bezier(0.34, 1.56, 0.64, 1);  /* slight overshoot */
```
Then promote the spring curve to: dropdown open, FAB tap-down/up,
project switch on the map. Used sparingly, a single overshoot curve
is identifiably *Sloboda*.

---

## Critical files referenced

- `src/styles/main.css` (1064 lines — the entire design system)
- `index.html` (font loading, viewport meta)
- `site.webmanifest` (theme color, icons, name)
- `src/ui/theme.ts` (3-state theme cycle)
- `src/ui/stats.ts` (stats pill render + CSS vars)
- `src/ui/share-image.ts` (canvas-rendered PNG — strongest brand asset)
- `src/ui/share-dialog.ts` (PNG preview overlay)
- `src/ui/sheet.ts` (bottom sheet + sidebar, toast, 2-tap clear)
- `src/ui/title.ts` (contenteditable title, chevron icon swap)
- `src/ui/project-dropdown.ts` (rows, hover-revealed actions, 2-tap delete)
- `src/ui/banner.ts` (centered import banner)
- `public/sloboda_house_numbers.svg` (Arial 800 numerals + drop-shadow)
- `public/sloboda_map_back.png` (1369 × 1465 satellite/map raster)

## Recommended ordering

1. **Tier A — week 1 sweep.** A3 + A4 + A6 are <1 hour each. A1 + A2 +
   A5 each fit in a half-day. Ship as one PR per item.
2. **B1 + B2 — the "feels designed" PR.** Single PR: deeper background
   green + radial halo + glass toolbar/sheet. This is where reviewers
   say "wait, that looks different."
3. **B3 + B4 — the "celebrate progress" PR.** 100 % moment + house
   marker glows + click ripple. Tie the chrome to the map.
4. **B5 + C3 — the "this is a brand" PR.** Display typeface for title
   + small toolbar mark. Land together so the new font reads as
   intentional, not mismatched.
5. **C1, C2, C4, C5 — opportunistic** as bandwidth allows.

## Verification plan

For each tier:

- **Static checks:** `npm run typecheck && npm run build` (both already
  required by the project; no new tests needed for CSS-only items).
- **Manual visual sweep:** `npm run dev` →
  - Empty state (no projects → no done houses)
  - Mid-state (~30 % done, a few issues)
  - 100 % state (transition into completion to verify celebration)
  - Theme cycle: auto → light → dark → auto (every screen)
  - Mobile (DevTools 360 × 800), small mobile (320 × 568), desktop
    (≥ 640), wide (≥ 1280)
  - `prefers-reduced-motion: reduce` enabled — confirm sheet still
    works, no jank
  - System dark/light flip at runtime — confirm theme-color meta updates
- **A11y spot-check:** axe DevTools panel, confirm contrast on the
  newly added glass surfaces, confirm `aria-valuenow` still announced.
- **Share PNG regression:** generate share image after Tier B/C
  changes, confirm the PNG still matches the live UI's voice (or
  consciously updated to match).
- **No commit until user confirms** — per project `CLAUDE.md`.
