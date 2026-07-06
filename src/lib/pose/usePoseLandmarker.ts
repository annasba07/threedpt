"use client";

import { useEffect, useRef, useState } from "react";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";

/**
 * Model + WASM asset locations.
 *
 * For the MVP these load from the jsDelivr / Google CDN. Before shipping to real
 * users we should self-host both (copy the wasm bundle and the .task file into
 * /public) so the app works offline and is not subject to a third-party CDN's
 * uptime or CSP — tracked for Phase 5 hardening.
 */
const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";

export type LandmarkerStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error";

interface UsePoseLandmarker {
  landmarker: PoseLandmarker | null;
  status: LandmarkerStatus;
  error: string | null;
  /** "GPU" or "CPU" — which delegate actually initialized. */
  delegate: string | null;
}

/**
 * Creates a single PoseLandmarker in VIDEO running mode. Tries the GPU delegate
 * first and transparently falls back to CPU, since WebGL/WebGPU availability
 * varies across the browsers real users will bring.
 */
export function usePoseLandmarker(): UsePoseLandmarker {
  const [status, setStatus] = useState<LandmarkerStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [delegate, setDelegate] = useState<string | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const [, force] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let created: PoseLandmarker | null = null;

    async function init() {
      setStatus("loading");
      setError(null);
      try {
        const { FilesetResolver, PoseLandmarker } = await import(
          "@mediapipe/tasks-vision"
        );
        const vision = await FilesetResolver.forVisionTasks(WASM_BASE);

        const build = (d: "GPU" | "CPU") =>
          PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: d },
            runningMode: "VIDEO",
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
            outputSegmentationMasks: false,
          });

        let usedDelegate: "GPU" | "CPU" = "GPU";
        try {
          created = await build("GPU");
        } catch {
          usedDelegate = "CPU";
          created = await build("CPU");
        }

        if (cancelled) {
          created.close();
          return;
        }
        landmarkerRef.current = created;
        setDelegate(usedDelegate);
        setStatus("ready");
        force((n) => n + 1);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      }
    }

    init();

    return () => {
      cancelled = true;
      created?.close();
      landmarkerRef.current = null;
    };
  }, []);

  return {
    landmarker: landmarkerRef.current,
    status,
    error,
    delegate,
  };
}
