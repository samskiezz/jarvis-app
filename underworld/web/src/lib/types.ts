// Mirrors underworld/server/routes/schemas.py.

export type Guild =
  | "maths"
  | "physics"
  | "electrical"
  | "mechanical"
  | "civil"
  | "materials"
  | "computing"
  | "energy"
  | "agriculture"
  | "patent"
  | "safety";

export type TaskStatus =
  | "pending"
  | "running"
  | "needs_peer_review"
  | "needs_safety_review"
  | "approved"
  | "rejected"
  | "failed";

export type ReviewVerdict = "approve" | "request_changes" | "reject" | "block_safety";

export type Mood =
  | "flow"
  | "inspired"
  | "content"
  | "bored"
  | "anxious"
  | "exhausted"
  | "despairing";

export type CauseOfDeath =
  | "old_age"
  | "starvation"
  | "disease"
  | "accident"
  | "despair"
  | "pruned"
  | "ascended";

export type RelationshipKindT =
  | "friend"
  | "rival"
  | "romance"
  | "mentor"
  | "parent_child"
  | "sibling"
  | "soul_bond";

export interface World {
  id: string;
  name: string;
  seed_class: string;
  seed_value: number;
  tick: number;
  population_cap: number;
  auto_advance: boolean;
  auto_advance_interval_s: number;
  created_at: string;
  minion_count: number;
  alive_count: number;
}

export interface MinionListItem {
  id: string;
  name: string;
  surname: string;
  guild: Guild;
  generation: number;
  alive: boolean;
  reputation: number;
  karma: number;
  mood: Mood;
  hunger: number;
  fatigue: number;
  sanity: number;
  health: number;
  born_tick: number;
  died_tick: number | null;
  age: number;
}

export interface Minion extends MinionListItem {
  world_id: string;
  soul_id: string | null;
  parent_a_id: string | null;
  parent_b_id: string | null;
  forked_from_id: string | null;
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
  intelligence: number;
  creativity: number;
  thirst: number;
  stress: number;
  cause_of_death: CauseOfDeath | null;
  skill_count: number;
}

export interface Skill {
  name: string;
  level: number;
  last_practiced_tick: number;
}

export interface Memory {
  id: string;
  tick: number;
  kind: string;
  content: string;
  importance: number;
}

export interface RelationshipRow {
  id: string;
  from_id: string;
  to_id: string;
  other_name: string;
  kind: RelationshipKindT;
  strength: number;
  formed_tick: number;
  last_interaction_tick: number;
}

export interface Patent {
  id: string;
  title: string;
  abstract: string;
  cpc_class: string | null;
  grant_date: string | null;
  expired: boolean;
  source: string;
}

export interface Invention {
  id: string;
  world_id: string;
  minion_id: string | null;
  tick: number;
  title: string;
  problem: string;
  hypothesis: string;
  feasibility_score: number;
  novelty_score: number;
  safety_score: number;
  status: TaskStatus;
  related_patents: string[];
  created_at: string;
}

export interface PeerReview {
  id: string;
  invention_id: string;
  reviewer_guild: Guild;
  verdict: ReviewVerdict;
  rationale: string;
  created_at: string;
}

export interface WorldEvent {
  id: string;
  tick: number;
  kind: string;
  actor_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface GuildSpec {
  kind: Guild;
  name: string;
  domain: string;
  checklist: string[];
  starting_skills: string[];
}

export interface TickReport {
  tick: number;
  inventions_reviewed: number;
  inventions_approved: number;
  births: number;
  deaths: number;
  forks: number;
  alive: number;
  minion_outcomes: {
    minion_id: string;
    name: string;
    guild: Guild;
    action: string;
    summary: string;
    mood: Mood;
    inventions: string[];
    blocked_by_safety: boolean;
  }[];
}

export interface AdvanceResponse {
  world_id: string;
  final_tick: number;
  reports: TickReport[];
}

export interface WorldMap {
  world_id: string;
  cpc_class: string;
  biome_hint: string;
  elevation_bias: number;
  heightmap: number[][];
}

export interface SafetyReview {
  id: string;
  subject_id: string;
  subject_kind: string;
  rule: string;
  detail: string;
  blocked: boolean;
  created_at: string;
}

export interface PopulationSnapshot {
  tick: number;
  alive: number;
  dead: number;
  births: number;
  deaths: number;
  forks: number;
  inventions_approved: number;
  generations: number;
  avg_age: number;
  avg_reputation: number;
  avg_sanity: number;
  mood_breakdown: Record<string, number>;
  guild_breakdown: Record<string, number>;
}

export interface PopulationStats {
  world_id: string;
  tick: number;
  alive: number;
  dead: number;
  generations: number;
  avg_age: number;
  avg_reputation: number;
  avg_sanity: number;
  mood_breakdown: Record<string, number>;
  guild_breakdown: Record<string, number>;
  history: PopulationSnapshot[];
}

export interface LineageNode {
  id: string;
  name: string;
  surname: string;
  guild: Guild;
  generation: number;
  alive: boolean;
  born_tick: number;
  died_tick: number | null;
  parent_a_id: string | null;
  parent_b_id: string | null;
  forked_from_id: string | null;
}

export interface Lineage {
  root: string;
  ancestors: LineageNode[];
  descendants: LineageNode[];
  siblings: LineageNode[];
  forks: LineageNode[];
}

export interface DnaInfo {
  minion_id: string;
  length: number;
  dna_preview: string;
  traits: Record<string, number>;
}

export interface SoulInfo {
  id: string;
  token: string;
  incarnation: number;
  karma: number;
  ascended: boolean;
  ancestral_summary: string;
}
