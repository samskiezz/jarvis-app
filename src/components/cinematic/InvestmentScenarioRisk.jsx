/**
 * InvestmentScenarioRisk — F60
 * /entities/Investment × /v1/scenario/list → keyword-correlates portfolio positions
 * against threat scenarios to surface EXPOSED vs SAFE investments.
 * Voice trigger: "investment scenario"/"portfolio scenario"/"isexp"/"portfolio threat"/"investment risk scenario".
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

const ISEXP_RE =
  /\binvestment\s*scenario\b|\bportfolio\s*scenario\b|\bisexp\b|\bportfolio\s*threat\b|\binvestment\s*risk\s*scenario\b|\bscenario\s*risk\s*(?:to\s*)?(?:portfolio|investment)s?\b|\bwhich\s*investments?\s*(?:are\s*)?(?:at\s*)?risk\b|\bthreat(?:ened)?\s*(?:portfolio|positions?)\b/i;

export function isIsexpQuery(text) {
  return ISEXP_RE.test(text || "");
}

async function fetchInvestments() {
  const r = await fetch(`${apiBase()}/entities/Investment`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)                   ? d
    : Array.isArray(d?.items)               ? d.items
    : Array.isArray(d?.data)                ? d.data
    : Array.isArray(d?.results)             ? d.results
    : Array.isArray(d?.investments)         ? d.investments
    : [];
}

async function fetchScenarios() {
  const r = await fetch(`${apiBase()}/v1/scenario/list`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)                   ? d
    : Array.isArray(d?.items)               ? d.items
    : Array.isArray(d?.data)                ? d.data
    : Array.isArray(d?.results)             ? d.results
    : Array.isArray(d?.scenarios)           ? d.scenarios
    : [];
}

function keywords(obj) {
  return [
    obj?.name, obj?.title, obj?.label, obj?.description,
    obj?.type, obj?.category, obj?.asset_class, obj?.sector,
    obj?.ticker, obj?.symbol, obj?.region, obj?.currency,
    obj?.tags?.join?.(" "), obj?.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function correlate(investments, scenarios) {
  return investments.map((inv) => {
    const invKw = keywords(inv);
    const matched = scenarios.filter((sc) => {
      const scKw = keywords(sc);
      const invTokens = invKw.split(/\W+/).filter((t) => t.length > 3);
      const scTokens  = scKw.split(/\W+/).filter((t) => t.length > 3);
      return invTokens.some((t) => scKw.includes(t)) || scTokens.some((t) => invKw.includes(t));
    });
    return { inv, matched, status: matched.length > 0 ? "EXPOSED" : "SAFE" };
  });
}

export async function buildIsexpScript() {
  const [investments, scenarios] = await Promise.all([fetchInvestments(), fetchScenarios()]);
  const rows = correlate(investments, scenarios);
  const exposed = rows.filter((r) => r.status === "EXPOSED");
  const safe    = rows.filter((r) => r.status === "SAFE");
  if (!rows.length) return "No investment data available, sir.";
  const topExposed = exposed.slice(0, 3).map((r) => r.inv?.name || r.inv?.title || "Unknown").join(", ");
  return `Investment Scenario Risk: ${rows.length} positions assessed against ${scenarios.length} scenarios. ` +
    `${exposed.length} EXPOSED, ${safe.length} SAFE. ` +
    (exposed.length
      ? `Top exposed positions: ${topExposed}.`
      : "All portfolio positions appear clear of known threat scenarios.");
}

export default function InvestmentScenarioRisk() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [loading, setLoading]   = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [investments, scenarios] = await Promise.all([fetchInvestments(), fetchScenarios()]);
      setRows(correlate(investments, scenarios));
    } catch {
      // silently ignore; stale data stays
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen((v) => { if (!v) refresh(); return !v; });
    window.addEventListener("jarvis:isexp-toggle", toggle);
    return () => window.removeEventListener("jarvis:isexp-toggle", toggle);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(refresh, 90_000);
    return () => clearInterval(id);
  }, [open, refresh]);

  async function assess(row) {
    setAssessing(row.inv?.id || row.inv?.name);
    const scenNames = row.matched.map((s) => s.name || s.title || "unknown").join(", ");
    const prompt = `Investment "${row.inv?.name || row.inv?.title}" is keyword-correlated to these threat scenarios: ${scenNames}. In 2 sentences assess the portfolio exposure risk and recommend a priority action.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const brief = (d.answer || "Assessment complete.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      const voice = getActiveVoice?.() || "ash";
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: brief, voice }),
      });
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: brief } }));
    } catch { /* best-effort */ }
    setAssessing(null);
  }

  const exposed = rows.filter((r) => r.status === "EXPOSED");
  const safe    = rows.filter((r) => r.status === "SAFE");

  const visible = rows.filter((r) => {
    if (filter === "EXPOSED" && r.status !== "EXPOSED") return false;
    if (filter === "SAFE"    && r.status !== "SAFE")    return false;
    if (search) {
      const q = search.toLowerCase();
      const name = (r.inv?.name || r.inv?.title || "").toLowerCase();
      if (!name.includes(q)) return false;
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); refresh(); }}
        title="Investment × Scenario Risk"
        style={{
          position: "fixed", bottom: 8, left: 14600, zIndex: 69,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${AMB}88`,
          color: exposed.length ? AMB : CY, borderRadius: 6, padding: "3px 8px",
          fontSize: 11, fontFamily: "'JetBrains Mono',monospace", cursor: "pointer",
          letterSpacing: 1,
        }}
      >
        ◈ ISEXP{exposed.length > 0 && (
          <span style={{
            marginLeft: 5, background: AMB, color: "#04060A",
            borderRadius: 9, padding: "0 5px", fontSize: 10, fontWeight: 700,
          }}>{exposed.length}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 54, left: "50%", transform: "translateX(-50%)",
      zIndex: 9020, width: "min(820px,96vw)", maxHeight: "72vh",
      background: "rgba(6,10,18,0.95)", border: `1px solid ${CY}44`,
      borderRadius: 14, display: "flex", flexDirection: "column",
      fontFamily: "'JetBrains Mono',monospace", overflow: "hidden",
      boxShadow: `0 0 60px ${AMB}22`,
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
        borderBottom: `1px solid ${CY}22`, flexShrink: 0,
      }}>
        <span style={{ color: AMB, fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>
          ◈ INVESTMENT × SCENARIO RISK
        </span>
        {loading && <span style={{ color: CY, fontSize: 10 }}>refreshing…</span>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {["ALL", "EXPOSED", "SAFE"].map((f) => (
            <button key={f} onClick={() => setFilter(f)} style={{
              background: filter === f ? CY : "transparent",
              color: filter === f ? "#04060A" : CY,
              border: `1px solid ${CY}66`, borderRadius: 4,
              padding: "2px 8px", fontSize: 10, cursor: "pointer", letterSpacing: 1,
            }}>{f}</button>
          ))}
          <button onClick={() => setOpen(false)} style={{
            background: "transparent", border: `1px solid ${RED}66`,
            color: RED, borderRadius: 4, padding: "2px 7px", fontSize: 11, cursor: "pointer",
          }}>✕</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{
        display: "flex", gap: 14, padding: "8px 14px",
        borderBottom: `1px solid ${CY}18`, flexShrink: 0,
      }}>
        {[
          { label: "POSITIONS", val: rows.length,    color: CY },
          { label: "SCENARIOS", val: rows.length ? rows[0]?.matched !== undefined ? undefined : 0 : 0, color: CY },
          { label: "EXPOSED",   val: exposed.length, color: AMB },
          { label: "SAFE",      val: safe.length,    color: GRN },
        ].filter((s) => s.val !== undefined).map(({ label, val, color }) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={{ color, fontSize: 18, fontWeight: 700 }}>{val ?? "—"}</div>
            <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: "6px 14px", borderBottom: `1px solid ${CY}18`, flexShrink: 0 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search investments…"
          style={{
            width: "100%", background: "rgba(41,231,255,0.06)", border: `1px solid ${CY}44`,
            color: "#DCEBF5", borderRadius: 6, padding: "4px 10px", fontSize: 11,
            fontFamily: "'JetBrains Mono',monospace", outline: "none",
          }}
        />
      </div>

      {/* Rows */}
      <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
        {visible.length === 0 && (
          <div style={{ color: "#6E8AA0", padding: "20px", textAlign: "center", fontSize: 12 }}>
            {loading ? "Loading…" : "No records match current filter."}
          </div>
        )}
        {visible.map((row, i) => {
          const id = row.inv?.id || row.inv?.name || i;
          const isExpanded = expanded === id;
          const isExposed = row.status === "EXPOSED";
          const statusColor = isExposed ? AMB : GRN;
          const name = row.inv?.name || row.inv?.title || `Investment ${i + 1}`;
          const assetClass = row.inv?.asset_class || row.inv?.type || row.inv?.category || "";
          const value = row.inv?.value !== undefined ? `$${Number(row.inv.value).toLocaleString()}` : "";

          return (
            <div key={id} style={{
              borderBottom: `1px solid ${CY}12`, padding: "0 14px",
            }}>
              <div
                onClick={() => setExpanded(isExpanded ? null : id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "7px 0",
                  cursor: "pointer",
                }}
              >
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: 1, padding: "1px 6px",
                  borderRadius: 4, background: `${statusColor}22`, color: statusColor,
                  border: `1px solid ${statusColor}44`, minWidth: 60, textAlign: "center",
                }}>
                  {row.status}
                </span>
                <span style={{ color: "#DCEBF5", fontSize: 12, flex: 1 }}>{name}</span>
                {assetClass && (
                  <span style={{ color: "#6E8AA0", fontSize: 10 }}>{assetClass}</span>
                )}
                {value && (
                  <span style={{ color: CY, fontSize: 11 }}>{value}</span>
                )}
                {isExposed && (
                  <span style={{ color: AMB, fontSize: 10 }}>
                    {row.matched.length} scenario{row.matched.length !== 1 ? "s" : ""}
                  </span>
                )}
                <span style={{ color: CY, fontSize: 11 }}>{isExpanded ? "▲" : "▼"}</span>
              </div>

              {isExpanded && (
                <div style={{
                  padding: "8px 0 12px 0", borderTop: `1px solid ${CY}18`,
                }}>
                  {isExposed ? (
                    <>
                      <div style={{ color: "#6E8AA0", fontSize: 10, marginBottom: 8, letterSpacing: 1 }}>
                        MATCHED THREAT SCENARIOS ({row.matched.length})
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {row.matched.map((sc, si) => (
                          <div key={sc?.id || si} style={{
                            background: `${AMB}12`, border: `1px solid ${AMB}33`,
                            borderRadius: 7, padding: "6px 10px",
                          }}>
                            <div style={{ color: AMB, fontSize: 11, fontWeight: 600 }}>
                              {sc?.name || sc?.title || `Scenario ${si + 1}`}
                            </div>
                            {sc?.description && (
                              <div style={{ color: "#8FAABB", fontSize: 10, marginTop: 3 }}>
                                {sc.description.slice(0, 120)}{sc.description.length > 120 ? "…" : ""}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => assess(row)}
                        disabled={!!assessing}
                        style={{
                          marginTop: 10, background: `${AMB}22`, border: `1px solid ${AMB}88`,
                          color: AMB, borderRadius: 6, padding: "4px 12px", fontSize: 10,
                          cursor: assessing ? "not-allowed" : "pointer", letterSpacing: 1,
                        }}
                      >
                        {assessing === (row.inv?.id || row.inv?.name) ? "…ASSESSING" : "▶ ASSESS EXPOSURE"}
                      </button>
                    </>
                  ) : (
                    <div style={{ color: GRN, fontSize: 11 }}>
                      No threat scenarios correlated to this position.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        padding: "6px 14px", borderTop: `1px solid ${CY}18`, flexShrink: 0,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1 }}>
          AUTO-REFRESH 90s · {visible.length}/{rows.length} SHOWN
        </span>
        <button onClick={refresh} style={{
          background: "transparent", border: `1px solid ${CY}44`, color: CY,
          borderRadius: 4, padding: "2px 8px", fontSize: 10, cursor: "pointer",
        }}>↺ REFRESH</button>
      </div>
    </div>
  );
}
