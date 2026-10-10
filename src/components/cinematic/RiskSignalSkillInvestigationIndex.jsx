import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const AM = "#FFB300"; const CY = "#00E5FF"; const GN = "#4CAF50";
const OR = "#FF9800"; const RD = "#FF3D3D";
const DIM = "rgba(255,255,255,0.04)"; const BG = "rgba(6,10,18,0.94)";
const MN = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const REFRESH_MS = 90_000;
const BTN_LEFT   = 1096160;
const Z_IDX      = 673;

const RSIRIX_RE = /\b(rsirix|risk intel response|risk response index|threat intelligence response|skill investigation coverage|unaddressed risk[s]?)\b/i;
export function isRsirixQuery(t) { return RSIRIX_RE.test(t || ""); }

function tokens(s) {
  return String(s || "").toLowerCase().split(/[\s,;:|\/\-_]+/).filter(w => w.length > 3);
}
function overlap(a, b) {
  const sa = new Set(tokens(a));
  let n = 0;
  for (const w of tokens(b)) if (sa.has(w)) n++;
  return n;
}

function normRisks(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.results) ? raw.results
    : Array.isArray(raw?.data) ? raw.data
    : Array.isArray(raw?.items) ? raw.items
    : [];
  return arr.map(r => ({
    id: r.id || r._id || "",
    label: r.name || r.title || r.signal || r.label || r.description || String(r.id || ""),
    severity: r.severity || r.level || r.risk_level || "medium",
    category: r.category || r.type || "",
  }));
}

function normSkills(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.skills) ? raw.skills
    : Array.isArray(raw?.results) ? raw.results
    : Array.isArray(raw?.data) ? raw.data
    : [];
  return arr.map(s => ({
    id: s.id || s.skill_id || "",
    label: s.name || s.title || s.skill_name || s.label || String(s.id || ""),
    description: s.description || s.summary || "",
  }));
}

function normInvestigations(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.investigations) ? raw.investigations
    : Array.isArray(raw?.results) ? raw.results
    : Array.isArray(raw?.data) ? raw.data
    : [];
  return arr.map(i => ({
    id: i.id || i._id || "",
    label: i.name || i.title || i.subject || i.label || String(i.id || ""),
    status: i.status || i.state || "open",
  }));
}

function classify(risk, skills, investigations) {
  const hasSkill = skills.some(s => overlap(risk.label, s.label + " " + s.description) >= 1);
  const hasInv   = investigations.some(i => overlap(risk.label, i.label) >= 1 && i.status !== "closed");
  if (hasSkill && hasInv)  return "FULLY_ADDRESSED";
  if (hasSkill)            return "AUTOMATED_ONLY";
  if (hasInv)              return "INVESTIGATED_ONLY";
  return "UNADDRESSED";
}

const COV_COLOR = {
  FULLY_ADDRESSED:   GN,
  AUTOMATED_ONLY:    CY,
  INVESTIGATED_ONLY: OR,
  UNADDRESSED:       RD,
};
const COV_LABEL = {
  FULLY_ADDRESSED:   "Fully Addressed",
  AUTOMATED_ONLY:    "Automated Only",
  INVESTIGATED_ONLY: "Investigated Only",
  UNADDRESSED:       "Unaddressed",
};

export async function buildRsirixScript() {
  const h = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
  const base = apiBase();

  const [rR, sR, iR] = await Promise.allSettled([
    fetch(`${base}/entities/RiskSignal`, { headers: h }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/v1/aip/skill`,        { headers: h }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/v1/investigations`,   { headers: h }).then(r => r.ok ? r.json() : []),
  ]);

  const risks  = normRisks(rR.status === "fulfilled" ? rR.value : []);
  const skills = normSkills(sR.status === "fulfilled" ? sR.value : []);
  const invs   = normInvestigations(iR.status === "fulfilled" ? iR.value : []);

  if (!risks.length) return "RSIRIX online, sir. No active risk signals detected at this time.";

  const counts = { FULLY_ADDRESSED: 0, AUTOMATED_ONLY: 0, INVESTIGATED_ONLY: 0, UNADDRESSED: 0 };
  for (const r of risks) counts[classify(r, skills, invs)]++;

  const pct = n => risks.length ? Math.round((n / risks.length) * 100) : 0;
  const top = risks
    .filter(r => classify(r, skills, invs) === "UNADDRESSED")
    .slice(0, 3)
    .map(r => r.label)
    .join(", ") || "none";

  return (
    `RSIRIX online, sir. Analysing ${risks.length} active risk signals against ${skills.length} AIP automation skills and ${invs.length} open investigations. ` +
    `${pct(counts.FULLY_ADDRESSED)}% fully addressed — covered by both automation and investigation. ` +
    `${pct(counts.AUTOMATED_ONLY)}% automated only — no active investigation thread. ` +
    `${pct(counts.INVESTIGATED_ONLY)}% investigated only — no automation skill mapped. ` +
    `${pct(counts.UNADDRESSED)}% unaddressed — ${counts.UNADDRESSED} risk signal${counts.UNADDRESSED !== 1 ? "s" : ""} with no coverage at all. ` +
    (counts.UNADDRESSED > 0 ? `Top unaddressed signals: ${top}. Recommend immediate triage.` : "All signals have at least one response layer active.")
  );
}

const TABS = ["ALL", "FULLY_ADDRESSED", "AUTOMATED_ONLY", "INVESTIGATED_ONLY", "UNADDRESSED"];

export default function RiskSignalSkillInvestigationIndex() {
  const [open,   setOpen]   = useState(false);
  const [risks,  setRisks]  = useState([]);
  const [skills, setSkills] = useState([]);
  const [invs,   setInvs]   = useState([]);
  const [busy,   setBusy]   = useState(false);
  const [tab,    setTab]    = useState("ALL");
  const [q,      setQ]      = useState("");
  const [pulse,  setPulse]  = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const h = { Authorization: `Bearer ${API_KEY}` };
      const base = apiBase();
      const [rR, sR, iR] = await Promise.allSettled([
        fetch(`${base}/entities/RiskSignal`, { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/v1/aip/skill`,        { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/v1/investigations`,   { headers: h }).then(r => r.ok ? r.json() : []),
      ]);
      setRisks(normRisks(rR.status === "fulfilled" ? rR.value : []));
      setSkills(normSkills(sR.status === "fulfilled" ? sR.value : []));
      setInvs(normInvestigations(iR.status === "fulfilled" ? iR.value : []));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:rsirix-toggle", onToggle);
    return () => window.removeEventListener("jarvis:rsirix-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const classified = risks.map(r => ({ ...r, cov: classify(r, skills, invs) }));
  const counts = { FULLY_ADDRESSED: 0, AUTOMATED_ONLY: 0, INVESTIGATED_ONLY: 0, UNADDRESSED: 0 };
  for (const r of classified) counts[r.cov]++;

  const unaddressed = counts.UNADDRESSED;

  useEffect(() => {
    if (unaddressed > 0) {
      const id = setInterval(() => setPulse(p => !p), 800);
      return () => clearInterval(id);
    }
    setPulse(false);
  }, [unaddressed]);

  const visible = classified.filter(r => {
    if (tab !== "ALL" && r.cov !== tab) return false;
    if (q.trim()) {
      const qlo = q.toLowerCase();
      return r.label.toLowerCase().includes(qlo) || r.category.toLowerCase().includes(qlo);
    }
    return true;
  });

  const assess = useCallback(async () => {
    try {
      const script = await buildRsirixScript();
      const voice = getActiveVoice ? getActiveVoice() : "en-GB-Neural2-B";
      const base = apiBase();
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text: script, voice }),
      });
    } catch { /* tts non-critical */ }
  }, []);

  const total = risks.length || 1;
  const pct   = n => Math.round((n / total) * 100);

  const SEV_COLOR = { high: RD, critical: RD, medium: OR, low: GN };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="RiskSignal × AIP Skill × Investigation Intelligence Response Index"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_IDX,
          background: "rgba(255,61,61,0.13)", border: `1px solid ${RD}44`,
          color: RD, fontFamily: MN, fontSize: 9, letterSpacing: 1.5,
          padding: "4px 8px", borderRadius: 3, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 5,
        }}
      >
        ◈ RSIRIX
        {unaddressed > 0 && (
          <span style={{
            background: pulse ? RD : "rgba(255,61,61,0.6)",
            color: "#fff", borderRadius: 8, padding: "1px 5px",
            fontSize: 8, fontWeight: 700, transition: "background 0.3s",
          }}>{unaddressed}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_IDX,
      width: 540, maxHeight: "86vh", background: BG,
      border: `1px solid ${RD}55`, borderRadius: 6,
      fontFamily: MN, fontSize: 10, color: "#c8d4e0",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "7px 10px", borderBottom: `1px solid ${RD}33`,
        background: "rgba(255,61,61,0.06)",
      }}>
        <span style={{ color: RD, letterSpacing: 2, fontWeight: 700, fontSize: 9 }}>
          ◈ RSIRIX — RISK INTELLIGENCE RESPONSE INDEX
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={load} disabled={busy}
            style={{ background: "none", border: `1px solid ${CY}44`, color: CY,
              fontFamily: MN, fontSize: 8, padding: "2px 7px", borderRadius: 3, cursor: "pointer" }}>
            {busy ? "…" : "↺"}
          </button>
          <button onClick={() => setOpen(false)}
            style={{ background: "none", border: `1px solid ${RD}44`, color: RD,
              fontFamily: MN, fontSize: 8, padding: "2px 7px", borderRadius: 3, cursor: "pointer" }}>
            ✕
          </button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 10px", borderBottom: `1px solid ${DIM}` }}>
        {[
          { label: "RISK SIGNALS",  val: risks.length,    c: RD },
          { label: "AIP SKILLS",    val: skills.length,   c: CY },
          { label: "INVESTIGATIONS",val: invs.length,     c: OR },
          { label: "UNADDRESSED",   val: unaddressed,     c: unaddressed > 0 ? RD : GN },
        ].map(({ label, val, c }) => (
          <div key={label} style={{
            flex: 1, background: DIM, border: `1px solid ${c}33`,
            borderRadius: 4, padding: "5px 6px", textAlign: "center",
          }}>
            <div style={{ color: c, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ fontSize: 7, color: "#8899aa", letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: "6px 10px 2px", borderBottom: `1px solid ${DIM}` }}>
        <div style={{ fontSize: 8, color: "#8899aa", letterSpacing: 1, marginBottom: 4 }}>RESPONSE COVERAGE</div>
        <div style={{ display: "flex", height: 8, borderRadius: 3, overflow: "hidden", gap: 1 }}>
          {Object.entries(counts).filter(([, v]) => v > 0).map(([k, v]) => (
            <div key={k} title={`${COV_LABEL[k]}: ${v}`}
              style={{ flex: v, background: COV_COLOR[k], opacity: 0.85 }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          {Object.entries(counts).map(([k, v]) => (
            <span key={k} style={{ color: COV_COLOR[k], fontSize: 7 }}>
              {pct(v)}% {COV_LABEL[k]}
            </span>
          ))}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "5px 10px 0", overflowX: "auto" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              background: tab === t ? `${COV_COLOR[t] || CY}22` : "none",
              border: `1px solid ${tab === t ? (COV_COLOR[t] || CY) : "#334"}`,
              color: tab === t ? (COV_COLOR[t] || CY) : "#667",
              fontFamily: MN, fontSize: 7, padding: "2px 7px",
              borderRadius: 3, cursor: "pointer", whiteSpace: "nowrap",
            }}>
            {t === "ALL" ? `ALL (${risks.length})` : `${COV_LABEL[t]} (${counts[t]})`}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: "6px 10px" }}>
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="filter risk signals…"
          style={{
            width: "100%", boxSizing: "border-box",
            background: DIM, border: `1px solid #334`,
            color: "#c8d4e0", fontFamily: MN, fontSize: 9,
            padding: "4px 8px", borderRadius: 3, outline: "none",
          }}
        />
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 10px 6px" }}>
        {busy && !risks.length ? (
          <div style={{ color: "#667", textAlign: "center", padding: 16, fontSize: 9 }}>Loading…</div>
        ) : visible.length === 0 ? (
          <div style={{ color: "#667", textAlign: "center", padding: 16, fontSize: 9 }}>No signals match filter.</div>
        ) : visible.map(r => (
          <div key={r.id || r.label} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "4px 6px", marginBottom: 2,
            background: DIM, border: `1px solid ${COV_COLOR[r.cov]}22`,
            borderLeft: `2px solid ${COV_COLOR[r.cov]}`,
            borderRadius: 3,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "#dde8f0", fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.label}
              </div>
              <div style={{ color: "#667", fontSize: 7 }}>
                {r.category && <span style={{ marginRight: 6 }}>{r.category}</span>}
                <span style={{ color: SEV_COLOR[r.severity] || OR }}>{r.severity}</span>
              </div>
            </div>
            <span style={{
              color: COV_COLOR[r.cov], fontSize: 7, letterSpacing: 0.5,
              marginLeft: 8, whiteSpace: "nowrap",
            }}>
              {COV_LABEL[r.cov]}
            </span>
          </div>
        ))}
      </div>

      {/* Assess button */}
      <div style={{ padding: "6px 10px 8px", borderTop: `1px solid ${DIM}` }}>
        <button onClick={assess}
          style={{
            width: "100%", background: `${RD}15`, border: `1px solid ${RD}55`,
            color: RD, fontFamily: MN, fontSize: 8, letterSpacing: 1.5,
            padding: "5px 0", borderRadius: 3, cursor: "pointer",
          }}>
          ASSESS RESPONSE COVERAGE
        </button>
      </div>
    </div>
  );
}
