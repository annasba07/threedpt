import type { FrameLandmark } from "./types";

/**
 * One Euro filter — low-latency jitter reduction for noisy signals. At low
 * speed it smooths hard (kills tremor); as the signal moves faster it loosens
 * (avoids lag). The standard choice for real-time pose keypoints.
 * https://gery.casiez.net/1euro/
 */
class OneEuro {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev = 0;

  constructor(
    private minCutoff = 1.4,
    private beta = 0.6,
    private dCutoff = 1.0,
  ) {}

  private alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  reset() {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = 0;
  }

  /** Current smoothed value without advancing (for freezing occluded points). */
  peek(): number | null {
    return this.xPrev;
  }

  filter(x: number, tMs: number): number {
    if (this.xPrev === null) {
      this.xPrev = x;
      this.tPrev = tMs;
      return x;
    }
    const dt = Math.max(1e-3, (tMs - this.tPrev) / 1000);
    this.tPrev = tMs;
    const dx = (x - this.xPrev) / dt;
    const aD = this.alpha(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    this.dxPrev = dxHat;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = this.alpha(cutoff, dt);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.xPrev = xHat;
    return xHat;
  }
}

/** Below this visibility a landmark is held at its last good position, not tracked. */
const FREEZE_GATE = 0.3;

/**
 * Smooths a whole landmark array over time. Occluded/low-confidence points are
 * frozen at their last confident position instead of being allowed to jump
 * around, so parts of the body that weren't really captured stop thrashing.
 */
export class LandmarkSmoother {
  private fx: OneEuro[];
  private fy: OneEuro[];
  private fz: OneEuro[];
  private last: FrameLandmark[] = [];

  constructor(
    private count: number,
    private dims: 2 | 3,
  ) {
    const mk = () => new OneEuro();
    this.fx = Array.from({ length: count }, mk);
    this.fy = Array.from({ length: count }, mk);
    this.fz = Array.from({ length: count }, mk);
  }

  reset() {
    this.fx.forEach((f) => f.reset());
    this.fy.forEach((f) => f.reset());
    this.fz.forEach((f) => f.reset());
    this.last = [];
  }

  /**
   * @param visibilities Authoritative per-landmark visibility (from the image
   *   landmarks), used to gate freezing for both 2D and 3D smoothers.
   */
  process(landmarks: FrameLandmark[], visibilities: number[], tMs: number): FrameLandmark[] {
    const out: FrameLandmark[] = new Array(this.count);
    for (let i = 0; i < this.count; i++) {
      const p = landmarks[i];
      const vis = visibilities[i] ?? p?.visibility ?? 1;
      if (!p) {
        out[i] = this.last[i] ?? { x: 0, y: 0, z: 0, visibility: 0 };
        continue;
      }
      if (vis < FREEZE_GATE && this.last[i]) {
        // Hold the last confident position; mark it as low confidence.
        out[i] = { ...this.last[i], visibility: vis };
      } else {
        out[i] = {
          x: this.fx[i].filter(p.x, tMs),
          y: this.fy[i].filter(p.y, tMs),
          z: this.dims === 3 ? this.fz[i].filter(p.z, tMs) : p.z,
          visibility: vis,
        };
      }
      this.last[i] = out[i];
    }
    return out;
  }
}
