/**
 * ContactKnowledgeCrossRef — F261 (CKXR)
 *
 * Parallel-fetches /entities/Contact + /knowledge/ every 90 s.
 * Keyword-correlates each contact (name/email/organization/role/tags)
 * against KB articles (title/content/topic/tags/summary).
 * Classification: DOCUMENTED (≥1 match) vs UNDOCUMENTED (0 matches).
 * Amber badge on undocumented count.
 *
 * Voice intents: "contact knowledge / knowledge contact / ckxr /
 *                documented contacts / undocumented contacts /
 *                which contacts have knowledge / contact kb coverage /
 *                contact knowledge gap / contact kb"
 * Strip button: ◈ CKXR  left:5520 bottom:18 zIndex:68
 * Custom event: jarvis:ckxr-toggle
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AMB = "#FFD700";
const GRN = "#00E5A0";
const DIM = "#5A7A9A";
const POLL = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const hdrs = { Authorization: `Bearer ${API_KEY}` };

const CKXR_RE =
  /\b(contact.knowledge|knowledge.contact|ckxr|documented.contact|undocumented.contact|which.contact.have.knowledge|contact.kb.coverage|contact.knowledge.gap|contact.kb)\b/i;

export function isCkxrQuery(t) { return CKXR_RE.test(t || ""); }

function tokenize(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function relevance(contact, article) {
  const a = tokenize([
    contact.name, contact.email, contact.organization,
    contact.role, (contact.tags || []).join(" "),
  ].join(" "));
  const b = tokenize([
    article.title, article.content, article.topic,
    article.summary, (article.tags || []).join(" "),
  ].join(" "));
  const setB = new Set(b);
  const hits = a.filter(w => setB.has(w)).length;
  return hits / Math.max(a.length, 1);
}

async function fetchAll() {
  const base = apiBase();
  const [cr, kr] = await Promise.all([
    fetch(`${base}/entities/Contact`, { headers: hdrs }),
    fetch(`${base}/knowledge/`,       { headers: hdrs }),
  ]);
  const cd = cr.ok ? await cr.json() : {};
  const kd = kr.ok ? await kr.json() : {};

  const contacts = (Array.isArray(cd) ? cd : cd?.data || cd?.items || cd?.results || cd?.contacts || []).map(c => ({
    id:           c.id || c._id || String(Math.random()),
    name:         c.name || c.full_name || "Unknown Contact",
    email:        c.email || "",
    organization: c.organization || c.org || c.company || "",
    role:         c.role || c.title || "",
    tags:         c.tags || [],
  }));

  const articles = (Array.isArray(kd) ? kd : kd?.data || kd?.items || kd?.results || kd?.articles || kd?.knowledge || []).map(a => ({
    id:      a.id || a._id || String(Math.random()),
    title:   a.title || a.name || "Untitled Article",
    content: a.content || a.body || a.text || "",
    topic:   a.topic || a.category || "",
    summary: a.summary || a.excerpt || "",
    tags:    a.tags || [],
  }));

  return { contacts, articles };
}

export async function buildCkxrScript() {
  try {
    const base = apiBase();
    const { contacts, articles } = await fetchAll();
    const threshold = 0.04;
    const documented   = contacts.filter(c => articles.some(a => relevance(c, a) >= threshold));
    const undocumented = contacts.filter(c => !articles.some(a => relevance(c, a) >= threshold));
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...hdrs },
      body: JSON.stringify({
        message: `Contact × Knowledge Cross-Reference (CKXR): ${contacts.length} contacts, ` +
          `${articles.length} KB articles, ${documented.length} documented, ` +
          `${undocumented.length} undocumented (no KB match). Undocumented contacts: ` +
          `${undocumented.slice(0, 3).map(c => c.name).join("; ") || "none"}. ` +
          "Assess KB coverage gaps for contacts in exactly 2 sentences.",
      }),
    });
    const d = r.ok ? await r.json() : null;
    return d?.response || d?.reply || d?.content || d?.text ||
      `CKXR: ${documented.length}/${contacts.length} contacts documented in KB, ${undocumented.length} undocumented.`;
  } catch {
    return "CKXR: unable to fetch assessment.";
  }
}

/* ── Styles ─────────────────────────────────────────────────────── */
const PANEL = {
  position: "fixed",
  bottom: 48,
  left: 5520,
  width: 440,
  height: 520,
  background: "rgba(7,18,28,0.97)",
  border: "1px solid #29E7FF44",
  borderRadius: 10,
  boxShadow: "0 0 28px #29E7FF22",
  display: "flex",
  flexDirection: "column",
  zIndex: 68,
  fontFamily: "'Share Tech Mono','Courier New',monospace",
  color: "#DCEBF5",
  backdropFilter: "blur(14px)",
};

const BTN = {
  position: "fixed",
  left: 5520,
  bottom: 18,
  zIndex: 68,
  background: "rgba(7,18,28,0.88)",
  border: "1px solid #29E7FF55",
  borderRadius: 6,
  color: CY,
  fontFamily: "'Share Tech Mono',monospace",
  fontSize: 11,
  padding: "3px 8px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 5,
};

/* ── Component ─────────────────────────────────────────────────── */
export default function ContactKnowledgeCrossRef() {
  const [open,      setOpen]      = useState(false);
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState(null);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assess,    setAssess]    = useState("");
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { contacts, articles } = await fetchAll();
      const threshold = 0.04;
      const enriched = contacts.map(c => {
        const matches = articles
          .map(a => ({ ...a, score: relevance(c, a) }))
          .filter(a => a.score >= threshold)
          .sort((x, y) => y.score - x.score);
        return { ...c, status: matches.length > 0 ? "DOCUMENTED" : "UNDOCUMENTED", matches };
      });
      enriched.sort((a, b) => a.status.localeCompare(b.status));
      setData({ contacts: enriched, articles });
    } catch (e) {
      setErr(e.message || "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => !o); };
    window.addEventListener("jarvis:ckxr-toggle", toggle);
    return () => window.removeEventListener("jarvis:ckxr-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    pollRef.current = setInterval(load, POLL);
    return () => clearInterval(pollRef.current);
  }, [open, load]);

  const runAssess = async () => {
    setAssessing(true); setAssess("");
    const txt = await buildCkxrScript();
    setAssess(txt); setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
  };

  if (!open) {
    const undocCount = data ? data.contacts.filter(c => c.status === "UNDOCUMENTED").length : 0;
    return (
      <button style={BTN} onClick={() => setOpen(true)} title="Contact × Knowledge Cross-Reference">
        ◈ CKXR
        {undocCount > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 3, fontSize: 9, padding: "1px 4px", fontWeight: 700 }}>
            {undocCount}
          </span>
        )}
      </button>
    );
  }

  const contacts    = data?.contacts || [];
  const articles    = data?.articles || [];
  const documented   = contacts.filter(c => c.status === "DOCUMENTED");
  const undocumented = contacts.filter(c => c.status === "UNDOCUMENTED");

  const visible = contacts.filter(c => {
    if (filter === "DOCUMENTED"   && c.status !== "DOCUMENTED")   return false;
    if (filter === "UNDOCUMENTED" && c.status !== "UNDOCUMENTED") return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (c.name + c.email + c.organization + c.role).toLowerCase().includes(q);
  });

  const toggle = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  return (
    <div style={PANEL}>
      {/* Header */}
      <div style={{ padding: "10px 14px 6px", borderBottom: "1px solid #29E7FF22", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 12, letterSpacing: 1 }}>◈ CONTACT × KNOWLEDGE CROSS-REF</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: "1px solid #29E7FF11" }}>
        {[
          { label: "CONTACTS",     val: contacts.length,    color: CY  },
          { label: "KB ARTICLES",  val: articles.length,    color: CY  },
          { label: "DOCUMENTED",   val: documented.length,  color: GRN },
          { label: "UNDOCUMENTED", val: undocumented.length, color: AMB },
        ].map(t => (
          <div key={t.label} style={{ flex: 1, background: "rgba(41,231,255,0.04)", borderRadius: 5, padding: "5px 4px", textAlign: "center" }}>
            <div style={{ color: t.color, fontSize: 14, fontWeight: 700 }}>{t.val}</div>
            <div style={{ color: DIM, fontSize: 8, letterSpacing: 0.5 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: "flex", gap: 4, padding: "6px 14px 4px", flexWrap: "wrap" }}>
        {["ALL", "DOCUMENTED", "UNDOCUMENTED"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ background: filter === f ? CY : "rgba(41,231,255,0.08)", color: filter === f ? "#000" : DIM, border: "none", borderRadius: 4, padding: "2px 8px", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>
            {f}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search contacts…"
          style={{ marginLeft: "auto", background: "rgba(41,231,255,0.05)", border: "1px solid #29E7FF22", borderRadius: 4, color: "#DCEBF5", fontFamily: "inherit", fontSize: 10, padding: "2px 8px", width: 130 }} />
      </div>

      {/* Contact list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 14px" }}>
        {loading && !data && <div style={{ color: DIM, fontSize: 11, textAlign: "center", marginTop: 20 }}>loading…</div>}
        {err && <div style={{ color: "#FF4D6D", fontSize: 11, textAlign: "center", marginTop: 10 }}>{err}</div>}
        {visible.map(c => (
          <div key={c.id} style={{ marginBottom: 6, background: "rgba(41,231,255,0.03)", borderRadius: 6, border: "1px solid #29E7FF18" }}>
            <div onClick={() => toggle(c.id)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", cursor: "pointer" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.status === "DOCUMENTED" ? GRN : AMB, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.name}
              </span>
              {c.organization && <span style={{ fontSize: 9, color: DIM }}>{c.organization}</span>}
              <span style={{ fontSize: 9, color: c.status === "DOCUMENTED" ? GRN : AMB, marginLeft: "auto" }}>
                {c.status}
              </span>
              <span style={{ color: DIM, fontSize: 10 }}>{expanded[c.id] ? "▲" : "▼"}</span>
            </div>

            {expanded[c.id] && (
              <div style={{ padding: "4px 12px 8px", borderTop: "1px solid #29E7FF11" }}>
                {c.email && <div style={{ fontSize: 9, color: DIM, marginBottom: 3 }}>✉ {c.email}{c.role ? ` · ${c.role}` : ""}</div>}
                {c.matches.length === 0 ? (
                  <div style={{ fontSize: 10, color: DIM, fontStyle: "italic" }}>No KB articles matched this contact.</div>
                ) : (
                  c.matches.slice(0, 5).map((a, i) => (
                    <div key={a.id + i} style={{ marginBottom: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</span>
                        {a.topic && <span style={{ fontSize: 8, color: CY, background: "rgba(41,231,255,0.12)", borderRadius: 3, padding: "1px 4px" }}>{a.topic.toUpperCase()}</span>}
                        <span style={{ fontSize: 9, color: GRN }}>{(a.score * 100).toFixed(0)}%</span>
                      </div>
                      <div style={{ height: 2, background: "#1a2a3a", borderRadius: 1, marginTop: 2 }}>
                        <div style={{ height: 2, width: `${Math.min(100, a.score * 400)}%`, background: GRN, borderRadius: 1 }} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
        {!loading && visible.length === 0 && data && (
          <div style={{ color: DIM, fontSize: 11, textAlign: "center", marginTop: 20 }}>No contacts match.</div>
        )}
      </div>

      {/* Assess footer */}
      <div style={{ padding: "6px 14px 10px", borderTop: "1px solid #29E7FF22" }}>
        {assess && <div style={{ fontSize: 10, color: "#DCEBF5", marginBottom: 5, lineHeight: 1.4 }}>{assess}</div>}
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={runAssess} disabled={assessing}
            style={{ flex: 1, background: "rgba(41,231,255,0.10)", border: "1px solid #29E7FF44", borderRadius: 5, color: CY, fontFamily: "inherit", fontSize: 10, padding: "4px 0", cursor: assessing ? "default" : "pointer" }}>
            {assessing ? "assessing…" : "▶ ASSESS"}
          </button>
          <button onClick={load}
            style={{ background: "rgba(41,231,255,0.06)", border: "1px solid #29E7FF33", borderRadius: 5, color: DIM, fontFamily: "inherit", fontSize: 10, padding: "4px 10px", cursor: "pointer" }}>
            ↻
          </button>
        </div>
      </div>
    </div>
  );
}
