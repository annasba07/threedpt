"use client";

import { useState } from "react";
import { atlasForRegion, STRUCTURE_COLORS } from "@/lib/anatomy/atlas";
import type { PainMarker, RecordedFrame } from "@/lib/pose/types";

interface Props {
  marker: PainMarker;
  frames: RecordedFrame[];
}

export default function AnatomyPanel({ marker, frames }: Props) {
  const [imgOk, setImgOk] = useState(true);
  const atlas = atlasForRegion(marker.regionId);

  const frame = frames[marker.frame];
  // Some regions share an id with a tracked joint angle (e.g. elbow_l).
  const jointAngle = frame?.angles[marker.regionId];

  if (!atlas) {
    return (
      <div className="mt-4 card-soft p-4">
        <h2 className="text-sm font-semibold text-stone-800">
          Anatomy · {marker.region}
        </h2>
        <p className="mt-2 text-sm text-stone-500">
          No detailed atlas for this region yet. Try marking the pain on a specific
          joint (shoulder, elbow, wrist, hip, knee, or ankle).
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 card-soft p-4">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-stone-800">
          Anatomy under this pain point · {atlas.joint}
        </h2>
        <span className="text-[11px] text-stone-400">{marker.region}</span>
      </div>

      {/* Pain context */}
      <div className="mb-3 flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700">
          intensity {marker.intensity}/10
        </span>
        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-600">
          {(marker.t / 1000).toFixed(1)}s{marker.repIndex ? ` · rep ${marker.repIndex}` : ""}
        </span>
        {jointAngle != null && (
          <span className="rounded-full bg-teal-50 px-2.5 py-1 text-teal-700">
            joint at {Math.round(jointAngle)}° here
          </span>
        )}
      </div>

      <p className="mb-4 text-[13px] leading-relaxed text-stone-600">{atlas.summary}</p>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Illustrative image */}
        {atlas.image && imgOk && (
          <figure className="order-2 md:order-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={atlas.image}
              alt={`Illustrative cross-section of the ${atlas.joint}`}
              onError={() => setImgOk(false)}
              className="w-full rounded-xl border border-stone-200"
            />
            <figcaption className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10px] leading-snug text-amber-800">
              <span className="font-semibold">AI illustration.</span>
              <span>
                Schematic and educational only — labels may be imprecise. This is a
                generic drawing, not an image of your body, and not a diagnosis.
              </span>
            </figcaption>
          </figure>
        )}

        {/* Structures (the accurate atlas) */}
        <div className="order-1 md:order-2">
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-stone-400">
            Structures here
          </h3>
          <ul className="space-y-2.5">
            {atlas.structures.map((s) => (
              <li key={s.name} className="flex gap-2.5">
                <span
                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: STRUCTURE_COLORS[s.type] }}
                  title={s.type}
                />
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-stone-800">
                    {s.name}
                    <span className="ml-1.5 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-stone-500">
                      {s.type}
                    </span>
                  </div>
                  <div className="text-[12px] leading-snug text-stone-500">{s.description}</div>
                  {s.associatedWith && (
                    <div className="text-[12px] leading-snug text-stone-600">
                      <span className="text-stone-400">commonly associated with </span>
                      {s.associatedWith}
                    </div>
                  )}
                  {s.stressedBy && (
                    <div className="text-[11px] leading-snug text-stone-400">
                      loaded by {s.stressedBy}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-4 border-t border-stone-100 pt-3 text-[11px] leading-relaxed text-stone-400">
        This lists the structures that live at {atlas.joint.toLowerCase()} and the
        problems each is commonly linked to — it is reference information, not a
        diagnosis. Which structure is actually involved depends on exactly where and
        when it hurts and needs assessment by a clinician (often with imaging).
      </p>
    </div>
  );
}
