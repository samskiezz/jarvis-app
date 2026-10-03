/**
 * F61 – Dataset × RiskSignal × Investigation Coverage Matrix (DRISCOV)
 * Cross-correlates /v1/datasets × /entities/RiskSignal × /v1/investigations.
 * Classifies each dataset:
 *   FULLY_COVERED  – matched risk signal AND investigation
 *   RISK_ONLY      – matched risk signal, no investigation
 *   INV_ONLY       – matched investigation, no risk signal
 *   UNCOVERED      – no match in either
 * UNCOVERED rows pulse red as a coverage gap.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const BTN_LEFT  = 945860;
const Z         = 644;
const REFRESH_MS = 90_000;

const CY  = "#29E7FF";
const GR  = "#00c878";
const AM  = "#F5A623";
const RD  = "#FF3B3B";
const PU  = "#a855f7";
const DIM = "#3a5060";
const MONO = "'JetBrains Mono', 'Courier New', monospace";
const SANS = "'Inter', system-ui, sans-serif";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
function authHdr() { return { Authorization: `Bearer ${API_KEY}` }; }

const DRISCOV_RE = /\b(driscov|dataset.{0,12}(risk|invest)|coverage.{0,12}matrix|dataset coverage|risk.{0,12}dataset|invest.{0,12}dataset)\b/i;

export function isDriscovQuery(text) { return DRISCOV_RE.test(text || ""); }

export async function buildDriscovScript() {
  try {
    const base = apiBase();
    const [dsRes, rsRes, invRes] = await Promise.all([
      fetch(`${base}/v1/datasets`,          { headers: authHdr() }),
      fetch(`${base}/entities/RiskSignal`,  { headers: authHdr() }),
      fetch(`${base}/v1/investigations`,    { headers: authHdr() }),
    ]);
    const [datasets, risks, investigations] = await Promise.all([
      dsRes.ok   ? dsRes.json()   : [],
      rsRes.ok   ? rsRes.json()   : [],
      invRes.ok  ? invRes.json()  : [],
    ]);
    const dsArr   = (Array.isArray(datasets) ? datasets : datasets?.datasets ?? datasets?.data ?? []).slice(0, 40);
    const rsArr   = (Array.isArray(risks) ? risks : risks?.data ?? []).slice(0, 200);
    const invArr  = (Array.isArray(investigations) ? investigations : investigations?.data ?? investigations?.investigations ?? []).slice(0, 200);
    const classified = classify(dsArr, rsArr, invArr);
    const uncovered  = classified.filter(r => r.cls === "UNCOVERED").length;
    const riskOnly   = classified.filter(r => r.cls === "RISK_ONLY").length;
    return `DRISCOV matrix: ${dsArr.length} datasets, ${rsArr.length} risk signals, ${invArr.length} investigations. ` +
      `Coverage: FULLY_COVERED ${classified.filter(r => r.cls === "FULLY_COVERED").length}, ` +
      `RISK_ONLY ${riskOnly}, INV_ONLY ${classified.filter(r => r.cls === "INV_ONLY").length}, ` +
      `UNCOVERED ${uncovered}. ` +
      (uncovered > 0 ? `${uncovered} dataset${uncovered !== 1 ? "s" : ""} have no risk signal or investigation linkage and represent coverage gaps.` : "All datasets have at least one coverage signal.");
  } catch (e) {
    return `DRISCOV matrix unavailable: ${e.message}`;
  }
}

function tok(str) {
  return String(str || "").toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function overlap(a, b) {
  const setB = new Set(b);
  return a.some(t => setB.has(t));
}

function classify(datasets, risks, investigations) {
  return datasets.map(ds => {
    const dtoks = tok(ds.name || ds.title || ds.label || "");
    const hasRisk = risks.some(r => overlap(dtoks, tok(r.title || r.name || r.description || "")));
    const hasInv  = investigations.some(i => overlap(dtoks, tok(i.title || i.name || i.summary || "")));
    let cls;
    if (hasRisk && hasInv)       cls = "FULLY_COVERED";
    else if (hasRisk && !hasInv) cls = "RISK_ONLY";
    else if (!hasRisk && hasInv) cls = "INV_ONLY";
    else                         cls = "UNCOVERED";
    return { ds, cls };
  });
}

const CLS_COLOR = {
  FULLY_COVERED: GR,
  RISK_ONLY:     AM,
  INV_ONLY:      PU,
  UNCOVERED:     RD,
};

const CLS_LABEL = {
  FULLY_COVERED: "FULLY COVERED",
  RISK_ONLY:     "RISK ONLY",
  INV_ONLY:      "INV ONLY",
  UNCOVERED:     "UNCOVERED",
};

const TABS = ["ALL", "FULLY_COVERED", "RISK_ONLY", "INV_ONLY", "UNCOVERED"];

export default function DatasetRiskInvestigationMatrix() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [rsCount, setRsCount]   = useState(0);
  const [invCount, setInvCount] = useState(0);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [loading, setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const base = apiBase();
      const [dsRes, rsRes, invRes] = await Promise.all([
        fetch(`${base}/v1/datasets`,         { headers: authHdr() }),
        fetch(`${base}/entities/RiskSignal`, { headers: authHdr() }),
        fetch(`${base}/v1/investigations`,   { headers: authHdr() }),
      ]);
      const [dsData, rsData, invData] = await Promise.all([
        dsRes.ok  ? dsRes.json()  : [],
        rsRes.ok  ? rsRes.json()  : [],
        invRes.ok ? invRes.json() : [],
      ]);
      const dsArr  = (Array.isArray(dsData) ? dsData : dsData?.datasets ?? dsData?.data ?? []).slice(0, 40);
      const rsArr  = (Array.isArray(rsData) ? rsData : rsData?.data ?? []).slice(0, 200);
      const invArr = (Array.isArray(invData) ? invData : invData?.data ?? invData?.investigations ?? []).slice(0, 200);
      setRsCount(rsArr.length);
      setInvCount(invArr.length);
      setRows(classify(dsArr, rsArr, invArr));
    } catch (_) {}
    setLoading(false);
  }, [open]);

  useEffect(() => {
    load();
    if (open) {
      timerRef.current = setInterval(load, REFRESH_MS);
    }
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener("jarvis:driscov-toggle", h);
    return () => window.removeEventListener("jarvis:driscov-toggle", h);
  }, []);

  const uncovered = rows.filter(r => r.cls === "UNCOVERED").length;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = (r.ds.name || r.ds.title || r.ds.label || "").toLowerCase();
      return name.includes(q);
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    try {
      const base    = apiBase();
      const script  = await buildDriscovScript();
      const res     = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ message: `Analyse this dataset coverage matrix and recommend priority actions: ${script}` }),
      });
      const d = res.ok ? await res.json() : null;
      const reply = d?.response || d?.message || d?.content || script;
      const voice = getActiveVoice ? getActiveVoice() : "ash";
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ text: reply.slice(0, 500), voice }),
      });
    } catch (_) {}
    setAssessing(false);
  }

  const btnPulse = uncovered > 0;

  return (
    <>
      {/* Toggle button */}
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
          animation: btnPulse && !open ? "driscov-pulse 2.4s ease-in-out infinite" : "none",
        }}
        title="Dataset × RiskSignal × Investigation Coverage Matrix"
      >
        ◈ DRISCOV
      </button>

      <style>{`
        @keyframes driscov-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(255,59,59,0); border-color: #3a5060; }
          50%      { box-shadow: 0 0 0 5px rgba(255,59,59,0.28); border-color: ${RD}; }
        }
      `}</style>

      {open && (
        <div
          style={{
            position: "fixed", right: 16, top: 64, zIndex: Z + 100,
            width: "min(640px, 96vw)",
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
            <span style={{ color: CY, fontFamily: MONO, fontSize: 11, letterSpacing: 1.5 }}>◈ DRISCOV</span>
            <span style={{ color: "#5a7a8a", fontFamily: MONO, fontSize: 10, flex: 1, letterSpacing: 1 }}>
              DATASET × RISK × INVESTIGATION MATRIX
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
              { label: "DATASETS",    val: rows.length,                             color: CY },
              { label: "RISK SIGS",   val: rsCount,                                 color: AM },
              { label: "INVEST",      val: invCount,                                color: PU },
              { label: "UNCOVERED",   val: uncovered,                               color: RD },
            ].map(t => (
              <div key={t.label} style={{
                flex: 1, background: "rgba(255,255,255,0.03)",
                border: `1px solid rgba(41,231,255,0.08)`, borderRadius: 6,
                padding: "8px 10px", textAlign: "center",
              }}>
                <div style={{ color: t.color, fontFamily: MONO, fontSize: 16, fontWeight: 700 }}>{t.val}</div>
                <div style={{ color: DIM, fontFamily: MONO, fontSize: 9, letterSpacing: 1.5, marginTop: 2 }}>{t.label}</div>
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
              placeholder="search datasets…"
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
                {loading ? "Loading matrix…" : "No datasets match filter."}
              </div>
            )}
            {visible.map((r, i) => {
              const name  = r.ds.name || r.ds.title || r.ds.label || `Dataset ${i + 1}`;
              const color = CLS_COLOR[r.cls];
              const isExp = expanded === i;
              return (
                <div
                  key={i}
                  onClick={() => setExpanded(isExp ? null : i)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "7px 10px", marginBottom: 3, borderRadius: 6,
                    background: isExp ? "rgba(41,231,255,0.05)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${isExp ? `rgba(41,231,255,0.18)` : "rgba(41,231,255,0.05)"}`,
                    cursor: "pointer",
                    borderLeft: `3px solid ${r.cls === "UNCOVERED" ? RD : color}`,
                    animation: r.cls === "UNCOVERED" ? "driscov-pulse 2.4s ease-in-out infinite" : "none",
                  }}
                >
                  <span style={{ color, fontFamily: MONO, fontSize: 9, letterSpacing: 1, flexShrink: 0, width: 88 }}>
                    {CLS_LABEL[r.cls]}
                  </span>
                  <span style={{ flex: 1, color: "#b0ccd5", fontSize: 12, fontFamily: SANS, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {name}
                  </span>
                  {r.ds.row_count != null && (
                    <span style={{ color: DIM, fontFamily: MONO, fontSize: 9, flexShrink: 0 }}>
                      {Number(r.ds.row_count).toLocaleString()} rows
                    </span>
                  )}
                  <span style={{ color: DIM, fontFamily: MONO, fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
                </div>
              );
            })}
          </div>

          {/* Footer: assess */}
          <div style={{
            padding: "8px 14px",
            borderTop: `1px solid rgba(41,231,255,0.07)`,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ color: DIM, fontFamily: MONO, fontSize: 9, flex: 1 }}>
              {visible.length} of {rows.length} datasets · 90 s refresh
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
