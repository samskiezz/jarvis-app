/**
 * SwarmScenarioNexus — F526
 * "JARVIS, swarm scenario / scenario swarm / swrscn / which swarm jobs have scenarios / swarm playbook"
 * Cross-references /entities/SwarmJob + /v1/scenario/list.
 * Finds BACKED swarm jobs (≥1 scenario keyword-matches) vs UNSCRIPTED (no scenario playbook).
 * Coverage % tile; ALL/BACKED/UNSCRIPTED filter tabs + search; click-to-expand matched scenarios.
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
const BTN_LEFT = 40_160;
const Z_INDEX  = 105;

const SWRSCN_RE =
  /\bswrscn\b|\bswarm.?scenario\b|\bscenario.?swarm\b|\bswarm.?playbook\b|\bwhich.?swarm.?jobs?.?have.?scenario\b|\bswarm.?scripted\b|\bunscripted.?swarm\b|\bswarm.?scenario.?coverage\b|\bswarm.?simulation\b|\bscenario.?backed.?swarm\b/i;

export function isSwrscnQuery(text) {
  return SWRSCN_RE.test(text || "");
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
    data.swarm_jobs || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((j, i) => ({
    id:     j.id || `sj-${i}`,
    name:   j.name || j.title || j.job_name || `SwarmJob ${i + 1}`,
    status: (j.status || "UNKNOWN").toUpperCase(),
    desc:   j.description || j.objective || j.purpose || "",
    tags:   Array.isArray(j.tags) ? j.tags.join(" ") : String(j.tags || ""),
  }));
}

function normaliseScenarios(data) {
  if (!data) return [];
  const raw =
    data.scenarios || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((s, i) => ({
    id:   s.id || `sc-${i}`,
    name: s.name || s.title || `Scenario ${i + 1}`,
    kind: (s.kind || s.type || s.category || "SCENARIO").toUpperCase(),
    desc: s.description || s.summary || "",
    tags: Array.isArray(s.tags) ? s.tags.join(" ") : String(s.tags || ""),
  }));
}

function crossRef(jobs, scenarios) {
  return jobs.map((job) => {
    const haystack = `${job.name} ${job.desc} ${job.tags}`;
    const matches = scenarios
      .map((sc) => ({
        sc,
        hits: overlap(haystack, `${sc.name} ${sc.desc} ${sc.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...job,
      backed: matches.length > 0,
      matches: matches.map(({ sc, hits }) => ({ ...sc, hits })),
    };
  });
}

// ─── buildSwrscnScript (for JarvisBrain) ─────────────────────────────────────

export async function buildSwrscnScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [jobRes, scnRes] = await Promise.all([
      fetch(`${base}/entities/SwarmJob`, { headers: hdr }),
      fetch(`${base}/v1/scenario/list`,  { headers: hdr }),
    ]);
    const jobData = jobRes.ok ? await jobRes.json() : {};
    const scnData = scnRes.ok ? await scnRes.json() : {};

    const jobs      = normaliseJobs(jobData);
    const scenarios = normaliseScenarios(scnData);
    const crossed   = crossRef(jobs, scenarios);

    const total      = crossed.length;
    const backed     = crossed.filter((j) => j.backed).length;
    const unscripted = total - backed;
    const coverage   = total > 0 ? Math.round((backed / total) * 100) : 0;
    const topBacked  = crossed
      .filter((j) => j.backed)
      .slice(0, 2)
      .map((j) => j.name)
      .join(", ");

    const prompt = `JARVIS swarm scenario nexus: ${total} swarm jobs analysed. ${backed} are scenario-backed (${coverage}% coverage). ${unscripted} have no scenario playbook. Top backed: ${topBacked || "none"}. Provide a 2-sentence operational readiness brief.`;
    const chatRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({ message: prompt }),
    });
    const chatData = chatRes.ok ? await chatRes.json() : {};
    const brief =
      chatData.response || chatData.message || chatData.content ||
      `${backed} of ${total} swarm jobs have scenario playbooks (${coverage}% coverage). ${unscripted} remain unscripted.`;

    window.dispatchEvent(
      new CustomEvent("jarvis:speak-dossier", { detail: { text: brief } })
    );
    return brief;
  } catch (err) {
    return `Swarm scenario nexus error: ${err.message}`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function SwarmScenarioNexus() {
  const [open, setOpen]         = useState(false);
  const [jobs, setJobs]         = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [crossed, setCrossed]   = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]       = useState("");
  const [loading, setLoading]   = useState(false);
  const timerRef = useRef(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [jRes, sRes] = await Promise.all([
        fetch(`${base}/entities/SwarmJob`, { headers: hdr }),
        fetch(`${base}/v1/scenario/list`,  { headers: hdr }),
      ]);
      const jData = jRes.ok ? await jRes.json() : {};
      const sData = sRes.ok ? await sRes.json() : {};
      const j = normaliseJobs(jData);
      const s = normaliseScenarios(sData);
      setJobs(j);
      setScenarios(s);
      setCrossed(crossRef(j, s));
    } catch (_) {
      /* network unavailable */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:swrscn-toggle", onToggle);
    return () => window.removeEventListener("jarvis:swrscn-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetch_();
    timerRef.current = setInterval(fetch_, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetch_]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try {
      const result = await buildSwrscnScript();
      setBrief(result);
    } finally {
      setAssessing(false);
    }
  }, []);

  const backed     = crossed.filter((j) => j.backed);
  const unscripted = crossed.filter((j) => !j.backed);
  const coverage   = crossed.length > 0
    ? Math.round((backed.length / crossed.length) * 100)
    : 0;

  const visible = crossed
    .filter((j) => {
      if (tab === "BACKED")     return j.backed;
      if (tab === "UNSCRIPTED") return !j.backed;
      return true;
    })
    .filter((j) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        j.name.toLowerCase().includes(q) ||
        j.desc.toLowerCase().includes(q)
      );
    });

  // ── button (always visible) ──
  const btnStyle = {
    position: "fixed",
    bottom: 8,
    left: BTN_LEFT,
    zIndex: Z_INDEX,
    background: "rgba(0,20,40,0.85)",
    border: `1px solid ${!open ? DIM : CY}`,
    color: !open ? DIM : CY,
    fontFamily: "monospace",
    fontSize: 10,
    padding: "3px 7px",
    cursor: "pointer",
    borderRadius: 3,
    whiteSpace: "nowrap",
  };

  if (!open) {
    return (
      <button
        style={btnStyle}
        onClick={() => setOpen(true)}
        title="Swarm × Scenario Nexus (SWRSCN)"
      >
        ◈ SWRSCN{unscripted.length > 0 && (
          <span style={{ color: AMB, marginLeft: 4 }}>{unscripted.length}</span>
        )}
      </button>
    );
  }

  // ── panel ──
  const panel = {
    position: "fixed",
    bottom: 36,
    left: Math.min(BTN_LEFT, window.innerWidth - 480),
    width: 460,
    maxHeight: "75vh",
    overflowY: "auto",
    zIndex: Z_INDEX + 1,
    background: "rgba(0,10,25,0.97)",
    border: `1px solid ${CY}`,
    borderRadius: 6,
    fontFamily: "monospace",
    fontSize: 11,
    color: CY,
    padding: 14,
    boxShadow: `0 0 24px ${CY}44`,
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(false)}>
        ◈ SWRSCN ✕
      </button>

      <div style={panel}>
        <div style={{ fontSize: 13, fontWeight: "bold", marginBottom: 10 }}>
          ◈ SWARM × SCENARIO NEXUS
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {[
            ["TOTAL", crossed.length, CY],
            ["BACKED", backed.length, GRN],
            ["UNSCRIPTED", unscripted.length, AMB],
            ["COVERAGE", `${coverage}%`, coverage > 60 ? GRN : AMB],
          ].map(([label, val, col]) => (
            <div
              key={label}
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${col}55`,
                borderRadius: 4,
                padding: "4px 6px",
                textAlign: "center",
              }}
            >
              <div style={{ color: col, fontSize: 14, fontWeight: "bold" }}>{val}</div>
              <div style={{ color: DIM, fontSize: 9 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {["ALL", "BACKED", "UNSCRIPTED"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? CY : "transparent",
                color: tab === t ? "#000" : DIM,
                border: `1px solid ${tab === t ? CY : DIM}`,
                borderRadius: 3,
                padding: "2px 8px",
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* search */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search swarm jobs…"
          style={{
            width: "100%",
            background: "rgba(255,255,255,0.05)",
            border: `1px solid ${DIM}`,
            borderRadius: 3,
            color: CY,
            padding: "3px 6px",
            fontSize: 10,
            marginBottom: 8,
            boxSizing: "border-box",
          }}
        />

        {/* list */}
        {loading && !crossed.length ? (
          <div style={{ color: DIM, textAlign: "center", padding: 20 }}>FETCHING…</div>
        ) : visible.length === 0 ? (
          <div style={{ color: DIM, padding: 12 }}>No swarm jobs match.</div>
        ) : (
          visible.map((job) => (
            <div
              key={job.id}
              style={{
                borderBottom: `1px solid rgba(41,231,255,0.1)`,
                paddingBottom: 8,
                marginBottom: 8,
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                onClick={() => setExpanded(expanded === job.id ? null : job.id)}
              >
                <span
                  style={{
                    fontSize: 9,
                    padding: "1px 5px",
                    borderRadius: 3,
                    background: job.backed ? `${GRN}22` : `${AMB}22`,
                    color: job.backed ? GRN : AMB,
                    border: `1px solid ${job.backed ? GRN : AMB}55`,
                    flexShrink: 0,
                  }}
                >
                  {job.backed ? "BACKED" : "UNSCRIPTED"}
                </span>
                <span style={{ color: job.backed ? CY : DIM, flexGrow: 1 }}>{job.name}</span>
                <span style={{ color: DIM, fontSize: 9 }}>{job.status}</span>
                <span style={{ color: DIM }}>{expanded === job.id ? "▲" : "▼"}</span>
              </div>

              {expanded === job.id && (
                <div style={{ marginTop: 6, paddingLeft: 8 }}>
                  {job.desc && (
                    <div style={{ color: DIM, fontSize: 10, marginBottom: 6 }}>{job.desc}</div>
                  )}
                  {job.matches.length === 0 ? (
                    <div style={{ color: AMB, fontSize: 10 }}>No scenario matches found.</div>
                  ) : (
                    job.matches.map((sc) => (
                      <div
                        key={sc.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          marginBottom: 4,
                          paddingLeft: 4,
                          borderLeft: `2px solid ${GRN}55`,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 8,
                            padding: "1px 4px",
                            borderRadius: 2,
                            background: `${CY}22`,
                            color: CY,
                            border: `1px solid ${CY}44`,
                            flexShrink: 0,
                          }}
                        >
                          {sc.kind}
                        </span>
                        <span style={{ color: GRN, flexGrow: 1, fontSize: 10 }}>{sc.name}</span>
                        <span style={{ color: DIM, fontSize: 9 }}>{sc.hits}↑</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {/* assess */}
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            marginTop: 8,
            width: "100%",
            background: assessing ? "transparent" : `${GRN}22`,
            border: `1px solid ${GRN}`,
            color: GRN,
            borderRadius: 3,
            padding: "4px 0",
            cursor: assessing ? "not-allowed" : "pointer",
            fontSize: 10,
          }}
        >
          {assessing ? "ASSESSING…" : "▶ ASSESS"}
        </button>

        {brief && (
          <div
            style={{
              marginTop: 8,
              padding: 8,
              background: "rgba(0,229,160,0.06)",
              border: `1px solid ${GRN}44`,
              borderRadius: 4,
              color: GRN,
              fontSize: 10,
              lineHeight: 1.5,
            }}
          >
            {brief}
          </div>
        )}
      </div>
    </>
  );
}
