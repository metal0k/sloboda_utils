// Plain stats pill: "<done>/<total> · <pct>%". No design polish — Phase 3
// will redesign the visual layer.

import { ACTIVE_HOUSE_COUNT } from "../houses";
import { getState, subscribe } from "../state";

export function initStats(host: HTMLElement): void {
  host.classList.add("stats-pill");
  host.setAttribute("role", "status");
  host.setAttribute("aria-live", "polite");

  const doneEl = document.createElement("span");
  doneEl.className = "stats-pill__done";

  const sepEl = document.createElement("span");
  sepEl.textContent = " / ";

  const totalEl = document.createElement("span");
  totalEl.className = "stats-pill__total";
  totalEl.textContent = String(ACTIVE_HOUSE_COUNT);

  const dotEl = document.createElement("span");
  dotEl.textContent = " · ";

  const pctEl = document.createElement("span");
  pctEl.className = "stats-pill__pct";

  host.replaceChildren(doneEl, sepEl, totalEl, dotEl, pctEl);

  const render = (): void => {
    const { done } = getState();
    const count = done.size;
    const pct = ACTIVE_HOUSE_COUNT > 0 ? (count / ACTIVE_HOUSE_COUNT) * 100 : 0;
    doneEl.textContent = String(count);
    pctEl.textContent = `${pct.toFixed(1)}%`;
    host.style.setProperty("--stats-fill", `${pct.toFixed(2)}%`);
  };

  subscribe(render);
  render();
}
