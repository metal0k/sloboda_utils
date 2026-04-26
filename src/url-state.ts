// Cross-device sync via URL hash.
//
// Format: #s=1.<done_b64url>.<issue_b64url>.<updatedAt_b36>.<campaign_b64url>
// Both bitsets cover all HOUSES indices (72 entries = 9 bytes = 12 b64url chars).
// Total hash for a typical state with campaign "Андреевская Слобода": ~130 chars.

import { HOUSES } from "./houses";
import type { State } from "./state";

const PREFIX = "#s=";
const V = "1";

function b64Enc(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64Dec(s: string): Uint8Array {
  const padded =
    s.replace(/-/g, "+").replace(/_/g, "/") +
    "====".slice(s.length % 4 || 4);
  const bin = atob(padded);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function idsToBytes(ids: ReadonlySet<string>): Uint8Array {
  const buf = new Uint8Array(Math.ceil(HOUSES.length / 8));
  HOUSES.forEach((h, i) => {
    if (ids.has(h.id)) buf[i >> 3] |= 1 << (i & 7);
  });
  return buf;
}

function bytesToSet(bytes: Uint8Array): Set<string> {
  const set = new Set<string>();
  HOUSES.forEach((h, i) => {
    if ((bytes[i >> 3] ?? 0) & (1 << (i & 7))) set.add(h.id);
  });
  return set;
}

export function encodeStateToHash(state: State): string {
  const done = b64Enc(idsToBytes(state.done));
  const issue = b64Enc(idsToBytes(state.issue));
  const ts = state.updatedAt.toString(36);
  const campaign = b64Enc(new TextEncoder().encode(state.campaign));
  return `${PREFIX}${V}.${done}.${issue}.${ts}.${campaign}`;
}

export function decodeHashToState(hash: string): State | null {
  try {
    if (!hash.startsWith(PREFIX)) return null;
    const parts = hash.slice(PREFIX.length).split(".");
    if (parts.length < 5 || parts[0] !== V) return null;
    const done = bytesToSet(b64Dec(parts[1]));
    const issue = bytesToSet(b64Dec(parts[2]));
    const updatedAt = parseInt(parts[3], 36);
    const campaign = new TextDecoder().decode(b64Dec(parts.slice(4).join(".")));
    if (campaign.length > 256) return null;
    return { done, issue, updatedAt, campaign };
  } catch {
    return null;
  }
}

export function parseUrlHash(): State | null {
  return decodeHashToState(window.location.hash);
}
