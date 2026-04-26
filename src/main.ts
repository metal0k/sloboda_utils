// Application entry point.
//
// Layout:
//   #app
//     .toolbar
//       .campaign-title  (editable)
//       .stats-pill
//     .map-viewport
//       .map-stage (transformed by pan/zoom)
//         img.map-stage__background
//         div.map-stage__svg  ← raw SVG injected here

import "./styles/main.css";

import svgRaw from "../public/sloboda_house_numbers.svg?raw";

import { initMap } from "./map";
import { initState } from "./state";
import { initStats } from "./ui/stats";
import { initTitle } from "./ui/title";
import { enablePanZoom } from "./ui/gestures";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function buildShell(): {
  titleHost: HTMLElement;
  statsHost: HTMLElement;
  viewport: HTMLElement;
  stage: HTMLElement;
  svgHost: HTMLElement;
} {
  const app = document.getElementById("app");
  if (!app) throw new Error("#app element missing from index.html");
  app.replaceChildren();

  const toolbar = el("div", "toolbar");
  const titleHost = el("div", "campaign-title");
  const statsHost = el("div", "stats-pill");
  toolbar.append(titleHost, statsHost);

  const viewport = el("div", "map-viewport");
  const stage = el("div", "map-stage");

  const bg = el("img", "map-stage__background");
  // public/ assets are served from BASE_URL at both dev and build time.
  // BASE_URL is '/' in dev and './' (or whatever `base` is) in production.
  // BASE_URL ends with "/" by Vite convention (e.g. "/" in dev, "./" in
  // production with base:'./').
  bg.src = `${import.meta.env.BASE_URL}sloboda_map_back.png`;
  bg.alt = "";
  bg.draggable = false;

  const svgHost = el("div", "map-stage__svg");
  svgHost.innerHTML = svgRaw;

  stage.append(bg, svgHost);
  viewport.append(stage);
  app.append(toolbar, viewport);

  return { titleHost, statsHost, viewport, stage, svgHost };
}

function main(): void {
  initState();
  const { titleHost, statsHost, viewport, stage, svgHost } = buildShell();

  const svg = svgHost.querySelector<SVGElement>("svg");
  if (!svg) throw new Error("SVG failed to inject");

  initTitle(titleHost);
  initStats(statsHost);
  initMap(svg);
  enablePanZoom(viewport, stage);
}

main();
