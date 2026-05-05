# UI tweaks: compact dropdown + wide stats pill with progress fill

> **Note for execution phase:** per the project's `CLAUDE.md`, plans/specs
> live in `specs/` inside the project. After this plan is approved, copy
> this file to `D:\Dev\PROJECTS\WEB\sloboda_utils\specs\ui-sparkling-axolotl.md`
> as the first step of implementation.

---

## Context

The toolbar received a project-switcher dropdown in commit `867c846`
(`feat: project switcher dropdown, toolbar title, import banner`). After
living with the change for a bit, three rough edges show up:

1. The dropdown panel feels too wide — `320 px` on desktop, full-viewport
   on mobile — for a list whose rows are mostly short project names.
2. The stats pill is purely textual and content-sized (`flex: 0 0 auto`).
   It carries the most quantitative information in the UI but visually
   reads as a small chip floating in empty space.
3. `stats.ts:42` already writes a `--stats-fill` CSS variable, but **no
   CSS rule reads it** — the hook is dormant. We want to actually
   visualise progress as a soft fill behind the pill text.

Goal: make the dropdown feel snappier and more compact, give the stats
pill more room to breathe, and turn the % into an ambient visual cue
without introducing a literal "progress bar" aesthetic that would clash
with the dark glass theme.

All three changes are CSS-led with one small JS edit in `stats.ts` to
emit a second custom prop and ARIA attributes. No JS positioning math
for the dropdown — width changes are entirely in the stylesheet.

---

## Decisions (locked in via interview)

| Topic | Decision |
| --- | --- |
| Dropdown width | Auto-fit content, `min 200 px` / `max 280 px`, on **all** viewports |
| Dropdown anchor | Flush left of toolbar (CSS-only — keep `position: fixed`, drop the `right: 0` rule that creates the full-width mobile sheet) |
| Stats pill sizing | `flex: 1 1 auto`, share remaining space 50/50 with the title block on **all** viewports |
| Pill min-width safety floor | `min-width: 120 px` so very narrow screens still keep the pill readable |
| Fill style | Soft gradient overlay drawn on a `::before` pseudo-element, stop position driven by `--stats-fill` |
| Fill scaling | **Length AND intensity** scale together — short+faint at low %, full+bright at 100% |
| Fill colour | Glass tint: `rgb(255 255 255 / α)` — quiet, doesn't compete with map's neon dots |
| 100% state | Brighter same-hue tint (~0.18 α vs ~0.12 α peak), no green hint |
| 0% state | Overlay hidden entirely (`opacity: 0`) so the empty pill matches today's look |
| Animation | `300 ms ease-out` transition on opacity + background when `done` toggles |
| A11y | Replace `role="status"` on the pill with `role="progressbar"` + `aria-valuenow` / `aria-valuemin` / `aria-valuemax` / `aria-valuetext` |

---

## Files to modify

| File | Why |
| --- | --- |
| `src/styles/main.css` | All three visual changes (dropdown width, pill flex/min-width, `::before` fill rules) |
| `src/ui/stats.ts` | Emit `--stats-fill-alpha` alongside existing `--stats-fill`, set ARIA progressbar attributes, set `data-progress="0"` / `"partial"` / `"100"` for state-based CSS hooks |

No changes to `src/ui/project-dropdown.ts`, `src/main.ts`, or any other
JS file. No new files.

---

## Implementation outline

### 1. `src/styles/main.css` — dropdown (replaces lines 856-874)

```css
.project-dropdown {
  position: fixed;
  z-index: 25;
  left: calc(var(--safe-left) + 4px);   /* aligns with toolbar's left padding */
  right: auto;
  top: 0;                               /* overridden by JS, unchanged */
  width: max-content;
  min-width: 200px;
  max-width: min(280px, calc(100vw - var(--safe-left) - var(--safe-right) - 8px));
  background: var(--md-sys-color-surface-container-high);
  box-shadow: var(--elevation-3);
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  overflow-y: auto;
  max-height: 60dvh;
}
/* the @media (min-width: 640px) override is removed entirely */
```

Notes:
- The `min(280px, calc(100vw - ...))` clamp handles the iPhone-SE-class
  case where `280 px` would overflow even after safe-area insets.
- Existing JS in `project-dropdown.ts` only sets `top` — leave it alone.
- The `border-radius: 0 0 ... ...` (sharp top corners) is preserved; the
  panel still hangs from the toolbar visually rather than floating.

### 2. `src/styles/main.css` — stats pill host (replaces line 194)

```css
.toolbar__stats {
  flex: 1 1 auto;
  min-width: 120px;
}
```

### 3. `src/styles/main.css` — stats pill body & fill (replaces 196-215)

```css
.stats-pill {
  position: relative;
  isolation: isolate;        /* keeps ::before below text without breaking other stacking contexts */
  overflow: hidden;          /* clips fill to pill-shape (border-radius: 9999px) */
  display: inline-flex;
  align-items: center;
  justify-content: center;   /* center-pack content now that pill grows wider */
  gap: 0;
  font-variant-numeric: tabular-nums;
  font-size: 0.85rem;
  font-weight: 500;
  padding: 6px 12px;
  border-radius: var(--radius-full);
  background: var(--md-sys-color-surface-container-high);
  border: 1px solid var(--md-sys-color-outline-variant);
  white-space: nowrap;
  letter-spacing: 0.01em;
}

/* Soft gradient fill — length from --stats-fill (e.g. "17.50%"),
   alpha from --stats-fill-alpha (number 0..1).
   Both vars are written by stats.ts on every render. */
.stats-pill::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;               /* sits behind text inside the isolated stacking context */
  border-radius: inherit;
  background: linear-gradient(
    to right,
    rgb(255 255 255 / var(--stats-fill-alpha, 0)) 0%,
    rgb(255 255 255 / var(--stats-fill-alpha, 0)) calc(var(--stats-fill, 0%) - 6%),
    transparent var(--stats-fill, 0%)
  );
  transition: background 300ms ease-out, opacity 300ms ease-out;
  pointer-events: none;
}

/* 0% state — hide overlay entirely so the pill matches today's empty look */
.stats-pill[data-progress="0"]::before {
  opacity: 0;
}

/* 100% state — brighter, full-width same-hue tint */
.stats-pill[data-progress="100"]::before {
  background: linear-gradient(
    to right,
    rgb(255 255 255 / 0.18) 0%,
    rgb(255 255 255 / 0.18) 100%
  );
}

.stats-pill__done  { color: var(--color-done); font-weight: 700; }
.stats-pill__sep   { color: var(--md-sys-color-on-surface-variant); }
.stats-pill__total { color: var(--md-sys-color-on-surface); }
.stats-pill__pct   { color: var(--md-sys-color-on-surface); }
.stats-pill__issue { color: var(--color-issue); font-weight: 700; }
```

### 4. `src/ui/stats.ts` — emit second var, ARIA, data-progress

Change the initial attributes block (lines 7-9) and the `render`
function body. Concretely:

```ts
host.classList.add("stats-pill");
host.setAttribute("role", "progressbar");
host.setAttribute("aria-valuemin", "0");
host.setAttribute("aria-valuemax", "100");
// (drop role="status" and aria-live — progressbar handles announcements)
```

Inside `render()`, after computing `pct`:

```ts
const pctRounded = Math.round(pct);

doneEl.textContent = String(doneCount);
pctEl.textContent = `${pctRounded}%`;

// Length: existing var, unchanged
host.style.setProperty("--stats-fill", `${pct.toFixed(2)}%`);

// Intensity: ramps from 0.04 at low % up to ~0.14 just under 100%.
// The 100% state itself is overridden via [data-progress="100"]::before
// and uses 0.18 directly, so this number is the "in-flight" peak.
const alpha = pct === 0 ? 0 : 0.04 + (pct / 100) * 0.10;
host.style.setProperty("--stats-fill-alpha", alpha.toFixed(3));

// State hook for CSS attribute selectors
host.dataset.progress =
  doneCount === 0 ? "0"
  : doneCount === ACTIVE_HOUSE_COUNT ? "100"
  : "partial";

// ARIA values for screen readers
host.setAttribute("aria-valuenow", String(pctRounded));
host.setAttribute(
  "aria-valuetext",
  `${doneCount} of ${ACTIVE_HOUSE_COUNT}, ${pctRounded} percent`,
);
```

The existing `issueEl` block stays unchanged.

---

## Reused / preserved patterns

- `--stats-fill` is already part of the codebase (`stats.ts:42`) — we
  keep its name and units (`%` string), so the only contract change is
  *adding* `--stats-fill-alpha`, never breaking an existing reader.
- Pill keeps `font-variant-numeric: tabular-nums` so digit width is
  stable as `done` ticks up — important now that the pill is wider.
- Existing design tokens are reused: `--radius-full`, `--md-sys-color-*`,
  `--safe-left/right`. No new tokens introduced.
- The `data-progress` attribute follows the same `data-*` pattern
  already used by other modules (e.g. `data-status` on house elements
  in `map.ts`).

---

## Risks & tradeoffs

- **Title room shrinks on mobile.** `flex: 1 1 auto` on the pill
  (50/50 with title) plus `min-width: 120 px` means on a 320 px iPhone
  SE the title block ends up around 140 px wide and long project names
  ellipsize harder than before. Accepted — `.toolbar__name` already has
  `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;` so
  truncation is graceful. If it becomes annoying we can lower the pill
  floor to 100 px later.
- **`isolation: isolate`** on the pill creates a new stacking context;
  any future child that uses negative `z-index` to escape will be
  trapped. Documented inline in the CSS comment.
- **`role="status"` removal.** Today the pill announces text changes
  via `aria-live="polite"`. `progressbar` doesn't do that — but it does
  fire valuenow updates which screen readers read as "X percent". This
  is the more semantically correct behaviour for a progress indicator,
  and `aria-valuetext` carries the human-readable form.
- **Dropdown anchored to viewport-left, not chevron.** When the title
  is short (e.g. "Парк") the panel will appear noticeably to the left
  of the trigger. Accepted as the cost of staying CSS-only; can be
  upgraded to JS-anchored later without touching this work.
- **Fill on 100% state** is intentionally subtle (0.18 alpha white) —
  not a green flash. If users miss the cue we can revisit, but the
  decision was to keep the toolbar visually quiet.

---

## Verification plan

1. **Static checks**

   ```bash
   npm run typecheck
   npm run build
   ```

   `typecheck` catches the ARIA attribute typing in `stats.ts`; `build`
   exercises the full Vite pipeline including `generate-houses`.

2. **Local UX walkthrough** — `npm run dev`, then in a real browser:

   - Open dropdown on desktop ≥ 640 px wide → panel is `200–280 px`
     wide, anchored at the toolbar's left padding edge, hangs from the
     toolbar.
   - Resize to ~360 px wide → dropdown stays the same compact shape
     (no longer goes edge-to-edge).
   - Resize to 320 px → dropdown's `max-width` clamp kicks in; panel
     never overflows the viewport.
   - At 0 done houses → stats pill looks the same as today (no fill).
   - Click one house → fill appears with a 300 ms ease-out, short and
     faint.
   - Click many houses to reach mid-progress → fill grows in length
     **and** alpha simultaneously; no hard right edge (soft fade).
   - Reach 100% → fill snaps to the brighter full-width state.
   - Click a completed house back to "none" so percentage drops →
     animation runs in reverse smoothly.

3. **A11y spot-check** — open DevTools accessibility panel and confirm
   the pill exposes `role="progressbar"`, `aria-valuenow`, and
   `aria-valuetext`. Optional: trigger a screen-reader read-out (NVDA
   on Windows) and confirm "X of 68, Y percent" is announced.

4. **Mobile smoke test** — `npm run dev` listens on LAN (`host: true`);
   open from a phone and verify the dropdown anchor + pill width
   aren't broken by safe-area insets / dynamic viewport.

5. **No commit until user confirms** — per project `CLAUDE.md`,
   propose the commit and wait for approval before running `git commit`.
