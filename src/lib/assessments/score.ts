import type { MovementMetrics } from "../analysis/metrics";
import type { Assessment } from "./catalog";

/**
 * Score a recorded movement against an assessment's good-form targets.
 * Deterministic and transparent: three sub-scores (range, symmetry, tempo)
 * combined into a 0–100 form score. Every point is traceable to a measured
 * number, so it's honest to trend over time.
 */

export interface AssessmentScore {
  score: number; // 0..100
  range: number; // 0..1 sub-scores
  symmetry: number;
  tempo: number;
  grade: "Excellent" | "Good" | "Fair" | "Needs work";
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function scoreAssessment(m: MovementMetrics, a: Assessment): AssessmentScore {
  // Range: hitting or exceeding the target range = full marks.
  const range = clamp01(m.primaryRange / a.targets.rangeDeg);

  // Symmetry: within target gap = full; falls off as the gap grows.
  const asym = m.asymmetries[0]?.diff ?? 0;
  const symmetry =
    asym <= a.targets.symmetryDeg
      ? 1
      : clamp01(1 - (asym - a.targets.symmetryDeg) / (a.targets.symmetryDeg * 2));

  // Tempo: even up:down = full; falls off as it gets lopsided.
  const tb = m.tempo ? Math.abs(m.tempo.ratio - 1) : 0;
  const tempo =
    tb <= a.targets.tempoBalance
      ? 1
      : clamp01(1 - (tb - a.targets.tempoBalance) / (a.targets.tempoBalance * 2));

  const score = Math.round((range * 0.5 + symmetry * 0.3 + tempo * 0.2) * 100);
  const grade =
    score >= 85 ? "Excellent" : score >= 70 ? "Good" : score >= 50 ? "Fair" : "Needs work";

  return { score, range, symmetry, tempo, grade };
}
