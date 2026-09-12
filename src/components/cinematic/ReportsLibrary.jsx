/**
 * ReportsLibrary — F249.
 *
 * Data sources (all real — backed by server/routes/reports.py):
 *   GET /v1/reports
 *       → {items:[{id, title, body, meta, created_ts}], count}
 *   GET /v1/reports/{id}
 *       → {id, title, body, meta, created_ts}   (lazy on row expand)
 *
 * Displays:
 *   - Stat tiles: total / generated / manual / recent-7d
 *   - ALL / GENERATED / MANUAL filter tabs + text search
 *   - Expand row → body excerpt (≤400 chars) + meta chips
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle: ⊞ RLIB at left:164880, bottom:8, zIndex:129.
 * Badge: green = total report count.
 * 90 s auto-refresh.
 *
 * Exported helpers for JarvisBrain:
 *   isRlibQuery(q) / buildRlibScript()
 *
 * Voice triggers: "reports / saved reports / intelligence brief /
 *   report library / rlib / briefings / intelligence reports /
 *   saved briefings / report log / my reports / jarvis reports / report vault"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GN  = "#4ADE80";
const AM  = "#F5A623";
const DIM = "#3A4A55";
const PU  = "#A78BFA";

const BTN_LEFT   = 164880;
const REFRESH_MS = 90_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const RLIB_RE =
  /\b(reports?|saved\s+reports?|intelligence\s+brief(?:ing)?|report\s+(?:library|vault|log|list)|rlib\b|briefings?|intelligence\s+reports?|saved\s+briefings?|my\s+reports?|jarvis\s+reports?|report\s+catalog)\b/i;

export function isRlibQuery(t) {
  return RLIB_RE.test(t || "");
}

export async function buildRlibScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/reports`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    const items = d?.items || [];
    if (items.length === 0) {
      return "The reports library is empty — no intelligence briefs have been saved yet.";
    }
    const gen   = items.filter((i) => i.meta?.generated).length;
    const manual = items.length - gen;
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = items.filter((i) => (i.created_ts || 0) > sevenDaysAgo).length;
    const latest = items[0]?.title || "unknown";
    return (
      `Reports library contains ${items.length} saved brief${items.length !== 1 ? "s" : ""} ` +
      `(${gen} generated, ${manual} manual; ${recent} in the last 7 days). ` +
      `Latest: "${latest}".`
    );
  } catch {
    return "Unable to retrieve the reports library at this time, sir.";
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function ageLabel(ts) {
  if (!ts) return "unknown age";
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60)   return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function isGenerated(item) {
  return !!(item.meta?.generated);
}

// ─── fetch helpers ─────────────────────────────────────────────────────────────

async function fetchReports() {
  const r = await fetch(`${apiBase()}/v1/reports`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchReport(id) {
  const r = await fetch(`${apiBase()}/v1/reports/${id}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function agentAssess(items) {
  const total = items.length;
  const gen   = items.filter(isGenerated).length;
  const latest3 = items.slice(0, 3).map((i) => i.title).join("; ");
  const prompt =
    `Reports library: ${total} total briefs (${gen} auto-generated). ` +
    `Most recent: ${latest3 || "none"}. ` +
    `Give a 2-sentence operational summary: what coverage the report library provides ` +
    `and what topics or gaps warrant a new brief. Be direct.`;
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

// ─── report row ────────────────────────────────────────────────────────────────

function ReportRow({ item }) {
  const [expanded, setExpanded]   = useState(false);
  const [detail,   setDetail]     = useState(null);
  const [loading,  setLoading]    = useState(false);

  async function handleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next && !detail) {
      setLoading(true);
      try {
        const d = await fetchReport(item.id);
        setDetail(d);
      } catch {
        setDetail({ error: true });
      }
      setLoading(false);
    }
  }

  const tag     = isGenerated(item) ? "GENERATED" : "MANUAL";
  const tagClr  = isGenerated(item) ? PU : GN;
  const bodyText = detail?.body || item?.body || "";
  const excerpt  = bodyText.slice(0, 400) + (bodyText.length > 400 ? "…" : "");

  return (
    <div
      onClick={handleExpand}
      style={{
        padding: "7px 10px", marginBottom: 4, cursor: "pointer",
        background: expanded ? `${tagClr}12` : "rgba(255,255,255,0.02)",
        border: `1px solid ${expanded ? tagClr + "66" : "#ffffff0d"}`,
        borderRadius: 7, transition: "background 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          fontSize: 8, fontWeight: 700, color: tagClr,
          background: `${tagClr}22`, padding: "2px 5px", borderRadius: 4,
          letterSpacing: 0.5, flexShrink: 0,
        }}>
          {tag}
        </span>
        <span style={{ fontSize: 11, color: "#cdd6e0", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.title}
        </span>
        <span style={{ fontSize: 9, color: DIM, flexShrink: 0 }}>{ageLabel(item.created_ts)}</span>
        <span style={{ fontSize: 9, color: DIM, flexShrink: 0 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ marginTop: 8 }}>
          {loading ? (
            <div style={{ fontSize: 10, color: DIM, padding: "4px 0" }}>Loading…</div>
          ) : detail?.error ? (
            <div style={{ fontSize: 10, color: "#F87171" }}>Could not load report body.</div>
          ) : (
            <>
              {excerpt && (
                <div style={{
                  padding: "6px 8px", background: "rgba(0,0,0,0.25)", borderRadius: 5,
                  fontSize: 10, color: "#8ea8b8", lineHeight: 1.6, whiteSpace: "pre-wrap",
                }}>
                  {excerpt}
                </div>
              )}
              {item.meta && Object.keys(item.meta).length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                  {Object.entries(item.meta).map(([k, v]) => (
                    v !== null && v !== undefined && v !== "" && v !== false ? (
                      <span key={k} style={{
                        fontSize: 8, padding: "2px 6px",
                        background: `${CY}18`, border: `1px solid ${CY}33`,
                        borderRadius: 10, color: CY,
                      }}>
                        {k}: {String(v)}
                      </span>
                    ) : null
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── main component ────────────────────────────────────────────────────────────

export default function ReportsLibrary() {
  const [open,      setOpen]      = useState(false);
  const [data,      setData]      = useState(null);
  const [err,       setErr]       = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState(null);

  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchReports();
      setData(d);
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
    window.addEventListener("jarvis:rlib-toggle", toggle);
    return () => window.removeEventListener("jarvis:rlib-toggle", toggle);
  }, []);

  const items = data?.items || [];

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const generated = items.filter(isGenerated);
  const manual    = items.filter((i) => !isGenerated(i));
  const recent    = items.filter((i) => (i.created_ts || 0) > sevenDaysAgo);

  const visible = items.filter((i) => {
    if (filter === "GENERATED" && !isGenerated(i))  return false;
    if (filter === "MANUAL"    && isGenerated(i))   return false;
    if (search && !i.title?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const badgeVal = items.length > 0 ? items.length : null;

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
        title="Reports Library"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT,
          zIndex: 129, transform: "translateX(-50%)",
          background: open ? `${GN}22` : "rgba(10,18,26,0.85)",
          border: `1px solid ${open ? GN : "#ffffff22"}`,
          borderRadius: 7, padding: "4px 8px",
          color: open ? GN : "#8ea8b8", fontSize: 9, fontWeight: 700,
          cursor: "pointer", letterSpacing: 0.5, display: "flex",
          alignItems: "center", gap: 4, backdropFilter: "blur(6px)",
          transition: "all 0.2s",
        }}
      >
        ⊞ RLIB
        {badgeVal !== null && (
          <span style={{
            background: GN, color: "#000", fontSize: 8,
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
          transform: "translateX(-50%)", zIndex: 130,
          width: 420, maxHeight: "70vh",
          background: "rgba(5,12,20,0.97)",
          border: `1px solid ${GN}44`,
          borderRadius: 12, overflow: "hidden", display: "flex",
          flexDirection: "column", backdropFilter: "blur(20px)",
          boxShadow: `0 0 30px ${GN}22`,
        }}>
          {/* header */}
          <div style={{
            padding: "10px 14px 8px", borderBottom: `1px solid #ffffff0d`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ color: GN, fontSize: 13, fontWeight: 700 }}>⊞</span>
            <span style={{ color: GN, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
              REPORTS LIBRARY
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
            <div style={{ padding: "8px 14px", color: "#F87171", fontSize: 10 }}>⚠ {err}</div>
          )}

          {/* stat tiles */}
          <div style={{ padding: "10px 14px 0", display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Tile label="TOTAL"      value={items.length}      color={items.length ? GN : DIM} />
            <Tile label="GENERATED"  value={generated.length}  color={generated.length ? PU : DIM} />
            <Tile label="MANUAL"     value={manual.length}     color={manual.length ? CY : DIM} />
            <Tile label="LAST 7 D"   value={recent.length}     color={recent.length ? AM : DIM} />
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "8px 14px 0", flexWrap: "wrap" }}>
            {["ALL", "GENERATED", "MANUAL"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "3px 8px", borderRadius: 5, fontSize: 8,
                  fontWeight: 600, letterSpacing: 0.5, cursor: "pointer",
                  background: filter === f ? `${GN}33` : "transparent",
                  border: `1px solid ${filter === f ? GN : "#ffffff22"}`,
                  color: filter === f ? GN : "#8ea8b8",
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
              placeholder="Search reports…"
              style={{
                width: "100%", padding: "5px 8px", fontSize: 10,
                background: "rgba(255,255,255,0.04)", border: "1px solid #ffffff18",
                borderRadius: 6, color: "#cdd6e0", outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          {/* report list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 14px" }}>
            {visible.length === 0 ? (
              <div style={{ color: DIM, fontSize: 10, textAlign: "center", paddingTop: 20 }}>
                {items.length === 0
                  ? "No reports saved yet — generate an intelligence brief to populate this library."
                  : "No reports match the current filter."}
              </div>
            ) : (
              visible.map((item) => <ReportRow key={item.id} item={item} />)
            )}
          </div>

          {/* assess footer */}
          <div style={{ padding: "8px 14px", borderTop: `1px solid #ffffff0d` }}>
            {brief && (
              <div style={{
                marginBottom: 6, padding: "6px 8px", fontSize: 10,
                background: `${GN}0d`, border: `1px solid ${GN}33`,
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
                background: assessing ? `${GN}22` : `${GN}33`,
                border: `1px solid ${GN}66`, color: GN,
                fontSize: 10, fontWeight: 700, cursor: assessing ? "default" : "pointer",
                letterSpacing: 0.5,
              }}
            >
              {assessing ? "ASSESSING…" : "▶ ASSESS REPORTS"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
