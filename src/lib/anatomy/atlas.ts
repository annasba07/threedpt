/**
 * Curated anatomical atlas — the *accurate* track of the pain view.
 *
 * These are real named structures for each joint with plain-language notes on
 * what they do, the condition they're commonly associated with, and the loading
 * that tends to stress them. This is reference knowledge, not a diagnosis of a
 * specific person: which structure is actually involved requires clinical exam
 * and usually imaging. The AI-generated cross-section is a separate,
 * explicitly-illustrative track.
 */

export type StructureType =
  | "tendon"
  | "ligament"
  | "nerve"
  | "muscle"
  | "bursa"
  | "cartilage"
  | "bone"
  | "disc";

export interface AnatomyStructure {
  name: string;
  type: StructureType;
  description: string;
  associatedWith?: string;
  stressedBy?: string;
}

export interface JointAtlas {
  key: string;
  joint: string;
  summary: string;
  /** AI-generated illustration in /public/anatomy, if one exists. */
  image?: string;
  structures: AnatomyStructure[];
}

const ATLAS: Record<string, JointAtlas> = {
  shoulder: {
    key: "shoulder",
    joint: "Shoulder",
    image: "/anatomy/shoulder.webp",
    summary:
      "A shallow ball-and-socket joint that trades stability for range of motion, kept centered mostly by the rotator cuff and labrum.",
    structures: [
      {
        name: "Supraspinatus tendon (rotator cuff)",
        type: "tendon",
        description: "Runs under the acromion and initiates raising the arm.",
        associatedWith: "rotator cuff tendinopathy / impingement / tears",
        stressedBy: "overhead reaching and lifting",
      },
      {
        name: "Infraspinatus & teres minor tendons",
        type: "tendon",
        description: "Posterior cuff; externally rotate the shoulder.",
        associatedWith: "posterior cuff tendinopathy",
        stressedBy: "resisted external rotation",
      },
      {
        name: "Subscapularis tendon",
        type: "tendon",
        description: "Anterior cuff; internally rotates the shoulder.",
        stressedBy: "resisted internal rotation, reaching behind the back",
      },
      {
        name: "Long head of biceps tendon",
        type: "tendon",
        description: "Runs in the bicipital groove into the top of the socket.",
        associatedWith: "biceps tendinopathy / SLAP tear",
        stressedBy: "lifting and forward flexion with the arm out front",
      },
      {
        name: "Glenoid labrum",
        type: "cartilage",
        description: "A cartilage rim that deepens the socket and anchors ligaments.",
        associatedWith: "labral (SLAP/Bankart) tears",
        stressedBy: "dislocation forces, heavy overhead load",
      },
      {
        name: "Subacromial bursa",
        type: "bursa",
        description: "Cushions the cuff under the acromion.",
        associatedWith: "subacromial bursitis",
        stressedBy: "repetitive overhead motion",
      },
      {
        name: "Acromioclavicular (AC) ligaments",
        type: "ligament",
        description: "Stabilize the joint between collarbone and acromion.",
        associatedWith: "AC joint sprain ('separated shoulder')",
        stressedBy: "cross-body reaching, falls onto the shoulder",
      },
    ],
  },

  elbow: {
    key: "elbow",
    joint: "Elbow",
    image: "/anatomy/elbow.webp",
    summary:
      "A hinge joint between the humerus, radius, and ulna. Most non-traumatic elbow pain sits at the tendon origins on the two bony bumps (epicondyles).",
    structures: [
      {
        name: "Common extensor tendon (lateral epicondyle)",
        type: "tendon",
        description: "Origin of the wrist-extensor muscles on the outer elbow.",
        associatedWith: "lateral epicondylitis ('tennis elbow')",
        stressedBy: "repetitive wrist extension and gripping",
      },
      {
        name: "Common flexor tendon (medial epicondyle)",
        type: "tendon",
        description: "Origin of the wrist-flexor / pronator muscles on the inner elbow.",
        associatedWith: "medial epicondylitis ('golfer's elbow')",
        stressedBy: "repetitive wrist flexion and forearm pronation",
      },
      {
        name: "Ulnar collateral ligament (UCL)",
        type: "ligament",
        description: "Inner-elbow ligament that resists valgus (outward) force.",
        associatedWith: "UCL sprain/tear (throwers)",
        stressedBy: "valgus load, throwing",
      },
      {
        name: "Radial collateral ligament (RCL)",
        type: "ligament",
        description: "Outer-elbow ligament that resists varus (inward) force.",
        stressedBy: "varus load, falls",
      },
      {
        name: "Distal biceps tendon",
        type: "tendon",
        description: "Attaches the biceps to the radius; flexes and supinates.",
        associatedWith: "distal biceps tendinopathy / rupture",
        stressedBy: "heavy flexion, sudden eccentric load",
      },
      {
        name: "Triceps tendon",
        type: "tendon",
        description: "Attaches the triceps to the olecranon; extends the elbow.",
        stressedBy: "forceful pushing / extension",
      },
      {
        name: "Ulnar nerve (cubital tunnel)",
        type: "nerve",
        description: "Passes behind the inner elbow (the 'funny bone').",
        associatedWith: "cubital tunnel syndrome (ring/little-finger tingling)",
        stressedBy: "sustained elbow flexion, leaning on the elbow",
      },
      {
        name: "Olecranon bursa",
        type: "bursa",
        description: "Cushion over the point of the elbow.",
        associatedWith: "olecranon bursitis",
        stressedBy: "pressure or impact on the elbow tip",
      },
    ],
  },

  wrist: {
    key: "wrist",
    joint: "Wrist & hand",
    image: "/anatomy/wrist.webp",
    summary:
      "A complex of small carpal bones bridging the forearm and hand, crossed by flexor and extensor tendons and the median and ulnar nerves.",
    structures: [
      {
        name: "Median nerve (carpal tunnel)",
        type: "nerve",
        description: "Passes through the carpal tunnel to the thumb-side of the hand.",
        associatedWith: "carpal tunnel syndrome",
        stressedBy: "sustained wrist flexion, repetitive gripping/typing",
      },
      {
        name: "Flexor & extensor tendons",
        type: "tendon",
        description: "Move the wrist and fingers; run in sheaths across the wrist.",
        associatedWith: "tendinopathy, de Quervain's (thumb-side)",
        stressedBy: "repetitive gripping, thumb use",
      },
      {
        name: "TFCC (triangular fibrocartilage complex)",
        type: "cartilage",
        description: "Cushions and stabilizes the little-finger side of the wrist.",
        associatedWith: "TFCC tear",
        stressedBy: "loaded rotation, falls onto an outstretched hand",
      },
      {
        name: "Scapholunate ligament",
        type: "ligament",
        description: "Key stabilizer between two carpal bones.",
        stressedBy: "falls onto an outstretched hand",
      },
    ],
  },

  hip: {
    key: "hip",
    joint: "Hip",
    image: "/anatomy/hip.webp",
    summary:
      "A deep, stable ball-and-socket joint. Lateral 'hip' pain is often tendon/bursa on the outside of the femur rather than the joint itself.",
    structures: [
      {
        name: "Gluteus medius / minimus tendons",
        type: "tendon",
        description: "Attach on the greater trochanter; stabilize the pelvis when standing on one leg.",
        associatedWith: "gluteal tendinopathy (main cause of lateral hip pain)",
        stressedBy: "single-leg loading, crossing the legs, side-lying",
      },
      {
        name: "Trochanteric bursa",
        type: "bursa",
        description: "Cushions the outer hip over the trochanter.",
        associatedWith: "trochanteric bursitis",
        stressedBy: "pressure on the side, repetitive friction",
      },
      {
        name: "Iliopsoas (hip flexor) tendon",
        type: "tendon",
        description: "Primary hip flexor; crosses the front of the joint.",
        associatedWith: "hip flexor tendinopathy / snapping hip",
        stressedBy: "repeated hip flexion, deep squatting",
      },
      {
        name: "Acetabular labrum",
        type: "cartilage",
        description: "Cartilage rim deepening the socket and sealing the joint.",
        associatedWith: "labral tear / impingement (FAI)",
        stressedBy: "deep flexion + rotation, pivoting",
      },
      {
        name: "Joint (articular) cartilage",
        type: "cartilage",
        description: "Lines the ball and socket for smooth loading.",
        associatedWith: "osteoarthritis (deep groin pain)",
        stressedBy: "sustained heavy loading",
      },
    ],
  },

  knee: {
    key: "knee",
    joint: "Knee",
    image: "/anatomy/knee.webp",
    summary:
      "A hinge held by four main ligaments and cushioned by two menisci, with the kneecap tendons running over the front.",
    structures: [
      {
        name: "Anterior cruciate ligament (ACL)",
        type: "ligament",
        description: "Central ligament resisting the shin sliding forward and rotation.",
        associatedWith: "ACL sprain/tear",
        stressedBy: "pivoting, sudden deceleration, landing",
      },
      {
        name: "Posterior cruciate ligament (PCL)",
        type: "ligament",
        description: "Central ligament resisting the shin sliding backward.",
        stressedBy: "a blow to the front of the bent shin",
      },
      {
        name: "Medial collateral ligament (MCL)",
        type: "ligament",
        description: "Inner-knee ligament resisting valgus force.",
        associatedWith: "MCL sprain",
        stressedBy: "a blow to the outside of the knee, valgus load",
      },
      {
        name: "Lateral collateral ligament (LCL)",
        type: "ligament",
        description: "Outer-knee ligament resisting varus force.",
        stressedBy: "a blow to the inside of the knee",
      },
      {
        name: "Medial & lateral menisci",
        type: "cartilage",
        description: "C-shaped cartilage cushions that spread load across the joint.",
        associatedWith: "meniscus tear",
        stressedBy: "twisting on a planted foot, deep squatting",
      },
      {
        name: "Patellar tendon",
        type: "tendon",
        description: "Connects the kneecap to the shin; transmits the quads' force.",
        associatedWith: "patellar tendinopathy ('jumper's knee')",
        stressedBy: "jumping, decelerating, heavy squats",
      },
      {
        name: "Quadriceps tendon",
        type: "tendon",
        description: "Connects the quads to the top of the kneecap.",
        associatedWith: "quadriceps tendinopathy",
        stressedBy: "heavy knee extension under load",
      },
      {
        name: "Patellofemoral cartilage",
        type: "cartilage",
        description: "Cartilage where the kneecap glides on the femur.",
        associatedWith: "patellofemoral pain / chondromalacia (front-of-knee ache)",
        stressedBy: "stairs, squats, prolonged sitting",
      },
      {
        name: "Iliotibial (IT) band",
        type: "tendon",
        description: "A fibrous band along the outer thigh crossing the outer knee.",
        associatedWith: "IT band syndrome (outer-knee pain)",
        stressedBy: "repetitive bending — running, cycling",
      },
    ],
  },

  ankle: {
    key: "ankle",
    joint: "Ankle & foot",
    image: "/anatomy/ankle.webp",
    summary:
      "A hinge stabilized by ligaments on both sides, powered by the Achilles behind and supported by the plantar fascia underneath.",
    structures: [
      {
        name: "ATFL / CFL (lateral ligaments)",
        type: "ligament",
        description: "Outer-ankle ligaments — the ones torn in a classic rolled ankle.",
        associatedWith: "lateral ankle sprain",
        stressedBy: "inversion (rolling the ankle inward)",
      },
      {
        name: "Deltoid ligament (medial)",
        type: "ligament",
        description: "Strong fan of ligaments on the inner ankle.",
        associatedWith: "medial (eversion) sprain",
        stressedBy: "eversion / everting force",
      },
      {
        name: "Achilles tendon",
        type: "tendon",
        description: "The body's largest tendon; plantarflexes the ankle (push-off).",
        associatedWith: "Achilles tendinopathy / rupture",
        stressedBy: "running, jumping, sudden push-off",
      },
      {
        name: "Peroneal tendons",
        type: "tendon",
        description: "Run behind the outer ankle bone; evert and stabilize.",
        associatedWith: "peroneal tendinopathy",
        stressedBy: "repeated eversion, uneven ground",
      },
      {
        name: "Plantar fascia",
        type: "ligament",
        description: "Thick band under the foot supporting the arch.",
        associatedWith: "plantar fasciitis (heel pain)",
        stressedBy: "prolonged standing, first steps in the morning",
      },
    ],
  },

  lowback: {
    key: "lowback",
    joint: "Low back",
    summary:
      "The lumbar spine stacks vertebrae with discs between them, small facet joints behind, and thick paraspinal muscles alongside.",
    structures: [
      {
        name: "Intervertebral discs",
        type: "disc",
        description: "Cushions between vertebrae; can bulge or herniate onto a nerve.",
        associatedWith: "disc herniation (may cause sciatica)",
        stressedBy: "loaded flexion, lifting with a rounded back",
      },
      {
        name: "Facet joints",
        type: "cartilage",
        description: "Paired joints at the back of the spine guiding movement.",
        associatedWith: "facet joint pain",
        stressedBy: "repeated extension / arching",
      },
      {
        name: "Paraspinal & erector muscles",
        type: "muscle",
        description: "Column of muscles that extend and stabilize the spine.",
        associatedWith: "muscular strain (most common back pain)",
        stressedBy: "sudden or sustained loading, poor lifting mechanics",
      },
      {
        name: "Spinal nerve roots",
        type: "nerve",
        description: "Exit between vertebrae to the legs.",
        associatedWith: "radiculopathy / sciatica",
        stressedBy: "disc or bony compression",
      },
    ],
  },

  neck: {
    key: "neck",
    joint: "Neck",
    summary:
      "The cervical spine supports the head with discs, facet joints, and muscles, and passes nerves to the arms.",
    structures: [
      {
        name: "Cervical discs",
        type: "disc",
        description: "Cushions between neck vertebrae.",
        associatedWith: "cervical disc herniation",
        stressedBy: "sustained flexion ('tech neck'), loading",
      },
      {
        name: "Facet joints",
        type: "cartilage",
        description: "Small paired joints guiding neck motion.",
        associatedWith: "facet-mediated neck pain",
        stressedBy: "extension, prolonged awkward postures",
      },
      {
        name: "Paraspinal / trapezius muscles",
        type: "muscle",
        description: "Support the head and move the neck and shoulders.",
        associatedWith: "muscular / tension neck pain",
        stressedBy: "static postures, stress, screen work",
      },
      {
        name: "Cervical nerve roots",
        type: "nerve",
        description: "Exit the neck toward the arms.",
        associatedWith: "cervical radiculopathy (arm tingling)",
        stressedBy: "disc or bony compression",
      },
    ],
  },
};

const REGION_TO_KEY: Record<string, string> = {
  shoulder_l: "shoulder",
  shoulder_r: "shoulder",
  elbow_l: "elbow",
  elbow_r: "elbow",
  wrist_l: "wrist",
  wrist_r: "wrist",
  hip_l: "hip",
  hip_r: "hip",
  knee_l: "knee",
  knee_r: "knee",
  ankle_l: "ankle",
  ankle_r: "ankle",
  abdomen: "lowback",
  chest: "neck",
  neck: "neck",
};

export function atlasForRegion(regionId: string): JointAtlas | null {
  const key = REGION_TO_KEY[regionId];
  return key ? ATLAS[key] : null;
}

export const STRUCTURE_COLORS: Record<StructureType, string> = {
  tendon: "#f97316",
  ligament: "#3b82f6",
  nerve: "#eab308",
  muscle: "#ef4444",
  bursa: "#14b8a6",
  cartilage: "#8b5cf6",
  bone: "#94a3b8",
  disc: "#06b6d4",
};
