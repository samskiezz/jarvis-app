/**
 * ProofPackLibrary — F255.
 *
 * Data sources (real — backed by server/routes/proof_pack.py):
 *   GET  /v1/proofpack/list?limit=50
 *       → list of note objects {id, title, body_md, frontmatter:{id, created_at,
 *           spec_id, decision_ids, commit, changed_files, friction_score,
 *           dead_zone_count, risks, rollback_steps}}
 *   GET  /v1/proofpack/{pack_id}
 *       → { pack: { id, title, body_md, frontmatter:{...} } }
 *   POST /v1/proofpack/create  { title, spec_id?, include_diff? }
 *       → { ok, pack }
 *   POST /v1/proofpack/{pack_id}/export
 *       → { ok, markdown, title }
 *
 * Displays:
 *   - Stat tiles: total / with-spec / with-decisions / recent-7d
 *   - ALL/RECENT filter tabs + text search on title
 *   - Per-pack row: commit chip + title + age; expand → lazy GET detail
 *     (body excerpt ≤400 chars + meta chips for friction/dead_zone/risks count)
 *   - ▶ EXPORT per pack → POST /v1/proofpack/{id}/export → inline markdown preview
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence evidence brief + TTS
 *
 * Toggle: ◈ PPAK at left:187680, bottom:8, zIndex:134.
 * Badge: green = pack count.
 * 90 s auto-refresh.
 *
 * Exported helpers for JarvisBrain:
 *   isProofPackQuery(q) / buildProofPackScript()
 *
 * Voice triggers: "proof pack / evidence pack / ppak / pack list / evidence library /
 *   proof library / change evidence / spec proof / decision proof / audit packs /
 *   proof packs / export pack"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AM  = "#F5A623";
const GN  = "#4ADE80";
const RED = "#F87171";
const DIM = "#3A4A55";
const PUR = "#A78BFA";

const BTN_LEFT   = 187680;
const REFRESH_MS = 90_000;
const SEVEN_DAYS = 7 * 24 * 3600 * 1000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const PPAK_RE =
  /\b(proof pack|evidence pack|ppak|pack list|evidence library|proof library|change evidence|spec proof|decision proof|audit packs?|proof packs?|export pack)\b/i;

export function isProofPackQuery(t) {
  return PPAK_RE.test(t || "");
}

export async function buildProofPackScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/proofpack/list?limit=50`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const items = await r.json();
    const list = Array.isArray(items) ? items : [];
    if (list.length === 0) {
      return "The proof pack library is empty. Create a pack after a change to capture git diff, friction, and risk evidence.";
    }
    const newest = list[0];
    const withSpec = list.filter((n) => (n.frontmatter?.spec_id || "").length > 0).length;
    const recent7d = list.filter((n) => {
      const ts = n.frontmatter?.created_at || 0;
      return Date.now() - ts < SEVEN_DAYS;
    }).length;
    return (
      `The proof pack library holds ${list.length} evidence pack${list.length !== 1 ? "s" : ""}, ` +
      `${withSpec} linked to specs, ${recent7d} created in the last 7 days. ` +
      `Newest: "${(newest?.title || "—").replace(/^Proof: /, "").slice(0, 70)}". ` +
      `Use packs to anchor change decisions with git diff, risks, and rollback steps.`
    );
  } catch {
    return "Unable to reach the proof pack endpoint at this time.";
  }
}

// ─── fetch helpers ──────────────────────────────────────────────────────────

async function fetchPacks(limit = 50) {
  const r = await fetch(`${apiBase()}/v1/proofpack/list?limit=${limit}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

async function fetchPack(packId) {
  const r = await fetch(`${apiBase()}/v1/proofpack/${packId}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function exportPack(packId) {
  const r = await fetch(`${apiBase()}/v1/proofpack/${packId}/export`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ format: "markdown" }),
  });
  return r.json();
}

async function agentAssess(packCount, newestTitle) {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      message:
        `Assess the proof pack evidence library in 2 sentences: ` +
        `${packCount} pack${packCount !== 1 ? "s" : ""} stored. ` +
        (newestTitle ? `Newest: "${newestTitle.slice(0, 80)}".` : "No packs yet."),
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
      <span style={{ fontSize: 16, fontWeight: 700, color, letterSpacing: 1 }}>{value}</span>
    </div>
  );
}

function timeAgo(tsMs) {
  if (!tsMs) return "—";
  const diff = (Date.now() - tsMs) / 1000;
  if (diff < 60)    return `${Math.round(diff)}s`;
  if (diff < 3600)  return `${Math.round(diff / 60)}m`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h`;
  return `${Math.round(diff / 86400)}d`;
}

function Chip({ label, color }) {
  return (
    <span style={{
      fontSize: 7, padding: "1px 5px", borderRadius: 3,
      border: `1px solid ${color}55`, color, flexShrink: 0,
    }}>
      {label}
    </span>
  );
}

function PackDetail({ detail, exporting, exportResult, onExport }) {
  const pack = detail?.pack || detail || {};
  const fm = pack.frontmatter || {};
  const bodyExcerpt = (pack.body_md || "").slice(0, 400);
  return (
    <div style={{
      padding: "7px 14px", background: `${CY}06`,
      borderBottom: `1px solid ${CY}11`, fontSize: 7, lineHeight: 1.5,
    }}>
      {bodyExcerpt && (
        <div style={{ color: "#C8D8E0", marginBottom: 6, whiteSpace: "pre-wrap", maxHeight: 80, overflow: "hidden" }}>
          {bodyExcerpt}{bodyExcerpt.length >= 400 ? "…" : ""}
        </div>
      )}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
        {fm.commit && <Chip label={`commit: ${fm.commit}`} color={CY} />}
        {typeof fm.friction_score === "number" && (
          <Chip label={`friction: ${fm.friction_score}`} color={fm.friction_score > 5 ? RED : AM} />
        )}
        {typeof fm.dead_zone_count === "number" && (
          <Chip label={`dead zones: ${fm.dead_zone_count}`} color={fm.dead_zone_count > 0 ? AM : GN} />
        )}
        {Array.isArray(fm.risks) && fm.risks.length > 0 && (
          <Chip label={`risks: ${fm.risks.length}`} color={RED} />
        )}
        {fm.spec_id && <Chip label={`spec: ${fm.spec_id.slice(0, 10)}`} color={PUR} />}
        {Array.isArray(fm.decision_ids) && fm.decision_ids.length > 0 && (
          <Chip label={`decisions: ${fm.decision_ids.length}`} color={AM} />
        )}
      </div>
      <button
        onClick={onExport}
        disabled={exporting}
        style={{
          fontSize: 7, padding: "2px 7px", borderRadius: 3, cursor: "pointer",
          border: `1px solid ${GN}44`, color: GN, background: `${GN}0d`,
          opacity: exporting ? 0.5 : 1,
        }}
      >
        {exporting ? "▶ Exporting…" : "▶ EXPORT"}
      </button>
      {exportResult && (
        <div style={{
          marginTop: 5, fontSize: 7, color: AM, lineHeight: 1.4,
          padding: "5px 7px", background: `${AM}0a`, borderRadius: 5,
          maxHeight: 100, overflowY: "auto", whiteSpace: "pre-wrap",
        }}>
          {(exportResult.markdown || "").slice(0, 600)}{(exportResult.markdown || "").length > 600 ? "…" : ""}
        </div>
      )}
    </div>
  );
}

function PackRow({ item, expanded, detail, loadingDetail, exporting, exportResult, onExpand, onExport }) {
  const fm = item.frontmatter || {};
  const title = (item.title || "").replace(/^Proof: /, "");
  const ts = fm.created_at || 0;
  return (
    <>
      <div
        onClick={() => onExpand(item.id)}
        style={{
          padding: "7px 12px", borderBottom: `1px solid ${CY}11`,
          display: "flex", alignItems: "center", gap: 8,
          cursor: "pointer",
          background: expanded ? `${CY}07` : "transparent",
        }}
      >
        {fm.commit && (
          <span style={{
            fontSize: 7, padding: "1px 5px", borderRadius: 3,
            border: `1px solid ${CY}44`, color: CY, flexShrink: 0, fontFamily: "monospace",
          }}>
            {fm.commit.slice(0, 7)}
          </span>
        )}
        <span style={{ flex: 1, fontSize: 8, color: "#C8D8E0", lineHeight: 1.3 }}>
          {title.slice(0, 55) || item.id}
        </span>
        <span style={{ fontSize: 7, color: DIM, flexShrink: 0 }}>
          {timeAgo(ts)}
        </span>
        <span style={{ fontSize: 8, color: DIM }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        loadingDetail
          ? <div style={{ padding: "6px 14px", fontSize: 7, color: DIM }}>Loading…</div>
          : detail
            ? <PackDetail
                detail={detail}
                exporting={exporting}
                exportResult={exportResult}
                onExport={onExport}
              />
            : <div style={{ padding: "6px 14px", fontSize: 7, color: RED }}>Failed to load.</div>
      )}
    </>
  );
}

// ─── main component ─────────────────────────────────────────────────────────

export default function ProofPackLibrary() {
  const [open,        setOpen]        = useState(false);
  const [items,       setItems]       = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [tab,         setTab]         = useState("ALL");
  const [search,      setSearch]      = useState("");
  const [expandedId,  setExpandedId]  = useState(null);
  const [details,     setDetails]     = useState({});
  const [loadingDet,  setLoadingDet]  = useState({});
  const [exporting,   setExporting]   = useState({});
  const [exportRes,   setExportRes]   = useState({});
  const [assessing,   setAssessing]   = useState(false);
  const [dossier,     setDossier]     = useState(null);

  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchPacks(50);
      setItems(list);
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (PPAK_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ppak-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:ppak-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  async function handleExpand(id) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (details[id]) return;
    setLoadingDet((p) => ({ ...p, [id]: true }));
    try {
      const d = await fetchPack(id);
      setDetails((p) => ({ ...p, [id]: d }));
    } catch {
      setDetails((p) => ({ ...p, [id]: null }));
    }
    setLoadingDet((p) => ({ ...p, [id]: false }));
  }

  async function handleExport(id) {
    if (exporting[id]) return;
    setExporting((p) => ({ ...p, [id]: true }));
    setExportRes((p) => ({ ...p, [id]: null }));
    try {
      const d = await exportPack(id);
      setExportRes((p) => ({ ...p, [id]: d }));
    } catch {
      setExportRes((p) => ({ ...p, [id]: { error: "Export failed" } }));
    }
    setExporting((p) => ({ ...p, [id]: false }));
  }

  async function handleAssess() {
    if (assessing) return;
    setAssessing(true);
    setDossier(null);
    try {
      const newest = items[0];
      const text = await agentAssess(
        items.length,
        (newest?.title || "").replace(/^Proof: /, ""),
      );
      setDossier(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {
      setDossier("Assessment unavailable.");
    }
    setAssessing(false);
  }

  // derived stats
  const withSpec  = items.filter((n) => (n.frontmatter?.spec_id || "").length > 0).length;
  const withDecs  = items.filter((n) => (n.frontmatter?.decision_ids || []).length > 0).length;
  const recent7d  = items.filter((n) => Date.now() - (n.frontmatter?.created_at || 0) < SEVEN_DAYS).length;

  const nowMs = Date.now();
  const filtered = items
    .filter((n) => {
      if (tab === "RECENT") return nowMs - (n.frontmatter?.created_at || 0) < SEVEN_DAYS;
      return true;
    })
    .filter((n) => {
      if (!search) return true;
      const title = (n.title || "").toLowerCase();
      const id    = (n.id || "").toLowerCase();
      const q     = search.toLowerCase();
      return title.includes(q) || id.includes(q);
    });

  const badgeCount = items.length;
  const TABS = ["ALL", "RECENT"];

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 134,
          background: "#091520", border: `1px solid ${CY}44`, borderRadius: 6,
          color: CY, fontSize: 7, padding: "3px 7px", cursor: "pointer",
          letterSpacing: 1, display: "flex", alignItems: "center", gap: 4,
          whiteSpace: "nowrap",
        }}
      >
        ◈ PPAK
        {badgeCount > 0 && (
          <span style={{
            background: GN, color: "#000", borderRadius: "50%",
            fontSize: 6, width: 12, height: 12, display: "flex",
            alignItems: "center", justifyContent: "center", fontWeight: 700,
          }}>
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT - 280, bottom: 32, zIndex: 134,
      width: 340, maxHeight: 540,
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
          ◈ PROOF PACK LIBRARY
        </span>
        {loading && <span style={{ fontSize: 8, color: DIM }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: DIM,
          fontSize: 10, cursor: "pointer", lineHeight: 1,
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
        <Tile label="TOTAL"     value={items.length} color={items.length > 0 ? GN : DIM} />
        <Tile label="W/ SPEC"   value={withSpec}     color={PUR} />
        <Tile label="W/ DECS"   value={withDecs}     color={AM} />
        <Tile label="LAST 7D"   value={recent7d}     color={CY} />
      </div>

      {/* tabs + search */}
      <div style={{ padding: "0 12px 6px", display: "flex", gap: 4, alignItems: "center" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontSize: 7, padding: "2px 6px", borderRadius: 4, cursor: "pointer",
              border: `1px solid ${tab === t ? CY : CY + "33"}`,
              color: tab === t ? CY : DIM,
              background: tab === t ? `${CY}14` : "transparent",
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search title…"
          style={{
            flex: 1, fontSize: 7, padding: "2px 6px", borderRadius: 4,
            background: "#0a1a24", border: `1px solid ${CY}22`, color: "#C8D8E0",
            outline: "none",
          }}
        />
      </div>

      {/* assess */}
      <div style={{ padding: "0 12px 6px" }}>
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

      {/* pack list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {filtered.length === 0 ? (
          <div style={{ fontSize: 8, color: DIM, padding: "12px 16px", textAlign: "center" }}>
            {loading ? "Loading…" : "No proof packs found."}
          </div>
        ) : (
          filtered.map((item) => (
            <PackRow
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              detail={details[item.id]}
              loadingDetail={!!loadingDet[item.id]}
              exporting={!!exporting[item.id]}
              exportResult={exportRes[item.id]}
              onExpand={handleExpand}
              onExport={() => handleExport(item.id)}
            />
          ))
        )}
      </div>

      {/* footer */}
      <div style={{
        padding: "5px 12px", borderTop: `1px solid ${CY}11`,
        fontSize: 7, color: DIM, display: "flex", justifyContent: "space-between",
      }}>
        <span>{filtered.length} shown</span>
        <span>90 s poll · /v1/proofpack</span>
      </div>
    </div>
  );
}
