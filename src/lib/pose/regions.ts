import { LANDMARK } from "./landmarks";
import type { FrameLandmark } from "./types";

/**
 * Body regions a pain marker can attach to. Each region resolves to a 3D point
 * from a frame's world landmarks, so a marker rides the body as it moves. Some
 * regions are single joints; torso regions are interpolated between the
 * shoulder and hip midlines.
 */
export interface Region {
  id: string;
  label: string;
  resolve: (w: FrameLandmark[]) => [number, number, number] | null;
}

function pt(p: FrameLandmark | undefined): [number, number, number] | null {
  if (!p) return null;
  return [p.x, p.y, p.z];
}

function mid(
  a: FrameLandmark | undefined,
  b: FrameLandmark | undefined,
): [number, number, number] | null {
  if (!a || !b) return null;
  return [(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2];
}

function lerp(
  a: [number, number, number] | null,
  b: [number, number, number] | null,
  t: number,
): [number, number, number] | null {
  if (!a || !b) return null;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export const REGIONS: Region[] = [
  { id: "head", label: "Head", resolve: (w) => pt(w[LANDMARK.NOSE]) },
  { id: "neck", label: "Neck", resolve: (w) => mid(w[LANDMARK.LEFT_SHOULDER], w[LANDMARK.RIGHT_SHOULDER]) },
  {
    id: "chest",
    label: "Chest / upper back",
    resolve: (w) =>
      lerp(
        mid(w[LANDMARK.LEFT_SHOULDER], w[LANDMARK.RIGHT_SHOULDER]),
        mid(w[LANDMARK.LEFT_HIP], w[LANDMARK.RIGHT_HIP]),
        0.35,
      ),
  },
  {
    id: "abdomen",
    label: "Abdomen / low back",
    resolve: (w) =>
      lerp(
        mid(w[LANDMARK.LEFT_SHOULDER], w[LANDMARK.RIGHT_SHOULDER]),
        mid(w[LANDMARK.LEFT_HIP], w[LANDMARK.RIGHT_HIP]),
        0.7,
      ),
  },
  { id: "shoulder_l", label: "Left shoulder", resolve: (w) => pt(w[LANDMARK.LEFT_SHOULDER]) },
  { id: "shoulder_r", label: "Right shoulder", resolve: (w) => pt(w[LANDMARK.RIGHT_SHOULDER]) },
  { id: "elbow_l", label: "Left elbow", resolve: (w) => pt(w[LANDMARK.LEFT_ELBOW]) },
  { id: "elbow_r", label: "Right elbow", resolve: (w) => pt(w[LANDMARK.RIGHT_ELBOW]) },
  { id: "wrist_l", label: "Left wrist / hand", resolve: (w) => pt(w[LANDMARK.LEFT_WRIST]) },
  { id: "wrist_r", label: "Right wrist / hand", resolve: (w) => pt(w[LANDMARK.RIGHT_WRIST]) },
  { id: "hip_l", label: "Left hip", resolve: (w) => pt(w[LANDMARK.LEFT_HIP]) },
  { id: "hip_r", label: "Right hip", resolve: (w) => pt(w[LANDMARK.RIGHT_HIP]) },
  { id: "knee_l", label: "Left knee", resolve: (w) => pt(w[LANDMARK.LEFT_KNEE]) },
  { id: "knee_r", label: "Right knee", resolve: (w) => pt(w[LANDMARK.RIGHT_KNEE]) },
  { id: "ankle_l", label: "Left ankle / foot", resolve: (w) => pt(w[LANDMARK.LEFT_ANKLE]) },
  { id: "ankle_r", label: "Right ankle / foot", resolve: (w) => pt(w[LANDMARK.RIGHT_ANKLE]) },
];

export const REGION_BY_ID: Record<string, Region> = Object.fromEntries(
  REGIONS.map((r) => [r.id, r]),
);

/**
 * Convert a MediaPipe world landmark (meters; x right, y down, z depth) into the
 * Three.js frame (y up). One place so landmarks, regions, and markers all agree.
 */
export function worldToThree(p: [number, number, number]): [number, number, number] {
  return [p[0], -p[1], -p[2]];
}

/** Region position in Three.js space for a given frame, or null if unresolved. */
export function regionThreePos(
  regionId: string,
  world: FrameLandmark[],
): [number, number, number] | null {
  const r = REGION_BY_ID[regionId];
  if (!r) return null;
  const p = r.resolve(world);
  return p ? worldToThree(p) : null;
}

/** Nearest region to a Three.js-space point, for snapping a click to the body. */
export function nearestRegion(
  world: FrameLandmark[],
  point: [number, number, number],
): { region: Region; distance: number } | null {
  let best: Region | null = null;
  let bestD = Infinity;
  for (const r of REGIONS) {
    const p = r.resolve(world);
    if (!p) continue;
    const tp = worldToThree(p);
    const d = Math.hypot(tp[0] - point[0], tp[1] - point[1], tp[2] - point[2]);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best ? { region: best, distance: bestD } : null;
}
