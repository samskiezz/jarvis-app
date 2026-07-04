/**
 * ContactDecisionLinker — F128.
 *
 * Parallel-fetches /entities/Contact + /v1/decision/list and
 * keyword-correlates each contact (name / role / org / tags) against
 * strategic decisions (title / reason / risks / alternatives / expected_outcome)
 * to surface:
 *
 *   DECISION-LINKED  — contact matched in at least one recorded decision
 *   UNINVOLVED       — no strategic decision cross-reference found
 *
 * Stat tiles: contacts / decisions / linked / uninvolved.
 * Filter tabs: ALL | LINKED | UNINVOLVED + text search.
 * Expand contact → matched decisions with rationale snippet + relevance bar.
 * Amber badge on linked count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence contact-decision brief
 *   + TTS via jarvis:speak-dossier.
 *
 * Toggle:  ◈ CTDEC at left:39640, bottom:8, zIndex:82.
 * Event:   jarvis:ctdec-toggle
 * Voice:   "contact decision" / "decisions involving contacts" /
 *          "who's in which decision" / "ctdec"
 * Refresh: 90s auto-refresh while open.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const GREEN  = "#00c878";
const AMBER  = "#F5A623";
const VIOLET = "#A78BFA";
const BTN_LEFT = 39640;
const POLL_MS  = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalisers ──────────────────────────────────────────────────────────────

function normaliseContacts(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.data)             ? raw.data
    : Array.isArray(raw?.items)            ? raw.items
    : Array.isArray(raw?.contacts)         ? raw.contacts
    : Array.isArray(raw?.results)          ? raw.results
    : [];
  return arr.map((c, i) => ({
    id:   c.id   || String(i),
    name: c.name || c.full_name || c.display_name || c.title || `Contact ${i + 1}`,
    org:  c.org  || c.organization || c.company || c.employer || "",
    role: c.role || c.job_title    || c.department || c.position || "",
    tags: Array.isArray(c.tags) ? c.tags.join(" ") : String(c.tags || ""),
  }));
}

function normaliseDecisions(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.items)            ? raw.items
    : Array.isArray(raw?.decisions)        ? raw.decisions
    : Array.isArray(raw?.data)             ? raw.data
    : [];
  return arr.slice(0, 80).map((d, i) => ({
    id:       d.id            || String(i),
    title:    d.title         || d.name      || `Decision ${i + 1}`,
    reason:   d.reason        || d.rationale || "",
    risks:    Array.isArray(d.risks)         ? d.risks.join(", ")    : String(d.risks || ""),
    alts:     Array.isArray(d.alternatives)  ? d.alternatives.join(", ") : String(d.alternatives || ""),
    expected: d.expected_outcome || d.outcome || "",
    status:   (d.status || d.state || "").toLowerCase(),
  }));
}

// ─── keyword correlation ──────────────────────────────────────────────────────

function tokenize(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s,;:_\-/.]+/)
    .filter((t) => t.length > 2);
}

function relevance(contact, decision) {
  const cWords = new Set([
    ...tokenize(contact.name),
    ...tokenize(contact.org),
    ...tokenize(contact.role),
    ...tokenize(contact.tags),
  ]);
  const dTokens = [
    ...tokenize(decision.title),
    ...tokenize(decision.reason),
    ...tokenize(decision.risks),
    ...tokenize(decision.alts),
    ...tokenize(decision.expected),
  ];
  if (!cWords.size || !dTokens.length) return 0;
  const hits = dTokens.filter((t) => cWords.has(t)).length;
  return Math.min(100, Math.round((hits / Math.max(cWords.size, dTokens.length)) * 100 * 4));
}

function buildCoverage(contacts, decisions) {
  const linked = new Set();
  const pairs  = [];
  for (const c of contacts) {
    for (const d of decisions) {
      const score = relevance(c, d);
      if (score >= 10) {
        linked.add(c.id);
        pairs.push({ contactId: c.id, decision: d, score });
      }
    }
  }
  return { linked, pairs };
}

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isCtdecQuery(q) {
  return /contact\s*decis|decis.*contact|who.*decis|ctdec\b/i.test(q || "");
}

export async function buildCtdecScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [cRes, dRes] = await Promise.all([
      fetch(`${base}/entities/Contact`,   { headers: hdr }),
      fetch(`${base}/v1/decision/list`,   { headers: hdr }),
    ]);
    const contacts  = normaliseContacts(cRes.ok ? await cRes.json() : []);
    const decisions = normaliseDecisions(dRes.ok ? await dRes.json() : []);
    const { linked } = buildCoverage(contacts, decisions);
    const uninvolved = contacts.length - linked.size;
    window.dispatchEvent(new CustomEvent("jarvis:ctdec-toggle"));
    if (!contacts.length)
      return "Contact-decision linker active, sir. No contacts on record yet.";
    return (
      `Contact-decision linker active, sir. ` +
      `${contacts.length} contact${contacts.length !== 1 ? "s" : ""} cross-referenced against ` +
      `${decisions.length} strategic decision${decisions.length !== 1 ? "s" : ""}. ` +
      `${linked.size} contact${linked.size !== 1 ? "s are" : " is"} DECISION-LINKED — ` +
      `named or matched in at least one recorded decision. ` +
      `${uninvolved} contact${uninvolved !== 1 ? "s appear" : " appears"} UNINVOLVED with no decision cross-reference detected.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:ctdec-toggle"));
    return "Contact-decision linker is standing by, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function ContactDecisionLinker() {
  const [visible,   setVisible]   = useState(false);
  const [contacts,  setContacts]  = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [coverage,  setCoverage]  = useState({ linked: new Set(), pairs: [] });
  const [loading,   setLoading]   = useState(false);
  const [search,    setSearch]    = useState("");
  const [filter,    setFilter]    = useState("all");
  const [selected,  setSelected]  = useState(null);
  const [aiMap,     setAiMap]     = useState({});
  const [aiLoading, setAiLoading] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [cRes, dRes] = await Promise.all([
        fetch(`${base}/entities/Contact`,  { headers: hdr }),
        fetch(`${base}/v1/decision/list`,  { headers: hdr }),
      ]);
      const rawC = normaliseContacts(cRes.ok ? await cRes.json() : []);
      const rawD = normaliseDecisions(dRes.ok ? await dRes.json() : []);
      setContacts(rawC);
      setDecisions(rawD);
      setCoverage(buildCoverage(rawC, rawD));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:ctdec-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ctdec-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function getAiAssessment(contact, matchedDecs) {
    const cid = contact.id;
    if (aiMap[cid] || aiLoading === cid) return;
    setAiLoading(cid);
    const cName = contact.name;
    const cOrg  = contact.org  ? `, org: ${contact.org}`  : "";
    const cRole = contact.role ? `, role: ${contact.role}` : "";
    const prompt = matchedDecs.length
      ? `As JARVIS, provide a 2-sentence contact-decision assessment for "${cName}"${cOrg}${cRole}. ` +
        `This contact is cross-referenced with ${matchedDecs.length} strategic decision${matchedDecs.length !== 1 ? "s" : ""}: ` +
        `${matchedDecs.map((d) => d.title).join(", ")}. ` +
        `Assess the significance of this contact's involvement in strategic decision-making.`
      : `As JARVIS, provide a 2-sentence contact note for "${cName}"${cOrg}${cRole}. ` +
        `No strategic decision cross-references have been detected. ` +
        `Confirm uninvolved status and flag any considerations for future strategic relevance.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body:    JSON.stringify({ message: prompt }),
      });
      const d      = await r.json();
      const answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAiMap((prev) => ({ ...prev, [cid]: answer }));
      if (answer)
        window.dispatchEvent(
          new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } })
        );
    } catch (_) {
      setAiMap((prev) => ({ ...prev, [cid]: "Unable to reach reasoning core." }));
    } finally {
      setAiLoading(null);
    }
  }

  const linkedCount     = coverage.linked.size;
  const uninvolvedCount = contacts.length - linkedCount;

  const filtered = contacts.filter((c) => {
    if (filter === "linked"     && !coverage.linked.has(c.id)) return false;
    if (filter === "uninvolved" &&  coverage.linked.has(c.id)) return false;
    if (search) {
      const s    = search.toLowerCase();
      const text = [c.name, c.org, c.role, c.tags].filter(Boolean).join(" ").toLowerCase();
      if (!text.includes(s)) return false;
    }
    return true;
  });

  const selectedMatches = selected
    ? coverage.pairs
        .filter((p) => p.contactId === selected.id)
        .sort((a, b) => b.score - a.score)
        .map((p) => p.decision)
    : [];

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Contact × Decision Linker"
        style={{
          position:    "fixed",
          bottom:      8,
          left:        BTN_LEFT,
          zIndex:      82,
          height:      26,
          padding:     "0 8px",
          background:  visible ? `${AMBER}22` : "rgba(8,14,22,0.82)",
          border:      `1px solid ${visible ? AMBER : "#2A3A4A"}`,
          borderRadius: 5,
          color:       visible ? AMBER : "#6E8AA0",
          fontFamily:  "'JetBrains Mono', monospace",
          fontSize:    10,
          letterSpacing: 1,
          cursor:      "pointer",
          whiteSpace:  "nowrap",
        }}
      >
        {linkedCount > 0 && !visible && (
          <span
            style={{
              display:      "inline-block",
              marginRight:  5,
              background:   AMBER,
              color:        "#000",
              borderRadius: "50%",
              width:        14,
              height:       14,
              fontSize:     9,
              lineHeight:   "14px",
              textAlign:    "center",
              fontWeight:   700,
            }}
          >
            {linkedCount > 9 ? "9+" : linkedCount}
          </span>
        )}
        ◈ CTDEC
      </button>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position:      "fixed",
            bottom:        44,
            left:          Math.min(BTN_LEFT, window.innerWidth - 660),
            zIndex:        82,
            width:         640,
            maxHeight:     "76vh",
            display:       "flex",
            flexDirection: "column",
            background:    "rgba(4,10,18,0.96)",
            border:        `1px solid ${AMBER}44`,
            borderTop:     `2px solid ${AMBER}`,
            borderRadius:  12,
            boxShadow:     `0 0 40px ${AMBER}14, 0 8px 32px rgba(0,0,0,0.75)`,
            fontFamily:    "'JetBrains Mono', monospace",
            overflow:      "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display:      "flex",
              alignItems:   "center",
              gap:          10,
              padding:      "10px 14px",
              borderBottom: `1px solid ${AMBER}22`,
              flexShrink:   0,
            }}
          >
            <span style={{ color: AMBER, fontSize: 13 }}>◈</span>
            <span style={{ color: AMBER, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              CONTACT × DECISION LINKER
            </span>
            {loading && (
              <span style={{ marginLeft: "auto", color: "#6E8AA0", fontSize: 10 }}>loading…</span>
            )}
            <button
              onClick={() => setVisible(false)}
              style={{
                marginLeft: loading ? 0 : "auto",
                background: "transparent",
                border:     "none",
                color:      "#6E8AA0",
                cursor:     "pointer",
                fontSize:   16,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* Stat tiles */}
          <div
            style={{
              display:      "flex",
              gap:          8,
              padding:      "8px 14px",
              borderBottom: "1px solid #1A2A3A",
              flexShrink:   0,
            }}
          >
            {[
              { label: "CONTACTS",   val: contacts.length,   col: CY     },
              { label: "DECISIONS",  val: decisions.length,  col: VIOLET },
              { label: "LINKED",     val: linkedCount,       col: AMBER  },
              { label: "UNINVOLVED", val: uninvolvedCount,   col: GREEN  },
            ].map((t) => (
              <div
                key={t.label}
                style={{
                  flex:         1,
                  background:   "rgba(255,255,255,0.03)",
                  border:       "1px solid #1A2A3A",
                  borderRadius: 6,
                  padding:      "5px 8px",
                  textAlign:    "center",
                }}
              >
                <div style={{ fontSize: 14, color: t.col, fontWeight: 700 }}>{t.val}</div>
                <div style={{ fontSize: 8, color: "#4E6A7A", letterSpacing: 1, marginTop: 1 }}>
                  {t.label}
                </div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div
            style={{
              display:      "flex",
              gap:          6,
              padding:      "7px 14px",
              borderBottom: "1px solid #1A2A3A",
              flexShrink:   0,
              flexWrap:     "wrap",
              alignItems:   "center",
            }}
          >
            {["all", "linked", "uninvolved"].map((tab) => (
              <button
                key={tab}
                onClick={() => { setFilter(tab); setSelected(null); }}
                style={{
                  padding:       "3px 9px",
                  borderRadius:  4,
                  fontSize:      9,
                  letterSpacing: 1.2,
                  fontFamily:    "inherit",
                  fontWeight:    700,
                  cursor:        "pointer",
                  border:        `1px solid ${filter === tab ? AMBER : "#2A3A4A"}`,
                  background:    filter === tab ? `${AMBER}18` : "transparent",
                  color:         filter === tab ? AMBER : "#6E8AA0",
                  textTransform: "uppercase",
                }}
              >
                {tab}
              </button>
            ))}
            <input
              type="text"
              placeholder="Search contacts…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSelected(null); }}
              style={{
                marginLeft:   "auto",
                width:        160,
                background:   "rgba(0,0,0,0.35)",
                border:       `1px solid ${AMBER}44`,
                borderRadius: 4,
                color:        "#A0B8C8",
                fontFamily:   "inherit",
                fontSize:     10,
                padding:      "4px 8px",
                outline:      "none",
              }}
            />
          </div>

          {/* Contact list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {!loading && filtered.length === 0 && (
              <div style={{ padding: "24px", textAlign: "center", color: "#4E6A7A", fontSize: 11 }}>
                {contacts.length === 0 ? "No contacts on record." : "No contacts match filter."}
              </div>
            )}
            {filtered.map((c) => {
              const isLinked = coverage.linked.has(c.id);
              const isOpen   = selected?.id === c.id;
              const matchedDecs = isOpen ? selectedMatches : [];

              return (
                <div key={c.id} style={{ borderBottom: "1px solid #1A2A3A" }}>
                  {/* Row */}
                  <div
                    onClick={() => setSelected(isOpen ? null : c)}
                    style={{
                      display:    "flex",
                      alignItems: "center",
                      gap:        10,
                      padding:    "9px 14px",
                      cursor:     "pointer",
                      background: isOpen ? `rgba(245,166,35,0.05)` : "transparent",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => {
                      if (!isOpen) e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isOpen) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {/* Status dot */}
                    <span
                      style={{
                        width:        8,
                        height:       8,
                        borderRadius: "50%",
                        background:   isLinked ? AMBER : GREEN,
                        flexShrink:   0,
                        boxShadow:    isLinked ? `0 0 6px ${AMBER}` : "none",
                      }}
                    />
                    {/* Avatar initials */}
                    <span
                      style={{
                        width:          28,
                        height:         28,
                        borderRadius:   "50%",
                        background:     isLinked ? `${AMBER}22` : `${GREEN}18`,
                        border:         `1px solid ${isLinked ? AMBER : GREEN}44`,
                        display:        "flex",
                        alignItems:     "center",
                        justifyContent: "center",
                        fontSize:       10,
                        fontWeight:     700,
                        color:          isLinked ? AMBER : GREEN,
                        flexShrink:     0,
                      }}
                    >
                      {(c.name || "?")[0].toUpperCase()}
                    </span>
                    {/* Name + org/role */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize:      12,
                          color:         "#C8D8E8",
                          fontWeight:    600,
                          overflow:      "hidden",
                          textOverflow:  "ellipsis",
                          whiteSpace:    "nowrap",
                        }}
                      >
                        {c.name}
                      </div>
                      {(c.org || c.role) && (
                        <div
                          style={{
                            fontSize:     9,
                            color:        "#6E8AA0",
                            marginTop:    1,
                            overflow:     "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace:   "nowrap",
                          }}
                        >
                          {[c.role, c.org].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                    {/* Badge */}
                    <span
                      style={{
                        fontSize:      8,
                        fontWeight:    700,
                        letterSpacing: 1.5,
                        padding:       "2px 7px",
                        borderRadius:  3,
                        border:        `1px solid ${isLinked ? AMBER : GREEN}55`,
                        background:    isLinked ? `${AMBER}18` : `${GREEN}18`,
                        color:         isLinked ? AMBER : GREEN,
                        flexShrink:    0,
                      }}
                    >
                      {isLinked ? "LINKED" : "UNINVOLVED"}
                    </span>
                    <span style={{ color: "#4E6A7A", fontSize: 9 }}>{isOpen ? "▲" : "▼"}</span>
                  </div>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div
                      style={{
                        padding:    "0 14px 12px 50px",
                        borderLeft: `2px solid ${isLinked ? AMBER : GREEN}44`,
                        marginLeft: 14,
                      }}
                    >
                      {/* AI assess button */}
                      <button
                        onClick={() => getAiAssessment(c, matchedDecs)}
                        disabled={!!aiLoading}
                        style={{
                          marginTop:     8,
                          padding:       "4px 10px",
                          borderRadius:  4,
                          fontSize:      9,
                          letterSpacing: 1,
                          fontFamily:    "inherit",
                          fontWeight:    700,
                          cursor:        aiLoading ? "wait" : "pointer",
                          border:        `1px solid ${AMBER}55`,
                          background:    `${AMBER}14`,
                          color:         AMBER,
                        }}
                      >
                        {aiLoading === c.id ? "ASSESSING…" : "▶ ASSESS"}
                      </button>

                      {aiMap[c.id] && (
                        <div
                          style={{
                            marginTop:    8,
                            padding:      "7px 10px",
                            background:   `rgba(245,166,35,0.07)`,
                            border:       `1px solid ${AMBER}33`,
                            borderRadius: 4,
                            fontSize:     10,
                            color:        "#A0B8C8",
                            lineHeight:   1.6,
                          }}
                        >
                          {aiMap[c.id]}
                        </div>
                      )}

                      {/* Matched decisions */}
                      {matchedDecs.length > 0 ? (
                        <div style={{ marginTop: 10 }}>
                          <div
                            style={{
                              fontSize:     9,
                              color:        "#4E6A7A",
                              letterSpacing: 1.5,
                              marginBottom: 6,
                            }}
                          >
                            MATCHED DECISIONS ({matchedDecs.length})
                          </div>
                          {matchedDecs.map((dec) => {
                            const pair  = coverage.pairs.find(
                              (p) => p.contactId === c.id && p.decision.id === dec.id
                            );
                            const score = pair?.score ?? 0;
                            return (
                              <div
                                key={dec.id}
                                style={{
                                  padding:      "6px 8px",
                                  marginBottom: 4,
                                  background:   "rgba(255,255,255,0.03)",
                                  border:       "1px solid #1A2A3A",
                                  borderRadius: 4,
                                }}
                              >
                                <div
                                  style={{
                                    fontSize:     11,
                                    color:        "#C8D8E8",
                                    fontWeight:   600,
                                    overflow:     "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace:   "nowrap",
                                  }}
                                >
                                  {dec.title}
                                </div>
                                {/* Relevance bar */}
                                <div
                                  style={{
                                    marginTop:  5,
                                    display:    "flex",
                                    alignItems: "center",
                                    gap:        6,
                                  }}
                                >
                                  <div
                                    style={{
                                      flex:         1,
                                      height:       3,
                                      background:   `rgba(245,166,35,0.12)`,
                                      borderRadius: 2,
                                      overflow:     "hidden",
                                    }}
                                  >
                                    <div
                                      style={{
                                        width:        `${score}%`,
                                        height:       "100%",
                                        background:   AMBER,
                                        borderRadius: 2,
                                      }}
                                    />
                                  </div>
                                  <span style={{ fontSize: 9, color: AMBER, minWidth: 32, textAlign: "right" }}>
                                    {score}%
                                  </span>
                                </div>
                                {dec.reason && (
                                  <div
                                    style={{
                                      fontSize:     9,
                                      color:        "#6E8AA0",
                                      marginTop:    4,
                                      overflow:     "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace:   "nowrap",
                                    }}
                                  >
                                    Rationale: {dec.reason}
                                  </div>
                                )}
                                {dec.expected && (
                                  <div
                                    style={{
                                      fontSize:     9,
                                      color:        "#4E6A7A",
                                      marginTop:    2,
                                      overflow:     "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace:   "nowrap",
                                    }}
                                  >
                                    Expected: {dec.expected}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ marginTop: 10, fontSize: 10, color: GREEN }}>
                          ✓ No strategic decision cross-references detected — contact appears UNINVOLVED.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div
            style={{
              padding:        "6px 14px",
              borderTop:      "1px solid #1A2A3A",
              fontSize:       9,
              color:          "#4E6A7A",
              flexShrink:     0,
              display:        "flex",
              justifyContent: "space-between",
            }}
          >
            <span>/entities/Contact · /v1/decision/list · /v1/jarvis/agent/chat</span>
            <span>{POLL_MS / 1000}s auto-refresh</span>
          </div>
        </div>
      )}
    </>
  );
}
