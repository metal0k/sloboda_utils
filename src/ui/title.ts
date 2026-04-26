// Editable campaign title. Click → edit; Enter or blur commits; Escape cancels.
// Phase 3 will swap this for a proper styled input.

import { getState, setCampaign, subscribe } from "../state";

export function initTitle(host: HTMLElement): void {
  host.classList.add("campaign-title");
  host.setAttribute("contenteditable", "plaintext-only");
  host.setAttribute("spellcheck", "false");
  host.setAttribute("role", "textbox");
  host.setAttribute("aria-label", "Название кампании");

  let editing = false;
  let snapshot = "";

  const render = (): void => {
    if (editing) return;
    host.textContent = getState().campaign;
  };

  host.addEventListener("focus", () => {
    editing = true;
    snapshot = host.textContent ?? "";
  });

  host.addEventListener("blur", () => {
    editing = false;
    const next = (host.textContent ?? "").trim();
    if (next.length === 0) {
      // Empty input: revert to whatever's in state.
      render();
      return;
    }
    setCampaign(next);
    render();
  });

  host.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      host.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      host.textContent = snapshot;
      host.blur();
    }
  });

  subscribe(render);
  render();
}
