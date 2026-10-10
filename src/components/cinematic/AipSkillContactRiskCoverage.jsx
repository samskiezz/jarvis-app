import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const AM = "#FFB300"; const GN = "#4CAF50"; const RD = "#FF3D3D";
const CY = "#00E5FF"; const OR = "#FF9800"; const PU = "#CE93D8";
const DIM = "rgba(255,255,255,0.04)"; const BG = "rgba(6,10,18,0.94)";
const MN = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const REFRESH_MS = 90_000;
const BTN_LEFT   = 1103440;
const Z_IDX      = 686;

/* ── normalizers ─────────────────────────────────────────────────────────── */
function normSkills(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.skills ?? raw.data ?? raw.items ?? []);
  return arr.map((s, i) => ({
    id:       String(s.id       ?? s.skill_id   ?? i),
    name:     String(s.name     ?? s.title      ?? s.label ?? `Skill-${i}`),
    category: String(s.category ?? s.type       ?? ""),
    domain:   String(s.domain   ?? s.area       ?? ""),
    tags:     Array.isArray(s.tags) ? s.tags.map(String) : [],
    desc:     String(s.description ?? s.detail ?? s.summary ?? ""),
  }));
}

function normContacts(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.contacts ?? raw.data ?? raw.items ?? []);
  return arr.map((c, i) => ({
    id:   String(c.id   ?? c.contact_id ?? i),
    name: String(c.name ?? c.full_name  ?? c.label ?? `Contact-${i}`),
    role: String(c.role ?? c.title      ?? c.position ?? ""),
    org:  String(c.org  ?? c.organization ?? c.company ?? ""),
    tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
    desc: String(c.description ?? c.notes ?? c.bio ?? ""),
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

function overlap(sToks, obj) {
  const oToks = tokens(
    obj.name + " " + (obj.desc || "") + " " + (obj.tags || []).join(" ") +
    " " + (obj.role || "") + " " + (obj.org || "") + " " + (obj.category || "") + " " + (obj.domain || "")
  );
  return sToks.filter(t => oToks.includes(t)).length;
}

/* ── classification ──────────────────────────────────────────────────────── */
function classify(skill, contacts, signals) {
  const tt = tokens(skill.name + " " + skill.category + " " + skill.domain + " " + skill.tags.join(" ") + " " + skill.desc);
  const hasContact = contacts.some(c => overlap(tt, c) >= 1);
  const hasSignal  = signals.some(s  => overlap(tt, s) >= 1);
  if (hasContact && hasSignal) return "FULLY_COVERED";
  if (hasContact)              return "CONTACT_LINKED";
  if (hasSignal)               return "RISK_FLAGGED";
  return "UNCOVERED";
}

function matchItems(skill, list) {
  const tt = tokens(skill.name + " " + skill.category + " " + skill.domain + " " + skill.tags.join(" "));
  return list.filter(x => overlap(tt, x) >= 1).slice(0, 4);
}

function relevanceScore(skill, item) {
  const tt = tokens(skill.name + " " + skill.category + " " + skill.domain + " " + skill.tags.join(" "));
  return Math.min(1, overlap(tt, item) / 3);
}

/* ── build script (exported for JarvisBrain) ─────────────────────────────── */
export async function buildPcrcovScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [skR, coR, siR] = await Promise.all([
    fetch(`${base}/v1/aip/skill`,          { headers }),
    fetch(`${base}/entities/Contact`,      { headers }),
    fetch(`${base}/entities/RiskSignal`,   { headers }),
  ]);
  const [skJ, coJ, siJ] = await Promise.all([skR.json(), coR.json(), siR.json()]);
  const skills   = normSkills(skJ);
  const contacts = normContacts(coJ);
  const signals  = normSignals(siJ);
  const classified = skills.map(s => ({ ...s, cls: classify(s, contacts, signals) }));
  const fullyCov     = classified.filter(s => s.cls === "FULLY_COVERED").length;
  const contactOnly  = classified.filter(s => s.cls === "CONTACT_LINKED").length;
  const riskOnly     = classified.filter(s => s.cls === "RISK_FLAGGED").length;
  const uncovered    = classified.filter(s => s.cls === "UNCOVERED").length;
  const pct = skills.length ? Math.round((fullyCov / skills.length) * 100) : 0;
  return `PCRCOV online, sir. ${skills.length} AIP skills correlated against ${contacts.length} personnel contacts and ${signals.length} risk signals. ` +
    `${fullyCov} fully covered, ${contactOnly} contact-linked, ${riskOnly} risk-flagged, ${uncovered} uncovered — ${pct}% full coverage.`;
}

/* ── voice trigger ───────────────────────────────────────────────────────── */
export function isPcrcovQuery(q) {
  const lower = (q || "").toLowerCase();
  return /pcrcov|personnel capability risk|skill contact risk|capability coverage|risk skill coverage|skill personnel|aip skill contact|skill risk coverage/.test(lower);
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
  FULLY_COVERED:  { color: GN,  label: "FULLY COVERED"  },
  CONTACT_LINKED: { color: CY,  label: "CONTACT LINKED" },
  RISK_FLAGGED:   { color: AM,  label: "RISK FLAGGED"   },
  UNCOVERED:      { color: RD,  label: "UNCOVERED"      },
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
export default function AipSkillContactRiskCoverage() {
  const [open, setOpen]         = useState(false);
  const [skills, setSkills]     = useState([]);
  const [contacts, setContacts] = useState([]);
  const [signals, setSignals]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const base = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [skR, coR, siR] = await Promise.all([
        fetch(`${base}/v1/aip/skill`,        { headers }),
        fetch(`${base}/entities/Contact`,    { headers }),
        fetch(`${base}/entities/RiskSignal`, { headers }),
      ]);
      const [skJ, coJ, siJ] = await Promise.all([skR.json(), coR.json(), siR.json()]);
      const sk = normSkills(skJ);
      const co = normContacts(coJ);
      const si = normSignals(siJ);
      const classified = sk.map(s => ({
        ...s,
        cls:            classify(s, co, si),
        matchedContacts: matchItems(s, co),
        matchedSignals:  matchItems(s, si),
      }));
      setSkills(classified); setContacts(co); setSignals(si);
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener("jarvis:pcrcov-toggle", handler);
    return () => window.removeEventListener("jarvis:pcrcov-toggle", handler);
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
      const script = await buildPcrcovScript();
      const base = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
      const chatR = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers,
        body: JSON.stringify({ message: `PCRCOV assessment: ${script}. Provide a 2-sentence personnel capability risk coverage brief.` }),
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
          background: "rgba(206,147,216,0.08)", border: "1px solid rgba(206,147,216,0.35)",
          color: PU, fontFamily: MN, fontSize: 10, padding: "4px 9px", borderRadius: 4,
          cursor: "pointer", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
        ◈ PCRCOV
      </button>
    );
  }

  const fullyCov    = skills.filter(s => s.cls === "FULLY_COVERED").length;
  const contactOnly = skills.filter(s => s.cls === "CONTACT_LINKED").length;
  const riskOnly    = skills.filter(s => s.cls === "RISK_FLAGGED").length;
  const uncovered   = skills.filter(s => s.cls === "UNCOVERED").length;
  const covPct = skills.length ? Math.round((fullyCov / skills.length) * 100) : 0;

  const TABS = ["ALL", "FULLY_COVERED", "CONTACT_LINKED", "RISK_FLAGGED", "UNCOVERED"];
  const visible = skills.filter(s => {
    if (filter !== "ALL" && s.cls !== filter) return false;
    if (search) {
      const lc = search.toLowerCase();
      return s.name.toLowerCase().includes(lc) || s.category.toLowerCase().includes(lc) || s.domain.toLowerCase().includes(lc);
    }
    return true;
  });

  return (
    <div style={{ position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh",
      background: "rgba(0,0,0,0.55)", zIndex: Z_IDX, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: BG, border: "1px solid rgba(206,147,216,0.18)", borderRadius: 10,
        width: "min(960px,96vw)", maxHeight: "88vh", display: "flex", flexDirection: "column",
        boxShadow: "0 0 40px rgba(0,0,0,0.7)", overflow: "hidden" }}>

        {/* header */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)",
          display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: MN, fontSize: 11, color: PU, fontWeight: 700, letterSpacing: "0.08em" }}>
            ◈ PCRCOV — AIP Skill × Contact × RiskSignal Personnel Capability Risk Coverage
          </span>
          <span style={{ marginLeft: "auto", fontFamily: MN, fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
            {skills.length} skills · {contacts.length} contacts · {signals.length} signals
          </span>
          {uncovered > 0 && (
            <span style={{ fontFamily: MN, fontSize: 10, fontWeight: 700, color: AM,
              border: `1px solid ${AM}`, borderRadius: 3, padding: "1px 6px" }}>
              {uncovered} UNCOVERED
            </span>
          )}
          <button onClick={() => setOpen(false)}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)",
              fontSize: 16, cursor: "pointer", padding: "0 4px" }}>✕</button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 8, padding: "10px 14px", flexWrap: "wrap" }}>
          <StatTile label="AIP SKILLS"     value={skills.length}   color={PU} />
          <StatTile label="CONTACTS"       value={contacts.length} color={CY} />
          <StatTile label="RISK SIGNALS"   value={signals.length}  color={RD} />
          <StatTile label="FULLY COVERED"  value={fullyCov}        color={GN} />
          <StatTile label="CONTACT LINKED" value={contactOnly}     color={CY} />
          <StatTile label="RISK FLAGGED"   value={riskOnly}        color={AM} />
          <StatTile label="UNCOVERED"      value={uncovered}       color={RD} />
          <StatTile label="COV%"           value={`${covPct}%`}    color={covPct >= 70 ? GN : covPct >= 40 ? AM : RD} />
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
              style={{ background: filter === t ? "rgba(206,147,216,0.15)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${filter === t ? PU : "rgba(255,255,255,0.12)"}`,
                color: filter === t ? PU : "rgba(255,255,255,0.5)",
                fontFamily: MN, fontSize: 9, padding: "3px 8px", borderRadius: 4,
                cursor: "pointer", letterSpacing: "0.05em" }}>
              {t.replace(/_/g, " ")}
            </button>
          ))}
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search skills…"
            style={{ marginLeft: "auto", background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.12)", color: "#fff",
              fontFamily: MN, fontSize: 10, padding: "3px 8px", borderRadius: 4, width: 140 }} />
        </div>

        {/* assess button */}
        <div style={{ padding: "0 14px 8px" }}>
          <button onClick={assess} disabled={assessing}
            style={{ background: assessing ? "rgba(206,147,216,0.05)" : "rgba(206,147,216,0.12)",
              border: `1px solid ${assessing ? "rgba(206,147,216,0.2)" : PU}`,
              color: assessing ? "rgba(206,147,216,0.4)" : PU,
              fontFamily: MN, fontSize: 10, padding: "5px 14px", borderRadius: 4,
              cursor: assessing ? "default" : "pointer", letterSpacing: "0.06em" }}>
            {assessing ? "▶ ASSESSING…" : "▶ ASSESS CAPABILITY COVERAGE"}
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
              fontFamily: MN, fontSize: 11, padding: 32 }}>No skills match.</div>
          )}
          {visible.map(s => (
            <div key={s.id}
              style={{ marginBottom: 4, borderRadius: 6,
                background: s.cls === "UNCOVERED" ? "rgba(255,61,61,0.06)" : DIM,
                border: s.cls === "UNCOVERED"
                  ? "1px solid rgba(255,61,61,0.18)"
                  : "1px solid rgba(255,255,255,0.06)",
                animation: s.cls === "UNCOVERED" ? "pulse 2s infinite" : "none" }}>
              <div onClick={() => setExpanded(e => e === s.id ? null : s.id)}
                style={{ padding: "8px 12px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: MN, fontSize: 11, color: PU, flex: 1, fontWeight: 600 }}>
                  {s.name}
                </span>
                {s.category && (
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontFamily: MN }}>{s.category}</span>
                )}
                {s.domain && (
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontFamily: MN }}>{s.domain}</span>
                )}
                <ClsBadge cls={s.cls} />
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: MN }}>
                  {expanded === s.id ? "▲" : "▼"}
                </span>
              </div>
              {expanded === s.id && (
                <div style={{ padding: "0 12px 12px", display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {/* contacts */}
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 9, color: CY, fontFamily: MN, fontWeight: 700,
                      marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Contacts ({s.matchedContacts.length})
                    </div>
                    {s.matchedContacts.length === 0
                      ? <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: MN }}>None matched.</div>
                      : s.matchedContacts.map(c => (
                          <div key={c.id} style={{ background: "rgba(0,229,255,0.07)", borderRadius: 4, padding: "5px 8px", marginBottom: 4 }}>
                            <div style={{ fontSize: 10, color: "#fff", fontFamily: MN }}>{c.name}</div>
                            {c.role && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>{c.role}</div>}
                            <RelevanceBar score={relevanceScore(s, c)} color={CY} />
                          </div>
                        ))}
                  </div>
                  {/* risk signals */}
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 9, color: RD, fontFamily: MN, fontWeight: 700,
                      marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Risk Signals ({s.matchedSignals.length})
                    </div>
                    {s.matchedSignals.length === 0
                      ? <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: MN }}>None matched.</div>
                      : s.matchedSignals.map(r => (
                          <div key={r.id} style={{ background: "rgba(255,61,61,0.07)", borderRadius: 4, padding: "5px 8px", marginBottom: 4 }}>
                            <div style={{ fontSize: 10, color: "#fff", fontFamily: MN }}>{r.name}</div>
                            {r.severity && <div style={{ fontSize: 9, color: AM, fontFamily: MN }}>{r.severity}</div>}
                            <RelevanceBar score={relevanceScore(s, r)} color={RD} />
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
