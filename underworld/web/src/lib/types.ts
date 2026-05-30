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

export type SwarmRole =
  | "literature_scout"
  | "genome_analyst"
  | "protein_modeller"
  | "chemistry_generator"
  | "toxicity_checker"
  | "trial_simulator"
  | "regulatory_reasoner"
  | "experimental_designer"
  | "formula_oracle"
  | "generalist";

export type ProjectStage =
  | "hypothesis"
  | "in_silico"
  | "bench_plan"
  | "preclinical_plan"
  | "clinical_plan"
  | "regulatory_review"
  | "approved"
  | "blocked"
  | "abandoned";

export interface KbConcept {
  id: string;
  section: string;
  title: string;
  body: string;
  tags: string[];
}

export interface KbFormula {
  id: string;
  discipline: string;
  catalogue: string;
  expression: string;
  keywords: string[];
  name: string | null;
  description: string | null;
  source: string;
}

export interface KbSwarmRole {
  id: string;
  name: string;
  description: string;
  guild_hint: string;
}

export interface KbGuardrail {
  id: string;
  stage: string;
  detail: string;
}

export interface KbSummary {
  concepts: number;
  formulas: number;
  swarm_roles: number;
  guardrails: number;
  formulas_by_discipline: Record<string, number>;
  catalogues: { name: string; count: number }[];
  sources: Record<string, number>;
}

export interface ResearchProjectT {
  id: string;
  world_id: string;
  invention_id: string | null;
  title: string;
  summary: string;
  stage: ProjectStage;
  needs_role: SwarmRole | null;
  confidence: number;
  flagged_clinical: boolean;
  flagged_genetic: boolean;
  flagged_chem_synth: boolean;
  created_tick: number;
  updated_tick: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface ProjectContributionT {
  id: string;
  stage: ProjectStage;
  role: SwarmRole;
  note: string;
  delta_confidence: number;
  tick: number;
  contributor: {
    id: string;
    name: string;
    surname: string;
    guild: Guild;
    swarm_role: SwarmRole;
  };
}

export interface World {
  id: string;
  name: string;
  seed_class: string;
  seed_value: number;
  tick: number;
  population_cap: number;
  auto_advance: boolean;
  auto_advance_interval_s: number;
  era: "stone" | "bronze" | "iron" | "industrial" | "information" | "quantum";
  scanner_progress: number;
  created_at: string;
  minion_count: number;
  alive_count: number;
}

export interface MinionListItem {
  id: string;
  name: string;
  surname: string;
  nickname?: string;
  guild: Guild;
  swarm_role: SwarmRole;
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
  swarm_role: SwarmRole;
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
  morale?: number;
  purpose?: number;
  injury?: number;
  addiction?: number;
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
  // Lore — present for every guild but optional so older clients keep working.
  motto?: string;
  founding_myth?: string;
  mission?: string;
  hero_name?: string;
  hero_tale?: string;
  rituals?: string[];
  color_hex?: string;
  glyph?: string;
  nemesis?: string;
  obsession?: string;
  open_question?: string;
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
  role_breakdown: Record<string, number>;
  active_projects: number;
  approved_projects: number;
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
  role_breakdown: Record<string, number>;
  active_projects: number;
  approved_projects: number;
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
