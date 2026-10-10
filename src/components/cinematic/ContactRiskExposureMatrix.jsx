/**
 * ContactRiskExposureMatrix — F53.
 *
 * Parallel-fetches /entities/Contact + /entities/RiskSignal and
 * keyword-correlates each contact's name / role / org / dept / tags
 * against risk signal titles / descriptions / categories to surface:
 *
 *   AT_RISK — contact has ≥1 keyword match with an active risk signal
 *   CLEAR   — no signal overlaps detected
 *
 * Stat tiles: contacts / signals / at_risk / clear.
 * Red pulse:  AT_RISK count badge on toggle button.
 * Filter tabs: ALL | AT_RISK | CLEAR + text search.
 * Expand contact → matched risk signal cards with severity badge + relevance bar.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence personnel risk brief + TTS.
 *
 * Toggle:  ◈ CRSE at left:978760, bottom:8, zIndex:125.
 * Event:   jarvis:crse-toggle
 * Voice:   "crse" / "contact risk" / "personnel risk" / "at risk contacts" /
 *          "exposed personnel" / "who is at risk" / "contact exposure matrix" /
 *          "personnel exposure"
 * Refresh: 90s auto-refresh while open.
 * Additive only — mounted via App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const RD  = "#FF3D3D";
const CY  = "#00E5FF";
const AM  = "#FFB300";
const GR  = "#4CAF50";
const DIM = "rgba(255,255,255,0.04)";
const BG  = "rgba(6,10,18,0.94)";
const MN  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";
const REFRESH_MS = 90_000;
const BTN_LEFT   = 978760;
const Z_IDX      = 125;

const CRSE_RE =
  /\b(crse|contact[._\-\s]risk|personnel[._\-\s]risk|at[._\-\s]risk[._\-\s]contacts?|exposed[._\-\s]personnel|who[._\-\s]is[._\-\s]at[._\-\s]risk|contact[._\-\s]exposure[._\-\s]matrix|personnel[._\-\s]exposure)\b/i;

export function isCrseQuery(t) {
  return CRSE_RE.test(t || "");
}

// ── normalisers ───────────────────────────────────────────────────────────────

function normContacts(raw) {
  if (!raw) return [];
  const arr = raw.items || raw.contacts || raw.data || raw.results || (Array.isArray(raw) ? raw : []);
  return arr.map((c, i) => ({
    id:   c.id || String(i),
    name: c.name || c.full_name || c.fullName || `Contact ${i + 1}`,
    role: c.role || c.title || c.position || "",
    org:  c.org || c.organization || c.company || "",
    dept: c.department || c.dept || "",
    tags: Array.isArray(c.tags) ? c.tags.join(" ") : (c.tags || ""),
  }));
}

function normSignals(raw) {
  if (!raw) return [];
  const arr = raw.items || raw.signals || raw.data || raw.results || (Array.isArray(raw) ? raw : []);
  return arr.map((s, i) => ({
    id:       s.id || String(i),
    title:    s.title || s.name || s.signal || `Signal ${i + 1}`,
    severity: (s.severity || s.level || s.priority || "medium").toLowerCase(),
    desc:     s.description || s.summary || s.detail || "",
    category: s.category || s.type || "",
  }));
}

function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function relevance(contact, signal) {
  const cWords = new Set(
    tokens(`${contact.name} ${contact.role} ${contact.org} ${contact.dept} ${contact.tags}`)
  );
  const sWords = tokens(`${signal.title} ${signal.desc} ${signal.category}`);
  const hits = sWords.filter(w => cWords.has(w));
  return hits.length / Math.max(sWords.length, 1);
}

function classify(contacts, signals) {
  return contacts.map(c => {
    const matches = signals
      .map(s => ({ ...s, score: relevance(c, s) }))
      .filter(s => s.score > 0)
      .sort((a, b) => {
        const sev = { critical: 4, high: 3, medium: 2, low: 1 };
        return (sev[b.severity] || 0) - (sev[a.severity] || 0) || b.score - a.score;
      });
    return { ...c, status: matches.length > 0 ? "AT_RISK" : "CLEAR", matches };
  });
}

// ── voice script ─────────────────────────────────────────────────────────────

export async function buildCrseScript() {
  const base = apiBase();
  const [cRaw, sRaw] = await Promise.all([
    fetch(`${base}/entities/Contact`,    { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
  ]);
  const contacts = normContacts(cRaw);
  const signals  = normSignals(sRaw);
  const rows     = classify(contacts, signals);
  const atRisk   = rows.filter(r => r.status === "AT_RISK").length;
  const critical = rows.filter(r => r.matches.some(m => m.severity === "critical")).length;
  return `Contact Risk Exposure Matrix online, sir. Of ${contacts.length} contacts cross-referenced against ${signals.length} active risk signals, ${atRisk} personnel are flagged AT_RISK — ${critical} with critical-severity exposure. I recommend immediate review of the highlighted personnel.`;
}

// ── severity badge colour ─────────────────────────────────────────────────────

function sevColour(s) {
  if (s === "critical") return RD;
  if (s === "high")     return AM;
  if (s === "medium")   return "#FF9800";
  return GR;
}

// ── component ────────────────────────────────────────────────────────────────

export default function ContactRiskExposureMatrix() {
  const [open,     setOpen]     = useState(false);
  const [rows,     setRows]     = useState([]);
  const [contacts, setContacts] = useState(0);
  const [signals,  setSignals]  = useState(0);
  const [loading,  setLoading]  = useState(false);
  const [err,      setErr]      = useState(null);
  const [filter,   setFilter]   = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    if (loading) return;
    setLoading(true); setErr(null);
    try {
      const base = apiBase();
      const [cRaw, sRaw] = await Promise.all([
        fetch(`${base}/entities/Contact`,    { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
      ]);
      const c = normContacts(cRaw);
      const s = normSignals(sRaw);
      setContacts(c.length);
      setSignals(s.length);
      setRows(classify(c, s));
    } catch (e) {
      setErr(e.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:crse-toggle", toggle);
    return () => window.removeEventListener("jarvis:crse-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timer.current); return; }
    load();
    timer.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const atRisk = rows.filter(r => r.status === "AT_RISK").length;

  const visible = rows
    .filter(r => filter === "ALL" || r.status === filter)
    .filter(r => !search || `${r.name} ${r.role} ${r.org}`.toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildCrseScript();
      const base = apiBase();
      const voice = getActiveVoice ? getActiveVoice() : "ash";
      await fetch(`${base}/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: script, voice }),
      }).then(async r => {
        if (r.ok) {
          const blob = await r.blob();
          const url  = URL.createObjectURL(blob);
          new Audio(url).play();
        }
      });
    } catch { /* silent */ }
    setAssessing(false);
  }

  const btnStyle = {
    position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_IDX,
    background: atRisk > 0 ? "rgba(255,61,61,0.12)" : "rgba(0,229,255,0.07)",
    border: `1px solid ${atRisk > 0 ? RD : CY}44`,
    color: atRisk > 0 ? RD : CY,
    fontFamily: MN, fontSize: 9, letterSpacing: 1.5, padding: "4px 8px",
    cursor: "pointer", borderRadius: 3,
  };

  const panelStyle = {
    position: "fixed", bottom: 36, left: BTN_LEFT - 360, width: 560, maxHeight: "70vh",
    overflowY: "auto", background: BG, border: `1px solid ${RD}44`,
    borderRadius: 6, zIndex: Z_IDX + 1, fontFamily: MN, fontSize: 11,
    color: "rgba(255,255,255,0.85)", padding: 16,
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(v => !v)}>
        ◈ CRSE
        {atRisk > 0 && (
          <span style={{
            marginLeft: 5, background: RD, color: "#fff",
            borderRadius: 9, padding: "1px 5px", fontSize: 8,
            animation: "pulse 1.4s infinite",
          }}>{atRisk}</span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ color: RD, letterSpacing: 2, fontSize: 10 }}>
              ◈ CONTACT RISK EXPOSURE MATRIX
            </span>
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 14 }}>
              ×
            </button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 12 }}>
            {[
              ["CONTACTS", contacts, CY],
              ["SIGNALS",  signals,  AM],
              ["AT RISK",  atRisk,   RD],
              ["CLEAR",    rows.length - atRisk, GR],
            ].map(([label, val, col]) => (
              <div key={label} style={{ background: DIM, border: `1px solid ${col}22`, borderRadius: 4, padding: "6px 8px", textAlign: "center" }}>
                <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 8, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {["ALL", "AT_RISK", "CLEAR"].map(t => (
              <button key={t} onClick={() => setFilter(t)}
                style={{
                  background: filter === t ? `${t === "AT_RISK" ? RD : CY}22` : "transparent",
                  border: `1px solid ${filter === t ? (t === "AT_RISK" ? RD : CY) : "rgba(255,255,255,0.12)"}`,
                  color: filter === t ? (t === "AT_RISK" ? RD : CY) : "rgba(255,255,255,0.5)",
                  fontFamily: MN, fontSize: 9, padding: "3px 8px", borderRadius: 3, cursor: "pointer",
                  letterSpacing: 1,
                }}>
                {t}
              </button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search contacts…"
              style={{
                marginLeft: "auto", background: DIM, border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.7)", fontFamily: MN, fontSize: 9, padding: "3px 8px",
                borderRadius: 3, outline: "none", width: 130,
              }}
            />
          </div>

          {/* rows */}
          {loading && <div style={{ color: CY, fontSize: 9, letterSpacing: 1, padding: "8px 0" }}>◌ LOADING…</div>}
          {err && <div style={{ color: RD, fontSize: 9, padding: "8px 0" }}>⚠ {err}</div>}
          {!loading && visible.map(row => (
            <div key={row.id} style={{
              background: DIM, borderRadius: 4,
              border: `1px solid ${row.status === "AT_RISK" ? RD + "44" : "rgba(255,255,255,0.07)"}`,
              marginBottom: 4, padding: "7px 10px", cursor: row.matches.length > 0 ? "pointer" : "default",
            }} onClick={() => row.matches.length > 0 && setExpanded(expanded === row.id ? null : row.id)}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  color: row.status === "AT_RISK" ? RD : GR, fontSize: 8,
                  letterSpacing: 1, minWidth: 52,
                }}>{row.status}</span>
                <span style={{ color: "rgba(255,255,255,0.85)", flex: 1, fontSize: 10 }}>{row.name}</span>
                {row.role && <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 8 }}>{row.role}</span>}
                {row.matches.length > 0 && (
                  <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 9 }}>
                    {expanded === row.id ? "▲" : "▼"}
                  </span>
                )}
              </div>

              {/* expanded signal matches */}
              {expanded === row.id && row.matches.map(m => (
                <div key={m.id} style={{
                  marginTop: 5, marginLeft: 60, padding: "5px 8px",
                  background: "rgba(255,61,61,0.06)", borderRadius: 3,
                  borderLeft: `2px solid ${sevColour(m.severity)}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      color: sevColour(m.severity), fontSize: 7, letterSpacing: 1,
                      border: `1px solid ${sevColour(m.severity)}44`, padding: "1px 4px", borderRadius: 2,
                    }}>{m.severity.toUpperCase()}</span>
                    <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 9, flex: 1 }}>{m.title}</span>
                    <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 8 }}>
                      {Math.round(m.score * 100)}%
                    </span>
                  </div>
                  <div style={{
                    height: 2, marginTop: 4,
                    background: `linear-gradient(to right, ${sevColour(m.severity)}88 ${Math.round(m.score * 100)}%, rgba(255,255,255,0.06) 0)`,
                    borderRadius: 1,
                  }} />
                </div>
              ))}
            </div>
          ))}

          {/* assess button */}
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              marginTop: 10, width: "100%", background: `${RD}18`,
              border: `1px solid ${RD}44`, color: RD, fontFamily: MN, fontSize: 9,
              letterSpacing: 1.5, padding: "6px 0", borderRadius: 3, cursor: "pointer",
            }}>
            {assessing ? "◌ ASSESSING…" : "▶ ASSESS PERSONNEL RISK"}
          </button>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>
    </>
  );
}
