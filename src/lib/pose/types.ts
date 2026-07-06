/** Shared pose data structures used by live capture, recording, and review. */

export interface FrameLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

/** One captured moment: normalized image landmarks (for drawing), world
 * landmarks (metric, for angles), the timestamp, and precomputed joint angles. */
export interface RecordedFrame {
  /** Milliseconds since recording started. */
  t: number;
  image: FrameLandmark[];
  world: FrameLandmark[];
  /** joint id -> angle in degrees, or null when the joint was not reliable. */
  angles: Record<string, number | null>;
}

export interface PainMarker {
  id: string;
  /** Body region the marker is anchored to (see regions.ts). */
  regionId: string;
  region: string;
  /** Reported intensity 1–10. */
  intensity: number;
  /** Frame index and time the pain was tagged at. */
  frame: number;
  t: number;
  /** Rep the tagged frame falls in, if any. */
  repIndex: number | null;
  note?: string;
}

export interface Rep {
  index: number;
  startFrame: number;
  peakFrame: number;
  endFrame: number;
  startT: number;
  peakT: number;
  endT: number;
  /** Peak-to-valley angular excursion for this rep, in degrees. */
  amplitude: number;
}
