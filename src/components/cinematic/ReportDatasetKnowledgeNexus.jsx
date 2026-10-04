/**
 * F64 – Report × Dataset × Knowledge Intelligence Nexus (RDKNEX)
 * Cross-correlates /v1/reports × /v1/datasets × /knowledge/.
 * Classifies each report:
 *   FULLY_GROUNDED – matched dataset AND knowledge article
 *   DATA_ONLY      – matched dataset, no knowledge article
 *   KB_ONLY        – matched knowledge article, no dataset
 *   UNGROUNDED     – no match in either (blind spot)
 * UNGROUNDED rows pulse red.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const BTN_LEFT   = 948440;
const Z          = 647;
const REFRESH_MS = 120_000;

const CY   = "#29E7FF";
const GR   = "#00c878";
const AM   = "#F5A623";
const RD   = "#FF3B3B";
const DIM  = "#3a5060";
const MONO = "'JetBrains Mono', 'Courier New', monospace";
const SANS = "'Inter', system-ui, sans-serif";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
function authHdr() { return { Authorization: `Bearer ${API_KEY}` }; }

const RDKNEX_RE = /\b(rdknex|report.{0,14}(dataset|data|knowledge|kb|grounded|backing|backed)|dataset.{0,14}report|knowledge.{0,14}report|unground(ed)?.{0,14}report|grounded.{0,14}report|report.{0,14}(grounding|data.backing|knowledge.backing)|data.backed.report)\b/i;

export function isRdknexQuery(text) { return RDKNEX_RE.test(text || ""); }

export async function buildRdknexScript() {
  try {
    const base = apiBase();
    const [repRes, dsRes, kbRes] = await Promise.all([
      fetch(`${base}/v1/reports`,  { headers: authHdr() }),
      fetch(`${base}/v1/datasets`, { headers: authHdr() }),
      fetch(`${base}/knowledge/`,  { headers: authHdr() }),
    ]);
    const [reports, datasets, knowledge] = await Promise.all([
      repRes.ok ? repRes.json() : [],
      dsRes.ok  ? dsRes.json()  : [],
      kbRes.ok  ? kbRes.json()  : [],
    ]);
    const repArr = (Array.isArray(reports)  ? reports  : reports?.data  ?? []).slice(0, 100);
    const dsArr  = (Array.isArray(datasets) ? datasets : datasets?.data ?? []).slice(0, 200);
    const kbArr  = (Array.isArray(knowledge)? knowledge: knowledge?.data?? []).slice(0, 200);
    const classified = classifyReports(repArr, dsArr, kbArr);
    const ungrounded     = classified.filter(r => r.cls === "UNGROUNDED").length;
    const fullyGrounded  = classified.filter(r => r.cls === "FULLY_GROUNDED").length;
    return `RDKNEX nexus: ${repArr.length} reports, ${dsArr.length} datasets, ${kbArr.length} knowledge articles. ` +
      `Grounding: FULLY_GROUNDED ${fullyGrounded}, DATA_ONLY ${classified.filter(r => r.cls === "DATA_ONLY").length}, ` +
      `KB_ONLY ${classified.filter(r => r.cls === "KB_ONLY").length}, UNGROUNDED ${ungrounded}. ` +
      (ungrounded > 0
        ? `${ungrounded} report${ungrounded !== 1 ? "s" : ""} have no dataset or knowledge article backing — intelligence gaps requiring attention.`
        : "All reports have at least one data or knowledge anchor.");
  } catch (e) {
    return `RDKNEX nexus unavailable: ${e.message}`;
  }
}

function tok(str) {
  return String(str || "").toLowerCase().split(/\W+/).filter(t => t.length > 2);
}
function overlap(a, b) {
  const setB = new Set(b);
  return a.some(t => setB.has(t));
}

function classifyReports(reports, datasets, knowledge) {
  return reports.map(rep => {
    const rtoks = tok(
      (rep.title || rep.name || "") + " " +
      (rep.category || rep.type || "") + " " +
      (rep.summary || rep.description || "") + " " +
      (Array.isArray(rep.tags) ? rep.tags.join(" ") : "")
    );
    const matchedDs = datasets.filter(ds =>
      overlap(rtoks, tok(
        (ds.name || ds.title || "") + " " +
        (ds.type || ds.kind || "") + " " +
        (ds.description || "")
      ))
    );
    const matchedKb = knowledge.filter(kb =>
      overlap(rtoks, tok(
        (kb.title || kb.name || "") + " " +
        (kb.category || kb.kind || "") + " " +
        (kb.summary || kb.content || kb.description || "") + " " +
        (Array.isArray(kb.tags) ? kb.tags.join(" ") : "")
      ))
    );
    const hasDs = matchedDs.length > 0;
    const hasKb = matchedKb.length > 0;
    let cls;
    if (hasDs && hasKb)       cls = "FULLY_GROUNDED";
    else if (hasDs && !hasKb) cls = "DATA_ONLY";
    else if (!hasDs && hasKb) cls = "KB_ONLY";
    else                      cls = "UNGROUNDED";
    return { rep, cls, matchedDs, matchedKb };
  });
}

const CLS_COLOR = {
  FULLY_GROUNDED: GR,
  DATA_ONLY:      CY,
  KB_ONLY:        AM,
  UNGROUNDED:     RD,
};
const CLS_LABEL = {
  FULLY_GROUNDED: "FULLY GROUNDED",
  DATA_ONLY:      "DATA ONLY",
  KB_ONLY:        "KB ONLY",
  UNGROUNDED:     "UNGROUNDED",
};
const TABS = ["ALL", "FULLY_GROUNDED", "DATA_ONLY", "KB_ONLY", "UNGROUNDED"];

export default function ReportDatasetKnowledgeNexus() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [dsCount, setDsCount]     = useState(0);
  const [kbCount, setKbCount]     = useState(0);
  const [loading, setLoading]     = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const [repRes, dsRes, kbRes] = await Promise.all([
        fetch(`${base}/v1/reports`,  { headers: authHdr() }),
        fetch(`${base}/v1/datasets`, { headers: authHdr() }),
        fetch(`${base}/knowledge/`,  { headers: authHdr() }),
      ]);
      const [reports, datasets, knowledge] = await Promise.all([
        repRes.ok ? repRes.json() : [],
        dsRes.ok  ? dsRes.json()  : [],
        kbRes.ok  ? kbRes.json()  : [],
      ]);
      const repArr = (Array.isArray(reports)  ? reports  : reports?.data  ?? []).slice(0, 100);
      const dsArr  = (Array.isArray(datasets) ? datasets : datasets?.data ?? []).slice(0, 200);
      const kbArr  = (Array.isArray(knowledge)? knowledge: knowledge?.data?? []).slice(0, 200);
      setDsCount(dsArr.length);
      setKbCount(kbArr.length);
      setRows(classifyReports(repArr, dsArr, kbArr));
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) { load(); timerRef.current = setInterval(load, REFRESH_MS); }
    else { clearInterval(timerRef.current); }
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:rdknex-toggle", handler);
    return () => window.removeEventListener("jarvis:rdknex-toggle", handler);
  }, []);

  const ungrounded = rows.filter(r => r.cls === "UNGROUNDED").length;
  const fully      = rows.filter(r => r.cls === "FULLY_GROUNDED").length;
  const visible    = rows
    .filter(r => tab === "ALL" || r.cls === tab)
    .filter(r => {
      if (!search) return true;
      const name = r.rep.title || r.rep.name || r.rep.category || "";
      return name.toLowerCase().includes(search.toLowerCase());
    });

  async function assess() {
    setAssessing(true);
    try {
      const base   = apiBase();
      const script = await buildRdknexScript();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ message: script }),
      });
      const d     = await r.json();
      const reply = (d.answer || d.response || script).slice(0, 500);
      const voice = (typeof getActiveVoice === "function" ? getActiveVoice() : null) || "ash";
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ text: reply, voice }),
      });
    } catch (_) {}
    setAssessing(false);
  }

  const btnPulse = ungrounded > 0;

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: Z,
          background: open ? `rgba(41,231,255,0.18)` : `rgba(5,12,20,0.82)`,
          border: `1px solid ${open ? CY : DIM}`,
          borderRadius: 6,
          color: open ? CY : DIM,
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: 1.5,
          padding: "4px 9px",
          cursor: "pointer",
          whiteSpace: "nowrap",
          animation: btnPulse && !open ? "rdknex-pulse 2.4s ease-in-out infinite" : "none",
        }}
        title="Report × Dataset × Knowledge Intelligence Nexus"
      >
        ◈ RDKNEX
      </button>

      <style>{`
        @keyframes rdknex-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(255,59,59,0); border-color: #3a5060; }
          50%      { box-shadow: 0 0 0 5px rgba(255,59,59,0.28); border-color: ${RD}; }
        }
      `}</style>

      {open && (
        <div
          style={{
            position: "fixed", right: 16, top: 64, zIndex: Z + 100,
            width: "min(660px, 96vw)",
            maxHeight: "82vh",
            display: "flex", flexDirection: "column",
            background: "rgba(5,12,20,0.95)",
            backdropFilter: "blur(16px)",
            border: `1px solid rgba(41,231,255,0.18)`,
            borderTop: `2px solid ${CY}`,
            borderRadius: 10,
            boxShadow: `0 0 60px rgba(41,231,255,0.10), 0 20px 48px rgba(0,0,0,0.75)`,
            fontFamily: SANS,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px",
            borderBottom: `1px solid rgba(41,231,255,0.09)`,
          }}>
            <span style={{ color: CY, fontFamily: MONO, fontSize: 11, letterSpacing: 1.5 }}>◈ RDKNEX</span>
            <span style={{ color: "#5a7a8a", fontFamily: MONO, fontSize: 10, flex: 1, letterSpacing: 1 }}>
              REPORT × DATASET × KNOWLEDGE NEXUS
            </span>
            {loading && <span style={{ color: DIM, fontFamily: MONO, fontSize: 9 }}>SYNC…</span>}
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14, lineHeight: 1 }}
            >×</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "10px 14px 0" }}>
            {[
              { label: "REPORTS",        val: rows.length, color: CY },
              { label: "DATASETS",       val: dsCount,     color: CY },
              { label: "KB ARTICLES",    val: kbCount,     color: AM },
              { label: "FULLY GROUNDED", val: fully,       color: GR },
              { label: "UNGROUNDED",     val: ungrounded,  color: RD },
            ].map(t => (
              <div key={t.label} style={{
                flex: 1, background: "rgba(255,255,255,0.03)",
                border: `1px solid rgba(41,231,255,0.08)`, borderRadius: 6,
                padding: "7px 6px", textAlign: "center",
              }}>
                <div style={{ color: t.color, fontFamily: MONO, fontSize: 15, fontWeight: 700 }}>{t.val}</div>
                <div style={{ color: DIM, fontFamily: MONO, fontSize: 8, letterSpacing: 1.2, marginTop: 2 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div style={{ display: "flex", gap: 6, padding: "10px 14px 0", flexWrap: "wrap", alignItems: "center" }}>
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `rgba(41,231,255,0.12)` : "transparent",
                  border: `1px solid ${tab === t ? CY : DIM}`,
                  borderRadius: 5, color: tab === t ? CY : DIM,
                  fontFamily: MONO, fontSize: 9, letterSpacing: 1.2,
                  padding: "3px 8px", cursor: "pointer",
                }}
              >
                {t === "ALL" ? "ALL" : CLS_LABEL[t] || t}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search reports…"
              style={{
                marginLeft: "auto",
                background: "rgba(41,231,255,0.04)",
                border: `1px solid ${DIM}`,
                borderRadius: 5, color: "#a0c0cc",
                fontFamily: MONO, fontSize: 10, padding: "3px 8px",
                outline: "none", width: 140,
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px 0" }}>
            {visible.length === 0 && (
              <div style={{ color: DIM, fontFamily: MONO, fontSize: 11, textAlign: "center", padding: "24px 0" }}>
                {loading ? "Loading nexus…" : "No reports match filter."}
              </div>
            )}
            {visible.map((r, i) => {
              const name  = r.rep.title || r.rep.name || r.rep.category || `Report ${i + 1}`;
              const color = CLS_COLOR[r.cls];
              const isExp = expanded === i;
              return (
                <div key={i}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "7px 10px", marginBottom: 3, borderRadius: 6,
                      background: isExp ? "rgba(41,231,255,0.05)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${isExp ? `rgba(41,231,255,0.18)` : "rgba(41,231,255,0.05)"}`,
                      cursor: "pointer",
                      borderLeft: `3px solid ${r.cls === "UNGROUNDED" ? RD : color}`,
                      animation: r.cls === "UNGROUNDED" ? "rdknex-pulse 2.4s ease-in-out infinite" : "none",
                    }}
                  >
                    <span style={{ color, fontFamily: MONO, fontSize: 9, letterSpacing: 1, flexShrink: 0, width: 110 }}>
                      {CLS_LABEL[r.cls]}
                    </span>
                    <span style={{ flex: 1, color: "#b0ccd5", fontSize: 12, fontFamily: SANS, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {name}
                    </span>
                    <span style={{ color: DIM, fontFamily: MONO, fontSize: 9, flexShrink: 0 }}>
                      {r.matchedDs.length}ds / {r.matchedKb.length}kb
                    </span>
                    <span style={{ color: DIM, fontFamily: MONO, fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{
                      marginBottom: 6, padding: "8px 10px",
                      background: "rgba(41,231,255,0.02)",
                      border: "1px solid rgba(41,231,255,0.08)",
                      borderRadius: 6, borderLeft: `3px solid ${CY}44`,
                    }}>
                      {/* Datasets */}
                      {r.matchedDs.length > 0 ? (
                        <>
                          <div style={{ color: CY, fontFamily: MONO, fontSize: 9, letterSpacing: 1.2, marginBottom: 5 }}>
                            DATASETS ({r.matchedDs.length})
                          </div>
                          {r.matchedDs.slice(0, 5).map((ds, di) => {
                            const dname = ds.name || ds.title || `Dataset ${di + 1}`;
                            const dtype = ds.type || ds.kind || "";
                            const w = Math.round(50 + Math.random() * 45);
                            return (
                              <div key={di} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <div style={{ height: 4, width: `${w}%`, maxWidth: 180, background: CY, borderRadius: 2, opacity: 0.7 }} />
                                <span style={{ color: "#8aabb5", fontFamily: MONO, fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {dname}{dtype ? ` · ${dtype}` : ""}
                                </span>
                              </div>
                            );
                          })}
                          {r.matchedDs.length > 5 && (
                            <div style={{ color: DIM, fontFamily: MONO, fontSize: 9 }}>+{r.matchedDs.length - 5} more datasets</div>
                          )}
                        </>
                      ) : (
                        <div style={{ color: DIM, fontFamily: MONO, fontSize: 9 }}>No dataset matches.</div>
                      )}

                      {/* Knowledge articles */}
                      {r.matchedKb.length > 0 && (
                        <>
                          <div style={{ color: AM, fontFamily: MONO, fontSize: 9, letterSpacing: 1.2, marginTop: 8, marginBottom: 5 }}>
                            KNOWLEDGE ARTICLES ({r.matchedKb.length})
                          </div>
                          {r.matchedKb.slice(0, 5).map((kb, ki) => {
                            const ktitle = kb.title || kb.name || `Article ${ki + 1}`;
                            const w = Math.round(55 + Math.random() * 40);
                            return (
                              <div key={ki} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <div style={{ height: 4, width: `${w}%`, maxWidth: 180, background: AM, borderRadius: 2, opacity: 0.7 }} />
                                <span style={{ color: "#8aabb5", fontFamily: MONO, fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {ktitle}
                                </span>
                              </div>
                            );
                          })}
                          {r.matchedKb.length > 5 && (
                            <div style={{ color: DIM, fontFamily: MONO, fontSize: 9 }}>+{r.matchedKb.length - 5} more articles</div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "8px 14px",
            borderTop: `1px solid rgba(41,231,255,0.07)`,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ color: DIM, fontFamily: MONO, fontSize: 9, flex: 1 }}>
              {visible.length} of {rows.length} reports · 120 s refresh
            </span>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? "rgba(41,231,255,0.06)" : "rgba(41,231,255,0.12)",
                border: `1px solid ${assessing ? DIM : CY}`,
                borderRadius: 5, color: assessing ? DIM : CY,
                fontFamily: MONO, fontSize: 10, letterSpacing: 1,
                padding: "4px 14px", cursor: assessing ? "not-allowed" : "pointer",
              }}
            >
              {assessing ? "ASSESSING…" : "▶ ASSESS"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
