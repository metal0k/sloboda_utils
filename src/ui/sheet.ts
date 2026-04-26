// Bottom-sheet (mobile) / sidebar (desktop): Share, Export JSON, Import JSON,
// Bulk textarea, Clear all.

import { isValidLabel, labelToHouseId } from "../houses";
import { clearAll, getState, replaceState, setStatus } from "../state";
import type { State } from "../state";
import { encodeStateToHash } from "../url-state";

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

// ---------- sheet ----------

export function initSheet(): { open: () => void; close: () => void } {
  const backdrop = document.createElement("div");
  backdrop.className = "sheet-backdrop";

  const panel = document.createElement("div");
  panel.className = "sheet-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Меню");

  // header
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

  // body
  const body = document.createElement("div");
  body.className = "sheet-body";

  function divider(): HTMLElement {
    const d = document.createElement("div");
    d.className = "sheet-divider";
    return d;
  }

  // --- Share ---
  const shareBtn = document.createElement("button");
  shareBtn.className = "btn btn-primary sheet-action";
  shareBtn.textContent = "Поделиться ссылкой";

  shareBtn.addEventListener("click", () => {
    const hash = encodeStateToHash(getState());
    const url = location.origin + location.pathname + hash;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(
        () => showToast("Ссылка скопирована"),
        () => {
          prompt("Скопируйте ссылку:", url);
        },
      );
    } else {
      prompt("Скопируйте ссылку:", url);
    }
  });

  // --- Export JSON ---
  const exportBtn = document.createElement("button");
  exportBtn.className = "btn sheet-action";
  exportBtn.textContent = "Экспорт JSON";

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

  // --- Import JSON ---
  const importBtn = document.createElement("button");
  importBtn.className = "btn sheet-action";
  importBtn.textContent = "Импорт JSON";

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

  // --- Bulk textarea ---
  const bulkLabel = document.createElement("label");
  bulkLabel.className = "sheet-section-label";
  bulkLabel.textContent = "Отметить дома как «готово»";

  const bulkArea = document.createElement("textarea");
  bulkArea.className = "sheet-textarea";
  bulkArea.placeholder = "1, 2, 3, 5/2 …";
  bulkArea.rows = 3;

  const bulkHint = document.createElement("div");
  bulkHint.className = "sheet-hint";

  bulkArea.addEventListener("input", () => {
    const ids = parseBulk(bulkArea.value);
    bulkHint.textContent = ids.length > 0 ? `${ids.length} домов будет отмечено` : "";
  });

  const bulkApplyBtn = document.createElement("button");
  bulkApplyBtn.className = "btn btn-primary sheet-action";
  bulkApplyBtn.textContent = "Применить";

  bulkApplyBtn.addEventListener("click", () => {
    const ids = parseBulk(bulkArea.value);
    if (ids.length === 0) {
      showToast("Не найдено активных домов", "err");
      return;
    }
    for (const id of ids) setStatus(id, "done");
    showToast(`Отмечено: ${ids.length} домов`);
    bulkArea.value = "";
    bulkHint.textContent = "";
    close();
  });

  // --- Clear all ---
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

  body.append(
    shareBtn,
    divider(),
    exportBtn,
    importBtn,
    fileInput,
    divider(),
    bulkLabel,
    bulkArea,
    bulkHint,
    bulkApplyBtn,
    divider(),
    clearBtn,
  );

  panel.append(header, body);
  document.body.append(backdrop, panel);

  function close(): void {
    panel.classList.remove("is-open");
    backdrop.classList.remove("is-open");
    resetClear();
  }

  function open(): void {
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
