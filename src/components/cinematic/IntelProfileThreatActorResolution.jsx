import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const AM = "#FFB300"; const GN = "#4CAF50"; const RD = "#FF3D3D";
const CY = "#00E5FF"; const OR = "#FF9800"; const PU = "#CE93D8";
const TE = "#80CBC4";
const DIM = "rgba(255,255,255,0.04)"; const BG = "rgba(6,10,18,0.94)";
const MN = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) || "dev-key";
const REFRESH_MS = 90_000;
const BTN_LEFT = 1105680;
const Z_IDX = 690;

function normProfiles(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.profiles || raw?.intel_profiles || raw?.items || raw?.data || []);
  return arr.map((p, i) => ({
    id: p.id || p._id || `ip${i}`,
    name: p.name || p.profile_name || p.alias || `Actor ${i + 1}`,
    org: p.organization || p.org || p.affiliation || "",
    role: p.role || p.type || p.category || "",
    tags: Array.isArray(p.tags) ? p.tags : [],
    desc: p.description || p.summary || p.notes || p.bio || "",
  }));
}

function normCentrality(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.nodes || raw?.centrality || raw?.items || raw?.data || []);
  return arr.map((n, i) => ({
    id: n.id || n._id || `cn${i}`,
    name: n.label || n.name || n.entity || `Node ${i + 1}`,
    category: n.type || n.category || n.group || "",
    community: n.community || n.cluster || "",
    score: n.score || n.centrality_score || n.value || 0,
    tags: Array.isArray(n.tags) ? n.tags : [],
    desc: n.description || n.summary || "",
  }));
}

function normInvestigations(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.investigations || raw?.cases || raw?.items || raw?.data || []);
  return arr.map((inv, i) => ({
    id: inv.id || inv._id || `inv${i}`,
    name: inv.title || inv.name || inv.case_name || `Investigation ${i + 1}`,
    type: inv.type || inv.investigation_type || inv.category || "",
    status: inv.status || inv.state || "unknown",
    tags: Array.isArray(inv.tags) ? inv.tags : [],
    desc: inv.description || inv.summary || inv.objective || "",
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
  const objText = [obj.name, obj.type || obj.category || "", obj.desc, ...(obj.tags || []), obj.org || "", obj.role || "", obj.severity || "", obj.community || ""].join(" ");
  const objToks = new Set(tokens(objText));
  return profToks.filter(t => objToks.has(t)).length;
}

function classify(profile, centralityNodes, investigations, alerts) {
  const pToks = tokens([profile.name, profile.org, profile.role, profile.desc, ...profile.tags].join(" "));
  const hasCen = centralityNodes.some(n => overlap(pToks, n) >= 1);
  const hasInv = investigations.some(inv => overlap(pToks, inv) >= 1);
  const hasAlt = alerts.some(a => overlap(pToks, a) >= 1);
  const count = [hasCen, hasInv, hasAlt].filter(Boolean).length;
  if (count === 3) return "FULLY_TRACKED";
  if (count === 2) return "DUAL_TRACKED";
  if (count === 1) return "SINGLE_LINKED";
  return "BLIND_SPOT";
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
  return Math.min(1, raw / Math.max(1, profToks.length * 0.3));
}

export async function buildTarecScript() {
  const base = apiBase();
  const hdrs = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
  const [pr, cr, ir, ar] = await Promise.allSettled([
    fetch(`${base}/entities/IntelProfile`, { headers: hdrs }).then(r => r.json()),
    fetch(`${base}/v1/graph/centrality`, { headers: hdrs }).then(r => r.json()),
    fetch(`${base}/v1/investigations`, { headers: hdrs }).then(r => r.json()),
    fetch(`${base}/v1/ops/alerts`, { headers: hdrs }).then(r => r.json()),
  ]);
  const profiles = normProfiles(pr.status === "fulfilled" ? pr.value : []);
  const centralityNodes = normCentrality(cr.status === "fulfilled" ? cr.value : []);
  const investigations = normInvestigations(ir.status === "fulfilled" ? ir.value : []);
  const alerts = normAlerts(ar.status === "fulfilled" ? ar.value : []);
  const total = profiles.length;
  if (!total) return "TAREC online, sir. No intel actor profiles found to assess against the resolution matrix.";
  const counts = { FULLY_TRACKED: 0, DUAL_TRACKED: 0, SINGLE_LINKED: 0, BLIND_SPOT: 0 };
  profiles.forEach(p => counts[classify(p, centralityNodes, investigations, alerts)]++);
  const pct = Math.round((counts.FULLY_TRACKED / total) * 100);
  return `TAREC resolution matrix complete, sir. ${total} threat actor profiles evaluated against ${centralityNodes.length} graph centrality nodes, ${investigations.length} open investigations, and ${alerts.length} operational alerts. ${counts.FULLY_TRACKED} actors are fully tracked across all three resolution domains, representing ${pct}% full coverage. ${counts.DUAL_TRACKED} have dual-domain coverage, ${counts.SINGLE_LINKED} single-linked, and ${counts.BLIND_SPOT} remain as blind spots with no resolution intelligence. Recommend immediate review of the ${counts.BLIND_SPOT} blind-spot actors.`;
}

export function isTarecQuery(q) {
  return /tarec|threat.{0,20}actor.{0,20}(resolution|coverage|tracking|blind.?spot)|actor.{0,25}(resolution|coverage|matrix)|blind.?spot.{0,20}(actor|intel|profile)|intel.{0,20}(profile|actor).{0,20}(resolution|coverage|tracking)|untracked.?actor|threat.?resolution.?coverage|actor.?coverage.?matrix|intel.?resolution/i.test(q);
}

const FILTER_TABS = ["ALL", "FULLY_TRACKED", "DUAL_TRACKED", "SINGLE_LINKED", "BLIND_SPOT"];

const COVER_COLOR = {
  FULLY_TRACKED: GN,
  DUAL_TRACKED: CY,
  SINGLE_LINKED: AM,
  BLIND_SPOT: RD,
};

const COVER_LABEL = {
  FULLY_TRACKED: "FULLY TRACKED",
  DUAL_TRACKED: "DUAL TRACKED",
  SINGLE_LINKED: "SINGLE LINKED",
  BLIND_SPOT: "BLIND SPOT",
};

function TarecPanel({ onClose }) {
  const [profiles, setProfiles] = useState([]);
  const [centralityNodes, setCentralityNodes] = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [brief, setBrief] = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const base = apiBase();
      const hdrs = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
      const [pr, cr, ir, ar] = await Promise.allSettled([
        fetch(`${base}/entities/IntelProfile`, { headers: hdrs }).then(r => r.json()),
        fetch(`${base}/v1/graph/centrality`, { headers: hdrs }).then(r => r.json()),
        fetch(`${base}/v1/investigations`, { headers: hdrs }).then(r => r.json()),
        fetch(`${base}/v1/ops/alerts`, { headers: hdrs }).then(r => r.json()),
      ]);
      const profs = normProfiles(pr.status === "fulfilled" ? pr.value : []);
      const nodes = normCentrality(cr.status === "fulfilled" ? cr.value : []);
      const invs = normInvestigations(ir.status === "fulfilled" ? ir.value : []);
      const alts = normAlerts(ar.status === "fulfilled" ? ar.value : []);
      setProfiles(profs); setCentralityNodes(nodes); setInvestigations(invs); setAlerts(alts);
      const built = profs.map(p => {
        const pToks = tokens([p.name, p.org, p.role, p.desc, ...p.tags].join(" "));
        const cover = classify(p, nodes, invs, alts);
        return {
          ...p,
          cover,
          matchedNodes: matchItems(pToks, nodes),
          matchedInvs: matchItems(pToks, invs),
          matchedAlerts: matchItems(pToks, alts),
          relNodes: nodes.reduce((acc, n) => { acc[n.id] = relScore(pToks, n); return acc; }, {}),
          relInvs: invs.reduce((acc, inv) => { acc[inv.id] = relScore(pToks, inv); return acc; }, {}),
          relAlerts: alts.reduce((acc, a) => { acc[a.id] = relScore(pToks, a); return acc; }, {}),
        };
      });
      setRows(built);
    } catch (e) {
      setErr(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  const counts = { FULLY_TRACKED: 0, DUAL_TRACKED: 0, SINGLE_LINKED: 0, BLIND_SPOT: 0 };
  rows.forEach(r => counts[r.cover]++);
  const total = rows.length;
  const covPct = total ? Math.round((counts.FULLY_TRACKED / total) * 100) : 0;
  const barColor = covPct >= 70 ? GN : covPct >= 40 ? AM : RD;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r.cover !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.name.toLowerCase().includes(s) || r.org.toLowerCase().includes(s) || r.role.toLowerCase().includes(s);
    }
    return true;
  });

  async function assess() {
    setAssessing(true); setBrief("");
    try {
      const script = await buildTarecScript();
      setBrief(script);
      const voice = typeof getActiveVoice === "function" ? getActiveVoice() : "ash";
      const r = await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: script, voice }),
      });
      if (r.ok) {
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        audio.play();
      }
    } catch { setBrief("Assessment unavailable."); }
    setAssessing(false);
  }

  const panelStyle = {
    position: "fixed", bottom: 52, left: BTN_LEFT, zIndex: Z_IDX,
    width: 820, maxHeight: "80vh", overflowY: "auto",
    background: BG, border: `1px solid ${CY}44`, borderRadius: 12,
    padding: "16px 18px", fontFamily: MN, color: "#DCEBF5",
    boxShadow: `0 0 60px ${CY}18`, backdropFilter: "blur(10px)",
  };

  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ TAREC — THREAT ACTOR RESOLUTION COVERAGE</span>
        <button onClick={load} title="Refresh" style={{ marginLeft: "auto", background: "none", border: `1px solid ${CY}44`, borderRadius: 6, color: CY, cursor: "pointer", padding: "2px 8px", fontSize: 10 }}>↻</button>
        <button onClick={onClose} style={{ background: "none", border: `1px solid ${RD}44`, borderRadius: 6, color: RD, cursor: "pointer", padding: "2px 8px", fontSize: 10 }}>✕</button>
      </div>

      {loading && <div style={{ color: CY, fontSize: 11 }}>Loading threat actor resolution matrix…</div>}
      {err && <div style={{ color: RD, fontSize: 11 }}>Error: {err}</div>}

      {!loading && !err && (
        <>
          {/* Stat tiles */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {[
              ["INTEL PROFILES", total, CY],
              ["CENTRALITY NODES", centralityNodes.length, PU],
              ["INVESTIGATIONS", investigations.length, TE],
              ["OPS ALERTS", alerts.length, OR],
              ["FULLY TRACKED", counts.FULLY_TRACKED, GN],
              ["DUAL TRACKED", counts.DUAL_TRACKED, CY],
              ["SINGLE LINKED", counts.SINGLE_LINKED, AM],
              ["BLIND SPOTS", counts.BLIND_SPOT, RD],
            ].map(([label, val, color]) => (
              <div key={label} style={{ background: DIM, border: `1px solid ${color}33`, borderRadius: 8, padding: "6px 10px", minWidth: 90, textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
            <div style={{ background: DIM, border: `1px solid ${barColor}33`, borderRadius: 8, padding: "6px 10px", minWidth: 90, textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: barColor }}>{covPct}%</div>
              <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>COV%</div>
            </div>
          </div>

          {/* Coverage bar */}
          <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, marginBottom: 12, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${covPct}%`, background: barColor, borderRadius: 3, transition: "width 0.6s" }} />
          </div>

          {/* Filter tabs + search */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
            {FILTER_TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${CY}22` : "none",
                border: `1px solid ${tab === t ? CY : CY + "33"}`,
                borderRadius: 6, color: tab === t ? CY : "#6E8AA0",
                cursor: "pointer", padding: "3px 10px", fontSize: 10, fontFamily: MN,
              }}>{t.replace(/_/g, " ")}{t !== "ALL" ? ` (${counts[t] ?? 0})` : ` (${total})`}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search actors…"
              style={{ marginLeft: "auto", background: DIM, border: `1px solid ${CY}33`, borderRadius: 6, color: "#DCEBF5", padding: "3px 10px", fontSize: 10, fontFamily: MN, outline: "none", width: 160 }}
            />
          </div>

          {/* BLIND_SPOT badge */}
          {counts.BLIND_SPOT > 0 && (
            <div style={{ marginBottom: 10, padding: "6px 10px", background: `${RD}11`, border: `1px solid ${RD}44`, borderRadius: 8, fontSize: 11, color: RD }}>
              ⚠ {counts.BLIND_SPOT} threat actor{counts.BLIND_SPOT > 1 ? "s" : ""} with no resolution intelligence — immediate review recommended.
            </div>
          )}

          {/* Rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {visible.map(row => {
              const isExp = expanded === row.id;
              const cc = COVER_COLOR[row.cover];
              const isBlind = row.cover === "BLIND_SPOT";
              return (
                <div key={row.id} style={{
                  background: DIM, border: `1px solid ${cc}33`, borderRadius: 8,
                  overflow: "hidden",
                  animation: isBlind ? "tarecpulse 2s ease-in-out infinite" : "none",
                }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : row.id)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer" }}
                  >
                    <span style={{ fontSize: 10, color: cc, fontWeight: 700, minWidth: 110 }}>{COVER_LABEL[row.cover]}</span>
                    <span style={{ fontSize: 12, color: "#DCEBF5", flex: 1 }}>{row.name}</span>
                    {row.org && <span style={{ fontSize: 10, color: OR }}>{row.org}</span>}
                    {row.role && <span style={{ fontSize: 9, color: PU, border: `1px solid ${PU}44`, borderRadius: 4, padding: "1px 5px" }}>{row.role}</span>}
                    <span style={{ fontSize: 10, color: "#6E8AA0" }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{ padding: "0 12px 12px" }}>
                      {row.desc && <div style={{ fontSize: 11, color: "#6E8AA0", marginBottom: 10 }}>{row.desc}</div>}

                      {/* Matched centrality nodes */}
                      {row.matchedNodes.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 9, color: PU, letterSpacing: 1, marginBottom: 4 }}>GRAPH CENTRALITY NODES</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {row.matchedNodes.map(n => (
                              <div key={n.id} style={{ background: `${PU}0a`, border: `1px solid ${PU}33`, borderRadius: 6, padding: "5px 8px", display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 11, color: "#DCEBF5", flex: 1 }}>{n.name}</span>
                                {n.category && <span style={{ fontSize: 9, color: PU, border: `1px solid ${PU}44`, borderRadius: 4, padding: "1px 4px" }}>{n.category}</span>}
                                <div style={{ width: 60, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${Math.round(relScore(tokens([row.name, row.org, row.role, row.desc, ...row.tags].join(" ")), n) * 100)}%`, background: PU, borderRadius: 2 }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Matched investigations */}
                      {row.matchedInvs.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 9, color: TE, letterSpacing: 1, marginBottom: 4 }}>INVESTIGATIONS</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {row.matchedInvs.map(inv => (
                              <div key={inv.id} style={{ background: `${TE}0a`, border: `1px solid ${TE}33`, borderRadius: 6, padding: "5px 8px", display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 11, color: "#DCEBF5", flex: 1 }}>{inv.name}</span>
                                {inv.status && <span style={{ fontSize: 9, color: TE, border: `1px solid ${TE}44`, borderRadius: 4, padding: "1px 4px" }}>{inv.status}</span>}
                                <div style={{ width: 60, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${Math.round(relScore(tokens([row.name, row.org, row.role, row.desc, ...row.tags].join(" ")), inv) * 100)}%`, background: TE, borderRadius: 2 }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Matched alerts */}
                      {row.matchedAlerts.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 9, color: OR, letterSpacing: 1, marginBottom: 4 }}>OPS ALERTS</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {row.matchedAlerts.map(a => (
                              <div key={a.id} style={{ background: `${OR}0a`, border: `1px solid ${OR}33`, borderRadius: 6, padding: "5px 8px", display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 11, color: "#DCEBF5", flex: 1 }}>{a.name}</span>
                                {a.severity && <span style={{ fontSize: 9, color: a.severity === "critical" ? RD : a.severity === "high" ? OR : AM, border: `1px solid ${OR}44`, borderRadius: 4, padding: "1px 4px" }}>{a.severity}</span>}
                                <div style={{ width: 60, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${Math.round(relScore(tokens([row.name, row.org, row.role, row.desc, ...row.tags].join(" ")), a) * 100)}%`, background: OR, borderRadius: 2 }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {row.cover === "BLIND_SPOT" && (
                        <div style={{ padding: "6px 8px", background: `${RD}11`, border: `1px solid ${RD}44`, borderRadius: 6, fontSize: 10, color: RD }}>
                          ⚠ No matching centrality nodes, investigations, or operational alerts found for this threat actor.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {visible.length === 0 && !loading && (
              <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 11, padding: 20 }}>No actors match current filter.</div>
            )}
          </div>

          {/* Assess button */}
          <div style={{ marginTop: 12 }}>
            <button
              onClick={assess} disabled={assessing}
              style={{ background: assessing ? `${CY}22` : `${CY}11`, border: `1px solid ${CY}55`, borderRadius: 8, color: CY, cursor: assessing ? "default" : "pointer", padding: "6px 16px", fontSize: 11, fontFamily: MN, letterSpacing: 1 }}
            >
              {assessing ? "◍ ASSESSING…" : "▶ ASSESS THREAT ACTOR RESOLUTION"}
            </button>
          </div>
          {brief && (
            <div style={{ marginTop: 10, padding: "10px 12px", background: `${CY}08`, border: `1px solid ${CY}33`, borderRadius: 8, fontSize: 11, color: "#DCEBF5", lineHeight: 1.6 }}>
              {brief}
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes tarecpulse {
          0%, 100% { border-color: ${RD}33; }
          50% { border-color: ${RD}99; box-shadow: 0 0 12px ${RD}44; }
        }
      `}</style>
    </div>
  );
}

export default function IntelProfileThreatActorResolution() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:tarec-toggle", onToggle);
    return () => window.removeEventListener("jarvis:tarec-toggle", onToggle);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="TAREC — Threat Actor Resolution Coverage"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_IDX,
          background: open ? `${CY}22` : "rgba(6,10,18,0.82)",
          border: `1px solid ${open ? CY : CY + "44"}`,
          borderRadius: 8, color: open ? CY : CY + "99",
          cursor: "pointer", padding: "4px 10px", fontSize: 10,
          fontFamily: MN, letterSpacing: 1,
          boxShadow: open ? `0 0 20px ${CY}44` : "none",
        }}
      >
        ◈ TAREC
      </button>
      {open && <TarecPanel onClose={() => setOpen(false)} />}
    </>
  );
}
