// Share dialog: MD3 modal with Copy Link, Share Image, Export JSON actions.
// Opened by the FAB in main.ts.

import type { MdDialog } from "@material/web/dialog/dialog.js";

import { getState } from "../state";
import { encodeStateToHash } from "../url-state";
import { shareImage } from "./share-image";
import { showToast } from "./sheet";

// ---------- JSON export ----------

type PersistedJson = {
  version: number;
  campaign: string;
  done: string[];
  issue: string[];
  updatedAt: number;
};

function stateToJson(): string {
  const state = getState();
  const payload: PersistedJson = {
    version: 2,
    campaign: state.campaign,
    done: [...state.done],
    issue: [...state.issue],
    updatedAt: state.updatedAt,
  };
  return JSON.stringify(payload, null, 2);
}

// ---------- helpers ----------

function actionBtn(icon: string, label: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "share-dialog-action";
  btn.innerHTML = `
    <span class="material-symbols-outlined" aria-hidden="true">${icon}</span>
    <span>${label}</span>
  `;
  return btn;
}

// ---------- dialog ----------

let dialogEl: MdDialog | null = null;

function ensureDialog(): MdDialog {
  if (dialogEl) return dialogEl;

  const dialog = document.createElement("md-dialog") as MdDialog;
  dialog.setAttribute("aria-label", "Поделиться");

  // headline slot
  const headline = document.createElement("div");
  headline.setAttribute("slot", "headline");
  headline.textContent = "Поделиться";

  // content slot
  const content = document.createElement("div");
  content.setAttribute("slot", "content");
  content.className = "share-dialog-action-list";

  const copyBtn = actionBtn("link", "Скопировать ссылку");
  const imageBtn = actionBtn("image", "Поделиться картинкой");
  const jsonBtn = actionBtn("download", "Экспорт в JSON");

  copyBtn.addEventListener("click", () => {
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
    dialog.close();
  });

  imageBtn.addEventListener("click", async () => {
    dialog.close();
    try {
      await shareImage(getState());
    } catch {
      showToast("Не удалось создать картинку", "err");
    }
  });

  jsonBtn.addEventListener("click", () => {
    const json = stateToJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sloboda-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Файл сохранён");
    dialog.close();
  });

  content.append(copyBtn, imageBtn, jsonBtn);

  // actions slot — just a close button
  const closeAction = document.createElement("md-text-button");
  closeAction.setAttribute("slot", "actions");
  closeAction.setAttribute("form", "");
  closeAction.setAttribute("value", "close");
  closeAction.textContent = "Закрыть";
  closeAction.addEventListener("click", () => dialog.close());

  dialog.append(headline, content, closeAction);
  document.body.appendChild(dialog);

  dialogEl = dialog;
  return dialog;
}

export function openShareDialog(): void {
  ensureDialog().show();
}
