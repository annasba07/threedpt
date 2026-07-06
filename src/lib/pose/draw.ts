import { POSE_CONNECTIONS } from "./landmarks";
import type { FrameLandmark } from "./types";

interface DrawOpts {
  /** Draw faint guide lines even when a landmark is low-confidence. */
  bone?: string;
  joint?: string;
  jointLow?: string;
  lineScale?: number;
}

/**
 * Draw a 2D skeleton from normalized image landmarks onto a canvas context.
 * Shared by the live overlay and the review playback so both look identical.
 */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: FrameLandmark[] | undefined,
  w: number,
  h: number,
  opts: DrawOpts = {},
) {
  ctx.clearRect(0, 0, w, h);
  if (!landmarks || landmarks.length === 0) return;

  const bone = opts.bone ?? "rgba(45, 212, 191, 0.95)";
  const joint = opts.joint ?? "rgba(255, 255, 255, 0.95)";
  const jointLow = opts.jointLow ?? "rgba(250, 204, 21, 0.9)";
  const lineScale = opts.lineScale ?? 0.004;

  ctx.lineWidth = Math.max(2, w * lineScale);
  ctx.strokeStyle = bone;
  ctx.lineCap = "round";
  for (const [s, e] of POSE_CONNECTIONS) {
    const p1 = landmarks[s];
    const p2 = landmarks[e];
    if (!p1 || !p2) continue;
    if ((p1.visibility ?? 1) < 0.3 || (p2.visibility ?? 1) < 0.3) continue;
    ctx.beginPath();
    ctx.moveTo(p1.x * w, p1.y * h);
    ctx.lineTo(p2.x * w, p2.y * h);
    ctx.stroke();
  }

  const r = Math.max(3, w * 0.006);
  for (const p of landmarks) {
    const vis = p.visibility ?? 1;
    if (vis < 0.3) continue;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, r, 0, Math.PI * 2);
    ctx.fillStyle = vis > 0.6 ? joint : jointLow;
    ctx.fill();
  }
}
