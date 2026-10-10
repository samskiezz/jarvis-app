import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const AM = "#FFB300"; const CY = "#00E5FF"; const GN = "#4CAF50";
const OR = "#FF9800"; const RD = "#FF3D3D";
const DIM = "rgba(255,255,255,0.04)"; const BG = "rgba(6,10,18,0.94)";
const MN = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const REFRESH_MS = 90_000;
const BTN_LEFT   = 1099520;
const Z_IDX      = 679;

/* ── normalizers ─────────────────────────────────────────────────────────── */
function normCommunities(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.communities ?? raw.nodes ?? raw.data ?? raw.items ?? []);
  return arr.map((c, i) => ({
    id:      String(c.id      ?? c.community_id ?? i),
    name:    String(c.name    ?? c.label        ?? c.title ?? `Community-${i}`),
    members: Number(c.members ?? c.member_count ?? c.size  ?? 0),
    tags:    Array.isArray(c.tags) ? c.tags.map(String) : [],
    desc:    String(c.description ?? c.desc ?? ""),
  }));
}

function normInvestments(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.investments ?? raw.data ?? raw.items ?? []);
  return arr.map((inv, i) => ({
    id:     String(inv.id     ?? inv.investment_id ?? i),
    name:   String(inv.name   ?? inv.title         ?? inv.symbol ?? `Investment-${i}`),
    type:   String(inv.type   ?? inv.category      ?? inv.asset_class ?? ""),
    value:  inv.value ?? inv.amount ?? inv.current_value ?? null,
    tags:   Array.isArray(inv.tags) ? inv.tags.map(String) : [],
    desc:   String(inv.description ?? inv.desc ?? inv.summary ?? ""),
  }));
}

function normOpsEvents(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.events ?? raw.ops_events ?? raw.data ?? raw.items ?? []);
  return arr.map((e, i) => ({
    id:       String(e.id       ?? e.event_id ?? i),
    name:     String(e.name     ?? e.title    ?? e.type ?? `OpsEvent-${i}`),
    severity: String(e.severity ?? e.level    ?? e.priority ?? ""),
    tags:     Array.isArray(e.tags) ? e.tags.map(String) : [],
    desc:     String(e.description ?? e.desc ?? e.message ?? ""),
  }));
}

/* ── token overlap ───────────────────────────────────────────────────────── */
function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function overlap(toks, obj) {
  const objToks = tokens(obj.name + " " + (obj.desc || "") + " " + (obj.tags || []).join(" "));
  return toks.filter(t => objToks.includes(t)).length;
}

/* ── classification ──────────────────────────────────────────────────────── */
function classify(community, investments, opsEvents) {
  const ct = tokens(community.name + " " + community.desc + " " + community.tags.join(" "));
  const hasInv = investments.some(inv => overlap(ct, inv) >= 1);
  const hasEvt = opsEvents.some(e => overlap(ct, e) >= 1);
  if (hasInv && hasEvt) return "FULLY_COVERED";
  if (hasInv)           return "INVESTMENT_ALIGNED";
  if (hasEvt)           return "EVENT_DRIVEN";
  return "UNCOVERED";
}

function matchInvestments(community, investments) {
  const ct = tokens(community.name + " " + community.desc + " " + community.tags.join(" "));
  return investments.filter(inv => overlap(ct, inv) >= 1).slice(0, 4);
}

function matchOpsEvents(community, opsEvents) {
  const ct = tokens(community.name + " " + community.desc + " " + community.tags.join(" "));
  return opsEvents.filter(e => overlap(ct, e) >= 1).slice(0, 4);
}

/* ── voice query ─────────────────────────────────────────────────────────── */
const GIOCNEX_RE = /\b(giocnex|graph community investment|graph ops nexus|community investment ops|community coverage nexus|investment ops graph|graph investment coverage|community ops nexus)\b/i;
export function isGiocnexQuery(t) { return GIOCNEX_RE.test(t || ""); }

export async function buildGiocnexScript() {
  const base = apiBase();
  const hdr  = { "Content-Type": "application/json", "x-api-key": API_KEY };
  try {
    const [cr, ir, er] = await Promise.allSettled([
      fetch(`${base}/v1/graph/communities`, { headers: hdr }).then(r => r.ok ? r.json() : null),
      fetch(`${base}/entities/Investment`,  { headers: hdr }).then(r => r.ok ? r.json() : null),
      fetch(`${base}/v1/ops/events`,        { headers: hdr }).then(r => r.ok ? r.json() : null),
    ]);
    const communities = normCommunities(cr.value);
    const investments = normInvestments(ir.value);
    const opsEvents   = normOpsEvents(er.value);
    const counts = { FULLY_COVERED: 0, INVESTMENT_ALIGNED: 0, EVENT_DRIVEN: 0, UNCOVERED: 0 };
    communities.forEach(c => counts[classify(c, investments, opsEvents)]++);
    const covPct = communities.length ? Math.round((counts.FULLY_COVERED / communities.length) * 100) : 0;
    return `Graph Community Investment Ops Coverage Nexus. ${communities.length} graph communities correlated against ${investments.length} investments and ${opsEvents.length} ops events. Coverage: ${counts.FULLY_COVERED} fully covered, ${counts.INVESTMENT_ALIGNED} investment-aligned only, ${counts.EVENT_DRIVEN} event-driven only, ${counts.UNCOVERED} uncovered. Overall coverage rate: ${covPct} percent.`;
  } catch {
    return "GIOCNEX data currently unavailable.";
  }
}

/* ── component ───────────────────────────────────────────────────────────── */
export default function GraphCommunityInvestmentOpsNexus() {
  const [open,        setOpen]        = useState(false);
  const [communities, setCommunities] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [opsEvents,   setOpsEvents]   = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [err,         setErr]         = useState(null);
  const [filter,      setFilter]      = useState("ALL");
  const [search,      setSearch]      = useState("");
  const [expand,      setExpand]      = useState(null);
  const [assessing,   setAssessing]   = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    const base = apiBase();
    const hdr  = { "Content-Type": "application/json", "x-api-key": API_KEY };
    try {
      const [cr, ir, er] = await Promise.allSettled([
        fetch(`${base}/v1/graph/communities`, { headers: hdr }).then(r => r.ok ? r.json() : null),
        fetch(`${base}/entities/Investment`,  { headers: hdr }).then(r => r.ok ? r.json() : null),
        fetch(`${base}/v1/ops/events`,        { headers: hdr }).then(r => r.ok ? r.json() : null),
      ]);
      setCommunities(normCommunities(cr.value));
      setInvestments(normInvestments(ir.value));
      setOpsEvents(normOpsEvents(er.value));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(p => !p);
    window.addEventListener("jarvis:giocnex-toggle", handler);
    return () => window.removeEventListener("jarvis:giocnex-toggle", handler);
  }, []);

  const classified = communities.map(c => ({
    ...c,
    status:     classify(c, investments, opsEvents),
    matchedInv: matchInvestments(c, investments),
    matchedEvt: matchOpsEvents(c, opsEvents),
  }));

  const counts = { FULLY_COVERED: 0, INVESTMENT_ALIGNED: 0, EVENT_DRIVEN: 0, UNCOVERED: 0 };
  classified.forEach(c => counts[c.status]++);
  const covPct = classified.length ? Math.round((counts.FULLY_COVERED / classified.length) * 100) : 0;

  const filtered = classified
    .filter(c => filter === "ALL" || c.status === filter)
    .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()));

  const assess = async () => {
    setAssessing(true);
    try {
      const prompt = await buildGiocnexScript();
      const base   = apiBase();
      const hdr    = { "Content-Type": "application/json", "x-api-key": API_KEY };
      const resp   = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers: hdr,
        body: JSON.stringify({ message: prompt }),
      });
      const data = resp.ok ? await resp.json() : null;
      const text = data?.response ?? data?.message ?? data?.content ?? prompt;
      const tts  = await fetch(`${base}/v1/voice/tts`, {
        method: "POST", headers: hdr,
        body: JSON.stringify({ text, voice: getActiveVoice() }),
      });
      if (tts.ok) {
        const blob  = await tts.blob();
        const url   = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        audio.play();
      }
    } catch (_) { /* silent */ }
    finally { setAssessing(false); }
  };

  const STATUS_COLOR = { FULLY_COVERED: GN, INVESTMENT_ALIGNED: CY, EVENT_DRIVEN: OR, UNCOVERED: RD };
  const STATUS_LABEL = { FULLY_COVERED: "FULLY COVERED", INVESTMENT_ALIGNED: "INV ALIGNED", EVENT_DRIVEN: "EVENT DRIVEN", UNCOVERED: "UNCOVERED" };

  const panelLeft = Math.min(BTN_LEFT, (typeof window !== "undefined" ? window.innerWidth : 1920) - 480);

  return (
    <>
      <style>{`
        @keyframes giocnexPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(255,179,0,.55); }
          50%      { box-shadow: 0 0 0 6px rgba(255,179,0,0); }
        }
      `}</style>

      {/* launcher button */}
      <button
        onClick={() => setOpen(p => !p)}
        title="Graph Community × Investment × Ops Event Coverage Nexus"
        style={{
          position: "fixed", bottom: 18, left: BTN_LEFT, zIndex: Z_IDX,
          background: open ? AM : "rgba(255,179,0,0.12)",
          border: `1px solid ${AM}`, borderRadius: 6, padding: "4px 10px",
          color: open ? "#000" : AM, fontFamily: MN, fontSize: 10, fontWeight: 700,
          cursor: "pointer", letterSpacing: ".06em",
          animation: open ? "none" : "giocnexPulse 2.4s infinite",
          transition: "background .2s, color .2s",
          whiteSpace: "nowrap",
        }}
      >
        GIOCNEX {counts.UNCOVERED > 0 && (
          <span style={{ background: RD, color: "#fff", borderRadius: 4, padding: "1px 5px", marginLeft: 4 }}>
            {counts.UNCOVERED}
          </span>
        )}
      </button>

      {/* floating panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 52, left: panelLeft, zIndex: Z_IDX,
          width: 470, maxHeight: "78vh",
          background: BG, border: `1px solid ${AM}`,
          borderRadius: 10, overflow: "hidden",
          display: "flex", flexDirection: "column",
          fontFamily: MN, fontSize: 11, color: "#e8eaf6",
          boxShadow: `0 0 28px rgba(255,179,0,.18)`,
        }}>
          {/* header */}
          <div style={{
            padding: "10px 14px 8px", borderBottom: `1px solid rgba(255,179,0,.18)`,
            background: "rgba(255,179,0,.06)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: AM, fontWeight: 700, fontSize: 12, letterSpacing: ".07em" }}>
                ◈ GIOCNEX
              </span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {loading && <span style={{ color: AM, fontSize: 10 }}>⟳</span>}
                <button onClick={assess} disabled={assessing} style={{
                  background: assessing ? "rgba(255,179,0,.2)" : "rgba(255,179,0,.12)",
                  border: `1px solid ${AM}`, borderRadius: 4, padding: "2px 8px",
                  color: AM, fontFamily: MN, fontSize: 10, cursor: "pointer",
                }}>
                  {assessing ? "..." : "▶ ASSESS"}
                </button>
                <button onClick={() => setOpen(false)} style={{
                  background: "none", border: "none", color: "#888",
                  cursor: "pointer", fontSize: 14, lineHeight: 1,
                }}>✕</button>
              </div>
            </div>
            <div style={{ fontSize: 10, color: "#90a4ae", marginTop: 3 }}>
              Graph Community × Investment × Ops Event Coverage Nexus — 90 s auto-refresh
            </div>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 6, padding: "8px 12px", borderBottom: `1px solid rgba(255,179,0,.1)` }}>
            {[
              ["COMMUNITIES", communities.length, AM],
              ["INVESTMENTS", investments.length, GN],
              ["OPS EVENTS",  opsEvents.length,   OR],
              ["COVERAGE",    `${covPct}%`,        covPct >= 60 ? GN : covPct >= 30 ? AM : RD],
            ].map(([lbl, val, col]) => (
              <div key={lbl} style={{
                flex: 1, background: DIM, borderRadius: 6, padding: "5px 8px",
                border: `1px solid rgba(255,255,255,.06)`, textAlign: "center",
              }}>
                <div style={{ color: col, fontWeight: 700, fontSize: 13 }}>{val}</div>
                <div style={{ color: "#607d8b", fontSize: 9, marginTop: 1 }}>{lbl}</div>
              </div>
            ))}
          </div>

          {/* class tiles */}
          <div style={{ display: "flex", gap: 6, padding: "6px 12px", borderBottom: `1px solid rgba(255,179,0,.1)` }}>
            {Object.entries(counts).map(([k, v]) => (
              <div key={k} style={{
                flex: 1, background: DIM, borderRadius: 6, padding: "4px 6px",
                border: `1px solid rgba(255,255,255,.06)`, textAlign: "center",
              }}>
                <div style={{ color: STATUS_COLOR[k], fontWeight: 700, fontSize: 12 }}>{v}</div>
                <div style={{ color: "#607d8b", fontSize: 8, marginTop: 1 }}>{STATUS_LABEL[k]}</div>
              </div>
            ))}
          </div>

          {/* filter tabs + search */}
          <div style={{ display: "flex", gap: 4, padding: "6px 12px 4px", flexWrap: "wrap", borderBottom: `1px solid rgba(255,179,0,.1)` }}>
            {["ALL", "FULLY_COVERED", "INVESTMENT_ALIGNED", "EVENT_DRIVEN", "UNCOVERED"].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                background: filter === f ? AM : "rgba(255,255,255,.04)",
                border: `1px solid ${filter === f ? AM : "rgba(255,255,255,.1)"}`,
                borderRadius: 4, padding: "2px 7px",
                color: filter === f ? "#000" : "#90a4ae",
                fontFamily: MN, fontSize: 9, cursor: "pointer",
              }}>{f === "ALL" ? "ALL" : STATUS_LABEL[f]}</button>
            ))}
            <input
              placeholder="search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                marginLeft: "auto", background: "rgba(255,255,255,.04)",
                border: "1px solid rgba(255,255,255,.1)", borderRadius: 4,
                padding: "2px 7px", color: "#e8eaf6", fontFamily: MN, fontSize: 10,
                outline: "none", width: 110,
              }}
            />
          </div>

          {/* list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 10px" }}>
            {err && <div style={{ color: RD, padding: "6px 4px", fontSize: 10 }}>Error: {err}</div>}
            {!loading && !err && filtered.length === 0 && (
              <div style={{ color: "#607d8b", textAlign: "center", padding: 16, fontSize: 10 }}>No communities match.</div>
            )}
            {filtered.map(c => (
              <div key={c.id} style={{
                marginBottom: 6, borderRadius: 7,
                border: `1px solid ${c.status === "UNCOVERED" ? "rgba(255,61,61,.35)" : "rgba(255,255,255,.07)"}`,
                background: DIM, overflow: "hidden",
              }}>
                {/* community row */}
                <div
                  onClick={() => setExpand(expand === c.id ? null : c.id)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", cursor: "pointer" }}
                >
                  <span style={{
                    background: STATUS_COLOR[c.status], color: "#000",
                    borderRadius: 3, padding: "1px 5px", fontSize: 9, fontWeight: 700,
                    flexShrink: 0, minWidth: 70, textAlign: "center",
                  }}>{STATUS_LABEL[c.status]}</span>
                  <span style={{ flex: 1, color: "#e8eaf6", fontWeight: 600, fontSize: 11 }}>{c.name}</span>
                  {c.members > 0 && (
                    <span style={{ color: "#607d8b", fontSize: 9 }}>{c.members}m</span>
                  )}
                  <span style={{ color: "#607d8b", fontSize: 10 }}>{expand === c.id ? "▲" : "▼"}</span>
                </div>

                {/* expanded detail */}
                {expand === c.id && (
                  <div style={{ padding: "0 10px 8px", borderTop: "1px solid rgba(255,255,255,.06)" }}>
                    {/* matched investments */}
                    {c.matchedInv.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        <div style={{ color: GN, fontSize: 9, marginBottom: 3, fontWeight: 700 }}>
                          ▸ MATCHED INVESTMENTS ({c.matchedInv.length})
                        </div>
                        {c.matchedInv.map((inv, idx) => {
                          const rel = Math.min(100, Math.max(20, overlap(
                            tokens(c.name + " " + c.desc + " " + c.tags.join(" ")), inv
                          ) * 25));
                          return (
                            <div key={idx} style={{
                              display: "flex", alignItems: "center", gap: 6,
                              marginBottom: 4, padding: "3px 6px",
                              background: "rgba(76,175,80,.07)", borderRadius: 4,
                            }}>
                              {inv.type && (
                                <span style={{
                                  background: "rgba(76,175,80,.2)", color: GN,
                                  borderRadius: 3, padding: "1px 5px", fontSize: 8, fontWeight: 700,
                                }}>{inv.type.toUpperCase()}</span>
                              )}
                              <span style={{ flex: 1, color: "#c8e6c9", fontSize: 10 }}>{inv.name}</span>
                              <div style={{
                                width: 40, height: 4, background: "rgba(255,255,255,.1)", borderRadius: 2,
                              }}>
                                <div style={{ width: `${rel}%`, height: "100%", background: GN, borderRadius: 2 }} />
                              </div>
                              <span style={{ color: GN, fontSize: 9, minWidth: 28, textAlign: "right" }}>{rel}%</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* matched ops events */}
                    {c.matchedEvt.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        <div style={{ color: OR, fontSize: 9, marginBottom: 3, fontWeight: 700 }}>
                          ▸ MATCHED OPS EVENTS ({c.matchedEvt.length})
                        </div>
                        {c.matchedEvt.map((evt, idx) => {
                          const rel = Math.min(100, Math.max(20, overlap(
                            tokens(c.name + " " + c.desc + " " + c.tags.join(" ")), evt
                          ) * 25));
                          return (
                            <div key={idx} style={{
                              display: "flex", alignItems: "center", gap: 6,
                              marginBottom: 4, padding: "3px 6px",
                              background: "rgba(255,152,0,.07)", borderRadius: 4,
                            }}>
                              {evt.severity && (
                                <span style={{
                                  background: "rgba(255,152,0,.2)", color: OR,
                                  borderRadius: 3, padding: "1px 5px", fontSize: 8, fontWeight: 700,
                                }}>{evt.severity.toUpperCase()}</span>
                              )}
                              <span style={{ flex: 1, color: "#ffe0b2", fontSize: 10 }}>{evt.name}</span>
                              <div style={{
                                width: 40, height: 4, background: "rgba(255,255,255,.1)", borderRadius: 2,
                              }}>
                                <div style={{ width: `${rel}%`, height: "100%", background: OR, borderRadius: 2 }} />
                              </div>
                              <span style={{ color: OR, fontSize: 9, minWidth: 28, textAlign: "right" }}>{rel}%</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {c.matchedInv.length === 0 && c.matchedEvt.length === 0 && (
                      <div style={{ color: "#607d8b", fontSize: 10, paddingTop: 6 }}>
                        No investment or ops event match found for this community.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* footer */}
          <div style={{
            padding: "5px 12px", borderTop: `1px solid rgba(255,179,0,.12)`,
            background: "rgba(255,179,0,.03)", display: "flex", justifyContent: "space-between",
          }}>
            <span style={{ color: "#607d8b", fontSize: 9 }}>
              {filtered.length}/{classified.length} communities · auto-refresh 90 s
            </span>
            <button onClick={load} style={{
              background: "none", border: "none", color: AM,
              fontFamily: MN, fontSize: 9, cursor: "pointer",
            }}>↺ refresh</button>
          </div>
        </div>
      )}
    </>
  );
}
