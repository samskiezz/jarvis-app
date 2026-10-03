/**
 * F91 — Graph Community × Live Intel Exposure (GCLIVE)
 *
 * Parallel-fetches /v1/graph/communities + /functions/getLiveIntel (quakes/crypto/FX),
 * then keyword-correlates each network cluster against live world events to surface:
 *
 *   ACTIVATED — live world event aligns with this community's domain
 *   QUIET     — no live signal detected in this community's space
 *
 * Stat tiles: clusters / live events / activated / quiet
 * Filter tabs: ALL | ACTIVATED | QUIET + text search
 * Expand any cluster → matched events with SEISMIC/CRYPTO/FX badge + relevance score.
 * Cyan badge on ACTIVATED count.
 * ▶ ASSESS: 2-sentence community-world exposure brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ GCLIVE  at bottom:8 left:63480, zIndex:122.
 * Event:   jarvis:gclive-toggle
 * Voice:   "community live / live community / gclive /
 *           activated community / community world event /
 *           live graph community / network world exposure"
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 63480;
const POLL_MS  = 60_000;
const CYAN     = "#22D3EE";
const SLATE    = "#6E8AA0";
const RED      = "#FF3D5A";
const GREEN    = "#34D399";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const GCLIVE_RE =
  /\b(community\s+live|live\s+community|gclive|graph\s+community\s+live|activated?\s+communit\w*|communit\w*\s+world\s+event[s]?|live\s+graph\s+communit\w*|network\s+world\s+exposure|communit\w*\s+live\s+intel|communit\w*\s+world\s+signal[s]?)\b/i;

export function isGcliveQuery(q) { return GCLIVE_RE.test(q); }

export async function buildGcliveScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [commRes, intelRes] = await Promise.all([
      fetch(`${base}/v1/graph/communities`,     { headers: hdr }),
      fetch(`${base}/functions/getLiveIntel`,   { headers: hdr }),
    ]);
    const communities = normaliseCommunities(await commRes.json());
    const events      = normaliseIntel(await intelRes.json());

    const activated = communities.filter(
      (c) => events.some((ev) => relevance(c, ev) > 0)
    ).length;
    const quiet = communities.length - activated;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS network-world exposure brief: ${communities.length} graph communities ` +
          `correlated against ${events.length} live world signals (seismic/crypto/FX). ` +
          `${activated} communities are ACTIVATED by a current world event; ` +
          `${quiet} remain QUIET with no external signal. ` +
          `Provide a 2-sentence community-world exposure assessment — formal British butler ` +
          `tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Community live-intel exposure analysis complete, sir.").trim();
  } catch {
    return "Community live-intel exposure unavailable at this time, sir.";
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

function tok(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function normaliseIntel(raw) {
  if (!raw) return [];
  const out = [];
  if (raw.earthquakes) {
    for (const e of (Array.isArray(raw.earthquakes) ? raw.earthquakes : [])) {
      const place = e.place || e.location || "";
      const mag   = e.magnitude || e.mag || "";
      out.push({
        type:   "SEISMIC",
        label:  `M${mag} ${place}`.trim(),
        tokens: tok(`${place} earthquake seismic quake tectonic geological`),
      });
    }
  }
  if (raw.crypto) {
    for (const c of (Array.isArray(raw.crypto) ? raw.crypto : [])) {
      const sym = c.symbol || c.name || "";
      out.push({
        type:   "CRYPTO",
        label:  sym,
        tokens: tok(`${sym} crypto bitcoin blockchain digital currency asset finance market`),
      });
    }
  }
  if (raw.fx) {
    for (const f of (Array.isArray(raw.fx) ? raw.fx : [])) {
      const pair = f.pair || f.symbol || f.name || "";
      out.push({
        type:   "FX",
        label:  pair,
        tokens: tok(`${pair} forex currency exchange rate finance market trade`),
      });
    }
  }
  return out;
}

function relevance(community, event) {
  const cw = tok(`${community.label} ${community.members} ${community.summary}`);
  const ev = new Set(event.tokens);
  return cw.filter((w) => ev.has(w)).length;
}

function buildLinked(communities, events) {
  return communities.map((c) => {
    const matched = events
      .map((ev) => ({ ...ev, score: relevance(c, ev) }))
      .filter((ev) => ev.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    return { ...c, events: matched, activated: matched.length > 0 };
  });
}

function typeColor(type) {
  if (type === "SEISMIC") return "#F59E0B";
  if (type === "CRYPTO")  return "#A78BFA";
  if (type === "FX")      return GREEN;
  return SLATE;
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "ACTIVATED", "QUIET"];

export default function GraphCommunityLiveIntelExposure() {
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
      const [commRes, intelRes] = await Promise.all([
        fetch(`${base}/v1/graph/communities`,   { headers: hdr }),
        fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
      ]);
      setCommunities(normaliseCommunities(await commRes.json()));
      setEvents(normaliseIntel(await intelRes.json()));
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
    window.addEventListener("jarvis:gclive-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gclive-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    const text = await buildGcliveScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const linked    = buildLinked(communities, events);
  const activated = linked.filter((c) => c.activated).length;
  const quiet     = linked.length - activated;

  const displayed = linked.filter((c) => {
    if (filter === "ACTIVATED" && !c.activated) return false;
    if (filter === "QUIET"     && c.activated)  return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return c.label.toLowerCase().includes(q) || c.members.toLowerCase().includes(q);
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Graph Community × Live Intel Exposure (GCLIVE)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 122,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${CYAN}55`,
          color: CYAN, padding: "3px 10px", borderRadius: 6,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          cursor: "pointer", backdropFilter: "blur(6px)",
          letterSpacing: 1,
        }}
      >
        {activated > 0
          ? <><span style={{ background: CYAN, color: "#04060A", borderRadius: 4, padding: "0 4px", marginRight: 4, fontWeight: 700 }}>{activated}</span>◈ GCLIVE</>
          : "◈ GCLIVE"
        }
      </button>
    );
  }

  const TILE = { flex: "1 1 100px", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", textAlign: "center" };

  return (
    <div style={{
      position: "fixed", bottom: 52, left: BTN_LEFT - 360, zIndex: 122,
      width: 480, maxHeight: "72vh", display: "flex", flexDirection: "column",
      background: "rgba(6,10,16,0.95)", border: `1px solid ${CYAN}44`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: `0 0 40px ${CYAN}22`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${CYAN}33` }}>
        <span style={{ color: CYAN, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ GCLIVE</span>
        <span style={{ color: SLATE, fontSize: 9, flex: 1 }}>COMMUNITY × LIVE INTEL EXPOSURE</span>
        {lastFetch && <span style={{ color: SLATE, fontSize: 8 }}>{lastFetch.toLocaleTimeString()}</span>}
        {loading && <span style={{ color: CYAN, fontSize: 9 }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{ marginLeft: 4, background: "none", border: "none", color: SLATE, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${CYAN}22` }}>
        {[
          { label: "COMMUNITIES", value: linked.length,  col: "#60A5FA" },
          { label: "LIVE EVENTS", value: events.length,  col: "#A78BFA" },
          { label: "ACTIVATED",   value: activated,      col: CYAN      },
          { label: "QUIET",       value: quiet,          col: SLATE     },
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
          const col   = c.activated ? CYAN : SLATE;
          const label = c.activated ? "ACTIVATED" : "QUIET";
          return (
            <div key={c.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : c.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                  background: isExp ? `${CYAN}11` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${c.activated ? `${CYAN}44` : "#6E8AA033"}`,
                  transition: "background 0.2s",
                }}
              >
                <span style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: 1, padding: "1px 5px",
                  borderRadius: 4, background: `${col}22`, color: col,
                }}>
                  {label}
                </span>
                <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5" }}>{c.label}</span>
                {c.size > 0 && <span style={{ fontSize: 8, color: SLATE }}>{c.size} nodes</span>}
                {c.activated && (
                  <span style={{ fontSize: 8, color: CYAN }}>{c.events.length} signal{c.events.length !== 1 ? "s" : ""}</span>
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
                    <div style={{ fontSize: 9, color: SLATE }}>No live world events currently match this community's domain.</div>
                  ) : (
                    c.events.map((ev, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, padding: "4px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)" }}>
                        <span style={{
                          fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                          background: `${typeColor(ev.type)}22`, color: typeColor(ev.type),
                          letterSpacing: 1,
                        }}>
                          {ev.type}
                        </span>
                        <span style={{ flex: 1, fontSize: 9, color: "#DCEBF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.label}</span>
                        <div style={{ width: 60, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)", flexShrink: 0 }}>
                          <div style={{ height: "100%", borderRadius: 2, background: CYAN, width: `${Math.min(100, ev.score * 20)}%` }} />
                        </div>
                        <span style={{ fontSize: 8, color: CYAN, flexShrink: 0 }}>{ev.score}</span>
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
