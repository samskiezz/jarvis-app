import { useState, useEffect, useCallback } from "react";

const API = "";

export function isKriinvtriQuery(q) {
  const t = q.toLowerCase();
  return (
    t.includes("kriinvtri") ||
    t.includes("knowledge risk investigation") ||
    t.includes("risk knowledge investigation") ||
    t.includes("investigation knowledge risk") ||
    t.includes("fully grounded knowledge") ||
    t.includes("knowledge triple nexus") ||
    t.includes("grounded knowledge") ||
    t.includes("intel knowledge case") ||
    t.includes("knowledge intel investigation") ||
    t.includes("knowledge coverage triple") ||
    t.includes("triple knowledge")
  );
}

export async function buildKriinvtriScript() {
  try {
    const [kRes, rRes, iRes] = await Promise.all([
      fetch(`${API}/knowledge/`),
      fetch(`${API}/entities/RiskSignal`),
      fetch(`${API}/v1/investigations`),
    ]);
    const kj = kRes.ok ? await kRes.json() : [];
    const rj = rRes.ok ? await rRes.json() : [];
    const ij = iRes.ok ? await iRes.json() : [];

    const articles = Array.isArray(kj) ? kj : kj.items ?? kj.data ?? kj.articles ?? [];
    const risks = Array.isArray(rj) ? rj : rj.items ?? rj.data ?? [];
    const cases = Array.isArray(ij) ? ij : ij.items ?? ij.data ?? [];

    let fullyGrounded = 0, riskOnly = 0, caseOnly = 0, dark = 0;
    articles.forEach((a) => {
      const text = (a.title || a.name || a.content || a.summary || a.tags || "").toLowerCase();
      const words = text.split(/[\s,._-]+/).filter((w) => w.length >= 3);
      const hasR = words.some((w) => risks.some((r) => (r.name || r.title || r.description || r.signal || "").toLowerCase().includes(w)));
      const hasI = words.some((w) => cases.some((c) => (c.title || c.name || c.summary || c.description || "").toLowerCase().includes(w)));
      if (hasR && hasI) fullyGrounded++;
      else if (hasR) riskOnly++;
      else if (hasI) caseOnly++;
      else dark++;
    });

    const total = articles.length;
    const pct = total ? ((fullyGrounded / total) * 100).toFixed(1) : "0.0";
    return `KRIINVTRI Knowledge × Risk Signal × Investigation Triple Nexus: ${total} knowledge articles | ${risks.length} risk signals | ${cases.length} investigations | ${fullyGrounded} fully grounded (${pct}%) | ${riskOnly} risk-signal-only | ${caseOnly} investigation-only | ${dark} dark (no cross-reference).`;
  } catch (e) {
    return `KRIINVTRI: fetch error — ${e.message}`;
  }
}

function classify(article, risks, cases) {
  const text = (article.title || article.name || article.content || article.summary || article.tags || "").toLowerCase();
  const words = text.split(/[\s,._-]+/).filter((w) => w.length >= 3);
  const rMatches = risks.filter((r) => words.some((w) => (r.name || r.title || r.description || r.signal || "").toLowerCase().includes(w)));
  const iMatches = cases.filter((c) => words.some((w) => (c.title || c.name || c.summary || c.description || "").toLowerCase().includes(w)));
  const hasR = rMatches.length > 0;
  const hasI = iMatches.length > 0;
  if (hasR && hasI) return { type: "FULLY_GROUNDED", rMatches, iMatches };
  if (hasR) return { type: "RISK_ONLY", rMatches, iMatches };
  if (hasI) return { type: "CASE_ONLY", rMatches, iMatches };
  return { type: "DARK", rMatches, iMatches };
}

const TYPE_COLOR = {
  FULLY_GROUNDED: "#00ff88",
  RISK_ONLY: "#a78bfa",
  CASE_ONLY: "#38bdf8",
  DARK: "#334155",
};

const SEV_COLOR = { CRITICAL: "#ef4444", HIGH: "#f97316", MEDIUM: "#eab308", LOW: "#22c55e" };
const STATUS_COLOR = { OPEN: "#38bdf8", ACTIVE: "#00ff88", CLOSED: "#64748b", ESCALATED: "#ef4444" };

export default function KnowledgeRiskInvestigationTriple() {
  const [open, setOpen] = useState(false);
  const [articles, setArticles] = useState([]);
  const [risks, setRisks] = useState([]);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [kRes, rRes, iRes] = await Promise.all([
        fetch(`${API}/knowledge/`),
        fetch(`${API}/entities/RiskSignal`),
        fetch(`${API}/v1/investigations`),
      ]);
      const kj = kRes.ok ? await kRes.json() : [];
      const rj = rRes.ok ? await rRes.json() : [];
      const ij = iRes.ok ? await iRes.json() : [];
      setArticles(Array.isArray(kj) ? kj : kj.items ?? kj.data ?? kj.articles ?? []);
      setRisks(Array.isArray(rj) ? rj : rj.items ?? rj.data ?? []);
      setCases(Array.isArray(ij) ? ij : ij.items ?? ij.data ?? []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 90000);
    return () => clearInterval(id);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jarvis:kriinvtri-toggle", handler);
    return () => window.removeEventListener("jarvis:kriinvtri-toggle", handler);
  }, []);

  const classified = articles.map((a) => ({ ...a, ...classify(a, risks, cases) }));

  const fullyGrounded = classified.filter((a) => a.type === "FULLY_GROUNDED").length;
  const riskOnly = classified.filter((a) => a.type === "RISK_ONLY").length;
  const caseOnly = classified.filter((a) => a.type === "CASE_ONLY").length;
  const dark = classified.filter((a) => a.type === "DARK").length;
  const pct = articles.length ? ((fullyGrounded / articles.length) * 100).toFixed(1) : "0.0";

  const visible = classified.filter((a) => {
    if (filter !== "ALL" && a.type !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (a.title || a.name || a.summary || "").toLowerCase().includes(s);
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    try {
      const brief = await buildKriinvtriScript();
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `KRIINVTRI knowledge triple coverage: ${brief}. Identify dark knowledge gaps and the top 2 remediation priorities.` }),
      });
      const data = res.ok ? await res.json() : {};
      const text = data.response || data.message || brief;
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      // silent
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Knowledge × Risk Signal × Investigation Triple Nexus (KRIINVTRI)"
        style={{
          position: "fixed",
          left: 895220,
          bottom: 8,
          zIndex: 255,
          background: "#0f172a",
          border: "1px solid #334155",
          color: "#94a3b8",
          fontSize: 10,
          padding: "3px 7px",
          borderRadius: 4,
          cursor: "pointer",
          letterSpacing: "0.05em",
          fontFamily: "monospace",
        }}
      >
        ◈ KRIINVTRI
        {dark > 0 && (
          <span style={{ marginLeft: 5, background: "#1e1b4b", color: "#a5b4fc", borderRadius: 3, padding: "1px 5px", fontSize: 9 }}>
            {dark}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 60,
        right: 20,
        width: 540,
        maxHeight: "82vh",
        overflowY: "auto",
        background: "#0a0f1e",
        border: "1px solid #1e3a5f",
        borderRadius: 8,
        zIndex: 2550,
        fontFamily: "monospace",
        color: "#e2e8f0",
        boxShadow: "0 0 40px #1e3a5f55",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #1e3a5f", background: "#050d1a" }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: "#00ff88", letterSpacing: "0.08em" }}>◈ KRIINVTRI — Knowledge × Risk × Investigation</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load} disabled={loading} style={{ background: "none", border: "1px solid #334155", color: "#94a3b8", fontSize: 10, padding: "2px 8px", borderRadius: 3, cursor: "pointer" }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 14, cursor: "pointer" }}>✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6, padding: "10px 14px" }}>
        {[
          { label: "Articles", val: articles.length, color: "#38bdf8" },
          { label: "Fully Grounded", val: fullyGrounded, color: "#00ff88" },
          { label: "Risk Only", val: riskOnly, color: "#a78bfa" },
          { label: "Case Only", val: caseOnly, color: "#38bdf8" },
          { label: "Coverage %", val: `${pct}%`, color: fullyGrounded > 0 ? "#00ff88" : "#64748b" },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: "#0f172a", border: "1px solid #1e3a5f", borderRadius: 5, padding: "6px 4px", textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {dark > 0 && (
        <div style={{ margin: "0 14px 8px", background: "#0c0a1a", border: "1px solid #4338ca", borderRadius: 4, padding: "5px 10px", fontSize: 11, color: "#a5b4fc" }}>
          ⚠ {dark} knowledge articles have no risk signal or investigation cross-reference (dark gaps)
        </div>
      )}

      {err && <div style={{ margin: "0 14px 8px", color: "#f87171", fontSize: 11 }}>Error: {err}</div>}
      {loading && <div style={{ margin: "0 14px 8px", color: "#38bdf8", fontSize: 11 }}>Loading…</div>}

      {/* assess */}
      <div style={{ padding: "0 14px 8px" }}>
        <button
          onClick={assess}
          disabled={assessing}
          style={{ background: "#0f172a", border: "1px solid #334155", color: "#94a3b8", fontSize: 10, padding: "4px 12px", borderRadius: 3, cursor: "pointer" }}
        >
          {assessing ? "Assessing…" : "▶ ASSESS"}
        </button>
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 14px 8px", flexWrap: "wrap" }}>
        {["ALL", "FULLY_GROUNDED", "RISK_ONLY", "CASE_ONLY", "DARK"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? "#1e3a5f" : "#0f172a",
              border: `1px solid ${filter === f ? "#38bdf8" : "#334155"}`,
              color: filter === f ? "#7dd3fc" : "#64748b",
              fontSize: 10,
              padding: "3px 9px",
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            {f}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search articles…"
          style={{ flex: 1, minWidth: 100, background: "#0f172a", border: "1px solid #334155", color: "#e2e8f0", fontSize: 10, padding: "3px 8px", borderRadius: 3, outline: "none" }}
        />
      </div>

      {/* article list */}
      <div style={{ padding: "0 14px 14px" }}>
        {visible.slice(0, 80).map((a, i) => {
          const id = a.id || a.title || i;
          const isExp = expanded === id;
          const label = a.title || a.name || `Article ${i + 1}`;
          return (
            <div
              key={id}
              onClick={() => setExpanded(isExp ? null : id)}
              style={{ cursor: "pointer", padding: "6px 8px", marginBottom: 4, background: "#0f172a", border: "1px solid #1e3a5f", borderRadius: 4 }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 11, color: "#e2e8f0" }}>{label}</span>
                  {a.kind && <span style={{ marginLeft: 6, fontSize: 9, color: "#64748b", background: "#0a0f1e", border: "1px solid #334155", borderRadius: 2, padding: "0 4px" }}>{a.kind}</span>}
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: TYPE_COLOR[a.type] ?? "#94a3b8", background: "#0a0f1e", padding: "1px 6px", borderRadius: 3, border: `1px solid ${TYPE_COLOR[a.type] ?? "#334155"}`, whiteSpace: "nowrap", marginLeft: 6 }}>
                  {a.type}
                </span>
              </div>
              {isExp && (
                <div style={{ marginTop: 8 }}>
                  {a.rMatches?.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 10, color: "#a78bfa", marginBottom: 3 }}>Risk Signals ({a.rMatches.length})</div>
                      {a.rMatches.slice(0, 5).map((r, ri) => (
                        <div key={ri} style={{ fontSize: 10, color: "#94a3b8", padding: "2px 6px", background: "#1a0828", borderRadius: 3, marginBottom: 2, display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ fontSize: 9, color: SEV_COLOR[r.severity] ?? "#94a3b8", border: `1px solid ${SEV_COLOR[r.severity] ?? "#334155"}`, borderRadius: 2, padding: "0 4px" }}>{r.severity || "?"}</span>
                          {r.name || r.title || r.signal || r.id}
                        </div>
                      ))}
                    </div>
                  )}
                  {a.iMatches?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: "#38bdf8", marginBottom: 3 }}>Investigations ({a.iMatches.length})</div>
                      {a.iMatches.slice(0, 5).map((c, ci) => (
                        <div key={ci} style={{ fontSize: 10, color: "#94a3b8", padding: "2px 6px", background: "#031220", borderRadius: 3, marginBottom: 2, display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ fontSize: 9, color: STATUS_COLOR[c.status] ?? "#94a3b8", border: `1px solid ${STATUS_COLOR[c.status] ?? "#334155"}`, borderRadius: 2, padding: "0 4px" }}>{c.status || "?"}</span>
                          {c.title || c.name || c.summary || c.id}
                        </div>
                      ))}
                    </div>
                  )}
                  {a.rMatches?.length === 0 && a.iMatches?.length === 0 && (
                    <div style={{ fontSize: 10, color: "#475569", fontStyle: "italic" }}>No cross-references found</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {visible.length === 0 && !loading && (
          <div style={{ color: "#475569", fontSize: 11, textAlign: "center", padding: "20px 0" }}>No articles match filter</div>
        )}
        {visible.length > 80 && (
          <div style={{ color: "#475569", fontSize: 10, textAlign: "center", padding: "8px 0" }}>Showing 80 of {visible.length}</div>
        )}
      </div>
    </div>
  );
}
