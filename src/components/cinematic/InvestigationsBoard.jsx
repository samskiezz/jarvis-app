/**
 * InvestigationsBoard — F241.
 *
 * Data sources (real — backed by server/routes/investigations.py):
 *   GET /v1/investigations
 *       → {items:[{id,name,owner,notes,seeds,annotations:[],shares:[],created_at}], count}
 *   GET /v1/investigations/{id}
 *       → {id,name,owner,notes,seeds,annotations:[{id,target,text,actor,ts}],
 *          shares:[{principal,role}],subgraph:{nodes:[],edges:[]},created_at}
 *
 * Displays:
 *   - Stat tiles: total / annotated / seeded / recent-7d
 *   - ALL / ANNOTATED / SEEDED filter tabs + text search
 *   - Expand row → lazy GET /v1/investigations/{id}:
 *       seeds list, annotations (actor/target/text), subgraph node+edge count
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence case brief + TTS
 *
 * Toggle: ⊗ INVST at left:128400, bottom:8, zIndex:121.
 * Badge: amber = any investigations present (count badge).
 * 90 s auto-refresh.
 *
 * Exported helpers for JarvisBrain:
 *   isInvstQuery(q) / buildInvstScript()
 *
 * Voice triggers: "investigations / saved cases / investigation board / case files /
 *   invst / graph cases / active investigations / case list / saved investigations /
 *   open cases / case workspace"
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
const PRP  = "#A78BFA";

const BTN_LEFT   = 128400;
const REFRESH_MS = 90_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const INVST_RE =
  /\b(investigations?|saved\s*cases?|investigation\s*board|case\s*files?|invst|graph\s*cases?|active\s*investigations?|case\s*list|saved\s*investigations?|open\s*cases?|case\s*workspace)\b/i;

export function isInvstQuery(t) {
  return INVST_RE.test(t || "");
}

export async function buildInvstScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/investigations`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    const items = d?.items || [];
    if (!items.length) return "No saved investigations found in the system, sir.";
    const total = items.length;
    const annotated = items.filter(i => (i.annotations || []).length > 0).length;
    const seeded    = items.filter(i => (i.seeds || []).length > 0).length;
    const names     = items.slice(0, 3).map(i => i.name).join(", ");
    return `${total} saved investigation${total !== 1 ? "s" : ""} on record: ${names}${total > 3 ? " and more" : ""}. ${annotated} annotated, ${seeded} seeded with graph nodes.`;
  } catch {
    return "Unable to retrieve investigations data at this time, sir.";
  }
}

// ─── fetch helpers ────────────────────────────────────────────────────────────

async function fetchList() {
  const r = await fetch(`${apiBase()}/v1/investigations`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchDetail(id) {
  const r = await fetch(`${apiBase()}/v1/investigations/${id}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function agentAssess(total, annotated, seeded, names) {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      message:
        `Assess this investigations board in 2 sentences: ${total} saved case${total !== 1 ? "s" : ""} ` +
        `(${annotated} annotated, ${seeded} seeded with graph nodes). Recent cases: ${names || "none"}.`,
    }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "No assessment available.";
}

// ─── sub-components ───────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{
      flex: 1, minWidth: 80, background: `${color}0d`,
      border: `1px solid ${color}33`, borderRadius: 8,
      padding: "8px 10px", display: "flex", flexDirection: "column", gap: 3,
    }}>
      <span style={{ fontSize: 7, color: DIM, letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color, letterSpacing: 1 }}>{value}</span>
    </div>
  );
}

function DetailPanel({ detail, loading }) {
  if (loading) return (
    <div style={{ padding: 10, fontSize: 9, color: DIM, letterSpacing: 1 }}>LOADING CASE…</div>
  );
  if (!detail) return null;

  const seeds       = detail.seeds || [];
  const annotations = detail.annotations || [];
  const shares      = detail.shares || [];
  const nodes       = detail.subgraph?.nodes?.length ?? 0;
  const edges       = detail.subgraph?.edges?.length ?? 0;

  return (
    <div style={{
      margin: "6px 0 4px 0", padding: "10px 12px",
      background: `${CY}06`, border: `1px solid ${CY}22`,
      borderRadius: 8, display: "flex", flexDirection: "column", gap: 8,
    }}>
      {/* subgraph summary */}
      <div style={{ display: "flex", gap: 16, fontSize: 8, color: DIM }}>
        <span>SUBGRAPH: <span style={{ color: CY }}>{nodes} nodes</span></span>
        <span>EDGES: <span style={{ color: PRP }}>{edges}</span></span>
        <span>SEEDS: <span style={{ color: AM }}>{seeds.length}</span></span>
        <span>SHARES: <span style={{ color: GN }}>{shares.length}</span></span>
      </div>

      {/* seeds */}
      {seeds.length > 0 && (
        <div>
          <div style={{ fontSize: 7, color: DIM, letterSpacing: 1, marginBottom: 4 }}>SEED NODES</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {seeds.slice(0, 12).map((s, i) => (
              <span key={i} style={{
                fontSize: 8, color: AM, border: `1px solid ${AM}44`,
                borderRadius: 3, padding: "1px 5px",
              }}>
                {String(s).slice(0, 24)}
              </span>
            ))}
            {seeds.length > 12 && (
              <span style={{ fontSize: 8, color: DIM }}>+{seeds.length - 12} more</span>
            )}
          </div>
        </div>
      )}

      {/* annotations */}
      {annotations.length > 0 && (
        <div>
          <div style={{ fontSize: 7, color: DIM, letterSpacing: 1, marginBottom: 4 }}>
            ANNOTATIONS ({annotations.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {annotations.slice(0, 5).map((ann) => (
              <div key={ann.id} style={{
                padding: "5px 8px",
                background: `${PRP}08`, border: `1px solid ${PRP}22`,
                borderRadius: 5,
              }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 7, color: PRP }}>{ann.actor || "unknown"}</span>
                  <span style={{ fontSize: 7, color: `${DIM}88` }}>→ {ann.target}</span>
                </div>
                <div style={{ fontSize: 9, color: "#C0D0DC", lineHeight: 1.5 }}>
                  {String(ann.text || "").slice(0, 160)}
                  {(ann.text || "").length > 160 ? "…" : ""}
                </div>
              </div>
            ))}
            {annotations.length > 5 && (
              <div style={{ fontSize: 8, color: DIM }}>+{annotations.length - 5} more annotations</div>
            )}
          </div>
        </div>
      )}

      {/* notes */}
      {detail.notes && (
        <div style={{ fontSize: 9, color: "#8A9BAA", lineHeight: 1.5, fontStyle: "italic" }}>
          "{detail.notes.slice(0, 200)}{detail.notes.length > 200 ? "…" : ""}"
        </div>
      )}
    </div>
  );
}

function InvRow({ inv, expanded, onToggle }) {
  const [detail,  setDetail]  = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    if (detail) return;
    setLoading(true);
    fetchDetail(inv.id)
      .then(d => setDetail(d))
      .catch(() => setDetail({ error: true }))
      .finally(() => setLoading(false));
  }, [expanded, inv.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const annotCount = (inv.annotations || []).length;
  const seedCount  = (inv.seeds || []).length;

  return (
    <div style={{ borderBottom: `1px solid ${CY}11` }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%", textAlign: "left",
          background: "none", border: "none", cursor: "pointer",
          padding: "8px 12px",
          display: "flex", alignItems: "center", gap: 10,
        }}
      >
        <span style={{ fontSize: 9, color: expanded ? CY : "#7A8E9A" }}>{expanded ? "▾" : "▸"}</span>
        <span style={{ flex: 1, fontSize: 10, color: "#C0D0DC", letterSpacing: 0.5 }}>
          {inv.name || "Untitled Case"}
        </span>
        {annotCount > 0 && (
          <span style={{
            fontSize: 7, color: PRP,
            border: `1px solid ${PRP}44`, borderRadius: 3,
            padding: "0 4px",
          }}>
            {annotCount} note{annotCount !== 1 ? "s" : ""}
          </span>
        )}
        {seedCount > 0 && (
          <span style={{
            fontSize: 7, color: AM,
            border: `1px solid ${AM}44`, borderRadius: 3,
            padding: "0 4px",
          }}>
            {seedCount} seed{seedCount !== 1 ? "s" : ""}
          </span>
        )}
        {inv.owner && (
          <span style={{ fontSize: 7, color: DIM }}>{String(inv.owner).slice(0, 16)}</span>
        )}
      </button>
      {expanded && <DetailPanel detail={detail} loading={loading} />}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

const TABS = ["ALL", "ANNOTATED", "SEEDED"];

export default function InvestigationsBoard() {
  const [open,      setOpen]      = useState(false);
  const [items,     setItems]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [dossier,   setDossier]   = useState(null);

  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchList();
      setItems(d.items || []);
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (INVST_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:invst-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:invst-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  async function handleAssess() {
    if (assessing) return;
    setAssessing(true);
    setDossier(null);
    try {
      const annotated = items.filter(i => (i.annotations || []).length > 0).length;
      const seeded    = items.filter(i => (i.seeds || []).length > 0).length;
      const names     = items.slice(0, 3).map(i => i.name).join(", ");
      const text = await agentAssess(items.length, annotated, seeded, names);
      setDossier(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {
      setDossier("Assessment unavailable.");
    }
    setAssessing(false);
  }

  const q = search.trim().toLowerCase();
  const filtered = items.filter(inv => {
    if (tab === "ANNOTATED" && !(inv.annotations || []).length) return false;
    if (tab === "SEEDED" && !(inv.seeds || []).length) return false;
    if (q && !inv.name?.toLowerCase().includes(q) && !inv.notes?.toLowerCase().includes(q)) return false;
    return true;
  });

  const total     = items.length;
  const annotated = items.filter(i => (i.annotations || []).length > 0).length;
  const seeded    = items.filter(i => (i.seeds || []).length > 0).length;
  // recent = items created within last 7 days
  const weekAgo   = Date.now() / 1000 - 7 * 86400;
  const recent    = items.filter(i => (i.created_at || 0) > weekAgo).length;

  return (
    <>
      {/* ── toggle button ──────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Investigations Board"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 121,
          background: "rgba(5,10,18,0.82)", border: `1px solid ${PRP}55`,
          color: PRP, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1, padding: "3px 8px",
          borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        ⊗ INVST
        {total > 0 && (
          <span style={{
            marginLeft: 5, background: AM,
            color: "#000", borderRadius: 3, padding: "0 4px", fontSize: 8,
          }}>
            {total}
          </span>
        )}
      </button>

      {/* ── panel ──────────────────────────────────────────────────────── */}
      {open && (
        <div style={{
          position: "fixed", top: 60, right: 18, zIndex: 122,
          width: "min(520px, 94vw)", maxHeight: "82vh",
          background: "rgba(5,10,18,0.96)",
          border: `1px solid ${PRP}44`, borderRadius: 14,
          display: "flex", flexDirection: "column",
          boxShadow: `0 0 60px ${PRP}14, 0 24px 48px rgba(0,0,0,0.8)`,
          fontFamily: "'JetBrains Mono',monospace",
        }}>
          {/* Header */}
          <div style={{
            padding: "12px 16px", borderBottom: `1px solid ${PRP}22`,
            display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
          }}>
            <span style={{ color: PRP, fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>
              ⊗ INVESTIGATIONS BOARD
            </span>
            {loading && (
              <span style={{ color: DIM, fontSize: 8, letterSpacing: 1 }}>SYNCING…</span>
            )}
            <div style={{ flex: 1 }} />
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none", border: "none", color: DIM,
                fontSize: 14, cursor: "pointer", lineHeight: 1,
              }}
            >×</button>
          </div>

          {/* Scrollable body */}
          <div style={{ overflowY: "auto", flex: 1, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Stat tiles */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Tile label="TOTAL" value={total} color={PRP} />
              <Tile label="ANNOTATED" value={annotated} color={CY} />
              <Tile label="SEEDED" value={seeded} color={AM} />
              <Tile label="RECENT 7D" value={recent} color={GN} />
            </div>

            {/* Filter tabs + search */}
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {TABS.map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    background: tab === t ? `${PRP}22` : "none",
                    border: `1px solid ${tab === t ? PRP : DIM}`,
                    color: tab === t ? PRP : DIM,
                    fontSize: 8, letterSpacing: 1, padding: "2px 8px",
                    borderRadius: 4, cursor: "pointer",
                    fontFamily: "'JetBrains Mono',monospace",
                  }}
                >
                  {t}
                </button>
              ))}
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="search cases…"
                style={{
                  flex: 1, minWidth: 100,
                  background: `${CY}08`, border: `1px solid ${DIM}`,
                  color: "#C0D0DC", fontSize: 9, padding: "3px 8px",
                  borderRadius: 4, outline: "none",
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              />
            </div>

            {/* Case list */}
            {filtered.length === 0 ? (
              <div style={{ fontSize: 9, color: DIM, padding: "10px 0", textAlign: "center" }}>
                {items.length === 0 ? "No saved investigations." : "No cases match filter."}
              </div>
            ) : (
              <div style={{
                border: `1px solid ${PRP}22`, borderRadius: 8, overflow: "hidden",
              }}>
                {filtered.map(inv => (
                  <InvRow
                    key={inv.id}
                    inv={inv}
                    expanded={expanded === inv.id}
                    onToggle={() => setExpanded(expanded === inv.id ? null : inv.id)}
                  />
                ))}
              </div>
            )}

            {/* ASSESS */}
            <div style={{ marginTop: 4 }}>
              <button
                onClick={handleAssess}
                disabled={assessing || total === 0}
                style={{
                  background: assessing ? `${PRP}22` : `${PRP}11`,
                  border: `1px solid ${PRP}55`, color: PRP,
                  fontSize: 9, letterSpacing: 1, padding: "5px 14px",
                  borderRadius: 6, cursor: (assessing || total === 0) ? "not-allowed" : "pointer",
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                {assessing ? "▸ ASSESSING…" : "▶ ASSESS"}
              </button>
              {dossier && (
                <div style={{
                  marginTop: 8, padding: 10,
                  background: `${PRP}08`, border: `1px solid ${PRP}22`,
                  borderRadius: 6, fontSize: 10, color: "#C0D0DC", lineHeight: 1.6,
                }}>
                  {dossier}
                </div>
              )}
            </div>

            <div style={{ fontSize: 7, color: `${DIM}88`, textAlign: "right" }}>
              {filtered.length}/{total} cases · auto-refresh 90s
            </div>
          </div>
        </div>
      )}
    </>
  );
}
