/**
 * Geometry helpers for pose analysis.
 *
 * Angles are computed from MediaPipe *world* landmarks (metric, hip-centered 3D)
 * rather than the normalized image landmarks. World coordinates are far less
 * distorted by camera perspective, which is why joint-angle readouts from a
 * single webcam are trustworthy while absolute 3D position is not.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
  /** MediaPipe per-landmark visibility in [0,1], if available. */
  visibility?: number;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}

/**
 * Interior angle in degrees at `vertex`, between the segments (vertex→a) and
 * (vertex→c). Returns null when either segment is degenerate.
 */
export function angleAtVertex(a: Vec3, vertex: Vec3, c: Vec3): number | null {
  const u = sub(a, vertex);
  const v = sub(c, vertex);
  const lu = length(u);
  const lv = length(v);
  if (lu < 1e-6 || lv < 1e-6) return null;
  const cos = Math.min(1, Math.max(-1, dot(u, v) / (lu * lv)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Minimum visibility across a set of landmarks; undefined visibility counts as 1. */
export function minVisibility(...points: Vec3[]): number {
  return points.reduce((m, p) => Math.min(m, p.visibility ?? 1), 1);
}

/** Exponential smoothing to reduce per-frame jitter in a scalar readout. */
export function smooth(prev: number | null, next: number, alpha = 0.4): number {
  if (prev === null || Number.isNaN(prev)) return next;
  return prev + alpha * (next - prev);
}
