"""CAPABILITY REGISTRY — the single ontology of everything JARVIS can do, hands-free.

This is the one source of truth shared by all four surfaces:
  • the voice companion page (server/jarvis_voice.html)
  • the universe chat bar    (server/jarvis_live.html)
  • the /chat endpoint       (server/dashboard.py)
  • the swarm / agent layer  (server/agent/jarvis_capabilities.py)

Each Capability declares HOW to recognise it (deterministic regex patterns + natural-language
examples), WHAT it needs (params, pulled from named regex groups), WHAT JARVIS says back (a spoken
reply), and HOW it runs:
  • binding="ui"     → a browser directive (navigate, open an app) the live page executes
  • binding="server" → a server action (start a swarm, send an SOS, set the climate) run in-process
  • binding="both"   → run the server action AND emit a UI directive (e.g. generate media + refresh)

The deterministic tier (regex) guarantees the disabled user can ALWAYS drive every feature at zero
latency with no network dependency — the GPU brain can be down and "open my tasks" / "I need help"
still work. intent_router.py layers an optional semantic tier on top for paraphrases. The same
registry is turned into agent tools so the swarm can call any capability too.

Pure stdlib. Nothing here performs the action — it only classifies + extracts. Execution lives in
intent_router.execute_capability(), which keeps the side-effects (and their imports) in one place.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple


@dataclass
class Capability:
    id: str
    name: str
    category: str
    description: str
    patterns: List[str]                       # regex, matched case-insensitively, in declared order
    examples: List[str]                        # NL utterances — semantic tier + agent-tool docs
    reply: str                                 # spoken confirmation; .format(**params) applied
    binding: str = "ui"                        # "ui" | "server" | "both"
    ui: Optional[Dict[str, Any]] = None        # browser directive template; "{param}" values interpolated
    server_action: Optional[str] = None        # key into intent_router.SERVER_ACTIONS
    params: List[Dict[str, Any]] = field(default_factory=list)  # JSON-schema-ish, for agent tools
    surfaces: Tuple[str, ...] = ("chat", "agent")  # where this capability is active
    autonomous: bool = True                    # execute immediately (hands-free) vs. confirm first
    voice_safe: bool = True
    # internal: compiled patterns + an optional post-match canonicaliser/validator
    _rx: List["re.Pattern[str]"] = field(default_factory=list, repr=False)
    canon: Optional[Callable[[Dict[str, Any]], Optional[Dict[str, Any]]]] = field(default=None, repr=False)

    def compile(self) -> "Capability":
        self._rx = [re.compile(p, re.IGNORECASE) for p in self.patterns]
        return self


# --------------------------------------------------------------------------- #
# Param canonicalisers — keep precision high by REJECTING (return None) when an
# extracted value is not real, so scanning falls through to the next capability.
# --------------------------------------------------------------------------- #

# Dock apps the live universe page can open, with the spoken synonyms that map to each.
_APP_SYNONYMS: Dict[str, List[str]] = {
    "worklist": ["tasks", "task list", "tasklist", "live tasks", "mission control", "worklist",
                 "to do list", "to-do", "todo", "what you are working on", "what you're working on",
                 "what i am doing", "what i'm doing", "job list", "the jobs"],
    "library": ["library", "studio", "gallery", "media", "creations", "my pictures", "my images",
                "my photos", "the gallery", "my models"],
    "guardian": ["guardian", "monitor", "the camera", "camera", "carer", "the carer", "watch over mum",
                 "guardian monitor", "mum", "mother", "my mother"],
    "agentos": ["agent os", "agentos", "agent", "the agent", "tools", "tool palette", "agent tools",
                "your tools", "abilities", "skills"],
    "vitals": ["vitals", "system vitals", "diagnostics", "system health", "the diagnostics"],
    "upgrades": ["upgrades", "self development", "self-development", "self dev", "what to build",
                 "improve yourself", "upgrade panel", "build next"],
    "climate": ["climate", "the climate", "climate control", "thermostat", "the heating",
                "air conditioning", "aircon", "the aircon"],
    "care": ["care", "health", "care and health", "my health", "care panel", "reminders",
             "my contacts", "health panel"],
}
_APP_LOOKUP: Dict[str, str] = {}
for _canon_app, _syns in _APP_SYNONYMS.items():
    _APP_LOOKUP[_canon_app] = _canon_app
    for _s in _syns:
        _APP_LOOKUP[_s] = _canon_app

# Noise words to trim off a captured navigation target / app phrase.
_TRAIL = re.compile(r"\b(please|for me|now|thanks?|thank you|jarvis|app|screen|page|view|panel)\b", re.IGNORECASE)
_LEAD = re.compile(r"^(the|my|a|an|to|into|over to|that|this)\s+", re.IGNORECASE)


def _clean(s: str) -> str:
    s = (s or "").strip().strip(".!?,;:'\"").strip()
    prev = None
    while prev != s:
        prev = s
        s = _LEAD.sub("", s).strip()
    s = _TRAIL.sub("", s).strip()
    s = re.sub(r"\s{2,}", " ", s).strip(" .,-")
    return s


def _canon_app(params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    raw = _clean(str(params.get("app", "")).lower())
    if not raw:
        return None
    if raw in _APP_LOOKUP:
        return {"app": _APP_LOOKUP[raw]}
    # forgiving contains-match (e.g. "my live tasks please" → worklist)
    for phrase, canon in _APP_LOOKUP.items():
        if phrase in raw or raw in phrase:
            return {"app": canon}
    return None  # not a known app → let nav.fly (or chat) try


def _canon_nav(params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    target = _clean(str(params.get("target", "")))
    if not target or len(target) < 2:
        return None
    # Don't let navigation swallow obvious app phrases (app.open is scanned first, but be safe).
    if target.lower() in _APP_LOOKUP:
        return None
    return {"target": target}


def _canon_media(params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    prompt = _clean(str(params.get("prompt", "")))
    if not prompt or len(prompt) < 2:
        return None
    kind = params.get("kind") or "image"
    return {"kind": "glb" if kind in ("glb", "3d", "model") else "image", "prompt": prompt}


def _canon_build(params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    req = (params.get("request") or "").strip()
    return {"request": req} if len(req) >= 4 else None


def _canon_review(params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    verb = str(params.get("verb", "")).lower()
    decision = "approved" if re.search(r"approv|accept|sign off|confirm|okay|ok\b|yes", verb) else "declined"
    out: Dict[str, Any] = {"decision": decision}
    tid = params.get("id")
    if tid not in (None, ""):
        try:
            out["id"] = int(tid)
        except (TypeError, ValueError):
            pass
    return out


def _canon_control(params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    verb = str(params.get("verb", "")).lower()
    if re.search(r"\bsleep\b", verb):
        action = "sleep"
    elif re.search(r"\b(stop|halt|pause|shut)\b", verb):
        action = "stop"
    else:
        action = "run"
    return {"action": action}


def _canon_call(params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    who = str(params.get("who", "")).lower()
    which = "emergency" if re.search(r"emergenc|ambulance|nine one one|911|999|paramedic", who) else "family"
    return {"which": which}


# --------------------------------------------------------------------------- #
# THE CAPABILITIES — scanned top-to-bottom; first confident match wins.
# Order encodes precedence: high-stakes + high-precision first, broad last.
# --------------------------------------------------------------------------- #
CAPABILITIES: List[Capability] = [

    # ---- Lifeline: call for help. Highest priority, fires on the faintest signal. ----
    Capability(
        id="help.sos", name="Call for help", category="help",
        description="Alert her family/carer immediately that she needs help (HELP / I've fallen / emergency).",
        patterns=[
            r"\b(help me|i need help|need some help|please help|send help|call for help)\b",
            r"\bi('?ve| have) fallen\b|\bi can'?t get up\b|\bi'?m stuck\b",
            r"\b(emergency|i'?m hurt|i am hurt|i'?ve hurt myself|something'?s wrong|i feel (unwell|faint|dizzy|sick))\b",
        ],
        examples=["help me", "I need help", "I've fallen and I can't get up", "it's an emergency",
                  "I'm hurt", "something's wrong", "please send help", "I feel dizzy"],
        reply="Don't worry — I've alerted your family right now and help is coming. I'm staying right here with you.",
        binding="both", server_action="sos", ui={"action": "sos"},
        params=[{"name": "what", "type": "string", "required": False}],
        autonomous=True,
    ),

    Capability(
        id="call.contact", name="Call family or emergency", category="help",
        description="Place a phone call to her family or to emergency services.",
        patterns=[
            r"\bcall\b.*\b(?P<who>emergency|ambulance|nine one one|911|999|paramedics?)\b",
            r"\b(call|ring|phone|dial)\b\s+(?:my\s+)?(?P<who>family|son|daughter|him|her|home|mum|mom|dad|husband|wife)\b",
        ],
        examples=["call 911", "call an ambulance", "call my family", "ring my son", "phone home", "call mum"],
        reply="Calling {which} now. Hold on — I'm right here.",
        binding="ui", ui={"action": "call", "which": "{which}"},
        params=[{"name": "which", "type": "string", "required": True, "enum": ["family", "emergency"]}],
        canon=_canon_call,
    ),

    # ---- Open a dock app (precise: rejects unknown apps so nav.fly can try). ----
    Capability(
        id="app.open", name="Open an app", category="app",
        description="Open one of the dock apps: tasks, library/studio, guardian, agent OS, vitals, upgrades, climate, care.",
        patterns=[
            r"\b(?:open|launch|bring up|pull up|show me|show|go to|take me to|switch to|let me see)\b"
            r"\s+(?:the\s+|my\s+)?(?P<app>.+?)(?:\s+(?:app|screen|page|panel|view))?\s*$",
        ],
        examples=["open my tasks", "show me mission control", "open the library", "launch the studio",
                  "open guardian", "bring up the agent tools", "show my vitals", "open upgrades",
                  "open climate control", "open my care panel", "show me what you're working on"],
        reply="Opening {app}.",
        binding="ui", ui={"action": "open_app", "app": "{app}"},
        params=[{"name": "app", "type": "string", "required": True}],
        canon=_canon_app,
    ),

    # ---- Generate media (server-executed so it works from voice + agent identically). ----
    Capability(
        id="media.create", name="Create image or 3D model", category="create",
        description="Generate an image or a 3D (GLB) model from a description.",
        patterns=[
            r"^\s*(?:an?\s+)?(?:image|picture|photo|drawing|painting|art)\s+(?:of\s+)?(?P<prompt>.+)$",
            r"^\s*(?:draw|paint|sketch)\s+(?:me\s+)?(?:an?\s+)?(?P<prompt>.+)$",
            r"\b(?:generate|create|make)\s+(?:an?\s+)?(?:image|picture|photo|drawing)\s+(?:of\s+)?(?P<prompt>.+)$",
            r"\b(?P<kind>3d|model|sculpt|mesh|glb)\b.*?(?:of\s+)?(?P<prompt2>.+)$",
            r"\b(?:3d\s+model|sculpt|model)\s+(?:of\s+)?(?P<prompt>.+)$",
        ],
        examples=["image of a glowing city at night", "picture of a red helmet", "draw me a sunrise",
                  "3d model of a spaceship", "make an image of the ocean", "sculpt a dragon"],
        reply="Generating your {kind_word} now — I'll add it to your library the moment it's ready.",
        binding="both", server_action="media_create", ui={"action": "media_done"},
        params=[{"name": "kind", "type": "string", "required": True, "enum": ["image", "glb"]},
                {"name": "prompt", "type": "string", "required": True}],
        canon=_canon_media,
    ),

    # ---- Start a build swarm (durable multi-agent). ----
    Capability(
        id="swarm.build", name="Start a build swarm", category="swarm",
        description="Spin up a durable, checkpointed multi-agent swarm to build a feature she describes.",
        patterns=[
            r"\b(?:build|code|make|create|develop|program|generate|design|write|add|implement)\b[^]*?"
            r"\b(feature|function|glb|3d ?model|model|scraper|tool|app|page|widget|website|web ?app|"
            r"game|program|script|button|dashboard|panel|integration|something|that|it)\b(?P<request>.*)$",
            r"\b(?:can you|could you|please|i need you to|i want you to|i'?d like you to|would you)\b[^]*?"
            r"\b(?:build|code|make|create|develop|program|generate|design|implement)\b(?P<request>.*)$",
        ],
        examples=["build me a weather widget", "code a new dashboard page", "create an app that tracks my pills",
                  "make me a tool to scrape the news", "can you build a reminders panel", "develop a photo gallery"],
        reply="Right away. I've put a team on it — they'll work through it step by step and I'll tell you the "
              "moment it's done. It won't lose its place, even if anything restarts.",
        binding="server", server_action="swarm_build",
        params=[{"name": "request", "type": "string", "required": True}],
        canon=lambda p: {"request": p.get("_text", "").strip()} if p.get("_text") else None,
    ),

    # ---- Review queue: approve / decline a task or swarm. ----
    Capability(
        id="task.review", name="Approve or decline a task", category="tasks",
        description="Approve or decline a finished task or swarm (by number, or the most recent).",
        patterns=[
            r"\b(?P<verb>approve|accept|sign off|confirm|okay|reject|decline|deny|knock back|turn down)\b"
            r"\s+(?:the\s+|that\s+|this\s+)?(?:task|build|swarm|job|work|change|it|one)\b"
            r"(?:\s+(?:number\s*|#\s*)?(?P<id>\d+))?",
            r"\b(?P<verb>approve|accept|sign off|reject|decline|deny)\b\s+(?:task|build|swarm|number\s*|#\s*)?(?P<id>\d+)\b",
        ],
        examples=["approve the task", "approve task 12", "accept that build", "sign off on the swarm",
                  "reject the last task", "decline that", "approve it"],
        reply="{decision_word} the {kind} for you.",
        binding="server", server_action="task_review",
        params=[{"name": "decision", "type": "string", "required": True, "enum": ["approved", "declined"]},
                {"name": "id", "type": "integer", "required": False}],
        canon=_canon_review,
    ),

    # ---- Run an agent-OS tool by name (disk audit, cpu inspect, gpu status, …). ----
    Capability(
        id="agent.run", name="Run an agent tool", category="agent",
        description="Plan + run an Agent-OS tool from a natural request (e.g. 'run the disk audit').",
        patterns=[
            r"\b(?:run|execute|perform|do|kick off|check|show me)\b\s+(?:a\s+|an\s+|the\s+)?"
            r"(?P<cmd>.+?(?:audit|inspect|status|scan|check|report|cleanup|clean up|prune|usage|stats?).*)$",
        ],
        examples=["run the disk audit", "do a cpu inspect", "check the gpu status", "run a docker usage scan",
                  "perform a storage cleanup", "show me the knowledge stats"],
        reply="On it — running {cmd} now.",
        binding="server", server_action="agent_run",
        params=[{"name": "cmd", "type": "string", "required": True}],
        canon=lambda p: {"cmd": _clean(p.get("cmd", ""))} if _clean(p.get("cmd", "")) else None,
    ),

    # ---- Global system controls (lifeline-safe: only producer daemons). ----
    Capability(
        id="system.control", name="Run / stop / sleep systems", category="system",
        description="Start, stop, or sleep the background data pipelines (the lifeline services stay up).",
        patterns=[
            r"\b(?P<verb>run|start|stop|halt|pause|sleep|shut down|shutdown)\b\s+(?:all|everything|"
            r"the\s+)?(?:all\s+)?(?:systems?|pipelines?|workers?|everything|engines?)\b",
            r"\b(?P<verb>sleep mode|go to sleep)\b",
        ],
        examples=["run all systems", "start everything", "stop all the pipelines", "halt everything",
                  "go to sleep", "sleep mode"],
        reply="{verb_word} the systems now.",
        binding="both", server_action="control_all", ui={"action": "run_all", "value": "{action}"},
        params=[{"name": "action", "type": "string", "required": True, "enum": ["run", "stop", "sleep"]}],
        canon=_canon_control,
    ),

    # ---- Read the live system status aloud (client renders from its metrics). ----
    Capability(
        id="status.read", name="Read system status", category="system",
        description="Read the live system status aloud (knowledge build %, pipelines online, entities, VRAM).",
        patterns=[
            r"^\s*(?:read\s+(?:the\s+)?)?(?:system\s+)?status\b",
            r"\b(?:sitrep|how(?:'s| is| are)\s+(?:everything|things|the system|we doing|it going)|give me a report)\b",
        ],
        examples=["status", "read status", "how's everything", "give me a report", "sitrep", "how are things"],
        reply="Here's where things stand.",
        binding="ui", ui={"action": "status"},
        params=[],
    ),

    # ---- Navigate / fly the universe (broad; runs after app.open). ----
    Capability(
        id="nav.fly", name="Fly the universe", category="nav",
        description="Fly the 3D universe to a planet, cluster, or search target (NASA-Eyes navigation).",
        patterns=[
            r"\b(?:fly|go|navigate|jump|warp|zoom|travel|head|cruise|take me|fly me|move|drive)\b"
            r"\s+(?:to|into|over to|toward|towards|out to|down to|up to)\s+(?P<target>.+)$",
            r"\b(?:where(?:'s| is)|find|locate|search for)\s+(?:the\s+)?(?P<target>.+)$",
            r"\b(?:show me|show)\s+(?:the\s+)?(?P<target>.+)$",
        ],
        examples=["fly to mars", "take me to the knowledge planet", "go to the infrastructure cluster",
                  "navigate to climate", "show me the graph", "find the agent os planet", "where is vitals"],
        reply="Flying you to {target} now.",
        binding="ui", ui={"action": "navigate", "target": "{target}"},
        params=[{"name": "target", "type": "string", "required": True}],
        canon=_canon_nav,
    ),

    Capability(
        id="nav.home", name="Return home", category="nav",
        description="Fly back to the home view of the universe.",
        patterns=[
            r"\b(?:go|fly|take me|come|back|bring me)\b\s*(?:back\s+)?(?:to\s+)?home\b",
            r"\b(?:home view|reset (?:the )?view|back to the universe|zoom out|fly home)\b",
        ],
        examples=["go home", "take me home", "back to the universe", "reset the view", "zoom out", "fly home"],
        reply="Taking you home.",
        binding="ui", ui={"action": "home"},
        params=[],
    ),
]

for _c in CAPABILITIES:
    _c.compile()

_BY_ID: Dict[str, Capability] = {c.id: c for c in CAPABILITIES}


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #
def all() -> List[Capability]:  # noqa: A001 — matches the registry idiom (tools.all())
    return list(CAPABILITIES)


def get(cap_id: str) -> Optional[Capability]:
    return _BY_ID.get(str(cap_id))


def for_surface(surface: str) -> List[Capability]:
    return [c for c in CAPABILITIES if surface in c.surfaces]


def match(text: str, *, surface: str = "chat") -> Optional[Tuple[Capability, Dict[str, Any], float]]:
    """Deterministic Tier-1 classification. Returns (capability, params, confidence) for the first
    confident match active on `surface`, or None so the caller falls through (semantic tier → chat).
    Never raises."""
    t = (text or "").strip()
    if not t:
        return None
    for cap in CAPABILITIES:
        if surface not in cap.surfaces:
            continue
        for rx in cap._rx:
            try:
                m = rx.search(t)
            except Exception:  # noqa: BLE001
                m = None
            if not m:
                continue
            raw = {k: v for k, v in (m.groupdict() or {}).items() if v is not None}
            # merge the alt 3d-prompt group, expose the full text for whole-utterance captures
            if raw.get("prompt2") and not raw.get("prompt"):
                raw["prompt"] = raw.pop("prompt2")
            raw["_text"] = t
            try:
                params = cap.canon(raw) if cap.canon else {k: v for k, v in raw.items() if k != "_text"}
            except Exception:  # noqa: BLE001
                params = None
            if params is None:
                continue  # canon rejected → keep scanning (precision)
            params.pop("_text", None)
            return (cap, params, 1.0)
    return None


def build_directive(cap: Capability, params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Interpolate a capability's UI directive template with resolved params. None if no UI binding."""
    if not cap.ui:
        return None
    out: Dict[str, Any] = {}
    for k, v in cap.ui.items():
        if isinstance(v, str) and v.startswith("{") and v.endswith("}"):
            out[k] = params.get(v[1:-1], v)
        else:
            out[k] = v
    out["capability"] = cap.id
    return out


def render_reply(cap: Capability, params: Dict[str, Any]) -> str:
    """Fill the spoken reply template, with friendly word-forms for the enum-ish params."""
    ctx = dict(params)
    ctx.setdefault("kind_word", {"glb": "3D model", "image": "image"}.get(params.get("kind"), "image"))
    ctx.setdefault("decision_word", {"approved": "Approved", "declined": "Declined"}.get(params.get("decision"), "Recorded"))
    ctx.setdefault("verb_word", {"run": "Starting", "stop": "Stopping", "sleep": "Putting to sleep"}.get(params.get("action"), "Updating"))
    ctx.setdefault("kind", "task")
    ctx.setdefault("app", params.get("app", "that"))
    ctx.setdefault("target", params.get("target", "there"))
    ctx.setdefault("which", params.get("which", "them"))
    ctx.setdefault("cmd", params.get("cmd", "that"))
    try:
        return cap.reply.format(**ctx)
    except Exception:  # noqa: BLE001
        return cap.reply


def agent_tool_specs() -> List[Dict[str, Any]]:
    """Project the registry into agent-tool specs (id/name/description/input_schema), so the swarm can
    call any capability. The actual handler is wired in server/agent/jarvis_capabilities.py."""
    specs: List[Dict[str, Any]] = []
    for cap in CAPABILITIES:
        if "agent" not in cap.surfaces:
            continue
        props: Dict[str, Any] = {}
        required: List[str] = []
        for p in cap.params:
            schema: Dict[str, Any] = {"type": p.get("type", "string")}
            if p.get("enum"):
                schema["enum"] = p["enum"]
            if p.get("description"):
                schema["description"] = p["description"]
            props[p["name"]] = schema
            if p.get("required"):
                required.append(p["name"])
        specs.append({
            "id": f"capability.{cap.id}",
            "cap_id": cap.id,
            "name": cap.name,
            "category": cap.category,
            "description": cap.description + "  (Examples: " + "; ".join(cap.examples[:3]) + ")",
            "input_schema": {"type": "object", "properties": props, "required": required},
            "binding": cap.binding,
        })
    return specs
