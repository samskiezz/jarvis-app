/**
 * IntentInbox — F247.
 *
 * Data sources (all real — backed by server/routes/intent_inbox.py):
 *   GET  /v1/intent/list           → {items:[{id,kind,title,body_md,
 *                                     frontmatter:{state,source,captured_at},
 *                                     confidence,created_at,updated_at}]}
 *   POST /v1/intent/capture        → {ok, intent:{...}}
 *   POST /v1/intent/{id}/state     → {ok, intent:{...}}
 *   POST /v1/intent/{id}/convert   → {ok, target:{...}}
 *
 * Displays:
 *   - Stat tiles: total / raw / ready / converted
 *   - ALL / RAW / READY / CONVERTED filter tabs + text search
 *   - Expand row → source/captured_at/body excerpt + MARK READY / CONVERT actions
 *   - + CAPTURE inline form → POST /v1/intent/capture
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle: ⊕ INBX at left:155760, bottom:8, zIndex:127.
 * Badge: amber = any raw intents; green = total count.
 * 60 s auto-refresh.
 *
 * Exported helpers for JarvisBrain:
 *   isInbxQuery(q) / buildInbxScript()
 *
 * Voice triggers: "intent inbox / raw ideas / capture intent / convert intent /
 *   idea inbox / inbx / intent list / new intents / pending intents / idea queue /
 *   intent to task / intent to spec"
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
const PU   = "#A78BFA";

const BTN_LEFT   = 155760;
const REFRESH_MS = 60_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const INBX_RE =
  /\b(intent\s*inbox|raw\s*ideas?|capture\s*intent|convert\s*intent|idea\s*inbox|inbx|intent\s*list|new\s*intents?|pending\s*intents?|idea\s*queue|intent\s*to\s*task|intent\s*to\s*spec)\b/i;

export function isInbxQuery(t) {
  return INBX_RE.test(t || "");
}

export async function buildInbxScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/intent/list`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    const items = d?.items || [];
    if (items.length === 0) {
      return "Intent inbox is empty. Use the INBX panel or POST /v1/intent/capture to log a raw idea.";
    }
    const raw       = items.filter((it) => stateOf(it) === "raw").length;
    const ready     = items.filter((it) => stateOf(it) === "ready").length;
    const converted = items.filter((it) => stateOf(it).startsWith("converted")).length;
    return `Intent inbox: ${items.length} total — ${raw} raw, ${ready} ready, ${converted} converted. ` +
      (raw > 0
        ? `${raw} unprocessed idea${raw !== 1 ? "s" : ""} awaiting triage.`
        : "No unprocessed intents pending.");
  } catch {
    return "Unable to retrieve intent inbox at this time, sir.";
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function stateOf(item) {
  return (item?.frontmatter?.state || "raw").toLowerCase();
}

function ageStr(ms) {
  if (!ms) return "–";
  const delta = Math.round((Date.now() - ms) / 1000);
  if (delta < 60)    return `${delta}s ago`;
  if (delta < 3600)  return `${Math.round(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.round(delta / 3600)}h ago`;
  return `${Math.round(delta / 86400)}d ago`;
}

const STATE_COLOR = {
  raw:  AM,
  ready: GN,
};
function stateColor(s) {
  if (s.startsWith("converted")) return CY;
  return STATE_COLOR[s] || DIM;
}

const CONVERT_TARGETS = ["task", "spec", "reminder", "decision"];

// ─── fetch helpers ────────────────────────────────────────────────────────────

async function fetchList() {
  const r = await fetch(`${apiBase()}/v1/intent/list`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function postCapture(text) {
  const r = await fetch(`${apiBase()}/v1/intent/capture`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ text, source: "ui" }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function postState(id, state) {
  const r = await fetch(`${apiBase()}/v1/intent/${id}/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ state }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function postConvert(id, target) {
  const r = await fetch(`${apiBase()}/v1/intent/${id}/convert`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ target }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function agentAssess(items) {
  const raw       = items.filter((it) => stateOf(it) === "raw").length;
  const converted = items.filter((it) => stateOf(it).startsWith("converted")).length;
  const sample    = items.slice(0, 3).map((it) => it.body_md?.slice(0, 80) || it.title).join("; ");
  const prompt    = `Intent inbox: ${items.length} total intents, ${raw} raw (unprocessed), ${converted} converted. Sample: "${sample}". Give a 2-sentence triage brief: highlight urgency and the most actionable idea. Be direct.`;
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ message: prompt }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "Assessment unavailable.";
}

// ─── stat tile ────────────────────────────────────────────────────────────────

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

// ─── intent row ───────────────────────────────────────────────────────────────

function IntentRow({ item, onRefresh }) {
  const [expanded,    setExpanded]    = useState(false);
  const [converting,  setConverting]  = useState(false);
  const [actioning,   setActioning]   = useState(false);
  const [feedback,    setFeedback]    = useState(null);

  const state  = stateOf(item);
  const sc     = stateColor(state);
  const cap    = item.frontmatter?.captured_at;
  const source = item.frontmatter?.source || "–";
  const body   = item.body_md || item.title || "–";
  const excerpt = body.length > 120 ? body.slice(0, 120) + "…" : body;

  async function handleMarkReady() {
    if (actioning) return;
    setActioning(true); setFeedback(null);
    try {
      await postState(item.id, "ready");
      setFeedback("Marked ready.");
      onRefresh();
    } catch {
      setFeedback("Failed to update state.");
    }
    setActioning(false);
  }

  async function handleConvert(target) {
    if (actioning) return;
    setActioning(true); setFeedback(null);
    try {
      const d = await postConvert(item.id, target);
      if (d?.ok) {
        setFeedback(`Converted to ${target}.`);
        onRefresh();
      } else {
        setFeedback(d?.detail || "Conversion failed.");
      }
    } catch {
      setFeedback("Conversion error.");
    }
    setActioning(false);
  }

  return (
    <div style={{ borderBottom: `1px solid ${CY}11` }}>
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "7px 12px", cursor: "pointer",
        }}
      >
        <span style={{
          fontSize: 7, letterSpacing: 1, color: sc,
          border: `1px solid ${sc}55`, padding: "1px 5px", borderRadius: 3,
          minWidth: 56, textAlign: "center", flexShrink: 0,
        }}>
          {state.toUpperCase().slice(0, 12)}
        </span>
        <span style={{ fontSize: 9, color: "#C0D0DC", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {excerpt}
        </span>
        <span style={{ fontSize: 7, color: DIM, flexShrink: 0 }}>{ageStr(cap)}</span>
        <span style={{ fontSize: 8, color: DIM }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div style={{ padding: "8px 14px 12px 14px", background: `${AM}05` }}>
          <div style={{ fontSize: 8, color: DIM, marginBottom: 4 }}>
            SOURCE: <span style={{ color: CY }}>{source.toUpperCase()}</span>
            &nbsp;&nbsp;
            ID: <span style={{ color: DIM }}>{item.id}</span>
          </div>
          <div style={{
            fontSize: 9, color: "#C0D0DC", lineHeight: 1.55,
            padding: "6px 8px", background: `${CY}06`,
            border: `1px solid ${CY}11`, borderRadius: 5, marginBottom: 8,
          }}>
            {body.slice(0, 300)}{body.length > 300 ? "…" : ""}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {state === "raw" && (
              <button
                onClick={handleMarkReady}
                disabled={actioning}
                style={{
                  background: `${GN}11`, border: `1px solid ${GN}55`, color: GN,
                  fontSize: 8, letterSpacing: 1, padding: "3px 10px",
                  borderRadius: 5, cursor: actioning ? "not-allowed" : "pointer",
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                ✓ MARK READY
              </button>
            )}
            {!state.startsWith("converted") && (
              <>
                <span style={{ fontSize: 7, color: DIM }}>CONVERT →</span>
                {CONVERT_TARGETS.map((t) => (
                  <button
                    key={t}
                    onClick={() => handleConvert(t)}
                    disabled={actioning}
                    style={{
                      background: `${PU}11`, border: `1px solid ${PU}44`, color: PU,
                      fontSize: 8, letterSpacing: 1, padding: "3px 8px",
                      borderRadius: 4, cursor: actioning ? "not-allowed" : "pointer",
                      fontFamily: "'JetBrains Mono',monospace",
                      textTransform: "uppercase",
                    }}
                  >
                    {t}
                  </button>
                ))}
              </>
            )}
          </div>
          {feedback && (
            <div style={{ marginTop: 6, fontSize: 8, color: GN }}>{feedback}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

const TABS = ["ALL", "RAW", "READY", "CONVERTED"];

export default function IntentInbox() {
  const [open,       setOpen]       = useState(false);
  const [items,      setItems]      = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [tab,        setTab]        = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [assessing,  setAssessing]  = useState(false);
  const [dossier,    setDossier]    = useState(null);
  const [capturing,  setCapturing]  = useState(false);
  const [captureText, setCaptureText] = useState("");
  const [captureMsg, setCaptureMsg] = useState(null);

  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchList();
      setItems(d?.items || []);
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
      if (INBX_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:inbx-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:inbx-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  async function handleAssess() {
    if (assessing || items.length === 0) return;
    setAssessing(true); setDossier(null);
    try {
      const text = await agentAssess(items);
      setDossier(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {
      setDossier("Assessment unavailable.");
    }
    setAssessing(false);
  }

  async function handleCapture() {
    if (!captureText.trim() || capturing) return;
    setCapturing(true); setCaptureMsg(null);
    try {
      const d = await postCapture(captureText.trim());
      if (d?.ok) {
        setCaptureMsg("Captured.");
        setCaptureText("");
        load();
      } else {
        setCaptureMsg(d?.error || "Capture failed.");
      }
    } catch {
      setCaptureMsg("Capture error.");
    }
    setCapturing(false);
  }

  const total     = items.length;
  const rawCount  = items.filter((it) => stateOf(it) === "raw").length;
  const readyCount = items.filter((it) => stateOf(it) === "ready").length;
  const convCount = items.filter((it) => stateOf(it).startsWith("converted")).length;

  const badgeColor = rawCount > 0 ? AM : total > 0 ? GN : DIM;

  const filtered = items.filter((it) => {
    const s = stateOf(it);
    const matchTab =
      tab === "ALL" ||
      (tab === "RAW" && s === "raw") ||
      (tab === "READY" && s === "ready") ||
      (tab === "CONVERTED" && s.startsWith("converted"));
    if (!matchTab) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (it.body_md || "").toLowerCase().includes(q) ||
      (it.title  || "").toLowerCase().includes(q)
    );
  });

  return (
    <>
      {/* ── toggle button ──────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Intent Inbox"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 127,
          background: "rgba(5,10,18,0.82)", border: `1px solid ${AM}55`,
          color: AM, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1, padding: "3px 8px",
          borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        ⊕ INBX
        {total > 0 && (
          <span style={{
            marginLeft: 5, background: badgeColor,
            color: "#000", borderRadius: 3, padding: "0 4px", fontSize: 8,
          }}>
            {rawCount > 0 ? rawCount : total}
          </span>
        )}
      </button>

      {/* ── panel ──────────────────────────────────────────────────────── */}
      {open && (
        <div style={{
          position: "fixed", top: 60, right: 18, zIndex: 128,
          width: "min(500px, 94vw)", maxHeight: "82vh",
          background: "rgba(5,10,18,0.96)",
          border: `1px solid ${AM}44`, borderRadius: 14,
          display: "flex", flexDirection: "column",
          boxShadow: `0 0 60px ${AM}14, 0 24px 48px rgba(0,0,0,0.8)`,
          fontFamily: "'JetBrains Mono',monospace",
        }}>
          {/* Header */}
          <div style={{
            padding: "12px 16px", borderBottom: `1px solid ${AM}22`,
            display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
          }}>
            <span style={{ color: AM, fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>
              ⊕ INTENT INBOX
            </span>
            {loading && (
              <span style={{ fontSize: 8, color: DIM, letterSpacing: 1 }}>POLLING…</span>
            )}
            <div style={{ flex: 1 }} />
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, fontSize: 14, cursor: "pointer", lineHeight: 1 }}
            >×</button>
          </div>

          {/* Scrollable body */}
          <div style={{ overflowY: "auto", flex: 1, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Stat tiles */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Tile label="TOTAL"     value={total}      color={CY}  />
              <Tile label="RAW"       value={rawCount}   color={AM}  />
              <Tile label="READY"     value={readyCount} color={GN}  />
              <Tile label="CONVERTED" value={convCount}  color={PU}  />
            </div>

            {/* Capture form */}
            <div style={{
              border: `1px solid ${AM}33`, borderRadius: 8,
              padding: "10px 12px", background: `${AM}06`,
            }}>
              <div style={{ fontSize: 8, color: AM, letterSpacing: 1, marginBottom: 6 }}>+ CAPTURE INTENT</div>
              <textarea
                value={captureText}
                onChange={(e) => setCaptureText(e.target.value)}
                placeholder="Describe a raw idea, thought, or task seed…"
                rows={3}
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: `${CY}08`, border: `1px solid ${CY}22`,
                  color: "#C0D0DC", fontSize: 9, padding: "6px 8px",
                  borderRadius: 5, resize: "vertical", outline: "none",
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <button
                  onClick={handleCapture}
                  disabled={capturing || !captureText.trim()}
                  style={{
                    background: capturing ? `${AM}22` : `${AM}11`,
                    border: `1px solid ${AM}55`, color: AM,
                    fontSize: 8, letterSpacing: 1, padding: "4px 12px",
                    borderRadius: 5, cursor: (capturing || !captureText.trim()) ? "not-allowed" : "pointer",
                    fontFamily: "'JetBrains Mono',monospace",
                    opacity: !captureText.trim() ? 0.5 : 1,
                  }}
                >
                  {capturing ? "SAVING…" : "▶ CAPTURE"}
                </button>
                {captureMsg && (
                  <span style={{ fontSize: 8, color: GN }}>{captureMsg}</span>
                )}
              </div>
            </div>

            {/* Filter tabs + search */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 4 }}>
                {TABS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    style={{
                      background: tab === t ? `${AM}22` : "transparent",
                      border: `1px solid ${tab === t ? AM : DIM}`,
                      color: tab === t ? AM : DIM,
                      fontSize: 8, letterSpacing: 1, padding: "3px 8px",
                      borderRadius: 4, cursor: "pointer",
                      fontFamily: "'JetBrains Mono',monospace",
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="search intents…"
                style={{
                  background: `${CY}08`, border: `1px solid ${CY}22`,
                  color: "#C0D0DC", fontSize: 9, padding: "5px 8px",
                  borderRadius: 5, outline: "none",
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              />
            </div>

            {/* Intent rows */}
            {filtered.length > 0 && (
              <div style={{ border: `1px solid ${AM}22`, borderRadius: 8, overflow: "hidden" }}>
                <div style={{
                  fontSize: 9, color: AM, letterSpacing: 2,
                  padding: "6px 12px", borderBottom: `1px solid ${AM}11`,
                }}>
                  INTENTS ({filtered.length})
                </div>
                {filtered.map((it) => (
                  <IntentRow key={it.id} item={it} onRefresh={load} />
                ))}
              </div>
            )}

            {filtered.length === 0 && !loading && (
              <div style={{ fontSize: 9, color: DIM, textAlign: "center", padding: "24px 0" }}>
                {total === 0
                  ? "No intents captured yet. Use + CAPTURE above."
                  : "No intents match the current filter."}
              </div>
            )}

            {/* ASSESS */}
            <div style={{ marginTop: 4 }}>
              <button
                onClick={handleAssess}
                disabled={assessing || items.length === 0}
                style={{
                  background: assessing ? `${AM}22` : `${AM}11`,
                  border: `1px solid ${AM}55`, color: AM,
                  fontSize: 9, letterSpacing: 1, padding: "5px 14px",
                  borderRadius: 6,
                  cursor: (assessing || items.length === 0) ? "not-allowed" : "pointer",
                  fontFamily: "'JetBrains Mono',monospace",
                  opacity: items.length === 0 ? 0.4 : 1,
                }}
              >
                {assessing ? "▸ ASSESSING…" : "▶ ASSESS"}
              </button>
              {dossier && (
                <div style={{
                  marginTop: 8, padding: 10,
                  background: `${AM}08`, border: `1px solid ${AM}22`,
                  borderRadius: 6, fontSize: 10, color: "#C0D0DC", lineHeight: 1.6,
                }}>
                  {dossier}
                </div>
              )}
            </div>

            {/* footer count */}
            <div style={{ fontSize: 7, color: `${DIM}88`, textAlign: "right" }}>
              {total} intent{total !== 1 ? "s" : ""} · 60 s refresh
            </div>
          </div>
        </div>
      )}
    </>
  );
}
