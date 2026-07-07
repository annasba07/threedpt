/**
 * Guided assessments — named movements with good-form targets.
 *
 * "Record anything" can't be scored against anything. A named assessment can:
 * the same movement, with a reference range / symmetry / tempo, so a form score
 * is meaningful and progress is apples-to-apples session over session.
 *
 * Targets are practical reference points for a general adult, not clinical norms
 * — the app scores against them to give you something to improve, not a
 * diagnosis.
 */

export interface Assessment {
  id: string;
  name: string;
  short: string; // one-line what it checks
  cue: string; // how to perform it
  pair: string; // joint group this trends under ("Shoulder", "Knee")
  primaryJoint: string; // representative joint id
  targets: {
    rangeDeg: number; // good range of motion for the primary joint
    symmetryDeg: number; // acceptable left/right gap
    tempoBalance: number; // acceptable |up:down − 1|
  };
  reps: number;
}

export const ASSESSMENTS: Assessment[] = [
  {
    id: "overhead-reach",
    name: "Overhead reach",
    short: "Shoulder flexion range & symmetry",
    cue: "Stand tall and reach both arms straight overhead, then lower with control.",
    pair: "Shoulder",
    primaryJoint: "shoulder_l",
    targets: { rangeDeg: 150, symmetryDeg: 12, tempoBalance: 0.4 },
    reps: 5,
  },
  {
    id: "lateral-raise",
    name: "Lateral raise",
    short: "Shoulder abduction control",
    cue: "Raise both arms out to your sides up to shoulder height, then lower slowly.",
    pair: "Shoulder",
    primaryJoint: "shoulder_l",
    targets: { rangeDeg: 90, symmetryDeg: 12, tempoBalance: 0.35 },
    reps: 8,
  },
  {
    id: "bodyweight-squat",
    name: "Bodyweight squat",
    short: "Knee & hip depth and symmetry",
    cue: "Feet shoulder-width, sit back and down as far as is comfortable, then stand tall.",
    pair: "Knee",
    primaryJoint: "knee_l",
    targets: { rangeDeg: 80, symmetryDeg: 12, tempoBalance: 0.4 },
    reps: 5,
  },
  {
    id: "sit-to-stand",
    name: "Sit to stand",
    short: "Functional leg strength & evenness",
    cue: "From a seated position, stand up fully, then sit back down with control.",
    pair: "Knee",
    primaryJoint: "knee_l",
    targets: { rangeDeg: 65, symmetryDeg: 15, tempoBalance: 0.5 },
    reps: 5,
  },
];

export function assessmentById(id: string | null | undefined): Assessment | null {
  if (!id) return null;
  return ASSESSMENTS.find((a) => a.id === id) ?? null;
}
