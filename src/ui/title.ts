// Toolbar title: active project name (inline-editable) + chevron to open
// the project-switcher dropdown.

import { getActiveProject, setProjectName, subscribe } from "../state";
import { initProjectDropdown } from "./project-dropdown";

export function initTitle(host: HTMLElement): void {
  // Inline-editable name for the active project.
  const nameSpan = document.createElement("span");
  nameSpan.className = "toolbar__name";
  nameSpan.setAttribute("contenteditable", "plaintext-only");
  nameSpan.setAttribute("spellcheck", "false");
  nameSpan.setAttribute("role", "textbox");
  nameSpan.setAttribute("aria-label", "Название проекта");

  // Chevron button — toggles the project dropdown.
  const chevronBtn = document.createElement("button");
  chevronBtn.className = "toolbar__chevron btn-icon";
  chevronBtn.setAttribute("aria-label", "Переключить проект");
  const chevronIcon = document.createElement("span");
  chevronIcon.className = "material-symbols-outlined";
  chevronIcon.setAttribute("aria-hidden", "true");
  chevronIcon.textContent = "expand_more";
  chevronBtn.appendChild(chevronIcon);

  host.append(nameSpan, chevronBtn);

  // --- Inline rename ---
  let editing = false;
  let snapshot = "";

  nameSpan.addEventListener("focus", () => {
    editing = true;
    snapshot = nameSpan.textContent ?? "";
  });

  nameSpan.addEventListener("blur", () => {
    editing = false;
    const next = (nameSpan.textContent ?? "").trim();
    if (next.length === 0) {
      render();
      return;
    }
    setProjectName(next);
    render();
  });

  nameSpan.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      nameSpan.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      nameSpan.textContent = snapshot;
      editing = false;
      nameSpan.blur();
    }
  });

  // --- Dropdown ---
  const dropdown = initProjectDropdown(host, {
    onClose: () => {
      chevronIcon.textContent = "expand_more";
      chevronBtn.classList.remove("toolbar__chevron--open");
    },
    onNewProject: () => {
      nameSpan.focus();
      const range = document.createRange();
      range.selectNodeContents(nameSpan);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    },
  });

  chevronBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (dropdown.isOpen()) {
      dropdown.close();
    } else {
      dropdown.open();
      chevronIcon.textContent = "expand_less";
      chevronBtn.classList.add("toolbar__chevron--open");
    }
  });

  // Close dropdown on outside click — but not on clicks inside the panel itself,
  // which is mounted on document.body and therefore outside `host`.
  document.addEventListener("click", (e) => {
    if (
      dropdown.isOpen() &&
      !host.contains(e.target as Node) &&
      !(e.target as Element).closest(".project-dropdown")
    ) {
      dropdown.close();
    }
  });

  // --- State sync ---
  const render = (): void => {
    if (editing) return;
    nameSpan.textContent = getActiveProject().name;
  };

  subscribe(render);
  render();
}
