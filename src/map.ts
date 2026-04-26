// Wires SVG elements to the state store: click cycles status,
// store changes re-paint via CSS classes on both text and chip circles.

import { DISABLED_HOUSE_IDS, HOUSES } from "./houses";
import { cycleStatus, getState, setStatus, subscribe } from "./state";
import { initChips } from "./ui/chips";
import type { ChipMap } from "./ui/chips";

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

function paint(texts: HouseTexts, chips: ChipMap): void {
  const { done, issue } = getState();
  for (const [id, el] of texts) {
    const isDone = done.has(id);
    const isIssue = issue.has(id);
    el.classList.toggle(CLASS_DONE, isDone);
    el.classList.toggle(CLASS_ISSUE, isIssue);
    const chip = chips.get(id);
    if (chip) {
      chip.classList.toggle(CLASS_DONE, isDone);
      chip.classList.toggle(CLASS_ISSUE, isIssue);
    }
  }
}

/**
 * Initialise click handling and re-render hooks for the given SVG.
 * Returns an unsubscribe function.
 */
export function initMap(svg: SVGElement): () => void {
  const texts = collectHouseTexts(svg);

  // Mark disabled house text elements once.
  for (const id of DISABLED_HOUSE_IDS) {
    const el = texts.get(id);
    if (el) el.classList.add(CLASS_DISABLED);
  }

  // Insert chip circles (dark bg behind each house number).
  const chips = initChips(
    svg,
    HOUSES.map((h) => h.id),
    DISABLED_HOUSE_IDS,
  );

  // Click delegation: handle both chip (<circle data-house-id>) and text clicks.
  svg.addEventListener("click", (e) => {
    const target = e.target as Element | null;
    if (!target) return;

    let id: string | null = null;
    const chipEl = target.closest<SVGCircleElement>("circle[data-house-id]");
    if (chipEl) {
      id = chipEl.getAttribute("data-house-id");
    } else {
      const textEl = target.closest<SVGTextElement>("text[id]");
      if (textEl) id = textEl.id || null;
    }

    if (!id) return;
    if (DISABLED_HOUSE_IDS.has(id)) return;
    if (!texts.has(id)) return;

    if (e.ctrlKey || e.metaKey) {
      setStatus(id, "issue");
    } else {
      cycleStatus(id);
    }
  });

  const unsubscribe = subscribe(() => paint(texts, chips));
  paint(texts, chips);
  return unsubscribe;
}
