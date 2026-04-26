// Settings store — local-only preferences (never synced via URL or JSON).
//
// Mirrors the pub/sub pattern from state.ts but uses a separate localStorage
// key so settings are kept independent of campaign state.

export type ThemeChoice = "auto" | "light" | "dark";

export type Settings = {
  readonly theme: ThemeChoice;
  readonly redListMode: boolean;
};

type MutableSettings = {
  theme: ThemeChoice;
  redListMode: boolean;
};

type Listener = (s: Settings) => void;

const STORAGE_KEY = "slobodaSettings/v1";

type Persisted = {
  theme?: unknown;
  redListMode?: unknown;
};

function defaultSettings(): MutableSettings {
  return { theme: "auto", redListMode: false };
}

function isThemeChoice(v: unknown): v is ThemeChoice {
  return v === "auto" || v === "light" || v === "dark";
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

function writePersisted(s: MutableSettings): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ theme: s.theme, redListMode: s.redListMode }),
    );
  } catch {
    // Quota exceeded / private mode — silently swallow.
  }
}

// ---------------- singleton store ----------------

let current: MutableSettings = defaultSettings();
const listeners = new Set<Listener>();

function emit(): void {
  for (const fn of listeners) fn(current);
}

/** Initialise the store from localStorage. Call once at startup. */
export function initSettings(): void {
  const persisted = readPersisted();
  current = defaultSettings();
  if (!persisted) return;
  if (isThemeChoice(persisted.theme)) {
    current.theme = persisted.theme;
  }
  if (typeof persisted.redListMode === "boolean") {
    current.redListMode = persisted.redListMode;
  }
}

/** Returns the current settings. The object is treated as read-only — do not mutate. */
export function getSettings(): Settings {
  return current;
}

/** Subscribe to settings changes. Returns an unsubscribe function. */
export function subscribeSettings(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setTheme(t: ThemeChoice): void {
  if (current.theme === t) return;
  current.theme = t;
  writePersisted(current);
  emit();
}

export function setRedListMode(on: boolean): void {
  if (current.redListMode === on) return;
  current.redListMode = on;
  writePersisted(current);
  emit();
}
