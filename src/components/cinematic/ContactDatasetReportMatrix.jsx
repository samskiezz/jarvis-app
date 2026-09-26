/**
 * F117 — Contact × Dataset × Report Intelligence Coverage Matrix (CDIRMAT)
 *
 * Parallel-fetches /entities/Contact + /v1/datasets + /v1/reports.
 * Keyword-correlates each contact against available datasets AND intelligence reports:
 *   FULLY_DOCUMENTED — matched both a dataset AND a report
 *   DATA_LINKED      — matched dataset only
 *   REPORT_BACKED    — matched report only
 *   UNDOCUMENTED     — no matches (coverage gap)
 *
 * Stat tiles: CONTACTS / DATASETS / REPORTS + all four class counts + COVERAGE%.
 * Amber badge on undocumented count.
 * Filter tabs ALL / FULLY_DOCUMENTED / DATA_LINKED / REPORT_BACKED / UNDOCUMENTED + text search.
 * Expand contact → matched dataset cards (purple) + report cards (cyan) with relevance bars.
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:cdirmat-toggle event.
 *
 * Voice triggers: "cdirmat / contact data report / contact documentation /
 *                  undocumented contacts / contact coverage matrix".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_008_440;
const Z_INDEX  = 179;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const CDIRMAT_RE = /\b(cdirmat|contact[\s-]data[\s-]report|contact[\s-]documentation|undocumented[\s-]contacts|contact[\s-]coverage[\s-]matrix)\b/i;

// ── colour palette ────────────────────────────────────────────────────────────
const CY     = "#00CFFF";
const RD     = "#EF4444";
const OR     = "#F97316";
const AM     = "#F59E0B";
const PU     = "#A855F7";
const BL     = "#3B82F6";
const GR     = "#22C55E";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = { FULLY_DOCUMENTED: GR, DATA_LINKED: PU, REPORT_BACKED: CY, UNDOCUMENTED: AM };
const TABS = ["ALL", "FULLY_DOCUMENTED", "DATA_LINKED", "REPORT_BACKED", "UNDOCUMENTED"];

// ── exports for JarvisBrain ───────────────────────────────────────────────────

export function isCdirmatQuery(text) {
  return CDIRMAT_RE.test(text || "");
}

// ── helpers ───────────────────────────────────────────────────────────────────

function norm(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function words(str) {
  return (str || "").toLowerCase().split(/\W+/).filter(w => w.length > 2);
}

function relevance(contact, target) {
  const cw = words(`${contact.name || ""} ${contact.role || ""} ${contact.org || contact.organisation || ""} ${(contact.tags || []).join(" ")}`);
  const tw = words(`${target.name || target.title || ""} ${target.description || ""} ${(target.tags || []).join ? (target.tags || []).join(" ") : ""}`);
  if (!cw.length || !tw.length) return 0;
  const hits = cw.filter(w => tw.includes(w)).length;
  return Math.min(100, Math.round((hits / Math.min(cw.length, tw.length)) * 100));
}

function classify(contact, datasets, reports) {
  const dMatches = datasets
    .map(d => ({ item: d, score: relevance(contact, d) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const rMatches = reports
    .map(r => ({ item: r, score: relevance(contact, r) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  let cls;
  if (dMatches.length && rMatches.length) cls = "FULLY_DOCUMENTED";
  else if (dMatches.length)              cls = "DATA_LINKED";
  else if (rMatches.length)             cls = "REPORT_BACKED";
  else                                  cls = "UNDOCUMENTED";
  return { cls, dMatches, rMatches };
}

export async function buildCdirmatScript() {
  const base = apiBase();
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
  const [ctRaw, dsRaw, rpRaw] = await Promise.all([
    fetch(`${base}/entities/Contact`,  { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/v1/datasets`,       { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/v1/reports`,        { headers }).then(r => r.json()).catch(() => []),
  ]);
  const contacts  = norm(ctRaw, ["results", "data", "items", "contacts"]);
  const datasets  = norm(dsRaw, ["results", "data", "items", "datasets"]);
  const reports   = norm(rpRaw, ["results", "data", "items", "reports"]);
  const rows = contacts.map(c => ({ ...c, ...classify(c, datasets, reports) }));
  const fully  = rows.filter(r => r.cls === "FULLY_DOCUMENTED").length;
  const dataL  = rows.filter(r => r.cls === "DATA_LINKED").length;
  const repB   = rows.filter(r => r.cls === "REPORT_BACKED").length;
  const undoc  = rows.filter(r => r.cls === "UNDOCUMENTED").length;
  const pct    = rows.length ? Math.round(((fully + dataL + repB) / rows.length) * 100) : 0;
  const context = `Contact Dataset Report Intelligence Coverage Matrix (CDIRMAT) — ${contacts.length} contacts, ${datasets.length} datasets, ${reports.length} reports. Coverage: ${fully} fully-documented, ${dataL} data-linked, ${repB} report-backed, ${undoc} undocumented (intelligence gap). Documentation coverage: ${pct}%.`;
  const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message: `${context} Assess contact intelligence documentation coverage in two sentences.` }),
  });
  const d = await r.json().catch(() => ({}));
  return (d.answer || context).replace(/<<ACTION:[^>]*>>/g, "").trim();
}

// ── component ─────────────────────────────────────────────────────────────────

export function ContactDatasetReportMatrix() {
  const [open, setOpen]         = useState(false);
  const [contacts, setContacts] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [reports, setReports]   = useState([]);
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [brief, setBrief]       = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);
  const base     = apiBase();
  const headers  = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ctRaw, dsRaw, rpRaw] = await Promise.all([
        fetch(`${base}/entities/Contact`,  { headers }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/datasets`,       { headers }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/reports`,        { headers }).then(r => r.json()).catch(() => []),
      ]);
      const cts  = norm(ctRaw, ["results", "data", "items", "contacts"]);
      const dsets = norm(dsRaw, ["results", "data", "items", "datasets"]);
      const rpts  = norm(rpRaw, ["results", "data", "items", "reports"]);
      setContacts(cts);
      setDatasets(dsets);
      setReports(rpts);
      setRows(cts.map(c => ({ ...c, ...classify(c, dsets, rpts) })));
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    const onToggle = () => setOpen(v => { if (!v) load(); return !v; });
    window.addEventListener("jarvis:cdirmat-toggle", onToggle);
    return () => window.removeEventListener("jarvis:cdirmat-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  // derived
  const fully = rows.filter(r => r.cls === "FULLY_DOCUMENTED").length;
  const dataL = rows.filter(r => r.cls === "DATA_LINKED").length;
  const repB  = rows.filter(r => r.cls === "REPORT_BACKED").length;
  const undoc = rows.filter(r => r.cls === "UNDOCUMENTED").length;
  const pct   = rows.length ? Math.round(((fully + dataL + repB) / rows.length) * 100) : 0;
  const badge = undoc;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.name || "").toLowerCase().includes(q) ||
             (r.role || "").toLowerCase().includes(q) ||
             (r.org || r.organisation || "").toLowerCase().includes(q);
    }
    return true;
  });

  async function assess() {
    setAssessing(true); setBrief("");
    try {
      const script = await buildCdirmatScript();
      setBrief(script);
      const tr = await fetch(`${base}/v1/voice/tts`, {
        method: "POST", headers,
        body: JSON.stringify({ text: script }),
      });
      const blob = await tr.blob().catch(() => null);
      if (blob) { const a = new Audio(URL.createObjectURL(blob)); a.play().catch(() => {}); }
    } catch { setBrief("Coverage assessment unavailable."); }
    setAssessing(false);
  }

  const tile = (label, val, col) => (
    <div style={{ background: `${col}12`, border: `1px solid ${col}55`, borderRadius: 6,
                  padding: "5px 10px", textAlign: "center", minWidth: 70 }}>
      <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
      <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 9, letterSpacing: 1 }}>{label}</div>
    </div>
  );

  const relBar = (score, color) => (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
        <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 9, minWidth: 26, textAlign: "right" }}>{score}%</span>
    </div>
  );

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => { setOpen(v => { if (!v) load(); return !v; }); }}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: open ? AM : "rgba(6,11,22,0.85)", border: `1px solid ${AM}`,
          color: open ? "#04060A" : AM, fontFamily: FONT, fontSize: 9, fontWeight: 700,
          padding: "3px 9px", borderRadius: 4, cursor: "pointer", letterSpacing: 1,
          boxShadow: open ? `0 0 14px ${AM}` : "none",
        }}
      >
        {badge > 0 && !open && (
          <span style={{ background: AM, color: "#04060A", borderRadius: "50%", fontSize: 8, fontWeight: 700,
                         padding: "0 4px", marginRight: 4 }}>{badge}</span>
        )}
        ◈ CDIRMAT
      </button>

      {open && (
        <div style={{
          position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
          zIndex: Z_INDEX + 1, width: "min(820px,96vw)", maxHeight: "85vh",
          background: BG, border: `1px solid ${AM}44`, borderRadius: 12,
          fontFamily: FONT, display: "flex", flexDirection: "column", overflow: "hidden",
          boxShadow: `0 0 60px ${AM}18`,
        }}>
          {/* Header */}
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`,
                        display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: AM, fontSize: 12, fontWeight: 700, letterSpacing: 2 }}>◈ CDIRMAT</span>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>Contact × Dataset × Report Intelligence Coverage Matrix</span>
            <button onClick={() => setOpen(false)} style={{
              marginLeft: "auto", background: "none", border: "none",
              color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 14,
            }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`,
                        display: "flex", gap: 8, flexWrap: "wrap" }}>
            {tile("CONTACTS",    rows.length,     OR)}
            {tile("DATASETS",    datasets.length, PU)}
            {tile("REPORTS",     reports.length,  CY)}
            {tile("FULLY DOC",   fully,           GR)}
            {tile("DATA LINK",   dataL,           PU)}
            {tile("REPORT BACK", repB,            CY)}
            {tile("UNDOC",       undoc,           AM)}
            {tile("COVERAGE",    `${pct}%`, pct > 70 ? GR : pct > 40 ? AM : RD)}
          </div>

          {/* Coverage bar */}
          <div style={{ padding: "4px 14px", borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, minWidth: 80 }}>DOC COVER</span>
              <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                <div style={{ width: `${pct}%`, height: "100%",
                              background: pct > 70 ? GR : pct > 40 ? AM : RD,
                              borderRadius: 2, transition: "width .4s" }} />
              </div>
              <span style={{ color: pct > 70 ? GR : pct > 40 ? AM : RD, fontSize: 10, minWidth: 28 }}>{pct}%</span>
            </div>
          </div>

          {/* Controls */}
          <div style={{ padding: "8px 14px", borderBottom: `1px solid ${BORDER}`,
                        display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${AM}22` : "none",
                border: `1px solid ${tab === t ? AM : "rgba(255,255,255,0.15)"}`,
                color: tab === t ? AM : "rgba(255,255,255,0.5)",
                fontFamily: FONT, fontSize: 9, padding: "2px 9px", borderRadius: 3, cursor: "pointer",
                letterSpacing: 1,
              }}>{t.replace(/_/g, " ")}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search contacts…"
              style={{
                marginLeft: "auto", background: "rgba(255,255,255,0.05)",
                border: `1px solid rgba(255,255,255,0.15)`, borderRadius: 4,
                color: "#e2e8f0", fontFamily: FONT, fontSize: 10, padding: "3px 8px",
                outline: "none", width: 160,
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
            {loading && !rows.length && (
              <div style={{ color: "rgba(0,207,255,0.5)", padding: 20, textAlign: "center", fontSize: 11 }}>
                loading…
              </div>
            )}
            {visible.map((row, i) => {
              const id    = row.id || row.name || i;
              const isExp = expanded === id;
              const clsCol = CLASS_COLOR[row.cls] || CY;
              const roleLabel = row.role || "";
              return (
                <div key={id} style={{
                  background: "rgba(255,255,255,0.025)", border: `1px solid rgba(255,255,255,0.06)`,
                  borderRadius: 6, marginBottom: 4, overflow: "hidden",
                }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : id)}
                    style={{ padding: "7px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
                  >
                    {/* Class badge */}
                    <span style={{
                      background: `${clsCol}18`, border: `1px solid ${clsCol}`,
                      color: clsCol, fontSize: 9, padding: "1px 6px", borderRadius: 10, letterSpacing: 1,
                    }}>{row.cls.replace(/_/g, " ")}</span>
                    {/* Role badge */}
                    {roleLabel && (
                      <span style={{
                        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)",
                        color: "rgba(255,255,255,0.55)", fontSize: 9, padding: "1px 6px", borderRadius: 10,
                      }}>{roleLabel}</span>
                    )}
                    {/* Name */}
                    <span style={{
                      flex: 1, color: "#e2e8f0", fontSize: 11, fontWeight: 600,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{row.name || `Contact ${i + 1}`}</span>
                    {row.org || row.organisation ? (
                      <span style={{ color: "rgba(0,207,255,0.4)", fontSize: 9,
                                     overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>
                        {row.org || row.organisation}
                      </span>
                    ) : null}
                    <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{ padding: "0 10px 10px 10px", borderTop: `1px solid rgba(255,255,255,0.05)` }}>
                      {row.email && (
                        <div style={{ color: "rgba(0,207,255,0.55)", fontSize: 10, marginTop: 6, marginBottom: 8 }}>
                          {row.email}
                        </div>
                      )}
                      {/* Dataset matches */}
                      {row.dMatches.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: PU, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>▶ DATASET MATCHES</div>
                          {row.dMatches.map((m, j) => (
                            <div key={j} style={{ marginBottom: 3, padding: "4px 8px",
                                                   background: `${PU}08`, borderRadius: 4 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                <span style={{ color: "#e2e8f0", fontSize: 10, flex: 1,
                                               overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {m.item.name || m.item.title || `Dataset ${j + 1}`}
                                </span>
                              </div>
                              {relBar(m.score, PU)}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Report matches */}
                      {row.rMatches.length > 0 && (
                        <div>
                          <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>▶ REPORT MATCHES</div>
                          {row.rMatches.map((m, j) => (
                            <div key={j} style={{ marginBottom: 3, padding: "4px 8px",
                                                   background: `${CY}08`, borderRadius: 4 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                <span style={{ color: "#e2e8f0", fontSize: 10, flex: 1,
                                               overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {m.item.title || m.item.name || `Report ${j + 1}`}
                                </span>
                                {m.item.type && (
                                  <span style={{ color: CY, fontSize: 9, background: `${CY}18`,
                                                 border: `1px solid ${CY}44`, borderRadius: 3, padding: "1px 4px" }}>
                                    {m.item.type}
                                  </span>
                                )}
                              </div>
                              {relBar(m.score, CY)}
                            </div>
                          ))}
                        </div>
                      )}
                      {row.dMatches.length === 0 && row.rMatches.length === 0 && (
                        <div style={{ color: AM, fontSize: 10, padding: "6px 0" }}>
                          ⚠ No matching datasets or reports — contact lacks intelligence documentation.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!loading && visible.length === 0 && rows.length > 0 && (
              <div style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 20, fontSize: 11 }}>
                No contacts match current filter.
              </div>
            )}
          </div>

          {/* Brief */}
          {brief && (
            <div style={{ padding: "8px 14px", borderTop: `1px solid ${BORDER}`,
                          color: GR, fontSize: 10, lineHeight: 1.5 }}>
              ⟡ {brief}
            </div>
          )}

          {/* Footer */}
          <div style={{ padding: "6px 14px", borderTop: `1px solid ${BORDER}`,
                        display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={assess} disabled={assessing} style={{
              background: "none", border: `1px solid ${AM}`, color: AM,
              fontFamily: FONT, fontSize: 9, padding: "3px 10px", borderRadius: 3,
              cursor: assessing ? "wait" : "pointer", letterSpacing: 1,
            }}>
              {assessing ? "⟳ assessing…" : "▶ ASSESS COVERAGE"}
            </button>
            <span style={{ marginLeft: "auto", color: "rgba(0,207,255,0.35)", fontSize: 10 }}>
              CDIRMAT · {visible.length}/{rows.length} · auto-refresh 90 s
            </span>
            <span style={{ color: loading ? OR : "rgba(0,207,255,0.35)", fontSize: 10 }}>
              {loading ? "refreshing…" : "live"}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
