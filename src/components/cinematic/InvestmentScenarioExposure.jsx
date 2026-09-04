/**
 * InvestmentScenarioExposure — F489
 * "JARVIS, investment scenario / portfolio scenario / which investments have scenarios /
 *  investment coverage / invscn / scenario for investments / uncovered investments"
 * Cross-references /entities/Investment + /v1/scenario/list to surface
 * SCENARIO-MAPPED investments (≥1 keyword-matching scenario) vs
 * UNCOVERED investments (no scenario prepared for them).
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const RED = "#FF4444";
const ORG = "#FF8C42";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS = 90_000;

const INVSCN_RE =
  /\binvscn\b|\binvestment.?scenario\b|\bportfolio.?scenario\b|\bwhich.investments.have.scenarios?\b|\binvestment.?coverage\b|\bscenario.?for.investments?\b|\buncovered.investments?\b|\bportfolio.?sim\b|\binvestment.?simulation\b|\bsimulation.?coverage\b|\bportfolio.?plan\b/i;

export function isInvscnQuery(text) {
  return INVSCN_RE.test(text || "");
}

function normaliseInvestments(data) {
  if (!data) return [];
  const raw = data.investments || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((inv, i) => ({
    id:     inv.id || `inv-${i}`,
    name:   (inv.name || inv.title || inv.label || inv.ticker || `Investment ${i + 1}`).trim(),
    sector: (inv.sector || inv.category || inv.type || "").toLowerCase(),
    status: (inv.status || "ACTIVE").toUpperCase(),
    tags:   [...(inv.tags || []), inv.sector, inv.type, inv.category, inv.ticker]
              .filter(Boolean).map(x => String(x).toLowerCase()),
  }));
}

function normaliseScenarios(data) {
  if (!data) return [];
  const raw = data.scenarios || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((s, i) => ({
    id:    s.id || `sc-${i}`,
    name:  (s.name || s.title || s.label || `Scenario ${i + 1}`).trim(),
    kind:  (s.kind || s.type || s.category || "").toLowerCase(),
    tags:  [...(s.tags || []), s.kind, s.type, s.category]
             .filter(Boolean).map(x => String(x).toLowerCase()),
  }));
}

function tokenise(str) {
  return (str || "").toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function matchScore(inv, scenario) {
  const invWords = new Set([...tokenise(inv.name), ...inv.tags, ...tokenise(inv.sector)]);
  const scWords  = new Set([...tokenise(scenario.name), ...scenario.tags, ...tokenise(scenario.kind)]);
  let hits = 0;
  for (const w of scWords) {
    if (invWords.has(w)) hits++;
  }
  return hits;
}

function classify(investments, scenarios) {
  return investments.map(inv => {
    const matched = scenarios
      .map(s => ({ ...s, score: matchScore(inv, s) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...inv, matched, mapped: matched.length > 0 };
  });
}

export async function buildInvscnScript() {
  let investments = [], scenarios = [];
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [ir, sr] = await Promise.all([
      fetch(`${base}/entities/Investment`,  { headers: hdr }),
      fetch(`${base}/v1/scenario/list`,     { headers: hdr }),
    ]);
    if (ir.ok) investments = normaliseInvestments(await ir.json());
    if (sr.ok) scenarios   = normaliseScenarios(await sr.json());
  } catch (_) {}

  if (!investments.length) return "Unable to retrieve investment scenario coverage data at this time, sir.";

  const rows     = classify(investments, scenarios);
  const mapped   = rows.filter(r => r.mapped).length;
  const uncovered = rows.length - mapped;
  const pct      = rows.length ? Math.round((mapped / rows.length) * 100) : 0;

  const parts = [
    `Investment scenario coverage: ${investments.length} portfolio position${investments.length !== 1 ? "s" : ""} cross-referenced against ${scenarios.length} available simulation scenario${scenarios.length !== 1 ? "s" : ""}.`,
    `${mapped} investment${mapped !== 1 ? "s are" : " is"} SCENARIO-MAPPED — ${pct}% coverage.`,
  ];
  if (uncovered > 0) {
    const top = rows.filter(r => !r.mapped).slice(0, 2).map(r => r.name).join(", ");
    parts.push(`${uncovered} investment${uncovered !== 1 ? "s have" : " has"} no scenario coverage — unplanned exposure. Top uncovered: ${top}.`);
  } else {
    parts.push("All investments have at least one matching simulation scenario, sir.");
  }

  return parts.join(" ");
}

export default function InvestmentScenarioExposure() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [scCount,   setScCount]   = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [lastTs,    setLastTs]    = useState(null);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [ir, sr] = await Promise.all([
        fetch(`${base}/entities/Investment`,  { headers: hdr }),
        fetch(`${base}/v1/scenario/list`,     { headers: hdr }),
      ]);
      const investments = ir.ok ? normaliseInvestments(await ir.json()) : [];
      const scenarios   = sr.ok ? normaliseScenarios(await sr.json())   : [];
      setScCount(scenarios.length);
      setRows(classify(investments, scenarios));
      setLastTs(Date.now());
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, POLL_MS);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (INVSCN_RE.test(q)) { setOpen(true); load(); }
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:invscn-toggle", onToggle);
    return () => window.removeEventListener("jarvis:invscn-toggle", onToggle);
  }, []);

  const mapped    = rows.filter(r => r.mapped).length;
  const uncovered = rows.length - mapped;
  const pct       = rows.length ? Math.round((mapped / rows.length) * 100) : 0;

  const filtered = rows.filter(r => {
    if (tab === "MAPPED")    return r.mapped;
    if (tab === "UNCOVERED") return !r.mapped;
    if (search) {
      const q = search.toLowerCase();
      return r.name.toLowerCase().includes(q) || r.sector.includes(q);
    }
    return true;
  }).filter(r => {
    if (tab === "ALL" && search) {
      const q = search.toLowerCase();
      return r.name.toLowerCase().includes(q) || r.sector.includes(q);
    }
    return true;
  });

  const ts = lastTs ? new Date(lastTs).toLocaleTimeString("en-GB", { hour12: false }) : null;

  async function assess() {
    setAssessing(true); setBrief("");
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message: `INVSCN assessment: ${rows.length} investments cross-referenced against ${scCount} scenarios. ${mapped} are SCENARIO-MAPPED (${pct}% coverage); ${uncovered} have no coverage. In 2 sentences, identify the most strategically exposed uncovered investments and recommend which scenario types are needed to close the planning gap.`,
        }),
      });
      const d = await r.json();
      setBrief((d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim());
    } catch (_) {
      setBrief("Assessment unavailable — check agent endpoint.");
    }
    setAssessing(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Investment × Scenario Exposure Monitor — F489"
        style={{
          position: "fixed", left: 17800, bottom: 8, zIndex: 79,
          background: open ? CY + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${open ? CY : CY + "44"}`,
          borderRadius: 8,
          color: open ? "#04060A" : CY,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${CY}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>◈</span>
        INVSCN
        {uncovered > 0 && (
          <span style={{
            background: ORG + "33", color: ORG,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {uncovered}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 79,
          width: "min(640px,96vw)", maxHeight: "min(700px,84vh)",
          background: "rgba(4,6,14,0.97)",
          border: `1px solid ${CY}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%",
              background: CY, boxShadow: `0 0 10px ${CY}`,
              display: "inline-block",
              animation: loading ? "invscnpulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: CY, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              INVESTMENT × SCENARIO EXPOSURE
            </span>
            <span style={{ marginLeft: "auto", color: DIM, fontSize: 9 }}>
              {loading ? "SYNCING" : ts ? `UPDATED ${ts}` : "—"} · {POLL_MS / 1000}s
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: DIM,
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>✕</button>
          </div>

          {/* Stats tiles */}
          <div style={{
            display: "flex", gap: 8, padding: "10px 14px",
            borderBottom: `1px solid ${CY}11`,
          }}>
            {[
              { label: "INVESTMENTS", val: rows.length,   col: CY },
              { label: "SCENARIOS",   val: scCount,       col: "#A78BFA" },
              { label: "MAPPED",      val: mapped,        col: GRN },
              { label: "UNCOVERED",   val: uncovered,     col: uncovered > 0 ? ORG : DIM },
              { label: "COVERAGE",    val: `${pct}%`,     col: pct >= 80 ? GRN : pct >= 50 ? ORG : RED },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                flex: 1, background: "rgba(255,255,255,0.03)",
                border: `1px solid ${col}22`, borderRadius: 8,
                padding: "8px 6px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 14, fontWeight: 900 }}>{val}</div>
                <div style={{ color: DIM, fontSize: 7, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search + assess */}
          <div style={{
            display: "flex", gap: 6, padding: "8px 14px",
            borderBottom: `1px solid ${CY}11`, flexWrap: "wrap",
          }}>
            {["ALL", "MAPPED", "UNCOVERED"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? CY + "22" : "none",
                border: `1px solid ${tab === t ? CY + "88" : CY + "22"}`,
                borderRadius: 6, color: tab === t ? CY : DIM,
                cursor: "pointer", padding: "4px 10px",
                fontSize: 9, letterSpacing: 1, fontWeight: 700,
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                background: "rgba(255,255,255,0.04)", border: `1px solid ${CY}22`,
                borderRadius: 6, color: "#DCEBF5", padding: "4px 8px",
                fontSize: 9, outline: "none", width: 90,
              }}
            />
            <button onClick={assess} disabled={assessing} style={{
              marginLeft: "auto",
              background: assessing ? CY + "33" : "none",
              border: `1px solid ${CY}55`, borderRadius: 6,
              color: CY, cursor: assessing ? "not-allowed" : "pointer",
              padding: "4px 10px", fontSize: 9, letterSpacing: 1,
            }}>
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* Brief */}
          {brief && (
            <div style={{
              padding: "8px 14px", borderBottom: `1px solid ${CY}11`,
              color: "#DCEBF5", fontSize: 11, lineHeight: 1.55,
              background: "rgba(41,231,255,0.04)",
            }}>{brief}</div>
          )}

          {/* Investment list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
            {loading && !rows.length ? (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
                Loading investment scenario coverage…
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
                No investments match this filter.
              </div>
            ) : filtered.map(row => (
              <div key={row.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                  style={{
                    background: row.mapped ? "rgba(0,229,160,0.05)" : "rgba(255,140,66,0.05)",
                    border: `1px solid ${row.mapped ? GRN + "33" : ORG + "22"}`,
                    borderRadius: 8, padding: "8px 12px",
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                  }}
                >
                  <span style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: row.mapped ? GRN : ORG,
                    boxShadow: `0 0 6px ${row.mapped ? GRN : ORG}`,
                    flexShrink: 0,
                  }} />
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1, wordBreak: "break-word" }}>
                    {row.name}
                  </span>
                  {row.sector && (
                    <span style={{
                      fontSize: 8, color: DIM,
                      background: "rgba(255,255,255,0.04)",
                      borderRadius: 4, padding: "1px 5px", flexShrink: 0,
                    }}>
                      {row.sector}
                    </span>
                  )}
                  <span style={{
                    fontSize: 8, letterSpacing: 1, fontWeight: 700,
                    color: row.mapped ? GRN : ORG,
                    background: (row.mapped ? GRN : ORG) + "22",
                    borderRadius: 4, padding: "2px 6px", flexShrink: 0,
                  }}>
                    {row.mapped ? `${row.matched.length} SCENARIO${row.matched.length !== 1 ? "S" : ""}` : "UNCOVERED"}
                  </span>
                  <span style={{ color: DIM, fontSize: 9, flexShrink: 0 }}>
                    {expanded === row.id ? "▲" : "▼"}
                  </span>
                </div>

                {expanded === row.id && (
                  <div style={{
                    background: "rgba(255,255,255,0.02)", borderRadius: "0 0 8px 8px",
                    border: `1px solid ${CY}11`, borderTop: "none",
                    padding: "8px 12px",
                  }}>
                    {row.mapped ? (
                      <>
                        <div style={{ color: GRN, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          MATCHED SCENARIOS:
                        </div>
                        {row.matched.map(s => (
                          <div key={s.id} style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "4px 0", borderBottom: `1px solid ${CY}09`,
                          }}>
                            {s.kind && (
                              <span style={{
                                fontSize: 8, color: "#A78BFA",
                                background: "#A78BFA22",
                                borderRadius: 4, padding: "1px 5px", flexShrink: 0,
                              }}>{s.kind}</span>
                            )}
                            <span style={{ color: "#DCEBF5", fontSize: 10 }}>{s.name}</span>
                            <span style={{ color: DIM, fontSize: 9, marginLeft: "auto" }}>
                              {s.score} hit{s.score !== 1 ? "s" : ""}
                            </span>
                          </div>
                        ))}
                      </>
                    ) : (
                      <div style={{ color: ORG, fontSize: 10, fontStyle: "italic" }}>
                        No simulation scenario covers this investment — no contingency plan exists.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{
            padding: "6px 14px", borderTop: `1px solid ${CY}11`,
            color: DIM, fontSize: 9, letterSpacing: 1,
          }}>
            /entities/Investment · /v1/scenario/list · /v1/jarvis/agent/chat
          </div>
        </div>
      )}

      <style>{`@keyframes invscnpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.4)}}`}</style>
    </>
  );
}
