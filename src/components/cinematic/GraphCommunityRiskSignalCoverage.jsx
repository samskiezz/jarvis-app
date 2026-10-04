/**
 * F93 — Graph Community × Risk Signal Coverage (GCRSK)
 *
 * Parallel-fetches /v1/graph/communities + /entities/RiskSignal,
 * then keyword-correlates each network cluster against active risk signals
 * to surface:
 *
 *   EXPOSED — at least one risk signal aligns with this community's domain
 *   CLEAR   — no active risk signal threatens this community
 *
 * Stat tiles: communities / signals / exposed / clear
 * Filter tabs: ALL | EXPOSED | CLEAR + text search
 * Expand any cluster → matched risk signals with severity badge + relevance score.
 * Red badge on EXPOSED count.
 * ▶ ASSESS: 2-sentence community-risk brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ GCRSK  at bottom:8 left:694720, zIndex:269.
 * Event:   jarvis:gcrsk-toggle
 * Voice:   "community risk / risk community / gcrsk /
 *           exposed community / community risk signal /
 *           which communities have risks / community threat signal"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 694720;
const POLL_MS  = 90_000;
const RED      = "#F43F5E";
const SLATE    = "#6E8AA0";
const BLUE     = "#60A5FA";
const VIOLET   = "#A78BFA";
const GREEN    = "#34D399";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const GCRSK_RE =
  /\b(communit\w*\s+risk[s]?|risk[s]?\s+communit\w*|gcrsk|exposed\s+communit\w*|communit\w*\s+risk\s+signal[s]?|which\s+communities\s+have\s+risks?|communit\w*\s+threat\s+signal[s]?|risk\s+exposed\s+communit\w*|communit\w*\s+risk\s+coverage|network\s+risk\s+signal[s]?)\b/i;

export function isGcrskQuery(q) { return GCRSK_RE.test(q); }

export async function buildGcrskScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [commRes, rskRes] = await Promise.all([
      fetch(`${base}/v1/graph/communities`, { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`,  { headers: hdr }),
    ]);
    const communities = normaliseCommunities(await commRes.json());
    const signals     = normaliseSignals(await rskRes.json());

    const exposed = communities.filter(
      (c) => signals.some((s) => relevance(c, s) > 0)
    ).length;
    const clear   = communities.length - exposed;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS community risk signal brief: ${communities.length} graph communities ` +
          `correlated against ${signals.length} active risk signals. ` +
          `${exposed} communities are EXPOSED (at least one risk signal aligns with their domain); ` +
          `${clear} communities remain CLEAR (no active risk signal threatens their space). ` +
          `Provide a 2-sentence community-risk coverage assessment — formal British butler ` +
          `tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Community risk signal coverage analysis complete, sir.").trim();
  } catch {
    return "Community risk signal coverage unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseCommunities(raw) {
  const arr = Array.isArray(raw)                ? raw
    : Array.isArray(raw?.communities)           ? raw.communities
    : Array.isArray(raw?.clusters)              ? raw.clusters
    : Array.isArray(raw?.data)                  ? raw.data
    : Array.isArray(raw?.results)               ? raw.results
    : Array.isArray(raw?.items)                 ? raw.items
    : [];
  return arr.map((c, i) => ({
    id:      c.id        || c.community_id  || String(i),
    label:   c.label     || c.name          || c.title     || `Community ${i + 1}`,
    members: Array.isArray(c.members) ? c.members.join(" ") : (c.members || ""),
    summary: (c.summary  || c.description   || c.notes     || "").toString().slice(0, 300),
    size:    c.size      || (Array.isArray(c.members) ? c.members.length : 0) || 0,
  }));
}

function normaliseSignals(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.results)            ? raw.results
    : Array.isArray(raw?.risk_signals)       ? raw.risk_signals
    : [];
  return arr.map((s, i) => ({
    id:       s.id       || String(i),
    label:    s.name     || s.title      || s.signal    || `Signal ${i + 1}`,
    severity: (s.severity || s.level     || s.priority  || "MEDIUM").toString().toUpperCase(),
    category: s.category || s.type       || s.kind      || "RISK",
    tokens:   tok(`${s.name || ""} ${s.title || ""} ${s.description || ""} ${s.category || ""} ${s.sector || ""} ${s.source || ""} ${(s.tags || []).join(" ")}`),
  }));
}

function tok(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function relevance(community, signal) {
  const cw = tok(`${community.label} ${community.members} ${community.summary}`);
  const sv = new Set(signal.tokens);
  return cw.filter((w) => sv.has(w)).length;
}

function severityColor(sev) {
  if (sev === "CRITICAL") return "#F43F5E";
  if (sev === "HIGH")     return "#F97316";
  if (sev === "MEDIUM")   return "#F59E0B";
  return "#6E8AA0";
}

function buildLinked(communities, signals) {
  return communities.map((c) => {
    const matched = signals
      .map((s) => ({ ...s, score: relevance(c, s) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    return { ...c, signals: matched, exposed: matched.length > 0 };
  });
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "EXPOSED", "CLEAR"];

export default function GraphCommunityRiskSignalCoverage() {
  const [open,        setOpen]        = useState(false);
  const [communities, setCommunities] = useState([]);
  const [signals,     setSignals]     = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [filter,      setFilter]      = useState("ALL");
  const [search,      setSearch]      = useState("");
  const [expanded,    setExpanded]    = useState(null);
  const [assessing,   setAssessing]   = useState(false);
  const [lastFetch,   setLastFetch]   = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [commRes, rskRes] = await Promise.all([
        fetch(`${base}/v1/graph/communities`, { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`,  { headers: hdr }),
      ]);
      setCommunities(normaliseCommunities(await commRes.json()));
      setSignals(normaliseSignals(await rskRes.json()));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const onToggle = () => {
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    };
    window.addEventListener("jarvis:gcrsk-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gcrsk-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    const text = await buildGcrskScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const linked  = buildLinked(communities, signals);
  const exposed = linked.filter((c) => c.exposed).length;
  const clear   = linked.length - exposed;

  const displayed = linked.filter((c) => {
    if (filter === "EXPOSED" && !c.exposed) return false;
    if (filter === "CLEAR"   && c.exposed)  return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return c.label.toLowerCase().includes(q) || c.members.toLowerCase().includes(q);
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Graph Community × Risk Signal Coverage (GCRSK)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 269,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${RED}55`,
          color: RED, padding: "3px 10px", borderRadius: 6,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          cursor: "pointer", backdropFilter: "blur(6px)",
          letterSpacing: 1,
        }}
      >
        {exposed > 0
          ? <><span style={{ background: RED, color: "#04060A", borderRadius: 4, padding: "0 4px", marginRight: 4, fontWeight: 700 }}>{exposed}</span>◈ GCRSK</>
          : "◈ GCRSK"
        }
      </button>
    );
  }

  const TILE = { flex: "1 1 100px", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", textAlign: "center" };

  return (
    <div style={{
      position: "fixed", bottom: 52, left: BTN_LEFT - 360, zIndex: 269,
      width: 480, maxHeight: "72vh", display: "flex", flexDirection: "column",
      background: "rgba(6,10,16,0.95)", border: `1px solid ${RED}44`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: `0 0 40px ${RED}22`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${RED}33` }}>
        <span style={{ color: RED, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ GCRSK</span>
        <span style={{ color: SLATE, fontSize: 9, flex: 1 }}>COMMUNITY × RISK SIGNAL COVERAGE</span>
        {lastFetch && <span style={{ color: SLATE, fontSize: 8 }}>{lastFetch.toLocaleTimeString()}</span>}
        {loading && <span style={{ color: RED, fontSize: 9 }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{ marginLeft: 4, background: "none", border: "none", color: SLATE, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${RED}22` }}>
        {[
          { label: "COMMUNITIES", value: linked.length,  col: BLUE   },
          { label: "SIGNALS",     value: signals.length, col: VIOLET },
          { label: "EXPOSED",     value: exposed,        col: RED    },
          { label: "CLEAR",       value: clear,          col: GREEN  },
        ].map(({ label, value, col }) => (
          <div key={label} style={TILE}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{value}</div>
            <div style={{ color: SLATE, fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${RED}22`, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? `${RED}22` : "none",
            border: `1px solid ${filter === t ? RED : SLATE}`,
            color: filter === t ? RED : SLATE,
            borderRadius: 5, padding: "2px 8px", fontSize: 9,
            cursor: "pointer", letterSpacing: 1,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="search communities…"
          style={{
            flex: 1, minWidth: 100, background: "rgba(255,255,255,0.04)",
            border: "1px solid #6E8AA044", borderRadius: 5, padding: "2px 8px",
            color: "#DCEBF5", fontSize: 9, outline: "none",
          }}
        />
        <button onClick={assess} disabled={assessing} style={{
          background: "none", border: `1px solid ${RED}`,
          color: RED, borderRadius: 5, padding: "2px 8px",
          fontSize: 9, cursor: "pointer", letterSpacing: 1,
        }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>

      {/* community list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
        {displayed.length === 0 && !loading && (
          <div style={{ color: SLATE, fontSize: 10, textAlign: "center", padding: 20 }}>
            No communities match the current filter.
          </div>
        )}
        {displayed.map((c) => {
          const isExp = expanded === c.id;
          const col   = c.exposed ? RED : GREEN;
          const badge = c.exposed ? "EXPOSED" : "CLEAR";
          return (
            <div key={c.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : c.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                  background: isExp ? `${RED}11` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${c.exposed ? `${RED}44` : "#34D39944"}`,
                  transition: "background 0.2s",
                }}
              >
                <span style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: 1, padding: "1px 5px",
                  borderRadius: 4, background: `${col}22`, color: col,
                }}>
                  {badge}
                </span>
                <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5" }}>{c.label}</span>
                {c.size > 0 && <span style={{ fontSize: 8, color: SLATE }}>{c.size} nodes</span>}
                {c.exposed && (
                  <span style={{ fontSize: 8, color: RED }}>{c.signals.length} signal{c.signals.length !== 1 ? "s" : ""}</span>
                )}
                <span style={{ color: SLATE, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ margin: "4px 0 4px 12px", padding: "8px 10px", borderRadius: 7, background: "rgba(255,255,255,0.02)", border: `1px solid ${RED}22` }}>
                  {c.summary && (
                    <div style={{ fontSize: 9, color: SLATE, marginBottom: 6 }}>
                      {c.summary.slice(0, 120)}
                    </div>
                  )}
                  {c.signals.length === 0 ? (
                    <div style={{ fontSize: 9, color: GREEN }}>No active risk signals currently threaten this community's domain.</div>
                  ) : (
                    c.signals.map((s, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, padding: "4px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)" }}>
                        <span style={{
                          fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                          background: `${severityColor(s.severity)}22`, color: severityColor(s.severity),
                          letterSpacing: 1, flexShrink: 0,
                        }}>
                          {s.severity.slice(0, 4)}
                        </span>
                        <span style={{ flex: 1, fontSize: 9, color: "#DCEBF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
                        <div style={{ width: 60, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)", flexShrink: 0 }}>
                          <div style={{ height: "100%", borderRadius: 2, background: RED, width: `${Math.min(100, s.score * 20)}%` }} />
                        </div>
                        <span style={{ fontSize: 8, color: RED, flexShrink: 0 }}>{s.score}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
