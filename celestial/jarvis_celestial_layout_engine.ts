// JARVIS Celestial OS deterministic layout engine
// Drop into the Three.js/TypeScript side and feed with RepoCelestialNode[] from celestial_index.generated.json.

export type CelestialKind = "apex" | "planet" | "moon" | "meteorite" | "satellite" | "dust";

export type RepoCelestialNode = {
  id: string;
  kind: CelestialKind;
  parent?: string;
  label: string;
  repo?: string;
  source?: string;
  lane?: string;
  importance: number;
  relationship?: number;
  child_count?: number;
  visual_radius?: number;
  orbit_radius?: number;
  orbit_speed?: number;
  phase?: number;
  x?: number | string;
  y?: number | string;
  z?: number | string;
};

export const PHI = (1 + Math.sqrt(5)) / 2;
export const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export const SCALE = {
  apex: 48,
  planet: { min: 10, max: 34 },
  moon: { minRatio: 0.26, maxRatio: 0.42 },
  meteorite: { minRatio: 0.12, maxRatio: 0.22 },
  satellite: { minRatio: 0.06, maxRatio: 0.12 },
  dust: { min: 0.08, max: 0.45 },
  planetNear: 220,
  planetFar: 850,
  apexClearZone: 165,
};

export const LANES: Record<string, number> = {
  knowledge: -0.95,
  automation: -0.35,
  intelligence: 0.25,
  infrastructure: 0.85,
  guardian: 1.45,
  media: 2.05,
  underworld: 2.65,
  voice: 1.75,
  budget: 0.95,
  ui: -0.05,
};

export function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }
export function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
export function logNorm(value: number, max: number) {
  return clamp01(Math.log10(1 + value) / Math.log10(1 + Math.max(1, max)));
}

export function importanceScore(input: {
  manualPriority?: number;
  usage?: number;
  maxUsage?: number;
  childCount?: number;
  maxChildCount?: number;
  active?: boolean;
  severity?: number;
  recency?: number;
  centrality?: number;
  userIntentMatch?: number;
}) {
  const manual = input.manualPriority ?? 0.5;
  const usage = logNorm(input.usage ?? 0, input.maxUsage ?? 1);
  const children = logNorm(input.childCount ?? 0, input.maxChildCount ?? 1);
  const active = input.active ? 1 : 0;
  const severity = (input.severity ?? 0) >= 3 ? 1 : (input.severity ?? 0) === 2 ? 0.65 : (input.severity ?? 0) === 1 ? 0.35 : 0;
  const recency = input.recency ?? 0;
  const centrality = input.centrality ?? 0;
  const intent = input.userIntentMatch ?? 0;
  return clamp01(manual * 0.22 + usage * 0.16 + children * 0.14 + active * 0.14 + severity * 0.12 + centrality * 0.10 + intent * 0.08 + recency * 0.04);
}

export function distanceFromImportance(importance: number) {
  return SCALE.planetNear + Math.pow(1 - clamp01(importance), 1.35) * (SCALE.planetFar - SCALE.planetNear);
}

export function radiusFor(kind: CelestialKind, importance: number, parentRadius = 1) {
  const t = Math.pow(clamp01(importance), 0.72);
  if (kind === "apex") return SCALE.apex;
  if (kind === "planet") return lerp(SCALE.planet.min, SCALE.planet.max, t);
  if (kind === "moon") return parentRadius * lerp(SCALE.moon.minRatio, SCALE.moon.maxRatio, t);
  if (kind === "meteorite") return parentRadius * lerp(SCALE.meteorite.minRatio, SCALE.meteorite.maxRatio, t);
  if (kind === "satellite") return parentRadius * lerp(SCALE.satellite.minRatio, SCALE.satellite.maxRatio, t);
  return lerp(SCALE.dust.min, SCALE.dust.max, Math.pow(clamp01(importance), 1.4));
}

export function placePlanet(indexWithinLane: number, importance: number, lane = "ui") {
  const d = distanceFromImportance(importance);
  const theta = (LANES[lane] ?? 0) + indexWithinLane * GOLDEN;
  const spreadX = 0.34 + (1 - importance) * 0.34;
  const spreadY = 0.22 + (1 - importance) * 0.24;
  return { x: Math.cos(theta) * d * spreadX, y: Math.sin(theta) * d * spreadY, z: -d, theta, distance: d };
}

export function orbitSpeed(kind: CelestialKind, orbitRadius: number, importance: number) {
  const base = kind === "planet" ? 0.012 : kind === "moon" ? 0.025 : kind === "meteorite" ? 0.045 : kind === "satellite" ? 0.08 : 0.018;
  return base * (0.55 + clamp01(importance) * 0.75) / Math.sqrt(Math.max(orbitRadius, 1) / 50);
}

export function orbitPosition(t: number, orbitRadius: number, omega: number, phase: number, relationship = 1) {
  const a = orbitRadius;
  const b = orbitRadius * (1 - 0.18 * (1 - clamp01(relationship)));
  const alpha = phase + omega * t;
  return {
    x: a * Math.cos(alpha),
    y: Math.sin(alpha * 1.7 + phase) * orbitRadius * 0.16,
    z: b * Math.sin(alpha),
  };
}

export const VISIBILITY = {
  home: { apex: true, planets: "top-important", moons: false, meteorites: "critical-only", satellites: false, dust: false },
  planetFocus: { apex: "dimmed", planets: "selected-and-related", moons: "selected-planet-only", meteorites: "critical-only", satellites: false, dust: false },
  moonFocus: { planets: "breadcrumb-only", moons: "selected-and-siblings", meteorites: "top-relevant", satellites: false, dust: "soft-cloud" },
  meteoriteFocus: { planets: "breadcrumb-only", moons: "breadcrumb-only", meteorites: "selected-and-related", satellites: "selected-meteorite-actions", dust: "nearby-soft-cloud" },
  searchFocus: { planets: "path", moons: "path", meteorites: "result", satellites: "actions", dust: "matched-only" },
};
