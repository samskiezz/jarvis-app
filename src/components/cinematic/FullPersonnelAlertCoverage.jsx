import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const AM = "#FFB300"; const CY = "#00E5FF"; const OR = "#FF9800";
const RD = "#FF3D3D"; const GN = "#4CAF50"; const PU = "#CE93D8";
const DIM = "rgba(255,255,255,0.04)"; const BG = "rgba(6,10,18,0.94)";
const MN = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const REFRESH_MS = 90_000;
const BTN_LEFT   = 1102320;
const Z_IDX      = 684;

/* ── normalizers ─────────────────────────────────────────────────────────── */
function normContacts(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.contacts ?? raw.data ?? raw.items ?? []);
  return arr.map((c, i) => ({
    id:   String(c.id   ?? c.contact_id ?? i),
    name: String(c.name ?? c.full_name  ?? c.label ?? `Contact-${i}`),
    role: String(c.role ?? c.position   ?? c.title ?? ""),
    org:  String(c.org  ?? c.organization ?? c.company ?? ""),
    tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
    desc: String(c.description ?? c.bio ?? c.notes ?? ""),
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

function normKb(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.articles ?? raw.items ?? raw.data ?? raw.knowledge ?? []);
  return arr.map((a, i) => ({
    id:       String(a.id       ?? a.article_id ?? i),
    name:     String(a.title    ?? a.name       ?? a.label ?? `Article-${i}`),
    category: String(a.category ?? a.type       ?? a.topic ?? ""),
    tags:     Array.isArray(a.tags) ? a.tags.map(String) : [],
    desc:     String(a.summary  ?? a.content    ?? a.body  ?? a.description ?? ""),
  }));
}

function normEvents(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.events ?? raw.ops_events ?? raw.data ?? raw.items ?? []);
  return arr.map((e, i) => ({
    id:   String(e.id   ?? e.event_id    ?? i),
    name: String(e.name ?? e.title       ?? e.label ?? `Event-${i}`),
    type: String(e.type ?? e.event_type  ?? ""),
    tags: Array.isArray(e.tags) ? e.tags.map(String) : [],
    desc: String(e.description ?? e.desc ?? e.summary ?? ""),
  }));
}

/* ── token overlap ───────────────────────────────────────────────────────── */
function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function overlap(cToks, obj) {
  const oToks = tokens(obj.name + " " + (obj.desc || "") + " " + (obj.tags || []).join(" "));
  return cToks.filter(t => oToks.includes(t)).length;
}

/* ── classification ──────────────────────────────────────────────────────── */
function classify(contact, signals, kb, events) {
  const tt = tokens(contact.name + " " + contact.role + " " + contact.org + " " + contact.tags.join(" ") + " " + contact.desc);
  const hasSignal = signals.some(s => overlap(tt, s) >= 1);
  const hasKb     = kb.some(a     => overlap(tt, a) >= 1);
  const hasEvent  = events.some(e => overlap(tt, e) >= 1);
  const count = [hasSignal, hasKb, hasEvent].filter(Boolean).length;
  if (count === 3) return "FULLY_COVERED";
  if (count === 2) return "DUAL_COVERED";
  if (count === 1) return "SINGLE_LINKED";
  return "UNCOVERED";
}

function matchItems(contact, list) {
  const tt = tokens(contact.name + " " + contact.role + " " + contact.org + " " + contact.tags.join(" "));
  return list.filter(x => overlap(tt, x) >= 1).slice(0, 4);
}

function relevanceScore(contact, item) {
  const tt = tokens(contact.name + " " + contact.role + " " + contact.org + " " + contact.tags.join(" "));
  return Math.min(1, overlap(tt, item) / 3);
}

/* ── build script (exported for JarvisBrain) ─────────────────────────────── */
export async function buildFpacovScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [cR, sR, kR, eR] = await Promise.all([
    fetch(`${base}/entities/Contact`,      { headers }),
    fetch(`${base}/entities/RiskSignal`,   { headers }),
    fetch(`${base}/knowledge/`,            { headers }),
    fetch(`${base}/v1/ops/events`,         { headers }),
  ]);
  const [cJ, sJ, kJ, eJ] = await Promise.all([cR.json(), sR.json(), kR.json(), eR.json()]);
  const contacts = normContacts(cJ);
  const signals  = normSignals(sJ);
  const kb       = normKb(kJ);
  const events   = normEvents(eJ);
  const classified = contacts.map(c => ({ ...c, cls: classify(c, signals, kb, events) }));
  const fullyCov  = classified.filter(c => c.cls === "FULLY_COVERED").length;
  const dualCov   = classified.filter(c => c.cls === "DUAL_COVERED").length;
  const single    = classified.filter(c => c.cls === "SINGLE_LINKED").length;
  const uncovered = classified.filter(c => c.cls === "UNCOVERED").length;
  const pct = contacts.length ? Math.round((fullyCov / contacts.length) * 100) : 0;
  return `FPACOV online, sir. ${contacts.length} contacts correlated against ${signals.length} risk signals, ${kb.length} knowledge articles, and ${events.length} ops events. ` +
    `${fullyCov} fully covered, ${dualCov} dual-covered, ${single} single-linked, ${uncovered} uncovered — ${pct}% full coverage.`;
}

/* ── voice trigger ───────────────────────────────────────────────────────── */
export function isFpacovQuery(q) {
  const lower = (q || "").toLowerCase();
  return /fpacov|full personnel alert|personnel alert coverage|contact alert|contact full coverage|contact risk coverage|alert coverage contact/.test(lower);
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
  FULLY_COVERED:  { color: GN, label: "FULLY COV"  },
  DUAL_COVERED:   { color: CY, label: "DUAL COV"   },
  SINGLE_LINKED:  { color: AM, label: "SINGLE"      },
  UNCOVERED:      { color: RD, label: "UNCOVERED"   },
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
export default function FullPersonnelAlertCoverage() {
  const [open, setOpen]         = useState(false);
  const [contacts, setContacts] = useState([]);
  const [signals, setSignals]   = useState([]);
  const [kb, setKb]             = useState([]);
  const [events, setEvents]     = useState([]);
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
      const [cR, sR, kR, eR] = await Promise.all([
        fetch(`${base}/entities/Contact`,    { headers }),
        fetch(`${base}/entities/RiskSignal`, { headers }),
        fetch(`${base}/knowledge/`,          { headers }),
        fetch(`${base}/v1/ops/events`,       { headers }),
      ]);
      const [cJ, sJ, kJ, eJ] = await Promise.all([cR.json(), sR.json(), kR.json(), eR.json()]);
      const cts  = normContacts(cJ);
      const sigs = normSignals(sJ);
      const kbs  = normKb(kJ);
      const evts = normEvents(eJ);
      const classified = cts.map(c => ({
        ...c,
        cls:            classify(c, sigs, kbs, evts),
        matchedSignals: matchItems(c, sigs),
        matchedKb:      matchItems(c, kbs),
        matchedEvents:  matchItems(c, evts),
      }));
      setContacts(classified); setSignals(sigs); setKb(kbs); setEvents(evts);
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener("jarvis:fpacov-toggle", handler);
    return () => window.removeEventListener("jarvis:fpacov-toggle", handler);
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
      const script = await buildFpacovScript();
      const base   = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
      const chatR = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers,
        body: JSON.stringify({ message: `FPACOV assessment: ${script}. Provide a 2-sentence personnel alert coverage brief.` }),
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
          background: "rgba(255,61,61,0.08)", border: "1px solid rgba(255,61,61,0.35)",
          color: RD, fontFamily: MN, fontSize: 10, padding: "4px 9px", borderRadius: 4,
          cursor: "pointer", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
        ◈ FPACOV
      </button>
    );
  }

  const fullyCov  = contacts.filter(c => c.cls === "FULLY_COVERED").length;
  const dualCov   = contacts.filter(c => c.cls === "DUAL_COVERED").length;
  const single    = contacts.filter(c => c.cls === "SINGLE_LINKED").length;
  const uncovered = contacts.filter(c => c.cls === "UNCOVERED").length;
  const covPct = contacts.length ? Math.round((fullyCov / contacts.length) * 100) : 0;

  const TABS = ["ALL", "FULLY_COVERED", "DUAL_COVERED", "SINGLE_LINKED", "UNCOVERED"];
  const visible = contacts.filter(c => {
    if (filter !== "ALL" && c.cls !== filter) return false;
    if (search) {
      const lc = search.toLowerCase();
      return c.name.toLowerCase().includes(lc) || c.role.toLowerCase().includes(lc) || c.org.toLowerCase().includes(lc);
    }
    return true;
  });

  return (
    <div style={{ position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh",
      background: "rgba(0,0,0,0.55)", zIndex: Z_IDX, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: BG, border: "1px solid rgba(255,61,61,0.18)", borderRadius: 10,
        width: "min(960px,96vw)", maxHeight: "88vh", display: "flex", flexDirection: "column",
        boxShadow: "0 0 40px rgba(0,0,0,0.7)", overflow: "hidden" }}>

        {/* header */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)",
          display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: MN, fontSize: 11, color: RD, fontWeight: 700, letterSpacing: "0.08em" }}>
            ◈ FPACOV — Full Personnel Alert Coverage
          </span>
          <span style={{ marginLeft: "auto", fontFamily: MN, fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
            {contacts.length} contacts · {signals.length} signals · {kb.length} KB · {events.length} events
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
          <StatTile label="CONTACTS"     value={contacts.length} color={OR} />
          <StatTile label="RISK SIGNALS" value={signals.length}  color={RD} />
          <StatTile label="KB ARTICLES"  value={kb.length}       color={GN} />
          <StatTile label="OPS EVENTS"   value={events.length}   color={CY} />
          <StatTile label="FULLY COV."   value={fullyCov}        color={GN} />
          <StatTile label="DUAL COV."    value={dualCov}         color={CY} />
          <StatTile label="SINGLE"       value={single}          color={AM} />
          <StatTile label="UNCOVERED"    value={uncovered}       color={RD} />
          <StatTile label="COV%"         value={`${covPct}%`}    color={covPct >= 70 ? GN : covPct >= 40 ? AM : RD} />
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
              style={{ background: filter === t ? "rgba(255,61,61,0.15)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${filter === t ? RD : "rgba(255,255,255,0.12)"}`,
                color: filter === t ? RD : "rgba(255,255,255,0.5)",
                fontFamily: MN, fontSize: 9, padding: "3px 8px", borderRadius: 4,
                cursor: "pointer", letterSpacing: "0.05em" }}>
              {t.replace(/_/g, " ")}
            </button>
          ))}
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search contacts…"
            style={{ marginLeft: "auto", background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.12)", color: "#fff",
              fontFamily: MN, fontSize: 10, padding: "3px 8px", borderRadius: 4, width: 140 }} />
        </div>

        {/* assess button */}
        <div style={{ padding: "0 14px 8px" }}>
          <button onClick={assess} disabled={assessing}
            style={{ background: assessing ? "rgba(255,61,61,0.05)" : "rgba(255,61,61,0.12)",
              border: `1px solid ${assessing ? "rgba(255,61,61,0.2)" : RD}`,
              color: assessing ? "rgba(255,61,61,0.4)" : RD,
              fontFamily: MN, fontSize: 10, padding: "5px 14px", borderRadius: 4,
              cursor: assessing ? "default" : "pointer", letterSpacing: "0.06em" }}>
            {assessing ? "▶ ASSESSING…" : "▶ ASSESS PERSONNEL COVERAGE"}
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
              fontFamily: MN, fontSize: 11, padding: 32 }}>No contacts match.</div>
          )}
          {visible.map(c => (
            <div key={c.id}
              style={{ marginBottom: 4, borderRadius: 6,
                background: c.cls === "UNCOVERED" ? "rgba(255,61,61,0.06)" : DIM,
                border: c.cls === "UNCOVERED"
                  ? "1px solid rgba(255,61,61,0.18)"
                  : "1px solid rgba(255,255,255,0.06)",
                animation: c.cls === "UNCOVERED" ? "pulse 2s infinite" : "none" }}>
              <div onClick={() => setExpanded(e => e === c.id ? null : c.id)}
                style={{ padding: "8px 12px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: MN, fontSize: 11, color: OR, flex: 1, fontWeight: 600 }}>
                  {c.name}
                </span>
                {c.role && (
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontFamily: MN }}>{c.role}</span>
                )}
                {c.org && (
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontFamily: MN }}>{c.org}</span>
                )}
                <ClsBadge cls={c.cls} />
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: MN }}>
                  {expanded === c.id ? "▲" : "▼"}
                </span>
              </div>
              {expanded === c.id && (
                <div style={{ padding: "0 12px 12px", display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {/* risk signals */}
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 9, color: RD, fontFamily: MN, fontWeight: 700,
                      marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Risk Signals ({c.matchedSignals.length})
                    </div>
                    {c.matchedSignals.length === 0
                      ? <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: MN }}>None matched.</div>
                      : c.matchedSignals.map(s => (
                          <div key={s.id} style={{ background: "rgba(255,61,61,0.07)", borderRadius: 4, padding: "5px 8px", marginBottom: 4 }}>
                            <div style={{ fontSize: 10, color: "#fff", fontFamily: MN }}>{s.name}</div>
                            {s.severity && <div style={{ fontSize: 9, color: AM, fontFamily: MN }}>{s.severity}</div>}
                            <RelevanceBar score={relevanceScore(c, s)} color={RD} />
                          </div>
                        ))}
                  </div>
                  {/* kb articles */}
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 9, color: GN, fontFamily: MN, fontWeight: 700,
                      marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      KB Articles ({c.matchedKb.length})
                    </div>
                    {c.matchedKb.length === 0
                      ? <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: MN }}>None matched.</div>
                      : c.matchedKb.map(a => (
                          <div key={a.id} style={{ background: "rgba(76,175,80,0.07)", borderRadius: 4, padding: "5px 8px", marginBottom: 4 }}>
                            <div style={{ fontSize: 10, color: "#fff", fontFamily: MN }}>{a.name}</div>
                            {a.category && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>{a.category}</div>}
                            <RelevanceBar score={relevanceScore(c, a)} color={GN} />
                          </div>
                        ))}
                  </div>
                  {/* ops events */}
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 9, color: CY, fontFamily: MN, fontWeight: 700,
                      marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Ops Events ({c.matchedEvents.length})
                    </div>
                    {c.matchedEvents.length === 0
                      ? <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: MN }}>None matched.</div>
                      : c.matchedEvents.map(e => (
                          <div key={e.id} style={{ background: "rgba(0,229,255,0.07)", borderRadius: 4, padding: "5px 8px", marginBottom: 4 }}>
                            <div style={{ fontSize: 10, color: "#fff", fontFamily: MN }}>{e.name}</div>
                            {e.type && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>{e.type}</div>}
                            <RelevanceBar score={relevanceScore(c, e)} color={CY} />
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
