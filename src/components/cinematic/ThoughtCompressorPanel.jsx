/**
 * ThoughtCompressorPanel — F253.
 *
 * Data sources (real — backed by server/routes/thought_compressor.py):
 *   GET  /v1/compress/list?limit=50
 *       → { items:[{id,kind,title,created_at,short_summary,source_type}] }
 *   POST /v1/compress/create  { text, source_type, title? }
 *       → { ok, id, pack:{...} }
 *   GET  /v1/compress/{pack_id}
 *       → { pack:{id,title,short_summary,full_brief,key_facts,next_actions,...} }
 *   POST /v1/compress/{pack_id}/refresh
 *       → { ok, pack:{...} }
 *
 * Displays:
 *   - Stat tiles: total / text / note / url (by source_type)
 *   - Inline capture form (text → POST /v1/compress/create)
 *   - ALL/TEXT/NOTE/URL filter tabs + text search
 *   - Per-pack row: source_type chip + title + age; expand → lazy GET detail
 *   - ↺ REFRESH per row → POST /v1/compress/{id}/refresh
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence memory brief + TTS
 *
 * Toggle: ⬢ TCMPR at left:183120, bottom:8, zIndex:133.
 * Badge: green = pack count, amber = any packs present.
 * 90 s auto-refresh.
 *
 * Exported helpers for JarvisBrain:
 *   isThoughtCompressorQuery(q) / buildThoughtCompressorScript()
 *
 * Voice triggers: "thought compressor / memory packs / compress / pack list /
 *   knowledge packs / tcmpr / memory store / compress thought / what packs /
 *   compress text / compress idea / compress note"
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

const BTN_LEFT   = 183120;
const REFRESH_MS = 90_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const TCMPR_RE =
  /\b(thought compressor|memory packs?|compress|pack list|knowledge packs?|tcmpr|memory store|compress thought|what packs?|compress text|compress idea|compress note)\b/i;

export function isThoughtCompressorQuery(t) {
  return TCMPR_RE.test(t || "");
}

export async function buildThoughtCompressorScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/compress/list?limit=50`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    const items = d?.items ?? [];
    if (items.length === 0) {
      return "The thought compressor has no memory packs stored yet. Compress a piece of text to create the first pack.";
    }
    const newest = items[0];
    const types  = {};
    items.forEach((i) => { types[i.source_type || "text"] = (types[i.source_type || "text"] || 0) + 1; });
    const typeStr = Object.entries(types).map(([k, v]) => `${v} ${k}`).join(", ");
    return (
      `The thought compressor holds ${items.length} memory pack${items.length !== 1 ? "s" : ""} ` +
      `(${typeStr}). ` +
      `Newest: "${(newest?.title || newest?.id || "—").slice(0, 60)}". ` +
      `Use these packs to recall compressed knowledge quickly.`
    );
  } catch {
    return "Unable to reach the thought compressor endpoint at this time.";
  }
}

// ─── fetch helpers ──────────────────────────────────────────────────────────

async function fetchPacks(limit = 50) {
  const r = await fetch(`${apiBase()}/v1/compress/list?limit=${limit}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchPack(id) {
  const r = await fetch(`${apiBase()}/v1/compress/${id}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function createPack(text, sourceType, title) {
  const r = await fetch(`${apiBase()}/v1/compress/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, source_type: sourceType, title: title || undefined }),
  });
  return r.json();
}

async function refreshPack(id) {
  const r = await fetch(`${apiBase()}/v1/compress/${id}/refresh`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  return r.json();
}

async function agentAssess(packCount, newestTitle) {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      message:
        `Assess the thought compressor memory store in 2 sentences: ` +
        `${packCount} pack${packCount !== 1 ? "s" : ""} stored. ` +
        (newestTitle ? `Newest pack: "${newestTitle.slice(0, 80)}".` : "No packs yet."),
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

function timeAgo(ts) {
  if (!ts) return "—";
  const epoch = typeof ts === "number" && ts > 1e10 ? ts / 1000 : ts;
  const diff  = Date.now() / 1000 - epoch;
  if (diff < 60)    return `${Math.round(diff)}s`;
  if (diff < 3600)  return `${Math.round(diff / 60)}m`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h`;
  return `${Math.round(diff / 86400)}d`;
}

const SRC_COLOR = { text: CY, note: GN, url: AM, default: PUR };

function srcColor(t) {
  return SRC_COLOR[t] || SRC_COLOR.default;
}

function PackDetail({ detail, refreshing, onRefresh }) {
  const pack = detail?.pack || {};
  return (
    <div style={{
      padding: "7px 14px", background: `${CY}06`,
      borderBottom: `1px solid ${CY}11`, fontSize: 7, lineHeight: 1.5,
    }}>
      {pack.short_summary && (
        <div style={{ color: "#C8D8E0", marginBottom: 5 }}>{pack.short_summary}</div>
      )}
      {Array.isArray(pack.key_facts) && pack.key_facts.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <span style={{ color: DIM }}>Key facts: </span>
          <span style={{ color: AM }}>{pack.key_facts.slice(0, 4).join(" · ")}</span>
        </div>
      )}
      {Array.isArray(pack.next_actions) && pack.next_actions.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <span style={{ color: DIM }}>Next: </span>
          <span style={{ color: GN }}>{pack.next_actions.slice(0, 3).join(" · ")}</span>
        </div>
      )}
      <button
        onClick={onRefresh}
        disabled={refreshing}
        style={{
          fontSize: 7, padding: "2px 7px", borderRadius: 3, cursor: "pointer",
          border: `1px solid ${CY}44`, color: CY, background: `${CY}0d`,
          opacity: refreshing ? 0.5 : 1, marginTop: 2,
        }}
      >
        {refreshing ? "↺ Refreshing…" : "↺ REFRESH"}
      </button>
    </div>
  );
}

function PackRow({ item, onExpand, expanded, detail, loadingDetail, refreshing, onRefresh }) {
  const sc = srcColor(item.source_type);
  const ts = item.created_at;
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
        <span style={{
          fontSize: 7, padding: "1px 5px", borderRadius: 3,
          border: `1px solid ${sc}55`, color: sc, flexShrink: 0,
        }}>
          {item.source_type || "text"}
        </span>
        <span style={{ flex: 1, fontSize: 8, color: "#C8D8E0", lineHeight: 1.3 }}>
          {(item.title || item.id || "—").slice(0, 60)}
        </span>
        <span style={{ fontSize: 7, color: DIM, flexShrink: 0 }}>
          {timeAgo(ts)}
        </span>
        <span style={{ fontSize: 8, color: DIM }}>
          {expanded ? "▲" : "▼"}
        </span>
      </div>
      {expanded && (
        loadingDetail
          ? <div style={{ padding: "6px 14px", fontSize: 7, color: DIM }}>Loading…</div>
          : detail
            ? <PackDetail detail={detail} refreshing={refreshing} onRefresh={onRefresh} />
            : <div style={{ padding: "6px 14px", fontSize: 7, color: RED }}>Failed to load.</div>
      )}
    </>
  );
}

// ─── main component ─────────────────────────────────────────────────────────

export default function ThoughtCompressorPanel() {
  const [open,         setOpen]         = useState(false);
  const [items,        setItems]        = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [tab,          setTab]          = useState("ALL");
  const [search,       setSearch]       = useState("");
  const [newText,      setNewText]      = useState("");
  const [newSrc,       setNewSrc]       = useState("text");
  const [saving,       setSaving]       = useState(false);
  const [saveMsg,      setSaveMsg]      = useState(null);
  const [expandedId,   setExpandedId]   = useState(null);
  const [details,      setDetails]      = useState({});
  const [loadingDet,   setLoadingDet]   = useState({});
  const [refreshing,   setRefreshing]   = useState({});
  const [assessing,    setAssessing]    = useState(false);
  const [dossier,      setDossier]      = useState(null);

  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchPacks(50);
      setItems(d?.items ?? []);
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
    const onAsk    = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (TCMPR_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:tcmpr-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:tcmpr-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  async function handleSave() {
    const text = newText.trim();
    if (!text || saving) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const d = await createPack(text, newSrc, null);
      if (d.ok !== false) {
        setNewText("");
        setSaveMsg("✓ Compressed");
        await load();
      } else {
        setSaveMsg(`✕ ${d.error || "Failed"}`);
      }
    } catch {
      setSaveMsg("✕ Error");
    }
    setSaving(false);
    setTimeout(() => setSaveMsg(null), 3000);
  }

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

  async function handleRefresh(id) {
    if (refreshing[id]) return;
    setRefreshing((p) => ({ ...p, [id]: true }));
    try {
      const d = await refreshPack(id);
      if (d.pack) {
        setDetails((p) => ({ ...p, [id]: { pack: d.pack } }));
      }
    } catch (_) {}
    setRefreshing((p) => ({ ...p, [id]: false }));
  }

  async function handleAssess() {
    if (assessing) return;
    setAssessing(true);
    setDossier(null);
    try {
      const newest = items[0];
      const text   = await agentAssess(items.length, newest?.title || newest?.id);
      setDossier(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {
      setDossier("Assessment unavailable.");
    }
    setAssessing(false);
  }

  // derived
  const textCnt = items.filter((i) => (i.source_type || "text") === "text").length;
  const noteCnt = items.filter((i) => i.source_type === "note").length;
  const urlCnt  = items.filter((i) => i.source_type === "url").length;

  const filtered = items
    .filter((i) => {
      if (tab === "TEXT") return (i.source_type || "text") === "text";
      if (tab === "NOTE") return i.source_type === "note";
      if (tab === "URL")  return i.source_type === "url";
      return true;
    })
    .filter((i) =>
      !search ||
      (i.title || "").toLowerCase().includes(search.toLowerCase()) ||
      (i.id || "").toLowerCase().includes(search.toLowerCase())
    );

  const badgeCount = items.length;
  const badgeColor = badgeCount > 0 ? AM : GN;

  const TABS = ["ALL", "TEXT", "NOTE", "URL"];

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 133,
          background: "#091520", border: `1px solid ${CY}44`, borderRadius: 6,
          color: CY, fontSize: 7, padding: "3px 7px", cursor: "pointer",
          letterSpacing: 1, display: "flex", alignItems: "center", gap: 4,
          whiteSpace: "nowrap",
        }}
      >
        ⬢ TCMPR
        {badgeCount > 0 && (
          <span style={{
            background: badgeColor, color: "#000", borderRadius: "50%",
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
      position: "fixed", left: BTN_LEFT - 280, bottom: 32, zIndex: 133,
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
          ⬢ THOUGHT COMPRESSOR
        </span>
        {loading && <span style={{ fontSize: 8, color: DIM }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: DIM,
          fontSize: 10, cursor: "pointer", lineHeight: 1,
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
        <Tile label="TOTAL"  value={items.length} color={items.length > 0 ? GN : DIM} />
        <Tile label="TEXT"   value={textCnt}       color={CY} />
        <Tile label="NOTE"   value={noteCnt}       color={GN} />
        <Tile label="URL"    value={urlCnt}        color={AM} />
      </div>

      {/* capture form */}
      <div style={{ padding: "0 12px 8px", display: "flex", gap: 5, flexDirection: "column" }}>
        <div style={{ display: "flex", gap: 5 }}>
          <input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) handleSave(); }}
            placeholder="Compress a thought, note, or URL…"
            style={{
              flex: 1, fontSize: 8, padding: "4px 8px", borderRadius: 4,
              background: "#0a1a24", border: `1px solid ${CY}33`, color: "#C8D8E0",
              outline: "none",
            }}
          />
          <select
            value={newSrc}
            onChange={(e) => setNewSrc(e.target.value)}
            style={{
              fontSize: 7, background: "#0a1a24", border: `1px solid ${CY}33`,
              color: CY, borderRadius: 4, padding: "2px 4px", cursor: "pointer",
            }}
          >
            <option value="text">text</option>
            <option value="note">note</option>
            <option value="url">url</option>
          </select>
          <button
            onClick={handleSave}
            disabled={saving || !newText.trim()}
            style={{
              fontSize: 8, padding: "4px 8px", borderRadius: 4, cursor: "pointer",
              border: `1px solid ${GN}66`, color: GN, background: `${GN}11`,
              opacity: saving || !newText.trim() ? 0.5 : 1,
            }}
          >
            ⬢
          </button>
        </div>
        {saveMsg && (
          <div style={{
            fontSize: 7,
            color: saveMsg.startsWith("✓") ? GN : RED,
          }}>
            {saveMsg}
          </div>
        )}
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
          placeholder="search…"
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
            {loading ? "Loading…" : "No packs found. Compress something to get started."}
          </div>
        ) : (
          filtered.map((item) => (
            <PackRow
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              detail={details[item.id]}
              loadingDetail={!!loadingDet[item.id]}
              refreshing={!!refreshing[item.id]}
              onExpand={handleExpand}
              onRefresh={() => handleRefresh(item.id)}
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
        <span>90 s poll · /v1/compress</span>
      </div>
    </div>
  );
}
