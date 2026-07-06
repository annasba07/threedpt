/**
 * MediaPipe Pose landmark topology (33-point model).
 * https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
 *
 * We keep our own copy of the indices and the connection list so the app does
 * not depend on runtime statics from the library and so future phases (skeleton
 * retargeting, force estimation) reference a single source of truth.
 */

export const LANDMARK = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

export type LandmarkIndex = (typeof LANDMARK)[keyof typeof LANDMARK];

/** Bones drawn for the skeleton overlay. Face detail is intentionally omitted. */
export const POSE_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  // torso
  [LANDMARK.LEFT_SHOULDER, LANDMARK.RIGHT_SHOULDER],
  [LANDMARK.LEFT_SHOULDER, LANDMARK.LEFT_HIP],
  [LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_HIP],
  [LANDMARK.LEFT_HIP, LANDMARK.RIGHT_HIP],
  // left arm
  [LANDMARK.LEFT_SHOULDER, LANDMARK.LEFT_ELBOW],
  [LANDMARK.LEFT_ELBOW, LANDMARK.LEFT_WRIST],
  [LANDMARK.LEFT_WRIST, LANDMARK.LEFT_INDEX],
  // right arm
  [LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_ELBOW],
  [LANDMARK.RIGHT_ELBOW, LANDMARK.RIGHT_WRIST],
  [LANDMARK.RIGHT_WRIST, LANDMARK.RIGHT_INDEX],
  // left leg
  [LANDMARK.LEFT_HIP, LANDMARK.LEFT_KNEE],
  [LANDMARK.LEFT_KNEE, LANDMARK.LEFT_ANKLE],
  [LANDMARK.LEFT_ANKLE, LANDMARK.LEFT_HEEL],
  [LANDMARK.LEFT_HEEL, LANDMARK.LEFT_FOOT_INDEX],
  [LANDMARK.LEFT_ANKLE, LANDMARK.LEFT_FOOT_INDEX],
  // right leg
  [LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_KNEE],
  [LANDMARK.RIGHT_KNEE, LANDMARK.RIGHT_ANKLE],
  [LANDMARK.RIGHT_ANKLE, LANDMARK.RIGHT_HEEL],
  [LANDMARK.RIGHT_HEEL, LANDMARK.RIGHT_FOOT_INDEX],
  [LANDMARK.RIGHT_ANKLE, LANDMARK.RIGHT_FOOT_INDEX],
];

export type Side = "left" | "right";

/**
 * A tracked joint angle, defined by three landmarks: the angle is measured at
 * `vertex`, between the segments (vertex→a) and (vertex→c).
 */
export interface JointAngleDef {
  id: string;
  label: string;
  side: Side;
  a: number;
  vertex: number;
  c: number;
  /**
   * Rough anatomical range for the measured angle in degrees, used only to
   * color the readout. Not a clinical norm.
   */
  typical: readonly [number, number];
}

export const JOINT_ANGLES: readonly JointAngleDef[] = [
  {
    id: "elbow_l",
    label: "L Elbow",
    side: "left",
    a: LANDMARK.LEFT_SHOULDER,
    vertex: LANDMARK.LEFT_ELBOW,
    c: LANDMARK.LEFT_WRIST,
    typical: [30, 180],
  },
  {
    id: "elbow_r",
    label: "R Elbow",
    side: "right",
    a: LANDMARK.RIGHT_SHOULDER,
    vertex: LANDMARK.RIGHT_ELBOW,
    c: LANDMARK.RIGHT_WRIST,
    typical: [30, 180],
  },
  {
    id: "shoulder_l",
    label: "L Shoulder",
    side: "left",
    a: LANDMARK.LEFT_ELBOW,
    vertex: LANDMARK.LEFT_SHOULDER,
    c: LANDMARK.LEFT_HIP,
    typical: [0, 180],
  },
  {
    id: "shoulder_r",
    label: "R Shoulder",
    side: "right",
    a: LANDMARK.RIGHT_ELBOW,
    vertex: LANDMARK.RIGHT_SHOULDER,
    c: LANDMARK.RIGHT_HIP,
    typical: [0, 180],
  },
  {
    id: "hip_l",
    label: "L Hip",
    side: "left",
    a: LANDMARK.LEFT_SHOULDER,
    vertex: LANDMARK.LEFT_HIP,
    c: LANDMARK.LEFT_KNEE,
    typical: [80, 180],
  },
  {
    id: "hip_r",
    label: "R Hip",
    side: "right",
    a: LANDMARK.RIGHT_SHOULDER,
    vertex: LANDMARK.RIGHT_HIP,
    c: LANDMARK.RIGHT_KNEE,
    typical: [80, 180],
  },
  {
    id: "knee_l",
    label: "L Knee",
    side: "left",
    a: LANDMARK.LEFT_HIP,
    vertex: LANDMARK.LEFT_KNEE,
    c: LANDMARK.LEFT_ANKLE,
    typical: [80, 180],
  },
  {
    id: "knee_r",
    label: "R Knee",
    side: "right",
    a: LANDMARK.RIGHT_HIP,
    vertex: LANDMARK.RIGHT_KNEE,
    c: LANDMARK.RIGHT_ANKLE,
    typical: [80, 180],
  },
];
