/**
 * ShowMeNavigation — translates "show me X" / "open X" / "view X" voice commands
 * into normalized queries that match each panel's existing intent detector regex.
 *
 * Wired in JarvisBrain.ask() as a silent pre-router: the original query is dropped
 * and a normalized jarvis:ask event is re-dispatched so the correct panel opens
 * and speaks its full data brief — no duplicate TTS, no overlay flash.
 */

const SHOW_PREFIX = /\b(show|open|display|pull\s*up|bring\s*up|view|see)\s+(me\s+)?(the\s+|a\s+)?/i;

// Each entry: [subject-regex, normalizedQuery]
// normalizedQuery is chosen to match the target panel's existing intent RE exactly.
const SHOW_ME_MAP = [
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
