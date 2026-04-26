// Pointer-event-based pan + zoom for the map.
//
// Single-pointer drag = pan. Wheel = zoom (Ctrl + wheel for trackpad pinch).
// Two-finger touch pinch = zoom.
//
// Click pass-through: if the pointer barely moved, we let the native click
// fire on the SVG <text>; only past `DRAG_THRESHOLD_PX` do we capture and
// suppress the synthetic click.

const MIN_SCALE = 0.15;
const MAX_SCALE = 6;
const DRAG_THRESHOLD_PX = 5;
const WHEEL_ZOOM_STEP = 0.0015;
const TRACKPAD_ZOOM_STEP = 0.01;
const ZOOM_BUTTON_FACTOR = 1.25;
const SAVE_DEBOUNCE_MS = 400;

type Transform = { x: number; y: number; scale: number };

type Pointer = {
  id: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
};

export interface PanZoomController {
  zoomIn(): void;
  zoomOut(): void;
  resetZoom(): void;
}

export function enablePanZoom(
  container: HTMLElement,
  target: HTMLElement,
  options: {
    fitOnInit?: boolean;
    initialTransform?: { x: number; y: number; scale: number } | null;
    onTransformChange?: (t: { x: number; y: number; scale: number }) => void;
  } = {},
): PanZoomController {
  const t: Transform = { x: 0, y: 0, scale: 1 };
  const pointers = new Map<number, Pointer>();
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let suppressNextClick = false;
  let didDrag = false;
  let saveTimer = 0;

  container.style.touchAction = "none";

  const apply = (): void => {
    target.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.scale})`;
  };
  apply();

  // ---------- helpers ----------

  const clampScale = (s: number): number =>
    Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));

  const scheduleSave = (): void => {
    if (!options.onTransformChange) return;
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      options.onTransformChange!({ x: t.x, y: t.y, scale: t.scale });
    }, SAVE_DEBOUNCE_MS);
  };

  const containerPoint = (e: PointerEvent | WheelEvent): { x: number; y: number } => {
    const rect = container.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  /** Zoom by `factor` keeping the point `(cx, cy)` (container coords) anchored. */
  const zoomAt = (cx: number, cy: number, factor: number): void => {
    const newScale = clampScale(t.scale * factor);
    const real = newScale / t.scale;
    if (real === 1) return;
    t.x = cx - (cx - t.x) * real;
    t.y = cy - (cy - t.y) * real;
    t.scale = newScale;
    apply();
    scheduleSave();
  };

  // ---------- pointer events ----------

  container.addEventListener("pointerdown", (e) => {
    pointers.set(e.pointerId, {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
    });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchStartScale = t.scale;
    }
    didDrag = false;
  });

  container.addEventListener("pointermove", (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const prevX = p.x;
    const prevY = p.y;
    p.x = e.clientX;
    p.y = e.clientY;

    if (pointers.size === 1) {
      const dx = p.x - prevX;
      const dy = p.y - prevY;
      const totalDx = p.x - p.startX;
      const totalDy = p.y - p.startY;
      const dist = Math.hypot(totalDx, totalDy);
      if (!didDrag && dist < DRAG_THRESHOLD_PX) {
        return;
      }
      if (!didDrag) {
        didDrag = true;
        try {
          container.setPointerCapture(e.pointerId);
        } catch {
          // ignore — capture is best-effort
        }
      }
      t.x += dx;
      t.y += dy;
      apply();
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStartDist > 0) {
        const targetScale = clampScale(
          (pinchStartScale * dist) / pinchStartDist,
        );
        const factor = targetScale / t.scale;
        const rect = container.getBoundingClientRect();
        const cx = (a.x + b.x) / 2 - rect.left;
        const cy = (a.y + b.y) / 2 - rect.top;
        zoomAt(cx, cy, factor);
      }
      didDrag = true;
    }
  });

  const endPointer = (e: PointerEvent): void => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) {
      pinchStartDist = 0;
    }
    if (didDrag) {
      suppressNextClick = true;
      didDrag = false;
      scheduleSave();
    }
    if (container.hasPointerCapture(e.pointerId)) {
      try {
        container.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  container.addEventListener("pointerup", endPointer);
  container.addEventListener("pointercancel", endPointer);
  container.addEventListener("pointerleave", (e) => {
    if (pointers.has(e.pointerId)) endPointer(e);
  });

  // ---------- click suppression after drag ----------

  container.addEventListener(
    "click",
    (e) => {
      if (suppressNextClick) {
        e.stopPropagation();
        e.preventDefault();
        suppressNextClick = false;
      }
    },
    true,
  );

  // ---------- wheel zoom ----------

  container.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const { x, y } = containerPoint(e);
      const step = e.ctrlKey ? TRACKPAD_ZOOM_STEP : WHEEL_ZOOM_STEP;
      const factor = Math.exp(-e.deltaY * step);
      zoomAt(x, y, factor);
    },
    { passive: false },
  );

  // ---------- fit helpers ----------

  const computeFitTransform = (): Transform => {
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const tw = target.offsetWidth;
    const th = target.offsetHeight;
    if (tw === 0 || th === 0) return { x: 0, y: 0, scale: 1 };
    // Fit-to-longest-side: portrait → fill height, landscape → fill width.
    const isPortrait = cw < ch;
    const s = clampScale(isPortrait ? ch / th : cw / tw);
    return { x: (cw - tw * s) / 2, y: (ch - th * s) / 2, scale: s };
  };

  // ---------- init ----------

  if (options.fitOnInit) {
    requestAnimationFrame(() => {
      if (options.initialTransform) {
        // Restore saved scale but recompute the centered position for the
        // current viewport — raw x/y coordinates don't transfer across devices.
        const s = clampScale(options.initialTransform.scale);
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        const tw = target.offsetWidth;
        const th = target.offsetHeight;
        t.scale = s;
        t.x = (cw - tw * s) / 2;
        t.y = (ch - th * s) / 2;
      } else {
        const fit = computeFitTransform();
        t.x = fit.x;
        t.y = fit.y;
        t.scale = fit.scale;
      }
      apply();
    });
  }

  // ---------- controller ----------

  const centerOf = (): { cx: number; cy: number } => ({
    cx: container.clientWidth / 2,
    cy: container.clientHeight / 2,
  });

  return {
    zoomIn() {
      const { cx, cy } = centerOf();
      zoomAt(cx, cy, ZOOM_BUTTON_FACTOR);
    },
    zoomOut() {
      const { cx, cy } = centerOf();
      zoomAt(cx, cy, 1 / ZOOM_BUTTON_FACTOR);
    },
    resetZoom() {
      requestAnimationFrame(() => {
        const fit = computeFitTransform();
        t.x = fit.x;
        t.y = fit.y;
        t.scale = fit.scale;
        apply();
        scheduleSave();
      });
    },
  };
}
