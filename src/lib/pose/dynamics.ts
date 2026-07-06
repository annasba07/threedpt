import { LANDMARK } from "./landmarks";
import { buildSeries, type JointSeries } from "./reps";
import type { FrameLandmark, RecordedFrame } from "./types";

/**
 * Inverse dynamics — net joint moments from motion, not just posture.
 *
 * The static model (see loads.ts) only asks "how hard must this joint work to
 * hold this pose against gravity?". Real movement also loads a joint through
 * ACCELERATION: whipping a limb up and snapping it to a stop loads the joint far
 * more than moving slowly through the same positions.
 *
 * This computes the net joint moment with a reduced Newton–Euler model:
 *
 *     M_joint = Σ_i  r(joint → com_i) × m_i · (a_i − g)
 *
 * summed over the body segments distal to the joint, where a_i is the measured
 * linear acceleration of each segment's centre of mass (second time-derivative
 * of its 3D trajectory) and g is gravity. When a_i = 0 this collapses exactly to
 * the static gravitational moment — so the static case is a special case of this
 * one.
 *
 * Honestly labelled limits: we drop each segment's rotational-inertia term
 * (I·α), which is small for limb segments and dominated by noise from a single
 * camera; we don't measure ground-reaction or external forces; and absolute
 * newton-metres inherit the single-camera depth/scale error. This is a real
 * multi-body estimate for RELATIVE comparison across a movement — not a force
 * plate.
 */

const G = 9.81;
// MediaPipe world coordinates are y-DOWN, so gravity points toward +y.
const GVEC: V3 = [0, G, 0];
const L = LANDMARK;
const VIS = 0.5;
/** Cap COM acceleration (m/s²) so single-camera jitter can't blow up moments. */
const ACC_CAP = 40;

type V3 = [number, number, number];

interface Segment {
  a: number;
  b: number;
  com: number; // COM = lerp(a, b, com)
  massFrac: number; // Winter, fraction of body mass
}
interface JointDef {
  id: string;
  joint: number;
  distal: Segment[];
}

const armChain = (sh: number, el: number, wr: number): Segment[] => [
  { a: sh, b: el, com: 0.436, massFrac: 0.028 }, // upper arm
  { a: el, b: wr, com: 0.43, massFrac: 0.016 }, // forearm
  { a: wr, b: wr, com: 0, massFrac: 0.006 }, // hand
];
const legChain = (hp: number, kn: number, an: number): Segment[] => [
  { a: hp, b: kn, com: 0.433, massFrac: 0.1 }, // thigh
  { a: kn, b: an, com: 0.433, massFrac: 0.0465 }, // shank
  { a: an, b: an, com: 0, massFrac: 0.0145 }, // foot
];

const JOINTS: JointDef[] = [
  { id: "elbow_l", joint: L.LEFT_ELBOW, distal: armChain(L.LEFT_ELBOW, L.LEFT_ELBOW, L.LEFT_WRIST).slice(1) },
  { id: "elbow_r", joint: L.RIGHT_ELBOW, distal: armChain(L.RIGHT_ELBOW, L.RIGHT_ELBOW, L.RIGHT_WRIST).slice(1) },
  { id: "shoulder_l", joint: L.LEFT_SHOULDER, distal: armChain(L.LEFT_SHOULDER, L.LEFT_ELBOW, L.LEFT_WRIST) },
  { id: "shoulder_r", joint: L.RIGHT_SHOULDER, distal: armChain(L.RIGHT_SHOULDER, L.RIGHT_ELBOW, L.RIGHT_WRIST) },
  { id: "knee_l", joint: L.LEFT_KNEE, distal: legChain(L.LEFT_KNEE, L.LEFT_KNEE, L.LEFT_ANKLE).slice(1) },
  { id: "knee_r", joint: L.RIGHT_KNEE, distal: legChain(L.RIGHT_KNEE, L.RIGHT_KNEE, L.RIGHT_ANKLE).slice(1) },
  { id: "hip_l", joint: L.LEFT_HIP, distal: legChain(L.LEFT_HIP, L.LEFT_KNEE, L.LEFT_ANKLE) },
  { id: "hip_r", joint: L.RIGHT_HIP, distal: legChain(L.RIGHT_HIP, L.RIGHT_KNEE, L.RIGHT_ANKLE) },
];

export const DYNAMICS_JOINT_IDS = JOINTS.map((j) => j.id);

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const mag = (a: V3) => Math.hypot(a[0], a[1], a[2]);

const okp = (p: FrameLandmark | undefined): p is FrameLandmark => !!p && (p.visibility ?? 1) >= VIS;

function comOf(world: FrameLandmark[], seg: Segment): V3 | null {
  const a = world[seg.a];
  const b = world[seg.b];
  if (!okp(a) || !okp(b)) return null;
  return [a.x + (b.x - a.x) * seg.com, a.y + (b.y - a.y) * seg.com, a.z + (b.z - a.z) * seg.com];
}

/** Small moving-average smoother over a COM trajectory (keeps null gaps). */
function smoothTraj(traj: (V3 | null)[], w = 2): (V3 | null)[] {
  return traj.map((p, i) => {
    if (!p) return null;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (let k = i - w; k <= i + w; k++) {
      const q = traj[k];
      if (q) {
        sx += q[0];
        sy += q[1];
        sz += q[2];
        n++;
      }
    }
    return n ? [sx / n, sy / n, sz / n] : p;
  });
}

/** Non-uniform central second derivative (m/s²) of a COM trajectory. */
function accelTraj(traj: (V3 | null)[], tSec: number[]): (V3 | null)[] {
  return traj.map((p, i) => {
    const pm = traj[i - 1];
    const pp = traj[i + 1];
    if (!p || !pm || !pp) return null;
    const dtA = tSec[i] - tSec[i - 1];
    const dtB = tSec[i + 1] - tSec[i];
    if (dtA <= 0 || dtB <= 0) return null;
    const a: V3 = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const v1 = (p[c] - pm[c]) / dtA;
      const v2 = (pp[c] - p[c]) / dtB;
      let ac = (2 * (v2 - v1)) / (dtA + dtB);
      ac = Math.max(-ACC_CAP, Math.min(ACC_CAP, ac));
      a[c] = ac;
    }
    return a;
  });
}

export interface Dynamics {
  /** Net joint moment (N·m) per joint, per frame — inverse dynamics. */
  moments: Record<string, (number | null)[]>;
  /** Static gravitational-only moment per joint, per frame (for comparison). */
  gravOnly: Record<string, (number | null)[]>;
  /** Peak net moment per joint across the recording. */
  peak: Record<string, number>;
  /** Peak inertial "bonus": peak dynamic / peak static, per joint (≥1 when motion adds load). */
  inertiaFactor: Record<string, number>;
}

export function computeDynamics(frames: RecordedFrame[], bodyMassKg: number): Dynamics {
  const tSec = frames.map((f) => f.t / 1000);
  const moments: Record<string, (number | null)[]> = {};
  const gravOnly: Record<string, (number | null)[]> = {};
  const peak: Record<string, number> = {};
  const inertiaFactor: Record<string, number> = {};

  for (const def of JOINTS) {
    // Per-segment COM trajectory → smoothed → acceleration.
    const trajs = def.distal.map((seg) => smoothTraj(frames.map((f) => comOf(f.world, seg))));
    const accs = trajs.map((traj) => accelTraj(traj, tSec));

    const dyn: (number | null)[] = [];
    const grav: (number | null)[] = [];
    let pkDyn = 0;
    let pkGrav = 0;

    for (let k = 0; k < frames.length; k++) {
      const j = frames[k].world[def.joint];
      if (!okp(j)) {
        dyn.push(null);
        grav.push(null);
        continue;
      }
      const jp: V3 = [j.x, j.y, j.z];
      let Md: V3 = [0, 0, 0];
      let Mg: V3 = [0, 0, 0];
      let bad = false;
      for (let s = 0; s < def.distal.length; s++) {
        const com = trajs[s][k];
        if (!com) {
          bad = true;
          break;
        }
        const m = def.distal[s].massFrac * bodyMassKg;
        const r = sub(com, jp);
        const a = accs[s][k] ?? [0, 0, 0];
        // net inertial+gravitational force: m·(a − g)
        const fDyn: V3 = [m * (a[0] - GVEC[0]), m * (a[1] - GVEC[1]), m * (a[2] - GVEC[2])];
        const fGrav: V3 = [-m * GVEC[0], -m * GVEC[1], -m * GVEC[2]];
        Md = addV(Md, cross(r, fDyn));
        Mg = addV(Mg, cross(r, fGrav));
      }
      if (bad) {
        dyn.push(null);
        grav.push(null);
        continue;
      }
      const md = mag(Md);
      const mg = mag(Mg);
      dyn.push(md);
      grav.push(mg);
      if (md > pkDyn) pkDyn = md;
      if (mg > pkGrav) pkGrav = mg;
    }

    moments[def.id] = dyn;
    gravOnly[def.id] = grav;
    peak[def.id] = pkDyn;
    inertiaFactor[def.id] = pkGrav > 0 ? pkDyn / pkGrav : 1;
  }

  return { moments, gravOnly, peak, inertiaFactor };
}

function addV(a: V3, b: V3): V3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/** Net moments for every joint at one frame (indexes the precomputed series). */
export function dynamicsFrame(dyn: Dynamics, index: number): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const id of DYNAMICS_JOINT_IDS) out[id] = dyn.moments[id]?.[index] ?? null;
  return out;
}

/** Plotting-ready net-moment series for one joint (N·m). */
export function dynamicsSeries(frames: RecordedFrame[], dyn: Dynamics, jointId: string): JointSeries {
  const t = frames.map((f) => f.t);
  const raw = dyn.moments[jointId] ?? frames.map(() => null);
  return { jointId, ...buildSeries(t, raw, 2) };
}
