/**
 * BulkPredictRunner — F312
 *
 * ◈ BLKPRED button (left:222520, zIndex:408)
 * Toggle: jarvis:blkpred-toggle
 * Voice: "bulk predict", "blkpred", "run bulk prediction",
 *         "predict runner", "bulk runner"
 *
 * Endpoints:
 *   GET  /v1/ontology/types             (entity type list)
 *   GET  /v1/ontology/objects?type=     (entity list by type)
 *   GET  /v1/predict/models             (model selector)
 *   POST /functions/predict             (predict per entity, sequential)
 *   POST /v1/jarvis/agent/chat          (ASSESS)
 *   POST /v1/voice/tts
 *
 * Exports: isBlkpredQuery
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RD   = "#F87171";
const VI   = "#A78BFA";
const SURF = "rgba(6,11,18,0.97)";
const BORD = "rgba(41,231,255,0.18)";
const DIM  = "rgba(41,231,255,0.40)";

const BTN_LEFT = 222520;
const PANEL_W  = 1140;
const PANEL_H  = 700;
const API_KEY  = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

/* ── JarvisBrain exports ─────────────────────────────────────────────────── */

const BLKPRED_RE = /\b(bulk\s*predict|blkpred|run\s*bulk\s*pred|predict\s*runner|bulk\s*runner|bulk\s*eval)\b/i;
export function isBlkpredQuery(q) { return BLKPRED_RE.test(q || ""); }

/* ── helpers ─────────────────────────────────────────────────────────────── */

async function fetchJSON(url) {
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

async function postJSON(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

async function speakTTS(text) {
  try {
    const base = apiBase();
    await postJSON(`${base}/v1/voice/tts`, { text });
  } catch { /* silent */ }
}

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

function ConfidenceBar({ value }) {
  const pct = Math.round((value || 0) * 100);
  const color = pct >= 70 ? GN : pct >= 40 ? AM : RD;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3,
          transition: "width 0.4s ease", boxShadow: `0 0 6px ${color}88` }} />
      </div>
      <span style={{ color, fontSize: 11, minWidth: 36, textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

/* ── component ───────────────────────────────────────────────────────────── */

export default function BulkPredictRunner() {
  const [open, setOpen]           = useState(false);
  const [types, setTypes]         = useState([]);
  const [selType, setSelType]     = useState("");
  const [entities, setEntities]   = useState([]);
  const [selIds, setSelIds]       = useState(new Set());
  const [models, setModels]       = useState([]);
  const [selModel, setSelModel]   = useState("");
  const [running, setRunning]     = useState(false);
  const [progress, setProgress]   = useState({ done: 0, total: 0 });
  const [results, setResults]     = useState([]);
  const [sortDir, setSortDir]     = useState("desc");
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [loadingEnts, setLoadingEnts]   = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [err, setErr]             = useState("");
  const abortRef = useRef(false);
  const audioRef = useRef(null);

  /* toggle */
  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:blkpred-toggle", handler);
    return () => window.removeEventListener("jarvis:blkpred-toggle", handler);
  }, []);

  /* load types + models on open */
  const loadTypes = useCallback(async () => {
    setLoadingTypes(true);
    try {
      const base = apiBase();
      const data = await fetchJSON(`${base}/v1/ontology/types`);
      const arr = Array.isArray(data) ? data : (data.types || data.data || []);
      setTypes(arr);
      if (arr.length > 0 && !selType) setSelType(arr[0]?.id || arr[0]?.name || arr[0] || "");
    } catch (e) { setErr(`Types: ${e.message}`); }
    finally { setLoadingTypes(false); }
  }, [selType]);

  const loadModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      const base = apiBase();
      const data = await fetchJSON(`${base}/v1/predict/models`);
      const arr = Array.isArray(data) ? data : (data.models || data.data || []);
      setModels(arr);
      if (arr.length > 0 && !selModel) setSelModel(arr[0]?.id || arr[0]?.name || arr[0] || "");
    } catch (e) { setErr(`Models: ${e.message}`); }
    finally { setLoadingModels(false); }
  }, [selModel]);

  useEffect(() => {
    if (open) { loadTypes(); loadModels(); }
  }, [open, loadTypes, loadModels]);

  /* load entities when type changes */
  const loadEntities = useCallback(async (type) => {
    if (!type) return;
    setLoadingEnts(true); setSelIds(new Set()); setErr("");
    try {
      const base = apiBase();
      const data = await fetchJSON(`${base}/v1/ontology/objects?type=${encodeURIComponent(type)}&limit=20`);
      const arr = Array.isArray(data) ? data : (data.objects || data.data || []);
      setEntities(arr.slice(0, 20));
    } catch (e) { setErr(`Entities: ${e.message}`); setEntities([]); }
    finally { setLoadingEnts(false); }
  }, []);

  useEffect(() => {
    if (open && selType) loadEntities(selType);
  }, [open, selType, loadEntities]);

  /* selection toggle */
  const toggleSel = (id) => {
    setSelIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 20) next.add(id);
      return next;
    });
  };

  /* run bulk */
  const handleRun = async () => {
    const selected = entities.filter(e => selIds.has(e.id || e.name));
    if (selected.length === 0 || !selModel) return;
    abortRef.current = false;
    setRunning(true); setResults([]); setProgress({ done: 0, total: selected.length }); setErr("");
    const base = apiBase();
    for (let i = 0; i < selected.length; i++) {
      if (abortRef.current) break;
      const entity = selected[i];
      try {
        const res = await postJSON(`${base}/functions/predict`, {
          entity_id:   entity.id || entity.name,
          entity_type: selType,
          model_id:    selModel,
          label:       entity.name || entity.title || entity.label || entity.id,
        });
        setResults(prev => [...prev, {
          id:         entity.id || entity.name,
          label:      entity.name || entity.title || entity.label || String(entity.id),
          outcome:    res.predicted_outcome || res.outcome || res.prediction || "—",
          confidence: typeof res.confidence === "number" ? res.confidence
            : typeof res.confidence_score === "number" ? res.confidence_score : null,
          raw:        res,
        }]);
      } catch (e) {
        setResults(prev => [...prev, {
          id:    entity.id || entity.name,
          label: entity.name || entity.title || entity.label || String(entity.id),
          outcome: `Error: ${e.message}`,
          confidence: null,
          raw:   {},
        }]);
      }
      setProgress({ done: i + 1, total: selected.length });
      if (i < selected.length - 1) await sleep(500);
    }
    setRunning(false);
  };

  /* export CSV */
  const handleExportCSV = () => {
    if (results.length === 0) return;
    const rows = [["Entity", "Predicted Outcome", "Confidence %"]];
    for (const r of results) {
      rows.push([
        `"${r.label}"`,
        `"${r.outcome}"`,
        r.confidence !== null ? Math.round(r.confidence * 100) : "",
      ]);
    }
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "bulk_predict_results.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  /* ASSESS */
  const handleAssess = async () => {
    if (results.length === 0) return;
    setAssessing(true);
    try {
      const base = apiBase();
      const sorted = [...results].filter(r => r.confidence !== null)
        .sort((a, b) => b.confidence - a.confidence);
      const highest = sorted.slice(0, 3).map(r => `${r.label} (${Math.round(r.confidence * 100)}%, outcome: ${r.outcome})`).join("; ");
      const lowest  = sorted.slice(-3).reverse().map(r => `${r.label} (${Math.round(r.confidence * 100)}%)`).join("; ");
      const prompt = `Bulk prediction run on ${results.length} entities using model ${selModel}. Highest confidence: ${highest}. Lowest confidence: ${lowest}. Provide assessment of prediction quality, notable outliers, and recommended next actions.`;
      const res = await postJSON(`${base}/v1/jarvis/agent/chat`, { message: prompt });
      const text = res.response || res.message || res.content || JSON.stringify(res);
      await speakTTS(text);
    } catch (e) { setErr(`ASSESS: ${e.message}`); }
    finally { setAssessing(false); }
  };

  /* sorted results */
  const sortedResults = [...results].sort((a, b) => {
    const ca = a.confidence ?? -1;
    const cb = b.confidence ?? -1;
    return sortDir === "desc" ? cb - ca : ca - cb;
  });

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      style={{ position: "fixed", left: BTN_LEFT, top: 60, zIndex: 408,
        background: "transparent", border: `1px solid ${CY}66`,
        color: CY, fontSize: 10, letterSpacing: 2, padding: "4px 10px",
        cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
        borderRadius: 4, whiteSpace: "nowrap" }}>
      ◈ BLKPRED
    </button>
  );

  return (
    <div style={{ position: "fixed", left: BTN_LEFT - PANEL_W / 2, top: 60, zIndex: 408,
      width: PANEL_W, maxHeight: PANEL_H, background: SURF,
      border: `1px solid ${BORD}`, borderRadius: 10, overflow: "hidden",
      display: "flex", flexDirection: "column",
      fontFamily: "'JetBrains Mono',monospace",
      boxShadow: `0 0 60px rgba(41,231,255,0.10)` }}>

      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
        borderBottom: `1px solid ${BORD}`, flexShrink: 0 }}>
        <span style={{ color: CY, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>◈ BULK PREDICT RUNNER</span>
        <span style={{ color: DIM, fontSize: 10, marginLeft: "auto" }}>F312</span>
        <button onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* body */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>

        {/* left: config */}
        <div style={{ width: 320, borderRight: `1px solid ${BORD}`, padding: "12px 14px",
          overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, flexShrink: 0 }}>

          {/* entity type selector */}
          <div>
            <div style={{ color: DIM, fontSize: 10, letterSpacing: 2, marginBottom: 4 }}>ENTITY TYPE</div>
            {loadingTypes ? (
              <div style={{ color: DIM, fontSize: 11 }}>loading…</div>
            ) : (
              <select value={selType} onChange={e => setSelType(e.target.value)}
                style={{ width: "100%", background: "rgba(0,0,0,0.5)", border: `1px solid ${BORD}`,
                  color: CY, padding: "5px 8px", fontSize: 11, borderRadius: 4, cursor: "pointer" }}>
                {types.map((t, i) => {
                  const val = t?.id || t?.name || String(t);
                  return <option key={i} value={val}>{t?.name || t?.label || val}</option>;
                })}
              </select>
            )}
          </div>

          {/* entity multi-select */}
          <div style={{ flex: 1 }}>
            <div style={{ color: DIM, fontSize: 10, letterSpacing: 2, marginBottom: 4 }}>
              ENTITIES ({selIds.size}/20)
            </div>
            {loadingEnts ? (
              <div style={{ color: DIM, fontSize: 11 }}>loading entities…</div>
            ) : entities.length === 0 ? (
              <div style={{ color: DIM, fontSize: 11 }}>none found</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 280, overflowY: "auto" }}>
                {entities.map((e, i) => {
                  const id = e.id || e.name || String(i);
                  const label = e.name || e.title || e.label || id;
                  const checked = selIds.has(id);
                  return (
                    <label key={id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                      padding: "3px 6px", borderRadius: 4,
                      background: checked ? `rgba(41,231,255,0.08)` : "transparent",
                      border: `1px solid ${checked ? CY + "44" : "transparent"}` }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleSel(id)}
                        style={{ accentColor: CY, cursor: "pointer" }} />
                      <span style={{ color: checked ? CY : "#8AA5BB", fontSize: 11, overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* model selector */}
          <div>
            <div style={{ color: DIM, fontSize: 10, letterSpacing: 2, marginBottom: 4 }}>PREDICT MODEL</div>
            {loadingModels ? (
              <div style={{ color: DIM, fontSize: 11 }}>loading…</div>
            ) : (
              <select value={selModel} onChange={e => setSelModel(e.target.value)}
                style={{ width: "100%", background: "rgba(0,0,0,0.5)", border: `1px solid ${BORD}`,
                  color: CY, padding: "5px 8px", fontSize: 11, borderRadius: 4, cursor: "pointer" }}>
                {models.map((m, i) => {
                  const val = m?.id || m?.name || String(m);
                  return <option key={i} value={val}>{m?.name || m?.label || val}</option>;
                })}
              </select>
            )}
          </div>

          {/* run button */}
          <button onClick={handleRun}
            disabled={running || selIds.size === 0 || !selModel}
            style={{ padding: "8px 0", background: running ? "rgba(41,231,255,0.05)" : `rgba(41,231,255,0.12)`,
              border: `1px solid ${running ? DIM : CY}`, color: running ? DIM : CY,
              fontSize: 11, letterSpacing: 2, borderRadius: 5, cursor: running ? "not-allowed" : "pointer" }}>
            {running ? `RUNNING… ${progress.done}/${progress.total}` : "▶ RUN BULK"}
          </button>

          {/* progress bar */}
          {(running || progress.total > 0) && (
            <div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  width: `${progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%`,
                  height: "100%", background: CY, borderRadius: 2,
                  transition: "width 0.3s ease", boxShadow: `0 0 8px ${CY}88` }} />
              </div>
              <div style={{ color: DIM, fontSize: 10, marginTop: 3, textAlign: "right" }}>
                {progress.done}/{progress.total} entities
              </div>
            </div>
          )}

          {err && <div style={{ color: RD, fontSize: 10 }}>{err}</div>}
        </div>

        {/* right: results */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* results header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px",
            borderBottom: `1px solid ${BORD}`, flexShrink: 0 }}>
            <span style={{ color: DIM, fontSize: 10, letterSpacing: 2 }}>RESULTS ({results.length})</span>
            <button onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")}
              style={{ background: "none", border: `1px solid ${BORD}`, color: DIM, fontSize: 10,
                padding: "2px 8px", borderRadius: 3, cursor: "pointer", letterSpacing: 1 }}>
              {sortDir === "desc" ? "↓ HIGH→LOW" : "↑ LOW→HIGH"}
            </button>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button onClick={handleExportCSV} disabled={results.length === 0}
                style={{ background: "none", border: `1px solid ${results.length ? GN + "88" : BORD}`,
                  color: results.length ? GN : DIM, fontSize: 10, padding: "3px 10px",
                  borderRadius: 3, cursor: results.length ? "pointer" : "not-allowed", letterSpacing: 1 }}>
                ↓ CSV
              </button>
              <button onClick={handleAssess} disabled={assessing || results.length === 0}
                style={{ background: "none", border: `1px solid ${!assessing && results.length ? VI + "88" : BORD}`,
                  color: !assessing && results.length ? VI : DIM, fontSize: 10, padding: "3px 10px",
                  borderRadius: 3, cursor: !assessing && results.length ? "pointer" : "not-allowed", letterSpacing: 1 }}>
                {assessing ? "…" : "ASSESS"}
              </button>
            </div>
          </div>

          {/* results table */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            {sortedResults.length === 0 ? (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", marginTop: 40 }}>
                {running ? "Running predictions…" : "No results yet. Select entities and run."}
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BORD}` }}>
                    {["ENTITY", "PREDICTED OUTCOME", "CONFIDENCE"].map(h => (
                      <th key={h} style={{ padding: "4px 14px", color: DIM, fontSize: 10,
                        letterSpacing: 1, textAlign: "left", fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedResults.map((r, i) => (
                    <tr key={r.id} style={{ borderBottom: `1px solid rgba(41,231,255,0.06)`,
                      background: i % 2 === 0 ? "rgba(41,231,255,0.02)" : "transparent" }}>
                      <td style={{ padding: "5px 14px", color: CY, maxWidth: 200,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.label}
                      </td>
                      <td style={{ padding: "5px 14px", color: "#DCEBF5", maxWidth: 220,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.outcome}
                      </td>
                      <td style={{ padding: "5px 14px", minWidth: 140 }}>
                        {r.confidence !== null
                          ? <ConfidenceBar value={r.confidence} />
                          : <span style={{ color: DIM, fontSize: 10 }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <audio ref={audioRef} style={{ display: "none" }} />
      <style>{`@keyframes bppulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
}
