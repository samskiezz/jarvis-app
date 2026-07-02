import { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function kw(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function scoreGap(topic, articles) {
  const topicWords = kw(topic.label);
  let matched = 0;
  for (const a of articles) {
    const aWords = new Set(kw((a.title || "") + " " + (a.content || "") + " " + (a.tags || []).join(" ")));
    const hits = topicWords.filter((w) => aWords.has(w)).length;
    if (hits > 0) matched++;
  }
  const coverageRatio = articles.length > 0 ? matched / articles.length : 0;
  const pressure = topic.riskCount + topic.caseCount * 1.5;
  return { ...topic, matched, coverageRatio, score: pressure * (1 - Math.min(coverageRatio * 3, 1)) };
}

export function isKacqQuery(q) {
  return /knowledge.{0,25}gap|knowledge.{0,25}acqui|acqui.{0,25}knowledge|what.{0,25}knowledge.{0,25}miss|missing.{0,25}knowledge|kacq\b|knowledge.{0,20}priority|knowledge.{0,20}blind.?spot/i.test(
    q || ""
  );
}

export async function buildKacqScript() {
  try {
    const base = apiBase();
    const headers = { Authorization: `Bearer ${API_KEY}` };
    const [artsRes, risksRes, casesRes] = await Promise.all([
      fetch(`${base}/knowledge/`, { headers }),
      fetch(`${base}/entities/RiskSignal`, { headers }),
      fetch(`${base}/v1/investigations`, { headers }),
    ]);
    const arts = artsRes.ok ? await artsRes.json() : [];
    const risks = risksRes.ok ? await risksRes.json() : [];
    const cases = casesRes.ok ? await casesRes.json() : [];
    const artList = Array.isArray(arts) ? arts : arts.articles || arts.results || [];
    const riskList = Array.isArray(risks) ? risks : risks.results || [];
    const caseList = Array.isArray(cases) ? cases : cases.results || [];
    window.dispatchEvent(new CustomEvent("jarvis:kacq-toggle"));
    const topicMap = {};
    for (const r of riskList) {
      const label = (r.title || r.type || r.category || "unknown").toLowerCase();
      if (!topicMap[label]) topicMap[label] = { label, riskCount: 0, caseCount: 0 };
      topicMap[label].riskCount++;
    }
    for (const c of caseList) {
      const label = (c.title || c.subject || c.category || "unknown").toLowerCase();
      if (!topicMap[label]) topicMap[label] = { label, riskCount: 0, caseCount: 0 };
      topicMap[label].caseCount++;
    }
    const scored = Object.values(topicMap).map((t) => scoreGap(t, artList)).filter((t) => t.score > 0);
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 3).map((t) => t.label).join(", ");
    return `Knowledge acquisition advisor active, sir. ${scored.length} priority gaps identified. Top areas requiring knowledge investment: ${top || "analysis complete"}. Articles indexed: ${artList.length}. I recommend targeting high-pressure gaps first.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:kacq-toggle"));
    return "Knowledge acquisition advisor open, sir.";
  }
}

export default function KnowledgeAcquisitionAdvisor() {
  const [visible, setVisible] = useState(false);
  const [articles, setArticles] = useState([]);
  const [gaps, setGaps] = useState([]);
  const [stats, setStats] = useState({ articles: 0, risks: 0, cases: 0, gaps: 0 });
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiNote, setAiNote] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    const base = apiBase();
    const headers = { Authorization: `Bearer ${API_KEY}` };
    try {
      const [artsRes, risksRes, casesRes] = await Promise.all([
        fetch(`${base}/knowledge/`, { headers }),
        fetch(`${base}/entities/RiskSignal`, { headers }),
        fetch(`${base}/v1/investigations`, { headers }),
      ]);
      const artsRaw = artsRes.ok ? await artsRes.json() : [];
      const risksRaw = risksRes.ok ? await risksRes.json() : [];
      const casesRaw = casesRes.ok ? await casesRes.json() : [];
      const artList = Array.isArray(artsRaw) ? artsRaw : artsRaw.articles || artsRaw.results || [];
      const riskList = Array.isArray(risksRaw) ? risksRaw : risksRaw.results || [];
      const caseList = Array.isArray(casesRaw) ? casesRaw : casesRaw.results || [];
      setArticles(artList);
      const topicMap = {};
      for (const r of riskList) {
        const label = (r.title || r.type || r.category || "unknown").toLowerCase();
        if (!topicMap[label]) topicMap[label] = { label, riskCount: 0, caseCount: 0 };
        topicMap[label].riskCount++;
      }
      for (const c of caseList) {
        const label = (c.title || c.subject || c.category || "unknown").toLowerCase();
        if (!topicMap[label]) topicMap[label] = { label, riskCount: 0, caseCount: 0 };
        topicMap[label].caseCount++;
      }
      const scored = Object.values(topicMap)
        .map((t) => scoreGap(t, artList))
        .sort((a, b) => b.score - a.score);
      setGaps(scored);
      setStats({
        articles: artList.length,
        risks: riskList.length,
        cases: caseList.length,
        gaps: scored.filter((g) => g.score > 0).length,
      });
    } catch {
      /* network not available — leave previous state */
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:kacq-toggle", onToggle);
    return () => window.removeEventListener("jarvis:kacq-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, 300_000);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  const runBrief = useCallback(async () => {
    if (aiLoading) return;
    setAiLoading(true);
    try {
      const top5 = gaps.slice(0, 5).map((g) => `"${g.label}" (score ${g.score.toFixed(1)})`).join(", ");
      const prompt = `Knowledge acquisition advisor analysis: ${stats.articles} articles indexed, ${stats.risks} risk signals, ${stats.cases} investigations, ${stats.gaps} knowledge gaps identified. Top priority gaps: ${top5}. Provide a 2-sentence strategic brief on which knowledge areas to acquire first and why, given active risk-to-case pressure.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || "Analysis complete.";
      setAiNote(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setAiNote("Brief unavailable.");
    } finally {
      setAiLoading(false);
    }
  }, [aiLoading, gaps, stats]);

  const maxScore = gaps.length > 0 ? Math.max(...gaps.map((g) => g.score), 1) : 1;

  const filtered = gaps.filter((g) => {
    if (filter === "HIGH-GAP" && g.score <= 0) return false;
    if (filter === "COVERED" && g.coverageRatio < 0.1) return false;
    if (search && !g.label.includes(search.toLowerCase())) return false;
    return true;
  });

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        style={{
          position: "fixed",
          bottom: 8,
          left: 29000,
          zIndex: 61,
          background: "rgba(0,255,200,0.13)",
          border: "1px solid rgba(0,255,200,0.35)",
          color: "#00ffc8",
          fontSize: 10,
          padding: "3px 7px",
          borderRadius: 4,
          cursor: "pointer",
          letterSpacing: 1,
        }}
      >
        ◎ KACQ
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 60,
        right: 20,
        width: 520,
        maxHeight: "80vh",
        overflowY: "auto",
        background: "rgba(0,10,20,0.97)",
        border: "1px solid rgba(0,255,200,0.3)",
        borderRadius: 10,
        zIndex: 9100,
        padding: 18,
        fontFamily: "monospace",
        color: "#cceeff",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ color: "#00ffc8", fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>
          ◎ KNOWLEDGE ACQUISITION ADVISOR
        </span>
        <button
          onClick={() => setVisible(false)}
          style={{ background: "none", border: "none", color: "#ff4466", cursor: "pointer", fontSize: 16 }}
        >
          ✕
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {[
          { label: "ARTICLES", val: stats.articles, color: "#00ffc8" },
          { label: "RISKS", val: stats.risks, color: "#ffaa00" },
          { label: "CASES", val: stats.cases, color: "#44aaff" },
          { label: "GAPS", val: stats.gaps, color: stats.gaps > 0 ? "#ff4466" : "#00ffc8" },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              flex: 1,
              minWidth: 80,
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${s.color}44`,
              borderRadius: 6,
              padding: "6px 10px",
              textAlign: "center",
            }}
          >
            <div style={{ color: s.color, fontSize: 18, fontWeight: 700 }}>{s.val}</div>
            <div style={{ color: "#667788", fontSize: 9, letterSpacing: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }}>
        {["ALL", "HIGH-GAP", "COVERED"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? "rgba(0,255,200,0.18)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${filter === f ? "#00ffc8" : "#334"}`,
              color: filter === f ? "#00ffc8" : "#667788",
              fontSize: 10,
              padding: "3px 9px",
              borderRadius: 4,
              cursor: "pointer",
              letterSpacing: 1,
            }}
          >
            {f}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search topics…"
          style={{
            marginLeft: "auto",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid #334",
            color: "#cceeff",
            fontSize: 10,
            padding: "3px 8px",
            borderRadius: 4,
            width: 130,
            outline: "none",
          }}
        />
      </div>

      {loading && (
        <div style={{ color: "#667788", fontSize: 11, textAlign: "center", padding: 12 }}>
          SCANNING KNOWLEDGE GAPS…
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div style={{ color: "#445566", fontSize: 11, textAlign: "center", padding: 12 }}>
          No topics match filter.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {filtered.slice(0, 20).map((gap, i) => {
          const barW = Math.round((gap.score / maxScore) * 100);
          const coverPct = Math.round(gap.coverageRatio * 100);
          return (
            <div
              key={gap.label}
              style={{
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${gap.score > 5 ? "#ff446644" : "#33445544"}`,
                borderRadius: 6,
                padding: "8px 10px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ color: i < 3 ? "#ff9944" : "#aaccdd", fontSize: 11, fontWeight: 600 }}>
                  #{i + 1} {gap.label}
                </span>
                <div style={{ display: "flex", gap: 6, fontSize: 9, color: "#667788" }}>
                  <span style={{ color: "#ffaa00" }}>⚠ {gap.riskCount}r</span>
                  <span style={{ color: "#44aaff" }}>🔍 {gap.caseCount}c</span>
                  <span style={{ color: coverPct > 20 ? "#00ffc8" : "#ff4466" }}>{coverPct}% cov</span>
                </div>
              </div>
              <div style={{ background: "#0a1a22", borderRadius: 3, height: 4, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${barW}%`,
                    height: "100%",
                    background: gap.score > 5 ? "#ff4466" : "#ffaa00",
                    borderRadius: 3,
                    transition: "width 0.4s",
                  }}
                />
              </div>
              <div style={{ color: "#445566", fontSize: 9, marginTop: 3 }}>
                priority score {gap.score.toFixed(1)} · {gap.matched} matched articles
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "flex-start" }}>
        <button
          onClick={runBrief}
          disabled={aiLoading}
          style={{
            background: "rgba(0,255,200,0.1)",
            border: "1px solid rgba(0,255,200,0.3)",
            color: "#00ffc8",
            fontSize: 10,
            padding: "4px 12px",
            borderRadius: 4,
            cursor: aiLoading ? "not-allowed" : "pointer",
            letterSpacing: 1,
            flexShrink: 0,
          }}
        >
          {aiLoading ? "…" : "▶ BRIEF"}
        </button>
        {aiNote && (
          <div
            style={{
              background: "rgba(0,255,200,0.05)",
              border: "1px solid rgba(0,255,200,0.15)",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 10,
              color: "#99ddcc",
              lineHeight: 1.5,
            }}
          >
            {aiNote}
          </div>
        )}
      </div>

      <div style={{ color: "#334455", fontSize: 9, marginTop: 10, textAlign: "right" }}>
        auto-refresh 5 min · {articles.length} articles indexed
      </div>
    </div>
  );
}
