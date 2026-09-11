/**
 * RemindersInvestigationNexus — F596
 * "JARVIS, reminders investigation / reminv / case reminders / orphaned reminders"
 * Cross-references /reminders/list against /v1/investigations.
 * Identifies CASE-LINKED reminders (keyword-match ≥1 investigation) vs ORPHANED
 * (no investigation backing — potential intelligence gap or stale note).
 * Coverage % tile; ALL/CASE-LINKED/ORPHANED filter tabs + search;
 * click-to-expand matched investigation detail (status/lead/summary/hits).
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

const REMINV_RE =
  /\breminv\b|\breminders?.?investigation\b|\binvestigation.?reminder\b|\bcase.?reminder\b|\breminder.?case\b|\borphaned.?reminder\b|\blinked.?reminder\b|\breminder.?with.?case\b|\breminder.?linked\b|\bunlinked.?reminder\b|\breminders?.?intel\b|\binvestigation.?note\b/i;

export function isReminvQuery(text) {
  return REMINV_RE.test(text || "");
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

const STATUS_ORDER = { OPEN: 0, ACTIVE: 1, ESCALATED: 2, CLOSED: 3 };

function normaliseReminders(data) {
  if (!data) return [];
  const raw =
    data.reminders || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((r, i) => ({
    id:      r.id || `rem-${i}`,
    title:   r.title || r.content || r.note || r.text || `Reminder ${i + 1}`,
    kind:    (r.kind || r.type || r.category || "reminder").toLowerCase(),
    status:  (r.status || "pending").toLowerCase(),
    body:    r.body || r.content || r.note || r.description || null,
    tags:    r.tags || [],
    due:     r.due_at || r.due || r.reminder_at || null,
  }));
}

function normaliseInvestigations(data) {
  if (!data) return [];
  const raw =
    data.investigations || data.cases || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((inv, i) => ({
    id:      inv.id || `inv-${i}`,
    title:   inv.title || inv.name || inv.case_name || `Case ${i + 1}`,
    status:  (inv.status || "OPEN").toUpperCase(),
    lead:    inv.lead || inv.assignee || inv.owner || null,
    summary: inv.summary || inv.description || inv.overview || null,
    tags:    inv.tags || [],
  }));
}

function crossRef(reminders, investigations) {
  return reminders.map((rem) => {
    const haystack = `${rem.title} ${rem.body || ""} ${(rem.tags || []).join(" ")}`;
    const matches = investigations
      .map((inv) => {
        const hits = overlap(
          haystack,
          `${inv.title} ${inv.summary || ""} ${(inv.tags || []).join(" ")}`
        );
        return hits > 0 ? { ...inv, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 4);
    return { ...rem, investigations: matches, linked: matches.length > 0 };
  });
}

export async function buildReminvScript() {
  try {
    const base = apiBase();
    const [remRes, invRes] = await Promise.all([
      fetch(`${base}/reminders/list`,     { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/v1/investigations`,  { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const [remData, invData] = await Promise.all([remRes.json(), invRes.json()]);
    const reminders      = normaliseReminders(remData);
    const investigations = normaliseInvestigations(invData);
    const rows    = crossRef(reminders, investigations);
    const linked  = rows.filter((r) => r.linked).length;
    const orphaned = rows.length - linked;
    const pct     = rows.length ? Math.round((linked / rows.length) * 100) : 0;
    if (!rows.length) return "No reminders found in the system, sir.";
    const topOrphaned = rows.filter((r) => !r.linked).slice(0, 2).map((r) => r.title);
    return (
      `${linked} of ${rows.length} reminders are case-linked to active investigations ` +
      `(${pct}% operational coverage). ` +
      (orphaned > 0
        ? `${orphaned} reminder${orphaned !== 1 ? "s" : ""} are orphaned with no matching investigation — ` +
          `potential stale notes: ${topOrphaned.join(", ")}.`
        : "All reminders are linked to open investigations, sir.")
    );
  } catch {
    return "Unable to reach reminders or investigations endpoints, sir.";
  }
}

export default function RemindersInvestigationNexus() {
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
      const [remRes, invRes] = await Promise.all([
        fetch(`${base}/reminders/list`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/v1/investigations`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const [remData, invData] = await Promise.all([remRes.json(), invRes.json()]);
      setRows(crossRef(normaliseReminders(remData), normaliseInvestigations(invData)));
    } catch {
      /* network errors are non-fatal */
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
    window.addEventListener("jarvis:reminv-toggle", toggle);
    return () => window.removeEventListener("jarvis:reminv-toggle", toggle);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const linked   = rows.filter((r) => r.linked);
      const orphaned = rows.filter((r) => !r.linked);
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message:
            `Assess operational reminder coverage: ${rows.length} total reminders, ` +
            `${linked.length} are case-linked to active investigations, ` +
            `${orphaned.length} are orphaned with no matching case. ` +
            `Top orphaned notes: ${orphaned.slice(0, 3).map((r) => r.title).join(", ") || "none"}. ` +
            "Give a 2-sentence operational assessment and recommended action.",
        }),
      });
      const d = await r.json();
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
  const orphaned = rows.length - linked;
  const pct      = rows.length ? Math.round((linked / rows.length) * 100) : 0;

  const visible = rows
    .filter((r) => {
      if (tab === "CASE-LINKED") return r.linked;
      if (tab === "ORPHANED")    return !r.linked;
      return true;
    })
    .filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        r.title.toLowerCase().includes(q) ||
        (r.body || "").toLowerCase().includes(q) ||
        r.kind.includes(q) ||
        r.status.includes(q)
      );
    });

  const KIND_COLOR = {
    note: GRN, task: CY, alert: RED, reminder: AMB,
    intelligence: "#BB88FF", brief: "#FF88CC",
  };

  const STATUS_COLOR = {
    OPEN: CY, ACTIVE: GRN, ESCALATED: RED, CLOSED: DIM,
  };

  const BTN_LEFT = 78_000;

  const BTN_STYLE = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 8,
    zIndex: 149,
    padding: "4px 10px",
    background: "rgba(5,8,13,0.82)",
    border: `1px solid ${orphaned > 0 ? AMB : CY}55`,
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
    zIndex: 149,
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
      <button style={BTN_STYLE} onClick={() => setOpen((o) => !o)} title="Reminders × Investigation Nexus">
        ◈ REMINV
        {orphaned > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 4, padding: "1px 5px", fontSize: 9 }}>
            {orphaned}
          </span>
        )}
      </button>

      {open && (
        <div style={PANEL}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>REMINDERS × INVESTIGATIONS</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              { label: "REMINDERS",   value: rows.length, color: CY },
              { label: "CASE-LINKED", value: linked,      color: linked > 0 ? GRN : DIM },
              { label: "ORPHANED",    value: orphaned,    color: orphaned > 0 ? AMB : GRN },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${color}33`, borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
                <div style={{ color, fontSize: 16, fontWeight: "bold" }}>{loading ? "…" : value}</div>
                <div style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* coverage bar */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>CASE COVERAGE</span>
              <span style={{ color: pct >= 70 ? GRN : pct >= 40 ? AMB : RED, fontSize: 10, fontWeight: "bold" }}>{pct}%</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct >= 70 ? GRN : pct >= 40 ? AMB : RED, borderRadius: 2, transition: "width 0.4s" }} />
            </div>
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
            {["ALL", "CASE-LINKED", "ORPHANED"].map((t) => (
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
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>{rem.title}</span>
                  <span style={{ color: rem.linked ? GRN : DIM, fontSize: 9 }}>
                    {rem.linked ? `${rem.investigations.length} case${rem.investigations.length !== 1 ? "s" : ""}` : "ORPHANED"}
                  </span>
                </div>
                {rem.body && (
                  <div style={{ color: DIM, fontSize: 9 }}>{rem.body.slice(0, 70)}{rem.body.length > 70 ? "…" : ""}</div>
                )}
                {rem.due && (
                  <div style={{ color: DIM, fontSize: 9, marginTop: 2 }}>due: {rem.due}</div>
                )}

                {expanded === rem.id && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${CY}22`, paddingTop: 6 }}>
                    {rem.linked ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {rem.investigations.map((inv) => (
                          <div key={inv.id} style={{ background: "rgba(0,229,160,0.04)", border: `1px solid ${GRN}33`, borderRadius: 4, padding: "5px 7px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ color: STATUS_COLOR[inv.status] || CY, fontSize: 9, border: `1px solid ${(STATUS_COLOR[inv.status] || CY)}44`, borderRadius: 3, padding: "1px 4px" }}>{inv.status}</span>
                              <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{inv.title}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>hits: {inv.hits}</span>
                            </div>
                            {inv.lead && (
                              <div style={{ color: DIM, fontSize: 9, marginTop: 2 }}>lead: {inv.lead}</div>
                            )}
                            {inv.summary && (
                              <div style={{ color: DIM, fontSize: 9, marginTop: 2 }}>{inv.summary.slice(0, 80)}{inv.summary.length > 80 ? "…" : ""}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No investigations matched this reminder — orphaned operational note.</div>
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
