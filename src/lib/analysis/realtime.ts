/**
 * Real-time movement coach — live reps and form cues WHILE you move, from the
 * same joint angles the live pose loop already computes.
 *
 * Deterministic and online: you feed it one frame of joint angles at a time and
 * it returns the current state (rep count, the active joint, and at most one
 * sticky cue). Cues are held for a minimum duration and chosen by priority so
 * they don't flicker frame to frame.
 */

const PAIRS: Record<string, [string, string]> = {
  Shoulder: ["shoulder_l", "shoulder_r"],
  Elbow: ["elbow_l", "elbow_r"],
  Hip: ["hip_l", "hip_r"],
  Knee: ["knee_l", "knee_r"],
};
const JOINT_TO_PAIR: Record<string, { label: string; other: string }> = {};
for (const [label, [l, r]] of Object.entries(PAIRS)) {
  JOINT_TO_PAIR[l] = { label, other: r };
  JOINT_TO_PAIR[r] = { label, other: l };
}
const ALL_JOINTS = Object.values(PAIRS).flat();
const SIDE = (id: string) => (id.endsWith("_l") ? "left" : "right");

const MIN_RANGE = 14; // deg — below this a joint isn't really "working"
const SYMMETRY_GAP = 16; // deg live L/R difference to flag
const FAST_VEL = 260; // deg/s — above this the movement is rushed
const CUE_HOLD_MS = 1100; // keep a cue at least this long
const WINDOW_MS = 2500;

export type CueTone = "good" | "info" | "warn";
export interface Cue {
  text: string;
  tone: CueTone;
}
export interface LiveState {
  reps: number;
  activeJoint: string | null;
  activeLabel: string | null;
  cue: Cue | null;
  /** 0..1 position within the current rep's range (for a progress ring). */
  progress: number;
}

interface Sample {
  t: number;
  a: Record<string, number | null>;
}

export class LiveCoach {
  private buf: Sample[] = [];
  private ext: Record<string, { min: number; max: number }> = {};
  private active: string | null = null;
  private phase: "low" | "high" = "low";
  private repCount = 0;
  private repMaxAmp = 1;
  private lastRepAmp = 1;
  private cue: Cue | null = null;
  private cueSince = 0;

  reset() {
    this.buf = [];
    this.ext = {};
    this.active = null;
    this.phase = "low";
    this.repCount = 0;
    this.repMaxAmp = 1;
    this.lastRepAmp = 1;
    this.cue = null;
    this.cueSince = 0;
  }

  get reps() {
    return this.repCount;
  }

  push(angles: Record<string, number | null>, t: number): LiveState {
    this.buf.push({ t, a: angles });
    while (this.buf.length && t - this.buf[0].t > WINDOW_MS) this.buf.shift();

    // Track session extremes per joint (for rep normalization).
    for (const id of ALL_JOINTS) {
      const v = angles[id];
      if (v == null) continue;
      const e = this.ext[id] ?? (this.ext[id] = { min: v, max: v });
      if (v < e.min) e.min = v;
      if (v > e.max) e.max = v;
    }

    // Pick the active joint = largest range over the window (sticky).
    const rangeOf = (id: string) => {
      let mn = Infinity, mx = -Infinity;
      for (const s of this.buf) {
        const v = s.a[id];
        if (v == null) continue;
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      return mx - mn < 0 ? 0 : mx - mn;
    };
    let best = this.active;
    let bestR = best ? rangeOf(best) : 0;
    for (const id of ALL_JOINTS) {
      const r = rangeOf(id);
      // switch only if clearly more active, to avoid jitter
      if (r > Math.max(MIN_RANGE, bestR * 1.25)) {
        best = id;
        bestR = r;
      }
    }
    if (bestR < MIN_RANGE) best = this.active; // keep last if nothing is moving
    if (best !== this.active) {
      this.active = best;
      this.phase = "low";
    }

    const active = this.active;
    let progress = 0;

    // Online rep counting on the active joint via hysteresis.
    if (active) {
      const e = this.ext[active];
      const cur = angles[active];
      if (e && cur != null) {
        const range = e.max - e.min;
        if (range >= MIN_RANGE) {
          const v = (cur - e.min) / range; // 0..1
          progress = Math.min(1, Math.max(0, v));
          if (this.phase === "low" && v > 0.7) {
            this.phase = "high";
          } else if (this.phase === "high" && v < 0.3) {
            this.phase = "low";
            this.repCount += 1;
            this.lastRepAmp = range;
            if (range > this.repMaxAmp) this.repMaxAmp = range;
          }
        }
      }
    }

    this.updateCue(active, t, progress);
    return {
      reps: this.repCount,
      activeJoint: active,
      activeLabel: active ? JOINT_TO_PAIR[active]?.label ?? active : null,
      cue: this.cue,
      progress,
    };
  }

  private velocity(id: string): number {
    if (this.buf.length < 2) return 0;
    const last = this.buf[this.buf.length - 1];
    // find a sample ~120ms back
    let prev = this.buf[this.buf.length - 2];
    for (let i = this.buf.length - 2; i >= 0; i--) {
      if (last.t - this.buf[i].t >= 120) {
        prev = this.buf[i];
        break;
      }
    }
    const a1 = last.a[id];
    const a0 = prev.a[id];
    const dt = (last.t - prev.t) / 1000;
    if (a1 == null || a0 == null || dt <= 0) return 0;
    return Math.abs(a1 - a0) / dt;
  }

  private updateCue(active: string | null, t: number, progress: number) {
    const next = this.evaluateCue(active, progress);
    if (!this.cue) {
      this.cue = next;
      this.cueSince = t;
      return;
    }
    // hold the current cue unless the new one is different AND the hold elapsed,
    // or the new one is a higher-severity warning
    const sev = (c: Cue | null) => (c?.tone === "warn" ? 2 : c?.tone === "info" ? 1 : 0);
    const held = t - this.cueSince;
    if (next && next.text !== this.cue.text && (held >= CUE_HOLD_MS || sev(next) > sev(this.cue))) {
      this.cue = next;
      this.cueSince = t;
    } else if (next && next.text === this.cue.text) {
      // same cue, keep timestamp reference fresh-ish (no reset)
    }
  }

  private evaluateCue(active: string | null, progress: number): Cue {
    if (!active) return { text: "Start moving — I'll follow along", tone: "info" };

    const pair = JOINT_TO_PAIR[active];
    const latest = this.buf[this.buf.length - 1]?.a ?? {};

    // 1) Symmetry (highest priority — asymmetry is the thing to catch)
    if (pair) {
      const a = latest[active];
      const b = latest[pair.other];
      if (a != null && b != null && Math.abs(a - b) > SYMMETRY_GAP) {
        const lagging = a < b ? SIDE(active) : SIDE(pair.other);
        return { text: `Even it out — your ${lagging} side is lagging`, tone: "warn" };
      }
    }

    // 2) Tempo — rushing
    if (this.velocity(active) > FAST_VEL) {
      return { text: "Slow it down — stay in control", tone: "warn" };
    }

    // 3) Range — shallow reps once we know your usual range
    if (this.repCount >= 1 && this.lastRepAmp < this.repMaxAmp * 0.6) {
      return { text: "Go for your full range", tone: "info" };
    }

    // 4) Encouragement at the top of a rep
    if (progress > 0.75) return { text: "Nice — full and controlled", tone: "good" };
    return { text: "Looking smooth", tone: "good" };
  }
}
