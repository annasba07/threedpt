import type { MovementMetrics } from "./metrics";

/**
 * Turn measured metrics into a coach's read: a headline, ranked findings, and a
 * short plan. Everything here is grounded in the numbers — it observes and
 * suggests, it does not diagnose.
 */

export type Severity = "flag" | "notice" | "good";

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
}

export interface Coaching {
  headline: string;
  subhead: string;
  findings: Finding[];
  plan: string[];
}

const r = Math.round;

export function coach(m: MovementMetrics): Coaching {
  const findings: Finding[] = [];

  // Left/right asymmetry (largest gap)
  const asy = m.asymmetries[0];
  if (asy) {
    const gap = r(asy.diff);
    const weakSide = asy.biggerSide === "left" ? "right" : "left";
    if (asy.pct >= 0.12 && gap >= 8) {
      findings.push({
        id: "asymmetry",
        severity: asy.pct >= 0.25 ? "flag" : "notice",
        title: `${gap}° ${asy.label.toLowerCase()} asymmetry`,
        detail: `Your ${asy.biggerSide} ${asy.label.toLowerCase()} moved through ${gap}° more range than your ${weakSide} (${r(asy.left)}° vs ${r(asy.right)}°). Side-to-side gaps like this are worth evening out.`,
      });
    } else {
      findings.push({
        id: "symmetry",
        severity: "good",
        title: "Left and right are balanced",
        detail: `Your ${asy.label.toLowerCase()}s moved through nearly the same range (${r(asy.left)}° vs ${r(asy.right)}°).`,
      });
    }
  }

  // Tempo (up vs down)
  if (m.tempo && m.tempo.ratio > 0 && Number.isFinite(m.tempo.ratio)) {
    const { ratio, upMs, downMs, awayLabel, backLabel } = m.tempo;
    if (ratio > 1.4 || ratio < 0.7) {
      // ratio < 1 ⇒ the "away" phase took less time, so it is the faster one.
      const fasterLabel = ratio < 1 ? awayLabel : backLabel;
      const factor = ratio < 1 ? 1 / ratio : ratio;
      findings.push({
        id: "tempo",
        severity: "notice",
        title: `Uneven tempo — ${fasterLabel} ${factor.toFixed(1)}× faster`,
        detail: `On average your ${awayLabel} took ${(upMs / 1000).toFixed(1)}s and your ${backLabel} ${(downMs / 1000).toFixed(1)}s. Rushing the ${fasterLabel} usually means momentum rather than control.`,
      });
    } else {
      findings.push({
        id: "tempo-ok",
        severity: "good",
        title: "Smooth, even tempo",
        detail: `Your ${awayLabel} and ${backLabel} took about the same time (${(upMs / 1000).toFixed(1)}s vs ${(downMs / 1000).toFixed(1)}s) — nicely controlled.`,
      });
    }
  }

  // Fatigue / range fade
  if (m.amplitudeTrendPct != null && m.amplitudeTrendPct <= -12) {
    findings.push({
      id: "fatigue",
      severity: "notice",
      title: `Range faded ${Math.abs(r(m.amplitudeTrendPct))}% by the end`,
      detail: `Your last reps covered ${Math.abs(r(m.amplitudeTrendPct))}% less range than your first — a sign of fatigue or form breaking down late in the set.`,
    });
  }

  // Pain linked to load
  if (m.pain) {
    const p = m.pain;
    let detail = `You marked pain at your ${p.region.toLowerCase()}`;
    if (p.angle != null) detail += `, with the joint at ${r(p.angle)}°`;
    if (p.loadPct != null) {
      detail += `, where the estimated load was ${r(p.loadPct)}% of its peak in this movement${p.nearPeak ? " — right around its hardest-working point, which is a meaningful clue" : ""}`;
    }
    detail += ".";
    findings.push({ id: "pain", severity: "flag", title: `Pain at the ${p.region.toLowerCase()}`, detail });
  }

  // Rank: flags first, then notices, then good news
  const order: Record<Severity, number> = { flag: 0, notice: 1, good: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  const top = findings[0];
  const headline = top ? top.title : `${m.reps} rep${m.reps === 1 ? "" : "s"} tracked`;
  const notable = findings.filter((f) => f.severity !== "good").length;
  const subhead =
    notable === 0
      ? `${m.reps} rep${m.reps === 1 ? "" : "s"} of ${m.primaryLabel.toLowerCase()} movement — form looks clean.`
      : `${m.reps} rep${m.reps === 1 ? "" : "s"} analyzed · ${notable} thing${notable === 1 ? "" : "s"} worth a look.`;

  // Plan
  const plan: string[] = [];
  if (asy && asy.pct >= 0.12 && r(asy.diff) >= 8) {
    const weakSide = asy.biggerSide === "left" ? "right" : "left";
    plan.push(`Add some single-side ${asy.label.toLowerCase()} mobility and control work on your ${weakSide} to close the ${r(asy.diff)}° gap.`);
  }
  if (m.tempo && (m.tempo.ratio > 1.4 || m.tempo.ratio < 0.7)) {
    const rushed = m.tempo.ratio < 1 ? m.tempo.awayLabel : m.tempo.backLabel;
    plan.push(`Slow the ${rushed} so it matches the other phase — even tempo builds control and cuts momentum.`);
  }
  if (m.amplitudeTrendPct != null && m.amplitudeTrendPct <= -12) {
    plan.push(`Your range dropped off late in the set — fewer reps or more rest will keep each one full and honest.`);
  }
  if (m.pain) {
    plan.push(`Ease the load or range around the painful point and watch how it responds. Sharp or lingering pain — get it looked at by a clinician.`);
  }
  if (!plan.length) {
    plan.push(`This looks controlled and symmetric — keep the same full range and steady tempo.`);
  }

  return { headline, subhead, findings, plan };
}
