/**
 * IntelProfileRoster — F50 Intel Profile Roster.
 * Sources from /entities/IntelProfile — searchable roster of tracked intelligence
 * profiles with threat-level indicators and AI dossier generation.
 * Hover over badge for full tag list; click ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence dossier + TTS.
 * "JARVIS, intel profiles / intel roster / who are we tracking" opens the panel.
 * Additive only — mounted via App.jsx; intent exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const RED = "#FF3B5C";
const GLD = "#FFD700";
const GRN = "#00E5A0";
const ORG = "#FF8C42";
const DIM = "#566878";
const BTN_LEFT = 11180;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const INTEL_RE =
  /\bintel.profile|intel.roster|profile.list|all.profile|tracked.entit|who.are.we.tracking|intelligence.profile|target.roster|subject.roster|subject.list|ipro\b/i;

const THREAT_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, UNKNOWN: 4 };

function threatColor(level) {
  switch ((level || "").toUpperCase()) {
    case "CRITICAL": return RED;
    case "HIGH":     return ORG;
    case "MEDIUM":   return GLD;
    case "LOW":      return GRN;
    default:         return DIM;
  }
}

function threatPulse(level) {
  return (level || "").toUpperCase() === "CRITICAL";
}

async function fetchProfiles() {
  const r = await fetch(`${apiBase()}/entities/IntelProfile`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)                      ? d
    : Array.isArray(d?.data)                   ? d.data
    : Array.isArray(d?.items)                  ? d.items
    : Array.isArray(d?.profiles)               ? d.profiles
    : Array.isArray(d?.intel_profiles)         ? d.intel_profiles
    : Array.isArray(d?.results)                ? d.results
    : [];
}

export function isIntelProfileRosterQuery(text) {
  return INTEL_RE.test(text || "");
}

export async function buildIntelProfileRosterScript() {
  let profiles = [];
  try { profiles = await fetchProfiles(); } catch (_) {}

  if (!profiles.length) return "No intelligence profiles are currently loaded, sir.";

  const sorted = [...profiles].sort(
    (a, b) =>
      (THREAT_ORDER[(a.threat_level || a.risk_level || "UNKNOWN").toUpperCase()] ?? 4) -
      (THREAT_ORDER[(b.threat_level || b.risk_level || "UNKNOWN").toUpperCase()] ?? 4),
  );

  const critCount = profiles.filter(
    p => (p.threat_level || p.risk_level || "").toUpperCase() === "CRITICAL",
  ).length;
  const highCount = profiles.filter(
    p => (p.threat_level || p.risk_level || "").toUpperCase() === "HIGH",
  ).length;

  const topNames = sorted
    .slice(0, 3)
    .map(p => p.name || p.subject || p.entity_name || p.alias || "Unknown")
    .join(", ");

  return (
    `Intel roster: ${profiles.length} profile${profiles.length !== 1 ? "s" : ""} tracked` +
    (critCount > 0 ? `, ${critCount} CRITICAL` : "") +
    (highCount > 0 ? `, ${highCount} HIGH-priority` : "") +
    `. Top subjects: ${topNames}.`
  ).trim();
}

function getName(p) {
  return p.name || p.subject || p.entity_name || p.alias || "Unknown Subject";
}

function getThreat(p) {
  return (p.threat_level || p.risk_level || "UNKNOWN").toUpperCase();
}

function getTags(p) {
  const raw = p.tags || p.categories || p.labels || [];
  return Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
}

function getSummary(p) {
  return p.summary || p.description || p.bio || p.notes || "";
}

function getType(p) {
  return p.entity_type || p.type || p.subject_type || p.profile_type || "";
}

export default function IntelProfileRoster() {
  const [open,     setOpen]     = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [filter,   setFilter]   = useState("");
  const [assessing, setAssessing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const arr = await fetchProfiles();
      const sorted = [...arr].sort(
        (a, b) =>
          (THREAT_ORDER[getThreat(a)] ?? 4) - (THREAT_ORDER[getThreat(b)] ?? 4),
      );
      setProfiles(sorted);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (INTEL_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:intel-roster-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:intel-roster-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  async function assess(profile) {
    const name = getName(profile);
    setAssessing(name);
    const subject = `Intel profile: ${name}, type: ${getType(profile) || "unknown"}, threat: ${getThreat(profile)}, summary: ${getSummary(profile).slice(0, 200)}`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message: `Provide a concise 2-sentence intelligence dossier on this subject. ${subject}`,
        }),
      });
      const d = await r.json();
      const brief = (d.answer || "No assessment available.").trim();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: brief } }));
    } catch (_) {
    } finally {
      setAssessing(null);
    }
  }

  const critCount = profiles.filter(p => getThreat(p) === "CRITICAL").length;

  const visible = filter.trim()
    ? profiles.filter(p => {
        const hay = [
          getName(p), getThreat(p), getType(p), getSummary(p),
          ...getTags(p),
        ].join(" ").toLowerCase();
        return hay.includes(filter.toLowerCase());
      })
    : profiles;

  return (
    <>
      <style>{`
        @keyframes iprpulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        @keyframes iprspin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>

      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Intel Profile Roster (Ctrl+Shift+P)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 70,
          background: open ? RED + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${RED}55`,
          borderRadius: 8,
          color: open ? "#fff" : RED,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${RED}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>◈</span>
        IPRO
        {critCount > 0 && (
          <span style={{
            background: RED + "44", color: RED,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
            animation: "iprpulse 1s ease-in-out infinite",
          }}>
            {critCount}
          </span>
        )}
        {critCount === 0 && profiles.length > 0 && (
          <span style={{
            background: "rgba(41,231,255,0.12)", color: CY,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {profiles.length}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 70,
          width: "min(520px,96vw)", maxHeight: "min(640px,80vh)",
          background: "rgba(4,6,12,0.96)",
          border: `1px solid ${RED}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(14px)",
          boxShadow: `0 0 60px ${RED}18, 0 0 120px rgba(0,0,0,0.6)`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>

          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${RED}22`,
            display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%", background: RED,
              boxShadow: `0 0 10px ${RED}`,
              display: "inline-block",
              animation: loading ? "iprpulse 0.8s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: RED, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              INTEL PROFILE ROSTER
            </span>
            <span style={{ marginLeft: "auto", color: DIM, fontSize: 9 }}>
              {loading ? "SYNCING" : `${profiles.length} SUBJECTS`}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: DIM,
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Threat summary bar */}
          {profiles.length > 0 && (
            <div style={{
              padding: "5px 14px", borderBottom: `1px solid ${RED}18`,
              display: "flex", gap: 12, fontSize: 9, color: DIM, flexShrink: 0,
            }}>
              {["CRITICAL","HIGH","MEDIUM","LOW"].map(lvl => {
                const count = profiles.filter(p => getThreat(p) === lvl).length;
                if (!count) return null;
                return (
                  <span key={lvl} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: threatColor(lvl),
                      boxShadow: `0 0 6px ${threatColor(lvl)}`,
                      display: "inline-block",
                      ...(lvl === "CRITICAL" ? { animation: "iprpulse 1s ease-in-out infinite" } : {}),
                    }} />
                    <span style={{ color: threatColor(lvl), fontWeight: 700 }}>{count}</span>
                    <span style={{ color: DIM }}>{lvl}</span>
                  </span>
                );
              })}
            </div>
          )}

          {/* Filter */}
          <div style={{ padding: "6px 12px", borderBottom: `1px solid ${RED}18`, flexShrink: 0 }}>
            <input
              type="text"
              placeholder="search subject, type, tags, threat level…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box",
                background: `rgba(255,59,92,0.06)`, border: `1px solid ${RED}33`,
                borderRadius: 5, color: "#DCEBF5", fontSize: 10,
                padding: "5px 9px", fontFamily: "'JetBrains Mono',monospace",
                outline: "none", letterSpacing: 0.5,
              }}
            />
          </div>

          {/* Profile list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
            {loading && profiles.length === 0 && (
              <div style={{ color: DIM, fontSize: 10, padding: "20px", textAlign: "center" }}>
                <span style={{ animation: "iprspin 1s linear infinite", display: "inline-block" }}>◈</span>
                {" "}LOADING PROFILES…
              </div>
            )}
            {!loading && profiles.length === 0 && (
              <div style={{ color: DIM, fontSize: 10, padding: "20px", textAlign: "center" }}>
                NO INTEL PROFILES FOUND
              </div>
            )}
            {visible.map((p, i) => {
              const name    = getName(p);
              const threat  = getThreat(p);
              const tc      = threatColor(threat);
              const summary = getSummary(p);
              const tags    = getTags(p).slice(0, 4);
              const type    = getType(p);
              const isAssessing = assessing === name;

              return (
                <div key={p.id || p._id || i} style={{
                  padding: "9px 14px",
                  borderBottom: `1px solid rgba(255,59,92,0.08)`,
                  display: "flex", flexDirection: "column", gap: 4,
                  transition: "background 0.15s",
                }}>
                  {/* Top row: threat pill + name + type + assess button */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      background: tc + "22", color: tc,
                      border: `1px solid ${tc}44`,
                      borderRadius: 5, padding: "1px 6px",
                      fontSize: 8, fontWeight: 900, letterSpacing: 1.5,
                      flexShrink: 0,
                      ...(threatPulse(threat) ? { animation: "iprpulse 1s ease-in-out infinite" } : {}),
                    }}>
                      {threat}
                    </span>
                    <span style={{
                      color: "#DCEBF5", fontSize: 11, fontWeight: 700,
                      flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {name}
                    </span>
                    {type && (
                      <span style={{
                        color: DIM, fontSize: 8, letterSpacing: 1,
                        background: "rgba(255,255,255,0.05)",
                        borderRadius: 4, padding: "1px 5px",
                        flexShrink: 0,
                      }}>
                        {type.toUpperCase()}
                      </span>
                    )}
                    <button
                      onClick={() => assess(p)}
                      disabled={isAssessing}
                      style={{
                        background: isAssessing ? RED + "44" : "rgba(255,59,92,0.12)",
                        border: `1px solid ${RED}44`,
                        borderRadius: 5, color: RED,
                        cursor: isAssessing ? "wait" : "pointer",
                        padding: "2px 8px", fontSize: 8, letterSpacing: 1.5,
                        fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
                        flexShrink: 0,
                        transition: "all 0.15s",
                      }}
                    >
                      {isAssessing ? "…" : "▶ ASSESS"}
                    </button>
                  </div>

                  {/* Summary line */}
                  {summary && (
                    <div style={{
                      color: "#8AA0B0", fontSize: 9, lineHeight: 1.5,
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}>
                      {summary}
                    </div>
                  )}

                  {/* Tags */}
                  {tags.length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {tags.map((tag, ti) => (
                        <span key={ti} style={{
                          background: "rgba(41,231,255,0.08)",
                          border: `1px solid ${CY}22`,
                          borderRadius: 4, color: CY,
                          padding: "0px 5px", fontSize: 8, letterSpacing: 0.5,
                        }}>
                          {String(tag).trim()}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {visible.length === 0 && profiles.length > 0 && (
              <div style={{ color: DIM, fontSize: 10, padding: "16px", textAlign: "center" }}>
                NO PROFILES MATCH FILTER
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "6px 14px", borderTop: `1px solid ${RED}18`,
            display: "flex", justifyContent: "space-between",
            color: DIM, fontSize: 8, letterSpacing: 1, flexShrink: 0,
          }}>
            <span>◈ INTEL PROFILE ROSTER — /entities/IntelProfile</span>
            <span>{visible.length}/{profiles.length} SHOWN</span>
          </div>
        </div>
      )}
    </>
  );
}
