"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { JOINT_ANGLES } from "@/lib/pose/landmarks";
import { drawSkeleton } from "@/lib/pose/draw";
import { detectReps, extractSeries } from "@/lib/pose/reps";
import { measureProportions } from "@/lib/pose/proportions";
import { computeFrameLoads, extractLoadSeries, peakLoads, loadColor } from "@/lib/pose/loads";
import { nearestRegion } from "@/lib/pose/regions";
import { atlasForRegion } from "@/lib/anatomy/atlas";
import { computeMetrics, type MovementMetrics } from "@/lib/analysis/metrics";
import { coach, type Coaching, type Severity } from "@/lib/analysis/coach";
import AnatomyPanel from "./AnatomyPanel";
import { painColor } from "@/lib/pose/pain";
import { useSession } from "@/lib/store/session";
import AngleChart from "./AngleChart";

const Body3D = dynamic(() => import("./Body3D"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-white/40">
      Reconstructing…
    </div>
  ),
});

const jointLabel = (id: string) => JOINT_ANGLES.find((j) => j.id === id)?.label ?? id;

type ViewMode = "2d" | "3d";
type Stage = "read" | "lab";

const SEV_TEXT: Record<Severity, string> = {
  flag: "text-red-600",
  notice: "text-amber-600",
  good: "text-teal-600",
};
const SEV_DOT: Record<Severity, string> = {
  flag: "bg-red-500 ring-red-100",
  notice: "bg-amber-500 ring-amber-100",
  good: "bg-teal-500 ring-teal-100",
};
const SEV_GLOW: Record<Severity, string> = {
  flag: "rgba(214,69,59,0.13)",
  notice: "rgba(201,130,10,0.14)",
  good: "rgba(16,138,126,0.12)",
};
const SEV_LABEL: Record<Severity, string> = {
  flag: "Needs attention",
  notice: "Worth a look",
  good: "Looks clean",
};

/** The single most valuable glance-datum, derived from the top finding. */
function heroStat(m: MovementMetrics, c: Coaching): { value: string; unit: string } {
  const top = c.findings[0];
  if (top?.id === "pain" && m.pain?.loadPct != null) {
    return {
      value: `${Math.round(m.pain.loadPct)}%`,
      unit: m.pain.angle != null ? `of peak load · at ${Math.round(m.pain.angle)}°` : "of peak load",
    };
  }
  if (top?.id === "asymmetry" && m.asymmetries[0]) {
    return { value: `${Math.round(m.asymmetries[0].diff)}°`, unit: `${m.asymmetries[0].label.toLowerCase()} · left ↔ right` };
  }
  if (top?.id === "tempo" && m.tempo) {
    const f = m.tempo.ratio < 1 ? 1 / m.tempo.ratio : m.tempo.ratio;
    return { value: `${f.toFixed(1)}×`, unit: "tempo imbalance" };
  }
  if (top?.id === "fatigue" && m.amplitudeTrendPct != null) {
    return { value: `−${Math.abs(Math.round(m.amplitudeTrendPct))}%`, unit: "range by the last rep" };
  }
  return { value: `${m.reps}`, unit: m.reps === 1 ? "clean rep" : "clean reps" };
}

export default function ReviewStudio() {
  const frames = useSession((s) => s.frames);
  const primaryJoint = useSession((s) => s.primaryJoint) ?? JOINT_ANGLES[0].id;
  const selectedIndex = useSession((s) => s.selectedIndex);
  const isPlaying = useSession((s) => s.isPlaying);
  const setSelectedIndex = useSession((s) => s.setSelectedIndex);
  const setPlaying = useSession((s) => s.setPlaying);
  const setPrimaryJoint = useSession((s) => s.setPrimaryJoint);
  const reset = useSession((s) => s.reset);

  const painMarkers = useSession((s) => s.painMarkers);
  const selectedPainId = useSession((s) => s.selectedPainId);
  const addPainMarker = useSession((s) => s.addPainMarker);
  const updatePainMarker = useSession((s) => s.updatePainMarker);
  const removePainMarker = useSession((s) => s.removePainMarker);
  const setSelectedPain = useSession((s) => s.setSelectedPain);

  const [stage, setStage] = useState<Stage>("read");
  const [mirrored, setMirrored] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("3d");
  const [painMode, setPainMode] = useState(false);
  const [girth, setGirth] = useState(1);
  const [bodyMass, setBodyMass] = useState(70);
  const [showLoad, setShowLoad] = useState(false);
  const [seeInside, setSeeInside] = useState(false);
  const [avatar, setAvatar] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const [chartMetric, setChartMetric] = useState<"angle" | "load">("angle");
  const [layersOpen, setLayersOpen] = useState(false);
  const [anatomyOpen, setAnatomyOpen] = useState(false);
  const [showAllJoints, setShowAllJoints] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const series = useMemo(() => extractSeries(frames, primaryJoint), [frames, primaryJoint]);
  const reps = useMemo(() => detectReps(frames, primaryJoint), [frames, primaryJoint]);
  const proportions = useMemo(() => measureProportions(frames), [frames]);
  const peaks = useMemo(() => peakLoads(frames, bodyMass), [frames, bodyMass]);
  const loadSeries = useMemo(
    () => extractLoadSeries(frames, primaryJoint, bodyMass),
    [frames, primaryJoint, bodyMass],
  );

  const idx = Math.min(selectedIndex, frames.length - 1);
  const frame = frames[idx];
  const currentLoads = useMemo(
    () => computeFrameLoads(frame?.world ?? [], bodyMass),
    [frame, bodyMass],
  );
  const duration = frames.length ? frames[frames.length - 1].t / 1000 : 0;

  const selectedPain = painMarkers.find((m) => m.id === selectedPainId) ?? null;

  const analysis = useMemo(() => {
    const m = computeMetrics(frames, primaryJoint, selectedPain, bodyMass);
    return { metrics: m, coaching: coach(m) };
  }, [frames, primaryJoint, selectedPain, bodyMass]);
  const { metrics, coaching } = analysis;
  const topSeverity: Severity = coaching.findings[0]?.severity ?? "good";
  const hero = heroStat(metrics, coaching);

  // The frame that best shows the story: the pain moment, else the hardest rep.
  const keyFrameIndex = useMemo(() => {
    if (selectedPain) return selectedPain.frame;
    if (reps.length) {
      const hardest = [...reps].sort((a, b) => b.amplitude - a.amplitude)[0];
      return hardest.peakFrame;
    }
    return Math.floor(frames.length / 2);
  }, [selectedPain, reps, frames.length]);
  const keyFrame = frames[keyFrameIndex];

  const jointOptions = useMemo(
    () =>
      JOINT_ANGLES.map((def) => ({ def, s: extractSeries(frames, def.id) }))
        .filter((o) => o.s.valid)
        .sort((a, b) => b.s.range - a.s.range),
    [frames],
  );

  const repIndexForFrame = (f: number) =>
    reps.find((r) => f >= r.startFrame && f <= r.endFrame)?.index ?? null;

  // Draw the selected frame's 2D skeleton (only when the 2D view is active).
  useEffect(() => {
    if (stage !== "lab" || viewMode !== "2d") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.width !== 1280) {
      canvas.width = 1280;
      canvas.height = 720;
    }
    const ctx = canvas.getContext("2d");
    if (ctx) drawSkeleton(ctx, frame?.image, canvas.width, canvas.height);
  }, [frame, viewMode, stage]);

  // Playback loop, driven by real timestamps for true-speed replay.
  useEffect(() => {
    if (!isPlaying || frames.length === 0) return;
    let raf = 0;
    const startIdx = useSession.getState().selectedIndex;
    const base = frames[Math.min(startIdx, frames.length - 1)].t;
    const t0 = performance.now();
    const tick = () => {
      const elapsed = base + (performance.now() - t0);
      let i = useSession.getState().selectedIndex;
      while (i < frames.length - 1 && frames[i + 1].t <= elapsed) i++;
      setSelectedIndex(i);
      if (i >= frames.length - 1) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, frames, setSelectedIndex, setPlaying]);

  const togglePlay = () => {
    if (isPlaying) return setPlaying(false);
    if (idx >= frames.length - 1) setSelectedIndex(0);
    setPlaying(true);
  };

  const step = (delta: number) => {
    setPlaying(false);
    setSelectedIndex(Math.min(frames.length - 1, Math.max(0, idx + delta)));
  };

  const gotoRep = (dir: 1 | -1) => {
    setPlaying(false);
    if (reps.length === 0) return;
    const peakFrames = reps.map((r) => r.peakFrame);
    if (dir === 1) setSelectedIndex(peakFrames.find((p) => p > idx) ?? peakFrames[0]);
    else setSelectedIndex([...peakFrames].reverse().find((p) => p < idx) ?? peakFrames[peakFrames.length - 1]);
  };

  const handlePick = (point: [number, number, number]) => {
    if (!frame) return;
    const near = nearestRegion(frame.world, point);
    if (!near) return;
    addPainMarker({
      regionId: near.region.id,
      region: near.region.label,
      intensity: 5,
      frame: idx,
      t: frame.t,
      repIndex: repIndexForFrame(idx),
    });
    setPainMode(false);
  };

  const currentAngle = frame?.angles[primaryJoint];
  const mirrorClass = mirrored ? "-scale-x-100" : "";
  const currentTime = frame ? (frame.t / 1000).toFixed(1) : "0.0";
  const hasWorld = (frame?.world?.length ?? 0) > 0;

  const sessionTitle = `${metrics.primaryLabel.replace(/^[LR] /, "")} movement`;

  // Which "view segment" is active (3D · 2D · Realistic).
  const viewSeg = viewMode === "2d" ? "2d" : avatar ? "realistic" : "3d";
  const setViewSeg = (seg: "3d" | "2d" | "realistic") => {
    setLayersOpen(false);
    if (seg === "2d") {
      setViewMode("2d");
      setPainMode(false);
    } else if (seg === "3d") {
      setViewMode("3d");
      setAvatar(false);
    } else {
      setViewMode("3d");
      setAvatar(true);
    }
  };

  const scrubTo = (i: number) => {
    setPlaying(false);
    setSelectedIndex(Math.max(0, Math.min(frames.length - 1, i)));
  };

  // A finding, clicked, scrubs to the moment it describes.
  const findingFrame = (id: string) => {
    if (id === "pain" && selectedPain) return selectedPain.frame;
    return keyFrameIndex;
  };

  // ---- THE READ ---------------------------------------------------------
  if (stage === "read") {
    const secondary = coaching.findings.slice(1);
    return (
      <div className="mx-auto max-w-3xl">
        {/* Session header */}
        <div className="rise mb-5 flex items-end justify-between" style={{ animationDelay: "0ms" }}>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
              This session
            </div>
            <div className="font-display text-xl leading-tight text-stone-900">{sessionTitle}</div>
          </div>
          <button
            onClick={reset}
            className="rounded-full bg-white px-4 py-1.5 text-[13px] font-medium text-stone-600 shadow-[0_1px_2px_rgba(74,56,30,0.06)] transition hover:text-stone-900"
          >
            New recording
          </button>
        </div>

        {/* Hero — verdict + one numeral, beside the reconstructed body */}
        <section
          className="card-soft rise relative overflow-hidden"
          style={{ animationDelay: "80ms" }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: `radial-gradient(620px 240px at 6% -20%, ${SEV_GLOW[topSeverity]}, transparent 70%)` }}
          />
          <div className="relative grid gap-6 p-6 sm:p-8 md:grid-cols-[1.25fr_0.75fr] md:items-center">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-500" />
                </span>
                Movement analysis
                <span className={`ml-1 font-medium normal-case tracking-normal ${SEV_TEXT[topSeverity]}`}>
                  · {SEV_LABEL[topSeverity]}
                </span>
              </div>
              <h1 className="font-display mt-3 text-[2rem] leading-[1.05] text-stone-900 sm:text-[2.6rem]">
                {coaching.headline}
              </h1>
              <div className="mt-5 flex items-baseline gap-3">
                <span className="font-display text-6xl leading-none tracking-tight text-stone-900 tabular-nums sm:text-7xl">
                  {hero.value}
                </span>
                <span className="max-w-[10rem] text-[13px] leading-snug text-stone-500">{hero.unit}</span>
              </div>
              <p className="mt-4 max-w-md text-[14px] leading-relaxed text-stone-500">
                {coaching.findings[0]?.detail ?? coaching.subhead}
              </p>
            </div>

            {/* Reconstructed body at the key frame */}
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-stone-900">
              {keyFrame?.world?.length ? (
                <Body3D
                  world={keyFrame.world}
                  proportions={proportions}
                  girth={girth}
                  markers={painMarkers}
                  selectedId={selectedPainId}
                  painMode={false}
                  onPickPoint={() => {}}
                  onSelectMarker={() => {}}
                  showLoad={false}
                  loads={{}}
                  peakLoads={peaks}
                  seeInside={false}
                  revealRegionId={null}
                  revealImage={null}
                  avatar={false}
                  avatarUrl={undefined}
                />
              ) : (
                <div className="flex h-full items-center justify-center px-4 text-center text-xs text-white/40">
                  No 3D data in this recording
                </div>
              )}
              <div className="pointer-events-none absolute bottom-2.5 left-1/2 -translate-x-1/2 rounded-full bg-black/45 px-2.5 py-1 text-[10px] text-white/70 backdrop-blur">
                you, at the key moment
              </div>
            </div>
          </div>
        </section>

        {/* Three stat tiles — each number stated once */}
        <div className="rise mt-4 grid grid-cols-3 gap-3" style={{ animationDelay: "150ms" }}>
          <StatTile label="Range" value={`${Math.round(metrics.primaryRange)}°`} sub={metrics.primaryLabel.replace(/^[LR] /, "").toLowerCase()} />
          <StatTile
            label="Asymmetry"
            value={metrics.asymmetries[0] ? `${Math.round(metrics.asymmetries[0].diff)}°` : "—"}
            sub={metrics.asymmetries[0] ? "left ↔ right" : "balanced"}
          />
          <StatTile
            label="Tempo"
            value={metrics.tempo ? `${metrics.tempo.ratio >= 1 ? metrics.tempo.ratio.toFixed(1) : (1 / metrics.tempo.ratio).toFixed(1)}×` : "—"}
            viz={metrics.tempo ? <TempoBar up={metrics.tempo.upMs} down={metrics.tempo.downMs} /> : undefined}
            sub={metrics.tempo ? (metrics.tempo.ratio > 1 ? "lift slower" : "return slower") : "steady"}
          />
        </div>

        {/* Secondary findings — quiet rows */}
        {secondary.length > 0 && (
          <div className="rise mt-4 card-soft p-5" style={{ animationDelay: "220ms" }}>
            <ul className="divide-y divide-stone-100">
              {secondary.map((f) => (
                <li key={f.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ring-4 ${SEV_DOT[f.severity]}`} />
                  <div>
                    <div className="text-[14px] font-semibold text-stone-800">{f.title}</div>
                    <div className="mt-0.5 text-[13px] leading-relaxed text-stone-500">{f.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* What to try */}
        <div className="rise mt-4 rounded-2xl bg-[#f2ebdf] p-5 sm:p-6" style={{ animationDelay: "290ms" }}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">What to try</div>
          <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {coaching.plan.map((p, i) => (
              <li key={i} className="flex gap-2.5 text-[13.5px] leading-relaxed text-stone-700">
                <span className="mt-px text-teal-600">→</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* CTA into the lab */}
        <div className="rise mt-6 flex flex-col items-center gap-3" style={{ animationDelay: "360ms" }}>
          <button
            onClick={() => setStage("lab")}
            className="group inline-flex items-center gap-2 rounded-full bg-stone-900 px-6 py-3 text-[15px] font-medium text-white shadow-[0_8px_24px_-8px_rgba(74,56,30,0.5)] transition hover:bg-stone-800"
          >
            Explore the motion
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </button>
          <p className="text-[11px] text-stone-400">
            Scrub the movement frame by frame, mark where it hurts, and see the anatomy underneath.
          </p>
        </div>

        <p className="mx-auto mt-8 max-w-lg text-center text-[11px] leading-relaxed text-stone-400">
          Estimated from a single camera — an aid to observe your movement, not a medical diagnosis.
        </p>
      </div>
    );
  }

  // ---- THE LAB ----------------------------------------------------------
  return (
    <div>
      {/* Lab header */}
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => setStage("read")}
          className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-[13px] font-medium text-stone-600 shadow-[0_1px_2px_rgba(74,56,30,0.06)] transition hover:text-stone-900"
        >
          <span>←</span> The read
        </button>
        <div className="font-display text-lg text-stone-900">{sessionTitle}</div>
        <button
          onClick={reset}
          className="rounded-full bg-white px-4 py-1.5 text-[13px] font-medium text-stone-600 shadow-[0_1px_2px_rgba(74,56,30,0.06)] transition hover:text-stone-900"
        >
          New recording
        </button>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row">
        {/* Stage column */}
        <div className="min-w-0 flex-1">
          {/* Toolbar — three affordances */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full bg-white p-0.5 shadow-[0_1px_2px_rgba(74,56,30,0.06)]">
              {(["3d", "2d", "realistic"] as const).map((seg) => (
                <button
                  key={seg}
                  onClick={() => setViewSeg(seg)}
                  className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
                    viewSeg === seg ? "bg-teal-600 text-white" : "text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  {seg === "3d" ? "3D" : seg === "2d" ? "2D" : "Realistic"}
                </button>
              ))}
            </div>

            {viewMode === "3d" && hasWorld && (
              <button
                onClick={() => setPainMode((v) => !v)}
                className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition ${
                  painMode ? "bg-red-600 text-white hover:bg-red-500" : "bg-white text-stone-700 shadow-[0_1px_2px_rgba(74,56,30,0.06)] hover:bg-stone-100"
                }`}
              >
                {painMode ? "Click the body…" : "＋ Mark pain"}
              </button>
            )}

            {viewMode === "3d" && hasWorld && (
              <div className="relative">
                <button
                  onClick={() => setLayersOpen((v) => !v)}
                  className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
                    layersOpen || showLoad || avatar ? "bg-stone-800 text-white" : "bg-white text-stone-600 shadow-[0_1px_2px_rgba(74,56,30,0.06)] hover:bg-stone-100"
                  }`}
                >
                  Layers ▾
                </button>
                {layersOpen && (
                  <div className="absolute left-0 top-11 z-20 w-64 card-soft slide-in p-4 text-sm">
                    <label className="flex items-center justify-between">
                      <span className="text-stone-700">Joint load</span>
                      <input type="checkbox" checked={showLoad} onChange={(e) => setShowLoad(e.target.checked)} className="h-4 w-4 accent-teal-600" />
                    </label>
                    {showLoad && (
                      <label className="mt-2 flex items-center justify-between text-[12px] text-stone-500">
                        Body weight
                        <span className="flex items-center gap-1">
                          <input
                            type="number"
                            min={20}
                            max={250}
                            value={bodyMass}
                            onChange={(e) => setBodyMass(Math.max(20, Math.min(250, Number(e.target.value) || 70)))}
                            className="w-14 rounded-md border border-stone-200 px-1.5 py-0.5 text-right text-stone-800"
                          />
                          kg
                        </span>
                      </label>
                    )}
                    <div className="mt-3 border-t border-stone-100 pt-3">
                      <label className="flex items-center justify-between text-[12px] text-stone-500" title="A single camera can't measure girth precisely">
                        Build
                        <input type="range" min={0.7} max={1.5} step={0.05} value={girth} onChange={(e) => setGirth(Number(e.target.value))} className="w-28 accent-teal-600" />
                      </label>
                    </div>
                    {avatar && (
                      <label className="mt-3 block cursor-pointer rounded-lg bg-stone-50 px-3 py-2 text-center text-[12px] font-medium text-stone-600 transition hover:bg-stone-100">
                        {avatarUrl ? "Change avatar…" : "Upload avatar .glb"}
                        <input
                          type="file"
                          accept=".glb,model/gltf-binary"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (avatarUrl?.startsWith("blob:")) URL.revokeObjectURL(avatarUrl);
                            setAvatarUrl(URL.createObjectURL(file));
                          }}
                        />
                      </label>
                    )}
                  </div>
                )}
              </div>
            )}

            {viewMode === "3d" && hasWorld && selectedPain && (
              <button
                onClick={() => {
                  const next = !anatomyOpen;
                  setAnatomyOpen(next);
                  setSeeInside(next);
                }}
                className={`ml-auto rounded-full px-4 py-1.5 text-[13px] font-semibold transition ${
                  anatomyOpen ? "bg-violet-600 text-white hover:bg-violet-500" : "bg-white text-violet-700 shadow-[0_1px_2px_rgba(74,56,30,0.06)] hover:bg-violet-50"
                }`}
              >
                🫀 See inside
              </button>
            )}
          </div>

          {/* Stage */}
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-stone-900 shadow-[0_2px_8px_rgba(74,56,30,0.1),0_24px_48px_-24px_rgba(74,56,30,0.3)]">
            {viewMode === "2d" ? (
              <canvas ref={canvasRef} className={`absolute inset-0 h-full w-full object-contain ${mirrorClass}`} />
            ) : hasWorld ? (
              <div className={`absolute inset-0 ${painMode ? "cursor-crosshair" : ""}`}>
                <Body3D
                  world={frame?.world ?? []}
                  proportions={proportions}
                  girth={girth}
                  markers={painMarkers}
                  selectedId={selectedPainId}
                  painMode={painMode}
                  onPickPoint={handlePick}
                  onSelectMarker={(id) => setSelectedPain(id)}
                  showLoad={showLoad}
                  loads={currentLoads}
                  peakLoads={peaks}
                  seeInside={seeInside}
                  revealRegionId={selectedPain?.regionId ?? null}
                  revealImage={selectedPain ? atlasForRegion(selectedPain.regionId)?.image ?? null : null}
                  avatar={avatar}
                  avatarUrl={avatarUrl}
                />
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/50">
                This recording has no 3D data. Record a new movement to use the 3D body and pain mapping.
              </div>
            )}

            <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-teal-300 backdrop-blur">
              {currentTime}s / {duration.toFixed(1)}s
            </div>
            <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/55 px-3 py-1 text-[11px] font-medium text-white backdrop-blur">
              {jointLabel(primaryJoint)}: <span className="tabular-nums text-teal-300">{currentAngle == null ? "—" : `${Math.round(currentAngle)}°`}</span>
            </div>
            {viewMode === "3d" && hasWorld && !painMode && (
              <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/45 px-3 py-1 text-[11px] text-white/70 backdrop-blur">
                drag to rotate · scroll to zoom
              </div>
            )}
            {showLoad && viewMode === "3d" && hasWorld && (
              <div className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[10px] text-white/70 backdrop-blur">
                low
                <span className="h-1.5 w-16 rounded-full" style={{ background: `linear-gradient(90deg, ${loadColor(0)}, ${loadColor(0.5)}, ${loadColor(1)})` }} />
                high load
              </div>
            )}
          </div>

          {/* Transport */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={togglePlay} className="rounded-full bg-teal-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-teal-500">
              {isPlaying ? "Pause" : "Play"}
            </button>
            <div className="inline-flex overflow-hidden rounded-full bg-white shadow-[0_1px_2px_rgba(74,56,30,0.06)]">
              <button onClick={() => step(-1)} className="px-3 py-2 text-sm text-stone-700 transition hover:bg-stone-100">‹ Frame</button>
              <button onClick={() => step(1)} className="border-l border-stone-100 px-3 py-2 text-sm text-stone-700 transition hover:bg-stone-100">Frame ›</button>
              <button onClick={() => gotoRep(-1)} className="border-l border-stone-100 px-3 py-2 text-sm text-stone-700 transition hover:bg-stone-100">‹ Rep</button>
              <button onClick={() => gotoRep(1)} className="border-l border-stone-100 px-3 py-2 text-sm text-stone-700 transition hover:bg-stone-100">Rep ›</button>
            </div>
            {viewMode === "2d" && (
              <label className="ml-1 flex items-center gap-2 text-sm text-stone-600">
                <input type="checkbox" checked={mirrored} onChange={(e) => setMirrored(e.target.checked)} className="accent-teal-600" />
                Mirror
              </label>
            )}
          </div>

          {/* Findings strip — each scrubs to its moment */}
          <div className="mt-4 flex flex-wrap gap-2">
            {coaching.findings.map((f) => (
              <button
                key={f.id}
                onClick={() => scrubTo(findingFrame(f.id))}
                className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[12.5px] text-stone-600 shadow-[0_1px_2px_rgba(74,56,30,0.05)] transition hover:text-stone-900"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${SEV_DOT[f.severity].split(" ")[0]}`} />
                {f.title}
              </button>
            ))}
          </div>

          {/* Chart / timeline — the scrubber, with the joint selector on its header */}
          <div className="mt-4 card-soft p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex rounded-full bg-stone-100 p-0.5 text-[12px]">
                {(["angle", "load"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setChartMetric(m)}
                    className={`rounded-full px-3 py-1 font-medium transition ${
                      chartMetric === m ? "bg-white text-stone-800 shadow-sm" : "text-stone-500 hover:text-stone-700"
                    }`}
                  >
                    {m === "angle" ? "Angle" : "Est. load"}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1.5 text-[12px] text-stone-500">
                Joint
                <select
                  value={primaryJoint}
                  onChange={(e) => setPrimaryJoint(e.target.value)}
                  className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-[12px] text-stone-800"
                >
                  {jointOptions.length === 0 && <option value={primaryJoint}>{jointLabel(primaryJoint)}</option>}
                  {jointOptions.map((o) => (
                    <option key={o.def.id} value={o.def.id}>
                      {o.def.label} · {Math.round(o.s.range)}°
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {(chartMetric === "angle" ? series : loadSeries).valid ? (
              <AngleChart
                series={chartMetric === "angle" ? series : loadSeries}
                reps={reps}
                frameCount={frames.length}
                selectedIndex={idx}
                onSeek={scrubTo}
                label={jointLabel(primaryJoint)}
                metricLabel={chartMetric === "angle" ? "angle" : "estimated load"}
                unit={chartMetric === "angle" ? "°" : " N·m"}
              />
            ) : (
              <p className="py-8 text-center text-sm text-stone-400">
                {chartMetric === "load"
                  ? "Not enough of the body was tracked to estimate load for this joint."
                  : "Not enough movement in this joint to chart. Pick another joint."}
              </p>
            )}
          </div>
        </div>

        {/* Contextual inspector — one panel, swaps by task */}
        <div className="w-full lg:w-80">
          {painMode || painMarkers.length > 0 ? (
            <div className="card-soft p-4">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-stone-800">Pain</h2>
                <span className="text-[11px] text-stone-400">{painMarkers.length} marked</span>
              </div>
              {painMarkers.length === 0 ? (
                <p className="mt-2 text-[12px] leading-relaxed text-stone-400">
                  Hit <span className="font-medium text-stone-600">Mark pain</span> and click where you feel it on the body. The marker pins to that body part and that moment.
                </p>
              ) : (
                <ul className="mt-3 space-y-1.5">
                  {painMarkers.map((m) => (
                    <li key={m.id}>
                      <button
                        onClick={() => {
                          setSelectedPain(m.id);
                          scrubTo(m.frame);
                        }}
                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                          m.id === selectedPainId ? "bg-teal-50 ring-1 ring-teal-200" : "hover:bg-stone-50"
                        }`}
                      >
                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: painColor(m.intensity) }} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-stone-700">{m.region}</span>
                          <span className="text-[11px] text-stone-400">
                            {(m.t / 1000).toFixed(1)}s{m.repIndex ? ` · rep ${m.repIndex}` : ""}
                          </span>
                        </span>
                        <span className="tabular-nums text-stone-500">{m.intensity}/10</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {selectedPain && (
                <div className="mt-3 rounded-xl bg-stone-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-stone-800">{selectedPain.region}</span>
                    <button onClick={() => removePainMarker(selectedPain.id)} className="text-[11px] font-medium text-red-600 hover:text-red-500">
                      Remove
                    </button>
                  </div>
                  <label className="mt-3 flex items-center justify-between text-[11px] font-medium text-stone-500">
                    Intensity
                    <span className="tabular-nums text-stone-700">{selectedPain.intensity}/10</span>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={selectedPain.intensity}
                    onChange={(e) => updatePainMarker(selectedPain.id, { intensity: Number(e.target.value) })}
                    className="mt-1 w-full accent-red-600"
                  />
                  <textarea
                    value={selectedPain.note ?? ""}
                    onChange={(e) => updatePainMarker(selectedPain.id, { note: e.target.value })}
                    placeholder="Notes (e.g. sharp on the way up)"
                    rows={2}
                    className="mt-2 w-full resize-none rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-stone-800 placeholder:text-stone-400"
                  />
                  <button
                    onClick={() => {
                      setAnatomyOpen(true);
                      setSeeInside(true);
                    }}
                    className="mt-3 w-full rounded-lg bg-violet-600 py-2 text-[13px] font-semibold text-white transition hover:bg-violet-500"
                  >
                    See the anatomy →
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="card-soft p-4">
              <h2 className="text-sm font-semibold text-stone-800">At this frame</h2>
              <div className="mt-3 rounded-xl bg-teal-50 p-3.5">
                <div className="text-[11px] font-medium uppercase tracking-wide text-teal-700">{jointLabel(primaryJoint)}</div>
                <div className="font-display text-3xl text-stone-900 tabular-nums">
                  {currentAngle == null ? "—" : `${Math.round(currentAngle)}°`}
                </div>
              </div>
              <button
                onClick={() => setShowAllJoints((v) => !v)}
                className="mt-3 text-[12px] font-medium text-stone-500 hover:text-stone-800"
              >
                {showAllJoints ? "Hide other joints" : "Show all joints"}
              </button>
              {showAllJoints && (
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {JOINT_ANGLES.filter((d) => d.id !== primaryJoint).map((def) => {
                    const v = frame?.angles[def.id];
                    return (
                      <div key={def.id} className="rounded-lg bg-stone-50 px-2.5 py-1.5">
                        <div className="text-[10px] text-stone-400">{def.label}</div>
                        <div className={`text-sm font-semibold tabular-nums ${v != null ? "text-stone-800" : "text-stone-300"}`}>
                          {v != null ? `${Math.round(v)}°` : "—"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="mt-4 text-[11px] leading-relaxed text-stone-400">
                Drag the chart or press Play to move through the movement. Switch to 3D and hit “Mark pain” to log where it hurts.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Anatomy slide-over */}
      {anatomyOpen && selectedPain && (
        <>
          <div
            className="fixed inset-0 z-30 bg-stone-900/20 backdrop-blur-[2px]"
            onClick={() => {
              setAnatomyOpen(false);
              setSeeInside(false);
            }}
          />
          <div className="slide-in fixed right-0 top-0 z-40 h-dvh w-full max-w-md overflow-y-auto bg-[var(--surface)] shadow-[0_0_60px_-10px_rgba(74,56,30,0.4)]">
            <div className="sticky top-0 z-10 flex items-center justify-between bg-[var(--surface)]/95 px-5 py-4 backdrop-blur">
              <div className="font-display text-lg text-stone-900">Inside the {selectedPain.region.toLowerCase()}</div>
              <button
                onClick={() => {
                  setAnatomyOpen(false);
                  setSeeInside(false);
                }}
                className="rounded-full bg-stone-100 px-3 py-1 text-[13px] text-stone-600 transition hover:bg-stone-200"
              >
                Close
              </button>
            </div>
            <div className="px-3 pb-8">
              <AnatomyPanel marker={selectedPain} frames={frames} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatTile({ label, value, sub, viz }: { label: string; value: string; sub?: string; viz?: React.ReactNode }) {
  return (
    <div className="card-soft p-4">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone-400">{label}</div>
      <div className="mt-1.5 font-display text-3xl leading-none text-stone-900 tabular-nums">{value}</div>
      {viz}
      {sub && <div className="mt-1.5 text-[11px] text-stone-400">{sub}</div>}
    </div>
  );
}

function TempoBar({ up, down }: { up: number; down: number }) {
  const total = up + down || 1;
  const upPct = Math.round((up / total) * 100);
  return (
    <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-stone-100" title={`lift ${(up / 1000).toFixed(1)}s · return ${(down / 1000).toFixed(1)}s`}>
      <span className="h-full bg-teal-500" style={{ width: `${upPct}%` }} />
      <span className="h-full bg-amber-400" style={{ width: `${100 - upPct}%` }} />
    </div>
  );
}
