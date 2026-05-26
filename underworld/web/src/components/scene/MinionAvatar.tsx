import { useEffect, useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Guild, MinionListItem, Mood } from "@/lib/types";
import { CHARACTER_MODEL_URL } from "./assets";

const GUILD_COLOR: Record<Guild, string> = {
  maths:       "#a78bfa",
  physics:     "#38bdf8",
  electrical:  "#fbbf24",
  mechanical:  "#d4d4d8",
  civil:       "#fb923c",
  materials:   "#f472b6",
  computing:   "#34d399",
  energy:      "#facc15",
  agriculture: "#a3e635",
  patent:      "#c084fc",
  safety:      "#fb7185",
};

const MOOD_RING: Record<Mood, string> = {
  flow:       "#34d399",
  inspired:   "#38bdf8",
  content:    "#a78bfa",
  bored:      "#71717a",
  anxious:    "#fbbf24",
  exhausted:  "#fb923c",
  despairing: "#fb7185",
};

// RobotExpressive ships with these clip names — verified at load time.
const ACTION_ANIM: Record<string, string> = {
  rest: "Sitting",
  meditate: "Sitting",
  eat: "ThumbsUp",
  drink: "ThumbsUp",
  socialise: "Wave",
  teach: "Wave",
  study: "Yes",
  search_patents: "Yes",
  kb_lookup: "Yes",
  propose_invention: "Dance",
  seek_partner: "Wave",
  fork_self: "Jump",
};

interface Props {
  minion: MinionListItem;
  basePosition: [number, number, number];
  actionName?: string;
  selected: boolean;
  onClick: (id: string) => void;
}

useGLTF.preload(CHARACTER_MODEL_URL);

export default function MinionAvatar({ minion, basePosition, actionName, selected, onClick }: Props) {
  const { scene: src, animations } = useGLTF(CHARACTER_MODEL_URL) as unknown as {
    scene: THREE.Group;
    animations: THREE.AnimationClip[];
  };

  // SkeletonUtils.clone is the canonical way to instance a skinned mesh —
  // a plain .clone() shares the skeleton across instances and they all
  // animate in lockstep.
  const clone = useMemo(() => {
    const g = cloneSkeleton(src) as THREE.Group;
    g.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        // Materials in RobotExpressive are MeshStandardMaterial. Clone the
        // material on each instance so per-minion guild tint doesn't leak.
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((m) => m.clone());
        } else {
          mesh.material = (mesh.material as THREE.Material).clone();
        }
      }
    });
    return g;
  }, [src]);

  // Tint by guild — multiply the base colour, keeping the lit shading.
  useEffect(() => {
    const tint = new THREE.Color(GUILD_COLOR[minion.guild] ?? "#aaaaaa");
    clone.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const apply = (mat: THREE.Material) => {
        const std = mat as THREE.MeshStandardMaterial;
        if (std.color) std.color.copy(tint);
      };
      if (Array.isArray(mesh.material)) mesh.material.forEach(apply);
      else apply(mesh.material as THREE.Material);
    });
  }, [clone, minion.guild]);

  const groupRef = useRef<THREE.Group>(null);
  const { actions, names } = useAnimations(animations, groupRef);

  const desiredClip = useMemo(() => {
    if (!minion.alive) return findClip(names, ["Death"]) ?? findClip(names, ["Idle"]);
    const mapped = actionName ? ACTION_ANIM[actionName] : null;
    if (mapped) {
      const found = findClip(names, [mapped]);
      if (found) return found;
    }
    // Walking idle if the minion looks active (high energy), else idle.
    return minion.fatigue > 0.5 && minion.hunger > 0.4
      ? findClip(names, ["Walking", "Idle"])
      : findClip(names, ["Idle"]);
  }, [minion.alive, minion.fatigue, minion.hunger, actionName, names]);

  useEffect(() => {
    if (!desiredClip) return;
    const action = actions[desiredClip];
    if (!action) return;
    action.reset().fadeIn(0.3).play();
    return () => { action.fadeOut(0.3); };
  }, [actions, desiredClip]);

  // Drift around the base position so the swarm feels alive — bounded random
  // walk derived from the minion id, no per-frame allocation.
  const drift = useRef({
    px: basePosition[0],
    pz: basePosition[2],
    vx: 0,
    vz: 0,
    seed: hash(minion.id),
    angle: 0,
  }).current;
  drift.px = basePosition[0]; // re-anchor if base changes
  drift.pz = basePosition[2];

  useFrame((_, dt) => {
    const g = groupRef.current;
    if (!g) return;
    if (minion.alive) {
      // gentle wander within a 2.5-unit radius of base
      drift.angle += dt * (0.4 + ((drift.seed % 100) / 200));
      const r = 2.0 + 0.5 * Math.sin(drift.seed + drift.angle * 0.6);
      const tx = drift.px + Math.cos(drift.angle) * r;
      const tz = drift.pz + Math.sin(drift.angle * 0.7) * r;
      const dx = tx - g.position.x;
      const dz = tz - g.position.z;
      const speed = 1.2;
      g.position.x += dx * Math.min(1, dt * speed);
      g.position.z += dz * Math.min(1, dt * speed);
      g.position.y = basePosition[1];
      // face the direction of motion
      const targetAngle = Math.atan2(dx, dz);
      g.rotation.y += (targetAngle - g.rotation.y) * Math.min(1, dt * 4);
    } else {
      g.position.set(basePosition[0], basePosition[1], basePosition[2]);
    }
  });

  const ringColor = MOOD_RING[minion.mood] ?? "#888888";

  return (
    <group
      ref={groupRef}
      position={basePosition}
      onClick={(e) => { e.stopPropagation(); onClick(minion.id); }}
    >
      <primitive object={clone} scale={0.42} />
      {/* Selected → orange ground ring; alive → faint mood ring. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[selected ? 0.85 : 0.55, selected ? 1.0 : 0.65, 32]} />
        <meshBasicMaterial
          color={selected ? "#ff9a3c" : ringColor}
          transparent
          opacity={selected ? 0.85 : 0.35}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

function findClip(names: string[], candidates: string[]): string | undefined {
  for (const c of candidates) {
    if (names.includes(c)) return c;
  }
  return undefined;
}

function hash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
