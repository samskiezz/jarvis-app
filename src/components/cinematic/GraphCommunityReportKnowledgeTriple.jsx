import { useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const AM = "#FFB300";
const TE = "#2DD4BF";
const RD = "#FF4444";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_KEY) ||
  "dev-key";

const GCRKTRI_RE =
  /\b(gcrktri|community[._-]?report[._-]?knowledge|community[._-]?knowledge[._-]?report|community[._-]?report[._-]?kb|community[._-]?kb[._-]?report|documented[._-]?community|dark[._-]?community[._-]?knowledge|community[._-]?intel[._-]?knowledge|community[._-]?knowledge[._-]?intel|graph[._-]?community[._-]?report[._-]?kb|community[._-]?knowledge[._-]?triple|community[._-]?report[._-]?triple|community[._-]?intel[._-]?docs)\b/i;

export function isGcrktriQuery(t) {
  return GCRKTRI_RE.test(t || "");
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

function communityHaystack(c) {
  return [c.label, c.summary, ...(c.members || [])].join(" ");
}

function reportNeedle(r) {
  return [r.title, r.name, r.summary, r.type, r.category, ...(r.tags || [])].join(" ");
}

function kbNeedle(a) {
  return [a.title, a.name, a.category, a.summary, ...(a.tags || [])].join(" ");
}

function bestScore(community, items, needleFn) {
  const hay = communityHaystack(community);
  let best = 0;
  for (const it of items) {
    const s = overlap(hay, needleFn(it));
    if (s > best) best = s;
  }
  return best;
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

export async function buildGcrktriScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [cr, rr, kr] = await Promise.allSettled([
      fetch(`${base}/v1/graph/communities`, { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/v1/reports`, { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/knowledge/`, { headers: hdr }).then((r) => r.json()),
    ]);
    const communities = (cr.status === "fulfilled" ? cr.value?.communities || cr.value || [] : []).slice(0, 80);
    const reports = normaliseReports(rr.status === "fulfilled" ? rr.value : []).slice(0, 200);
    const kb = normaliseKb(kr.status === "fulfilled" ? kr.value : []).slice(0, 200);

    let fullyDoc = 0, reportOnly = 0, kbOnly = 0, dark = 0;
    for (const c of communities) {
      const hasReport = bestScore(c, reports, reportNeedle) > 0.15;
      const hasKb = bestScore(c, kb, kbNeedle) > 0.15;
      if (hasReport && hasKb) fullyDoc++;
      else if (hasReport) reportOnly++;
      else if (hasKb) kbOnly++;
      else dark++;
    }
    const total = communities.length;
    return (
      `Graph community intelligence coverage: ${total} clusters assessed — ` +
      `${fullyDoc} FULLY DOCUMENTED (report + KB backing), ` +
      `${reportOnly} REPORT-ONLY, ${kbOnly} KB-ONLY, ${dark} DARK (no report or KB coverage). ` +
      `${dark > 0 ? `${dark} cluster${dark > 1 ? "s" : ""} lack any intelligence or knowledge backing — recommend sourcing review.` : "All communities have at least some intelligence coverage."}`
    );
  } catch {
    return "Community report/knowledge coverage assessment unavailable.";
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

const TABS = ["ALL", "FULLY DOCUMENTED", "REPORT-ONLY", "KB-ONLY", "DARK"];

export default function GraphCommunityReportKnowledgeTriple() {
  const [open, setOpen] = useState(false);
  const [communities, setCommunities] = useState([]);
  const [reports, setReports] = useState([]);
  const [kb, setKb] = useState([]);
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
      const [cr, rr, kr] = await Promise.allSettled([
        fetch(`${base}/v1/graph/communities`, { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/v1/reports`, { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/knowledge/`, { headers: hdr }).then((r) => r.json()),
      ]);
      setCommunities(
        (cr.status === "fulfilled" ? cr.value?.communities || cr.value || [] : []).slice(0, 80)
      );
      setReports(
        normaliseReports(rr.status === "fulfilled" ? rr.value : []).slice(0, 200)
      );
      setKb(
        normaliseKb(kr.status === "fulfilled" ? kr.value : []).slice(0, 200)
      );
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
    window.addEventListener("jarvis:gcrktri-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gcrktri-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open]);

  function classify(c) {
    const hasReport = bestScore(c, reports, reportNeedle) > 0.15;
    const hasKb = bestScore(c, kb, kbNeedle) > 0.15;
    if (hasReport && hasKb) return "FULLY DOCUMENTED";
    if (hasReport) return "REPORT-ONLY";
    if (hasKb) return "KB-ONLY";
    return "DARK";
  }

  function matchedReports(c) {
    const hay = communityHaystack(c);
    return reports
      .map((r) => ({ r, sc: overlap(hay, reportNeedle(r)) }))
      .filter((x) => x.sc > 0.05)
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 6);
  }

  function matchedKb(c) {
    const hay = communityHaystack(c);
    return kb
      .map((a) => ({ a, sc: overlap(hay, kbNeedle(a)) }))
      .filter((x) => x.sc > 0.05)
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 6);
  }

  const enriched = communities.map((c) => ({ ...c, _class: classify(c) }));

  const fullyDocCount = enriched.filter((c) => c._class === "FULLY DOCUMENTED").length;
  const reportOnlyCount = enriched.filter((c) => c._class === "REPORT-ONLY").length;
  const kbOnlyCount = enriched.filter((c) => c._class === "KB-ONLY").length;
  const darkCount = enriched.filter((c) => c._class === "DARK").length;

  const filtered = enriched.filter((c) => {
    if (tab !== "ALL" && c._class !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (c.label || "").toLowerCase().includes(q) ||
        (c.summary || "").toLowerCase().includes(q) ||
        (c.members || []).some((m) => m.toLowerCase().includes(q))
      );
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    setAssessText("");
    try {
      const script = await buildGcrktriScript();
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
      setAssessText(await buildGcrktriScript());
    } finally {
      setAssessing(false);
    }
  }

  const classColor = (cl) => {
    if (cl === "FULLY DOCUMENTED") return CY;
    if (cl === "REPORT-ONLY") return AM;
    if (cl === "KB-ONLY") return TE;
    return RD;
  };

  const mono = { fontFamily: "'JetBrains Mono',monospace" };

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Graph Community × Report × Knowledge Triple (GCRKTRI)"
        style={{
          position: "fixed",
          left: 727760,
          bottom: 8,
          zIndex: 328,
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
        ◈ GCRKTRI
        {darkCount > 0 && (
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
            {darkCount}
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
          ◈ GRAPH COMMUNITY × REPORT × KNOWLEDGE — TRIPLE COVERAGE
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
          ["COMMUNITIES", communities.length, CY],
          ["REPORTS", reports.length, AM],
          ["KB ARTICLES", kb.length, TE],
          ["FULLY DOC.", fullyDocCount, CY],
          ["DARK", darkCount, RD],
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
      {communities.length > 0 && (
        <div style={{ padding: "4px 12px", borderBottom: `1px solid ${AM}22`, display: "flex", gap: 2, height: 6 }}>
          {[
            [fullyDocCount, CY],
            [reportOnlyCount, AM],
            [kbOnlyCount, TE],
            [darkCount, RD],
          ].map(([cnt, color], i) => (
            <div
              key={i}
              style={{
                width: `${(cnt / communities.length) * 100}%`,
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
          placeholder="SEARCH COMMUNITIES…"
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

      {/* Community list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 12px" }}>
        {err && <div style={{ color: RD, fontSize: 9, padding: 8 }}>{err}</div>}
        {filtered.length === 0 && !loading && (
          <div style={{ color: "#555", fontSize: 9, padding: 12, textAlign: "center" }}>NO COMMUNITIES MATCH</div>
        )}
        {filtered.map((c, i) => {
          const cls = c._class;
          const color = classColor(cls);
          const isExp = expanded === i;
          const mReports = isExp ? matchedReports(c) : [];
          const mKb = isExp ? matchedKb(c) : [];
          return (
            <div
              key={i}
              style={{ borderBottom: `1px solid ${AM}11`, padding: "5px 0" }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                onClick={() => setExpanded(isExp ? null : i)}
              >
                <span style={{ color: "#444", fontSize: 9, width: 24, flexShrink: 0 }}>
                  {isExp ? "▼" : "▶"}
                </span>
                <span style={{ color: "#ccc", fontSize: 10, flex: 1 }}>
                  {c.label || c.id || `Community ${i + 1}`}
                </span>
                {chip(cls, color)}
                {c.members?.length > 0 && (
                  <span style={{ color: "#555", fontSize: 9 }}>{c.members.length} nodes</span>
                )}
              </div>
              {isExp && (
                <div style={{ display: "flex", gap: 8, marginTop: 8, paddingLeft: 30 }}>
                  {/* Matched reports */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: AM, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>
                      INTELLIGENCE REPORTS
                    </div>
                    {mReports.length === 0 ? (
                      <div style={{ color: "#444", fontSize: 9 }}>no reports matched</div>
                    ) : (
                      mReports.map(({ r, sc }, j) => (
                        <div key={j} style={{ marginBottom: 6 }}>
                          <div style={{ color: "#ccc", fontSize: 9, marginBottom: 2 }}>
                            {r.title || r.name || r.id || `Report ${j + 1}`}
                          </div>
                          {r.type && chip(r.type.toUpperCase(), AM)}
                          <ScoreBar sc={sc} color={AM} />
                        </div>
                      ))
                    )}
                  </div>
                  {/* Matched KB articles */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: TE, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>
                      KB ARTICLES
                    </div>
                    {mKb.length === 0 ? (
                      <div style={{ color: "#444", fontSize: 9 }}>no KB articles matched</div>
                    ) : (
                      mKb.map(({ a, sc }, j) => (
                        <div key={j} style={{ marginBottom: 6 }}>
                          <div style={{ color: "#ccc", fontSize: 9, marginBottom: 2 }}>
                            {a.title || a.name || a.id || `Article ${j + 1}`}
                          </div>
                          {a.category && chip(a.category.toUpperCase(), TE)}
                          <ScoreBar sc={sc} color={TE} />
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
          {assessing ? "ASSESSING…" : "▶ ASSESS COMMUNITY INTELLIGENCE COVERAGE"}
        </button>
      </div>
    </div>
  );
}
