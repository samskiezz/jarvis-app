/**
 * TaskDecisionTracer — F83.
 *
 * Parallel-fetches /entities/Task + /v1/decision/list and keyword-correlates
 * each task against the strategic decision ledger to surface DECISION-BACKED
 * tasks (at least one recorded decision provides context) vs UNDECIDED tasks
 * (pure tactical work with no documented decision rationale).
 *
 * Stat tiles: tasks / decisions / backed / undecided
 * Filter tabs: ALL / BACKED / UNDECIDED + text search
 * Expand any task → matched decisions with reason + expected-outcome + relevance score
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence strategic-alignment brief + TTS
 *
 * Toggle: ◈ TDECIS at left:21680, zIndex 65.
 * Voice: "task decision" / "strategic tasks" / "decided tasks" /
 *        "which tasks have decisions" / "tdecis"
 * Auto-refresh: 90 s.
 *
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GREEN = "#00c878";
const AMBER = "#F5A623";
const RED = "#FF3D5A";
const GOLD = "#F59E0B";
const BTN_LEFT = 21680;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isTaskDecisQuery(q) {
  return /task.{0,20}decis|decis.{0,20}task|strategic.{0,15}task|task.{0,15}strateg|decided.{0,15}task|which\s+tasks?.{0,20}decis|undecid|tdecis\b/i.test(
    q || ""
  );
}

export async function buildTaskDecisScript() {
  try {
    const [tr, dr] = await Promise.all([
      fetch(`${apiBase()}/entities/Task`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({}),
      }),
      fetch(`${apiBase()}/v1/decision/list`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const tasks = normaliseArray(tr.ok ? await tr.json() : []);
    const decisions = normaliseArray(dr.ok ? await dr.json() : []);
    const links = buildLinks(tasks, decisions);
    const backedIds = new Set(links.map((l) => l.taskId));
    const undecided = tasks.length - backedIds.size;
    window.dispatchEvent(new CustomEvent("jarvis:tdecis-toggle"));
    if (!tasks.length)
      return "No tasks found, sir. The mission board appears empty.";
    return (
      `Task–decision traceability active, sir. ` +
      `${tasks.length} task${tasks.length !== 1 ? "s" : ""} cross-referenced ` +
      `against ${decisions.length} strategic decision${decisions.length !== 1 ? "s" : ""}. ` +
      `${backedIds.size} task${backedIds.size !== 1 ? "s" : ""} ` +
      `${backedIds.size === 1 ? "has" : "have"} documented decision backing. ` +
      `${undecided} task${undecided !== 1 ? "s" : ""} ${undecided === 1 ? "is" : "are"} ` +
      `undecided — no strategic rationale recorded. Select a task to review matched decisions.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:tdecis-toggle"));
    return "Task decision tracer open, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function TaskDecisionTracer() {
  const [visible, setVisible] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [aiMap, setAiMap] = useState({});
  const [aiLoading, setAiLoading] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [tr, dr] = await Promise.all([
        fetch(`${apiBase()}/entities/Task`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_KEY}`,
          },
          body: JSON.stringify({}),
        }),
        fetch(`${apiBase()}/v1/decision/list`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
      ]);
      const rawTasks = normaliseArray(tr.ok ? await tr.json() : []);
      const rawDecisions = normaliseArray(dr.ok ? await dr.json() : []);
      setTasks(rawTasks);
      setDecisions(rawDecisions);
      setLinks(buildLinks(rawTasks, rawDecisions));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:tdecis-toggle", onToggle);
    return () => window.removeEventListener("jarvis:tdecis-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, 90_000);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assessLink(task, decision) {
    const tid = task.id || task._id || task.title;
    const did = decision.id || decision._id || decision.title;
    const key = `${tid}::${did}`;
    if (aiMap[key] || aiLoading === key) return;
    setAiLoading(key);
    const taskTitle = task.title || task.name || task.description || "Unknown Task";
    const decisTitle = decision.title || decision.name || decision.description || "Unknown Decision";
    const decisReason = decision.reason || decision.rationale || "";
    const prompt =
      `As JARVIS, provide a 2-sentence strategic-alignment assessment of how ` +
      `task "${taskTitle}" relates to the decision "${decisTitle}"` +
      (decisReason ? ` (rationale: ${decisReason.slice(0, 120)})` : "") +
      `. Focus on operational coherence and strategic value. Be direct.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAiMap((prev) => ({ ...prev, [key]: answer }));
      if (answer)
        window.dispatchEvent(
          new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } })
        );
    } catch (_) {
      setAiMap((prev) => ({ ...prev, [key]: "Unable to reach reasoning core." }));
    } finally {
      setAiLoading(null);
    }
  }

  const backedIds = new Set(links.map((l) => l.taskId));
  const undecidedCount = tasks.length - backedIds.size;

  const filtered = tasks
    .filter((t) => {
      const tid = t.id || t._id || t.title;
      if (filter === "backed") return backedIds.has(tid);
      if (filter === "undecided") return !backedIds.has(tid);
      return true;
    })
    .filter((t) => {
      if (!search.trim()) return true;
      const txt = [
        t.title || "",
        t.name || "",
        t.description || "",
        t.status || "",
        t.priority || "",
        t.type || "",
        ...(Array.isArray(t.tags) ? t.tags : []),
      ]
        .join(" ")
        .toLowerCase();
      return txt.includes(search.toLowerCase());
    });

  const selectedLinks = selected
    ? links.filter(
        (l) => l.taskId === (selected.id || selected._id || selected.title)
      )
    : [];

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Task × Decision Ledger Tracer"
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 65,
          height: 26,
          padding: "0 8px",
          background: visible ? `${GOLD}22` : "rgba(8,14,22,0.82)",
          border: `1px solid ${visible ? GOLD : "#2A3A4A"}`,
          borderRadius: 5,
          color: visible ? GOLD : "#6E8AA0",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: 1,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {undecidedCount > 0 && !visible && (
          <span
            style={{
              display: "inline-block",
              marginRight: 5,
              background: AMBER,
              color: "#000",
              borderRadius: "50%",
              width: 14,
              height: 14,
              fontSize: 9,
              lineHeight: "14px",
              textAlign: "center",
            }}
          >
            {undecidedCount}
          </span>
        )}
        ◈ TDECIS
      </button>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position: "fixed",
            bottom: 44,
            left: Math.min(BTN_LEFT, window.innerWidth - 660),
            zIndex: 65,
            width: 640,
            maxHeight: "75vh",
            display: "flex",
            flexDirection: "column",
            background: "rgba(4,10,18,0.96)",
            border: `1px solid ${GOLD}44`,
            borderTop: `2px solid ${GOLD}`,
            borderRadius: 12,
            boxShadow: `0 0 40px ${GOLD}14, 0 8px 32px rgba(0,0,0,0.75)`,
            fontFamily: "'JetBrains Mono', monospace",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderBottom: `1px solid ${GOLD}22`,
              flexShrink: 0,
            }}
          >
            <span style={{ color: GOLD, fontSize: 13 }}>◈</span>
            <span
              style={{
                color: GOLD,
                fontSize: 11,
                letterSpacing: 2,
                fontWeight: 700,
              }}
            >
              TASK × DECISION LEDGER TRACER
            </span>
            {loading && (
              <span style={{ marginLeft: "auto", color: "#6E8AA0", fontSize: 10 }}>
                loading…
              </span>
            )}
            <button
              onClick={() => setVisible(false)}
              style={{
                marginLeft: loading ? 0 : "auto",
                background: "transparent",
                border: "none",
                color: "#6E8AA0",
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* Stat tiles */}
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: "8px 14px",
              borderBottom: `1px solid #1A2A3A`,
              flexShrink: 0,
            }}
          >
            {[
              { label: "TASKS", val: tasks.length, col: CY },
              { label: "DECISIONS", val: decisions.length, col: GOLD },
              { label: "BACKED", val: backedIds.size, col: GREEN },
              { label: "UNDECIDED", val: undecidedCount, col: AMBER },
            ].map((t) => (
              <div
                key={t.label}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid #1A2A3A",
                  borderRadius: 6,
                  padding: "5px 8px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 14, color: t.col, fontWeight: 700 }}>
                  {t.val}
                </div>
                <div
                  style={{
                    fontSize: 8,
                    color: "#4E6A7A",
                    letterSpacing: 1,
                    marginTop: 1,
                  }}
                >
                  {t.label}
                </div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "7px 14px",
              borderBottom: `1px solid #1A2A3A`,
              flexShrink: 0,
              alignItems: "center",
            }}
          >
            {["all", "backed", "undecided"].map((f) => (
              <button
                key={f}
                onClick={() => {
                  setFilter(f);
                  setSelected(null);
                }}
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  border: `1px solid ${filter === f ? GOLD : "#2A3A4A"}`,
                  background: filter === f ? `${GOLD}22` : "transparent",
                  color: filter === f ? GOLD : "#6E8AA0",
                  fontSize: 10,
                  letterSpacing: 1,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textTransform: "uppercase",
                }}
              >
                {f}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                marginLeft: "auto",
                background: "transparent",
                border: `1px solid #2A3A4A`,
                borderRadius: 4,
                padding: "2px 8px",
                color: "#DCEBF5",
                fontSize: 10,
                fontFamily: "inherit",
                width: 120,
                outline: "none",
              }}
            />
          </div>

          {/* Split body */}
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
            {/* Task list (left) */}
            <div
              style={{
                width: 240,
                borderRight: `1px solid #1A2A3A`,
                overflowY: "auto",
                flexShrink: 0,
              }}
            >
              {!loading && filtered.length === 0 && (
                <div style={{ padding: 14, color: "#6E8AA0", fontSize: 10 }}>
                  No tasks in this filter.
                </div>
              )}
              {filtered.map((t) => {
                const tid = t.id || t._id || t.title;
                const isBacked = backedIds.has(tid);
                const isActive =
                  selected &&
                  (selected.id || selected._id || selected.title) === tid;
                const priority = (t.priority || "").toString().toUpperCase();
                const priorityColor =
                  priority === "CRITICAL" || priority === "HIGH"
                    ? RED
                    : priority === "MEDIUM"
                    ? AMBER
                    : priority === "LOW"
                    ? GREEN
                    : "#4E6A7A";
                const status = (t.status || "").toString().toUpperCase();
                return (
                  <div
                    key={tid}
                    onClick={() => setSelected(t)}
                    style={{
                      padding: "9px 12px",
                      borderBottom: `1px solid #0E1A26`,
                      cursor: "pointer",
                      background: isActive ? `${GOLD}12` : "transparent",
                      borderLeft: isActive
                        ? `3px solid ${GOLD}`
                        : "3px solid transparent",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        marginBottom: 3,
                      }}
                    >
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: isBacked ? GREEN : "#2A3A4A",
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 10,
                          color: "#DCEBF5",
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {t.title || t.name || tid}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 5, paddingLeft: 12 }}>
                      {status && (
                        <span
                          style={{
                            fontSize: 8,
                            color: CY,
                            letterSpacing: 1,
                            padding: "1px 4px",
                            border: `1px solid ${CY}44`,
                            borderRadius: 3,
                          }}
                        >
                          {status}
                        </span>
                      )}
                      {priority && (
                        <span
                          style={{
                            fontSize: 8,
                            color: priorityColor,
                            letterSpacing: 1,
                            padding: "1px 4px",
                            border: `1px solid ${priorityColor}44`,
                            borderRadius: 3,
                          }}
                        >
                          {priority}
                        </span>
                      )}
                      {isBacked ? (
                        <span
                          style={{
                            fontSize: 8,
                            color: GREEN,
                            letterSpacing: 1,
                          }}
                        >
                          {links.filter((l) => l.taskId === tid).length} decision
                          {links.filter((l) => l.taskId === tid).length !== 1
                            ? "s"
                            : ""}
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: 8,
                            color: AMBER,
                            letterSpacing: 1,
                          }}
                        >
                          UNDECIDED
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Decision detail pane (right) */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {!selected && (
                <div
                  style={{
                    padding: 20,
                    color: "#6E8AA0",
                    fontSize: 10,
                    lineHeight: 1.6,
                  }}
                >
                  Select a task to see matched strategic decisions.
                </div>
              )}
              {selected && selectedLinks.length === 0 && (
                <div style={{ padding: 20, color: "#6E8AA0", fontSize: 10 }}>
                  No matching decisions for this task. Work is UNDECIDED — no
                  strategic rationale recorded.
                </div>
              )}
              {selected && selectedLinks.length > 0 && (
                <div>
                  <div
                    style={{
                      padding: "8px 14px",
                      borderBottom: `1px solid #1A2A3A`,
                      color: GREEN,
                      fontSize: 10,
                      letterSpacing: 1,
                      fontWeight: 700,
                    }}
                  >
                    {selectedLinks.length} DECISION
                    {selectedLinks.length !== 1 ? "S" : ""} FOR "
                    {(
                      selected.title ||
                      selected.name ||
                      "TASK"
                    ).toUpperCase().slice(0, 40)}
                    {(selected.title || selected.name || "").length > 40 ? "…" : ""}
                    "
                  </div>
                  {selectedLinks.map((link, i) => {
                    const dec = link.decision;
                    const did = dec.id || dec._id || dec.title;
                    const tid = selected.id || selected._id || selected.title;
                    const aiKey = `${tid}::${did}`;
                    const aiText = aiMap[aiKey];
                    const isLoadingThis = aiLoading === aiKey;
                    const outcome = dec.expected_outcome || dec.outcome || "";
                    const risks = dec.risks || dec.risk || "";
                    return (
                      <div
                        key={`${aiKey}-${i}`}
                        style={{
                          padding: "10px 14px",
                          borderBottom: `1px solid #0E1A26`,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 8,
                            marginBottom: 5,
                          }}
                        >
                          <span
                            style={{
                              color: GOLD,
                              fontSize: 12,
                              marginTop: 1,
                              flexShrink: 0,
                            }}
                          >
                            ◉
                          </span>
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                fontSize: 11,
                                color: "#DCEBF5",
                                marginBottom: 2,
                              }}
                            >
                              {dec.title || dec.name || dec.description || did}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: 6,
                                flexWrap: "wrap",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 8,
                                  color: "#4E6A7A",
                                  letterSpacing: 1,
                                }}
                              >
                                [{link.matchScore} keyword match
                                {link.matchScore !== 1 ? "es" : ""}]
                              </span>
                              {risks && (
                                <span
                                  style={{
                                    fontSize: 8,
                                    color: AMBER,
                                    letterSpacing: 1,
                                    padding: "1px 4px",
                                    border: `1px solid ${AMBER}44`,
                                    borderRadius: 3,
                                  }}
                                >
                                  HAS RISKS
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => assessLink(selected, dec)}
                            disabled={isLoadingThis || !!aiText}
                            style={{
                              flexShrink: 0,
                              padding: "2px 8px",
                              borderRadius: 4,
                              border: `1px solid ${
                                aiText ? GREEN + "66" : GOLD + "66"
                              }`,
                              background: aiText
                                ? `${GREEN}12`
                                : isLoadingThis
                                ? `${GOLD}22`
                                : "transparent",
                              color: aiText ? GREEN : GOLD,
                              fontSize: 9,
                              letterSpacing: 1,
                              cursor:
                                isLoadingThis || aiText ? "default" : "pointer",
                              fontFamily: "inherit",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {aiText
                              ? "✓ ASSESSED"
                              : isLoadingThis
                              ? "consulting…"
                              : "▶ ASSESS"}
                          </button>
                        </div>

                        {/* Decision reason */}
                        {(dec.reason || dec.rationale) && (
                          <div
                            style={{
                              marginLeft: 20,
                              marginBottom: 4,
                              fontSize: 10,
                              color: "#4E8A9A",
                              lineHeight: 1.5,
                            }}
                          >
                            <span style={{ color: GOLD, fontSize: 8, letterSpacing: 1 }}>
                              RATIONALE:{" "}
                            </span>
                            {String(dec.reason || dec.rationale).slice(0, 160)}
                            {String(dec.reason || dec.rationale).length > 160 ? "…" : ""}
                          </div>
                        )}

                        {/* Expected outcome */}
                        {outcome && (
                          <div
                            style={{
                              marginLeft: 20,
                              marginBottom: 4,
                              fontSize: 10,
                              color: "#4E9A6A",
                              lineHeight: 1.5,
                            }}
                          >
                            <span style={{ color: GREEN, fontSize: 8, letterSpacing: 1 }}>
                              EXPECTED:{" "}
                            </span>
                            {String(outcome).slice(0, 120)}
                            {String(outcome).length > 120 ? "…" : ""}
                          </div>
                        )}

                        {/* AI assessment */}
                        {aiText && (
                          <div
                            style={{
                              marginLeft: 20,
                              marginTop: 5,
                              padding: "6px 10px",
                              background: `${GREEN}0A`,
                              border: `1px solid ${GREEN}22`,
                              borderRadius: 5,
                              fontSize: 10,
                              color: "#A0D8B0",
                              lineHeight: 1.5,
                            }}
                          >
                            <span
                              style={{
                                color: GREEN,
                                fontSize: 8,
                                letterSpacing: 1,
                                fontWeight: 700,
                                display: "block",
                                marginBottom: 3,
                              }}
                            >
                              JARVIS ASSESSMENT
                            </span>
                            {aiText}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "5px 14px",
              borderTop: `1px solid ${GOLD}18`,
              fontSize: 10,
              color: "#4E6A7A",
              letterSpacing: 1,
              flexShrink: 0,
            }}
          >
            /entities/Task + /v1/decision/list · 90-s auto-refresh ·
            click ▶ ASSESS for strategic alignment brief
          </div>
        </div>
      )}
    </>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const k of [
      "items",
      "results",
      "data",
      "tasks",
      "decisions",
      "records",
      "list",
      "nodes",
    ]) {
      if (Array.isArray(data[k])) return data[k];
    }
  }
  return [];
}

function keywords(str) {
  if (!str) return [];
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function buildLinks(tasks, decisions) {
  if (!tasks.length || !decisions.length) return [];
  const results = [];
  for (const t of tasks) {
    const tid = t.id || t._id || t.title;
    const tText = [
      t.title || "",
      t.name || "",
      t.description || "",
      t.type || "",
      t.priority || "",
      ...(Array.isArray(t.tags) ? t.tags : []),
    ].join(" ");
    const tKws = keywords(tText);
    if (!tKws.length) continue;
    for (const d of decisions) {
      const dText = [
        d.title || "",
        d.name || "",
        d.description || "",
        d.reason || "",
        d.rationale || "",
        d.expected_outcome || "",
        d.outcome || "",
        d.alternatives || "",
        d.category || "",
        d.type || "",
        ...(Array.isArray(d.tags) ? d.tags : []),
      ].join(" ");
      const dKws = keywords(dText);
      const score = tKws.filter((w) => dKws.includes(w)).length;
      if (score >= 1)
        results.push({ taskId: tid, decision: d, matchScore: score });
    }
  }
  results.sort((a, b) => b.matchScore - a.matchScore);
  return results;
}
