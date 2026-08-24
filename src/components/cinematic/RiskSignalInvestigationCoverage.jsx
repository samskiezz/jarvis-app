/**
 * F93 — RiskSignal × Investigation Coverage (RSIC)
 *
 * Parallel-fetches /entities/RiskSignal + /v1/investigations every 90 s.
 * Keyword-correlates each risk signal (title/description/severity/category/tags)
 * against open investigation cases (title/description/annotations/seeds) to classify:
 *   INVESTIGATED — at least one open investigation covers this risk signal
 *   UNTRACKED    — no investigation tracks this risk signal
 *
 * Amber badge on UNTRACKED count.
 *
 * Voice intents: "risk investigation / investigation risk / rsic /
 *                tracked risks / untracked risks / risk case coverage /
 *                which risks have investigations / risk coverage investigation"
 * Strip button: ◈ RSIC  left:3060 bottom:18 zIndex:68
 * Custom event: jarvis:rsic-toggle
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AMB = "#FFD700";
const GRN = "#00E5A0";
const DIM = "#5A7A9A";
const POLL = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const hdrs = { Authorization: `Bearer ${API_KEY}` };

const RSIC_RE =
  /\b(risk[._\s]?investigation|investigation[._\s]?risk|rsic|tracked[._\s]?risks|untracked[._\s]?risks|risk[._\s]?case[._\s]?coverage|which[._\s]?risks[._\s]?have[._\s]?investigations|risk[._\s]?coverage[._\s]?investigation)\b/i;

export function isRsicQuery(t) { return RSIC_RE.test(t || ""); }

function tokenize(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function relevance(signal, inv) {
  const a = tokenize([
    signal.title || signal.name, signal.description,
    signal.severity || "", signal.category || "",
    (signal.tags || []).join(" "),
  ].join(" "));
  const b = tokenize([
    inv.title, inv.description,
    (inv.annotations || []).map(n => `${n.actor || ""} ${n.target || ""} ${n.text || ""}`).join(" "),
    (inv.seeds || []).join(" "),
  ].join(" "));
  const setB = new Set(b);
  const hits = a.filter(w => setB.has(w)).length;
  if (!hits) return 0;
  return Math.round((hits / Math.max(a.length, 1)) * 100);
}

export async function buildRsicScript() {
  try {
    const base = apiBase();
    const [rr, ir] = await Promise.all([
      fetch(`${base}/entities/RiskSignal`, { headers: hdrs }),
      fetch(`${base}/v1/investigations`, { headers: hdrs }),
    ]);
    const [rd, id_] = await Promise.all([rr.json(), ir.json()]);
    const signals = Array.isArray(rd) ? rd : rd.results || rd.items || rd.signals || [];
    const invs = Array.isArray(id_) ? id_ : id_.results || id_.items || id_.investigations || [];
    const investigated = signals.filter(s => invs.some(i => relevance(s, i) > 0)).length;
    const untracked = signals.length - investigated;
    return `Risk Signal × Investigation Coverage: ${signals.length} risk signals correlated against ${invs.length} open investigations. ${investigated} signals are INVESTIGATED (covered by an open case), ${untracked} are UNTRACKED (no investigation). ${untracked > 0 ? `Recommend opening investigations for the ${untracked} untracked risk signals to close coverage gaps.` : "Full investigation coverage across all active risk signals — well managed."}`;
  } catch {
    return "Risk signal and investigation data temporarily unavailable.";
  }
}

const BTN = {
  position: "fixed", left: 3060, bottom: 18, zIndex: 68,
  background: "rgba(0,20,40,0.82)", border: `1px solid ${CY}44`,
  color: CY, fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
  letterSpacing: 1.4, padding: "4px 8px", cursor: "pointer",
  borderRadius: 3, userSelect: "none",
};
const PANEL = {
  position: "fixed", bottom: 52, left: 2950, width: 420,
  background: "rgba(0,10,24,0.97)", border: `1px solid ${CY}55`,
  borderRadius: 6, zIndex: 200, fontFamily: "'JetBrains Mono',monospace",
  color: CY, fontSize: 10, padding: 14, maxHeight: 520, overflowY: "auto",
};
const ROW_ST = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "4px 0", borderBottom: `1px solid ${CY}18`, cursor: "pointer",
};
const BADGE = (c) => ({
  fontSize: 8, letterSpacing: 1, padding: "1px 5px",
  borderRadius: 2, background: c + "22", border: `1px solid ${c}55`, color: c,
});

const SEV_COLOR = { CRITICAL: "#FF3B3B", HIGH: "#FF7B2D", MEDIUM: AMB, LOW: GRN, INFO: CY };

export default function RiskSignalInvestigationCoverage() {
  const [open, setOpen] = useState(false);
  const [signals, setSignals] = useState([]);
  const [invCount, setInvCount] = useState(0);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const base = apiBase();
      const [rr, ir] = await Promise.all([
        fetch(`${base}/entities/RiskSignal`, { headers: hdrs }),
        fetch(`${base}/v1/investigations`, { headers: hdrs }),
      ]);
      const [rd, id_] = await Promise.all([rr.json(), ir.json()]);
      const rawSignals = Array.isArray(rd) ? rd : rd.results || rd.items || rd.signals || [];
      const rawInvs = Array.isArray(id_) ? id_ : id_.results || id_.items || id_.investigations || [];
      setInvCount(rawInvs.length);
      setSignals(rawSignals.map(s => ({
        ...s,
        matches: rawInvs
          .map(i => ({ ...i, score: relevance(s, i) }))
          .filter(i => i.score > 0)
          .sort((x, y) => y.score - x.score),
      })));
    } catch {}
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.query && !isRsicQuery(e.detail.query)) return;
      setOpen(v => !v);
    };
    window.addEventListener("jarvis:rsic-toggle", handler);
    return () => window.removeEventListener("jarvis:rsic-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const classified = signals.map(s => ({ ...s, status: s.matches?.length > 0 ? "INVESTIGATED" : "UNTRACKED" }));
  const filtered = classified
    .filter(s => tab === "ALL" || s.status === tab)
    .filter(s => !search || [s.title || s.name, s.severity, s.category, (s.tags || []).join(" ")].join(" ").toLowerCase().includes(search.toLowerCase()));

  const investigated = classified.filter(s => s.status === "INVESTIGATED").length;
  const untracked = classified.filter(s => s.status === "UNTRACKED").length;

  const assess = async () => {
    setAssessing(true); setAssessment("");
    const script = await buildRsicScript();
    setAssessment(script);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
  };

  if (!open) {
    return (
      <button style={BTN} onClick={() => setOpen(true)} title="RiskSignal × Investigation Coverage">
        ◈ RSIC{untracked > 0 && <span style={{ marginLeft: 4, color: AMB }}>▲{untracked}</span>}
      </button>
    );
  }

  return (
    <>
      <button style={{ ...BTN, borderColor: CY }} onClick={() => setOpen(false)}>◈ RSIC ✕</button>
      <div style={PANEL}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ color: CY, letterSpacing: 2, fontSize: 9 }}>RISK × INVESTIGATION</span>
          <button onClick={assess} disabled={assessing}
            style={{ fontSize: 8, color: GRN, background: "none", border: `1px solid ${GRN}44`, borderRadius: 2, padding: "1px 6px", cursor: "pointer" }}>
            {assessing ? "…" : "▶ ASSESS"}
          </button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4, marginBottom: 8 }}>
          {[
            ["SIGNALS", signals.length, CY],
            ["CASES", invCount, CY],
            ["INVESTIGATED", investigated, GRN],
            ["UNTRACKED", untracked, AMB],
          ].map(([label, val, c]) => (
            <div key={label} style={{ background: "#0a1628", borderRadius: 3, padding: "4px 6px", textAlign: "center" }}>
              <div style={{ color: c, fontSize: 13, fontWeight: 700 }}>{val}</div>
              <div style={{ color: DIM, fontSize: 7, letterSpacing: 1 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
          {["ALL", "INVESTIGATED", "UNTRACKED"].map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ fontSize: 8, padding: "2px 7px", borderRadius: 2, cursor: "pointer",
                background: tab === t ? CY + "22" : "none",
                color: tab === t ? CY : DIM,
                border: `1px solid ${tab === t ? CY + "55" : DIM + "33"}` }}>
              {t}
            </button>
          ))}
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search signals…"
            style={{ marginLeft: "auto", fontSize: 8, background: "#0a1628", border: `1px solid ${CY}33`,
              borderRadius: 2, color: CY, padding: "2px 6px", width: 110, outline: "none" }} />
        </div>

        {/* Signal rows */}
        {filtered.length === 0 && (
          <div style={{ color: DIM, fontSize: 9, textAlign: "center", padding: 12 }}>No data yet — fetching…</div>
        )}
        {filtered.map((s, i) => {
          const isExp = expanded === i;
          const sc = s.status === "INVESTIGATED" ? GRN : AMB;
          const sevC = SEV_COLOR[s.severity?.toUpperCase()] || DIM;
          return (
            <div key={s.id || s.title || i}>
              <div style={ROW_ST} onClick={() => setExpanded(isExp ? null : i)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ color: CY, fontSize: 9 }}>{s.title || s.name || s.id}</span>
                  {s.severity && <span style={{ color: sevC, fontSize: 8, marginLeft: 4 }}>[{s.severity}]</span>}
                </div>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <span style={BADGE(sc)}>{s.status}</span>
                  <span style={{ color: DIM, fontSize: 8 }}>{isExp ? "▲" : "▼"}</span>
                </div>
              </div>
              {isExp && (
                <div style={{ background: "#060f1e", borderRadius: 3, padding: "6px 8px", marginBottom: 4 }}>
                  {s.matches?.length > 0 ? (
                    s.matches.slice(0, 6).map((inv, j) => (
                      <div key={j} style={{ marginBottom: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                          <span style={{ color: CY, fontSize: 8 }}>{inv.title || inv.id}</span>
                          <span style={{ color: GRN, fontSize: 8 }}>{inv.score}%</span>
                        </div>
                        <div style={{ height: 3, background: CY + "18", borderRadius: 2 }}>
                          <div style={{ height: "100%", width: `${inv.score}%`, background: GRN, borderRadius: 2 }} />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: AMB, fontSize: 8 }}>No investigation tracking this risk signal.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {assessment && (
          <div style={{ marginTop: 8, background: "#0a1628", borderRadius: 3, padding: 8, color: GRN, fontSize: 8, lineHeight: 1.5 }}>
            {assessment}
          </div>
        )}
      </div>
    </>
  );
}
