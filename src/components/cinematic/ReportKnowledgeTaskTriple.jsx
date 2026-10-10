import { useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const AM = "#FFB300";
const RD = "#FF4444";
const GR = "#44FF88";
const LM = "#CCFF44";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_KEY) ||
  "dev-key";

const RKTRI_RE =
  /\b(rktri|report[._-]?knowledge[._-]?task|knowledge[._-]?task[._-]?report|report[._-]?task[._-]?knowledge|operationalised[._-]?report|archival[._-]?report|report[._-]?triple|report[._-]?kb[._-]?task|kb[._-]?task[._-]?report|report[._-]?task[._-]?kb|task[._-]?backed[._-]?report|knowledge[._-]?backed[._-]?report|report[._-]?operationalise|intel[._-]?report[._-]?task)\b/i;

export function isRktriQuery(t) {
  return RKTRI_RE.test(t || "");
}

function tok(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter((w) => w.length > 2);
}

function overlap(a, b) {
  const sa = new Set(tok(a));
  const sb = new Set(tok(b));
  let hits = 0;
  for (const w of sa) if (sb.has(w)) hits++;
  return sa.size ? hits / sa.size : 0;
}

function reportHaystack(r) {
  return [
    r.name, r.title, r.summary, r.type, r.category, r.description,
    ...(r.tags || []),
  ].join(" ");
}

function kbNeedle(k) {
  return [k.name, k.title, k.summary, k.category, k.description, ...(k.tags || [])].join(" ");
}

function taskNeedle(t) {
  return [t.name, t.title, t.description, t.mission, t.priority, t.type, ...(t.tags || [])].join(" ");
}

function normaliseReports(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ["reports", "items", "results", "data", "records"]) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseKb(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ["articles", "items", "results", "data", "records", "knowledge"]) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseTasks(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ["tasks", "items", "results", "data", "records"]) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function bestScore(report, items, needleFn) {
  const hay = reportHaystack(report);
  let best = 0;
  for (const it of items) {
    const s = overlap(hay, needleFn(it));
    if (s > best) best = s;
  }
  return best;
}

export async function buildRktriScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [rr, kr, tr] = await Promise.allSettled([
      fetch(`${base}/v1/reports`, { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/knowledge/`, { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/entities/Task`, { headers: hdr }).then((r) => r.json()),
    ]);
    const reports = normaliseReports(rr.status === "fulfilled" ? rr.value : []).slice(0, 100);
    const kb = normaliseKb(kr.status === "fulfilled" ? kr.value : []).slice(0, 200);
    const tasks = normaliseTasks(tr.status === "fulfilled" ? tr.value : []).slice(0, 200);

    let fullyOp = 0, documented = 0, tasked = 0, archival = 0;
    for (const rep of reports) {
      const hasKb = bestScore(rep, kb, kbNeedle) > 0.15;
      const hasTask = bestScore(rep, tasks, taskNeedle) > 0.15;
      if (hasKb && hasTask) fullyOp++;
      else if (hasKb) documented++;
      else if (hasTask) tasked++;
      else archival++;
    }
    const total = reports.length;
    return (
      `Report knowledge-task coverage: ${total} reports assessed — ` +
      `${fullyOp} FULLY OPERATIONALISED (KB article + active task), ` +
      `${documented} DOCUMENTED (KB coverage, no active task), ` +
      `${tasked} TASKED (task found, no KB backing), ` +
      `${archival} ARCHIVAL (no KB or task backing — intelligence sitting idle). ` +
      `${archival > 0 ? `${archival} report${archival > 1 ? "s have" : " has"} no knowledge base or task coverage — recommend operationalising priority intelligence.` : "All reports have KB or task backing."}`
    );
  } catch {
    return "Report knowledge-task coverage assessment unavailable.";
  }
}

const ScoreBar = ({ sc, color }) => (
  <div style={{ background: "#111", borderRadius: 2, height: 3, width: "100%", overflow: "hidden" }}>
    <div style={{ width: `${Math.round(sc * 100)}%`, background: color, height: "100%", transition: "width .3s" }} />
  </div>
);

const chip = (label, color = CY) => (
  <span
    style={{
      display: "inline-block",
      padding: "1px 6px",
      border: `1px solid ${color}`,
      borderRadius: 3,
      color,
      fontSize: 9,
      letterSpacing: 1,
      marginRight: 4,
    }}
  >
    {label}
  </span>
);

const TABS = ["ALL", "FULLY OPERATIONALISED", "DOCUMENTED", "TASKED", "ARCHIVAL"];

export default function ReportKnowledgeTaskTriple() {
  const [open, setOpen] = useState(false);
  const [reports, setReports] = useState([]);
  const [kb, setKb] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");
  const [err, setErr] = useState("");
  const timerRef = useRef(null);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [rr, kr, tr] = await Promise.allSettled([
        fetch(`${base}/v1/reports`, { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/knowledge/`, { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/entities/Task`, { headers: hdr }).then((r) => r.json()),
      ]);
      setReports(normaliseReports(rr.status === "fulfilled" ? rr.value : []).slice(0, 100));
      setKb(normaliseKb(kr.status === "fulfilled" ? kr.value : []).slice(0, 200));
      setTasks(normaliseTasks(tr.status === "fulfilled" ? tr.value : []).slice(0, 200));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    function onToggle() {
      setOpen((o) => {
        if (!o) load();
        return !o;
      });
    }
    window.addEventListener("jarvis:rktri-toggle", onToggle);
    return () => window.removeEventListener("jarvis:rktri-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open]);

  function classify(rep) {
    const hasKb = bestScore(rep, kb, kbNeedle) > 0.15;
    const hasTask = bestScore(rep, tasks, taskNeedle) > 0.15;
    if (hasKb && hasTask) return "FULLY OPERATIONALISED";
    if (hasKb) return "DOCUMENTED";
    if (hasTask) return "TASKED";
    return "ARCHIVAL";
  }

  function matchedKb(rep) {
    const hay = reportHaystack(rep);
    return kb
      .map((k) => ({ k, sc: overlap(hay, kbNeedle(k)) }))
      .filter((x) => x.sc > 0.05)
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 6);
  }

  function matchedTasks(rep) {
    const hay = reportHaystack(rep);
    return tasks
      .map((t) => ({ t, sc: overlap(hay, taskNeedle(t)) }))
      .filter((x) => x.sc > 0.05)
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 6);
  }

  const enriched = reports.map((rep) => ({ ...rep, _class: classify(rep) }));

  const fullyOpCount = enriched.filter((r) => r._class === "FULLY OPERATIONALISED").length;
  const documentedCount = enriched.filter((r) => r._class === "DOCUMENTED").length;
  const taskedCount = enriched.filter((r) => r._class === "TASKED").length;
  const archivalCount = enriched.filter((r) => r._class === "ARCHIVAL").length;

  const filtered = enriched.filter((rep) => {
    if (tab !== "ALL" && rep._class !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (rep.name || "").toLowerCase().includes(q) ||
        (rep.title || "").toLowerCase().includes(q) ||
        (rep.type || "").toLowerCase().includes(q) ||
        (rep.category || "").toLowerCase().includes(q) ||
        (rep.summary || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    setAssessText("");
    try {
      const script = await buildRktriScript();
      const base = apiBase();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const answer = (d.answer || script).replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessText(answer);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch {
      setAssessText(await buildRktriScript());
    } finally {
      setAssessing(false);
    }
  }

  function classColor(cl) {
    if (cl === "FULLY OPERATIONALISED") return GR;
    if (cl === "DOCUMENTED") return CY;
    if (cl === "TASKED") return LM;
    return AM;
  }

  const mono = { fontFamily: "'JetBrains Mono',monospace" };

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Report × Knowledge × Task Triple Coverage (RKTRI)"
        style={{
          position: "fixed",
          left: 745680,
          bottom: 8,
          zIndex: 360,
          background: "rgba(0,0,0,0.85)",
          border: `1px solid ${AM}`,
          borderRadius: 4,
          color: AM,
          fontSize: 9,
          padding: "3px 7px",
          cursor: "pointer",
          letterSpacing: 1,
          ...mono,
        }}
      >
        ◈ RKTRI
        {archivalCount > 0 && (
          <span
            style={{
              marginLeft: 4,
              background: AM,
              color: "#000",
              borderRadius: 3,
              padding: "0 4px",
              fontSize: 8,
            }}
          >
            {archivalCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        top: 16,
        width: 720,
        maxHeight: 640,
        background: "rgba(0,0,0,0.96)",
        border: `1px solid ${AM}`,
        borderRadius: 6,
        zIndex: 9600,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        ...mono,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "8px 12px",
          borderBottom: `1px solid ${AM}22`,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ color: AM, fontSize: 10, letterSpacing: 2, flex: 1 }}>
          ◈ REPORT × KNOWLEDGE × TASK — TRIPLE COVERAGE
        </span>
        {loading && <span style={{ color: AM, fontSize: 9 }}>LOADING…</span>}
        <button
          onClick={load}
          style={{ background: "none", border: `1px solid ${AM}44`, color: AM, fontSize: 9, padding: "2px 6px", cursor: "pointer", borderRadius: 3 }}
        >
          ↺
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: "#888", fontSize: 12, cursor: "pointer" }}
        >
          ✕
        </button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${AM}22` }}>
        {[
          ["REPORTS", reports.length, CY],
          ["KB ARTICLES", kb.length, LM],
          ["TASKS", tasks.length, GR],
          ["FULLY OP", fullyOpCount, GR],
          ["ARCHIVAL", archivalCount, AM],
        ].map(([label, val, color]) => (
          <div
            key={label}
            style={{
              flex: 1,
              background: "#0a0a0a",
              border: `1px solid ${color}44`,
              borderRadius: 4,
              padding: "4px 6px",
              textAlign: "center",
            }}
          >
            <div style={{ color, fontSize: 14 }}>{val}</div>
            <div style={{ color: "#666", fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {reports.length > 0 && (
        <div style={{ padding: "4px 12px", borderBottom: `1px solid ${AM}22`, display: "flex", gap: 2, height: 6 }}>
          {[
            [fullyOpCount, GR],
            [documentedCount, CY],
            [taskedCount, LM],
            [archivalCount, AM],
          ].map(([cnt, color], i) => (
            <div
              key={i}
              style={{
                width: `${(cnt / reports.length) * 100}%`,
                background: color,
                height: "100%",
                transition: "width .3s",
                borderRadius: 1,
              }}
            />
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, padding: "6px 12px", borderBottom: `1px solid ${AM}22`, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? `${AM}22` : "none",
              border: `1px solid ${tab === t ? AM : "#333"}`,
              color: tab === t ? AM : "#666",
              fontSize: 8,
              padding: "2px 6px",
              cursor: "pointer",
              borderRadius: 3,
              letterSpacing: 1,
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="SEARCH REPORTS…"
          style={{
            marginLeft: "auto",
            background: "#111",
            border: `1px solid ${AM}44`,
            color: AM,
            fontSize: 9,
            padding: "2px 6px",
            borderRadius: 3,
            outline: "none",
            width: 160,
          }}
        />
      </div>

      {/* Report list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 12px" }}>
        {err && <div style={{ color: RD, fontSize: 9, padding: 8 }}>{err}</div>}
        {filtered.length === 0 && !loading && (
          <div style={{ color: "#555", fontSize: 9, padding: 12, textAlign: "center" }}>NO REPORTS MATCH</div>
        )}
        {filtered.map((rep, i) => {
          const cls = rep._class;
          const color = classColor(cls);
          const isExp = expanded === i;
          const mKb = isExp ? matchedKb(rep) : [];
          const mTasks = isExp ? matchedTasks(rep) : [];
          return (
            <div key={i} style={{ borderBottom: `1px solid ${AM}11`, padding: "5px 0" }}>
              <div
                style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                onClick={() => setExpanded(isExp ? null : i)}
              >
                <span style={{ color: "#444", fontSize: 9, width: 24, flexShrink: 0 }}>
                  {isExp ? "▼" : "▶"}
                </span>
                <span style={{ color: "#ccc", fontSize: 10, flex: 1 }}>
                  {rep.name || rep.title || `Report ${i + 1}`}
                </span>
                {rep.type && (
                  <span style={{ color: CY, fontSize: 9 }}>{rep.type}</span>
                )}
                {chip(cls, color)}
                {rep.category && (
                  <span style={{ color: "#555", fontSize: 9 }}>{rep.category}</span>
                )}
              </div>
              {isExp && (
                <div style={{ display: "flex", gap: 8, marginTop: 8, paddingLeft: 30 }}>
                  {/* Matched KB articles */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: CY, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>
                      KB ARTICLES
                    </div>
                    {mKb.length === 0 ? (
                      <div style={{ color: "#444", fontSize: 9 }}>no KB articles matched</div>
                    ) : (
                      mKb.map(({ k, sc }, j) => (
                        <div key={j} style={{ marginBottom: 6 }}>
                          <div style={{ color: "#ccc", fontSize: 9, marginBottom: 2 }}>
                            {k.name || k.title || k.id || `Article ${j + 1}`}
                          </div>
                          <div style={{ display: "flex", gap: 4, marginBottom: 2 }}>
                            {k.category && chip(k.category.toUpperCase(), CY)}
                          </div>
                          <ScoreBar sc={sc} color={CY} />
                        </div>
                      ))
                    )}
                  </div>
                  {/* Matched tasks */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: GR, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>
                      ACTIVE TASKS
                    </div>
                    {mTasks.length === 0 ? (
                      <div style={{ color: "#444", fontSize: 9 }}>no tasks matched</div>
                    ) : (
                      mTasks.map(({ t, sc }, j) => (
                        <div key={j} style={{ marginBottom: 6 }}>
                          <div style={{ color: "#ccc", fontSize: 9, marginBottom: 2 }}>
                            {t.name || t.title || t.id || `Task ${j + 1}`}
                          </div>
                          <div style={{ display: "flex", gap: 4, marginBottom: 2 }}>
                            {t.status && chip(t.status.toUpperCase(), LM)}
                            {t.priority && chip(t.priority.toUpperCase(), AM)}
                          </div>
                          <ScoreBar sc={sc} color={GR} />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assess */}
      <div style={{ padding: "8px 12px", borderTop: `1px solid ${AM}22` }}>
        {assessText && (
          <div style={{ color: "#aaa", fontSize: 9, marginBottom: 6, lineHeight: 1.5 }}>
            {assessText}
          </div>
        )}
        <button
          onClick={assess}
          disabled={assessing || loading}
          style={{
            background: `${AM}22`,
            border: `1px solid ${AM}`,
            color: AM,
            fontSize: 9,
            padding: "4px 12px",
            cursor: assessing ? "wait" : "pointer",
            borderRadius: 3,
            letterSpacing: 1,
          }}
        >
          {assessing ? "ASSESSING…" : "▶ ASSESS REPORT KNOWLEDGE + TASK COVERAGE"}
        </button>
      </div>
    </div>
  );
}
