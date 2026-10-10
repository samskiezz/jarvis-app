/**
 * IntelProfileScenarioThreat — F61
 * /entities/IntelProfile × /v1/scenario/list → keyword-correlates active threat
 * intel profiles against scenario catalogue to classify ADDRESSED vs UNADDRESSED.
 * Voice trigger: "intel scenario"/"threat scenario"/"itsm"/"unaddressed threats"/
 *   "intel profile scenario"/"threat matching"/"which threats are covered".
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const CY  = "#29E7FF";
const GRN = "#4ADE80";
const AMB = "#FFBB33";
const RED = "#FF4455";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const ITSM_RE =
  /\bintel\s*scenario\b|\bthreat\s*scenario\b|\bitsm\b|\bunaddressed\s*threats?\b|\bintel\s*profile\s*scenario\b|\bthreat\s*match(?:ing)?\b|\bwhich\s*threats?\s*(?:are\s*)?covered\b|\bscenario\s*threat\s*match\b|\bthreat\s*coverage\s*map\b|\bprofile\s*scenario\s*gap\b/i;

export function isItsmQuery(text) {
  return ITSM_RE.test(text || "");
}

async function fetchIntelProfiles() {
  const r = await fetch(`${apiBase()}/entities/IntelProfile`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)                    ? d
    : Array.isArray(d?.items)                ? d.items
    : Array.isArray(d?.data)                 ? d.data
    : Array.isArray(d?.results)              ? d.results
    : Array.isArray(d?.intel_profiles)       ? d.intel_profiles
    : Array.isArray(d?.profiles)             ? d.profiles
    : [];
}

async function fetchScenarios() {
  const r = await fetch(`${apiBase()}/v1/scenario/list`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)                    ? d
    : Array.isArray(d?.items)                ? d.items
    : Array.isArray(d?.data)                 ? d.data
    : Array.isArray(d?.results)              ? d.results
    : Array.isArray(d?.scenarios)            ? d.scenarios
    : [];
}

function keywords(obj) {
  return [
    obj?.name, obj?.title, obj?.label, obj?.description,
    obj?.type, obj?.category, obj?.threat_type, obj?.actor,
    obj?.origin, obj?.region, obj?.sector, obj?.tactic,
    obj?.tags?.join?.(" "), obj?.notes, obj?.summary,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function correlate(profiles, scenarios) {
  return profiles.map((profile) => {
    const profKw = keywords(profile);
    const matched = scenarios.filter((sc) => {
      const scKw = keywords(sc);
      const profTokens = profKw.split(/\W+/).filter((t) => t.length > 3);
      const scTokens   = scKw.split(/\W+/).filter((t) => t.length > 3);
      return profTokens.some((t) => scKw.includes(t)) || scTokens.some((t) => profKw.includes(t));
    });
    return { profile, matched, status: matched.length > 0 ? "ADDRESSED" : "UNADDRESSED" };
  });
}

export async function buildItsmScript() {
  const [profiles, scenarios] = await Promise.all([fetchIntelProfiles(), fetchScenarios()]);
  const rows        = correlate(profiles, scenarios);
  const addressed   = rows.filter((r) => r.status === "ADDRESSED");
  const unaddressed = rows.filter((r) => r.status === "UNADDRESSED");
  if (!rows.length) return "No intel profile data available, sir.";
  const topUnaddressed = unaddressed
    .slice(0, 3)
    .map((r) => r.profile?.name || r.profile?.title || "Unknown")
    .join(", ");
  return (
    `Intel Profile Scenario Threat Match: ${rows.length} profiles assessed against ${scenarios.length} scenarios. ` +
    `${addressed.length} ADDRESSED, ${unaddressed.length} UNADDRESSED. ` +
    (unaddressed.length
      ? `Top unaddressed profiles: ${topUnaddressed}.`
      : "All active threat intel profiles are matched to at least one scenario, sir.")
  );
}

export default function IntelProfileScenarioThreat() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [filter, setFilter]       = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [loading, setLoading]     = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [profiles, scenarios] = await Promise.all([fetchIntelProfiles(), fetchScenarios()]);
      setRows(correlate(profiles, scenarios));
    } catch {
      // silently ignore; stale data stays
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen((v) => { if (!v) refresh(); return !v; });
    window.addEventListener("jarvis:itsm-toggle", toggle);
    return () => window.removeEventListener("jarvis:itsm-toggle", toggle);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(refresh, 90_000);
    return () => clearInterval(id);
  }, [open, refresh]);

  const addressed   = rows.filter((r) => r.status === "ADDRESSED");
  const unaddressed = rows.filter((r) => r.status === "UNADDRESSED");

  const visible = rows.filter((r) => {
    if (filter === "ADDRESSED"   && r.status !== "ADDRESSED")   return false;
    if (filter === "UNADDRESSED" && r.status !== "UNADDRESSED") return false;
    if (search) {
      const kw = (r.profile?.name || r.profile?.title || "").toLowerCase();
      if (!kw.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  async function assess(row) {
    setAssessing(row.profile?.id || row.profile?.name);
    const profileName = row.profile?.name || row.profile?.title || "Unknown profile";
    const matchedNames = row.matched.map((s) => s.name || s.title || "Unknown").join(", ") || "none";
    const prompt =
      `Intel profile "${profileName}" is ${row.status}. ` +
      (row.matched.length
        ? `Matched scenarios: ${matchedNames}.`
        : "No scenarios currently address this threat.") +
      " Provide a 2-sentence threat readiness brief and recommended action.";
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const brief = d?.response || d?.message || d?.content || "Assessment complete.";
      const voice = getActiveVoice?.() ?? "ash";
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: brief, voice }),
      });
    } catch {
      // ignore TTS errors
    }
    setAssessing(null);
  }

  if (!open) {
    const unaddressedCount = unaddressed.length;
    return (
      <button
        onClick={() => { setOpen(true); refresh(); }}
        title="Intel Profile × Scenario Threat Match (F61)"
        style={{
          position: "fixed", left: 15160, bottom: 8, zIndex: 70,
          background: "rgba(5,8,13,0.72)", border: `1px solid ${unaddressedCount > 0 ? AMB : CY}55`,
          borderRadius: 6, padding: "3px 9px", cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 11, color: unaddressedCount > 0 ? AMB : CY,
          letterSpacing: 1, backdropFilter: "blur(6px)",
        }}
      >
        ◈ ITSM{unaddressedCount > 0 && <sup style={{ color: AMB, marginLeft: 2 }}>{unaddressedCount}</sup>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh",
      background: "rgba(2,5,10,0.88)", zIndex: 9100, display: "flex",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'JetBrains Mono',monospace",
    }}>
      <div style={{
        width: "min(820px,94vw)", maxHeight: "88vh", overflowY: "auto",
        background: "rgba(8,14,22,0.96)", border: `1px solid ${CY}44`,
        borderRadius: 14, padding: "20px 22px",
        boxShadow: `0 0 60px ${CY}18`,
      }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ color: CY, fontSize: 13, letterSpacing: 3, textShadow: `0 0 12px ${CY}` }}>
            ◈ INTEL PROFILE × SCENARIO THREAT MATCH
          </span>
          {loading && <span style={{ color: CY, fontSize: 10, marginLeft: "auto" }}>refreshing…</span>}
          <button onClick={() => setOpen(false)}
            style={{ marginLeft: loading ? 0 : "auto", background: "none", border: "none",
              cursor: "pointer", color: "#6E8AA0", fontSize: 16 }}>✕</button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          {[
            { label: "PROFILES",    val: rows.length,        col: CY },
            { label: "SCENARIOS",   val: rows.length > 0 ? (rows[0]?.matched?.length ?? 0) + rows.reduce((a,r)=>a+r.matched.length,0)/Math.max(rows.length,1)|0 : 0, col: CY },
            { label: "ADDRESSED",   val: addressed.length,   col: GRN },
            { label: "UNADDRESSED", val: unaddressed.length, col: AMB },
          ].map(({ label, val, col }) => (
            <div key={label} style={{
              flex: "1 1 120px", background: "rgba(41,231,255,0.05)",
              border: `1px solid ${col}33`, borderRadius: 8, padding: "8px 12px", textAlign: "center",
            }}>
              <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{val}</div>
              <div style={{ color: "#6E8AA0", fontSize: 10, letterSpacing: 1, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* filter + search */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {["ALL", "ADDRESSED", "UNADDRESSED"].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                background: filter === f ? `${CY}22` : "none",
                border: `1px solid ${filter === f ? CY : "#6E8AA0"}55`,
                borderRadius: 5, padding: "3px 10px", cursor: "pointer",
                color: filter === f ? CY : "#6E8AA0", fontSize: 11,
              }}>{f}</button>
          ))}
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="search profiles…"
            style={{
              marginLeft: "auto", background: "rgba(41,231,255,0.06)",
              border: `1px solid ${CY}33`, borderRadius: 5,
              padding: "3px 10px", color: CY, fontSize: 11,
              outline: "none", width: 160,
            }}
          />
        </div>

        {/* rows */}
        {visible.length === 0 && (
          <div style={{ color: "#6E8AA0", fontSize: 12, textAlign: "center", padding: 20 }}>
            {loading ? "Loading…" : "No profiles match current filter."}
          </div>
        )}
        {visible.map((row, i) => {
          const name   = row.profile?.name || row.profile?.title || `Profile ${i}`;
          const isExp  = expanded === i;
          const col    = row.status === "ADDRESSED" ? GRN : AMB;
          const busy   = assessing === (row.profile?.id || row.profile?.name);
          return (
            <div key={i} style={{
              border: `1px solid ${col}33`, borderRadius: 8, marginBottom: 8,
              background: "rgba(8,14,22,0.6)",
            }}>
              <div
                onClick={() => setExpanded(isExp ? null : i)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", cursor: "pointer" }}
              >
                <span style={{ color: col, fontSize: 10, letterSpacing: 1, minWidth: 90 }}>{row.status}</span>
                <span style={{ color: "#DCEBF5", fontSize: 12, flex: 1 }}>{name}</span>
                <span style={{ color: "#6E8AA0", fontSize: 10 }}>
                  {row.matched.length} scenario{row.matched.length !== 1 ? "s" : ""}
                </span>
                <span style={{ color: CY, fontSize: 11 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "0 12px 12px" }}>
                  {row.matched.length === 0 ? (
                    <div style={{ color: AMB, fontSize: 11, marginBottom: 8 }}>
                      No matching scenarios — this threat is UNADDRESSED.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                      {row.matched.map((sc, j) => (
                        <div key={j} style={{
                          background: "rgba(74,222,128,0.07)", border: `1px solid ${GRN}33`,
                          borderRadius: 6, padding: "5px 10px", fontSize: 11,
                        }}>
                          <div style={{ color: GRN }}>{sc.name || sc.title || "Scenario"}</div>
                          {sc.description && (
                            <div style={{ color: "#6E8AA0", marginTop: 2, maxWidth: 240 }}>
                              {sc.description.slice(0, 80)}{sc.description.length > 80 ? "…" : ""}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => assess(row)}
                    disabled={busy}
                    style={{
                      background: busy ? "rgba(41,231,255,0.05)" : `${CY}18`,
                      border: `1px solid ${CY}44`, borderRadius: 5,
                      padding: "4px 12px", cursor: busy ? "wait" : "pointer",
                      color: CY, fontSize: 11,
                    }}
                  >
                    {busy ? "assessing…" : "▶ ASSESS"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
