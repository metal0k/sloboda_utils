// Bottom-sheet (mobile) / sidebar (desktop): Lists, Clear All, Import JSON.
// Share moved to FAB + share-dialog (see fab.ts / share-dialog.ts).

import type { MdSwitch } from "@material/web/switch/switch.js";
import type { MdFilledButton } from "@material/web/button/filled-button.js";

import { isValidLabel, labelToHouseId, houseIdToLabel } from "../houses";
import {
  clearAll,
  getActiveProject,
  getState,
  newProjectId,
  replaceAllProjects,
  setRedListMode,
  setStatus,
  subscribe,
} from "../state";
import type { Project, State } from "../state";

// ---------- toast ----------

export function showToast(msg: string, type: "ok" | "err" = "ok"): void {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("toast--visible"));
  setTimeout(() => {
    el.classList.remove("toast--visible");
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

// ---------- JSON import parsing (v2 and v3) ----------

function parseImportJson(json: string): State | null {
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") return null;

    if (raw["version"] === 3 && Array.isArray(raw["projects"]) && (raw["projects"] as unknown[]).length > 0) {
      const projects = (raw["projects"] as unknown[]).map((item) => {
        const p = item as Record<string, unknown>;
        return {
          id: typeof p["id"] === "string" && p["id"].length > 0 ? p["id"] : newProjectId(),
          name: typeof p["name"] === "string" && (p["name"] as string).trim().length > 0
            ? (p["name"] as string).trim()
            : "Проект",
          done: new Set(Array.isArray(p["done"]) ? (p["done"] as unknown[]).filter((v): v is string => typeof v === "string") : []),
          issue: new Set(Array.isArray(p["issue"]) ? (p["issue"] as unknown[]).filter((v): v is string => typeof v === "string") : []),
          redListMode: typeof p["redListMode"] === "boolean" ? p["redListMode"] : false,
          updatedAt: typeof p["updatedAt"] === "number" ? p["updatedAt"] : Date.now(),
        } as Project;
      });
      const rawActiveId = raw["activeProjectId"];
      const activeProjectId = typeof rawActiveId === "string" && projects.some((p) => p.id === rawActiveId)
        ? rawActiveId
        : projects[0].id;
      return { projects, activeProjectId };
    }

    if (raw["version"] === 2 || (raw["campaign"] !== undefined && !raw["projects"])) {
      // Legacy single-project export
      const id = newProjectId();
      const project: Project = {
        id,
        name: typeof raw["campaign"] === "string" && (raw["campaign"] as string).trim().length > 0
          ? (raw["campaign"] as string).trim()
          : "Импорт",
        done: new Set(Array.isArray(raw["done"]) ? (raw["done"] as unknown[]).filter((v): v is string => typeof v === "string") : []),
        issue: new Set(Array.isArray(raw["issue"]) ? (raw["issue"] as unknown[]).filter((v): v is string => typeof v === "string") : []),
        redListMode: false,
        updatedAt: typeof raw["updatedAt"] === "number" ? raw["updatedAt"] : Date.now(),
      };
      return { projects: [project], activeProjectId: id };
    }

    return null;
  } catch {
    return null;
  }
}

// ---------- bulk input ----------

function parseBulk(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && isValidLabel(t))
    .map(labelToHouseId);
}

// ---------- snapshot helpers ----------

function naturalSort(a: string, b: string): number {
  const parse = (s: string): number => (s.includes("/") ? parseFloat(s) + 0.5 : parseFloat(s));
  return parse(a) - parse(b);
}

function snapshotToText(ids: ReadonlySet<string>): string {
  return [...ids].map(houseIdToLabel).sort(naturalSort).join(", ");
}

function computeDiff(
  textarea: HTMLTextAreaElement,
  currentSet: ReadonlySet<string>,
): { add: string[]; remove: string[] } {
  const newIds = new Set(parseBulk(textarea.value));
  const add = [...newIds].filter((id) => !currentSet.has(id));
  const remove = [...currentSet].filter((id) => !newIds.has(id));
  return { add, remove };
}

// ---------- diff hint rendering ----------

function renderDiffHint(hintEl: HTMLElement, add: string[], remove: string[]): void {
  hintEl.textContent = "";
  if (add.length === 0 && remove.length === 0) return;

  if (add.length > 0) {
    const addSpan = document.createElement("span");
    addSpan.className = "sheet-hint--add";
    addSpan.textContent = `+${add.length}`;
    hintEl.appendChild(addSpan);
  }

  if (add.length > 0 && remove.length > 0) {
    hintEl.appendChild(document.createTextNode(" / "));
  }

  if (remove.length > 0) {
    const removeSpan = document.createElement("span");
    removeSpan.className = "sheet-hint--remove";
    removeSpan.textContent = `−${remove.length}`;
    hintEl.appendChild(removeSpan);
  }
}

// ---------- sheet ----------

export function initSheet(): { open: () => void; close: () => void } {
  const backdrop = document.createElement("div");
  backdrop.className = "sheet-backdrop";

  const panel = document.createElement("div");
  panel.className = "sheet-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Меню");

  // --- drag-handle (mobile only — hidden on desktop via CSS) ---
  const dragHandle = document.createElement("div");
  dragHandle.className = "sheet-drag-handle";

  // --- header ---
  const header = document.createElement("div");
  header.className = "sheet-header";
  const title = document.createElement("span");
  title.className = "sheet-title";
  title.textContent = "Меню";
  const closeBtn = document.createElement("md-icon-button");
  closeBtn.setAttribute("aria-label", "Закрыть");
  closeBtn.innerHTML = `<md-icon>close</md-icon>`;
  header.append(title, closeBtn);

  // --- body ---
  const body = document.createElement("div");
  body.className = "sheet-body";

  function divider(): HTMLElement {
    const d = document.createElement("div");
    d.className = "sheet-divider";
    return d;
  }

  // ===== Зелёный список =====

  const greenLabel = document.createElement("div");
  greenLabel.className = "sheet-section-label";
  greenLabel.textContent = "Зелёный список";

  const greenArea = document.createElement("textarea");
  greenArea.className = "sheet-textarea";
  greenArea.placeholder = "1, 2, 3, 5/2 …";
  greenArea.rows = 3;

  const greenHint = document.createElement("div");
  greenHint.className = "sheet-hint";

  const greenApplyBtn = document.createElement("md-filled-button") as MdFilledButton;
  greenApplyBtn.className = "btn-md-primary";
  greenApplyBtn.textContent = "Применить";
  greenApplyBtn.disabled = true;

  greenArea.addEventListener("input", () => {
    const { add, remove } = computeDiff(greenArea, getActiveProject().done);
    renderDiffHint(greenHint, add, remove);
    greenApplyBtn.disabled = add.length === 0 && remove.length === 0;
  });

  greenApplyBtn.addEventListener("click", () => {
    const { add, remove } = computeDiff(greenArea, getActiveProject().done);
    for (const id of add) setStatus(id, "done");
    for (const id of remove) {
      if (getActiveProject().done.has(id)) setStatus(id, null);
    }
    showToast("Зелёный список обновлён");
    close();
  });

  // ===== Красный список =====

  const redToggleRow = document.createElement("div");
  redToggleRow.className = "sheet-toggle-row";

  const redSwitch = document.createElement("md-switch") as MdSwitch;
  redSwitch.id = "sheet-red-toggle";

  const redToggleLabel = document.createElement("label");
  redToggleLabel.htmlFor = "sheet-red-toggle";
  redToggleLabel.textContent = "Красный список";

  redToggleRow.append(redSwitch, redToggleLabel);

  const redSection = document.createElement("div");
  redSection.style.display = "flex";
  redSection.style.flexDirection = "column";
  redSection.style.gap = "8px";

  const redArea = document.createElement("textarea");
  redArea.className = "sheet-textarea";
  redArea.placeholder = "1, 2, 3, 5/2 …";
  redArea.rows = 3;

  const redHint = document.createElement("div");
  redHint.className = "sheet-hint";

  const redApplyBtn = document.createElement("md-filled-button") as MdFilledButton;
  redApplyBtn.className = "btn-md-error";
  redApplyBtn.textContent = "Применить";
  redApplyBtn.disabled = true;

  redArea.addEventListener("input", () => {
    const { add, remove } = computeDiff(redArea, getActiveProject().issue);
    renderDiffHint(redHint, add, remove);
    redApplyBtn.disabled = add.length === 0 && remove.length === 0;
  });

  redApplyBtn.addEventListener("click", () => {
    const { add, remove } = computeDiff(redArea, getActiveProject().issue);
    for (const id of add) setStatus(id, "issue");
    for (const id of remove) {
      if (getActiveProject().issue.has(id)) setStatus(id, null);
    }
    showToast("Красный список обновлён");
    close();
  });

  redSection.append(redArea, redHint, redApplyBtn);

  function syncRedSection(): void {
    const on = getActiveProject().redListMode;
    redSection.hidden = !on;
    redSwitch.selected = on;
  }

  redSwitch.addEventListener("change", () => {
    const on = redSwitch.selected;
    setRedListMode(on);
    if (!on) showToast("Красный список скрыт");
  });

  // ===== Очистить всё =====

  const clearBtn = document.createElement("md-text-button");
  clearBtn.style.cssText = `
    --md-text-button-label-text-color: var(--md-sys-color-error);
    --md-text-button-hover-label-text-color: var(--md-sys-color-error);
    --md-text-button-pressed-label-text-color: var(--md-sys-color-error);
    width: 100%;
  `;
  clearBtn.textContent = "Очистить всё";

  let clearTimer: ReturnType<typeof setTimeout> | null = null;

  clearBtn.addEventListener("click", () => {
    if (clearBtn.dataset["confirm"]) {
      clearAll();
      showToast("Состояние очищено");
      resetClear();
      close();
    } else {
      clearBtn.textContent = "Нажмите ещё раз для подтверждения";
      clearBtn.dataset["confirm"] = "1";
      clearTimer = setTimeout(resetClear, 3500);
    }
  });

  function resetClear(): void {
    clearBtn.textContent = "Очистить всё";
    delete clearBtn.dataset["confirm"];
    if (clearTimer) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }
  }

  // ===== Импорт JSON =====

  // Pending parsed state waiting for confirmation.
  let pendingImport: State | null = null;

  const importBtn = document.createElement("md-outlined-button");
  importBtn.style.width = "100%";
  importBtn.textContent = "Импорт из JSON";

  const importConfirmRow = document.createElement("div");
  importConfirmRow.className = "sheet-import-confirm";
  importConfirmRow.hidden = true;

  const importConfirmText = document.createElement("span");
  importConfirmText.className = "sheet-import-confirm__text";

  const importConfirmYes = document.createElement("md-filled-button") as MdFilledButton;
  importConfirmYes.className = "btn-md-primary";
  importConfirmYes.textContent = "Заменить всё";

  const importConfirmNo = document.createElement("md-text-button");
  importConfirmNo.textContent = "Отмена";

  importConfirmRow.append(importConfirmText, importConfirmYes, importConfirmNo);

  importConfirmYes.addEventListener("click", () => {
    if (!pendingImport) return;
    replaceAllProjects(pendingImport);
    pendingImport = null;
    importConfirmRow.hidden = true;
    importBtn.hidden = false;
    showToast("Состояние импортировано");
    close();
  });

  importConfirmNo.addEventListener("click", () => {
    pendingImport = null;
    importConfirmRow.hidden = true;
    importBtn.hidden = false;
  });

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".json,application/json";
  fileInput.style.display = "none";

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const importData = parseImportJson(reader.result as string);
      if (!importData) {
        showToast("Не удалось прочитать файл", "err");
        return;
      }
      const n = importData.projects.length;
      importConfirmText.textContent = `Заменить все проекты? Будет загружено: ${n} проект(ов).`;
      pendingImport = importData;
      importBtn.hidden = true;
      importConfirmRow.hidden = false;
    };
    reader.readAsText(file);
    fileInput.value = "";
  });

  importBtn.addEventListener("click", () => fileInput.click());

  // ===== Assemble body =====

  const versionRow = document.createElement("div");
  versionRow.className = "sheet-version";
  const sha = __APP_VERSION__.match(/-g([0-9a-f]+)/)?.[1] ?? "";
  const baseTag = __APP_VERSION__.split("-")[0];
  versionRow.textContent = sha
    ? `${baseTag} · ${sha} · ${__BUILD_DATE__}`
    : `${__APP_VERSION__} · ${__BUILD_DATE__}`;

  body.append(
    greenLabel,
    greenArea,
    greenHint,
    greenApplyBtn,
    divider(),
    redToggleRow,
    redSection,
    divider(),
    clearBtn,
    divider(),
    importBtn,
    importConfirmRow,
    fileInput,
    versionRow,
  );

  panel.append(dragHandle, header, body);
  document.body.append(backdrop, panel);

  // ===== Swipe-to-close (mobile drag handle) =====

  let dragStartY = 0;
  let dragging = false;

  dragHandle.addEventListener("pointerdown", (e) => {
    if (window.innerWidth >= 640) return;
    dragStartY = e.clientY;
    dragging = true;
    panel.style.transition = "none";
    dragHandle.setPointerCapture(e.pointerId);
  });

  dragHandle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dy = Math.max(0, e.clientY - dragStartY);
    panel.style.transform = `translateY(${dy}px)`;
  });

  const endDrag = (e: PointerEvent, commit: boolean): void => {
    if (!dragging) return;
    dragging = false;
    panel.style.transition = "";
    if (commit) {
      const dy = Math.max(0, e.clientY - dragStartY);
      if (dy > 80) {
        close();
        return;
      }
    }
    panel.style.transform = "";
  };

  dragHandle.addEventListener("pointerup", (e) => endDrag(e, true));
  dragHandle.addEventListener("pointercancel", (e) => endDrag(e, false));

  // ===== Subscriptions =====

  let unsubState: (() => void) | null = null;
  let keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  function refreshSnapshots(): void {
    const project = getActiveProject();
    greenArea.value = snapshotToText(project.done);
    greenHint.textContent = "";
    greenApplyBtn.disabled = true;

    if (!redSection.hidden) {
      redArea.value = snapshotToText(project.issue);
      redHint.textContent = "";
      redApplyBtn.disabled = true;
    }
  }

  function close(): void {
    panel.classList.remove("is-open");
    backdrop.classList.remove("is-open");
    panel.style.transform = "";
    resetClear();
    // Reset pending import if sheet is closed without confirming.
    pendingImport = null;
    importConfirmRow.hidden = true;
    importBtn.hidden = false;
    if (unsubState) { unsubState(); unsubState = null; }
    if (keydownHandler) { document.removeEventListener("keydown", keydownHandler); keydownHandler = null; }
  }

  function open(): void {
    syncRedSection();
    refreshSnapshots();

    unsubState = subscribe(() => {
      syncRedSection();
      refreshSnapshots();
    });

    keydownHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", keydownHandler);

    panel.style.transform = "";
    panel.classList.add("is-open");
    backdrop.classList.add("is-open");
  }

  backdrop.addEventListener("click", close);
  closeBtn.addEventListener("click", close);

  // Expose getState for use by other modules (avoids re-exporting from here).
  void getState;

  return { open, close };
}
