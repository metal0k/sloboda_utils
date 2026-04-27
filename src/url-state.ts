// Cross-device sync via URL hash.
//
// Format: #s=2.<done_b64url>.<issue_b64url>.<updatedAt_b36>.<name_b64url>
// Both bitsets cover all HOUSES indices (72 entries = 9 bytes = 12 b64url chars).
// Version "1" (legacy single-campaign links) is accepted as equivalent to "2".

import { HOUSES } from "./houses";
import type { Project, SharedSnapshot } from "./state";

const PREFIX = "#s=";
const V = "2";
const ACCEPTED_VERSIONS = new Set(["1", "2"]);

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

export function encodeProjectToHash(project: Project): string {
  const done = b64Enc(idsToBytes(project.done));
  const issue = b64Enc(idsToBytes(project.issue));
  const ts = project.updatedAt.toString(36);
  const name = b64Enc(new TextEncoder().encode(project.name));
  return `${PREFIX}${V}.${done}.${issue}.${ts}.${name}`;
}

export function decodeHashToSnapshot(hash: string): SharedSnapshot | null {
  try {
    if (!hash.startsWith(PREFIX)) return null;
    const parts = hash.slice(PREFIX.length).split(".");
    if (parts.length < 5 || !ACCEPTED_VERSIONS.has(parts[0])) return null;
    const done = bytesToSet(b64Dec(parts[1]));
    const issue = bytesToSet(b64Dec(parts[2]));
    const updatedAt = parseInt(parts[3], 36);
    if (!Number.isFinite(updatedAt)) return null;
    const name = new TextDecoder().decode(b64Dec(parts.slice(4).join(".")));
    if (name.length > 256) return null;
    return { done, issue, updatedAt, name };
  } catch {
    return null;
  }
}

export function parseUrlHash(): SharedSnapshot | null {
  return decodeHashToSnapshot(window.location.hash);
}
