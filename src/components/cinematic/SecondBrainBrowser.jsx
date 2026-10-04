/**
 * SecondBrainBrowser — F239.
 *
 * Data sources (all real — backed by server/services/second_brain.py SQLite):
 *   GET /v1/brain/catalog
 *       → {total, counts:{kind→n}, recent:[note…], orphans:[note…]}
 *   GET /v1/brain/notes?limit=50&q=<search>
 *       → {items:[note…], count}
 *   GET /v1/brain/timeline?limit=20
 *       → {items:[note…], count}
 *   GET /v1/brain/notes/{id_or_title}        (lazy, per expand)
 *       → {id, kind, title, body_md, confidence, created_ts, updated_ts, …}
 *
 * Displays:
 *   - Stat tiles: total / kinds / recent-10 / orphans
 *   - CATALOG | NOTES | TIMELINE tab switcher + text search on NOTES
 *   - CATALOG: per-kind count bars
 *   - NOTES: kind chip + title + confidence bar; expand → body excerpt
 *   - TIMELINE: log/daily notes newest first with age chip
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brain health brief + TTS
 *
 * Toggle: ⬡ SBB at left:119280, bottom:8, zIndex:119.
 * Badge: amber = orphans detected; green = live total note count.
 * 90 s auto-refresh of catalog; NOTES & TIMELINE fetched on tab open.
 *
 * Exported helpers for JarvisBrain:
 *   isSbbQuery(q) / buildSbbScript()
 *
 * Voice triggers: "second brain / brain notes / knowledge vault / brain catalog /
 *   my notes / brain timeline / note browser / knowledge base / brain browser /
 *   sbb / orphan notes / note vault / wikilinks"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RED  = "#F87171";
const DIM  = "#3A4A55";
const PURP = "#B06EFF";
const TEAL = "#2DD4BF";
const ORNG = "#FB923C";

const BTN_LEFT   = 119280;
const REFRESH_MS = 90_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SBB_RE =
  /\b(second\s*brain|brain\s*note|knowledge\s*vault|brain\s*catalog|my\s*notes?|brain\s*timeline|note\s*browser|knowledge\s*base|brain\s*browser|sbb\b|orphan\s*note|note\s*vault|wikilink|brain\s*note)/i;

export function isSbbQuery(t) {
  return SBB_RE.test(t || "");
}

const KIND_COLOR = {
  entity:    CY,
  concept:   PURP,
  project:   GN,
  daily:     TEAL,
  log:       AM,
  synthesis: ORNG,
  decision:  RED,
  task:      "#60A5FA",
  intent:    "#A78BFA",
  pack:      "#34D399",
  spec:      "#F472B6",
};

function kindColor(k) {
  return KIND_COLOR[k] || DIM;
}

export async function buildSbbScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/brain/catalog`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    const total   = d?.total   ?? 0;
    const counts  = d?.counts  ?? {};
    const orphans = d?.orphans ?? [];
    if (!total) return "The second brain knowledge vault is empty — no notes recorded yet.";
    const topKinds = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, n]) => `${k}:${n}`)
      .join(", ");
    const orphanStr = orphans.length ? ` ${orphans.length} orphaned note${orphans.length !== 1 ? "s" : ""} have no links.` : "";
    return `Second brain: ${total} notes across ${Object.keys(counts).length} kinds (${topKinds}).${orphanStr}`;
  } catch {
    return "Unable to retrieve second brain catalog at this time, sir.";
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function relAge(epochMs) {
  if (!epochMs) return "–";
  const s = Math.floor((Date.now() - epochMs) / 1000);
  if (s < 0) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function Chip({ label, color }) {
  return (
    <span style={{
      fontSize: 8, letterSpacing: 1, color, padding: "1px 5px",
      border: `1px solid ${color}55`, borderRadius: 3, whiteSpace: "nowrap",
    }}>
      {label.toUpperCase()}
    </span>
  );
}

function ConfBar({ val, color }) {
  if (val == null) return null;
  const pct = Math.round(Math.min(1, Math.max(0, val)) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
      <div style={{
        flex: 1, height: 3, background: `${color}22`, borderRadius: 2, overflow: "hidden",
      }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 8, color: DIM, minWidth: 24, textAlign: "right" }}>
        {pct}%
      </span>
    </div>
  );
}

const TABS = ["CATALOG", "NOTES", "TIMELINE"];

// ─── fetch ────────────────────────────────────────────────────────────────────

async function fetchCatalog() {
  const r = await fetch(`${apiBase()}/v1/brain/catalog`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchNotes(q) {
  const qs = q ? `?q=${encodeURIComponent(q)}&limit=50` : "?limit=50";
  const r  = await fetch(`${apiBase()}/v1/brain/notes${qs}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchTimeline() {
  const r = await fetch(`${apiBase()}/v1/brain/timeline?limit=25`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchNote(idOrTitle) {
  const r = await fetch(`${apiBase()}/v1/brain/notes/${encodeURIComponent(idOrTitle)}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) return null;
  return r.json();
}

async function agentAssess(total, counts, orphans) {
  const topKinds = Object.entries(counts || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k, n]) => `${k}:${n}`)
    .join(", ");
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      message: `Assess the health and coverage of a second brain knowledge vault with ${total} notes ` +
        `(${topKinds}) and ${orphans} orphaned notes in 2 sentences.`,
    }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "No assessment available.";
}

// ─── component ────────────────────────────────────────────────────────────────

export default function SecondBrainBrowser() {
  const [open,      setOpen]      = useState(false);
  const [catalog,   setCatalog]   = useState(null);
  const [notes,     setNotes]     = useState([]);
  const [timeline,  setTimeline]  = useState([]);
  const [tab,       setTab]       = useState("CATALOG");
  const [query,     setQuery]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [notesLoad, setNotesLoad] = useState(false);
  const [timeLoad,  setTimeLoad]  = useState(false);
  const [expanded,  setExpanded]  = useState(null);   // note id
  const [detail,    setDetail]    = useState({});      // {id: noteObj}
  const [detailLoad,setDetailLoad]= useState(null);
  const [assessing, setAssessing] = useState(false);
  const [dossier,   setDossier]   = useState(null);

  const intervalRef = useRef(null);
  const debounceRef = useRef(null);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try { setCatalog(await fetchCatalog()); } catch (_) {}
    setLoading(false);
  }, []);

  const loadNotes = useCallback(async (q) => {
    setNotesLoad(true);
    try { const d = await fetchNotes(q); setNotes(d.items || []); } catch (_) {}
    setNotesLoad(false);
  }, []);

  const loadTimeline = useCallback(async () => {
    setTimeLoad(true);
    try { const d = await fetchTimeline(); setTimeline(d.items || []); } catch (_) {}
    setTimeLoad(false);
  }, []);

  useEffect(() => {
    loadCatalog();
    intervalRef.current = setInterval(loadCatalog, REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [loadCatalog]);

  useEffect(() => {
    if (!open) return;
    if (tab === "NOTES" && notes.length === 0 && !notesLoad) loadNotes(query);
    if (tab === "TIMELINE" && timeline.length === 0 && !timeLoad) loadTimeline();
  }, [open, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce search on NOTES tab
  useEffect(() => {
    if (tab !== "NOTES") return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadNotes(query), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, tab, loadNotes]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    const onAsk    = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (SBB_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:sbb-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:sbb-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  async function handleExpand(note) {
    const id = note.id;
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (detail[id]) return;
    setDetailLoad(id);
    try {
      const d = await fetchNote(id);
      if (d) setDetail(prev => ({ ...prev, [id]: d }));
    } catch (_) {}
    setDetailLoad(null);
  }

  async function handleAssess() {
    if (assessing || !catalog) return;
    setAssessing(true);
    setDossier(null);
    try {
      const text = await agentAssess(
        catalog.total, catalog.counts, (catalog.orphans || []).length
      );
      setDossier(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {
      setDossier("Assessment unavailable.");
    }
    setAssessing(false);
  }

  const counts     = catalog?.counts  || {};
  const orphans    = catalog?.orphans || [];
  const total      = catalog?.total   || 0;
  const recentCat  = catalog?.recent  || [];
  const kindsSorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const maxCount    = kindsSorted[0]?.[1] || 1;

  const badgeAmber = orphans.length > 0;
  const badgeCount = total;

  return (
    <>
      {/* ── toggle button ──────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Second Brain Browser"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 119,
          background: "rgba(5,10,18,0.82)", border: `1px solid ${CY}55`,
          color: CY, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1, padding: "3px 8px",
          borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        ⬡ SBB
        {badgeCount > 0 && (
          <span style={{
            marginLeft: 5, background: badgeAmber ? AM : GN,
            color: "#000", borderRadius: 3, padding: "0 4px", fontSize: 8,
          }}>
            {badgeCount}
          </span>
        )}
      </button>

      {/* ── panel ──────────────────────────────────────────────────────────── */}
      {open && (
        <div style={{
          position: "fixed", top: 60, right: 18, zIndex: 120,
          width: "min(560px, 94vw)", maxHeight: "82vh",
          background: "rgba(5,10,18,0.96)",
          border: `1px solid ${CY}44`, borderRadius: 14,
          display: "flex", flexDirection: "column",
          boxShadow: `0 0 60px ${CY}14, 0 24px 48px rgba(0,0,0,0.8)`,
          fontFamily: "'JetBrains Mono',monospace",
        }}>
          {/* Header */}
          <div style={{
            padding: "12px 16px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
          }}>
            <span style={{ color: CY, fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>
              ⬡ SECOND BRAIN
            </span>
            {loading && (
              <span style={{ fontSize: 9, color: DIM }}>loading…</span>
            )}
            <button
              onClick={handleAssess}
              disabled={assessing || !catalog}
              style={{
                marginLeft: "auto",
                background: assessing ? `${CY}22` : "transparent",
                border: `1px solid ${CY}44`, borderRadius: 4,
                color: CY, fontSize: 9, padding: "2px 8px",
                cursor: assessing || !catalog ? "default" : "pointer",
                fontFamily: "inherit", opacity: !catalog ? 0.4 : 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none", border: "none",
                color: DIM, cursor: "pointer", fontSize: 14, lineHeight: 1,
              }}
            >✕</button>
          </div>

          {/* Dossier */}
          {dossier && (
            <div style={{
              margin: "8px 16px 0", padding: "8px 10px",
              background: `${CY}08`, border: `1px solid ${CY}22`,
              borderRadius: 6, color: "#9BBCCC", fontSize: 10,
              lineHeight: 1.6, flexShrink: 0,
            }}>
              {dossier}
            </div>
          )}

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr",
            gap: 8, padding: "12px 16px 8px",
            borderBottom: `1px solid ${CY}11`, flexShrink: 0,
          }}>
            {[
              { label: "TOTAL NOTES", val: total, color: CY },
              { label: "KINDS", val: Object.keys(counts).length, color: PURP },
              { label: "RECENT", val: recentCat.length, color: GN },
              { label: "ORPHANS", val: orphans.length, color: orphans.length > 0 ? AM : DIM },
            ].map(t => (
              <div key={t.label} style={{
                background: `${t.color}0A`,
                border: `1px solid ${t.color}33`,
                borderRadius: 8, padding: "8px 10px",
              }}>
                <div style={{ fontSize: 8, color: DIM, letterSpacing: 1, marginBottom: 4 }}>
                  {t.label}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: t.color, lineHeight: 1 }}>
                  {t.val ?? "–"}
                </div>
              </div>
            ))}
          </div>

          {/* Tab bar */}
          <div style={{
            display: "flex", gap: 4, padding: "8px 16px",
            borderBottom: `1px solid ${CY}11`, flexShrink: 0,
          }}>
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? CY : "transparent",
                  color: tab === t ? "#04060A" : DIM,
                  border: `1px solid ${tab === t ? CY : DIM}`,
                  borderRadius: 4, padding: "2px 10px",
                  fontSize: 9, letterSpacing: 1,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {t}
              </button>
            ))}
            {tab === "NOTES" && (
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search notes…"
                style={{
                  flex: 1, background: "rgba(41,231,255,0.06)",
                  border: `1px solid ${CY}22`, borderRadius: 4,
                  padding: "2px 8px", color: "#DCEBF5",
                  fontFamily: "inherit", fontSize: 10, outline: "none",
                  marginLeft: 4,
                }}
              />
            )}
          </div>

          {/* Body */}
          <div style={{ overflowY: "auto", flex: 1 }}>

            {/* ── CATALOG ── */}
            {tab === "CATALOG" && (
              <div style={{ padding: "12px 16px" }}>
                {kindsSorted.length === 0 && !loading && (
                  <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: "20px 0" }}>
                    No notes yet — POST to /v1/brain/notes to populate the vault.
                  </div>
                )}
                {kindsSorted.map(([kind, n]) => (
                  <div key={kind} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <Chip label={kind} color={kindColor(kind)} />
                      <span style={{ fontSize: 10, color: "#DCEBF5", fontWeight: 700 }}>{n}</span>
                    </div>
                    <div style={{ height: 6, background: `${kindColor(kind)}18`, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{
                        width: `${(n / maxCount) * 100}%`, height: "100%",
                        background: kindColor(kind), borderRadius: 3,
                        transition: "width 0.3s",
                      }} />
                    </div>
                  </div>
                ))}

                {orphans.length > 0 && (
                  <div style={{ marginTop: 16, borderTop: `1px solid ${AM}22`, paddingTop: 12 }}>
                    <div style={{ fontSize: 9, color: AM, letterSpacing: 1, marginBottom: 8 }}>
                      ORPHANED NOTES ({orphans.length})
                    </div>
                    {orphans.slice(0, 5).map(n => (
                      <div key={n.id} style={{
                        padding: "5px 0", borderBottom: `1px solid ${CY}08`,
                        display: "flex", alignItems: "center", gap: 8,
                      }}>
                        <Chip label={n.kind || "?"} color={kindColor(n.kind)} />
                        <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1 }}>{n.title}</span>
                        <span style={{ fontSize: 9, color: DIM }}>{relAge(n.updated_ts)}</span>
                      </div>
                    ))}
                    {orphans.length > 5 && (
                      <div style={{ fontSize: 9, color: DIM, marginTop: 4 }}>
                        +{orphans.length - 5} more orphans
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── NOTES ── */}
            {tab === "NOTES" && (
              <>
                {notesLoad && (
                  <div style={{ padding: "12px 16px", color: DIM, fontSize: 10 }}>loading…</div>
                )}
                {!notesLoad && notes.length === 0 && (
                  <div style={{ padding: "24px 16px", color: DIM, fontSize: 11, textAlign: "center" }}>
                    No notes found.
                  </div>
                )}
                {notes.map(note => {
                  const col  = kindColor(note.kind);
                  const isEx = expanded === note.id;
                  const det  = detail[note.id];
                  const isD  = detailLoad === note.id;
                  return (
                    <div key={note.id} style={{ borderBottom: `1px solid ${CY}09` }}>
                      <div
                        onClick={() => handleExpand(note)}
                        style={{
                          padding: "10px 16px", cursor: "pointer",
                          background: isEx ? `${col}08` : "transparent",
                          display: "flex", alignItems: "flex-start", gap: 10,
                        }}
                      >
                        <Chip label={note.kind || "?"} color={col} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, color: "#DCEBF5", fontWeight: 600 }}>
                            {note.title}
                          </div>
                          <ConfBar val={note.confidence} color={col} />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                          <span style={{ fontSize: 9, color: DIM }}>{relAge(note.updated_ts)}</span>
                          <span style={{ fontSize: 9, color: isEx ? col : DIM }}>
                            {isEx ? "▾" : "▸"}
                          </span>
                        </div>
                      </div>
                      {isEx && (
                        <div style={{ padding: "0 16px 10px 48px" }}>
                          {isD && <div style={{ fontSize: 9, color: DIM }}>loading…</div>}
                          {det && (
                            <div style={{
                              padding: "8px 10px",
                              background: `${col}07`, border: `1px solid ${col}22`,
                              borderRadius: 6, color: "#9BBCCC", fontSize: 10, lineHeight: 1.6,
                              whiteSpace: "pre-wrap", maxHeight: 160, overflowY: "auto",
                            }}>
                              {det.body_md
                                ? det.body_md.slice(0, 600) + (det.body_md.length > 600 ? "…" : "")
                                : <span style={{ color: DIM }}>No body content.</span>
                              }
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {/* ── TIMELINE ── */}
            {tab === "TIMELINE" && (
              <>
                {timeLoad && (
                  <div style={{ padding: "12px 16px", color: DIM, fontSize: 10 }}>loading…</div>
                )}
                {!timeLoad && timeline.length === 0 && (
                  <div style={{ padding: "24px 16px", color: DIM, fontSize: 11, textAlign: "center" }}>
                    No timeline entries — POST a daily note or session log.
                  </div>
                )}
                {timeline.map((note, i) => {
                  const col = kindColor(note.kind);
                  return (
                    <div key={note.id || i} style={{
                      padding: "10px 16px",
                      borderBottom: `1px solid ${CY}09`,
                      display: "flex", alignItems: "flex-start", gap: 10,
                    }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: col, flexShrink: 0, marginTop: 3,
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: "#DCEBF5", fontWeight: 600, marginBottom: 2 }}>
                          {note.title}
                        </div>
                        {note.body_md && (
                          <div style={{ fontSize: 10, color: "#5A7A8A", lineHeight: 1.5 }}>
                            {note.body_md.slice(0, 120)}{note.body_md.length > 120 ? "…" : ""}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
                        <Chip label={note.kind || "?"} color={col} />
                        <span style={{ fontSize: 9, color: DIM }}>{relAge(note.updated_ts)}</span>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "6px 16px", borderTop: `1px solid ${CY}11`,
            color: DIM, fontSize: 9, letterSpacing: 1,
            display: "flex", justifyContent: "space-between", flexShrink: 0,
          }}>
            <span>GET /v1/brain/catalog · 90 s poll</span>
            <span>{total} notes · {Object.keys(counts).length} kinds</span>
          </div>
        </div>
      )}
    </>
  );
}
