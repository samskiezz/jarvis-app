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

const SCENE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const LGNS_RE =
  /\b(lgns|live[._-]?graph[._-]?scene|live[._-]?node[._-]?scene|world[._-]?graph[._-]?scene|live[._-]?event[._-]?mapping|unmapped[._-]?world[._-]?event|live[._-]?intel[._-]?graph[._-]?scene|scene[._-]?node[._-]?live|world[._-]?live[._-]?scene|live[._-]?scene[._-]?node|intel[._-]?scene[._-]?graph|event[._-]?scene[._-]?coverage)\b/i;

export function isLgnsQuery(t) {
  return LGNS_RE.test(t || "");
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

function liveEventHaystack(ev) {
  return [
    ev.place, ev.region, ev.country, ev.type,
    ev.currency, ev.symbol, ev.name, ev.pair,
    ev.description || "",
  ].join(" ");
}

function nodeNeedle(n) {
  return [n.label, n.type, n.domain, n.tags].join(" ");
}

function sceneNeedle(sc) {
  return [sc.label, sc.anchors].join(" ");
}

function normaliseLiveIntel(raw) {
  if (!raw) return [];
  const events = [];
  const quakes = Array.isArray(raw?.earthquakes) ? raw.earthquakes
    : Array.isArray(raw?.quakes) ? raw.quakes : [];
  for (const q of quakes) {
    events.push({
      id: `q-${q.place || events.length}`,
      type: "SEISMIC",
      place: q.place || q.location || "",
      region: q.region || "",
      country: q.country || "",
      symbol: "", name: "", pair: "", currency: "",
      description: `${q.magnitude || q.mag || "?"} magnitude event near ${q.place || "unknown"}`,
    });
  }
  const crypto = Array.isArray(raw?.crypto) ? raw.crypto
    : Array.isArray(raw?.cryptocurrency) ? raw.cryptocurrency : [];
  for (const c of crypto) {
    events.push({
      id: `c-${c.symbol || events.length}`,
      type: "CRYPTO",
      place: "", region: "", country: "",
      symbol: c.symbol || c.currency || "",
      name: c.name || c.symbol || "",
      pair: c.pair || "",
      currency: c.currency || "",
      description: `${c.symbol || c.name}: ${c.change_24h || c.change || "?"} 24h change`,
    });
  }
  const fx = Array.isArray(raw?.fx) ? raw.fx
    : Array.isArray(raw?.forex) ? raw.forex : [];
  for (const f of fx) {
    events.push({
      id: `fx-${f.pair || events.length}`,
      type: "FX",
      place: "", region: "", country: "",
      symbol: "", name: f.pair || "", pair: f.pair || "", currency: "",
      description: `FX ${f.pair}: rate ${f.rate || "?"}`,
    });
  }
  return events;
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

function normaliseScene(raw, id) {
  if (!raw) return null;
  const title =
    raw.title ?? raw.name ?? raw.label ??
    (Array.isArray(raw.anchors) ? raw.anchors[0]?.label : undefined) ??
    `Scene ${id}`;
  const anchors = Array.isArray(raw.anchors)
    ? raw.anchors.map((a) => a.label ?? a.title ?? a.text ?? String(a)).join(" ")
    : String(raw.description ?? raw.summary ?? "");
  return {
    id: String(id),
    label: `Scene ${String(id).padStart(2, "0")} — ${title}`,
    anchors,
  };
}

function classify(ev, nodes, scenes) {
  const hay = liveEventHaystack(ev);
  const hasNode  = nodes.some((n)  => overlap(hay, nodeNeedle(n))  > 0.10);
  const hasScene = scenes.some((sc) => overlap(hay, sceneNeedle(sc)) > 0.10);
  if (hasNode && hasScene) return "FULLY MAPPED";
  if (hasNode)             return "NODE-ONLY";
  if (hasScene)            return "SCENE-ONLY";
  return "UNMAPPED";
}

function matchedNodes(ev, nodes) {
  const hay = liveEventHaystack(ev);
  return nodes
    .map((n) => ({ n, sc: overlap(hay, nodeNeedle(n)) }))
    .filter((x) => x.sc > 0.05)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, 5);
}

function matchedScenes(ev, scenes) {
  const hay = liveEventHaystack(ev);
  return scenes
    .map((sc) => ({ sc, score: overlap(hay, sceneNeedle(sc)) }))
    .filter((x) => x.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export async function buildLgnsScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [intelR, nodeR, ...sceneResults] = await Promise.allSettled([
      fetch(`${base}/functions/getLiveIntel`,  { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/v1/graph/centrality`,     { headers: hdr }).then((r) => r.json()),
      ...SCENE_IDS.map((id) =>
        fetch(`${base}/v1/cinematic/scene/${id}`, { headers: hdr })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      ),
    ]);
    const liveEvents = normaliseLiveIntel(intelR.status === "fulfilled" ? intelR.value : []);
    const nodes      = normaliseNodes(nodeR.status === "fulfilled" ? nodeR.value : []);
    const scenes     = sceneResults
      .map((r, i) => normaliseScene(r.status === "fulfilled" ? r.value : null, SCENE_IDS[i]))
      .filter(Boolean);
    const enriched     = liveEvents.map((ev) => ({ ...ev, _class: classify(ev, nodes, scenes) }));
    const fullyMapped  = enriched.filter((e) => e._class === "FULLY MAPPED").length;
    const nodeOnly     = enriched.filter((e) => e._class === "NODE-ONLY").length;
    const sceneOnly    = enriched.filter((e) => e._class === "SCENE-ONLY").length;
    const unmapped     = enriched.filter((e) => e._class === "UNMAPPED").length;
    const topMapped    = enriched.filter((e) => e._class === "FULLY MAPPED").slice(0, 3)
      .map((e) => e.place || e.symbol || e.pair || e.name || "event").join(", ") || "none";
    const topUnmapped  = enriched.filter((e) => e._class === "UNMAPPED").slice(0, 3)
      .map((e) => e.place || e.symbol || e.pair || e.name || "event").join(", ") || "none";
    return (
      `Live Intel × Graph Node × Scene Triple (LGNS): ${liveEvents.length} world events, ` +
      `${nodes.length} graph nodes, ${scenes.length} cinematic scenes. ` +
      `${fullyMapped} FULLY MAPPED (node + scene coverage); ` +
      `${nodeOnly} NODE-ONLY (graph node but no scene anchor); ` +
      `${sceneOnly} SCENE-ONLY (scene anchor but no node); ` +
      `${unmapped} UNMAPPED (no node or scene coverage — intelligence gap). ` +
      `Top mapped events: ${topMapped}. Top unmapped: ${topUnmapped}.`
    );
  } catch (e) {
    return `Live intel graph node scene triple assessment failed: ${String(e)}`;
  }
}

const TABS = ["ALL", "FULLY MAPPED", "NODE-ONLY", "SCENE-ONLY", "UNMAPPED"];

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
  if (cl === "FULLY MAPPED") return CY;
  if (cl === "NODE-ONLY")    return GN;
  if (cl === "SCENE-ONLY")   return LM;
  return AM;
};

const liveTypeColor = (t) => {
  if (t === "SEISMIC") return RD;
  if (t === "CRYPTO")  return AM;
  if (t === "FX")      return LM;
  return CY;
};

const mono = { fontFamily: "'JetBrains Mono',monospace" };

export default function LiveIntelGraphNodeSceneCoverage() {
  const [open, setOpen]           = useState(false);
  const [liveEvents, setLiveEvents] = useState([]);
  const [nodes, setNodes]         = useState([]);
  const [scenes, setScenes]       = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");
  const [err, setErr]             = useState("");
  const timerRef                  = useRef(null);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [intelR, nodeR, ...sceneResults] = await Promise.allSettled([
        fetch(`${base}/functions/getLiveIntel`,  { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/v1/graph/centrality`,     { headers: hdr }).then((r) => r.json()),
        ...SCENE_IDS.map((id) =>
          fetch(`${base}/v1/cinematic/scene/${id}`, { headers: hdr })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
        ),
      ]);
      setLiveEvents(normaliseLiveIntel(intelR.status === "fulfilled" ? intelR.value : []));
      setNodes(normaliseNodes(nodeR.status === "fulfilled" ? nodeR.value : []));
      setScenes(
        sceneResults
          .map((r, i) => normaliseScene(r.status === "fulfilled" ? r.value : null, SCENE_IDS[i]))
          .filter(Boolean)
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
    window.addEventListener("jarvis:lgns-toggle", onToggle);
    return () => window.removeEventListener("jarvis:lgns-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, 60_000);
    return () => clearInterval(timerRef.current);
  }, [open]);

  const enriched = liveEvents.map((ev) => ({
    ...ev,
    _class:  classify(ev, nodes, scenes),
    _nodes:  matchedNodes(ev, nodes),
    _scenes: matchedScenes(ev, scenes),
  }));

  const fullyMappedCount = enriched.filter((e) => e._class === "FULLY MAPPED").length;
  const nodeOnlyCount    = enriched.filter((e) => e._class === "NODE-ONLY").length;
  const sceneOnlyCount   = enriched.filter((e) => e._class === "SCENE-ONLY").length;
  const unmappedCount    = enriched.filter((e) => e._class === "UNMAPPED").length;

  const filtered = enriched.filter((ev) => {
    if (tab !== "ALL" && ev._class !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (ev.place || "").toLowerCase().includes(q) ||
        (ev.symbol || "").toLowerCase().includes(q) ||
        (ev.pair || "").toLowerCase().includes(q) ||
        (ev.name || "").toLowerCase().includes(q) ||
        ev.type.toLowerCase().includes(q)
      );
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    setAssessText("");
    try {
      const script = await buildLgnsScript();
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
      setAssessText(await buildLgnsScript());
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Live Intel × Graph Node × Scene Triple (LGNS)"
        style={{
          position: "fixed",
          left: 770880,
          bottom: 8,
          zIndex: 405,
          background: unmappedCount > 0 ? `${AM}22` : "#0a0a0a",
          border: `1px solid ${unmappedCount > 0 ? AM : "#333"}`,
          color: unmappedCount > 0 ? AM : "#888",
          ...mono,
          fontSize: 9,
          padding: "3px 7px",
          borderRadius: 3,
          cursor: "pointer",
          letterSpacing: 1,
        }}
      >
        ◈ LGNS{unmappedCount > 0 ? ` ▲${unmappedCount}` : ""}
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
        zIndex: 9503,
        ...mono,
        fontSize: 11,
        color: "#ccc",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #1a2a3a", gap: 8 }}>
        <span style={{ color: CY, fontSize: 13, fontWeight: 700, flex: 1 }}>
          ◈ LIVE INTEL × GRAPH NODE × SCENE TRIPLE
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
          ["LIVE EVENTS",   liveEvents.length, "#888"],
          ["GRAPH NODES",   nodes.length,      "#888"],
          ["SCENES",        scenes.length,     "#888"],
          ["FULLY MAPPED",  fullyMappedCount,  CY],
          ["NODE-ONLY",     nodeOnlyCount,     GN],
          ["SCENE-ONLY",    sceneOnlyCount,    LM],
          ["UNMAPPED",      unmappedCount,     AM],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: 1, background: "#0c0c0c", border: "1px solid #1a1a1a", borderRadius: 3, padding: "6px 4px", textAlign: "center" }}>
            <div style={{ color, fontSize: 15, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#555", fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* coverage bar */}
      {liveEvents.length > 0 && (
        <div style={{ padding: "6px 14px", borderBottom: "1px solid #111" }}>
          <div style={{ display: "flex", height: 5, borderRadius: 3, overflow: "hidden" }}>
            {[
              [fullyMappedCount, CY],
              [nodeOnlyCount,    GN],
              [sceneOnlyCount,   LM],
              [unmappedCount,    AM],
            ].map(([count, color], i) => (
              <div
                key={i}
                style={{ width: `${(count / liveEvents.length) * 100}%`, background: color }}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 9, color: "#555" }}>
            {[["● FULLY MAPPED", CY], ["● NODE-ONLY", GN], ["● SCENE-ONLY", LM], ["● UNMAPPED", AM]].map(([lbl, c]) => (
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
          placeholder="search events…"
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

      {/* event list */}
      <div>
        {filtered.map((ev) => {
          const isExp = expanded === ev.id;
          const cl    = ev._class;
          const clr   = classColor(cl);
          const label = ev.place || ev.symbol || ev.pair || ev.name || "event";
          return (
            <div
              key={ev.id}
              style={{ borderBottom: "1px solid #0d1420", cursor: "pointer" }}
              onClick={() => setExpanded(isExp ? null : ev.id)}
            >
              <div style={{ display: "flex", alignItems: "center", padding: "7px 14px", gap: 8 }}>
                <span style={{ color: clr, fontSize: 9, minWidth: 90, letterSpacing: 0.5 }}>{cl}</span>
                {chip(ev.type, liveTypeColor(ev.type))}
                <span style={{ flex: 1, color: "#ccc", fontSize: 10 }}>{label}</span>
                <span style={{ color: "#555", fontSize: 9 }}>N:{ev._nodes.length} S:{ev._scenes.length}</span>
                <span style={{ color: "#444", fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "0 14px 10px 14px" }}>
                  {ev.description && (
                    <div style={{ color: "#666", fontSize: 9, marginBottom: 8, paddingLeft: 2 }}>{ev.description}</div>
                  )}
                  <div style={{ display: "flex", gap: 10 }}>
                    {/* left: graph nodes */}
                    <div style={{ flex: 1, borderRight: "1px solid #111", paddingRight: 10 }}>
                      <div style={{ color: GN, fontSize: 8, letterSpacing: 1, marginBottom: 5 }}>GRAPH NODES ({ev._nodes.length})</div>
                      {ev._nodes.length === 0
                        ? <div style={{ color: "#333", fontSize: 9 }}>no graph node alignment</div>
                        : ev._nodes.map(({ n, sc }, i) => (
                            <div key={i} style={{ marginBottom: 4 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                {n.type && chip(n.type, "#6E8AA0")}
                                <span style={{ color: "#aaa", fontSize: 9, flex: 1 }}>{n.label}</span>
                                <ScoreBar sc={sc} color={GN} />
                              </div>
                            </div>
                          ))
                      }
                    </div>
                    {/* right: scenes */}
                    <div style={{ flex: 1, paddingLeft: 10 }}>
                      <div style={{ color: LM, fontSize: 8, letterSpacing: 1, marginBottom: 5 }}>SCENES ({ev._scenes.length})</div>
                      {ev._scenes.length === 0
                        ? <div style={{ color: "#333", fontSize: 9 }}>no scene anchor alignment</div>
                        : ev._scenes.map(({ sc, score }, i) => (
                            <div key={i} style={{ marginBottom: 4 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <span style={{ color: "#aaa", fontSize: 9, flex: 1 }}>{sc.label}</span>
                                <ScoreBar sc={score} color={LM} />
                              </div>
                            </div>
                          ))
                      }
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && !loading && (
          <div style={{ padding: 20, color: "#333", textAlign: "center", fontSize: 10 }}>
            no events match current filter
          </div>
        )}
      </div>
    </div>
  );
}
