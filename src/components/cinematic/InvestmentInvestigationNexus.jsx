/**
 * InvestmentInvestigationNexus — F525
 * "JARVIS, investment investigation / portfolio investigation / invinv /
 *  which investments are under investigation / investment cases"
 * Cross-references /entities/Investment + /v1/investigations.
 * Finds LINKED investments (≥1 investigation keyword-matches name/ticker/tags) vs CLEAN.
 * Coverage % tile; ALL/LINKED/CLEAN filter tabs + search; click-to-expand matched investigations.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence financial-intelligence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4466";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 39_300;
const Z_INDEX  = 104;

const INVINV_RE =
  /\binvinv\b|\binvestment.?invest(igation)?\b|\bportfolio.?invest(igation)?\b|\bwhich.?invest\w*.?are.?under.?invest\b|\binvestment.?case\b|\bportfolio.?under.?invest\b/i;

export function isInvinvQuery(text) {
  return INVINV_RE.test(text || "");
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function keywords(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function overlap(a, b) {
  const sa = new Set(keywords(a));
  return keywords(b).filter((w) => sa.has(w)).length;
}

function normaliseInvestments(data) {
  if (!data) return [];
  const raw =
    data.investments || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((inv, i) => ({
    id:     inv.id || `inv-${i}`,
    name:   inv.name || inv.title || inv.asset || `Investment ${i + 1}`,
    ticker: inv.ticker || inv.symbol || "",
    kind:   inv.kind || inv.type || inv.category || "ASSET",
    value:  inv.value || inv.amount || inv.current_value || null,
    tags:   Array.isArray(inv.tags) ? inv.tags.join(" ") : String(inv.tags || ""),
    notes:  inv.notes || inv.description || inv.summary || "",
  }));
}

function normaliseInvestigations(data) {
  if (!data) return [];
  const raw =
    data.investigations || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((c, i) => ({
    id:      c.id || `case-${i}`,
    name:    c.name || c.title || c.case_name || `Case ${i + 1}`,
    status:  (c.status || c.state || "OPEN").toUpperCase(),
    lead:    c.lead || c.assigned_to || c.owner || "",
    summary: c.summary || c.description || "",
    tags:    Array.isArray(c.tags) ? c.tags.join(" ") : String(c.tags || ""),
  }));
}

function crossRef(investments, investigations) {
  return investments.map((inv) => {
    const haystack = `${inv.name} ${inv.ticker} ${inv.tags} ${inv.notes}`;
    const matches = investigations
      .map((c) => ({
        c,
        hits: overlap(haystack, `${c.name} ${c.summary} ${c.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...inv,
      linked: matches.length > 0,
      matches: matches.map(({ c, hits }) => ({ ...c, hits })),
    };
  });
}

const STATUS_COLOR = {
  OPEN:      "#29E7FF",
  ACTIVE:    "#00E5A0",
  CLOSED:    "#556677",
  ESCALATED: "#FF4466",
};

// ─── buildInvinvScript (for JarvisBrain) ────────────────────────────────────

export async function buildInvinvScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [invRes, caseRes] = await Promise.all([
      fetch(`${base}/entities/Investment`, { headers: hdr }),
      fetch(`${base}/v1/investigations`, { headers: hdr }),
    ]);
    const [invData, caseData] = await Promise.all([
      invRes.ok ? invRes.json() : {},
      caseRes.ok ? caseRes.json() : {},
    ]);
    const investments   = normaliseInvestments(invData);
    const investigations = normaliseInvestigations(caseData);
    const crossed = crossRef(investments, investigations);
    const linked  = crossed.filter((i) => i.linked);
    const clean   = crossed.filter((i) => !i.linked);
    const pct     = crossed.length
      ? Math.round((linked.length / crossed.length) * 100)
      : 0;
    const topLinked = linked.slice(0, 3).map((i) => i.name).join(", ");

    const prompt = `JARVIS financial-intelligence brief: ${investments.length} portfolio holdings cross-referenced against ${investigations.length} active investigations. ${linked.length} investments are LINKED to at least one investigation (${pct}% of portfolio); ${clean.length} appear clean. Top linked holdings: ${topLinked || "none"}. In exactly 2 sentences, summarise the financial-intelligence exposure and recommend an immediate action.`;
    const chatRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({ message: prompt }),
    });
    const chatData = chatRes.ok ? await chatRes.json() : {};
    const brief = chatData.response || chatData.message || chatData.reply ||
      `${linked.length} of ${crossed.length} investments linked to investigations (${pct}%). ${clean.length} appear clean.`;

    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: brief } }));
    return brief;
  } catch (e) {
    return `Investment investigation nexus error: ${e.message}`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function InvestmentInvestigationNexus() {
  const [open,      setOpen]      = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [crossed,   setCrossed]   = useState([]);
  const [tab,       setTab]       = useState("ALL");
  const [query,     setQuery]     = useState("");
  const [expanded,  setExp]       = useState(null);
  const [brief,     setBrief]     = useState("");
  const [assessing, setAssessing] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [invRes, caseRes] = await Promise.all([
        fetch(`${base}/entities/Investment`, { headers: hdr }),
        fetch(`${base}/v1/investigations`, { headers: hdr }),
      ]);
      const [invData, caseData] = await Promise.all([
        invRes.ok ? invRes.json() : {},
        caseRes.ok ? caseRes.json() : {},
      ]);
      const investments    = normaliseInvestments(invData);
      const investigations = normaliseInvestigations(caseData);
      setCrossed(crossRef(investments, investigations));
    } catch (_) {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:invinv-toggle", toggle);
    return () => window.removeEventListener("jarvis:invinv-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try {
      const result = await buildInvinvScript();
      setBrief(result);
    } finally {
      setAssessing(false);
    }
  }, []);

  const linked  = crossed.filter((i) => i.linked);
  const clean   = crossed.filter((i) => !i.linked);
  const pct     = crossed.length
    ? Math.round((linked.length / crossed.length) * 100)
    : 0;

  const visible = crossed
    .filter((i) =>
      tab === "ALL"    ? true :
      tab === "LINKED" ? i.linked :
      !i.linked
    )
    .filter((i) =>
      !query ||
      i.name.toLowerCase().includes(query.toLowerCase()) ||
      i.ticker.toLowerCase().includes(query.toLowerCase())
    );

  const badgeCount = linked.length;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          position:   "fixed",
          left:       BTN_LEFT,
          bottom:     8,
          zIndex:     Z_INDEX,
          background: open ? `${AMB}22` : "rgba(0,0,0,0.7)",
          border:     `1px solid ${open ? AMB : CY + "55"}`,
          color:      open ? AMB : CY,
          cursor:     "pointer",
          padding:    "3px 10px",
          borderRadius: 3,
          fontSize:   10,
          fontFamily: "monospace",
          whiteSpace: "nowrap",
        }}
      >
        ◈ INVINV
        {badgeCount > 0 && (
          <span
            style={{
              marginLeft: 5,
              background: AMB,
              color:      "#000",
              borderRadius: 9,
              padding:    "0 5px",
              fontSize:   9,
              fontWeight: "bold",
            }}
          >
            {badgeCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position:   "fixed",
            bottom:     40,
            left:       BTN_LEFT - 280,
            width:      380,
            maxHeight:  520,
            overflowY:  "auto",
            background: "rgba(4,10,20,0.97)",
            border:     `1px solid ${AMB}55`,
            borderRadius: 6,
            zIndex:     Z_INDEX + 1,
            padding:    "12px 14px",
            fontFamily: "monospace",
            color:      CY,
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: "bold", color: AMB }}>
              ◈ INVESTMENT × INVESTIGATION NEXUS
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none",
                border:     "none",
                color:      DIM,
                cursor:     "pointer",
                fontSize:   14,
              }}
            >
              ×
            </button>
          </div>

          {/* Stats tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {[
              { label: "HOLDINGS",  value: crossed.length, color: CY  },
              { label: "LINKED",    value: linked.length,  color: AMB },
              { label: "CLEAN",     value: clean.length,   color: GRN },
              { label: "COVERAGE",  value: `${pct}%`,      color: RED },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  flex:       1,
                  background: "rgba(41,231,255,0.05)",
                  border:     `1px solid ${CY}22`,
                  borderRadius: 3,
                  padding:    "6px 4px",
                  textAlign:  "center",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: "bold", color }}>{value}</div>
                <div style={{ fontSize: 8, color: DIM, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Assess */}
          <div style={{ marginBottom: 10 }}>
            <button
              onClick={assess}
              disabled={assessing || crossed.length === 0}
              style={{
                background: assessing
                  ? "rgba(41,231,255,0.1)"
                  : "rgba(41,231,255,0.15)",
                border:     `1px solid ${CY}88`,
                color:      CY,
                cursor:     assessing ? "wait" : "pointer",
                padding:    "4px 14px",
                borderRadius: 3,
                fontSize:   10,
                fontFamily: "monospace",
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div
                style={{
                  marginTop:  8,
                  fontSize:   10,
                  color:      "#cde",
                  lineHeight: 1.5,
                  padding:    "6px 8px",
                  background: "rgba(41,231,255,0.05)",
                  borderRadius: 3,
                }}
              >
                {brief}
              </div>
            )}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {["ALL", "LINKED", "CLEAN"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "none",
                  border:     `1px solid ${tab === t ? CY : CY + "33"}`,
                  color:      tab === t ? CY : DIM,
                  cursor:     "pointer",
                  padding:    "2px 10px",
                  borderRadius: 3,
                  fontSize:   10,
                  fontFamily: "monospace",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search investments…"
            style={{
              width:      "100%",
              background: "rgba(41,231,255,0.06)",
              border:     `1px solid ${CY}33`,
              color:      CY,
              padding:    "4px 8px",
              borderRadius: 3,
              fontSize:   10,
              marginBottom: 8,
              boxSizing:  "border-box",
              fontFamily: "monospace",
            }}
          />

          {/* Investment rows */}
          {loading ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
              Loading…
            </div>
          ) : visible.length === 0 ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
              No investments match.
            </div>
          ) : (
            visible.map((inv) => (
              <div key={inv.id}>
                <div
                  onClick={() => setExp(expanded === inv.id ? null : inv.id)}
                  style={{
                    display:    "flex",
                    alignItems: "center",
                    gap:        8,
                    padding:    "5px 6px",
                    marginBottom: 3,
                    cursor:     "pointer",
                    borderRadius: 3,
                    background: "rgba(41,231,255,0.04)",
                    border:     `1px solid ${inv.linked ? AMB + "44" : DIM + "22"}`,
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      color:    inv.linked ? AMB : GRN,
                      minWidth: 52,
                    }}
                  >
                    {inv.linked ? "LINKED" : "CLEAN"}
                  </span>
                  <span
                    style={{
                      flex:          1,
                      fontSize:      10,
                      color:         inv.linked ? AMB : GRN,
                      overflow:      "hidden",
                      textOverflow:  "ellipsis",
                      whiteSpace:    "nowrap",
                    }}
                  >
                    {inv.name}
                    {inv.ticker && (
                      <span style={{ color: DIM, marginLeft: 4, fontSize: 9 }}>
                        [{inv.ticker}]
                      </span>
                    )}
                  </span>
                  {inv.linked && (
                    <span style={{ fontSize: 8, color: AMB }}>
                      ⬡ {inv.matches.length} case{inv.matches.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {/* Expanded matched investigations */}
                {expanded === inv.id && inv.linked && (
                  <div style={{ marginLeft: 12, marginBottom: 6 }}>
                    {inv.matches.map((c) => (
                      <div
                        key={c.id}
                        style={{
                          padding:    "3px 6px",
                          marginBottom: 2,
                          borderRadius: 2,
                          background: "rgba(255,165,0,0.05)",
                          border:     `1px solid ${CY}22`,
                          fontSize:   9,
                        }}
                      >
                        <span
                          style={{
                            color:      STATUS_COLOR[c.status] || DIM,
                            marginRight: 4,
                            fontWeight: "bold",
                          }}
                        >
                          [{c.status}]
                        </span>
                        <span style={{ color: AMB }}>{c.name}</span>
                        {c.lead && (
                          <span style={{ color: DIM, marginLeft: 6 }}>
                            lead: {c.lead}
                          </span>
                        )}
                        <span style={{ color: DIM, marginLeft: 6 }}>
                          hits:{c.hits}
                        </span>
                        {c.summary && (
                          <div
                            style={{
                              marginTop: 3,
                              color:     DIM,
                              fontSize:  8,
                              lineHeight: 1.4,
                              overflow:  "hidden",
                              display:   "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                            }}
                          >
                            {c.summary}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {expanded === inv.id && !inv.linked && (
                  <div
                    style={{
                      marginLeft: 12,
                      marginBottom: 6,
                      fontSize:   9,
                      color:      DIM,
                    }}
                  >
                    No active investigations reference this holding.
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}
