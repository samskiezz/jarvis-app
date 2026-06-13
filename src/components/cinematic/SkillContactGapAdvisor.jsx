/**
 * SkillContactGapAdvisor — F65.
 *
 * Parallel-fetches /v1/aip/skill + /entities/Contact.
 * Identifies skill gaps (score < 70) and keyword-correlates each gap
 * against contacts by role, department, and tags.
 * Surfaces "who in your network to reach out to for X skill" pairs.
 *
 * Stat tiles: skills / gaps / contacts / linked.
 * Filter tabs: ALL / GAPS / LINKED.
 * Click ▶ ADVISE → /v1/jarvis/agent/chat AI 2-sentence outreach
 *   recommendation + TTS via jarvis:speak-dossier.
 * 5-min auto-refresh.
 *
 * Intent: "skill contact" / "contact gaps" / "who can help with" / "skillc"
 *   → jarvis:skillcontact-toggle + TTS brief via buildSkillContactScript()
 *
 * Toggle: ◈ SKILLC at left:5484, zIndex 65.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const VIOLET = "#A78BFA";
const RED = "#FF3D5A";
const BTN_LEFT = 5484;
const REFRESH_MS = 5 * 60 * 1000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isSkillContactQuery(q) {
  return /skill.contact|contact.gap|who.can.help|who.*skill|network.*skill|skill.*network|skillc\b|reach.*out.*skill|outreach.*skill|skill.*outreach|gap.*contact|contact.*gap/i.test(
    q || ""
  );
}

export async function buildSkillContactScript() {
  try {
    const [sr, cr] = await Promise.all([
      fetch(`${apiBase()}/v1/aip/skill`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${apiBase()}/entities/Contact`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const skills = normaliseSkills(sr.ok ? await sr.json() : []);
    const contacts = normaliseArray(cr.ok ? await cr.json() : []);
    const gaps = skills.filter((s) => score(s) < 70);
    const linked = buildPairs(gaps, contacts);
    window.dispatchEvent(new CustomEvent("jarvis:skillcontact-toggle"));
    return `Skill-Contact Gap Advisor open, sir. I've identified ${gaps.length} skill gap${gaps.length !== 1 ? "s" : ""} from ${skills.length} assessed competencies. ${linked.length > 0 ? `${linked.length} contact${linked.length !== 1 ? "s" : ""} in your network may be able to help bridge these gaps.` : "No contacts currently matched to skill gaps."} Click any gap-contact pair for an AI outreach recommendation.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:skillcontact-toggle"));
    return "Skill-Contact Gap Advisor open, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function SkillContactGapAdvisor() {
  const [visible, setVisible] = useState(false);
  const [skills, setSkills] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("ALL");
  const [advising, setAdvising] = useState(null);
  const [advice, setAdvice] = useState({});
  const timerRef = useRef(null);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:skillcontact-toggle", onToggle);
    return () => window.removeEventListener("jarvis:skillcontact-toggle", onToggle);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sr, cr] = await Promise.all([
        fetch(`${apiBase()}/v1/aip/skill`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
        fetch(`${apiBase()}/entities/Contact`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
      ]);
      setSkills(normaliseSkills(sr.ok ? await sr.json() : []));
      setContacts(normaliseArray(cr.ok ? await cr.json() : []));
    } catch {
      // leave existing data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [visible, load]);

  const gaps = skills.filter((s) => score(s) < 70);
  const pairs = buildPairs(gaps, contacts);

  const rows = tab === "GAPS"
    ? gaps.map((s) => ({ skill: s, contact: null }))
    : tab === "LINKED"
    ? pairs
    : [
        ...pairs,
        ...gaps
          .filter((g) => !pairs.some((p) => p.skill.name === g.name || p.skill.id === g.id))
          .map((s) => ({ skill: s, contact: null })),
      ];

  const advise = useCallback(async (pairKey, skillName, contactName, contactRole) => {
    if (advising === pairKey) return;
    setAdvising(pairKey);
    try {
      const prompt = `In exactly 2 sentences: What specific outreach message should I send to ${contactName} (${contactRole || "contact"}) to help close my skill gap in "${skillName}"? Be concrete and actionable. British-butler tone. No markdown.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      if (text) {
        setAdvice((prev) => ({ ...prev, [pairKey]: text }));
        window.dispatchEvent(
          new CustomEvent("jarvis:speak-dossier", { detail: { text } })
        );
      }
    } catch {
      setAdvice((prev) => ({
        ...prev,
        [pairKey]: "Reasoning core unreachable. Please try again.",
      }));
    } finally {
      setAdvising(null);
    }
  }, [advising]);

  const gapCount = gaps.length;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Skill-Contact Gap Advisor"
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 65,
          height: 26,
          padding: "0 8px",
          background: visible ? `${AMBER}22` : "rgba(8,14,22,0.82)",
          border: `1px solid ${visible ? AMBER : "#2A3A4A"}`,
          borderRadius: 5,
          color: visible ? AMBER : "#6E8AA0",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: 1,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {gapCount > 0 && !visible && (
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
            }}
          >
            {gapCount}
          </span>
        )}
        ◈ SKILLC
      </button>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position: "fixed",
            bottom: 44,
            left: Math.min(BTN_LEFT, window.innerWidth - 660),
            zIndex: 65,
            width: 640,
            maxHeight: "80vh",
            display: "flex",
            flexDirection: "column",
            background: "rgba(4,10,18,0.97)",
            border: `1px solid ${AMBER}44`,
            borderTop: `2px solid ${AMBER}`,
            borderRadius: 12,
            boxShadow: `0 0 40px ${AMBER}14, 0 8px 32px rgba(0,0,0,0.75)`,
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
              borderBottom: `1px solid ${AMBER}22`,
              flexShrink: 0,
            }}
          >
            <span style={{ color: AMBER, fontSize: 13 }}>◈</span>
            <span
              style={{
                color: AMBER,
                fontSize: 11,
                letterSpacing: 2,
                fontWeight: 700,
              }}
            >
              SKILL-CONTACT GAP ADVISOR
            </span>
            {loading && (
              <span style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>
                loading…
              </span>
            )}
            <div style={{ flex: 1 }} />
            <button
              onClick={load}
              title="Refresh"
              style={{
                background: "transparent",
                border: "none",
                color: "#6E8AA0",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              ↻
            </button>
            <button
              onClick={() => setVisible(false)}
              style={{
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
              gap: 8,
              padding: "8px 14px",
              borderBottom: "1px solid #1A2A3A",
              flexShrink: 0,
            }}
          >
            {[
              { label: "SKILLS", val: skills.length, col: CY },
              { label: "GAPS", val: gapCount, col: AMBER },
              { label: "CONTACTS", val: contacts.length, col: GREEN },
              { label: "LINKED", val: pairs.length, col: VIOLET },
            ].map((t) => (
              <div
                key={t.label}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid #1A2A3A",
                  borderRadius: 6,
                  padding: "5px 8px",
                  textAlign: "center",
                }}
              >
                <div
                  style={{ fontSize: 14, color: t.col, fontWeight: 700 }}
                >
                  {t.val}
                </div>
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

          {/* Filter tabs */}
          <div
            style={{
              display: "flex",
              gap: 0,
              borderBottom: "1px solid #1A2A3A",
              flexShrink: 0,
            }}
          >
            {["ALL", "GAPS", "LINKED"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1,
                  padding: "6px 0",
                  border: "none",
                  borderBottom: tab === t ? `2px solid ${AMBER}` : "2px solid transparent",
                  background: "transparent",
                  color: tab === t ? AMBER : "#6E8AA0",
                  fontSize: 9,
                  letterSpacing: 1,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Row list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            {rows.length === 0 && !loading && (
              <div
                style={{
                  textAlign: "center",
                  padding: "28px 0",
                  color: "#4E6A7A",
                  fontSize: 10,
                  letterSpacing: 1,
                }}
              >
                {tab === "LINKED"
                  ? "No skill-contact pairs found."
                  : tab === "GAPS"
                  ? "No skill gaps detected — all competencies above threshold."
                  : "No data available yet."}
              </div>
            )}
            {rows.map(({ skill, contact }, idx) => {
              const sc = score(skill);
              const urgency =
                sc < 30 ? "CRITICAL" : sc < 50 ? "NEEDS WORK" : "DEVELOPING";
              const urgCol = sc < 30 ? RED : sc < 50 ? AMBER : "#F5A623CC";
              const pairKey = `${skill.id || skill.name || idx}-${contact?.id || contact?.name || "none"}`;
              const adviceText = advice[pairKey];
              const isAdvising = advising === pairKey;
              return (
                <div
                  key={pairKey}
                  style={{
                    margin: "0 10px 8px",
                    background: "rgba(255,255,255,0.025)",
                    border: `1px solid ${contact ? AMBER + "44" : "#1A2A3A"}`,
                    borderRadius: 8,
                    padding: "10px 12px",
                  }}
                >
                  {/* Skill row */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: contact || adviceText ? 6 : 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 8,
                        color: urgCol,
                        letterSpacing: 1,
                        border: `1px solid ${urgCol}55`,
                        borderRadius: 3,
                        padding: "1px 5px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {urgency}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "#C8DDF0",
                        flex: 1,
                        fontWeight: 600,
                      }}
                    >
                      {skill.name || skill.skill || skill.title || skill.id || "Unknown Skill"}
                    </span>
                    <span style={{ fontSize: 10, color: urgCol, fontWeight: 700 }}>
                      {sc}
                    </span>
                    {/* Score bar */}
                    <div
                      style={{
                        width: 60,
                        height: 4,
                        background: "#1A2A3A",
                        borderRadius: 2,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${sc}%`,
                          height: "100%",
                          background: urgCol,
                          borderRadius: 2,
                        }}
                      />
                    </div>
                  </div>

                  {/* Contact row */}
                  {contact && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        paddingLeft: 4,
                        marginBottom: adviceText ? 6 : 0,
                      }}
                    >
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          background: `${VIOLET}33`,
                          border: `1px solid ${VIOLET}55`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 9,
                          color: VIOLET,
                          flexShrink: 0,
                        }}
                      >
                        {initials(contact)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: "#A0B8CC" }}>
                          {contact.name || contact.full_name || "Contact"}
                        </div>
                        <div style={{ fontSize: 8, color: "#4E6A7A", letterSpacing: 1 }}>
                          {contact.role || contact.title || ""}{contact.department || contact.dept ? ` · ${contact.department || contact.dept}` : ""}
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          advise(
                            pairKey,
                            skill.name || skill.skill || skill.title || "this skill",
                            contact.name || contact.full_name || "this contact",
                            contact.role || contact.title || ""
                          )
                        }
                        disabled={isAdvising}
                        style={{
                          padding: "2px 8px",
                          borderRadius: 4,
                          border: `1px solid ${isAdvising ? "#2A3A4A" : AMBER + "66"}`,
                          background: isAdvising ? "transparent" : `${AMBER}18`,
                          color: isAdvising ? "#4E6A7A" : AMBER,
                          fontSize: 9,
                          letterSpacing: 1,
                          cursor: isAdvising ? "default" : "pointer",
                          fontFamily: "inherit",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {isAdvising ? "…" : "▶ ADVISE"}
                      </button>
                    </div>
                  )}

                  {/* AI advice text */}
                  {adviceText && (
                    <div
                      style={{
                        marginTop: 4,
                        padding: "6px 10px",
                        background: `${AMBER}0A`,
                        border: `1px solid ${AMBER}22`,
                        borderRadius: 5,
                        fontSize: 9,
                        color: "#C8DDF0",
                        lineHeight: 1.65,
                      }}
                    >
                      {adviceText}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "7px 14px",
              borderTop: `1px solid ${AMBER}18`,
              fontSize: 8,
              color: "#4E6A7A",
              letterSpacing: 1,
              flexShrink: 0,
            }}
          >
            /v1/aip/skill + /entities/Contact → /v1/jarvis/agent/chat · auto-refresh 5 min
          </div>
        </div>
      )}
    </>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const k of ["items", "results", "data", "contacts", "records"]) {
      if (Array.isArray(data[k])) return data[k];
    }
  }
  return [];
}

function normaliseSkills(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const k of ["skills", "items", "results", "data", "records"]) {
      if (Array.isArray(data[k])) return data[k];
    }
  }
  return [];
}

function score(s) {
  const v = s.score ?? s.level ?? s.value ?? s.proficiency ?? s.rating ?? 0;
  return typeof v === "number" ? v : parseInt(v, 10) || 0;
}

function initials(c) {
  const n = c.name || c.full_name || "";
  return n
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase() || "?";
}

function keywords(s) {
  const name = (s.name || s.skill || s.title || s.category || "").toLowerCase();
  const tags = (s.tags || []).map((t) => t.toLowerCase());
  return [name, ...name.split(/[\s/_-]+/), ...tags].filter(Boolean);
}

function contactText(c) {
  return [
    c.name,
    c.full_name,
    c.role,
    c.title,
    c.department,
    c.dept,
    c.org,
    c.organisation,
    c.organization,
    ...(Array.isArray(c.tags) ? c.tags : []),
    ...(Array.isArray(c.skills) ? c.skills : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function buildPairs(gaps, contacts) {
  const pairs = [];
  for (const skill of gaps) {
    const kws = keywords(skill);
    for (const contact of contacts) {
      const ct = contactText(contact);
      if (kws.some((k) => k.length > 2 && ct.includes(k))) {
        pairs.push({ skill, contact });
        break;
      }
    }
  }
  return pairs;
}
