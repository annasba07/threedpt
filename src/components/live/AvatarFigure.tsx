"use client";

import { useEffect, useRef, useState } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { LANDMARK as L } from "@/lib/pose/landmarks";
import { worldToThree } from "@/lib/pose/regions";
import type { FrameLandmark } from "@/lib/pose/types";

/**
 * The realistic body. The bundled default is a CC0 model (Quaternius); swap this
 * one path for any standard-rigged humanoid GLB (Avaturn / MetaPerson / a
 * purchased avatar) — the retargeting below is rig-agnostic, so no other change
 * is needed. Users can also upload their own .glb at runtime.
 */
export const AVATAR_MODEL_URL = "/models/Human.glb";

// Role tokens matched by name-suffix, so this works with any standard humanoid
// rig (mixamorig:LeftArm, Armature/LeftArm, LeftArm, …) — not one model.
const BONE = {
  spine: "Spine",
  lArm: "LeftArm",
  lFore: "LeftForeArm",
  rArm: "RightArm",
  rFore: "RightForeArm",
  lUpLeg: "LeftUpLeg",
  lLeg: "LeftLeg",
  rUpLeg: "RightUpLeg",
  rLeg: "RightLeg",
} as const;

type BoneKey = keyof typeof BONE;
type Ref = number | [number, number]; // a landmark, or a midpoint of two

// Each bone points from `from` toward `to`. Torso first (parent), then limbs.
const SEGMENTS: { bone: BoneKey; from: Ref; to: Ref }[] = [
  { bone: "spine", from: [L.LEFT_HIP, L.RIGHT_HIP], to: [L.LEFT_SHOULDER, L.RIGHT_SHOULDER] },
  { bone: "lArm", from: L.LEFT_SHOULDER, to: L.LEFT_ELBOW },
  { bone: "lFore", from: L.LEFT_ELBOW, to: L.LEFT_WRIST },
  { bone: "rArm", from: L.RIGHT_SHOULDER, to: L.RIGHT_ELBOW },
  { bone: "rFore", from: L.RIGHT_ELBOW, to: L.RIGHT_WRIST },
  { bone: "lUpLeg", from: L.LEFT_HIP, to: L.LEFT_KNEE },
  { bone: "lLeg", from: L.LEFT_KNEE, to: L.LEFT_ANKLE },
  { bone: "rUpLeg", from: L.RIGHT_HIP, to: L.RIGHT_KNEE },
  { bone: "rLeg", from: L.RIGHT_KNEE, to: L.RIGHT_ANKLE },
];

function okLm(p: FrameLandmark | undefined): p is FrameLandmark {
  return !!p && (p.visibility ?? 1) >= 0.5;
}

function firstChildBone(b: THREE.Object3D): THREE.Object3D | null {
  for (const c of b.children) if ((c as THREE.Bone).isBone) return c;
  return null;
}

export function AvatarFigure({ world, modelUrl }: { world: FrameLandmark[]; modelUrl?: string }) {
  const { scene } = useGLTF(modelUrl || AVATAR_MODEL_URL);
  const bonesRef = useRef<Partial<Record<BoneKey, THREE.Bone>>>({});
  const restRef = useRef<Partial<Record<BoneKey, { dir: THREE.Vector3; wq: THREE.Quaternion }>>>({});
  const ready = useRef(false);
  // Auto-fit: normalize any model to a consistent height, feet on the ground.
  const [fit, setFit] = useState<{ scale: number; pos: [number, number, number] }>({
    scale: 1,
    pos: [0, -0.92, 0],
  });

  useEffect(() => {
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.frustumCulled = false;
      }
    });
    const norm = (s: string) => s.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const bones: Partial<Record<BoneKey, THREE.Bone>> = {};
    scene.traverse((o) => {
      const n = norm(o.name);
      (Object.keys(BONE) as BoneKey[]).forEach((k) => {
        if (!bones[k] && n.endsWith(norm(BONE[k]))) bones[k] = o as THREE.Bone;
      });
    });
    bonesRef.current = bones;

    scene.updateMatrixWorld(true);
    const rest: Partial<Record<BoneKey, { dir: THREE.Vector3; wq: THREE.Quaternion }>> = {};
    for (const seg of SEGMENTS) {
      const b = bones[seg.bone];
      const child = b ? firstChildBone(b) : null;
      if (!b || !child) continue;
      const bp = new THREE.Vector3();
      const cp = new THREE.Vector3();
      b.getWorldPosition(bp);
      child.getWorldPosition(cp);
      const dir = cp.sub(bp).normalize();
      const wq = new THREE.Quaternion();
      b.getWorldQuaternion(wq);
      rest[seg.bone] = { dir, wq };
    }
    restRef.current = rest;

    // Fit the model to a standard height with its feet on the ground.
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const s = size.y > 1e-4 ? 1.8 / size.y : 1;
    setFit({ scale: s, pos: [-center.x * s, -0.95 - box.min.y * s, -center.z * s] });

    ready.current = true;
  }, [scene]);

  useFrame(() => {
    if (!ready.current || !world || world.length === 0) return;
    const bones = bonesRef.current;
    scene.updateMatrixWorld(true);

    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    const target = new THREE.Vector3();
    const qDelta = new THREE.Quaternion();
    const parentWQ = new THREE.Quaternion();

    const pos = (ref: Ref, out: THREE.Vector3): boolean => {
      if (Array.isArray(ref)) {
        const a = world[ref[0]];
        const b = world[ref[1]];
        if (!okLm(a) || !okLm(b)) return false;
        const pa = worldToThree([a.x, a.y, a.z]);
        const pb = worldToThree([b.x, b.y, b.z]);
        out.set((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2);
      } else {
        const p = world[ref];
        if (!okLm(p)) return false;
        out.set(...worldToThree([p.x, p.y, p.z]));
      }
      return true;
    };

    for (const seg of SEGMENTS) {
      const bone = bones[seg.bone];
      const rest = restRef.current[seg.bone];
      if (!bone || !rest || !bone.parent) continue;
      if (!pos(seg.from, from) || !pos(seg.to, to)) continue;
      target.copy(to).sub(from);
      if (target.lengthSq() < 1e-8) continue;
      target.normalize();

      qDelta.setFromUnitVectors(rest.dir, target);
      const newWorld = qDelta.clone().multiply(rest.wq);
      bone.parent.getWorldQuaternion(parentWQ);
      bone.quaternion.copy(parentWQ.invert().multiply(newWorld));
      bone.updateWorldMatrix(false, false);
    }
  });

  return (
    <group scale={fit.scale} position={fit.pos}>
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload(AVATAR_MODEL_URL);
