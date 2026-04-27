// Stats pill: "<done> / <total> · <pct>%", with issue badge when non-zero.

import { ACTIVE_HOUSE_COUNT } from "../houses";
import { getActiveProject, subscribe } from "../state";

export function initStats(host: HTMLElement): void {
  host.classList.add("stats-pill");
  host.setAttribute("role", "status");
  host.setAttribute("aria-live", "polite");

  const doneEl = document.createElement("span");
  doneEl.className = "stats-pill__done";

  const sepEl = document.createElement("span");
  sepEl.textContent = " / ";
  sepEl.className = "stats-pill__sep";

  const totalEl = document.createElement("span");
  totalEl.className = "stats-pill__total";
  totalEl.textContent = String(ACTIVE_HOUSE_COUNT);

  const dotEl = document.createElement("span");
  dotEl.textContent = " · ";
  dotEl.className = "stats-pill__sep";

  const pctEl = document.createElement("span");
  pctEl.className = "stats-pill__pct";

  const issueEl = document.createElement("span");
  issueEl.className = "stats-pill__issue";

  host.replaceChildren(doneEl, sepEl, totalEl, dotEl, pctEl, issueEl);

  const render = (): void => {
    const { done, issue, redListMode } = getActiveProject();
    const doneCount = done.size;
    const issueCount = redListMode ? issue.size : 0;
    const pct = ACTIVE_HOUSE_COUNT > 0 ? (doneCount / ACTIVE_HOUSE_COUNT) * 100 : 0;

    doneEl.textContent = String(doneCount);
    pctEl.textContent = `${Math.round(pct)}%`;
    host.style.setProperty("--stats-fill", `${pct.toFixed(2)}%`);

    if (issueCount > 0) {
      issueEl.textContent = ` · ${issueCount}⚠`;
      issueEl.hidden = false;
    } else {
      issueEl.textContent = "";
      issueEl.hidden = true;
    }
  };

  subscribe(render);
  render();
}
