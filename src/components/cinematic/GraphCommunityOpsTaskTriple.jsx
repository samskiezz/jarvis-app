import { useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const AM = "#FFB300";
const LM = "#B0FF57";
const RD = "#FF4444";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_KEY) ||
  "dev-key";

const GCOETRI_RE =
  /\b(gcoetri|community ops task|graph ops task|operational community|idle community|community ops coverage|community task ops|graph community ops|community operational|ops task community|community triple)\b/i;

export function isGcoetriQuery(t) {
  return GCOETRI_RE.test(t || "");
}

function tok(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
}

function overlap(a, b) {
  const sa = new Set(tok(a));
  const sb = new Set(tok(b));
  let hits = 0;
  for (const w of sa) if (sb.has(w)) hits++;
  return sa.size ? hits / sa.size : 0;
}

function score(community, items) {
  const haystack = [community.label, community.summary, ...(community.members || [])].join(" ");
  let best = 0;
  for (const it of items) {
    const needle = [it.name || it.title || it.description || it.status || ""].join(" ");
    const s = overlap(haystack, needle);
    if (s > best) best = s;
  }
  return best;
}

export async function buildGcoetriScript() {
  try {
    const base = apiBase();
    const [cr, or_, tr] = await Promise.allSettled([
      fetch(`${base}/v1/graph/communities`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
      fetch(`${base}/v1/ops/events`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
      fetch(`${base}/entities/Task`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);

    const communities = (cr.status === "fulfilled" ? cr.value?.communities || cr.value || [] : []).slice(0, 80);
    const opsEvents = (or_.status === "fulfilled" ? or_.value?.events || or_.value?.ops_events || or_.value || [] : []).slice(0, 200);
    const tasks = (tr.status === "fulfilled" ? tr.value?.tasks || tr.value || [] : []).slice(0, 200);

    let fullyOp = 0, opsTrig = 0, tasked = 0, idle = 0;
    for (const c of communities) {
      const hasOps = score(c, opsEvents) > 0.15;
      const hasTask = score(c, tasks) > 0.15;
      if (hasOps && hasTask) fullyOp++;
      else if (hasOps) opsTrig++;
      else if (hasTask) tasked++;
      else idle++;
    }
    const total = communities.length;
    return (
      `Graph community operational coverage: ${total} clusters assessed — ` +
      `${fullyOp} FULLY OPERATIONAL (ops-triggered + task-backed), ` +
      `${opsTrig} OPS-TRIGGERED only, ${tasked} TASKED only, ${idle} IDLE (no ops or task coverage). ` +
      `${idle > 0 ? `${idle} idle cluster${idle > 1 ? "s" : ""} have no operational footprint — recommend tasking review.` : "All communities have at least partial operational coverage."}`
    );
  } catch {
    return "Community operational coverage assessment unavailable.";
  }
}

const ScoreBar = ({ sc, color }) => (
  <div style={{ background: "#111", borderRadius: 2, height: 3, width: "100%", overflow: "hidden" }}>
    <div style={{ width: `${Math.round(sc * 100)}%`, background: color, height: "100%", transition: "width .3s" }} />
  </div>
);

const chip = (label, color = CY) => (
  <span
    style={{
      display: "inline-block",
      padding: "1px 6px",
      border: `1px solid ${color}`,
      borderRadius: 3,
      color,
      fontSize: 9,
      letterSpacing: 1,
      marginRight: 4,
    }}
  >
    {label}
  </span>
);

const TABS = ["ALL", "FULLY OPERATIONAL", "OPS-TRIGGERED", "TASKED", "IDLE"];

export default function GraphCommunityOpsTaskTriple() {
  const [open, setOpen] = useState(false);
  const [communities, setCommunities] = useState([]);
  const [opsEvents, setOpsEvents] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");
  const [err, setErr] = useState("");
  const timerRef = useRef(null);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const base = apiBase();
      const [cr, or_, tr] = await Promise.allSettled([
        fetch(`${base}/v1/graph/communities`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
        fetch(`${base}/v1/ops/events`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
        fetch(`${base}/entities/Task`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      setCommunities(
        (cr.status === "fulfilled" ? cr.value?.communities || cr.value || [] : []).slice(0, 80)
      );
      setOpsEvents(
        (or_.status === "fulfilled" ? or_.value?.events || or_.value?.ops_events || or_.value || [] : []).slice(0, 200)
      );
      setTasks(
        (tr.status === "fulfilled" ? tr.value?.tasks || tr.value || [] : []).slice(0, 200)
      );
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    function onToggle() {
      setOpen((o) => {
        if (!o) load();
        return !o;
      });
    }
    window.addEventListener("jarvis:gcoetri-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gcoetri-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open]);

  function classify(c) {
    const hasOps = score(c, opsEvents) > 0.15;
    const hasTask = score(c, tasks) > 0.15;
    if (hasOps && hasTask) return "FULLY OPERATIONAL";
    if (hasOps) return "OPS-TRIGGERED";
    if (hasTask) return "TASKED";
    return "IDLE";
  }

  function matchedOps(c) {
    return opsEvents
      .map((ev) => ({ ev, sc: overlap([c.label, c.summary, ...(c.members || [])].join(" "), [ev.name || ev.title || ev.description || ""].join(" ")) }))
      .filter((x) => x.sc > 0.05)
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 6);
  }
  function matchedTasks(c) {
    return tasks
      .map((tk) => ({ tk, sc: overlap([c.label, c.summary, ...(c.members || [])].join(" "), [tk.name || tk.title || tk.description || ""].join(" ")) }))
      .filter((x) => x.sc > 0.05)
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 6);
  }

  const enriched = communities.map((c) => ({ ...c, _class: classify(c) }));

  const fullyOpCount = enriched.filter((c) => c._class === "FULLY OPERATIONAL").length;
  const opsTrigCount = enriched.filter((c) => c._class === "OPS-TRIGGERED").length;
  const taskedCount = enriched.filter((c) => c._class === "TASKED").length;
  const idleCount = enriched.filter((c) => c._class === "IDLE").length;

  const filtered = enriched.filter((c) => {
    if (tab !== "ALL" && c._class !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (c.label || "").toLowerCase().includes(q) ||
        (c.summary || "").toLowerCase().includes(q) ||
        (c.members || []).some((m) => m.toLowerCase().includes(q))
      );
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    setAssessText("");
    try {
      const script = await buildGcoetriScript();
      const base = apiBase();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const answer = (d.answer || script).replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessText(answer);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch {
      setAssessText(await buildGcoetriScript());
    } finally {
      setAssessing(false);
    }
  }

  const classColor = (cl) => {
    if (cl === "FULLY OPERATIONAL") return CY;
    if (cl === "OPS-TRIGGERED") return AM;
    if (cl === "TASKED") return LM;
    return RD;
  };

  const mono = { fontFamily: "'JetBrains Mono',monospace" };

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Graph Community × Ops × Task Triple (GCOETRI)"
        style={{
          position: "fixed",
          left: 727200,
          bottom: 8,
          zIndex: 327,
          background: "rgba(0,0,0,0.85)",
          border: `1px solid ${CY}`,
          borderRadius: 4,
          color: CY,
          fontSize: 9,
          padding: "3px 7px",
          cursor: "pointer",
          letterSpacing: 1,
          ...mono,
        }}
      >
        ◈ GCOETRI
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        top: 16,
        width: 720,
        maxHeight: 640,
        background: "rgba(0,0,0,0.96)",
        border: `1px solid ${CY}`,
        borderRadius: 6,
        zIndex: 9600,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        ...mono,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "8px 12px",
          borderBottom: `1px solid ${CY}22`,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ color: CY, fontSize: 10, letterSpacing: 2, flex: 1 }}>
          ◈ GRAPH COMMUNITY × OPS EVENT × TASK — TRIPLE COVERAGE
        </span>
        {loading && <span style={{ color: AM, fontSize: 9 }}>LOADING…</span>}
        <button
          onClick={load}
          style={{ background: "none", border: `1px solid ${CY}44`, color: CY, fontSize: 9, padding: "2px 6px", cursor: "pointer", borderRadius: 3 }}
        >
          ↺
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: "#888", fontSize: 12, cursor: "pointer" }}
        >
          ✕
        </button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${CY}22` }}>
        {[
          ["COMMUNITIES", communities.length, CY],
          ["OPS EVENTS", opsEvents.length, AM],
          ["TASKS", tasks.length, LM],
          ["FULLY OPER.", fullyOpCount, CY],
          ["IDLE", idleCount, RD],
        ].map(([label, val, color]) => (
          <div
            key={label}
            style={{
              flex: 1,
              background: "#0a0a0a",
              border: `1px solid ${color}44`,
              borderRadius: 4,
              padding: "4px 6px",
              textAlign: "center",
            }}
          >
            <div style={{ color, fontSize: 14 }}>{val}</div>
            <div style={{ color: "#666", fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {communities.length > 0 && (
        <div style={{ padding: "4px 12px", borderBottom: `1px solid ${CY}22`, display: "flex", gap: 2, height: 6 }}>
          {[
            [fullyOpCount, CY],
            [opsTrigCount, AM],
            [taskedCount, LM],
            [idleCount, RD],
          ].map(([cnt, color], i) => (
            <div
              key={i}
              style={{
                width: `${(cnt / communities.length) * 100}%`,
                background: color,
                height: "100%",
                transition: "width .3s",
                borderRadius: 1,
              }}
            />
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, padding: "6px 12px", borderBottom: `1px solid ${CY}22` }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? `${CY}22` : "none",
              border: `1px solid ${tab === t ? CY : "#333"}`,
              color: tab === t ? CY : "#666",
              fontSize: 8,
              padding: "2px 6px",
              cursor: "pointer",
              borderRadius: 3,
              letterSpacing: 1,
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="SEARCH COMMUNITIES…"
          style={{
            marginLeft: "auto",
            background: "#111",
            border: `1px solid ${CY}44`,
            color: CY,
            fontSize: 9,
            padding: "2px 6px",
            borderRadius: 3,
            outline: "none",
            width: 160,
          }}
        />
      </div>

      {/* Community list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 12px" }}>
        {err && <div style={{ color: RD, fontSize: 9, padding: 8 }}>{err}</div>}
        {filtered.length === 0 && !loading && (
          <div style={{ color: "#555", fontSize: 9, padding: 12, textAlign: "center" }}>NO COMMUNITIES MATCH</div>
        )}
        {filtered.map((c, i) => {
          const cls = c._class;
          const color = classColor(cls);
          const isExp = expanded === i;
          const mOps = isExp ? matchedOps(c) : [];
          const mTasks = isExp ? matchedTasks(c) : [];
          return (
            <div
              key={i}
              style={{
                borderBottom: `1px solid ${CY}11`,
                padding: "5px 0",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                onClick={() => setExpanded(isExp ? null : i)}
              >
                <span style={{ color: "#444", fontSize: 9, width: 24, flexShrink: 0 }}>
                  {isExp ? "▼" : "▶"}
                </span>
                <span style={{ color: "#ccc", fontSize: 10, flex: 1 }}>
                  {c.label || c.id || `Community ${i + 1}`}
                </span>
                {chip(cls, color)}
                {c.members?.length > 0 && (
                  <span style={{ color: "#555", fontSize: 9 }}>{c.members.length} nodes</span>
                )}
              </div>
              {isExp && (
                <div style={{ display: "flex", gap: 8, marginTop: 8, paddingLeft: 30 }}>
                  {/* Matched ops events */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: AM, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>
                      OPS EVENTS
                    </div>
                    {mOps.length === 0 ? (
                      <div style={{ color: "#444", fontSize: 9 }}>none matched</div>
                    ) : (
                      mOps.map(({ ev, sc }, j) => (
                        <div key={j} style={{ marginBottom: 6 }}>
                          <div style={{ color: "#ccc", fontSize: 9, marginBottom: 2 }}>
                            {ev.name || ev.title || ev.description || `Event ${j + 1}`}
                          </div>
                          {ev.severity && (
                            <span style={{ color: RD, fontSize: 8, marginRight: 4, letterSpacing: 1 }}>
                              [{ev.severity.toUpperCase()}]
                            </span>
                          )}
                          <ScoreBar sc={sc} color={AM} />
                        </div>
                      ))
                    )}
                  </div>
                  {/* Matched tasks */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: LM, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>
                      TASKS
                    </div>
                    {mTasks.length === 0 ? (
                      <div style={{ color: "#444", fontSize: 9 }}>none matched</div>
                    ) : (
                      mTasks.map(({ tk, sc }, j) => (
                        <div key={j} style={{ marginBottom: 6 }}>
                          <div style={{ color: "#ccc", fontSize: 9, marginBottom: 2 }}>
                            {tk.name || tk.title || tk.description || `Task ${j + 1}`}
                          </div>
                          <div style={{ display: "flex", gap: 4, marginBottom: 2 }}>
                            {tk.status && chip(tk.status.toUpperCase(), LM)}
                            {tk.priority && chip(tk.priority.toUpperCase(), AM)}
                          </div>
                          <ScoreBar sc={sc} color={LM} />
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

      {/* Assess */}
      <div style={{ padding: "8px 12px", borderTop: `1px solid ${CY}22` }}>
        {assessText && (
          <div style={{ color: "#aaa", fontSize: 9, marginBottom: 6, lineHeight: 1.5 }}>
            {assessText}
          </div>
        )}
        <button
          onClick={assess}
          disabled={assessing || loading}
          style={{
            background: `${CY}22`,
            border: `1px solid ${CY}`,
            color: CY,
            fontSize: 9,
            padding: "4px 12px",
            cursor: assessing ? "wait" : "pointer",
            borderRadius: 3,
            letterSpacing: 1,
          }}
        >
          {assessing ? "ASSESSING…" : "▶ ASSESS COMMUNITY COVERAGE"}
        </button>
      </div>
    </div>
  );
}
