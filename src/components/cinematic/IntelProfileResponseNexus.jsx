import { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_073_960;
const Z_INDEX  = 296;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const CY = "#00CFFF";
const AM = "#F59E0B";
const GN = "#22C55E";
const PU = "#A855F7";
const OR = "#F97316";
const BL = "#3B82F6";
const RD = "#EF4444";
const TE = "#14B8A6";
const BG = "rgba(6,11,22,0.97)";
const FONT = "'JetBrains Mono',monospace";

export const IRCNEX_RE = /\b(ircnex|intel response nexus|actor response nexus|dark intel profile|actor investigation ops|intel profile tracking|response nexus)\b/i;
export function isIrcnexQuery(q = "") { return IRCNEX_RE.test(q); }

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack = "", kws = []) {
  const h = haystack.toLowerCase();
  let hits = 0;
  for (const w of kws) if (h.includes(w)) hits++;
  return kws.length ? hits / kws.length : 0;
}
function extractProfile(p) {
  return [p.name, p.aliases?.join?.(" "), p.organisation, p.role, p.tags?.join?.(" "), p.description, p.bio]
    .filter(Boolean).join(" ");
}
function extractContact(c) {
  return [c.name, c.role, c.organisation, c.department, c.tags?.join?.(" "), c.bio]
    .filter(Boolean).join(" ");
}
function extractInvestigation(i) {
  return [i.title, i.description, i.summary, i.tags?.join?.(" "), i.status, i.type]
    .filter(Boolean).join(" ");
}
function extractOpsEvent(o) {
  return [o.title, o.description, o.type, o.summary, o.tags?.join?.(" "), o.location]
    .filter(Boolean).join(" ");
}

function classify(profile, contacts, investigations, opsEvents) {
  const kws = keywords(extractProfile(profile));
  let cScore = 0, iScore = 0, oScore = 0;
  let bestContact = null, bestInv = null, bestOps = null;
  for (const c of contacts) {
    const sc = scoreText(extractContact(c), kws);
    if (sc > cScore) { cScore = sc; bestContact = c; }
  }
  for (const i of investigations) {
    const sc = scoreText(extractInvestigation(i), kws);
    if (sc > iScore) { iScore = sc; bestInv = i; }
  }
  for (const o of opsEvents) {
    const sc = scoreText(extractOpsEvent(o), kws);
    if (sc > oScore) { oScore = sc; bestOps = o; }
  }
  const hasContact = cScore >= 0.12;
  const hasInv     = iScore >= 0.12;
  const hasOps     = oScore >= 0.12;
  const matchCount = [hasContact, hasInv, hasOps].filter(Boolean).length;
  let _cls;
  if (matchCount === 3)          _cls = "FULLY_TRACKED";
  else if (matchCount === 2)     _cls = "DUAL_TRACKED";
  else if (matchCount === 1)     _cls = "SINGLE_LINKED";
  else                           _cls = "DARK";
  return { ...profile, _cls, _cScore: cScore, _iScore: iScore, _oScore: oScore,
    _bestContact: bestContact, _bestInv: bestInv, _bestOps: bestOps };
}

export async function buildIrcnexScript() {
  try {
    const base = apiBase();
    const [profRes, conRes, invRes, opsRes] = await Promise.all([
      fetch(`${base}/entities/IntelProfile`,  { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/entities/Contact`,       { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/v1/investigations`,      { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/v1/ops/events`,          { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const [profData, conData, invData, opsData] = await Promise.all([
      profRes.ok ? profRes.json() : [],
      conRes.ok  ? conRes.json()  : [],
      invRes.ok  ? invRes.json()  : [],
      opsRes.ok  ? opsRes.json()  : [],
    ]);
    const profiles = Array.isArray(profData) ? profData : profData?.items ?? profData?.results ?? [];
    const contacts = Array.isArray(conData)  ? conData  : conData?.items  ?? conData?.results  ?? [];
    const invs     = Array.isArray(invData)  ? invData  : invData?.items  ?? invData?.results  ?? [];
    const ops      = Array.isArray(opsData)  ? opsData  : opsData?.items  ?? opsData?.results  ?? [];
    const classified = profiles.map(p => classify(p, contacts, invs, ops));
    const total      = classified.length;
    const fullyTracked = classified.filter(x => x._cls === "FULLY_TRACKED").length;
    const dual         = classified.filter(x => x._cls === "DUAL_TRACKED").length;
    const single       = classified.filter(x => x._cls === "SINGLE_LINKED").length;
    const dark         = classified.filter(x => x._cls === "DARK").length;
    const pct = total ? Math.round((fullyTracked / total) * 100) : 0;
    return `Intel Profile Response Nexus online, sir. ${total} threat actor profiles cross-referenced against ${contacts.length} contacts, ${invs.length} investigations, and ${ops.length} ops events. ` +
      `${fullyTracked} fully tracked (${pct}%), ${dual} dual-tracked, ${single} single-linked, ${dark} dark with no response coverage. ` +
      (dark > 0 ? `${dark} actor profiles are completely dark — no contact, investigation, or operational response assigned. Immediate threat response coordination required, sir.` : `All threat actors have response coverage. Intelligence response nexus is fully active, sir.`);
  } catch {
    return "Intel Profile Response Nexus standing by, sir. Cross-referencing threat actor profiles against contacts, investigations, and ops events to surface actors with no active response coverage.";
  }
}

const CLS_COLOR = { FULLY_TRACKED: GN, DUAL_TRACKED: CY, SINGLE_LINKED: PU, DARK: RD };
const CLS_LABEL = { FULLY_TRACKED: "FULLY TRACKED", DUAL_TRACKED: "DUAL TRACKED", SINGLE_LINKED: "SINGLE LINKED", DARK: "DARK" };
const TABS = ["ALL", "FULLY_TRACKED", "DUAL_TRACKED", "SINGLE_LINKED", "DARK"];

export default function IntelProfileResponseNexus() {
  const [open, setOpen]             = useState(false);
  const [profiles, setProfiles]     = useState([]);
  const [contacts, setContacts]     = useState([]);
  const [invs, setInvs]             = useState([]);
  const [ops, setOps]               = useState([]);
  const [classified, setClassified] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [err, setErr]               = useState("");
  const [tab, setTab]               = useState("ALL");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const base = apiBase();
      const [profRes, conRes, invRes, opsRes] = await Promise.all([
        fetch(`${base}/entities/IntelProfile`,  { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/entities/Contact`,       { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/v1/investigations`,      { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/v1/ops/events`,          { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const [profData, conData, invData, opsData] = await Promise.all([
        profRes.ok ? profRes.json() : [],
        conRes.ok  ? conRes.json()  : [],
        invRes.ok  ? invRes.json()  : [],
        opsRes.ok  ? opsRes.json()  : [],
      ]);
      const p = Array.isArray(profData) ? profData : profData?.items ?? profData?.results ?? [];
      const c = Array.isArray(conData)  ? conData  : conData?.items  ?? conData?.results  ?? [];
      const i = Array.isArray(invData)  ? invData  : invData?.items  ?? invData?.results  ?? [];
      const o = Array.isArray(opsData)  ? opsData  : opsData?.items  ?? opsData?.results  ?? [];
      setProfiles(p); setContacts(c); setInvs(i); setOps(o);
      setClassified(p.map(x => classify(x, c, i, o)));
    } catch (e) {
      setErr(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:ircnex-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ircnex-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const total        = classified.length;
  const fullyTracked = classified.filter(x => x._cls === "FULLY_TRACKED").length;
  const dual         = classified.filter(x => x._cls === "DUAL_TRACKED").length;
  const single       = classified.filter(x => x._cls === "SINGLE_LINKED").length;
  const dark         = classified.filter(x => x._cls === "DARK").length;
  const pct          = total ? Math.round((fullyTracked / total) * 100) : 0;

  const visible = classified.filter(x => {
    if (tab !== "ALL" && x._cls !== tab) return false;
    if (search) {
      const lc = search.toLowerCase();
      return extractProfile(x).toLowerCase().includes(lc);
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    try {
      const ctx = `Intel Profile Response Nexus: ${total} profiles, ${fullyTracked} fully tracked, ${dual} dual-tracked, ${single} single-linked, ${dark} dark. ` +
        `Contacts: ${contacts.length}. Investigations: ${invs.length}. Ops Events: ${ops.length}. Full tracking: ${pct}%.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Assess threat actor response coverage: ${ctx}` }),
      });
      const d = await r.json();
      const answer = (d.answer || "Assessment unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
      try {
        await fetch(`${apiBase()}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: answer }),
        }).then(async res => {
          if (!res.ok) return;
          const url = URL.createObjectURL(await res.blob());
          const a = new Audio(url);
          a.onended = () => URL.revokeObjectURL(url);
          a.play().catch(() => {});
        });
      } catch {}
    } catch {}
    setAssessing(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Intel Profile × Contact × Investigation × Ops Event Response Nexus (IRCNEX)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.82)", border: `1px solid ${CY}55`,
          color: CY, fontFamily: FONT, fontSize: 9, letterSpacing: 1,
          padding: "3px 7px", borderRadius: 3, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        ◈ IRCNEX{dark > 0 && <span style={{ marginLeft: 4, background: RD, color: "#fff", borderRadius: 2, padding: "0 3px", fontSize: 8 }}>{dark}</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: Z_INDEX, background: BG,
      fontFamily: FONT, display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ padding: "10px 16px", borderBottom: `1px solid ${CY}33`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <span style={{ color: CY, fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>◈ IRCNEX</span>
        <span style={{ color: "#8899AA", fontSize: 10, letterSpacing: 1 }}>INTEL PROFILE × CONTACT × INVESTIGATION × OPS EVENT RESPONSE NEXUS</span>
        <span style={{ marginLeft: "auto", color: "#445566", fontSize: 9 }}>
          {loading ? "↻ LOADING…" : `↻ ${POLL_MS / 1000}s`}
        </span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: RD, cursor: "pointer", fontSize: 14, marginLeft: 6 }}>✕</button>
      </div>

      {err && <div style={{ padding: "6px 16px", color: RD, fontSize: 10 }}>⚠ {err}</div>}

      {/* Stats */}
      <div style={{ display: "flex", gap: 8, padding: "10px 16px", flexShrink: 0, flexWrap: "wrap" }}>
        {[
          ["INTEL PROFILES",  total,             CY],
          ["CONTACTS",        contacts.length,   OR],
          ["INVESTIGATIONS",  invs.length,        TE],
          ["OPS EVENTS",      ops.length,         BL],
          ["FULLY TRACKED",   fullyTracked,       GN],
          ["DUAL TRACKED",    dual,               CY],
          ["SINGLE LINKED",   single,             PU],
          ["DARK",            dark,               RD],
        ].map(([label, val, col]) => (
          <div key={label} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${col}33`, borderRadius: 4, padding: "6px 12px", minWidth: 90 }}>
            <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#667788", fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
        <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${GN}33`, borderRadius: 4, padding: "6px 12px", minWidth: 90 }}>
          <div style={{ color: GN, fontSize: 16, fontWeight: 700 }}>{pct}%</div>
          <div style={{ color: "#667788", fontSize: 8, letterSpacing: 1 }}>FULL TRACK</div>
        </div>
      </div>

      {/* Coverage bar */}
      <div style={{ margin: "0 16px 8px", height: 6, background: "#111827", borderRadius: 3, overflow: "hidden", flexShrink: 0 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,${GN},${CY})`, transition: "width 0.6s" }} />
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: "flex", gap: 4, padding: "4px 16px 6px", flexShrink: 0, flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `${CLS_COLOR[t] || CY}22` : "transparent",
            border: `1px solid ${tab === t ? (CLS_COLOR[t] || CY) : "#334455"}`,
            color: tab === t ? (CLS_COLOR[t] || CY) : "#556677",
            fontFamily: FONT, fontSize: 8, letterSpacing: 1, padding: "2px 8px", borderRadius: 3, cursor: "pointer",
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search profiles…"
          style={{ marginLeft: "auto", background: "#0a0f18", border: `1px solid ${CY}33`, color: CY, fontFamily: FONT, fontSize: 9, padding: "3px 8px", borderRadius: 3, width: 180 }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 8px" }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: "#556677", fontSize: 10, padding: "20px 0", textAlign: "center" }}>No profiles match filter.</div>
        )}
        {visible.map((profile, i) => {
          const col   = CLS_COLOR[profile._cls] || CY;
          const isExp = expanded === i;
          const label = profile.name || profile.id || `Profile ${i + 1}`;
          return (
            <div key={profile.id ?? i}
              onClick={() => setExpanded(isExp ? null : i)}
              style={{
                marginBottom: 4, padding: "7px 10px", borderRadius: 4, cursor: "pointer",
                background: isExp ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${isExp ? col : "#1a2535"}`,
                animation: profile._cls === "DARK" ? "ircpulse 2s ease-in-out infinite" : "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: col, fontSize: 9, letterSpacing: 1, minWidth: 96 }}>{CLS_LABEL[profile._cls]}</span>
                <span style={{ color: "#AABBCC", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {label}
                </span>
                <span style={{ color: "#445566", fontSize: 9 }}>
                  {profile.role ? `[${profile.role}]` : ""}
                </span>
                <span style={{ color: "#445566", fontSize: 8 }}>
                  C:{Math.round(profile._cScore * 100)}% I:{Math.round(profile._iScore * 100)}% O:{Math.round(profile._oScore * 100)}%
                </span>
              </div>
              {isExp && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${col}22` }}>
                  {profile._bestContact && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: OR, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>▸ MATCHED CONTACT</div>
                      <div style={{ background: "#0a0f18", border: `1px solid ${OR}33`, borderRadius: 3, padding: "5px 8px" }}>
                        <div style={{ color: OR, fontSize: 10 }}>{profile._bestContact.name || profile._bestContact.id}</div>
                        <div style={{ color: "#667788", fontSize: 9 }}>{[profile._bestContact.role, profile._bestContact.organisation].filter(Boolean).join(" · ")}</div>
                        <div style={{ marginTop: 4, height: 3, background: "#111827", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.round(profile._cScore * 100)}%`, background: OR }} />
                        </div>
                      </div>
                    </div>
                  )}
                  {profile._bestInv && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: TE, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>▸ MATCHED INVESTIGATION</div>
                      <div style={{ background: "#0a0f18", border: `1px solid ${TE}33`, borderRadius: 3, padding: "5px 8px" }}>
                        <div style={{ color: TE, fontSize: 10 }}>{profile._bestInv.title || profile._bestInv.id}</div>
                        <div style={{ color: "#667788", fontSize: 9 }}>{[profile._bestInv.status, profile._bestInv.type].filter(Boolean).join(" · ")}</div>
                        <div style={{ marginTop: 4, height: 3, background: "#111827", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.round(profile._iScore * 100)}%`, background: TE }} />
                        </div>
                      </div>
                    </div>
                  )}
                  {profile._bestOps && (
                    <div>
                      <div style={{ color: BL, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>▸ MATCHED OPS EVENT</div>
                      <div style={{ background: "#0a0f18", border: `1px solid ${BL}33`, borderRadius: 3, padding: "5px 8px" }}>
                        <div style={{ color: BL, fontSize: 10 }}>{profile._bestOps.title || profile._bestOps.id}</div>
                        <div style={{ color: "#667788", fontSize: 9 }}>{[profile._bestOps.type, profile._bestOps.location].filter(Boolean).join(" · ")}</div>
                        <div style={{ marginTop: 4, height: 3, background: "#111827", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.round(profile._oScore * 100)}%`, background: BL }} />
                        </div>
                      </div>
                    </div>
                  )}
                  {!profile._bestContact && !profile._bestInv && !profile._bestOps && (
                    <div style={{ color: RD, fontSize: 9 }}>⚠ No contact, investigation, or ops event matched. Profile is operationally dark.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: "8px 16px", borderTop: `1px solid ${CY}22`, display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
        <button
          onClick={assess} disabled={assessing || loading}
          style={{
            background: assessing ? "#0a0f18" : `${CY}22`, border: `1px solid ${CY}`,
            color: CY, fontFamily: FONT, fontSize: 9, letterSpacing: 1,
            padding: "4px 12px", borderRadius: 3, cursor: assessing ? "wait" : "pointer",
          }}
        >
          {assessing ? "◍ ASSESSING…" : "▶ ASSESS NEXUS"}
        </button>
        <span style={{ color: "#334455", fontSize: 9, marginLeft: "auto" }}>
          {visible.length}/{total} shown
        </span>
      </div>
      <style>{`@keyframes ircpulse{0%,100%{border-color:#1a2535}50%{border-color:${RD}88}}`}</style>
    </div>
  );
}
