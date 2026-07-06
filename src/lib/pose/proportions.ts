import { LANDMARK } from "./landmarks";
import type { FrameLandmark, RecordedFrame } from "./types";

/**
 * Body dimensions (metres) measured from a recording's world landmarks. Segment
 * *lengths* are already implied by the landmark positions each frame; what we
 * derive here are the person's proportions — widths and limb lengths — so the
 * rendered body can be shaped to their actual build rather than a generic one.
 */
export interface BodyProportions {
  shoulderWidth: number;
  hipWidth: number;
  torsoLength: number;
  upperArm: number;
  forearm: number;
  thigh: number;
  shin: number;
}

const L = LANDMARK;

const FALLBACK: BodyProportions = {
  shoulderWidth: 0.38,
  hipWidth: 0.32,
  torsoLength: 0.5,
  upperArm: 0.28,
  forearm: 0.25,
  thigh: 0.4,
  shin: 0.4,
};

function dist(a: FrameLandmark, b: FrameLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Median distance between two landmarks across frames where both are confident. */
function segment(frames: RecordedFrame[], ai: number, bi: number): number {
  const vals: number[] = [];
  for (const f of frames) {
    const a = f.world[ai];
    const b = f.world[bi];
    if (!a || !b) continue;
    if ((a.visibility ?? 1) < 0.5 || (b.visibility ?? 1) < 0.5) continue;
    vals.push(dist(a, b));
  }
  return median(vals);
}

/** Average two measurements, tolerating NaN on either side. */
function avg(a: number, b: number): number {
  const vals = [a, b].filter((v) => Number.isFinite(v));
  return vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : NaN;
}

function pick(measured: number, fallback: number): number {
  return Number.isFinite(measured) && measured > 0 ? measured : fallback;
}

export function measureProportions(frames: RecordedFrame[]): BodyProportions {
  if (frames.length === 0 || (frames[0].world?.length ?? 0) === 0) return { ...FALLBACK };

  const shoulderWidth = segment(frames, L.LEFT_SHOULDER, L.RIGHT_SHOULDER);
  const hipWidth = segment(frames, L.LEFT_HIP, L.RIGHT_HIP);
  const torsoLength = avg(
    segment(frames, L.LEFT_SHOULDER, L.LEFT_HIP),
    segment(frames, L.RIGHT_SHOULDER, L.RIGHT_HIP),
  );
  const upperArm = avg(
    segment(frames, L.LEFT_SHOULDER, L.LEFT_ELBOW),
    segment(frames, L.RIGHT_SHOULDER, L.RIGHT_ELBOW),
  );
  const forearm = avg(
    segment(frames, L.LEFT_ELBOW, L.LEFT_WRIST),
    segment(frames, L.RIGHT_ELBOW, L.RIGHT_WRIST),
  );
  const thigh = avg(
    segment(frames, L.LEFT_HIP, L.LEFT_KNEE),
    segment(frames, L.RIGHT_HIP, L.RIGHT_KNEE),
  );
  const shin = avg(
    segment(frames, L.LEFT_KNEE, L.LEFT_ANKLE),
    segment(frames, L.RIGHT_KNEE, L.RIGHT_ANKLE),
  );

  return {
    shoulderWidth: pick(shoulderWidth, FALLBACK.shoulderWidth),
    hipWidth: pick(hipWidth, FALLBACK.hipWidth),
    torsoLength: pick(torsoLength, FALLBACK.torsoLength),
    upperArm: pick(upperArm, FALLBACK.upperArm),
    forearm: pick(forearm, FALLBACK.forearm),
    thigh: pick(thigh, FALLBACK.thigh),
    shin: pick(shin, FALLBACK.shin),
  };
}
