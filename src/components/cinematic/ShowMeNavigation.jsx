/**
 * ShowMeNavigation — translates "show me X" / "open X" / "view X" voice commands
 * into normalized queries that match each panel's existing intent detector regex.
 *
 * Wired in JarvisBrain.ask() as a silent pre-router: the original query is dropped
 * and a normalized jarvis:ask event is re-dispatched so the correct panel opens
 * and speaks its full data brief — no duplicate TTS, no overlay flash.
 *
 * ORDERING NOTE: more-specific entries must come BEFORE more-general ones, because
 * resolveShowMeQuery returns the FIRST match. Many normalized queries use internal
 * shortcodes (icws, kinv, ctl, …) to avoid being caught by earlier JarvisBrain
 * handlers that check for broad keywords like "risk", "scenario", "contact", etc.
 */

const SHOW_PREFIX = /\b(show|open|display|pull\s*up|bring\s*up|view|see)\s+(me\s+)?(the\s+|a\s+)?/i;

// Each entry: [subject-regex, normalizedQuery]
// normalizedQuery must match the target panel's intent RE without matching any
// earlier handler in JarvisBrain.ask() — verified against the full handler chain.
const SHOW_ME_MAP = [

  // ── Exact panel names / highly-specific phrases ────────────────────────────
  // (These are specific enough to never false-match a more general panel.)

  [/\b(situation.room|sitrep|sit.rep|command.overview)\b/i,          "sitrep situation room"],
  [/\b(intel.digest|intelligence.digest|live.digest)\b/i,            "intel digest"],
  [/\b(intel.pulse|global.pulse|live.pulse|world.activity.pulse)\b/i, "intel pulse global"],
  [/\b(intel.profiles?|subjects?.of.interest|known.entities|poi\b)\b/i, "intel profiles directory"],
  [/\b(scene.health|scene.heatmap|anchor.health|health.map)\b/i,     "scene health heatmap"],
  [/\b(scene.compare|compare.scene|diff.scene)\b/i,                  "compare scene diff"],
  [/\b(watchlist|pinned.items?|my.watch)\b/i,                        "watchlist pinned items"],
  [/\b(priority.queue|action.queue|urgent.items|top.priorities|needs.attention)\b/i, "priority queue urgent items"],
  [/\b(chat.panel|chat.transcript|agent.chat|direct.chat)\b/i,       "chat panel transcript"],
  [/\b(mission.readiness|readiness.index|operational.readiness)\b/i, "mission readiness index"],
  [/\b(impact.matrix|probability.matrix)\b/i,                        "impact matrix probability"],
  [/\b(health.score|system.score|health.scorecard|overall.health)\b/i, "health score scorecard"],
  [/\b(timeline|unified.feed|combined.feed)\b/i,                     "timeline unified feed"],
  [/\b(graph.network|network.map|graph.explorer|graph.topology)\b/i, "graph network explorer"],
  [/\b(centrality|graph.rank|hub.entities|most.influential)\b/i,     "graph centrality influence"],
  [/\b(graph.path|path.between|entity.chain|traverse)\b/i,           "graph path explorer"],
  [/\b(anomaly|anomalous|outlier|unusual.node|anomaly.detect)\b/i,   "anomaly detect outliers"],
  [/\b(activity.heatmap|entity.activity|domain.activity|entity.heatmap)\b/i, "activity heatmap domain"],
  [/\b(entity.registry|entities.overview|all.entities|entity.count)\b/i, "entities registry overview"],
  [/\b(data.query.assist|query.a.dataset|dataset.query|dqry)\b/i,   "data query assistant"],
  [/\b(lineage|data.lineage|data.coverage|dsrep)\b/i,               "lineage data coverage"],
  [/\b(seismic|geo.seismic|seismic.analysis|quake.region|geos)\b/i, "seismic analysis regional"],
  [/\b(actor.network|threat.actor.network)\b/i,                      "actor network influence"],
  [/\b(velocity|threat.surge|threat.speed)\b/i,                      "velocity surge rate"],
  [/\b(crisis|early.warn|defcon)\b/i,                                "crisis early warning"],
  [/\b(nexus|correlat|cross.ref|threat.link|risk.link)\b/i,         "nexus cross reference correlations"],
  [/\b(coverage.gap.map|gap.map|swarm.gap|uncovered.risk.map)\b/i,  "coverage gap map"],
  [/\b(exposure.overlay|portfolio.exposure|exposure.map)\b/i,        "exposure overlay map"],
  [/\b(runbook|remediation|fix.steps|incident.response)\b/i,         "runbook remediation"],
  [/\b(mitigation.advisor|risk.advisor|scenario.advisor)\b/i,        "mitigation advisor"],
  [/\b(scenario.readiness|execution.ready|scenario.prep)\b/i,        "execution ready readiness"],
  [/\b(task.coverage|task.alignment|mission.align)\b/i,              "task coverage alignment"],
  [/\b(upskill|training.plan|learning.plan|skill.gap|gap.advisor|capability.gap)\b/i, "upskill training plan gap"],
  [/\b(who.can.help|outreach.skill|skill.outreach)\b/i,              "who can help network outreach"],
  [/\b(morning|morning.debrief|daily.debrief)\b/i,                   "morning debrief"],
  [/\b(daily.objectives?|daily.plan|today.priorities|doplan)\b/i,    "daily objectives planner"],
  [/\b(ops.log|ops.events?|ops.stream)\b/i,                          "ops log"],
  [/\b(task.assignment|swarm.task.advis|automate.tasks?)\b/i,        "task assignment advisor"],
  [/\b(data.automation|swarm.pipeline|dataset.ingestion.track|sdtrk)\b/i, "data automation tracker"],

  // ── Shortcode-only entries (used when natural language conflicts with earlier handlers) ──
  // Users can also say "show me icws" / "open kinv" etc. for direct panel access.

  [/\b(icws|case.workspace|case.deep.dive)\b/i,                      "icws workspace"],
  [/\b(kinv|knowledge.case.link|link.knowledge.inv)\b/i,             "kinv"],
  [/\b(athrep|adaptive.threat.brief|full.threat.brief)\b/i,          "athrep"],
  [/\b(ksrec|knowledge.skill.rec|learning.rec|article.rec)\b/i,      "ksrec"],
  [/\b(cinvl|contact.inv.link)\b/i,                                  "cinvl"],
  [/\b(inscenp|investment.scenario.plan)\b/i,                        "inscenp"],
  [/\b(riskrep|risk.report.map)\b/i,                                 "riskrep"],
  [/\b(oicorr|ops.investigation.corr|event.case.corr)\b/i,           "oicorr"],
  [/\b(krgap|knowledge.report.audit|doc.gap)\b/i,                    "krgap"],
  [/\b(opscov|ops.task.coverage)\b/i,                                "opscov"],
  [/\b(ctl|contact.threat.link|dangerous.contact)\b/i,               "ctl"],
  [/\b(eactv|entity.density)\b/i,                                    "activity heatmap domain"],

  // ── Natural-language panel access (checked after specifics above) ──────────

  [/\b(wiki|knowledge.browser|browse.articles?|knowledge.base)\b/i,  "wiki articles entries"],
  [/\b(contacts?.directory|personnel|staff.list|colleague.list)\b/i, "contacts directory"],
  [/\b(task.board|tasks.list|todo.board|action.items.list)\b/i,      "tasks mission board"],
  [/\b(investment.portfolio|wealth.overview|portfolio.holdings)\b/i, "investments portfolio wealth"],
  [/\b(swarm.jobs?|agent.jobs?|fleet.jobs?|job.monitor)\b/i,         "swarm agent jobs"],
  [/\b(diagnostics?|service.health|service.monitor|backend.health)\b/i, "service health check"],
  [/\b(clock|uptime|system.time|live.clock)\b/i,                     "clock uptime"],
  [/\b(data.acquisition|scraping.status|ingest.status|ingest.job)\b/i, "data acquisition"],

  // ── F20 extension: panels not yet covered by the compound entries above ───
  // Compound natural-language triggers for panels with real jarvis:ask
  // listeners that weren't reachable via "show me X" before this extension.
  [/\b(communities|clusters?|network.group|graph.partition|community.detect)\b/i, "communities clusters network groups"],
  [/\b(entity.?chronolog|chronolog|all.entities.feed|entities.?timeline|unified.timeline)\b/i, "entity chronolog entities timeline echron"],
  [/\b(decision.?ledger|decision.?log|decision.?vault|decision.?record|logged.decision)\b/i, "decisions decision ledger decis"],
  [/\b(ops.?cases?|case.?files?|case.?panel|case.?board|investigation.?cases?)\b/i, "ops cases case panel"],
  [/\b(scene.?narrat|narrat.?scene|describe.?scene|story.?scene)\b/i, "narrate scene scene narrat"],

  // ── F20: short-form one-word "show X" data-drill shortcuts ────────────────
  // These cover bare "show tasks" / "show contacts" etc. that the compound
  // entries above miss (they require multi-word phrases). Ordered so they
  // fire only AFTER all specific compound entries have had a chance to match.
  [/\btasks?\b/i,                                                      "tasks mission board"],
  [/\bcontacts?\b/i,                                                    "contacts directory"],
  [/\bportfolio\b|\binvestments?\b|\bwealth\b/i,                        "investments portfolio wealth"],
  [/\bswarm\b/i,                                                        "swarm agent jobs"],
  [/\bincidents?\b|\bearthquakes?\b|\bquakes?\b/i,                      "earthquake incidents"],
  [/\bhistory\b/i,                                                      "command history replay"],
  [/\bvoice\b/i,                                                        "change voice"],
  [/\btour\b/i,                                                         "auto-tour"],
  [/\bambient\b/i,                                                      "ambient hum"],
  // F20 extension: bare one-word drills for the newly-added panels above
  [/\bdecisions?\b/i,                                                   "decisions decision ledger"],
  [/\bops\b/i,                                                          "ops log"],
  [/\bchronolog\b/i,                                                    "entity chronolog entities timeline"],
  [/\bcommuniti|cluster\b/i,                                            "communities clusters network groups"],

  // ── Original core entries (preserved; act as broad fallbacks) ──────────────
  [/\b(risk|threat|hazard|signal|critical|vulnerab)/i,               "risks board"],
  [/\b(market|crypto|bitcoin|btc|eth|ether|forex|mover|trading|price)/i, "markets crypto ticker"],
  [/\b(dataset|data.catalog|data.source|ingest|pipeline|fusion)/i,   "datasets catalog"],
  [/\b(investig|inquiry|open.case)/i,                                "investigations"],
  [/\b(scenario|simulation|playbook|forecast|drill)/i,               "scenario simulation list"],
  [/\b(document|report|vault|dossier|knowledge|brief|paper|file)/i,  "documents report vault"],
  [/\b(skill|scorecard|capability|competenc|proficien|aip)/i,        "skill scorecard"],
  [/\b(brain|neural|nodes|synap)/i,                                  "brain growth trends nodes"],
  [/\b(anchor|scene.data|scene.detail)/i,                            "anchor drilldown"],
  [/\b(status|system.health|uptime|cpu|memory|load)/i,               "system status health"],
];

/**
 * Returns true when the query is a "show me X" navigation command that can be
 * re-routed to a known panel without falling through to the agent/chat endpoint.
 */
export function isShowMeQuery(q) {
  return SHOW_PREFIX.test(q || "") && SHOW_ME_MAP.some(([re]) => re.test(q));
}

/**
 * Returns the normalized query string that will match the target panel's intent RE.
 */
export function resolveShowMeQuery(q) {
  for (const [re, normalized] of SHOW_ME_MAP) {
    if (re.test(q || "")) return normalized;
  }
  return q;
}

// Default export is a null component so the file can be mounted/imported cleanly;
// all active logic is wired via JarvisBrain imports.
export default function ShowMeNavigation() {
  return null;
}
