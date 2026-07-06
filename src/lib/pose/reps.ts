import { JOINT_ANGLES } from "./landmarks";
import type { RecordedFrame, Rep } from "./types";

export interface JointSeries {
  jointId: string;
  /** Per-frame timestamps (ms). */
  t: number[];
  /** Per-frame raw angle, null where the joint was unreliable. */
  raw: (number | null)[];
  /** Gap-filled + lightly smoothed angle used for detection and the chart line. */
  filled: number[];
  min: number;
  max: number;
  range: number;
  /** True when there is enough signal to analyze. */
  valid: boolean;
}

function movingAverage(xs: number[], window: number): number[] {
  if (window <= 1 || xs.length === 0) return xs.slice();
  const half = Math.floor(window / 2);
  const out = new Array<number>(xs.length);
  for (let i = 0; i < xs.length; i++) {
    let sum = 0;
    let n = 0;
    for (let j = i - half; j <= i + half; j++) {
      if (j >= 0 && j < xs.length) {
        sum += xs[j];
        n++;
      }
    }
    out[i] = sum / n;
  }
  return out;
}

/** Extract one joint's angle over the whole recording, with gaps interpolated. */
export function extractSeries(frames: RecordedFrame[], jointId: string): JointSeries {
  const t = frames.map((f) => f.t);
  const raw = frames.map((f) => {
    const v = f.angles[jointId];
    return v === undefined ? null : v;
  });
  return { jointId, ...buildSeries(t, raw) };
}

/**
 * Turn timestamps + a possibly-gappy value array into a plotting-ready series:
 * gaps linearly interpolated, lightly smoothed, with min/max/range. Shared by
 * the angle chart and the estimated-load chart.
 */
export function buildSeries(
  t: number[],
  raw: (number | null)[],
  minRange = 8,
): Omit<JointSeries, "jointId"> {
  const firstIdx = raw.findIndex((v) => v !== null);
  const lastIdx = (() => {
    for (let i = raw.length - 1; i >= 0; i--) if (raw[i] !== null) return i;
    return -1;
  })();

  if (firstIdx === -1 || lastIdx === -1) {
    return { t, raw, filled: raw.map(() => 0), min: 0, max: 0, range: 0, valid: false };
  }

  // Linear interpolation across null gaps; hold endpoints.
  const filledRaw = raw.map((v) => v);
  for (let i = 0; i < firstIdx; i++) filledRaw[i] = raw[firstIdx];
  for (let i = lastIdx + 1; i < filledRaw.length; i++) filledRaw[i] = raw[lastIdx];
  let i = firstIdx;
  while (i <= lastIdx) {
    if (filledRaw[i] !== null) {
      i++;
      continue;
    }
    let j = i;
    while (j <= lastIdx && filledRaw[j] === null) j++;
    const before = filledRaw[i - 1] as number;
    const after = filledRaw[j] as number;
    const span = j - (i - 1);
    for (let k = i; k < j; k++) {
      filledRaw[k] = before + ((after - before) * (k - (i - 1))) / span;
    }
    i = j;
  }

  const filled = movingAverage(filledRaw as number[], 5);
  let min = Infinity;
  let max = -Infinity;
  for (const v of filled) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  return { t, raw, filled, min, max, range, valid: range >= minRange };
}

/** Choose the joint that moved the most — the one worth counting reps on. */
export function pickPrimaryJoint(frames: RecordedFrame[]): string {
  let best = JOINT_ANGLES[0]?.id ?? "elbow_l";
  let bestRange = -1;
  for (const def of JOINT_ANGLES) {
    const s = extractSeries(frames, def.id);
    if (s.valid && s.range > bestRange) {
      bestRange = s.range;
      best = def.id;
    }
  }
  return best;
}

/**
 * Count repetitions on a joint's angle signal.
 *
 * A rep is one excursion away from the resting position and back. Using the
 * majority "rest" zone (with a hysteresis band) makes this work whether the
 * resting angle is high (e.g. standing for squats) or low (e.g. arm down for
 * curls), and rejects short, low-amplitude wobble as noise.
 */
export function detectReps(frames: RecordedFrame[], jointId: string): Rep[] {
  const s = extractSeries(frames, jointId);
  if (!s.valid || frames.length < 6) return [];

  const { filled, min, range } = s;
  const low = min + 0.3 * range;
  const high = min + 0.7 * range;

  // Assign each frame to the low/high zone with hysteresis.
  const zones: ("L" | "H")[] = [];
  let zone: "L" | "H" = filled[0] > (min + range / 2) ? "H" : "L";
  for (const v of filled) {
    if (v >= high) zone = "H";
    else if (v <= low) zone = "L";
    zones.push(zone);
  }

  // The resting position is where a movement starts and ends. When the
  // endpoints agree, that zone is rest; otherwise fall back to the majority
  // zone. (Using majority alone mis-picks rest on symmetric signals and
  // double-counts the boundary excursion.)
  let restZone: "L" | "H";
  if (zones[0] === zones[zones.length - 1]) {
    restZone = zones[0];
  } else {
    const countL = zones.filter((z) => z === "L").length;
    restZone = countL >= zones.length / 2 ? "L" : "H";
  }
  const moveZone: "L" | "H" = restZone === "L" ? "H" : "L";

  const minAmplitude = Math.max(10, range * 0.4);
  const minFrames = 3;

  const reps: Rep[] = [];
  let runStart = -1;
  for (let i = 0; i <= zones.length; i++) {
    const inMove = i < zones.length && zones[i] === moveZone;
    if (inMove && runStart === -1) {
      runStart = i;
    } else if (!inMove && runStart !== -1) {
      const runEnd = i - 1;
      // Find the extreme within the excursion.
      let peak = runStart;
      for (let k = runStart; k <= runEnd; k++) {
        if (moveZone === "H" ? filled[k] > filled[peak] : filled[k] < filled[peak]) peak = k;
      }
      const startFrame = Math.max(0, runStart - 1);
      const endFrame = Math.min(frames.length - 1, runEnd + 1);
      const restLevel = restZone === "L" ? min : s.max;
      const amplitude = Math.abs(filled[peak] - restLevel);
      if (runEnd - runStart + 1 >= minFrames && amplitude >= minAmplitude) {
        reps.push({
          index: reps.length + 1,
          startFrame,
          peakFrame: peak,
          endFrame,
          startT: frames[startFrame].t,
          peakT: frames[peak].t,
          endT: frames[endFrame].t,
          amplitude,
        });
      }
      runStart = -1;
    }
  }
  return reps;
}
