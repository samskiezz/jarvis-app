/**
 * ReportLibraryBrowser — F307.
 *
 * Data sources (all real — backed by server/routes/reports.py):
 *   GET  /v1/reports                        → {items:[{id,title,body,meta,created_ts}], count}
 *   GET  /v1/reports/{id}                   → {id,title,body,meta,created_ts}
 *   GET  /v1/reports/{id}/export?fmt=md|json → {id,fmt,content}
 *   POST /v1/reports/generate               → {brief:{title,markdown,...}, id?}
 *
 * Displays:
 *   - Report list: type badge (GENERATED / MANUAL) + title + date + report count header
 *   - Filter tabs: ALL / GENERATED / MANUAL + date-range inputs + text search
 *   - Click row → inspector pane with full body + Export button (download md or json)
 *   - "Generate New" drawer: query text + optional case_id → POST + spinner → opens result
 *   - ASSESS speaks latest report summary + TTS
 *
 * Toggle: ◈ RPTBROW  left:219720  bottom:8  zIndex:403
 * Event:  jarvis:rptbrow-toggle
 * Voice:  "report library / rptbrow / report browser / browse reports /
 *          intelligence library / report vault / report archive"
 *
 * Exported for JarvisBrain: isRptbrowQuery, buildRptbrowScript
 * Mounted via src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

// ── palette ────────────────────────────────────────────────────────────────
const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RD   = "#F87171";
const VI   = "#A78BFA";
const SURF = "rgba(6,11,18,0.97)";
const BORD = "rgba(41,231,255,0.18)";
const DIM  = "rgba(41,231,255,0.40)";

// ── constants ─────────────────────────────────────────────────────────────
const BTN_LEFT = 219720;
const PANEL_W  = 860;
const PANEL_H  = 640;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ── JarvisBrain exports ───────────────────────────────────────────────────
const RPTBROW_RE =
  /\b(report\s*library|rptbrow\b|report\s*browser|browse\s*reports?|intelligence\s*library|report\s*vault|report\s*archive|all\s*reports?|saved\s*reports?)\b/i;

export function isRptbrowQuery(q) {
  return RPTBROW_RE.test(q || "");
}

export async function buildRptbrowScript() {
  try {
    const r = await fetch(`${apiBase}/v1/reports`);
    const d = await r.json();
    const items = normalise(d);
    const total = d?.count ?? items.length;
    const generated = items.filter((x) => x.meta?.generated).length;
    const manual = total - generated;
    const latest = items[0];
    return (
      `Report Library: ${total} report(s) total — ${generated} generated, ${manual} manual. ` +
      (latest
        ? `Latest: "${latest.title}" (${formatAge(latest.created_ts)}).`
        : "No reports saved yet.")
    );
  } catch {
    return "Report Library: could not reach /v1/reports.";
  }
}

// ── helpers ───────────────────────────────────────────────────────────────
function normalise(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ["items", "reports", "results", "data"]) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function formatAge(tsMs) {
  if (!tsMs) return "unknown";
  const d = Date.now() - tsMs;
  if (d < 60_000) return `${Math.round(d / 1000)}s ago`;
  if (d < 3_600_000) return `${Math.round(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.round(d / 3_600_000)}h ago`;
  return `${Math.round(d / 86_400_000)}d ago`;
}

function formatDate(tsMs) {
  if (!tsMs) return "—";
  return new Date(tsMs).toISOString().slice(0, 16).replace("T", " ");
}

function reportType(item) {
  return item?.meta?.generated ? "GENERATED" : "MANUAL";
}

function typeBadge(type) {
  const color = type === "GENERATED" ? VI : AM;
  return (
    <span style={{
      display: "inline-block", padding: "1px 6px", borderRadius: 3,
      border: `1px solid ${color}55`, background: `${color}18`,
      color, fontSize: 9, letterSpacing: 1, marginRight: 6,
    }}>{type}</span>
  );
}

// ── TTS helper ────────────────────────────────────────────────────────────
async function tts(text) {
  try {
    const r = await fetch(`${apiBase}/v1/voice/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ text }),
    });
    const d = await r.json();
    if (d?.audio_url) {
      const a = new Audio(d.audio_url);
      a.play().catch(() => {});
    }
  } catch { /* skip */ }
}

// ── ASSESS helper ─────────────────────────────────────────────────────────
async function assess(items, setBrief, setAssessing) {
  setAssessing(true);
  setBrief("");
  try {
    const snap = await buildRptbrowScript();
    const r = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `Assess: ${snap} Summarise in 2 sentences what the report library shows and any notable patterns.`,
      }),
    });
    const d = await r.json();
    const txt = d?.response || d?.reply || d?.text || "No assessment available.";
    setBrief(txt);
    tts(txt.slice(0, 300));
  } catch (e) {
    setBrief("Assessment unavailable.");
  }
  setAssessing(false);
}

// ─────────────────────────────────────────────────────────────────────────────
export default function ReportLibraryBrowser() {
  const [open, setOpen]           = useState(false);
  const [reports, setReports]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [dateFrom, setDateFrom]   = useState("");
  const [dateTo, setDateTo]       = useState("");
  const [selected, setSelected]   = useState(null);
  const [detail, setDetail]       = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportFmt, setExportFmt] = useState("md");
  const [showGenerate, setShowGenerate] = useState(false);
  const [genQuery, setGenQuery]   = useState("");
  const [genCaseId, setGenCaseId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError]   = useState("");
  const [brief, setBrief]         = useState("");
  const [assessing, setAssessing] = useState(false);

  const panelRef = useRef(null);

  // ── fetch list ──────────────────────────────────────────────────────────
  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${apiBase}/v1/reports`);
      const d = await r.json();
      setReports(normalise(d));
    } catch { /* skip */ }
    setLoading(false);
  }, []);

  // ── fetch detail ────────────────────────────────────────────────────────
  const loadDetail = useCallback(async (id) => {
    setLoadingDetail(true);
    setDetail(null);
    try {
      const r = await fetch(`${apiBase}/v1/reports/${id}`);
      const d = await r.json();
      setDetail(d);
    } catch { /* skip */ }
    setLoadingDetail(false);
  }, []);

  // ── export ──────────────────────────────────────────────────────────────
  const doExport = useCallback(async (id, fmt) => {
    setExporting(true);
    try {
      const r = await fetch(`${apiBase}/v1/reports/${id}/export?fmt=${fmt}`);
      const d = await r.json();
      const content = d?.content || "";
      const blob = new Blob([content], { type: fmt === "json" ? "application/json" : "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-${id}.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* skip */ }
    setExporting(false);
  }, []);

  // ── generate ────────────────────────────────────────────────────────────
  const doGenerate = useCallback(async () => {
    if (!genQuery.trim()) { setGenError("Query is required."); return; }
    setGenerating(true);
    setGenError("");
    try {
      const body = { query: genQuery.trim(), save: true };
      if (genCaseId.trim()) body.case_id = parseInt(genCaseId, 10) || undefined;
      const r = await fetch(`${apiBase}/v1/reports/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        setGenError(err?.detail || `Server error ${r.status}`);
        setGenerating(false);
        return;
      }
      const d = await r.json();
      setShowGenerate(false);
      setGenQuery("");
      setGenCaseId("");
      await loadReports();
      if (d?.id) {
        setSelected(d.id);
        await loadDetail(d.id);
      }
    } catch (e) {
      setGenError(e?.message || "Generate failed.");
    }
    setGenerating(false);
  }, [genQuery, genCaseId, loadReports, loadDetail]);

  // ── toggle ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:rptbrow-toggle", onToggle);
    return () => window.removeEventListener("jarvis:rptbrow-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (open) loadReports();
  }, [open, loadReports]);

  useEffect(() => {
    if (selected != null) loadDetail(selected);
  }, [selected, loadDetail]);

  // ── filtered list ────────────────────────────────────────────────────────
  const visible = reports.filter((item) => {
    if (tab === "GENERATED" && !item.meta?.generated) return false;
    if (tab === "MANUAL"    &&  item.meta?.generated) return false;
    if (search && !item.title?.toLowerCase().includes(search.toLowerCase())) return false;
    if (dateFrom) {
      const fromMs = new Date(dateFrom).getTime();
      if (item.created_ts < fromMs) return false;
    }
    if (dateTo) {
      const toMs = new Date(dateTo).getTime() + 86_400_000;
      if (item.created_ts > toMs) return false;
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="F307 Report Library Browser"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 403,
          background: "rgba(6,11,18,0.82)", border: `1px solid ${CY}55`,
          color: CY, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1, padding: "3px 7px", cursor: "pointer",
          borderRadius: 3, whiteSpace: "nowrap",
        }}
      >
        ◈ RPTBROW
        <span style={{
          marginLeft: 5, background: CY, color: "#04060A",
          fontSize: 8, padding: "0 4px", borderRadius: 2,
        }}>{reports.length || ""}</span>
      </button>
    );
  }

  return (
    <>
      {/* ── closed button (still visible) ── */}
      <button
        onClick={() => setOpen(false)}
        title="Close Report Library Browser"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 403,
          background: CY, border: `1px solid ${CY}`,
          color: "#04060A", fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1, padding: "3px 7px", cursor: "pointer",
          borderRadius: 3, whiteSpace: "nowrap",
        }}
      >◈ RPTBROW</button>

      {/* ── panel ─────────────────────────────────────────────────────── */}
      <div
        ref={panelRef}
        style={{
          position: "fixed",
          left: Math.min(BTN_LEFT, window.innerWidth - PANEL_W - 12),
          bottom: 42,
          width: PANEL_W,
          maxWidth: "calc(100vw - 24px)",
          height: PANEL_H,
          zIndex: 403,
          background: SURF,
          border: `1px solid ${BORD}`,
          borderRadius: 10,
          boxShadow: `0 0 60px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace",
          color: "#DCEBF5",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* ── header ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px 8px", borderBottom: `1px solid ${BORD}`,
          flexShrink: 0,
        }}>
          <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
            ◈ REPORT LIBRARY BROWSER
          </span>
          <span style={{
            background: CY, color: "#04060A", fontSize: 9,
            padding: "0 5px", borderRadius: 2, marginLeft: 4,
          }}>{reports.length}</span>
          <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button
              onClick={() => { setShowGenerate((v) => !v); setBrief(""); }}
              style={{
                background: showGenerate ? VI : "transparent",
                border: `1px solid ${VI}88`, color: showGenerate ? "#04060A" : VI,
                fontSize: 9, padding: "2px 7px", borderRadius: 3, cursor: "pointer",
                letterSpacing: 1,
              }}
            >+ GENERATE</button>
            <button
              onClick={() => assess(reports, setBrief, setAssessing)}
              disabled={assessing}
              style={{
                background: "transparent", border: `1px solid ${AM}88`,
                color: AM, fontSize: 9, padding: "2px 7px", borderRadius: 3,
                cursor: "pointer", letterSpacing: 1,
              }}
            >{assessing ? "◌ ASSESSING…" : "▶ ASSESS"}</button>
            <button
              onClick={loadReports}
              style={{
                background: "transparent", border: `1px solid ${DIM}`,
                color: DIM, fontSize: 9, padding: "2px 6px", borderRadius: 3,
                cursor: "pointer",
              }}
            >↺</button>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "transparent", border: `1px solid ${DIM}`,
                color: DIM, fontSize: 9, padding: "2px 6px", borderRadius: 3,
                cursor: "pointer",
              }}
            >✕</button>
          </span>
        </div>

        {/* ── ASSESS brief ── */}
        {brief && (
          <div style={{
            padding: "7px 14px", background: `${AM}12`,
            borderBottom: `1px solid ${AM}33`,
            fontSize: 10, color: AM, lineHeight: 1.5, flexShrink: 0,
          }}>{brief}</div>
        )}

        {/* ── Generate drawer ── */}
        {showGenerate && (
          <div style={{
            padding: "10px 14px", background: `${VI}10`,
            borderBottom: `1px solid ${VI}33`, flexShrink: 0,
          }}>
            <div style={{ fontSize: 9, color: VI, letterSpacing: 1, marginBottom: 6 }}>
              GENERATE NEW REPORT
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                value={genQuery}
                onChange={(e) => setGenQuery(e.target.value)}
                placeholder="Query / subject…"
                style={{
                  flex: "1 1 260px", background: "rgba(41,231,255,0.06)",
                  border: `1px solid ${CY}44`, color: "#DCEBF5",
                  padding: "4px 8px", borderRadius: 4, fontSize: 10,
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              />
              <input
                value={genCaseId}
                onChange={(e) => setGenCaseId(e.target.value)}
                placeholder="Case ID (optional)"
                style={{
                  width: 130, background: "rgba(41,231,255,0.06)",
                  border: `1px solid ${CY}44`, color: "#DCEBF5",
                  padding: "4px 8px", borderRadius: 4, fontSize: 10,
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              />
              <button
                onClick={doGenerate}
                disabled={generating}
                style={{
                  background: VI, color: "#04060A", border: "none",
                  padding: "4px 12px", borderRadius: 4, cursor: "pointer",
                  fontSize: 10, letterSpacing: 1, fontFamily: "'JetBrains Mono',monospace",
                }}
              >{generating ? "◌…" : "GENERATE"}</button>
            </div>
            {genError && (
              <div style={{ color: RD, fontSize: 9, marginTop: 5 }}>{genError}</div>
            )}
          </div>
        )}

        {/* ── filters ── */}
        <div style={{
          display: "flex", gap: 6, alignItems: "center",
          padding: "7px 14px", borderBottom: `1px solid ${BORD}`,
          flexShrink: 0, flexWrap: "wrap",
        }}>
          {["ALL", "GENERATED", "MANUAL"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? CY : "transparent",
                border: `1px solid ${CY}55`,
                color: tab === t ? "#04060A" : CY,
                fontSize: 9, padding: "2px 8px", borderRadius: 3,
                cursor: "pointer", letterSpacing: 1,
              }}
            >{t}</button>
          ))}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search title…"
            style={{
              background: "rgba(41,231,255,0.06)", border: `1px solid ${CY}44`,
              color: "#DCEBF5", padding: "2px 7px", borderRadius: 3,
              fontSize: 9, fontFamily: "'JetBrains Mono',monospace", width: 140,
            }}
          />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            title="From date"
            style={{
              background: "rgba(41,231,255,0.06)", border: `1px solid ${CY}44`,
              color: "#DCEBF5", padding: "2px 5px", borderRadius: 3,
              fontSize: 9, fontFamily: "'JetBrains Mono',monospace",
              colorScheme: "dark",
            }}
          />
          <span style={{ color: DIM, fontSize: 9 }}>–</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            title="To date"
            style={{
              background: "rgba(41,231,255,0.06)", border: `1px solid ${CY}44`,
              color: "#DCEBF5", padding: "2px 5px", borderRadius: 3,
              fontSize: 9, fontFamily: "'JetBrains Mono',monospace",
              colorScheme: "dark",
            }}
          />
          <span style={{ marginLeft: "auto", color: DIM, fontSize: 9 }}>
            {visible.length}/{reports.length}
          </span>
        </div>

        {/* ── body: list + inspector ── */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* list pane */}
          <div style={{
            width: 320, flexShrink: 0, overflowY: "auto",
            borderRight: `1px solid ${BORD}`,
          }}>
            {loading && (
              <div style={{ padding: 16, color: DIM, fontSize: 10 }}>◌ loading…</div>
            )}
            {!loading && visible.length === 0 && (
              <div style={{ padding: 16, color: DIM, fontSize: 10 }}>
                No reports match filters.
              </div>
            )}
            {visible.map((item) => {
              const type = reportType(item);
              const active = selected === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => setSelected(item.id)}
                  style={{
                    padding: "9px 12px",
                    borderBottom: `1px solid ${BORD}`,
                    cursor: "pointer",
                    background: active ? `${CY}14` : "transparent",
                    transition: "background 0.15s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", marginBottom: 3 }}>
                    {typeBadge(type)}
                    <span style={{
                      color: active ? CY : "#DCEBF5",
                      fontSize: 10, lineHeight: 1.3,
                      overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap", maxWidth: 200,
                    }}>{item.title || `Report #${item.id}`}</span>
                  </div>
                  <div style={{ color: DIM, fontSize: 9 }}>
                    #{item.id} · {formatAge(item.created_ts)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* inspector pane */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
            {!selected && (
              <div style={{ color: DIM, fontSize: 10, paddingTop: 20 }}>
                Select a report to view its content.
              </div>
            )}
            {selected && loadingDetail && (
              <div style={{ color: DIM, fontSize: 10 }}>◌ loading…</div>
            )}
            {selected && !loadingDetail && detail && (
              <>
                <div style={{
                  display: "flex", alignItems: "flex-start",
                  gap: 8, marginBottom: 10, flexWrap: "wrap",
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: CY, fontSize: 12, fontWeight: 700, marginBottom: 3 }}>
                      {detail.title || `Report #${detail.id}`}
                    </div>
                    <div style={{ color: DIM, fontSize: 9 }}>
                      {typeBadge(reportType(detail))}
                      #{detail.id} · {formatDate(detail.created_ts)}
                      {detail.meta?.case_id && (
                        <span style={{ marginLeft: 6 }}>case:{detail.meta.case_id}</span>
                      )}
                      {detail.meta?.query && (
                        <span style={{ marginLeft: 6 }}>q: "{detail.meta.query}"</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                    <select
                      value={exportFmt}
                      onChange={(e) => setExportFmt(e.target.value)}
                      style={{
                        background: "rgba(41,231,255,0.06)",
                        border: `1px solid ${CY}44`, color: CY,
                        fontSize: 9, padding: "2px 4px", borderRadius: 3,
                        fontFamily: "'JetBrains Mono',monospace",
                        colorScheme: "dark",
                      }}
                    >
                      <option value="md">md</option>
                      <option value="json">json</option>
                    </select>
                    <button
                      onClick={() => doExport(detail.id, exportFmt)}
                      disabled={exporting}
                      style={{
                        background: exporting ? "transparent" : GN,
                        border: `1px solid ${GN}88`,
                        color: exporting ? GN : "#04060A",
                        fontSize: 9, padding: "2px 8px", borderRadius: 3,
                        cursor: "pointer", letterSpacing: 1,
                      }}
                    >{exporting ? "◌ exporting…" : "↓ EXPORT"}</button>
                  </div>
                </div>
                <div style={{
                  background: "rgba(41,231,255,0.04)",
                  border: `1px solid ${BORD}`,
                  borderRadius: 6, padding: "10px 12px",
                  fontSize: 10, lineHeight: 1.6, color: "#BEDCF0",
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                  overflowY: "auto",
                  maxHeight: PANEL_H - 200,
                }}>
                  {detail.body || <span style={{ color: DIM }}>No body content.</span>}
                </div>
              </>
            )}
            {selected && !loadingDetail && !detail && (
              <div style={{ color: RD, fontSize: 10 }}>
                Could not load report #{selected}.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
