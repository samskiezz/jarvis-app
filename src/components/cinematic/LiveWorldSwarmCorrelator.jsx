/**
 * LiveWorldSwarmCorrelator — F560
 * "JARVIS, live world swarm / lwswrm / world swarm / swarm trigger / real world swarm"
 * Cross-references /functions/getLiveIntel + /entities/SwarmJob.
 * Finds WORLD-SIGNALED jobs (≥1 live event keyword-matches) vs UNRELATED.
 * Coverage % tile; ALL/WORLD-SIGNALED/UNRELATED filter tabs + search; click-to-expand event detail.
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
const BTN_LEFT = 56_500;
const Z_INDEX  = 124;

const LWSWRM_RE =
  /\blwswrm\b|\blive.?world.?swarm\b|\bworld.?swarm\b|\bswarm.?trigger\b|\btriggered.?swarm\b|\breal.?world.?swarm\b|\bswarm.?world\b|\blive.?swarm.?signal\b|\bswarm.?activated\b|\bworld.?signaled.?swarm\b/i;

export function isLwswrmQuery(text) {
  return LWSWRM_RE.test(text || "");
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

function normaliseLiveEvents(data) {
  if (!data) return [];
  const all = [];

  const quakes = Array.isArray(data.earthquakes) ? data.earthquakes : [];
  quakes.forEach((q, i) => {
    all.push({
      id: q.id || `quake-${i}`,
      kind: "SEISMIC",
      name: q.place || q.name || `Magnitude ${q.magnitude} quake`,
      description: `Mag ${q.magnitude ?? "?"} at ${q.place || "unknown location"}. ${q.type || ""}`,
      tags: ["seismic", "earthquake", "geologic", "disaster", q.place || ""].join(" "),
    });
  });

  const coins = Array.isArray(data.crypto) ? data.crypto
    : Array.isArray(data.coins) ? data.coins : [];
  coins.forEach((c, i) => {
    const sym = c.symbol || c.coin || c.currency || `COIN${i}`;
    const chg = c.change_pct ?? c.change ?? c.pct_change ?? null;
    all.push({
      id: `crypto-${sym}`,
      kind: "CRYPTO",
      name: `${sym} ${chg !== null ? (chg >= 0 ? `+${chg.toFixed(2)}%` : `${chg.toFixed(2)}%`) : ""}`.trim(),
      description: `Cryptocurrency ${sym}: price ${c.price ?? "?"} USD.${chg !== null ? ` Change: ${chg.toFixed(2)}%` : ""}`,
      tags: `crypto ${sym} ${sym.toLowerCase()} digital asset market finance`.trim(),
    });
  });

  const fx = Array.isArray(data.fx) ? data.fx
    : Array.isArray(data.currencies) ? data.currencies : [];
  fx.forEach((f, i) => {
    const pair = f.pair || f.symbol || f.currency_pair || `FX${i}`;
    const rate = f.rate ?? f.price ?? null;
    all.push({
      id: `fx-${pair}`,
      kind: "FX",
      name: `${pair} ${rate !== null ? `@ ${rate}` : ""}`.trim(),
      description: `FX pair ${pair}. Rate: ${rate ?? "?"}.`,
      tags: `currency forex fx ${pair} ${pair.toLowerCase()} monetary exchange finance`.trim(),
    });
  });

  return all;
}

function normaliseSwarmJobs(raw) {
  const arr = Array.isArray(raw)            ? raw
    : Array.isArray(raw?.data)              ? raw.data
    : Array.isArray(raw?.items)             ? raw.items
    : Array.isArray(raw?.jobs)              ? raw.jobs
    : Array.isArray(raw?.swarm_jobs)        ? raw.swarm_jobs
    : Array.isArray(raw?.results)           ? raw.results
    : [];
  return arr.map((j, i) => ({
    id:          j.id          || j.job_id  || String(i),
    title:       j.title       || j.name    || j.label || j.job_name || `SwarmJob ${i + 1}`,
    status:      (j.status     || "UNKNOWN").toString().toUpperCase(),
    description: (j.description || j.summary || j.detail || j.objective || "").toString().slice(0, 300),
    tags:        Array.isArray(j.tags) ? j.tags.join(" ") : (j.tags || ""),
    kind:        (j.kind        || j.type   || j.category || "JOB").toString().toUpperCase(),
  }));
}

function crossRef(jobs, events) {
  return jobs.map((job) => {
    const haystack = `${job.title} ${job.description} ${job.tags} ${job.kind}`;
    const matches = events
      .map((ev) => ({
        ev,
        hits: overlap(haystack, `${ev.name} ${ev.description} ${ev.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...job,
      signaled: matches.length > 0,
      matches: matches.map(({ ev, hits }) => ({ ...ev, hits })),
    };
  });
}

// ─── buildLwswrmScript (for JarvisBrain) ─────────────────────────────────────

export async function buildLwswrmScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [liveRes, jobsRes] = await Promise.all([
      fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
      fetch(`${base}/entities/SwarmJob`,      { headers: hdr }),
    ]);
    const liveData = liveRes.ok ? await liveRes.json() : {};
    const jobsData = jobsRes.ok ? await jobsRes.json() : {};

    const events = normaliseLiveEvents(liveData);
    const jobs   = normaliseSwarmJobs(jobsData);
    const crossed = crossRef(jobs, events);

    const total    = crossed.length;
    const signaled = crossed.filter((j) => j.signaled).length;
    const unrelated = total - signaled;
    const coverage = total > 0 ? Math.round((signaled / total) * 100) : 0;
    const topSignaled = crossed
      .filter((j) => j.signaled)
      .slice(0, 2)
      .map((j) => j.title)
      .join(", ");

    const brief =
      `${coverage}% of ${total} swarm jobs correlate with live world events. ` +
      `${signaled} WORLD-SIGNALED, ${unrelated} UNRELATED.` +
      (topSignaled ? ` Top activated jobs: ${topSignaled}.` : "");

    const agentRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Live World × SwarmJob Correlation: ${brief} Provide a 2-sentence operational assessment.`,
      }),
    });
    const agentData = agentRes.ok ? await agentRes.json() : {};
    const agentText = agentData.response || agentData.message || agentData.reply || "";

    return agentText ? `${brief}\n\n${agentText}` : brief;
  } catch (err) {
    return `Live World × SwarmJob Correlator unavailable: ${err.message}`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────

const KIND_COLOR = { SEISMIC: "#FF6B35", CRYPTO: GRN, FX: CY };

const STATUS_COLOR = {
  RUNNING: GRN, ACTIVE: GRN,
  QUEUED: CY, PENDING: CY, WAITING: CY,
  FAILED: "#FF4466", ERROR: "#FF4466", ABORTED: "#FF4466",
};

export default function LiveWorldSwarmCorrelator() {
  const [open, setOpen]       = useState(false);
  const [jobs, setJobs]       = useState([]);
  const [events, setEvents]   = useState([]);
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
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [liveRes, jobsRes] = await Promise.all([
        fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
        fetch(`${base}/entities/SwarmJob`,      { headers: hdr }),
      ]);
      const liveData = liveRes.ok ? await liveRes.json() : {};
      const jobsData = jobsRes.ok ? await jobsRes.json() : {};

      const evs = normaliseLiveEvents(liveData);
      const jbs = normaliseSwarmJobs(jobsData);
      setEvents(evs);
      setJobs(jbs);
      setCrossed(crossRef(jbs, evs));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => {
      if (!v) load();
      return !v;
    });
    window.addEventListener("jarvis:lwswrm-toggle", onToggle);
    return () => window.removeEventListener("jarvis:lwswrm-toggle", onToggle);
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
      const total    = crossed.length;
      const signaled = crossed.filter((j) => j.signaled).length;
      const unrelated = total - signaled;
      const coverage = total > 0 ? Math.round((signaled / total) * 100) : 0;
      const prompt = `Live World × SwarmJob: ${coverage}% world-signal coverage (${signaled}/${total} signaled, ${unrelated} unrelated). Assess in 2 sentences.`;
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      const d = res.ok ? await res.json() : {};
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
    if (tab === "WORLD-SIGNALED" && !j.signaled) return false;
    if (tab === "UNRELATED"      &&  j.signaled) return false;
    if (query) {
      const q = query.toLowerCase();
      if (
        !j.title.toLowerCase().includes(q) &&
        !j.description.toLowerCase().includes(q) &&
        !j.kind.toLowerCase().includes(q) &&
        !j.status.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const total     = crossed.length;
  const nSignaled = crossed.filter((j) => j.signaled).length;
  const nUnrel    = total - nSignaled;
  const coverage  = total > 0 ? Math.round((nSignaled / total) * 100) : 0;

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
        onClick={() => { setOpen((v) => { if (!v) load(); return !v; }); }}
        title="Live World × SwarmJob Correlator"
      >
        ◈ LWSWRM
        {nUnrel > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 8, padding: "0 4px", fontSize: 9 }}>
            {nUnrel}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: "bold", letterSpacing: 1 }}>LIVE WORLD × SWARM JOBS</span>
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
              { label: "COVERAGE",       value: `${coverage}%`, color: coverage > 60 ? GRN : coverage > 30 ? AMB : "#FF4466" },
              { label: "WORLD-SIGNALED", value: nSignaled,      color: GRN },
              { label: "UNRELATED",      value: nUnrel,         color: AMB },
              { label: "LIVE EVENTS",    value: events.length,  color: CY },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  flex: 1, background: "rgba(41,231,255,0.05)", border: `1px solid ${color}33`,
                  borderRadius: 4, padding: "6px 8px", textAlign: "center",
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
                background: assessing ? "rgba(41,231,255,0.1)" : "rgba(41,231,255,0.15)",
                border: `1px solid ${CY}88`,
                color: CY, cursor: assessing ? "wait" : "pointer",
                padding: "4px 14px", borderRadius: 3, fontSize: 10, fontFamily: "monospace",
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
            {["ALL", "WORLD-SIGNALED", "UNRELATED"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "none",
                  border: `1px solid ${tab === t ? CY : CY + "33"}`,
                  color: tab === t ? CY : DIM,
                  cursor: "pointer", padding: "2px 10px", borderRadius: 3,
                  fontSize: 10, fontFamily: "monospace",
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
              width: "100%", background: "rgba(41,231,255,0.06)", border: `1px solid ${CY}33`,
              color: CY, padding: "4px 8px", borderRadius: 3, fontSize: 10,
              marginBottom: 8, boxSizing: "border-box", fontFamily: "monospace",
            }}
          />

          {/* SwarmJob rows */}
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
                    border: `1px solid ${job.signaled ? GRN + "44" : DIM + "22"}`,
                  }}
                >
                  <span style={{
                    fontSize: 8, padding: "1px 4px", borderRadius: 2,
                    background: `${STATUS_COLOR[job.status] || DIM}22`,
                    color: STATUS_COLOR[job.status] || DIM,
                    minWidth: 44, textAlign: "center",
                  }}>
                    {job.status.slice(0, 8)}
                  </span>
                  <span style={{ flex: 1, fontSize: 10, color: job.signaled ? GRN : DIM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {job.title}
                  </span>
                  {job.signaled ? (
                    <span style={{ fontSize: 8, color: GRN }}>⬡ {job.matches.length} ev</span>
                  ) : (
                    <span style={{ fontSize: 8, color: DIM }}>UNRELATED</span>
                  )}
                </div>

                {/* Expanded matched events */}
                {expanded === job.id && job.signaled && (
                  <div style={{ marginLeft: 12, marginBottom: 6 }}>
                    {job.description && (
                      <div style={{ fontSize: 9, color: DIM, marginBottom: 4 }}>{job.description.slice(0, 120)}</div>
                    )}
                    {job.matches.map((ev) => (
                      <div
                        key={ev.id}
                        style={{
                          padding: "3px 6px", marginBottom: 2, borderRadius: 2,
                          background: "rgba(0,229,160,0.05)", border: `1px solid ${KIND_COLOR[ev.kind] || DIM}33`,
                          fontSize: 9,
                        }}
                      >
                        <span style={{ color: KIND_COLOR[ev.kind] || DIM, marginRight: 4 }}>[{ev.kind}]</span>
                        <span style={{ color: GRN }}>{ev.name}</span>
                        <span style={{ color: DIM, marginLeft: 6 }}>hits:{ev.hits}</span>
                      </div>
                    ))}
                  </div>
                )}

                {expanded === job.id && !job.signaled && (
                  <div style={{ marginLeft: 12, marginBottom: 6, fontSize: 9, color: DIM }}>
                    No live world events correlate with this swarm job.
                    {job.description && <div style={{ marginTop: 2 }}>{job.description.slice(0, 120)}</div>}
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
