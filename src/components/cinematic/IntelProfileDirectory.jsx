/**
 * IntelProfileDirectory — F31 Intel Profile Directory.
 * Sources all intelligence profiles from /entities/IntelProfile.
 * Dedicated browse panel separate from the quick-search (F08).
 * "JARVIS, intel profiles" / "JARVIS, subjects" opens the panel + TTS brief.
 * Toggle: ◈ INTEL button at left:1948 bottom strip · shortcut Alt+I.
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GLD = "#FFD700";
const RED = "#FF4444";
const ORG = "#FF8C42";
const GRN = "#00E5A0";
const DIM = "#566878";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const INTEL_RE = /\bintel.profile|intel profile|subjects?|persons?.of.interest|poi\b|threat.actor|profile.director|all.profile|who.are.known|known.entities\b/i;

const THREAT_ORDER = { critical: 0, high: 1, medium: 2, low: 3, minimal: 4, unknown: 5 };
const THREAT_COLOR = {
  critical: RED, high: ORG, medium: GLD, low: GRN, minimal: DIM, unknown: DIM,
};

function threatRank(t) {
  const k = (t || "unknown").toLowerCase();
  return THREAT_ORDER[k] ?? 5;
}

function threatColor(t) {
  return THREAT_COLOR[(t || "unknown").toLowerCase()] ?? DIM;
}

async function fetchProfiles() {
  const r = await fetch(`${apiBase()}/entities/IntelProfile`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)                    ? d
    : Array.isArray(d?.data)                ? d.data
    : Array.isArray(d?.items)               ? d.items
    : Array.isArray(d?.profiles)            ? d.profiles
    : Array.isArray(d?.results)             ? d.results
    : Array.isArray(d?.entities)            ? d.entities
    : [];
}

export function isIntelProfileQuery(text) {
  return INTEL_RE.test(text || "");
}

export async function buildIntelProfileScript() {
  let profiles = [];
  try { profiles = await fetchProfiles(); } catch (_) {}

  if (!profiles.length) return "No intel profiles on record at this time, sir.";

  const sorted = [...profiles].sort((a, b) =>
    threatRank(a.threat_level ?? a.threatLevel ?? a.threat ?? a.risk_level)
    - threatRank(b.threat_level ?? b.threatLevel ?? b.threat ?? b.risk_level)
  );

  const criticals = sorted.filter(p =>
    ["critical", "high"].includes((p.threat_level ?? p.threatLevel ?? p.threat ?? "").toLowerCase())
  );
  const top3 = sorted.slice(0, 3)
    .map(p => p.name || p.label || p.subject || p.id || "Unknown")
    .join(", ");

  return (
    `Intel Profile Directory contains ${profiles.length} subject${profiles.length !== 1 ? "s" : ""} of interest. ` +
    (criticals.length
      ? `${criticals.length} profile${criticals.length !== 1 ? "s" : ""} rated critical or high threat. `
      : "") +
    `Top profiles on record: ${top3}.`
  );
}

const TYPE_TABS = ["all", "person", "organisation", "group", "asset", "location"];

function classificationBadge(c) {
  const k = (c || "").toLowerCase();
  if (k.includes("top secret") || k.includes("ts")) return { label: "TS", color: RED };
  if (k.includes("secret"))   return { label: "S",  color: ORG };
  if (k.includes("confid"))   return { label: "C",  color: GLD };
  return { label: "U", color: DIM };
}

export default function IntelProfileDirectory() {
  const [open, setOpen]       = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [filter, setFilter]   = useState("");
  const [typeTab, setTypeTab] = useState("all");
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await fetchProfiles();
      setProfiles(data);
    } catch (e) {
      setError("Unable to retrieve intel profiles.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && !profiles.length) load();
  }, [open, profiles.length, load]);

  // Auto-refresh every 60s while open
  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [open, load]);

  // Alt+I keyboard shortcut
  useEffect(() => {
    const handler = (e) => {
      if (e.altKey && e.key === "i") { e.preventDefault(); setOpen(v => !v); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // "JARVIS, intel profiles" intent
  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (isIntelProfileQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const displayed = profiles
    .filter(p => {
      const name = (p.name || p.label || p.subject || p.id || "").toLowerCase();
      const matchFilter = !filter || name.includes(filter.toLowerCase());
      const type = (p.type || p.entity_type || p.category || "").toLowerCase();
      const matchType = typeTab === "all" || type.includes(typeTab);
      return matchFilter && matchType;
    })
    .sort((a, b) =>
      threatRank(a.threat_level ?? a.threatLevel ?? a.threat ?? a.risk_level)
      - threatRank(b.threat_level ?? b.threatLevel ?? b.threat ?? b.risk_level)
    );

  const critical = profiles.filter(p =>
    (p.threat_level ?? p.threatLevel ?? p.threat ?? "").toLowerCase() === "critical"
  ).length;

  return (
    <>
      {/* Toggle button — bottom strip at left:1948 */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Intel Profile Directory (Alt+I)"
        style={{
          position: "fixed", bottom: 8, left: 1948, zIndex: 60,
          background: open ? CY : "rgba(5,8,13,0.75)",
          color: open ? "#04060A" : CY,
          border: `1px solid ${CY}55`, borderRadius: 4,
          fontSize: 10, letterSpacing: 1.5, padding: "3px 8px",
          cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ PROFILES
        {critical > 0 && (
          <span style={{
            marginLeft: 5, background: RED, color: "#fff",
            borderRadius: "50%", fontSize: 9, padding: "0 4px",
          }}>{critical}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 34, left: 1948, zIndex: 65,
          width: 400, maxHeight: "80vh",
          background: "rgba(6,10,18,0.93)", border: `1px solid ${CY}44`,
          borderRadius: 10, padding: "14px 16px",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 40px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              ◈ INTEL PROFILE DIRECTORY
            </span>
            <span style={{ color: DIM, fontSize: 10 }}>
              {profiles.length} subject{profiles.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Type filter tabs */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {TYPE_TABS.map(t => (
              <button key={t} onClick={() => { setTypeTab(t); setSelected(null); }}
                style={{
                  fontSize: 9, padding: "2px 8px", borderRadius: 3, cursor: "pointer",
                  border: `1px solid ${typeTab === t ? CY : CY + "30"}`,
                  background: typeTab === t ? CY + "22" : "transparent",
                  color: typeTab === t ? CY : DIM, letterSpacing: 1,
                }}
              >{t.toUpperCase()}</button>
            ))}
          </div>

          {/* Search input */}
          <input
            value={filter}
            onChange={e => { setFilter(e.target.value); setSelected(null); }}
            placeholder="Search profiles…"
            style={{
              background: "rgba(41,231,255,0.06)", border: `1px solid ${CY}33`,
              borderRadius: 5, padding: "5px 10px", color: "#DCEBF5",
              fontFamily: "'JetBrains Mono',monospace", fontSize: 11, outline: "none",
            }}
          />

          {/* Profile list */}
          <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            {loading && (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
                ◌ loading profiles…
              </div>
            )}
            {error && (
              <div style={{ color: RED, fontSize: 11, padding: 8 }}>{error}</div>
            )}
            {!loading && !error && displayed.length === 0 && (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
                No profiles match.
              </div>
            )}
            {!loading && displayed.map((p, i) => {
              const name = p.name || p.label || p.subject || p.id || `Profile ${i + 1}`;
              const threat = p.threat_level ?? p.threatLevel ?? p.threat ?? p.risk_level ?? "unknown";
              const type = p.type || p.entity_type || p.category || "";
              const classification = p.classification || p.clearance || "";
              const cls = classificationBadge(classification);
              const connections = p.connections ?? p.connection_count ?? p.degree ?? null;
              const isSelected = selected === i;

              return (
                <div
                  key={p.id || i}
                  onClick={() => setSelected(isSelected ? null : i)}
                  style={{
                    borderRadius: 6, padding: "8px 10px", cursor: "pointer",
                    background: isSelected ? `${CY}12` : "rgba(255,255,255,0.02)",
                    border: `1px solid ${isSelected ? CY + "66" : "rgba(255,255,255,0.06)"}`,
                    transition: "border 0.15s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {/* Threat indicator */}
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: threatColor(threat), flexShrink: 0,
                      boxShadow: threat.toLowerCase() === "critical"
                        ? `0 0 8px ${RED}` : "none",
                    }} />
                    <span style={{ color: "#DCEBF5", fontSize: 12, flex: 1 }}>{name}</span>
                    {classification && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, color: cls.color,
                        border: `1px solid ${cls.color}55`, borderRadius: 3, padding: "0 4px",
                      }}>{cls.label}</span>
                    )}
                    <span style={{
                      fontSize: 9, color: threatColor(threat), letterSpacing: 1,
                    }}>{threat.toUpperCase()}</span>
                  </div>

                  {(type || connections !== null) && (
                    <div style={{ display: "flex", gap: 8, marginTop: 4, paddingLeft: 16 }}>
                      {type && (
                        <span style={{ fontSize: 9, color: DIM }}>
                          {type.toUpperCase()}
                        </span>
                      )}
                      {connections !== null && (
                        <span style={{ fontSize: 9, color: CY + "99" }}>
                          {connections} connections
                        </span>
                      )}
                    </div>
                  )}

                  {/* Expanded detail */}
                  {isSelected && (
                    <div style={{
                      marginTop: 8, paddingTop: 8,
                      borderTop: `1px solid ${CY}22`,
                      display: "flex", flexDirection: "column", gap: 4,
                    }}>
                      {Object.entries(p)
                        .filter(([k]) => !["id", "name", "label", "subject",
                          "threat_level", "threatLevel", "threat", "risk_level",
                          "type", "entity_type", "category",
                          "classification", "clearance", "connections",
                          "connection_count", "degree"].includes(k))
                        .slice(0, 8)
                        .map(([k, v]) => (
                          <div key={k} style={{ display: "flex", gap: 6, fontSize: 10 }}>
                            <span style={{ color: DIM, flexShrink: 0, minWidth: 90 }}>
                              {k.replace(/_/g, " ")}
                            </span>
                            <span style={{ color: "#AABECE", wordBreak: "break-all" }}>
                              {typeof v === "object" ? JSON.stringify(v) : String(v)}
                            </span>
                          </div>
                        ))
                      }
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button
            onClick={load}
            style={{
              alignSelf: "flex-end", fontSize: 9, padding: "2px 10px",
              border: `1px solid ${CY}44`, borderRadius: 4,
              background: "transparent", color: CY, cursor: "pointer",
              letterSpacing: 1,
            }}
          >↺ REFRESH</button>
        </div>
      )}
    </>
  );
}
