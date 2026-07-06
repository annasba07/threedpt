import { JOINT_ANGLES } from "./landmarks";
import { angleAtVertex, minVisibility, type Vec3 } from "./math";
import type { FrameLandmark } from "./types";

/** Below this landmark visibility a joint angle is treated as unreliable. */
export const VISIBILITY_GATE = 0.6;

/**
 * Compute every tracked joint angle for one frame.
 *
 * Angles come from the *world* landmarks (metric 3D) while visibility is read
 * from the image landmarks — the two arrays share MediaPipe's indexing. Returns
 * raw (unsmoothed) values; smoothing is left to the display layer.
 */
export function computeFrameAngles(
  world: FrameLandmark[],
  image: FrameLandmark[],
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const def of JOINT_ANGLES) {
    const wa = world[def.a];
    const wv = world[def.vertex];
    const wc = world[def.c];
    const ia = image[def.a];
    const iv = image[def.vertex];
    const ic = image[def.c];
    if (!wa || !wv || !wc || !ia || !iv || !ic) {
      out[def.id] = null;
      continue;
    }
    if (minVisibility(ia as Vec3, iv as Vec3, ic as Vec3) < VISIBILITY_GATE) {
      out[def.id] = null;
      continue;
    }
    out[def.id] = angleAtVertex(wa as Vec3, wv as Vec3, wc as Vec3);
  }
  return out;
}
