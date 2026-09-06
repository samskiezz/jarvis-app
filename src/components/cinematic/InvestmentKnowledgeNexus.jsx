/**
 * InvestmentKnowledgeNexus — F632
 * "JARVIS, invkno / investment knowledge / knowledge investment / documented holdings /
 *  which investments have articles / investment intel / portfolio knowledge / undocumented holdings"
 * Cross-references /entities/Investment against /knowledge/ articles.
 * DOCUMENTED investments (≥1 article keyword-matches) vs UNDOCUMENTED (knowledge blind spots).
 * Coverage % tile; ALL/DOCUMENTED/UNDOCUMENTED filter tabs + search; click-to-expand matched articles.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence portfolio-intelligence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4444";
const DIM = "#8899AA";
const GLD = "#FFD700";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 102_800;
const Z_INDEX  = 178;

const INVKNO_RE =
  /\binvkno\b|\binvest.?knowl\b|\bknowl.?invest\b|\bdocumented.?hold\b|\bundocumented.?hold\b|\bwhich.?invest.?(?:have|has).?article\b|\binvestment.?intel\b|\bportfolio.?knowl\b|\binvestment.?article\b|\bholding.?knowl\b/i;

export function isInvknoQuery(text) {
  return INVKNO_RE.test(text || "");
}

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

function normaliseInvestments(data) {
  if (!data) return [];
  const raw =
    data.investments || data.holdings || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((inv, i) => ({
    id:     inv.id || `inv-${i}`,
    name:   inv.name || inv.title || inv.ticker || inv.symbol || `Holding ${i + 1}`,
    type:   (inv.type || inv.asset_class || inv.category || "equity").toUpperCase(),
    ticker: inv.ticker || inv.symbol || "",
    value:  inv.value || inv.amount || inv.market_value || 0,
    tags:   inv.tags || [],
  }));
}

function normaliseArticles(data) {
  if (!data) return [];
  const raw =
    data.articles || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((a, i) => ({
    id:    a.id || `art-${i}`,
    title: a.title || a.name || `Article ${i + 1}`,
    kind:  a.kind || a.type || a.category || "note",
    tags:  a.tags || [],
  }));
}

function crossRef(investments, articles) {
  return investments.map((inv) => {
    const haystack = `${inv.name} ${inv.ticker} ${(inv.tags || []).join(" ")}`;
    const matches = articles
      .map((art) => {
        const needle = `${art.title} ${(art.tags || []).join(" ")}`;
        const hits = overlap(haystack, needle);
        return hits > 0 ? { ...art, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits);
    return { ...inv, documented: matches.length > 0, articles: matches };
  });
}

export async function buildInvknoScript() {
  try {
    const base = apiBase();
    const [invRes, artRes] = await Promise.all([
      fetch(`${base}/entities/Investment`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/knowledge/`,          { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const [invData, artData] = await Promise.all([invRes.json(), artRes.json()]);
    const investments = normaliseInvestments(invData);
    const articles    = normaliseArticles(artData);
    const rows        = crossRef(investments, articles);
    const documented  = rows.filter((r) => r.documented).length;
    const undocumented = rows.length - documented;
    const pct = rows.length ? Math.round((documented / rows.length) * 100) : 0;
    if (!rows.length) return "No investment holdings found in the system, sir.";
    const topBlind = rows
      .filter((r) => !r.documented)
      .slice(0, 2)
      .map((r) => r.name)
      .join("; ");
    return (
      `${documented} of ${rows.length} investment holdings are documented in the knowledge base (${pct}% portfolio knowledge coverage). ` +
      (undocumented > 0
        ? `${undocumented} holding${undocumented !== 1 ? "s" : ""} have no knowledge backing — intelligence blind spots: ${topBlind || "unknown"}.`
        : "All holdings have associated knowledge articles.")
    );
  } catch {
    return "Unable to reach investment or knowledge endpoints, sir.";
  }
}

const KIND_COLOR = {
  note:    CY,
  report:  GLD,
  article: GRN,
  alert:   RED,
  intel:   AMB,
};

const TYPE_COLOR = {
  EQUITY:    GLD,
  BOND:      CY,
  CRYPTO:    AMB,
  CASH:      GRN,
  ETF:       "#B06EFF",
  REIT:      "#FB923C",
  COMMODITY: RED,
};

export default function InvestmentKnowledgeNexus() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [brief,     setBrief]     = useState("");
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const [invRes, artRes] = await Promise.all([
        fetch(`${base}/entities/Investment`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/knowledge/`,          { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const [invData, artData] = await Promise.all([invRes.json(), artRes.json()]);
      setRows(crossRef(normaliseInvestments(invData), normaliseArticles(artData)));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen((v) => !v); };
    window.addEventListener("jarvis:invkno-toggle", handler);
    return () => window.removeEventListener("jarvis:invkno-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const documented   = rows.filter((r) => r.documented).length;
  const undocumented = rows.length - documented;
  const pct          = rows.length ? Math.round((documented / rows.length) * 100) : 0;

  const visible = rows.filter((r) => {
    const matchTab =
      tab === "ALL"          ? true :
      tab === "DOCUMENTED"   ? r.documented :
      !r.documented;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      r.name.toLowerCase().includes(q) ||
      r.ticker.toLowerCase().includes(q) ||
      r.type.toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  async function assess() {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const script = await buildInvknoScript();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Portfolio knowledge coverage assessment: ${script}. Provide a concise 2-sentence strategic brief.` }),
      });
      const d = await r.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(text);
      if (text) {
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch {
      setBrief("Unable to reach reasoning core, sir.");
    } finally {
      setAssessing(false);
    }
  }

  const tabStyle = (t) => ({
    background: tab === t ? `${CY}22` : "transparent",
    border: `1px solid ${tab === t ? CY : DIM}44`,
    borderRadius: 4,
    color: tab === t ? CY : DIM,
    cursor: "pointer",
    fontSize: 9,
    letterSpacing: 1,
    padding: "3px 7px",
  });

  const badge = undocumented > 0 ? undocumented : null;

  return (
    <>
      {/* floating button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Investment × Knowledge Nexus (INVKNO)"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: Z_INDEX,
          background: open ? `${CY}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${CY}${open ? "99" : "44"}`,
          borderRadius: 5,
          color: CY,
          cursor: "pointer",
          fontSize: 9,
          letterSpacing: 1,
          padding: "4px 8px",
          backdropFilter: "blur(6px)",
          whiteSpace: "nowrap",
        }}
      >
        ◈ INVKNO{badge ? <span style={{ marginLeft: 4, background: AMB, color: "#000", borderRadius: 3, padding: "0 4px", fontSize: 9 }}>{badge}</span> : null}
      </button>

      {/* panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            left: BTN_LEFT,
            bottom: 36,
            zIndex: Z_INDEX + 1,
            width: 340,
            maxHeight: "70vh",
            overflowY: "auto",
            background: "rgba(4,7,12,0.96)",
            border: `1px solid ${CY}44`,
            borderRadius: 8,
            padding: "12px 14px",
            backdropFilter: "blur(14px)",
            boxShadow: `0 0 28px ${CY}22`,
            fontFamily: "monospace",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: "bold" }}>INVESTMENT × KNOWLEDGE NEXUS</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
            {[
              { label: "HOLDINGS",     value: rows.length,  color: CY },
              { label: "DOCUMENTED",   value: documented,   color: GRN },
              { label: "UNDOCUMENTED", value: undocumented, color: undocumented > 0 ? AMB : GRN },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${color}33`, borderRadius: 6, padding: "6px 8px", textAlign: "center" }}
              >
                <div style={{ color, fontSize: 16, fontWeight: "bold" }}>{loading ? "…" : value}</div>
                <div style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* coverage bar */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>PORTFOLIO KNOWLEDGE COVERAGE</span>
              <span style={{ color: pct >= 70 ? GRN : pct >= 40 ? AMB : RED, fontSize: 10, fontWeight: "bold" }}>{pct}%</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct >= 70 ? GRN : pct >= 40 ? AMB : RED, borderRadius: 2, transition: "width 0.4s" }} />
            </div>
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
            {["ALL", "DOCUMENTED", "UNDOCUMENTED"].map((t) => (
              <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search holdings…"
            style={{ width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.4)", border: `1px solid ${CY}33`, borderRadius: 5, color: "#DCEBF5", padding: "5px 8px", fontSize: 11, marginBottom: 8, outline: "none" }}
          />

          {/* list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 12 }}>No holdings match.</div>
            )}
            {visible.map((inv) => (
              <div
                key={inv.id}
                style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${inv.documented ? GRN : AMB}33`, borderRadius: 6, padding: "7px 9px", cursor: "pointer" }}
                onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ color: inv.documented ? GRN : AMB, fontSize: 10 }}>{inv.documented ? "●" : "○"}</span>
                  <span style={{ color: TYPE_COLOR[inv.type] || GLD, fontSize: 9, border: `1px solid ${(TYPE_COLOR[inv.type] || GLD)}44`, borderRadius: 3, padding: "1px 4px" }}>{inv.type}</span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>{inv.name}</span>
                  {inv.ticker && <span style={{ color: DIM, fontSize: 9 }}>{inv.ticker}</span>}
                  <span style={{ color: inv.documented ? GRN : DIM, fontSize: 9 }}>
                    {inv.documented ? `${inv.articles.length} article${inv.articles.length !== 1 ? "s" : ""}` : "UNDOCUMENTED"}
                  </span>
                </div>

                {expanded === inv.id && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${CY}22`, paddingTop: 6 }}>
                    {inv.documented ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {inv.articles.map((art) => (
                          <div key={art.id} style={{ background: "rgba(41,231,255,0.04)", border: `1px solid ${CY}33`, borderRadius: 4, padding: "5px 7px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ color: KIND_COLOR[art.kind] || CY, fontSize: 9, border: `1px solid ${(KIND_COLOR[art.kind] || CY)}44`, borderRadius: 3, padding: "1px 4px" }}>{art.kind}</span>
                              <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{art.title}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>hits: {art.hits}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No knowledge articles matched this holding — portfolio intelligence blind spot.</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* assess */}
          <div style={{ marginTop: 10, borderTop: `1px solid ${CY}22`, paddingTop: 8 }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{ background: `${CY}18`, border: `1px solid ${CY}55`, borderRadius: 5, color: CY, padding: "5px 12px", cursor: "pointer", fontSize: 10, letterSpacing: 1, width: "100%", opacity: assessing ? 0.6 : 1 }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, color: "#DCEBF5", fontSize: 10, lineHeight: 1.5, borderLeft: `2px solid ${CY}`, paddingLeft: 8 }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
