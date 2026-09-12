import { useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const AM = "#FFB300";
const GN = "#4ADE80";
const RD = "#FF4444";
const LM = "#84CC16";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_KEY) ||
  "dev-key";

const GNLIT_RE =
  /\b(gnlit|graph[._-]?live[._-]?task|live[._-]?node[._-]?task|node[._-]?live[._-]?task|reactive[._-]?node|live[._-]?graph[._-]?task|graph[._-]?world[._-]?task|node[._-]?world[._-]?task|live[._-]?task[._-]?node|world[._-]?node[._-]?task|active[._-]?node[._-]?task|graph[._-]?live[._-]?intel[._-]?task|live[._-]?intel[._-]?node|fully[._-]?reactive[._-]?node)\b/i;

export function isGnlitQuery(t) {
  return GNLIT_RE.test(t || "");
}

function tok(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function overlap(a, b) {
  const sa = new Set(tok(a));
  const sb = tok(b);
  if (!sa.size || !sb.length) return 0;
  let hits = 0;
  for (const w of sb) if (sa.has(w)) hits++;
  return hits / Math.max(sa.size, sb.length);
}

function nodeHaystack(n) {
  return [
    n.label, n.name, n.id, n.type, n.category, n.domain,
    ...(Array.isArray(n.tags) ? n.tags : []),
  ].join(" ");
}

function liveEventNeedle(ev) {
  return [
    ev.place, ev.region, ev.country, ev.type,
    ev.currency, ev.symbol, ev.name, ev.pair,
    ev.description || "",
  ].join(" ");
}

function taskNeedle(t) {
  return [
    t.title, t.name, t.description, t.mission, t.priority, t.type,
    ...(Array.isArray(t.tags) ? t.tags : []),
  ].join(" ");
}

function normaliseNodes(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.nodes)   ? raw.nodes
    : Array.isArray(raw?.items)   ? raw.items
    : Array.isArray(raw?.results) ? raw.results
    : Array.isArray(raw?.data)    ? raw.data
    : [];
  return arr.slice(0, 60).map((n, i) => ({
    id:        n.id        || n.node_id  || String(i),
    label:     n.label     || n.name     || n.id || `Node ${i + 1}`,
    type:      n.type      || n.category || "",
    influence: n.influence || n.score    || n.centrality || n.degree || 0,
    domain:    n.domain    || "",
    tags:      Array.isArray(n.tags) ? n.tags.join(" ") : (n.tags || ""),
  }));
}

function normaliseLiveIntel(raw) {
  if (!raw) return [];
  const events = [];
  const quakes = Array.isArray(raw?.earthquakes) ? raw.earthquakes
    : Array.isArray(raw?.quakes) ? raw.quakes : [];
  for (const q of quakes) {
    events.push({
      type: "SEISMIC",
      place: q.place || q.location || "",
      region: q.region || "",
      country: q.country || "",
      magnitude: q.magnitude || q.mag || 0,
      description: `${q.magnitude || q.mag || "?"} magnitude event near ${q.place || "unknown"}`,
    });
  }
  const crypto = Array.isArray(raw?.crypto) ? raw.crypto
    : Array.isArray(raw?.cryptocurrency) ? raw.cryptocurrency : [];
  for (const c of crypto) {
    events.push({
      type: "CRYPTO",
      symbol: c.symbol || c.currency || "",
      name: c.name || c.symbol || "",
      pair: c.pair || "",
      description: `${c.symbol || c.name}: ${c.change_24h || c.change || "?"} 24h change`,
    });
  }
  const fx = Array.isArray(raw?.fx) ? raw.fx
    : Array.isArray(raw?.forex) ? raw.forex : [];
  for (const f of fx) {
    events.push({
      type: "FX",
      pair: f.pair || "",
      name: f.pair || "",
      description: `FX ${f.pair}: rate ${f.rate || "?"}`,
    });
  }
  return events;
}

function normaliseTasks(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.tasks)   ? raw.tasks
    : Array.isArray(raw?.items)   ? raw.items
    : Array.isArray(raw?.results) ? raw.results
    : Array.isArray(raw?.data)    ? raw.data
    : [];
  return arr.map((t, i) => ({
    id:          t.id          || String(i),
    title:       t.title       || t.name    || t.mission || `Task ${i + 1}`,
    description: (t.description || t.body   || t.notes   || "").toString().slice(0, 200),
    status:      t.status      || t.state   || "",
    priority:    t.priority    || t.urgency || "",
    tags:        Array.isArray(t.tags) ? t.tags.join(" ") : (t.tags || ""),
  }));
}

function classify(node, liveEvents, tasks) {
  const hay = nodeHaystack(node);
  const hasLive = liveEvents.some((ev) => overlap(hay, liveEventNeedle(ev)) > 0.10);
  const hasTask = tasks.some((t)  => overlap(hay, taskNeedle(t))           > 0.10);
  if (hasLive && hasTask) return "FULLY REACTIVE";
  if (hasLive)            return "LIVE-ONLY";
  if (hasTask)            return "TASKED";
  return "DORMANT";
}

function matchedLiveEvents(node, liveEvents) {
  const hay = nodeHaystack(node);
  return liveEvents
    .map((ev) => ({ ev, sc: overlap(hay, liveEventNeedle(ev)) }))
    .filter((x) => x.sc > 0.05)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, 5);
}

function matchedTasks(node, tasks) {
  const hay = nodeHaystack(node);
  return tasks
    .map((t) => ({ t, sc: overlap(hay, taskNeedle(t)) }))
    .filter((x) => x.sc > 0.05)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, 5);
}

export async function buildGnlitScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [nodeR, intelR, taskR] = await Promise.allSettled([
      fetch(`${base}/v1/graph/centrality`,       { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/functions/getLiveIntel`,     { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/entities/Task`,              { headers: hdr }).then((r) => r.json()),
    ]);
    const nodes      = normaliseNodes(nodeR.status === "fulfilled" ? nodeR.value : []);
    const liveEvents = normaliseLiveIntel(intelR.status === "fulfilled" ? intelR.value : []);
    const tasks      = normaliseTasks(taskR.status === "fulfilled" ? taskR.value : []);
    const enriched   = nodes.map((n) => ({ ...n, _class: classify(n, liveEvents, tasks) }));
    const fullyReactive = enriched.filter((n) => n._class === "FULLY REACTIVE").length;
    const liveOnly      = enriched.filter((n) => n._class === "LIVE-ONLY").length;
    const tasked        = enriched.filter((n) => n._class === "TASKED").length;
    const dormant       = enriched.filter((n) => n._class === "DORMANT").length;
    const topReactive   = enriched.filter((n) => n._class === "FULLY REACTIVE").slice(0, 3)
      .map((n) => n.label).join(", ") || "none";
    const topDormant    = enriched.filter((n) => n._class === "DORMANT").slice(0, 3)
      .map((n) => n.label).join(", ") || "none";
    return (
      `Graph Node × Live Intel × Task Triple: ${nodes.length} top-influence nodes, ` +
      `${liveEvents.length} live world events, ${tasks.length} active tasks. ` +
      `${fullyReactive} nodes FULLY REACTIVE (live event + task coverage); ` +
      `${liveOnly} LIVE-ONLY (no task response); ${tasked} TASKED (no live trigger); ` +
      `${dormant} DORMANT (no coverage). ` +
      `Most reactive nodes: ${topReactive}. Dormant high-influence nodes: ${topDormant}.`
    );
  } catch (e) {
    return `Graph node live intel task assessment failed: ${String(e)}`;
  }
}

const TABS = ["ALL", "FULLY REACTIVE", "LIVE-ONLY", "TASKED", "DORMANT"];

const chip = (label, color = CY) => (
  <span
    style={{
      display: "inline-block", padding: "1px 6px", borderRadius: 3,
      border: `1px solid ${color}44`, background: `${color}14`,
      color, fontSize: 9, letterSpacing: 1, marginRight: 3,
    }}
  >{label}</span>
);

const ScoreBar = ({ sc, color }) => (
  <div style={{ display: "inline-flex", alignItems: "center", gap: 3, verticalAlign: "middle" }}>
    <div style={{ width: 52, height: 3, background: "#1a2535", borderRadius: 2, overflow: "hidden" }}>
      <div style={{ width: `${Math.round(sc * 100)}%`, height: "100%", background: color, borderRadius: 2 }} />
    </div>
    <span style={{ color: "#6E8AA0", fontSize: 9 }}>{Math.round(sc * 100)}%</span>
  </div>
);

const classColor = (cl) => {
  if (cl === "FULLY REACTIVE") return CY;
  if (cl === "LIVE-ONLY")      return AM;
  if (cl === "TASKED")         return GN;
  return "#444";
};

const liveTypeColor = (t) => {
  if (t === "SEISMIC") return RD;
  if (t === "CRYPTO")  return AM;
  if (t === "FX")      return LM;
  return CY;
};

const statusColor = (s) => {
  const v = (s || "").toLowerCase();
  if (v === "complete" || v === "done") return GN;
  if (v === "active" || v === "in_progress") return CY;
  if (v === "blocked" || v === "failed") return RD;
  return AM;
};

const mono = { fontFamily: "'JetBrains Mono',monospace" };

export default function GraphNodeLiveIntelTaskTriple() {
  const [open, setOpen]             = useState(false);
  const [nodes, setNodes]           = useState([]);
  const [liveEvents, setLiveEvents] = useState([]);
  const [tasks, setTasks]           = useState([]);
  const [loading, setLoading]       = useState(false);
  const [tab, setTab]               = useState("ALL");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [assessText, setAssessText] = useState("");
  const [err, setErr]               = useState("");
  const timerRef                    = useRef(null);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [nodeR, intelR, taskR] = await Promise.allSettled([
        fetch(`${base}/v1/graph/centrality`,   { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/functions/getLiveIntel`, { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/entities/Task`,          { headers: hdr }).then((r) => r.json()),
      ]);
      setNodes(normaliseNodes(nodeR.status === "fulfilled" ? nodeR.value : []));
      setLiveEvents(normaliseLiveIntel(intelR.status === "fulfilled" ? intelR.value : []));
      setTasks(normaliseTasks(taskR.status === "fulfilled" ? taskR.value : []));
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
    window.addEventListener("jarvis:gnlit-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gnlit-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, 60_000);
    return () => clearInterval(timerRef.current);
  }, [open]);

  const enriched = nodes.map((n) => ({
    ...n,
    _class:  classify(n, liveEvents, tasks),
    _live:   matchedLiveEvents(n, liveEvents),
    _tasks:  matchedTasks(n, tasks),
  }));

  const fullyReactiveCount = enriched.filter((n) => n._class === "FULLY REACTIVE").length;
  const liveOnlyCount      = enriched.filter((n) => n._class === "LIVE-ONLY").length;
  const taskedCount        = enriched.filter((n) => n._class === "TASKED").length;
  const dormantCount       = enriched.filter((n) => n._class === "DORMANT").length;

  const filtered = enriched.filter((n) => {
    if (tab !== "ALL" && n._class !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        n.label.toLowerCase().includes(q) ||
        (n.type || "").toLowerCase().includes(q) ||
        (n.domain || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    setAssessText("");
    try {
      const script = await buildGnlitScript();
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
      setAssessText(await buildGnlitScript());
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Graph Node × Live Intel × Task Triple (GNLIT)"
        style={{
          position: "fixed",
          left: 731120,
          bottom: 8,
          zIndex: 334,
          background: fullyReactiveCount > 0 ? `${CY}22` : "#0a0a0a",
          border: `1px solid ${fullyReactiveCount > 0 ? CY : "#333"}`,
          color: fullyReactiveCount > 0 ? CY : "#888",
          ...mono,
          fontSize: 9,
          padding: "3px 7px",
          borderRadius: 3,
          cursor: "pointer",
          letterSpacing: 1,
        }}
      >
        ◈ GNLIT{fullyReactiveCount > 0 ? ` ▲${fullyReactiveCount}` : ""}
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 40,
        left: "50%",
        transform: "translateX(-50%)",
        width: 820,
        maxHeight: "85vh",
        overflowY: "auto",
        background: "#060810",
        border: "1px solid #1a2a3a",
        borderRadius: 6,
        zIndex: 9502,
        ...mono,
        fontSize: 11,
        color: "#ccc",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #1a2a3a", gap: 8 }}>
        <span style={{ color: CY, fontSize: 13, fontWeight: 700, flex: 1 }}>
          ◈ GRAPH NODE × LIVE INTEL × TASK TRIPLE
        </span>
        {loading && <span style={{ color: "#555", fontSize: 9 }}>LOADING…</span>}
        <button
          onClick={assess}
          disabled={assessing}
          style={{ background: "#111", border: `1px solid ${CY}`, color: CY, fontSize: 9, padding: "2px 8px", borderRadius: 3, cursor: "pointer" }}
        >
          {assessing ? "ASSESSING…" : "▶ ASSESS"}
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: "#555", fontSize: 14, cursor: "pointer" }}
        >✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "10px 14px", borderBottom: "1px solid #111" }}>
        {[
          ["GRAPH NODES",       nodes.length,           "#888"],
          ["LIVE EVENTS",       liveEvents.length,       "#888"],
          ["TASKS",             tasks.length,            "#888"],
          ["FULLY REACTIVE",    fullyReactiveCount,      CY],
          ["LIVE-ONLY",         liveOnlyCount,           AM],
          ["TASKED",            taskedCount,             GN],
          ["DORMANT",           dormantCount,            "#444"],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: 1, background: "#0c0c0c", border: "1px solid #1a1a1a", borderRadius: 3, padding: "6px 4px", textAlign: "center" }}>
            <div style={{ color, fontSize: 15, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#555", fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* coverage bar */}
      {nodes.length > 0 && (
        <div style={{ padding: "6px 14px", borderBottom: "1px solid #111" }}>
          <div style={{ display: "flex", height: 5, borderRadius: 3, overflow: "hidden" }}>
            {[
              [fullyReactiveCount, CY],
              [liveOnlyCount,      AM],
              [taskedCount,        GN],
              [dormantCount,       "#333"],
            ].map(([count, color], i) => (
              <div
                key={i}
                style={{ width: `${(count / nodes.length) * 100}%`, background: color }}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 9, color: "#555" }}>
            {[["● FULLY REACTIVE", CY], ["● LIVE-ONLY", AM], ["● TASKED", GN], ["● DORMANT", "#555"]].map(([lbl, c]) => (
              <span key={lbl} style={{ color: c }}>{lbl}</span>
            ))}
          </div>
        </div>
      )}

      {/* tabs + search */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 14px", borderBottom: "1px solid #111", flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? `${CY}22` : "none",
              border: `1px solid ${tab === t ? CY : "#333"}`,
              color: tab === t ? CY : "#666",
              fontSize: 9, padding: "2px 8px", borderRadius: 3, cursor: "pointer", ...mono,
            }}
          >{t}</button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search nodes…"
          style={{
            marginLeft: "auto", background: "#0c0c0c", border: "1px solid #222",
            color: "#aaa", fontSize: 9, padding: "2px 8px", borderRadius: 3,
            outline: "none", width: 140, ...mono,
          }}
        />
      </div>

      {/* assess result */}
      {assessText && (
        <div style={{ padding: "8px 14px", background: "#0a0e14", borderBottom: "1px solid #111", color: CY, fontSize: 10, lineHeight: 1.5 }}>
          {assessText}
        </div>
      )}

      {err && (
        <div style={{ padding: "6px 14px", color: RD, fontSize: 9 }}>ERROR: {err}</div>
      )}

      {/* node list */}
      <div>
        {filtered.map((n) => {
          const isExp = expanded === n.id;
          const cl    = n._class;
          const clr   = classColor(cl);
          return (
            <div
              key={n.id}
              style={{ borderBottom: "1px solid #0d1420", cursor: "pointer" }}
              onClick={() => setExpanded(isExp ? null : n.id)}
            >
              <div style={{ display: "flex", alignItems: "center", padding: "7px 14px", gap: 8 }}>
                <span style={{ color: clr, fontSize: 9, minWidth: 90, letterSpacing: 0.5 }}>{cl}</span>
                <span style={{ flex: 1, color: "#ccc", fontSize: 10 }}>{n.label}</span>
                {n.type && chip(n.type, "#6E8AA0")}
                {n.influence > 0 && (
                  <span style={{ color: "#555", fontSize: 9 }}>⟨{typeof n.influence === "number" ? n.influence.toFixed(2) : n.influence}⟩</span>
                )}
                <span style={{ color: "#444", fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "0 14px 10px 14px", display: "flex", gap: 10 }}>
                  {/* left: live events */}
                  <div style={{ flex: 1, borderRight: "1px solid #111", paddingRight: 10 }}>
                    <div style={{ color: AM, fontSize: 8, letterSpacing: 1, marginBottom: 5 }}>LIVE WORLD EVENTS ({n._live.length})</div>
                    {n._live.length === 0
                      ? <div style={{ color: "#333", fontSize: 9 }}>no live event alignment</div>
                      : n._live.map(({ ev, sc }, i) => (
                          <div key={i} style={{ marginBottom: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 1 }}>
                              {chip(ev.type, liveTypeColor(ev.type))}
                              <span style={{ color: "#aaa", fontSize: 9, flex: 1 }}>
                                {ev.place || ev.symbol || ev.pair || ev.name || "event"}
                              </span>
                              <ScoreBar sc={sc} color={AM} />
                            </div>
                            {ev.description && (
                              <div style={{ color: "#555", fontSize: 8, paddingLeft: 2 }}>{ev.description.slice(0, 80)}</div>
                            )}
                          </div>
                        ))
                    }
                  </div>
                  {/* right: tasks */}
                  <div style={{ flex: 1, paddingLeft: 10 }}>
                    <div style={{ color: GN, fontSize: 8, letterSpacing: 1, marginBottom: 5 }}>ACTIVE TASKS ({n._tasks.length})</div>
                    {n._tasks.length === 0
                      ? <div style={{ color: "#333", fontSize: 9 }}>no task coverage</div>
                      : n._tasks.map(({ t, sc }, i) => (
                          <div key={i} style={{ marginBottom: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 1 }}>
                              {t.status && chip(t.status, statusColor(t.status))}
                              {t.priority && chip(t.priority, AM)}
                              <span style={{ color: "#aaa", fontSize: 9, flex: 1 }}>{t.title}</span>
                              <ScoreBar sc={sc} color={GN} />
                            </div>
                          </div>
                        ))
                    }
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && !loading && (
          <div style={{ padding: 20, color: "#333", textAlign: "center", fontSize: 10 }}>
            no nodes match current filter
          </div>
        )}
      </div>
    </div>
  );
}
