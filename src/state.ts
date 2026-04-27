// In-memory + localStorage-backed application state.
//
// Multi-project model: one app holds up to 20 projects (campaigns) on the same
// map. The active project is the one currently shown; switching changes
// activeProjectId without touching other projects.

export type HouseStatus = "done" | "issue";
export type HouseId = string;
export type ProjectId = string; // 8-char base36 random

export type Project = {
  readonly id: ProjectId;
  readonly name: string;
  readonly done: ReadonlySet<HouseId>;
  readonly issue: ReadonlySet<HouseId>;
  readonly redListMode: boolean;
  readonly updatedAt: number;
};

export type State = {
  readonly projects: ReadonlyArray<Project>;
  readonly activeProjectId: ProjectId;
};

// Lightweight URL-share snapshot (single project, no id).
export type SharedSnapshot = {
  readonly name: string;
  readonly done: ReadonlySet<HouseId>;
  readonly issue: ReadonlySet<HouseId>;
  readonly updatedAt: number;
};

// ---- Internal mutable shapes ----

type MutableProject = {
  id: ProjectId;
  name: string;
  done: Set<HouseId>;
  issue: Set<HouseId>;
  redListMode: boolean;
  updatedAt: number;
};

type MutableState = {
  projects: MutableProject[];
  activeProjectId: ProjectId;
};

type Listener = (state: State) => void;

const STORAGE_KEY_V3 = "slobodaState/v3";
const STORAGE_KEY_V2 = "slobodaState/v2";
const DEFAULT_NAME = "Андреевская Слобода";
const MAX_PROJECTS = 20;

// ---- Project ID generator ----

export function newProjectId(): ProjectId {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 8);
}

// ---- Persisted shapes ----

type PersistedProject = {
  id: string;
  name: string;
  done: string[];
  issue: string[];
  redListMode: boolean;
  updatedAt: number;
};

type PersistedV3 = {
  version: 3;
  projects: PersistedProject[];
  activeProjectId: string;
};

// ---- Deserialisation helpers ----

function loadProject(raw: PersistedProject): MutableProject {
  return {
    id: typeof raw.id === "string" && raw.id.length > 0 ? raw.id : newProjectId(),
    name: typeof raw.name === "string" && raw.name.trim().length > 0
      ? raw.name.trim()
      : DEFAULT_NAME,
    done: new Set(Array.isArray(raw.done) ? raw.done.filter((v) => typeof v === "string") : []),
    issue: new Set(Array.isArray(raw.issue) ? raw.issue.filter((v) => typeof v === "string") : []),
    redListMode: typeof raw.redListMode === "boolean" ? raw.redListMode : false,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
  };
}

function readV3(): MutableState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V3);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedV3;
    if (!parsed || parsed.version !== 3 || !Array.isArray(parsed.projects) || parsed.projects.length === 0) {
      return null;
    }
    const projects = parsed.projects.map(loadProject);
    const activeId = parsed.activeProjectId;
    const validActive = projects.find((p) => p.id === activeId) ? activeId : projects[0].id;
    return { projects, activeProjectId: validActive };
  } catch {
    return null;
  }
}

// One-shot migration from the old single-campaign slobodaState/v2.
function tryMigrateV2(): MutableState | null {
  try {
    const v2Raw = localStorage.getItem(STORAGE_KEY_V2);
    if (!v2Raw) return null;

    const v2 = JSON.parse(v2Raw) as {
      campaign?: unknown;
      done?: unknown;
      issue?: unknown;
      updatedAt?: unknown;
    };

    // Lift redListMode out of settings (it becomes per-project).
    let redListMode = false;
    try {
      const settingsRaw = localStorage.getItem("slobodaSettings/v1");
      if (settingsRaw) {
        const settings = JSON.parse(settingsRaw) as { redListMode?: unknown; [k: string]: unknown };
        if (typeof settings.redListMode === "boolean") redListMode = settings.redListMode;
        // Remove redListMode from settings; theme stays global.
        delete settings.redListMode;
        localStorage.setItem("slobodaSettings/v1", JSON.stringify(settings));
      }
    } catch { /* ignore */ }

    const id = newProjectId();
    const project: MutableProject = {
      id,
      name: (typeof v2.campaign === "string" && v2.campaign.trim().length > 0)
        ? v2.campaign.trim()
        : DEFAULT_NAME,
      done: new Set(Array.isArray(v2.done) ? (v2.done as unknown[]).filter((s): s is string => typeof s === "string") : []),
      issue: new Set(Array.isArray(v2.issue) ? (v2.issue as unknown[]).filter((s): s is string => typeof s === "string") : []),
      redListMode,
      updatedAt: typeof v2.updatedAt === "number" ? v2.updatedAt : Date.now(),
    };

    const state: MutableState = { projects: [project], activeProjectId: id };
    saveRaw(state);
    localStorage.removeItem(STORAGE_KEY_V2);
    return state;
  } catch {
    return null;
  }
}

function freshState(): MutableState {
  const id = newProjectId();
  return {
    projects: [{
      id,
      name: DEFAULT_NAME,
      done: new Set<HouseId>(),
      issue: new Set<HouseId>(),
      redListMode: false,
      updatedAt: 0,
    }],
    activeProjectId: id,
  };
}

function saveRaw(s: MutableState): void {
  const payload: PersistedV3 = {
    version: 3,
    projects: s.projects.map((p) => ({
      id: p.id,
      name: p.name,
      done: [...p.done],
      issue: [...p.issue],
      redListMode: p.redListMode,
      updatedAt: p.updatedAt,
    })),
    activeProjectId: s.activeProjectId,
  };
  try {
    localStorage.setItem(STORAGE_KEY_V3, JSON.stringify(payload));
  } catch {
    // Quota exceeded / private mode — silently swallow.
  }
}

// ---- Singleton store ----

let current: MutableState = freshState();
const listeners = new Set<Listener>();

function emit(): void {
  for (const fn of listeners) fn(current as State);
}

function ap(): MutableProject {
  const p = current.projects.find((proj) => proj.id === current.activeProjectId);
  if (!p) {
    // Safety: fall back to first project (should never happen in practice).
    return current.projects[0];
  }
  return p;
}

function commit(): void {
  ap().updatedAt = Date.now();
  saveRaw(current);
  emit();
}

// ---- Public API ----

/** Initialise the store from localStorage. Call once at startup. */
export function initState(): State {
  current = readV3() ?? tryMigrateV2() ?? freshState();
  return current as State;
}

export function getState(): State {
  return current as State;
}

export function getActiveProject(): Project {
  return ap();
}

/** Projects sorted by updatedAt DESC (most recently modified first). */
export function listProjects(): Project[] {
  return [...current.projects].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ---- Status (active project) ----

export function setStatus(houseId: HouseId, next: HouseStatus | null): void {
  const p = ap();
  const inDone = p.done.has(houseId);
  const inIssue = p.issue.has(houseId);
  if (next === null && !inDone && !inIssue) return;
  if (next === "done" && inDone && !inIssue) return;
  if (next === "issue" && inIssue && !inDone) return;
  p.done.delete(houseId);
  p.issue.delete(houseId);
  if (next === "done") p.done.add(houseId);
  else if (next === "issue") p.issue.add(houseId);
  commit();
}

export function getStatus(houseId: HouseId): HouseStatus | null {
  const p = ap();
  if (p.done.has(houseId)) return "done";
  if (p.issue.has(houseId)) return "issue";
  return null;
}

export function cycleStatus(houseId: HouseId): void {
  const s = getStatus(houseId);
  if (s === null) setStatus(houseId, "done");
  else if (s === "done") setStatus(houseId, "issue");
  else setStatus(houseId, null);
}

// ---- Active project name ----

export function setProjectName(name: string): void {
  const trimmed = name.trim();
  if (trimmed.length === 0) return;
  const p = ap();
  if (trimmed === p.name) return;
  p.name = trimmed;
  commit();
}

// ---- Clear (active project) ----

export function clearAll(): void {
  const p = ap();
  if (p.done.size === 0 && p.issue.size === 0) return;
  p.done.clear();
  p.issue.clear();
  commit();
}

export function clearIssue(): void {
  const p = ap();
  if (p.issue.size === 0) return;
  p.issue.clear();
  commit();
}

// ---- Red list mode (active project) ----

export function setRedListMode(on: boolean): void {
  const p = ap();
  if (p.redListMode === on) return;
  p.redListMode = on;
  commit();
}

// ---- Multi-project lifecycle ----

/** Create a new project and make it active. Returns id or null if at the 20-project cap. */
export function createProject(name = "Новый проект"): ProjectId | null {
  if (current.projects.length >= MAX_PROJECTS) return null;
  const id = newProjectId();
  current.projects.push({
    id,
    name: name.trim() || "Новый проект",
    done: new Set<HouseId>(),
    issue: new Set<HouseId>(),
    redListMode: false,
    updatedAt: Date.now(),
  });
  current.activeProjectId = id;
  saveRaw(current);
  emit();
  return id;
}

/** Delete a project. Throws if it is the last project. */
export function deleteProject(id: ProjectId): void {
  if (current.projects.length <= 1) throw new Error("Нельзя удалить последний проект");
  const idx = current.projects.findIndex((p) => p.id === id);
  if (idx === -1) return;
  current.projects.splice(idx, 1);
  if (current.activeProjectId === id) {
    current.activeProjectId = current.projects[Math.min(idx, current.projects.length - 1)].id;
  }
  saveRaw(current);
  emit();
}

/** Duplicate a project and make the clone active. Returns new id or null if at cap. */
export function duplicateProject(id: ProjectId): ProjectId | null {
  if (current.projects.length >= MAX_PROJECTS) return null;
  const src = current.projects.find((p) => p.id === id);
  if (!src) return null;
  const newId = newProjectId();
  current.projects.push({
    id: newId,
    name: `${src.name} (копия)`,
    done: new Set(src.done),
    issue: new Set(src.issue),
    redListMode: src.redListMode,
    updatedAt: Date.now(),
  });
  current.activeProjectId = newId;
  saveRaw(current);
  emit();
  return newId;
}

export function setActiveProject(id: ProjectId): void {
  if (current.activeProjectId === id) return;
  if (!current.projects.find((p) => p.id === id)) return;
  current.activeProjectId = id;
  saveRaw(current);
  emit();
}

export function renameProject(id: ProjectId, name: string): void {
  const trimmed = name.trim();
  if (trimmed.length === 0) return;
  const p = current.projects.find((proj) => proj.id === id);
  if (!p || p.name === trimmed) return;
  p.name = trimmed;
  p.updatedAt = Date.now();
  saveRaw(current);
  emit();
}

// ---- Import / restore ----

type ImportOpts =
  | { mode: "create" }
  | { mode: "overwrite"; targetId: ProjectId };

/** Apply a URL-shared snapshot. Creates a new project or overwrites an existing one. */
export function importSnapshot(snapshot: SharedSnapshot, opts: ImportOpts): ProjectId {
  if (opts.mode === "overwrite") {
    const p = current.projects.find((proj) => proj.id === opts.targetId);
    if (p) {
      p.name = snapshot.name.trim() || p.name;
      p.done = new Set(snapshot.done);
      p.issue = new Set(snapshot.issue);
      p.updatedAt = snapshot.updatedAt;
      current.activeProjectId = p.id;
      saveRaw(current);
      emit();
      return p.id;
    }
  }

  // Create (also fallback if target not found).
  if (current.projects.length >= MAX_PROJECTS) return current.activeProjectId;
  const names = new Set(current.projects.map((p) => p.name));
  let name = snapshot.name.trim() || "Импорт";
  let suffix = 2;
  const base = name;
  while (names.has(name)) name = `${base} (${suffix++})`;

  const id = newProjectId();
  current.projects.push({
    id,
    name,
    done: new Set(snapshot.done),
    issue: new Set(snapshot.issue),
    redListMode: false,
    updatedAt: snapshot.updatedAt,
  });
  current.activeProjectId = id;
  saveRaw(current);
  emit();
  return id;
}

/** Replace all projects (full JSON import). Saves and notifies. */
export function replaceAllProjects(s: State): void {
  const mapped = (s.projects as Project[]).map((p) => ({
    id: p.id,
    name: p.name,
    done: new Set(p.done),
    issue: new Set(p.issue),
    redListMode: p.redListMode,
    updatedAt: p.updatedAt,
  }));
  if (mapped.length === 0) return; // guard: never leave state projectless
  current.projects = mapped;
  current.activeProjectId = s.activeProjectId;
  if (!current.projects.find((p) => p.id === current.activeProjectId)) {
    current.activeProjectId = current.projects[0].id;
  }
  saveRaw(current);
  emit();
}
