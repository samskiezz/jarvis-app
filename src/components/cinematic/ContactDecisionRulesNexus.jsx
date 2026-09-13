/**
 * F733 — Contact × Decision Rules Nexus (CNTRULS)
 *
 * Cross-references /entities/Contact + /v1/rules.
 * Keyword-matches each contact against watchtower decision rules.
 *
 *   RULE-WATCHED  — contact matches ≥1 watchtower rule
 *   UNMONITORED   — no rule keyword-matches this contact
 *
 * Stat tiles: CONTACTS | RULE-WATCHED | UNMONITORED | COVERAGE %
 * Filter tabs: ALL | RULE-WATCHED | UNMONITORED + search
 * Expand contact → matched rules (severity badge + enabled status + hits)
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence monitoring brief + TTS
 *
 * Button: ◈ CNTRULS  left:902960 bottom:8 zIndex:592
 * Event:  jarvis:cntruls-toggle
 * Refresh: 90 s auto-poll
 * Voice:  "cntruls / contact rules / rules contact / which contacts have rules /
 *          monitored contacts / unmonitored contacts / contact watchtower /
 *          rule watched contacts / contact decision rules"
 */
import { useCallback, useEffect, useRef, useState } from "react";

const CY  = "#29E7FF";
const AM  = "#FFB347";
const GN  = "#39FF14";
const RD  = "#FF4444";
const PR  = "#B47FFF";
const DIM = "#8899AA";

const BTN_LEFT = 902960;
const POLL_MS  = 90_000;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CNTRULS_RE =
  /\b(cntruls|contact[\s._-]?rules?|rules?[\s._-]?contact|which[\s._-]?contacts[\s._-]?have[\s._-]?rules?|monitored[\s._-]?contact|unmonitored[\s._-]?contact|contact[\s._-]?watchtower|rule[\s._-]?watched[\s._-]?contact|contact[\s._-]?decision[\s._-]?rules?)\b/i;

export function isCntRulsQuery(t) {
  return CNTRULS_RE.test(t || "");
}

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  return (env.VITE_API_BASE_URL || "").replace(/\/$/, "") || "http://localhost:8000";
}

function normaliseContacts(data) {
  if (!data) return [];
  const raw = data.contacts || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((c, i) => ({
    id:   c.id   || `cnt-${i}`,
    name: (c.name || c.full_name || c.display_name || `Contact ${i + 1}`).trim(),
    role: c.role || c.title || c.position || "",
    org:  c.organization || c.org || c.company || "",
    tags: [
      ...(c.tags || []),
      ...(c.labels || []),
      c.role, c.title, c.organization, c.org, c.company,
    ].filter(Boolean).map(t => String(t).toLowerCase()),
  }));
}

function normaliseRules(data) {
  if (!data) return [];
  const raw = data.rules || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((r, i) => ({
    id:       r.id       || `rule-${i}`,
    name:     r.name     || r.title || r.rule_name || `Rule ${i + 1}`,
    severity: (r.severity || r.level || r.priority || "MEDIUM").toUpperCase(),
    target:   r.target   || r.entity_type || r.applies_to || "",
    enabled:  r.enabled !== false && r.active !== false,
    condition: r.condition || r.expression || r.filter || "",
    tags: [
      ...(r.tags || []),
      ...(r.labels || []),
      r.target, r.entity_type, r.applies_to, r.category,
    ].filter(Boolean).map(t => String(t).toLowerCase()),
  }));
}

function keywords(obj) {
  return [obj.name, obj.target, obj.condition, ...(obj.tags || [])].filter(Boolean).join(" ").toLowerCase();
}

function scoreMatch(aKw, bKw) {
  const words = aKw.split(/\s+/).filter(w => w.length > 3);
  let hits = 0;
  for (const w of words) if (bKw.includes(w)) hits++;
  return hits;
}

function buildNexus(contacts, rules) {
  return contacts.map(contact => {
    const cKw = keywords(contact);
    const matched = rules
      .map(r => ({ ...r, hits: scoreMatch(cKw, keywords(r)) }))
      .filter(r => r.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 5);
    return {
      ...contact,
      status: matched.length > 0 ? "RULE-WATCHED" : "UNMONITORED",
      matchedRules: matched,
    };
  });
}

async function fetchAll() {
  const base    = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [cntR, rulsR] = await Promise.all([
    fetch(`${base}/entities/Contact`, { headers }),
    fetch(`${base}/v1/rules`,         { headers }),
  ]);
  const cntJ  = cntR.ok  ? await cntR.json()  : [];
  const rulsJ = rulsR.ok ? await rulsR.json() : [];
  const contacts = normaliseContacts(cntJ);
  const rules    = normaliseRules(rulsJ);
  return { contacts, rules };
}

export async function buildCntRulsScript() {
  try {
    const { contacts, rules } = await fetchAll();
    const rows      = buildNexus(contacts, rules);
    const watched   = rows.filter(r => r.status === "RULE-WATCHED").length;
    const covPct    = rows.length ? Math.round((watched / rows.length) * 100) : 0;
    const topUnmonitored = rows
      .filter(r => r.status === "UNMONITORED")
      .slice(0, 3)
      .map(r => r.name)
      .join(", ");
    return (
      `Contact-rules nexus — ${contacts.length} contacts assessed against ${rules.length} watchtower rules. ` +
      `${watched} contacts are rule-watched (${covPct}%), ${rows.length - watched} unmonitored.` +
      (topUnmonitored
        ? ` Unmonitored contacts include: ${topUnmonitored}.`
        : ` All contacts have at least one matching decision rule.`)
    );
  } catch (e) {
    return `Contact-rules nexus error: ${e.message}`;
  }
}

const SEV_COLOR = {
  CRITICAL: RD,
  HIGH:     AM,
  MEDIUM:   CY,
  LOW:      GN,
};

const STATUS_COLOR = { "RULE-WATCHED": GN, UNMONITORED: AM };

const TABS = ["ALL", "RULE-WATCHED", "UNMONITORED"];

export default function ContactDecisionRulesNexus() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [rules,     setRules]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState(null);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { contacts, rules: rs } = await fetchAll();
      setRules(rs);
      setRows(buildNexus(contacts, rs));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const toggle = () => { setOpen(o => !o); if (!rows.length) load(); };
    window.addEventListener("jarvis:cntruls-toggle", toggle);
    return () => window.removeEventListener("jarvis:cntruls-toggle", toggle);
  }, [load, rows.length]);

  const filtered = rows.filter(r => {
    if (tab !== "ALL" && r.status !== tab) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      r.name.toLowerCase().includes(q) ||
      r.role.toLowerCase().includes(q)  ||
      r.org.toLowerCase().includes(q)
    );
  });

  const watched    = rows.filter(r => r.status === "RULE-WATCHED").length;
  const unmonitored = rows.length - watched;
  const covPct     = rows.length ? Math.round((watched / rows.length) * 100) : 0;

  async function assess() {
    setAssessing(true);
    try {
      const brief = await buildCntRulsScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message: `Contact decision-rules nexus assessment. Context: ${brief}. Provide a 2-sentence strategic recommendation on monitoring gaps.`,
        }),
      });
      const d = await r.json();
      const answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      if (answer) window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch {
      // silent
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); if (!rows.length) load(); }}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 592,
          background: "rgba(0,229,160,0.12)", border: "1px solid #00E5A0",
          color: "#00E5A0", fontFamily: "monospace", fontSize: 11,
          padding: "3px 8px", cursor: "pointer", borderRadius: 3,
          whiteSpace: "nowrap",
        }}
      >
        ◈ CNTRULS
        {unmonitored > 0 && (
          <span style={{
            marginLeft: 4, background: AM, color: "#000",
            borderRadius: 2, padding: "1px 5px", fontWeight: 700,
          }}>{unmonitored}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh",
      background: "rgba(0,0,0,0.85)", zIndex: 9200,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "monospace",
    }}>
      <div style={{
        background: "#0A0F1A", border: "1px solid #00E5A0",
        borderRadius: 8, width: "min(860px,96vw)", maxHeight: "90vh",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "12px 16px", borderBottom: "1px solid #1A2535",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ color: "#00E5A0", fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>
            ◈ CONTACT × DECISION RULES NEXUS
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={assess} disabled={assessing}
              style={{
                background: "rgba(0,229,160,0.15)", border: "1px solid #00E5A0",
                color: "#00E5A0", padding: "3px 10px", borderRadius: 3,
                cursor: "pointer", fontSize: 11,
              }}
            >
              {assessing ? "..." : "▶ ASSESS"}
            </button>
            <button
              onClick={load}
              style={{
                background: "transparent", border: "1px solid #334",
                color: DIM, padding: "3px 8px", borderRadius: 3,
                cursor: "pointer", fontSize: 11,
              }}
            >↺</button>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "transparent", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
            >✕</button>
          </div>
        </div>

        {/* Stat tiles */}
        <div style={{ display: "flex", gap: 8, padding: "10px 16px", borderBottom: "1px solid #1A2535" }}>
          {[
            { label: "CONTACTS",     val: rows.length,  col: CY },
            { label: "RULE-WATCHED", val: watched,       col: GN },
            { label: "UNMONITORED",  val: unmonitored,   col: AM },
            { label: "COVERAGE",     val: `${covPct}%`,  col: PR },
          ].map(({ label, val, col }) => (
            <div key={label} style={{
              flex: 1, background: "rgba(255,255,255,0.04)",
              borderRadius: 4, padding: "8px 10px", textAlign: "center",
            }}>
              <div style={{ color: col, fontSize: 20, fontWeight: 700 }}>{val}</div>
              <div style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Tabs + search */}
        <div style={{
          display: "flex", gap: 4, padding: "8px 16px",
          borderBottom: "1px solid #1A2535", alignItems: "center",
        }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? "rgba(0,229,160,0.18)" : "transparent",
              border: `1px solid ${tab === t ? "#00E5A0" : "#334"}`,
              color: tab === t ? "#00E5A0" : DIM,
              borderRadius: 3, padding: "3px 10px", cursor: "pointer", fontSize: 10,
            }}>{t}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search contacts…"
            style={{
              marginLeft: "auto", background: "rgba(255,255,255,0.05)",
              border: "1px solid #334", color: "#ccc",
              borderRadius: 3, padding: "3px 8px", fontSize: 11, width: 160,
            }}
          />
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {loading && (
            <div style={{ color: DIM, padding: 16, textAlign: "center", fontSize: 12 }}>Loading…</div>
          )}
          {err && (
            <div style={{ color: RD, padding: 16, textAlign: "center", fontSize: 12 }}>Error: {err}</div>
          )}
          {!loading && !err && filtered.length === 0 && (
            <div style={{ color: DIM, padding: 16, textAlign: "center", fontSize: 12 }}>
              No contacts match.
            </div>
          )}
          {filtered.map(row => (
            <div key={row.id}>
              <div
                onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 16px", borderBottom: "1px solid #111820",
                  cursor: "pointer",
                  background: expanded === row.id ? "rgba(0,229,160,0.05)" : "transparent",
                }}
              >
                <span style={{
                  color: STATUS_COLOR[row.status] || DIM,
                  fontSize: 11, fontWeight: 700, minWidth: 96,
                }}>{row.status}</span>
                <span style={{ color: "#ddd", fontSize: 12, flex: 1 }}>{row.name}</span>
                {row.role && <span style={{ color: DIM, fontSize: 10 }}>{row.role}</span>}
                {row.org  && <span style={{ color: DIM, fontSize: 10 }}>{row.org}</span>}
                <span style={{ color: DIM, fontSize: 10 }}>
                  {row.matchedRules.length > 0
                    ? `${row.matchedRules.length} rule${row.matchedRules.length > 1 ? "s" : ""}`
                    : "—"}
                </span>
                <span style={{ color: DIM, fontSize: 11 }}>
                  {expanded === row.id ? "▲" : "▼"}
                </span>
              </div>

              {expanded === row.id && (
                <div style={{
                  padding: "8px 24px 12px",
                  background: "rgba(0,0,0,0.3)",
                  borderBottom: "1px solid #111820",
                }}>
                  {row.matchedRules.length === 0 && (
                    <div style={{ color: DIM, fontSize: 11 }}>
                      No decision rules matched this contact.
                    </div>
                  )}
                  {row.matchedRules.map(r => (
                    <div key={r.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                      <span style={{
                        color: "#000", background: SEV_COLOR[r.severity] || DIM,
                        fontSize: 9, fontWeight: 700, borderRadius: 2,
                        padding: "1px 5px", minWidth: 56, textAlign: "center",
                      }}>{r.severity}</span>
                      <div>
                        <div style={{ color: CY, fontSize: 11 }}>{r.name}</div>
                        {r.target && (
                          <div style={{ color: DIM, fontSize: 10, marginTop: 2 }}>
                            target: {r.target}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                          <span style={{ color: r.enabled ? GN : RD, fontSize: 9 }}>
                            {r.enabled ? "● enabled" : "○ disabled"}
                          </span>
                          <span style={{ color: AM, fontSize: 9 }}>
                            {r.hits} keyword hit{r.hits !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: "6px 16px", borderTop: "1px solid #1A2535",
          color: DIM, fontSize: 10,
          display: "flex", justifyContent: "space-between",
        }}>
          <span>{filtered.length} of {rows.length} contacts • {rules.length} decision rules</span>
          <span>auto-refresh 90 s</span>
        </div>
      </div>
    </div>
  );
}
