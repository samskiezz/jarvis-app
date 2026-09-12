/**
 * DecisionRulesKnowledgeNexus — F537 (RULSKNO)
 * "JARVIS, rules knowledge / knowledge rules / rulskno / ungrounded rules / rule knowledge gap"
 * Cross-references /v1/rules (WATCHTOWER) + /knowledge/ articles.
 * Finds DOCUMENTED rules (≥1 article keyword-matches) vs UNGROUNDED (no knowledge backing).
 * Coverage % tile; ALL/DOCUMENTED/UNGROUNDED filter tabs + search; click-to-expand matched articles.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 120_000;
const BTN_LEFT = 43_600;
const Z_INDEX  = 109;

const RULSKNO_RE =
  /\brulskno\b|\brules?.?knowledge\b|\bknowledge.?rules?\b|\bungrounded.?rules?\b|\brule.?knowledge.?gap\b|\brule.?documentation\b|\bknowledge.?backed.?rules?\b|\bwatchtower.?knowledge\b/i;

export function isRulsknoQuery(text) {
  return RULSKNO_RE.test(text || "");
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function keywords(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function overlap(a, b) {
  const sa = new Set(keywords(a));
  return keywords(b).filter((w) => sa.has(w)).length;
}

function normaliseRules(data) {
  if (!data) return [];
  const raw =
    data.rules || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((r, i) => ({
    id:       r.id || `rule-${i}`,
    name:     r.name || `Rule ${i + 1}`,
    severity: typeof r.severity === "number" ? r.severity : 50,
    target:   r.target || "",
    enabled:  r.enabled !== false,
    expr:     r.expr ? JSON.stringify(r.expr) : "",
  })).sort((a, b) => b.severity - a.severity);
}

function normaliseArticles(data) {
  if (!data) return [];
  const raw =
    Array.isArray(data)             ? data
    : Array.isArray(data.items)     ? data.items
    : Array.isArray(data.articles)  ? data.articles
    : Array.isArray(data.topics)    ? data.topics
    : Array.isArray(data.results)   ? data.results
    : [];
  return raw.map((a, i) => ({
    id:    a.id || `art-${i}`,
    title: a.title || a.name || `Article ${i + 1}`,
    kind:  (a.kind || a.type || a.category || "ARTICLE").toUpperCase(),
    body:  a.body || a.content || a.summary || a.description || "",
    tags:  Array.isArray(a.tags) ? a.tags.join(" ") : String(a.tags || ""),
  }));
}

async function fetchArticles(base, hdr) {
  for (const path of ["/knowledge/", "/knowledge/articles", "/knowledge/topics"]) {
    try {
      const r = await fetch(`${base}${path}`, { headers: hdr });
      if (!r.ok) continue;
      const d = await r.json();
      const arr = normaliseArticles(d);
      if (arr.length > 0) return arr;
    } catch (_) {}
  }
  return [];
}

function crossRef(rules, articles) {
  return rules.map((rule) => {
    const haystack = `${rule.name} ${rule.target} ${rule.expr}`;
    const matches = articles
      .map((art) => ({
        art,
        hits: overlap(haystack, `${art.title} ${art.body} ${art.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...rule,
      documented: matches.length > 0,
      matches: matches.map(({ art, hits }) => ({ ...art, hits })),
    };
  });
}

// ─── buildRulsknoScript (for JarvisBrain) ────────────────────────────────────

export async function buildRulsknoScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [rulesRes, articles] = await Promise.all([
      fetch(`${base}/v1/rules`, { headers: hdr }).then((r) => r.ok ? r.json() : {}),
      fetchArticles(base, hdr),
    ]);

    const rules   = normaliseRules(rulesRes);
    const crossed = crossRef(rules, articles);

    const total      = crossed.length;
    const documented = crossed.filter((r) => r.documented).length;
    const ungrounded = total - documented;
    const coverage   = total > 0 ? Math.round((documented / total) * 100) : 0;
    const topUngrounded = crossed
      .filter((r) => !r.documented)
      .slice(0, 2)
      .map((r) => r.name)
      .join(", ");

    const prompt = `JARVIS rules-knowledge nexus: ${total} WATCHTOWER decision rules analysed against ${articles.length} knowledge articles. ${documented} rules have knowledge backing (${coverage}% coverage). ${ungrounded} rules are ungrounded — no knowledge articles support them. Top ungrounded rules: ${topUngrounded || "none"}. Provide a 2-sentence brief on rule knowledge coverage.`;
    const chatRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({ message: prompt }),
    });
    const chatData = chatRes.ok ? await chatRes.json() : {};
    const brief =
      chatData.response || chatData.message || chatData.content ||
      `${documented} of ${total} decision rules are backed by knowledge articles (${coverage}% coverage). ${ungrounded} rules lack knowledge support — consider documenting their rationale.`;

    window.dispatchEvent(
      new CustomEvent("jarvis:speak-dossier", { detail: { text: brief } })
    );
    return brief;
  } catch (err) {
    return `Rules-knowledge nexus error: ${err.message}`;
  }
}

// ─── severity colour ─────────────────────────────────────────────────────────

function sevColor(sev) {
  if (sev >= 90) return "#FF3B3B";
  if (sev >= 70) return AMB;
  if (sev >= 40) return "#FFD700";
  return GRN;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function DecisionRulesKnowledgeNexus() {
  const [open, setOpen]           = useState(false);
  const [crossed, setCrossed]     = useState([]);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]         = useState("");
  const [loading, setLoading]     = useState(false);
  const timerRef = useRef(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [rulesRes, articles] = await Promise.all([
        fetch(`${base}/v1/rules`, { headers: hdr }).then((r) => r.ok ? r.json() : {}),
        fetchArticles(base, hdr),
      ]);
      const rules = normaliseRules(rulesRes);
      setCrossed(crossRef(rules, articles));
    } catch (_) {
      /* network unavailable */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:rulskno-toggle", onToggle);
    return () => window.removeEventListener("jarvis:rulskno-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetch_();
    timerRef.current = setInterval(fetch_, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetch_]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try {
      const result = await buildRulsknoScript();
      setBrief(result);
    } finally {
      setAssessing(false);
    }
  }, []);

  const documented  = crossed.filter((r) => r.documented);
  const ungrounded  = crossed.filter((r) => !r.documented);
  const coverage    = crossed.length > 0
    ? Math.round((documented.length / crossed.length) * 100)
    : 0;

  const visible = crossed
    .filter((r) => {
      if (tab === "DOCUMENTED")  return r.documented;
      if (tab === "UNGROUNDED")  return !r.documented;
      return true;
    })
    .filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.target.toLowerCase().includes(q)
      );
    });

  const btnStyle = {
    position: "fixed",
    bottom: 8,
    left: BTN_LEFT,
    zIndex: Z_INDEX,
    background: "rgba(0,20,40,0.85)",
    border: `1px solid ${!open ? DIM : CY}`,
    color: !open ? DIM : CY,
    fontFamily: "monospace",
    fontSize: 10,
    padding: "3px 7px",
    cursor: "pointer",
    borderRadius: 3,
    whiteSpace: "nowrap",
  };

  if (!open) {
    return (
      <button
        style={btnStyle}
        onClick={() => setOpen(true)}
        title="Decision Rules × Knowledge Nexus (RULSKNO)"
      >
        ◈ RULSKNO{ungrounded.length > 0 && (
          <span style={{ color: AMB, marginLeft: 4 }}>{ungrounded.length}</span>
        )}
      </button>
    );
  }

  const panel = {
    position: "fixed",
    bottom: 36,
    left: Math.min(BTN_LEFT, window.innerWidth - 480),
    width: 460,
    maxHeight: "75vh",
    overflowY: "auto",
    zIndex: Z_INDEX + 1,
    background: "rgba(0,10,25,0.97)",
    border: `1px solid ${CY}`,
    borderRadius: 6,
    fontFamily: "monospace",
    fontSize: 11,
    color: CY,
    padding: 14,
    boxShadow: `0 0 24px ${CY}44`,
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(false)}>
        ◈ RULSKNO ✕
      </button>

      <div style={panel}>
        <div style={{ fontSize: 13, fontWeight: "bold", marginBottom: 10 }}>
          ◈ DECISION RULES × KNOWLEDGE NEXUS
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {[
            ["RULES",      crossed.length,    CY],
            ["DOCUMENTED", documented.length, GRN],
            ["UNGROUNDED", ungrounded.length, AMB],
            ["COVERAGE",   `${coverage}%`,    coverage > 40 ? GRN : AMB],
          ].map(([label, val, col]) => (
            <div
              key={label}
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${col}55`,
                borderRadius: 4,
                padding: "4px 6px",
                textAlign: "center",
              }}
            >
              <div style={{ color: col, fontSize: 14, fontWeight: "bold" }}>{val}</div>
              <div style={{ color: DIM, fontSize: 9 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {["ALL", "DOCUMENTED", "UNGROUNDED"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? CY : "transparent",
                color: tab === t ? "#000" : DIM,
                border: `1px solid ${tab === t ? CY : DIM}`,
                borderRadius: 3,
                padding: "2px 8px",
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* search */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search rules…"
          style={{
            width: "100%",
            background: "rgba(255,255,255,0.05)",
            border: `1px solid ${DIM}`,
            borderRadius: 3,
            color: CY,
            padding: "3px 6px",
            fontSize: 10,
            marginBottom: 8,
            boxSizing: "border-box",
          }}
        />

        {/* list */}
        {loading && !crossed.length ? (
          <div style={{ color: DIM, textAlign: "center", padding: 20 }}>FETCHING…</div>
        ) : visible.length === 0 ? (
          <div style={{ color: DIM, padding: 12 }}>No rules match.</div>
        ) : (
          visible.map((rule) => (
            <div
              key={rule.id}
              style={{
                borderBottom: "1px solid rgba(41,231,255,0.1)",
                paddingBottom: 8,
                marginBottom: 8,
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                onClick={() => setExpanded(expanded === rule.id ? null : rule.id)}
              >
                <span
                  style={{
                    fontSize: 9,
                    padding: "1px 5px",
                    borderRadius: 3,
                    background: rule.documented ? `${GRN}22` : `${AMB}22`,
                    color: rule.documented ? GRN : AMB,
                    border: `1px solid ${rule.documented ? GRN : AMB}55`,
                    flexShrink: 0,
                  }}
                >
                  {rule.documented ? "DOCUMENTED" : "UNGROUNDED"}
                </span>
                <span style={{ color: rule.documented ? CY : DIM, flexGrow: 1 }}>
                  {rule.name}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    padding: "1px 4px",
                    borderRadius: 2,
                    background: `${sevColor(rule.severity)}22`,
                    color: sevColor(rule.severity),
                    border: `1px solid ${sevColor(rule.severity)}55`,
                    flexShrink: 0,
                  }}
                >
                  SEV {rule.severity}
                </span>
                <span style={{ color: DIM }}>{expanded === rule.id ? "▲" : "▼"}</span>
              </div>

              {expanded === rule.id && (
                <div style={{ marginTop: 6, paddingLeft: 8 }}>
                  {rule.target && (
                    <div style={{ color: DIM, fontSize: 10, marginBottom: 4 }}>
                      target: {rule.target}
                    </div>
                  )}
                  {rule.matches.length === 0 ? (
                    <div style={{ color: AMB, fontSize: 10 }}>No knowledge articles correlated.</div>
                  ) : (
                    rule.matches.slice(0, 5).map((art) => (
                      <div
                        key={art.id}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 6,
                          marginBottom: 4,
                          paddingLeft: 4,
                          borderLeft: `2px solid ${GRN}55`,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 8,
                            padding: "1px 4px",
                            borderRadius: 2,
                            background: `${CY}22`,
                            color: CY,
                            border: `1px solid ${CY}44`,
                            flexShrink: 0,
                            marginTop: 1,
                          }}
                        >
                          {art.kind}
                        </span>
                        <div style={{ flexGrow: 1 }}>
                          <div style={{ color: CY, fontSize: 10 }}>{art.title}</div>
                        </div>
                        <span style={{ color: DIM, fontSize: 9, flexShrink: 0 }}>{art.hits}↑</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {/* assess */}
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            marginTop: 8,
            width: "100%",
            background: assessing ? "transparent" : `${GRN}22`,
            border: `1px solid ${GRN}`,
            color: GRN,
            borderRadius: 3,
            padding: "4px 0",
            cursor: assessing ? "not-allowed" : "pointer",
            fontSize: 10,
          }}
        >
          {assessing ? "ASSESSING…" : "▶ ASSESS"}
        </button>

        {brief && (
          <div
            style={{
              marginTop: 8,
              padding: 8,
              background: "rgba(0,229,160,0.06)",
              border: `1px solid ${GRN}44`,
              borderRadius: 4,
              color: GRN,
              fontSize: 10,
              lineHeight: 1.5,
            }}
          >
            {brief}
          </div>
        )}
      </div>
    </>
  );
}
