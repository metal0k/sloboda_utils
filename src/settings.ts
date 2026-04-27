// Settings store — local-only preferences (never synced via URL or JSON).
// Keeps only global settings; per-project settings (redListMode) live in state.ts.

export type ThemeChoice = "auto" | "light" | "dark";

export type Settings = {
  readonly theme: ThemeChoice;
};

type MutableSettings = {
  theme: ThemeChoice;
};

type Listener = (s: Settings) => void;

const STORAGE_KEY = "slobodaSettings/v1";

function defaultSettings(): MutableSettings {
  return { theme: "auto" };
}

function isThemeChoice(v: unknown): v is ThemeChoice {
  return v === "auto" || v === "light" || v === "dark";
}

function readPersisted(): { theme?: unknown } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as { theme?: unknown };
  } catch {
    return null;
  }
}

function writePersisted(s: MutableSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: s.theme }));
  } catch {
    // Quota exceeded / private mode — silently swallow.
  }
}

// ---- Singleton store ----

let current: MutableSettings = defaultSettings();
const listeners = new Set<Listener>();

function emit(): void {
  for (const fn of listeners) fn(current);
}

export function initSettings(): void {
  const persisted = readPersisted();
  current = defaultSettings();
  if (persisted && isThemeChoice(persisted.theme)) {
    current.theme = persisted.theme;
  }
}

export function getSettings(): Settings {
  return current;
}

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
