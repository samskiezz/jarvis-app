/**
 * SwarmKnowledgeNexus — F515
 * "JARVIS, swarm knowledge / knowledge swarm / swrkno / grounded swarm /
 *  supported swarm jobs / ungrounded swarm / swarm knowledge coverage"
 * Cross-references /entities/SwarmJob + /knowledge/.
 * Finds GROUNDED jobs (≥1 article keyword-matches) vs UNGROUNDED (no knowledge backing).
 * Coverage % tile; ALL/GROUNDED/UNGROUNDED filter tabs + search; click-to-expand articles.
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
const BTN_LEFT = 34_140;
const Z_INDEX  = 98;

const SWRKNO_RE =
  /\bswrkno\b|\bswarm.?knowledge\b|\bknowledge.?swarm\b|\bgrounded.?swarm\b|\bsupported.?swarm.?job\b|\bungrounded.?swarm\b|\bswarm.?knowledge.?coverage\b|\bswarm.?article\b|\bknowledge.?backed.?swarm\b/i;

export function isSwrknoQuery(text) {
  return SWRKNO_RE.test(text || "");
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
    name:        j.name || j.title || j.job_name || `SwarmJob ${i + 1}`,
    status:      (j.status || "RUNNING").toUpperCase(),
    kind:        (j.kind || j.type || j.job_type || "GENERAL").toUpperCase(),
    description: j.description || j.goal || j.notes || null,
    tags:        Array.isArray(j.tags) ? j.tags.join(" ") : String(j.tags || ""),
  }));
}

function normaliseArticles(data) {
  if (!data) return [];
  const raw =
    data.articles || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((a, i) => ({
    id:      a.id || `art-${i}`,
    title:   a.title || a.name || `Article ${i + 1}`,
    kind:    (a.kind || a.type || a.category || "GENERAL").toUpperCase(),
    summary: a.summary || a.content || a.body || null,
    tags:    Array.isArray(a.tags) ? a.tags.join(" ") : String(a.tags || ""),
  }));
}

function crossRef(jobs, articles) {
  return jobs.map((job) => {
    const haystack = `${job.name} ${job.description || ""} ${job.tags}`;
    const matches = articles
      .map((art) => ({
        art,
        hits: overlap(haystack, `${art.title} ${art.summary || ""} ${art.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...job,
      grounded: matches.length > 0,
      matches:  matches.map(({ art, hits }) => ({ ...art, hits })),
    };
  });
}

// ─── buildSwrknoScript (for JarvisBrain) ─────────────────────────────────────

export async function buildSwrknoScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [jobRes, artRes] = await Promise.all([
      fetch(`${base}/entities/SwarmJob`, { headers: hdr }),
      fetch(`${base}/knowledge/`,        { headers: hdr }),
    ]);
    const jobData = jobRes.ok ? await jobRes.json() : {};
    const artData = artRes.ok ? await artRes.json() : {};

    const jobs     = normaliseJobs(jobData);
    const articles = normaliseArticles(artData);
    const crossed  = crossRef(jobs, articles);

    const total      = crossed.length;
    const grounded   = crossed.filter((j) => j.grounded).length;
    const ungrounded = total - grounded;
    const coverage   = total > 0 ? Math.round((grounded / total) * 100) : 0;

    const topUngrounded = crossed
      .filter((j) => !j.grounded)
      .slice(0, 3)
      .map((j) => j.name)
      .join(", ");

    const brief =
      `${coverage}% of ${total} swarm jobs have knowledge backing. ` +
      `${grounded} GROUNDED, ${ungrounded} UNGROUNDED.` +
      (topUngrounded ? ` Key unsupported jobs: ${topUngrounded}.` : "");

    const agentRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `SwarmJob × Knowledge Coverage: ${brief} Provide a 2-sentence operational knowledge-gap assessment.`,
      }),
    });
    const agentData = agentRes.ok ? await agentRes.json() : {};
    const agentText = agentData.response || agentData.message || agentData.reply || "";

    return agentText ? `${brief}\n\n${agentText}` : brief;
  } catch (err) {
    return `SwarmJob × Knowledge Nexus unavailable: ${err.message}`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────

const KIND_COLOR = {
  THREAT:    "#FF4466",
  CYBER:     "#29E7FF",
  OPS:       "#FFA500",
  INTEL:     "#00E5A0",
  FINANCIAL: "#A0C4FF",
  RESEARCH:  "#B0FFA0",
  GENERAL:   "#8899AA",
};

const STATUS_COLOR = {
  RUNNING:   "#00E5A0",
  PENDING:   "#29E7FF",
  COMPLETED: "#8899AA",
  FAILED:    "#FF4466",
  PAUSED:    "#FFA500",
};

export default function SwarmKnowledgeNexus() {
  const [open, setOpen]       = useState(false);
  const [jobs, setJobs]       = useState([]);
  const [articles, setArticles] = useState([]);
  const [crossed, setCrossed] = useState([]);
  const [tab, setTab]         = useState("ALL");
  const [query, setQuery]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssess] = useState(false);
  const [brief, setBrief]     = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [jobRes, artRes] = await Promise.all([
        fetch(`${base}/entities/SwarmJob`, { headers: hdr }),
        fetch(`${base}/knowledge/`,        { headers: hdr }),
      ]);
      const jobData = jobRes.ok ? await jobRes.json() : {};
      const artData = artRes.ok ? await artRes.json() : {};

      const j = normaliseJobs(jobData);
      const a = normaliseArticles(artData);
      setJobs(j);
      setArticles(a);
      setCrossed(crossRef(j, a));
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
    window.addEventListener("jarvis:swrkno-toggle", onToggle);
    return () => window.removeEventListener("jarvis:swrkno-toggle", onToggle);
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
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const total      = crossed.length;
      const grounded   = crossed.filter((j) => j.grounded).length;
      const ungrounded = total - grounded;
      const coverage   = total > 0 ? Math.round((grounded / total) * 100) : 0;
      const prompt     = `SwarmJob × Knowledge Coverage: ${coverage}% (${grounded}/${total} grounded, ${ungrounded} ungrounded). Assess in 2 sentences.`;

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
      if (
        !j.name.toLowerCase().includes(q) &&
        !(j.description || "").toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const total      = crossed.length;
  const nGrounded  = crossed.filter((j) => j.grounded).length;
  const nUngrounded = total - nGrounded;
  const coverage   = total > 0 ? Math.round((nGrounded / total) * 100) : 0;

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
        title="SwarmJob × Knowledge Nexus"
      >
        ◈ SWRKNO
        {nUngrounded > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 8, padding: "0 4px", fontSize: 9 }}>
            {nUngrounded}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: "bold", letterSpacing: 1 }}>SWARM × KNOWLEDGE NEXUS</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={load}
                style={{ background: "none", border: `1px solid ${CY}55`, color: CY, cursor: "pointer", padding: "2px 8px", borderRadius: 3, fontSize: 10 }}
                title="Refresh"
              >
                ↺
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {[
              { label: "COVERAGE",   value: `${coverage}%`,  color: coverage > 60 ? GRN : coverage > 30 ? AMB : "#FF4466" },
              { label: "GROUNDED",   value: nGrounded,        color: GRN },
              { label: "UNGROUNDED", value: nUngrounded,      color: AMB },
              { label: "ARTICLES",   value: articles.length,  color: CY },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  flex: 1, background: "rgba(41,231,255,0.05)",
                  border: `1px solid ${color}33`, borderRadius: 4,
                  padding: "6px 8px", textAlign: "center",
                }}
              >
                <div style={{ fontSize: 16, fontWeight: "bold", color }}>{value}</div>
                <div style={{ fontSize: 8, color: DIM, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Assess button + brief */}
          <div style={{ marginBottom: 10 }}>
            <button
              onClick={assess}
              disabled={assessing || crossed.length === 0}
              style={{
                background: assessing ? "rgba(41,231,255,0.1)" : "rgba(41,231,255,0.15)",
                border: `1px solid ${CY}88`,
                color: CY, cursor: assessing ? "wait" : "pointer",
                padding: "4px 14px", borderRadius: 3,
                fontSize: 10, fontFamily: "monospace",
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, fontSize: 10, color: "#cde", lineHeight: 1.5, padding: "6px 8px", background: "rgba(41,231,255,0.05)", borderRadius: 3 }}>
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
                  cursor: "pointer", padding: "2px 10px",
                  borderRadius: 3, fontSize: 10, fontFamily: "monospace",
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
              width: "100%", background: "rgba(41,231,255,0.06)",
              border: `1px solid ${CY}33`, color: CY,
              padding: "4px 8px", borderRadius: 3, fontSize: 10,
              marginBottom: 8, boxSizing: "border-box", fontFamily: "monospace",
            }}
          />

          {/* Job rows */}
          {loading ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>Loading…</div>
          ) : visible.length === 0 ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>No swarm jobs match.</div>
          ) : (
            visible.map((job) => (
              <div key={job.id}>
                <div
                  onClick={() => setExpanded(expanded === job.id ? null : job.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 6px", marginBottom: 3, cursor: "pointer",
                    borderRadius: 3, background: "rgba(41,231,255,0.04)",
                    border: `1px solid ${job.grounded ? GRN + "44" : DIM + "22"}`,
                  }}
                >
                  <span style={{ fontSize: 9, color: STATUS_COLOR[job.status] || DIM, minWidth: 58 }}>
                    {job.status}
                  </span>
                  <span style={{ flex: 1, fontSize: 10, color: job.grounded ? GRN : DIM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {job.name}
                  </span>
                  {job.grounded ? (
                    <span style={{ fontSize: 8, color: GRN }}>⬡ {job.matches.length} art</span>
                  ) : (
                    <span style={{ fontSize: 8, color: AMB }}>UNGROUNDED</span>
                  )}
                </div>

                {expanded === job.id && job.grounded && (
                  <div style={{ marginLeft: 12, marginBottom: 6 }}>
                    {job.description && (
                      <div style={{ fontSize: 9, color: DIM, marginBottom: 4 }}>{job.description}</div>
                    )}
                    {job.matches.map((art) => (
                      <div
                        key={art.id}
                        style={{
                          padding: "3px 6px", marginBottom: 2, borderRadius: 2,
                          background: "rgba(0,229,160,0.05)",
                          border: `1px solid ${KIND_COLOR[art.kind] || DIM}33`,
                          fontSize: 9,
                        }}
                      >
                        <span style={{ color: KIND_COLOR[art.kind] || DIM, marginRight: 4 }}>[{art.kind}]</span>
                        <span style={{ color: GRN }}>{art.title}</span>
                        <span style={{ color: DIM, marginLeft: 6 }}>hits:{art.hits}</span>
                      </div>
                    ))}
                  </div>
                )}

                {expanded === job.id && !job.grounded && (
                  <div style={{ marginLeft: 12, marginBottom: 6, fontSize: 9, color: DIM }}>
                    No knowledge articles support this swarm job.
                    {job.description && <div style={{ marginTop: 2 }}>{job.description}</div>}
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
