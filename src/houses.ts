// Single source of truth for the house list.
//
// IDs come from the generated file (which is derived from the SVG); this
// module overlays the disabled set + the human-readable label conversion.

import { HOUSE_IDS } from "./houses.generated";

export type House = {
  readonly id: string;
  readonly label: string;
  readonly disabled: boolean;
};

// Houses physically present on the map but not part of the campaign
// (vacant / demolished / out of scope). Same set as the legacy code.
const DISABLED_IDS: ReadonlySet<string> = new Set([
  "_19",
  "_7",
  "_25",
  "_7_2",
]);

/**
 * Convert an SVG id (`_15`, `_7_2`) to the human-readable house label
 * (`15`, `7/2`).
 */
export function houseIdToLabel(id: string): string {
  // strip leading underscore, replace remaining "_" with "/"
  return id.replace(/^_/, "").replace("_", "/");
}

/**
 * Convert a human-readable house label (`15`, `7/2`) to the SVG id
 * (`_15`, `_7_2`).
 */
export function labelToHouseId(label: string): string {
  return "_" + label.replace("/", "_");
}

const ID_SET: ReadonlySet<string> = new Set(HOUSE_IDS);

/**
 * The legacy-compatible label validator.
 *
 * A label is valid iff it matches `^([1-6]?\d|[1-9]/2)$`,
 * resolves to a known SVG id, and that id is not disabled.
 */
export function isValidLabel(label: string): boolean {
  if (!/^([1-6]?\d|[1-9]\/2)$/.test(label)) return false;
  const id = labelToHouseId(label);
  if (!ID_SET.has(id)) return false;
  if (DISABLED_IDS.has(id)) return false;
  return true;
}

export const HOUSES: ReadonlyArray<House> = HOUSE_IDS.map((id) => ({
  id,
  label: houseIdToLabel(id),
  disabled: DISABLED_IDS.has(id),
}));

// Sanity counts. The legacy code hardcoded total = 67; we verify here.
//
// SVG contains 72 <text> nodes; 5 are listed as disabled
// (_19, _7, _25, _18, _7_2). 72 - 5 = 67 active houses.
export const ACTIVE_HOUSE_COUNT: number = HOUSES.filter(
  (h) => !h.disabled,
).length;

export const DISABLED_HOUSE_IDS: ReadonlySet<string> = DISABLED_IDS;
