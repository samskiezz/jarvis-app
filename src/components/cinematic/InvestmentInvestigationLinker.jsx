import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3D5A";
const BTN_LEFT   = 49720;
const REFRESH_MS = 90 * 1000;
const API_KEY    = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── normalisation helpers ────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object") {
    const first = Object.values(raw).find(Array.isArray);
    if (first) return first;
  }
  return [];
}

function normaliseInvestments(raw) {
  return normaliseArray(raw).map((r) => ({
    id:          r.id || r._id || String(Math.random()),
    name:        r.name || r.title || r.symbol || r.ticker || "Unnamed",
    type:        r.type || r.asset_type || r.category || "",
    sector:      r.sector || r.industry || "",
    description: r.description || r.notes || r.summary || "",
    ticker:      r.ticker || r.symbol || r.code || "",
    tags:        Array.isArray(r.tags) ? r.tags.join(" ") : (r.tags || ""),
    value:       r.value || r.amount || r.current_value || null,
  }));
}

function normaliseInvestigations(raw) {
  return normaliseArray(raw).map((r) => ({
    id:          r.id || r._id || String(Math.random()),
    title:       r.title || r.name || r.case_name || "Untitled",
    description: r.description || r.summary || r.notes || "",
    status:      r.status || r.state || "open",
    priority:    r.priority || r.severity || "medium",
    subject:     r.subject || r.target || r.entity || "",
    tags:        Array.isArray(r.tags) ? r.tags.join(" ") : (r.tags || ""),
  }));
}

// ── keyword correlation ──────────────────────────────────────────────────────

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function matchScore(investment, inv) {
  const iKw = new Set(
    keywords(`${investment.name} ${investment.type} ${investment.sector} ${investment.description} ${investment.ticker} ${investment.tags}`)
  );
  const qKw = keywords(
    `${inv.title} ${inv.description} ${inv.subject} ${inv.tags}`
  );
  return qKw.filter((k) => iKw.has(k)).length;
}

function correlate(investments, investigations) {
  return investments.map((inv) => {
    const matches = investigations
      .map((q) => ({ ...q, score: matchScore(inv, q) }))
      .filter((q) => q.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...inv, matched: matches };
  });
}

// ── voice trigger exports ────────────────────────────────────────────────────

export function isInvInvlQuery(q) {
  return /invest.{0,20}invest|invest.{0,20}case|portfolio.{0,20}invest|which.{0,15}invest|invl/i.test(q);
}

export async function buildInvInvlScript() {
  try {
    const base = apiBase();
    const headers = { Authorization: `Bearer ${API_KEY}` };
    const [invRes, invlRes] = await Promise.all([
      fetch(`${base}/entities/Investment`, { headers }),
      fetch(`${base}/v1/investigations`,   { headers }),
    ]);
    const investments   = normaliseInvestments(await invRes.json());
    const investigations = normaliseInvestigations(await invlRes.json());
    const linked   = correlate(investments, investigations);
    const exposed  = linked.filter((i) => i.matched.length > 0);
    const clear    = linked.filter((i) => i.matched.length === 0);
    if (!linked.length) return "No investment data available for investigation exposure check.";
    const lines = exposed.slice(0, 5).map(
      (i) => `${i.name} appears in ${i.matched.length} investigation(s) (top: ${i.matched[0].title})`
    );
    return (
      `Investment investigation exposure: ${exposed.length} holdings implicated in open cases, ` +
      `${clear.length} clear. ` +
      (lines.length ? lines.join(". ") + "." : "")
    );
  } catch {
    return "Investment investigation exposure data unavailable.";
  }
}

// ── component ────────────────────────────────────────────────────────────────

export default function InvestmentInvestigationLinker() {
  const [visible,       setVisible]       = useState(false);
  const [investments,   setInvestments]   = useState([]);
  const [investigations,setInvestigations]= useState([]);
  const [loading,       setLoading]       = useState(false);
  const [tab,           setTab]           = useState("ALL");      // ALL | IMPLICATED | CLEAR
  const [query,         setQuery]         = useState("");
  const [expanded,      setExpanded]      = useState(null);
  const [assessing,     setAssessing]     = useState(null);
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const base    = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [invRes, invlRes] = await Promise.all([
        fetch(`${base}/entities/Investment`, { headers }),
        fetch(`${base}/v1/investigations`,   { headers }),
      ]);
      const raw_inv  = invRes.ok  ? await invRes.json()  : [];
      const raw_invl = invlRes.ok ? await invlRes.json() : [];
      setInvestments(normaliseInvestments(raw_inv));
      setInvestigations(normaliseInvestigations(raw_invl));
    } catch (_) {
      // silent — stale data shown
    } finally {
      setLoading(false);
    }
  }, []);

  // toggle listener
  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:inv-invl-toggle", onToggle);
    return () => window.removeEventListener("jarvis:inv-invl-toggle", onToggle);
  }, []);

  // fetch + poll when visible
  useEffect(() => {
    if (!visible) {
      clearInterval(timerRef.current);
      return;
    }
    fetchData();
    timerRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [visible, fetchData]);

  const linked     = correlate(investments, investigations);
  const implicated = linked.filter((i) => i.matched.length > 0);
  const clear      = linked.filter((i) => i.matched.length === 0);

  const displayed = linked
    .filter((i) => {
      if (tab === "IMPLICATED") return i.matched.length > 0;
      if (tab === "CLEAR")      return i.matched.length === 0;
      return true;
    })
    .filter((i) =>
      !query ||
      i.name.toLowerCase().includes(query.toLowerCase()) ||
      i.sector.toLowerCase().includes(query.toLowerCase()) ||
      i.ticker.toLowerCase().includes(query.toLowerCase())
    );

  async function assessHolding(inv) {
    setAssessing(inv.id);
    try {
      const base = apiBase();
      const caseNames = inv.matched.slice(0, 3).map((m) => m.title).join(", ");
      const prompt    = `In 2 sentences, assess the investigation exposure risk for the investment holding "${inv.name}" (${inv.ticker || inv.type}), implicated in the following open cases: ${caseNames || "none"}. What is the risk level and recommended action?`;
      const res       = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const data    = res.ok ? await res.json() : {};
      const content = data.response || data.content || data.message || data.text || "No assessment.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: content } }));
    } catch (_) {
      // silent
    } finally {
      setAssessing(null);
    }
  }

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        title="Investment × Investigation Exposure"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 100,
          background: "rgba(5,10,18,0.82)", border: `1px solid ${CY}55`,
          color: CY, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 10, letterSpacing: 1, padding: "4px 9px",
          borderRadius: 6, cursor: "pointer",
          boxShadow: `0 0 10px ${CY}22`,
        }}
      >
        {implicated.length > 0 && (
          <span style={{
            background: RED, color: "#fff", borderRadius: "50%",
            fontSize: 8, padding: "1px 4px", marginRight: 4,
          }}>
            {implicated.length}
          </span>
        )}
        ◆ INVL
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 48, left: BTN_LEFT - 540, zIndex: 100,
      width: 580, maxHeight: "72vh",
      background: "rgba(5,10,18,0.97)", border: `1px solid ${CY}44`,
      borderRadius: 14, overflow: "hidden",
      boxShadow: `0 0 60px ${CY}18, 0 24px 48px rgba(0,0,0,0.8)`,
      fontFamily: "'JetBrains Mono',monospace",
      display: "flex", flexDirection: "column",
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px", borderBottom: `1px solid ${CY}33`,
      }}>
        <span style={{ color: CY, fontSize: 13 }}>◆</span>
        <span style={{ color: CY, fontSize: 12, letterSpacing: 2, flex: 1 }}>
          INVESTMENT × INVESTIGATION EXPOSURE
        </span>
        {loading && <span style={{ color: AMBER, fontSize: 9 }}>LOADING…</span>}
        <button
          onClick={fetchData}
          style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 12 }}
          title="Refresh"
        >⟳</button>
        <button
          onClick={() => setVisible(false)}
          style={{ background: "none", border: "none", color: "#4E6070", cursor: "pointer", fontSize: 14 }}
        >✕</button>
      </div>

      {/* stat tiles */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4,1fr)",
        gap: 6, padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
      }}>
        {[
          ["HOLDINGS",    linked.length,       CY],
          ["CASES",       investigations.length, AMBER],
          ["IMPLICATED",  implicated.length,   RED],
          ["CLEAR",       clear.length,        GREEN],
        ].map(([lbl, val, col]) => (
          <div key={lbl} style={{
            background: `${col}12`, border: `1px solid ${col}33`,
            borderRadius: 8, padding: "8px 10px", textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* filter tabs + search */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "8px 14px", borderBottom: `1px solid ${CY}22`,
      }}>
        {["ALL","IMPLICATED","CLEAR"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? `${CY}22` : "transparent",
              border: `1px solid ${tab === t ? CY : "#2E4050"}`,
              color: tab === t ? CY : "#4E6070",
              borderRadius: 5, padding: "3px 8px",
              fontSize: 9, letterSpacing: 1, cursor: "pointer",
            }}
          >{t}</button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search holdings…"
          style={{
            flex: 1, background: "rgba(41,231,255,0.06)",
            border: `1px solid ${CY}33`, borderRadius: 5,
            color: "#DCEBF5", fontSize: 10, padding: "3px 8px",
            outline: "none", fontFamily: "inherit",
          }}
        />
      </div>

      {/* holdings list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {displayed.length === 0 ? (
          <div style={{ padding: 20, color: "#4E6070", fontSize: 11, textAlign: "center" }}>
            {loading ? "Fetching investment exposure data…" : "No holdings match the current filter."}
          </div>
        ) : displayed.map((inv) => {
          const isExp    = expanded === inv.id;
          const exposed  = inv.matched.length > 0;
          const rowColor = exposed ? RED : GREEN;
          return (
            <div key={inv.id} style={{ borderBottom: `1px solid ${CY}18` }}>
              <div
                onClick={() => setExpanded(isExp ? null : inv.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 14px", cursor: "pointer",
                  background: isExp ? `${CY}0A` : "transparent",
                }}
              >
                {/* status dot */}
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: rowColor, flexShrink: 0,
                  boxShadow: `0 0 6px ${rowColor}`,
                }} />

                {/* name + meta */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#DCEBF5", fontSize: 12, letterSpacing: 0.5 }}>
                    {inv.name}
                    {inv.ticker && (
                      <span style={{ color: CY, fontSize: 9, marginLeft: 6, opacity: 0.7 }}>
                        {inv.ticker}
                      </span>
                    )}
                  </div>
                  {inv.sector && (
                    <div style={{ color: "#4E6070", fontSize: 9, marginTop: 1 }}>{inv.sector}</div>
                  )}
                </div>

                {/* case count badge */}
                {exposed && (
                  <span style={{
                    background: `${RED}22`, border: `1px solid ${RED}55`,
                    color: RED, borderRadius: 4,
                    fontSize: 9, padding: "2px 6px", flexShrink: 0,
                  }}>
                    {inv.matched.length} case{inv.matched.length !== 1 ? "s" : ""}
                  </span>
                )}
                {!exposed && (
                  <span style={{
                    background: `${GREEN}22`, border: `1px solid ${GREEN}44`,
                    color: GREEN, borderRadius: 4,
                    fontSize: 9, padding: "2px 6px", flexShrink: 0,
                  }}>CLEAR</span>
                )}

                <span style={{ color: "#2E4050", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {/* expanded — matched investigations */}
              {isExp && (
                <div style={{ padding: "0 14px 12px 32px" }}>
                  {inv.description && (
                    <div style={{
                      color: "#4E6070", fontSize: 10,
                      marginBottom: 8, lineHeight: 1.5,
                    }}>
                      {inv.description.slice(0, 180)}{inv.description.length > 180 ? "…" : ""}
                    </div>
                  )}

                  {/* matched investigations */}
                  {inv.matched.length > 0 ? inv.matched.slice(0, 5).map((m) => (
                    <div key={m.id} style={{
                      background: `${RED}0D`, border: `1px solid ${RED}33`,
                      borderRadius: 6, padding: "7px 10px", marginBottom: 6,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          background: m.status === "open" ? `${AMBER}22` : `${CY}22`,
                          border: `1px solid ${m.status === "open" ? AMBER : CY}55`,
                          color: m.status === "open" ? AMBER : CY,
                          fontSize: 8, padding: "1px 5px", borderRadius: 3,
                        }}>
                          {m.status.toUpperCase()}
                        </span>
                        <span style={{
                          background: m.priority === "high" || m.priority === "critical"
                            ? `${RED}22` : `${CY}11`,
                          border: `1px solid ${m.priority === "high" || m.priority === "critical"
                            ? RED : CY}44`,
                          color: m.priority === "high" || m.priority === "critical" ? RED : CY,
                          fontSize: 8, padding: "1px 5px", borderRadius: 3,
                        }}>
                          {m.priority.toUpperCase()}
                        </span>
                        <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>{m.title}</span>
                      </div>
                      {/* relevance bar */}
                      <div style={{
                        height: 2, background: `${CY}22`, borderRadius: 1,
                        marginTop: 6, overflow: "hidden",
                      }}>
                        <div style={{
                          width: `${Math.min(100, m.score * 14)}%`,
                          height: "100%", background: RED, borderRadius: 1,
                        }} />
                      </div>
                    </div>
                  )) : (
                    <div style={{ color: GREEN, fontSize: 10, padding: "6px 0" }}>
                      No investigation keywords overlap detected.
                    </div>
                  )}

                  {/* assess button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); assessHolding(inv); }}
                    disabled={assessing === inv.id}
                    style={{
                      marginTop: 8,
                      background: assessing === inv.id ? `${CY}18` : `${CY}22`,
                      border: `1px solid ${CY}55`, color: CY,
                      borderRadius: 5, padding: "5px 12px",
                      fontSize: 10, letterSpacing: 1, cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {assessing === inv.id ? "ASSESSING…" : "▶ ASSESS"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{
        borderTop: `1px solid ${CY}1A`, padding: "6px 14px",
        display: "flex", gap: 14,
        color: "#2E4050", fontSize: 9, letterSpacing: 1,
      }}>
        <span>{displayed.length} of {linked.length} holding{linked.length !== 1 ? "s" : ""}</span>
        <span style={{ marginLeft: "auto" }}>
          auto-refresh {REFRESH_MS / 1000}s
        </span>
      </div>

      <style>{`
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${CY}33; border-radius: 2px; }
      `}</style>
    </div>
  );
}
