/**
 * SpecForgeMonitor — F250.
 *
 * Data sources (all real — backed by server/routes/spec_forge.py):
 *   GET /v1/spec/list
 *       → [{id, title, body_md, frontmatter:{status,created_at,raw_idea}, kind, confidence}]
 *   GET /v1/spec/{spec_id}
 *       → {spec: {id, title, body_md, frontmatter, ...}}  (lazy on row expand)
 *   POST /v1/spec/{spec_id}/approve
 *       → {ok, spec}  (approve a draft spec)
 *
 * Displays:
 *   - Stat tiles: total / approved / draft / recent-7d
 *   - ALL / DRAFT / APPROVED filter tabs + text search
 *   - Expand row → body excerpt (≤400 chars) + frontmatter chips
 *   - ✓ APPROVE button per DRAFT spec → POST /v1/spec/{id}/approve
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle: ⬡ SPEC at left:169440, bottom:8, zIndex:130.
 * Badge: amber = draft count, green = total.
 * 90 s auto-refresh.
 *
 * Exported helpers for JarvisBrain:
 *   isSpecForgeQuery(q) / buildSpecForgeScript()
 *
 * Voice triggers: "spec forge / build spec / implementation spec / spec list /
 *   sfm / spec monitor / draft spec / approve spec / feature spec /
 *   spec backlog / spec builder / idea to spec / spec forge monitor"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const PU  = "#A78BFA";
const AM  = "#F5A623";
const GN  = "#4ADE80";
const CY  = "#29E7FF";
const RD  = "#F87171";
const DIM = "#3A4A55";

const BTN_LEFT   = 169440;
const REFRESH_MS = 90_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SFM_RE =
  /\b(spec\s+forge|build\s+spec|implementation\s+spec|spec\s+list|sfm\b|spec\s+monitor|draft\s+spec|approve\s+spec|feature\s+spec|spec\s+backlog|spec\s+builder|idea\s+to\s+spec|spec\s+forge\s+monitor|my\s+specs?|saved\s+specs?)\b/i;

export function isSpecForgeQuery(t) {
  return SFM_RE.test(t || "");
}

export async function buildSpecForgeScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/spec/list`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    const items = Array.isArray(d) ? d : (d?.items || []);
    if (items.length === 0) {
      return "The Spec Forge is empty — no implementation specs have been generated yet.";
    }
    const approved = items.filter((i) => i?.frontmatter?.status === "approved").length;
    const draft    = items.length - approved;
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent   = items.filter((i) => (i?.frontmatter?.created_at || 0) > sevenDaysAgo).length;
    const latest   = items[0]?.title || "unknown";
    return (
      `Spec Forge holds ${items.length} implementation spec${items.length !== 1 ? "s" : ""} ` +
      `(${approved} approved, ${draft} draft; ${recent} in the last 7 days). ` +
      `Latest: "${latest}".`
    );
  } catch {
    return "Unable to retrieve Spec Forge data at this time, sir.";
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function ageLabel(ts) {
  if (!ts) return "unknown age";
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60)    return `${secs}s ago`;
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function specStatus(item) {
  return item?.frontmatter?.status || "draft";
}

// ─── fetch helpers ─────────────────────────────────────────────────────────────

async function fetchSpecs() {
  const r = await fetch(`${apiBase()}/v1/spec/list`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  return Array.isArray(d) ? d : (d?.items || d || []);
}

async function fetchSpec(id) {
  const r = await fetch(`${apiBase()}/v1/spec/${id}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  return d?.spec || d;
}

async function approveSpec(id) {
  const r = await fetch(`${apiBase()}/v1/spec/${id}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function agentAssess(items) {
  const total    = items.length;
  const approved = items.filter((i) => specStatus(i) === "approved").length;
  const draft    = total - approved;
  const latest3  = items.slice(0, 3).map((i) => i.title).join("; ");
  const prompt =
    `Spec Forge library: ${total} specs (${approved} approved, ${draft} draft). ` +
    `Most recent: ${latest3 || "none"}. ` +
    `Give a 2-sentence operational summary: what features these specs cover ` +
    `and whether any high-priority drafts should be approved now. Be direct.`;
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ message: prompt }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "Assessment unavailable.";
}

// ─── stat tile ─────────────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{
      flex: "1 1 70px", padding: "8px 10px",
      background: `${color}0d`, border: `1px solid ${color}33`,
      borderRadius: 8, textAlign: "center",
    }}>
      <div style={{ fontSize: 7, color: DIM, letterSpacing: 1, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

// ─── spec row ──────────────────────────────────────────────────────────────────

function SpecRow({ item, onApproved }) {
  const [expanded,  setExpanded]  = useState(false);
  const [detail,    setDetail]    = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [approving, setApproving] = useState(false);
  const [approved,  setApproved]  = useState(specStatus(item) === "approved");

  const status    = approved ? "approved" : "draft";
  const statusClr = approved ? GN : AM;
  const bodyText  = detail?.body_md || item?.body_md || "";
  const excerpt   = bodyText.slice(0, 400) + (bodyText.length > 400 ? "…" : "");
  const fm        = detail?.frontmatter || item?.frontmatter || {};

  async function handleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next && !detail) {
      setLoading(true);
      try {
        const d = await fetchSpec(item.id);
        setDetail(d);
      } catch {
        setDetail({ error: true });
      }
      setLoading(false);
    }
  }

  async function handleApprove(e) {
    e.stopPropagation();
    setApproving(true);
    try {
      await approveSpec(item.id);
      setApproved(true);
      if (onApproved) onApproved(item.id);
    } catch {
      // noop — status stays draft
    }
    setApproving(false);
  }

  return (
    <div
      onClick={handleExpand}
      style={{
        padding: "7px 10px", marginBottom: 4, cursor: "pointer",
        background: expanded ? `${statusClr}12` : "rgba(255,255,255,0.02)",
        border: `1px solid ${expanded ? statusClr + "66" : "#ffffff0d"}`,
        borderRadius: 7, transition: "background 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          fontSize: 8, fontWeight: 700, color: statusClr,
          background: `${statusClr}22`, padding: "2px 5px", borderRadius: 4,
          letterSpacing: 0.5, flexShrink: 0,
        }}>
          {status.toUpperCase()}
        </span>
        <span style={{
          fontSize: 11, color: "#cdd6e0", flex: 1, minWidth: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {item.title}
        </span>
        <span style={{ fontSize: 9, color: DIM, flexShrink: 0 }}>
          {ageLabel(fm.created_at)}
        </span>
        {!approved && (
          <button
            onClick={handleApprove}
            disabled={approving}
            style={{
              fontSize: 8, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
              background: approving ? `${GN}22` : `${GN}33`,
              border: `1px solid ${GN}66`, color: GN, cursor: approving ? "default" : "pointer",
              flexShrink: 0,
            }}
          >
            {approving ? "…" : "✓ APPROVE"}
          </button>
        )}
        <span style={{ fontSize: 9, color: DIM, flexShrink: 0 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ marginTop: 8 }}>
          {loading ? (
            <div style={{ fontSize: 10, color: DIM, padding: "4px 0" }}>Loading…</div>
          ) : detail?.error ? (
            <div style={{ fontSize: 10, color: RD }}>Could not load spec body.</div>
          ) : (
            <>
              {excerpt && (
                <div style={{
                  padding: "6px 8px", background: "rgba(0,0,0,0.25)", borderRadius: 5,
                  fontSize: 10, color: "#8ea8b8", lineHeight: 1.6,
                  whiteSpace: "pre-wrap", marginBottom: 6,
                }}>
                  {excerpt}
                </div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {fm.status && (
                  <span style={{
                    fontSize: 8, padding: "2px 6px",
                    background: `${statusClr}18`, border: `1px solid ${statusClr}33`,
                    borderRadius: 10, color: statusClr,
                  }}>
                    status: {fm.status}
                  </span>
                )}
                {fm.approved_at && (
                  <span style={{
                    fontSize: 8, padding: "2px 6px",
                    background: `${GN}18`, border: `1px solid ${GN}33`,
                    borderRadius: 10, color: GN,
                  }}>
                    approved: {ageLabel(fm.approved_at)}
                  </span>
                )}
                {item.confidence != null && (
                  <span style={{
                    fontSize: 8, padding: "2px 6px",
                    background: `${CY}18`, border: `1px solid ${CY}33`,
                    borderRadius: 10, color: CY,
                  }}>
                    conf: {String(item.confidence)}
                  </span>
                )}
                {item.kind && (
                  <span style={{
                    fontSize: 8, padding: "2px 6px",
                    background: `${PU}18`, border: `1px solid ${PU}33`,
                    borderRadius: 10, color: PU,
                  }}>
                    kind: {item.kind}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── main component ────────────────────────────────────────────────────────────

export default function SpecForgeMonitor() {
  const [open,      setOpen]      = useState(false);
  const [items,     setItems]     = useState([]);
  const [err,       setErr]       = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState(null);
  const [localApproved, setLocalApproved] = useState(new Set());

  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchSpecs();
      setItems(data);
      setErr(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:sfm-toggle", toggle);
    return () => window.removeEventListener("jarvis:sfm-toggle", toggle);
  }, []);

  function handleApproved(id) {
    setLocalApproved((s) => new Set([...s, id]));
  }

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  function isApproved(item) {
    return localApproved.has(item.id) || specStatus(item) === "approved";
  }

  const approved = items.filter(isApproved);
  const draft    = items.filter((i) => !isApproved(i));
  const recent   = items.filter((i) => (i?.frontmatter?.created_at || 0) > sevenDaysAgo);

  const visible = items.filter((item) => {
    if (filter === "DRAFT"    && isApproved(item))    return false;
    if (filter === "APPROVED" && !isApproved(item))   return false;
    if (search && !item.title?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const draftCount = draft.length;
  const badgeVal   = draftCount > 0 ? draftCount : (items.length > 0 ? items.length : null);
  const badgeColor = draftCount > 0 ? AM : GN;

  async function handleAssess() {
    setAssessing(true); setBrief(null);
    try {
      const text = await agentAssess(items);
      setBrief(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setBrief("Assessment failed — check agent connectivity.");
    }
    setAssessing(false);
  }

  return (
    <>
      {/* ─── dock button ──────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Spec Forge Monitor"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT,
          zIndex: 130, transform: "translateX(-50%)",
          background: open ? `${PU}22` : "rgba(10,18,26,0.85)",
          border: `1px solid ${open ? PU : "#ffffff22"}`,
          borderRadius: 7, padding: "4px 8px",
          color: open ? PU : "#8ea8b8", fontSize: 9, fontWeight: 700,
          cursor: "pointer", letterSpacing: 0.5, display: "flex",
          alignItems: "center", gap: 4, backdropFilter: "blur(6px)",
          transition: "all 0.2s",
        }}
      >
        ⬡ SPEC
        {badgeVal !== null && (
          <span style={{
            background: badgeColor, color: "#000", fontSize: 8,
            borderRadius: 8, padding: "1px 4px", fontWeight: 700,
          }}>
            {badgeVal}
          </span>
        )}
      </button>

      {/* ─── panel ────────────────────────────────────────────────────────── */}
      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: BTN_LEFT,
          transform: "translateX(-50%)", zIndex: 131,
          width: 430, maxHeight: "70vh",
          background: "rgba(5,12,20,0.97)",
          border: `1px solid ${PU}44`,
          borderRadius: 12, overflow: "hidden", display: "flex",
          flexDirection: "column", backdropFilter: "blur(20px)",
          boxShadow: `0 0 30px ${PU}22`,
        }}>
          {/* header */}
          <div style={{
            padding: "10px 14px 8px", borderBottom: `1px solid #ffffff0d`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ color: PU, fontSize: 13, fontWeight: 700 }}>⬡</span>
            <span style={{ color: PU, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
              SPEC FORGE MONITOR
            </span>
            <span style={{ flex: 1 }} />
            {loading && <span style={{ fontSize: 8, color: DIM }}>LOADING…</span>}
            <button
              onClick={() => { setLoading(true); load(); }}
              style={{ background: "none", border: "none", color: DIM, fontSize: 11, cursor: "pointer" }}
            >↺</button>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, fontSize: 14, cursor: "pointer" }}
            >✕</button>
          </div>

          {err && (
            <div style={{ padding: "8px 14px", color: RD, fontSize: 10 }}>⚠ {err}</div>
          )}

          {/* stat tiles */}
          <div style={{ padding: "10px 14px 0", display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Tile label="TOTAL"     value={items.length}    color={items.length    ? PU  : DIM} />
            <Tile label="APPROVED"  value={approved.length} color={approved.length ? GN  : DIM} />
            <Tile label="DRAFT"     value={draft.length}    color={draft.length    ? AM  : DIM} />
            <Tile label="LAST 7 D"  value={recent.length}   color={recent.length   ? CY  : DIM} />
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "8px 14px 0", flexWrap: "wrap" }}>
            {["ALL", "DRAFT", "APPROVED"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "3px 8px", borderRadius: 5, fontSize: 8,
                  fontWeight: 600, letterSpacing: 0.5, cursor: "pointer",
                  background: filter === f ? `${PU}33` : "transparent",
                  border: `1px solid ${filter === f ? PU : "#ffffff22"}`,
                  color: filter === f ? PU : "#8ea8b8",
                }}
              >
                {f}
              </button>
            ))}
          </div>

          {/* search */}
          <div style={{ padding: "6px 14px 0" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search specs…"
              style={{
                width: "100%", padding: "5px 8px", fontSize: 10,
                background: "rgba(255,255,255,0.04)", border: "1px solid #ffffff18",
                borderRadius: 6, color: "#cdd6e0", outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          {/* spec list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 14px" }}>
            {visible.length === 0 ? (
              <div style={{ color: DIM, fontSize: 10, textAlign: "center", paddingTop: 20 }}>
                {items.length === 0
                  ? "No specs yet — use Spec Forge to turn ideas into build-ready specs."
                  : "No specs match the current filter."}
              </div>
            ) : (
              visible.map((item) => (
                <SpecRow key={item.id} item={item} onApproved={handleApproved} />
              ))
            )}
          </div>

          {/* assess footer */}
          <div style={{ padding: "8px 14px", borderTop: `1px solid #ffffff0d` }}>
            {brief && (
              <div style={{
                marginBottom: 6, padding: "6px 8px", fontSize: 10,
                background: `${PU}0d`, border: `1px solid ${PU}33`,
                borderRadius: 6, color: "#cdd6e0", lineHeight: 1.5,
              }}>
                {brief}
              </div>
            )}
            <button
              onClick={handleAssess}
              disabled={assessing}
              style={{
                width: "100%", padding: "6px", borderRadius: 6,
                background: assessing ? `${PU}22` : `${PU}33`,
                border: `1px solid ${PU}66`, color: PU,
                fontSize: 10, fontWeight: 700, cursor: assessing ? "default" : "pointer",
                letterSpacing: 0.5,
              }}
            >
              {assessing ? "ASSESSING…" : "▶ ASSESS SPEC FORGE"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
