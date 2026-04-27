// Project-switcher dropdown rendered as a fixed panel below the toolbar.
// Opened and closed by title.ts (chevron button).

import {
  listProjects,
  createProject,
  deleteProject,
  duplicateProject,
  setActiveProject,
  renameProject,
  getActiveProject,
  subscribe,
  type Project,
  type ProjectId,
} from "../state";
import { showToast } from "./sheet";

export function initProjectDropdown(
  anchor: HTMLElement,
  callbacks: { onClose: () => void; onNewProject: () => void },
): { open(): void; close(): void; isOpen(): boolean } {
  let panel: HTMLElement | null = null;
  let isOpen = false;
  let unsub: (() => void) | null = null;

  const close = () => {
    if (!isOpen) return;
    isOpen = false;
    panel?.remove();
    panel = null;
    unsub?.();
    unsub = null;
    callbacks.onClose();
  };

  const open = () => {
    if (isOpen) return;
    isOpen = true;
    panel = buildPanel(close, callbacks.onNewProject);
    document.body.appendChild(panel);

    const toolbar = anchor.closest(".toolbar") ?? anchor;
    panel.style.top = `${toolbar.getBoundingClientRect().bottom}px`;

    unsub = subscribe(() => {
      if (!panel) return;
      // Skip rebuild while the user is typing in a rename input.
      if (panel.contains(document.activeElement) && (document.activeElement as HTMLElement).tagName === "INPUT") return;
      // Skip rebuild while a delete confirm is armed (would silently cancel the 2-tap flow).
      if (panel.querySelector(".project-dropdown__action--confirm")) return;
      rebuildRows(panel, close, callbacks.onNewProject);
    });
  };

  return {
    open,
    close,
    isOpen: () => isOpen,
  };
}

// ---------------------------------------------------------------------------
// Panel construction
// ---------------------------------------------------------------------------

function buildPanel(close: () => void, onNewProject: () => void): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "project-dropdown";
  rebuildRows(panel, close, onNewProject);
  return panel;
}

function rebuildRows(panel: HTMLElement, close: () => void, onNewProject: () => void): void {
  panel.replaceChildren();
  const projects = listProjects();
  const activeId = getActiveProject().id;
  const isOnly = projects.length === 1;

  for (const p of projects) {
    panel.appendChild(buildRow(p, activeId, isOnly, close));
  }

  const divider = document.createElement("div");
  divider.className = "project-dropdown__divider";
  panel.appendChild(divider);

  const addBtn = document.createElement("button");
  addBtn.className = "project-dropdown__add";
  const addIcon = document.createElement("span");
  addIcon.className = "material-symbols-outlined";
  addIcon.setAttribute("aria-hidden", "true");
  addIcon.textContent = "add";
  const addLabel = document.createElement("span");
  addLabel.textContent = "Новый проект";
  addBtn.append(addIcon, addLabel);

  addBtn.addEventListener("click", () => {
    const id = createProject("Новый проект");
    if (!id) {
      showToast("Лимит 20 проектов");
      return;
    }
    close();
    requestAnimationFrame(onNewProject);
  });

  panel.appendChild(addBtn);
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function buildRow(
  p: Project,
  activeId: ProjectId,
  isOnly: boolean,
  close: () => void,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "project-dropdown__row" + (p.id === activeId ? " project-dropdown__row--active" : "");
  row.dataset.id = p.id;

  const check = document.createElement("span");
  check.className = "project-dropdown__check material-symbols-outlined";
  check.setAttribute("aria-hidden", "true");
  check.textContent = p.id === activeId ? "check" : "";

  const nameEl = document.createElement("span");
  nameEl.className = "project-dropdown__name";
  nameEl.textContent = p.name;
  if (p.id !== activeId) {
    nameEl.addEventListener("click", () => {
      setActiveProject(p.id);
      close();
    });
  }

  const actionsWrap = document.createElement("div");
  actionsWrap.className = "project-dropdown__actions";

  // --- Rename ---
  const renameBtn = iconBtn("edit", "Переименовать");
  renameBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    startInlineRename(row, nameEl, p.id);
  });

  // --- Clone ---
  const cloneBtn = iconBtn("content_copy", "Дублировать");
  cloneBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const newId = duplicateProject(p.id);
    if (!newId) showToast("Лимит 20 проектов");
    else close();
  });

  // --- Delete (2-tap confirm) ---
  const deleteBtn = iconBtn("delete", "Удалить");
  deleteBtn.classList.add("project-dropdown__action--danger");
  if (isOnly) {
    deleteBtn.disabled = true;
    deleteBtn.setAttribute("aria-label", "Нельзя удалить последний проект");
  }

  let deleteArmed = false;
  let deleteTimer = 0;

  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (deleteArmed) {
      clearTimeout(deleteTimer);
      try {
        deleteProject(p.id);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Ошибка");
      }
      return;
    }
    deleteArmed = true;
    deleteBtn.classList.add("project-dropdown__action--confirm");
    deleteBtn.querySelector(".material-symbols-outlined")!.textContent = "delete_forever";
    deleteTimer = window.setTimeout(() => {
      deleteArmed = false;
      deleteBtn.classList.remove("project-dropdown__action--confirm");
      deleteBtn.querySelector(".material-symbols-outlined")!.textContent = "delete";
    }, 3000);
  });

  actionsWrap.append(renameBtn, cloneBtn, deleteBtn);
  row.append(check, nameEl, actionsWrap);
  return row;
}

function iconBtn(icon: string, label: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "project-dropdown__action";
  btn.setAttribute("aria-label", label);
  const span = document.createElement("span");
  span.className = "material-symbols-outlined";
  span.setAttribute("aria-hidden", "true");
  span.textContent = icon;
  btn.appendChild(span);
  return btn;
}

// ---------------------------------------------------------------------------
// Inline rename
// ---------------------------------------------------------------------------

function startInlineRename(row: HTMLElement, nameEl: HTMLSpanElement, id: ProjectId): void {
  if (row.querySelector(".project-dropdown__rename-input")) return;

  const snapshot = nameEl.textContent ?? "";

  const input = document.createElement("input");
  input.className = "project-dropdown__rename-input";
  input.type = "text";
  input.value = snapshot;

  nameEl.replaceWith(input);
  input.focus();
  input.select();

  let committed = false;

  const commit = () => {
    if (committed) return;
    committed = true;
    const next = input.value.trim();
    if (next.length > 0 && next !== snapshot) {
      renameProject(id, next);
      // renameProject triggers emit → subscriber rebuilds the panel with new name.
    } else {
      // No change — restore the span manually.
      input.replaceWith(nameEl);
    }
  };

  input.addEventListener("blur", commit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      input.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      committed = true; // skip commit on upcoming blur
      input.removeEventListener("blur", commit);
      input.replaceWith(nameEl);
    }
  });
}
