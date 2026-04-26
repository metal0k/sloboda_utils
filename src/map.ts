// Wires SVG <text> elements to the state store: click cycles status,
// store changes re-paint via CSS classes.

import { DISABLED_HOUSE_IDS, HOUSES } from "./houses";
import { cycleStatus, getState, setStatus, subscribe } from "./state";

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

// Minimal CSS escape for our id format (always starts with `_` followed by
// digits/underscores). Avoids needing CSS.escape polyfills.
function cssEscape(id: string): string {
  return id.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}

function paint(texts: HouseTexts): void {
  const { done, issue } = getState();
  for (const [id, el] of texts) {
    const isDone = done.has(id);
    const isIssue = issue.has(id);
    el.classList.toggle(CLASS_DONE, isDone);
    el.classList.toggle(CLASS_ISSUE, isIssue);
  }
}

/**
 * Initialise click handling and re-render hooks for the given SVG.
 * Returns an unsubscribe function (mostly useful in tests).
 */
export function initMap(svg: SVGElement): () => void {
  const texts = collectHouseTexts(svg);

  // Mark disabled houses once — they never change.
  for (const id of DISABLED_HOUSE_IDS) {
    const el = texts.get(id);
    if (el) el.classList.add(CLASS_DISABLED);
  }

  // Click handling. We listen on the SVG (delegated) so that pan/zoom
  // transforms on ancestors don't interfere with hit detection.
  svg.addEventListener("click", (e) => {
    const target = e.target as Element | null;
    if (!target) return;
    const textEl = target.closest<SVGTextElement>("text");
    if (!textEl) return;
    const id = textEl.id;
    if (!id) return;
    if (DISABLED_HOUSE_IDS.has(id)) return;
    if (!texts.has(id)) return;

    if (e.ctrlKey || e.metaKey) {
      // Power-user shortcut: jump straight to "issue".
      setStatus(id, "issue");
    } else {
      cycleStatus(id);
    }
  });

  const unsubscribe = subscribe(() => paint(texts));
  paint(texts);
  return unsubscribe;
}
