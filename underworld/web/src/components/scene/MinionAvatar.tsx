import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Guild, MinionListItem, Mood } from "@/lib/types";
import { CHARACTER_MODEL_URL } from "./assets";
import GuildAccessory from "./GuildAccessory";

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
  /** Action-driven destination. If null, the avatar wanders near base. */
  targetPosition: [number, number, number] | null;
  /** Whether the avatar has arrived at the target (within walk radius). */
  atDestination: boolean;
  actionName?: string;
  selected: boolean;
  onClick: (id: string) => void;
}

useGLTF.preload(CHARACTER_MODEL_URL);

export default function MinionAvatar({
  minion,
  basePosition,
  targetPosition,
  atDestination,
  actionName,
  selected,
  onClick,
}: Props) {
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
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((m) => m.clone());
        } else {
          mesh.material = (mesh.material as THREE.Material).clone();
        }
      }
    });
    return g;
  }, [src]);

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

  // Pick the animation clip. While walking (i.e. not at destination and we have
  // a target), play Walking. Once arrived, play the action's animation.
  const isWalking = !!targetPosition && !atDestination && minion.alive;
  const desiredClip = useMemo(() => {
    if (!minion.alive) return findClip(names, ["Death"]) ?? findClip(names, ["Idle"]);
    if (isWalking) return findClip(names, ["Walking", "Idle"]);
    const mapped = actionName ? ACTION_ANIM[actionName] : null;
    if (mapped) {
      const found = findClip(names, [mapped]);
      if (found) return found;
    }
    return findClip(names, ["Idle"]);
  }, [minion.alive, isWalking, actionName, names]);

  useEffect(() => {
    if (!desiredClip) return;
    const action = actions[desiredClip];
    if (!action) return;
    action.reset().fadeIn(0.3).play();
    return () => { action.fadeOut(0.3); };
  }, [actions, desiredClip]);

  // Movement state — persisted between frames.
  const state = useRef({
    px: basePosition[0],
    py: basePosition[1],
    pz: basePosition[2],
    yaw: 0,
    wanderAngle: 0,
    seed: hash(minion.id),
    inited: false,
  });
  if (!state.current.inited) {
    state.current.inited = true;
    if (groupRef.current) {
      groupRef.current.position.set(basePosition[0], basePosition[1], basePosition[2]);
    }
  }

  useFrame((_, dt) => {
    const g = groupRef.current;
    if (!g) return;
    const s = state.current;

    if (!minion.alive) {
      g.position.set(basePosition[0], basePosition[1], basePosition[2]);
      return;
    }

    // Pick the moment-to-moment target:
    //   - If we have an action target and we're not there yet → walk to it.
    //   - Otherwise wander in a small radius around base.
    let tx: number, tz: number;
    if (targetPosition && !atDestination) {
      tx = targetPosition[0];
      tz = targetPosition[2];
    } else {
      s.wanderAngle += dt * (0.35 + ((s.seed % 100) / 250));
      const r = 1.6 + 0.4 * Math.sin(s.seed + s.wanderAngle * 0.6);
      tx = basePosition[0] + Math.cos(s.wanderAngle) * r;
      tz = basePosition[2] + Math.sin(s.wanderAngle * 0.7) * r;
    }

    const dx = tx - g.position.x;
    const dz = tz - g.position.z;
    const dist = Math.hypot(dx, dz);
    // Walking speed depends on hunger/fatigue/mood — exhausted minions plod.
    const energy = Math.max(0.25, Math.min(1, (minion.hunger + minion.fatigue) * 0.5 + 0.2));
    const speed = (isWalking ? 3.0 : 1.2) * energy;
    if (dist > 0.01) {
      const step = Math.min(dist, speed * dt);
      g.position.x += (dx / dist) * step;
      g.position.z += (dz / dist) * step;
    }
    g.position.y = basePosition[1];

    // Face direction of motion.
    if (dist > 0.05) {
      const targetAngle = Math.atan2(dx, dz);
      // shortest-arc lerp
      let diff = targetAngle - g.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      g.rotation.y += diff * Math.min(1, dt * 6);
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
      <GuildAccessory guild={minion.guild} />
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
