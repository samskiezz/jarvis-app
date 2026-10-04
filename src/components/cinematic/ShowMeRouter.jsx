/**
 * ShowMeRouter — F20 "show me" data-drill intent handler.
 *
 * Default export: null-rendering component (mounted by App.jsx).
 * Named exports: isShowMeQuery / buildShowMeScript — consumed by JarvisBrain.
 */

/** Null component — intent logic lives in JarvisBrain. App.jsx mounts this. */
export default function ShowMeRouter() { return null; }

/**
 * ShowMeRouter — F20 "show me" data-drill intent handler.
 *
 * Catches "show me [X]" / "show [X]" queries and routes them to the correct
 * data panel by calling the appropriate build*Script() from each panel module.
 *
 * Panels that already listen to `jarvis:ask` will open themselves; this module
 * only needs to return the correct TTS script and, where required, fire an
 * explicit open event.
 */

import { buildStatusScript }        from "./SpokenStatusReport";
import { buildMarketsScript }        from "./MarketsTicker";
import { buildRiskScript }           from "./RiskBoard";
import { buildTaskScript }           from "./TaskBoard";
import { buildDatasetsScript }       from "./DatasetsBrowser";
import { buildInvestigationsScript } from "./InvestigationsList";
import { buildScenarioScript }       from "./ScenarioLauncher";
import { buildDocumentScript }       from "./DocumentSearch";
import { buildSkillScript }          from "./SkillScorecard";
import { buildBrainScript }          from "./BrainGrowthSparkline";
import { buildAnchorScript }         from "./PerSceneAnchorDrillDown";

// Ordered table: [regex, label, scriptFn, optional-event]
// Optional-event is dispatched when the panel does NOT open itself via jarvis:ask.
const SHOW_ROUTES = [
  [/\brisk|signal|threat|hazard|vulnerab|critical/i,    "Risk Board",          buildRiskScript,           null],
  [/\btask|mission|todo|to-do|objective|assignment/i,   "Task Board",          buildTaskScript,           null],
  [/\bmarket|crypto|bitcoin|btc|forex|\bfx\b|mover|price/i, "Markets Ticker", buildMarketsScript,        null],
  [/\binvestig|case|open case/i,                         "Investigations",      buildInvestigationsScript, null],
  [/\bdataset|catalog|pipeline|ingest|fusion/i,          "Datasets",            buildDatasetsScript,       null],
  [/\bdocument|report|knowledge|vault|dossier/i,         "Documents",           buildDocumentScript,       null],
  [/\bscenario|simulation|predict|forecast|theatre/i,    "Scenarios",           buildScenarioScript,       null],
  [/\bskill|scorecard|aip|capability|self.improv/i,      "Skills",              buildSkillScript,          null],
  [/\bbrain|neural|node|synapse|growth|cognit/i,         "Brain Growth",        buildBrainScript,          null],
  [/\banchor|scene anchor|expand scene/i,                "Scene Anchors",       buildAnchorScript,         null],
  [/\bstatus|system|health|diagnostics|uptime/i,         "System Status",       buildStatusScript,         null],
];

const SHOW_ME_RE = /\b(show|display|open|pull up|bring up|reveal|view)\b.*\bme\b|\b(show|display|open|pull up|bring up|reveal|view)\b\s+(?:me\s+)?(?:the\s+)?/i;
const SHOW_ANY_RE = /\b(show|display|open|pull up|bring up|reveal)\b/i;

/** Returns true when the query is a "show me X" data-drill intent. */
export function isShowMeQuery(text) {
  const t = (text || "").trim();
  if (!SHOW_ANY_RE.test(t)) return false;
  // Must match at least one known panel keyword after "show"
  return SHOW_ROUTES.some(([re]) => re.test(t));
}

/** Resolve the query to a script + optional panel label, then speak it. */
export async function buildShowMeScript(text) {
  const t = (text || "").trim();
  for (const [re, label, scriptFn, event] of SHOW_ROUTES) {
    if (re.test(t)) {
      if (event) window.dispatchEvent(new CustomEvent(event));
      try {
        const script = await scriptFn();
        return script || `Opening the ${label}, sir.`;
      } catch {
        return `Opening the ${label}, sir.`;
      }
    }
  }
  return "I can show you risks, tasks, markets, investigations, datasets, documents, scenarios, skills, or brain growth, sir.";
}

/**
 * Returns a short help text listing all panels that can be shown.
 * Used when "show me" is uttered with no recognisable subject.
 */
export function buildShowMeHelp() {
  return "You can say: show risks, show tasks, show markets, show investigations, show datasets, show documents, show scenarios, show skills, or show brain growth, sir.";
}
