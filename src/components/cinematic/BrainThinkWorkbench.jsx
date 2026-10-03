/**
 * F304 — Brain Thinking Workbench (BRTW)
 *
 * Transparent, retrieval-grounded thinking tools over the second-brain vault.
 * Every result is assembled from real vault notes — nothing is generated or
 * fabricated. Source note ids are shown for every evidence point.
 *
 *  HEALTH tab    — GET /v1/brain/health (120s poll): vault score bar + orphan/
 *                  stale/gap/low-confidence/contradiction counts.
 *  CHALLENGE tab — POST /v1/brain/think/challenge {idea} → counter-case list
 *                  (each point cites the vault note it came from).
 *  PANEL tab     — POST /v1/brain/think/panel {decision, n} → N perspective stubs
 *                  assembled from relevant vault notes.
 *  CONNECT tab   — POST /v1/brain/think/connect {a, b} → concept bridge via
 *                  shared graph neighbours or nearest embeddings.
 *  EMERGE tab    — POST /v1/brain/think/emerge {days} → emergent un-named themes
 *                  (frequent terms across recent note bodies worth promoting).
 *
 * Stat tiles: vault-score / orphans / gaps / low-confidence
 * Badge: amber = score < 70, green = score ≥ 70 (healthy vault).
 * ▶ ASSESS: 2-sentence brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ⬡ BRTW  at bottom:8 left:402000, zIndex:181.
 * Event:   jarvis:brtw-toggle
 * Voice:   "brain think / think tool / challenge idea / red team / thought panel /
 *           emerge themes / connect concepts / brtw / thinking tools / vault health /
 *           brain workbench / think with jarvis / knowledge think / vault think"
 * Refresh: 120 s auto-poll (health only; think tools are query-driven).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 402000;
const POLL_MS  = 120_000;
const CYAN     = "#29E7FF";
const GREEN    = "#34D399";
const AMBER    = "#F59E0B";
const SLATE    = "#6E8AA0";
const RED      = "#FF4444";
const VIOLET   = "#A78BFA";
const EMERALD  = "#10B981";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const BRTW_RE =
  /\b(brain\s+think(ing)?|think\s+tool|challenge\s+idea|red[\s-]team|thought\s+panel|emerge\s+themes?|connect\s+concepts?|brtw|thinking\s+tools?|vault\s+health|brain\s+workbench|think\s+with\s+jarvis|knowledge\s+think|vault\s+think)\b/i;

export function isBrtwQuery(q) { return BRTW_RE.test(q); }

export async function buildBrtwScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const res  = await fetch(`${base}/v1/brain/health`, { headers: hdr });
    const data = await res.json();
    const score   = data?.score ?? 100;
    const orphans = data?.counts?.orphans ?? 0;
    const gaps    = data?.counts?.gaps ?? 0;
    const stale   = data?.counts?.stale ?? 0;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS brain thinking workbench status: vault health score ${score}/100, ` +
          `${orphans} orphan notes, ${gaps} knowledge gaps, ${stale} stale notes. ` +
          `The thinking workbench provides retrieval-grounded tools: challenge (red-team an idea ` +
          `with vault counter-evidence), panel (perspective stubs from real notes), connect ` +
          `(bridge two concepts via graph), and emerge (surface un-named themes). ` +
          `Provide a 2-sentence vault thinking-workbench status brief — formal British butler tone, ` +
          `first person, note vault health and readiness of the thinking tools.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Brain thinking workbench status confirmed, sir.").trim();
  } catch {
    return "Brain thinking workbench assessment unavailable at this time, sir.";
  }
}

// ── small helpers ─────────────────────────────────────────────────────────────

function hdr() { return { Authorization: `Bearer ${API_KEY}` }; }
function jsonHdr() { return { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` }; }

function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, Number(n) || lo)); }

// ── styles ────────────────────────────────────────────────────────────────────

const PANEL = {
  position: "fixed",
  top: 58,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 181,
  width: "min(560px,95vw)",
  maxHeight: "82vh",
  display: "flex",
  flexDirection: "column",
  background: "rgba(4,8,14,0.95)",
  border: `1px solid ${CYAN}44`,
  borderRadius: 14,
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  boxShadow: `0 0 52px ${CYAN}18`,
  fontFamily: "'JetBrains Mono', monospace",
  color: "#DCEBF5",
  overflow: "hidden",
};

const SCROLL = { overflowY: "auto", flex: 1, padding: "8px 14px 14px" };

const TEXTAREA_STYLE = {
  width: "100%",
  background: "rgba(41,231,255,0.06)",
  border: `1px solid ${CYAN}33`,
  borderRadius: 6,
  color: "#DCEBF5",
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 10,
  padding: "6px 8px",
  outline: "none",
  boxSizing: "border-box",
  resize: "vertical",
  minHeight: 54,
};

const INPUT_STYLE = {
  ...{
    background: "rgba(41,231,255,0.06)",
    border: `1px solid ${CYAN}33`,
    borderRadius: 6,
    color: "#DCEBF5",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    padding: "5px 8px",
    outline: "none",
    boxSizing: "border-box",
  },
  width: "100%",
};

function Tile({ label, val, col }) {
  return (
    <div style={{
      flex: 1, textAlign: "center",
      background: "rgba(41,231,255,0.04)",
      border: `1px solid ${CYAN}18`,
      borderRadius: 8, padding: "6px 4px",
    }}>
      <div style={{ color: col || CYAN, fontSize: 16, fontVariantNumeric: "tabular-nums" }}>{val}</div>
      <div style={{ color: SLATE, fontSize: 7, letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function TabBar({ tabs, active, onSelect }) {
  return (
    <div style={{ display: "flex", gap: 4, padding: "6px 14px", borderBottom: `1px solid ${CYAN}18`, flexWrap: "wrap" }}>
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onSelect(t)}
          style={{
            padding: "3px 10px", fontSize: 8, borderRadius: 4, letterSpacing: 1,
            cursor: "pointer", fontFamily: "inherit",
            border: `1px solid ${active === t ? CYAN : CYAN + "33"}`,
            background: active === t ? `${CYAN}22` : "transparent",
            color: active === t ? CYAN : SLATE,
          }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function Btn({ children, onClick, disabled, col, busy }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      style={{
        fontSize: 8, padding: "3px 9px", borderRadius: 4, letterSpacing: 1,
        border: `1px solid ${(col || CYAN) + "66"}`,
        background: `rgba(${col === RED ? "255,68,68" : col === GREEN ? "52,211,153" : "41,231,255"},0.08)`,
        color: col || CYAN, cursor: "pointer", fontFamily: "inherit",
        opacity: (disabled || busy) ? 0.45 : 1,
      }}
    >
      {busy ? "…" : children}
    </button>
  );
}

function ScoreBar({ score }) {
  const col = score >= 80 ? GREEN : score >= 60 ? AMBER : RED;
  return (
    <div style={{ margin: "8px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: SLATE, marginBottom: 3 }}>
        <span>VAULT HEALTH</span><span style={{ color: col }}>{score}/100</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: `${CYAN}18`, overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: col, borderRadius: 3, transition: "width .5s" }} />
      </div>
    </div>
  );
}

function CountRow({ label, val, col }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: `1px solid ${CYAN}0d`, fontSize: 9 }}>
      <span style={{ color: SLATE }}>{label}</span>
      <span style={{ color: col || CYAN }}>{val}</span>
    </div>
  );
}

function Chip({ children, col }) {
  return (
    <span style={{
      fontSize: 7, padding: "1px 6px", borderRadius: 3,
      border: `1px solid ${(col || CYAN) + "55"}`,
      color: col || CYAN, background: `${(col || CYAN)}11`,
      marginRight: 4, display: "inline-block",
    }}>
      {children}
    </span>
  );
}

// ── HEALTH tab ────────────────────────────────────────────────────────────────

function HealthTab({ health }) {
  if (!health) return <div style={{ color: SLATE, fontSize: 9, textAlign: "center", padding: 24 }}>Loading vault health…</div>;

  const counts = health.counts || {};
  const orphans = health.orphans || [];
  const stale   = health.stale || [];
  const gaps    = health.gaps || [];
  const lowConf = health.low_confidence || [];
  const contradictions = health.contradictions || [];

  return (
    <div>
      <ScoreBar score={health.score ?? 100} />
      <div style={{ marginTop: 10 }}>
        <CountRow label="Notes" val={counts.notes ?? 0} col={CYAN} />
        <CountRow label="Orphans (no links in or out)" val={counts.orphans ?? 0} col={(counts.orphans ?? 0) > 0 ? AMBER : GREEN} />
        <CountRow label="Stale (not updated recently)" val={counts.stale ?? 0} col={(counts.stale ?? 0) > 0 ? AMBER : GREEN} />
        <CountRow label="Knowledge gaps (broken wikilinks)" val={counts.gaps ?? 0} col={(counts.gaps ?? 0) > 0 ? AMBER : GREEN} />
        <CountRow label="Low confidence notes" val={counts.low_confidence ?? 0} col={(counts.low_confidence ?? 0) > 0 ? VIOLET : GREEN} />
        <CountRow label="Potential contradictions" val={counts.contradictions ?? 0} col={(counts.contradictions ?? 0) > 0 ? RED : GREEN} />
      </div>
      {orphans.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 8, color: SLATE, letterSpacing: 1, marginBottom: 4 }}>ORPHAN NOTES</div>
          {orphans.slice(0, 6).map((o, i) => (
            <div key={i} style={{ fontSize: 9, padding: "2px 0", display: "flex", gap: 6, alignItems: "center" }}>
              <Chip col={AMBER}>{o.kind || "note"}</Chip>
              <span style={{ color: "#DCEBF5", flex: 1 }}>{o.title || o.id}</span>
            </div>
          ))}
          {orphans.length > 6 && <div style={{ color: SLATE, fontSize: 8, marginTop: 3 }}>…and {orphans.length - 6} more</div>}
        </div>
      )}
      {gaps.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 8, color: SLATE, letterSpacing: 1, marginBottom: 4 }}>KNOWLEDGE GAPS</div>
          {gaps.slice(0, 6).map((g, i) => (
            <div key={i} style={{ fontSize: 9, padding: "2px 0", color: AMBER }}>[[{typeof g === "string" ? g : g.title || JSON.stringify(g)}]]</div>
          ))}
          {gaps.length > 6 && <div style={{ color: SLATE, fontSize: 8, marginTop: 3 }}>…and {gaps.length - 6} more</div>}
        </div>
      )}
    </div>
  );
}

// ── CHALLENGE tab ─────────────────────────────────────────────────────────────

function ChallengeTab() {
  const [idea, setIdea] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!idea.trim()) return;
    setBusy(true); setResult(null);
    try {
      const r = await fetch(`${apiBase()}/v1/brain/think/challenge`, {
        method: "POST",
        headers: jsonHdr(),
        body: JSON.stringify({ idea: idea.trim() }),
      });
      setResult(await r.json());
    } catch {
      setResult({ error: "Request failed" });
    } finally {
      setBusy(false);
    }
  }

  const counterCase = result?.counter_case || [];
  const considered  = result?.considered ?? 0;

  return (
    <div>
      <div style={{ fontSize: 8, color: SLATE, marginBottom: 6, letterSpacing: 1 }}>
        RED-TEAM AN IDEA — retrieves vault notes that push back
      </div>
      <textarea
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        placeholder="Enter an idea or claim to challenge…"
        style={TEXTAREA_STYLE}
      />
      <div style={{ marginTop: 6 }}>
        <Btn onClick={run} busy={busy} disabled={!idea.trim()}>▶ CHALLENGE</Btn>
      </div>
      {result && !result.error && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 8, color: SLATE, marginBottom: 4 }}>
            {counterCase.length > 0
              ? `${counterCase.length} counter-point(s) found from ${considered} considered notes`
              : `No counter-evidence found across ${considered} notes — vault supports the idea`}
          </div>
          {counterCase.map((pt, i) => (
            <div key={i} style={{
              padding: "6px 8px", marginBottom: 6, borderRadius: 6,
              background: "rgba(255,68,68,0.07)", border: `1px solid ${RED}22`,
            }}>
              <div style={{ fontSize: 9, color: "#DCEBF5", marginBottom: 4 }}>{pt.point}</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                {pt.label && <Chip col={AMBER}>{pt.label}</Chip>}
                {pt.note_id && <span style={{ fontSize: 7, color: SLATE }}>note:{String(pt.note_id).slice(0, 10)}</span>}
                {pt.score != null && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 40, height: 3, background: `${RED}22`, borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${Math.round(clamp(pt.score, 0, 1) * 100)}%`, height: "100%", background: RED }} />
                    </div>
                    <span style={{ fontSize: 7, color: SLATE }}>{(pt.score * 100).toFixed(0)}%</span>
                  </div>
                )}
              </div>
            </div>
          ))}
          {result.note && <div style={{ fontSize: 7, color: SLATE, marginTop: 6, fontStyle: "italic" }}>{result.note}</div>}
        </div>
      )}
      {result?.error && <div style={{ color: RED, fontSize: 9, marginTop: 8 }}>{result.error}</div>}
    </div>
  );
}

// ── PANEL tab ─────────────────────────────────────────────────────────────────

function PanelTab() {
  const [decision, setDecision] = useState("");
  const [n, setN]               = useState(4);
  const [result, setResult]     = useState(null);
  const [busy, setBusy]         = useState(false);

  async function run() {
    if (!decision.trim()) return;
    setBusy(true); setResult(null);
    try {
      const r = await fetch(`${apiBase()}/v1/brain/think/panel`, {
        method: "POST",
        headers: jsonHdr(),
        body: JSON.stringify({ decision: decision.trim(), n }),
      });
      setResult(await r.json());
    } catch {
      setResult({ error: "Request failed" });
    } finally {
      setBusy(false);
    }
  }

  const perspectives = result?.perspectives || [];

  return (
    <div>
      <div style={{ fontSize: 8, color: SLATE, marginBottom: 6, letterSpacing: 1 }}>
        PERSPECTIVE PANEL — surfaces real vault notes as viewpoints on a decision
      </div>
      <textarea
        value={decision}
        onChange={(e) => setDecision(e.target.value)}
        placeholder="Enter a decision or question to convene a panel on…"
        style={TEXTAREA_STYLE}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
        <Btn onClick={run} busy={busy} disabled={!decision.trim()}>▶ CONVENE PANEL</Btn>
        <label style={{ fontSize: 8, color: SLATE, display: "flex", alignItems: "center", gap: 6 }}>
          <span>PERSPECTIVES</span>
          <input
            type="range" min={2} max={8} value={n}
            onChange={(e) => setN(Number(e.target.value))}
            style={{ width: 60 }}
          />
          <span style={{ color: CYAN, minWidth: 14 }}>{n}</span>
        </label>
      </div>
      {result && !result.error && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 8, color: SLATE, marginBottom: 4 }}>
            {perspectives.length > 0
              ? `${perspectives.length} perspective(s) assembled from vault notes`
              : "No relevant notes found — vault too sparse for this decision"}
          </div>
          {perspectives.map((p, i) => (
            <div key={i} style={{
              padding: "6px 8px", marginBottom: 6, borderRadius: 6,
              background: "rgba(167,139,250,0.07)", border: `1px solid ${VIOLET}22`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <Chip col={VIOLET}>PERSPECTIVE {i + 1}</Chip>
                {p.score != null && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 40, height: 3, background: `${VIOLET}22`, borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${Math.round(clamp(p.score, 0, 1) * 100)}%`, height: "100%", background: VIOLET }} />
                    </div>
                    <span style={{ fontSize: 7, color: SLATE }}>{(p.score * 100).toFixed(0)}%</span>
                  </div>
                )}
              </div>
              {p.angle && <div style={{ fontSize: 9, color: CYAN, marginBottom: 3 }}>{p.angle}</div>}
              {p.snippet && <div style={{ fontSize: 9, color: "#DCEBF5", opacity: 0.85 }}>{p.snippet}</div>}
              {p.note_id && <div style={{ fontSize: 7, color: SLATE, marginTop: 3 }}>note:{String(p.note_id).slice(0, 12)}</div>}
            </div>
          ))}
          {result.note && <div style={{ fontSize: 7, color: SLATE, marginTop: 6, fontStyle: "italic" }}>{result.note}</div>}
        </div>
      )}
      {result?.error && <div style={{ color: RED, fontSize: 9, marginTop: 8 }}>{result.error}</div>}
    </div>
  );
}

// ── CONNECT tab ───────────────────────────────────────────────────────────────

function ConnectTab() {
  const [a, setA]           = useState("");
  const [b, setB]           = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy]     = useState(false);

  async function run() {
    if (!a.trim() || !b.trim()) return;
    setBusy(true); setResult(null);
    try {
      const r = await fetch(`${apiBase()}/v1/brain/think/connect`, {
        method: "POST",
        headers: jsonHdr(),
        body: JSON.stringify({ a: a.trim(), b: b.trim() }),
      });
      setResult(await r.json());
    } catch {
      setResult({ error: "Request failed" });
    } finally {
      setBusy(false);
    }
  }

  const bridge = result?.bridge || [];
  const method = result?.method;

  return (
    <div>
      <div style={{ fontSize: 8, color: SLATE, marginBottom: 6, letterSpacing: 1 }}>
        CONCEPT BRIDGE — finds shared graph nodes or nearest embeddings between two concepts
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 7, color: SLATE, marginBottom: 3 }}>CONCEPT A</div>
          <input value={a} onChange={(e) => setA(e.target.value)} placeholder="first concept…" style={INPUT_STYLE} />
        </div>
        <div>
          <div style={{ fontSize: 7, color: SLATE, marginBottom: 3 }}>CONCEPT B</div>
          <input value={b} onChange={(e) => setB(e.target.value)} placeholder="second concept…" style={INPUT_STYLE} />
        </div>
      </div>
      <Btn onClick={run} busy={busy} disabled={!a.trim() || !b.trim()}>▶ FIND BRIDGE</Btn>
      {result && !result.error && (
        <div style={{ marginTop: 10 }}>
          {method && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
              <Chip col={EMERALD}>{method.replace(/_/g, " ").toUpperCase()}</Chip>
              <span style={{ fontSize: 8, color: SLATE }}>
                {bridge.length > 0 ? `${bridge.length} bridge node(s) found` : "No bridge found — concepts may be isolated in the vault"}
              </span>
            </div>
          )}
          {bridge.length === 0 && !method && (
            <div style={{ fontSize: 9, color: SLATE }}>No connection found — vault too sparse or concepts not yet linked.</div>
          )}
          {bridge.map((item, i) => (
            <div key={i} style={{
              padding: "5px 8px", marginBottom: 5, borderRadius: 6,
              background: "rgba(16,185,129,0.07)", border: `1px solid ${EMERALD}22`,
              display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
            }}>
              <Chip col={EMERALD}>BRIDGE {i + 1}</Chip>
              <span style={{ fontSize: 9, color: "#DCEBF5", flex: 1 }}>
                {typeof item === "string" ? item : item.label || item.title || item.id || JSON.stringify(item)}
              </span>
              {item.score != null && (
                <span style={{ fontSize: 7, color: SLATE }}>{(item.score * 100).toFixed(0)}%</span>
              )}
            </div>
          ))}
          {result.note && <div style={{ fontSize: 7, color: SLATE, marginTop: 6, fontStyle: "italic" }}>{result.note}</div>}
        </div>
      )}
      {result?.error && <div style={{ color: RED, fontSize: 9, marginTop: 8 }}>{result.error}</div>}
    </div>
  );
}

// ── EMERGE tab ────────────────────────────────────────────────────────────────

function EmergeTab() {
  const [days, setDays]     = useState(30);
  const [result, setResult] = useState(null);
  const [busy, setBusy]     = useState(false);

  async function run() {
    setBusy(true); setResult(null);
    try {
      const r = await fetch(`${apiBase()}/v1/brain/think/emerge`, {
        method: "POST",
        headers: jsonHdr(),
        body: JSON.stringify({ days }),
      });
      setResult(await r.json());
    } catch {
      setResult({ error: "Request failed" });
    } finally {
      setBusy(false);
    }
  }

  const themes = result?.themes || [];
  const maxFreq = Math.max(1, ...themes.map((t) => t.count ?? t.freq ?? 1));

  return (
    <div>
      <div style={{ fontSize: 8, color: SLATE, marginBottom: 6, letterSpacing: 1 }}>
        EMERGENT THEMES — frequent un-named terms across recent notes worth promoting to concepts
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <Btn onClick={run} busy={busy}>▶ SURFACE THEMES</Btn>
        <label style={{ fontSize: 8, color: SLATE, display: "flex", alignItems: "center", gap: 6 }}>
          <span>DAYS</span>
          <input
            type="range" min={7} max={90} step={7} value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={{ width: 70 }}
          />
          <span style={{ color: CYAN, minWidth: 24 }}>{days}d</span>
        </label>
      </div>
      {result && !result.error && (
        <div>
          <div style={{ fontSize: 8, color: SLATE, marginBottom: 6 }}>
            {themes.length > 0
              ? `${themes.length} emergent theme(s) across last ${days} days`
              : `No emergent themes found in last ${days} days — vault may be sparse`}
          </div>
          {themes.map((t, i) => {
            const term  = typeof t === "string" ? t : t.term || t.word || String(t);
            const freq  = t.count ?? t.freq ?? 1;
            const pct   = Math.round((freq / maxFreq) * 100);
            return (
              <div key={i} style={{ marginBottom: 5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginBottom: 2 }}>
                  <span style={{ color: "#DCEBF5" }}>{term}</span>
                  <span style={{ color: SLATE }}>{freq}×</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: `${CYAN}18`, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: CYAN, borderRadius: 2 }} />
                </div>
              </div>
            );
          })}
          {result.note && <div style={{ fontSize: 7, color: SLATE, marginTop: 8, fontStyle: "italic" }}>{result.note}</div>}
        </div>
      )}
      {result?.error && <div style={{ color: RED, fontSize: 9, marginTop: 8 }}>{result.error}</div>}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function BrainThinkWorkbench() {
  const [open, setOpen]     = useState(false);
  const [tab, setTab]       = useState("HEALTH");
  const [health, setHealth] = useState(null);
  const [badge, setBadge]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const pollT = useRef(null);

  const base = apiBase();

  const fetchHealth = useCallback(async () => {
    try {
      const r = await fetch(`${base}/v1/brain/health`, { headers: hdr() });
      const d = await r.json();
      setHealth(d);
      setBadge(d.score ?? 100);
    } catch {
      // silently degrade
    }
  }, [base]);

  useEffect(() => {
    fetchHealth();
    pollT.current = setInterval(fetchHealth, POLL_MS);
    return () => clearInterval(pollT.current);
  }, [fetchHealth]);

  useEffect(() => {
    const toggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:brtw-toggle", toggle);
    return () => window.removeEventListener("jarvis:brtw-toggle", toggle);
  }, []);

  async function assess() {
    setAssessing(true);
    const script = await buildBrtwScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
  }

  if (!open) return null;

  const score     = health?.score ?? null;
  const orphanCnt = health?.counts?.orphans ?? 0;
  const gapCnt    = health?.counts?.gaps ?? 0;
  const lowCnt    = health?.counts?.low_confidence ?? 0;
  const badgeCol  = badge === null ? SLATE : badge < 70 ? AMBER : GREEN;

  return (
    <div style={PANEL}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px 8px", borderBottom: `1px solid ${CYAN}18`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: CYAN, fontSize: 11, letterSpacing: 2 }}>⬡ BRAIN THINK</span>
          {badge !== null && (
            <span style={{
              fontSize: 8, padding: "1px 7px", borderRadius: 10,
              background: `${badgeCol}22`, color: badgeCol,
              border: `1px solid ${badgeCol}44`,
            }}>
              {badge < 70 ? `VAULT ${badge}` : `SCORE ${badge}`}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Btn onClick={assess} busy={assessing} col={VIOLET}>▶ ASSESS</Btn>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "none", border: "none", color: SLATE,
              fontSize: 14, cursor: "pointer", padding: "0 2px", lineHeight: 1,
            }}
          >×</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${CYAN}18` }}>
        <Tile label="VAULT SCORE" val={score !== null ? `${score}` : "—"} col={score !== null && score < 70 ? AMBER : GREEN} />
        <Tile label="ORPHANS" val={orphanCnt} col={orphanCnt > 0 ? AMBER : GREEN} />
        <Tile label="GAP LINKS" val={gapCnt} col={gapCnt > 0 ? AMBER : GREEN} />
        <Tile label="LOW CONF" val={lowCnt} col={lowCnt > 0 ? VIOLET : GREEN} />
      </div>

      {/* tabs */}
      <TabBar tabs={["HEALTH", "CHALLENGE", "PANEL", "CONNECT", "EMERGE"]} active={tab} onSelect={setTab} />

      {/* content */}
      <div style={SCROLL}>
        {tab === "HEALTH"    && <HealthTab health={health} />}
        {tab === "CHALLENGE" && <ChallengeTab />}
        {tab === "PANEL"     && <PanelTab />}
        {tab === "CONNECT"   && <ConnectTab />}
        {tab === "EMERGE"    && <EmergeTab />}
      </div>
    </div>
  );
}

// ── strip button ──────────────────────────────────────────────────────────────

export function BrainThinkWorkbenchBtn({ badgeVal }) {
  const col = badgeVal === null ? SLATE : badgeVal < 70 ? AMBER : GREEN;
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent("jarvis:brtw-toggle"))}
      title="Brain Thinking Workbench (BRTW)"
      style={{
        position: "fixed",
        left: BTN_LEFT,
        bottom: 8,
        zIndex: 181,
        background: "rgba(4,8,14,0.85)",
        border: `1px solid ${col}55`,
        borderRadius: 6,
        color: col,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 8,
        padding: "3px 8px",
        cursor: "pointer",
        letterSpacing: 1,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        whiteSpace: "nowrap",
      }}
    >
      ⬡ BRTW
      {badgeVal !== null && (
        <span style={{
          marginLeft: 4, fontSize: 7, padding: "0 4px",
          background: `${col}22`, borderRadius: 8, color: col,
        }}>
          {badgeVal}
        </span>
      )}
    </button>
  );
}
