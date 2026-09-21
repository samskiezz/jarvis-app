/**
 * F758 — Intel Profile × Dataset × Report Triple Nexus (IPDRPT)
 * Endpoints: /entities/IntelProfile  ×  /v1/datasets  ×  /v1/reports
 * Classification: FULLY_COVERED | DATASET_ONLY | REPORT_ONLY | DARK
 *
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useState, useEffect, useCallback, useRef } from "react";

const CY  = "#29E7FF";
const AM  = "#FFB347";
const GN  = "#39FF14";
const RD  = "#FF4444";
const DIM = "#8899AA";

const BTN_LEFT = 922_940;
const POLL_MS  = 90_000;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const IPDRPT_RE =
  /\b(ipdrpt|intel\s+profile\s+dataset|profile\s+coverage|threat\s+actor\s+dataset|intel\s+profile\s+report|profile\s+documentation|subject\s+dataset|tracked\s+subject\s+report|profile\s+data\s+coverage|intel\s+data\s+report)\b/i;

export function isIpdrptQuery(t) {
  return IPDRPT_RE.test(t || "");
}

function apiBase() {
  return (
    (typeof window !== "undefined" && window.__JARVIS_API_BASE__) ||
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE) ||
    ""
  );
}

function normaliseProfiles(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.profiles))  return raw.profiles;
  if (raw && Array.isArray(raw.data))      return raw.data;
  if (raw && Array.isArray(raw.items))     return raw.items;
  return [];
}

function normaliseDatasets(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.datasets))  return raw.datasets;
  if (raw && Array.isArray(raw.data))      return raw.data;
  if (raw && Array.isArray(raw.items))     return raw.items;
  return [];
}

function normaliseReports(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.reports))   return raw.reports;
  if (raw && Array.isArray(raw.data))      return raw.data;
  if (raw && Array.isArray(raw.items))     return raw.items;
  return [];
}

function keywords(obj) {
  return [
    obj.name, obj.title, obj.description, obj.label,
    obj.type, obj.category, obj.kind, obj.summary,
    obj.tags, obj.topic, obj.domain, obj.content,
    obj.alias, obj.subject, obj.entity_type,
    obj.threat_level, obj.organization, obj.role,
  ]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function scoreMatch(aKw, bKw) {
  if (!aKw || !bKw) return 0;
  return aKw.split(/\s+/).filter(w => w.length > 3 && bKw.includes(w)).length;
}

function buildNexus(profiles, datasets, reports) {
  return profiles.map(profile => {
    const pKw = keywords(profile);

    const bestDataset = datasets.reduce(
      (best, ds) => {
        const s = scoreMatch(pKw, keywords(ds));
        return s > best.score ? { score: s, ds } : best;
      },
      { score: 0, ds: null },
    );

    const bestReport = reports.reduce(
      (best, rep) => {
        const s = scoreMatch(pKw, keywords(rep));
        return s > best.score ? { score: s, rep } : best;
      },
      { score: 0, rep: null },
    );

    const hasDataset = bestDataset.score > 0;
    const hasReport  = bestReport.score  > 0;

    const classification =
      hasDataset && hasReport ? "FULLY_COVERED"
      : hasDataset            ? "DATASET_ONLY"
      : hasReport             ? "REPORT_ONLY"
      :                         "DARK";

    return {
      profile,
      classification,
      bestDataset:   bestDataset.ds,
      datasetScore:  bestDataset.score,
      bestReport:    bestReport.rep,
      reportScore:   bestReport.score,
    };
  });
}

export async function buildIpdrptScript() {
  const base = apiBase();
  try {
    const [profR, dsR, repR] = await Promise.all([
      fetch(`${base}/entities/IntelProfile`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/v1/datasets`,           { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/v1/reports`,            { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const profiles  = normaliseProfiles(await profR.json());
    const datasets  = normaliseDatasets(await dsR.json());
    const reports   = normaliseReports(await repR.json());
    const nexus     = buildNexus(profiles, datasets, reports);
    const covered   = nexus.filter(r => r.classification === "FULLY_COVERED").length;
    const dark      = nexus.filter(r => r.classification === "DARK").length;
    const pct       = profiles.length ? Math.round((covered / profiles.length) * 100) : 0;

    const brief = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `Intel Profile × Dataset × Report coverage: ${profiles.length} tracked intel profiles analysed against ${datasets.length} datasets and ${reports.length} reports. ${covered} profiles are fully covered (both dataset and report match), ${dark} are dark (no data or report backing). Coverage ${pct}%. Summarise intelligence coverage posture in 2 sentences.`,
      }),
    });
    const bd = await brief.json();
    return (bd.answer || "").trim() ||
      `${profiles.length} intel profiles analysed. ${covered} fully covered (dataset + report), ${dark} dark — no data or documentation backing detected.`;
  } catch (e) {
    return `IPDRPT fetch error: ${e.message}`;
  }
}

const TABS = ["ALL", "FULLY_COVERED", "DATASET_ONLY", "REPORT_ONLY", "DARK"];

const BADGE_COLOR = {
  FULLY_COVERED: GN,
  DATASET_ONLY:  CY,
  REPORT_ONLY:   AM,
  DARK:          RD,
};

const THREAT_COLOR = {
  CRITICAL: RD,
  HIGH:     AM,
  MEDIUM:   CY,
  LOW:      GN,
};

export default function IntelProfileDatasetReportTriple() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [badgeDark, setBadgeDark] = useState(0);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const base = apiBase();
    try {
      const [profR, dsR, repR] = await Promise.all([
        fetch(`${base}/entities/IntelProfile`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/v1/datasets`,           { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/v1/reports`,            { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const profiles = normaliseProfiles(await profR.json());
      const datasets = normaliseDatasets(await dsR.json());
      const reports  = normaliseReports(await repR.json());
      const nexus    = buildNexus(profiles, datasets, reports);
      setRows(nexus);
      setBadgeDark(nexus.filter(r => r.classification === "DARK").length);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(v => {
      if (!v) load();
      return !v;
    });
    window.addEventListener("jarvis:ipdrpt-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ipdrpt-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = rows.filter(r => {
    const matchTab  = tab === "ALL" || r.classification === tab;
    const matchSrch = !search ||
      keywords(r.profile).includes(search.toLowerCase()) ||
      (r.bestDataset && keywords(r.bestDataset).includes(search.toLowerCase())) ||
      (r.bestReport  && keywords(r.bestReport).includes(search.toLowerCase()));
    return matchTab && matchSrch;
  });

  const counts = {
    total:         rows.length,
    FULLY_COVERED: rows.filter(r => r.classification === "FULLY_COVERED").length,
    DATASET_ONLY:  rows.filter(r => r.classification === "DATASET_ONLY").length,
    REPORT_ONLY:   rows.filter(r => r.classification === "REPORT_ONLY").length,
    DARK:          rows.filter(r => r.classification === "DARK").length,
  };
  const pct = counts.total ? Math.round((counts.FULLY_COVERED / counts.total) * 100) : 0;

  const panel = open ? (
    <div style={{
      position: "fixed", left: BTN_LEFT, bottom: 56, zIndex: 617,
      width: "min(680px,92vw)", maxHeight: "70vh",
      background: "rgba(6,11,19,0.93)", border: `1px solid ${CY}55`,
      borderRadius: 14, padding: "14px 16px",
      backdropFilter: "blur(12px)", boxShadow: `0 0 60px ${CY}18`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>
          ◈ IPDRPT — INTEL PROFILE × DATASET × REPORT
        </span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: DIM }}>
          {loading ? "loading…" : `${counts.total} profiles · ${pct}% covered`}
        </span>
        <button onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          ["PROFILES",      counts.total,         CY],
          ["FULLY COV.",    counts.FULLY_COVERED,  GN],
          ["DATASET ONLY",  counts.DATASET_ONLY,   CY],
          ["REPORT ONLY",   counts.REPORT_ONLY,    AM],
          ["DARK",          counts.DARK,            RD],
          ["COVERAGE",      `${pct}%`,              pct >= 60 ? GN : pct >= 30 ? AM : RD],
        ].map(([lbl, val, col]) => (
          <div key={lbl} style={{
            background: "rgba(0,0,0,0.4)", border: `1px solid ${col}44`,
            borderRadius: 8, padding: "6px 12px", textAlign: "center", minWidth: 80,
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 9, color: DIM, letterSpacing: 1 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              background: tab === t ? `${CY}22` : "transparent",
              border: `1px solid ${tab === t ? CY : DIM + "55"}`,
              borderRadius: 6, padding: "3px 10px", cursor: "pointer",
              color: tab === t ? CY : DIM, fontSize: 10, letterSpacing: 1,
            }}>{t}</button>
        ))}
      </div>

      {/* search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search intel profiles / datasets / reports…"
        style={{
          background: "rgba(0,0,0,0.4)", border: `1px solid ${CY}33`,
          borderRadius: 8, padding: "6px 12px", color: "#DCEBF5",
          fontFamily: "inherit", fontSize: 11, outline: "none",
        }}
      />

      {/* rows */}
      <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        {visible.slice(0, 80).map((r, i) => {
          const isExp     = expanded === i;
          const col       = BADGE_COLOR[r.classification];
          const name      = r.profile.name || r.profile.title || r.profile.label || `Profile ${i + 1}`;
          const threat    = r.profile.threat_level || r.profile.threatLevel || r.profile.severity;
          const threatCol = (threat && THREAT_COLOR[threat.toUpperCase()]) || DIM;
          return (
            <div key={i}
              onClick={() => setExpanded(isExp ? null : i)}
              style={{
                background: isExp ? "rgba(41,231,255,0.06)" : "rgba(0,0,0,0.3)",
                border: `1px solid ${col}33`,
                borderRadius: 8, padding: "7px 12px", cursor: "pointer",
                transition: "background 0.15s",
              }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "#DCEBF5", flex: 1 }}>{name}</span>
                {threat && (
                  <span style={{
                    fontSize: 9, background: `${threatCol}22`, border: `1px solid ${threatCol}44`,
                    borderRadius: 4, padding: "1px 6px", color: threatCol, letterSpacing: 1,
                  }}>{threat.toUpperCase()}</span>
                )}
                <span style={{
                  fontSize: 9, background: `${col}22`, border: `1px solid ${col}55`,
                  borderRadius: 4, padding: "1px 6px", color: col, letterSpacing: 1,
                }}>{r.classification}</span>
              </div>
              {isExp && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                  {r.bestDataset ? (
                    <div style={{ fontSize: 10, color: CY }}>
                      <b style={{ color: CY }}>Dataset:</b>{" "}
                      {r.bestDataset.name || r.bestDataset.title || "dataset"}{" "}
                      <span style={{ color: DIM }}>
                        (kind: {r.bestDataset.kind || r.bestDataset.type || "—"}, hits: {r.datasetScore})
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: DIM }}>No matching dataset found.</div>
                  )}
                  {r.bestReport ? (
                    <div style={{ fontSize: 10, color: AM }}>
                      <b style={{ color: AM }}>Report:</b>{" "}
                      {r.bestReport.title || r.bestReport.name || "report"}{" "}
                      <span style={{ color: DIM }}>
                        (type: {r.bestReport.type || r.bestReport.kind || "—"}, hits: {r.reportScore})
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: DIM }}>No matching report found.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {visible.length === 0 && !loading && (
          <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
            No intel profiles match current filter.
          </div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      {panel}
      <button
        onClick={() => { setOpen(v => { if (!v) load(); return !v; }); }}
        title="Intel Profile × Dataset × Report Triple Nexus (IPDRPT)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 617,
          background: open ? `${CY}22` : "rgba(5,8,13,0.7)",
          border: `1px solid ${open ? CY : CY + "55"}`,
          borderRadius: 8, cursor: "pointer",
          color: open ? CY : CY + "AA",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1, padding: "4px 8px",
          boxShadow: open ? `0 0 18px ${CY}44` : "none",
          backdropFilter: "blur(6px)",
          whiteSpace: "nowrap",
        }}>
        ◈ IPDRPT
        {badgeDark > 0 && (
          <span style={{
            marginLeft: 4, background: AM, color: "#04060A",
            borderRadius: 4, fontSize: 8, padding: "1px 4px", fontWeight: 700,
          }}>{badgeDark}</span>
        )}
      </button>
    </>
  );
}
