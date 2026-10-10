import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const AM = "#FFB300"; const GN = "#4CAF50"; const RD = "#FF3D3D";
const CY = "#00E5FF"; const OR = "#FF9800"; const PU = "#CE93D8";
const DIM = "rgba(255,255,255,0.04)"; const BG = "rgba(6,10,18,0.94)";
const MN = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) || "dev-key";
const REFRESH_MS = 90_000;
const BTN_LEFT = 1106800;
const Z_IDX = 692;

function normProfiles(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.profiles || raw?.items || raw?.data || []);
  return arr.map((p, i) => ({
    id: p.id || p._id || `prof${i}`,
    name: p.name || p.actor_name || p.alias || `Actor ${i + 1}`,
    org: p.organization || p.org || p.group || "",
    role: p.role || p.type || p.category || "",
    aliases: Array.isArray(p.aliases) ? p.aliases : [],
    tags: Array.isArray(p.tags) ? p.tags : [],
    desc: p.description || p.summary || p.notes || "",
  }));
}

function normInvestments(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.investments || raw?.items || raw?.data || []);
  return arr.map((inv, i) => ({
    id: inv.id || inv._id || `inv${i}`,
    name: inv.name || inv.title || inv.investment_name || `Investment ${i + 1}`,
    type: inv.type || inv.investment_type || inv.asset_class || "",
    sector: inv.sector || inv.industry || "",
    tags: Array.isArray(inv.tags) ? inv.tags : [],
    desc: inv.description || inv.summary || inv.notes || "",
  }));
}

function normAlerts(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.alerts || raw?.items || raw?.data || []);
  return arr.map((a, i) => ({
    id: a.id || a._id || `al${i}`,
    name: a.title || a.name || a.alert_name || `Alert ${i + 1}`,
    severity: a.severity || a.level || a.priority || "medium",
    type: a.type || a.alert_type || a.category || "",
    tags: Array.isArray(a.tags) ? a.tags : [],
    desc: a.description || a.summary || a.message || a.details || "",
  }));
}

function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function overlap(profToks, obj) {
  const objText = [obj.name, obj.type || obj.sector || "", obj.desc, ...(obj.tags || []), obj.severity || ""].join(" ");
  const objToks = new Set(tokens(objText));
  return profToks.filter(t => objToks.has(t)).length;
}

function classify(profile, investments, alerts) {
  const pToks = tokens([profile.name, profile.org, profile.role, profile.desc, ...profile.aliases, ...profile.tags].join(" "));
  const hasInv = investments.some(inv => overlap(pToks, inv) >= 1);
  const hasAlt = alerts.some(a => overlap(pToks, a) >= 1);
  if (hasInv && hasAlt) return "FULLY_TRACKED";
  if (hasInv) return "ACTOR_LINKED";
  if (hasAlt) return "ALERT_FLAGGED";
  return "UNMONITORED";
}

function matchItems(profToks, list, max = 4) {
  return list
    .map(item => ({ item, score: overlap(profToks, item) }))
    .filter(x => x.score >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(x => x.item);
}

function relScore(profToks, item) {
  const raw = overlap(profToks, item);
  return Math.min(100, Math.round((raw / Math.max(profToks.length, 1)) * 320));
}

const SEV_COLOR = { critical: RD, high: OR, medium: AM, low: GN };

export async function isFtnexQuery(q) {
  const FTNEX_RE = /ftnex|financial threat nexus|investment threat actor|actor investment alert|threatened investment|intel investment alert|actor investment coverage|threat nexus finance/i;
  return FTNEX_RE.test(q);
}

export async function buildFtnexScript() {
  const base = apiBase();
  const h = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
  const [pRaw, invRaw, altRaw] = await Promise.all([
    fetch(`${base}/entities/IntelProfile`, { headers: h }).then(r => r.json()).catch(() => []),
    fetch(`${base}/entities/Investment`, { headers: h }).then(r => r.json()).catch(() => []),
    fetch(`${base}/v1/ops/alerts`, { headers: h }).then(r => r.json()).catch(() => []),
  ]);
  const profiles = normProfiles(pRaw);
  const investments = normInvestments(invRaw);
  const alerts = normAlerts(altRaw);
  const rows = profiles.map(p => {
    const cls = classify(p, investments, alerts);
    return { ...p, cls };
  });
  const fullyTracked = rows.filter(r => r.cls === "FULLY_TRACKED").length;
  const unmonitored = rows.filter(r => r.cls === "UNMONITORED").length;
  const cov = profiles.length ? Math.round(((fullyTracked + rows.filter(r => r.cls !== "UNMONITORED").length * 0.4) / profiles.length) * 100) : 0;
  const ctx = `${profiles.length} threat actor profiles correlated with ${investments.length} investments and ${alerts.length} operational alerts. FULLY_TRACKED: ${fullyTracked}. UNMONITORED: ${unmonitored}. Financial threat coverage: ${cov}%.`;
  try {
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST", headers: h,
      body: JSON.stringify({ message: `FTNEX Financial Threat Nexus assessment: ${ctx}. In 2 sentences, assess the financial threat exposure and recommend one priority action.` }),
    });
    const d = await r.json();
    return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || ctx;
  } catch { return ctx; }
}

function FtnexPanel({ profiles, investments, alerts }) {
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [brief, setBrief] = useState("");
  const [assessing, setAssessing] = useState(false);

  const rows = profiles.map(p => {
    const pToks = tokens([p.name, p.org, p.role, p.desc, ...p.aliases, ...p.tags].join(" "));
    const cls = classify(p, investments, alerts);
    const matchedInv = matchItems(pToks, investments);
    const matchedAlt = matchItems(pToks, alerts);
    return { ...p, cls, matchedInv, matchedAlt, pToks };
  });

  const counts = { FULLY_TRACKED: 0, ACTOR_LINKED: 0, ALERT_FLAGGED: 0, UNMONITORED: 0 };
  rows.forEach(r => counts[r.cls]++);
  const cov = rows.length ? Math.round(((rows.length - counts.UNMONITORED) / rows.length) * 100) : 0;

  const filtered = rows.filter(r => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.name.toLowerCase().includes(s) || r.org.toLowerCase().includes(s) || r.role.toLowerCase().includes(s);
    }
    return true;
  });

  async function assess() {
    setAssessing(true); setBrief("");
    try {
      const script = await buildFtnexScript();
      setBrief(script);
      const voice = getActiveVoice();
      const base = apiBase();
      const resp = await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: script, voice }),
      });
      if (resp.ok) {
        const blob = await resp.blob();
        new Audio(URL.createObjectURL(blob)).play().catch(() => {});
      }
    } catch { setBrief("Assessment unavailable."); }
    setAssessing(false);
  }

  const CLS_COLOR = { FULLY_TRACKED: GN, ACTOR_LINKED: OR, ALERT_FLAGGED: RD, UNMONITORED: "#666" };
  const TABS = ["ALL", "FULLY_TRACKED", "ACTOR_LINKED", "ALERT_FLAGGED", "UNMONITORED"];

  return (
    <div style={{ fontFamily: MN, fontSize: 11, color: "#DCEBF5", display: "flex", flexDirection: "column", gap: 8 }}>
      {/* stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
        {[["PROFILES", profiles.length, CY], ["INVESTMENTS", investments.length, GN], ["ALERTS", alerts.length, OR],
          ["UNMONITORED", counts.UNMONITORED, RD], ["COVERAGE", `${cov}%`, cov >= 70 ? GN : cov >= 40 ? AM : RD]].map(([k, v, c]) => (
          <div key={k} style={{ background: `${c}12`, border: `1px solid ${c}33`, borderRadius: 6, padding: "5px 8px", textAlign: "center" }}>
            <div style={{ color: c, fontWeight: 700, fontSize: 13 }}>{v}</div>
            <div style={{ color: "#8099AA", fontSize: 9 }}>{k}</div>
          </div>
        ))}
      </div>

      {/* coverage bar */}
      <div style={{ background: "#ffffff12", borderRadius: 4, height: 6, overflow: "hidden" }}>
        <div style={{ width: `${cov}%`, height: "100%", background: cov >= 70 ? GN : cov >= 40 ? AM : RD, transition: "width 0.5s" }} />
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "2px 8px", borderRadius: 4, border: `1px solid ${tab === t ? CY : "#ffffff22"}`,
            background: tab === t ? `${CY}22` : "transparent", color: tab === t ? CY : "#8099AA",
            cursor: "pointer", fontSize: 10
          }}>{t.replace("_", " ")}{t !== "ALL" ? ` (${counts[t]})` : ` (${rows.length})`}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search actors…"
          style={{ flex: 1, minWidth: 80, background: "#ffffff08", border: "1px solid #ffffff22", borderRadius: 4, color: "#DCEBF5", padding: "2px 6px", fontSize: 10 }} />
      </div>

      {/* rows */}
      <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {filtered.map(row => (
          <div key={row.id} style={{
            background: DIM, border: `1px solid ${CLS_COLOR[row.cls]}33`, borderRadius: 6, padding: "6px 10px",
            animation: row.cls === "UNMONITORED" ? "ftnexpulse 2s infinite" : "none"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
              onClick={() => setExpanded(expanded === row.id ? null : row.id)}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ color: CLS_COLOR[row.cls], fontWeight: 700, fontSize: 10 }}>{row.cls.replace(/_/g, " ")}</span>
                <span style={{ color: "#DCEBF5" }}>{row.name}</span>
                {row.org && <span style={{ color: "#8099AA" }}>· {row.org}</span>}
                {row.role && <span style={{ background: `${PU}22`, border: `1px solid ${PU}44`, borderRadius: 3, padding: "0 4px", color: PU, fontSize: 9 }}>{row.role}</span>}
              </div>
              <span style={{ color: "#8099AA" }}>{expanded === row.id ? "▲" : "▼"}</span>
            </div>
            {expanded === row.id && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                {row.matchedInv.length > 0 && (
                  <div>
                    <div style={{ color: GN, fontSize: 10, marginBottom: 4 }}>INVESTMENT TARGETS ({row.matchedInv.length})</div>
                    {row.matchedInv.map(inv => {
                      const sc = relScore(row.pToks, inv);
                      return (
                        <div key={inv.id} style={{ background: `${GN}08`, border: `1px solid ${GN}22`, borderRadius: 4, padding: "4px 8px", marginBottom: 3 }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: GN }}>{inv.name}</span>
                            {inv.type && <span style={{ background: `${GN}22`, borderRadius: 3, padding: "0 4px", fontSize: 9, color: GN }}>{inv.type}</span>}
                          </div>
                          <div style={{ height: 3, background: "#ffffff12", borderRadius: 2, marginTop: 4 }}>
                            <div style={{ width: `${sc}%`, height: "100%", background: GN, borderRadius: 2 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {row.matchedAlt.length > 0 && (
                  <div>
                    <div style={{ color: OR, fontSize: 10, marginBottom: 4 }}>OPERATIONAL ALERTS ({row.matchedAlt.length})</div>
                    {row.matchedAlt.map(alt => {
                      const sc = relScore(row.pToks, alt);
                      const sc_color = SEV_COLOR[alt.severity?.toLowerCase()] || AM;
                      return (
                        <div key={alt.id} style={{ background: `${sc_color}08`, border: `1px solid ${sc_color}22`, borderRadius: 4, padding: "4px 8px", marginBottom: 3 }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: sc_color }}>{alt.name}</span>
                            <span style={{ background: `${sc_color}22`, borderRadius: 3, padding: "0 4px", fontSize: 9, color: sc_color }}>{alt.severity?.toUpperCase() || "MEDIUM"}</span>
                          </div>
                          <div style={{ height: 3, background: "#ffffff12", borderRadius: 2, marginTop: 4 }}>
                            <div style={{ width: `${sc}%`, height: "100%", background: sc_color, borderRadius: 2 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {row.matchedInv.length === 0 && row.matchedAlt.length === 0 && (
                  <div style={{ color: "#8099AA", fontSize: 10 }}>No financial or alert correlations found for this actor.</div>
                )}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <div style={{ color: "#8099AA", textAlign: "center", padding: 16 }}>No results.</div>}
      </div>

      {/* assess button */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={assess} disabled={assessing} style={{
          padding: "4px 14px", borderRadius: 5, border: `1px solid ${CY}`, cursor: assessing ? "wait" : "pointer",
          background: `${CY}18`, color: CY, fontSize: 11
        }}>{assessing ? "Assessing…" : "▶ ASSESS FINANCIAL THREAT"}</button>
        {counts.UNMONITORED > 0 && (
          <span style={{ background: `${RD}22`, border: `1px solid ${RD}44`, borderRadius: 4, padding: "2px 8px", color: RD, fontSize: 10 }}>
            {counts.UNMONITORED} UNMONITORED
          </span>
        )}
      </div>

      {brief && (
        <div style={{ marginTop: 6, padding: "10px 12px", background: `${CY}08`, border: `1px solid ${CY}33`, borderRadius: 8, fontSize: 11, color: "#DCEBF5", lineHeight: 1.6 }}>
          {brief}
        </div>
      )}

      <style>{`
        @keyframes ftnexpulse {
          0%, 100% { border-color: ${RD}33; }
          50% { border-color: ${RD}88; box-shadow: 0 0 10px ${RD}33; }
        }
      `}</style>
    </div>
  );
}

function FtnexInner() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const h = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
      const [pRaw, invRaw, altRaw] = await Promise.all([
        fetch(`${base}/entities/IntelProfile`, { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/entities/Investment`, { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/ops/alerts`, { headers: h }).then(r => r.json()).catch(() => []),
      ]);
      setData({
        profiles: normProfiles(pRaw),
        investments: normInvestments(invRaw),
        alerts: normAlerts(altRaw),
      });
    } catch { setData(null); }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT, bottom: 48, zIndex: Z_IDX,
      width: 560, maxHeight: "80vh", overflowY: "auto",
      background: BG, border: `1px solid ${CY}44`, borderRadius: 12,
      padding: 14, backdropFilter: "blur(12px)",
      boxShadow: `0 4px 32px ${RD}22`
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ color: CY, fontFamily: MN, fontSize: 12, fontWeight: 700 }}>◈ FTNEX — Financial Threat Nexus</span>
        <span style={{ color: "#8099AA", fontSize: 9 }}>IntelProfile × Investment × OpsAlert</span>
      </div>
      {loading && !data && <div style={{ color: "#8099AA", fontSize: 11, textAlign: "center", padding: 20 }}>Loading FTNEX data…</div>}
      {data && <FtnexPanel profiles={data.profiles} investments={data.investments} alerts={data.alerts} />}
    </div>
  );
}

export default function IntelProfileInvestmentAlertNexus() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:ftnex-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ftnex-toggle", onToggle);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="FTNEX: Financial Threat Nexus"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_IDX,
          padding: "3px 10px", borderRadius: 5,
          border: `1px solid ${CY}88`, background: `${CY}18`,
          color: CY, fontFamily: MN, fontSize: 10, cursor: "pointer",
          whiteSpace: "nowrap"
        }}
      >◈ FTNEX</button>
      {open && <FtnexInner />}
    </>
  );
}
