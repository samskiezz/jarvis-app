/**
 * F184 — Graph Nodes × Contact × RiskSignal — Network Threat Attribution (NGTA)
 *
 * Parallel-fetches /v1/graph/centrality + /entities/Contact + /entities/RiskSignal every 90 s.
 * Keyword-correlates each high-centrality graph node against contacts AND risk signals:
 *
 *   FULLY_ATTRIBUTED — matched ≥1 contact AND ≥1 risk signal
 *   CONTACT_KNOWN    — contact matched, no risk signal
 *   RISK_FLAGGED     — risk signal matched, no contact attribution
 *   UNKNOWN          — neither — a network node with no owner or threat context
 *
 * Stat tiles: nodes / contacts / risk signals / attributed / unknown
 * Filter tabs: ALL | FULLY_ATTRIBUTED | CONTACT_KNOWN | RISK_FLAGGED | UNKNOWN
 * Text search on node id / label / type.
 * Expand row → matched contacts (cyan bars) + matched risk signals (red bars).
 * Red badge + pulse on UNKNOWN count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence attribution brief + TTS.
 *
 * Toggle:  ◈ NGTA  at bottom:8 left:977680, zIndex:685.
 * Event:   jarvis:ngta-toggle
 * Voice:   "ngta / network attribution / graph attribution / threat node /
 *           unknown node / graph threat / node attribution / network threat
 *           attribution / attributed node / graph contact risk"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const BTN_LEFT = 977_680;
const POLL_MS  = 90_000;
const CY       = "#29E7FF";
const RED      = "#FF2244";
const AMBER    = "#FFB020";
const GREEN    = "#7FEFB4";
const MONO     = "'JetBrains Mono',monospace";

const API_KEY =
  (typeof window !== "undefined" && window.__JARVIS_API_KEY__) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function apiBase() {
  if (typeof window !== "undefined" && window.__JARVIS_API_BASE__) return window.__JARVIS_API_BASE__;
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    return `${window.location.protocol}//${window.location.hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── Exported intent helpers ───────────────────────────────────────────────────

const NGTA_RE =
  /\b(ngta|network\s+attribution|graph\s+attribution|threat\s+node|unknown\s+node|graph\s+threat|node\s+attribution|network\s+threat\s+attribution|attributed\s+node|graph\s+contact\s+risk)\b/i;

export function isNgtaQuery(q) {
  return NGTA_RE.test(q || "");
}

export async function buildNgtaScript() {
  const base = apiBase();
  const h = { Authorization: `Bearer ${API_KEY}` };
  try {
    const [gr, cr, rr] = await Promise.allSettled([
      fetch(`${base}/v1/graph/centrality`, { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/entities/Contact?limit=200`, { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/entities/RiskSignal?limit=200`, { headers: h }).then(r => r.ok ? r.json() : []),
    ]);
    const nodes    = toArr(gr.value);
    const contacts = toArr(cr.value);
    const risks    = toArr(rr.value);
    let unknown = 0;
    nodes.forEach(node => {
      const kws = keywords(node);
      const hasContact = contacts.some(c => matchKws(kws, c));
      const hasRisk    = risks.some(r => matchKws(kws, r));
      if (!hasContact && !hasRisk) unknown++;
    });
    return `Network Threat Attribution Audit: ${nodes.length} graph nodes assessed against ${contacts.length} contacts and ${risks.length} risk signals. ${unknown} nodes have no attribution or threat context and may represent blind spots in network coverage.`;
  } catch {
    return "NGTA assessment unavailable.";
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function toArr(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (Array.isArray(v.nodes)) return v.nodes;
  if (Array.isArray(v.items)) return v.items;
  if (Array.isArray(v.results)) return v.results;
  if (Array.isArray(v.data)) return v.data;
  return [];
}

function txt(obj) {
  return [
    obj?.id, obj?.label, obj?.name, obj?.title,
    obj?.type, obj?.description, obj?.summary,
    obj?.category, obj?.entity_type,
  ].filter(Boolean).join(" ").toLowerCase();
}

function keywords(node) {
  const raw = txt(node);
  return raw.split(/\W+/).filter(w => w.length > 3);
}

function matchKws(kws, item) {
  if (!kws.length) return false;
  const haystack = txt(item);
  return kws.some(k => haystack.includes(k));
}

function classify(node, contacts, risks) {
  const kws = keywords(node);
  const hasContact = contacts.some(c => matchKws(kws, c));
  const hasRisk    = risks.some(r => matchKws(kws, r));
  if (hasContact && hasRisk) return "FULLY_ATTRIBUTED";
  if (hasContact)            return "CONTACT_KNOWN";
  if (hasRisk)               return "RISK_FLAGGED";
  return "UNKNOWN";
}

const CLASS_COLORS = {
  FULLY_ATTRIBUTED: CY,
  CONTACT_KNOWN:    GREEN,
  RISK_FLAGGED:     AMBER,
  UNKNOWN:          RED,
};

const CLASS_ORDER = ["FULLY_ATTRIBUTED", "CONTACT_KNOWN", "RISK_FLAGGED", "UNKNOWN"];

// ── Component ─────────────────────────────────────────────────────────────────

export default function NetworkThreatAttribution() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [contactCount, setConCt]  = useState(0);
  const [riskCount, setRiskCt]    = useState(0);
  const [filter, setFilter]       = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const base = apiBase();
      const h = { Authorization: `Bearer ${API_KEY}` };
      const [gr, cr, rr] = await Promise.allSettled([
        fetch(`${base}/v1/graph/centrality`, { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/entities/Contact?limit=200`, { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/entities/RiskSignal?limit=200`, { headers: h }).then(r => r.ok ? r.json() : []),
      ]);
      const nodes    = toArr(gr.value);
      const contacts = toArr(cr.value);
      const risks    = toArr(rr.value);
      setConCt(contacts.length);
      setRiskCt(risks.length);
      setRows(nodes.map(node => ({
        node,
        cls: classify(node, contacts, risks),
        matchedContacts: contacts.filter(c => matchKws(keywords(node), c)).slice(0, 5),
        matchedRisks:    risks.filter(r => matchKws(keywords(node), r)).slice(0, 5),
      })));
    } catch {}
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (isNgtaQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ngta-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:ngta-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  async function assess() {
    setAssessing(true);
    setAssessment("");
    try {
      const script = await buildNgtaScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const ans = (d.answer || d.response || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessment(ans || script);
      window.dispatchEvent(new CustomEvent("jarvis:tts", { detail: { text: ans || script } }));
    } catch {
      const fallback = await buildNgtaScript();
      setAssessment(fallback);
    }
    setAssessing(false);
  }

  const unknownCount = rows.filter(r => r.cls === "UNKNOWN").length;

  const displayRows = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const hay = txt(r.node);
      return hay.includes(search.toLowerCase());
    }
    return true;
  });

  const stats = CLASS_ORDER.reduce((acc, cls) => {
    acc[cls] = rows.filter(r => r.cls === cls).length;
    return acc;
  }, {});

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Network Threat Attribution"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 685,
          background: open ? RED + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${unknownCount > 0 ? RED : "#334F62"}88`,
          borderRadius: 8, padding: "3px 8px", cursor: "pointer",
          color: open ? "#fff" : unknownCount > 0 ? RED : CY,
          fontFamily: MONO, fontSize: 9, letterSpacing: 1,
          boxShadow: unknownCount > 0 ? `0 0 10px ${RED}44` : "none",
          animation: unknownCount > 0 ? "ngta-pulse 2s infinite" : "none",
        }}
      >
        ◈ NGTA{unknownCount > 0 ? ` ${unknownCount}!` : ""}
      </button>
      <style>{`
        @keyframes ngta-pulse {
          0%,100% { box-shadow: 0 0 10px ${RED}44; }
          50%      { box-shadow: 0 0 20px ${RED}88; }
        }
      `}</style>

      {open && (
        <div style={{
          position: "fixed", left: Math.max(8, BTN_LEFT - 340), bottom: 36, zIndex: 685,
          width: 360, maxHeight: "70vh", display: "flex", flexDirection: "column",
          background: "rgba(6,10,18,0.94)", border: `1px solid ${CY}33`,
          borderRadius: 12, overflow: "hidden",
          backdropFilter: "blur(12px)", boxShadow: `0 0 40px ${RED}22`,
          fontFamily: MONO,
        }}>
          {/* Header */}
          <div style={{
            padding: "8px 12px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ color: CY, fontSize: 10, letterSpacing: 2 }}>◈ NGTA</span>
            <span style={{ color: "#334F62", fontSize: 9 }}>network threat attribution</span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#334F62",
              cursor: "pointer", fontSize: 13, lineHeight: 1,
            }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "flex", gap: 6, padding: "6px 10px",
            borderBottom: `1px solid ${CY}11`, flexWrap: "wrap",
          }}>
            {[
              ["NODES",     rows.length,    CY],
              ["CONTACTS",  contactCount,   GREEN],
              ["RISKS",     riskCount,      AMBER],
              ["ATTRIBUTED", stats.FULLY_ATTRIBUTED, CY],
              ["UNKNOWN",   unknownCount,   RED],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: "rgba(255,255,255,0.03)", border: `1px solid ${col}33`,
                borderRadius: 6, padding: "3px 7px", textAlign: "center", minWidth: 54,
              }}>
                <div style={{ color: col, fontSize: 13, fontWeight: 700 }}>{val}</div>
                <div style={{ color: "#334F62", fontSize: 8 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{
            display: "flex", gap: 4, padding: "4px 8px",
            borderBottom: `1px solid ${CY}11`, flexWrap: "wrap",
          }}>
            {["ALL", ...CLASS_ORDER].map(cls => (
              <button key={cls} onClick={() => setFilter(cls)} style={{
                background: filter === cls ? `${CLASS_COLORS[cls] || CY}22` : "transparent",
                border: `1px solid ${filter === cls ? (CLASS_COLORS[cls] || CY) : "#1A2A38"}`,
                borderRadius: 4, padding: "2px 7px", cursor: "pointer",
                color: filter === cls ? (CLASS_COLORS[cls] || CY) : "#334F62",
                fontSize: 8, letterSpacing: 0.5,
              }}>{cls === "ALL" ? `ALL (${rows.length})` : `${cls} (${stats[cls] || 0})`}</button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "4px 10px", borderBottom: `1px solid ${CY}11` }}>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search nodes…"
              style={{
                width: "100%", background: "rgba(41,231,255,0.04)",
                border: `1px solid ${CY}22`, borderRadius: 5,
                padding: "4px 8px", color: CY, fontSize: 10,
                fontFamily: MONO, outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {displayRows.length === 0 ? (
              <div style={{ padding: "16px", color: "#334F62", fontSize: 10, textAlign: "center" }}>
                {rows.length === 0 ? "loading…" : "no matches"}
              </div>
            ) : displayRows.map((row, i) => {
              const { node, cls, matchedContacts, matchedRisks } = row;
              const col   = CLASS_COLORS[cls];
              const label = node?.label || node?.name || node?.id || `Node ${i + 1}`;
              const ntype = node?.type || node?.entity_type || "";
              const isExp = expanded === i;
              return (
                <div key={i} style={{
                  borderBottom: `1px solid ${CY}0A`, cursor: "pointer",
                  background: isExp ? "rgba(41,231,255,0.04)" : "transparent",
                }} onClick={() => setExpanded(isExp ? null : i)}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 10px",
                  }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: col, flexShrink: 0,
                      boxShadow: cls === "UNKNOWN" ? `0 0 6px ${RED}` : "none",
                    }} />
                    <span style={{
                      flex: 1, color: "#DCEBF5", fontSize: 10,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{label}</span>
                    {ntype && (
                      <span style={{ color: "#334F62", fontSize: 8, flexShrink: 0 }}>
                        {ntype.slice(0, 12).toUpperCase()}
                      </span>
                    )}
                    <span style={{ color: col, fontSize: 8, flexShrink: 0 }}>{cls}</span>
                    <span style={{ color: "#334F62", fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
                  </div>
                  {isExp && (
                    <div style={{ padding: "4px 12px 8px" }}>
                      {node?.description && (
                        <div style={{ color: "#5A7A90", fontSize: 9, marginBottom: 6, lineHeight: 1.4 }}>
                          {node.description.slice(0, 120)}
                        </div>
                      )}
                      {/* Contacts */}
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ color: GREEN, fontSize: 8, marginBottom: 3 }}>
                          CONTACTS ({matchedContacts.length})
                        </div>
                        {matchedContacts.length === 0
                          ? <div style={{ color: "#334F62", fontSize: 9 }}>none</div>
                          : matchedContacts.map((c, ci) => (
                            <div key={ci} style={{ marginBottom: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <div style={{
                                  height: 4, borderRadius: 2, background: GREEN,
                                  width: `${Math.min(100, 50 + ci * 10)}%`, maxWidth: "80%",
                                }} />
                              </div>
                              <div style={{ color: "#5A7A90", fontSize: 8, marginTop: 1 }}>
                                {(c?.name || c?.title || c?.id || "Contact").slice(0, 50)}
                              </div>
                            </div>
                          ))
                        }
                      </div>
                      {/* Risk Signals */}
                      <div>
                        <div style={{ color: RED, fontSize: 8, marginBottom: 3 }}>
                          RISK SIGNALS ({matchedRisks.length})
                        </div>
                        {matchedRisks.length === 0
                          ? <div style={{ color: "#334F62", fontSize: 9 }}>none</div>
                          : matchedRisks.map((rs, ri) => (
                            <div key={ri} style={{ marginBottom: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <div style={{
                                  height: 4, borderRadius: 2, background: RED,
                                  width: `${Math.min(100, 50 + ri * 10)}%`, maxWidth: "80%",
                                }} />
                              </div>
                              <div style={{ color: "#5A7A90", fontSize: 8, marginTop: 1 }}>
                                {(rs?.title || rs?.name || rs?.id || "Risk").slice(0, 50)}
                              </div>
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Assess */}
          <div style={{ padding: "8px 12px", borderTop: `1px solid ${CY}11` }}>
            <button onClick={assess} disabled={assessing} style={{
              background: assessing ? "rgba(41,231,255,0.06)" : `${CY}12`,
              border: `1px solid ${CY}44`, borderRadius: 5, padding: "4px 12px",
              cursor: assessing ? "default" : "pointer",
              color: CY, fontSize: 10, fontFamily: MONO, letterSpacing: 1,
            }}>
              {assessing ? "⟳ assessing…" : "▶ ASSESS"}
            </button>
            {assessment && (
              <div style={{
                marginTop: 8, padding: "7px 10px",
                background: "rgba(41,231,255,0.04)",
                border: `1px solid ${CY}22`, borderRadius: 6,
                fontSize: 11, color: "#DCEBF5", lineHeight: 1.5,
              }}>
                {assessment}
              </div>
            )}
          </div>

          <div style={{ padding: "4px 12px 6px", color: "#334F62", fontSize: 9 }}>
            auto-refresh {POLL_MS / 1000}s · {rows.length} nodes · {contactCount} contacts · {riskCount} risks
          </div>
        </div>
      )}
    </>
  );
}
