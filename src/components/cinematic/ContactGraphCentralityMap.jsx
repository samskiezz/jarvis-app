/**
 * F131 — Contact × Graph Centrality Intelligence Map (CGCM)
 *
 * Parallel-fetches /entities/Contact and /v1/graph/centrality every 90 s.
 * Keyword-correlates each contact (name, email, title, company, description)
 * against top-centrality graph nodes (id, label, type) to classify:
 *
 *  HIGH_INFLUENCE — contact keywords match at least one high-centrality node
 *  PERIPHERAL     — no central-node coverage found for this contact
 *
 * Stat tiles: contacts / nodes / high-influence / peripheral
 * Amber badge on high-influence count.
 * Filter tabs: ALL / HIGH_INFLUENCE / PERIPHERAL + text search.
 * Expand contact row → matched nodes with centrality score + relevance bar.
 * ▶ ASSESS: 2-sentence brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ CGCM  at left:4560 bottom:18, zIndex:68.
 * Event:   jarvis:cgcm-toggle
 * Voice:   "contact graph / graph contact / cgcm / influential contacts /
 *           contact centrality / contact network / central contacts /
 *           which contacts are in the graph / contact graph coverage"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const MUTED = "#6E8AA0";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 4560;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseContacts(raw) {
  return normaliseArray(raw).map((c, i) => ({
    id:          String(c.id ?? c.contact_id ?? i),
    name:        c.name ?? c.full_name ?? c.display_name ?? `Contact ${i + 1}`,
    email:       c.email ?? c.email_address ?? "",
    title:       c.title ?? c.role ?? c.occupation ?? "",
    company:     c.company ?? c.organization ?? c.employer ?? "",
    description: c.description ?? c.notes ?? c.bio ?? c.summary ?? "",
    tags:        Array.isArray(c.tags) ? c.tags : [],
  }));
}

function normaliseNodes(raw) {
  const arr = normaliseArray(raw);
  return arr.map((n, i) => ({
    id:          String(n.id ?? n.node_id ?? i),
    label:       n.label ?? n.name ?? n.title ?? String(n.id ?? i),
    type:        n.type ?? n.node_type ?? n.category ?? "node",
    centrality:  typeof n.centrality === "number" ? n.centrality
               : typeof n.score === "number"      ? n.score
               : 0,
  }));
}

function tokenise(text) {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3);
}

function correlate(contact, nodes) {
  const haystack = [
    contact.name, contact.email, contact.title,
    contact.company, contact.description, ...contact.tags,
  ].join(" ");
  const needles = new Set(tokenise(haystack));
  const matches = [];
  for (const node of nodes) {
    const nodeTokens = tokenise(`${node.id} ${node.label} ${node.type}`);
    const score = nodeTokens.filter(t => needles.has(t)).length;
    if (score > 0) matches.push({ ...node, score });
  }
  matches.sort((a, b) => b.score - a.score || b.centrality - a.centrality);
  return matches;
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const CGCM_RE = /\b(contact\s*graph|graph\s*contact|cgcm|influential\s*contact|contact\s*centrali|central\s*contact|contact\s*network|contact.*in.*graph|graph.*contact.*coverage)\b/i;

export function isCgcmQuery(q) {
  return CGCM_RE.test(q);
}

export async function buildCgcmScript() {
  try {
    const base = apiBase();
    const [cr, gr] = await Promise.all([
      fetch(`${base}/entities/Contact`,        { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/v1/graph/centrality`,     { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const [cRaw, gRaw] = await Promise.all([cr.json(), gr.json()]);
    const contacts = normaliseContacts(cRaw);
    const nodes    = normaliseNodes(gRaw);
    const linked   = contacts.filter(c => correlate(c, nodes).length > 0).length;
    return `JARVIS CGCM: ${contacts.length} contacts mapped against ${nodes.length} high-centrality graph nodes. ${linked} contacts are HIGH_INFLUENCE — directly linked to central network nodes — while ${contacts.length - linked} remain PERIPHERAL with no graph coverage detected.`;
  } catch {
    return "CGCM data unavailable. Check /entities/Contact and /v1/graph/centrality endpoints.";
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function ContactGraphCentralityMap() {
  const [open, setOpen]         = useState(false);
  const [contacts, setContacts] = useState([]);
  const [nodes, setNodes]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState(null);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const base = apiBase();
      const [cr, gr] = await Promise.all([
        fetch(`${base}/entities/Contact`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/v1/graph/centrality`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const [cRaw, gRaw] = await Promise.all([cr.json(), gr.json()]);
      setContacts(normaliseContacts(cRaw));
      setNodes(normaliseNodes(gRaw));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:cgcm-toggle", handler);
    return () => window.removeEventListener("jarvis:cgcm-toggle", handler);
  }, []);

  const rows = contacts.map(c => {
    const matches = correlate(c, nodes);
    return { ...c, matches, status: matches.length > 0 ? "HIGH_INFLUENCE" : "PERIPHERAL" };
  });

  const highCount = rows.filter(r => r.status === "HIGH_INFLUENCE").length;
  const maxCent   = Math.max(...nodes.map(n => n.centrality), 1);

  const filtered = rows.filter(r => {
    if (tab === "HIGH_INFLUENCE" && r.status !== "HIGH_INFLUENCE") return false;
    if (tab === "PERIPHERAL"     && r.status !== "PERIPHERAL")     return false;
    if (search) {
      const q = search.toLowerCase();
      return r.name.toLowerCase().includes(q) ||
             r.email.toLowerCase().includes(q) ||
             r.company.toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true); setAssessText("");
    const script = await buildCgcmScript();
    setAssessText(script);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    setAssessing(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
          background: "rgba(0,20,40,0.85)", border: `1px solid ${CY}55`,
          color: CY, fontFamily: MONO, fontSize: 10, padding: "4px 8px",
          borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        ◈ CGCM
        {highCount > 0 && (
          <span style={{
            marginLeft: 5, background: AMBER, color: "#000",
            borderRadius: 3, padding: "1px 5px", fontSize: 9,
          }}>
            {highCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: 60, bottom: 60, zIndex: 200,
      width: 560, maxHeight: "72vh",
      background: "rgba(0,12,28,0.97)", border: `1px solid ${CY}44`,
      borderRadius: 10, display: "flex", flexDirection: "column",
      fontFamily: MONO, color: CY, fontSize: 11, overflow: "hidden",
      boxShadow: `0 0 32px ${CY}18`,
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 12px", borderBottom: `1px solid ${CY}22`,
        background: "rgba(0,30,60,0.5)",
      }}>
        <span style={{ flex: 1, fontWeight: 700, letterSpacing: 1 }}>
          ◈ CONTACT × GRAPH CENTRALITY MAP
        </span>
        {loading && <span style={{ color: MUTED, fontSize: 9 }}>POLLING…</span>}
        <button onClick={load} style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 13 }}>↺</button>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 15 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 12px" }}>
        {[
          { label: "CONTACTS", val: contacts.length, col: CY },
          { label: "NODES",    val: nodes.length,    col: MUTED },
          { label: "HIGH-INF", val: highCount,        col: AMBER },
          { label: "PERIPH",   val: rows.length - highCount, col: GREEN },
        ].map(({ label, val, col }) => (
          <div key={label} style={{
            flex: 1, background: "rgba(0,20,40,0.7)", border: `1px solid ${col}33`,
            borderRadius: 6, padding: "5px 8px", textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ color: MUTED, fontSize: 8, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 12px 6px" }}>
        {["ALL", "HIGH_INFLUENCE", "PERIPHERAL"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "3px 9px", borderRadius: 4, fontSize: 9, cursor: "pointer",
            background: tab === t ? CY : "rgba(0,20,40,0.6)",
            color: tab === t ? "#000" : CY,
            border: `1px solid ${CY}44`,
          }}>
            {t}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search contacts…"
          style={{
            flex: 1, background: "rgba(0,20,40,0.6)", border: `1px solid ${CY}33`,
            color: CY, borderRadius: 4, padding: "3px 7px", fontSize: 9, fontFamily: MONO,
          }}
        />
      </div>

      {/* rows */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 8px" }}>
        {err && <div style={{ color: "#FF3B6B", padding: 8 }}>Error: {err}</div>}
        {!err && filtered.length === 0 && (
          <div style={{ color: MUTED, padding: 8, fontSize: 10 }}>No contacts match.</div>
        )}
        {filtered.map(r => (
          <div key={r.id} style={{ marginBottom: 4 }}>
            <div
              onClick={() => setExpanded(x => ({ ...x, [r.id]: !x[r.id] }))}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "5px 8px",
                background: "rgba(0,20,40,0.55)", border: `1px solid ${CY}22`,
                borderRadius: 5, cursor: "pointer",
              }}
            >
              <span style={{ flex: 1, color: CY, fontSize: 10 }}>{r.name}</span>
              {r.company && <span style={{ color: MUTED, fontSize: 9 }}>{r.company}</span>}
              <span style={{
                fontSize: 8, padding: "2px 5px", borderRadius: 3,
                background: r.status === "HIGH_INFLUENCE" ? `${AMBER}22` : `${MUTED}22`,
                color: r.status === "HIGH_INFLUENCE" ? AMBER : MUTED,
                border: `1px solid ${r.status === "HIGH_INFLUENCE" ? AMBER : MUTED}55`,
              }}>
                {r.status}
              </span>
              <span style={{ color: MUTED, fontSize: 9 }}>{expanded[r.id] ? "▲" : "▼"}</span>
            </div>

            {expanded[r.id] && (
              <div style={{
                background: "rgba(0,10,25,0.7)", border: `1px solid ${CY}18`,
                borderTop: "none", borderRadius: "0 0 5px 5px", padding: "6px 10px",
              }}>
                {r.email && (
                  <div style={{ color: MUTED, fontSize: 9, marginBottom: 4 }}>
                    ✉ {r.email}
                    {r.title && <span style={{ marginLeft: 8 }}>· {r.title}</span>}
                  </div>
                )}
                {r.matches.length === 0 ? (
                  <div style={{ color: MUTED, fontSize: 9 }}>No graph-node matches found.</div>
                ) : (
                  r.matches.slice(0, 6).map(m => (
                    <div key={m.id} style={{
                      display: "flex", alignItems: "center", gap: 6,
                      marginBottom: 4,
                    }}>
                      <span style={{ color: CY, fontSize: 9, minWidth: 140 }}>
                        {m.label}
                      </span>
                      <span style={{
                        fontSize: 8, padding: "1px 5px", borderRadius: 3,
                        background: `${MUTED}22`, color: MUTED,
                        border: `1px solid ${MUTED}44`,
                      }}>
                        {m.type}
                      </span>
                      <div style={{
                        flex: 1, height: 5, background: `${CY}18`, borderRadius: 3,
                        overflow: "hidden",
                      }}>
                        <div style={{
                          height: "100%", borderRadius: 3,
                          width: `${Math.min(100, (m.centrality / maxCent) * 100)}%`,
                          background: CY,
                        }} />
                      </div>
                      <span style={{ color: MUTED, fontSize: 8 }}>
                        rel:{m.score}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* assess */}
      <div style={{ padding: "6px 12px 10px", borderTop: `1px solid ${CY}22` }}>
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            background: `${CY}18`, border: `1px solid ${CY}44`,
            color: CY, fontFamily: MONO, fontSize: 9,
            padding: "4px 12px", borderRadius: 4, cursor: "pointer",
          }}
        >
          {assessing ? "ASSESSING…" : "▶ ASSESS"}
        </button>
        {assessText && (
          <div style={{
            marginTop: 6, color: GREEN, fontSize: 9,
            lineHeight: 1.5, background: `${GREEN}0D`,
            border: `1px solid ${GREEN}22`, borderRadius: 4, padding: "5px 8px",
          }}>
            {assessText}
          </div>
        )}
      </div>
    </div>
  );
}
