// Bottom-sheet (mobile) / sidebar (desktop): Share, Lists, Clear All, Import JSON.
// Phase 3 rewrite — snapshot+commit pattern for Зелёный and Красный lists.

import { isValidLabel, labelToHouseId, houseIdToLabel, ACTIVE_HOUSE_COUNT } from "../houses";
import { clearAll, clearIssue, getState, replaceState, setStatus, subscribe } from "../state";
import type { State } from "../state";
import { encodeStateToHash } from "../url-state";
import { getSettings, setRedListMode, subscribeSettings } from "../settings";
import { shareImage } from "./share-image";  // Phase 4 creates this

// Suppress unused-variable warning for ACTIVE_HOUSE_COUNT (may be used later)
void ACTIVE_HOUSE_COUNT;

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

// ---------- JSON serialisation ----------

type PersistedJson = {
  version: number;
  campaign: string;
  done: string[];
  issue: string[];
  updatedAt: number;
};

function stateToJson(state: State): string {
  const payload: PersistedJson = {
    version: 2,
    campaign: state.campaign,
    done: [...state.done],
    issue: [...state.issue],
    updatedAt: state.updatedAt,
  };
  return JSON.stringify(payload, null, 2);
}

function jsonToState(json: string): State | null {
  try {
    const raw = JSON.parse(json) as PersistedJson;
    if (!raw || typeof raw !== "object") return null;
    return {
      campaign: typeof raw.campaign === "string" ? raw.campaign : "Кампания",
      done: new Set(Array.isArray(raw.done) ? raw.done.filter((v) => typeof v === "string") : []),
      issue: new Set(
        Array.isArray(raw.issue) ? raw.issue.filter((v) => typeof v === "string") : [],
      ),
      updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
    };
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
  const parse = (s: string): number => s.includes("/") ? parseFloat(s) + 0.5 : parseFloat(s);
  return parse(a) - parse(b);
}

function snapshotToText(ids: Set<string>): string {
  return [...ids].map(houseIdToLabel).sort(naturalSort).join(", ");
}

function computeDiff(
  textarea: HTMLTextAreaElement,
  currentSet: Set<string>,
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

  // --- header ---
  const header = document.createElement("div");
  header.className = "sheet-header";
  const title = document.createElement("span");
  title.className = "sheet-title";
  title.textContent = "Меню";
  const closeBtn = document.createElement("button");
  closeBtn.className = "sheet-close btn-icon";
  closeBtn.setAttribute("aria-label", "Закрыть");
  closeBtn.textContent = "✕";
  header.append(title, closeBtn);

  // --- body ---
  const body = document.createElement("div");
  body.className = "sheet-body";

  function divider(): HTMLElement {
    const d = document.createElement("div");
    d.className = "sheet-divider";
    return d;
  }

  // ===== Collapsible «Поделиться» section =====

  const shareCollapseBtn = document.createElement("button");
  shareCollapseBtn.className = "btn sheet-collapse-header";
  shareCollapseBtn.setAttribute("aria-expanded", "false");
  shareCollapseBtn.textContent = "Поделиться ▸";

  const shareCollapseBody = document.createElement("div");
  shareCollapseBody.hidden = true;
  shareCollapseBody.style.display = "flex";
  shareCollapseBody.style.flexDirection = "column";
  shareCollapseBody.style.gap = "8px";
  shareCollapseBody.style.paddingTop = "8px";

  shareCollapseBtn.addEventListener("click", () => {
    const isOpen = shareCollapseBtn.getAttribute("aria-expanded") === "true";
    const next = !isOpen;
    shareCollapseBtn.setAttribute("aria-expanded", next ? "true" : "false");
    shareCollapseBody.hidden = !next;
    shareCollapseBtn.textContent = next ? "Поделиться ▾" : "Поделиться ▸";
  });

  // Copy link button
  const copyLinkBtn = document.createElement("button");
  copyLinkBtn.className = "btn btn-primary sheet-action";
  copyLinkBtn.textContent = "Скопировать ссылку";

  copyLinkBtn.addEventListener("click", () => {
    const hash = encodeStateToHash(getState());
    const url = location.origin + location.pathname + hash;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(
        () => showToast("Ссылка скопирована"),
        () => { prompt("Скопируйте ссылку:", url); },
      );
    } else {
      prompt("Скопируйте ссылку:", url);
    }
  });

  // Export JSON button
  const exportBtn = document.createElement("button");
  exportBtn.className = "btn sheet-action";
  exportBtn.textContent = "Экспорт в JSON";

  exportBtn.addEventListener("click", () => {
    const json = stateToJson(getState());
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sloboda-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Файл сохранён");
  });

  // Share image button
  const shareImageBtn = document.createElement("button");
  shareImageBtn.className = "btn sheet-action";
  shareImageBtn.textContent = "Поделиться картинкой";

  shareImageBtn.addEventListener("click", async () => {
    try {
      await shareImage(getState());
    } catch {
      showToast("Не удалось создать картинку", "err");
    }
  });

  shareCollapseBody.append(copyLinkBtn, exportBtn, shareImageBtn);

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

  const greenApplyBtn = document.createElement("button");
  greenApplyBtn.className = "btn btn-primary sheet-action";
  greenApplyBtn.textContent = "Применить";
  greenApplyBtn.disabled = true;

  greenArea.addEventListener("input", () => {
    const { add, remove } = computeDiff(greenArea, getState().done);
    renderDiffHint(greenHint, add, remove);
    greenApplyBtn.disabled = add.length === 0 && remove.length === 0;
  });

  greenApplyBtn.addEventListener("click", () => {
    const { add, remove } = computeDiff(greenArea, getState().done);
    for (const id of add) setStatus(id, "done");
    for (const id of remove) {
      if (getState().done.has(id)) setStatus(id, null);
    }
    showToast("Зелёный список обновлён");
    close();
  });

  // ===== Красный список =====

  const redToggleRow = document.createElement("div");
  redToggleRow.className = "sheet-toggle-row";

  const redCheckbox = document.createElement("input");
  redCheckbox.type = "checkbox";
  redCheckbox.id = "sheet-red-toggle";

  const redToggleLabel = document.createElement("label");
  redToggleLabel.htmlFor = "sheet-red-toggle";
  redToggleLabel.textContent = "Красный список";

  redToggleRow.append(redCheckbox, redToggleLabel);

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

  const redApplyBtn = document.createElement("button");
  redApplyBtn.className = "btn btn-danger-primary sheet-action";
  redApplyBtn.textContent = "Применить";
  redApplyBtn.disabled = true;

  redArea.addEventListener("input", () => {
    const { add, remove } = computeDiff(redArea, getState().issue);
    renderDiffHint(redHint, add, remove);
    redApplyBtn.disabled = add.length === 0 && remove.length === 0;
  });

  redApplyBtn.addEventListener("click", () => {
    const { add, remove } = computeDiff(redArea, getState().issue);
    for (const id of add) setStatus(id, "issue");
    for (const id of remove) {
      if (getState().issue.has(id)) setStatus(id, null);
    }
    showToast("Красный список обновлён");
    close();
  });

  redSection.append(redArea, redHint, redApplyBtn);

  function applyRedSectionVisibility(on: boolean): void {
    redSection.hidden = !on;
    redCheckbox.checked = on;
  }

  redCheckbox.addEventListener("change", () => {
    const on = redCheckbox.checked;
    setRedListMode(on);
    if (!on) clearIssue();
    applyRedSectionVisibility(on);
  });

  // ===== Очистить всё =====

  const clearBtn = document.createElement("button");
  clearBtn.className = "btn btn-danger sheet-action";
  clearBtn.textContent = "Очистить всё";

  let clearTimer: ReturnType<typeof setTimeout> | null = null;

  clearBtn.addEventListener("click", () => {
    if (clearBtn.dataset.confirm) {
      clearAll();
      showToast("Состояние очищено");
      resetClear();
      close();
    } else {
      clearBtn.textContent = "Нажмите ещё раз для подтверждения";
      clearBtn.dataset.confirm = "1";
      clearTimer = setTimeout(resetClear, 3500);
    }
  });

  function resetClear(): void {
    clearBtn.textContent = "Очистить всё";
    delete clearBtn.dataset.confirm;
    if (clearTimer) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }
  }

  // ===== Импорт JSON (bottom, de-emphasized) =====

  const importBtn = document.createElement("button");
  importBtn.className = "btn sheet-action";
  importBtn.textContent = "Импорт из JSON";

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".json,application/json";
  fileInput.style.display = "none";

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const state = jsonToState(reader.result as string);
      if (!state) {
        showToast("Не удалось прочитать файл", "err");
        return;
      }
      replaceState(state);
      showToast("Состояние импортировано");
      close();
    };
    reader.readAsText(file);
    fileInput.value = "";
  });

  importBtn.addEventListener("click", () => fileInput.click());

  // ===== Assemble body =====

  body.append(
    shareCollapseBtn,
    shareCollapseBody,
    divider(),
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
    fileInput,
  );

  panel.append(header, body);
  document.body.append(backdrop, panel);

  // ===== Subscriptions =====

  let unsubState: (() => void) | null = null;
  let unsubSettings: (() => void) | null = null;

  function refreshSnapshots(): void {
    const state = getState();
    greenArea.value = snapshotToText(state.done);
    greenHint.textContent = "";
    greenApplyBtn.disabled = true;

    if (!redSection.hidden) {
      redArea.value = snapshotToText(state.issue);
      redHint.textContent = "";
      redApplyBtn.disabled = true;
    }
  }

  function close(): void {
    panel.classList.remove("is-open");
    backdrop.classList.remove("is-open");
    resetClear();
    if (unsubState) { unsubState(); unsubState = null; }
    if (unsubSettings) { unsubSettings(); unsubSettings = null; }
  }

  function open(): void {
    // Initialise from current settings
    const settings = getSettings();
    applyRedSectionVisibility(settings.redListMode);

    // Populate snapshots
    refreshSnapshots();

    // Subscribe while open
    unsubState = subscribe(() => refreshSnapshots());
    unsubSettings = subscribeSettings((s) => {
      applyRedSectionVisibility(s.redListMode);
    });

    panel.classList.add("is-open");
    backdrop.classList.add("is-open");
  }

  backdrop.addEventListener("click", close);
  closeBtn.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.classList.contains("is-open")) close();
  });

  return { open, close };
}
