/**
 * SwarmDatasetTracker — F85.
 *
 * Cross-references /entities/SwarmJob automation inventory against /v1/datasets
 * to classify each dataset as AUTOMATED (≥1 active swarm feeding it) or MANUAL
 * (no running/queued swarm matched by keyword).  Surfaces data-pipeline gaps
 * so the operator knows which datasets depend on manual ingestion.
 *
 * Correlation: each swarm job's name/description/target keyword-matched against
 * dataset name/description/tags — same normalisation used across F63/F73/F77.
 *
 * Stat tiles: swarm jobs · datasets · automated · manual.
 * Filter tabs: ALL / AUTOMATED / MANUAL.
 * Click ▶ ASSESS → /v1/jarvis/agent/chat AI 2-sentence pipeline assessment + TTS.
 * 60 s auto-refresh.
 *
 * Intent: "swarm dataset" / "dataset ingestion" / "data automation" /
 *         "pipeline coverage" / "ingestion tracker" / "sdtrk" /
 *         "which datasets.*automated" / "swarm.*pipeline"
 *   → jarvis:sdtrk-toggle + TTS brief via buildSwarmDatasetScript()
 *
 * Toggle: ⬡ SDTRK at left:7564, zIndex 65.  Badge: amber count of MANUAL datasets.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const MUTED = "#445566";

const BTN_LEFT   = 7564;
const REFRESH_MS = 60_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function tokens(str) {
  return String(str || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter((t) => t.length > 2);
}

function overlap(a, b) {
  const ta = new Set(tokens(a));
  return tokens(b).some((t) => ta.has(t));
}

function isActiveSwarm(job) {
  const s = String(job.status || job.state || "").toLowerCase();
  return s === "running" || s === "queued" || s === "active" || s === "pending" || s === "in_progress";
}

function swarmKeywords(job) {
  return [
    job.name, job.description, job.target, job.dataset,
    job.source, job.type, job.category,
  ].filter(Boolean).join(" ");
}

function datasetKeywords(ds) {
  return [
    ds.name, ds.description, ds.title, ds.source,
    ds.category, ds.tags, ds.type,
    ...(Array.isArray(ds.tags) ? ds.tags : []),
  ].filter(Boolean).join(" ");
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const SDTRK_RE =
  /swarm.{0,15}dataset|dataset.{0,15}ingestion|data.{0,10}automation|pipeline.{0,10}coverage|ingestion.{0,10}tracker|\bsdtrk\b|which.{0,20}automat|swarm.{0,15}pipeline|dataset.{0,15}swarm/i;

export function isSwarmDatasetQuery(q) {
  return SDTRK_RE.test(q || "");
}

export async function buildSwarmDatasetScript() {
  try {
    const [rawJobs, rawDatasets] = await Promise.all([
      fetch(`${apiBase()}/entities/SwarmJob`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
      fetch(`${apiBase()}/v1/datasets`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);

    const jobs     = normaliseArray(rawJobs).filter(isActiveSwarm);
    const datasets = normaliseArray(rawDatasets);
    const manual   = datasets.filter((ds) => !jobs.some((j) => overlap(swarmKeywords(j), datasetKeywords(ds))));

    window.dispatchEvent(new CustomEvent("jarvis:sdtrk-toggle"));
    return `Swarm-Dataset Ingestion Tracker online, sir. ${datasets.length} datasets cross-referenced against ${jobs.length} active swarm jobs; ${datasets.length - manual.length} are automated and ${manual.length} depend on manual ingestion. ${manual.length > 0 ? `I recommend prioritising swarm coverage for the ${manual.length} uncovered dataset${manual.length === 1 ? "" : "s"} — review the panel for details.` : "Full pipeline automation coverage achieved."}`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:sdtrk-toggle"));
    return "Swarm-Dataset Ingestion Tracker is online, sir. Analysing automation coverage across your data pipeline now.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function SwarmDatasetTracker() {
  const [visible,    setVisible]    = useState(false);
  const [datasets,   setDatasets]   = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [tab,        setTab]        = useState("ALL");
  const [assessing,  setAssessing]  = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    const [rawJobs, rawDs] = await Promise.all([
      fetch(`${apiBase()}/entities/SwarmJob`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()).catch(() => []),
      fetch(`${apiBase()}/v1/datasets`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()).catch(() => []),
    ]);

    const jobs = normaliseArray(rawJobs).filter(isActiveSwarm);
    const result = normaliseArray(rawDs).map((ds) => {
      const matched = jobs.filter((j) => overlap(swarmKeywords(j), datasetKeywords(ds)));
      return {
        id:        String(ds.id || ds.name || Math.random()),
        name:      ds.name || ds.title || ds.id || "Unnamed Dataset",
        rows:      ds.row_count ?? ds.rows ?? ds.count ?? null,
        automated: matched.length > 0,
        swarms:    matched.map((j) => j.name || j.id || "swarm"),
        raw:       ds,
      };
    });

    result.sort((a, b) => (a.automated === b.automated ? 0 : a.automated ? 1 : -1));
    setDatasets(result);
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:sdtrk-toggle", onToggle);
    return () => window.removeEventListener("jarvis:sdtrk-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assess(ds) {
    setAssessing(ds.id);
    const prompt = `As JARVIS, provide a 2-sentence data-pipeline assessment for the dataset "${ds.name}". It is currently ${ds.automated ? `automated by ${ds.swarms.join(", ")}` : "manually ingested with no active swarm job"}${ds.rows != null ? ` and contains ${ds.rows.toLocaleString()} rows` : ""}. Comment on the pipeline risk and any recommended automation action.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        `Pipeline assessment for "${ds.name}" is unavailable at this time, sir.`;
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch {
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", {
          detail: { text: `Pipeline assessment for "${ds.name}" is temporarily unavailable, sir.` },
        })
      );
    }
    setAssessing(null);
  }

  const manual    = datasets.filter((d) => !d.automated).length;
  const automated = datasets.filter((d) =>  d.automated).length;

  const filtered =
    tab === "AUTOMATED" ? datasets.filter((d) =>  d.automated)
    : tab === "MANUAL"  ? datasets.filter((d) => !d.automated)
    : datasets;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Swarm-Dataset Ingestion Tracker (F85)"
        style={{
          position: "fixed", bottom: 6, left: BTN_LEFT, zIndex: 65,
          background: visible ? `${AMBER}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? AMBER : AMBER}44`,
          color: visible ? AMBER : `${AMBER}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ⬡ SDTRK
        {manual > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#000",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{manual}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 32, left: BTN_LEFT - 340, zIndex: 65,
          width: 620, maxHeight: "74vh", overflowY: "auto",
          background: "rgba(6,11,18,0.93)",
          border: `1px solid ${AMBER}44`,
          borderRadius: 10, padding: "14px 16px",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${AMBER}18`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: AMBER, fontSize: 11, letterSpacing: 2 }}>⬡ SWARM-DATASET INGESTION TRACKER</span>
            <button
              onClick={() => { setLoading(true); fetchData().finally(() => setLoading(false)); }}
              style={{
                marginLeft: "auto", background: "transparent",
                border: `1px solid ${AMBER}33`, borderRadius: 3,
                color: `${AMBER}88`, padding: "2px 6px", fontSize: 7,
                cursor: "pointer", letterSpacing: 1,
              }}
            >↻ REFRESH</button>
            <button
              onClick={() => setVisible(false)}
              style={{ background: "transparent", border: "none", color: MUTED, cursor: "pointer", fontSize: 14, lineHeight: 1 }}
            >✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              ["DATASETS",   loading ? "…" : datasets.length, CY],
              ["AUTOMATED",  loading ? "…" : automated,       GREEN],
              ["MANUAL",     loading ? "…" : manual,          AMBER],
              ["COVERAGE",   loading ? "…" : (datasets.length ? `${Math.round(automated / datasets.length * 100)}%` : "—"), CY],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 5, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 15, fontWeight: "bold" }}>{val}</div>
                <div style={{ color: MUTED, fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            {[["ALL", CY], ["AUTOMATED", GREEN], ["MANUAL", AMBER]].map(([t, col]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${col}22` : "transparent",
                  border: `1px solid ${tab === t ? col : "#1e3040"}`,
                  color: tab === t ? col : MUTED,
                  borderRadius: 4, padding: "3px 10px",
                  fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                  letterSpacing: 1, cursor: "pointer",
                }}
              >{t}</button>
            ))}
          </div>

          {/* Dataset rows */}
          {loading && datasets.length === 0 ? (
            <div style={{ color: MUTED, fontSize: 10, textAlign: "center", padding: "24px 0" }}>
              correlating swarm jobs with dataset catalog…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ color: MUTED, fontSize: 10, textAlign: "center", padding: "24px 0" }}>
              No datasets match this filter.
            </div>
          ) : (
            filtered.map((ds) => {
              const col = ds.automated ? GREEN : AMBER;
              return (
                <div key={ds.id} style={{
                  background: ds.automated ? `${GREEN}06` : `${AMBER}06`,
                  border: `1px solid ${col}22`,
                  borderLeft: `3px solid ${col}`,
                  borderRadius: 6, padding: "9px 12px", marginBottom: 7,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ color: "#DCEBF5", fontSize: 11, fontWeight: "bold", flex: 1,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ds.name}</span>
                    <span style={{
                      fontSize: 7, color: col, border: `1px solid ${col}55`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1, flexShrink: 0,
                    }}>{ds.automated ? "AUTOMATED" : "MANUAL"}</span>
                    <button
                      onClick={() => assess(ds)}
                      disabled={assessing === ds.id}
                      style={{
                        background: assessing === ds.id ? "#1a2530" : `${col}18`,
                        color: assessing === ds.id ? MUTED : col,
                        border: `1px solid ${col}44`,
                        borderRadius: 3, padding: "2px 8px",
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                        letterSpacing: 1, cursor: assessing === ds.id ? "default" : "pointer", flexShrink: 0,
                      }}
                    >{assessing === ds.id ? "…" : "▶ ASSESS"}</button>
                  </div>

                  <div style={{ display: "flex", gap: 14, fontSize: 8, color: MUTED }}>
                    {ds.rows != null && (
                      <span>rows <span style={{ color: CY }}>{Number(ds.rows).toLocaleString()}</span></span>
                    )}
                    {ds.automated
                      ? <span>swarm <span style={{ color: GREEN }}>{ds.swarms.join(", ")}</span></span>
                      : <span style={{ color: AMBER }}>no active swarm job matched</span>
                    }
                  </div>
                </div>
              );
            })
          )}

          <div style={{ marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right" }}>
            /entities/SwarmJob × /v1/datasets · keyword correlation · 60 s auto-refresh
          </div>
        </div>
      )}
    </>
  );
}
