// In-memory + localStorage-backed application state.
//
// The store is a tiny pub/sub: mutating helpers update the singleton, persist
// it, and notify subscribers with the new (frozen-ish) state object.

export type HouseStatus = "done" | "issue";

export type State = {
  campaign: string;
  done: Set<string>;
  issue: Set<string>;
  updatedAt: number;
};

type Listener = (state: State) => void;

const STORAGE_KEY = "slobodaState/v2";
const DEFAULT_CAMPAIGN = "Андреевская Слобода";

type Persisted = {
  campaign?: string;
  done?: string[];
  issue?: string[];
  updatedAt?: number;
};

function emptyState(): State {
  return {
    campaign: DEFAULT_CAMPAIGN,
    done: new Set<string>(),
    issue: new Set<string>(),
    updatedAt: 0,
  };
}

function readPersisted(): Persisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Persisted;
  } catch {
    return null;
  }
}

export function loadState(): State {
  const persisted = readPersisted();
  const s = emptyState();
  if (!persisted) return s;
  if (typeof persisted.campaign === "string" && persisted.campaign.length > 0) {
    s.campaign = persisted.campaign;
  }
  if (Array.isArray(persisted.done)) {
    for (const id of persisted.done) {
      if (typeof id === "string") s.done.add(id);
    }
  }
  if (Array.isArray(persisted.issue)) {
    for (const id of persisted.issue) {
      if (typeof id === "string") s.issue.add(id);
    }
  }
  if (typeof persisted.updatedAt === "number") {
    s.updatedAt = persisted.updatedAt;
  }
  return s;
}

export function saveState(s: State): void {
  s.updatedAt = Date.now();
  const payload: Persisted = {
    campaign: s.campaign,
    done: [...s.done],
    issue: [...s.issue],
    updatedAt: s.updatedAt,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota exceeded / private mode — silently swallow; the in-memory
    // state still works for this session.
  }
}

// ---------------- singleton store ----------------

let current: State = emptyState();
const listeners = new Set<Listener>();

function emit(): void {
  for (const fn of listeners) fn(current);
}

/** Initialise the store from localStorage. Call once at startup. */
export function initState(): State {
  current = loadState();
  return current;
}

export function getState(): State {
  return current;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Set (or clear) the status of one house. Passing `null` clears.
 * Any previous status on that house is replaced.
 */
export function setStatus(houseId: string, next: HouseStatus | null): void {
  current.done.delete(houseId);
  current.issue.delete(houseId);
  if (next === "done") current.done.add(houseId);
  else if (next === "issue") current.issue.add(houseId);
  saveState(current);
  emit();
}

/** Get the current status of a house, or `null` if neither set. */
export function getStatus(houseId: string): HouseStatus | null {
  if (current.done.has(houseId)) return "done";
  if (current.issue.has(houseId)) return "issue";
  return null;
}

export function setCampaign(name: string): void {
  const trimmed = name.trim();
  if (trimmed.length === 0) return;
  if (trimmed === current.campaign) return;
  current.campaign = trimmed;
  saveState(current);
  emit();
}

export function clearAll(): void {
  current.done.clear();
  current.issue.clear();
  saveState(current);
  emit();
}

/** Cycle empty → done → issue → empty. */
export function cycleStatus(houseId: string): void {
  const s = getStatus(houseId);
  if (s === null) setStatus(houseId, "done");
  else if (s === "done") setStatus(houseId, "issue");
  else setStatus(houseId, null);
}
