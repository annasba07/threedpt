import { LANDMARK } from "./landmarks";
import { buildSeries, type JointSeries } from "./reps";
import type { FrameLandmark, RecordedFrame } from "./types";

/**
 * Estimated joint load (quasi-static gravitational moment).
 *
 * This is a DELIBERATELY SIMPLE estimate: for each joint it sums the
 * gravitational torque of the body segments hanging distal to it, using
 * standard anthropometric segment masses (Winter, fractions of body mass) and
 * the segment centres of mass measured from the 3D world landmarks.
 *
 * What it captures: how hard a joint must work to hold a posture against gravity
 * — which is why it changes dramatically with position. Good for RELATIVE
 * comparison across the movement.
 *
 * What it ignores (so: not a real force reading): acceleration/dynamics, muscle
 * co-contraction, ground-reaction forces, external loads, and the single-camera
 * depth error. Absolute newton-metres here are ballpark, not clinical.
 */

const G = 9.81;
const L = LANDMARK;
const VIS = 0.5;

interface DistalSegment {
  /** COM = lerp(a, b, com). Point-mass segments (hand/foot) use a === b. */
  a: number;
  b: number;
  com: number;
  /** Segment mass as a fraction of total body mass (Winter). */
  massFrac: number;
}

interface LoadJoint {
  id: string;
  joint: number;
  distal: DistalSegment[];
}

function armChain(shoulder: number, elbow: number, wrist: number): DistalSegment[] {
  return [
    { a: shoulder, b: elbow, com: 0.436, massFrac: 0.028 }, // upper arm
    { a: elbow, b: wrist, com: 0.43, massFrac: 0.016 }, // forearm
    { a: wrist, b: wrist, com: 0, massFrac: 0.006 }, // hand
  ];
}
function legChain(hip: number, knee: number, ankle: number): DistalSegment[] {
  return [
    { a: hip, b: knee, com: 0.433, massFrac: 0.1 }, // thigh
    { a: knee, b: ankle, com: 0.433, massFrac: 0.0465 }, // shank
    { a: ankle, b: ankle, com: 0, massFrac: 0.0145 }, // foot
  ];
}

const LOAD_JOINTS: LoadJoint[] = [
  { id: "elbow_l", joint: L.LEFT_ELBOW, distal: armChain(L.LEFT_ELBOW, L.LEFT_ELBOW, L.LEFT_WRIST).slice(1) },
  { id: "elbow_r", joint: L.RIGHT_ELBOW, distal: armChain(L.RIGHT_ELBOW, L.RIGHT_ELBOW, L.RIGHT_WRIST).slice(1) },
  { id: "shoulder_l", joint: L.LEFT_SHOULDER, distal: armChain(L.LEFT_SHOULDER, L.LEFT_ELBOW, L.LEFT_WRIST) },
  { id: "shoulder_r", joint: L.RIGHT_SHOULDER, distal: armChain(L.RIGHT_SHOULDER, L.RIGHT_ELBOW, L.RIGHT_WRIST) },
  { id: "knee_l", joint: L.LEFT_KNEE, distal: legChain(L.LEFT_KNEE, L.LEFT_KNEE, L.LEFT_ANKLE).slice(1) },
  { id: "knee_r", joint: L.RIGHT_KNEE, distal: legChain(L.RIGHT_KNEE, L.RIGHT_KNEE, L.RIGHT_ANKLE).slice(1) },
  { id: "hip_l", joint: L.LEFT_HIP, distal: legChain(L.LEFT_HIP, L.LEFT_KNEE, L.LEFT_ANKLE) },
  { id: "hip_r", joint: L.RIGHT_HIP, distal: legChain(L.RIGHT_HIP, L.RIGHT_KNEE, L.RIGHT_ANKLE) },
];

export const LOAD_JOINT_IDS = LOAD_JOINTS.map((j) => j.id);

function ok(p: FrameLandmark | undefined): p is FrameLandmark {
  return !!p && (p.visibility ?? 1) >= VIS;
}

/** Horizontal (gravity-perpendicular) distance between two world points, metres. */
function horizontal(a: FrameLandmark, b: FrameLandmark): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function jointLoad(world: FrameLandmark[], def: LoadJoint, bodyMassKg: number): number | null {
  const j = world[def.joint];
  if (!ok(j)) return null;
  let moment = 0;
  for (const seg of def.distal) {
    const a = world[seg.a];
    const b = world[seg.b];
    if (!ok(a) || !ok(b)) return null;
    const com: FrameLandmark = {
      x: a.x + (b.x - a.x) * seg.com,
      y: a.y + (b.y - a.y) * seg.com,
      z: a.z + (b.z - a.z) * seg.com,
    };
    moment += seg.massFrac * bodyMassKg * G * horizontal(com, j);
  }
  return moment;
}

/** Estimated load (N·m) for every load-bearing joint at one frame. */
export function computeFrameLoads(
  world: FrameLandmark[],
  bodyMassKg: number,
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const def of LOAD_JOINTS) out[def.id] = jointLoad(world, def, bodyMassKg);
  return out;
}

/** Peak estimated load per joint across the whole recording. */
export function peakLoads(frames: RecordedFrame[], bodyMassKg: number): Record<string, number> {
  const peak: Record<string, number> = {};
  for (const def of LOAD_JOINTS) peak[def.id] = 0;
  for (const f of frames) {
    for (const def of LOAD_JOINTS) {
      const v = jointLoad(f.world, def, bodyMassKg);
      if (v != null && v > peak[def.id]) peak[def.id] = v;
    }
  }
  return peak;
}

/** Per-frame load series for one joint (for the chart). */
export function loadSeriesRaw(
  frames: RecordedFrame[],
  jointId: string,
  bodyMassKg: number,
): (number | null)[] {
  const def = LOAD_JOINTS.find((d) => d.id === jointId);
  if (!def) return frames.map(() => null);
  return frames.map((f) => jointLoad(f.world, def, bodyMassKg));
}

/** Plotting-ready load series for one joint (for the chart, in N·m). */
export function extractLoadSeries(
  frames: RecordedFrame[],
  jointId: string,
  bodyMassKg: number,
): JointSeries {
  const t = frames.map((f) => f.t);
  const raw = loadSeriesRaw(frames, jointId, bodyMassKg);
  return { jointId, ...buildSeries(t, raw, 2) };
}

/** Green→amber→red for a 0..1 load ratio. */
export function loadColor(ratio: number): string {
  const t = Math.min(1, Math.max(0, ratio));
  const hue = 130 - 130 * t; // 130 green → 0 red
  return `hsl(${hue}, 85%, 50%)`;
}
