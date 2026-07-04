/**
 * ContactInvestigationExposure — F126.
 *
 * Parallel-fetches /entities/Contact + /v1/investigations and
 * keyword-correlates each contact (name / org / role / tags) against
 * investigation titles and subjects to surface:
 *
 *   IMPLICATED  — contact named or matched in at least one open investigation
 *   CLEAR       — no investigation cross-reference found
 *
 * Stat tiles: contacts / investigations / implicated / clear.
 * Filter tabs: ALL | IMPLICATED | CLEAR + text search.
 * Expand contact → matched investigations with status badge + relevance score.
 * Red badge on implicated count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence contact-exposure brief
 *   + TTS via jarvis:speak-dossier.
 *
 * Toggle:  ◈ CTINV at left:38520, bottom:8, zIndex:80.
 * Event:   jarvis:ctinv-toggle
 * Voice:   "contact investigation" / "implicated contacts" /
 *          "contact exposure" / "ctinv" / "contacts in investigations"
 * Refresh: 90s auto-refresh while open.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const GREEN  = "#00c878";
const AMBER  = "#F5A623";
const VIOLET = "#A78BFA";
const RED    = "#FF3D5A";
const BTN_LEFT = 38520;
const POLL_MS  = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalisers ──────────────────────────────────────────────────────────────

function normaliseContacts(raw) {
  const arr = Array.isArray(raw)            ? raw
    : Array.isArray(raw?.data)              ? raw.data
    : Array.isArray(raw?.items)             ? raw.items
    : Array.isArray(raw?.contacts)          ? raw.contacts
    : Array.isArray(raw?.results)           ? raw.results
    : [];
  return arr.map((c, i) => ({
    id:   c.id   || String(i),
    name: c.name || c.full_name || c.display_name || c.title || `Contact ${i + 1}`,
    org:  c.org  || c.organization || c.company || c.employer || "",
    role: c.role || c.job_title    || c.department || c.position || "",
    tags: Array.isArray(c.tags) ? c.tags.join(" ") : String(c.tags || ""),
    email: c.email || "",
  }));
}

function normaliseInvestigations(raw) {
  const arr = Array.isArray(raw)                   ? raw
    : Array.isArray(raw?.data)                     ? raw.data
    : Array.isArray(raw?.items)                    ? raw.items
    : Array.isArray(raw?.investigations)           ? raw.investigations
    : Array.isArray(raw?.cases)                    ? raw.cases
    : Array.isArray(raw?.results)                  ? raw.results
    : [];
  return arr.map((inv, i) => ({
    id:      inv.id      || String(i),
    title:   inv.title   || inv.name    || inv.subject   || `Investigation ${i + 1}`,
    subject: inv.subject || inv.target  || inv.entity    || "",
    status:  inv.status  || inv.state   || inv.phase     || "open",
    summary: String(inv.summary || inv.description || inv.notes || "").slice(0, 400),
    type:    inv.type    || inv.category || inv.inv_type || "",
  }));
}

// ─── keyword correlation ──────────────────────────────────────────────────────

function tokenize(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s,;:_\-/.]+/)
    .filter((t) => t.length > 2);
}

function relevance(contact, inv) {
  const cWords = new Set([
    ...tokenize(contact.name),
    ...tokenize(contact.org),
    ...tokenize(contact.role),
    ...tokenize(contact.tags),
  ]);
  const invTokens = [
    ...tokenize(inv.title),
    ...tokenize(inv.subject),
    ...tokenize(inv.summary),
  ];
  if (!cWords.size || !invTokens.length) return 0;
  const hits = invTokens.filter((t) => cWords.has(t)).length;
  return Math.min(100, Math.round((hits / Math.max(cWords.size, invTokens.length)) * 100 * 4));
}

function buildCoverage(contacts, investigations) {
  const implicated = new Set();
  const pairs = []; // { contactId, investigation, score }
  for (const c of contacts) {
    for (const inv of investigations) {
      const score = relevance(c, inv);
      if (score >= 10) {
        implicated.add(c.id);
        pairs.push({ contactId: c.id, investigation: inv, score });
      }
    }
  }
  return { implicated, pairs };
}

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isCtinvQuery(q) {
  return /contact\s*invest|implicated\s*contact|contact\s*expos|ctinv\b|contacts\s*in\s*invest/i.test(q || "");
}

export async function buildCtinvScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [cRes, iRes] = await Promise.all([
      fetch(`${base}/entities/Contact`,  { headers: hdr }),
      fetch(`${base}/v1/investigations`, { headers: hdr }),
    ]);
    const contacts = normaliseContacts(cRes.ok ? await cRes.json() : []);
    const invs     = normaliseInvestigations(iRes.ok ? await iRes.json() : []);
    const { implicated } = buildCoverage(contacts, invs);
    const clear = contacts.length - implicated.size;
    window.dispatchEvent(new CustomEvent("jarvis:ctinv-toggle"));
    if (!contacts.length)
      return "Contact investigation exposure panel open, sir. No contacts on record yet.";
    return (
      `Contact investigation exposure monitor active, sir. ` +
      `${contacts.length} contact${contacts.length !== 1 ? "s" : ""} cross-referenced against ` +
      `${invs.length} open investigation${invs.length !== 1 ? "s" : ""}. ` +
      `${implicated.size} contact${implicated.size !== 1 ? "s are" : " is"} IMPLICATED — ` +
      `named or matched in at least one active case. ` +
      `${clear} contact${clear !== 1 ? "s appear" : " appears"} CLEAR with no investigation link detected.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:ctinv-toggle"));
    return "Contact investigation exposure panel is standing by, sir.";
  }
}

// ─── status badge helper ──────────────────────────────────────────────────────

function statusColor(s) {
  const st = String(s || "").toLowerCase();
  if (st === "open" || st === "active" || st === "in_progress") return RED;
  if (st === "closed" || st === "resolved" || st === "complete") return GREEN;
  return AMBER;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function ContactInvestigationExposure() {
  const [visible,   setVisible]   = useState(false);
  const [contacts,  setContacts]  = useState([]);
  const [invs,      setInvs]      = useState([]);
  const [coverage,  setCoverage]  = useState({ implicated: new Set(), pairs: [] });
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
      const [cRes, iRes] = await Promise.all([
        fetch(`${base}/entities/Contact`,  { headers: hdr }),
        fetch(`${base}/v1/investigations`, { headers: hdr }),
      ]);
      const rawC = normaliseContacts(cRes.ok ? await cRes.json() : []);
      const rawI = normaliseInvestigations(iRes.ok ? await iRes.json() : []);
      setContacts(rawC);
      setInvs(rawI);
      setCoverage(buildCoverage(rawC, rawI));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:ctinv-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ctinv-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function getAiAssessment(contact, matchedInvs) {
    const cid = contact.id;
    if (aiMap[cid] || aiLoading === cid) return;
    setAiLoading(cid);
    const cName = contact.name;
    const cOrg  = contact.org  ? `, org: ${contact.org}`  : "";
    const cRole = contact.role ? `, role: ${contact.role}` : "";
    const prompt = matchedInvs.length
      ? `As JARVIS, provide a 2-sentence contact-exposure assessment for "${cName}"${cOrg}${cRole}. ` +
        `This contact is cross-referenced with ${matchedInvs.length} investigation${matchedInvs.length !== 1 ? "s" : ""}: ` +
        `${matchedInvs.map((i) => i.title).join(", ")}. ` +
        `Assess the level of exposure and recommend the appropriate response.`
      : `As JARVIS, provide a 2-sentence contact-clearance note for "${cName}"${cOrg}${cRole}. ` +
        `No current investigation links have been detected. ` +
        `Confirm clearance status and flag any residual surveillance considerations.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body:    JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
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

  const implicatedCount = coverage.implicated.size;
  const clearCount      = contacts.length - implicatedCount;

  const filtered = contacts.filter((c) => {
    if (filter === "implicated" && !coverage.implicated.has(c.id)) return false;
    if (filter === "clear"      &&  coverage.implicated.has(c.id)) return false;
    if (search) {
      const s = search.toLowerCase();
      const text = [c.name, c.org, c.role, c.tags, c.email]
        .filter(Boolean).join(" ").toLowerCase();
      if (!text.includes(s)) return false;
    }
    return true;
  });

  const selectedMatches = selected
    ? coverage.pairs
        .filter((p) => p.contactId === selected.id)
        .sort((a, b) => b.score - a.score)
        .map((p) => p.investigation)
    : [];

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Contact × Investigation Exposure Monitor"
        style={{
          position:    "fixed",
          bottom:      8,
          left:        BTN_LEFT,
          zIndex:      80,
          height:      26,
          padding:     "0 8px",
          background:  visible ? `${RED}22` : "rgba(8,14,22,0.82)",
          border:      `1px solid ${visible ? RED : "#2A3A4A"}`,
          borderRadius: 5,
          color:       visible ? RED : "#6E8AA0",
          fontFamily:  "'JetBrains Mono', monospace",
          fontSize:    10,
          letterSpacing: 1,
          cursor:      "pointer",
          whiteSpace:  "nowrap",
        }}
      >
        {implicatedCount > 0 && !visible && (
          <span
            style={{
              display:       "inline-block",
              marginRight:   5,
              background:    RED,
              color:         "#000",
              borderRadius:  "50%",
              width:         14,
              height:        14,
              fontSize:      9,
              lineHeight:    "14px",
              textAlign:     "center",
              fontWeight:    700,
            }}
          >
            {implicatedCount > 9 ? "9+" : implicatedCount}
          </span>
        )}
        ◈ CTINV
      </button>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position:    "fixed",
            bottom:      44,
            left:        Math.min(BTN_LEFT, window.innerWidth - 660),
            zIndex:      80,
            width:       640,
            maxHeight:   "76vh",
            display:     "flex",
            flexDirection: "column",
            background:  "rgba(4,10,18,0.96)",
            border:      `1px solid ${RED}44`,
            borderTop:   `2px solid ${RED}`,
            borderRadius: 12,
            boxShadow:   `0 0 40px ${RED}14, 0 8px 32px rgba(0,0,0,0.75)`,
            fontFamily:  "'JetBrains Mono', monospace",
            overflow:    "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display:       "flex",
              alignItems:    "center",
              gap:           10,
              padding:       "10px 14px",
              borderBottom:  `1px solid ${RED}22`,
              flexShrink:    0,
            }}
          >
            <span style={{ color: RED, fontSize: 13 }}>◈</span>
            <span style={{ color: RED, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              CONTACT × INVESTIGATION EXPOSURE
            </span>
            {loading && (
              <span style={{ marginLeft: "auto", color: "#6E8AA0", fontSize: 10 }}>loading…</span>
            )}
            <button
              onClick={() => setVisible(false)}
              style={{
                marginLeft:  loading ? 0 : "auto",
                background:  "transparent",
                border:      "none",
                color:       "#6E8AA0",
                cursor:      "pointer",
                fontSize:    16,
                lineHeight:  1,
              }}
            >
              ×
            </button>
          </div>

          {/* Stat tiles */}
          <div
            style={{
              display:       "flex",
              gap:           8,
              padding:       "8px 14px",
              borderBottom:  "1px solid #1A2A3A",
              flexShrink:    0,
            }}
          >
            {[
              { label: "CONTACTS",      val: contacts.length,   col: CY     },
              { label: "INVESTIGATIONS",val: invs.length,        col: VIOLET },
              { label: "IMPLICATED",    val: implicatedCount,   col: RED    },
              { label: "CLEAR",         val: clearCount,        col: GREEN  },
            ].map((t) => (
              <div
                key={t.label}
                style={{
                  flex:       1,
                  background: "rgba(255,255,255,0.03)",
                  border:     "1px solid #1A2A3A",
                  borderRadius: 6,
                  padding:    "5px 8px",
                  textAlign:  "center",
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
            {["all", "implicated", "clear"].map((tab) => (
              <button
                key={tab}
                onClick={() => { setFilter(tab); setSelected(null); }}
                style={{
                  padding:      "3px 9px",
                  borderRadius: 4,
                  fontSize:     9,
                  letterSpacing: 1.2,
                  fontFamily:   "inherit",
                  fontWeight:   700,
                  cursor:       "pointer",
                  border:       `1px solid ${filter === tab ? RED : "#2A3A4A"}`,
                  background:   filter === tab ? `${RED}18` : "transparent",
                  color:        filter === tab ? RED : "#6E8AA0",
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
                border:       `1px solid ${RED}44`,
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
              const isImplicated = coverage.implicated.has(c.id);
              const isOpen       = selected?.id === c.id;
              const matchedInvs  = isOpen ? selectedMatches : [];

              return (
                <div
                  key={c.id}
                  style={{ borderBottom: "1px solid #1A2A3A" }}
                >
                  {/* Row */}
                  <div
                    onClick={() => setSelected(isOpen ? null : c)}
                    style={{
                      display:    "flex",
                      alignItems: "center",
                      gap:        10,
                      padding:    "9px 14px",
                      cursor:     "pointer",
                      background: isOpen ? "rgba(255,61,90,0.05)" : "transparent",
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
                        background:   isImplicated ? RED : GREEN,
                        flexShrink:   0,
                        boxShadow:    isImplicated ? `0 0 6px ${RED}` : "none",
                      }}
                    />
                    {/* Avatar initials */}
                    <span
                      style={{
                        width:         28,
                        height:        28,
                        borderRadius:  "50%",
                        background:    isImplicated ? `${RED}22` : `${GREEN}18`,
                        border:        `1px solid ${isImplicated ? RED : GREEN}44`,
                        display:       "flex",
                        alignItems:    "center",
                        justifyContent: "center",
                        fontSize:      10,
                        fontWeight:    700,
                        color:         isImplicated ? RED : GREEN,
                        flexShrink:    0,
                      }}
                    >
                      {(c.name || "?")[0].toUpperCase()}
                    </span>
                    {/* Name + org */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: "#C8D8E8", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.name}
                      </div>
                      {(c.org || c.role) && (
                        <div style={{ fontSize: 9, color: "#6E8AA0", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {[c.role, c.org].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                    {/* Badge */}
                    <span
                      style={{
                        fontSize:     8,
                        fontWeight:   700,
                        letterSpacing: 1.5,
                        padding:      "2px 7px",
                        borderRadius: 3,
                        border:       `1px solid ${isImplicated ? RED : GREEN}55`,
                        background:   isImplicated ? `${RED}18` : `${GREEN}18`,
                        color:        isImplicated ? RED : GREEN,
                        flexShrink:   0,
                      }}
                    >
                      {isImplicated ? "IMPLICATED" : "CLEAR"}
                    </span>
                    <span style={{ color: "#4E6A7A", fontSize: 9 }}>{isOpen ? "▲" : "▼"}</span>
                  </div>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div
                      style={{
                        padding:    "0 14px 12px 50px",
                        borderLeft: `2px solid ${isImplicated ? RED : GREEN}44`,
                        marginLeft: 14,
                      }}
                    >
                      {/* AI assess button */}
                      <button
                        onClick={() => getAiAssessment(c, matchedInvs)}
                        disabled={!!aiLoading}
                        style={{
                          marginTop:    8,
                          padding:      "4px 10px",
                          borderRadius: 4,
                          fontSize:     9,
                          letterSpacing: 1,
                          fontFamily:   "inherit",
                          fontWeight:   700,
                          cursor:       aiLoading ? "wait" : "pointer",
                          border:       `1px solid ${RED}55`,
                          background:   `${RED}14`,
                          color:        RED,
                        }}
                      >
                        {aiLoading === c.id ? "ASSESSING…" : "▶ ASSESS"}
                      </button>

                      {aiMap[c.id] && (
                        <div
                          style={{
                            marginTop:   8,
                            padding:     "7px 10px",
                            background:  "rgba(255,61,90,0.07)",
                            border:      `1px solid ${RED}33`,
                            borderRadius: 4,
                            fontSize:    10,
                            color:       "#A0B8C8",
                            lineHeight:  1.6,
                          }}
                        >
                          {aiMap[c.id]}
                        </div>
                      )}

                      {/* Matched investigations */}
                      {matchedInvs.length > 0 ? (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ fontSize: 9, color: "#4E6A7A", letterSpacing: 1.5, marginBottom: 6 }}>
                            MATCHED INVESTIGATIONS ({matchedInvs.length})
                          </div>
                          {matchedInvs.map((inv) => {
                            const pair = coverage.pairs.find(
                              (p) => p.contactId === c.id && p.investigation.id === inv.id
                            );
                            const score = pair?.score ?? 0;
                            const sc    = statusColor(inv.status);
                            return (
                              <div
                                key={inv.id}
                                style={{
                                  padding:      "6px 8px",
                                  marginBottom: 4,
                                  background:   "rgba(255,255,255,0.03)",
                                  border:       "1px solid #1A2A3A",
                                  borderRadius: 4,
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  {/* Status badge */}
                                  <span
                                    style={{
                                      fontSize:     8,
                                      fontWeight:   700,
                                      letterSpacing: 1.2,
                                      padding:      "1px 6px",
                                      borderRadius: 3,
                                      border:       `1px solid ${sc}55`,
                                      background:   `${sc}18`,
                                      color:        sc,
                                      flexShrink:   0,
                                      textTransform: "uppercase",
                                    }}
                                  >
                                    {inv.status || "open"}
                                  </span>
                                  <span style={{ flex: 1, fontSize: 11, color: "#C8D8E8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {inv.title}
                                  </span>
                                </div>
                                {/* Relevance bar */}
                                <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 6 }}>
                                  <div style={{ flex: 1, height: 3, background: "rgba(255,61,90,0.12)", borderRadius: 2, overflow: "hidden" }}>
                                    <div style={{ width: `${score}%`, height: "100%", background: RED, borderRadius: 2 }} />
                                  </div>
                                  <span style={{ fontSize: 9, color: RED, minWidth: 32, textAlign: "right" }}>
                                    {score}%
                                  </span>
                                </div>
                                {inv.subject && (
                                  <div style={{ fontSize: 9, color: "#4E6A7A", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    Subject: {inv.subject}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ marginTop: 10, fontSize: 10, color: GREEN }}>
                          ✓ No investigation cross-references detected — contact appears CLEAR.
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
              padding:      "6px 14px",
              borderTop:    "1px solid #1A2A3A",
              fontSize:     9,
              color:        "#4E6A7A",
              flexShrink:   0,
              display:      "flex",
              justifyContent: "space-between",
            }}
          >
            <span>
              /entities/Contact · /v1/investigations · /v1/jarvis/agent/chat
            </span>
            <span>{POLL_MS / 1000}s auto-refresh</span>
          </div>
        </div>
      )}
    </>
  );
}
