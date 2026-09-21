/**
 * F98 — Intel Profile × Ops Event Coverage (IPOEV)
 *
 * Parallel-fetches /entities/IntelProfile + /v1/ops/events, then
 * keyword-correlates each tracked threat actor profile against active
 * operational events to surface:
 *
 *   COVERED   — at least one ops event tracks this profile's threat domain
 *   UNCOVERED — no operational coverage (blind spot — threat actor unmonitored)
 *
 * Stat tiles: profiles / ops events / covered / uncovered
 * Filter tabs: ALL | COVERED | UNCOVERED + text search
 * Expand any profile → matched ops events with severity badge + type badge +
 *   relevance score bar.
 * Amber badge on UNCOVERED count.
 * ▶ ASSESS: 2-sentence threat-ops coverage brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ IPOEV  at bottom:8 left:696960, zIndex:273.
 * Event:   jarvis:ipoev-toggle
 * Voice:   "intel profile ops / ipoev / threat actor ops /
 *           ops coverage intel / profile ops coverage /
 *           uncovered threats / threat ops / threat ops coverage"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 696960;
const POLL_MS  = 90_000;
const AMBER    = "#F59E0B";
const BLUE     = "#60A5FA";
const GREEN    = "#34D399";
const SLATE    = "#6E8AA0";
const RED      = "#F87171";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const IPOEV_RE =
  /\b(intel\s+profile\s+ops|ipoev|threat\s+actor\s+ops|ops\s+coverage\s+intel|profile\s+ops\s+coverage|uncovered\s+threat[s]?|threat\s+ops|threat\s+ops\s+coverage|ops\s+intel\s+profile|intel\s+ops\s+coverage)\b/i;

export function isIpoevQuery(q) { return IPOEV_RE.test(q); }

export async function buildIpoevScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [ipRes, oeRes] = await Promise.all([
      fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
      fetch(`${base}/v1/ops/events`,         { headers: hdr }),
    ]);
    const profiles   = normaliseProfiles(await ipRes.json());
    const opsEvents  = normaliseOpsEvents(await oeRes.json());

    const covered   = profiles.filter(
      (p) => opsEvents.some((e) => relevance(p, e) > 0)
    ).length;
    const uncovered = profiles.length - covered;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS threat-ops coverage brief: ${profiles.length} tracked intel profiles ` +
          `correlated against ${opsEvents.length} active ops events. ` +
          `${covered} profiles are COVERED (at least one operational event monitors their ` +
          `threat domain); ${uncovered} profiles are UNCOVERED ` +
          `(no ops event tracking these threat actors — operational blind spot). ` +
          `Provide a 2-sentence threat-ops coverage assessment — formal ` +
          `British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Threat-ops coverage analysis complete, sir.").trim();
  } catch {
    return "Threat-ops coverage unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseProfiles(raw) {
  const arr = Array.isArray(raw)                    ? raw
    : Array.isArray(raw?.intel_profiles)            ? raw.intel_profiles
    : Array.isArray(raw?.profiles)                  ? raw.profiles
    : Array.isArray(raw?.items)                     ? raw.items
    : Array.isArray(raw?.data)                      ? raw.data
    : Array.isArray(raw?.results)                   ? raw.results
    : [];
  return arr.map((p, i) => ({
    id:          p.id          || String(i),
    label:       p.name        || p.title       || p.subject    || `Profile ${i + 1}`,
    category:    (p.category   || p.type        || p.kind       || "UNKNOWN").toString().toUpperCase(),
    nationality: p.nationality || p.country     || "",
    tokens: tok(
      `${p.name        || ""} ${p.subject      || ""} ${p.description || ""} ` +
      `${p.category    || ""} ${p.nationality  || ""} ` +
      `${Array.isArray(p.aliases) ? p.aliases.join(" ") : p.aliases || ""} ` +
      `${Array.isArray(p.tags)    ? p.tags.join(" ")    : p.tags    || ""}`
    ),
  }));
}

function normaliseOpsEvents(raw) {
  const arr = Array.isArray(raw)               ? raw
    : Array.isArray(raw?.events)               ? raw.events
    : Array.isArray(raw?.ops_events)           ? raw.ops_events
    : Array.isArray(raw?.items)                ? raw.items
    : Array.isArray(raw?.data)                 ? raw.data
    : Array.isArray(raw?.results)              ? raw.results
    : [];
  return arr.map((e, i) => ({
    id:       e.id          || String(i),
    label:    e.name        || e.title       || e.event_type  || `Event ${i + 1}`,
    type:     (e.type       || e.kind        || e.category    || "EVENT").toString().toUpperCase(),
    severity: (e.severity   || e.priority    || "INFO").toString().toUpperCase(),
    tokens: tok(
      `${e.name        || ""} ${e.title       || ""} ${e.type        || ""} ` +
      `${e.description || ""} ${e.category    || ""} ` +
      `${Array.isArray(e.tags) ? e.tags.join(" ") : e.tags || ""}`
    ),
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

function relevance(profile, event) {
  const pw = new Set(profile.tokens);
  return event.tokens.filter((w) => pw.has(w)).length;
}

function sevColor(sev) {
  if (sev.includes("CRITICAL") || sev.includes("CRIT")) return RED;
  if (sev.includes("HIGH"))                              return "#F97316";
  if (sev.includes("WARN") || sev.includes("MED"))      return AMBER;
  return SLATE;
}

function catColor(cat) {
  if (cat.includes("APT") || cat.includes("NATION"))  return RED;
  if (cat.includes("CRIME") || cat.includes("CYBER"))  return "#F97316";
  if (cat.includes("INSIDER"))                         return AMBER;
  return BLUE;
}

function buildLinked(profiles, opsEvents) {
  return profiles.map((p) => {
    const matched = opsEvents
      .map((e) => ({ ...e, score: relevance(p, e) }))
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    return { ...p, opsEvents: matched, covered: matched.length > 0 };
  });
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "COVERED", "UNCOVERED"];

export default function IntelProfileOpsEventCoverage() {
  const [open,       setOpen]       = useState(false);
  const [profiles,   setProfiles]   = useState([]);
  const [opsEvents,  setOpsEvents]  = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [filter,     setFilter]     = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const [lastFetch,  setLastFetch]  = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [ipRes, oeRes] = await Promise.all([
        fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
        fetch(`${base}/v1/ops/events`,         { headers: hdr }),
      ]);
      setProfiles(normaliseProfiles(await ipRes.json()));
      setOpsEvents(normaliseOpsEvents(await oeRes.json()));
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
    window.addEventListener("jarvis:ipoev-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ipoev-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    const text = await buildIpoevScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const linked    = buildLinked(profiles, opsEvents);
  const covered   = linked.filter((p) => p.covered).length;
  const uncovered = linked.length - covered;

  const displayed = linked.filter((p) => {
    if (filter === "COVERED"   && !p.covered) return false;
    if (filter === "UNCOVERED" && p.covered)  return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return p.label.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Intel Profile × Ops Event Coverage (IPOEV)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 273,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${AMBER}55`,
          color: AMBER, padding: "3px 10px", borderRadius: 6,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          cursor: "pointer", backdropFilter: "blur(6px)",
          letterSpacing: 1,
        }}
      >
        {uncovered > 0
          ? <><span style={{ background: AMBER, color: "#04060A", borderRadius: 4, padding: "0 4px", marginRight: 4, fontWeight: 700 }}>{uncovered}</span>◈ IPOEV</>
          : "◈ IPOEV"
        }
      </button>
    );
  }

  const TILE = { flex: "1 1 100px", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", textAlign: "center" };

  return (
    <div style={{
      position: "fixed", bottom: 52, left: BTN_LEFT - 360, zIndex: 273,
      width: 480, maxHeight: "72vh", display: "flex", flexDirection: "column",
      background: "rgba(6,10,16,0.95)", border: `1px solid ${AMBER}44`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: `0 0 40px ${AMBER}22`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${AMBER}33` }}>
        <span style={{ color: AMBER, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ IPOEV</span>
        <span style={{ color: SLATE, fontSize: 9, flex: 1 }}>INTEL PROFILE × OPS EVENT COVERAGE</span>
        {lastFetch && <span style={{ color: SLATE, fontSize: 8 }}>{lastFetch.toLocaleTimeString()}</span>}
        {loading && <span style={{ color: AMBER, fontSize: 9 }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{ marginLeft: 4, background: "none", border: "none", color: SLATE, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${AMBER}22` }}>
        {[
          { label: "PROFILES",   value: linked.length,    col: BLUE  },
          { label: "OPS EVENTS", value: opsEvents.length, col: "#A78BFA" },
          { label: "COVERED",    value: covered,          col: GREEN },
          { label: "UNCOVERED",  value: uncovered,        col: AMBER },
        ].map(({ label, value, col }) => (
          <div key={label} style={TILE}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{value}</div>
            <div style={{ color: SLATE, fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${AMBER}22`, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? `${AMBER}22` : "none",
            border: `1px solid ${filter === t ? AMBER : SLATE}`,
            color: filter === t ? AMBER : SLATE,
            borderRadius: 5, padding: "2px 8px", fontSize: 9,
            cursor: "pointer", letterSpacing: 1,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="search profiles…"
          style={{
            flex: 1, minWidth: 100, background: "rgba(255,255,255,0.04)",
            border: "1px solid #6E8AA044", borderRadius: 5, padding: "2px 8px",
            color: "#DCEBF5", fontSize: 9, outline: "none",
          }}
        />
        <button onClick={assess} disabled={assessing} style={{
          background: "none", border: `1px solid ${AMBER}`,
          color: AMBER, borderRadius: 5, padding: "2px 8px",
          fontSize: 9, cursor: "pointer", letterSpacing: 1,
        }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>

      {/* profile list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
        {displayed.length === 0 && !loading && (
          <div style={{ color: SLATE, fontSize: 10, textAlign: "center", padding: 20 }}>
            No profiles match the current filter.
          </div>
        )}
        {displayed.map((p) => {
          const isExp = expanded === p.id;
          const col   = p.covered ? GREEN : AMBER;
          const badge = p.covered ? "COVERED" : "UNCOVERED";
          return (
            <div key={p.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : p.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                  background: isExp ? `${AMBER}11` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${p.covered ? `${GREEN}44` : `${AMBER}44`}`,
                  transition: "background 0.2s",
                }}
              >
                <span style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: 1, padding: "1px 5px",
                  borderRadius: 4, background: `${col}22`, color: col,
                }}>
                  {badge}
                </span>
                <span style={{ flex: 1, fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.label}
                </span>
                <span style={{
                  fontSize: 8, padding: "1px 5px", borderRadius: 4,
                  background: `${catColor(p.category)}22`, color: catColor(p.category), letterSpacing: 1,
                }}>
                  {p.category}
                </span>
                {p.nationality && (
                  <span style={{ fontSize: 8, color: SLATE }}>{p.nationality}</span>
                )}
                <span style={{ color: SLATE, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: "0 0 7px 7px", marginTop: -1 }}>
                  {p.opsEvents.length === 0 ? (
                    <div style={{ color: AMBER, fontSize: 9, padding: "6px 0" }}>
                      ⚠ No operational events monitoring this threat actor's domain.
                    </div>
                  ) : (
                    p.opsEvents.map((e) => (
                      <div key={e.id} style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span style={{
                            fontSize: 8, padding: "1px 5px", borderRadius: 4,
                            background: `${sevColor(e.severity)}22`, color: sevColor(e.severity), letterSpacing: 1, fontWeight: 700,
                          }}>
                            {e.severity}
                          </span>
                          <span style={{
                            fontSize: 8, padding: "1px 5px", borderRadius: 4,
                            background: "rgba(255,255,255,0.06)", color: SLATE, letterSpacing: 1,
                          }}>
                            {e.type}
                          </span>
                          <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {e.label}
                          </span>
                          <span style={{ fontSize: 8, color: SLATE }}>score:{e.score}</span>
                        </div>
                        <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                          <div style={{
                            height: "100%", borderRadius: 2,
                            width: `${Math.min(100, e.score * 12)}%`,
                            background: `linear-gradient(90deg, ${AMBER}, ${GREEN})`,
                          }} />
                        </div>
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
