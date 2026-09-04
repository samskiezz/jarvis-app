/**
 * SwarmDatasetNexus — F524
 * "JARVIS, swarm dataset / dataset swarm / swrdset / which swarm jobs have data / swarm data coverage"
 * Cross-references /entities/SwarmJob + /v1/datasets.
 * Finds GROUNDED swarm jobs (≥1 dataset keyword-matches the job's name/description/tags) vs UNGROUNDED.
 * Coverage % tile; ALL/GROUNDED/UNGROUNDED filter tabs + search; click-to-expand matched datasets.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 38_440;
const Z_INDEX  = 103;

const SWRDSET_RE =
  /\bswrdset\b|\bswarm.?dataset\b|\bdataset.?swarm\b|\bwhich.?swarm.?jobs?.?have.?data\b|\bswarm.?data.?coverage\b|\bgrounded.?swarm\b|\bungrounded.?swarm\b/i;

export function isSwrdsetQuery(text) {
  return SWRDSET_RE.test(text || "");
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function keywords(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function overlap(a, b) {
  const sa = new Set(keywords(a));
  return keywords(b).filter((w) => sa.has(w)).length;
}

function normaliseJobs(data) {
  if (!data) return [];
  const raw =
    data.jobs || data.swarm_jobs || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((j, i) => ({
    id:          j.id || `job-${i}`,
    name:        j.name || j.title || j.job_name || `Job ${i + 1}`,
    status:      (j.status || j.state || "UNKNOWN").toUpperCase(),
    description: j.description || j.summary || "",
    tags:        Array.isArray(j.tags) ? j.tags.join(" ") : String(j.tags || ""),
  }));
}

function normaliseDatasets(data) {
  if (!data) return [];
  const raw =
    data.datasets || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((d, i) => ({
    id:       d.id || `ds-${i}`,
    name:     d.name || d.title || d.dataset_name || `Dataset ${i + 1}`,
    kind:     d.kind || d.type || d.category || "DATA",
    rows:     d.row_count || d.rows || d.count || null,
    tags:     Array.isArray(d.tags) ? d.tags.join(" ") : String(d.tags || ""),
    summary:  d.summary || d.description || "",
  }));
}

function crossRef(jobs, datasets) {
  return jobs.map((j) => {
    const haystack = `${j.name} ${j.description} ${j.tags}`;
    const matches = datasets
      .map((d) => ({
        d,
        hits: overlap(haystack, `${d.name} ${d.summary} ${d.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...j,
      grounded: matches.length > 0,
      matches:  matches.map(({ d, hits }) => ({ ...d, hits })),
    };
  });
}

// ─── buildSwrdsetScript (for JarvisBrain) ────────────────────────────────────

export async function buildSwrdsetScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [jRes, dRes] = await Promise.all([
      fetch(`${base}/entities/SwarmJob`, { headers: hdr }),
      fetch(`${base}/v1/datasets`,       { headers: hdr }),
    ]);
    const jData = jRes.ok ? await jRes.json() : {};
    const dData = dRes.ok ? await dRes.json() : {};

    const jobs     = normaliseJobs(jData);
    const datasets = normaliseDatasets(dData);
    const crossed  = crossRef(jobs, datasets);

    const total      = crossed.length;
    const grounded   = crossed.filter((j) => j.grounded).length;
    const ungrounded = total - grounded;
    const coverage   = total > 0 ? Math.round((grounded / total) * 100) : 0;
    const topGround  = crossed
      .filter((j) => j.grounded)
      .slice(0, 2)
      .map((j) => j.name)
      .join(", ");

    const brief =
      `${coverage}% of ${total} swarm jobs are grounded in dataset coverage. ` +
      `${grounded} GROUNDED, ${ungrounded} UNGROUNDED.` +
      (topGround ? ` Top data-backed jobs: ${topGround}.` : "");

    const agentRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Swarm × Dataset Nexus: ${brief} Provide a 2-sentence operational data-readiness assessment.`,
      }),
    });
    const agentData = agentRes.ok ? await agentRes.json() : {};
    const agentText = agentData.response || agentData.message || agentData.reply || "";

    return agentText ? `${brief}\n\n${agentText}` : brief;
  } catch (err) {
    return `Swarm × Dataset Nexus unavailable: ${err.message}`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────

const STATUS_COLOR = {
  RUNNING:   "#29E7FF",
  COMPLETED: "#00E5A0",
  PENDING:   "#FFA500",
  FAILED:    "#FF4466",
  UNKNOWN:   "#8899AA",
};

export default function SwarmDatasetNexus() {
  const [open, setOpen]       = useState(false);
  const [jobs, setJobs]       = useState([]);
  const [datasets, setDs]     = useState([]);
  const [crossed, setCrossed] = useState([]);
  const [tab, setTab]         = useState("ALL");
  const [query, setQuery]     = useState("");
  const [expanded, setExp]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssess]= useState(false);
  const [brief, setBrief]     = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [jRes, dRes] = await Promise.all([
        fetch(`${base}/entities/SwarmJob`, { headers: hdr }),
        fetch(`${base}/v1/datasets`,       { headers: hdr }),
      ]);
      const jData = jRes.ok ? await jRes.json() : {};
      const dData = dRes.ok ? await dRes.json() : {};
      const j = normaliseJobs(jData);
      const d = normaliseDatasets(dData);
      setJobs(j);
      setDs(d);
      setCrossed(crossRef(j, d));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () =>
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    window.addEventListener("jarvis:swrdset-toggle", onToggle);
    return () => window.removeEventListener("jarvis:swrdset-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssess(true);
    setBrief("");
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const total      = crossed.length;
      const grounded   = crossed.filter((j) => j.grounded).length;
      const ungrounded = total - grounded;
      const coverage   = total > 0 ? Math.round((grounded / total) * 100) : 0;
      const prompt = `Swarm × Dataset Nexus: ${coverage}% coverage (${grounded}/${total} grounded, ${ungrounded} ungrounded). Assess data readiness in 2 sentences.`;
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      const d    = res.ok ? await res.json() : {};
      const text = d.response || d.message || d.reply || "Assessment complete.";
      setBrief(text);
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "onyx" }),
      });
    } catch (e) {
      setBrief(`Assessment error: ${e.message}`);
    } finally {
      setAssess(false);
    }
  }, [crossed]);

  const visible = crossed.filter((j) => {
    if (tab === "GROUNDED"   && !j.grounded) return false;
    if (tab === "UNGROUNDED" &&  j.grounded) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!j.name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const total       = crossed.length;
  const nGrounded   = crossed.filter((j) => j.grounded).length;
  const nUngrounded = total - nGrounded;
  const coverage    = total > 0 ? Math.round((nGrounded / total) * 100) : 0;

  const btnStyle = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 8,
    zIndex: Z_INDEX,
    background: "rgba(0,0,0,0.85)",
    border: `1px solid ${CY}`,
    color: CY,
    fontFamily: "monospace",
    fontSize: 10,
    padding: "2px 7px",
    cursor: "pointer",
    borderRadius: 3,
    userSelect: "none",
    display: "flex",
    alignItems: "center",
    gap: 4,
  };

  const panelStyle = {
    position: "fixed",
    right: 18,
    bottom: 54,
    width: 460,
    maxHeight: "78vh",
    overflowY: "auto",
    background: "rgba(0,6,18,0.97)",
    border: `1px solid ${CY}44`,
    borderRadius: 8,
    padding: 16,
    zIndex: 9999,
    fontFamily: "monospace",
    color: CY,
    boxSizing: "border-box",
  };

  return (
    <>
      <button
        style={btnStyle}
        onClick={() => setOpen((v) => { if (!v) load(); return !v; })}
        title="SwarmJob × Dataset Nexus"
      >
        ◈ SWRDSET
        {nUngrounded > 0 && (
          <span
            style={{
              background: AMB,
              color: "#000",
              borderRadius: 8,
              padding: "0 4px",
              fontSize: 9,
            }}
          >
            {nUngrounded}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: "bold", letterSpacing: 1 }}>
              SWARM × DATASET NEXUS
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={load}
                style={{
                  background: "none",
                  border: `1px solid ${CY}55`,
                  color: CY,
                  cursor: "pointer",
                  padding: "2px 8px",
                  borderRadius: 3,
                  fontSize: 10,
                }}
                title="Refresh"
              >
                ↺
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: DIM,
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {[
              {
                label: "COVERAGE",
                value: `${coverage}%`,
                color: coverage > 60 ? GRN : coverage > 30 ? AMB : "#FF4466",
              },
              { label: "GROUNDED",   value: nGrounded,   color: GRN },
              { label: "UNGROUNDED", value: nUngrounded, color: AMB },
              { label: "DATASETS",   value: datasets.length, color: CY },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  flex: 1,
                  background: "rgba(41,231,255,0.05)",
                  border: `1px solid ${color}33`,
                  borderRadius: 4,
                  padding: "6px 8px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 16, fontWeight: "bold", color }}>{value}</div>
                <div style={{ fontSize: 8, color: DIM, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Assess */}
          <div style={{ marginBottom: 10 }}>
            <button
              onClick={assess}
              disabled={assessing || crossed.length === 0}
              style={{
                background: assessing
                  ? "rgba(41,231,255,0.1)"
                  : "rgba(41,231,255,0.15)",
                border: `1px solid ${CY}88`,
                color: CY,
                cursor: assessing ? "wait" : "pointer",
                padding: "4px 14px",
                borderRadius: 3,
                fontSize: 10,
                fontFamily: "monospace",
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 10,
                  color: "#cde",
                  lineHeight: 1.5,
                  padding: "6px 8px",
                  background: "rgba(41,231,255,0.05)",
                  borderRadius: 3,
                }}
              >
                {brief}
              </div>
            )}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {["ALL", "GROUNDED", "UNGROUNDED"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "none",
                  border: `1px solid ${tab === t ? CY : CY + "33"}`,
                  color: tab === t ? CY : DIM,
                  cursor: "pointer",
                  padding: "2px 10px",
                  borderRadius: 3,
                  fontSize: 10,
                  fontFamily: "monospace",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search swarm jobs…"
            style={{
              width: "100%",
              background: "rgba(41,231,255,0.06)",
              border: `1px solid ${CY}33`,
              color: CY,
              padding: "4px 8px",
              borderRadius: 3,
              fontSize: 10,
              marginBottom: 8,
              boxSizing: "border-box",
              fontFamily: "monospace",
            }}
          />

          {/* Job rows */}
          {loading ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
              Loading…
            </div>
          ) : visible.length === 0 ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
              No jobs match.
            </div>
          ) : (
            visible.map((j) => (
              <div key={j.id}>
                <div
                  onClick={() => setExp(expanded === j.id ? null : j.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 6px",
                    marginBottom: 3,
                    cursor: "pointer",
                    borderRadius: 3,
                    background: "rgba(41,231,255,0.04)",
                    border: `1px solid ${j.grounded ? GRN + "44" : DIM + "22"}`,
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      color: j.grounded ? GRN : DIM,
                      minWidth: 72,
                    }}
                  >
                    {j.grounded ? "GROUNDED" : "UNGROUNDED"}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      fontSize: 10,
                      color: j.grounded ? GRN : DIM,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {j.name}
                  </span>
                  <span
                    style={{
                      fontSize: 8,
                      color: STATUS_COLOR[j.status] || DIM,
                    }}
                  >
                    {j.status}
                  </span>
                  {j.grounded && (
                    <span style={{ fontSize: 8, color: GRN }}>
                      ⬡ {j.matches.length} ds
                    </span>
                  )}
                </div>

                {/* Expanded matched datasets */}
                {expanded === j.id && j.grounded && (
                  <div style={{ marginLeft: 12, marginBottom: 6 }}>
                    {j.matches.map((d) => (
                      <div
                        key={d.id}
                        style={{
                          padding: "3px 6px",
                          marginBottom: 2,
                          borderRadius: 2,
                          background: "rgba(0,229,160,0.05)",
                          border: `1px solid ${CY}22`,
                          fontSize: 9,
                        }}
                      >
                        <span style={{ color: AMB, marginRight: 4 }}>
                          [{d.kind.toUpperCase()}]
                        </span>
                        <span style={{ color: GRN }}>{d.name}</span>
                        {d.rows != null && (
                          <span style={{ color: DIM, marginLeft: 6 }}>
                            {d.rows.toLocaleString()} rows
                          </span>
                        )}
                        <span style={{ color: DIM, marginLeft: 6 }}>
                          hits:{d.hits}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {expanded === j.id && !j.grounded && (
                  <div
                    style={{
                      marginLeft: 12,
                      marginBottom: 6,
                      fontSize: 9,
                      color: DIM,
                    }}
                  >
                    No datasets reference this swarm job.
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}
