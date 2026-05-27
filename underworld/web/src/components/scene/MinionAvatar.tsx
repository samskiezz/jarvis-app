import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Guild, MinionListItem, Mood } from "@/lib/types";
import { ALL_CHARACTER_MODELS, characterModelFor } from "./assets";
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

// Action → ordered preference list of clip names. The Kenney blocky-character
// kit ships with: static, idle, walk, sprint, sit, drive, die, pick-up,
// emote-yes, emote-no, holding-*, attack-*, interact-*. We map our verbs to
// the closest match.
const ACTION_CLIP_CANDIDATES: Record<string, string[]> = {
  rest:               ["sit", "idle"],
  meditate:           ["sit", "idle"],
  eat:                ["pick-up", "emote-yes", "idle"],
  drink:              ["pick-up", "emote-yes", "idle"],
  socialise:          ["emote-yes", "idle"],
  teach:              ["interact-right", "emote-yes", "idle"],
  study:              ["interact-right", "idle"],
  search_patents:     ["interact-right", "idle"],
  kb_lookup:          ["interact-right", "idle"],
  propose_invention:  ["emote-yes", "interact-right", "idle"],
  seek_partner:       ["emote-yes", "idle"],
  fork_self:          ["emote-yes", "idle"],
};

const WALK_CLIPS = ["walk", "sprint", "Walking", "Walk", "Run", "Running"];
const IDLE_CLIPS = ["idle", "static", "Idle", "Standing", "Stand"];
const DEATH_CLIPS = ["die", "Death", "Dying", "idle"];

// Kenney blocky characters are ~1.8 units tall in source; scale 2.0 yields
// a ~3.5u-tall avatar in the 120u world.
const BLOCKY_SCALE = 2.0;

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

ALL_CHARACTER_MODELS.forEach((url) => useGLTF.preload(url));

export default function MinionAvatar({
  minion,
  basePosition,
  targetPosition,
  atDestination,
  actionName,
  selected,
  onClick,
}: Props) {
  const modelUrl = characterModelFor(minion.guild);
  const { scene: src, animations } = useGLTF(modelUrl) as unknown as {
    scene: THREE.Group;
    animations: THREE.AnimationClip[];
  };

  // Use SkeletonUtils.clone for every model — it handles skinned meshes
  // correctly AND deep-clones non-skinned hierarchies, so each instance gets
  // its own node tree for the animation mixer to target. Plain Object3D.clone
  // would let multiple Kenney blocky avatars share node references and step on
  // each other's animation state.
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

  // Dispose the per-instance material clones when this avatar unmounts or its
  // model swaps. Without this, every dead minion (and every guild change)
  // leaks a few MeshStandardMaterial instances — adds up fast with churn.
  useEffect(() => {
    return () => {
      clone.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
        else (mesh.material as THREE.Material).dispose();
      });
    };
  }, [clone]);

  // Tint each cloned material by the guild colour. Because the Kenney blocky
  // characters use baseColorTexture maps, MeshStandardMaterial multiplies the
  // sampled texel by `color` — setting color = guild colour pulls the whole
  // costume into the guild's hue while keeping the texture detail readable.
  useEffect(() => {
    const tint = new THREE.Color(GUILD_COLOR[minion.guild] ?? "#cccccc");
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
    if (!minion.alive) return findClip(names, DEATH_CLIPS);
    if (isWalking) return findClip(names, WALK_CLIPS) ?? findClip(names, IDLE_CLIPS);
    const candidates = actionName ? ACTION_CLIP_CANDIDATES[actionName] : null;
    if (candidates) {
      const found = findClip(names, candidates);
      if (found) return found;
    }
    return findClip(names, IDLE_CLIPS);
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
      const r = 4.0 + 1.5 * Math.sin(s.seed + s.wanderAngle * 0.6);
      tx = basePosition[0] + Math.cos(s.wanderAngle) * r;
      tz = basePosition[2] + Math.sin(s.wanderAngle * 0.7) * r;
    }

    const dx = tx - g.position.x;
    const dz = tz - g.position.z;
    const dist = Math.hypot(dx, dz);
    // Walking speed depends on hunger/fatigue/mood — exhausted minions plod.
    const energy = Math.max(0.25, Math.min(1, (minion.hunger + minion.fatigue) * 0.5 + 0.2));
    // World is ~120u across — bump walk speed so a minion can traverse it
    // in a sensible amount of time. Wander speed stays gentle.
    const speed = (isWalking ? 8.0 : 2.5) * energy;
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
      <primitive object={clone} scale={BLOCKY_SCALE} />
      <GuildAccessory guild={minion.guild} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[selected ? 2.0 : 1.4, selected ? 2.5 : 1.6, 32]} />
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
