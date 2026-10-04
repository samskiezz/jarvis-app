/**
 * ContactKnowledgeReportCompleteness — F100 (CKRCOMP).
 *
 * Pulls /entities/Contact × /knowledge/ × /v1/reports and keyword-correlates
 * each contact against KB articles AND reports, classifying each as:
 *
 *   FULLY_PROFILED  — matched at least one KB article AND one report
 *   KB_ONLY         — matched a KB article but no report
 *   REPORT_ONLY     — matched a report but no KB article
 *   INCOMPLETE      — no KB or report backing (intelligence profile gap)
 *
 * Red pulse on INCOMPLETE count.
 *
 * Layout:
 *   • 5 stat tiles: CONTACTS / KB ARTS / REPORTS / FULLY PROFILED / INCOMPLETE
 *   • Coverage % bar
 *   • Filter tabs: ALL / FULLY_PROFILED / KB_ONLY / REPORT_ONLY / INCOMPLETE
 *   • Text search on contact name / role / org
 *   • Expandable rows → matched KB articles (amber) + reports (green)
 *   • ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle:  ◈ CKRCOMP at left:978540, bottom:8, zIndex:124
 * Mounted: App.jsx
 * Wired:   JarvisBrain.jsx via isCkrcompQuery / buildCkrcompScript
 *
 * Voice: "ckrcomp" / "contact profile" / "profile completeness" /
 *        "incomplete contact" / "contact knowledge report" / "contact backing"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const GREEN = "#00c878";
const AMBER = "#FFB347";
const RED   = "#FF3D5A";
const DIM   = "#1a2a38";

const BTN_LEFT   = 978540;
const REFRESH_MS = 120_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function authHdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function normalise(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function keywords(str = "") {
  return str.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function score(entity, pool) {
  const eks = keywords(
    [entity.name, entity.role, entity.organization, entity.description].join(" ")
  );
  if (!eks.length) return 0;
  let hits = 0;
  for (const item of pool) {
    const pks = keywords(
      [item.title, item.subject, item.name, item.description, item.content].join(" ")
    );
    if (eks.some(k => pks.includes(k))) hits++;
  }
  return hits;
}

function classify(kbHits, rptHits) {
  if (kbHits > 0 && rptHits > 0) return "FULLY_PROFILED";
  if (kbHits > 0)                 return "KB_ONLY";
  if (rptHits > 0)                return "REPORT_ONLY";
  return "INCOMPLETE";
}

const CLASS_ORDER = ["FULLY_PROFILED", "KB_ONLY", "REPORT_ONLY", "INCOMPLETE"];

async function fetchData() {
  const base = apiBase();
  const hdr  = authHdr();
  const [rawContacts, rawKB, rawReports] = await Promise.all([
    fetch(`${base}/entities/Contact`,   { headers: hdr }).then(r => r.json()),
    fetch(`${base}/knowledge/`,          { headers: hdr }).then(r => r.json()),
    fetch(`${base}/v1/reports`,          { headers: hdr }).then(r => r.json()),
  ]);
  const contacts = normalise(rawContacts);
  const kb       = normalise(rawKB);
  const reports  = normalise(rawReports);

  const rows = contacts.map(c => {
    const kbMatches  = kb.filter(a => score(c, [a]) > 0);
    const rptMatches = reports.filter(r => score(c, [r]) > 0);
    return {
      ...c,
      _class:  classify(kbMatches.length, rptMatches.length),
      _kb:     kbMatches,
      _rpt:    rptMatches,
    };
  });

  const counts = {};
  for (const cls of CLASS_ORDER) counts[cls] = 0;
  for (const r of rows) counts[r._class]++;

  return { contacts: rows, kb, reports, counts };
}

export async function buildCkrcompScript() {
  try {
    const d = await fetchData();
    const inc = d.counts.INCOMPLETE;
    return (
      `Contact intelligence profile completeness assessment. ` +
      `${d.contacts.length} contacts analysed across ${d.kb.length} knowledge articles and ${d.reports.length} reports. ` +
      `${d.counts.FULLY_PROFILED} fully profiled, ${d.counts.KB_ONLY} KB-only, ` +
      `${d.counts.REPORT_ONLY} report-only, ${inc} incomplete. ` +
      (inc > 0 ? `Priority: identify and document the ${inc} incomplete contact profiles.` : `All contacts have documentation backing.`)
    );
  } catch {
    return "Contact knowledge report completeness check. Assess profile gaps.";
  }
}

export function isCkrcompQuery(q = "") {
  const t = q.toLowerCase();
  return (
    t.includes("ckrcomp") ||
    t.includes("contact profile") ||
    t.includes("profile completeness") ||
    t.includes("incomplete contact") ||
    t.includes("contact knowledge report") ||
    t.includes("contact backing") ||
    t.includes("contact profil")
  );
}

// ── subcomponents ──────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{
      background: DIM, borderRadius: 6, padding: "5px 10px",
      display: "flex", flexDirection: "column", alignItems: "center", minWidth: 72,
    }}>
      <span style={{ fontSize: 16, fontWeight: 700, color, fontFamily: "'JetBrains Mono',monospace" }}>
        {value}
      </span>
      <span style={{ fontSize: 8, color: "#6E8AA0", letterSpacing: 1.5, marginTop: 1 }}>{label}</span>
    </div>
  );
}

function ScoreBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ fontSize: 9, color: "#8AABB8", letterSpacing: 1 }}>{label}</span>
        <span style={{ fontSize: 9, color, fontWeight: 700 }}>{value}</span>
      </div>
      <div style={{ height: 4, background: "#0d1922", borderRadius: 2 }}>
        <div style={{
          height: "100%", width: `${pct}%`, background: color,
          borderRadius: 2, transition: "width 0.5s",
        }} />
      </div>
    </div>
  );
}

function Row({ row, kb, reports }) {
  const [expanded, setExpanded] = useState(false);

  const clsColor = {
    FULLY_PROFILED: GREEN,
    KB_ONLY:        AMBER,
    REPORT_ONLY:    CY,
    INCOMPLETE:     RED,
  }[row._class] || "#888";

  const isIncomplete = row._class === "INCOMPLETE";

  return (
    <div style={{
      marginBottom: 6, background: DIM, borderRadius: 6, overflow: "hidden",
      border: `1px solid ${isIncomplete ? RED + "44" : "#1a2a38"}`,
    }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
          cursor: "pointer",
        }}
      >
        <span style={{
          fontSize: 9, color: clsColor, fontWeight: 700, letterSpacing: 1,
          minWidth: 90, textTransform: "uppercase",
          animation: isIncomplete ? "ckrpulse 1.4s ease-in-out infinite" : "none",
        }}>
          {row._class.replace(/_/g, " ")}
        </span>
        <span style={{ flex: 1, fontSize: 11, color: "#DCEBF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.name || row.id || "—"}
        </span>
        <span style={{ fontSize: 9, color: "#6E8AA0" }}>
          {row.role || row.organization || ""}
        </span>
        <span style={{ fontSize: 10, color: "#6E8AA0", marginLeft: 4 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ padding: "4px 10px 10px", borderTop: "1px solid #0d1922" }}>
          {row._kb.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 8, color: AMBER, letterSpacing: 1.5, marginBottom: 4 }}>KB ARTICLES ({row._kb.length})</div>
              {row._kb.slice(0, 5).map((a, i) => (
                <ScoreBar key={i} label={a.title || a.subject || a.name || "untitled"} value={i + 1} max={row._kb.length} color={AMBER} />
              ))}
            </div>
          )}
          {row._rpt.length > 0 && (
            <div>
              <div style={{ fontSize: 8, color: GREEN, letterSpacing: 1.5, marginBottom: 4 }}>REPORTS ({row._rpt.length})</div>
              {row._rpt.slice(0, 5).map((r, i) => (
                <ScoreBar key={i} label={r.title || r.name || "untitled"} value={i + 1} max={row._rpt.length} color={GREEN} />
              ))}
            </div>
          )}
          {row._kb.length === 0 && row._rpt.length === 0 && (
            <div style={{ fontSize: 9, color: RED, letterSpacing: 1 }}>NO KB ARTICLES OR REPORTS MATCHED</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────

export default function ContactKnowledgeReportCompleteness() {
  const [open,    setOpen]    = useState(false);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab,     setTab]     = useState("ALL");
  const [search,  setSearch]  = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchData();
      setData(d);
    } catch {
      /* backend not reachable — silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener("jarvis:ckrcomp-toggle", handler);
    return () => window.removeEventListener("jarvis:ckrcomp-toggle", handler);
  }, []);

  const incomplete = data ? data.counts.INCOMPLETE : 0;
  const total      = data ? data.contacts.length : 0;
  const profiled   = data ? data.counts.FULLY_PROFILED : 0;
  const covPct     = total > 0 ? Math.round((profiled / total) * 100) : 0;

  const filtered = (data?.contacts ?? []).filter(r => {
    const matchTab = tab === "ALL" || r._class === tab;
    const q = search.toLowerCase();
    const matchSearch = !q || [r.name, r.role, r.organization].join(" ").toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  const TABS = ["ALL", ...CLASS_ORDER];
  const btnColor = incomplete > 0 ? RED : CY;

  return (
    <>
      <style>{`
        @keyframes ckrpulse {
          0%,100% { opacity:1; }
          50%      { opacity:0.4; }
        }
        @keyframes ckrbtnpulse {
          0%,100% { box-shadow:0 0 0 0 #FF3D5A44; }
          50%      { box-shadow:0 0 0 6px #FF3D5A00; }
        }
      `}</style>

      {/* toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 124,
          background: open ? btnColor : "rgba(5,10,18,0.85)",
          border: `1px solid ${btnColor}`,
          color: open ? "#000" : btnColor,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fontWeight: 700,
          letterSpacing: 1.5, padding: "4px 8px", borderRadius: 5,
          cursor: "pointer", whiteSpace: "nowrap",
          animation: incomplete > 0 && !open ? "ckrbtnpulse 1.4s ease-in-out infinite" : "none",
        }}
      >
        ◈ CKRCOMP
      </button>

      {!open && null}
      {open && (
        <div style={{
          position: "fixed", top: 80, left: "50%", transform: "translateX(-50%)",
          width: "min(620px, 94vw)", zIndex: 900,
          background: "rgba(5,10,18,0.96)", border: `1px solid ${btnColor}44`,
          borderRadius: 14, padding: "18px 20px", backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${btnColor}22`,
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          maxHeight: "80vh", display: "flex", flexDirection: "column",
        }}>
          {/* header */}
          <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
            <span style={{ color: btnColor, fontWeight: 700, fontSize: 13, letterSpacing: 3 }}>
              ◈ CONTACT PROFILE COMPLETENESS
            </span>
            <span style={{ marginLeft: 8, fontSize: 9, color: "#6E8AA0", letterSpacing: 2 }}>CKRCOMP</span>
            {loading && <span style={{ marginLeft: "auto", fontSize: 9, color: CY }}>LOADING…</span>}
            <button
              onClick={() => setOpen(false)}
              style={{ marginLeft: loading ? 8 : "auto", background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 16, padding: "0 4px" }}
            >✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <Tile label="CONTACTS"       value={total}                       color={CY}    />
            <Tile label="KB ARTS"        value={data?.kb.length      ?? "—"} color={AMBER} />
            <Tile label="REPORTS"        value={data?.reports.length ?? "—"} color={GREEN} />
            <Tile label="FULLY PROFILED" value={profiled}                    color={GREEN} />
            <Tile label="INCOMPLETE"     value={incomplete}                  color={RED}   />
          </div>

          {/* coverage bar */}
          {data && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: 9, color: "#8AABB8", letterSpacing: 1 }}>PROFILE COVERAGE</span>
                <span style={{ fontSize: 9, color: covPct >= 75 ? GREEN : covPct >= 40 ? AMBER : RED, fontWeight: 700 }}>
                  {covPct}%
                </span>
              </div>
              <div style={{ height: 5, background: "#0d1922", borderRadius: 3 }}>
                <div style={{
                  height: "100%", borderRadius: 3, transition: "width 0.5s",
                  width: `${covPct}%`,
                  background: covPct >= 75 ? GREEN : covPct >= 40 ? AMBER : RED,
                }} />
              </div>
            </div>
          )}

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? CY : "transparent",
                color: tab === t ? "#000" : "#6E8AA0",
                border: `1px solid ${tab === t ? CY : "#1a2a38"}`,
                borderRadius: 4, padding: "3px 8px",
                fontSize: 8, fontWeight: 700, letterSpacing: 1, cursor: "pointer",
                fontFamily: "'JetBrains Mono',monospace",
              }}>{t.replace(/_/g, " ")}</button>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search name / role / org…"
            style={{
              background: DIM, border: "1px solid #1a2a38", borderRadius: 5,
              color: "#DCEBF5", fontFamily: "'JetBrains Mono',monospace",
              fontSize: 10, padding: "5px 10px", marginBottom: 10, width: "100%", boxSizing: "border-box",
            }}
          />

          {/* rows */}
          <div style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
            {!data && !loading && (
              <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 11, padding: 20 }}>
                No data loaded.
              </div>
            )}
            {filtered.length === 0 && data && (
              <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 11, padding: 20 }}>
                No contacts match this filter.
              </div>
            )}
            {filtered.map((row, i) => (
              <Row key={row.id || row.name || i} row={row} kb={data.kb} reports={data.reports} />
            ))}
          </div>

          {/* assess */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10, paddingTop: 10, borderTop: "1px solid #0d1922" }}>
            <button
              onClick={async () => {
                const script = await buildCkrcompScript();
                window.dispatchEvent(new CustomEvent("jarvis:ask", { detail: { text: script } }));
              }}
              style={{
                background: btnColor, color: "#000", border: "none", borderRadius: 6,
                padding: "6px 16px", cursor: "pointer", fontSize: 11, fontWeight: 700,
                letterSpacing: 1.5, fontFamily: "'JetBrains Mono',monospace",
              }}
            >▶ ASSESS</button>
          </div>
        </div>
      )}
    </>
  );
}
