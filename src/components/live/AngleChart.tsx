"use client";

import { useCallback, useRef } from "react";
import type { JointSeries } from "@/lib/pose/reps";
import type { Rep } from "@/lib/pose/types";

const VW = 1000;
const VH = 240;
const PAD_X = 8;
const PAD_TOP = 16;
const PAD_BOTTOM = 20;

interface Props {
  series: JointSeries;
  reps: Rep[];
  frameCount: number;
  selectedIndex: number;
  onSeek: (index: number) => void;
  label: string;
  metricLabel?: string;
  unit?: string;
}

/**
 * Angle-over-time chart that doubles as the scrub timeline: click or drag
 * anywhere to move the playhead. X axis is frame index; rep excursions are
 * shaded; the current frame is a vertical line.
 */
export default function AngleChart({
  series,
  reps,
  frameCount,
  selectedIndex,
  onSeek,
  label,
  metricLabel = "angle",
  unit = "°",
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const n = Math.max(1, frameCount - 1);
  const xFor = (i: number) => PAD_X + (i / n) * (VW - 2 * PAD_X);

  const lo = series.min - series.range * 0.12 - 1;
  const hi = series.max + series.range * 0.12 + 1;
  const span = Math.max(1, hi - lo);
  const yFor = (v: number) => PAD_TOP + (1 - (v - lo) / span) * (VH - PAD_TOP - PAD_BOTTOM);

  const path = series.filled
    .map((v, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(v).toFixed(1)}`)
    .join(" ");

  const seekFromEvent = useCallback(
    (clientX: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      onSeek(Math.round(frac * n));
    },
    [n, onSeek],
  );

  return (
    <div className="select-none">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-medium text-stone-500">
          {label} {metricLabel} over movement
        </span>
        <span className="text-[11px] text-stone-400">
          {Math.round(series.min)}{unit}–{Math.round(series.max)}{unit}
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="none"
        className="h-44 w-full cursor-pointer touch-none rounded-lg border border-stone-200 bg-stone-50"
        onPointerDown={(e) => {
          dragging.current = true;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          seekFromEvent(e.clientX);
        }}
        onPointerMove={(e) => dragging.current && seekFromEvent(e.clientX)}
        onPointerUp={() => (dragging.current = false)}
        onPointerLeave={() => (dragging.current = false)}
      >
        {/* rep excursion bands */}
        {reps.map((r) => (
          <rect
            key={r.index}
            x={xFor(r.startFrame)}
            y={PAD_TOP}
            width={Math.max(1, xFor(r.endFrame) - xFor(r.startFrame))}
            height={VH - PAD_TOP - PAD_BOTTOM}
            fill="rgba(13, 148, 136, 0.09)"
          />
        ))}
        {/* rep peak markers */}
        {reps.map((r) => (
          <line
            key={`p${r.index}`}
            x1={xFor(r.peakFrame)}
            x2={xFor(r.peakFrame)}
            y1={PAD_TOP}
            y2={VH - PAD_BOTTOM}
            stroke="rgba(13, 148, 136, 0.35)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        ))}
        {/* angle line */}
        <path d={path} fill="none" stroke="#0d9488" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
        {/* playhead */}
        <line
          x1={xFor(selectedIndex)}
          x2={xFor(selectedIndex)}
          y1={PAD_TOP - 6}
          y2={VH - PAD_BOTTOM + 4}
          stroke="#0f172a"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={xFor(selectedIndex)} cy={yFor(series.filled[selectedIndex] ?? series.min)} r={4} fill="#0f172a" />
      </svg>
    </div>
  );
}
