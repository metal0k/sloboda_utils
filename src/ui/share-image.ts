// share-image.ts
// Renders a 1080×1350 PNG share card using Canvas API (no external libraries).
// Exposes shareImage(state) which builds the card and delivers it via Web Share
// API or falls back to a download.

import type { State } from "../state";
import { ACTIVE_HOUSE_COUNT } from "../houses";
import { COLOR_DONE, COLOR_ISSUE } from "./colors";

import svgRaw from "../../public/sloboda_house_numbers.svg?raw";

// ---------------------------------------------------------------------------
// Image loading helpers
// ---------------------------------------------------------------------------

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ---------------------------------------------------------------------------
// SVG modification
// ---------------------------------------------------------------------------

function modifySvg(
  raw: string,
  done: ReadonlySet<string>,
  issue: ReadonlySet<string>,
): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, "image/svg+xml");

  // Inject status colour rules.
  const style = doc.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent =
    `text.is-done{fill:${COLOR_DONE}}` +
    `text.is-issue{fill:${COLOR_ISSUE}}` +
    "text.is-disabled{fill:#999;opacity:0.4}";
  doc.documentElement.prepend(style);

  // Apply classes to individual house text elements.
  for (const id of done) {
    const el = doc.getElementById(id);
    if (el) el.setAttribute("class", "is-done");
  }
  for (const id of issue) {
    const el = doc.getElementById(id);
    if (el) el.setAttribute("class", "is-issue");
  }

  return new XMLSerializer().serializeToString(doc);
}

// ---------------------------------------------------------------------------
// Text-wrapping helper
// ---------------------------------------------------------------------------

/**
 * Draw multi-line text, wrapping at word boundaries when wider than maxWidth.
 * Returns the y-coordinate after the last line drawn.
 */
function fillWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.split(" ");
  let line = "";
  let currentY = y;

  for (const word of words) {
    const testLine = line.length > 0 ? line + " " + word : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line.length > 0) {
      ctx.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line.length > 0) {
    ctx.fillText(line, x, currentY);
  }

  return currentY;
}

// ---------------------------------------------------------------------------
// Core canvas rendering
// ---------------------------------------------------------------------------

async function renderCanvas(state: State): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d")!;

  // --- Background ---
  ctx.fillStyle = "#060b06";
  ctx.fillRect(0, 0, 1080, 1350);

  const SIDE_PAD = 60;
  const CONTENT_W = 960; // 1080 - 2*60
  const CENTER_X = 1080 / 2;

  // --- Computed stats ---
  const done = state.done.size;
  const issueCount = state.issue.size;
  const total = ACTIVE_HOUSE_COUNT;
  const remaining = Math.max(0, total - done - issueCount);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  // --- 1. Title ---
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 52px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const titleLineHeight = 64;
  const titleY = 80;
  const finalTitleY = fillWrappedText(
    ctx,
    state.campaign,
    CENTER_X,
    titleY,
    CONTENT_W,
    titleLineHeight,
  );

  // --- 2. Stats line ---
  const statsY = finalTitleY + titleLineHeight + 20;
  ctx.fillStyle = COLOR_DONE;
  ctx.font = "38px sans-serif";
  ctx.fillText(`${done} / ${total} · ${pct}%`, CENTER_X, statsY);

  // --- 3. Progress bar ---
  const barY = statsY + 60 + 30; // 38px font + ~22px descent + 30 gap
  const barH = 24;
  const barX = SIDE_PAD;
  const barW = CONTENT_W;
  const radius = barH / 2;

  // Draw background (remaining) track first with rounded corners.
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, radius);
  ctx.fill();

  // Done segment.
  const doneW = total > 0 ? Math.round((done / total) * barW) : 0;
  if (doneW > 0) {
    ctx.fillStyle = COLOR_DONE;
    ctx.beginPath();
    if (doneW >= barW) {
      ctx.roundRect(barX, barY, doneW, barH, radius);
    } else {
      // Left-rounded only.
      ctx.roundRect(barX, barY, doneW, barH, [radius, 0, 0, radius]);
    }
    ctx.fill();
  }

  // Issue segment, immediately after done.
  const issueW = total > 0 ? Math.round((issueCount / total) * barW) : 0;
  if (issueW > 0) {
    const issueX = barX + doneW;
    ctx.fillStyle = COLOR_ISSUE;
    ctx.beginPath();
    if (doneW === 0) {
      // Issue starts at the left edge.
      if (issueX + issueW >= barX + barW) {
        ctx.roundRect(issueX, barY, issueW, barH, radius);
      } else {
        ctx.roundRect(issueX, barY, issueW, barH, [radius, 0, 0, radius]);
      }
    } else {
      // Issue follows done — no left rounding.
      if (issueX + issueW >= barX + barW) {
        ctx.roundRect(issueX, barY, issueW, barH, [0, radius, radius, 0]);
      } else {
        ctx.roundRect(issueX, barY, issueW, barH, 0);
      }
    }
    ctx.fill();
  }

  // --- 4. Legend ---
  const legendY = barY + barH + 18;
  ctx.fillStyle = "rgba(215,255,215,0.6)";
  ctx.font = "26px sans-serif";
  ctx.fillText(
    `✅ ${done} готово  ❌ ${issueCount} отказов  ⬜ ${remaining} осталось`,
    CENTER_X,
    legendY,
  );

  // --- 5. Map area ---
  const MAP_W = 960;
  const MAP_H = 800;
  const mapX = SIDE_PAD;
  const mapY = legendY + 40 + 26; // legend font-size ~26 + 40 gap

  // Original SVG/PNG dimensions.
  const ORIG_W = 1369;
  const ORIG_H = 1465;
  const scale = Math.min(MAP_W / ORIG_W, MAP_H / ORIG_H); // ≈ 0.546
  const scaledW = Math.round(ORIG_W * scale);
  const scaledH = Math.round(ORIG_H * scale);

  // Center within the map area.
  const mapDrawX = mapX + Math.round((MAP_W - scaledW) / 2);
  const mapDrawY = mapY + Math.round((MAP_H - scaledH) / 2);

  // Load background PNG.
  const bgImg = await loadImage(
    import.meta.env.BASE_URL + "sloboda_map_back.png",
  );

  // Build modified SVG and load as image.
  const svgModified = modifySvg(svgRaw, state.done, state.issue);
  const svgBytes = new TextEncoder().encode(svgModified);
  const svgBinary = Array.from(svgBytes, (b) => String.fromCodePoint(b)).join("");
  const svgDataUrl = "data:image/svg+xml;base64," + btoa(svgBinary);
  const svgImg = await loadImage(svgDataUrl);

  // Draw background, then SVG overlay at the same position/scale.
  ctx.drawImage(bgImg, mapDrawX, mapDrawY, scaledW, scaledH);
  ctx.drawImage(svgImg, mapDrawX, mapDrawY, scaledW, scaledH);

  // --- 6. Footer ---
  const footerY = mapY + MAP_H + 30;
  ctx.fillStyle = "rgba(215,255,215,0.4)";
  ctx.font = "20px sans-serif";
  ctx.fillText("metal0k.github.io/sloboda_utils", CENTER_X, footerY);

  return canvas;
}

// ---------------------------------------------------------------------------
// Blob builder
// ---------------------------------------------------------------------------

function buildImageBlob(state: State): Promise<Blob> {
  return new Promise((resolve, reject) => {
    renderCanvas(state)
      .then((canvas) => {
        canvas.toBlob(
          (blob) =>
            blob ? resolve(blob) : reject(new Error("toBlob failed")),
          "image/png",
        );
      })
      .catch(reject);
  });
}

// ---------------------------------------------------------------------------
// Delivery (Web Share API or download fallback)
// ---------------------------------------------------------------------------

async function deliverImage(blob: Blob, campaign: string): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  const file = new File([blob], `sloboda-${date}.png`, { type: "image/png" });

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: campaign });
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sloboda-${date}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function shareImage(state: State): Promise<void> {
  const blob = await buildImageBlob(state);
  await deliverImage(blob, state.campaign);
}
