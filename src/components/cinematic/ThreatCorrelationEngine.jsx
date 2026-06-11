/**
 * ThreatCorrelationEngine — F48
 * Parallel-fetches /entities/RiskSignal + /entities/IntelProfile,
 * correlates them by shared keywords/tags/types, then pipes the
 * matched pairs to /v1/jarvis/agent/chat for AI-generated threat
 * correlation analysis + TTS narration.
 *
 * "JARVIS, correlate threats" | "threat correlation" | "correlate risks" opens panel.
 * Additive only — mounted via App.jsx; intent exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const RED  = "#FF4D6D";
const YLW  = "#FFD700";
const GRN  = "#00E5A0";
const PURP = "#b18cff";
const POLL = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CORR_RE =
  /\b(correlat|threat.corr|risk.corr|link.risk|connect.risk|match.risk|cross.ref|nexus|threat.link)\b/i;

export function isThreatCorrelationQuery(t) {
  return CORR_RE.test(t || "");
}

/* ── data fetchers ─────────────────────────────────────────────────────────── */
async function fetchRisks() {
  const r = await fetch(`${apiBase()}/entities/RiskSignal`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.data)    ? d.data
    : Array.isArray(d?.items)   ? d.items
    : Array.isArray(d?.results) ? d.results
    : [];
}

async function fetchProfiles() {
  const r = await fetch(`${apiBase()}/entities/IntelProfile`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.data)    ? d.data
    : Array.isArray(d?.items)   ? d.items
    : Array.isArray(d?.results) ? d.results
    : [];
}

/* ── correlation logic ─────────────────────────────────────────────────────── */
function extractTokens(obj) {
  const raw = [
    obj?.name, obj?.type, obj?.category, obj?.subtype, obj?.source,
    obj?.location, obj?.region, obj?.country, obj?.threat_type,
    ...(Array.isArray(obj?.tags) ? obj.tags : []),
    ...(Array.isArray(obj?.categories) ? obj.categories : []),
    ...(Array.isArray(obj?.subjects) ? obj.subjects : []),
  ].filter(Boolean).join(" ").toLowerCase();
  return new Set(raw.split(/[\s,;:|/\\-]+/).filter((w) => w.length > 3));
}

function correlate(risks, profiles) {
  const pairs = [];
  for (const risk of risks) {
    const rt = extractTokens(risk);
    for (const prof of profiles) {
      const pt = extractTokens(prof);
      const shared = [...rt].filter((w) => pt.has(w));
      if (shared.length >= 1) {
        pairs.push({ risk, profile: prof, shared, score: shared.length });
      }
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  return pairs.slice(0, 20);
}

/* ── TTS / JarvisBrain hook ────────────────────────────────────────────────── */
export async function buildThreatCorrelationScript() {
  const [risks, profiles] = await Promise.all([fetchRisks(), fetchProfiles()]);
  const pairs = correlate(risks, profiles);
  if (!pairs.length) {
    return "No threat correlations detected at this time, sir. Risk signals and intelligence profiles share no common vectors currently.";
  }
  const top = pairs.slice(0, 3)
    .map((p) => `${p.risk?.name || "Unknown risk"} ↔ ${p.profile?.name || "Unknown entity"} (shared: ${p.shared.slice(0, 2).join(", ")})`)
    .join("; ");
  const prompt = `You are JARVIS. Briefly narrate (3 sentences, British butler tone) these threat correlations between risk signals and intelligence profiles: ${top}. Total correlated pairs: ${pairs.length} from ${risks.length} risks and ${profiles.length} profiles.`;
  try {
    const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ message: prompt }),
    });
    const d = await r.json();
    return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
      `Sir, I have identified ${pairs.length} threat correlations linking your risk signals to intelligence profiles. The highest-confidence link is ${pairs[0].risk?.name || "an unknown risk"} correlated with ${pairs[0].profile?.name || "an unknown entity"}.`;
  } catch (_) {
    return `Threat correlation analysis complete, sir. ${pairs.length} cross-links detected across ${risks.length} risk signals and ${profiles.length} intelligence profiles.`;
  }
}

/* ── helpers ───────────────────────────────────────────────────────────────── */
const SEV_COLOR = (s) => {
  if (!s) return CY;
  const lc = s.toLowerCase();
  if (lc === "critical") return RED;
  if (lc === "high")     return YLW;
  if (lc === "medium")   return "#FFA040";
  return GRN;
};

const CLASS_COLOR = (c) => {
  const lc = (c || "").toUpperCase();
  if (lc === "TS") return RED;
  if (lc === "S")  return YLW;
  if (lc === "C")  return PURP;
  return CY;
};

/* ── component ─────────────────────────────────────────────────────────────── */
export default function ThreatCorrelationEngine() {
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [pairs, setPairs]       = useState([]);
  const [risks, setRisks]       = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [aiText, setAiText]     = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([fetchRisks(), fetchProfiles()]);
      setRisks(r);
      setProfiles(p);
      setPairs(correlate(r, p));
    } catch (_) {}
    setLoading(false);
  }, []);

  const loadAI = useCallback(async (localPairs, localRisks, localProfiles) => {
    if (!localPairs.length) return;
    setAiLoading(true);
    setAiText("");
    try {
      const top = localPairs.slice(0, 5)
        .map((p) => `${p.risk?.name || "?"} ↔ ${p.profile?.name || "?"} (${p.shared.slice(0, 3).join(", ")})`)
        .join("; ");
      const prompt = `You are JARVIS. Provide a concise 3-sentence threat correlation analysis (British butler tone) for these linked risk signals and intelligence profiles: ${top}. There are ${localPairs.length} total correlations from ${localRisks.length} risks and ${localProfiles.length} profiles.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      setAiText((d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim());
    } catch (_) {}
    setAiLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    load().then(() => {});
    pollRef.current = setInterval(() => load(), POLL);
    return () => clearInterval(pollRef.current);
  }, [open, load]);

  useEffect(() => {
    if (pairs.length && open) loadAI(pairs, risks, profiles);
  }, [pairs, open, loadAI, risks, profiles]);

  useEffect(() => {
    const toggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:correlation-toggle", toggle);
    return () => window.removeEventListener("jarvis:correlation-toggle", toggle);
  }, []);

  const SEV_TABS = ["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"];

  const filtered = pairs.filter((p) => {
    const sev = (p.risk?.severity || p.risk?.risk_level || "").toLowerCase();
    if (filter !== "ALL" && sev !== filter.toLowerCase()) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !p.risk?.name?.toLowerCase().includes(q) &&
        !p.profile?.name?.toLowerCase().includes(q) &&
        !p.shared.some((s) => s.includes(q))
      ) return false;
    }
    return true;
  });

  const critCount = pairs.filter(
    (p) => (p.risk?.severity || p.risk?.risk_level || "").toLowerCase() === "critical"
  ).length;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Threat Correlation Engine — F48"
        style={{
          position: "fixed", bottom: 8, left: 3716, zIndex: 9998,
          background: open ? RED : "#0a0f1e",
          border: `1px solid ${open ? RED : "#1e2d3d"}`,
          color: open ? "#fff" : CY,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: 1,
          padding: "3px 7px", borderRadius: 3, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4,
        }}
      >
        ⚡ CORR
        {critCount > 0 && (
          <span style={{
            background: RED, color: "#fff", borderRadius: "50%",
            fontSize: 8, padding: "1px 4px", minWidth: 14, textAlign: "center",
          }}>
            {critCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "fixed", top: 60, right: 20, width: 600, maxHeight: "80vh",
            overflowY: "auto", zIndex: 9997,
            background: "rgba(6,14,28,0.97)",
            border: `1px solid ${RED}44`,
            borderRadius: 6, fontFamily: "'JetBrains Mono',monospace",
            color: CY, boxShadow: `0 0 40px ${RED}22`,
          }}
        >
          {/* Header */}
          <div style={{
            padding: "12px 16px 8px",
            borderBottom: `1px solid ${RED}33`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div>
              <span style={{ color: RED, fontSize: 12, fontWeight: 700, letterSpacing: 2 }}>
                ⚡ THREAT CORRELATION ENGINE
              </span>
              <span style={{ color: "#5a8a9f", fontSize: 9, marginLeft: 10 }}>
                {loading ? "SCANNING…" : `${pairs.length} LINKS · ${risks.length} RISKS · ${profiles.length} PROFILES`}
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "#5a8a9f", cursor: "pointer", fontSize: 14 }}
            >✕</button>
          </div>

          {/* AI narrative */}
          <div style={{ padding: "10px 16px", borderBottom: `1px solid ${RED}22` }}>
            {aiLoading ? (
              <div style={{ color: "#5a8a9f", fontSize: 9, fontStyle: "italic" }}>
                ◌ AI correlation analysis running…
              </div>
            ) : aiText ? (
              <div style={{ color: "#c5e4ee", fontSize: 10, lineHeight: 1.6, fontStyle: "italic" }}>
                "{aiText}"
              </div>
            ) : (
              <div style={{ color: "#3a5a6f", fontSize: 9 }}>AI analysis pending…</div>
            )}
          </div>

          {/* Filter tabs */}
          <div style={{ padding: "8px 16px 0", display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SEV_TABS.map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                style={{
                  background: filter === t ? RED : "transparent",
                  border: `1px solid ${filter === t ? RED : "#1e3a4f"}`,
                  color: filter === t ? "#fff" : "#5a8a9f",
                  fontSize: 8, letterSpacing: 1, padding: "2px 8px",
                  borderRadius: 2, cursor: "pointer",
                }}
              >
                {t}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search correlations…"
              style={{
                flex: 1, background: "transparent", border: `1px solid #1e3a4f`,
                color: CY, fontSize: 9, padding: "2px 6px", borderRadius: 2,
                outline: "none", minWidth: 120,
              }}
            />
          </div>

          {/* Correlation pairs list */}
          <div style={{ padding: "8px 16px 16px" }}>
            {loading && !pairs.length ? (
              <div style={{ color: "#3a5a6f", fontSize: 10, textAlign: "center", padding: 20 }}>
                ◌ Scanning for threat correlations…
              </div>
            ) : !filtered.length ? (
              <div style={{ color: "#3a5a6f", fontSize: 10, textAlign: "center", padding: 20 }}>
                No correlations match current filters.
              </div>
            ) : filtered.map((pair, i) => {
              const sev = pair.risk?.severity || pair.risk?.risk_level || "";
              const cls = pair.profile?.classification || pair.profile?.clearance || "";
              const isExp = expanded === i;
              return (
                <div
                  key={i}
                  onClick={() => setExpanded(isExp ? null : i)}
                  style={{
                    marginBottom: 6, padding: "8px 10px",
                    border: `1px solid ${sev.toLowerCase() === "critical" ? RED + "66" : "#1e3a4f"}`,
                    borderRadius: 4, cursor: "pointer",
                    background: isExp ? "rgba(255,77,109,0.05)" : "rgba(29,57,88,0.3)",
                    transition: "background 0.15s",
                  }}
                >
                  {/* Row header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      fontSize: 8, padding: "1px 5px", borderRadius: 2,
                      background: SEV_COLOR(sev) + "22", color: SEV_COLOR(sev),
                      border: `1px solid ${SEV_COLOR(sev)}44`,
                      textTransform: "uppercase", letterSpacing: 1, flexShrink: 0,
                    }}>
                      {sev || "UNKN"}
                    </span>

                    {sev.toLowerCase() === "critical" && (
                      <span style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: RED, flexShrink: 0,
                        boxShadow: `0 0 6px ${RED}`,
                        animation: "pulse 1.2s ease-in-out infinite",
                      }} />
                    )}

                    <span style={{ color: CY, fontSize: 10, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {pair.risk?.name || "Unknown Risk"}
                    </span>
                    <span style={{ color: "#5a8a9f", fontSize: 9, flexShrink: 0 }}>↔</span>
                    <span style={{ color: PURP, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {pair.profile?.name || "Unknown Entity"}
                    </span>

                    {cls && (
                      <span style={{
                        fontSize: 7, padding: "1px 4px", borderRadius: 2,
                        background: CLASS_COLOR(cls) + "22", color: CLASS_COLOR(cls),
                        border: `1px solid ${CLASS_COLOR(cls)}44`,
                        letterSpacing: 1, flexShrink: 0,
                      }}>
                        {cls}
                      </span>
                    )}

                    <span style={{ color: "#2a5a7f", fontSize: 8, flexShrink: 0 }}>
                      {pair.score} link{pair.score !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Shared tokens */}
                  <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {pair.shared.slice(0, 6).map((tok) => (
                      <span key={tok} style={{
                        fontSize: 8, padding: "1px 6px", borderRadius: 10,
                        background: "#0a1e2e", border: `1px solid #1e3a4f`, color: "#5a8a9f",
                      }}>
                        {tok}
                      </span>
                    ))}
                    {pair.shared.length > 6 && (
                      <span style={{ fontSize: 8, color: "#3a5a6f" }}>+{pair.shared.length - 6} more</span>
                    )}
                  </div>

                  {/* Expanded detail */}
                  {isExp && (
                    <div style={{
                      marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
                      borderTop: `1px solid #1e3a4f`, paddingTop: 8,
                    }}>
                      <div>
                        <div style={{ color: RED, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>RISK SIGNAL</div>
                        {[
                          ["Type",     pair.risk?.type || pair.risk?.risk_type],
                          ["Category", pair.risk?.category],
                          ["Source",   pair.risk?.source],
                          ["Score",    pair.risk?.score ?? pair.risk?.risk_score],
                          ["Status",   pair.risk?.status],
                          ["Region",   pair.risk?.location || pair.risk?.region],
                        ].filter(([, v]) => v != null && v !== "").map(([k, v]) => (
                          <div key={k} style={{ fontSize: 9, marginBottom: 2 }}>
                            <span style={{ color: "#3a5a6f" }}>{k}: </span>
                            <span style={{ color: CY }}>{String(v)}</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        <div style={{ color: PURP, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>INTEL PROFILE</div>
                        {[
                          ["Type",           pair.profile?.type],
                          ["Classification", pair.profile?.classification || pair.profile?.clearance],
                          ["Threat Level",   pair.profile?.threat_level],
                          ["Country",        pair.profile?.country || pair.profile?.location],
                          ["Status",         pair.profile?.status],
                        ].filter(([, v]) => v != null && v !== "").map(([k, v]) => (
                          <div key={k} style={{ fontSize: 9, marginBottom: 2 }}>
                            <span style={{ color: "#3a5a6f" }}>{k}: </span>
                            <span style={{ color: PURP }}>{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <style>{`
            @keyframes pulse {
              0%, 100% { opacity: 1; }
              50%       { opacity: 0.3; }
            }
          `}</style>
        </div>
      )}
    </>
  );
}
