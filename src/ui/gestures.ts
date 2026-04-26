// Pointer-event-based pan + zoom for the map.
//
// Single-pointer drag = pan. Wheel = zoom (Ctrl + wheel for trackpad pinch).
// Two-finger touch pinch = zoom.
//
// Click pass-through: if the pointer barely moved, we let the native click
// fire on the SVG <text>; only past `DRAG_THRESHOLD_PX` do we capture and
// suppress the synthetic click.

const MAX_SCALE = 6;
const DRAG_THRESHOLD_PX = 5;
const WHEEL_ZOOM_STEP = 0.0015;
const TRACKPAD_ZOOM_STEP = 0.01;
const ZOOM_BUTTON_FACTOR = 1.25;
const SAVE_DEBOUNCE_MS = 400;
const RUBBER_FACTOR = 0.3;
const SPRING_BACK_MS = 220;
const DOUBLE_TAP_ZOOM_FACTOR = 2.5;

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
  toggleZoomAt(clientX: number, clientY: number): void;
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

  // ---------- helpers ----------

  const computeMinScale = (): number => {
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const tw = target.offsetWidth;
    const th = target.offsetHeight;
    if (tw === 0 || th === 0) return 0.15;
    return Math.min(cw / tw, ch / th);
  };

  const clampScale = (s: number): number =>
    Math.max(computeMinScale(), Math.min(MAX_SCALE, s));

  const clampPosition = (scale: number, x: number, y: number): { x: number; y: number } => {
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const tw = target.offsetWidth * scale;
    const th = target.offsetHeight * scale;
    const cx = tw > cw ? Math.min(0, Math.max(cw - tw, x)) : (cw - tw) / 2;
    const cy = th > ch ? Math.min(0, Math.max(ch - th, y)) : (ch - th) / 2;
    return { x: cx, y: cy };
  };

  const applyRaw = (): void => {
    target.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.scale})`;
  };

  const apply = (): void => {
    const { x, y } = clampPosition(t.scale, t.x, t.y);
    t.x = x;
    t.y = y;
    applyRaw();
  };
  apply();

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

  // ---------- fit helpers ----------

  const computeFitTransform = (): Transform => {
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const tw = target.offsetWidth;
    const th = target.offsetHeight;
    if (tw === 0 || th === 0) return { x: 0, y: 0, scale: 1 };
    const s = clampScale(Math.min(cw / tw, ch / th));
    return { x: (cw - tw * s) / 2, y: (ch - th * s) / 2, scale: s };
  };

  // ---------- pointer events ----------

  container.addEventListener("pointerdown", (e) => {
    // Kill any active spring-back transition so new drag starts clean.
    target.style.transition = "";
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
      // Rubber-band: allow over-drag with resistance instead of hard-clamp.
      const targetX = t.x + dx;
      const targetY = t.y + dy;
      const clamped = clampPosition(t.scale, targetX, targetY);
      const overX = targetX - clamped.x;
      const overY = targetY - clamped.y;
      t.x = clamped.x + overX * RUBBER_FACTOR;
      t.y = clamped.y + overY * RUBBER_FACTOR;
      applyRaw();
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
      // Spring back to clamped position if we over-dragged.
      const clamped = clampPosition(t.scale, t.x, t.y);
      if (clamped.x !== t.x || clamped.y !== t.y) {
        target.style.transition = `transform ${SPRING_BACK_MS}ms cubic-bezier(0.2,0,0,1)`;
        t.x = clamped.x;
        t.y = clamped.y;
        applyRaw();
        const cleanup = (): void => {
          target.style.transition = "";
          target.removeEventListener("transitionend", cleanup);
        };
        target.addEventListener("transitionend", cleanup);
      }
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

  // ---------- resize: keep scale, anchor visual center ----------

  let prevCw = container.clientWidth;
  let prevCh = container.clientHeight;
  const ro = new ResizeObserver(() => {
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (target.offsetWidth === 0 || target.offsetHeight === 0) return;
    if (prevCw === 0 || prevCh === 0) {
      prevCw = cw;
      prevCh = ch;
      return;
    }
    if (cw === prevCw && ch === prevCh) return;
    // Compute world point that was at the center before resize.
    const worldX = (prevCw / 2 - t.x) / t.scale;
    const worldY = (prevCh / 2 - t.y) / t.scale;
    t.scale = clampScale(t.scale);
    t.x = cw / 2 - worldX * t.scale;
    t.y = ch / 2 - worldY * t.scale;
    apply();
    scheduleSave();
    prevCw = cw;
    prevCh = ch;
  });
  ro.observe(container);

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
      const fit = computeFitTransform();
      t.x = fit.x;
      t.y = fit.y;
      t.scale = fit.scale;
      apply();
      scheduleSave();
    },
    toggleZoomAt(clientX: number, clientY: number) {
      const rect = container.getBoundingClientRect();
      const cx = clientX - rect.left;
      const cy = clientY - rect.top;
      const minS = computeMinScale();
      const isAtFit = Math.abs(t.scale - minS) < 0.01;
      if (isAtFit) {
        zoomAt(cx, cy, DOUBLE_TAP_ZOOM_FACTOR);
      } else {
        const fit = computeFitTransform();
        t.x = fit.x;
        t.y = fit.y;
        t.scale = fit.scale;
        apply();
        scheduleSave();
      }
    },
  };
}
