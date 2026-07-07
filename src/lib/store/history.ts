/**
 * Local-first session history — the progress loop.
 *
 * Each analyzed movement is summarised to a small record and kept in the
 * browser (localStorage, on-device — nothing is uploaded, consistent with the
 * rest of the app). Re-record the same movement over days/weeks and the review
 * can show whether your range, symmetry, and load are actually improving.
 *
 * Only compact summaries are stored (a few numbers each), never the raw frames,
 * so history stays tiny and private.
 */

export interface SessionSummary {
  id: string; // recording id (dedupe key)
  ts: number; // epoch ms
  movement: string; // normalized movement name, e.g. "Shoulder"
  reps: number;
  rangeDeg: number;
  asymmetryDeg: number | null;
  tempoRatio: number | null;
  peakLoadNm: number | null;
  /** Guided-assessment form score (0–100), or null for a free recording. */
  score: number | null;
  pain: { region: string; intensity: number } | null;
}

export type MetricKey = "asymmetryDeg" | "rangeDeg" | "peakLoadNm" | "reps" | "tempoRatio" | "score";

const KEY = "threedpt.history.v1";
const MAX = 300;

// ---- pure helpers (unit-tested) -------------------------------------------

/** Insert or replace by id. */
export function upsert(list: SessionSummary[], s: SessionSummary): SessionSummary[] {
  const i = list.findIndex((x) => x.id === s.id);
  if (i >= 0) {
    const copy = list.slice();
    copy[i] = s;
    return copy;
  }
  return [...list, s];
}

/** All sessions of a movement, oldest → newest. */
export function forMovement(list: SessionSummary[], movement: string): SessionSummary[] {
  return list.filter((x) => x.movement === movement).sort((a, b) => a.ts - b.ts);
}

/** Chronological values of one metric for a movement (nulls dropped). */
export function trend(list: SessionSummary[], movement: string, key: MetricKey): number[] {
  return forMovement(list, movement)
    .map((s) => s[key])
    .filter((v): v is number => v != null);
}

// ---- storage wrappers ------------------------------------------------------

export function loadHistory(): SessionSummary[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SessionSummary[]) : [];
  } catch {
    return [];
  }
}

/** Save (dedupe by id) and return the updated list. */
export function saveSession(s: SessionSummary): SessionSummary[] {
  const next = upsert(loadHistory(), s).slice(-MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode — history is best-effort */
  }
  return next;
}

export function sessionsForMovement(movement: string): SessionSummary[] {
  return forMovement(loadHistory(), movement);
}

export function clearHistory(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
