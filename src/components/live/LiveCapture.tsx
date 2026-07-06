"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import { usePoseLandmarker } from "@/lib/pose/usePoseLandmarker";
import { JOINT_ANGLES, type JointAngleDef } from "@/lib/pose/landmarks";
import { computeFrameAngles } from "@/lib/pose/angles";
import { drawSkeleton } from "@/lib/pose/draw";
import { LandmarkSmoother } from "@/lib/pose/filter";
import { smooth } from "@/lib/pose/math";
import { pickPrimaryJoint } from "@/lib/pose/reps";
import type { FrameLandmark, RecordedFrame } from "@/lib/pose/types";
import { useSession } from "@/lib/store/session";
import { LiveCoach, type LiveState } from "@/lib/analysis/realtime";

type CameraStatus = "idle" | "starting" | "live" | "denied" | "error";

const UI_INTERVAL = 100;
/** Safety cap so a forgotten recording can't grow without bound (~2 min @30fps). */
const MAX_FRAMES = 3600;

function cloneLandmarks(src: { x: number; y: number; z: number; visibility?: number }[]): FrameLandmark[] {
  return src.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility }));
}

export default function LiveCapture() {
  const { landmarker, status: modelStatus, error: modelError, delegate } =
    usePoseLandmarker();
  const loadRecording = useSession((s) => s.loadRecording);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sampleVideoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [mirrored, setMirrored] = useState(true);
  const [fps, setFps] = useState(0);
  const [personVisible, setPersonVisible] = useState(false);
  const [angles, setAngles] = useState<Record<string, number | null>>({});
  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [tooShort, setTooShort] = useState(false);
  const [live, setLive] = useState<LiveState | null>(null);

  const coachRef = useRef<LiveCoach | null>(null);
  const liveRef = useRef<LiveState | null>(null);

  const lastVideoTimeRef = useRef(-1);
  const lastResultRef = useRef<PoseLandmarkerResult | null>(null);
  const fpsRef = useRef(0);
  const lastFrameRef = useRef(0);
  const lastUiFlushRef = useRef(0);

  const recordingRef = useRef(false);
  const recordBufferRef = useRef<RecordedFrame[]>([]);
  const recordStartRef = useRef(0);

  const imageSmootherRef = useRef<LandmarkSmoother | null>(null);
  const worldSmootherRef = useRef<LandmarkSmoother | null>(null);
  const lastSmoothedRef = useRef<{
    image: FrameLandmark[];
    world: FrameLandmark[];
    angles: Record<string, number | null>;
  } | null>(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (sampleVideoRef.current) {
      sampleVideoRef.current.pause();
      sampleVideoRef.current.removeAttribute("src");
      sampleVideoRef.current.remove();
      sampleVideoRef.current = null;
    }
    lastVideoTimeRef.current = -1;
    lastResultRef.current = null;
    lastSmoothedRef.current = null;
    recordingRef.current = false;
    setCameraStatus("idle");
    setPersonVisible(false);
    setAngles({});
    setIsRecording(false);
    setLive(null);
    coachRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setTooShort(false);
    setCameraStatus("starting");
    imageSmootherRef.current = new LandmarkSmoother(33, 2);
    worldSmootherRef.current = new LandmarkSmoother(33, 3);
    lastSmoothedRef.current = null;
    coachRef.current = new LiveCoach();
    liveRef.current = null;
    setLive(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setCameraStatus("live");
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") setCameraStatus("denied");
      else {
        setCameraStatus("error");
        setCameraError(e instanceof Error ? e.message : String(e));
      }
    }
  }, []);

  // Feed the bundled sample clip through the exact same pipeline as a live
  // webcam — lets you see the full flow end-to-end without a camera.
  const startSample = useCallback(async () => {
    setCameraError(null);
    setTooShort(false);
    setCameraStatus("starting");
    imageSmootherRef.current = new LandmarkSmoother(33, 2);
    worldSmootherRef.current = new LandmarkSmoother(33, 3);
    lastSmoothedRef.current = null;
    coachRef.current = new LiveCoach();
    liveRef.current = null;
    setLive(null);
    try {
      const src = document.createElement("video");
      src.src = "/demo/exercise.mp4";
      src.loop = true;
      src.muted = true;
      src.playsInline = true;
      src.style.display = "none";
      document.body.appendChild(src);
      await src.play();
      sampleVideoRef.current = src;
      const stream = (src as HTMLVideoElement & { captureStream(): MediaStream }).captureStream();
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setCameraStatus("live");
    } catch (e) {
      setCameraStatus("error");
      setCameraError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const startRecording = useCallback(() => {
    recordBufferRef.current = [];
    recordStartRef.current = performance.now();
    recordingRef.current = true;
    setTooShort(false);
    setRecSeconds(0);
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback(() => {
    recordingRef.current = false;
    setIsRecording(false);
    const frames = recordBufferRef.current;
    if (frames.length < 6) {
      setTooShort(true);
      return;
    }
    const primary = pickPrimaryJoint(frames);
    loadRecording(frames, primary);
  }, [loadRecording]);

  const drawLive = useCallback(
    (landmarks: FrameLandmark[] | undefined, canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      drawSkeleton(ctx, landmarks, canvas.width, canvas.height);
    },
    [],
  );

  // Inference + draw + optional record loop.
  useEffect(() => {
    if (cameraStatus !== "live" || !landmarker) return;

    const loop = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w && h && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w;
        canvas.height = h;
      }

      const now = performance.now();
      let advanced = false;
      if (video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        advanced = true;
        try {
          lastResultRef.current = landmarker.detectForVideo(video, now);
        } catch {
          /* transient */
        }
      }

      const result = lastResultRef.current;
      if (result) {
        // On a fresh detection, run the raw landmarks through the temporal
        // smoother so jitter and occluded-limb flailing are damped once, up
        // front, for the overlay, the angles, and anything we record.
        if (advanced) {
          const rawImage = result.landmarks?.[0];
          const rawWorld = result.worldLandmarks?.[0];
          if (rawImage && rawWorld && imageSmootherRef.current && worldSmootherRef.current) {
            const vis = rawImage.map((p) => p.visibility ?? 1);
            const image = imageSmootherRef.current.process(rawImage, vis, now);
            const world = worldSmootherRef.current.process(rawWorld, vis, now);
            const angles = computeFrameAngles(world, image);
            lastSmoothedRef.current = { image, world, angles };
            if (coachRef.current) liveRef.current = coachRef.current.push(angles, now);

            if (recordingRef.current && recordBufferRef.current.length < MAX_FRAMES) {
              recordBufferRef.current.push({
                t: now - recordStartRef.current,
                image: cloneLandmarks(image),
                world: cloneLandmarks(world),
                angles,
              });
            }
          } else if (!rawImage) {
            lastSmoothedRef.current = null;
          }
        }

        const smoothed = lastSmoothedRef.current;
        drawLive(smoothed?.image, canvas);

        if (lastFrameRef.current) {
          const dt = now - lastFrameRef.current;
          if (dt > 0) fpsRef.current = smooth(fpsRef.current || null, 1000 / dt, 0.1);
        }
        lastFrameRef.current = now;

        if (now - lastUiFlushRef.current > UI_INTERVAL) {
          lastUiFlushRef.current = now;
          setFps(Math.round(fpsRef.current));
          setPersonVisible(Boolean(smoothed));
          setLive(liveRef.current);
          if (smoothed) {
            const display: Record<string, number | null> = {};
            for (const def of JOINT_ANGLES) {
              display[def.id] = smoothed.angles[def.id] ?? null;
            }
            setAngles(display);
          }
          if (recordingRef.current) {
            setRecSeconds((now - recordStartRef.current) / 1000);
          }
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [cameraStatus, landmarker, drawLive]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const modelBusy = modelStatus === "loading" || modelStatus === "idle";
  const canStart =
    modelStatus === "ready" && cameraStatus !== "live" && cameraStatus !== "starting";
  const mirrorClass = mirrored ? "-scale-x-100" : "";
  const activeAngle = live?.activeJoint ? angles[live.activeJoint] ?? null : null;

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      <div className="flex-1">
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-stone-900 shadow-[0_2px_8px_rgba(74,56,30,0.1),0_24px_48px_-24px_rgba(74,56,30,0.3)]">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`absolute inset-0 h-full w-full object-cover ${mirrorClass}`}
          />
          <canvas
            ref={canvasRef}
            className={`absolute inset-0 h-full w-full object-cover ${mirrorClass}`}
          />

          {cameraStatus !== "live" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 p-6 text-center">
              {modelBusy ? (
                <p className="text-sm text-white/70">Loading pose model…</p>
              ) : modelStatus === "error" ? (
                <p className="max-w-sm text-sm text-red-300">
                  Failed to load the pose model. {modelError}
                </p>
              ) : cameraStatus === "denied" ? (
                <div className="max-w-sm space-y-2">
                  <p className="text-sm text-red-300">Camera access was blocked.</p>
                  <p className="text-xs text-white/50">
                    Enable the camera for this site in your browser, then try again.
                  </p>
                </div>
              ) : cameraStatus === "error" ? (
                <p className="max-w-sm text-sm text-red-300">
                  Could not start the camera. {cameraError}
                </p>
              ) : (
                <p className="max-w-sm text-sm text-white/60">
                  Stand back so your whole body is in frame for best tracking.
                </p>
              )}
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={startCamera}
                  disabled={!canStart}
                  className="rounded-full bg-teal-500 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {cameraStatus === "starting" ? "Starting…" : "Start camera"}
                </button>
                <button
                  onClick={startSample}
                  disabled={modelStatus !== "ready" || cameraStatus === "starting"}
                  className="rounded-full border border-white/25 bg-white/5 px-5 py-2 text-sm font-medium text-white/90 transition hover:bg-white/15 disabled:opacity-40"
                >
                  ▶ Try a sample clip — no webcam needed
                </button>
              </div>
            </div>
          )}

          {cameraStatus === "live" && (
            <>
              <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 text-[11px] font-medium">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 backdrop-blur ${
                    personVisible ? "bg-emerald-500/20 text-emerald-200" : "bg-yellow-500/20 text-yellow-100"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${personVisible ? "bg-emerald-400" : "bg-yellow-300"}`} />
                  {personVisible ? "Tracking you" : "Step into frame"}
                </span>
              </div>

              {/* Live rep counter */}
              <div className="pointer-events-none absolute bottom-3 left-3 flex items-end gap-1.5 rounded-2xl bg-black/55 px-3.5 py-2 backdrop-blur">
                <span className="font-display text-3xl leading-none text-white tabular-nums">{live?.reps ?? 0}</span>
                <span className="pb-0.5 text-[11px] text-white/60">
                  reps{live?.activeLabel ? ` · ${live.activeLabel.toLowerCase()}` : ""}
                </span>
              </div>

              {/* Live coaching cue */}
              {personVisible && live?.cue && (
                <div
                  className={`pointer-events-none absolute bottom-3 left-1/2 flex max-w-[70%] -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold text-white shadow-lg backdrop-blur transition ${
                    live.cue.tone === "warn"
                      ? "bg-red-500/90"
                      : live.cue.tone === "info"
                        ? "bg-amber-500/90"
                        : "bg-teal-500/90"
                  }`}
                >
                  <span className="text-white/90">
                    {live.cue.tone === "warn" ? "⚠" : live.cue.tone === "info" ? "→" : "✓"}
                  </span>
                  {live.cue.text}
                </div>
              )}
            </>
          )}

          {isRecording && (
            <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-2 rounded-full bg-red-500/90 px-3 py-1 text-[11px] font-semibold text-white">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
              REC {recSeconds.toFixed(1)}s
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {cameraStatus === "live" ? (
            <>
              {isRecording ? (
                <button
                  onClick={stopRecording}
                  className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
                >
                  Stop & analyze
                </button>
              ) : (
                <button
                  onClick={startRecording}
                  className="flex items-center gap-2 rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
                >
                  <span className="h-2.5 w-2.5 rounded-full bg-white" />
                  Record movement
                </button>
              )}
              <button
                onClick={stopCamera}
                className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
              >
                Stop camera
              </button>
            </>
          ) : (
            <button
              onClick={startCamera}
              disabled={!canStart}
              className="rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-500 disabled:opacity-40"
            >
              Start camera
            </button>
          )}
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input
              type="checkbox"
              checked={mirrored}
              onChange={(e) => setMirrored(e.target.checked)}
              className="accent-teal-600"
            />
            Mirror view
          </label>
        </div>

        {tooShort && (
          <p className="mt-2 text-sm text-amber-700">
            That recording was too short to analyze — record a few seconds of the
            movement and try again.
          </p>
        )}
      </div>

      {/* Live readouts */}
      <div className="w-full space-y-4 lg:w-80">
        {cameraStatus === "live" && (
          <div className="card-soft p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-stone-800">Live coaching</h2>
              <span className="text-[11px] text-stone-400">{personVisible ? "tracking" : "step in"}</span>
            </div>
            <div className="mt-3 flex items-end gap-5">
              <div>
                <div className="font-display text-4xl leading-none text-stone-900 tabular-nums">
                  {live?.reps ?? 0}
                </div>
                <div className="text-[11px] uppercase tracking-[0.12em] text-stone-400">reps</div>
              </div>
              {live?.activeLabel && (
                <div className="pb-0.5">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-stone-400">{live.activeLabel}</div>
                  <div className="font-display text-2xl leading-none text-stone-800 tabular-nums">
                    {activeAngle != null ? `${Math.round(activeAngle)}°` : "—"}
                  </div>
                </div>
              )}
            </div>
            {live?.cue && (
              <div
                className={`mt-4 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13px] font-medium ${
                  live.cue.tone === "warn"
                    ? "bg-red-50 text-red-700"
                    : live.cue.tone === "info"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-teal-50 text-teal-700"
                }`}
              >
                <span>{live.cue.tone === "warn" ? "⚠" : live.cue.tone === "info" ? "→" : "✓"}</span>
                {live.cue.text}
              </div>
            )}
            <p className="mt-3 text-[11px] leading-relaxed text-stone-400">
              Cues update as you move. Hit{" "}
              <span className="font-medium text-stone-600">Record movement</span> to save a set
              for the full analysis.
            </p>
          </div>
        )}

        <div className="card-soft p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-800">Joint angles</h2>
            <span className="text-[10px] uppercase tracking-wide text-stone-400">
              degrees · 3D
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {JOINT_ANGLES.map((def) => (
              <AngleCard
                key={def.id}
                def={def}
                value={angles[def.id] ?? null}
                active={live?.activeJoint === def.id}
              />
            ))}
          </div>
          {cameraStatus !== "live" && (
            <p className="mt-4 text-[11px] leading-relaxed text-stone-400">
              Start the camera to see live joint angles, rep counts, and form cues as you move.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function AngleCard({ def, value, active }: { def: JointAngleDef; value: number | null; active?: boolean }) {
  const tracked = value !== null;
  return (
    <div
      className={`rounded-xl px-3 py-2 transition ${
        active ? "bg-teal-50 ring-1 ring-teal-300" : tracked ? "bg-stone-50" : "bg-transparent"
      }`}
    >
      <div className="text-[11px] font-medium text-stone-500">{def.label}</div>
      <div className={`text-lg font-semibold tabular-nums ${tracked ? "text-stone-900" : "text-stone-300"}`}>
        {tracked ? `${Math.round(value)}°` : "—"}
      </div>
    </div>
  );
}
