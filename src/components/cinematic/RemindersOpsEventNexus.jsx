/**
 * RemindersOpsEventNexus — F605
 * "JARVIS, reminders ops / ops reminders / remops / ops-linked reminders / reminder ops events"
 * Cross-references /reminders/list against /v1/ops/events.
 * OPS-LINKED reminders (≥1 ops-event keyword-matches) vs UNLINKED (no ops backing).
 * Coverage % tile; ALL/OPS-LINKED/UNLINKED filter tabs + search; click-to-expand matched events.
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

const REMOPS_RE =
  /\bremops\b|\breminders?.ops\b|\bops.?reminders?\b|\bops.?linked.?reminders?\b|\breminder.?ops.?events?\b|\breminders?.with.?ops\b|\breminder.?incident\b|\bops.?reminder.?coverage\b/i;

export function isRemopsQuery(text) {
  return REMOPS_RE.test(text || "");
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

function normaliseEvents(data) {
  if (!data) return [];
  const arr = Array.isArray(data)          ? data
    : Array.isArray(data?.events)          ? data.events
    : Array.isArray(data?.items)           ? data.items
    : Array.isArray(data?.results)         ? data.results
    : [];
  return arr.map((e, i) => ({
    id:       e.id       || `evt-${i}`,
    title:    e.title    || e.name      || e.message    || `Event ${i + 1}`,
    severity: (e.severity || e.level || "INFO").toString().toUpperCase(),
    source:   e.source   || e.service   || e.system     || "unknown",
    summary:  (e.summary || e.description || "").toString().slice(0, 150),
    ts:       e.timestamp || e.created_at || e.ts || null,
  }));
}

function crossRef(reminders, events) {
  return reminders.map((rem) => {
    const haystack = `${rem.content} ${(rem.tags || []).join(" ")}`;
    const matches = events
      .map((ev) => {
        const hits = overlap(haystack, `${ev.title} ${ev.summary} ${ev.source}`);
        return hits > 0 ? { ...ev, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 5);
    return { ...rem, events: matches, linked: matches.length > 0 };
  });
}

export async function buildRemopsScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [remRes, evtRes] = await Promise.all([
      fetch(`${base}/reminders/list`,  { headers: hdr }),
      fetch(`${base}/v1/ops/events`,   { headers: hdr }),
    ]);
    const [remData, evtData] = await Promise.all([remRes.json(), evtRes.json()]);
    const reminders = normaliseReminders(remData);
    const events    = normaliseEvents(evtData);
    const rows      = crossRef(reminders, events);
    const linked    = rows.filter((r) => r.linked).length;
    const unlinked  = rows.length - linked;
    const pct       = rows.length ? Math.round((linked / rows.length) * 100) : 0;
    if (!rows.length) return "No reminders found in the system, sir.";
    const topUnlinked = rows
      .filter((r) => !r.linked)
      .slice(0, 2)
      .map((r) => r.content.slice(0, 40))
      .join("; ");
    return (
      `${linked} of ${rows.length} reminders are ops-linked to known operational events (${pct}% coverage). ` +
      (unlinked > 0
        ? `${unlinked} reminder${unlinked !== 1 ? "s" : ""} have no matching ops event — uncontextualized notes: ${topUnlinked || "unknown"}.`
        : "All reminders are backed by at least one operational event.")
    );
  } catch {
    return "Unable to reach reminders or ops events endpoints, sir.";
  }
}

export default function RemindersOpsEventNexus() {
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
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [remRes, evtRes] = await Promise.all([
        fetch(`${base}/reminders/list`,  { headers: hdr }),
        fetch(`${base}/v1/ops/events`,   { headers: hdr }),
      ]);
      const [remData, evtData] = await Promise.all([remRes.json(), evtRes.json()]);
      setRows(crossRef(normaliseReminders(remData), normaliseEvents(evtData)));
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
    window.addEventListener("jarvis:remops-toggle", toggle);
    return () => window.removeEventListener("jarvis:remops-toggle", toggle);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try {
      const base    = apiBase();
      const linked   = rows.filter((r) => r.linked);
      const unlinked = rows.filter((r) => !r.linked);
      const resp = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message:
            `Assess reminder-to-ops-event linkage: ${rows.length} reminders total, ` +
            `${linked.length} are linked to known operational events, ` +
            `${unlinked.length} are unlinked with no associated ops event. ` +
            `Top unlinked: ${unlinked.slice(0, 3).map((r) => r.content.slice(0, 40)).join("; ") || "none"}. ` +
            "Give a 2-sentence operational-memory assessment with recommended action.",
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
      if (tab === "OPS-LINKED") return r.linked;
      if (tab === "UNLINKED")   return !r.linked;
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

  const SEV_COLOR = {
    CRITICAL: RED, WARNING: AMB, INFO: CY, DEBUG: DIM,
  };

  const BTN_LEFT = 85_600;
  const BTN_STYLE = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 8,
    zIndex: 158,
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
    zIndex: 158,
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
        title="Reminders × Ops Events Nexus (REMOPS)"
      >
        ◈ REMOPS
        {unlinked > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 4, padding: "1px 5px", fontSize: 9 }}>
            {unlinked}
          </span>
        )}
      </button>

      {open && (
        <div style={PANEL}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>REMINDERS × OPS EVENTS NEXUS</span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
            >✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              { label: "REMINDERS",  value: rows.length, color: CY },
              { label: "OPS-LINKED", value: linked,      color: linked > 0 ? GRN : DIM },
              { label: "UNLINKED",   value: unlinked,    color: unlinked > 0 ? AMB : GRN },
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
              <span style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>OPS COVERAGE</span>
              <span style={{ color: pct >= 70 ? GRN : pct >= 40 ? AMB : RED, fontSize: 10, fontWeight: "bold" }}>{pct}%</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct >= 70 ? GRN : pct >= 40 ? AMB : RED, borderRadius: 2, transition: "width 0.4s" }} />
            </div>
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
            {["ALL", "OPS-LINKED", "UNLINKED"].map((t) => (
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
                  <span style={{ color: rem.linked ? GRN : DIM, fontSize: 9 }}>
                    {rem.linked ? `${rem.events.length} event${rem.events.length !== 1 ? "s" : ""}` : "UNLINKED"}
                  </span>
                </div>

                {expanded === rem.id && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${CY}22`, paddingTop: 6 }}>
                    {rem.linked ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {rem.events.map((ev) => (
                          <div key={ev.id} style={{ background: "rgba(0,229,160,0.04)", border: `1px solid ${GRN}33`, borderRadius: 4, padding: "5px 7px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ color: SEV_COLOR[ev.severity] || CY, fontSize: 9, border: `1px solid ${(SEV_COLOR[ev.severity] || CY)}44`, borderRadius: 3, padding: "1px 4px" }}>{ev.severity}</span>
                              <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{ev.title}</span>
                              <span style={{ color: DIM, fontSize: 9, marginLeft: 4 }}>hits: {ev.hits}</span>
                            </div>
                            {ev.summary && (
                              <div style={{ color: DIM, fontSize: 9, marginTop: 3, lineHeight: 1.4 }}>{ev.summary.slice(0, 100)}{ev.summary.length > 100 ? "…" : ""}</div>
                            )}
                            <div style={{ color: DIM, fontSize: 9, marginTop: 2 }}>source: {ev.source}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No ops events matched this reminder — note has no operational grounding.</div>
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
