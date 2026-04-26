// Application entry point.
//
// DOM layout:
//   #app
//     .toolbar
//       .toolbar__title   (editable campaign name)
//       .toolbar__stats   (done / total · pct%)
//       .toolbar__menu    (hamburger → opens sheet)
//     .map-viewport
//       .map-stage (pan-zoom target)
//         img.map-stage__background
//         div.map-stage__svg ← inline SVG

import "./styles/main.css";

import svgRaw from "../public/sloboda_house_numbers.svg?raw";

import { replaceState, initState } from "./state";
import { initSettings } from "./settings";
import { applyInitialTheme, initTheme } from "./ui/theme";
import { parseUrlHash } from "./url-state";
import { initMap } from "./map";
import { initStats } from "./ui/stats";
import { initTitle } from "./ui/title";
import { enablePanZoom } from "./ui/gestures";
import { initSheet } from "./ui/sheet";
import { showImportBanner } from "./ui/banner";

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
  themeBtn.setAttribute("aria-label", "Переключить тему");

  const menuBtn = el("button", "toolbar__menu btn-icon");
  menuBtn.setAttribute("aria-label", "Открыть меню");
  menuBtn.innerHTML = `<span aria-hidden="true">☰</span>`;

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

function main(): void {
  initSettings();
  applyInitialTheme();
  initState();

  const { titleHost, statsHost, themeBtn, menuBtn, viewport, stage, svgHost } = buildShell();

  const svg = svgHost.querySelector<SVGElement>("svg");
  if (!svg) throw new Error("SVG failed to inject");

  initTitle(titleHost);
  initStats(statsHost);
  initTheme(themeBtn);
  initMap(svg);
  enablePanZoom(viewport, stage, { fitOnInit: true });

  const { open } = initSheet();
  menuBtn.addEventListener("click", open);

  // Cross-device import: check if the URL carries a #s= hash.
  const incoming = parseUrlHash();
  if (incoming) {
    showImportBanner(incoming, () => {
      replaceState(incoming);
    });
  }
}

main();
