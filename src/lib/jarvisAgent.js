/**
 * jarvisAgent — deterministic intent router for the JARVIS voice/text assistant.
 *
 * This is the "agency" half of JARVIS: imperative commands ("open markets",
 * "focus on PSG", "brief me") are recognised here and turned into a structured
 * intent the HUD executes directly against the terminal — no LLM round-trip, so
 * control is instant and reliable. Anything that isn't a recognised command
 * falls through to `{ intent: "query" }` and is answered by the LLM analyst.
 *
 * Pure functions only (no DOM, no React) so the routing is unit-testable.
 */

// Panel id → spoken aliases. The router matches the utterance against these so
// "show me the globe", "open the map", "world map" all hit the MAP panel.
export const PANEL_ALIASES = {
  MAP:        ["map", "globe", "world", "earth", "atlas"],
  VERTEX:     ["vertex", "graph", "network", "ontology", "links", "connections"],
  RISK:       ["risk", "risks", "threats", "alerts", "danger", "exposure"],
  EXPLORER:   ["objects", "explorer", "entities", "object explorer"],
  TIMELINE:   ["timeline", "events", "history", "calendar"],
  MARKETS:    ["markets", "market", "prices", "stocks", "crypto prices", "quotes"],
  EMAILS:     ["emails", "email", "inbox", "mail", "corpus"],
  WATCHLIST:  ["watchlist", "watch list", "watch", "monitoring"],
  ANALYST:    ["analyst", "chat", "console", "terminal chat"],
  PANOPTICON: ["panopticon", "surveillance", "panel of panels"],
  CS3D:       ["counterstrike", "counter strike", "cs", "tactical", "game"],
};

const GREETINGS = [
  "hello", "hi", "hey", "you there", "are you there", "good morning",
  "good evening", "good afternoon", "wake up", "jarvis",
];

const BRIEFING_WORDS = [
  "brief", "briefing", "status", "sitrep", "report", "rundown", "update me",
  "what's happening", "whats happening", "what is happening", "catch me up",
  "fill me in", "situation",
];

const REFRESH_WORDS = ["refresh", "reload", "update intel", "pull intel", "sync"];
const HELP_WORDS = ["what can you do", "help", "commands", "your capabilities"];
const STOP_WORDS = ["stop", "quiet", "silence", "shut up", "cancel", "never mind", "nevermind"];

function norm(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9$%.\s]/g, " ").replace(/\s+/g, " ").trim();
}

function stripWake(text) {
  // Drop a leading "jarvis" wake word so "jarvis open markets" → "open markets".
  return norm(text).replace(/^(ok |okay |hey )?jarvis[,\s]*/i, "").trim();
}

function matchPanel(text) {
  const t = ` ${text} `;
  let best = null;
  let bestLen = 0;
  for (const [id, aliases] of Object.entries(PANEL_ALIASES)) {
    for (const a of aliases) {
      if (t.includes(` ${a} `) && a.length > bestLen) {
        best = id;
        bestLen = a.length;
      }
    }
  }
  return best;
}

function matchEntity(text, entities) {
  // entities: [{ id, label }]. Match on id or any significant word of the label.
  const t = ` ${text} `;
  let best = null;
  let bestLen = 0;
  for (const e of entities || []) {
    const candidates = [e.id, ...String(e.label || "").toLowerCase().split(/[^a-z0-9$]+/)];
    for (const c of candidates) {
      if (c && c.length >= 3 && t.includes(` ${c} `) && c.length > bestLen) {
        best = e;
        bestLen = c.length;
      }
    }
  }
  return best;
}

// Match a destination page from the registry. pages: [{ name, label, aliases? }].
// Returns { page, len } so callers can compare specificity against a panel match.
function matchPage(text, pages) {
  const t = ` ${text} `;
  let best = null;
  let bestLen = 0;
  for (const p of pages || []) {
    const aliases = [
      String(p.label || "").toLowerCase(),
      String(p.name || "").replace(/([A-Z])/g, " $1").toLowerCase().trim(),
      ...(p.aliases || []),
    ];
    for (const a of aliases) {
      const n = a.replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
      if (n.length >= 3 && t.includes(` ${n} `) && n.length > bestLen) {
        best = p;
        bestLen = n.length;
      }
    }
  }
  return best ? { page: best, len: bestLen } : null;
}

/**
 * Interpret an utterance into a structured intent.
 *
 * @param {string} utterance raw text (may include the "jarvis" wake word)
 * @param {{ entities?: {id:string,label:string}[] }} ctx
 * @returns {{ intent: string, [k:string]: any }}
 *   intents: greeting | open_panel | close_panel | focus_entity | briefing |
 *            refresh | help | stop | query
 */
export function interpret(utterance, ctx = {}) {
  const raw = stripWake(utterance);
  if (!raw) return { intent: "greeting" };

  if (STOP_WORDS.some((w) => raw === w || raw.startsWith(w + " ") || raw === w)) {
    return { intent: "stop" };
  }
  if (HELP_WORDS.some((w) => raw.includes(w))) return { intent: "help" };
  if (REFRESH_WORDS.some((w) => raw.includes(w))) return { intent: "refresh" };
  if (BRIEFING_WORDS.some((w) => raw.includes(w))) return { intent: "briefing" };

  // Panel open/close. "close/hide X" → close, otherwise open.
  const wantsClose = /\b(close|hide|dismiss|minimi[sz]e)\b/.test(raw);
  const wantsOpen = /\b(open|show|bring up|pull up|display|go to|switch to|launch|navigate|take me to|jump to)\b/.test(raw);
  const panel = matchPanel(raw);
  const panelLen = panel ? Math.max(...PANEL_ALIASES[panel].filter((a) => ` ${raw} `.includes(` ${a} `)).map((a) => a.length)) : 0;

  // Navigate to a registry page ("open apex", "go to investment tracker").
  // Pages win over panels when the page label match is more specific (longer),
  // so "open markets" stays a panel but "open command center" navigates.
  const pageHit = matchPage(raw, ctx.pages);
  if (pageHit && pageHit.len >= panelLen && (wantsOpen || !panel)) {
    return { intent: "navigate", page: pageHit.page };
  }

  if (panel && wantsClose) return { intent: "close_panel", panel };
  if (panel && (wantsOpen || !matchEntity(raw, ctx.entities))) {
    return { intent: "open_panel", panel };
  }

  // Focus an entity ("focus on PSG", "tell me about Pangani", "select Dubai").
  const entity = matchEntity(raw, ctx.entities);
  if (entity) {
    const wantsFocus = /\b(focus|select|highlight|center|centre|go to|show me)\b/.test(raw);
    if (wantsFocus) return { intent: "focus_entity", entity, query: raw };
    // Mentioned an entity without an explicit verb → still let the LLM answer,
    // but flag the entity so the HUD can focus the graph alongside the answer.
    return { intent: "query", entity, query: raw };
  }

  if (GREETINGS.some((w) => raw === w || raw.startsWith(w + " ") || raw.endsWith(" " + w))) {
    return { intent: "greeting" };
  }
  if (raw.includes("daddy") && raw.includes("home")) return { intent: "greeting", warm: true };

  return { intent: "query", query: raw };
}

// A few in-character lines so spoken confirmations don't feel robotic. Callers
// pick one with `pick()`. Kept here so they're covered by the same module.
export const LINES = {
  greeting: ["Welcome home, sir.", "At your service, sir.", "Online and listening, sir."],
  greetingWarm: ["Welcome home, sir. Shall I run the usual diagnostics?"],
  opened: (label) => `Bringing up ${label}, sir.`,
  closed: (label) => `Closing ${label}, sir.`,
  navigated: (label) => `Taking you to ${label}, sir.`,
  focused: (label) => `Focusing on ${label}, sir.`,
  refresh: ["Pulling fresh intel, sir.", "Refreshing the feeds, sir."],
  stop: ["As you wish, sir.", "Standing by, sir."],
  unknown: ["I'm afraid I didn't catch that, sir.", "Could you rephrase, sir?"],
};

export function pick(arr, seed) {
  if (typeof arr === "function") return arr;
  const i = (seed == null ? Math.floor(Math.random() * arr.length) : seed) % arr.length;
  return arr[i];
}
