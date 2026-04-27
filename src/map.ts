// Wires SVG <text> elements to the state store: click cycles status,
// store changes re-paint via CSS classes.

import { DISABLED_HOUSE_IDS, HOUSES } from "./houses";
import { cycleStatus, getActiveProject, getStatus, setStatus, subscribe } from "./state";
import type { PanZoomController } from "./ui/gestures";

const CLASS_DONE = "is-done";
const CLASS_ISSUE = "is-issue";
const CLASS_DISABLED = "is-disabled";

type HouseTexts = Map<string, SVGTextElement>;

function collectHouseTexts(svg: SVGElement): HouseTexts {
  const map: HouseTexts = new Map();
  const wanted = new Set(HOUSES.map((h) => h.id));
  svg.querySelectorAll<SVGTextElement>("text[id]").forEach((el) => {
    if (wanted.has(el.id)) map.set(el.id, el);
  });
  return map;
}

function paint(texts: HouseTexts): void {
  const { done, issue, redListMode } = getActiveProject();
  for (const [id, el] of texts) {
    el.classList.toggle(CLASS_DONE, done.has(id));
    el.classList.toggle(CLASS_ISSUE, redListMode && issue.has(id));
  }
}

/** Initialise click handling and re-render hooks for the given SVG. */
export function initMap(svg: SVGElement, panZoom: PanZoomController): () => void {
  const texts = collectHouseTexts(svg);

  for (const id of DISABLED_HOUSE_IDS) {
    const el = texts.get(id);
    if (el) el.classList.add(CLASS_DISABLED);
  }

  const DOUBLE_DELAY_MS = 250;
  let pendingClickTimer: number | null = null;

  const clearPendingClick = (): void => {
    if (pendingClickTimer !== null) {
      clearTimeout(pendingClickTimer);
      pendingClickTimer = null;
    }
  };

  svg.addEventListener("click", (e) => {
    const target = e.target as Element | null;
    if (!target) return;
    const textEl = target.closest<SVGTextElement>("text[id]");
    if (!textEl) return;
    const id = textEl.id;
    if (!id || DISABLED_HOUSE_IDS.has(id) || !texts.has(id)) return;

    const isCtrl = e.ctrlKey || e.metaKey;
    clearPendingClick();
    pendingClickTimer = window.setTimeout(() => {
      pendingClickTimer = null;
      const { redListMode } = getActiveProject();
      if (redListMode) {
        if (isCtrl) setStatus(id, "issue");
        else cycleStatus(id);
      } else {
        setStatus(id, getStatus(id) === "done" ? null : "done");
      }
    }, DOUBLE_DELAY_MS);
  });

  svg.addEventListener("dblclick", (e) => {
    clearPendingClick();
    panZoom.toggleZoomAt(e.clientX, e.clientY);
  });

  const unsubscribe = subscribe(() => paint(texts));
  paint(texts);
  return unsubscribe;
}
