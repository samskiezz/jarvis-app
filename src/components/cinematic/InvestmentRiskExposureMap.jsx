/**
 * InvestmentRiskExposureMap — F302
 * Fetches /entities/Investment + /entities/RiskSignal; keyword-matches each
 * investment against active risk signals to surface EXPOSED vs SAFE investments.
 * Stat tiles (investments/exposed/safe/risk signals); severity-sorted rows;
 * expandable rows show matched risk signals with severity badge.
 * ◈ IRMAP toggle; voice "investment risk"/"portfolio risk"/"exposure map"/"asset risk".
 * Additive-only — no edits to CinematicShell/CinematicHome/JarvisLoader.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GR = "#00FF9F";
const AM = "#FFB800";
const RD = "#FF4444";
const OR = "#FF6A00";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";
const POLL_MS = 90_000;

const IRMAP_RE =
  /\binvestment.?risk\b|\bportfolio.?risk\b|\bexposure.?map\b|\basset.?risk\b|\brisk.?invest\b|\birmap\b|\bportfolio.?expos\b|\binvest.?expos\b|\brisk.?portfolio\b|\bexposed.?invest\b/i;

export function isInvestmentRiskQuery(text) {
  return IRMAP_RE.test(text || "");
}

function tokenize(str) {
  return (str || "")
    .toLowerCase()
    .split(/[\s,;:\-_/()[\]{}\.]+/)
    .filter((t) => t.length >= 3);
}

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

function matchRisks(investment, risks) {
  const invTokens = tokenize(
    (investment.name || investment.title || "") +
      " " +
      (investment.description || "") +
      " " +
      (investment.asset_class || investment.type || "") +
      " " +
      (investment.sector || "") +
      " " +
      (investment.ticker || investment.symbol || ""),
  );
  return risks.filter((r) => {
    const rTokens = tokenize(
      (r.title || r.name || "") +
        " " +
        (r.description || "") +
        " " +
        (r.category || "") +
        " " +
        (r.affected_entities || ""),
    );
    return invTokens.some((it) => rTokens.includes(it));
  });
}

export async function buildInvestmentRiskScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [ir, rr] = await Promise.allSettled([
    fetch(`${base}/entities/Investment`, { headers }),
    fetch(`${base}/entities/RiskSignal`, { headers }),
  ]);
  if (ir.status !== "fulfilled" || !ir.value.ok)
    return "Investment data unavailable, sir.";
  if (rr.status !== "fulfilled" || !rr.value.ok)
    return "Risk signal data unavailable, sir.";
  const id = await ir.value.json();
  const rd = await rr.value.json();
  const investments = Array.isArray(id)
    ? id
    : id.investments || id.items || id.data || [];
  const risks = Array.isArray(rd) ? rd : rd.risks || rd.items || rd.data || [];
  if (!investments.length) return "No active investments found, sir.";
  const exposed = investments.filter((inv) => matchRisks(inv, risks).length > 0);
  const safe = investments.length - exposed.length;
  const pct =
    investments.length > 0
      ? Math.round((exposed.length / investments.length) * 100)
      : 0;
  const criticalExposed = exposed.filter((inv) =>
    matchRisks(inv, risks).some(
      (r) => (r.severity || "").toLowerCase() === "critical",
    ),
  );
  return (
    `Investment risk exposure analysis complete, sir. ${investments.length} tracked assets cross-referenced against ` +
    `${risks.length} active risk signals. ${exposed.length} investment${exposed.length !== 1 ? "s" : ""} show risk signal exposure ` +
    `(${pct}% of portfolio); ${safe} appear${safe === 1 ? "s" : ""} unaffected at this time. ` +
    (criticalExposed.length > 0
      ? `Warning: ${criticalExposed.length} asset${criticalExposed.length !== 1 ? "s" : ""} flagged against critical-severity signals — immediate review recommended.`
      : "No critical-severity risk signals currently match any tracked investments.")
  );
}

export default function InvestmentRiskExposureMap() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [risks, setRisks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [filter, setFilter] = useState("all");
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const base = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [ir, rr] = await Promise.allSettled([
        fetch(`${base}/entities/Investment`, { headers }),
        fetch(`${base}/entities/RiskSignal`, { headers }),
      ]);
      const iOk = ir.status === "fulfilled" && ir.value.ok;
      const rOk = rr.status === "fulfilled" && rr.value.ok;
      const id = iOk ? await ir.value.json() : null;
      const rd = rOk ? await rr.value.json() : null;
      const investments = id
        ? Array.isArray(id)
          ? id
          : id.investments || id.items || id.data || []
        : [];
      const allRisks = rd
        ? Array.isArray(rd)
          ? rd
          : rd.risks || rd.items || rd.data || []
        : [];
      const mapped = investments.map((inv) => ({
        ...inv,
        _matched: matchRisks(inv, allRisks),
      }));
      // sort: exposed first, then by highest matched severity
      mapped.sort((a, b) => {
        const aExp = a._matched.length > 0 ? 0 : 1;
        const bExp = b._matched.length > 0 ? 0 : 1;
        if (aExp !== bExp) return aExp - bExp;
        const aWorst = Math.min(
          ...a._matched.map((r) => SEV_ORDER[(r.severity || "info").toLowerCase()] ?? 4),
          4,
        );
        const bWorst = Math.min(
          ...b._matched.map((r) => SEV_ORDER[(r.severity || "info").toLowerCase()] ?? 4),
          4,
        );
        return aWorst - bWorst;
      });
      setRows(mapped);
      setRisks(allRisks);
    } catch {}
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:investment-risk-map-toggle", onToggle);
    return () =>
      window.removeEventListener("jarvis:investment-risk-map-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [open, fetchData]);

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildInvestmentRiskScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const answer = (d.answer || script).replace(/<<ACTION:[^>]*>>/g, "").trim();
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }),
      );
    } catch {
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", {
          detail: { text: "Investment risk assessment unavailable." },
        }),
      );
    }
    setAssessing(false);
  }

  function toggleRow(id) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function sevColor(sev) {
    const s = (sev || "").toLowerCase();
    if (s === "critical") return RD;
    if (s === "high") return OR;
    if (s === "medium") return AM;
    return GR;
  }

  const exposed = rows.filter((inv) => inv._matched.length > 0);
  const safe = rows.filter((inv) => inv._matched.length === 0);

  const visible =
    filter === "exposed"
      ? exposed
      : filter === "safe"
      ? safe
      : rows;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Investment × Risk Signal Exposure Map"
        style={{
          position: "fixed",
          left: 59560,
          bottom: 8,
          zIndex: 115,
          background: open ? AM : "rgba(5,8,13,0.75)",
          border: `1px solid ${open ? AM : "rgba(255,184,0,0.35)"}`,
          color: open ? "#000" : AM,
          fontFamily: "monospace",
          fontSize: 10,
          padding: "3px 7px",
          borderRadius: 4,
          cursor: "pointer",
          letterSpacing: "0.05em",
        }}
      >
        ◈ IRMAP
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            right: 18,
            bottom: 90,
            zIndex: 9200,
            width: 340,
            maxHeight: "72vh",
            background: "rgba(5,8,13,0.93)",
            border: `1px solid ${AM}`,
            borderRadius: 8,
            padding: 14,
            fontFamily: "monospace",
            color: CY,
            boxShadow: `0 0 20px rgba(255,184,0,0.18)`,
            display: "flex",
            flexDirection: "column",
            gap: 0,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <span
              style={{
                fontSize: 11,
                letterSpacing: "0.12em",
                fontWeight: "bold",
                color: AM,
              }}
            >
              ◈ INVESTMENT × RISK EXPOSURE MAP
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none",
                border: "none",
                color: CY,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              ✕
            </button>
          </div>

          {loading && !rows.length && (
            <div
              style={{
                textAlign: "center",
                fontSize: 11,
                opacity: 0.6,
                padding: "12px 0",
              }}
            >
              cross-referencing investments vs risk signals…
            </div>
          )}

          {rows.length > 0 && (
            <>
              {/* Stat tiles */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr 1fr",
                  gap: 5,
                  marginBottom: 10,
                }}
              >
                {[
                  { label: "ASSETS", val: rows.length, col: AM },
                  { label: "EXPOSED", val: exposed.length, col: RD },
                  { label: "SAFE", val: safe.length, col: GR },
                  { label: "RISKS", val: risks.length, col: CY },
                ].map(({ label, val, col }) => (
                  <div
                    key={label}
                    style={{
                      background: "rgba(255,184,0,0.05)",
                      borderRadius: 4,
                      padding: "5px 3px",
                      textAlign: "center",
                      border: "1px solid rgba(255,184,0,0.15)",
                    }}
                  >
                    <div
                      style={{ fontSize: 14, fontWeight: "bold", color: col }}
                    >
                      {val}
                    </div>
                    <div style={{ fontSize: 8, opacity: 0.5, marginTop: 1 }}>
                      {label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Filter tabs */}
              <div
                style={{
                  display: "flex",
                  gap: 4,
                  marginBottom: 8,
                  flexWrap: "wrap",
                }}
              >
                {[
                  { key: "all", label: "ALL" },
                  { key: "exposed", label: "EXPOSED" },
                  { key: "safe", label: "SAFE" },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    style={{
                      background:
                        filter === key ? AM : "rgba(255,184,0,0.07)",
                      border: `1px solid ${filter === key ? AM : "rgba(255,184,0,0.25)"}`,
                      color: filter === key ? "#000" : AM,
                      fontFamily: "monospace",
                      fontSize: 9,
                      padding: "2px 6px",
                      borderRadius: 3,
                      cursor: "pointer",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Investment rows */}
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  maxHeight: "38vh",
                  marginBottom: 8,
                }}
              >
                {visible.length === 0 && (
                  <div
                    style={{
                      textAlign: "center",
                      opacity: 0.5,
                      fontSize: 10,
                      padding: "10px 0",
                    }}
                  >
                    no investments in this filter
                  </div>
                )}
                {visible.map((inv, i) => {
                  const id = inv.id || inv._id || i;
                  const isExpanded = expanded[id];
                  const matched = inv._matched || [];
                  const isExposed = matched.length > 0;
                  const worstSev = isExposed
                    ? matched.reduce(
                        (best, r) =>
                          (SEV_ORDER[(r.severity || "info").toLowerCase()] ?? 4) <
                          (SEV_ORDER[(best.severity || "info").toLowerCase()] ?? 4)
                            ? r
                            : best,
                        matched[0],
                      )
                    : null;
                  return (
                    <div
                      key={id}
                      style={{
                        borderBottom: "1px solid rgba(255,184,0,0.1)",
                        paddingBottom: 6,
                        marginBottom: 6,
                      }}
                    >
                      <div
                        onClick={() => matched.length > 0 && toggleRow(id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          cursor: matched.length > 0 ? "pointer" : "default",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 8,
                            background: isExposed
                              ? "rgba(255,68,68,0.12)"
                              : "rgba(0,255,159,0.12)",
                            border: `1px solid ${isExposed ? RD : GR}`,
                            color: isExposed ? RD : GR,
                            borderRadius: 3,
                            padding: "1px 4px",
                            letterSpacing: "0.06em",
                            minWidth: 46,
                            textAlign: "center",
                          }}
                        >
                          {isExposed ? "EXPOSED" : "SAFE"}
                        </span>
                        <span
                          style={{
                            flex: 1,
                            fontSize: 10,
                            color: "#DCEBF5",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {inv.name || inv.title || `Asset #${id}`}
                        </span>
                        {isExposed && worstSev && (
                          <span
                            style={{
                              fontSize: 8,
                              color: sevColor(worstSev.severity),
                              background: `rgba(255,68,68,0.08)`,
                              border: `1px solid ${sevColor(worstSev.severity)}55`,
                              borderRadius: 3,
                              padding: "1px 4px",
                            }}
                          >
                            {matched.length}▾
                          </span>
                        )}
                      </div>
                      {(inv.asset_class || inv.type || inv.sector) && (
                        <div
                          style={{
                            fontSize: 8,
                            opacity: 0.45,
                            marginTop: 2,
                          }}
                        >
                          {[inv.asset_class || inv.type, inv.sector]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      )}
                      {isExpanded && matched.length > 0 && (
                        <div
                          style={{
                            marginTop: 5,
                            paddingLeft: 10,
                            borderLeft: `2px solid ${AM}44`,
                          }}
                        >
                          {matched.slice(0, 5).map((r, ri) => (
                            <div
                              key={r.id || r._id || ri}
                              style={{
                                fontSize: 9,
                                color: "#A0B8C8",
                                padding: "2px 0",
                                display: "flex",
                                alignItems: "center",
                                gap: 5,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 8,
                                  color: sevColor(r.severity),
                                  background: `${sevColor(r.severity)}18`,
                                  border: `1px solid ${sevColor(r.severity)}55`,
                                  borderRadius: 2,
                                  padding: "0 3px",
                                  minWidth: 42,
                                  textAlign: "center",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {(r.severity || "INFO").toUpperCase()}
                              </span>
                              <span
                                style={{
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  flex: 1,
                                }}
                              >
                                {r.title || r.name || `Risk #${ri + 1}`}
                              </span>
                            </div>
                          ))}
                          {matched.length > 5 && (
                            <div
                              style={{
                                fontSize: 9,
                                opacity: 0.5,
                                paddingTop: 2,
                              }}
                            >
                              +{matched.length - 5} more
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Assess button */}
          <button
            onClick={assess}
            disabled={assessing || !rows.length}
            style={{
              width: "100%",
              background: "rgba(255,184,0,0.08)",
              border: `1px solid ${AM}`,
              color: AM,
              fontFamily: "monospace",
              fontSize: 10,
              padding: "5px 0",
              borderRadius: 4,
              cursor: assessing || !rows.length ? "not-allowed" : "pointer",
              letterSpacing: "0.08em",
              opacity: assessing || !rows.length ? 0.5 : 1,
            }}
          >
            {assessing ? "▶ ASSESSING…" : "▶ ASSESS — JARVIS BRIEF"}
          </button>
        </div>
      )}
    </>
  );
}
