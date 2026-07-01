/**
 * OpsCasesPanel — F35
 * Browses /v1/cases (ops case management). Shows all cases with status filter
 * tabs (all/open/investigating/closed). Click any case to drill into
 * /v1/cases/{id} for full notes + attached entities. Auto-refreshes every 60 s.
 * "JARVIS, cases" | "ops cases" | "case files" | "open cases" → opens panel + speaks summary.
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const GRN  = "#00E5A0";
const YLW  = "#FFD700";
const RED  = "#FF4D6D";
const PURP = "#b18cff";
const POLL = 60 * 1000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CASES_RE =
  /\b(ops.cases|case.files|open.cases|case.panel|case.board|ops.case|jarvis.cases|show.cases|investigation.cases)\b/i;

export function isOpsCasesQuery(t) {
  return CASES_RE.test(t || "");
}

async function fetchCases(status) {
  const qs = status && status !== "all" ? `?status=${encodeURIComponent(status)}` : "";
  const r = await fetch(`${apiBase()}/v1/cases${qs}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`/v1/cases ${r.status}`);
  return r.json();
}

async function fetchCase(id) {
  const r = await fetch(`${apiBase()}/v1/cases/${id}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`/v1/cases/${id} ${r.status}`);
  return r.json();
}

export async function buildOpsCasesScript() {
  try {
    const data = await fetchCases(null);
    const items = data?.items || [];
    if (!items.length) return "Ops cases database is empty. No active cases on record. Standing by, sir.";
    const open  = items.filter(c => c.status === "open").length;
    const inv   = items.filter(c => c.status === "investigating").length;
    const closed = items.filter(c => c.status === "closed").length;
    const latest = items
      .sort((a, b) => (b.created_ts || 0) - (a.created_ts || 0))
      .slice(0, 2)
      .map(c => `"${c.title}"`)
      .join(" and ");
    return (
      `Ops case board shows ${items.length} case${items.length !== 1 ? "s" : ""}: ` +
      `${open} open, ${inv} under investigation, ${closed} closed. ` +
      (latest ? `Most recent: ${latest}. ` : "") +
      "Displaying case board now, sir."
    );
  } catch (_) {
    return "Ops cases panel is online. Unable to reach the case database. Standing by.";
  }
}

const STATUS_COLORS = {
  open:          { fg: YLW,  bg: `${YLW}18`  },
  investigating: { fg: PURP, bg: `${PURP}18` },
  closed:        { fg: GRN,  bg: `${GRN}18`  },
};

function statusStyle(s) {
  return STATUS_COLORS[s] || { fg: CY, bg: `${CY}12` };
}

function fmtDate(ts_ms) {
  if (!ts_ms) return "—";
  try {
    return new Date(ts_ms).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch (_) { return String(ts_ms); }
}

function fmtAge(ts_ms) {
  if (!ts_ms) return "";
  const ms = Date.now() - ts_ms;
  const m = Math.floor(ms / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const TABS = ["all", "open", "investigating", "closed"];

function CaseRow({ item, selected, onClick }) {
  const sc = statusStyle(item.status);
  const noteCount   = Array.isArray(item.notes) ? item.notes.length : 0;
  const entityCount = Array.isArray(item.entity_ids) ? item.entity_ids.length : 0;
  return (
    <div
      onClick={() => onClick(item)}
      style={{
        padding: "8px 10px",
        background: selected ? `${CY}12` : "transparent",
        border: `1px solid ${selected ? CY + "44" : CY + "15"}`,
        borderRadius: 6,
        marginBottom: 4,
        cursor: "pointer",
        transition: "background 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
        <span style={{ fontSize: 8, color: "#6E8AA0", minWidth: 24 }}>#{item.id}</span>
        <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1, fontWeight: selected ? "bold" : "normal" }}>
          {item.title}
        </span>
        <span style={{
          fontSize: 8, padding: "1px 6px",
          background: sc.bg, border: `1px solid ${sc.fg}44`,
          borderRadius: 4, color: sc.fg, letterSpacing: 1,
        }}>
          {(item.status || "open").toUpperCase()}
        </span>
      </div>
      <div style={{ display: "flex", gap: 10, fontSize: 8, color: "#6E8AA0" }}>
        <span>{fmtAge(item.created_ts)}</span>
        {noteCount > 0 && <span style={{ color: `${PURP}99` }}>◉ {noteCount} note{noteCount !== 1 ? "s" : ""}</span>}
        {entityCount > 0 && <span style={{ color: `${CY}88` }}>⬡ {entityCount} entity{entityCount !== 1 ? "ies" : ""}</span>}
      </div>
    </div>
  );
}

function CaseDetail({ caseId, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  useEffect(() => {
    setLoading(true); setError(null);
    fetchCase(caseId)
      .then(d => { setDetail(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [caseId]);

  if (loading) return (
    <div style={{ padding: "14px", color: `${CY}88`, fontSize: 10 }}>Loading case #{caseId}…</div>
  );
  if (error) return (
    <div style={{ padding: "14px" }}>
      <span style={{ color: RED, fontSize: 10 }}>{error}</span>
    </div>
  );
  if (!detail) return null;

  const sc = statusStyle(detail.status);
  const notes  = Array.isArray(detail.notes) ? detail.notes : [];
  const entities = Array.isArray(detail.entity_ids) ? detail.entity_ids : [];

  return (
    <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={onClose} style={{
          background: "transparent", border: `1px solid ${CY}33`,
          color: CY, borderRadius: 4, padding: "2px 7px", fontSize: 9, cursor: "pointer",
        }}>← back</button>
        <span style={{ fontSize: 9, color: "#6E8AA0" }}>Case #{detail.id}</span>
        <span style={{
          marginLeft: "auto", fontSize: 8, padding: "1px 6px",
          background: sc.bg, border: `1px solid ${sc.fg}44`,
          borderRadius: 4, color: sc.fg, letterSpacing: 1,
        }}>
          {(detail.status || "open").toUpperCase()}
        </span>
      </div>

      <div style={{ fontSize: 12, color: "#DCEBF5", fontWeight: "bold", lineHeight: 1.4 }}>
        {detail.title}
      </div>
      <div style={{ fontSize: 8, color: "#6E8AA0" }}>
        Created {fmtDate(detail.created_ts)}
      </div>

      {entities.length > 0 && (
        <section>
          <div style={{ fontSize: 9, color: `${CY}88`, letterSpacing: 2, marginBottom: 5 }}>
            ENTITIES ({entities.length})
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {entities.map(eid => (
              <span key={eid} style={{
                fontSize: 8, padding: "2px 7px",
                background: `${CY}0a`, border: `1px solid ${CY}33`,
                borderRadius: 4, color: CY,
              }}>{eid}</span>
            ))}
          </div>
        </section>
      )}

      <section>
        <div style={{ fontSize: 9, color: `${CY}88`, letterSpacing: 2, marginBottom: 5 }}>
          NOTES ({notes.length})
        </div>
        {notes.length === 0 ? (
          <div style={{ fontSize: 9, color: "#6E8AA0" }}>No notes on this case.</div>
        ) : (
          notes.slice().reverse().map((n, i) => (
            <div key={i} style={{
              padding: "6px 8px",
              background: `${PURP}08`,
              border: `1px solid ${PURP}22`,
              borderRadius: 5, marginBottom: 4,
            }}>
              <div style={{ fontSize: 8, color: `${PURP}99`, marginBottom: 3 }}>
                {n.by || "system"} · {fmtDate(n.ts)}
              </div>
              <div style={{ fontSize: 10, color: "#DCEBF5", lineHeight: 1.5 }}>{n.text}</div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

export default function OpsCasesPanel() {
  const [open, setOpen]         = useState(false);
  const [tab, setTab]           = useState("all");
  const [cases, setCases]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const timerRef = useRef(null);

  const refresh = useCallback(async (statusFilter) => {
    setLoading(true); setError(null);
    try {
      const data = await fetchCases(statusFilter);
      setCases(data?.items || []);
    } catch (e) {
      setError("Case database unreachable.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) refresh(tab);
  }, [open, tab, refresh]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => refresh(tab), POLL);
    return () => clearInterval(timerRef.current);
  }, [open, tab, refresh]);

  useEffect(() => {
    const onToggle = () => { setOpen(v => !v); setSelectedId(null); };
    window.addEventListener("jarvis:ops-cases-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ops-cases-toggle", onToggle);
  }, []);

  const openCount = cases.filter(c => c.status === "open").length;
  const hasCritical = openCount > 0;

  return (
    <>
      {/* Bottom-strip toggle */}
      <button
        onClick={() => { setOpen(v => !v); setSelectedId(null); }}
        title="Ops Cases — F35 (/v1/cases)"
        style={{
          position: "fixed", bottom: 18, left: 5616, zIndex: 60,
          background: open ? `${CY}22` : "rgba(5,8,13,0.7)",
          border: `1px solid ${open ? CY : CY + "55"}`,
          color: open ? CY : `${CY}99`,
          borderRadius: 6, padding: "3px 9px", fontSize: 9, letterSpacing: 1.5,
          fontFamily: "'JetBrains Mono',monospace", cursor: "pointer",
          backdropFilter: "blur(6px)", whiteSpace: "nowrap",
        }}
      >
        {hasCritical && !open && (
          <span style={{
            display: "inline-block", width: 5, height: 5, background: YLW,
            borderRadius: "50%", marginRight: 4, verticalAlign: "middle",
            animation: "pulse 1.5s ease-in-out infinite",
          }} />
        )}
        ◈ CASES
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 54, left: 5616,
          width: "min(480px, 96vw)",
          maxHeight: "80vh",
          overflowY: "auto",
          background: "rgba(6,11,18,0.97)",
          border: `1px solid ${CY}44`,
          borderRadius: 12,
          boxShadow: `0 0 60px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace",
          zIndex: 62,
        }}>

          {/* Header */}
          <div style={{
            padding: "10px 14px 8px",
            borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ color: CY, fontSize: 11, fontWeight: "bold", letterSpacing: 2 }}>
              ◈ OPS CASES
            </span>
            {loading && (
              <span style={{ fontSize: 9, color: `${CY}88` }}>loading…</span>
            )}
            {!loading && (
              <span style={{ fontSize: 9, color: "#6E8AA0" }}>
                {cases.length} case{cases.length !== 1 ? "s" : ""}
              </span>
            )}
            <button onClick={() => refresh(tab)} disabled={loading} style={{
              marginLeft: "auto",
              background: "transparent", border: `1px solid ${CY}33`, color: CY,
              borderRadius: 4, padding: "2px 8px", fontSize: 9, cursor: "pointer",
              opacity: loading ? 0.5 : 1,
            }}>↺</button>
            <button onClick={() => setOpen(false)} style={{
              background: "transparent", border: "none", color: "#6E8AA0",
              fontSize: 12, cursor: "pointer", padding: "0 2px",
            }}>✕</button>
          </div>

          {/* Status filter tabs */}
          {!selectedId && (
            <div style={{
              display: "flex", gap: 0,
              borderBottom: `1px solid ${CY}18`,
              padding: "0 14px",
            }}>
              {TABS.map(t => (
                <button key={t} onClick={() => { setTab(t); setSelectedId(null); }} style={{
                  background: "transparent",
                  border: "none",
                  borderBottom: tab === t ? `2px solid ${CY}` : "2px solid transparent",
                  color: tab === t ? CY : "#6E8AA0",
                  fontSize: 8, letterSpacing: 1.5,
                  padding: "6px 10px", cursor: "pointer",
                  textTransform: "uppercase",
                }}>
                  {t}
                </button>
              ))}
            </div>
          )}

          {/* Body */}
          {selectedId ? (
            <CaseDetail
              caseId={selectedId}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <div style={{ padding: "10px 14px" }}>
              {error && (
                <div style={{ color: RED, fontSize: 10, marginBottom: 8 }}>{error}</div>
              )}
              {!loading && !error && cases.length === 0 && (
                <div style={{ fontSize: 10, color: `${CY}55`, textAlign: "center", padding: "16px 0" }}>
                  No {tab !== "all" ? tab + " " : ""}cases found.
                </div>
              )}
              {cases.map(item => (
                <CaseRow
                  key={item.id}
                  item={item}
                  selected={item.id === selectedId}
                  onClick={c => setSelectedId(c.id)}
                />
              ))}
            </div>
          )}

          {/* Footer */}
          <div style={{
            padding: "6px 14px 10px",
            borderTop: `1px solid ${CY}11`,
            fontSize: 8, color: "#6E8AA0",
            display: "flex", justifyContent: "space-between",
          }}>
            <span>auto-refresh every 60 s</span>
            <span style={{ color: GRN }}>◉ /v1/cases</span>
          </div>
        </div>
      )}
    </>
  );
}
