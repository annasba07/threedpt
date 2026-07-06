"use client";

import { Component, createContext, Suspense, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Environment, Lightformer, ContactShadows, Line } from "@react-three/drei";
import * as THREE from "three";
import { AvatarFigure } from "./AvatarFigure";
import { LANDMARK } from "@/lib/pose/landmarks";
import { regionThreePos, worldToThree } from "@/lib/pose/regions";
import { painColor } from "@/lib/pose/pain";
import { loadColor } from "@/lib/pose/loads";
import type { BodyProportions } from "@/lib/pose/proportions";
import type { FrameLandmark, PainMarker } from "@/lib/pose/types";

const UP = new THREE.Vector3(0, 1, 0);
const L = LANDMARK;
const CONF_GATE = 0.5;

interface FigureProps {
  world: FrameLandmark[];
  proportions: BodyProportions;
  girth: number;
  markers: PainMarker[];
  selectedId: string | null;
  painMode: boolean;
  onPickPoint: (p: [number, number, number]) => void;
  onSelectMarker: (id: string) => void;
  showLoad?: boolean;
  loads?: Record<string, number | null>;
  peakLoads?: Record<string, number>;
  /** "See inside": fade the body and reveal the joint's anatomy in place. */
  seeInside?: boolean;
  revealRegionId?: string | null;
  revealImage?: string | null;
  /** Render a rigged human mesh instead of the procedural mannequin. */
  avatar?: boolean;
  /** Custom avatar GLB (object URL or path). Falls back to the bundled model. */
  avatarUrl?: string;
}

/** Keeps a bad/unsupported uploaded GLB from crashing the whole canvas. */
class AvatarBoundary extends Component<{ children: ReactNode; resetKey?: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** When true, body materials fade so the embedded anatomy reads as "inside". */
const DimContext = createContext(false);

/** landmark index → the joint id used for load lookup. */
const JOINT_LOAD_ID: Record<number, string> = {
  [LANDMARK.LEFT_SHOULDER]: "shoulder_l",
  [LANDMARK.RIGHT_SHOULDER]: "shoulder_r",
  [LANDMARK.LEFT_ELBOW]: "elbow_l",
  [LANDMARK.RIGHT_ELBOW]: "elbow_r",
  [LANDMARK.LEFT_HIP]: "hip_l",
  [LANDMARK.RIGHT_HIP]: "hip_r",
  [LANDMARK.LEFT_KNEE]: "knee_l",
  [LANDMARK.RIGHT_KNEE]: "knee_r",
};

function BodyMaterial({ confident }: { confident: boolean }) {
  const dim = useContext(DimContext);
  return (
    <meshPhysicalMaterial
      color={confident ? "#19c3ac" : "#6b7a8f"}
      transparent={dim || !confident}
      opacity={dim ? 0.12 : confident ? 1 : 0.22}
      depthWrite={!dim}
      roughness={0.42}
      metalness={0}
      clearcoat={0.55}
      clearcoatRoughness={0.45}
      sheen={0.4}
      sheenColor="#67e8f9"
      envMapIntensity={0.9}
      side={THREE.DoubleSide}
    />
  );
}

/** A camera-facing card showing the joint's anatomy, positioned in the body. */
function AnatomyPlane({ url, position }: { url: string; position: [number, number, number] }) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const ref = useRef<THREE.Group>(null);

  useEffect(() => {
    let cancelled = false;
    new THREE.TextureLoader().load(url, (t) => {
      if (cancelled) return;
      t.colorSpace = THREE.SRGBColorSpace;
      setTex(t);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  useFrame(({ camera }) => {
    if (ref.current) ref.current.quaternion.copy(camera.quaternion);
  });

  if (!tex) return null;
  const img = tex.image as HTMLImageElement | undefined;
  const aspect = img && img.width ? img.width / img.height : 1.4;
  const h = 0.3;
  const w = h * aspect;
  // Offset the card up-and-to-the-side of the joint so it never covers the body.
  const ox = 0.42 + w / 2;
  const oy = 0.34;
  const cardCorner: [number, number, number] = [ox - w / 2 - 0.01, oy - h / 2 - 0.01, 0];
  return (
    <group ref={ref} position={position}>
      {/* connector from the joint to the card */}
      <Line points={[[0, 0, 0], cardCorner]} color="#cbd5e1" lineWidth={1.5} transparent opacity={0.75} />
      {/* framed callout card */}
      <group position={[ox, oy, 0]}>
        <mesh position={[0, 0, -0.006]}>
          <planeGeometry args={[w + 0.05, h + 0.05]} />
          <meshBasicMaterial color="#1c1712" transparent opacity={0.55} />
        </mesh>
        <mesh position={[0, 0, -0.003]}>
          <planeGeometry args={[w + 0.02, h + 0.02]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial map={tex} transparent toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/** Tapered limb: cylinder with a radius at each end (rA at a, rB at b). */
function Limb({
  a,
  b,
  rA,
  rB,
  confident,
}: {
  a: THREE.Vector3;
  b: THREE.Vector3;
  rA: number;
  rB: number;
  confident: boolean;
}) {
  const { pos, quat, len } = useMemo(() => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const length = dir.length();
    const position = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
    return { pos: position, quat: quaternion, len: length };
  }, [a, b]);
  if (len < 1e-4) return null;
  // Cylinder +Y maps toward b, so radiusTop is the b end, radiusBottom the a end.
  return (
    <mesh position={pos} quaternion={quat}>
      <cylinderGeometry args={[rB, rA, len, 16]} />
      <BodyMaterial confident={confident} />
    </mesh>
  );
}

function Joint({
  p,
  r,
  confident,
  color,
}: {
  p: THREE.Vector3;
  r: number;
  confident: boolean;
  color?: string;
}) {
  return (
    <mesh position={p}>
      <sphereGeometry args={[r, 18, 18]} />
      {color ? (
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} roughness={0.5} />
      ) : (
        <BodyMaterial confident={confident} />
      )}
    </mesh>
  );
}

/** Orientation whose local Y is yAxis and local X is (orthogonalized) xAxis. */
function basisQuat(xAxis: THREE.Vector3, yAxis: THREE.Vector3): THREE.Quaternion {
  const y = yAxis.clone().normalize();
  const x = xAxis.clone();
  x.addScaledVector(y, -x.dot(y));
  if (x.lengthSq() < 1e-8) x.set(1, 0, 0);
  x.normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

function PoseFigure({
  world,
  proportions,
  girth,
  markers,
  selectedId,
  painMode,
  onPickPoint,
  onSelectMarker,
  showLoad,
  loads,
  peakLoads,
  seeInside,
  revealRegionId,
  revealImage,
}: FigureProps) {
  const pts = useMemo(
    () => world.map((p) => new THREE.Vector3(...worldToThree([p.x, p.y, p.z]))),
    [world],
  );
  const revealPos = revealRegionId ? regionThreePos(revealRegionId, world) : null;
  const vis = (i: number) => world[i]?.visibility ?? 1;
  const conf = (...idx: number[]) => Math.min(...idx.map(vis)) > CONF_GATE;

  const loadColorFor = (landmarkIdx: number): string | undefined => {
    if (!showLoad || !loads || !peakLoads) return undefined;
    const id = JOINT_LOAD_ID[landmarkIdx];
    if (!id) return undefined;
    const v = loads[id];
    const peak = peakLoads[id];
    if (v == null || !peak) return undefined;
    return loadColor(v / peak);
  };

  // Defensive fallbacks: never assume the props are populated (guards against
  // transient render ordering, e.g. hot-reload, feeding an undefined value).
  const sw = (proportions?.shoulderWidth ?? 0.38) * (girth || 1);
  const hw = (proportions?.hipWidth ?? 0.32) * (girth || 1);

  const r = {
    shoulder: sw * 0.11,
    elbow: sw * 0.085,
    wrist: sw * 0.07,
    hip: hw * 0.26,
    knee: hw * 0.2,
    ankle: hw * 0.15,
    upperArmTop: sw * 0.12,
    forearmTop: sw * 0.085,
    forearmBot: sw * 0.062,
    thighTop: hw * 0.3,
    thighBot: hw * 0.22,
    shinBot: hw * 0.15,
  };

  const has = (i: number) => Boolean(pts[i]);
  const midShoulder =
    has(L.LEFT_SHOULDER) && has(L.RIGHT_SHOULDER)
      ? new THREE.Vector3().addVectors(pts[L.LEFT_SHOULDER], pts[L.RIGHT_SHOULDER]).multiplyScalar(0.5)
      : null;
  const midHip =
    has(L.LEFT_HIP) && has(L.RIGHT_HIP)
      ? new THREE.Vector3().addVectors(pts[L.LEFT_HIP], pts[L.RIGHT_HIP]).multiplyScalar(0.5)
      : null;
  const headPos =
    has(L.LEFT_EAR) && has(L.RIGHT_EAR)
      ? new THREE.Vector3().addVectors(pts[L.LEFT_EAR], pts[L.RIGHT_EAR]).multiplyScalar(0.5)
      : (pts[L.NOSE] ?? null);

  // Trunk ellipsoid, oriented to the torso and sized to the person's build.
  let torso: { center: THREE.Vector3; quat: THREE.Quaternion; scale: [number, number, number] } | null =
    null;
  if (midShoulder && midHip && has(L.LEFT_SHOULDER) && has(L.RIGHT_SHOULDER)) {
    const height = midShoulder.distanceTo(midHip) * 1.04;
    const shoulderSpan = pts[L.LEFT_SHOULDER].distanceTo(pts[L.RIGHT_SHOULDER]);
    const hipSpan = has(L.LEFT_HIP) && has(L.RIGHT_HIP) ? pts[L.LEFT_HIP].distanceTo(pts[L.RIGHT_HIP]) : shoulderSpan;
    const width = ((shoulderSpan + hipSpan) / 2) * 1.02;
    const depth = sw * 0.46;
    torso = {
      center: new THREE.Vector3().addVectors(midShoulder, midHip).multiplyScalar(0.5),
      quat: basisQuat(new THREE.Vector3().subVectors(pts[L.RIGHT_SHOULDER], pts[L.LEFT_SHOULDER]), new THREE.Vector3().subVectors(midShoulder, midHip)),
      scale: [width / 2, height / 2, depth / 2],
    };
  }

  const torsoConf = conf(L.LEFT_SHOULDER, L.RIGHT_SHOULDER, L.LEFT_HIP, L.RIGHT_HIP);
  const headConf = conf(L.LEFT_EAR, L.RIGHT_EAR) || vis(L.NOSE) > CONF_GATE;

  return (
    <DimContext.Provider value={!!seeInside}>
    <group
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        if (!painMode) return;
        e.stopPropagation();
        onPickPoint([e.point.x, e.point.y, e.point.z]);
      }}
    >
      {/* Trunk */}
      {torso && (
        <mesh position={torso.center} quaternion={torso.quat} scale={torso.scale}>
          <sphereGeometry args={[1, 28, 22]} />
          <BodyMaterial confident={torsoConf} />
        </mesh>
      )}

      {/* Neck + head */}
      {midShoulder && headPos && (
        <Limb a={midShoulder} b={headPos} rA={sw * 0.1} rB={sw * 0.09} confident={headConf} />
      )}
      {headPos && (
        <mesh position={headPos} scale={[sw * 0.3, sw * 0.36, sw * 0.32]}>
          <sphereGeometry args={[1, 24, 24]} />
          <BodyMaterial confident={headConf} />
        </mesh>
      )}

      {/* Arms */}
      {has(L.LEFT_SHOULDER) && has(L.LEFT_ELBOW) && (
        <Limb a={pts[L.LEFT_SHOULDER]} b={pts[L.LEFT_ELBOW]} rA={r.upperArmTop} rB={r.elbow} confident={conf(L.LEFT_SHOULDER, L.LEFT_ELBOW)} />
      )}
      {has(L.LEFT_ELBOW) && has(L.LEFT_WRIST) && (
        <Limb a={pts[L.LEFT_ELBOW]} b={pts[L.LEFT_WRIST]} rA={r.forearmTop} rB={r.forearmBot} confident={conf(L.LEFT_ELBOW, L.LEFT_WRIST)} />
      )}
      {has(L.RIGHT_SHOULDER) && has(L.RIGHT_ELBOW) && (
        <Limb a={pts[L.RIGHT_SHOULDER]} b={pts[L.RIGHT_ELBOW]} rA={r.upperArmTop} rB={r.elbow} confident={conf(L.RIGHT_SHOULDER, L.RIGHT_ELBOW)} />
      )}
      {has(L.RIGHT_ELBOW) && has(L.RIGHT_WRIST) && (
        <Limb a={pts[L.RIGHT_ELBOW]} b={pts[L.RIGHT_WRIST]} rA={r.forearmTop} rB={r.forearmBot} confident={conf(L.RIGHT_ELBOW, L.RIGHT_WRIST)} />
      )}

      {/* Legs */}
      {has(L.LEFT_HIP) && has(L.LEFT_KNEE) && (
        <Limb a={pts[L.LEFT_HIP]} b={pts[L.LEFT_KNEE]} rA={r.thighTop} rB={r.thighBot} confident={conf(L.LEFT_HIP, L.LEFT_KNEE)} />
      )}
      {has(L.LEFT_KNEE) && has(L.LEFT_ANKLE) && (
        <Limb a={pts[L.LEFT_KNEE]} b={pts[L.LEFT_ANKLE]} rA={r.thighBot} rB={r.shinBot} confident={conf(L.LEFT_KNEE, L.LEFT_ANKLE)} />
      )}
      {has(L.RIGHT_HIP) && has(L.RIGHT_KNEE) && (
        <Limb a={pts[L.RIGHT_HIP]} b={pts[L.RIGHT_KNEE]} rA={r.thighTop} rB={r.thighBot} confident={conf(L.RIGHT_HIP, L.RIGHT_KNEE)} />
      )}
      {has(L.RIGHT_KNEE) && has(L.RIGHT_ANKLE) && (
        <Limb a={pts[L.RIGHT_KNEE]} b={pts[L.RIGHT_ANKLE]} rA={r.thighBot} rB={r.shinBot} confident={conf(L.RIGHT_KNEE, L.RIGHT_ANKLE)} />
      )}

      {/* Joints — the load-bearing ones tint by estimated load when enabled */}
      {has(L.LEFT_SHOULDER) && <Joint p={pts[L.LEFT_SHOULDER]} r={r.shoulder} confident={vis(L.LEFT_SHOULDER) > CONF_GATE} color={loadColorFor(L.LEFT_SHOULDER)} />}
      {has(L.RIGHT_SHOULDER) && <Joint p={pts[L.RIGHT_SHOULDER]} r={r.shoulder} confident={vis(L.RIGHT_SHOULDER) > CONF_GATE} color={loadColorFor(L.RIGHT_SHOULDER)} />}
      {has(L.LEFT_ELBOW) && <Joint p={pts[L.LEFT_ELBOW]} r={r.elbow} confident={vis(L.LEFT_ELBOW) > CONF_GATE} color={loadColorFor(L.LEFT_ELBOW)} />}
      {has(L.RIGHT_ELBOW) && <Joint p={pts[L.RIGHT_ELBOW]} r={r.elbow} confident={vis(L.RIGHT_ELBOW) > CONF_GATE} color={loadColorFor(L.RIGHT_ELBOW)} />}
      {has(L.LEFT_WRIST) && <Joint p={pts[L.LEFT_WRIST]} r={r.wrist} confident={vis(L.LEFT_WRIST) > CONF_GATE} />}
      {has(L.RIGHT_WRIST) && <Joint p={pts[L.RIGHT_WRIST]} r={r.wrist} confident={vis(L.RIGHT_WRIST) > CONF_GATE} />}
      {has(L.LEFT_HIP) && <Joint p={pts[L.LEFT_HIP]} r={r.hip} confident={vis(L.LEFT_HIP) > CONF_GATE} color={loadColorFor(L.LEFT_HIP)} />}
      {has(L.RIGHT_HIP) && <Joint p={pts[L.RIGHT_HIP]} r={r.hip} confident={vis(L.RIGHT_HIP) > CONF_GATE} color={loadColorFor(L.RIGHT_HIP)} />}
      {has(L.LEFT_KNEE) && <Joint p={pts[L.LEFT_KNEE]} r={r.knee} confident={vis(L.LEFT_KNEE) > CONF_GATE} color={loadColorFor(L.LEFT_KNEE)} />}
      {has(L.RIGHT_KNEE) && <Joint p={pts[L.RIGHT_KNEE]} r={r.knee} confident={vis(L.RIGHT_KNEE) > CONF_GATE} color={loadColorFor(L.RIGHT_KNEE)} />}
      {has(L.LEFT_ANKLE) && <Joint p={pts[L.LEFT_ANKLE]} r={r.ankle} confident={vis(L.LEFT_ANKLE) > CONF_GATE} />}
      {has(L.RIGHT_ANKLE) && <Joint p={pts[L.RIGHT_ANKLE]} r={r.ankle} confident={vis(L.RIGHT_ANKLE) > CONF_GATE} />}

      {/* Pain markers */}
      {markers.map((m) => {
        const pos = regionThreePos(m.regionId, world);
        if (!pos) return null;
        const selected = m.id === selectedId;
        const mr = 0.055 + m.intensity * 0.004;
        return (
          <group key={m.id} position={pos}>
            <mesh
              onPointerDown={(e: ThreeEvent<PointerEvent>) => {
                if (painMode) return;
                e.stopPropagation();
                onSelectMarker(m.id);
              }}
            >
              <sphereGeometry args={[mr, 20, 20]} />
              <meshStandardMaterial
                color={painColor(m.intensity)}
                emissive={painColor(m.intensity)}
                emissiveIntensity={selected ? 0.9 : 0.45}
                transparent
                opacity={0.92}
              />
            </mesh>
            {selected && (
              <mesh>
                <sphereGeometry args={[mr * 1.5, 20, 20]} />
                <meshBasicMaterial color={painColor(m.intensity)} transparent opacity={0.16} />
              </mesh>
            )}
          </group>
        );
      })}

      {/* See-inside: the joint's anatomy revealed in place on the body */}
      {seeInside && revealImage && revealPos && (
        <AnatomyPlane url={revealImage} position={revealPos} />
      )}
    </group>
    </DimContext.Provider>
  );
}

export default function Body3D(props: FigureProps) {
  return (
    <Canvas
      camera={{ position: [0, -0.05, 3.0], fov: 40 }}
      dpr={[1, 2]}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
    >
      {/* Graded studio backdrop */}
      <color attach="background" args={["#1c1712"]} />
      <fog attach="fog" args={["#1c1712", 5, 12]} />

      {/* Soft key + fill, plus an image-based environment for clean PBR */}
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 5, 4]} intensity={2.0} />
      <directionalLight position={[-4, 2, -3]} intensity={0.5} color="#7dd3fc" />
      <Environment resolution={256}>
        <Lightformer intensity={2.2} position={[0, 3, 3]} scale={[6, 3, 1]} />
        <Lightformer intensity={0.9} position={[-3, 1, 2]} scale={[3, 3, 1]} color="#a5f3fc" />
        <Lightformer intensity={0.7} position={[3, 0, 2]} scale={[3, 3, 1]} color="#ffffff" />
      </Environment>

      {/* Subtle glow behind the figure for depth (edge kept off-screen) */}
      <mesh position={[0, 0.1, -1.6]}>
        <circleGeometry args={[3.6, 48]} />
        <meshBasicMaterial color="#2c4039" transparent opacity={0.4} />
      </mesh>

      {props.avatar ? (
        <AvatarBoundary resetKey={props.avatarUrl}>
          <Suspense fallback={null}>
            <AvatarFigure key={props.avatarUrl} world={props.world} modelUrl={props.avatarUrl} />
          </Suspense>
        </AvatarBoundary>
      ) : (
        <PoseFigure {...props} />
      )}

      {/* Grounding shadow instead of a hard grid */}
      <ContactShadows
        position={[0, -0.92, 0]}
        scale={4}
        far={2}
        blur={2.6}
        opacity={0.55}
        color="#120c07"
      />

      <OrbitControls
        target={[0, -0.05, 0]}
        enablePan={false}
        enableRotate={!props.painMode}
        minDistance={1.4}
        maxDistance={6}
        enableDamping
        dampingFactor={0.08}
        makeDefault
      />
    </Canvas>
  );
}
