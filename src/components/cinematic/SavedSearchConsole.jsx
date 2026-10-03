/**
 * F303 — Saved Search Console (SPLS)
 *
 * Wraps the /v1/search-plus/* endpoint family — the only panel in the system
 * to expose saved searches, faceted filters, and new-match alerting.
 *
 *  SAVED tab  — lists all saved searches; ▶ RUN fires the search inline,
 *               ✦ NEW checks for new matches since last run, ✕ DEL removes.
 *  FACETS tab — GET /v1/search-plus/facets → expandable facet dimensions.
 *  FILTER tab — POST /v1/search-plus/faceted with type/mark/q → ranked rows.
 *  SAVE tab   — POST /v1/search-plus/saved {name, spec} to persist a new search.
 *
 * Stat tiles: saved / facet-dims / filter-hits / last-run-count
 * Badges: green = saved count, amber = any saves present.
 * ▶ ASSESS: 2-sentence brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SPLS  at bottom:8 left:397440, zIndex:180.
 * Event:   jarvis:spls-toggle
 * Voice:   "saved search / search console / search manager / spls /
 *           search plus / faceted search / saved queries / search alerts /
 *           new matches / faceted filter"
 * Refresh: 60 s auto-poll on SAVED tab.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 397440;
const POLL_MS  = 60_000;
const CYAN     = "#29E7FF";
const GREEN    = "#34D399";
const AMBER    = "#F59E0B";
const SLATE    = "#6E8AA0";
const RED      = "#FF4444";
const VIOLET   = "#A78BFA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const SPLS_RE =
  /\b(saved\s+search(es)?|search\s+console|search\s+manager|spls|search[\s-]plus|faceted\s+search|saved\s+quer(y|ies)|search\s+alert(s)?|new\s+match(es)?|faceted\s+filter(s)?)\b/i;

export function isSpslQuery(q) { return SPLS_RE.test(q); }

export async function buildSpslScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const res  = await fetch(`${base}/v1/search-plus/saved`, { headers: hdr });
    const data = await res.json();
    const saved = Array.isArray(data?.searches) ? data.searches : [];
    const count = data?.count ?? saved.length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS saved search console status: ${count} saved search spec(s) stored in the ` +
          `search-plus engine. Saved searches allow the operator to replay faceted ontology ` +
          `filters and receive new-match alerts without retyping the query each time. ` +
          `Provide a 2-sentence saved-search console status brief — formal British butler tone, ` +
          `first person, note whether new-match alerting is in use.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Saved search console status confirmed, sir.").trim();
  } catch {
    return "Saved search console assessment unavailable at this time, sir.";
  }
}

// ── small helpers ─────────────────────────────────────────────────────────────

function ago(ts) {
  if (!ts) return "—";
  const s = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function shortId(id) {
  return String(id || "").slice(0, 12);
}

// ── styles ────────────────────────────────────────────────────────────────────

const PANEL = {
  position: "fixed",
  top: 58,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 180,
  width: "min(540px,95vw)",
  maxHeight: "80vh",
  display: "flex",
  flexDirection: "column",
  background: "rgba(4,8,14,0.95)",
  border: `1px solid ${CYAN}44`,
  borderRadius: 14,
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  boxShadow: `0 0 52px ${CYAN}18`,
  fontFamily: "'JetBrains Mono', monospace",
  color: "#DCEBF5",
  overflow: "hidden",
};

const SCROLL = { overflowY: "auto", flex: 1, padding: "8px 14px 14px" };

const INPUT_STYLE = {
  width: "100%",
  background: "rgba(41,231,255,0.06)",
  border: `1px solid ${CYAN}33`,
  borderRadius: 6,
  color: "#DCEBF5",
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 10,
  padding: "5px 8px",
  outline: "none",
  boxSizing: "border-box",
};

function Tile({ label, val, col }) {
  return (
    <div style={{
      flex: 1, textAlign: "center",
      background: "rgba(41,231,255,0.04)",
      border: `1px solid ${CYAN}18`,
      borderRadius: 8, padding: "6px 4px",
    }}>
      <div style={{ color: col || CYAN, fontSize: 16, fontVariantNumeric: "tabular-nums" }}>{val}</div>
      <div style={{ color: SLATE, fontSize: 7, letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function TabBar({ tabs, active, onSelect }) {
  return (
    <div style={{ display: "flex", gap: 4, padding: "6px 14px", borderBottom: `1px solid ${CYAN}18` }}>
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onSelect(t)}
          style={{
            padding: "3px 10px", fontSize: 8, borderRadius: 4, letterSpacing: 1,
            cursor: "pointer", fontFamily: "inherit",
            border: `1px solid ${active === t ? CYAN : CYAN + "33"}`,
            background: active === t ? `${CYAN}22` : "transparent",
            color: active === t ? CYAN : SLATE,
          }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function Btn({ children, onClick, disabled, col }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontSize: 8, padding: "2px 7px", borderRadius: 4, letterSpacing: 1,
        border: `1px solid ${(col || CYAN) + "66"}`,
        background: `rgba(${col === RED ? "255,68,68" : "41,231,255"},0.08)`,
        color: col || CYAN, cursor: "pointer", fontFamily: "inherit",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  );
}

// ── SAVED tab ─────────────────────────────────────────────────────────────────

function SavedTab({ saved, onRefresh }) {
  const [results, setResults]       = useState({});   // id → run result
  const [newHits, setNewHits]       = useState({});   // id → new-match count
  const [running, setRunning]       = useState(null);
  const [checking, setChecking]     = useState(null);
  const [deleting, setDeleting]     = useState(null);
  const [q, setQ]                   = useState("");

  const base = apiBase();
  const hdr  = { Authorization: `Bearer ${API_KEY}` };

  async function runSearch(id) {
    setRunning(id);
    try {
      const r   = await fetch(`${base}/v1/search-plus/saved/${id}/run`, { headers: hdr });
      const d   = await r.json();
      const hits = Array.isArray(d?.results) ? d.results : Array.isArray(d?.objects) ? d.objects : [];
      setResults((prev) => ({ ...prev, [id]: { count: hits.length, items: hits.slice(0, 5) } }));
    } catch (e) {
      setResults((prev) => ({ ...prev, [id]: { error: e.message } }));
    } finally {
      setRunning(null);
    }
  }

  async function checkNew(id) {
    setChecking(id);
    try {
      const r   = await fetch(`${base}/v1/search-plus/saved/${id}/new`, { headers: hdr });
      const d   = await r.json();
      const n   = d?.new_count ?? d?.count ?? (Array.isArray(d?.new_objects) ? d.new_objects.length : 0);
      setNewHits((prev) => ({ ...prev, [id]: n }));
    } catch {
      setNewHits((prev) => ({ ...prev, [id]: "?" }));
    } finally {
      setChecking(null);
    }
  }

  async function del(id) {
    if (!window.confirm(`Delete saved search ${shortId(id)}?`)) return;
    setDeleting(id);
    try {
      await fetch(`${base}/v1/search-plus/saved/${id}`, {
        method: "DELETE",
        headers: hdr,
      });
      onRefresh();
    } finally {
      setDeleting(null);
    }
  }

  const filtered = saved.filter((s) => {
    if (!q.trim()) return true;
    const lq = q.toLowerCase();
    return String(s.name || s.id || "").toLowerCase().includes(lq);
  });

  if (!saved.length) {
    return (
      <div style={{ padding: 16, textAlign: "center", color: SLATE, fontSize: 10 }}>
        No saved searches yet. Use the SAVE tab to create one.
      </div>
    );
  }

  return (
    <>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter searches…"
        style={{ ...INPUT_STYLE, marginBottom: 8 }}
      />
      {filtered.map((s) => {
        const id  = s.id || s.search_id || s.name;
        const res = results[id];
        const nh  = newHits[id];
        return (
          <div key={id} style={{
            marginBottom: 8, borderRadius: 8,
            border: `1px solid ${CYAN}22`,
            background: "rgba(41,231,255,0.03)",
            padding: "8px 10px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ color: CYAN, fontSize: 10, flex: 1, minWidth: 80 }}>
                {s.name || shortId(id)}
              </span>
              {s.created_at && (
                <span style={{ color: SLATE, fontSize: 8 }}>{ago(s.created_at)}</span>
              )}
              <Btn onClick={() => runSearch(id)} disabled={running === id}>
                {running === id ? "◌ RUNNING" : "▶ RUN"}
              </Btn>
              <Btn onClick={() => checkNew(id)} disabled={checking === id} col={VIOLET}>
                {checking === id ? "◌…" : nh !== undefined ? `✦ NEW: ${nh}` : "✦ NEW"}
              </Btn>
              <Btn onClick={() => del(id)} disabled={deleting === id} col={RED}>
                {deleting === id ? "◌" : "✕"}
              </Btn>
            </div>

            {s.spec && Object.keys(s.spec).length > 0 && (
              <div style={{ marginTop: 4, fontSize: 8, color: SLATE }}>
                {Object.entries(s.spec).map(([k, v]) => (
                  <span key={k} style={{
                    display: "inline-block", marginRight: 6,
                    background: "rgba(41,231,255,0.06)", borderRadius: 3,
                    padding: "1px 5px", border: `1px solid ${CYAN}22`,
                  }}>
                    {k}: {JSON.stringify(v).slice(0, 30)}
                  </span>
                ))}
              </div>
            )}

            {res && (
              <div style={{
                marginTop: 6, padding: "6px 8px", borderRadius: 6,
                background: "rgba(41,231,255,0.06)", border: `1px solid ${CYAN}22`,
              }}>
                {res.error ? (
                  <span style={{ color: RED, fontSize: 8 }}>Error: {res.error}</span>
                ) : (
                  <>
                    <div style={{ color: GREEN, fontSize: 9, marginBottom: 4 }}>
                      {res.count} result{res.count !== 1 ? "s" : ""}
                    </div>
                    {(res.items || []).map((obj, i) => (
                      <div key={i} style={{ fontSize: 8, color: SLATE, marginBottom: 2 }}>
                        {String(obj?.name || obj?.title || obj?.id || JSON.stringify(obj)).slice(0, 80)}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

// ── FACETS tab ────────────────────────────────────────────────────────────────

function FacetsTab({ facets }) {
  const [expanded, setExpanded] = useState(null);
  if (!facets || !Object.keys(facets).length) {
    return <div style={{ color: SLATE, fontSize: 10, textAlign: "center", padding: 16 }}>No facets loaded.</div>;
  }

  return (
    <>
      {Object.entries(facets).map(([dim, vals]) => {
        const isOpen = expanded === dim;
        const entries = Array.isArray(vals)
          ? vals
          : Object.entries(vals || {}).map(([v, c]) => ({ value: v, count: c }));
        return (
          <div key={dim} style={{ marginBottom: 6, borderRadius: 7, border: `1px solid ${CYAN}22` }}>
            <button
              onClick={() => setExpanded(isOpen ? null : dim)}
              style={{
                width: "100%", textAlign: "left", background: "rgba(41,231,255,0.04)",
                border: "none", color: CYAN, fontSize: 9, padding: "7px 10px",
                cursor: "pointer", fontFamily: "inherit", letterSpacing: 1,
                display: "flex", justifyContent: "space-between",
              }}
            >
              <span>{dim.toUpperCase()}</span>
              <span style={{ color: SLATE }}>{isOpen ? "▲" : "▼"} {entries.length}</span>
            </button>
            {isOpen && (
              <div style={{ padding: "6px 10px 8px" }}>
                {entries.slice(0, 20).map((e, i) => {
                  const val   = e.value ?? e.label ?? String(e);
                  const count = e.count ?? e.n ?? "";
                  return (
                    <div key={i} style={{
                      display: "flex", justifyContent: "space-between",
                      fontSize: 8, color: SLATE, marginBottom: 3,
                    }}>
                      <span style={{ color: "#DCEBF5" }}>{String(val).slice(0, 60)}</span>
                      {count !== "" && (
                        <span style={{
                          background: `${CYAN}22`, borderRadius: 3,
                          padding: "0 5px", color: CYAN, fontSize: 7,
                        }}>{count}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

// ── FILTER tab ────────────────────────────────────────────────────────────────

function FilterTab() {
  const [typeVal, setTypeVal]   = useState("");
  const [markVal, setMarkVal]   = useState("");
  const [qVal, setQVal]         = useState("");
  const [results, setResults]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState(null);

  async function run() {
    setLoading(true); setErr(null); setResults(null);
    try {
      const body = {};
      if (typeVal.trim()) body.type = typeVal.trim();
      if (markVal.trim()) body.mark = markVal.trim();
      if (qVal.trim())   body.q    = qVal.trim();
      body.limit = 20;
      const r = await fetch(`${apiBase()}/v1/search-plus/faceted`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      const hits = Array.isArray(d?.results) ? d.results
        : Array.isArray(d?.objects)          ? d.objects
        : Array.isArray(d?.items)            ? d.items
        : [];
      setResults({ count: d?.count ?? hits.length, items: hits });
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
        <input
          value={typeVal}
          onChange={(e) => setTypeVal(e.target.value)}
          placeholder="Type filter (e.g. Contact, Task)…"
          style={INPUT_STYLE}
        />
        <input
          value={markVal}
          onChange={(e) => setMarkVal(e.target.value)}
          placeholder="Mark filter (e.g. PUBLIC, PII)…"
          style={INPUT_STYLE}
        />
        <input
          value={qVal}
          onChange={(e) => setQVal(e.target.value)}
          placeholder="Keyword search…"
          style={INPUT_STYLE}
        />
        <Btn onClick={run} disabled={loading}>
          {loading ? "◌ SEARCHING…" : "▶ SEARCH"}
        </Btn>
      </div>
      {err && <div style={{ color: RED, fontSize: 9, marginBottom: 8 }}>Error: {err}</div>}
      {results && (
        <div>
          <div style={{ color: GREEN, fontSize: 9, marginBottom: 6 }}>
            {results.count} result{results.count !== 1 ? "s" : ""}
          </div>
          {results.items.map((obj, i) => (
            <div key={i} style={{
              fontSize: 8, color: SLATE, marginBottom: 4,
              padding: "4px 8px", borderRadius: 5,
              border: `1px solid ${CYAN}18`,
              background: "rgba(41,231,255,0.03)",
            }}>
              <span style={{ color: CYAN }}>
                {String(obj?.type || obj?.kind || "object").slice(0, 20)}
              </span>
              {" · "}
              {String(obj?.name || obj?.title || obj?.id || JSON.stringify(obj)).slice(0, 80)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── SAVE tab ──────────────────────────────────────────────────────────────────

function SaveTab({ onSaved }) {
  const [name, setName]     = useState("");
  const [spec, setSpec]     = useState("{}");
  const [saving, setSaving] = useState(false);
  const [ok, setOk]         = useState(false);
  const [err, setErr]       = useState(null);

  async function save() {
    setSaving(true); setOk(false); setErr(null);
    try {
      let parsed = {};
      try { parsed = JSON.parse(spec); } catch { throw new Error("Invalid JSON spec"); }
      const r = await fetch(`${apiBase()}/v1/search-plus/saved`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ name: name.trim() || "unnamed", spec: parsed }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setOk(true);
      setName(""); setSpec("{}");
      onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label style={{ color: SLATE, fontSize: 8, letterSpacing: 1 }}>SEARCH NAME</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="My saved search…"
        style={INPUT_STYLE}
      />
      <label style={{ color: SLATE, fontSize: 8, letterSpacing: 1 }}>SPEC (JSON)</label>
      <textarea
        value={spec}
        onChange={(e) => setSpec(e.target.value)}
        rows={4}
        placeholder={'{"type":"Contact","q":"london"}'}
        style={{ ...INPUT_STYLE, resize: "vertical", height: 80 }}
      />
      <Btn onClick={save} disabled={saving || !name.trim()}>
        {saving ? "◌ SAVING…" : "◈ SAVE SEARCH"}
      </Btn>
      {ok  && <div style={{ color: GREEN, fontSize: 9 }}>✓ Saved successfully.</div>}
      {err && <div style={{ color: RED,   fontSize: 9 }}>Error: {err}</div>}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function SavedSearchConsole() {
  const [open, setOpen]         = useState(false);
  const [saved, setSaved]       = useState([]);
  const [facets, setFacets]     = useState({});
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState(null);
  const [tab, setTab]           = useState("SAVED");
  const [assessing, setAssessing] = useState(false);
  const [filterHits, setFilterHits] = useState(0);
  const timerRef = useRef(null);

  const base = apiBase();
  const hdr  = { Authorization: `Bearer ${API_KEY}` };

  const loadSaved = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r    = await fetch(`${base}/v1/search-plus/saved`, { headers: hdr });
      if (!r.ok) throw new Error(`saved ${r.status}`);
      const d    = await r.json();
      setSaved(Array.isArray(d?.searches) ? d.searches : []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadFacets = useCallback(async () => {
    try {
      const r = await fetch(`${base}/v1/search-plus/facets`, { headers: hdr });
      if (r.ok) setFacets(await r.json());
    } catch {
      /* best-effort */
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:spls-toggle", onToggle);
    return () => window.removeEventListener("jarvis:spls-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    loadSaved();
    loadFacets();
    timerRef.current = setInterval(loadSaved, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, loadSaved, loadFacets]);

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildSpslScript();
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text: script } })
      );
    } finally {
      setAssessing(false);
    }
  }

  const facetDims = Object.keys(facets).length;
  const badgeCol  = saved.length > 0 ? GREEN : SLATE;

  return (
    <>
      {/* Strip toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Saved Search Console"
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 180,
          padding: "4px 10px",
          background: open ? CYAN : "rgba(5,8,13,0.75)",
          color: open ? "#04060A" : CYAN,
          border: `1px solid ${CYAN}`,
          borderRadius: 6,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9,
          letterSpacing: 1,
          cursor: "pointer",
          backdropFilter: "blur(6px)",
        }}
      >
        ◈ SPLS
        {saved.length > 0 && (
          <span style={{
            marginLeft: 4, background: badgeCol, color: "#04060A",
            borderRadius: "50%", fontSize: 7, padding: "0 4px",
            fontVariantNumeric: "tabular-nums",
          }}>
            {saved.length}
          </span>
        )}
      </button>

      {open && (
        <div style={PANEL}>
          {/* header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", borderBottom: `1px solid ${CYAN}22`,
            background: "rgba(41,231,255,0.05)",
          }}>
            <span style={{ color: CYAN, fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>
              ◈ Saved Search Console
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {loading && (
                <span style={{ color: SLATE, fontSize: 8 }}>◌</span>
              )}
              <Btn onClick={assess} disabled={assessing || loading}>
                {assessing ? "◌ ASSESSING" : "▶ ASSESS"}
              </Btn>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: SLATE, cursor: "pointer", fontSize: 14, lineHeight: 1 }}
              >
                ×
              </button>
            </div>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${CYAN}11` }}>
            <Tile label="SAVED"      val={saved.length}  col={saved.length > 0 ? GREEN : SLATE} />
            <Tile label="FACET DIMS" val={facetDims}      col={facetDims > 0 ? CYAN : SLATE}    />
            <Tile label="TAB"        val={tab}            col={AMBER}                            />
            <Tile label="ENGINE"     val="SEARCH+"        col={VIOLET}                           />
          </div>

          {err && (
            <div style={{ padding: "6px 14px", color: RED, fontSize: 8 }}>Error: {err}</div>
          )}

          {/* tab bar */}
          <TabBar
            tabs={["SAVED", "FACETS", "FILTER", "SAVE"]}
            active={tab}
            onSelect={setTab}
          />

          {/* tab content */}
          <div style={SCROLL}>
            {tab === "SAVED"  && <SavedTab  saved={saved} onRefresh={loadSaved} />}
            {tab === "FACETS" && <FacetsTab facets={facets} />}
            {tab === "FILTER" && <FilterTab />}
            {tab === "SAVE"   && <SaveTab onSaved={loadSaved} />}
          </div>
        </div>
      )}
    </>
  );
}
