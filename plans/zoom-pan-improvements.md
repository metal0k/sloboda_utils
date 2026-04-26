# Zoom & Pan Improvements

## Context

Карта Sloboda — vanilla TS SPA с pan/zoom через Pointer Events (`src/ui/gestures.ts`). Текущее поведение имеет 4 базовых шероховатости + 3 расширения для более «фотовьюверного» ощущения:

**Базовые:**
1. **Кнопка зума «Fit»** подписана английским словом — выбивается из остального русскоязычного интерфейса. Заменить на иконку + лаконичный лейбл «1:1» (та же логика fit-to-longest-side, только визуально аккуратнее).
2. **Карта может уехать за край** — пользователь дрэгом утаскивает изображение в дальний угол viewport, и приходится двойной клик «Fit». Нужен clamp по краям.
3. **При изменении viewport** карта остаётся со старыми x/y — на мобильном при повороте экрана половина карты улетает за край.
4. **Можно зумнуть слишком далеко** (`MIN_SCALE = 0.15`) — карта становится булавочной точкой. Min-zoom = fit-to-longest-side.

**Расширения (after follow-up Q&A):**
5. **Rubber-band на drag** — при перетягивании за край карта сопротивляется (×0.3), на pointerup пружинит обратно. Wheel/pinch остаются hard-clamped.
6. **Resize: keep scale + keep visual center** — НЕ делаем re-fit; сохраняем текущий зум, перецентровываем так, чтобы точка карты, бывшая в центре viewport до resize, осталась в центре после. Затем clampScale + clampPosition.
7. **Double-tap toggle (delayed click)** — двойной тап/клик переключает между fit и зумом 2.5× в точке тапа. Чтобы избежать ложных cycleStatus при double-tap, одиночный клик задерживается на 250 мс (если в этот промежуток приходит второй tap → отменить status-change, выполнить zoom toggle).

> **Файл плана**: после ExitPlanMode перенести план в `D:\Dev\PROJECTS\WEB\Sloboda\plans\zoom-pan-improvements.md` (создать папку `plans/` в репо). Добавлять ли в git — на усмотрение пользователя.

---

## Архитектурные решения

| # | Решение |
|---|---|
| 1 | `MIN_SCALE` (константа 0.15) **удаляется**. Минимум — динамический, равен `computeMinScale()` (fit-to-longest-side, как в `computeFitTransform`). |
| 2 | Все мутации `t.x/t.y/t.scale` (кроме drag-pointermove с rubber-band) проходят через единый `apply()`, который вызывает `clampPosition` перед записью CSS-трансформа. Drag во время удержания пишет напрямую через `applyRaw()` для rubber-band эффекта. |
| 3 | `clampPosition` по каждой оси: если `targetSize > viewportSize` → ограничить `x ∈ [vw - tw, 0]`; иначе → центрировать `x = (vw - tw) / 2`. |
| 4 | На window resize (через `ResizeObserver` на `container`): keep scale, anchor visual center; вызвать `clampScale` (на случай нового minScale) и `clampPosition`. |
| 5 | Кнопка «Fit» → иконка `crop_free` + текст «1:1» (вертикальный стек 16px + 10px внутри 36×36 button). Логика клика (`resetZoom`) не меняется. |
| 6 | **Rubber-band**: во время drag вычисляется `clamped = clampPosition(t.x, t.y)`, переменная `over = (target - clamped)`; реальная позиция = `clamped + over * 0.3`. Запись через `applyRaw` (без clamp). На pointerup → CSS-transition `transform 220ms cubic-bezier(0.2,0,0,1)` → запись `clamped` → по transitionend очистить transition. |
| 7 | **Double-tap delay**: в `map.ts` оборачиваем cycleStatus/setStatus в `setTimeout(.., 250)`; добавляем `dblclick` listener на SVG, который отменяет таймер и вызывает `controller.toggleZoomAt(clientX, clientY)`. Toggle: если `t.scale ≈ minScale` → zoom-in to `minScale * 2.5` в точке; иначе → fit. |

---

## Файлы для изменения

### 1. `src/ui/gestures.ts` — основная логика

**Удалить:**
```ts
const MIN_SCALE = 0.15;
```

**Добавить константы:**
```ts
const RUBBER_FACTOR = 0.3;
const SPRING_BACK_MS = 220;
const DOUBLE_TAP_ZOOM_FACTOR = 2.5; // от minScale
```

**Добавить хелпер `computeMinScale()`** (выше `clampScale`):
```ts
const computeMinScale = (): number => {
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  const tw = target.offsetWidth;
  const th = target.offsetHeight;
  if (tw === 0 || th === 0) return 0.15;
  const isPortrait = cw < ch;
  return isPortrait ? ch / th : cw / tw;
};
```

**Изменить `clampScale`:**
```ts
const clampScale = (s: number): number =>
  Math.max(computeMinScale(), Math.min(MAX_SCALE, s));
```

**Добавить `clampPosition(scale, x, y)`:**
```ts
const clampPosition = (scale: number, x: number, y: number): { x: number; y: number } => {
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  const tw = target.offsetWidth * scale;
  const th = target.offsetHeight * scale;
  const cx = tw > cw ? Math.min(0, Math.max(cw - tw, x)) : (cw - tw) / 2;
  const cy = th > ch ? Math.min(0, Math.max(ch - th, y)) : (ch - th) / 2;
  return { x: cx, y: cy };
};
```

**Разделить `apply` на два:**
```ts
const applyRaw = (): void => {
  target.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.scale})`;
};

const apply = (): void => {
  const { x, y } = clampPosition(t.scale, t.x, t.y);
  t.x = x;
  t.y = y;
  applyRaw();
};
```

**Drag pointermove** — вместо `t.x += dx; t.y += dy; apply()`:
```ts
const targetX = t.x + dx;
const targetY = t.y + dy;
const clamped = clampPosition(t.scale, targetX, targetY);
const overX = targetX - clamped.x;
const overY = targetY - clamped.y;
t.x = clamped.x + overX * RUBBER_FACTOR;
t.y = clamped.y + overY * RUBBER_FACTOR;
applyRaw();
```

**Pointerdown** — снять активную spring-back transition, чтобы новый drag не дёргался:
```ts
target.style.transition = "";
```

**Spring-back в `endPointer`** (если был drag):
```ts
if (didDrag) {
  suppressNextClick = true;
  didDrag = false;
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
```

**Добавить ResizeObserver** перед `return`:
```ts
let prevCw = container.clientWidth;
let prevCh = container.clientHeight;
const ro = new ResizeObserver(() => {
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  if (target.offsetWidth === 0 || target.offsetHeight === 0) return;
  if (prevCw === 0 || prevCh === 0) {
    prevCw = cw; prevCh = ch;
    return;
  }
  // anchor visual center: world point at old (cw/2, ch/2) stays at new (cw/2, ch/2)
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
```

**Добавить `toggleZoomAt(clientX, clientY)`** в controller:
```ts
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
```

**Расширить интерфейс controller'а:**
```ts
export interface PanZoomController {
  zoomIn(): void;
  zoomOut(): void;
  resetZoom(): void;
  toggleZoomAt(clientX: number, clientY: number): void;
}
```

**Удалить `requestAnimationFrame` из `resetZoom`** (теперь не нужен — `apply()` сам clamp'нет).

### 2. `src/main.ts` — кнопка «1:1» + проброс toggleZoomAt в map

**Заменить `buildZoomControls` блок btnReset:**
```ts
const btnReset = el("button", "zoom-btn zoom-btn--label");
btnReset.setAttribute("aria-label", "Вписать карту");
btnReset.innerHTML = `
  <span class="material-symbols-outlined" aria-hidden="true">crop_free</span>
  <span class="zoom-btn__text">1:1</span>
`;
btnReset.addEventListener("click", onReset);
```

**Передать `panZoom` в `initMap`:**
- Переставить блоки: сначала `enablePanZoom`, потом `initMap(svg, panZoom)`.

### 3. `src/map.ts` — delayed click + double-tap

**Изменить сигнатуру:**
```ts
export function initMap(svg: SVGElement, panZoom: PanZoomController): () => void {
```

**Заменить click handler на delayed pattern:**
```ts
const DOUBLE_DELAY_MS = 250;
let pendingClickTimer: number | null = null;

function clearPendingClick(): void {
  if (pendingClickTimer !== null) {
    clearTimeout(pendingClickTimer);
    pendingClickTimer = null;
  }
}

svg.addEventListener("click", (e) => {
  const target = e.target as Element | null;
  if (!target) return;
  const textEl = target.closest<SVGTextElement>("text[id]");
  if (!textEl) return;
  const id = textEl.id;
  if (!id || DISABLED_HOUSE_IDS.has(id) || !texts.has(id)) return;

  const isCtrl = e.ctrlKey || e.metaKey;
  clearPendingClick();
  pendingClickTimer = window.setTimeout(() => {
    pendingClickTimer = null;
    const { redListMode } = getSettings();
    if (redListMode) {
      if (isCtrl) setStatus(id, "issue");
      else cycleStatus(id);
    } else {
      setStatus(id, getStatus(id) === "done" ? null : "done");
    }
  }, DOUBLE_DELAY_MS);
});

svg.addEventListener("dblclick", (e) => {
  clearPendingClick();
  panZoom.toggleZoomAt(e.clientX, e.clientY);
});
```

### 4. `src/styles/main.css` — layout кнопки

**Расширить `.zoom-btn--label`:**
```css
.zoom-btn--label {
  flex-direction: column;
  gap: 0;
  font-size: 0.62rem;
  line-height: 1;
}
.zoom-btn--label .material-symbols-outlined {
  font-size: 16px;
}
.zoom-btn__text {
  font-weight: 600;
  letter-spacing: 0.02em;
}
```

---

## Существующие утилиты для reuse

- `computeFitTransform()` (`gestures.ts:208-218`) — fit-to-longest-side. Используется в `resetZoom` и `toggleZoomAt` (back-to-fit ветка).
- `scheduleSave()` (`gestures.ts:63-69`) — debounced localStorage save. Вызывается из ResizeObserver, drag-end, toggleZoomAt.
- `zoomAt(cx, cy, factor)` (`gestures.ts:77-86`) — single anchored zoom. Используется в double-tap zoom-in.
- `loadSavedZoom`/`saveZoom` (`main.ts:46-72`) — без изменений.

---

## Verification

1. **Build / typecheck:**
   ```bash
   npm run typecheck
   npm run build
   ```

2. **Dev сервер:**
   - Initial: карта вписана по высоте (mobile) или ширине (desktop). ✔
   - Drag за край: видно «резину», на отпускание — пружинит обратно. ✔ rubber-band.
   - Drag в центре карты (когда зум ≈ fit): движение в перпендикулярной оси заблокировано (центрирование). ✔
   - Wheel zoom out до упора: останавливается на fit-scale (без rubber). ✔ hard min.
   - Pinch до min: тоже hard-clamp. ✔
   - Кнопка «1:1» (иконка crop_free + текст): возврат к fit. ✔
   - Resize окна: визуальный центр сохраняется, scale тот же (если нет нарушения minScale). ✔
   - Resize до состояния где new minScale > current scale: scale поднимается до minScale, центр сохраняется. ✔
   - Mobile orientation flip: scale сохраняется, центр сохраняется. ✔
   - **Single click по дому**: статус меняется через ~250 мс. ✔ delayed.
   - **Double click по дому**: zoom in 2.5× в точку, статус НЕ меняется. ✔ no false flips.
   - **Double click по уже зумленной карте**: возврат к fit. ✔ toggle.
   - Ctrl+click на дом: устанавливает issue (тоже через 250 мс). ✔

3. **Тачскрин (DevTools device toolbar):** double-tap должен срабатывать как dblclick (браузер синтезирует).

---

## Risks / Tradeoffs

| Риск | Mitigation |
|---|---|
| Лаг 250 мс на одиночный клик ощущается медленным | Сознательный выбор пользователя. Альтернатива «suppress click при double» отвергнута — не хочется ложных cycleStatus. |
| ResizeObserver fires на initial mount → переcчёт x/y до того, как сработает `fitOnInit` | `fitOnInit` уже в `requestAnimationFrame`. В callback'е guard `if (target.offsetWidth === 0) return` + первичный fire просто запоминает `prevCw/prevCh`. |
| Spring-back transition + новый drag = jank | В pointerdown сразу `target.style.transition = ""` чтобы убить активную анимацию. |
| `toggleZoomAt` при scale > minScale но < target → возврат к fit вместо zoom-in | Принято: «выше fit» = «зумлено» = double-tap уменьшает. Стандартное поведение Maps/Photos. |
| Динамический min-scale ломает saved zoom (сохранили `scale=0.5`, открыли где min=0.65) | `clampScale` поднимет до min — корректное. |
| `crop_free` может не подойти стилистически | Альтернативы: `fit_screen`, `aspect_ratio`, `zoom_out_map`. Меняется одной строкой. |
| Mobile Safari может задерживать dblclick из-за 300 мс tap delay | `touch-action: none` уже стоит на container — это убирает задержку. Если будет проблема — fallback на ручной tap-detector в pointerup. |

---

## Out of scope

- Отдельная кнопка actual-size (1.0) — не нужна.
- Rubber-band на zoom (только на drag — выбрано).
- Анимированный zoom-in для double-tap (zoomAt пока instant; можно добавить CSS-transition позже).
