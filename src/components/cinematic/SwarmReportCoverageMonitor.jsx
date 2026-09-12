/**
 * SwarmReportCoverageMonitor — F546
 * "JARVIS, swarm report / swarm documentation / swrrpt / documented swarm / which swarm jobs have reports"
 * Cross-references /entities/SwarmJob + /v1/reports.
 * Finds DOCUMENTED swarm jobs (≥1 report keyword-matches the job's name/description/tags) vs UNDOCUMENTED.
 * Coverage % tile; ALL/DOCUMENTED/UNDOCUMENTED filter tabs + search; click-to-expand matched reports.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence operational-documentation brief + TTS.
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
const BTN_LEFT = 48_760;
const Z_INDEX  = 115;

const SWRRPT_RE =
  /\bswrrpt\b|\bswarm.?report\b|\bswarm.?documentation\b|\bdocumented.?swarm\b|\bundocumented.?swarm\b|\bwhich.?swarm.?jobs?.?have.?reports?\b|\bswarm.?report.?coverage\b|\bswarm.?coverage\b/i;

export function isSwrrptQuery(text) {
  return SWRRPT_RE.test(text || "");
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

function normaliseReports(data) {
  if (!data) return [];
  const raw =
    data.reports || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((r, i) => ({
    id:      r.id || `rpt-${i}`,
    title:   r.title || r.name || `Report ${i + 1}`,
    type:    r.type || r.kind || r.category || "REPORT",
    author:  r.author || r.created_by || r.author_name || "",
    summary: r.summary || r.description || r.abstract || "",
    tags:    Array.isArray(r.tags) ? r.tags.join(" ") : String(r.tags || ""),
  }));
}

function crossRef(jobs, reports) {
  return jobs.map((j) => {
    const haystack = `${j.name} ${j.description} ${j.tags}`;
    const matches = reports
      .map((r) => ({
        r,
        hits: overlap(haystack, `${r.title} ${r.summary} ${r.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...j,
      documented: matches.length > 0,
      matches:    matches.map(({ r, hits }) => ({ ...r, hits })),
    };
  });
}

// ─── buildSwrrptScript (for JarvisBrain) ─────────────────────────────────────

export async function buildSwrrptScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [jRes, rRes] = await Promise.all([
      fetch(`${base}/entities/SwarmJob`, { headers: hdr }),
      fetch(`${base}/v1/reports`,        { headers: hdr }),
    ]);
    const jData = jRes.ok ? await jRes.json() : {};
    const rData = rRes.ok ? await rRes.json() : {};

    const jobs    = normaliseJobs(jData);
    const reports = normaliseReports(rData);
    const crossed = crossRef(jobs, reports);

    const total        = crossed.length;
    const documented   = crossed.filter((j) => j.documented).length;
    const undocumented = total - documented;
    const coverage     = total > 0 ? Math.round((documented / total) * 100) : 0;
    const topDocs      = crossed
      .filter((j) => j.documented)
      .slice(0, 2)
      .map((j) => j.name)
      .join(", ");

    const brief =
      `${coverage}% of ${total} swarm jobs have formal report coverage. ` +
      `${documented} DOCUMENTED, ${undocumented} UNDOCUMENTED.` +
      (topDocs ? ` Best-documented jobs: ${topDocs}.` : "");

    const agentRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Swarm × Report Coverage: ${brief} Provide a 2-sentence operational-documentation assessment.`,
      }),
    });
    const agentData = agentRes.ok ? await agentRes.json() : {};
    const agentText = agentData.response || agentData.message || agentData.reply || "";

    return agentText ? `${brief}\n\n${agentText}` : brief;
  } catch (err) {
    return `Swarm × Report Coverage unavailable: ${err.message}`;
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

const TYPE_COLOR = {
  THREAT:    "#FF4466",
  INTEL:     "#29E7FF",
  OPS:       "#FFA500",
  KNOWLEDGE: "#00E5A0",
};

export default function SwarmReportCoverageMonitor() {
  const [open, setOpen]       = useState(false);
  const [jobs, setJobs]       = useState([]);
  const [reports, setReports] = useState([]);
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
      const [jRes, rRes] = await Promise.all([
        fetch(`${base}/entities/SwarmJob`, { headers: hdr }),
        fetch(`${base}/v1/reports`,        { headers: hdr }),
      ]);
      const jData = jRes.ok ? await jRes.json() : {};
      const rData = rRes.ok ? await rRes.json() : {};
      const j = normaliseJobs(jData);
      const r = normaliseReports(rData);
      setJobs(j);
      setReports(r);
      setCrossed(crossRef(j, r));
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
    window.addEventListener("jarvis:swrrpt-toggle", onToggle);
    return () => window.removeEventListener("jarvis:swrrpt-toggle", onToggle);
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
      const total        = crossed.length;
      const documented   = crossed.filter((j) => j.documented).length;
      const undocumented = total - documented;
      const coverage     = total > 0 ? Math.round((documented / total) * 100) : 0;
      const prompt = `Swarm × Report Coverage: ${coverage}% coverage (${documented}/${total} documented, ${undocumented} undocumented). Assess operational documentation readiness in 2 sentences.`;
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
    if (tab === "DOCUMENTED"   && !j.documented) return false;
    if (tab === "UNDOCUMENTED" &&  j.documented) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!j.name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const total          = crossed.length;
  const nDocumented    = crossed.filter((j) => j.documented).length;
  const nUndocumented  = total - nDocumented;
  const coverage       = total > 0 ? Math.round((nDocumented / total) * 100) : 0;

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
        title="SwarmJob × Report Coverage Monitor"
      >
        ◈ SWRRPT
        {nUndocumented > 0 && (
          <span
            style={{
              background: AMB,
              color: "#000",
              borderRadius: 8,
              padding: "0 4px",
              fontSize: 9,
            }}
          >
            {nUndocumented}
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
              SWARM × REPORT COVERAGE
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
              { label: "DOCUMENTED",   value: nDocumented,   color: GRN },
              { label: "UNDOCUMENTED", value: nUndocumented, color: AMB },
              { label: "REPORTS",      value: reports.length, color: CY },
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
            {["ALL", "DOCUMENTED", "UNDOCUMENTED"].map((t) => (
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
                    border: `1px solid ${j.documented ? GRN + "44" : DIM + "22"}`,
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      color: j.documented ? GRN : DIM,
                      minWidth: 82,
                    }}
                  >
                    {j.documented ? "DOCUMENTED" : "UNDOCUMENTED"}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      fontSize: 10,
                      color: j.documented ? GRN : DIM,
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
                  {j.documented && (
                    <span style={{ fontSize: 8, color: GRN }}>
                      ⬡ {j.matches.length} rpt
                    </span>
                  )}
                </div>

                {/* Expanded matched reports */}
                {expanded === j.id && j.documented && (
                  <div style={{ marginLeft: 12, marginBottom: 6 }}>
                    {j.matches.map((r) => (
                      <div
                        key={r.id}
                        style={{
                          padding: "3px 6px",
                          marginBottom: 2,
                          borderRadius: 2,
                          background: "rgba(0,229,160,0.05)",
                          border: `1px solid ${CY}22`,
                          fontSize: 9,
                        }}
                      >
                        <span
                          style={{
                            color: TYPE_COLOR[r.type.toUpperCase()] || AMB,
                            marginRight: 4,
                          }}
                        >
                          [{r.type.toUpperCase()}]
                        </span>
                        <span style={{ color: GRN }}>{r.title}</span>
                        {r.author && (
                          <span style={{ color: DIM, marginLeft: 6 }}>
                            by {r.author}
                          </span>
                        )}
                        <span style={{ color: DIM, marginLeft: 6 }}>
                          hits:{r.hits}
                        </span>
                        {r.summary && (
                          <div
                            style={{
                              color: DIM,
                              marginTop: 2,
                              lineHeight: 1.4,
                              whiteSpace: "normal",
                            }}
                          >
                            {r.summary.slice(0, 100)}
                            {r.summary.length > 100 ? "…" : ""}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {expanded === j.id && !j.documented && (
                  <div
                    style={{
                      marginLeft: 12,
                      marginBottom: 6,
                      fontSize: 9,
                      color: DIM,
                    }}
                  >
                    No reports reference this swarm job.
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
