import { JOINT_ANGLES } from "../pose/landmarks";
import { extractSeries, detectReps } from "../pose/reps";
import { computeDynamics } from "../pose/dynamics";
import type { PainMarker, RecordedFrame } from "../pose/types";

/**
 * Turn a recording into the measured facts a coach would notice: range of
 * motion, left/right asymmetry, tempo, fatigue, and how a pain point relates to
 * joint load. All deterministic — these are measurements, not opinions.
 */

const jointLabel = (id: string) => JOINT_ANGLES.find((j) => j.id === id)?.label ?? id;

export interface JointRom {
  id: string;
  label: string;
  range: number;
  min: number;
  max: number;
  valid: boolean;
}

export interface Asymmetry {
  pair: string;
  label: string; // "Shoulder"
  left: number;
  right: number;
  diff: number;
  biggerSide: "left" | "right";
  pct: number; // diff / larger side
}

export interface Tempo {
  upMs: number; // avg duration of the "out" phase (rest → extreme), hold excluded
  downMs: number; // avg duration of the "back" phase (extreme → rest)
  ratio: number; // upMs / downMs
  /** Direction-aware names so a squat reads "lowering / rising", a curl "raising / lowering". */
  awayLabel: string;
  backLabel: string;
}

export interface PainContext {
  region: string;
  jointId?: string;
  angle?: number;
  loadNm?: number;
  loadPct?: number; // % of that joint's peak load in the movement
  nearPeak?: boolean;
}

export interface MovementMetrics {
  reps: number;
  primaryJoint: string;
  primaryLabel: string;
  primaryRange: number;
  roms: JointRom[];
  asymmetries: Asymmetry[]; // sorted, largest gap first
  tempo?: Tempo;
  amplitudeTrendPct?: number; // % change first→last rep amplitude (negative = fading)
  pain?: PainContext;
}

const PAIRS = [
  { key: "shoulder", label: "Shoulder", l: "shoulder_l", r: "shoulder_r" },
  { key: "elbow", label: "Elbow", l: "elbow_l", r: "elbow_r" },
  { key: "hip", label: "Hip", l: "hip_l", r: "hip_r" },
  { key: "knee", label: "Knee", l: "knee_l", r: "knee_r" },
];

const LOAD_JOINT_IDS = new Set([
  "shoulder_l", "shoulder_r", "elbow_l", "elbow_r", "hip_l", "hip_r", "knee_l", "knee_r",
]);

export function computeMetrics(
  frames: RecordedFrame[],
  primaryJoint: string,
  painMarker?: PainMarker | null,
  bodyMass = 70,
): MovementMetrics {
  const roms: JointRom[] = JOINT_ANGLES.map((def) => {
    const s = extractSeries(frames, def.id);
    return { id: def.id, label: def.label, range: s.range, min: s.min, max: s.max, valid: s.valid };
  });
  const romById: Record<string, JointRom> = Object.fromEntries(roms.map((r) => [r.id, r]));

  const asymmetries: Asymmetry[] = [];
  for (const p of PAIRS) {
    const L = romById[p.l];
    const R = romById[p.r];
    if (!L?.valid || !R?.valid) continue;
    const diff = Math.abs(L.range - R.range);
    asymmetries.push({
      pair: p.key,
      label: p.label,
      left: L.range,
      right: R.range,
      diff,
      biggerSide: L.range >= R.range ? "left" : "right",
      pct: diff / Math.max(L.range, R.range, 1),
    });
  }
  asymmetries.sort((a, b) => b.diff - a.diff);

  const reps = detectReps(frames, primaryJoint);
  let tempo: Tempo | undefined;
  let amplitudeTrendPct: number | undefined;
  if (reps.length) {
    const ps = extractSeries(frames, primaryJoint);
    // Which extreme is "rest"? The posture the movement starts and ends at.
    // Rest-high (e.g. standing knee for a squat) ⇒ the working phase FLEXES;
    // rest-low (e.g. arm-down for a curl) ⇒ the working phase EXTENDS.
    const restIsMax =
      (ps.filled[0] + ps.filled[ps.filled.length - 1]) / 2 > (ps.min + ps.max) / 2;
    const extreme = restIsMax ? ps.min : ps.max;
    const band = Math.max(2, ps.range * 0.06); // treat "at the extreme" as a dwell, not a point

    let away = 0; // rest → extreme
    let back = 0; // extreme → rest
    let n = 0;
    for (const r of reps) {
      // First/last frame the signal dwells at the extreme — excludes any hold
      // so a pause at the bottom isn't misattributed to one phase.
      let enter = -1;
      let exit = -1;
      for (let k = r.startFrame; k <= r.endFrame; k++) {
        if (Math.abs(ps.filled[k] - extreme) <= band) {
          if (enter < 0) enter = k;
          exit = k;
        }
      }
      if (enter < 0) {
        enter = r.peakFrame;
        exit = r.peakFrame;
      }
      const a = frames[enter].t - frames[r.startFrame].t;
      const b = frames[r.endFrame].t - frames[exit].t;
      if (a > 0 && b > 0) {
        away += a;
        back += b;
        n++;
      }
    }
    if (n) {
      const upMs = away / n;
      const downMs = back / n;
      const awayLabel = restIsMax ? "lowering" : "raising";
      const backLabel = restIsMax ? "rising" : "lowering";
      tempo = { upMs, downMs, ratio: upMs / downMs, awayLabel, backLabel };
    }
    if (reps.length >= 3) {
      const a0 = reps[0].amplitude;
      const aN = reps[reps.length - 1].amplitude;
      if (a0 > 0) amplitudeTrendPct = ((aN - a0) / a0) * 100;
    }
  }

  let pain: PainContext | undefined;
  if (painMarker) {
    const f = frames[painMarker.frame];
    const jointId = LOAD_JOINT_IDS.has(painMarker.regionId) ? painMarker.regionId : undefined;
    const angle = jointId ? (f?.angles[jointId] ?? undefined) : undefined;
    let loadNm: number | undefined;
    let loadPct: number | undefined;
    let nearPeak: boolean | undefined;
    if (jointId && f) {
      const dyn = computeDynamics(frames, bodyMass);
      const v = dyn.moments[jointId]?.[painMarker.frame] ?? null;
      const pk = dyn.peak[jointId];
      if (v != null) {
        loadNm = v;
        if (pk > 0) {
          loadPct = (v / pk) * 100;
          nearPeak = loadPct > 75;
        }
      }
    }
    pain = { region: painMarker.region, jointId, angle: angle ?? undefined, loadNm, loadPct, nearPeak };
  }

  return {
    reps: reps.length,
    primaryJoint,
    primaryLabel: jointLabel(primaryJoint),
    primaryRange: romById[primaryJoint]?.range ?? 0,
    roms,
    asymmetries,
    tempo,
    amplitudeTrendPct,
    pain,
  };
}
