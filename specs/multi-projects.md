# Multi-Projects — Spec

> **Note**: per global CLAUDE.md, the executor should copy this file to `specs/multi-projects.md` in the project root before/at the start of implementation. This file (`~/.claude/plans/...`) is just the working draft.

## Context

Today the app holds a **single** "campaign" (`State.campaign: string` plus `done` / `issue` sets). One user, one map, one in-progress dataset. The user wants to track **multiple parallel campaigns on the same map** — e.g. "Обход 1", "Обход 2", "Никольская" — without losing one when starting another, and switch between them quickly. Current single-state model forces destructive overwrites or manual JSON juggling.

Outcome: a project switcher in the toolbar; per-project `done` / `issue` / `name` / `redListMode` / pan-zoom; theme stays global; existing data auto-migrates as the only project; URL share encodes only the active project.

## Decisions (from interview)

| Topic | Decision |
|---|---|
| Mental model | Parallel campaigns on the **same** SVG map (68 active houses unchanged) |
| Active at startup | Last active (`activeProjectId` in localStorage) |
| Switcher UI | Toolbar title becomes dropdown trigger (chevron + name) |
| Per-project | `name`, `done`, `issue`, `updatedAt`, `redListMode`, pan-zoom |
| Global | `theme` only |
| URL hash payload | Active project only |
| Import (#s=) banner | Radio: **Создать новый** / **Перезаписать [picker]**. Default = overwrite if name matches an existing project (case-insensitive trim), else create new |
| JSON export/import | All projects; import = full replace (with confirm) |
| Migration | Auto v2 → v3 on first launch; v2 key removed |
| Project ID | 8-char base36 random via `crypto.getRandomValues` |
| Clear / Bulk scope | Active project only |
| Order in dropdown | `updatedAt` DESC (active sorts naturally to top after any edit) |
| Lifecycle | Cannot delete last; 2-tap confirm; clone supported; soft cap 20 |
| Create flow | Instant `"Новый проект"`, becomes active, focus moves to inline title for immediate rename |
| Rename | Inline in toolbar (active) **and** pencil row icon in dropdown (any) |
| `houses.ts:17` _18/_19 discrepancy | **Out of scope** |

## Data model

```ts
// src/state.ts
export type ProjectId = string; // 8-char base36

export type Project = {
  id: ProjectId;
  name: string;
  done: ReadonlySet<HouseId>;
  issue: ReadonlySet<HouseId>;
  redListMode: boolean;
  updatedAt: number;
};

export type State = {
  projects: ReadonlyArray<Project>;
  activeProjectId: ProjectId;
};
```

`SETTINGS` keeps `theme` only — drop `redListMode` from there (move into Project).

## Storage

| Key | Old | New |
|---|---|---|
| `slobodaState/v2` | `{campaign, done[], issue[], updatedAt}` | **delete after migration** |
| `slobodaState/v3` | — | `{version:3, projects:[…], activeProjectId, updatedAt}` |
| `slobodaSettings/v1` | `{theme, redListMode}` | `{theme}` (drop `redListMode`; move to per-project) |
| `slobodaZoom/v1` | `{x,y,scale}` | **delete after migration** |
| `slobodaZoom/v2` | — | `{[projectId]: {x,y,scale}}` |

**Migration (one-shot, idempotent)**: in `initState()`, if `slobodaState/v3` missing and `slobodaState/v2` present → wrap v2 into `{ id: newId(), name: v2.campaign, done: v2.done, issue: v2.issue, redListMode: settings.redListMode, updatedAt: v2.updatedAt }`, write v3, delete v2. Same for zoom: read v1, store under the migrated project's id, write v2, delete v1. Drop `redListMode` from settings after move.

## URL hash

Bump version byte: `"1"` → `"2"`. Format unchanged (5 parts):

```
#s=2.<done_b64>.<issue_b64>.<ts_b36>.<projectName_b64>
```

Decoder accepts **both** `"1"` and `"2"` (existing shared links keep working — same shape, single project).

## Files to modify / create

### Modify

- **`src/state.ts`** — full rewrite of state shape; new API:
  - Active-scoped (operate on the active project): `setStatus`, `clearAll`, `clearIssue`, `cycleStatus`, `setProjectName(name)` (replaces `setCampaign`), `setRedListMode(bool)`.
  - Multi-project: `createProject(name?) → ProjectId`, `deleteProject(id)` (throws if last), `duplicateProject(id) → ProjectId`, `setActiveProject(id)`, `renameProject(id, name)`, `listProjects(): Project[]` (sorted by `updatedAt` DESC), `getActiveProject(): Project`.
  - Helper: `newProjectId()` — 8 bytes from `crypto.getRandomValues` → base36.
  - `replaceState(s: State)` accepts the new shape (used by JSON import).
  - Migration in `initState()` (see Storage above).
  - 20-project soft cap: `createProject` / `duplicateProject` reject with toast "Лимит 20 проектов" if at cap.

- **`src/url-state.ts`** — bump `V` to `"2"`, accept `["1","2"]` in decode. `encodeStateToHash` now takes the active `Project` directly (not whole State). `decodeHashToState` returns `{ name, done, issue, updatedAt }` (a "shared snapshot" object), not a full State — banner decides what to do with it.

- **`src/ui/banner.ts`** — replace single Accept button with:
  - Two radio rows: **Создать новый «{name}»** / **Перезаписать** + `<select>` of existing projects.
  - Default selection: `findByName(state.projects, incoming.name)` → if found, overwrite-mode preselected with that target; else create-new.
  - Apply → either `createProject(incoming.name)` + populate, or `replaceProject(targetId, incoming)`.
  - Existing relative-time age display preserved.

- **`src/ui/title.ts`** — split into two click targets in one host:
  - Name span (existing `contenteditable`) → keeps inline-rename for active project.
  - Chevron button (new) → toggles project dropdown.
  - Dropdown component (new, render inline below toolbar): list of projects (✓ on active), per-row `[✎][⧉][🗑]`, divider, `+ Новый проект`.
  - Pencil → inline-edit row name (replace span with `contenteditable`, blur/Enter commits, Esc reverts).
  - Trash → 2-tap confirm (reuse pattern from `sheet.ts:244-277`); disabled if `state.projects.length === 1`.
  - Clone → calls `duplicateProject`; new project gets name `"{orig} (копия)"` and becomes active.
  - `+ Новый проект` → `createProject("Новый проект")` + `setActiveProject(newId)` + focus the toolbar title for inline-edit.

- **`src/ui/sheet.ts`** — JSON export/import shape change:
  - Export `{ version: 3, appVersion: __APP_VERSION__, activeProjectId, projects: ProjectJson[] }`. `ProjectJson` = `{id, name, done: string[], issue: string[], redListMode, updatedAt}`.
  - Import: validate `version === 3`; on `version === 2` (legacy single-project file) wrap as one project. Confirm dialog "Заменить все проекты?" before applying. Anything else → reject toast.
  - Clear all and Bulk continue to call `setStatus`/`clearAll` — unchanged because they already operate on the active project via the same API.
  - Footer (`v… · sha · date`) unchanged.

- **`src/ui/share-image.ts`** + **`src/ui/share-dialog.ts`** — replace `state.campaign` references with `getActiveProject().name`. Existing logic in `share-image.ts:140`, `:295`, `:300`, `:317` and `share-dialog.ts:16`, `:27`, `:91`, `:133`, `:151` is the only touch needed.

- **`src/main.ts`** — wire dropdown component; replace `ZOOM_KEY = "slobodaZoom/v1"` with `slobodaZoom/v2` and namespace by `activeProjectId`. Subscribe to `activeProjectId` changes → restore zoom for new active.

- **`src/ui/settings.ts`** (or wherever `slobodaSettings/v1` lives) — drop `redListMode`; that field migrates into Project on first run.

- **`src/styles/main.css`** — new styles for `.project-dropdown` (panel, rows, hover, active row, action icons), chevron button beside title, banner radio + select. Respect 640px breakpoint: dropdown is full-width on mobile (overlays sheet area) and anchored panel on desktop.

### Read-only utilities to reuse

- `src/state.ts` pub-sub (`subscribe`, `emit`, `commitLocal`) — keep wholesale, just operate on the new shape.
- `src/url-state.ts` `b64Enc` / `b64Dec` / `idsToBytes` / `bytesToSet` — unchanged.
- `src/ui/sheet.ts:244-277` 2-tap confirm pattern — reuse for project delete.
- `src/ui/sheet.ts:56-62` `parseBulk` — unchanged (operates on active).
- `src/houses.ts` `HOUSES`, `DISABLED_HOUSE_IDS`, `houseIdToLabel`, `labelToHouseId`, `isValidLabel` — fully reused; project model is over the same houses.

### No change

- `src/houses.ts` (the _18/_19 discrepancy is tracked separately).
- `scripts/generate-houses.ts`.
- `vite.config.ts` version injection.
- `.github/workflows/deploy.yml`.

## Build sequence (suggested)

1. Project ID + new types in `state.ts`; keep export shape compatible behind a feature flag while wiring up tests.
2. Migration code + unit smoke (manual: load with old v2 in localStorage, verify v3 written, v2 removed).
3. Multi-project mutators (`createProject`, `duplicate`, `delete`, `setActive`, `rename`).
4. Refactor `setStatus`/`clearAll`/etc. to operate on active project.
5. Update `url-state.ts` (v2 byte + accept v1).
6. Update `share-image.ts` / `share-dialog.ts` to use `getActiveProject().name`.
7. Update `sheet.ts` JSON shape + replace-all import flow.
8. Per-project zoom: `slobodaZoom/v2` keyed by id; subscribe in `main.ts`.
9. Build dropdown component in `title.ts`; wire create/rename/clone/delete.
10. Banner: extend with radio + select; default-selection logic.
11. CSS for dropdown / banner.
12. `npm run typecheck` clean, manual verification (below).

## Verification

```bash
npm run typecheck
npm run build
npm run preview
```

**Manual (golden path):**
1. Pre-populate `slobodaState/v2` in DevTools (or use existing data) → reload preview → confirm:
   - Old campaign now appears as the only project, name preserved.
   - `slobodaState/v2` removed; `slobodaState/v3` present.
   - `slobodaZoom/v2` written under that project's id.
2. Open dropdown → `+ Новый проект` → focus jumps to toolbar title with "Новый проект" selected → type "Обход 2" → Enter → see new active project, map empty (0/68).
3. Mark some houses → switch back to first project via dropdown → verify done/issue intact and untouched.
4. Pan/zoom on project A, switch to B, switch back → A's view restored.
5. Share → confirm `#s=2.…` link in clipboard contains active project name only (decode mentally: 5 parts).
6. Open the link in another browser/profile (or after clearing localStorage) → banner shows project name + age, default = "Создать новый" if no name match → Apply → new project added.
7. Open same link again on first profile → banner default flips to "Перезаписать [matching project]" → Apply → that project replaced.
8. Export JSON → file shape `{version:3, projects:[…], activeProjectId, appVersion}`.
9. Import JSON → confirm dialog "Заменить все проекты?" → Yes → state replaced.
10. Try to delete last project → button disabled / 2-tap confirm refused.
11. Clone project → new entry "X (копия)" appears, becomes active.
12. Try to create 21st project → toast "Лимит 20 проектов".
13. Theme toggle → persists across all projects (still global).
14. PNG share → title in image = active project's name.
15. Bulk input → applies to active only; switch projects → snapshot textareas reflect each project independently.

**Regression checks** (must still pass):
- Single click house cycle: none → done → issue → none.
- Ctrl/Meta+click → force issue.
- `isValidLabel("10/2")` regex still passes.
- Sheet/sidebar layout swap at 640 px.
- Footer version still shows `vX.Y.Z · sha · date`.
- Watermark on PNG still includes `__APP_VERSION__`.

## Risks / Notes

- **localStorage 5 MB**: 20 projects × ~5 KB each = trivial. Not a concern.
- **URL length**: unchanged (still encodes one project). Hash stays well under any platform limit.
- **Feature parity on legacy share links**: kept by accepting `v=1` in decoder.
- **Backward-compat of JSON imports**: `version=2` files (current export shape) still importable as a single migrated project.
- **Banner UX complexity**: only place where the user sees the multi-project model on import. Worth testing on real Android Chrome.
- **`title.ts` is the largest UI delta**: contains both inline-edit AND the new dropdown — keep concerns separated by extracting `src/ui/project-dropdown.ts` if `title.ts` grows past ~150 lines.
