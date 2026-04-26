// Wires SVG <text> elements to the state store: click cycles status,
// store changes re-paint via CSS classes.

import { DISABLED_HOUSE_IDS, HOUSES } from "./houses";
import { cycleStatus, getState, getStatus, setStatus, subscribe } from "./state";
import { getSettings } from "./settings";

const CLASS_DONE = "is-done";
const CLASS_ISSUE = "is-issue";
const CLASS_DISABLED = "is-disabled";

type HouseTexts = Map<string, SVGTextElement>;

function collectHouseTexts(svg: SVGElement): HouseTexts {
  const map: HouseTexts = new Map();
  for (const house of HOUSES) {
    const el = svg.querySelector<SVGTextElement>(`#${cssEscape(house.id)}`);
    if (el) map.set(house.id, el);
  }
  return map;
}

function cssEscape(id: string): string {
  return id.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}

function paint(texts: HouseTexts): void {
  const { done, issue } = getState();
  for (const [id, el] of texts) {
    el.classList.toggle(CLASS_DONE, done.has(id));
    el.classList.toggle(CLASS_ISSUE, issue.has(id));
  }
}

/** Initialise click handling and re-render hooks for the given SVG. */
export function initMap(svg: SVGElement): () => void {
  const texts = collectHouseTexts(svg);

  for (const id of DISABLED_HOUSE_IDS) {
    const el = texts.get(id);
    if (el) el.classList.add(CLASS_DISABLED);
  }

  svg.addEventListener("click", (e) => {
    const target = e.target as Element | null;
    if (!target) return;
    const textEl = target.closest<SVGTextElement>("text[id]");
    if (!textEl) return;
    const id = textEl.id;
    if (!id || DISABLED_HOUSE_IDS.has(id) || !texts.has(id)) return;

    const { redListMode } = getSettings();
    if (redListMode) {
      // Full cycle none→done→issue→none; Ctrl/Meta = shortcut to issue
      if (e.ctrlKey || e.metaKey) setStatus(id, "issue");
      else cycleStatus(id);
    } else {
      // Simple toggle none↔done; Ctrl ignored
      setStatus(id, getStatus(id) === "done" ? null : "done");
    }
  });

  const unsubscribe = subscribe(() => paint(texts));
  paint(texts);
  return unsubscribe;
}
