// Application entry point.
//
// DOM layout:
//   #app
//     .toolbar
//       .toolbar__title   (project switcher dropdown + inline rename)
//       .toolbar__stats   (done / total · pct%)
//       .toolbar__menu    (hamburger → opens sheet)
//     .map-viewport
//       .map-stage (pan-zoom target)
//         img.map-stage__background
//         div.map-stage__svg ← inline SVG
//       .zoom-controls

import "./styles/main.css";

// Material Web Components (registers custom elements globally)
import "@material/web/button/filled-button.js";
import "@material/web/button/outlined-button.js";
import "@material/web/button/text-button.js";
import "@material/web/iconbutton/icon-button.js";
import "@material/web/fab/fab.js";
import "@material/web/dialog/dialog.js";
import "@material/web/switch/switch.js";
import "@material/web/icon/icon.js";

import svgRaw from "../public/sloboda_house_numbers.svg?raw";

import { getActiveProject, initState, subscribe } from "./state";
import { initSettings } from "./settings";
import { applyInitialTheme, initTheme } from "./ui/theme";
import { parseUrlHash } from "./url-state";
import { initMap } from "./map";
import { initStats } from "./ui/stats";
import { initTitle } from "./ui/title";
import { enablePanZoom } from "./ui/gestures";
import { initSheet } from "./ui/sheet";
import { showImportBanner } from "./ui/banner";
import { initFab } from "./ui/fab";
import { openShareDialog } from "./ui/share-dialog";

// ---------- per-project zoom persistence ----------

const ZOOM_KEY = "slobodaZoom/v2";

type ZoomTransform = { x: number; y: number; scale: number };

function loadAllZoom(): Record<string, ZoomTransform> {
  try {
    const raw = localStorage.getItem(ZOOM_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, ZoomTransform>;
    }
  } catch {
    // ignore malformed data
  }
  return {};
}

function loadProjectZoom(projectId: string): ZoomTransform | null {
  const all = loadAllZoom();
  const t = all[projectId];
  if (t && typeof t.x === "number" && typeof t.y === "number" && typeof t.scale === "number") {
    return t;
  }
  return null;
}

function saveZoom(projectId: string, t: ZoomTransform): void {
  try {
    const all = loadAllZoom();
    all[projectId] = t;
    localStorage.setItem(ZOOM_KEY, JSON.stringify(all));
  } catch {
    // ignore (private browsing quota)
  }
}

// One-shot migration from slobodaZoom/v1 (single-project) to v2 (keyed by projectId).
function migrateZoomV1(projectId: string): void {
  try {
    const raw = localStorage.getItem("slobodaZoom/v1");
    if (!raw) return;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "x" in parsed &&
      "y" in parsed &&
      "scale" in parsed
    ) {
      saveZoom(projectId, parsed as ZoomTransform);
    }
    localStorage.removeItem("slobodaZoom/v1");
  } catch {
    // ignore
  }
}

// ---------- helpers ----------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  return node;
}

function buildShell(): {
  titleHost: HTMLElement;
  statsHost: HTMLElement;
  themeBtn: HTMLButtonElement;
  menuBtn: HTMLButtonElement;
  viewport: HTMLElement;
  stage: HTMLElement;
  svgHost: HTMLElement;
} {
  const app = document.getElementById("app");
  if (!app) throw new Error("#app missing from index.html");
  app.replaceChildren();

  const toolbar = el("div", "toolbar");

  const titleHost = el("div", "toolbar__title");
  const statsHost = el("div", "toolbar__stats");
  const themeBtn = el("button", "toolbar__theme btn-icon");
  // icon/label initialised by initTheme()

  const menuBtn = el("button", "toolbar__menu btn-icon");
  menuBtn.setAttribute("aria-label", "Открыть меню");
  menuBtn.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">menu</span>`;

  toolbar.append(titleHost, statsHost, themeBtn, menuBtn);

  const viewport = el("div", "map-viewport");
  const stage = el("div", "map-stage");

  const bg = el("img", "map-stage__background");
  bg.src = `${import.meta.env.BASE_URL}sloboda_map_back.png`;
  bg.alt = "";
  bg.draggable = false;

  const svgHost = el("div", "map-stage__svg");
  svgHost.innerHTML = svgRaw;

  stage.append(bg, svgHost);
  viewport.append(stage);
  app.append(toolbar, viewport);

  return { titleHost, statsHost, themeBtn, menuBtn, viewport, stage, svgHost };
}

function buildZoomControls(viewport: HTMLElement, onZoomIn: () => void, onZoomOut: () => void, onReset: () => void): void {
  const wrap = el("div", "zoom-controls");

  const btnOut = el("button", "zoom-btn");
  btnOut.setAttribute("aria-label", "Уменьшить");
  btnOut.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">remove</span>`;
  btnOut.addEventListener("click", onZoomOut);

  const btnReset = el("button", "zoom-btn zoom-btn--label");
  btnReset.setAttribute("aria-label", "Вписать карту");
  btnReset.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">crop_free</span><span class="zoom-btn__text">1:1</span>`;
  btnReset.addEventListener("click", onReset);

  const btnIn = el("button", "zoom-btn");
  btnIn.setAttribute("aria-label", "Увеличить");
  btnIn.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">add</span>`;
  btnIn.addEventListener("click", onZoomIn);

  wrap.append(btnOut, btnReset, btnIn);
  viewport.appendChild(wrap);
}

function main(): void {
  initSettings();
  applyInitialTheme();
  initState();

  // Migrate zoom from v1 (single key) to v2 (keyed by project id).
  migrateZoomV1(getActiveProject().id);

  const { titleHost, statsHost, themeBtn, menuBtn, viewport, stage, svgHost } = buildShell();

  const svg = svgHost.querySelector<SVGElement>("svg");
  if (!svg) throw new Error("SVG failed to inject");

  initTitle(titleHost);
  initStats(statsHost);
  initTheme(themeBtn);

  const initialZoom = loadProjectZoom(getActiveProject().id);
  const panZoom = enablePanZoom(viewport, stage, {
    fitOnInit: true,
    initialTransform: initialZoom,
    onTransformChange: (t) => saveZoom(getActiveProject().id, t),
  });

  initMap(svg, panZoom);

  buildZoomControls(
    viewport,
    () => panZoom.zoomIn(),
    () => panZoom.zoomOut(),
    () => panZoom.resetZoom(),
  );

  const { open } = initSheet();
  menuBtn.addEventListener("click", open);

  initFab(openShareDialog);

  // Restore zoom when the active project changes.
  let lastProjectId = getActiveProject().id;
  subscribe(() => {
    const newId = getActiveProject().id;
    if (newId !== lastProjectId) {
      lastProjectId = newId;
      panZoom.setTransform(loadProjectZoom(newId));
    }
  });

  // Cross-device import: check if the URL carries a #s= hash.
  const incoming = parseUrlHash();
  if (incoming) {
    showImportBanner(incoming);
  }
}

main();
