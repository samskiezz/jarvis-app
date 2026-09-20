import { useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const AM = "#FFB300";
const GN = "#4ADE80";
const RD = "#FF4444";
const PU = "#A78BFA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_KEY) ||
  "dev-key";

const OKSRDY_RE =
  /\b(oksrdy|ops[._-]?ready|ops[._-]?readiness|ops[._-]?knowledge[._-]?scenario|ops[._-]?event[._-]?readiness|ops[._-]?kb[._-]?scenario|event[._-]?readiness[._-]?map|operational[._-]?readiness|how[._-]?ready[._-]?are[._-]?ops|ops[._-]?coverage[._-]?check)\b/i;

export function isOksrdyQuery(t) {
  return OKSRDY_RE.test(t || "");
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

function eventHaystack(ev) {
  return [
    ev.title, ev.name, ev.description, ev.event_type, ev.category,
    ev.kind, ev.service, ev.source,
    ...(Array.isArray(ev.tags) ? ev.tags : []),
  ].join(" ");
}

function articleNeedle(a) {
  return [a.title, a.category, a.summary, a.tags, a.author].join(" ");
}

function scenarioNeedle(s) {
  return [
    s.title, s.name, s.description, s.summary, s.category, s.type,
    ...(Array.isArray(s.tags) ? s.tags : []),
  ].join(" ");
}

function normaliseOpsEvents(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.events) ? raw.events
    : Array.isArray(raw?.items)  ? raw.items
    : Array.isArray(raw?.results) ? raw.results
    : Array.isArray(raw?.data)   ? raw.data
    : [];
  return arr.map((ev, i) => ({
    id:          ev.id       || String(i),
    title:       ev.title    || ev.name        || ev.event_type || `Event ${i + 1}`,
    description: (ev.description || ev.body    || ev.message    || "").toString().slice(0, 300),
    severity:    ev.severity || ev.level       || ev.priority    || "",
    category:    ev.category || ev.event_type  || ev.kind        || "",
    service:     ev.service  || ev.source      || "",
    tags:        Array.isArray(ev.tags) ? ev.tags.join(" ") : (ev.tags || ""),
    ts:          ev.timestamp || ev.created_at  || ev.time        || "",
  }));
}

function normaliseKB(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw)            ? raw
    : Array.isArray(raw?.articles)          ? raw.articles
    : Array.isArray(raw?.items)             ? raw.items
    : Array.isArray(raw?.results)           ? raw.results
    : Array.isArray(raw?.data)              ? raw.data
    : [];
  return arr.map((a, i) => ({
    id:       a.id       || a.slug      || String(i),
    title:    a.title    || a.name      || `Article ${i + 1}`,
    category: a.category || a.type      || a.domain || "",
    summary:  (a.summary || a.content   || a.body || a.description || "").toString().slice(0, 300),
    tags:     Array.isArray(a.tags) ? a.tags.join(" ") : (a.tags || ""),
    author:   a.author   || "",
  }));
}

function normaliseScenarios(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ["scenarios", "items", "results", "data", "records"]) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function classify(ev, articles, scenarios) {
  const hay = eventHaystack(ev);
  const hasKb  = articles .some((a) => overlap(hay, articleNeedle(a))  > 0.12);
  const hasSc  = scenarios.some((s) => overlap(hay, scenarioNeedle(s)) > 0.12);
  if (hasKb && hasSc) return "READY";
  if (hasKb)          return "KB-ONLY";
  if (hasSc)          return "SCENARIO-ONLY";
  return "BLIND";
}

function matchedKB(ev, articles) {
  const hay = eventHaystack(ev);
  return articles
    .map((a) => ({ a, sc: overlap(hay, articleNeedle(a)) }))
    .filter((x) => x.sc > 0.05)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, 5);
}

function matchedScenarios(ev, scenarios) {
  const hay = eventHaystack(ev);
  return scenarios
    .map((s) => ({ s, sc: overlap(hay, scenarioNeedle(s)) }))
    .filter((x) => x.sc > 0.05)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, 5);
}

export async function buildOksrdyScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [evR, kbR, scR] = await Promise.allSettled([
      fetch(`${base}/v1/ops/events`,    { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/knowledge/`,        { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/v1/scenario/list`, { headers: hdr }).then((r) => r.json()),
    ]);
    const events    = normaliseOpsEvents(evR.status === "fulfilled" ? evR.value : []).slice(0, 200);
    const articles  = normaliseKB(kbR.status === "fulfilled" ? kbR.value : []).slice(0, 200);
    const scenarios = normaliseScenarios(scR.status === "fulfilled" ? scR.value : []).slice(0, 200);
    const classified = events.map((ev) => ({ ...ev, _class: classify(ev, articles, scenarios) }));
    const ready    = classified.filter((e) => e._class === "READY").length;
    const kbOnly   = classified.filter((e) => e._class === "KB-ONLY").length;
    const scOnly   = classified.filter((e) => e._class === "SCENARIO-ONLY").length;
    const blind    = classified.filter((e) => e._class === "BLIND").length;
    const topBlind = classified.filter((e) => e._class === "BLIND").slice(0, 4)
      .map((e) => e.title).join(", ") || "none";
    return (
      `Ops Event × Knowledge × Scenario Readiness: ${events.length} events, ${articles.length} KB articles, ${scenarios.length} scenarios. ` +
      `${ready} events are FULLY READY (KB + scenario coverage); ${kbOnly} KB-ONLY; ${scOnly} SCENARIO-ONLY; ${blind} BLIND (no coverage). ` +
      `Top blind events: ${topBlind}. Recommend creating scenarios or KB articles for the blind events.`
    );
  } catch (e) {
    return `Ops readiness assessment failed: ${String(e)}`;
  }
}

const TABS = ["ALL", "READY", "KB-ONLY", "SCENARIO-ONLY", "BLIND"];

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
  if (cl === "READY")           return GN;
  if (cl === "KB-ONLY")         return CY;
  if (cl === "SCENARIO-ONLY")   return PU;
  return RD;
};

const severityColor = (sv) => {
  const s = (sv || "").toLowerCase();
  if (s === "critical" || s === "high") return RD;
  if (s === "warning" || s === "medium") return AM;
  if (s === "info" || s === "low") return CY;
  return "#6E8AA0";
};

const mono = { fontFamily: "'JetBrains Mono',monospace" };

export default function OpsEventKnowledgeScenarioReadiness() {
  const [open, setOpen]         = useState(false);
  const [events, setEvents]     = useState([]);
  const [articles, setArticles] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");
  const [err, setErr]           = useState("");
  const timerRef                = useRef(null);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [evR, kbR, scR] = await Promise.allSettled([
        fetch(`${base}/v1/ops/events`,    { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/knowledge/`,        { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/v1/scenario/list`, { headers: hdr }).then((r) => r.json()),
      ]);
      setEvents(normaliseOpsEvents(evR.status === "fulfilled" ? evR.value : []).slice(0, 200));
      setArticles(normaliseKB(kbR.status === "fulfilled" ? kbR.value : []).slice(0, 200));
      setScenarios(normaliseScenarios(scR.status === "fulfilled" ? scR.value : []).slice(0, 200));
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
    window.addEventListener("jarvis:oksrdy-toggle", onToggle);
    return () => window.removeEventListener("jarvis:oksrdy-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open]);

  const enriched = events.map((ev) => ({
    ...ev,
    _class: classify(ev, articles, scenarios),
    _kb:    matchedKB(ev, articles),
    _sc:    matchedScenarios(ev, scenarios),
  }));

  const readyCount  = enriched.filter((e) => e._class === "READY").length;
  const kbCount     = enriched.filter((e) => e._class === "KB-ONLY").length;
  const scCount     = enriched.filter((e) => e._class === "SCENARIO-ONLY").length;
  const blindCount  = enriched.filter((e) => e._class === "BLIND").length;

  const filtered = enriched.filter((e) => {
    if (tab !== "ALL" && e._class !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.title.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        (e.category || "").toLowerCase().includes(q) ||
        (e.service || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    setAssessText("");
    try {
      const script = await buildOksrdyScript();
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
      setAssessText(await buildOksrdyScript());
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Ops Event × Knowledge × Scenario Readiness (OKSRDY)"
        style={{
          position: "fixed",
          left: 730000,
          bottom: 8,
          zIndex: 332,
          background: blindCount > 0 ? `${AM}22` : "#0a0a0a",
          border: `1px solid ${blindCount > 0 ? AM : "#333"}`,
          color: blindCount > 0 ? AM : "#888",
          ...mono,
          fontSize: 9,
          padding: "3px 7px",
          borderRadius: 3,
          cursor: "pointer",
          letterSpacing: 1,
        }}
      >
        ◈ OKSRDY{blindCount > 0 ? ` ▲${blindCount}` : ""}
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
        width: 800,
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
        <span style={{ color: AM, fontSize: 13, fontWeight: 700, flex: 1 }}>
          ◈ OPS EVENT × KNOWLEDGE × SCENARIO READINESS
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
          ["OPS EVENTS", events.length, "#888"],
          ["KB ARTICLES", articles.length, "#888"],
          ["SCENARIOS", scenarios.length, "#888"],
          ["READY", readyCount, GN],
          ["KB-ONLY", kbCount, CY],
          ["SCENARIO-ONLY", scCount, PU],
          ["BLIND", blindCount, RD],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: 1, background: "#0c0c0c", border: "1px solid #1a1a1a", borderRadius: 3, padding: "6px 4px", textAlign: "center" }}>
            <div style={{ color, fontSize: 15, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#555", fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* coverage bar */}
      {events.length > 0 && (
        <div style={{ padding: "6px 14px", borderBottom: "1px solid #111" }}>
          <div style={{ display: "flex", height: 5, borderRadius: 3, overflow: "hidden" }}>
            {[
              [readyCount, GN],
              [kbCount,    CY],
              [scCount,    PU],
              [blindCount, RD],
            ].map(([count, color], i) => (
              <div
                key={i}
                style={{ width: `${(count / events.length) * 100}%`, background: color }}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 4, fontSize: 8, color: "#555" }}>
            {[["READY", GN], ["KB-ONLY", CY], ["SCENARIO-ONLY", PU], ["BLIND", RD]].map(([label, color]) => (
              <span key={label} style={{ color }}>{label}</span>
            ))}
          </div>
        </div>
      )}

      {/* assess text */}
      {assessText && (
        <div style={{ padding: "8px 14px", borderBottom: "1px solid #111", color: "#aaa", fontSize: 10, lineHeight: 1.6, background: "#080808" }}>
          {assessText}
        </div>
      )}

      {/* search + tabs */}
      <div style={{ padding: "8px 14px", borderBottom: "1px solid #111", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ops events…"
          style={{
            background: "#0c0c0c", border: "1px solid #222", color: "#ccc",
            padding: "3px 8px", borderRadius: 3, fontSize: 10, flex: 1, minWidth: 120, outline: "none",
          }}
        />
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? `${AM}22` : "none",
              border: `1px solid ${tab === t ? AM : "#222"}`,
              color: tab === t ? AM : "#555",
              fontSize: 8, padding: "2px 6px", borderRadius: 3, cursor: "pointer", letterSpacing: 1,
            }}
          >{t}</button>
        ))}
      </div>

      {err && <div style={{ padding: "6px 14px", color: RD, fontSize: 9 }}>ERROR: {err}</div>}

      {/* rows */}
      <div style={{ padding: "6px 0" }}>
        {filtered.length === 0 && (
          <div style={{ padding: "16px 14px", color: "#444", textAlign: "center", fontSize: 10 }}>
            {loading ? "Loading…" : "No ops events match the current filter."}
          </div>
        )}
        {filtered.map((ev) => {
          const isExp = expanded === ev.id;
          const cc = classColor(ev._class);
          return (
            <div key={ev.id} style={{ borderBottom: "1px solid #0d0d0d" }}>
              <div
                onClick={() => setExpanded(isExp ? null : ev.id)}
                style={{ display: "flex", alignItems: "center", padding: "7px 14px", gap: 8, cursor: "pointer" }}
              >
                <span style={{ color: cc, fontSize: 9, minWidth: 120, letterSpacing: 1 }}>
                  {ev._class}
                </span>
                <span style={{ flex: 1, color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {ev.title}
                </span>
                {ev.severity && chip(ev.severity.toUpperCase(), severityColor(ev.severity))}
                {ev.category && chip(ev.category, "#555")}
                {ev.service  && chip(ev.service, "#444")}
                <span style={{ color: "#333", fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "0 14px 10px", display: "flex", gap: 10 }}>
                  {/* KB pane */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: CY, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>
                      KB ARTICLES ({ev._kb.length})
                    </div>
                    {ev._kb.length === 0 ? (
                      <div style={{ color: "#333", fontSize: 9 }}>No KB coverage for this event.</div>
                    ) : ev._kb.map(({ a, sc }, i) => (
                      <div key={i} style={{ marginBottom: 6 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                          <span style={{ color: "#bbb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
                            {a.title}
                          </span>
                          <span style={{ color: CY, fontSize: 9 }}>{Math.round(sc * 100)}%</span>
                        </div>
                        {a.category && chip(a.category, "#444")}
                        <ScoreBar sc={sc} color={CY} />
                      </div>
                    ))}
                  </div>

                  {/* Scenario pane */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: PU, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>
                      SCENARIOS ({ev._sc.length})
                    </div>
                    {ev._sc.length === 0 ? (
                      <div style={{ color: "#333", fontSize: 9 }}>No scenario alignment for this event.</div>
                    ) : ev._sc.map(({ s, sc }, i) => (
                      <div key={i} style={{ marginBottom: 6 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                          <span style={{ color: "#bbb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
                            {s.title || s.name || "Scenario"}
                          </span>
                          <span style={{ color: PU, fontSize: 9 }}>{Math.round(sc * 100)}%</span>
                        </div>
                        {(s.status || s.category) && (
                          <>
                            {s.status   && chip(s.status, "#555")}
                            {s.category && chip(s.category, "#444")}
                          </>
                        )}
                        <ScoreBar sc={sc} color={PU} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
