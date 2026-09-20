/**
 * ReportScenarioCoverageMonitor — F513
 * "JARVIS, report scenario / scenario report / rscncov / which reports have scenarios /
 *  report simulation / scenario backed reports / scenario coverage report"
 * Cross-references /v1/reports + /v1/scenario/list.
 * Finds MODELED reports (≥1 scenario keyword-matches the report) vs UNMODELED.
 * Coverage % tile; ALL/MODELED/UNMODELED filter tabs + search; click-to-expand matched scenarios.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4466";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 32_420;
const Z_INDEX  = 96;

const RSCNCOV_RE =
  /\brscncov\b|\breport.?scenario\b|\bscenario.?report\b|\bwhich.?reports?.?have.?scenario\b|\breport.?simulation\b|\bscenario.?backed.?report\b|\bscenario.?coverage.?report\b|\breport.?scenario.?coverage\b/i;

export function isRscncovQuery(text) {
  return RSCNCOV_RE.test(text || "");
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

function normaliseReports(data) {
  if (!data) return [];
  const raw =
    data.reports || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((r, i) => ({
    id:      r.id || `rep-${i}`,
    title:   r.title || r.name || `Report ${i + 1}`,
    type:    (r.type || r.category || r.kind || "OTHER").toUpperCase(),
    author:  r.author || r.created_by || "",
    summary: r.summary || r.description || "",
    status:  (r.status || "ACTIVE").toUpperCase(),
    tags:    Array.isArray(r.tags) ? r.tags.join(" ") : String(r.tags || ""),
  }));
}

function normaliseScenarios(data) {
  if (!data) return [];
  const raw =
    data.scenarios || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((s, i) => ({
    id:          s.id || `scn-${i}`,
    name:        s.name || s.title || s.scenario_name || `Scenario ${i + 1}`,
    kind:        (s.kind || s.type || s.category || "GENERAL").toUpperCase(),
    description: s.description || s.summary || "",
    tags:        Array.isArray(s.tags) ? s.tags.join(" ") : String(s.tags || ""),
  }));
}

function crossRef(reports, scenarios) {
  return reports.map((rep) => {
    const haystack = `${rep.title} ${rep.summary} ${rep.tags}`;
    const matches = scenarios
      .map((scn) => ({
        scn,
        hits: overlap(haystack, `${scn.name} ${scn.description} ${scn.tags} ${scn.kind}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...rep,
      modeled: matches.length > 0,
      matches: matches.map(({ scn, hits }) => ({ ...scn, hits })),
    };
  });
}

// ─── buildRscncovScript (for JarvisBrain) ────────────────────────────────────

export async function buildRscncovScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [repRes, scnRes] = await Promise.all([
      fetch(`${base}/v1/reports`,       { headers: hdr }),
      fetch(`${base}/v1/scenario/list`, { headers: hdr }),
    ]);
    const repData = repRes.ok ? await repRes.json() : {};
    const scnData = scnRes.ok ? await scnRes.json() : {};

    const reports   = normaliseReports(repData);
    const scenarios = normaliseScenarios(scnData);
    const crossed   = crossRef(reports, scenarios);

    const total    = crossed.length;
    const modeled  = crossed.filter((r) => r.modeled).length;
    const unmodeled = total - modeled;
    const coverage = total > 0 ? Math.round((modeled / total) * 100) : 0;
    const topUnmod = crossed
      .filter((r) => !r.modeled)
      .slice(0, 2)
      .map((r) => r.title)
      .join(", ");

    const brief =
      `${coverage}% of ${total} reports have scenario coverage. ` +
      `${modeled} MODELED, ${unmodeled} UNMODELED.` +
      (topUnmod ? ` Gaps include: ${topUnmod}.` : "");

    const agentRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Report × Scenario Coverage: ${brief} Provide a 2-sentence operational assessment.`,
      }),
    });
    const agentData = agentRes.ok ? await agentRes.json() : {};
    const agentText = agentData.response || agentData.message || agentData.reply || "";

    return agentText ? `${brief}\n\n${agentText}` : brief;
  } catch (err) {
    return `Report × Scenario Coverage Monitor unavailable: ${err.message}`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────

const TYPE_COLOR = {
  THREAT: RED, INTEL: AMB, OPS: CY, KNOWLEDGE: GRN, OTHER: DIM,
};

const KIND_COLOR = {
  SECURITY: RED, RISK: AMB, OPERATIONAL: CY, RESEARCH: GRN,
  FINANCIAL: "#A78BFA", GENERAL: DIM,
};

export default function ReportScenarioCoverageMonitor() {
  const [open, setOpen]         = useState(false);
  const [reports, setReports]   = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [crossed, setCrossed]   = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [query, setQuery]       = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [assessing, setAssess]  = useState(false);
  const [brief, setBrief]       = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [repRes, scnRes] = await Promise.all([
        fetch(`${base}/v1/reports`,       { headers: hdr }),
        fetch(`${base}/v1/scenario/list`, { headers: hdr }),
      ]);
      const repData = repRes.ok ? await repRes.json() : {};
      const scnData = scnRes.ok ? await scnRes.json() : {};

      const reps = normaliseReports(repData);
      const scns = normaliseScenarios(scnData);
      setReports(reps);
      setScenarios(scns);
      setCrossed(crossRef(reps, scns));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => {
      if (!v) load();
      return !v;
    });
    window.addEventListener("jarvis:rscncov-toggle", onToggle);
    return () => window.removeEventListener("jarvis:rscncov-toggle", onToggle);
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
      const base     = apiBase();
      const hdr      = { Authorization: `Bearer ${API_KEY}` };
      const total    = crossed.length;
      const modeled  = crossed.filter((r) => r.modeled).length;
      const unmodeled = total - modeled;
      const coverage = total > 0 ? Math.round((modeled / total) * 100) : 0;
      const prompt   = `Report × Scenario Coverage: ${coverage}% (${modeled}/${total} modeled, ${unmodeled} unmodeled). Assess in 2 sentences.`;
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

  const visible = crossed.filter((r) => {
    if (tab === "MODELED"   && !r.modeled) return false;
    if (tab === "UNMODELED" &&  r.modeled) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!r.title.toLowerCase().includes(q) && !(r.summary || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const total     = crossed.length;
  const nModeled  = crossed.filter((r) => r.modeled).length;
  const nUnmodeled = total - nModeled;
  const coverage  = total > 0 ? Math.round((nModeled / total) * 100) : 0;
  const badgeCount = nUnmodeled;

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
        title="Report × Scenario Coverage Monitor"
      >
        ◈ RSCNCOV
        {badgeCount > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 8, padding: "0 4px", fontSize: 9 }}>
            {badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: "bold", letterSpacing: 1 }}>REPORT × SCENARIO COVERAGE</span>
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
              { label: "COVERAGE",   value: `${coverage}%`,  color: coverage > 60 ? GRN : coverage > 30 ? AMB : RED },
              { label: "MODELED",    value: nModeled,         color: GRN },
              { label: "UNMODELED",  value: nUnmodeled,       color: AMB },
              { label: "SCENARIOS",  value: scenarios.length, color: CY  },
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
            {["ALL", "MODELED", "UNMODELED"].map((t) => (
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
            placeholder="Search reports…"
            style={{
              width: "100%", background: "rgba(41,231,255,0.06)", border: `1px solid ${CY}33`,
              color: CY, padding: "4px 8px", borderRadius: 3, fontSize: 10,
              marginBottom: 8, boxSizing: "border-box", fontFamily: "monospace",
            }}
          />

          {/* Report rows */}
          {loading ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>Loading…</div>
          ) : visible.length === 0 ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>No reports match.</div>
          ) : (
            visible.map((rep) => (
              <div key={rep.id}>
                <div
                  onClick={() => setExpanded(expanded === rep.id ? null : rep.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 6px", marginBottom: 3, cursor: "pointer",
                    borderRadius: 3, background: "rgba(41,231,255,0.04)",
                    border: `1px solid ${rep.modeled ? GRN + "44" : DIM + "22"}`,
                  }}
                >
                  <span style={{ fontSize: 9, color: TYPE_COLOR[rep.type] || DIM, minWidth: 52 }}>
                    {rep.type}
                  </span>
                  <span style={{ flex: 1, fontSize: 10, color: rep.modeled ? GRN : DIM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {rep.title}
                  </span>
                  {rep.modeled ? (
                    <span style={{ fontSize: 8, color: GRN }}>⬡ {rep.matches.length} scn</span>
                  ) : (
                    <span style={{ fontSize: 8, color: AMB }}>UNMODELED</span>
                  )}
                </div>

                {expanded === rep.id && rep.modeled && (
                  <div style={{ marginLeft: 12, marginBottom: 6 }}>
                    {rep.summary && (
                      <div style={{ fontSize: 9, color: DIM, marginBottom: 4 }}>{rep.summary}</div>
                    )}
                    {rep.author && (
                      <div style={{ fontSize: 8, color: DIM, marginBottom: 4 }}>Author: {rep.author}</div>
                    )}
                    {rep.matches.map((scn) => (
                      <div
                        key={scn.id}
                        style={{
                          padding: "3px 6px", marginBottom: 2, borderRadius: 2,
                          background: "rgba(0,229,160,0.05)", border: `1px solid ${GRN}33`,
                          fontSize: 9,
                        }}
                      >
                        <span style={{ color: KIND_COLOR[scn.kind] || DIM, marginRight: 4 }}>[{scn.kind}]</span>
                        <span style={{ color: GRN }}>{scn.name}</span>
                        <span style={{ color: DIM, marginLeft: 6 }}>hits:{scn.hits}</span>
                      </div>
                    ))}
                  </div>
                )}

                {expanded === rep.id && !rep.modeled && (
                  <div style={{ marginLeft: 12, marginBottom: 6, fontSize: 9, color: DIM }}>
                    No scenarios currently model this report's subject.
                    {rep.summary && <div style={{ marginTop: 2 }}>{rep.summary}</div>}
                    {rep.author && <div style={{ marginTop: 2 }}>Author: {rep.author}</div>}
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
