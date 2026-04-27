// Share dialog: MD3 modal with Copy Link, Share Image, Export JSON actions.
// Opened by the FAB in main.ts.

import type { MdDialog } from "@material/web/dialog/dialog.js";

import { getState, getActiveProject, type Project } from "../state";
import { encodeProjectToHash } from "../url-state";
import { buildImageBlob, deliverImage } from "./share-image";
import { showToast } from "./sheet";

// ---------- JSON export (all projects) ----------

type ProjectJson = {
  id: string;
  name: string;
  done: string[];
  issue: string[];
  redListMode: boolean;
  updatedAt: number;
};

type ExportJson = {
  version: 3;
  appVersion: string;
  activeProjectId: string;
  projects: ProjectJson[];
};

function projectToJson(p: Project): ProjectJson {
  return {
    id: p.id,
    name: p.name,
    done: [...p.done],
    issue: [...p.issue],
    redListMode: p.redListMode,
    updatedAt: p.updatedAt,
  };
}

function stateToJson(): string {
  const state = getState();
  const payload: ExportJson = {
    version: 3,
    appVersion: __APP_VERSION__,
    activeProjectId: state.activeProjectId,
    projects: (state.projects as Project[]).map(projectToJson),
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
  headline.style.cssText = "width:100%;text-align:center;";
  headline.textContent = "Поделиться";

  // content slot
  const content = document.createElement("div");
  content.setAttribute("slot", "content");
  content.className = "share-dialog-action-list";

  const copyBtn = actionBtn("link", "Скопировать ссылку");
  const imageBtn = actionBtn("image", "Поделиться картинкой");
  const jsonBtn = actionBtn("download", "Экспорт в JSON");

  copyBtn.addEventListener("click", () => {
    const project = getActiveProject();
    const hash = encodeProjectToHash(project);
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
      const project = getActiveProject();
      const blob = await buildImageBlob(project);
      showImagePreview(blob, project.name);
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
    setTimeout(() => URL.revokeObjectURL(url), 5000);
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

// ---------- image preview overlay ----------

function showImagePreview(blob: Blob, projectName: string): void {
  const url = URL.createObjectURL(blob);

  const overlay = document.createElement("div");
  overlay.className = "share-preview";

  const img = document.createElement("img");
  img.className = "share-preview__img";
  img.src = url;
  img.alt = "Предпросмотр";

  const actions = document.createElement("div");
  actions.className = "share-preview__actions";

  const shareBtn = document.createElement("md-filled-button");
  shareBtn.textContent = "Поделиться";
  shareBtn.style.cssText = "--md-filled-button-leading-space:32px;--md-filled-button-trailing-space:32px;";
  shareBtn.addEventListener("click", async () => {
    await deliverImage(blob, projectName);
    closePreview();
  });

  const closeBtn = document.createElement("md-text-button");
  closeBtn.textContent = "Закрыть";
  closeBtn.style.cssText = "--md-text-button-leading-space:24px;--md-text-button-trailing-space:24px;";
  closeBtn.addEventListener("click", closePreview);

  function closePreview(): void {
    URL.revokeObjectURL(url);
    overlay.remove();
  }

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closePreview();
  });

  actions.append(shareBtn, closeBtn);
  overlay.append(img, actions);
  document.body.appendChild(overlay);
}
