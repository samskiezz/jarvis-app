/**
 * F581 — Knowledge × Scenario Coverage (KNOSC)
 * Cross-references /knowledge/ articles with /v1/scenario/list.
 * DOCUMENTED scenarios: ≥1 knowledge article keyword-matches the scenario title/kind.
 * BLIND scenarios: no knowledge backing.
 * Stat tiles: total scenarios, documented count, coverage %, blind count.
 * Filter tabs: ALL / DOCUMENTED / BLIND + search.
 * ASSESS → /v1/jarvis/agent/chat 2-sentence coverage brief + TTS.
 * Amber badge on blind count.
 * Voice: "knowledge scenario/scenario knowledge/knosc/documented scenarios/blind scenarios/scenario coverage/which scenarios have knowledge"
 * Additive only — mounted via App.jsx; exports wired into JarvisBrain.ask().
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const YLW = "#FFD700";
const RED = "#FF3B3B";
const PRP = "#A855F7";
const MONO = "'JetBrains Mono','Courier New',monospace";
const POLL_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── Intent helpers exported for JarvisBrain ────────────────────────────────
const KNOSC_RE =
  /\b(knowledge[._-]?scenario|scenario[._-]?knowledge|knosc|documented[._-]?scenarios?|blind[._-]?scenarios?|scenario[._-]?coverage|which[._-]?scenarios?[._-]?have[._-]?knowledge|scenario[._-]?knowledge[._-]?coverage|knowledge[._-]?backed[._-]?scenario|unbacked[._-]?scenario)\b/i;

export function isKnoscQuery(text) {
  return KNOSC_RE.test(text || "");
}

function tokens(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function scoreMatch(scenario, articles) {
  const st = tokens((scenario.title || scenario.name || scenario.id || "") + " " + (scenario.kind || scenario.type || ""));
  if (!st.length) return { hits: 0, matched: [] };
  const matched = articles.filter((art) => {
    const at = tokens((art.title || art.name || "") + " " + (art.summary || art.content || "") + " " + (art.tags || []).join(" ") + " " + (art.kind || ""));
    return st.some((s) => at.some((a) => a.includes(s) || s.includes(a)));
  });
  return { hits: matched.length, matched };
}

async function fetchAll() {
  const [scR, knR] = await Promise.allSettled([
    fetch(`${apiBase()}/v1/scenario/list`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then((r) => r.json()),
    fetch(`${apiBase()}/knowledge/`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then((r) => r.json()),
  ]);

  const rawScen = scR.status === "fulfilled" ? scR.value : [];
  const rawKno  = knR.status === "fulfilled" ? knR.value : [];

  const scenarios = (Array.isArray(rawScen) ? rawScen : rawScen?.scenarios ?? rawScen?.items ?? rawScen?.results ?? []).slice(0, 300);
  const articles  = (Array.isArray(rawKno)  ? rawKno  : rawKno?.articles  ?? rawKno?.items  ?? rawKno?.results  ?? []).slice(0, 500);

  const enriched = scenarios.map((sc) => {
    const { hits, matched } = scoreMatch(sc, articles);
    return { ...sc, _hits: hits, _matched: matched, _state: hits > 0 ? "documented" : "blind" };
  });

  return { scenarios: enriched, total: scenarios.length, articles: articles.length };
}

export async function buildKnoscScript() {
  try {
    const { scenarios, total, articles } = await fetchAll();
    const documented = scenarios.filter((s) => s._state === "documented").length;
    const blind      = scenarios.filter((s) => s._state === "blind").length;
    const pct        = total > 0 ? Math.round((documented / total) * 100) : 0;
    const topBlind   = scenarios.filter((s) => s._state === "blind").slice(0, 3).map((s) => s.title || s.name || s.id || "?");
    if (blind === 0)
      return `Knowledge × Scenario Coverage: all ${total} scenarios have knowledge backing across ${articles} articles — full documentation coverage, sir.`;
    return `Scenario knowledge coverage: ${pct}% — ${documented} of ${total} scenarios documented against ${articles} knowledge articles; ${blind} blind with no backing${topBlind.length ? " (top blind: " + topBlind.join(", ") + ")" : ""}. Recommend knowledge articles for uncovered scenarios, sir.`;
  } catch {
    return "Knowledge scenario coverage panel is online, sir. Opening coverage view now.";
  }
}

// ─── Panel UI ────────────────────────────────────────────────────────────────
export default function KnowledgeScenarioCoverage() {
  const [open, setOpen]         = useState(false);
  const [data, setData]         = useState(null);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [loading, setLoading]   = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchAll();
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Toggle open via jarvis:knosc-toggle event
  useEffect(() => {
    const handler = () => setOpen((o) => { if (!o) { setTab("ALL"); setSearch(""); load(); } return !o; });
    window.addEventListener("jarvis:knosc-toggle", handler);
    return () => window.removeEventListener("jarvis:knosc-toggle", handler);
  }, [load]);

  // Auto-refresh when open
  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (!data) return;
    setAssessing(true);
    try {
      const script = await buildKnoscScript();
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text: script }),
      }).catch(() => {});
      await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: script }),
      }).catch(() => {});
    } finally {
      setAssessing(false);
    }
  }, [data]);

  const scenarios = data?.scenarios ?? [];
  const articles  = data?.articles ?? 0;
  const total     = data?.total ?? 0;
  const documented = scenarios.filter((s) => s._state === "documented").length;
  const blind      = scenarios.filter((s) => s._state === "blind").length;
  const pct        = total > 0 ? Math.round((documented / total) * 100) : 0;

  const visible = scenarios.filter((s) => {
    const matchTab = tab === "ALL" || (tab === "DOCUMENTED" && s._state === "documented") || (tab === "BLIND" && s._state === "blind");
    const q = search.toLowerCase();
    const matchSearch = !q || (s.title || s.name || s.id || "").toLowerCase().includes(q) || (s.kind || s.type || "").toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  const B = {
    position: "fixed", bottom: 8, left: 69400, zIndex: 139,
    background: blind > 0 ? `${YLW}22` : `${CY}11`,
    border: `1px solid ${blind > 0 ? YLW : CY}55`,
    borderRadius: 6, padding: "3px 9px", color: CY,
    fontFamily: MONO, fontSize: 10, cursor: "pointer",
    letterSpacing: 1, display: "flex", alignItems: "center", gap: 5,
    whiteSpace: "nowrap",
  };

  return (
    <>
      {/* Dock button */}
      <button onClick={() => { setOpen((o) => { if (!o) { setTab("ALL"); setSearch(""); load(); } return !o; }); }} style={B}>
        ◈ KNOSC
        {blind > 0 && (
          <span style={{ background: YLW, color: "#000", borderRadius: 3, padding: "1px 5px", fontSize: 9, fontWeight: 700 }}>
            {blind}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", right: 16, bottom: 40, width: 480, maxHeight: "78vh",
          background: "rgba(4,9,18,0.97)", border: `1px solid ${CY}44`,
          borderRadius: 14, overflow: "hidden", zIndex: 2000,
          boxShadow: `0 0 60px ${CY}18, 0 24px 48px rgba(0,0,0,0.8)`,
          fontFamily: MONO, display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{ padding: "11px 16px", borderBottom: `1px solid ${CY}22`, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: CY, fontSize: 12, flex: 1, letterSpacing: 1.5 }}>◈ KNOWLEDGE × SCENARIO COVERAGE</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#4E6070", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${CY}1A` }}>
            {[
              { label: "SCENARIOS", val: total, color: CY },
              { label: "DOCUMENTED", val: documented, color: GRN },
              { label: "COVERAGE %", val: pct + "%", color: pct >= 70 ? GRN : pct >= 40 ? YLW : RED },
              { label: "BLIND", val: blind, color: blind > 0 ? YLW : GRN },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background: "rgba(41,231,255,0.04)", border: `1px solid ${CY}22`, borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                <div style={{ color, fontSize: 16, fontWeight: 700 }}>{loading ? "…" : val}</div>
                <div style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1.5, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Knowledge articles count */}
          <div style={{ padding: "5px 16px", color: "#4E6070", fontSize: 9, letterSpacing: 1, borderBottom: `1px solid ${CY}1A` }}>
            {articles} knowledge articles indexed
          </div>

          {/* Tabs + search */}
          <div style={{ display: "flex", gap: 6, padding: "8px 14px 0", borderBottom: `1px solid ${CY}1A`, alignItems: "center" }}>
            {["ALL", "DOCUMENTED", "BLIND"].map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${CY}22` : "transparent",
                border: `1px solid ${tab === t ? CY : CY + "33"}`,
                borderRadius: 5, padding: "3px 9px",
                color: tab === t ? CY : "#4E6070",
                fontFamily: MONO, fontSize: 9, cursor: "pointer", letterSpacing: 1,
                marginBottom: 6,
              }}>{t}</button>
            ))}
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                marginLeft: "auto", background: "rgba(41,231,255,0.06)",
                border: `1px solid ${CY}33`, borderRadius: 5,
                padding: "3px 8px", color: "#DCEBF5", fontFamily: MONO,
                fontSize: 9, outline: "none", width: 110, marginBottom: 6,
              }}
            />
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
            {loading && !data && (
              <div style={{ padding: "20px", color: "#4E6070", textAlign: "center", fontSize: 11 }}>Loading…</div>
            )}
            {!loading && visible.length === 0 && (
              <div style={{ padding: "20px", color: "#4E6070", textAlign: "center", fontSize: 11 }}>No scenarios match</div>
            )}
            {visible.map((sc, i) => {
              const isExp = expanded === i;
              const stateColor = sc._state === "documented" ? GRN : YLW;
              return (
                <div key={sc.id || sc.title || i} onClick={() => setExpanded(isExp ? null : i)}
                  style={{
                    padding: "8px 16px", cursor: "pointer",
                    background: isExp ? `${CY}08` : "transparent",
                    borderLeft: isExp ? `2px solid ${CY}` : "2px solid transparent",
                    borderBottom: `1px solid ${CY}0A`,
                  }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: stateColor, fontSize: 8, letterSpacing: 1.5, flexShrink: 0, width: 90 }}>
                      {sc._state === "documented" ? "● DOCUMENTED" : "○ BLIND"}
                    </span>
                    <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>{sc.title || sc.name || sc.id || "?"}</span>
                    {sc.kind && (
                      <span style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1, flexShrink: 0 }}>{sc.kind}</span>
                    )}
                    {sc._hits > 0 && (
                      <span style={{ color: GRN, fontSize: 8, letterSpacing: 1, flexShrink: 0 }}>{sc._hits} hit{sc._hits !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                  {isExp && sc._matched.length > 0 && (
                    <div style={{ marginTop: 6, paddingLeft: 8, borderLeft: `1px solid ${GRN}44` }}>
                      <div style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>MATCHED ARTICLES</div>
                      {sc._matched.slice(0, 4).map((art, ai) => (
                        <div key={ai} style={{ color: GRN, fontSize: 10, marginBottom: 2 }}>
                          {art.title || art.name || art.id || "Article"}
                          {art.kind && <span style={{ color: "#4E6070", marginLeft: 6, fontSize: 8 }}>[{art.kind}]</span>}
                        </div>
                      ))}
                      {sc._matched.length > 4 && (
                        <div style={{ color: "#4E6070", fontSize: 9 }}>+{sc._matched.length - 4} more</div>
                      )}
                    </div>
                  )}
                  {isExp && sc._state === "blind" && (
                    <div style={{ marginTop: 4, color: YLW, fontSize: 9, opacity: 0.7 }}>No knowledge articles match this scenario.</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ borderTop: `1px solid ${CY}1A`, padding: "8px 14px", display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={assess} disabled={assessing || !data} style={{
              background: `${CY}22`, border: `1px solid ${CY}44`, borderRadius: 6,
              padding: "5px 14px", color: CY, fontFamily: MONO, fontSize: 10,
              cursor: assessing ? "default" : "pointer", letterSpacing: 1,
              opacity: !data ? 0.4 : 1,
            }}>
              {assessing ? "ASSESSING…" : "▶ ASSESS"}
            </button>
            <span style={{ color: "#4E6070", fontSize: 9, marginLeft: "auto", letterSpacing: 1 }}>
              {visible.length}/{total} · auto-refresh 90s
            </span>
          </div>
        </div>
      )}
    </>
  );
}
