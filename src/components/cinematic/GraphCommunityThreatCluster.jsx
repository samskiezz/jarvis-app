/**
 * GraphCommunityThreatCluster — F104 (GICTCLSTR).
 *
 * Pulls /v1/graph/communities × /v1/investigations × /entities/Contact and
 * keyword-correlates each graph community against investigations AND contacts,
 * classifying each community as:
 *
 *   HOT_CLUSTER  — matched at least one investigation AND one contact
 *   INV_ONLY     — matched an investigation but no contact
 *   CONTACT_ONLY — matched a contact but no investigation
 *   DORMANT      — no investigation or contact backing (intelligence dead zone)
 *
 * Red pulse on HOT_CLUSTER count (active threat clusters worth watching now).
 *
 * Layout:
 *   • 5 stat tiles: COMMUNITIES / INVESTIGATIONS / CONTACTS / HOT CLUSTERS / DORMANT
 *   • Coverage % bar
 *   • Filter tabs: ALL / HOT_CLUSTER / INV_ONLY / CONTACT_ONLY / DORMANT
 *   • Text search on community id / label / members
 *   • Expandable rows → matched investigations (red) + contacts (cyan)
 *   • ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle:  ◈ GICTCLSTR at left:981980, bottom:8, zIndex:128
 * Mounted: App.jsx
 * Wired:   JarvisBrain.jsx via isGictclstrQuery / buildGictclstrScript
 *
 * Voice: "gictclstr" / "graph community" / "threat cluster" /
 *        "community threat" / "cluster map" / "hot cluster" /
 *        "graph cluster" / "community investigation" /
 *        "community contact" / "active cluster"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const RED   = "#FF3D5A";
const GREEN = "#00c878";
const DIM   = "#1a2a38";

const BTN_LEFT   = 981980;
const REFRESH_MS = 120_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function authHdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function normalise(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function keywords(str = "") {
  return str.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function memberKeywords(community) {
  const members = community.members || community.nodes || community.entities || [];
  const memberStr = Array.isArray(members)
    ? members.map(m => (typeof m === "string" ? m : (m.id || m.name || ""))).join(" ")
    : "";
  return keywords(
    [community.id, community.label, community.name, community.description, community.type, memberStr].join(" ")
  );
}

function matchPool(community, pool) {
  const cks = memberKeywords(community);
  if (!cks.length) return [];
  return pool.filter(item => {
    const pks = keywords(
      [item.title, item.subject, item.name, item.description, item.content, item.type,
       item.role, item.organization, item.status, item.case_id].join(" ")
    );
    return cks.some(k => pks.includes(k));
  });
}

function classify(invHits, contactHits) {
  if (invHits > 0 && contactHits > 0) return "HOT_CLUSTER";
  if (invHits > 0)                    return "INV_ONLY";
  if (contactHits > 0)                return "CONTACT_ONLY";
  return "DORMANT";
}

const CLASS_ORDER = ["HOT_CLUSTER", "INV_ONLY", "CONTACT_ONLY", "DORMANT"];
const CLASS_LABEL = {
  HOT_CLUSTER:  "HOT CLUSTER",
  INV_ONLY:     "INV ONLY",
  CONTACT_ONLY: "CONTACT ONLY",
  DORMANT:      "DORMANT",
};
const CLASS_COLOR = {
  HOT_CLUSTER:  RED,
  INV_ONLY:     "#FF8C42",
  CONTACT_ONLY: CY,
  DORMANT:      "#4a5a6a",
};

const PULSE = { animation: "pulse-gictclstr 1.4s ease-in-out infinite" };

async function fetchData() {
  const base = apiBase();
  const hdr  = authHdr();
  const [rawComm, rawInv, rawContact] = await Promise.all([
    fetch(`${base}/v1/graph/communities`, { headers: hdr }).then(r => r.json()),
    fetch(`${base}/v1/investigations`,    { headers: hdr }).then(r => r.json()),
    fetch(`${base}/entities/Contact`,     { headers: hdr }).then(r => r.json()),
  ]);
  const communities = normalise(rawComm);
  const investigations = normalise(rawInv);
  const contacts = normalise(rawContact);

  const rows = communities.map(comm => {
    const invMatches     = matchPool(comm, investigations);
    const contactMatches = matchPool(comm, contacts);
    const cls            = classify(invMatches.length, contactMatches.length);
    const members        = comm.members || comm.nodes || comm.entities || [];
    return {
      id:             comm.id || comm.community_id || "",
      label:          comm.label || comm.name || comm.id || "Community",
      size:           Array.isArray(members) ? members.length : (comm.size || 0),
      cls,
      invMatches,
      contactMatches,
    };
  });

  return { rows, investigations, contacts };
}

export async function buildGictclstrScript() {
  try {
    const { rows, investigations, contacts } = await fetchData();
    const hot     = rows.filter(r => r.cls === "HOT_CLUSTER").length;
    const dormant = rows.filter(r => r.cls === "DORMANT").length;
    const pct     = rows.length ? Math.round((hot / rows.length) * 100) : 0;
    return (
      `Graph Community Threat Cluster Map: ${rows.length} communities analysed against ` +
      `${investigations.length} investigations and ${contacts.length} contacts. ` +
      `${hot} HOT CLUSTERS (investigation + contact coverage), ${dormant} DORMANT (no coverage). ` +
      `Cluster activation rate ${pct}%. ` +
      (hot > 0
        ? `Recommend immediate review of the ${hot} hot cluster${hot > 1 ? "s" : ""} in the GICTCLSTR panel.`
        : "No active threat clusters detected at this time.")
    );
  } catch {
    return "Graph community threat cluster data unavailable.";
  }
}

export function isGictclstrQuery(q = "") {
  const t = q.toLowerCase();
  return (
    t.includes("gictclstr") ||
    t.includes("graph communit") ||
    t.includes("threat cluster") ||
    t.includes("community threat") ||
    t.includes("cluster map") ||
    t.includes("hot cluster") ||
    t.includes("graph cluster") ||
    t.includes("community investigation") ||
    t.includes("community contact") ||
    t.includes("active cluster")
  );
}

export default function GraphCommunityThreatCluster() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [investigations, setInv] = useState([]);
  const [contacts, setCon]      = useState([]);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState(null);
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const d = await fetchData();
      setRows(d.rows);
      setInv(d.investigations);
      setCon(d.contacts);
    } catch (e) {
      setErr(e.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => { setOpen(o => !o); };
    window.addEventListener("jarvis:gictclstr-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gictclstr-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const hot     = rows.filter(r => r.cls === "HOT_CLUSTER").length;
  const dormant = rows.filter(r => r.cls === "DORMANT").length;
  const pct     = rows.length ? Math.round((hot / rows.length) * 100) : 0;

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.label.toLowerCase().includes(s) || r.id.toLowerCase().includes(s);
    }
    return true;
  });

  const handleAssess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = await buildGictclstrScript();
      const base   = apiBase();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body:    JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const answer = d.answer || script;
      await fetch(`${base}/v1/voice/tts`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body:    JSON.stringify({ text: answer }),
      });
    } catch { /* silent */ }
    setAssessing(false);
  }, []);

  return (
    <>
      <style>{`
        @keyframes pulse-gictclstr {
          0%,100% { box-shadow: 0 0 4px ${RED}88; }
          50%      { box-shadow: 0 0 12px ${RED}cc; }
        }
      `}</style>

      <button
        onClick={() => setOpen(o => !o)}
        title="Graph Community Threat Cluster Map"
        style={{
          position:   "fixed",
          bottom:     8,
          left:       BTN_LEFT,
          zIndex:     128,
          background: "#0a1520",
          border:     `1px solid ${hot > 0 ? RED : CY}55`,
          color:      hot > 0 ? RED : CY,
          borderRadius: 4,
          padding:    "3px 8px",
          fontSize:   9,
          cursor:     "pointer",
          letterSpacing: 1,
          ...(hot > 0 ? PULSE : {}),
        }}
      >
        ◈ GICTCLSTR
      </button>

      {open && (
        <div style={{
          position:   "fixed",
          top:        60,
          left:       "50%",
          transform:  "translateX(-50%)",
          width:      780,
          maxHeight:  "80vh",
          overflowY:  "auto",
          background: "#0a1520",
          border:     `1px solid ${CY}`,
          borderRadius: 8,
          zIndex:     9900,
          padding:    16,
          fontFamily: "monospace",
          color:      "#c8d8e8",
        }}>
          {/* Header */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <span style={{ color:CY, fontSize:13, letterSpacing:2 }}>
              ◈ GRAPH COMMUNITY THREAT CLUSTER MAP
            </span>
            <div style={{ display:"flex", gap:8 }}>
              <button
                onClick={handleAssess}
                disabled={assessing}
                style={{ background:GREEN, color:"#000", border:"none", borderRadius:4, padding:"3px 10px", fontSize:10, cursor:"pointer" }}
              >
                {assessing ? "…" : "▶ ASSESS"}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ background:"transparent", color:"#888", border:"1px solid #333", borderRadius:4, padding:"2px 8px", fontSize:11, cursor:"pointer" }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Stat tiles */}
          {rows.length > 0 && (
            <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
              {[
                { label:"COMMUNITIES",  val: rows.length,           col: CY    },
                { label:"INVESTIGATIONS", val: investigations.length, col: "#FF8C42" },
                { label:"CONTACTS",     val: contacts.length,       col: CY    },
                { label:"HOT CLUSTERS", val: hot,                   col: RED   },
                { label:"DORMANT",      val: dormant,               col: "#4a5a6a" },
              ].map(t => (
                <div key={t.label} style={{ background:DIM, border:`1px solid ${t.col}33`, borderRadius:4, padding:"6px 12px", minWidth:80, textAlign:"center" }}>
                  <div style={{ color:t.col, fontSize:14, fontWeight:"bold" }}>{t.val}</div>
                  <div style={{ color:"#7a9ab8", fontSize:9 }}>{t.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Coverage bar */}
          {rows.length > 0 && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:10, color:"#7a9ab8", marginBottom:4 }}>Hot cluster rate {pct}%</div>
              <div style={{ height:6, background:"#1a2a38", borderRadius:3, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${pct}%`, background: pct >= 50 ? RED : "#FF8C42", transition:"width .4s" }} />
              </div>
            </div>
          )}

          {/* Filter tabs */}
          <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
            {["ALL", ...CLASS_ORDER].map(tab => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                style={{
                  background:   filter === tab ? CY : DIM,
                  color:        filter === tab ? "#000" : "#7a9ab8",
                  border:       `1px solid ${filter === tab ? CY : "#2a3a4a"}`,
                  borderRadius: 3,
                  padding:      "2px 8px",
                  fontSize:     9,
                  cursor:       "pointer",
                }}
              >
                {tab === "ALL" ? "ALL" : CLASS_LABEL[tab]}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            placeholder="Search communities…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width:"100%", background:"#0d1f2d", border:`1px solid #2a3a4a`, color:"#c8d8e8", borderRadius:4, padding:"4px 8px", fontSize:11, marginBottom:10, boxSizing:"border-box" }}
          />

          {loading && <div style={{ color:"#7a9ab8", fontSize:11, textAlign:"center", padding:12 }}>Loading…</div>}
          {err     && <div style={{ color:RED, fontSize:11, padding:8 }}>Error: {err}</div>}

          {/* Rows */}
          {!loading && visible.map(row => {
            const isExp = expanded === row.id;
            const col   = CLASS_COLOR[row.cls];
            return (
              <div key={row.id || row.label} style={{ borderBottom:"1px solid #1a2a38" }}>
                <div
                  onClick={() => setExpanded(isExp ? null : (row.id || row.label))}
                  style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 4px", cursor:"pointer" }}
                >
                  <div>
                    <span style={{ color:"#c8d8e8", fontSize:11 }}>{row.label}</span>
                    {row.size > 0 && (
                      <span style={{ color:"#7a9ab8", fontSize:10, marginLeft:8 }}>[{row.size} members]</span>
                    )}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{
                      background:   col + "22",
                      color:        col,
                      border:       `1px solid ${col}55`,
                      borderRadius: 3,
                      padding:      "1px 7px",
                      fontSize:     9,
                      letterSpacing: 0.5,
                      ...(row.cls === "HOT_CLUSTER" ? { animation: "pulse-gictclstr 1.4s infinite" } : {}),
                    }}>
                      {CLASS_LABEL[row.cls]}
                    </span>
                    <span style={{ color:"#7a9ab8", fontSize:10 }}>
                      INV:{row.invMatches.length} CON:{row.contactMatches.length}
                    </span>
                    <span style={{ color:"#555", fontSize:10 }}>{isExp ? "▲" : "▼"}</span>
                  </div>
                </div>

                {isExp && (
                  <div style={{ padding:"4px 12px 10px", background:"#0d1a26" }}>
                    {row.invMatches.length > 0 && (
                      <div style={{ marginBottom:8 }}>
                        <div style={{ color:RED, fontSize:9, marginBottom:4 }}>INVESTIGATIONS ({row.invMatches.length})</div>
                        {row.invMatches.slice(0, 5).map((inv, i) => (
                          <div key={i} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                            <div style={{ fontSize:10, color:"#c8d8e8", flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                              {inv.title || inv.subject || inv.name || inv.case_id || "—"}
                            </div>
                            <div style={{ width:80, height:4, background:"#1a2a38", borderRadius:2, flexShrink:0 }}>
                              <div style={{ height:"100%", width:`${Math.min(100, 55 + i * 9)}%`, background:RED, borderRadius:2 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {row.contactMatches.length > 0 && (
                      <div>
                        <div style={{ color:CY, fontSize:9, marginBottom:4 }}>CONTACTS ({row.contactMatches.length})</div>
                        {row.contactMatches.slice(0, 5).map((c, i) => (
                          <div key={i} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                            <div style={{ fontSize:10, color:"#c8d8e8", flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                              {c.name || c.title || c.id || "—"}
                              {c.role && <span style={{ color:"#7a9ab8", marginLeft:6 }}>{c.role}</span>}
                            </div>
                            <div style={{ width:80, height:4, background:"#1a2a38", borderRadius:2, flexShrink:0 }}>
                              <div style={{ height:"100%", width:`${Math.min(100, 55 + i * 9)}%`, background:CY, borderRadius:2 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {row.invMatches.length === 0 && row.contactMatches.length === 0 && (
                      <div style={{ color:"#555", fontSize:10 }}>No matching investigations or contacts for this community.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {!loading && visible.length === 0 && rows.length > 0 && (
            <div style={{ color:"#555", fontSize:11, textAlign:"center", padding:12 }}>No communities match filter.</div>
          )}

          <div style={{ color:"#3a4a5a", fontSize:9, marginTop:10, textAlign:"right" }}>
            auto-refresh every {REFRESH_MS / 1000}s · /v1/graph/communities × /v1/investigations × /entities/Contact
          </div>
        </div>
      )}
    </>
  );
}
