/**
 * ContactOpsEventsNexus — F634
 * "JARVIS, cntops / contact ops / ops contact / contacts in ops /
 *  operational contacts / which contacts have ops events / contact events /
 *  ops event contacts"
 * Cross-references /entities/Contact against /v1/ops/events.
 * LINKED contacts (≥1 ops event keyword-matches) vs CLEAR (no ops event signal).
 * Coverage % tile; ALL/LINKED/CLEAR filter tabs + search; click-to-expand matched events.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence operational-contact brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4444";
const DIM = "#8899AA";
const ORG = "#FF6B35";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 104_520;
const Z_INDEX  = 180;

const CNTOPS_RE =
  /\bcntops\b|\bcontact.?ops\b|\bops.?contact\b|\bcontacts?.in.?ops\b|\boperational.?contact\b|\bwhich.?contacts?.have.?ops\b|\bcontact.?event\b|\bops.?event.?contact\b|\bcontact.?incident\b/i;

export function isCntopsQuery(text) {
  return CNTOPS_RE.test(text || "");
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

function normaliseContacts(data) {
  if (!data) return [];
  const raw =
    data.contacts || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((c, i) => ({
    id:   c.id || `cnt-${i}`,
    name: c.name || c.full_name || c.title || `Contact ${i + 1}`,
    role: c.role || c.job_title || c.position || "",
    org:  c.org || c.organization || c.company || "",
    tags: Array.isArray(c.tags) ? c.tags.join(" ") : (c.tags || ""),
  }));
}

function normaliseOpsEvents(data) {
  if (!data) return [];
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.events)
    ? data.events
    : Array.isArray(data?.data)
    ? data.data
    : [];
  return arr.map((e, i) => ({
    id:       e.id       || e.event_id || String(i),
    title:    e.title    || e.name     || e.summary  || `Event ${i + 1}`,
    severity: (e.severity || e.level   || "INFO").toString().toUpperCase(),
    source:   e.source   || e.service  || "",
    message:  e.message  || e.description || e.body || "",
  }));
}

function crossRef(contacts, events) {
  return contacts.map((cnt) => {
    const haystack = `${cnt.name} ${cnt.role} ${cnt.org} ${cnt.tags}`;
    const matches = events
      .map((ev) => {
        const needle = `${ev.title} ${ev.source} ${ev.message}`;
        const hits = overlap(haystack, needle);
        return hits > 0 ? { ...ev, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits);
    return { ...cnt, linked: matches.length > 0, events: matches };
  });
}

export async function buildCntopsScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [cntRes, opsRes] = await Promise.all([
      fetch(`${base}/entities/Contact`, { headers: hdr }),
      fetch(`${base}/v1/ops/events`,   { headers: hdr }),
    ]);
    const [cntData, opsData] = await Promise.all([cntRes.json(), opsRes.json()]);
    const contacts = normaliseContacts(cntData);
    const events   = normaliseOpsEvents(opsData);
    const rows     = crossRef(contacts, events);
    const linked = rows.filter((r) => r.linked).length;
    const clear  = rows.length - linked;
    const pct = rows.length ? Math.round((linked / rows.length) * 100) : 0;
    if (!rows.length) return "No contacts found in the system, sir.";
    const topLinked = rows
      .filter((r) => r.linked)
      .slice(0, 2)
      .map((r) => r.name)
      .join("; ");
    return (
      `${linked} of ${rows.length} contacts are correlated with active ops events (${pct}% operational exposure). ` +
      (linked > 0
        ? `Operationally-linked contacts include: ${topLinked || "unknown"} — these individuals appear in live incident signals.`
        : `${clear} contact${clear !== 1 ? "s" : ""} show no ops event correlation — operational picture is clear across all contacts.`)
    );
  } catch {
    return "Unable to reach contacts or ops events endpoints, sir.";
  }
}

const SEV_COLOR = {
  CRITICAL: RED,
  HIGH:     ORG,
  MEDIUM:   AMB,
  WARNING:  AMB,
  INFO:     CY,
  LOW:      GRN,
};

export default function ContactOpsEventsNexus() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [cntRes, opsRes] = await Promise.all([
        fetch(`${base}/entities/Contact`, { headers: hdr }),
        fetch(`${base}/v1/ops/events`,   { headers: hdr }),
      ]);
      const [cntData, opsData] = await Promise.all([cntRes.json(), opsRes.json()]);
      const contacts = normaliseContacts(cntData);
      const events   = normaliseOpsEvents(opsData);
      setRows(crossRef(contacts, events));
    } catch {
      /* silently ignore fetch errors */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen((p) => !p); if (!rows.length) load(); };
    window.addEventListener("jarvis:cntops-toggle", handler);
    return () => window.removeEventListener("jarvis:cntops-toggle", handler);
  }, [load, rows.length]);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const linked = rows.filter((r) => r.linked).length;
  const clear  = rows.length - linked;
  const pct    = rows.length ? Math.round((linked / rows.length) * 100) : 0;

  const visible = rows
    .filter((r) => {
      if (filter === "LINKED") return r.linked;
      if (filter === "CLEAR")  return !r.linked;
      return true;
    })
    .filter((r) =>
      !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.org.toLowerCase().includes(search.toLowerCase())
    );

  const assess = async () => {
    setAssessing(true);
    setBrief("");
    try {
      const summary = await buildCntopsScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `JARVIS operational contact brief: ${summary}` }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || summary;
      setBrief(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setBrief("Assessment unavailable — check backend connectivity, sir.");
    } finally {
      setAssessing(false);
    }
  };

  return (
    <>
      {/* HUD button */}
      <button
        onClick={() => { setOpen((p) => !p); if (!rows.length) load(); }}
        style={{
          position: "fixed",
          left:     BTN_LEFT,
          bottom:   8,
          zIndex:   Z_INDEX,
          background: linked > 0 ? `${AMB}22` : "rgba(0,0,0,0.55)",
          border:   `1px solid ${linked > 0 ? AMB : CY}55`,
          borderRadius: 5,
          color:    linked > 0 ? AMB : CY,
          padding:  "3px 8px",
          fontSize: 9,
          letterSpacing: 1,
          cursor:   "pointer",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ CNTOPS
        {linked > 0 && (
          <span style={{ marginLeft: 5, background: AMB, color: "#000", borderRadius: 9, padding: "0 5px", fontSize: 8, fontWeight: 700 }}>
            {linked}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            left: Math.min(BTN_LEFT, window.innerWidth - 360),
            bottom: 36,
            zIndex: Z_INDEX + 1,
            width: 340,
            maxHeight: 480,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            background: "rgba(6,12,22,0.97)",
            border: `1px solid ${CY}33`,
            borderRadius: 8,
            padding: 14,
            fontFamily: "monospace",
            backdropFilter: "blur(12px)",
          }}
        >
          {/* header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>CONTACT × OPS EVENTS</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 12 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[
              { label: "CONTACTS", value: rows.length, col: CY },
              { label: "LINKED",   value: linked,      col: AMB },
              { label: "CLEAR",    value: clear,       col: GRN },
              { label: "COVERAGE", value: `${pct}%`,   col: pct >= 50 ? GRN : AMB },
            ].map((t) => (
              <div key={t.label} style={{ flex: 1, background: `${t.col}11`, border: `1px solid ${t.col}33`, borderRadius: 5, padding: "5px 4px", textAlign: "center" }}>
                <div style={{ color: t.col, fontSize: 12, fontWeight: 700 }}>{t.value}</div>
                <div style={{ color: DIM, fontSize: 7, letterSpacing: 1 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search contacts…"
            style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${CY}33`, borderRadius: 4, color: "#DCEBF5", padding: "4px 8px", fontSize: 10, marginBottom: 6, outline: "none" }}
          />

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {["ALL", "LINKED", "CLEAR"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  flex: 1,
                  background: filter === f ? `${CY}22` : "transparent",
                  border: `1px solid ${filter === f ? CY : CY + "33"}`,
                  borderRadius: 4,
                  color: filter === f ? CY : DIM,
                  padding: "3px 0",
                  fontSize: 8,
                  cursor: "pointer",
                  letterSpacing: 1,
                }}
              >
                {f}
              </button>
            ))}
          </div>

          {/* list */}
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {loading && <div style={{ color: DIM, fontSize: 10, textAlign: "center", padding: 16 }}>Loading…</div>}
            {!loading && visible.length === 0 && (
              <div style={{ color: DIM, fontSize: 10, textAlign: "center", padding: 16 }}>No contacts match filter.</div>
            )}
            {visible.map((cnt) => (
              <div
                key={cnt.id}
                onClick={() => setExpanded(expanded === cnt.id ? null : cnt.id)}
                style={{
                  background: cnt.linked ? `${AMB}09` : "rgba(255,255,255,0.02)",
                  border: `1px solid ${cnt.linked ? AMB + "33" : CY + "1A"}`,
                  borderRadius: 5,
                  padding: "6px 8px",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    fontSize: 8,
                    border: `1px solid ${cnt.linked ? AMB : GRN}44`,
                    borderRadius: 3,
                    padding: "1px 4px",
                    color: cnt.linked ? AMB : GRN,
                    letterSpacing: 1,
                  }}>
                    {cnt.linked ? "LINKED" : "CLEAR"}
                  </span>
                  <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{cnt.name}</span>
                  {cnt.linked && (
                    <span style={{ color: DIM, fontSize: 9 }}>{cnt.events.length} ev</span>
                  )}
                </div>
                {cnt.role && (
                  <div style={{ color: DIM, fontSize: 9, marginLeft: 16 }}>{cnt.role.slice(0, 40)}</div>
                )}

                {expanded === cnt.id && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${AMB}22`, paddingTop: 6 }}>
                    {cnt.linked ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {cnt.events.map((ev) => (
                          <div key={ev.id} style={{ background: "rgba(255,165,0,0.04)", border: `1px solid ${AMB}33`, borderRadius: 4, padding: "5px 7px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{
                                color: SEV_COLOR[ev.severity] || CY,
                                fontSize: 9,
                                border: `1px solid ${(SEV_COLOR[ev.severity] || CY)}44`,
                                borderRadius: 3,
                                padding: "1px 4px",
                              }}>
                                {ev.severity}
                              </span>
                              <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{ev.title}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>hits: {ev.hits}</span>
                            </div>
                            {ev.source && (
                              <div style={{ color: DIM, fontSize: 8, marginTop: 2 }}>{ev.source}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No ops events matched this contact — operationally clear.</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* assess */}
          <div style={{ marginTop: 10, borderTop: `1px solid ${AMB}22`, paddingTop: 8 }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{
                background: `${AMB}18`,
                border: `1px solid ${AMB}55`,
                borderRadius: 5,
                color: AMB,
                padding: "5px 12px",
                cursor: "pointer",
                fontSize: 10,
                letterSpacing: 1,
                width: "100%",
                opacity: assessing ? 0.6 : 1,
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, color: "#DCEBF5", fontSize: 10, lineHeight: 1.5, borderLeft: `2px solid ${AMB}`, paddingLeft: 8 }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
