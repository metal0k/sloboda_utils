// Inserts a <circle> chip behind every house <text> in the SVG.
// The chip gives each house a dark rounded background (readable on satellite)
// and a larger tap target on mobile.

const SVG_NS = "http://www.w3.org/2000/svg";

export type ChipMap = Map<string, SVGCircleElement>;

export function initChips(
  svg: SVGElement,
  houseIds: readonly string[],
  disabledIds: ReadonlySet<string>,
): ChipMap {
  const chips: ChipMap = new Map();

  for (const id of houseIds) {
    const text = svg.querySelector<SVGTextElement>(`[id="${id}"]`);
    if (!text) continue;

    const bbox = text.getBBox();

    const pad = 6;
    const r = Math.ceil(Math.max(bbox.width, bbox.height) / 2 + pad);
    const cx = bbox.x + bbox.width / 2;
    const cy = bbox.y + bbox.height / 2;

    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", String(cx));
    circle.setAttribute("cy", String(cy));
    circle.setAttribute("r", String(r));
    circle.classList.add("house-chip");
    circle.setAttribute("data-house-id", id);
    if (disabledIds.has(id)) {
      circle.classList.add("is-disabled");
    }

    text.parentNode?.insertBefore(circle, text);
    chips.set(id, circle);
  }

  return chips;
}
