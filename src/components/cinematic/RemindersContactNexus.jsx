/**
 * RemindersContactNexus — F600
 * "JARVIS, reminders contact / contact reminders / remcnt / contact-linked reminders"
 * Cross-references /reminders/list against /entities/Contact.
 * CONTACT-LINKED reminders (≥1 contact keyword-matches) vs UNLINKED (no contact backing).
 * Coverage % tile; ALL/CONTACT-LINKED/UNLINKED filter tabs + search; click-to-expand matched contacts.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4444";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS = 90_000;

const REMCNT_RE =
  /\bremcnt\b|\breminders?.contacts?\b|\bcontacts?.reminders?\b|\bcontact.?linked.?reminders?\b|\bunlinked.?reminders?\b|\breminder.?contact.?coverage\b|\breminders?.with.?contacts?\b/i;

export function isRemcntQuery(text) {
  return REMCNT_RE.test(text || "");
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

function normaliseReminders(data) {
  if (!data) return [];
  const raw =
    data.reminders || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((r, i) => ({
    id:      r.id || `rem-${i}`,
    content: r.content || r.text || r.title || r.note || `Reminder ${i + 1}`,
    kind:    (r.kind || r.type || "reminder").toLowerCase(),
    status:  (r.status || "pending").toLowerCase(),
    tags:    r.tags || [],
  }));
}

function normaliseContacts(data) {
  if (!data) return [];
  const raw =
    data.contacts || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((c, i) => ({
    id:   c.id || `cnt-${i}`,
    name: c.name || c.full_name || c.fullName || `Contact ${i + 1}`,
    role: c.role || c.title || c.position || "",
    org:  c.org || c.organization || c.company || "",
    tags: c.tags || [],
  }));
}

function crossRef(reminders, contacts) {
  return reminders.map((rem) => {
    const haystack = `${rem.content} ${(rem.tags || []).join(" ")}`;
    const matches = contacts
      .map((c) => {
        const hits = overlap(haystack, `${c.name} ${c.role} ${c.org} ${(c.tags || []).join(" ")}`);
        return hits > 0 ? { ...c, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 5);
    return { ...rem, contacts: matches, linked: matches.length > 0 };
  });
}

export async function buildRemcntScript() {
  try {
    const base = apiBase();
    const [remRes, cntRes] = await Promise.all([
      fetch(`${base}/reminders/list`,   { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/entities/Contact`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const [remData, cntData] = await Promise.all([remRes.json(), cntRes.json()]);
    const reminders = normaliseReminders(remData);
    const contacts  = normaliseContacts(cntData);
    const rows      = crossRef(reminders, contacts);
    const linked    = rows.filter((r) => r.linked).length;
    const unlinked  = rows.length - linked;
    const pct       = rows.length ? Math.round((linked / rows.length) * 100) : 0;
    if (!rows.length) return "No reminders found in the system, sir.";
    const topUnlinked = rows.filter((r) => !r.linked).slice(0, 2).map((r) => r.content.slice(0, 40)).join("; ");
    return (
      `${linked} of ${rows.length} reminders are linked to contacts (${pct}% coverage). ` +
      (unlinked > 0
        ? `${unlinked} reminder${unlinked !== 1 ? "s" : ""} have no contact association — potential orphaned intelligence items: ${topUnlinked || "unknown"}.`
        : "All reminders have associated contact backing.")
    );
  } catch {
    return "Unable to reach reminders or contact endpoints, sir.";
  }
}

export default function RemindersContactNexus() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const [remRes, cntRes] = await Promise.all([
        fetch(`${base}/reminders/list`,   { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/entities/Contact`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const [remData, cntData] = await Promise.all([remRes.json(), cntRes.json()]);
      setRows(crossRef(normaliseReminders(remData), normaliseContacts(cntData)));
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:remcnt-toggle", toggle);
    return () => window.removeEventListener("jarvis:remcnt-toggle", toggle);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const linked   = rows.filter((r) => r.linked);
      const unlinked = rows.filter((r) => !r.linked);
      const resp = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message:
            `Assess reminder-to-contact linkage: ${rows.length} reminders total, ` +
            `${linked.length} are contact-linked, ` +
            `${unlinked.length} have no contact association. ` +
            `Top unlinked reminders: ${unlinked.slice(0, 3).map((r) => r.content.slice(0, 40)).join("; ") || "none"}. ` +
            "Give a 2-sentence operational-intelligence and contact-coverage assessment with recommended action.",
        }),
      });
      const d = await resp.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(text);
      if (text) {
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }, [rows]);

  const linked   = rows.filter((r) => r.linked).length;
  const unlinked = rows.length - linked;
  const pct      = rows.length ? Math.round((linked / rows.length) * 100) : 0;

  const visible = rows
    .filter((r) => {
      if (tab === "CONTACT-LINKED") return r.linked;
      if (tab === "UNLINKED")       return !r.linked;
      return true;
    })
    .filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        r.content.toLowerCase().includes(q) ||
        r.kind.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q)
      );
    });

  const KIND_COLOR = {
    note: CY, task: GRN, alert: RED, reminder: AMB,
  };

  const BTN_LEFT = 81_440;
  const BTN_STYLE = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 8,
    zIndex: 153,
    padding: "4px 10px",
    background: "rgba(5,8,13,0.82)",
    border: `1px solid ${unlinked > 0 ? AMB : CY}55`,
    borderRadius: 6,
    cursor: "pointer",
    color: CY,
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 10,
    letterSpacing: 1,
    display: "flex",
    alignItems: "center",
    gap: 5,
    backdropFilter: "blur(6px)",
  };

  const PANEL = {
    position: "fixed",
    left: BTN_LEFT - 340,
    bottom: 38,
    zIndex: 153,
    width: 400,
    maxHeight: "70vh",
    overflowY: "auto",
    background: "rgba(6,10,16,0.94)",
    border: `1px solid ${CY}44`,
    borderRadius: 10,
    padding: 14,
    fontFamily: "'JetBrains Mono',monospace",
    color: "#DCEBF5",
    backdropFilter: "blur(10px)",
    boxShadow: `0 0 40px ${CY}18`,
  };

  const tabStyle = (t) => ({
    padding: "3px 8px",
    border: `1px solid ${tab === t ? CY : CY + "33"}`,
    borderRadius: 4,
    cursor: "pointer",
    background: tab === t ? CY + "22" : "transparent",
    color: tab === t ? CY : DIM,
    fontSize: 10,
    letterSpacing: 1,
  });

  return (
    <>
      <button
        style={BTN_STYLE}
        onClick={() => setOpen((o) => !o)}
        title="Reminders × Contact Nexus (REMCNT)"
      >
        ◈ REMCNT
        {unlinked > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 4, padding: "1px 5px", fontSize: 9 }}>
            {unlinked}
          </span>
        )}
      </button>

      {open && (
        <div style={PANEL}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>REMINDERS × CONTACT NEXUS</span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
            >✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              { label: "REMINDERS",       value: rows.length, color: CY },
              { label: "CONTACT-LINKED",  value: linked,      color: linked > 0 ? GRN : DIM },
              { label: "UNLINKED",        value: unlinked,    color: unlinked > 0 ? AMB : GRN },
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
              <span style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>CONTACT LINKAGE COVERAGE</span>
              <span style={{ color: pct >= 70 ? GRN : pct >= 40 ? AMB : RED, fontSize: 10, fontWeight: "bold" }}>{pct}%</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct >= 70 ? GRN : pct >= 40 ? AMB : RED, borderRadius: 2, transition: "width 0.4s" }} />
            </div>
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
            {["ALL", "CONTACT-LINKED", "UNLINKED"].map((t) => (
              <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search reminders…"
            style={{ width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.4)", border: `1px solid ${CY}33`, borderRadius: 5, color: "#DCEBF5", padding: "5px 8px", fontSize: 11, marginBottom: 8, outline: "none" }}
          />

          {/* list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 12 }}>No reminders match.</div>
            )}
            {visible.map((rem) => (
              <div
                key={rem.id}
                style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${rem.linked ? GRN : AMB}33`, borderRadius: 6, padding: "7px 9px", cursor: "pointer" }}
                onClick={() => setExpanded(expanded === rem.id ? null : rem.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ color: rem.linked ? GRN : AMB, fontSize: 10 }}>{rem.linked ? "●" : "○"}</span>
                  <span style={{ color: KIND_COLOR[rem.kind] || CY, fontSize: 9, border: `1px solid ${(KIND_COLOR[rem.kind] || CY)}44`, borderRadius: 3, padding: "1px 4px" }}>{rem.kind}</span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>{rem.content.slice(0, 60)}{rem.content.length > 60 ? "…" : ""}</span>
                  <span style={{ color: rem.linked ? GRN : DIM, fontSize: 9 }}>{rem.linked ? `${rem.contacts.length} contact${rem.contacts.length !== 1 ? "s" : ""}` : "UNLINKED"}</span>
                </div>

                {expanded === rem.id && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${CY}22`, paddingTop: 6 }}>
                    {rem.linked ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {rem.contacts.map((c) => (
                          <div key={c.id} style={{ background: "rgba(0,229,160,0.04)", border: `1px solid ${GRN}33`, borderRadius: 4, padding: "5px 7px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ color: CY, fontSize: 9, border: `1px solid ${CY}44`, borderRadius: 3, padding: "1px 4px" }}>CONTACT</span>
                              <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{c.name}{c.role ? ` — ${c.role}` : ""}{c.org ? ` (${c.org})` : ""}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>hits: {c.hits}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No contacts matched this reminder — unlinked intelligence item.</div>
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
