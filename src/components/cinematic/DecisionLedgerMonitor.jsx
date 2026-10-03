/**
 * DecisionLedgerMonitor — F237.
 *
 * Data sources:
 *   GET /v1/decision/list?limit=50
 *       → {items:[{id, kind, title, frontmatter:{state,review_at,actual_outcome,score,created_at},
 *                  body_md, created_ts, updated_ts}]}
 *
 * Displays:
 *   - Stat tiles: total / final / reviewed / draft
 *   - Filter tabs: ALL | DRAFT | FINAL | REVIEWED + text search
 *   - Expand row → body_md preview + score bar (if reviewed)
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle: ⊟ DLGR at left:110160, bottom:8, zIndex:117.
 * Amber badge = any DRAFT decisions pending; green badge = count if all clean.
 * 90 s auto-refresh.
 *
 * Exported helpers for JarvisBrain:
 *   isDlgrQuery(q) / buildDlgrScript()
 *
 * Voice triggers: "decision ledger / dlgr / decisions / decision log /
 *   decision record / which decisions / decision review / decision audit /
 *   finalized decisions / draft decisions / decision history"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#4ADE80";
const GRAY  = "#4E6070";
const PURP  = "#B06EFF";
const TEAL  = "#2DD4BF";

const BTN_LEFT   = 110160;
const REFRESH_MS = 90_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── state helpers ────────────────────────────────────────────────────────────

const STATE_COLOR = {
  draft:    AMBER,
  final:    TEAL,
  reviewed: GREEN,
};

const STATE_ICON = {
  draft:    "◌",
  final:    "◆",
  reviewed: "✓",
};

function stateColor(s) {
  return STATE_COLOR[s] ?? GRAY;
}

function relAge(epochMs) {
  if (!epochMs) return "–";
  const s = Math.floor((Date.now() - epochMs) / 1000);
  if (s < 0) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function excerpt(bodyMd, max = 220) {
  if (!bodyMd) return "";
  const plain = bodyMd.replace(/^#+\s*/gm, "").replace(/\n+/g, " ").trim();
  return plain.length > max ? plain.slice(0, max) + "…" : plain;
}

// ─── fetch ────────────────────────────────────────────────────────────────────

async function fetchDecisions() {
  const r = await fetch(
    `${apiBase()}/v1/decision/list?limit=50`,
    { headers: { Authorization: `Bearer ${API_KEY}` } },
  );
  if (!r.ok) throw new Error(`decisions ${r.status}`);
  return r.json();
}

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

const DLGR_RE =
  /\b(decision.?ledger|dlgr|decisions?|decision.?log|decision.?record|which.?decision|decision.?review|decision.?audit|finali[sz]ed.?decision|draft.?decision|decision.?histor|decision.?track|decision.?board)\b/i;

export function isDlgrQuery(q) {
  return DLGR_RE.test(q || "");
}

export async function buildDlgrScript() {
  try {
    const d = await fetchDecisions();
    window.dispatchEvent(new CustomEvent("jarvis:dlgr-toggle"));
    const items  = d?.items ?? [];
    const total  = items.length;
    const drafts = items.filter((i) => i.frontmatter?.state === "draft").length;
    const finals = items.filter((i) => i.frontmatter?.state === "final").length;
    const revd   = items.filter((i) => i.frontmatter?.state === "reviewed").length;
    if (total === 0) {
      return "Decision Ledger is empty, sir. No decisions on record yet. You may log a new decision via the API at any time.";
    }
    if (drafts > 0) {
      return (
        `Decision Ledger — ${drafts} decision${drafts > 1 ? "s" : ""} still in DRAFT status, sir, requiring finalisation. ` +
        `Of ${total} total decisions: ${finals} finalised, ${revd} reviewed. I recommend finalising pending items before committing to subsequent actions.`
      );
    }
    const avgScore = revd > 0
      ? (items
          .filter((i) => i.frontmatter?.state === "reviewed" && i.frontmatter?.score != null)
          .reduce((s, i) => s + (i.frontmatter.score || 0), 0) / revd)
          .toFixed(2)
      : null;
    const scorePart = avgScore ? ` Average decision quality score: ${avgScore}/1.0.` : "";
    return (
      `Decision Ledger standing by, sir. ${total} decisions logged: ${finals} finalised, ${revd} reviewed, ${drafts} pending.${scorePart} All decisions are accounted for.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:dlgr-toggle"));
    return "Decision Ledger open, sir.";
  }
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatTile({ label, value, color }) {
  return (
    <div
      style={{
        flex: 1,
        background: "rgba(41,231,255,0.04)",
        border: `1px solid ${CY}22`,
        borderRadius: 7,
        padding: "7px 10px",
        textAlign: "center",
      }}
    >
      <div style={{ color: color ?? CY, fontSize: 15, fontWeight: 700, letterSpacing: 1 }}>
        {value ?? "–"}
      </div>
      <div style={{ color: GRAY, fontSize: 8, letterSpacing: 1, marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

function ScoreBar({ score }) {
  if (score == null) return null;
  const pct = Math.round(score * 100);
  const col = score >= 0.7 ? GREEN : score >= 0.4 ? AMBER : "#F87171";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
      <span style={{ color: GRAY, fontSize: 8, whiteSpace: "nowrap" }}>QUALITY</span>
      <div
        style={{
          flex: 1,
          height: 4,
          background: `${GRAY}33`,
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: col,
            borderRadius: 2,
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <span style={{ color: col, fontSize: 8 }}>{pct}%</span>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function DecisionLedgerMonitor() {
  const [visible,    setVisible]    = useState(false);
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [tab,        setTab]        = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:dlgr-toggle", onToggle);
    return () => window.removeEventListener("jarvis:dlgr-toggle", onToggle);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchDecisions();
      setData(d);
    } catch {
      // retain stale data on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [visible, load]);

  const items    = data?.items ?? [];
  const total    = items.length;
  const drafts   = items.filter((i) => i.frontmatter?.state === "draft").length;
  const finals   = items.filter((i) => i.frontmatter?.state === "final").length;
  const reviewed = items.filter((i) => i.frontmatter?.state === "reviewed").length;

  const badgeColor = drafts > 0 ? AMBER : total > 0 ? GREEN : null;
  const badgeVal   = drafts > 0 ? `${drafts} DRAFT` : total > 0 ? `${total}` : null;

  const filtered = items.filter((item) => {
    const state = item.frontmatter?.state ?? "draft";
    if (tab === "DRAFT"    && state !== "draft")    return false;
    if (tab === "FINAL"    && state !== "final")    return false;
    if (tab === "REVIEWED" && state !== "reviewed") return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (item.title || "").toLowerCase().includes(q) ||
        (item.body_md || "").toLowerCase().includes(q) ||
        state.includes(q)
      );
    }
    return true;
  });

  async function handleAssess() {
    setAssessing(true);
    try {
      const context = `total=${total}, drafts=${drafts}, finalized=${finals}, reviewed=${reviewed}`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message: `Interpret this Decision Ledger snapshot in 2 sentences: ${context}. Focus on decision governance health and recommended next action.`,
        }),
      });
      const d = await r.json();
      const text = d.response || d.reply || d.message || "Assessment complete.";
      setAssessment(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setAssessment("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        style={{
          position: "fixed",
          bottom: 8,
          left: `min(${BTN_LEFT}px, calc(100vw - 115px))`,
          zIndex: 117,
          background: visible ? `${CY}22` : "rgba(5,10,18,0.82)",
          border: `1px solid ${visible ? CY : CY + "55"}`,
          borderRadius: 6,
          padding: "3px 9px",
          color: visible ? CY : CY + "AA",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 10,
          letterSpacing: 1,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ⊟ DLGR
        {badgeVal != null && (
          <span
            style={{
              marginLeft: 5,
              background: badgeColor + "33",
              border: `1px solid ${badgeColor}66`,
              borderRadius: 3,
              padding: "0 4px",
              color: badgeColor,
              fontSize: 9,
            }}
          >
            {badgeVal}
          </span>
        )}
      </button>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position: "fixed",
            bottom: 38,
            left: `min(${BTN_LEFT - 370}px, calc(100vw - 500px))`,
            width: 470,
            maxHeight: "76vh",
            overflowY: "auto",
            zIndex: 118,
            background: "rgba(5,10,18,0.97)",
            border: `1px solid ${CY}44`,
            borderRadius: 12,
            fontFamily: "'JetBrains Mono',monospace",
            boxShadow: `0 0 60px ${CY}18, 0 20px 40px rgba(0,0,0,0.8)`,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderBottom: `1px solid ${CY}33`,
            }}
          >
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>
              ⊟ DECISION LEDGER
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {loading && <span style={{ color: GRAY, fontSize: 9 }}>◌</span>}
              <button
                onClick={handleAssess}
                disabled={assessing || !data}
                style={{
                  background: assessing ? "#1A2030" : `${CY}18`,
                  border: `1px solid ${CY}44`,
                  borderRadius: 5,
                  padding: "2px 8px",
                  color: assessing ? GRAY : CY,
                  fontSize: 9,
                  letterSpacing: 1,
                  cursor: assessing || !data ? "default" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {assessing ? "◌ ASSESSING" : "▶ ASSESS"}
              </button>
              <button
                onClick={() => setVisible(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: GRAY,
                  cursor: "pointer",
                  fontSize: 14,
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Stat tiles */}
          {data && (
            <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
              <StatTile label="TOTAL"    value={total}    color={CY} />
              <StatTile label="FINAL"    value={finals}   color={TEAL} />
              <StatTile label="REVIEWED" value={reviewed} color={GREEN} />
              <StatTile label="DRAFT"    value={drafts}   color={drafts > 0 ? AMBER : GRAY} />
            </div>
          )}

          {/* Filter tabs */}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "0 12px 8px",
              borderBottom: `1px solid ${CY}22`,
            }}
          >
            {["ALL", "DRAFT", "FINAL", "REVIEWED"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "transparent",
                  border: `1px solid ${tab === t ? CY + "88" : CY + "22"}`,
                  borderRadius: 4,
                  padding: "2px 7px",
                  color: tab === t ? CY : GRAY,
                  fontSize: 9,
                  letterSpacing: 1,
                  cursor: "pointer",
                  fontFamily: "inherit",
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
                marginLeft: "auto",
                background: "rgba(41,231,255,0.06)",
                border: `1px solid ${CY}22`,
                borderRadius: 4,
                padding: "2px 8px",
                color: CY,
                fontSize: 9,
                fontFamily: "inherit",
                width: 100,
                outline: "none",
              }}
            />
          </div>

          {/* Assessment */}
          {assessment && (
            <div
              style={{
                margin: "8px 12px",
                padding: "7px 10px",
                background: `${CY}0A`,
                border: `1px solid ${CY}33`,
                borderRadius: 6,
                color: CY,
                fontSize: 9,
                lineHeight: 1.5,
              }}
            >
              {assessment}
            </div>
          )}

          {/* Decision list */}
          {!data && loading && (
            <div style={{ color: GRAY, fontSize: 9, padding: 16, textAlign: "center" }}>
              ◌ LOADING…
            </div>
          )}
          {data && filtered.length === 0 && (
            <div style={{ color: GRAY, fontSize: 9, padding: 16, textAlign: "center" }}>
              No decisions match the current filter.
            </div>
          )}
          {filtered.map((item) => {
            const state = item.frontmatter?.state ?? "draft";
            const sc    = stateColor(state);
            const icon  = STATE_ICON[state] ?? "◌";
            const isOpen = expanded === item.id;
            const score  = item.frontmatter?.score ?? null;
            const createdAt = item.frontmatter?.created_at ?? item.created_ts ?? null;
            return (
              <div key={item.id} style={{ borderBottom: `1px solid ${CY}18` }}>
                {/* Row */}
                <div
                  onClick={() => setExpanded(isOpen ? null : item.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 12px",
                    cursor: "pointer",
                    background: isOpen ? `${CY}08` : "transparent",
                    transition: "background 0.15s",
                  }}
                >
                  <span style={{ color: sc, fontSize: 10, minWidth: 14 }}>{icon}</span>
                  <span
                    style={{
                      color: sc,
                      fontSize: 8,
                      minWidth: 62,
                      letterSpacing: 0.5,
                    }}
                  >
                    {state.toUpperCase()}
                  </span>
                  <span
                    style={{
                      color: CY,
                      fontSize: 9,
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.title || "(untitled)"}
                  </span>
                  <span style={{ color: GRAY, fontSize: 8, whiteSpace: "nowrap" }}>
                    {relAge(createdAt)}
                  </span>
                  {score != null && (
                    <span
                      style={{
                        color: score >= 0.7 ? GREEN : score >= 0.4 ? AMBER : "#F87171",
                        fontSize: 8,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {Math.round(score * 100)}%
                    </span>
                  )}
                  <span style={{ color: GRAY, fontSize: 10 }}>{isOpen ? "▲" : "▼"}</span>
                </div>

                {/* Expand: body preview + score */}
                {isOpen && (
                  <div
                    style={{
                      padding: "8px 14px 10px",
                      background: "rgba(41,231,255,0.03)",
                      borderTop: `1px solid ${CY}14`,
                    }}
                  >
                    <div
                      style={{
                        color: GRAY,
                        fontSize: 8,
                        lineHeight: 1.6,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {excerpt(item.body_md) || "(no body)"}
                    </div>
                    {item.frontmatter?.actual_outcome && (
                      <div
                        style={{
                          marginTop: 6,
                          padding: "4px 8px",
                          background: `${GREEN}0A`,
                          border: `1px solid ${GREEN}33`,
                          borderRadius: 4,
                          color: GREEN,
                          fontSize: 8,
                          lineHeight: 1.5,
                        }}
                      >
                        <span style={{ color: GRAY, marginRight: 4 }}>OUTCOME:</span>
                        {item.frontmatter.actual_outcome}
                      </div>
                    )}
                    <ScoreBar score={score} />
                    <div
                      style={{
                        marginTop: 5,
                        color: GRAY,
                        fontSize: 7,
                        letterSpacing: 0.5,
                      }}
                    >
                      ID: {item.id}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Footer */}
          {data && (
            <div
              style={{
                textAlign: "right",
                padding: "4px 12px",
                color: GRAY,
                fontSize: 8,
                borderTop: `1px solid ${CY}18`,
              }}
            >
              live · {total} decision{total !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      )}
    </>
  );
}
