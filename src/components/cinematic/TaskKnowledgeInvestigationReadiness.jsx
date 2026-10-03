/**
 * TaskKnowledgeInvestigationReadiness — F57 (TKIRNEX).
 * /entities/Task × /knowledge/ × /v1/investigations
 * Keyword-correlates each task against knowledge articles AND active investigations.
 * Classification:
 *   FULLY_RESOURCED — matched ≥1 KB article AND ≥1 investigation
 *   KB_ONLY         — matched knowledge, no investigation
 *   INV_ONLY        — matched investigation, no knowledge
 *   ISOLATED        — no knowledge, no investigation (blind spot)
 * Stat tiles: TASKS / KB ARTICLES / INVESTIGATIONS / FULLY RESOURCED / ISOLATED
 * Filter tabs + text search. Expand row → matched KB articles (amber) + investigations (green).
 * ▶ ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts.
 * ◈ TKIRNEX button left:942420 bottom:8 zIndex:640.
 * 90-s auto-refresh. Additive only — mounted via App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const CY = "#29E7FF";
const GR = "#4ADE80";
const AM = "#F59E0B";
const RD = "#EF4444";
const BG = "rgba(0,10,20,0.96)";
const MN = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const REFRESH_MS = 90_000;
const BTN_LEFT = 942420;
const Z = 640;

const TKIRNEX_RE =
  /\btkirnex\b|task\s+knowledge|task\s+investigation|knowledge.backed\s+task|isolated\s+task|task\s+backing|task\s+readiness|task\s+intel\s+gap|unsupported\s+task|task\s+knowledge\s+gap|task\s+resource\s+coverage/i;

export function isTkirnexQuery(text) {
  return TKIRNEX_RE.test(text || "");
}

function authHdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function keywords(str) {
  if (!str) return [];
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4);
}

function scoreMatch(taskKws, items, nameField) {
  const matches = [];
  for (const item of items) {
    const itemText = [
      item[nameField] || "",
      item.title || "",
      item.name || "",
      item.description || "",
      item.summary || "",
      item.content || "",
      item.category || "",
      item.kind || "",
    ]
      .join(" ")
      .toLowerCase();
    const hits = taskKws.filter((kw) => itemText.includes(kw)).length;
    if (hits > 0) {
      const score = Math.min(100, Math.round((hits / Math.max(1, taskKws.length)) * 100));
      matches.push({ item, score });
    }
  }
  matches.sort((a, b) => b.score - a.score);
  return { matches: matches.slice(0, 5) };
}

async function fetchAll() {
  const base = apiBase();
  const [tRes, kRes, iRes] = await Promise.allSettled([
    fetch(`${base}/entities/Task`, { headers: authHdr() }),
    fetch(`${base}/knowledge/`, { headers: authHdr() }),
    fetch(`${base}/v1/investigations`, { headers: authHdr() }),
  ]);

  const toArr = async (res) => {
    if (res.status !== "fulfilled" || !res.value.ok) return [];
    const d = await res.value.json();
    return Array.isArray(d) ? d : d.items ?? d.results ?? d.data ?? [];
  };

  const [tasks, knowledge, investigations] = await Promise.all([
    toArr(tRes),
    toArr(kRes),
    toArr(iRes),
  ]);

  return { tasks, knowledge, investigations };
}

function classify(task, knowledge, investigations) {
  const kws = keywords(
    [task.name, task.title, task.description, task.summary, task.id]
      .filter(Boolean)
      .join(" ")
  );
  if (kws.length === 0) {
    return { kbMatches: [], invMatches: [], classification: "ISOLATED" };
  }
  const { matches: kbMatches } = scoreMatch(kws, knowledge, "title");
  const { matches: invMatches } = scoreMatch(kws, investigations, "title");
  const hasKb = kbMatches.length > 0;
  const hasInv = invMatches.length > 0;
  let classification;
  if (hasKb && hasInv) classification = "FULLY_RESOURCED";
  else if (hasKb) classification = "KB_ONLY";
  else if (hasInv) classification = "INV_ONLY";
  else classification = "ISOLATED";
  return { kbMatches, invMatches, classification };
}

export async function buildTkirnexScript() {
  try {
    const { tasks, knowledge, investigations } = await fetchAll();
    const rows = tasks.map((t) => classify(t, knowledge, investigations));
    const fully = rows.filter((r) => r.classification === "FULLY_RESOURCED").length;
    const kbOnly = rows.filter((r) => r.classification === "KB_ONLY").length;
    const invOnly = rows.filter((r) => r.classification === "INV_ONLY").length;
    const isolated = rows.filter((r) => r.classification === "ISOLATED").length;
    const base = apiBase();
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...authHdr(), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Task knowledge and investigation readiness: ${tasks.length} tasks cross-referenced against ${knowledge.length} knowledge articles and ${investigations.length} active investigations. ${fully} fully resourced (both KB and investigation backing), ${kbOnly} KB-only, ${invOnly} investigation-only, ${isolated} isolated with no knowledge or investigation backing. Give a two-sentence operational assessment of task readiness and which isolated tasks present the greatest intelligence risk.`,
      }),
    });
    if (r.ok) {
      const d = await r.json();
      return (
        d.response ||
        d.answer ||
        d.text ||
        `Task readiness: ${fully}/${tasks.length} fully resourced. ${isolated} tasks lack both knowledge and investigation backing.`
      );
    }
  } catch { /* fall through */ }
  try {
    const { tasks, knowledge, investigations } = await fetchAll();
    const rows = tasks.map((t) => classify(t, knowledge, investigations));
    const fully = rows.filter((r) => r.classification === "FULLY_RESOURCED").length;
    const isolated = rows.filter((r) => r.classification === "ISOLATED").length;
    return `Task readiness: ${tasks.length} total tasks, ${fully} fully resourced against ${knowledge.length} KB articles and ${investigations.length} investigations. ${isolated} isolated tasks require knowledge or investigation backing.`;
  } catch {
    return "Task knowledge investigation readiness data unavailable.";
  }
}

const CLASS_COLOR = {
  FULLY_RESOURCED: GR,
  KB_ONLY: AM,
  INV_ONLY: CY,
  ISOLATED: RD,
};
const CLASS_LABEL = {
  FULLY_RESOURCED: "FULLY RESOURCED",
  KB_ONLY: "KB ONLY",
  INV_ONLY: "INV ONLY",
  ISOLATED: "ISOLATED",
};
const TABS = ["ALL", "FULLY_RESOURCED", "KB_ONLY", "INV_ONLY", "ISOLATED"];

export default function TaskKnowledgeInvestigationReadiness() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [taskCount, setTaskCount] = useState(0);
  const [kbCount, setKbCount] = useState(0);
  const [invCount, setInvCount] = useState(0);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { tasks, knowledge, investigations } = await fetchAll();
      setTaskCount(tasks.length);
      setKbCount(knowledge.length);
      setInvCount(investigations.length);
      const enriched = tasks.map((t) => {
        const { kbMatches, invMatches, classification } = classify(t, knowledge, investigations);
        return {
          id: t.id ?? t._id ?? Math.random().toString(36).slice(2),
          name: t.name || t.title || "(unnamed task)",
          description: t.description || t.summary || "",
          status: t.status || "",
          classification,
          kbMatches,
          invMatches,
        };
      });
      const order = { ISOLATED: 0, KB_ONLY: 1, INV_ONLY: 2, FULLY_RESOURCED: 3 };
      enriched.sort((a, b) => (order[a.classification] ?? 4) - (order[b.classification] ?? 4));
      setRows(enriched);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => {
      setOpen((o) => {
        if (!o) load();
        return !o;
      });
    };
    window.addEventListener("jarvis:tkirnex-toggle", onToggle);
    return () => window.removeEventListener("jarvis:tkirnex-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    setAssessText("");
    try {
      const script = await buildTkirnexScript();
      setAssessText(script);
      const voice = getActiveVoice?.() || "ash";
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ text: script, voice }),
      });
    } catch {
      setAssessText("Assessment unavailable.");
    }
    setAssessing(false);
  }

  const fully = rows.filter((r) => r.classification === "FULLY_RESOURCED").length;
  const isolated = rows.filter((r) => r.classification === "ISOLATED").length;

  const visible = rows.filter((r) => {
    if (tab !== "ALL" && r.classification !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q);
    }
    return true;
  });

  const tile = (label, val, col, pulse) => (
    <div key={label} style={{ textAlign: "center", minWidth: 90 }}>
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: col,
          letterSpacing: 1,
          animation: pulse && val > 0 ? "tkirpulse 1.4s ease-in-out infinite" : "none",
        }}
      >
        {val}
      </div>
      <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1, marginTop: 2 }}>
        {label}
      </div>
    </div>
  );

  const classBadge = (cls) => (
    <span
      style={{
        fontSize: 9,
        padding: "1px 6px",
        borderRadius: 4,
        background: `${CLASS_COLOR[cls]}22`,
        color: CLASS_COLOR[cls],
        border: `1px solid ${CLASS_COLOR[cls]}55`,
        letterSpacing: 1,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {CLASS_LABEL[cls]}
    </span>
  );

  if (!open)
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Task × Knowledge × Investigation Readiness Nexus"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: Z,
          padding: "3px 9px",
          borderRadius: 5,
          cursor: "pointer",
          background: "rgba(0,10,20,0.7)",
          border: `1px solid ${CY}55`,
          color: CY,
          fontFamily: MN,
          fontSize: 10,
          letterSpacing: 1,
          boxShadow: `0 0 8px ${CY}33`,
          animation: isolated > 0 ? "tkirpulse 2s ease-in-out infinite" : "none",
        }}
      >
        ◈ TKIRNEX
      </button>
    );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: Z,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,5,12,0.82)",
        backdropFilter: "blur(6px)",
      }}
    >
      <div
        style={{
          width: "min(860px,96vw)",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          background: BG,
          border: `1px solid ${CY}44`,
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: `0 0 60px ${CY}18`,
          fontFamily: MN,
        }}
      >
        {/* header */}
        <div
          style={{
            padding: "14px 18px",
            borderBottom: `1px solid ${CY}22`,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 13 }}>
            ◈ TASK KNOWLEDGE & INVESTIGATION READINESS
          </span>
          {isolated > 0 && (
            <span
              style={{
                fontSize: 10,
                color: RD,
                letterSpacing: 1,
                animation: "tkirpulse 1.4s ease-in-out infinite",
              }}
            >
              ⚠ {isolated} ISOLATED
            </span>
          )}
          {loading && <span style={{ color: "#6E8AA0", fontSize: 10 }}>refreshing…</span>}
          {err && <span style={{ color: RD, fontSize: 10 }}>⚠ {err}</span>}
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              marginLeft: "auto",
              padding: "3px 10px",
              borderRadius: 5,
              cursor: "pointer",
              background: assessing ? "#0a1a2a" : `${CY}22`,
              border: `1px solid ${CY}55`,
              color: CY,
              fontFamily: MN,
              fontSize: 10,
            }}
          >
            {assessing ? "…" : "▶ ASSESS"}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              padding: "3px 8px",
              borderRadius: 5,
              cursor: "pointer",
              background: "transparent",
              border: "1px solid #334",
              color: "#6E8AA0",
              fontFamily: MN,
              fontSize: 11,
            }}
          >
            ✕
          </button>
        </div>

        {/* stat tiles */}
        <div
          style={{
            display: "flex",
            gap: 24,
            padding: "12px 18px",
            borderBottom: `1px solid ${CY}18`,
            flexWrap: "wrap",
          }}
        >
          {tile("TASKS", taskCount, CY, false)}
          {tile("KB ARTICLES", kbCount, AM, false)}
          {tile("INVESTIGATIONS", invCount, GR, false)}
          {tile("FULLY RESOURCED", fully, GR, false)}
          {tile("ISOLATED", isolated, RD, true)}
        </div>

        {/* assess output */}
        {assessText && (
          <div
            style={{
              margin: "8px 18px",
              padding: "8px 12px",
              borderRadius: 8,
              background: `${CY}11`,
              border: `1px solid ${CY}33`,
              color: "#DCEBF5",
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {assessText}
          </div>
        )}

        {/* filter tabs + search */}
        <div
          style={{
            display: "flex",
            gap: 6,
            padding: "8px 18px",
            borderBottom: `1px solid ${CY}18`,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "2px 10px",
                borderRadius: 4,
                cursor: "pointer",
                background: tab === t ? `${CLASS_COLOR[t] || CY}22` : "transparent",
                border: `1px solid ${tab === t ? CLASS_COLOR[t] || CY : "#334"}`,
                color: tab === t ? CLASS_COLOR[t] || CY : "#6E8AA0",
                fontFamily: MN,
                fontSize: 10,
              }}
            >
              {t === "ALL" ? "ALL" : CLASS_LABEL[t]}
            </button>
          ))}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search task…"
            style={{
              marginLeft: "auto",
              padding: "3px 10px",
              borderRadius: 5,
              background: "rgba(0,20,40,0.8)",
              border: `1px solid ${CY}33`,
              color: "#DCEBF5",
              fontFamily: MN,
              fontSize: 11,
              width: 190,
              outline: "none",
            }}
          />
        </div>

        {/* task rows */}
        <div style={{ overflowY: "auto", flex: 1, padding: "8px 18px" }}>
          {visible.length === 0 && !loading && (
            <div
              style={{
                color: "#6E8AA0",
                fontSize: 12,
                padding: "24px 0",
                textAlign: "center",
              }}
            >
              {err ? "Load failed." : "No tasks match."}
            </div>
          )}
          {visible.map((row) => {
            const isIsolated = row.classification === "ISOLATED";
            const isExp = expanded === row.id;
            return (
              <div
                key={row.id}
                style={{ borderBottom: `1px solid ${CY}11`, padding: "7px 0" }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    cursor: "pointer",
                  }}
                  onClick={() => setExpanded(isExp ? null : row.id)}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: CLASS_COLOR[row.classification],
                      boxShadow: isIsolated ? `0 0 8px ${RD}` : "none",
                      animation: isIsolated ? "tkirpulse 1.2s ease-in-out infinite" : "none",
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        color: isIsolated ? "#FFCCCC" : "#DCEBF5",
                        fontSize: 12,
                        fontWeight: isIsolated ? 700 : 600,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {row.name}
                    </div>
                    {row.description && (
                      <div
                        style={{
                          fontSize: 10,
                          color: "#6E8AA0",
                          marginTop: 2,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {row.description}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                    {classBadge(row.classification)}
                    <span style={{ fontSize: 9, color: "#4A5568" }}>{isExp ? "▲" : "▼"}</span>
                  </div>
                </div>

                {isExp && (
                  <div
                    style={{
                      marginTop: 8,
                      paddingLeft: 18,
                      display: "flex",
                      gap: 16,
                      flexWrap: "wrap",
                    }}
                  >
                    {/* knowledge articles */}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div
                        style={{
                          fontSize: 10,
                          color: AM,
                          letterSpacing: 1,
                          marginBottom: 4,
                        }}
                      >
                        KNOWLEDGE ({row.kbMatches.length})
                      </div>
                      {row.kbMatches.length === 0 ? (
                        <div style={{ fontSize: 10, color: "#4A5568" }}>none matched</div>
                      ) : (
                        row.kbMatches.map(({ item, score }, i) => (
                          <div key={i} style={{ marginBottom: 4 }}>
                            <div
                              style={{
                                fontSize: 11,
                                color: "#DCEBF5",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {item.title || item.name || "(untitled)"}
                            </div>
                            <div
                              style={{
                                height: 3,
                                borderRadius: 2,
                                background: `${AM}22`,
                                marginTop: 2,
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  height: "100%",
                                  width: `${score}%`,
                                  background: AM,
                                  borderRadius: 2,
                                }}
                              />
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* investigations */}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div
                        style={{
                          fontSize: 10,
                          color: GR,
                          letterSpacing: 1,
                          marginBottom: 4,
                        }}
                      >
                        INVESTIGATIONS ({row.invMatches.length})
                      </div>
                      {row.invMatches.length === 0 ? (
                        <div style={{ fontSize: 10, color: "#4A5568" }}>none matched</div>
                      ) : (
                        row.invMatches.map(({ item, score }, i) => (
                          <div key={i} style={{ marginBottom: 4 }}>
                            <div
                              style={{
                                fontSize: 11,
                                color: "#DCEBF5",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {item.title || item.name || "(untitled)"}
                            </div>
                            <div
                              style={{
                                height: 3,
                                borderRadius: 2,
                                background: `${GR}22`,
                                marginTop: 2,
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  height: "100%",
                                  width: `${score}%`,
                                  background: GR,
                                  borderRadius: 2,
                                }}
                              />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div
          style={{
            padding: "6px 18px",
            borderTop: `1px solid ${CY}18`,
            fontSize: 10,
            color: "#4A5568",
            letterSpacing: 1,
          }}
        >
          {visible.length} of {rows.length} · auto-refresh 90 s ·
          /entities/Task × /knowledge/ × /v1/investigations
        </div>
      </div>
      <style>{`@keyframes tkirpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.5)}}`}</style>
    </div>
  );
}
