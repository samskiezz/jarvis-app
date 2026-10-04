/**
 * F238 — RiskSignal × Knowledge × Contact × Dataset Threat Mitigation Intelligence Nexus (TMINEX)
 *
 * Parallel-fetches /entities/RiskSignal, /knowledge/, /entities/Contact, /v1/datasets
 * Keyword-correlates each risk signal against KB articles AND contacts AND datasets:
 *   FULLY_MITIGATED — matched by KB + contact + dataset (all three)
 *   DUAL_COVERED    — matched by any two sources
 *   SINGLE_LINKED   — matched by exactly one source
 *   UNMITIGATED     — no match (mitigation gap)
 *
 * Toggle:  ◈ TMINEX  left:1074520, bottom:8, zIndex:297
 * Voice:   "tminex / risk mitigation / threat mitigation nexus / unmitigated risk /
 *           risk signal coverage / mitigation gap"
 * Event:   jarvis:tminex-toggle
 * Refresh: 90-s auto-poll
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_074_520;
const Z_INDEX  = 297;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const CY = "#00CFFF";
const AM = "#F59E0B";
const GN = "#22C55E";
const PU = "#A855F7";
const OR = "#F97316";
const RD = "#EF4444";
const FONT = "'JetBrains Mono',monospace";
const BG_PANEL = "rgba(6,11,22,0.97)";

// ── exported intent helpers ───────────────────────────────────────────────────

export const TMINEX_RE = /\b(tminex|risk\s+mitigation\s+nexus|threat\s+mitigation\s+nexus|unmitigated\s+risk|risk\s+signal\s+coverage|mitigation\s+gap|tmin\s+nexus|tminex\s+panel)\b/i;
export function isTminexQuery(q = "") { return TMINEX_RE.test(q); }

export async function buildTminexScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [riskRes, kbRes, contactRes, dsRes] = await Promise.all([
      fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
      fetch(`${base}/knowledge/`,           { headers: hdr }),
      fetch(`${base}/entities/Contact`,     { headers: hdr }),
      fetch(`${base}/v1/datasets`,          { headers: hdr }),
    ]);
    const [riskRaw, kbRaw, contactRaw, dsRaw] = await Promise.all([
      riskRes.json(), kbRes.json(), contactRes.json(), dsRes.json(),
    ]);
    const risks    = normaliseRisks(riskRaw);
    const articles = normaliseKb(kbRaw);
    const contacts = normaliseContacts(contactRaw);
    const datasets = normaliseDatasets(dsRaw);
    const rows     = classify(risks, articles, contacts, datasets);
    const fully  = rows.filter(r => r.cls === "FULLY_MITIGATED").length;
    const dual   = rows.filter(r => r.cls === "DUAL_COVERED").length;
    const single = rows.filter(r => r.cls === "SINGLE_LINKED").length;
    const unm    = rows.filter(r => r.cls === "UNMITIGATED").length;
    const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS threat mitigation nexus: ${risks.length} risk signals cross-referenced against ` +
          `${articles.length} knowledge articles, ${contacts.length} contacts, and ${datasets.length} datasets. ` +
          `Classification: ${fully} FULLY_MITIGATED, ${dual} DUAL_COVERED, ${single} SINGLE_LINKED, ${unm} UNMITIGATED. ` +
          `Give a 2-sentence threat mitigation intelligence brief — formal British butler tone, first person.`,
      }),
    });
    const d = await res.json();
    return (d.answer || "Threat mitigation nexus assessment complete, sir.").trim();
  } catch {
    return "Threat mitigation nexus is unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function kws(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack = "", words = []) {
  const h = haystack.toLowerCase();
  let hits = 0;
  for (const w of words) if (h.includes(w)) hits++;
  return words.length ? hits / words.length : 0;
}

function normaliseRisks(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.data) ? raw.data
    : Array.isArray(raw?.risk_signals) ? raw.risk_signals
    : [];
  return arr.map((r, i) => ({
    id:       r.id || String(i),
    title:    r.title || r.name || r.signal_name || `Signal ${i+1}`,
    severity: (r.severity || r.level || "").toUpperCase(),
    desc:     r.description || r.summary || "",
  }));
}

function normaliseKb(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.articles) ? raw.articles
    : Array.isArray(raw?.data) ? raw.data
    : Array.isArray(raw?.knowledge) ? raw.knowledge
    : [];
  return arr.map((a, i) => ({
    id:       a.id || String(i),
    title:    a.title || a.name || `Article ${i+1}`,
    category: a.category || a.type || "",
    tags:     (a.tags || []).join(" "),
    content:  a.content || a.description || a.summary || "",
  }));
}

function normaliseContacts(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.data) ? raw.data
    : Array.isArray(raw?.contacts) ? raw.contacts
    : [];
  return arr.map((c, i) => ({
    id:   c.id || String(i),
    name: c.name || c.full_name || `Contact ${i+1}`,
    role: c.role || c.title || "",
    org:  c.organisation || c.organization || c.company || "",
    tags: (c.tags || []).join(" "),
  }));
}

function normaliseDatasets(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.data) ? raw.data
    : Array.isArray(raw?.datasets) ? raw.datasets
    : [];
  return arr.map((d, i) => ({
    id:   d.id || String(i),
    name: d.name || d.title || `Dataset ${i+1}`,
    type: d.type || d.source || "",
    desc: d.description || d.summary || "",
  }));
}

function classify(risks, articles, contacts, datasets) {
  return risks.map(risk => {
    const riskKws = kws(`${risk.title} ${risk.desc}`);
    const matchedKb = articles.filter(a =>
      score(`${a.title} ${a.content} ${a.tags}`, riskKws) > 0
    ).map(a => ({ ...a, rel: score(`${a.title} ${a.content} ${a.tags}`, riskKws) }));
    const matchedContacts = contacts.filter(c =>
      score(`${c.name} ${c.role} ${c.org} ${c.tags}`, riskKws) > 0
    ).map(c => ({ ...c, rel: score(`${c.name} ${c.role} ${c.org} ${c.tags}`, riskKws) }));
    const matchedDatasets = datasets.filter(d =>
      score(`${d.name} ${d.desc} ${d.type}`, riskKws) > 0
    ).map(d => ({ ...d, rel: score(`${d.name} ${d.desc} ${d.type}`, riskKws) }));

    const hasKb      = matchedKb.length > 0;
    const hasContact = matchedContacts.length > 0;
    const hasDataset = matchedDatasets.length > 0;
    const matchCount = [hasKb, hasContact, hasDataset].filter(Boolean).length;

    const cls = matchCount === 3 ? "FULLY_MITIGATED"
      : matchCount === 2 ? "DUAL_COVERED"
      : matchCount === 1 ? "SINGLE_LINKED"
      : "UNMITIGATED";

    return { ...risk, cls, matchedKb, matchedContacts, matchedDatasets };
  });
}

const CLS_COLOR = {
  FULLY_MITIGATED: "#22C55E",
  DUAL_COVERED:    "#00CFFF",
  SINGLE_LINKED:   "#F59E0B",
  UNMITIGATED:     "#EF4444",
};
const CLS_LABEL = {
  FULLY_MITIGATED: "FULL",
  DUAL_COVERED:    "DUAL",
  SINGLE_LINKED:   "SNGL",
  UNMITIGATED:     "UNMT",
};

function sevColor(sev) {
  if (sev === "CRITICAL") return "#EF4444";
  if (sev === "HIGH")     return "#F97316";
  if (sev === "MEDIUM")   return "#FBBF24";
  return "#6B7280";
}

function RelBar({ val, color = CY }) {
  const pct = Math.round((val || 0) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span style={{ color: "#6B7280", fontSize: 8, minWidth: 26, textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

export default function RiskSignalMitigationNexus() {
  const [open,      setOpen]      = useState(false);
  const [risks,     setRisks]     = useState([]);
  const [articles,  setArticles]  = useState([]);
  const [contacts,  setContacts]  = useState([]);
  const [datasets,  setDatasets]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [rr, kr, cr, dr] = await Promise.all([
        fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
        fetch(`${base}/knowledge/`,           { headers: hdr }),
        fetch(`${base}/entities/Contact`,     { headers: hdr }),
        fetch(`${base}/v1/datasets`,          { headers: hdr }),
      ]);
      const [rd, kd, cd, dd] = await Promise.all([rr.json(), kr.json(), cr.json(), dr.json()]);
      setRisks(normaliseRisks(rd));
      setArticles(normaliseKb(kd));
      setContacts(normaliseContacts(cd));
      setDatasets(normaliseDatasets(dd));
      setLastFetch(new Date());
    } catch { /* keep stale */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    pollRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isTminexQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:tminex-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:tminex-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  const rows = classify(risks, articles, contacts, datasets);
  const fully  = rows.filter(r => r.cls === "FULLY_MITIGATED").length;
  const dual   = rows.filter(r => r.cls === "DUAL_COVERED").length;
  const single = rows.filter(r => r.cls === "SINGLE_LINKED").length;
  const unm    = rows.filter(r => r.cls === "UNMITIGATED").length;
  const cov    = rows.length ? Math.round(((fully + dual + single) / rows.length) * 100) : 0;

  const TABS = ["ALL", "FULLY_MITIGATED", "DUAL_COVERED", "SINGLE_LINKED", "UNMITIGATED"];

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search && !`${r.title} ${r.desc}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  async function assess() {
    setAssessing(true);
    const text = await buildTminexScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Threat Mitigation Intelligence Nexus (◈ TMINEX)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: open ? "rgba(239,68,68,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? RD : "#334155"}`,
          borderRadius: 4, color: open ? RD : "#94A3B8",
          fontFamily: FONT, fontSize: 9, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${RD}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ TMINEX{unm > 0 && (
          <span style={{
            marginLeft: 4, background: RD, color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{unm}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", zIndex: Z_INDEX - 1,
          bottom: 36, left: Math.max(8, BTN_LEFT - 320),
          width: 420,
          background: BG_PANEL, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          border: `1px solid #1E293B`, borderTop: `2px solid ${RD}`,
          borderRadius: 8,
          boxShadow: "0 4px 32px rgba(0,0,0,0.6)",
          fontFamily: FONT, fontSize: 10,
          display: "flex", flexDirection: "column",
          maxHeight: "76vh", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: "1px solid #1E293B",
            flexShrink: 0,
          }}>
            <div>
              <div style={{ color: RD, letterSpacing: 2, fontWeight: 700, fontSize: 10 }}>
                THREAT MITIGATION NEXUS
              </div>
              {lastFetch && (
                <div style={{ color: "#475569", fontSize: 8 }}>
                  updated {lastFetch.toLocaleTimeString()}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {loading && <span style={{ color: "#475569", fontSize: 8 }}>loading…</span>}
              <button
                onClick={assess}
                disabled={assessing || rows.length === 0}
                style={{
                  background: "transparent", border: `1px solid ${CY}`,
                  color: CY, borderRadius: 4, padding: "2px 8px",
                  fontFamily: FONT, fontSize: 9, cursor: "pointer",
                  opacity: (assessing || rows.length === 0) ? 0.4 : 1,
                }}
              >
                {assessing ? "…" : "▶ ASSESS"}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "transparent", border: "none", color: "#475569",
                  cursor: "pointer", fontSize: 14, lineHeight: 1,
                }}
              >×</button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(5,1fr)",
            gap: 4, padding: "8px 12px 4px", flexShrink: 0,
          }}>
            {[
              { label: "RISK SIGS",  val: rows.length, color: "#94A3B8" },
              { label: "FULL MIT.",  val: fully,        color: GN },
              { label: "DUAL COV.",  val: dual,         color: CY },
              { label: "SINGLE",     val: single,       color: AM },
              { label: "UNMITIGATED",val: unm,          color: RD },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                background: "rgba(0,0,0,0.4)", borderRadius: 5,
                padding: "5px 4px", textAlign: "center",
              }}>
                <div style={{ color, fontSize: 13, fontWeight: 700 }}>{val}</div>
                <div style={{ color: "#475569", fontSize: 7, letterSpacing: 0.5 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Coverage bar */}
          <div style={{ padding: "0 12px 6px", flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ color: "#475569", fontSize: 8 }}>MITIGATION COVERAGE</span>
              <span style={{ color: cov > 60 ? GN : cov > 30 ? AM : RD, fontSize: 8, fontWeight: 700 }}>
                {cov}%
              </span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2 }}>
              <div style={{
                width: `${cov}%`, height: "100%",
                background: cov > 60 ? GN : cov > 30 ? AM : RD, borderRadius: 2,
              }} />
            </div>
          </div>

          {/* Filter tabs */}
          <div style={{
            display: "flex", gap: 3, padding: "0 12px 6px",
            overflowX: "auto", flexShrink: 0,
          }}>
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                style={{
                  background: filter === t ? "rgba(0,207,255,0.15)" : "rgba(0,0,0,0.3)",
                  border: `1px solid ${filter === t ? CY : "#1E293B"}`,
                  borderRadius: 4, color: filter === t ? CY : "#64748B",
                  fontFamily: FONT, fontSize: 8, padding: "2px 6px", cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {t === "ALL" ? "ALL" : CLS_LABEL[t] || t}
              </button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "0 12px 6px", flexShrink: 0 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search signals…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(0,0,0,0.4)", border: "1px solid #1E293B",
                borderRadius: 4, color: "#94A3B8", fontFamily: FONT,
                fontSize: 9, padding: "4px 8px", outline: "none",
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 12px" }}>
            {visible.length === 0 && (
              <div style={{ color: "#475569", fontSize: 9, textAlign: "center", padding: 16 }}>
                {loading ? "loading…" : "no signals found"}
              </div>
            )}
            {visible.map(row => {
              const isExp = expanded === row.id;
              return (
                <div key={row.id} style={{ marginBottom: 6 }}>
                  <button
                    onClick={() => setExpanded(isExp ? null : row.id)}
                    style={{
                      width: "100%", textAlign: "left",
                      background: "rgba(0,0,0,0.35)",
                      border: `1px solid ${isExp ? CLS_COLOR[row.cls] : "#1E293B"}`,
                      borderRadius: 5, padding: "6px 8px", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 6,
                    }}
                  >
                    <span style={{
                      background: CLS_COLOR[row.cls] + "22",
                      border: `1px solid ${CLS_COLOR[row.cls]}`,
                      color: CLS_COLOR[row.cls],
                      borderRadius: 3, padding: "1px 5px",
                      fontSize: 8, letterSpacing: 1, flexShrink: 0,
                    }}>
                      {CLS_LABEL[row.cls]}
                    </span>
                    {row.severity && (
                      <span style={{
                        background: sevColor(row.severity) + "22",
                        border: `1px solid ${sevColor(row.severity)}`,
                        color: sevColor(row.severity),
                        borderRadius: 3, padding: "1px 4px",
                        fontSize: 7, letterSpacing: 0.5, flexShrink: 0,
                      }}>
                        {row.severity}
                      </span>
                    )}
                    <span style={{
                      color: "#CBD5E1", fontSize: 9, flex: 1,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {row.title}
                    </span>
                    <span style={{ color: "#475569", fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
                  </button>

                  {isExp && (
                    <div style={{
                      background: "rgba(0,0,0,0.22)", border: "1px solid #1E293B",
                      borderTop: "none", borderRadius: "0 0 5px 5px",
                      padding: "8px 10px",
                    }}>
                      {row.desc && (
                        <div style={{ color: "#64748B", fontSize: 8, marginBottom: 6, lineHeight: 1.4 }}>
                          {row.desc.slice(0, 140)}{row.desc.length > 140 ? "…" : ""}
                        </div>
                      )}
                      {/* KB matches */}
                      {row.matchedKb.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: GN, fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>
                            KNOWLEDGE ({row.matchedKb.length})
                          </div>
                          {row.matchedKb.slice(0, 3).map(a => (
                            <div key={a.id} style={{ marginBottom: 3 }}>
                              <div style={{ color: "#94A3B8", fontSize: 8, marginBottom: 2 }}>
                                {a.title.slice(0, 50)}{a.title.length > 50 ? "…" : ""}
                                {a.category && (
                                  <span style={{
                                    marginLeft: 4, color: "#475569",
                                    background: "#0F172A", borderRadius: 2,
                                    padding: "0 3px", fontSize: 7,
                                  }}>{a.category}</span>
                                )}
                              </div>
                              <RelBar val={a.rel} color={GN} />
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Contact matches */}
                      {row.matchedContacts.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: OR, fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>
                            CONTACTS ({row.matchedContacts.length})
                          </div>
                          {row.matchedContacts.slice(0, 3).map(c => (
                            <div key={c.id} style={{ marginBottom: 3 }}>
                              <div style={{ color: "#94A3B8", fontSize: 8, marginBottom: 2 }}>
                                {c.name}
                                {c.role && (
                                  <span style={{
                                    marginLeft: 4, color: "#475569",
                                    background: "#0F172A", borderRadius: 2,
                                    padding: "0 3px", fontSize: 7,
                                  }}>{c.role}</span>
                                )}
                              </div>
                              <RelBar val={c.rel} color={OR} />
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Dataset matches */}
                      {row.matchedDatasets.length > 0 && (
                        <div>
                          <div style={{ color: PU, fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>
                            DATASETS ({row.matchedDatasets.length})
                          </div>
                          {row.matchedDatasets.slice(0, 3).map(d => (
                            <div key={d.id} style={{ marginBottom: 3 }}>
                              <div style={{ color: "#94A3B8", fontSize: 8, marginBottom: 2 }}>
                                {d.name.slice(0, 50)}{d.name.length > 50 ? "…" : ""}
                                {d.type && (
                                  <span style={{
                                    marginLeft: 4, color: "#475569",
                                    background: "#0F172A", borderRadius: 2,
                                    padding: "0 3px", fontSize: 7,
                                  }}>{d.type}</span>
                                )}
                              </div>
                              <RelBar val={d.rel} color={PU} />
                            </div>
                          ))}
                        </div>
                      )}
                      {row.matchedKb.length === 0 && row.matchedContacts.length === 0 && row.matchedDatasets.length === 0 && (
                        <div style={{ color: RD, fontSize: 8, textAlign: "center", padding: "4px 0" }}>
                          no mitigation coverage found
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
