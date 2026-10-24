/**
 * F154 Scene × Contact × Knowledge × IntelProfile
 * Cinematic Intelligence Attribution Depth Map — ◈ SCKNID
 *
 * Fetches: all 10 /v1/cinematic/scene/{1..10} + /entities/Contact
 *          + /knowledge/ + /entities/IntelProfile
 * Keyword-matches each scene against contacts, knowledge articles,
 * and intel profiles to classify:
 *   ATTRIBUTED — matched all 3 operational sources (fully grounded)
 *   STAFFED    — matched 2 sources
 *   KNOWN      — matched exactly 1 source
 *   DARK       — zero matches (scene with no contact owner, no knowledge
 *                grounding, no intel profile — cinematic blind spot)
 * Red pulse on DARK count.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CYAN  = "#29E7FF";
const GREEN = "#00FF88";
const AMBER = "#FFB347";
const RED   = "#FF3B6B";
const DIM   = "#566878";

const CLS_COLOR = { ATTRIBUTED: GREEN, STAFFED: CYAN, KNOWN: AMBER, DARK: RED };
const CLS_ORDER = { ATTRIBUTED: 4, STAFFED: 3, KNOWN: 2, DARK: 1 };

const REFRESH_MS = 90_000;
const SCENE_IDS  = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const SCKNID_RE = /\b(scknid|scene.*contact.*knowledge|scene.*intel.*profile|cinematic.*attribution|scene.*attribution|cinematic.*intelligence.*depth|scene.*intel.*depth|dark.*scene|scene.*dark|unattributed.*scene|scene.*knowledge.*intel|attribution.*depth.*map|scene.*knowledge.*contact|cinematic.*intel.*depth|scene.*ownership|scene.*grounding)\b/i;

export function isScknidQuery(q) { return SCKNID_RE.test(q || ""); }

export function buildScknidScript(rows) {
  const total      = rows.length;
  const attributed = rows.filter(r => r.cls === "ATTRIBUTED").length;
  const dark       = rows.filter(r => r.cls === "DARK").length;
  return (
    `Cinematic Intelligence Attribution Depth Map: ${total} scene${total !== 1 ? "s" : ""} assessed across contact ownership, knowledge grounding, and intel profile sources. ` +
    `${attributed} fully attributed (contact owner, knowledge articles, and intel profile all confirmed). ` +
    (dark > 0
      ? `${dark} dark — no contact owner, no knowledge grounding, no intel profile. Cinematic blind spots with zero intelligence attribution requiring immediate remediation.`
      : "No dark scenes detected.")
  );
}

function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  const bToks = new Set(tokens(bStr));
  return aToks.some(t => bToks.has(t));
}

function normalizeArray(raw, keys) {
  const arr = Array.isArray(raw)                ? raw
    : Array.isArray(raw?.data)                  ? raw.data
    : Array.isArray(raw?.items)                 ? raw.items
    : Array.isArray(raw?.results)               ? raw.results
    : Array.isArray(raw?.nodes)                 ? raw.nodes
    : Array.isArray(raw?.articles)              ? raw.articles
    : Array.isArray(raw?.reports)               ? raw.reports
    : Array.isArray(raw?.skills)                ? raw.skills
    : Array.isArray(raw?.datasets)              ? raw.datasets
    : Array.isArray(raw?.scenarios)             ? raw.scenarios
    : Array.isArray(raw?.alerts)                ? raw.alerts
    : Array.isArray(raw?.investigations)        ? raw.investigations
    : Array.isArray(raw?.contacts)              ? raw.contacts
    : Array.isArray(raw?.profiles)              ? raw.profiles
    : [];
  return arr.map(item => {
    let label = "";
    for (const k of keys) if (item[k]) { label = String(item[k]); break; }
    return { ...item, _label: label };
  });
}

async function fetcher(path) {
  try {
    const r = await fetch(`${apiBase()}${path}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

function classifyScene(scene, contacts, knowledge, intelProfiles) {
  const sText = [
    scene._label, scene.title, scene.name, scene.description,
    scene.tags, scene.theme, scene.category, scene.anchor,
  ].filter(Boolean).join(" ");
  const aToks = tokens(sText);

  const matchedContacts = contacts.filter(c =>
    overlaps(aToks, [c._label, c.name, c.role, c.org, c.organisation, c.title, c.category, c.tags].join(" "))
  );
  const matchedKnowledge = knowledge.filter(k =>
    overlaps(aToks, [k._label, k.name, k.title, k.category, k.tags, k.description, k.summary].join(" "))
  );
  const matchedProfiles = intelProfiles.filter(p =>
    overlaps(aToks, [p._label, p.name, p.title, p.category, p.type, p.description, p.tags, p.target].join(" "))
  );

  const sources = [
    matchedContacts.length > 0,
    matchedKnowledge.length > 0,
    matchedProfiles.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (sources === 3) cls = "ATTRIBUTED";
  else if (sources === 2) cls = "STAFFED";
  else if (sources === 1) cls = "KNOWN";
  else cls = "DARK";

  return { scene, cls, matchedContacts, matchedKnowledge, matchedProfiles };
}

export default function SceneContactKnowledgeIntelDepthMap() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [filter, setFilter]       = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [contactsRaw, knowledgeRaw, profilesRaw, ...scenesRaw] = await Promise.all([
        fetcher("/entities/Contact"),
        fetcher("/knowledge/"),
        fetcher("/entities/IntelProfile"),
        ...SCENE_IDS.map(id => fetcher(`/v1/cinematic/scene/${id}`)),
      ]);

      const contacts  = normalizeArray(contactsRaw,  ["name", "title", "role", "org"]);
      const knowledge = normalizeArray(knowledgeRaw,  ["title", "name", "category", "summary"]);
      const profiles  = normalizeArray(profilesRaw,  ["name", "title", "type", "category"]);

      const scenes = scenesRaw
        .map((raw, idx) => {
          if (!raw) return null;
          const base = Array.isArray(raw) ? raw[0] : (raw?.data || raw?.scene || raw);
          if (!base) return null;
          const item = { ...base };
          if (!item._label) {
            const keys = ["title", "name", "theme", "description", "anchor"];
            for (const k of keys) if (item[k]) { item._label = String(item[k]); break; }
            if (!item._label) item._label = `Scene ${SCENE_IDS[idx]}`;
          }
          item._sceneId = SCENE_IDS[idx];
          return item;
        })
        .filter(Boolean);

      const built = scenes.map(s => classifyScene(s, contacts, knowledge, profiles));
      built.sort((a, b) => (CLS_ORDER[a.cls] || 0) - (CLS_ORDER[b.cls] || 0));
      setRows(built);
    } catch (e) {
      setError(e.message || "Load failed");
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
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:scknid-toggle", toggle);
    return () => window.removeEventListener("jarvis:scknid-toggle", toggle);
  }, []);

  const dark    = rows.filter(r => r.cls === "DARK").length;
  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const label = (r.scene?._label || r.scene?.title || r.scene?.name || "").toLowerCase();
      if (!label.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    try {
      const script = buildScknidScript(rows);
      const resp = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await resp.json();
      const text = d.response || d.answer || d.message || script;
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text }),
      });
    } catch { /* non-fatal */ }
    finally { setAssessing(false); }
  }, [assessing, rows]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Scene × Contact × Knowledge × IntelProfile — Cinematic Intelligence Attribution Depth Map"
        style={{
          position: "fixed", left: 134600, bottom: 8, zIndex: 251,
          background: "rgba(0,20,40,0.82)", border: `1px solid ${dark > 0 ? RED : CYAN}`,
          color: dark > 0 ? RED : CYAN, borderRadius: 4, padding: "3px 7px",
          fontSize: 10, fontFamily: "monospace", cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: dark > 0 ? `0 0 6px ${RED}` : "none",
          animation: dark > 0 ? "pulse-red 1.4s infinite" : "none",
        }}
      >
        ◈ SCKNID{dark > 0 ? ` — ${dark} DARK` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9251,
      background: "rgba(0,8,20,0.96)", display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: CYAN, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
        borderBottom: `1px solid ${CYAN}22`, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
          ◈ SCKNID — CINEMATIC INTELLIGENCE ATTRIBUTION DEPTH MAP
        </span>
        <span style={{ fontSize: 11, color: DIM }}>
          Scene × Contact × Knowledge × IntelProfile (4-source)
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: DIM }}>
          {rows.length} scenes ·{" "}
          {dark > 0
            ? <span style={{ color: RED, fontWeight: 700 }}>{dark} DARK</span>
            : <span style={{ color: GREEN }}>0 dark</span>}
        </span>
        <button onClick={assess} disabled={assessing || rows.length === 0}
          style={{ background: "none", border: `1px solid ${CYAN}`, color: CYAN,
            borderRadius: 3, padding: "2px 10px", fontSize: 11, cursor: "pointer" }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
        <button onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: DIM, fontSize: 16, cursor: "pointer" }}>
          ✕
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, padding: "8px 16px", flexShrink: 0,
        borderBottom: `1px solid ${CYAN}11` }}>
        {["ALL", "ATTRIBUTED", "STAFFED", "KNOWN", "DARK"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{
              background: filter === f ? `${CLS_COLOR[f] || CYAN}22` : "none",
              border: `1px solid ${filter === f ? (CLS_COLOR[f] || CYAN) : DIM}`,
              color: filter === f ? (CLS_COLOR[f] || CYAN) : DIM,
              borderRadius: 3, padding: "2px 8px", fontSize: 10, cursor: "pointer",
            }}>
            {f}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search scene…"
          style={{ marginLeft: "auto", background: "rgba(41,231,255,0.06)",
            border: `1px solid ${CYAN}33`, color: CYAN, borderRadius: 3,
            padding: "2px 8px", fontSize: 10, outline: "none", width: 200 }} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px 16px" }}>
        {loading && <div style={{ color: DIM, fontSize: 12, padding: 8 }}>Loading…</div>}
        {error && <div style={{ color: RED, fontSize: 12, padding: 8 }}>Error: {error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div style={{ color: DIM, fontSize: 12, padding: 8 }}>No scenes match current filter.</div>
        )}
        {visible.map((row, i) => {
          const key   = row.scene._label || row.scene.title || row.scene._sceneId || i;
          const isExp = !!expanded[key];
          const col   = CLS_COLOR[row.cls];
          return (
            <div key={key} style={{ marginBottom: 4 }}>
              <div
                onClick={() => setExpanded(e => ({ ...e, [key]: !e[key] }))}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "5px 8px", borderRadius: 4, cursor: "pointer",
                  background: "rgba(41,231,255,0.03)",
                  border: `1px solid ${col}33`,
                }}
              >
                <span style={{ color: col, fontSize: 10, fontWeight: 700, minWidth: 96 }}>
                  {row.cls}
                </span>
                <span style={{ color: DIM, fontSize: 9, fontWeight: 700, minWidth: 52,
                  background: `${DIM}18`, borderRadius: 2, padding: "1px 4px" }}>
                  SC{row.scene._sceneId || "?"}
                </span>
                <span style={{ fontSize: 11, flex: 1, color: "#c8e8f8" }}>
                  {row.scene._label || row.scene.title || row.scene.name || "(scene)"}
                </span>
                <span style={{ fontSize: 10, color: DIM }}>
                  C:{row.matchedContacts.length} K:{row.matchedKnowledge.length} I:{row.matchedProfiles.length}
                </span>
                <span style={{ color: DIM, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ padding: "4px 12px 4px 20px", fontSize: 10,
                  borderLeft: `1px solid ${col}44`, marginLeft: 8, marginTop: 2 }}>
                  {row.matchedContacts.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: CYAN, fontWeight: 700 }}>Contacts ({row.matchedContacts.length}):</span>
                      {row.matchedContacts.slice(0, 6).map((c, ci) => {
                        const roleOrg = [c.role, c.org || c.organisation].filter(Boolean).join(" · ");
                        return (
                          <span key={ci} style={{ marginLeft: 6, color: "#c8e8f8" }}>
                            {c._label || c.name}
                            {roleOrg && (
                              <span style={{ color: CYAN, background: `${CYAN}18`,
                                borderRadius: 2, padding: "0 3px", marginLeft: 2, fontSize: 9 }}>
                                {roleOrg}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedKnowledge.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: GREEN, fontWeight: 700 }}>Knowledge ({row.matchedKnowledge.length}):</span>
                      {row.matchedKnowledge.slice(0, 6).map((k, ki) => {
                        const cat = k.category || k.type;
                        return (
                          <span key={ki} style={{ marginLeft: 6, color: "#c8e8f8" }}>
                            {k._label || k.title || k.name}
                            {cat && (
                              <span style={{ color: GREEN, background: `${GREEN}18`,
                                borderRadius: 2, padding: "0 3px", marginLeft: 2, fontSize: 9 }}>
                                {cat}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedProfiles.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: AMBER, fontWeight: 700 }}>IntelProfiles ({row.matchedProfiles.length}):</span>
                      {row.matchedProfiles.slice(0, 6).map((p, pi) => {
                        const cat = p.category || p.type;
                        return (
                          <span key={pi} style={{ marginLeft: 6, color: "#c8e8f8" }}>
                            {p._label || p.name || p.title}
                            {cat && (
                              <span style={{ color: AMBER, background: `${AMBER}18`,
                                borderRadius: 2, padding: "0 3px", marginLeft: 2, fontSize: 9 }}>
                                {cat}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedContacts.length === 0 && row.matchedKnowledge.length === 0 &&
                   row.matchedProfiles.length === 0 && (
                    <span style={{ color: DIM }}>No matching sources — dark scene (cinematic intelligence blind spot).</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
