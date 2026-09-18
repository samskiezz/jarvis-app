/**
 * SwarmJobKnowledgeReportBacking — F90.
 *
 * Triple-nexus: /entities/SwarmJob × /knowledge/ × /v1/reports
 *
 * Keyword-correlates each swarm job against:
 *   - knowledge articles (is there a KB article explaining what this job does?)
 *   - reports           (is there a published report with output from this job?)
 *
 * Classification per job:
 *   FULLY_BACKED   — matched ≥1 KB article AND ≥1 report
 *   KB_ONLY        — has a KB article but no report output
 *   REPORT_ONLY    — has report output but no KB documentation
 *   DARK           — no KB article or report (automation black box — blind spot)
 *
 * Stat tiles: JOBS / KB ARTICLES / REPORTS / FULLY BACKED / DARK
 * Filter tabs: ALL / FULLY_BACKED / KB_ONLY / REPORT_ONLY / DARK
 * List: jobs sorted by classification (DARK first), each expandable.
 * Click ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence intelligence-backing brief + TTS.
 * 90s auto-refresh.
 *
 * Intent: "sjkrbak" / "swarm job backing" / "swarm knowledge" /
 *         "swarm report" / "dark swarm" / "job documentation" /
 *         "swarm documentation" / "undocumented swarm"
 *   → jarvis:sjkrbak-toggle + TTS via buildSjkrbakScript()
 *
 * Toggle: ◈ SJKRBAK at left:969940, bottom:8, zIndex:114.
 * Mounted in App.jsx; wired in JarvisBrain.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#FFB347";
const GREEN  = "#00c878";
const RED    = "#FF3D5A";
const BTN_LEFT   = 969940;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise helpers ────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

function normaliseJobs(raw) {
  return normaliseArray(raw).map((j) => ({
    id: j.id || j.job_id || String(Math.random()),
    name: j.name || j.title || j.label || j.job_name || "Unnamed Job",
    type: j.type || j.job_type || j.category || "",
    status: j.status || j.state || "unknown",
    description: j.description || j.objective || j.summary || "",
  }));
}

function normaliseKnowledge(raw) {
  return normaliseArray(raw).map((k) => ({
    id: k.id || k.article_id || String(Math.random()),
    title: k.title || k.subject || k.name || "Untitled",
    subject: k.subject || k.category || k.domain || "",
    body: k.body || k.content || k.summary || "",
  }));
}

function normaliseReports(raw) {
  return normaliseArray(raw).map((r) => ({
    id: r.id || r.report_id || String(Math.random()),
    title: r.title || r.name || r.subject || "Untitled Report",
    type: r.type || r.report_type || r.category || "",
    description: r.description || r.summary || "",
  }));
}

// ─── keyword scorer ───────────────────────────────────────────────────────────

function keywords(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function scoreMatch(jobKws, itemText) {
  const iKws = keywords(itemText);
  const hits = jobKws.filter((k) => iKws.includes(k)).length;
  if (!hits) return 0;
  const union = new Set([...jobKws, ...iKws]).size;
  return Math.round((hits / union) * 100);
}

// ─── exported intent helpers ──────────────────────────────────────────────────

export function isSjkrbakQuery(q) {
  const l = q.toLowerCase();
  return (
    l.includes("sjkrbak") ||
    l.includes("swarm job backing") ||
    l.includes("swarm knowledge report") ||
    l.includes("dark swarm") ||
    l.includes("undocumented swarm") ||
    l.includes("swarm documentation") ||
    (l.includes("swarm") && l.includes("backing")) ||
    (l.includes("job") && l.includes("documentation") && l.includes("swarm")) ||
    (l.includes("swarm") && l.includes("knowledge") && l.includes("report"))
  );
}

export async function buildSjkrbakScript() {
  const base = apiBase();
  try {
    const [jr, kr, rr] = await Promise.all([
      fetch(`${base}/entities/SwarmJob`).then((r) => r.json()).catch(() => []),
      fetch(`${base}/knowledge/`).then((r) => r.json()).catch(() => []),
      fetch(`${base}/v1/reports`).then((r) => r.json()).catch(() => []),
    ]);
    const jobs     = normaliseJobs(jr);
    const articles = normaliseKnowledge(kr);
    const reports  = normaliseReports(rr);
    let dark = 0;
    jobs.forEach((j) => {
      const kws = keywords(`${j.name} ${j.type} ${j.description}`);
      const hasK = articles.some((k) => scoreMatch(kws, `${k.title} ${k.subject} ${k.body}`) > 0);
      const hasR = reports.some((r) => scoreMatch(kws, `${r.title} ${r.type} ${r.description}`) > 0);
      if (!hasK && !hasR) dark++;
    });
    return (
      `Swarm job knowledge-report backing: ${jobs.length} swarm jobs, ` +
      `${articles.length} KB articles, ${reports.length} reports. ` +
      `${dark} job${dark !== 1 ? "s" : ""} are DARK — no knowledge article or report backs them. ` +
      `Recommend documenting dark jobs and publishing report summaries of their outputs.`
    );
  } catch {
    return "Swarm job knowledge-report backing data unavailable.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

const CLASS_ORDER = ["DARK", "KB_ONLY", "REPORT_ONLY", "FULLY_BACKED"];

export default function SwarmJobKnowledgeReportBacking() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [stats,     setStats]     = useState({ jobs: 0, kb: 0, reports: 0, fully: 0, dark: 0 });
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const [jr, kr, rr] = await Promise.all([
        fetch(`${base}/entities/SwarmJob`).then((r) => r.json()).catch(() => []),
        fetch(`${base}/knowledge/`).then((r) => r.json()).catch(() => []),
        fetch(`${base}/v1/reports`).then((r) => r.json()).catch(() => []),
      ]);
      const jobs     = normaliseJobs(jr);
      const articles = normaliseKnowledge(kr);
      const reports  = normaliseReports(rr);

      const built = jobs.map((j) => {
        const kws = keywords(`${j.name} ${j.type} ${j.description}`);
        const matchedK = articles
          .map((k) => ({ ...k, score: scoreMatch(kws, `${k.title} ${k.subject} ${k.body}`) }))
          .filter((k) => k.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
        const matchedR = reports
          .map((r) => ({ ...r, score: scoreMatch(kws, `${r.title} ${r.type} ${r.description}`) }))
          .filter((r) => r.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
        const hasK = matchedK.length > 0;
        const hasR = matchedR.length > 0;
        const cls = hasK && hasR
          ? "FULLY_BACKED"
          : hasK
          ? "KB_ONLY"
          : hasR
          ? "REPORT_ONLY"
          : "DARK";
        return { ...j, cls, matchedK, matchedR };
      });

      built.sort((a, b) => CLASS_ORDER.indexOf(a.cls) - CLASS_ORDER.indexOf(b.cls));

      const fully = built.filter((r) => r.cls === "FULLY_BACKED").length;
      const dark  = built.filter((r) => r.cls === "DARK").length;
      setRows(built);
      setStats({ jobs: jobs.length, kb: articles.length, reports: reports.length, fully, dark });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:sjkrbak-toggle", toggle);
    return () => window.removeEventListener("jarvis:sjkrbak-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = await buildSjkrbakScript();
      const base = apiBase();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const text = (d.answer || script).replace(/<<ACTION:[^>]*>>/g, "").trim();
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text }),
      });
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } finally {
      setAssessing(false);
    }
  }, []);

  const visible = rows.filter((r) => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const clsColour = (cls) => {
    if (cls === "FULLY_BACKED")  return GREEN;
    if (cls === "KB_ONLY")       return AMBER;
    if (cls === "REPORT_ONLY")   return CY;
    return RED;
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 114,
          background: "rgba(0,0,0,0.7)", border: "1px solid #29E7FF44",
          color: "#29E7FF", fontFamily: "monospace", fontSize: 10,
          padding: "3px 7px", cursor: "pointer", borderRadius: 3,
        }}
        title="SwarmJob × Knowledge × Report Intelligence Backing"
      >
        ◈ SJKRBAK
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 114,
      background: "rgba(0,0,0,0.92)", display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: "#e0e0e0",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid #29E7FF22" }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 13 }}>◈ SWARM JOB × KNOWLEDGE × REPORT — INTELLIGENCE BACKING</span>
        <button onClick={assess} disabled={assessing} style={btnStyle(GREEN)}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#888" }}>{loading ? "↻ loading…" : "90 s refresh"}</span>
        <button onClick={() => setOpen(false)} style={btnStyle("#555")}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 16px", flexWrap: "wrap" }}>
        {[
          ["JOBS",         stats.jobs,    "#888"],
          ["KB ARTICLES",  stats.kb,      AMBER],
          ["REPORTS",      stats.reports, CY],
          ["FULLY BACKED", stats.fully,   GREEN],
          ["DARK",         stats.dark,    RED],
        ].map(([label, val, col]) => (
          <div key={label} style={{ background: "#111", border: `1px solid ${col}44`, borderRadius: 4, padding: "6px 14px", minWidth: 90, textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>{label}</div>
            {label === "DARK" && val > 0 && (
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: RED, margin: "4px auto 0", animation: "jarvis-pulse 1.2s infinite" }} />
            )}
          </div>
        ))}
      </div>

      {/* filter tabs + search */}
      <div style={{ display: "flex", gap: 6, padding: "0 16px 8px", flexWrap: "wrap", alignItems: "center" }}>
        {["ALL", "FULLY_BACKED", "KB_ONLY", "REPORT_ONLY", "DARK"].map((t) => (
          <button key={t} onClick={() => setTab(t)} style={tabStyle(tab === t)}>
            {t.replace("_", " ")}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search jobs…"
          style={{ marginLeft: "auto", background: "#111", border: "1px solid #444", color: "#ddd", padding: "4px 8px", borderRadius: 3, fontSize: 11, fontFamily: "monospace", width: 200 }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
        {visible.length === 0 && (
          <div style={{ color: "#555", textAlign: "center", marginTop: 40, fontSize: 12 }}>
            {loading ? "Loading swarm jobs…" : "No jobs match."}
          </div>
        )}
        {visible.map((row) => (
          <div key={row.id} style={{ marginBottom: 6, background: "#0a0a0a", border: `1px solid ${clsColour(row.cls)}33`, borderRadius: 4 }}>
            <div
              onClick={() => setExpanded(expanded === row.id ? null : row.id)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", cursor: "pointer" }}
            >
              <span style={{ fontSize: 10, fontWeight: 700, color: clsColour(row.cls), minWidth: 100 }}>
                {row.cls.replace("_", " ")}
              </span>
              <span style={{ flex: 1, fontSize: 11, color: "#ddd", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.name}
              </span>
              <span style={{ fontSize: 9, color: "#888", marginRight: 4 }}>{row.type}</span>
              <span style={{ fontSize: 9, color: "#666" }}>
                {row.matchedK.length}KB · {row.matchedR.length}RPT
              </span>
              <span style={{ color: "#555", fontSize: 11 }}>{expanded === row.id ? "▲" : "▼"}</span>
            </div>

            {expanded === row.id && (
              <div style={{ padding: "0 10px 10px", borderTop: "1px solid #1a1a1a" }}>
                {row.description && (
                  <p style={{ fontSize: 10, color: "#888", margin: "6px 0 8px" }}>{row.description}</p>
                )}

                {row.matchedK.length > 0 && (
                  <>
                    <div style={{ fontSize: 9, color: AMBER, marginBottom: 4 }}>KB ARTICLES ({row.matchedK.length})</div>
                    {row.matchedK.map((k) => (
                      <div key={k.id} style={{ marginBottom: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#ccc" }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "80%" }}>{k.title}</span>
                          <span style={{ color: AMBER }}>{k.score}%</span>
                        </div>
                        <div style={{ height: 3, background: "#111", borderRadius: 2, marginTop: 2 }}>
                          <div style={{ height: "100%", width: `${k.score}%`, background: AMBER, borderRadius: 2 }} />
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {row.matchedR.length > 0 && (
                  <>
                    <div style={{ fontSize: 9, color: CY, marginBottom: 4, marginTop: 8 }}>REPORTS ({row.matchedR.length})</div>
                    {row.matchedR.map((r) => (
                      <div key={r.id} style={{ marginBottom: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#ccc" }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "80%" }}>
                            {r.title}{r.type ? ` [${r.type}]` : ""}
                          </span>
                          <span style={{ color: CY }}>{r.score}%</span>
                        </div>
                        <div style={{ height: 3, background: "#111", borderRadius: 2, marginTop: 2 }}>
                          <div style={{ height: "100%", width: `${r.score}%`, background: CY, borderRadius: 2 }} />
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {row.matchedK.length === 0 && row.matchedR.length === 0 && (
                  <div style={{ fontSize: 10, color: RED, marginTop: 6 }}>
                    ⚠ No KB article or report found — automation black box.
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function btnStyle(col) {
  return {
    background: "transparent", border: `1px solid ${col}`, color: col,
    fontFamily: "monospace", fontSize: 10, padding: "3px 8px",
    cursor: "pointer", borderRadius: 3,
  };
}

function tabStyle(active) {
  return {
    background: active ? "#29E7FF22" : "transparent",
    border: `1px solid ${active ? "#29E7FF" : "#333"}`,
    color: active ? "#29E7FF" : "#888",
    fontFamily: "monospace", fontSize: 10, padding: "3px 7px",
    cursor: "pointer", borderRadius: 3,
  };
}
