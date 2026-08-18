/**
 * DecisionIntelCompleteness — F169.
 *
 * Parallel-fetches /v1/decision/list + /v1/reports + /knowledge/ and
 * keyword-correlates each strategic decision against BOTH the report
 * catalogue (evidence) AND the knowledge-article library (know-how).
 *
 * Completeness tiers:
 *   COMPLETE     — decision has ≥1 report AND ≥1 knowledge article
 *   EVIDENCE-ONLY — decision has a report but no knowledge article
 *   KNOW-ONLY    — decision has a knowledge article but no report
 *   BLIND        — decision has neither (pure assumption)
 *
 * Intent: "JARVIS, decision intelligence" / "dicom" / "decision completeness"
 *   → jarvis:dicom-toggle + TTS brief via buildDicomScript()
 *
 * Toggle: ◈ DICOM at left:56200, bottom:8, zIndex:110.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GREEN = "#00c878";
const AMBER = "#F5A623";
const RED = "#FF3D5A";
const VIOLET = "#A78BFA";
const BTN_LEFT = 56200;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isDicomQuery(q) {
  return /decision.{0,20}(intel|complet|audit|quality|backing|evidence|knowledge)|dicom\b|decision\s+intell|complete\s+decision|strategic\s+intell\s+complet/i.test(
    q || ""
  );
}

export async function buildDicomScript() {
  try {
    const [dr, rr, kr] = await Promise.all([
      fetch(`${apiBase()}/v1/decision/list`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${apiBase()}/v1/reports`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${apiBase()}/knowledge/`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const decisions = normaliseArray(dr.ok ? await dr.json() : []);
    const reports = normaliseArray(rr.ok ? await rr.json() : []);
    const articles = normaliseArray(kr.ok ? await kr.json() : []);
    const tiers = classifyDecisions(decisions, reports, articles);
    const blind = tiers.filter((t) => t.tier === "BLIND").length;
    const complete = tiers.filter((t) => t.tier === "COMPLETE").length;
    window.dispatchEvent(new CustomEvent("jarvis:dicom-toggle"));
    if (!decisions.length)
      return "No strategic decisions on record, sir. The decision ledger is empty.";
    return `Decision intelligence completeness monitor active, sir. ${decisions.length} strategic decision${decisions.length !== 1 ? "s" : ""} cross-referenced against ${reports.length} report${reports.length !== 1 ? "s" : ""} and ${articles.length} knowledge article${articles.length !== 1 ? "s" : ""}. ${complete} decision${complete !== 1 ? "s" : ""} ${complete !== 1 ? "are" : "is"} fully backed with both evidence and know-how. ${blind} decision${blind !== 1 ? "s" : ""} ${blind !== 1 ? "lack" : "lacks"} any intelligence foundation and ${blind !== 1 ? "represent" : "represents"} a strategic blind spot.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:dicom-toggle"));
    return "Opening the decision intelligence completeness monitor, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function DecisionIntelCompleteness() {
  const [visible, setVisible] = useState(false);
  const [decisions, setDecisions] = useState([]);
  const [reports, setReports] = useState([]);
  const [articles, setArticles] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [aiMap, setAiMap] = useState({});
  const [aiLoading, setAiLoading] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [dr, rr, kr] = await Promise.all([
        fetch(`${apiBase()}/v1/decision/list`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
        fetch(`${apiBase()}/v1/reports`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
        fetch(`${apiBase()}/knowledge/`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
      ]);
      const decs = normaliseArray(dr.ok ? await dr.json() : []);
      const rpts = normaliseArray(rr.ok ? await rr.json() : []);
      const arts = normaliseArray(kr.ok ? await kr.json() : []);
      setDecisions(decs);
      setReports(rpts);
      setArticles(arts);
      setTiers(classifyDecisions(decs, rpts, arts));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:dicom-toggle", onToggle);
    return () => window.removeEventListener("jarvis:dicom-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, 120_000);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function getAiAssessment(decId) {
    if (aiMap[decId] || aiLoading === decId) return;
    const tier = tiers.find((t) => t.id === decId);
    if (!tier) return;
    setAiLoading(decId);
    const title = tier.dec.title || tier.dec.name || "Unknown Decision";
    const reason = tier.dec.reason || tier.dec.rationale || "";
    const rptTitles = tier.matchedReports.map((r) => r.title || r.name || "Report").join("; ") || "none";
    const artTitles = tier.matchedArticles.map((a) => a.title || a.name || "Article").join("; ") || "none";
    const prompt = `As JARVIS, provide a 2-sentence strategic intelligence completeness assessment for decision "${title}"${reason ? ` (rationale: ${String(reason).slice(0, 120)})` : ""}. Matched evidence reports: ${rptTitles}. Matched knowledge articles: ${artTitles}. Assess whether this decision is sufficiently backed by intelligence and recommend what additional coverage is needed.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAiMap((prev) => ({ ...prev, [decId]: answer }));
      if (answer)
        window.dispatchEvent(
          new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } })
        );
    } catch (_) {
      setAiMap((prev) => ({ ...prev, [decId]: "Unable to reach reasoning core." }));
    } finally {
      setAiLoading(null);
    }
  }

  const blindCount = tiers.filter((t) => t.tier === "BLIND").length;
  const completeCount = tiers.filter((t) => t.tier === "COMPLETE").length;

  const filtered = tiers.filter((t) => {
    const tierMatch =
      filter === "all" ||
      (filter === "complete" && t.tier === "COMPLETE") ||
      (filter === "evidence" && t.tier === "EVIDENCE-ONLY") ||
      (filter === "know" && t.tier === "KNOW-ONLY") ||
      (filter === "blind" && t.tier === "BLIND");
    if (!tierMatch) return false;
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    const dec = t.dec;
    return (
      (dec.title || "").toLowerCase().includes(s) ||
      (dec.reason || "").toLowerCase().includes(s) ||
      (dec.rationale || "").toLowerCase().includes(s)
    );
  });

  const selectedTier = selected ? tiers.find((t) => t.id === selected) : null;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Decision Intelligence Completeness Monitor"
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 110,
          height: 26,
          padding: "0 8px",
          background: visible ? `${CY}22` : "rgba(8,14,22,0.82)",
          border: `1px solid ${visible ? CY : "#2A3A4A"}`,
          borderRadius: 5,
          color: visible ? CY : "#6E8AA0",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: 1,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {blindCount > 0 && !visible && (
          <span
            style={{
              display: "inline-block",
              marginRight: 5,
              background: AMBER,
              color: "#000",
              borderRadius: "50%",
              width: 14,
              height: 14,
              fontSize: 9,
              lineHeight: "14px",
              textAlign: "center",
              fontWeight: 700,
            }}
          >
            {blindCount}
          </span>
        )}
        ◈ DICOM
      </button>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position: "fixed",
            bottom: 44,
            left: Math.min(BTN_LEFT, window.innerWidth - 700),
            zIndex: 110,
            width: 680,
            maxHeight: "78vh",
            display: "flex",
            flexDirection: "column",
            background: "rgba(4,10,18,0.97)",
            border: `1px solid ${CY}44`,
            borderTop: `2px solid ${CY}`,
            borderRadius: 12,
            boxShadow: `0 0 40px ${CY}14, 0 8px 32px rgba(0,0,0,0.80)`,
            fontFamily: "'JetBrains Mono', monospace",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderBottom: `1px solid ${CY}22`,
              flexShrink: 0,
            }}
          >
            <span style={{ color: CY, fontSize: 13 }}>◈</span>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              DECISION INTELLIGENCE COMPLETENESS
            </span>
            {loading && (
              <span style={{ marginLeft: "auto", color: "#6E8AA0", fontSize: 10 }}>
                loading…
              </span>
            )}
            <button
              onClick={() => setVisible(false)}
              style={{
                marginLeft: loading ? 0 : "auto",
                background: "transparent",
                border: "none",
                color: "#6E8AA0",
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* Stat tiles */}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "8px 14px",
              borderBottom: "1px solid #1A2A3A",
              flexShrink: 0,
            }}
          >
            {[
              { label: "DECISIONS", val: decisions.length, col: CY },
              { label: "REPORTS", val: reports.length, col: VIOLET },
              { label: "ARTICLES", val: articles.length, col: "#5EEAD4" },
              { label: "COMPLETE", val: completeCount, col: GREEN },
              {
                label: "BLIND",
                val: blindCount,
                col: blindCount > 0 ? AMBER : "#4E6A7A",
              },
            ].map((t) => (
              <div
                key={t.label}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid #1A2A3A",
                  borderRadius: 6,
                  padding: "5px 6px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 14, color: t.col, fontWeight: 700 }}>{t.val}</div>
                <div
                  style={{
                    fontSize: 8,
                    color: "#4E6A7A",
                    letterSpacing: 1,
                    marginTop: 1,
                  }}
                >
                  {t.label}
                </div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              borderBottom: "1px solid #1A2A3A",
              flexShrink: 0,
              flexWrap: "wrap",
            }}
          >
            {[
              { key: "all", label: "ALL" },
              { key: "complete", label: "COMPLETE" },
              { key: "evidence", label: "EVIDENCE-ONLY" },
              { key: "know", label: "KNOW-ONLY" },
              { key: "blind", label: "BLIND" },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => { setFilter(f.key); setSelected(null); }}
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  border: `1px solid ${filter === f.key ? CY : "#2A3A4A"}`,
                  background: filter === f.key ? `${CY}22` : "transparent",
                  color: filter === f.key ? CY : "#6E8AA0",
                  fontSize: 9,
                  letterSpacing: 1,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {f.label}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search decisions…"
              style={{
                marginLeft: "auto",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid #2A3A4A",
                borderRadius: 4,
                color: "#DCEBF5",
                fontSize: 10,
                padding: "2px 8px",
                fontFamily: "inherit",
                width: 160,
                outline: "none",
              }}
            />
          </div>

          {/* Split body: decision list (left) + detail (right) */}
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
            {/* Decision list */}
            <div
              style={{
                width: 250,
                borderRight: "1px solid #1A2A3A",
                overflowY: "auto",
                flexShrink: 0,
              }}
            >
              {!loading && filtered.length === 0 && (
                <div style={{ padding: 14, color: "#6E8AA0", fontSize: 10 }}>
                  No decisions match this filter.
                </div>
              )}
              {filtered.map((t) => {
                const isActive = selected === t.id;
                const tierColor =
                  t.tier === "COMPLETE" ? GREEN
                  : t.tier === "EVIDENCE-ONLY" ? VIOLET
                  : t.tier === "KNOW-ONLY" ? "#5EEAD4"
                  : AMBER;
                const tierDot =
                  t.tier === "COMPLETE" ? GREEN
                  : t.tier === "EVIDENCE-ONLY" ? VIOLET
                  : t.tier === "KNOW-ONLY" ? "#5EEAD4"
                  : RED;
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelected(t.id)}
                    style={{
                      padding: "9px 12px",
                      borderBottom: "1px solid #0E1A26",
                      cursor: "pointer",
                      background: isActive ? `${CY}10` : "transparent",
                      borderLeft: isActive ? `3px solid ${CY}` : "3px solid transparent",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        marginBottom: 3,
                      }}
                    >
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: tierDot,
                          flexShrink: 0,
                          boxShadow: t.tier === "BLIND" ? `0 0 4px ${RED}` : undefined,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 10,
                          color: "#DCEBF5",
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {t.dec.title || t.dec.name || t.id}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 5,
                        paddingLeft: 12,
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 8,
                          color: tierColor,
                          letterSpacing: 1,
                          padding: "1px 4px",
                          border: `1px solid ${tierColor}44`,
                          borderRadius: 3,
                        }}
                      >
                        {t.tier}
                      </span>
                      <span style={{ fontSize: 8, color: "#4E6A7A" }}>
                        {t.matchedReports.length}R · {t.matchedArticles.length}K
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Detail pane */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {!selectedTier && (
                <div
                  style={{
                    padding: 20,
                    color: "#6E8AA0",
                    fontSize: 10,
                    lineHeight: 1.6,
                  }}
                >
                  Select a decision to see its matched reports and knowledge articles.
                </div>
              )}
              {selectedTier && (
                <div>
                  {/* Decision header + assess button */}
                  <div
                    style={{
                      padding: "10px 14px",
                      borderBottom: "1px solid #1A2A3A",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#DCEBF5",
                          marginBottom: 3,
                          fontWeight: 700,
                        }}
                      >
                        {selectedTier.dec.title || selectedTier.dec.name || selectedTier.id}
                      </div>
                      {(selectedTier.dec.reason || selectedTier.dec.rationale) && (
                        <div
                          style={{
                            fontSize: 10,
                            color: "#4E8A9A",
                            lineHeight: 1.4,
                            maxHeight: 40,
                            overflow: "hidden",
                          }}
                        >
                          {String(
                            selectedTier.dec.reason ||
                              selectedTier.dec.rationale ||
                              ""
                          ).slice(0, 180)}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => getAiAssessment(selectedTier.id)}
                      disabled={
                        !!aiMap[selectedTier.id] ||
                        aiLoading === selectedTier.id
                      }
                      style={{
                        flexShrink: 0,
                        padding: "3px 10px",
                        borderRadius: 4,
                        border: `1px solid ${
                          aiMap[selectedTier.id]
                            ? `${GREEN}66`
                            : `${VIOLET}66`
                        }`,
                        background: aiMap[selectedTier.id]
                          ? `${GREEN}12`
                          : aiLoading === selectedTier.id
                          ? `${VIOLET}22`
                          : "transparent",
                        color: aiMap[selectedTier.id] ? GREEN : VIOLET,
                        fontSize: 9,
                        letterSpacing: 1,
                        cursor:
                          aiMap[selectedTier.id] || aiLoading === selectedTier.id
                            ? "default"
                            : "pointer",
                        fontFamily: "inherit",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {aiMap[selectedTier.id]
                        ? "✓ ASSESSED"
                        : aiLoading === selectedTier.id
                        ? "consulting…"
                        : "▶ ASSESS"}
                    </button>
                  </div>

                  {/* AI assessment */}
                  {aiMap[selectedTier.id] && (
                    <div
                      style={{
                        margin: "10px 14px",
                        padding: "8px 12px",
                        background: `${GREEN}0A`,
                        border: `1px solid ${GREEN}22`,
                        borderRadius: 6,
                        fontSize: 10,
                        color: "#A0D8B0",
                        lineHeight: 1.5,
                      }}
                    >
                      <span
                        style={{
                          color: GREEN,
                          fontSize: 8,
                          letterSpacing: 1,
                          fontWeight: 700,
                          display: "block",
                          marginBottom: 3,
                        }}
                      >
                        JARVIS ASSESSMENT
                      </span>
                      {aiMap[selectedTier.id]}
                    </div>
                  )}

                  {/* Tier badge */}
                  <TierBadge tier={selectedTier.tier} />

                  {/* Matched reports section */}
                  <SectionBlock
                    title={`EVIDENCE REPORTS (${selectedTier.matchedReports.length})`}
                    color={VIOLET}
                    empty={
                      selectedTier.matchedReports.length === 0
                        ? "No matching reports found — this decision lacks documentary evidence."
                        : null
                    }
                  >
                    {selectedTier.matchedReports.map((r, i) => (
                      <MatchRow
                        key={`rpt-${i}`}
                        icon="◉"
                        iconColor={VIOLET}
                        title={r.title || r.name || r.type || "Report"}
                        badge={r.type || r.category || null}
                        badgeColor={VIOLET}
                        score={r._score}
                        sub={r.summary ? String(r.summary).slice(0, 100) : null}
                      />
                    ))}
                  </SectionBlock>

                  {/* Matched knowledge articles section */}
                  <SectionBlock
                    title={`KNOWLEDGE ARTICLES (${selectedTier.matchedArticles.length})`}
                    color="#5EEAD4"
                    empty={
                      selectedTier.matchedArticles.length === 0
                        ? "No matching knowledge articles found — this decision lacks documented know-how."
                        : null
                    }
                  >
                    {selectedTier.matchedArticles.map((a, i) => (
                      <MatchRow
                        key={`art-${i}`}
                        icon="◈"
                        iconColor="#5EEAD4"
                        title={a.title || a.name || a.topic || "Article"}
                        badge={a.type || a.category || null}
                        badgeColor="#5EEAD4"
                        score={a._score}
                        sub={a.summary || a.content ? String(a.summary || a.content || "").slice(0, 100) : null}
                      />
                    ))}
                  </SectionBlock>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "5px 14px",
              borderTop: `1px solid ${CY}18`,
              fontSize: 10,
              color: "#4E6A7A",
              letterSpacing: 1,
              flexShrink: 0,
            }}
          >
            /v1/decision/list + /v1/reports + /knowledge/ · 120s auto-refresh · ▶ ASSESS for AI analysis
          </div>
        </div>
      )}
    </>
  );
}

// ─── sub-components ───────────────────────────────────────────────────────────

function TierBadge({ tier }) {
  const map = {
    COMPLETE: { color: "#00c878", label: "✓ COMPLETE — backed by reports AND knowledge articles" },
    "EVIDENCE-ONLY": { color: "#A78BFA", label: "◑ EVIDENCE-ONLY — report exists, but no knowledge documentation" },
    "KNOW-ONLY": { color: "#5EEAD4", label: "◑ KNOW-ONLY — knowledge article exists, but no supporting report" },
    BLIND: { color: "#F5A623", label: "⚠ BLIND — no evidence report and no knowledge article" },
  };
  const m = map[tier] || { color: "#6E8AA0", label: tier };
  return (
    <div
      style={{
        margin: "8px 14px",
        padding: "6px 10px",
        background: `${m.color}0A`,
        border: `1px solid ${m.color}33`,
        borderRadius: 5,
        fontSize: 10,
        color: m.color,
        letterSpacing: 1,
      }}
    >
      {m.label}
    </div>
  );
}

function SectionBlock({ title, color, children, empty }) {
  return (
    <div style={{ marginTop: 0 }}>
      <div
        style={{
          padding: "6px 14px",
          fontSize: 9,
          color,
          letterSpacing: 2,
          fontWeight: 700,
          borderBottom: "1px solid #1A2A3A",
          borderTop: "1px solid #1A2A3A",
        }}
      >
        {title}
      </div>
      {empty ? (
        <div
          style={{
            padding: "10px 14px",
            color: "#6E8AA0",
            fontSize: 10,
            fontStyle: "italic",
          }}
        >
          {empty}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function MatchRow({ icon, iconColor, title, badge, badgeColor, score, sub }) {
  return (
    <div style={{ padding: "8px 14px", borderBottom: "1px solid #0E1A26" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: sub ? 3 : 0 }}>
        <span style={{ color: iconColor, fontSize: 11, flexShrink: 0 }}>{icon}</span>
        <span
          style={{
            fontSize: 10,
            color: "#DCEBF5",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </span>
        {badge && (
          <span
            style={{
              fontSize: 8,
              color: badgeColor,
              padding: "1px 5px",
              border: `1px solid ${badgeColor}44`,
              borderRadius: 3,
              letterSpacing: 1,
              flexShrink: 0,
            }}
          >
            {String(badge).toUpperCase().slice(0, 12)}
          </span>
        )}
        <span style={{ fontSize: 9, color: "#4E6A7A", flexShrink: 0 }}>
          {score}
        </span>
      </div>
      {sub && (
        <div style={{ paddingLeft: 18, fontSize: 10, color: "#4E8A9A", lineHeight: 1.4 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const k of [
      "items", "results", "data", "decisions", "reports", "articles",
      "records", "knowledge", "documents", "nodes",
    ]) {
      if (Array.isArray(data[k])) return data[k];
    }
  }
  return [];
}

function keywords(str) {
  if (!str) return [];
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function matchItems(decision, items, titleFields, contentFields) {
  const decText = [
    decision.title || "",
    decision.name || "",
    decision.reason || "",
    decision.rationale || "",
    decision.risks || "",
    decision.alternatives || "",
    decision.expected_outcome || "",
    ...(Array.isArray(decision.tags) ? decision.tags : []),
  ].join(" ");
  const decKws = keywords(decText);
  if (!decKws.length) return [];

  return items
    .map((item) => {
      const itemText = [
        ...titleFields.map((f) => item[f] || ""),
        ...contentFields.map((f) => item[f] || ""),
        ...(Array.isArray(item.tags) ? item.tags : []),
      ].join(" ");
      const itemKws = keywords(itemText);
      const score = decKws.filter((w) => itemKws.includes(w)).length;
      return { item, score };
    })
    .filter((x) => x.score >= 1)
    .sort((a, b) => b.score - a.score)
    .map(({ item, score }) => ({ ...item, _score: score }));
}

function classifyDecisions(decisions, reports, articles) {
  return decisions.map((dec) => {
    const id = dec.id || dec._id || dec.title || Math.random().toString(36).slice(2);
    const matchedReports = matchItems(
      dec,
      reports,
      ["title", "name"],
      ["summary", "content", "type", "category", "description"]
    );
    const matchedArticles = matchItems(
      dec,
      articles,
      ["title", "name", "topic"],
      ["summary", "content", "type", "category", "description", "text"]
    );
    const hasReport = matchedReports.length > 0;
    const hasArticle = matchedArticles.length > 0;
    const tier =
      hasReport && hasArticle ? "COMPLETE"
      : hasReport ? "EVIDENCE-ONLY"
      : hasArticle ? "KNOW-ONLY"
      : "BLIND";
    return { id, dec, tier, matchedReports, matchedArticles };
  });
}
