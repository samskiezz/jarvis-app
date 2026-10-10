import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const AM = "#FFB300"; const GN = "#4CAF50"; const RD = "#FF3D3D";
const CY = "#00E5FF"; const OR = "#FF9800";
const DIM = "rgba(255,255,255,0.04)"; const BG = "rgba(6,10,18,0.94)";
const MN = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const REFRESH_MS = 90_000;
const BTN_LEFT   = 1102880;
const Z_IDX      = 685;

/* ── normalizers ─────────────────────────────────────────────────────────── */
function normInvestments(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.investments ?? raw.data ?? raw.items ?? []);
  return arr.map((v, i) => ({
    id:     String(v.id     ?? v.investment_id ?? i),
    name:   String(v.name   ?? v.title         ?? v.label ?? `Investment-${i}`),
    type:   String(v.type   ?? v.asset_type    ?? ""),
    sector: String(v.sector ?? v.industry      ?? ""),
    tags:   Array.isArray(v.tags) ? v.tags.map(String) : [],
    desc:   String(v.description ?? v.notes ?? v.summary ?? ""),
  }));
}

function normDatasets(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.datasets ?? raw.data ?? raw.items ?? []);
  return arr.map((d, i) => ({
    id:       String(d.id       ?? d.dataset_id ?? i),
    name:     String(d.name     ?? d.title      ?? d.label ?? `Dataset-${i}`),
    type:     String(d.type     ?? d.dataset_type ?? ""),
    category: String(d.category ?? d.domain      ?? ""),
    tags:     Array.isArray(d.tags) ? d.tags.map(String) : [],
    desc:     String(d.description ?? d.summary ?? d.notes ?? ""),
  }));
}

function normSignals(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.risk_signals ?? raw.signals ?? raw.data ?? raw.items ?? []);
  return arr.map((s, i) => ({
    id:       String(s.id       ?? s.signal_id  ?? i),
    name:     String(s.name     ?? s.title      ?? s.label ?? `Signal-${i}`),
    severity: String(s.severity ?? s.level      ?? ""),
    category: String(s.category ?? s.type       ?? ""),
    tags:     Array.isArray(s.tags) ? s.tags.map(String) : [],
    desc:     String(s.description ?? s.desc ?? s.detail ?? ""),
  }));
}

/* ── token overlap ───────────────────────────────────────────────────────── */
function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function overlap(iToks, obj) {
  const oToks = tokens(obj.name + " " + (obj.desc || "") + " " + (obj.tags || []).join(" ") + " " + (obj.type || "") + " " + (obj.category || ""));
  return iToks.filter(t => oToks.includes(t)).length;
}

/* ── classification ──────────────────────────────────────────────────────── */
function classify(inv, datasets, signals) {
  const tt = tokens(inv.name + " " + inv.type + " " + inv.sector + " " + inv.tags.join(" ") + " " + inv.desc);
  const hasData   = datasets.some(d => overlap(tt, d) >= 1);
  const hasSignal = signals.some(s  => overlap(tt, s) >= 1);
  if (hasData && hasSignal) return "FULLY_TRACKED";
  if (hasData)              return "DATA_LINKED";
  if (hasSignal)            return "RISK_FLAGGED";
  return "UNTRACKED";
}

function matchItems(inv, list) {
  const tt = tokens(inv.name + " " + inv.type + " " + inv.sector + " " + inv.tags.join(" "));
  return list.filter(x => overlap(tt, x) >= 1).slice(0, 4);
}

function relevanceScore(inv, item) {
  const tt = tokens(inv.name + " " + inv.type + " " + inv.sector + " " + inv.tags.join(" "));
  return Math.min(1, overlap(tt, item) / 3);
}

/* ── build script (exported for JarvisBrain) ─────────────────────────────── */
export async function buildIdrnScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [iR, dR, sR] = await Promise.all([
    fetch(`${base}/entities/Investment`,  { headers }),
    fetch(`${base}/v1/datasets`,          { headers }),
    fetch(`${base}/entities/RiskSignal`,  { headers }),
  ]);
  const [iJ, dJ, sJ] = await Promise.all([iR.json(), dR.json(), sR.json()]);
  const investments = normInvestments(iJ);
  const datasets    = normDatasets(dJ);
  const signals     = normSignals(sJ);
  const classified = investments.map(v => ({ ...v, cls: classify(v, datasets, signals) }));
  const fullyCov  = classified.filter(v => v.cls === "FULLY_TRACKED").length;
  const dataOnly  = classified.filter(v => v.cls === "DATA_LINKED").length;
  const riskOnly  = classified.filter(v => v.cls === "RISK_FLAGGED").length;
  const untracked = classified.filter(v => v.cls === "UNTRACKED").length;
  const pct = investments.length ? Math.round((fullyCov / investments.length) * 100) : 0;
  return `IDRN online, sir. ${investments.length} investments correlated against ${datasets.length} datasets and ${signals.length} risk signals. ` +
    `${fullyCov} fully tracked, ${dataOnly} data-linked, ${riskOnly} risk-flagged, ${untracked} untracked — ${pct}% full coverage.`;
}

/* ── voice trigger ───────────────────────────────────────────────────────── */
export function isIdrnQuery(q) {
  const lower = (q || "").toLowerCase();
  return /idrn|investment dataset risk|portfolio data risk|untracked investment|investment risk dataset|data risk nexus/.test(lower);
}

/* ── sub-components ──────────────────────────────────────────────────────── */
function StatTile({ label, value, color }) {
  return (
    <div style={{ flex: 1, background: DIM, borderRadius: 6, padding: "8px 10px", minWidth: 64, textAlign: "center" }}>
      <div style={{ fontFamily: MN, fontSize: 18, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
    </div>
  );
}

const CLS_META = {
  FULLY_TRACKED: { color: GN, label: "FULLY TRACKED" },
  DATA_LINKED:   { color: CY, label: "DATA LINKED"   },
  RISK_FLAGGED:  { color: AM, label: "RISK FLAGGED"  },
  UNTRACKED:     { color: RD, label: "UNTRACKED"     },
};

function ClsBadge({ cls }) {
  const m = CLS_META[cls] || { color: OR, label: cls };
  return (
    <span style={{ fontFamily: MN, fontSize: 9, fontWeight: 700, color: m.color,
      border: `1px solid ${m.color}`, borderRadius: 3, padding: "1px 5px", letterSpacing: "0.06em" }}>
      {m.label}
    </span>
  );
}

function RelevanceBar({ score, color }) {
  return (
    <div style={{ height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2, marginTop: 3 }}>
      <div style={{ height: "100%", width: `${Math.round(score * 100)}%`, background: color, borderRadius: 2 }} />
    </div>
  );
}

/* ── main component ──────────────────────────────────────────────────────── */
export default function InvestmentDatasetRiskNexus() {
  const [open, setOpen]               = useState(false);
  const [investments, setInvestments] = useState([]);
  const [datasets, setDatasets]       = useState([]);
  const [signals, setSignals]         = useState([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [filter, setFilter]           = useState("ALL");
  const [search, setSearch]           = useState("");
  const [expanded, setExpanded]       = useState(null);
  const [assessing, setAssessing]     = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const base = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [iR, dR, sR] = await Promise.all([
        fetch(`${base}/entities/Investment`,  { headers }),
        fetch(`${base}/v1/datasets`,          { headers }),
        fetch(`${base}/entities/RiskSignal`,  { headers }),
      ]);
      const [iJ, dJ, sJ] = await Promise.all([iR.json(), dR.json(), sR.json()]);
      const invs  = normInvestments(iJ);
      const dsets = normDatasets(dJ);
      const sigs  = normSignals(sJ);
      const classified = invs.map(v => ({
        ...v,
        cls:            classify(v, dsets, sigs),
        matchedDatasets: matchItems(v, dsets),
        matchedSignals:  matchItems(v, sigs),
      }));
      setInvestments(classified); setDatasets(dsets); setSignals(sigs);
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener("jarvis:idrn-toggle", handler);
    return () => window.removeEventListener("jarvis:idrn-toggle", handler);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildIdrnScript();
      const base = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
      const chatR = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers,
        body: JSON.stringify({ message: `IDRN assessment: ${script}. Provide a 2-sentence investment data risk coverage brief.` }),
      });
      const chatJ = await chatR.json();
      const reply = chatJ.response ?? chatJ.message ?? chatJ.content ?? script;
      const ttsR = await fetch(`${base}/v1/voice/tts`, {
        method: "POST", headers,
        body: JSON.stringify({ text: reply, voice: getActiveVoice() }),
      });
      if (ttsR.ok) {
        const blob = await ttsR.blob();
        const url  = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play().catch(() => {});
        audio.onended = () => URL.revokeObjectURL(url);
      }
    } catch { /* non-critical */ }
    setAssessing(false);
  }, [assessing]);

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        style={{ position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_IDX,
          background: "rgba(255,179,0,0.08)", border: "1px solid rgba(255,179,0,0.35)",
          color: AM, fontFamily: MN, fontSize: 10, padding: "4px 9px", borderRadius: 4,
          cursor: "pointer", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
        ◈ IDRN
      </button>
    );
  }

  const fullyCov  = investments.filter(v => v.cls === "FULLY_TRACKED").length;
  const dataOnly  = investments.filter(v => v.cls === "DATA_LINKED").length;
  const riskOnly  = investments.filter(v => v.cls === "RISK_FLAGGED").length;
  const untracked = investments.filter(v => v.cls === "UNTRACKED").length;
  const covPct = investments.length ? Math.round((fullyCov / investments.length) * 100) : 0;

  const TABS = ["ALL", "FULLY_TRACKED", "DATA_LINKED", "RISK_FLAGGED", "UNTRACKED"];
  const visible = investments.filter(v => {
    if (filter !== "ALL" && v.cls !== filter) return false;
    if (search) {
      const lc = search.toLowerCase();
      return v.name.toLowerCase().includes(lc) || v.type.toLowerCase().includes(lc) || v.sector.toLowerCase().includes(lc);
    }
    return true;
  });

  return (
    <div style={{ position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh",
      background: "rgba(0,0,0,0.55)", zIndex: Z_IDX, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: BG, border: "1px solid rgba(255,179,0,0.18)", borderRadius: 10,
        width: "min(960px,96vw)", maxHeight: "88vh", display: "flex", flexDirection: "column",
        boxShadow: "0 0 40px rgba(0,0,0,0.7)", overflow: "hidden" }}>

        {/* header */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)",
          display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: MN, fontSize: 11, color: AM, fontWeight: 700, letterSpacing: "0.08em" }}>
            ◈ IDRN — Investment × Dataset × RiskSignal Cross-Coverage Nexus
          </span>
          <span style={{ marginLeft: "auto", fontFamily: MN, fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
            {investments.length} investments · {datasets.length} datasets · {signals.length} signals
          </span>
          {untracked > 0 && (
            <span style={{ fontFamily: MN, fontSize: 10, fontWeight: 700, color: AM,
              border: `1px solid ${AM}`, borderRadius: 3, padding: "1px 6px" }}>
              {untracked} UNTRACKED
            </span>
          )}
          <button onClick={() => setOpen(false)}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)",
              fontSize: 16, cursor: "pointer", padding: "0 4px" }}>✕</button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 8, padding: "10px 14px", flexWrap: "wrap" }}>
          <StatTile label="INVESTMENTS"   value={investments.length} color={OR} />
          <StatTile label="DATASETS"      value={datasets.length}    color={GN} />
          <StatTile label="RISK SIGNALS"  value={signals.length}     color={RD} />
          <StatTile label="FULLY TRACKED" value={fullyCov}           color={GN} />
          <StatTile label="DATA LINKED"   value={dataOnly}           color={CY} />
          <StatTile label="RISK FLAGGED"  value={riskOnly}           color={AM} />
          <StatTile label="UNTRACKED"     value={untracked}          color={RD} />
          <StatTile label="COV%"          value={`${covPct}%`}       color={covPct >= 70 ? GN : covPct >= 40 ? AM : RD} />
        </div>

        {/* coverage bar */}
        <div style={{ padding: "0 14px 8px" }}>
          <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 3 }}>
            <div style={{ height: "100%", width: `${covPct}%`, borderRadius: 3,
              background: covPct >= 70 ? GN : covPct >= 40 ? AM : RD }} />
          </div>
        </div>

        {/* filter tabs */}
        <div style={{ display: "flex", gap: 6, padding: "0 14px 8px", flexWrap: "wrap", alignItems: "center" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setFilter(t)}
              style={{ background: filter === t ? "rgba(255,179,0,0.15)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${filter === t ? AM : "rgba(255,255,255,0.12)"}`,
                color: filter === t ? AM : "rgba(255,255,255,0.5)",
                fontFamily: MN, fontSize: 9, padding: "3px 8px", borderRadius: 4,
                cursor: "pointer", letterSpacing: "0.05em" }}>
              {t.replace(/_/g, " ")}
            </button>
          ))}
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search investments…"
            style={{ marginLeft: "auto", background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.12)", color: "#fff",
              fontFamily: MN, fontSize: 10, padding: "3px 8px", borderRadius: 4, width: 140 }} />
        </div>

        {/* assess button */}
        <div style={{ padding: "0 14px 8px" }}>
          <button onClick={assess} disabled={assessing}
            style={{ background: assessing ? "rgba(255,179,0,0.05)" : "rgba(255,179,0,0.12)",
              border: `1px solid ${assessing ? "rgba(255,179,0,0.2)" : AM}`,
              color: assessing ? "rgba(255,179,0,0.4)" : AM,
              fontFamily: MN, fontSize: 10, padding: "5px 14px", borderRadius: 4,
              cursor: assessing ? "default" : "pointer", letterSpacing: "0.06em" }}>
            {assessing ? "▶ ASSESSING…" : "▶ ASSESS INVESTMENT COVERAGE"}
          </button>
        </div>

        {/* list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 12px" }}>
          {loading && (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)",
              fontFamily: MN, fontSize: 11, padding: 32 }}>Loading…</div>
          )}
          {error && (
            <div style={{ textAlign: "center", color: RD,
              fontFamily: MN, fontSize: 11, padding: 32 }}>{error}</div>
          )}
          {!loading && !error && visible.length === 0 && (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.25)",
              fontFamily: MN, fontSize: 11, padding: 32 }}>No investments match.</div>
          )}
          {visible.map(v => (
            <div key={v.id}
              style={{ marginBottom: 4, borderRadius: 6,
                background: v.cls === "UNTRACKED" ? "rgba(255,61,61,0.06)" : DIM,
                border: v.cls === "UNTRACKED"
                  ? "1px solid rgba(255,61,61,0.18)"
                  : "1px solid rgba(255,255,255,0.06)",
                animation: v.cls === "UNTRACKED" ? "pulse 2s infinite" : "none" }}>
              <div onClick={() => setExpanded(e => e === v.id ? null : v.id)}
                style={{ padding: "8px 12px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: MN, fontSize: 11, color: OR, flex: 1, fontWeight: 600 }}>
                  {v.name}
                </span>
                {v.type && (
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontFamily: MN }}>{v.type}</span>
                )}
                {v.sector && (
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontFamily: MN }}>{v.sector}</span>
                )}
                <ClsBadge cls={v.cls} />
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: MN }}>
                  {expanded === v.id ? "▲" : "▼"}
                </span>
              </div>
              {expanded === v.id && (
                <div style={{ padding: "0 12px 12px", display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {/* datasets */}
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 9, color: GN, fontFamily: MN, fontWeight: 700,
                      marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Datasets ({v.matchedDatasets.length})
                    </div>
                    {v.matchedDatasets.length === 0
                      ? <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: MN }}>None matched.</div>
                      : v.matchedDatasets.map(d => (
                          <div key={d.id} style={{ background: "rgba(76,175,80,0.07)", borderRadius: 4, padding: "5px 8px", marginBottom: 4 }}>
                            <div style={{ fontSize: 10, color: "#fff", fontFamily: MN }}>{d.name}</div>
                            {d.type && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>{d.type}</div>}
                            <RelevanceBar score={relevanceScore(v, d)} color={GN} />
                          </div>
                        ))}
                  </div>
                  {/* risk signals */}
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 9, color: RD, fontFamily: MN, fontWeight: 700,
                      marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Risk Signals ({v.matchedSignals.length})
                    </div>
                    {v.matchedSignals.length === 0
                      ? <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: MN }}>None matched.</div>
                      : v.matchedSignals.map(s => (
                          <div key={s.id} style={{ background: "rgba(255,61,61,0.07)", borderRadius: 4, padding: "5px 8px", marginBottom: 4 }}>
                            <div style={{ fontSize: 10, color: "#fff", fontFamily: MN }}>{s.name}</div>
                            {s.severity && <div style={{ fontSize: 9, color: AM, fontFamily: MN }}>{s.severity}</div>}
                            <RelevanceBar score={relevanceScore(v, s)} color={RD} />
                          </div>
                        ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.45 } }`}</style>
    </div>
  );
}
