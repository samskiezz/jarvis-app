/**
 * F109 — Graph Community × Ops Event Coverage (GCOPS)
 *
 * Parallel-fetches /v1/graph/communities + /v1/ops/events,
 * then keyword-correlates each network cluster against active ops events
 * to surface:
 *
 *   ACTIVE — at least one ops event domain overlaps this community
 *   QUIET  — no ops event coverage (operational blind spot)
 *
 * Stat tiles: communities / ops events / active / quiet
 * Filter tabs: ALL | ACTIVE | QUIET + text search
 * Expand any cluster → matched ops events with severity + type badge + relevance score.
 * Cyan badge on ACTIVE count.
 * ▶ ASSESS: 2-sentence community-ops coverage brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ GCOPS  at bottom:8 left:700880, zIndex:280.
 * Event:   jarvis:gcops-toggle
 * Voice:   "community ops / ops community / gcops /
 *           active ops community / community ops event /
 *           ops event community / community operational /
 *           which communities have ops events /
 *           operationally active communities /
 *           community ops coverage / network ops coverage"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 700880;
const POLL_MS  = 90_000;
const CYAN     = "#22D3EE";
const AMBER    = "#F59E0B";
const SLATE    = "#6E8AA0";
const BLUE     = "#60A5FA";
const GREEN    = "#34D399";
const RED      = "#F43F5E";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const GCOPS_RE =
  /\b(communit\w*\s+ops(\s+event[s]?)?|ops\s+communit\w*|gcops|active\s+ops\s+communit\w*|communit\w*\s+ops\s+(event[s]?|coverage)|ops\s+event[s]?\s+communit\w*|communit\w*\s+operational|which\s+communities\s+have\s+ops(\s+event[s]?)?|operationally\s+active\s+communit\w*|communit\w*\s+ops\s+coverage|network\s+ops\s+(coverage|event[s]?)?)\b/i;

export function isGcopsQuery(q) { return GCOPS_RE.test(q); }

export async function buildGcopsScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [commRes, opsRes] = await Promise.all([
      fetch(`${base}/v1/graph/communities`, { headers: hdr }),
      fetch(`${base}/v1/ops/events`,        { headers: hdr }),
    ]);
    const communities = normaliseCommunities(await commRes.json());
    const events      = normaliseEvents(await opsRes.json());

    const active = communities.filter(
      (c) => events.some((e) => relevance(c, e) > 0)
    ).length;
    const quiet  = communities.length - active;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS community ops coverage brief: ${communities.length} graph communities ` +
          `correlated against ${events.length} active ops events. ` +
          `${active} communities have at least one ops event aligning with their domain (ACTIVE); ` +
          `${quiet} communities have no ops event coverage (QUIET — operational blind spot). ` +
          `Provide a 2-sentence community-operational coverage assessment — formal British butler ` +
          `tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Community operational coverage analysis complete, sir.").trim();
  } catch {
    return "Community operational coverage unavailable at this time, sir.";
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

function normaliseEvents(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.events)             ? raw.events
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.results)            ? raw.results
    : [];
  return arr.map((e, i) => ({
    id:       e.id       || String(i),
    label:    e.name     || e.title     || e.event_name  || `Event ${i + 1}`,
    type:     (e.type    || e.kind      || e.category    || "OPS").toString().toUpperCase(),
    severity: (e.severity || e.level   || e.priority     || "INFO").toString().toUpperCase(),
    tokens: tok(`${e.name || ""} ${e.title || ""} ${e.description || ""} ${e.category || ""} ${e.type || ""} ${e.kind || ""} ${(e.tags || []).join(" ")}`),
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

function relevance(community, event) {
  const cw = tok(`${community.label} ${community.members} ${community.summary}`);
  const ev = new Set(event.tokens);
  return cw.filter((w) => ev.has(w)).length;
}

function severityColor(sev) {
  if (sev === "CRITICAL" || sev === "HIGH")   return RED;
  if (sev === "WARNING"  || sev === "MEDIUM") return AMBER;
  if (sev === "INFO"     || sev === "LOW")    return BLUE;
  return SLATE;
}

function buildLinked(communities, events) {
  return communities.map((c) => {
    const matched = events
      .map((e) => ({ ...e, score: relevance(c, e) }))
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    return { ...c, events: matched, active: matched.length > 0 };
  });
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "ACTIVE", "QUIET"];

export default function GraphCommunityOpsEventCoverage() {
  const [open,        setOpen]        = useState(false);
  const [communities, setCommunities] = useState([]);
  const [events,      setEvents]      = useState([]);
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
      const [commRes, opsRes] = await Promise.all([
        fetch(`${base}/v1/graph/communities`, { headers: hdr }),
        fetch(`${base}/v1/ops/events`,        { headers: hdr }),
      ]);
      setCommunities(normaliseCommunities(await commRes.json()));
      setEvents(normaliseEvents(await opsRes.json()));
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
    window.addEventListener("jarvis:gcops-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gcops-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    const text = await buildGcopsScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const linked = buildLinked(communities, events);
  const active = linked.filter((c) => c.active).length;
  const quiet  = linked.length - active;

  const displayed = linked.filter((c) => {
    if (filter === "ACTIVE" && !c.active) return false;
    if (filter === "QUIET"  &&  c.active) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return c.label.toLowerCase().includes(q) || c.members.toLowerCase().includes(q);
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Graph Community × Ops Event Coverage (GCOPS)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 280,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${CYAN}55`,
          color: CYAN, padding: "3px 10px", borderRadius: 6,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          cursor: "pointer", backdropFilter: "blur(6px)",
          letterSpacing: 1,
        }}
      >
        {active > 0
          ? <><span style={{ background: CYAN, color: "#04060A", borderRadius: 4, padding: "0 4px", marginRight: 4, fontWeight: 700 }}>{active}</span>◈ GCOPS</>
          : "◈ GCOPS"
        }
      </button>
    );
  }

  const TILE = { flex: "1 1 100px", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", textAlign: "center" };

  return (
    <div style={{
      position: "fixed", bottom: 52, left: BTN_LEFT - 360, zIndex: 280,
      width: 480, maxHeight: "72vh", display: "flex", flexDirection: "column",
      background: "rgba(6,10,16,0.95)", border: `1px solid ${CYAN}44`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: `0 0 40px ${CYAN}22`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${CYAN}33` }}>
        <span style={{ color: CYAN, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ GCOPS</span>
        <span style={{ color: SLATE, fontSize: 9, flex: 1 }}>COMMUNITY × OPS EVENT COVERAGE</span>
        {lastFetch && <span style={{ color: SLATE, fontSize: 8 }}>{lastFetch.toLocaleTimeString()}</span>}
        {loading && <span style={{ color: CYAN, fontSize: 9 }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{ marginLeft: 4, background: "none", border: "none", color: SLATE, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${CYAN}22` }}>
        {[
          { label: "COMMUNITIES", value: linked.length,  col: BLUE  },
          { label: "OPS EVENTS",  value: events.length,  col: AMBER },
          { label: "ACTIVE",      value: active,          col: CYAN  },
          { label: "QUIET",       value: quiet,           col: quiet > 0 ? AMBER : GREEN },
        ].map(({ label, value, col }) => (
          <div key={label} style={TILE}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{value}</div>
            <div style={{ color: SLATE, fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${CYAN}22`, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? `${CYAN}22` : "none",
            border: `1px solid ${filter === t ? CYAN : SLATE}`,
            color: filter === t ? CYAN : SLATE,
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
          background: "none", border: `1px solid ${CYAN}`,
          color: CYAN, borderRadius: 5, padding: "2px 8px",
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
          const col   = c.active ? CYAN : SLATE;
          const badge = c.active ? "ACTIVE" : "QUIET";
          return (
            <div key={c.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : c.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                  background: isExp ? `${CYAN}11` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${c.active ? `${CYAN}44` : `${SLATE}33`}`,
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
                {c.active && (
                  <span style={{ fontSize: 8, color: CYAN }}>{c.events.length} event{c.events.length !== 1 ? "s" : ""}</span>
                )}
                <span style={{ color: SLATE, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ margin: "4px 0 4px 12px", padding: "8px 10px", borderRadius: 7, background: "rgba(255,255,255,0.02)", border: `1px solid ${CYAN}22` }}>
                  {c.summary && (
                    <div style={{ fontSize: 9, color: SLATE, marginBottom: 6 }}>
                      {c.summary.slice(0, 120)}
                    </div>
                  )}
                  {c.events.length === 0 ? (
                    <div style={{ fontSize: 9, color: AMBER }}>⚠ No ops event currently covers this community's domain — operational blind spot.</div>
                  ) : (
                    c.events.map((e, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, padding: "4px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)" }}>
                        <span style={{
                          fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                          background: `${severityColor(e.severity)}22`, color: severityColor(e.severity),
                          letterSpacing: 1, flexShrink: 0,
                        }}>
                          {e.severity.slice(0, 4)}
                        </span>
                        <span style={{ flex: 1, fontSize: 9, color: "#DCEBF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.label}</span>
                        <span style={{
                          fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                          background: "rgba(96,165,250,0.15)", color: BLUE,
                          flexShrink: 0, letterSpacing: 1,
                        }}>
                          {e.type.slice(0, 5)}
                        </span>
                        <div style={{ width: 60, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)", flexShrink: 0 }}>
                          <div style={{ height: "100%", borderRadius: 2, background: CYAN, width: `${Math.min(100, e.score * 20)}%` }} />
                        </div>
                        <span style={{ fontSize: 8, color: CYAN, flexShrink: 0 }}>{e.score}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ padding: "6px 14px", borderTop: `1px solid ${CYAN}22`, color: SLATE, fontSize: 8, display: "flex", justifyContent: "space-between" }}>
        <span>{displayed.length} of {linked.length} communities · {events.length} ops events indexed</span>
        <span>auto-refresh 90s</span>
      </div>
    </div>
  );
}
