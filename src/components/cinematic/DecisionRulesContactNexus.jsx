/**
 * DecisionRulesContactNexus — F550 (RULSCNT)
 * "JARVIS, rules contact / contact rules / rulscnt / monitored contacts / which contacts trigger rules / contact watchtower"
 * Cross-references /v1/rules + /entities/Contact.
 * Finds MONITORED contacts (contact name/tag keyword-matches ≥1 rule target/condition) vs UNMONITORED.
 * Coverage % tile; ALL/MONITORED/UNMONITORED filter tabs + search; click-to-expand matched rules.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence rule-contact watch brief + TTS.
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

const POLL_MS  = 120_000;
const BTN_LEFT = 50_480;
const Z_INDEX  = 117;

const RULSCNT_RE =
  /\brulscnt\b|\brules?.?contact\b|\bcontact.?rules?\b|\bmonitored.?contacts?\b|\bwhich.?contacts?.?trigger.?rules?\b|\bcontact.?watchtower\b|\bcontact.?rule.?coverage\b|\bwatchtower.?contact\b|\bcontacts?.?under.?watch\b/i;

export function isRulscntQuery(text) {
  return RULSCNT_RE.test(text || "");
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
    id:        r.id || `rule-${i}`,
    name:      r.name || r.title || `Rule ${i + 1}`,
    target:    r.target || r.entity || r.scope || "",
    severity:  (r.severity || r.level || "MEDIUM").toUpperCase(),
    condition: typeof r.condition === "string"
      ? r.condition
      : JSON.stringify(r.condition || r.expression || r.expr || ""),
    enabled:   r.enabled !== false,
    tags:      Array.isArray(r.tags) ? r.tags.join(" ") : String(r.tags || ""),
  }));
}

function normaliseContacts(data) {
  if (!data) return [];
  const raw =
    data.contacts || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((c, i) => ({
    id:    c.id || `contact-${i}`,
    name:  c.name || c.full_name || c.display_name || `Contact ${i + 1}`,
    role:  c.role || c.title || c.position || "",
    org:   c.organisation || c.organization || c.org || c.company || "",
    tags:  Array.isArray(c.tags) ? c.tags.join(" ") : String(c.tags || ""),
    email: c.email || "",
  }));
}

function crossRef(contacts, rules) {
  return contacts.map((c) => {
    const haystack = `${c.name} ${c.role} ${c.org} ${c.tags} ${c.email}`;
    const matches = rules
      .map((r) => ({
        r,
        hits: overlap(haystack, `${r.name} ${r.target} ${r.condition} ${r.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...c,
      monitored: matches.length > 0,
      matches:   matches.map(({ r, hits }) => ({ ...r, hits })),
    };
  });
}

// ─── buildRulscntScript (for JarvisBrain) ─────────────────────────────────────

export async function buildRulscntScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [rRes, cRes] = await Promise.all([
      fetch(`${base}/v1/rules`,           { headers: hdr }),
      fetch(`${base}/entities/Contact`,   { headers: hdr }),
    ]);
    const rData = rRes.ok ? await rRes.json() : {};
    const cData = cRes.ok ? await cRes.json() : {};

    const rules    = normaliseRules(rData);
    const contacts = normaliseContacts(cData);
    const crossed  = crossRef(contacts, rules);

    const total       = crossed.length;
    const monitored   = crossed.filter((c) => c.monitored).length;
    const unmonitored = total - monitored;
    const coverage    = total > 0 ? Math.round((monitored / total) * 100) : 0;
    const topMonitored = crossed
      .filter((c) => c.monitored)
      .slice(0, 2)
      .map((c) => c.name)
      .join(", ");

    const base2 = apiBase();
    const chatRes = await fetch(`${base2}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `Decision Rules × Contact Nexus (RULSCNT): ${total} contacts total, ${monitored} monitored by Watchtower rules (${coverage}% coverage), ${unmonitored} unmonitored. Top monitored: ${topMonitored || "none"}. In exactly 2 sentences, assess the rule-based contact surveillance posture.`,
      }),
    });
    const chatData = chatRes.ok ? await chatRes.json() : {};
    return chatData.response || chatData.message || chatData.answer ||
      `RULSCNT: ${monitored}/${total} contacts monitored by Watchtower rules (${coverage}%). ${unmonitored} contacts lack rule coverage.`;
  } catch {
    return "RULSCNT: Unable to fetch rules or contacts.";
  }
}

// ─── severity colour ──────────────────────────────────────────────────────────

function sevColour(sev) {
  if (sev === "CRITICAL") return RED;
  if (sev === "HIGH")     return AMB;
  if (sev === "MEDIUM")   return CY;
  return DIM;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function DecisionRulesContactNexus() {
  const [open,       setOpen]       = useState(false);
  const [contacts,   setContacts]   = useState([]);
  const [rules,      setRules]      = useState([]);
  const [crossed,    setCrossed]    = useState([]);
  const [tab,        setTab]        = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState("");
  const [badge,      setBadge]      = useState(0);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [rRes, cRes] = await Promise.all([
        fetch(`${base}/v1/rules`,         { headers: hdr }),
        fetch(`${base}/entities/Contact`, { headers: hdr }),
      ]);
      const rData = rRes.ok ? await rRes.json() : {};
      const cData = cRes.ok ? await cRes.json() : {};
      const r = normaliseRules(rData);
      const c = normaliseContacts(cData);
      const cx = crossRef(c, r);
      setRules(r);
      setContacts(c);
      setCrossed(cx);
      setBadge(cx.filter((x) => x.monitored).length);
    } catch {
      /* silently ignore network errors */
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("jarvis:rulscnt-toggle", handler);
    return () => window.removeEventListener("jarvis:rulscnt-toggle", handler);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment("");
    try {
      const brief = await buildRulscntScript();
      setAssessment(brief);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: brief } }));
    } finally {
      setAssessing(false);
    }
  }, []);

  const total       = crossed.length;
  const monitored   = crossed.filter((c) => c.monitored).length;
  const unmonitored = total - monitored;
  const coverage    = total > 0 ? Math.round((monitored / total) * 100) : 0;

  const visible = crossed.filter((c) => {
    if (tab === "MONITORED"   && !c.monitored) return false;
    if (tab === "UNMONITORED" &&  c.monitored) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.role.toLowerCase().includes(q) || c.org.toLowerCase().includes(q);
    }
    return true;
  });

  // ── floating button ──
  const btn = (
    <button
      onClick={() => setOpen((v) => !v)}
      style={{
        position: "fixed",
        left:     BTN_LEFT,
        bottom:   8,
        zIndex:   Z_INDEX,
        background: monitored > 0 ? "rgba(255,165,0,0.18)" : "rgba(41,231,255,0.10)",
        border:   `1px solid ${monitored > 0 ? AMB : CY}`,
        color:    monitored > 0 ? AMB : CY,
        borderRadius: 6,
        padding:  "3px 9px",
        fontSize: 11,
        cursor:   "pointer",
        fontFamily: "monospace",
      }}
    >
      ◈ RULSCNT{monitored > 0 && <span style={{ marginLeft: 5, background: AMB, color: "#000", borderRadius: 9, padding: "0 5px", fontSize: 10 }}>{monitored}</span>}
    </button>
  );

  if (!open) return btn;

  return (
    <>
      {btn}
      <div style={{
        position: "fixed", top: 60, right: 20, width: 560, maxHeight: "80vh",
        background: "rgba(5,15,30,0.97)", border: `1px solid ${CY}`,
        borderRadius: 10, zIndex: Z_INDEX + 1, display: "flex", flexDirection: "column",
        fontFamily: "monospace", color: CY, overflow: "hidden",
        boxShadow: `0 0 24px ${CY}44`,
      }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: `1px solid ${CY}33` }}>
          <span style={{ fontWeight: 700, letterSpacing: 2 }}>◈ RULSCNT — RULES × CONTACTS</span>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${CY}22` }}>
          {[
            ["CONTACTS",    total,       CY],
            ["MONITORED",   monitored,   GRN],
            ["UNMONITORED", unmonitored, AMB],
            ["COVERAGE",    `${coverage}%`, coverage >= 70 ? GRN : coverage >= 40 ? AMB : RED],
            ["RULES",       rules.length, DIM],
          ].map(([label, val, col]) => (
            <div key={label} style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: col }}>{val}</div>
              <div style={{ fontSize: 9, color: DIM, letterSpacing: 1 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* assess */}
        <div style={{ padding: "6px 14px", borderBottom: `1px solid ${CY}22`, display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={assess} disabled={assessing} style={{ background: "rgba(41,231,255,0.12)", border: `1px solid ${CY}`, color: CY, borderRadius: 5, padding: "3px 12px", cursor: "pointer", fontSize: 11 }}>
            {assessing ? "▶ …" : "▶ ASSESS"}
          </button>
          {assessment && <span style={{ fontSize: 11, color: GRN, flex: 1, lineHeight: 1.4 }}>{assessment}</span>}
        </div>

        {/* filter tabs */}
        <div style={{ display: "flex", gap: 6, padding: "6px 14px", borderBottom: `1px solid ${CY}22` }}>
          {["ALL", "MONITORED", "UNMONITORED"].map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ background: tab === t ? CY : "rgba(41,231,255,0.08)", border: `1px solid ${CY}44`, color: tab === t ? "#000" : CY, borderRadius: 4, padding: "2px 10px", cursor: "pointer", fontSize: 10 }}>{t}</button>
          ))}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search contacts…"
            style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: `1px solid ${CY}44`, color: CY, borderRadius: 4, padding: "2px 8px", fontSize: 10, outline: "none" }}
          />
        </div>

        {/* list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px" }}>
          {visible.length === 0 && <div style={{ color: DIM, fontSize: 12, padding: 12 }}>No contacts match.</div>}
          {visible.map((c) => (
            <div key={c.id} style={{ marginBottom: 8 }}>
              <div
                onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                  padding: "5px 8px", borderRadius: 5,
                  background: c.monitored ? "rgba(0,229,160,0.06)" : "rgba(255,165,0,0.06)",
                  border: `1px solid ${c.monitored ? GRN + "44" : AMB + "44"}`,
                }}
              >
                <span style={{ width: 14, height: 14, borderRadius: "50%", background: c.monitored ? GRN : AMB, display: "inline-block", flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 12, color: c.monitored ? GRN : AMB }}>{c.name}</span>
                {c.role && <span style={{ fontSize: 10, color: DIM }}>{c.role}</span>}
                {c.org  && <span style={{ fontSize: 10, color: DIM }}>· {c.org}</span>}
                <span style={{ fontSize: 10, color: c.monitored ? GRN : AMB, marginLeft: "auto" }}>{c.monitored ? `${c.matches.length} rule${c.matches.length !== 1 ? "s" : ""}` : "UNMONITORED"}</span>
                <span style={{ fontSize: 10, color: DIM }}>{expanded === c.id ? "▲" : "▼"}</span>
              </div>

              {expanded === c.id && c.matches.length > 0 && (
                <div style={{ marginTop: 4, marginLeft: 22, display: "flex", flexDirection: "column", gap: 4 }}>
                  {c.matches.map((r) => (
                    <div key={r.id} style={{ background: "rgba(41,231,255,0.05)", border: `1px solid ${CY}22`, borderRadius: 4, padding: "4px 10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: sevColour(r.severity), letterSpacing: 1 }}>{r.severity}</span>
                        <span style={{ fontSize: 11, color: CY, flex: 1 }}>{r.name}</span>
                        <span style={{ fontSize: 10, color: DIM }}>{r.hits} hit{r.hits !== 1 ? "s" : ""}</span>
                      </div>
                      {r.target && <div style={{ fontSize: 10, color: DIM, marginTop: 2 }}>Target: {r.target}</div>}
                      {r.condition && (
                        <div style={{ fontSize: 9, color: DIM, marginTop: 2, wordBreak: "break-all", fontFamily: "monospace" }}>
                          {r.condition.slice(0, 120)}{r.condition.length > 120 ? "…" : ""}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {expanded === c.id && c.matches.length === 0 && (
                <div style={{ marginTop: 4, marginLeft: 22, fontSize: 10, color: DIM }}>No rule matches found.</div>
              )}
            </div>
          ))}
        </div>

        <div style={{ padding: "5px 14px", borderTop: `1px solid ${CY}22`, fontSize: 9, color: DIM }}>
          Auto-refresh every {POLL_MS / 1000}s · /v1/rules + /entities/Contact
        </div>
      </div>
    </>
  );
}
