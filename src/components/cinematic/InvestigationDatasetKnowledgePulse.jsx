/**
 * F116 — Investigation × Dataset × Knowledge Intelligence Pulse (IDKPULS)
 *
 * Parallel-fetches /v1/investigations + /v1/datasets + /knowledge/.
 * Keyword-correlates each investigation against available datasets AND KB articles:
 *   FULLY_RESOURCED — matched both a dataset AND a KB article
 *   DATA_BACKED     — matched dataset only
 *   KB_BACKED       — matched KB article only
 *   BARE            — no matches (resource gap)
 *
 * Stat tiles: INVESTIGATIONS / DATASETS / KB ARTICLES + all four class counts + INTEL%.
 * Amber badge on bare count.
 * Filter tabs ALL / FULLY_RESOURCED / DATA_BACKED / KB_BACKED / BARE + text search.
 * Expand investigation → matched dataset cards (purple) + KB article cards (green) with relevance bars.
 * ▶ ASSESS INTELLIGENCE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:idkpuls-toggle event.
 *
 * Voice triggers: "idkpuls / investigation dataset knowledge / data backed investigation /
 *                  investigation intelligence / bare investigations / investigation resource coverage".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_007_880;
const Z_INDEX  = 178;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const IDKPULS_RE = /\b(idkpuls|investigation[\s-]dataset[\s-]knowledge|data[\s-]backed[\s-]investigation|investigation[\s-]intelligence|bare[\s-]investigations|investigation[\s-]resource[\s-]coverage)\b/i;

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

const CLASS_COLOR = { FULLY_RESOURCED: GR, DATA_BACKED: PU, KB_BACKED: BL, BARE: AM };
const TABS = ["ALL", "FULLY_RESOURCED", "DATA_BACKED", "KB_BACKED", "BARE"];

// ── exports for JarvisBrain ───────────────────────────────────────────────────

export function isIdkpulsQuery(text) {
  return IDKPULS_RE.test(text || "");
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

function relevance(inv, target) {
  const iw = words(`${inv.title || inv.name || ""} ${inv.description || ""} ${inv.type || ""}`);
  const tw = words(`${target.name || target.title || target.description || ""}`);
  if (!iw.length || !tw.length) return 0;
  const hits = iw.filter(w => tw.includes(w)).length;
  return Math.min(100, Math.round((hits / Math.min(iw.length, tw.length)) * 100));
}

function classify(inv, datasets, kbArticles) {
  const dMatches = datasets
    .map(d => ({ item: d, score: relevance(inv, d) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const kMatches = kbArticles
    .map(k => ({ item: k, score: relevance(inv, k) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  let cls;
  if (dMatches.length && kMatches.length) cls = "FULLY_RESOURCED";
  else if (dMatches.length)               cls = "DATA_BACKED";
  else if (kMatches.length)               cls = "KB_BACKED";
  else                                    cls = "BARE";
  return { cls, dMatches, kMatches };
}

export async function buildIdkpulsScript() {
  const base = apiBase();
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
  const [invRaw, dsRaw, kbRaw] = await Promise.all([
    fetch(`${base}/v1/investigations`, { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/v1/datasets`,       { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/knowledge/`,        { headers }).then(r => r.json()).catch(() => []),
  ]);
  const investigations = norm(invRaw, ["results", "data", "items", "investigations"]);
  const datasets       = norm(dsRaw,  ["results", "data", "items", "datasets"]);
  const kbArticles     = norm(kbRaw,  ["results", "data", "items", "articles"]);
  const rows = investigations.map(i => ({ ...i, ...classify(i, datasets, kbArticles) }));
  const fully  = rows.filter(r => r.cls === "FULLY_RESOURCED").length;
  const dataB  = rows.filter(r => r.cls === "DATA_BACKED").length;
  const kbB    = rows.filter(r => r.cls === "KB_BACKED").length;
  const bare   = rows.filter(r => r.cls === "BARE").length;
  const pct    = rows.length ? Math.round(((fully + dataB + kbB) / rows.length) * 100) : 0;
  const context = `Investigation Dataset Knowledge Pulse (IDKPULS) — ${investigations.length} investigations, ${datasets.length} datasets, ${kbArticles.length} KB articles. Resourcing: ${fully} fully-resourced, ${dataB} data-backed, ${kbB} KB-backed, ${bare} bare (resource gap). Intelligence coverage: ${pct}%.`;
  const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message: `${context} Assess investigation intelligence resourcing in two sentences.` }),
  });
  const d = await r.json().catch(() => ({}));
  return (d.answer || context).replace(/<<ACTION:[^>]*>>/g, "").trim();
}

// ── component ─────────────────────────────────────────────────────────────────

export function InvestigationDatasetKnowledgePulse() {
  const [open, setOpen]           = useState(false);
  const [investigations, setInvestigations] = useState([]);
  const [datasets, setDatasets]   = useState([]);
  const [kbArticles, setKbArticles] = useState([]);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [brief, setBrief]         = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);
  const base     = apiBase();
  const headers  = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [invRaw, dsRaw, kbRaw] = await Promise.all([
        fetch(`${base}/v1/investigations`, { headers }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/datasets`,       { headers }).then(r => r.json()).catch(() => []),
        fetch(`${base}/knowledge/`,        { headers }).then(r => r.json()).catch(() => []),
      ]);
      const invs  = norm(invRaw, ["results", "data", "items", "investigations"]);
      const dsets = norm(dsRaw,  ["results", "data", "items", "datasets"]);
      const kb    = norm(kbRaw,  ["results", "data", "items", "articles"]);
      setInvestigations(invs);
      setDatasets(dsets);
      setKbArticles(kb);
      setRows(invs.map(i => ({ ...i, ...classify(i, dsets, kb) })));
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    const onToggle = () => setOpen(v => { if (!v) load(); return !v; });
    window.addEventListener("jarvis:idkpuls-toggle", onToggle);
    return () => window.removeEventListener("jarvis:idkpuls-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  // derived
  const fully = rows.filter(r => r.cls === "FULLY_RESOURCED").length;
  const dataB = rows.filter(r => r.cls === "DATA_BACKED").length;
  const kbB   = rows.filter(r => r.cls === "KB_BACKED").length;
  const bare  = rows.filter(r => r.cls === "BARE").length;
  const pct   = rows.length ? Math.round(((fully + dataB + kbB) / rows.length) * 100) : 0;
  const badge = bare;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.title || r.name || "").toLowerCase().includes(q) ||
             (r.description || "").toLowerCase().includes(q);
    }
    return true;
  });

  async function assess() {
    setAssessing(true); setBrief("");
    try {
      const script = await buildIdkpulsScript();
      setBrief(script);
      const tr = await fetch(`${base}/v1/voice/tts`, {
        method: "POST", headers,
        body: JSON.stringify({ text: script }),
      });
      const blob = await tr.blob().catch(() => null);
      if (blob) { const a = new Audio(URL.createObjectURL(blob)); a.play().catch(() => {}); }
    } catch { setBrief("Intelligence assessment unavailable."); }
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
        ◈ IDKPULS
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
            <span style={{ color: AM, fontSize: 12, fontWeight: 700, letterSpacing: 2 }}>◈ IDKPULS</span>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>Investigation × Dataset × Knowledge Intelligence Pulse</span>
            <button onClick={() => setOpen(false)} style={{
              marginLeft: "auto", background: "none", border: "none",
              color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 14,
            }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`,
                        display: "flex", gap: 8, flexWrap: "wrap" }}>
            {tile("INVESTIG.", rows.length,           BL)}
            {tile("DATASETS",  datasets.length,       PU)}
            {tile("KB ARTICLES", kbArticles.length,   GR)}
            {tile("FULLY RES", fully,                 GR)}
            {tile("DATA BACK", dataB,                 PU)}
            {tile("KB BACK",   kbB,                   BL)}
            {tile("BARE",      bare,                  AM)}
            {tile("INTEL",     `${pct}%`, pct > 70 ? GR : pct > 40 ? AM : RD)}
          </div>

          {/* Coverage bar */}
          <div style={{ padding: "4px 14px", borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, minWidth: 70 }}>INTEL COVER</span>
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
              placeholder="search investigations…"
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
              const id    = row.id || row.title || row.name || i;
              const isExp = expanded === id;
              const clsCol = CLASS_COLOR[row.cls] || CY;
              const priority = row.priority?.toUpperCase() || "";
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
                    {/* Priority badge */}
                    {priority && (
                      <span style={{
                        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)",
                        color: "rgba(255,255,255,0.55)", fontSize: 9, padding: "1px 6px", borderRadius: 10,
                      }}>{priority}</span>
                    )}
                    {/* Title */}
                    <span style={{
                      flex: 1, color: "#e2e8f0", fontSize: 11, fontWeight: 600,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{row.title || row.name || `Investigation ${i + 1}`}</span>
                    <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{ padding: "0 10px 10px 10px", borderTop: `1px solid rgba(255,255,255,0.05)` }}>
                      {row.description && (
                        <div style={{ color: "rgba(0,207,255,0.55)", fontSize: 10, marginTop: 6, marginBottom: 8, lineHeight: 1.5 }}>
                          {String(row.description).slice(0, 200)}{row.description.length > 200 ? "…" : ""}
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
                      {/* KB article matches */}
                      {row.kMatches.length > 0 && (
                        <div>
                          <div style={{ color: GR, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>▶ KB ARTICLE MATCHES</div>
                          {row.kMatches.map((m, j) => (
                            <div key={j} style={{ marginBottom: 3, padding: "4px 8px",
                                                   background: `${GR}08`, borderRadius: 4 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                <span style={{ color: "#e2e8f0", fontSize: 10, flex: 1,
                                               overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {m.item.title || m.item.name || `Article ${j + 1}`}
                                </span>
                              </div>
                              {relBar(m.score, GR)}
                            </div>
                          ))}
                        </div>
                      )}
                      {row.dMatches.length === 0 && row.kMatches.length === 0 && (
                        <div style={{ color: AM, fontSize: 10, padding: "6px 0" }}>
                          ⚠ No matching datasets or KB articles — investigation lacks intelligence resourcing.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!loading && visible.length === 0 && rows.length > 0 && (
              <div style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 20, fontSize: 11 }}>
                No investigations match current filter.
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
              {assessing ? "⟳ assessing…" : "▶ ASSESS INTELLIGENCE"}
            </button>
            <span style={{ marginLeft: "auto", color: "rgba(0,207,255,0.35)", fontSize: 10 }}>
              IDKPULS · {visible.length}/{rows.length} · auto-refresh 90 s
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
