/**
 * BrainResearchStudio — F259.
 *
 * Data sources (real — backed by server/routes/second_brain.py +
 * server/routes/brain_research.py):
 *   GET  /v1/brain/catalog
 *       → { total, counts:{kind→n}, recent:[{id,kind,title,updated_at}],
 *             orphans:[{id,kind,title}] }
 *   POST /v1/brain/research  { topic }
 *       → { topic, findings:[{source,title,snippet,url?}], summary? }
 *   GET  /v1/brain/notes?limit=10&q=<topic>
 *       → { items:[{id,kind,title,confidence,updated_at,body_md}], count }
 *
 * Displays:
 *   - Stat tiles: total notes / kinds / recent-10 / orphans
 *   - CATALOG | RESEARCH tab switcher
 *   - CATALOG: per-kind count bars + recent note rows
 *   - RESEARCH: inline topic input → POST /v1/brain/research;
 *     findings list (source chip + snippet + url link if present);
 *     related notes from GET /v1/brain/notes?q=<topic>
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence knowledge brief + TTS
 *
 * Toggle: ⬡ BRRS at left:205920, bottom:8, zIndex:138.
 * Badge: amber = orphan notes, green = total note count.
 * 90 s auto-refresh of catalog.
 *
 * Exported helpers for JarvisBrain:
 *   isBrrsQuery(q) / buildBrrsScript()
 *
 * Voice triggers: "brain research / research topic / research dossier /
 *   brrs / research studio / what do we know about / find information about /
 *   research brief / knowledge research / research the brain / brain dossier"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AM  = "#F5A623";
const GN  = "#4ADE80";
const PUR = "#A78BFA";
const DIM = "#3A4A55";
const RED = "#F87171";

const BTN_LEFT   = 205920;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const BRRS_RE =
  /\b(brain research|research topic|research dossier|brrs|research studio|what do we know about|find information about|research brief|knowledge research|research the brain|brain dossier)\b/i;

export function isBrrsQuery(t) {
  return BRRS_RE.test(t || "");
}

export async function buildBrrsScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/brain/catalog`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    const total   = d?.total ?? 0;
    const orphans = (d?.orphans ?? []).length;
    const kinds   = Object.keys(d?.counts ?? {}).length;
    return (
      `The second brain holds ${total} notes across ${kinds} kinds. ` +
      `${orphans} orphaned notes have no inbound links. ` +
      `Use the Research tab to query public sources and cross-reference against stored knowledge.`
    );
  } catch {
    return "Unable to reach the brain catalog at this time.";
  }
}

// ─── fetch helpers ──────────────────────────────────────────────────────────

async function fetchCatalog() {
  const r = await fetch(`${apiBase()}/v1/brain/catalog`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function postResearch(topic) {
  const r = await fetch(`${apiBase()}/v1/brain/research`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ topic }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchRelatedNotes(q, limit = 8) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (q) params.set("q", q);
  const r = await fetch(`${apiBase()}/v1/brain/notes?${params}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function agentAssess(total, orphans, kinds) {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      message:
        `Assess the second brain knowledge base in 2 sentences: ` +
        `${total} notes across ${kinds} kinds, ${orphans} orphaned. ` +
        `Comment on knowledge coverage and suggest next research focus.`,
    }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "No assessment available.";
}

// ─── sub-components ─────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{
      flex: 1, minWidth: 55, background: `${color}0d`,
      border: `1px solid ${color}33`, borderRadius: 8,
      padding: "8px 8px", display: "flex", flexDirection: "column", gap: 3,
    }}>
      <span style={{ fontSize: 7, color: DIM, letterSpacing: 1 }}>{label}</span>
      <span style={{
        fontSize: 14, fontWeight: 700, color, letterSpacing: 1,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {value}
      </span>
    </div>
  );
}

function KindBar({ kind, count, max }) {
  const pct = max > 0 ? Math.min(100, (count / max) * 100) : 0;
  const kindColors = {
    concept: CY, entity: GN, project: PUR, decision: AM,
    daily: "#60A5FA", log: "#34D399", synthesis: "#F472B6", task: RED,
  };
  const c = kindColors[kind] || DIM;
  return (
    <div style={{ marginBottom: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ fontSize: 7, color: c, letterSpacing: 1, textTransform: "uppercase" }}>{kind}</span>
        <span style={{ fontSize: 7, color: DIM }}>{count}</span>
      </div>
      <div style={{ height: 3, background: `${c}1a`, borderRadius: 2 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: c, borderRadius: 2 }} />
      </div>
    </div>
  );
}

function NoteRow({ note }) {
  const kindColors = {
    concept: CY, entity: GN, project: PUR, decision: AM,
    daily: "#60A5FA", log: "#34D399", synthesis: "#F472B6", task: RED,
  };
  const c = kindColors[note.kind] || DIM;
  return (
    <div style={{
      padding: "5px 8px", borderBottom: `1px solid ${CY}11`,
      display: "flex", alignItems: "center", gap: 6,
    }}>
      <span style={{
        fontSize: 6, padding: "1px 5px", borderRadius: 3,
        border: `1px solid ${c}55`, color: c, flexShrink: 0,
        textTransform: "uppercase",
      }}>{note.kind}</span>
      <span style={{
        fontSize: 8, color: CY, flex: 1,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{note.title}</span>
      {note.confidence != null && (
        <span style={{ fontSize: 6, color: DIM, flexShrink: 0 }}>
          {Math.round(note.confidence * 100)}%
        </span>
      )}
    </div>
  );
}

function FindingRow({ finding }) {
  const src = finding.source || "unknown";
  const srcColors = {
    wikipedia: CY, hackernews: AM, arxiv: PUR, crossref: GN, duckduckgo: "#60A5FA",
  };
  const c = srcColors[src.toLowerCase()] || DIM;
  return (
    <div style={{ padding: "6px 8px", borderBottom: `1px solid ${CY}11` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
        <span style={{
          fontSize: 6, padding: "1px 5px", borderRadius: 3,
          border: `1px solid ${c}55`, color: c, flexShrink: 0, textTransform: "uppercase",
        }}>{src}</span>
        <span style={{
          fontSize: 8, color: CY, fontWeight: 600,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{finding.title || "—"}</span>
      </div>
      {finding.snippet && (
        <p style={{
          fontSize: 7, color: "#8899a6", margin: 0, lineHeight: 1.4,
          display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}>{finding.snippet}</p>
      )}
      {finding.url && (
        <a
          href={finding.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 6, color: AM, display: "block", marginTop: 2 }}
        >
          ↗ {finding.url.slice(0, 55)}{finding.url.length > 55 ? "…" : ""}
        </a>
      )}
    </div>
  );
}

// ─── main component ─────────────────────────────────────────────────────────

export default function BrainResearchStudio() {
  const [open,       setOpen]       = useState(false);
  const [catalog,    setCatalog]    = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [tab,        setTab]        = useState("CATALOG");
  const [topic,      setTopic]      = useState("");
  const [searching,  setSearching]  = useState(false);
  const [findings,   setFindings]   = useState(null);
  const [relNotes,   setRelNotes]   = useState(null);
  const [searchErr,  setSearchErr]  = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const [dossier,    setDossier]    = useState(null);

  const intervalRef = useRef(null);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchCatalog();
      setCatalog(d);
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCatalog();
    intervalRef.current = setInterval(loadCatalog, REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [loadCatalog]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (BRRS_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:brrs-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:brrs-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  async function handleResearch() {
    if (searching || !topic.trim()) return;
    setSearching(true);
    setFindings(null);
    setRelNotes(null);
    setSearchErr(null);
    setTab("RESEARCH");
    try {
      const [resD, notesD] = await Promise.all([
        postResearch(topic.trim()),
        fetchRelatedNotes(topic.trim(), 8),
      ]);
      setFindings(resD);
      setRelNotes(notesD);
    } catch (e) {
      setSearchErr(e.message || "Research failed.");
    }
    setSearching(false);
  }

  async function handleAssess() {
    if (assessing) return;
    setAssessing(true);
    setDossier(null);
    try {
      const total   = catalog?.total ?? 0;
      const orphans = (catalog?.orphans ?? []).length;
      const kinds   = Object.keys(catalog?.counts ?? {}).length;
      const text = await agentAssess(total, orphans, kinds);
      setDossier(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {
      setDossier("Assessment unavailable.");
    }
    setAssessing(false);
  }

  // derived values
  const total    = catalog?.total ?? 0;
  const counts   = catalog?.counts ?? {};
  const recent   = catalog?.recent ?? [];
  const orphans  = catalog?.orphans ?? [];
  const kindsArr = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const maxCount = kindsArr.length > 0 ? kindsArr[0][1] : 1;

  const badgeColor = orphans.length > 0 ? AM : total > 0 ? GN : null;
  const badgeVal   = orphans.length > 0 ? orphans.length : total;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 138,
          background: "#091520", border: `1px solid ${CY}44`, borderRadius: 6,
          color: CY, fontSize: 7, padding: "3px 7px", cursor: "pointer",
          letterSpacing: 1, display: "flex", alignItems: "center", gap: 4,
          whiteSpace: "nowrap",
        }}
      >
        ⬡ BRRS
        {badgeColor && (
          <span style={{
            background: badgeColor, color: "#000", borderRadius: "50%",
            fontSize: 6, minWidth: 14, height: 14, display: "flex",
            alignItems: "center", justifyContent: "center", fontWeight: 700,
            padding: "0 2px",
          }}>
            {badgeVal > 999 ? "∞" : badgeVal}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT - 300, bottom: 32, zIndex: 138,
      width: 360, maxHeight: 560,
      background: "rgba(6,16,24,0.97)", border: `1px solid ${CY}44`,
      borderRadius: 10, display: "flex", flexDirection: "column",
      fontFamily: "monospace", boxShadow: `0 0 18px ${CY}22`,
    }}>
      {/* header */}
      <div style={{
        padding: "8px 12px", borderBottom: `1px solid ${CY}22`,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 8, color: CY, letterSpacing: 2, fontWeight: 700, flex: 1 }}>
          ⬡ BRAIN RESEARCH STUDIO
        </span>
        {loading && <span style={{ fontSize: 8, color: DIM }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: DIM,
          fontSize: 10, cursor: "pointer", lineHeight: 1,
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
        <Tile label="NOTES"   value={total}                      color={total > 0 ? GN : DIM} />
        <Tile label="KINDS"   value={kindsArr.length}             color={CY} />
        <Tile label="RECENT"  value={recent.length}               color={PUR} />
        <Tile label="ORPHANS" value={orphans.length}              color={orphans.length > 0 ? AM : DIM} />
      </div>

      {/* research input */}
      <div style={{ padding: "0 12px 8px", display: "flex", gap: 6 }}>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleResearch(); }}
          placeholder="Research topic…"
          style={{
            flex: 1, fontSize: 8, padding: "4px 8px", borderRadius: 5,
            border: `1px solid ${CY}44`, background: "#0a1520",
            color: CY, outline: "none", fontFamily: "monospace",
          }}
        />
        <button
          onClick={handleResearch}
          disabled={searching || !topic.trim()}
          style={{
            fontSize: 7, padding: "4px 10px", borderRadius: 5,
            border: `1px solid ${CY}55`, color: "#000", background: CY,
            cursor: (searching || !topic.trim()) ? "default" : "pointer",
            opacity: (searching || !topic.trim()) ? 0.5 : 1,
            fontFamily: "monospace", fontWeight: 700, whiteSpace: "nowrap",
          }}
        >
          {searching ? "…" : "▶ RES"}
        </button>
      </div>

      {/* tab switcher */}
      <div style={{
        display: "flex", gap: 0, borderBottom: `1px solid ${CY}22`,
        padding: "0 12px",
      }}>
        {["CATALOG", "RESEARCH"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontSize: 7, padding: "4px 10px", cursor: "pointer",
              border: "none", borderBottom: tab === t ? `2px solid ${CY}` : "2px solid transparent",
              background: "none", color: tab === t ? CY : DIM, letterSpacing: 1,
            }}
          >{t}</button>
        ))}
      </div>

      {/* body */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {tab === "CATALOG" && (
          <div>
            {/* kind bars */}
            <div style={{ padding: "8px 12px 4px" }}>
              <div style={{ fontSize: 7, color: DIM, letterSpacing: 1, marginBottom: 5 }}>KIND BREAKDOWN</div>
              {kindsArr.length === 0 && (
                <div style={{ fontSize: 8, color: DIM }}>No notes in brain yet.</div>
              )}
              {kindsArr.map(([kind, cnt]) => (
                <KindBar key={kind} kind={kind} count={cnt} max={maxCount} />
              ))}
            </div>

            {/* recent notes */}
            {recent.length > 0 && (
              <div>
                <div style={{ fontSize: 7, color: DIM, letterSpacing: 1, padding: "4px 12px 2px" }}>
                  RECENT NOTES
                </div>
                {recent.slice(0, 10).map((n) => (
                  <NoteRow key={n.id} note={n} />
                ))}
              </div>
            )}

            {/* orphans */}
            {orphans.length > 0 && (
              <div>
                <div style={{ fontSize: 7, color: AM, letterSpacing: 1, padding: "6px 12px 2px" }}>
                  ORPHANED ({orphans.length})
                </div>
                {orphans.slice(0, 5).map((n) => (
                  <NoteRow key={n.id} note={n} />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "RESEARCH" && (
          <div>
            {searching && (
              <div style={{ padding: "16px 12px", fontSize: 8, color: DIM, textAlign: "center" }}>
                Researching "{topic}"…
              </div>
            )}
            {searchErr && (
              <div style={{ padding: "8px 12px", fontSize: 8, color: RED }}>
                Error: {searchErr}
              </div>
            )}
            {findings && !searching && (
              <>
                <div style={{ fontSize: 7, color: DIM, letterSpacing: 1, padding: "6px 12px 2px" }}>
                  FINDINGS — {findings.topic} ({(findings.findings ?? []).length} sources)
                </div>
                {findings.summary && (
                  <div style={{
                    margin: "4px 12px", padding: "5px 8px",
                    background: `${PUR}0a`, border: `1px solid ${PUR}33`,
                    borderRadius: 5, fontSize: 7, color: PUR, lineHeight: 1.4,
                  }}>
                    {findings.summary}
                  </div>
                )}
                {(findings.findings ?? []).map((f, i) => (
                  <FindingRow key={i} finding={f} />
                ))}

                {relNotes && (relNotes.items ?? []).length > 0 && (
                  <div>
                    <div style={{ fontSize: 7, color: GN, letterSpacing: 1, padding: "6px 12px 2px" }}>
                      RELATED IN BRAIN ({relNotes.count})
                    </div>
                    {(relNotes.items ?? []).map((n) => (
                      <NoteRow key={n.id} note={n} />
                    ))}
                  </div>
                )}
                {relNotes && (relNotes.items ?? []).length === 0 && (
                  <div style={{ padding: "6px 12px", fontSize: 7, color: DIM }}>
                    No matching notes in brain for this topic.
                  </div>
                )}
              </>
            )}
            {!findings && !searching && !searchErr && (
              <div style={{ padding: "16px 12px", fontSize: 8, color: DIM, textAlign: "center" }}>
                Enter a topic above and press ▶ RES to research.
              </div>
            )}
          </div>
        )}
      </div>

      {/* assess */}
      <div style={{ padding: "6px 12px" }}>
        <button
          onClick={handleAssess}
          disabled={assessing}
          style={{
            width: "100%", fontSize: 8, padding: "4px 0", borderRadius: 5, cursor: "pointer",
            border: `1px solid ${CY}55`, color: CY, background: `${CY}0d`,
            opacity: assessing ? 0.6 : 1,
          }}
        >
          {assessing ? "▶ Assessing…" : "▶ ASSESS"}
        </button>
        {dossier && (
          <div style={{
            marginTop: 5, fontSize: 8, color: AM, lineHeight: 1.4,
            padding: "5px 7px", background: `${AM}0a`, borderRadius: 5,
          }}>
            {dossier}
          </div>
        )}
      </div>

      {/* footer */}
      <div style={{
        padding: "4px 12px", borderTop: `1px solid ${CY}11`,
        fontSize: 7, color: DIM, display: "flex", justifyContent: "space-between",
      }}>
        <span>brain: {total} notes · {orphans.length} orphans</span>
        <span>90 s poll · /v1/brain</span>
      </div>
    </div>
  );
}
