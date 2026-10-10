import { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#00E5FF";
const AM = "#FFB300";
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || "dev-key";
const REFRESH_MS = 90_000;

// ── Query matchers exported for JarvisBrain ───────────────────────────────
const DINV_RE = /\b(dataset\s*(investigation|link|linker|coverage)|investigation\s*(data|dataset)|d\s*inv|dinv|uncited\s*(data|datasets?)|data\s*link(er)?)\b/i;
export function isDinvQuery(q) { return DINV_RE.test(q); }

function keywords(str = "") {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3);
}

function relevance(dataset, investigation) {
  const dkw = keywords(`${dataset.name || ""} ${dataset.description || ""} ${dataset.type || ""} ${dataset.tags?.join(" ") || ""}`);
  const ikw = keywords(`${investigation.title || ""} ${investigation.description || ""} ${investigation.type || ""} ${investigation.status || ""}`);
  if (!dkw.length || !ikw.length) return 0;
  const shared = dkw.filter(w => ikw.includes(w));
  return shared.length / Math.max(dkw.length, ikw.length);
}

export async function buildDinvScript() {
  const base = apiBase();
  const [dsRes, invRes] = await Promise.allSettled([
    fetch(`${base}/v1/datasets`).then(r => r.json()),
    fetch(`${base}/v1/investigations`).then(r => r.json()),
  ]);

  const datasets = dsRes.status === "fulfilled"
    ? (dsRes.value?.items || dsRes.value || [])
    : [];
  const investigations = invRes.status === "fulfilled"
    ? (invRes.value?.items || invRes.value || [])
    : [];

  const cited   = datasets.filter(d => investigations.some(i => relevance(d, i) > 0));
  const uncited = datasets.filter(d => !investigations.some(i => relevance(d, i) > 0));

  const snapshot =
    `Datasets: ${datasets.length} total, ${cited.length} cited in investigations, ${uncited.length} uncited. ` +
    `Open investigations: ${investigations.length}.`;

  const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      message: `Dataset coverage analysis. Provide exactly 2 sentences: current dataset-to-investigation link status, and recommended action for uncited datasets. Data: ${snapshot}`,
    }),
  });
  const d = await r.json();
  return (d.answer || `${uncited.length} datasets have no investigation linkage. Review uncited datasets for relevance to open cases.`)
    .replace(/<<ACTION:[^>]*>>/g, "").trim();
}

// ── Component ─────────────────────────────────────────────────────────────
export default function DatasetInvestigationLinker() {
  const [open, setOpen]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [datasets, setDatasets]   = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [filter, setFilter]       = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [briefText, setBriefText] = useState("");
  const [briefing, setBriefing]   = useState(false);
  const [ts, setTs]               = useState(null);
  const timerRef                  = useRef(null);
  const audioRef                  = useRef(null);

  const base    = apiBase();
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [dsRes, invRes] = await Promise.allSettled([
        fetch(`${base}/v1/datasets`).then(r => r.json()),
        fetch(`${base}/v1/investigations`).then(r => r.json()),
      ]);
      const ds  = dsRes.status  === "fulfilled" ? (dsRes.value?.items  || dsRes.value  || []) : [];
      const inv = invRes.status === "fulfilled" ? (invRes.value?.items || invRes.value || []) : [];
      setDatasets(Array.isArray(ds)  ? ds  : []);
      setInvestigations(Array.isArray(inv) ? inv : []);
      setTs(new Date());
    } catch { /* silently retain last data */ }
    finally { setLoading(false); }
  }, [base]);

  const speak = useCallback(async (text) => {
    if (!text) return;
    try {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      const r = await fetch(`${base}/v1/voice/tts`, {
        method: "POST", headers,
        body: JSON.stringify({ text: text.slice(0, 400) }),
      });
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.play().catch(() => {});
      audio.onended = () => URL.revokeObjectURL(url);
    } catch { /* TTS unavailable */ }
  }, [base]);

  const runBrief = useCallback(async () => {
    setBriefing(true);
    try {
      const text = await buildDinvScript();
      setBriefText(text);
      speak(text);
    } catch { setBriefText("Dataset coverage assessment unavailable."); }
    finally { setBriefing(false); }
  }, [speak]);

  // Auto-refresh while open
  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  // Voice toggle
  useEffect(() => {
    const handler = () => { setOpen(v => { if (!v) fetchData(); return !v; }); };
    window.addEventListener("jarvis:dinv-toggle", handler);
    return () => window.removeEventListener("jarvis:dinv-toggle", handler);
  }, [fetchData]);

  // Computed linked/unlinked
  const enriched = datasets.map(d => {
    const links = investigations
      .map(i => ({ inv: i, score: relevance(d, i) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...d, links, cited: links.length > 0 };
  });

  const uncitedCount = enriched.filter(d => !d.cited).length;

  const filtered = enriched.filter(d => {
    if (filter === "CITED"   && !d.cited) return false;
    if (filter === "UNCITED" && d.cited)  return false;
    if (search) {
      const q = search.toLowerCase();
      return (d.name || "").toLowerCase().includes(q) ||
             (d.description || "").toLowerCase().includes(q) ||
             (d.type || "").toLowerCase().includes(q);
    }
    return true;
  });

  const TABS = ["ALL", "CITED", "UNCITED"];

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => { if (!open) { setOpen(true); fetchData(); } else setOpen(false); }}
        title="Dataset × Investigation Linker"
        style={{
          position: "fixed", left: 56200, bottom: 8, zIndex: 111,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: 1,
          background: open ? CY : "rgba(5,8,13,0.82)",
          color: open ? "#04060A" : CY,
          border: `1px solid ${CY}`, borderRadius: 4, padding: "3px 8px",
          cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: `0 0 10px ${CY}${open ? "" : "44"}`,
        }}
      >
        ◈ DINV
        {uncitedCount > 0 && (
          <span style={{
            marginLeft: 5, background: AM, color: "#04060A",
            borderRadius: 3, padding: "0 4px", fontSize: 9, fontWeight: 700,
          }}>{uncitedCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 56200, bottom: 36, zIndex: 111,
          width: "min(540px,90vw)", maxHeight: "72vh",
          background: "rgba(6,10,18,0.94)", border: `1px solid ${CY}44`,
          borderRadius: 10, padding: "14px 16px",
          backdropFilter: "blur(12px)", boxShadow: `0 0 40px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          display: "flex", flexDirection: "column", gap: 10,
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>
              DATASET × INVESTIGATION LINKER
            </span>
            {ts && (
              <span style={{ marginLeft: "auto", fontSize: 9, color: "#6E8AA0" }}>
                {ts.toLocaleTimeString()}
              </span>
            )}
            <button onClick={fetchData} title="Refresh"
              style={{ background: "none", border: `1px solid ${CY}44`, color: CY, borderRadius: 3, padding: "1px 6px", fontSize: 10, cursor: "pointer" }}>
              ↻
            </button>
          </div>

          {/* Stat tiles */}
          {datasets.length > 0 && (
            <div style={{ display: "flex", gap: 8 }}>
              {[
                ["DATASETS",      datasets.length,                          CY],
                ["INVESTIGATIONS", investigations.length,                   "#B0BEC5"],
                ["CITED",          enriched.filter(d => d.cited).length,    "#4CAF50"],
                ["UNCITED",        uncitedCount,                            AM],
              ].map(([label, val, col]) => (
                <div key={label} style={{
                  flex: 1, textAlign: "center",
                  background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "6px 4px",
                  border: `1px solid ${col}22`,
                }}>
                  <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
                  <div style={{ color: "#6E8AA0", fontSize: 8, letterSpacing: 1 }}>{label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Filter tabs + search */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setFilter(t)} style={{
                background: filter === t ? CY : "rgba(255,255,255,0.05)",
                color: filter === t ? "#04060A" : "#8AADCC",
                border: `1px solid ${CY}44`, borderRadius: 4, padding: "2px 10px",
                fontSize: 9, cursor: "pointer", letterSpacing: 1,
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search datasets…"
              style={{
                marginLeft: "auto", background: "rgba(0,229,255,0.06)",
                border: `1px solid ${CY}33`, borderRadius: 4, padding: "3px 8px",
                color: "#DCEBF5", fontSize: 10, outline: "none", width: 140,
              }}
            />
          </div>

          {/* Dataset list */}
          <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
            {loading && <span style={{ color: "#6E8AA0", fontSize: 11 }}>loading…</span>}
            {!loading && filtered.length === 0 && (
              <span style={{ color: "#6E8AA0", fontSize: 11 }}>No datasets match.</span>
            )}
            {filtered.map((d, i) => {
              const isExp = expanded === i;
              const statusColor = d.cited ? "#4CAF50" : AM;
              return (
                <div key={d.id || i} style={{
                  background: isExp ? "rgba(0,229,255,0.07)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${statusColor}33`,
                  borderRadius: 7, padding: "8px 10px", cursor: "pointer",
                }} onClick={() => setExpanded(isExp ? null : i)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      fontSize: 8, letterSpacing: 1, padding: "1px 6px",
                      background: `${statusColor}22`, color: statusColor,
                      border: `1px solid ${statusColor}55`, borderRadius: 3,
                    }}>{d.cited ? "CITED" : "UNCITED"}</span>
                    <span style={{ fontSize: 11, flex: 1 }}>{d.name || "(unnamed dataset)"}</span>
                    {d.type && <span style={{ fontSize: 9, color: "#6E8AA0" }}>{d.type}</span>}
                    <span style={{ fontSize: 10, color: CY }}>{isExp ? "▲" : "▼"}</span>
                  </div>
                  {d.description && (
                    <div style={{ fontSize: 9, color: "#6E8AA0", marginTop: 3 }}>{d.description.slice(0, 100)}{d.description.length > 100 ? "…" : ""}</div>
                  )}

                  {/* Expanded: matched investigations */}
                  {isExp && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                      {d.links.length === 0 && (
                        <span style={{ fontSize: 9, color: AM }}>No investigation linkage found for this dataset.</span>
                      )}
                      {d.links.map(({ inv, score }, li) => (
                        <div key={inv.id || li} style={{
                          background: "rgba(0,229,255,0.05)", border: `1px solid ${CY}22`,
                          borderRadius: 5, padding: "6px 8px",
                        }}>
                          <div style={{ fontSize: 10, color: "#DCEBF5" }}>{inv.title || "(unnamed investigation)"}</div>
                          {inv.status && <span style={{ fontSize: 8, color: "#6E8AA0" }}>{inv.status}</span>}
                          {/* Relevance bar */}
                          <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
                              <div style={{ width: `${Math.round(score * 100)}%`, height: "100%", background: CY, borderRadius: 2 }} />
                            </div>
                            <span style={{ fontSize: 8, color: CY, minWidth: 28 }}>{Math.round(score * 100)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* AI brief */}
          <div style={{ borderTop: `1px solid ${CY}22`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {briefText && (
              <div style={{ fontSize: 10, color: "#B0C4D8", lineHeight: 1.5 }}>{briefText}</div>
            )}
            <button onClick={runBrief} disabled={briefing} style={{
              alignSelf: "flex-start",
              background: briefing ? "rgba(0,229,255,0.1)" : "rgba(0,229,255,0.14)",
              border: `1px solid ${CY}55`, color: CY, borderRadius: 4,
              padding: "4px 12px", fontSize: 10, cursor: briefing ? "default" : "pointer",
              letterSpacing: 1,
            }}>
              {briefing ? "assessing…" : "▶ ASSESS COVERAGE"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
