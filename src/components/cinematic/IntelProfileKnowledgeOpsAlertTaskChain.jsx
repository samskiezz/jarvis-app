/**
 * F182 IntelProfile × Knowledge × Ops Alert × Task
 * Intelligence Activation Chain — ◈ IKOATC
 *
 * Fetches: /entities/IntelProfile + /knowledge/ + /v1/ops/alerts + /entities/Task
 * Classifies each intel profile by keyword overlap across all 3 external sources:
 *   ACTIVATED — matched all 3 (knowledge + ops alert + task)
 *   ALERTED   — matched ops alert but missing knowledge or task
 *   DOCUMENTED— matched knowledge but no ops alert + no task
 *   DARK      — zero matches (dormant intel profiles with no knowledge article,
 *                no ops alert, no task assignment)
 * Red pulse on DARK count.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */

import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CYAN  = "#29E7FF";
const GREEN = "#00FF88";
const AMBER = "#FFB347";
const RED   = "#FF3B6B";

const CLS_COLOR = { ACTIVATED: GREEN, ALERTED: RED, DOCUMENTED: AMBER, DARK: "#6a7a8a" };
const CLS_ORDER = { ACTIVATED: 4, ALERTED: 3, DOCUMENTED: 2, DARK: 1 };

const IKOATC_RE = /\b(ikoatc|intel.profile.knowledge|intel.activation.chain|intel.ops.alert|intel.task.chain|dormant.intel|intel.profile.dark|knowledge.ops.intel|intel.knowledge.alert|intel.knowledge.task|intel.activation|profile.activation.chain|intelligence.activation)\b/i;

export function isIkoatcQuery(q) { return IKOATC_RE.test(q || ""); }

export function buildIkoatcScript(rows) {
  const total     = rows.length;
  const activated = rows.filter(r => r.cls === "ACTIVATED").length;
  const dark      = rows.filter(r => r.cls === "DARK").length;
  return (
    `Intelligence Activation Chain: ${total} intel profile${total !== 1 ? "s" : ""} assessed across knowledge, ops alerts, and tasks. ` +
    `${activated} fully activated (knowledge + ops alert + task grounding). ` +
    (dark > 0
      ? `${dark} DARK — no knowledge article, no ops alert, no task assignment. These profiles are dormant intelligence assets with zero operational activation — immediate grounding required.`
      : "No dark profiles detected. All intel profiles have at least one activation source.")
  );
}

function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  const bToks = new Set(tokens(bStr));
  return aToks.some(t => bToks.has(t));
}

function normalizeArray(raw, keys) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.data)    ? raw.data
    : Array.isArray(raw?.items)   ? raw.items
    : Array.isArray(raw?.results) ? raw.results
    : Array.isArray(raw?.articles) ? raw.articles
    : [];
  return arr.map(item => {
    let label = "";
    for (const k of keys) if (item[k]) { label = String(item[k]); break; }
    return { ...item, _label: label };
  });
}

async function fetcher(path) {
  try {
    const r = await fetch(`${apiBase()}${path}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    return r.ok ? r.json() : [];
  } catch { return []; }
}

function classify(hasKnowledge, hasAlert, hasTask) {
  const all = hasKnowledge && hasAlert && hasTask;
  if (all) return "ACTIVATED";
  if (hasAlert) return "ALERTED";
  if (hasKnowledge) return "DOCUMENTED";
  return "DARK";
}

async function loadData() {
  const [profilesRaw, knowledgeRaw, alertsRaw, tasksRaw] = await Promise.all([
    fetcher("/entities/IntelProfile"),
    fetcher("/knowledge/"),
    fetcher("/v1/ops/alerts"),
    fetcher("/entities/Task"),
  ]);

  const profiles  = normalizeArray(profilesRaw,  ["name", "profile_name", "title", "label", "id"]);
  const knowledge = normalizeArray(knowledgeRaw,  ["title", "name", "article_title", "subject", "label", "id"]);
  const alerts    = normalizeArray(alertsRaw,     ["title", "name", "alert_name", "message", "label", "id"]);
  const tasks     = normalizeArray(tasksRaw,      ["title", "name", "task_name", "subject", "label", "id"]);

  return profiles.map(profile => {
    const pToks = tokens(
      profile._label + " " +
      (profile.category || "") + " " +
      (profile.description || "") + " " +
      (profile.tags || "").toString() + " " +
      (profile.type || "")
    );

    const matchedKnowledge = knowledge.filter(k => overlaps(pToks,
      k._label + " " + (k.summary || "") + " " + (k.category || "") + " " + (k.tags || "").toString()
    ));
    const matchedAlerts = alerts.filter(a => overlaps(pToks,
      a._label + " " + (a.description || "") + " " + (a.severity || "") + " " + (a.type || "")
    ));
    const matchedTasks = tasks.filter(t => overlaps(pToks,
      t._label + " " + (t.description || "") + " " + (t.status || "") + " " + (t.type || "")
    ));

    return {
      ...profile,
      cls: classify(matchedKnowledge.length > 0, matchedAlerts.length > 0, matchedTasks.length > 0),
      matchedKnowledge,
      matchedAlerts,
      matchedTasks,
    };
  }).sort((a, b) => CLS_ORDER[b.cls] - CLS_ORDER[a.cls]);
}

const FILTERS = ["ALL", "ACTIVATED", "ALERTED", "DOCUMENTED", "DARK"];
const LEFT_PX = 150280;
const Z_IDX   = 279;

export default function IntelProfileKnowledgeOpsAlertTaskChain() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(0);

  const load = useCallback(async (force = false) => {
    if (!force && Date.now() - lastFetch < 90_000) return;
    setLoading(true);
    try {
      const data = await loadData();
      setRows(data);
      setLastFetch(Date.now());
    } finally {
      setLoading(false);
    }
  }, [lastFetch]);

  useEffect(() => {
    const handler = () => { setOpen(v => { if (!v) load(true); return !v; }); };
    window.addEventListener("jarvis:ikoatc-toggle", handler);
    return () => window.removeEventListener("jarvis:ikoatc-toggle", handler);
  }, [load]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => load(true), 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    try {
      const script = buildIkoatcScript(rows);
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: script }),
      });
      if (r.ok) {
        const j = await r.json();
        const reply = j.response || j.message || j.reply || script;
        await fetch(`${apiBase()}/v1/voice/tts`, {
          method: "POST",
          headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ text: reply }),
        });
      }
    } finally {
      setAssessing(false);
    }
  }, [assessing, rows]);

  const counts = {
    ACTIVATED:  rows.filter(r => r.cls === "ACTIVATED").length,
    ALERTED:    rows.filter(r => r.cls === "ALERTED").length,
    DOCUMENTED: rows.filter(r => r.cls === "DOCUMENTED").length,
    DARK:       rows.filter(r => r.cls === "DARK").length,
  };

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (r._label || "").toLowerCase().includes(s) ||
             (r.category || "").toLowerCase().includes(s) ||
             (r.type || "").toLowerCase().includes(s);
    }
    return true;
  });

  const hasDark = counts.DARK > 0;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => { setOpen(v => { if (!v) load(true); return !v; }); }}
        style={{
          position: "fixed",
          bottom: 8,
          left: LEFT_PX,
          zIndex: Z_IDX,
          background: open ? `${RED}22` : "#0a1628cc",
          border: `1px solid ${hasDark ? RED : CYAN}55`,
          borderRadius: 7,
          color: hasDark ? RED : CYAN,
          cursor: "pointer",
          padding: "5px 10px",
          fontSize: 9,
          letterSpacing: 1,
          fontWeight: 700,
          fontFamily: "'JetBrains Mono',monospace",
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
          gap: 5,
          animation: hasDark ? "ikoatc_pulse_btn 2s ease-in-out infinite" : "none",
        }}
      >
        {hasDark && (
          <span style={{
            display: "inline-block",
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: RED,
            animation: "ikoatc_dot_pulse 1.2s ease-in-out infinite",
          }} />
        )}
        ◈ IKOATC
        {hasDark && (
          <span style={{
            background: `${RED}33`,
            border: `1px solid ${RED}66`,
            borderRadius: 4,
            padding: "1px 5px",
            fontSize: 8,
          }}>
            {counts.DARK} DARK
          </span>
        )}
      </button>

      <style>{`
        @keyframes ikoatc_pulse_btn {
          0%,100% { box-shadow: 0 0 0 0 ${RED}44; }
          50%      { box-shadow: 0 0 12px 3px ${RED}44; }
        }
        @keyframes ikoatc_dot_pulse {
          0%,100% { opacity: 1; }
          50%      { opacity: 0.3; }
        }
      `}</style>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed",
          bottom: 40,
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(1100px, 96vw)",
          maxHeight: "78vh",
          zIndex: Z_IDX + 1,
          background: "linear-gradient(145deg,#040d1aee,#071426ee)",
          border: `1px solid ${hasDark ? RED : CYAN}33`,
          borderRadius: 14,
          boxShadow: `0 0 40px ${hasDark ? RED : CYAN}22`,
          display: "flex",
          flexDirection: "column",
          fontFamily: "'JetBrains Mono',monospace",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "14px 18px 10px",
            borderBottom: "1px solid #ffffff11",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}>
            <span style={{ color: CYAN, fontSize: 11, fontWeight: 800, letterSpacing: 2 }}>
              ◈ INTELLIGENCE ACTIVATION CHAIN
            </span>
            <span style={{ color: "#566878", fontSize: 9 }}>
              INTELPROFILE × KNOWLEDGE × OPS ALERT × TASK
            </span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {Object.entries(counts).map(([k, v]) => (
                <span key={k} style={{
                  background: `${CLS_COLOR[k]}15`,
                  border: `1px solid ${CLS_COLOR[k]}44`,
                  borderRadius: 5,
                  color: CLS_COLOR[k],
                  fontSize: 9,
                  padding: "2px 8px",
                  fontWeight: 700,
                }}>
                  {k} {v}
                </span>
              ))}
              <button
                onClick={assess}
                disabled={assessing || rows.length === 0}
                style={{
                  background: assessing ? "#1a2a3a" : `${GREEN}22`,
                  border: `1px solid ${GREEN}55`,
                  borderRadius: 6,
                  color: GREEN,
                  cursor: assessing ? "not-allowed" : "pointer",
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "4px 10px",
                  letterSpacing: 1,
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                {assessing ? "ASSESSING…" : "▶ ASSESS"}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none",
                  border: "1px solid #ffffff22",
                  borderRadius: 5,
                  color: "#566878",
                  cursor: "pointer",
                  fontSize: 10,
                  padding: "3px 8px",
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Filters + search */}
          <div style={{
            padding: "8px 18px",
            borderBottom: "1px solid #ffffff0a",
            display: "flex",
            gap: 6,
            alignItems: "center",
            flexWrap: "wrap",
          }}>
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? `${f === "ALL" ? CYAN : CLS_COLOR[f]}22` : "none",
                  border: `1px solid ${filter === f ? (f === "ALL" ? CYAN : CLS_COLOR[f]) : "#ffffff22"}`,
                  borderRadius: 5,
                  color: filter === f ? (f === "ALL" ? CYAN : CLS_COLOR[f]) : "#566878",
                  cursor: "pointer",
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "3px 9px",
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                {f}{f !== "ALL" ? ` (${counts[f] || 0})` : ""}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search intel profiles…"
              style={{
                marginLeft: "auto",
                background: "#071426",
                border: "1px solid #ffffff22",
                borderRadius: 5,
                color: CYAN,
                fontSize: 9,
                padding: "4px 10px",
                fontFamily: "'JetBrains Mono',monospace",
                outline: "none",
                width: 180,
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ overflowY: "auto", flex: 1, padding: "8px 0" }}>
            {loading && (
              <div style={{ color: CYAN, fontSize: 10, padding: "20px", textAlign: "center" }}>
                LOADING INTELLIGENCE ACTIVATION CHAIN DATA…
              </div>
            )}
            {!loading && visible.length === 0 && (
              <div style={{ color: "#566878", fontSize: 10, padding: "20px", textAlign: "center" }}>
                No intel profiles match current filter.
              </div>
            )}
            {!loading && visible.map((row, i) => {
              const isExp = expanded === i;
              const clsColor = CLS_COLOR[row.cls];
              return (
                <div
                  key={i}
                  style={{ borderBottom: "1px solid #ffffff08", padding: "0 18px" }}
                >
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 0",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{
                      minWidth: 80,
                      background: `${clsColor}18`,
                      border: `1px solid ${clsColor}44`,
                      borderRadius: 4,
                      color: clsColor,
                      fontSize: 8,
                      fontWeight: 700,
                      padding: "2px 7px",
                      letterSpacing: 1,
                      textAlign: "center",
                    }}>
                      {row.cls}
                    </span>
                    <span style={{ color: "#c8d8e8", fontSize: 10, flex: 1 }}>
                      {row._label || row.id || "—"}
                    </span>
                    {row.category && (
                      <span style={{
                        background: `${AMBER}18`,
                        border: `1px solid ${AMBER}44`,
                        borderRadius: 3,
                        color: AMBER,
                        fontSize: 8,
                        padding: "1px 5px",
                        fontWeight: 600,
                      }}>
                        {row.category}
                      </span>
                    )}
                    {row.type && (
                      <span style={{
                        background: `${CYAN}18`,
                        border: `1px solid ${CYAN}44`,
                        borderRadius: 3,
                        color: CYAN,
                        fontSize: 8,
                        padding: "1px 5px",
                        fontWeight: 600,
                      }}>
                        {row.type}
                      </span>
                    )}
                    <span style={{ color: "#2a3a4a", fontSize: 9, marginLeft: 4 }}>
                      {isExp ? "▲" : "▼"}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{
                      padding: "0 0 12px 12px",
                      borderLeft: `2px solid ${clsColor}33`,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}>
                      <DetailSection
                        label="KNOWLEDGE ARTICLES" color={CYAN}
                        items={row.matchedKnowledge}
                        renderItem={k => (
                          <>
                            <span style={{ color: "#c8d8e8", fontSize: 9 }}>{k._label}</span>
                            {k.category && <Badge color={AMBER}>{k.category}</Badge>}
                          </>
                        )}
                      />
                      <DetailSection
                        label="OPS ALERTS" color={RED}
                        items={row.matchedAlerts}
                        renderItem={a => (
                          <>
                            <span style={{ color: "#c8d8e8", fontSize: 9 }}>{a._label}</span>
                            {a.severity && (
                              <Badge color={a.severity === "critical" || a.severity === "high" ? RED : AMBER}>
                                {a.severity}
                              </Badge>
                            )}
                          </>
                        )}
                      />
                      <DetailSection
                        label="TASKS" color={GREEN}
                        items={row.matchedTasks}
                        renderItem={t => (
                          <>
                            <span style={{ color: "#c8d8e8", fontSize: 9 }}>{t._label}</span>
                            {t.status && (
                              <Badge color={t.status === "complete" || t.status === "done" ? GREEN : AMBER}>
                                {t.status}
                              </Badge>
                            )}
                          </>
                        )}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "6px 18px",
            borderTop: "1px solid #ffffff0a",
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}>
            <span style={{ color: "#566878", fontSize: 8 }}>
              {rows.length} intel profiles · auto-refresh 90s
            </span>
            {loading && <span style={{ color: CYAN, fontSize: 8 }}>LOADING…</span>}
            <button
              onClick={() => load(true)}
              style={{
                marginLeft: "auto",
                background: "none",
                border: `1px solid ${CYAN}33`,
                borderRadius: 4,
                color: CYAN,
                cursor: "pointer",
                fontSize: 8,
                padding: "2px 8px",
                fontFamily: "'JetBrains Mono',monospace",
              }}
            >
              ↺ REFRESH
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function DetailSection({ label, color, items, renderItem }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div style={{ color, fontSize: 8, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
        {label} ({items.length})
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {items.slice(0, 6).map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {renderItem(item)}
          </div>
        ))}
        {items.length > 6 && (
          <span style={{ color: "#566878", fontSize: 8 }}>+{items.length - 6} more</span>
        )}
      </div>
    </div>
  );
}

function Badge({ color, children }) {
  return (
    <span style={{
      background: `${color}18`,
      border: `1px solid ${color}44`,
      borderRadius: 3,
      color,
      fontSize: 8,
      padding: "1px 5px",
      fontWeight: 600,
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}
