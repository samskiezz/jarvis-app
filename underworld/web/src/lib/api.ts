import { API_BASE_URL, getApiKey } from "./config";
import type {
  AdvanceResponse,
  DnaInfo,
  GuildSpec,
  Invention,
  KbConcept,
  KbFormula,
  KbGuardrail,
  KbSummary,
  KbSwarmRole,
  Lineage,
  Memory,
  Minion,
  MinionListItem,
  Patent,
  PeerReview,
  PopulationStats,
  ProjectContributionT,
  RelationshipRow,
  ResearchProjectT,
  SafetyReview,
  Skill,
  SoulInfo,
  World,
  WorldEvent,
  WorldMap,
} from "./types";

export class ApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`API ${status}: ${body || "request failed"}`);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  const key = getApiKey();
  if (key && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${key}`);
  }
  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  me: () => request<{ authenticated: boolean }>("/auth/me"),
  guilds: () => request<GuildSpec[]>("/guilds"),

  // worlds
  listWorlds: () => request<World[]>("/worlds"),
  createWorld: (
    name: string,
    cpc_class: string,
    starting_population = 128,
    population_cap = 400,
    starting_age = 25,
    auto_advance = true,
  ) =>
    request<World>("/worlds", {
      method: "POST",
      body: JSON.stringify({
        name,
        cpc_class,
        starting_population,
        population_cap,
        starting_age,
        auto_advance,
      }),
    }),
  getWorld: (id: string) => request<World>(`/worlds/${id}`),
  deleteWorld: (id: string) =>
    request<void>(`/worlds/${id}`, { method: "DELETE" }),
  getWorldMap: (id: string) => request<WorldMap>(`/worlds/${id}/map`),
  latestActions: (id: string, window = 3) =>
    request<{ world_id: string; tick: number; actions: Record<string, string> }>(
      `/worlds/${id}/latest-actions?window=${window}`,
    ),
  latestThoughts: (id: string, window = 3) =>
    request<{ world_id: string; tick: number; thoughts: Record<string, string> }>(
      `/worlds/${id}/latest-thoughts?window=${window}`,
    ),
  listMinions: (id: string, opts: { alive?: boolean; guild?: string; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (opts.alive !== undefined) q.set("alive", String(opts.alive));
    if (opts.guild) q.set("guild", opts.guild);
    if (opts.limit) q.set("limit", String(opts.limit));
    return request<MinionListItem[]>(`/worlds/${id}/minions${q.size ? `?${q}` : ""}`);
  },
  listEvents: (id: string, limit = 50) =>
    request<WorldEvent[]>(`/worlds/${id}/events?limit=${limit}`),
  listInventions: (id: string) => request<Invention[]>(`/worlds/${id}/inventions`),
  population: (id: string, history = 60) =>
    request<PopulationStats>(`/worlds/${id}/population?history=${history}`),
  // world systems (not-done build-out)
  discoveries: (id: string) =>
    request<{ discovered: { tech: string; tick: number; sim_year: number }[]; remaining: string[] }>(
      `/worlds/${id}/discoveries`,
    ),
  culture: (id: string) =>
    request<{ worldview: string; knowledge_per_capita: number; stances: Record<string, number>; pollution: number }>(
      `/worlds/${id}/culture`,
    ),
  environment: (id: string) =>
    request<{
      pollution: number; prey_pop: number; predator_pop: number; food_availability: number;
      soil_fertility: number; crop_yield: number; tectonic_stress: number;
    }>(`/worlds/${id}/environment`),
  climate: (id: string) =>
    request<{ season: string; temperature: number; weather: string; thermal_stress: number }>(
      `/worlds/${id}/climate`,
    ),
  society: (id: string) =>
    request<{ government: string; legal_system: string; population: number; avg_openness: number }>(
      `/worlds/${id}/society`,
    ),
  gaps: (id: string) =>
    request<{ id: string; discipline: string; prompt: string; required_patents: number }[]>(
      `/worlds/${id}/gaps`,
    ),
  memes: (id: string) =>
    request<{ name: string; kind: string; popularity: number; generation: number; is_variant: boolean }[]>(
      `/worlds/${id}/memes`,
    ),
  advance: (id: string, ticks: number) =>
    request<AdvanceResponse>(`/worlds/${id}/advance`, {
      method: "POST",
      body: JSON.stringify({ ticks }),
    }),
  setAutoAdvance: (id: string, auto_advance: boolean, interval_s?: number) =>
    request<World>(`/worlds/${id}/auto-advance`, {
      method: "PATCH",
      body: JSON.stringify({ auto_advance, interval_s }),
    }),

  // minions
  getMinion: (id: string) => request<Minion>(`/minions/${id}`),
  listSkills: (id: string) => request<Skill[]>(`/minions/${id}/skills`),
  listMemories: (id: string, limit = 30) =>
    request<Memory[]>(`/minions/${id}/memories?limit=${limit}`),
  listRelationships: (id: string) => request<RelationshipRow[]>(`/minions/${id}/relationships`),
  getDna: (id: string) => request<DnaInfo>(`/minions/${id}/dna`),
  getSoul: (id: string) => request<SoulInfo>(`/minions/${id}/soul`),
  getLineage: (id: string, depth = 3) => request<Lineage>(`/minions/${id}/lineage?depth=${depth}`),
  beliefs: (id: string) =>
    request<{ cause: string; effect: string; trials: number; confidence: number }[]>(
      `/minions/${id}/beliefs`,
    ),
  models: (id: string) =>
    request<{ task: string; samples: number; accuracy: number }[]>(`/minions/${id}/models`),
  appearance: (id: string) =>
    request<{ hair: string; garment: string; body_art: string[]; modifications: string[] }>(
      `/minions/${id}/appearance`,
    ),
  breed: (parent_a_id: string, parent_b_id: string) =>
    request<Minion>("/minions/breed", {
      method: "POST",
      body: JSON.stringify({ parent_a_id, parent_b_id }),
    }),
  fork: (minion_id: string) =>
    request<Minion>("/minions/fork", {
      method: "POST",
      body: JSON.stringify({ minion_id }),
    }),
  killMinion: (minion_id: string) =>
    request<Minion>(`/minions/${minion_id}/kill`, { method: "POST" }),

  // patents
  searchPatents: (query: string, limit = 10, only_expired = true) =>
    request<Patent[]>("/patents/search", {
      method: "POST",
      body: JSON.stringify({ query, limit, only_expired }),
    }),

  // inventions
  getInvention: (id: string) => request<Invention>(`/inventions/${id}`),
  listReviews: (id: string) => request<PeerReview[]>(`/inventions/${id}/reviews`),
  decideInvention: (
    id: string,
    verdict: "approve" | "reject" | "block_safety",
    rationale = "",
  ) =>
    request<Invention>(`/inventions/${id}/decide`, {
      method: "POST",
      body: JSON.stringify({ verdict, rationale }),
    }),
  charterInvention: (body: {
    world_id: string;
    minion_id?: string | null;
    title: string;
    problem: string;
    hypothesis?: string;
    related_patents?: string[];
  }) =>
    request<Invention>("/inventions/charter", {
      method: "POST",
      body: JSON.stringify({
        world_id: body.world_id,
        minion_id: body.minion_id ?? null,
        title: body.title,
        problem: body.problem,
        hypothesis: body.hypothesis ?? "",
        related_patents: body.related_patents ?? [],
      }),
    }),

  // safety
  listSafetyReviews: (limit = 50) =>
    request<SafetyReview[]>(`/safety/reviews?limit=${limit}`),
  safetyCheck: (text?: string, cpc?: string) =>
    request<{ blocked: boolean; rules: { rule: string; detail: string }[] }>(
      "/safety/check",
      { method: "POST", body: JSON.stringify({ text, cpc }) },
    ),

  // knowledge base
  kbSummary: () => request<KbSummary>("/knowledge/summary"),
  kbConcepts: () => request<KbConcept[]>("/knowledge/concepts"),
  kbConcept: (id: string) => request<KbConcept>(`/knowledge/concepts/${id}`),
  kbFormulas: (
    opts: { discipline?: string; catalogue?: string; source?: string; q?: string; limit?: number; offset?: number } = {},
  ) => {
    const q = new URLSearchParams();
    if (opts.discipline) q.set("discipline", opts.discipline);
    if (opts.catalogue) q.set("catalogue", opts.catalogue);
    if (opts.source) q.set("source", opts.source);
    if (opts.q) q.set("q", opts.q);
    if (opts.limit) q.set("limit", String(opts.limit));
    if (opts.offset) q.set("offset", String(opts.offset));
    return request<{ total: number; items: KbFormula[]; offset: number; limit: number }>(
      `/knowledge/formulas${q.size ? `?${q}` : ""}`,
    );
  },
  kbRoles: () => request<KbSwarmRole[]>("/knowledge/swarm-roles"),
  kbGuardrails: () => request<KbGuardrail[]>("/knowledge/guardrails"),

  // research projects
  listProjects: (opts: { world_id?: string; stage?: string; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (opts.world_id) q.set("world_id", opts.world_id);
    if (opts.stage) q.set("stage", opts.stage);
    if (opts.limit) q.set("limit", String(opts.limit));
    return request<ResearchProjectT[]>(`/projects${q.size ? `?${q}` : ""}`);
  },
  getProject: (id: string) => request<ResearchProjectT>(`/projects/${id}`),
  listProjectContributions: (id: string) =>
    request<ProjectContributionT[]>(`/projects/${id}/contributions`),
  projectWorldSummary: (worldId: string) =>
    request<{
      world_id: string;
      by_stage: Record<string, number>;
      flagged_clinical: number;
      flagged_genetic: number;
      flagged_chem_synth: number;
    }>(`/projects/summary/world/${worldId}`),

  // event stream
  streamUrl: (worldId: string) => `${API_BASE_URL}/worlds/${worldId}/stream`,
};
