/**
 * ContactOpsEventNexus — F530
 * "JARVIS, contact ops / ops contact / coevt / which contacts have ops events / contact incident"
 * Cross-references /entities/Contact + /v1/ops/events.
 * Finds INVOLVED contacts (≥1 ops-event keyword-matches) vs CLEAR (no ops-event backing).
 * Coverage % tile; ALL/INVOLVED/CLEAR filter tabs + search; click-to-expand matched events.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4444";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 42_740;
const Z_INDEX  = 108;

const COEVT_RE =
  /\bcoevt\b|\bcontact.?ops\b|\bops.?contact\b|\bwhich.?contacts?.?have.?ops\b|\bcontact.?incident\b|\bops.?involved.?contacts?\b|\bcontact.?event\b|\bops.?event.?contact\b|\bcontact.?operations\b/i;

export function isCoevtQuery(text) {
  return COEVT_RE.test(text || "");
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

function normaliseContacts(data) {
  if (!data) return [];
  const raw =
    data.contacts || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((c, i) => ({
    id:   c.id || `con-${i}`,
    name: c.name || c.full_name || c.display_name || `Contact ${i + 1}`,
    role: c.role || c.title || c.occupation || "",
    org:  c.organization || c.company || c.org || "",
    tags: Array.isArray(c.tags) ? c.tags.join(" ") : String(c.tags || ""),
    desc: c.description || c.bio || c.notes || c.summary || "",
  }));
}

function normaliseEvents(data) {
  if (!data) return [];
  const raw =
    data.events || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((ev, i) => ({
    id:       ev.id || `ev-${i}`,
    title:    ev.title || ev.name || ev.event_type || `Event ${i + 1}`,
    severity: (ev.severity || ev.level || "INFO").toUpperCase(),
    source:   ev.source || ev.service || ev.origin || "",
    desc:     ev.description || ev.message || ev.detail || ev.summary || "",
    ts:       ev.timestamp || ev.created_at || ev.time || "",
  }));
}

function crossRef(contacts, events) {
  return contacts.map((con) => {
    const haystack = `${con.name} ${con.role} ${con.org} ${con.desc} ${con.tags}`;
    const matches = events
      .map((ev) => ({
        ev,
        hits: overlap(haystack, `${ev.title} ${ev.desc} ${ev.source}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...con,
      involved: matches.length > 0,
      matches: matches.map(({ ev, hits }) => ({ ...ev, hits })),
    };
  });
}

function sevColour(sev) {
  if (sev === "CRITICAL") return RED;
  if (sev === "WARNING" || sev === "WARN") return AMB;
  return DIM;
}

// ─── buildCoevtScript (for JarvisBrain) ──────────────────────────────────────

export async function buildCoevtScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [conRes, evRes] = await Promise.all([
      fetch(`${base}/entities/Contact`,  { headers: hdr }),
      fetch(`${base}/v1/ops/events`,     { headers: hdr }),
    ]);
    const conData = conRes.ok ? await conRes.json() : {};
    const evData  = evRes.ok  ? await evRes.json()  : {};

    const contacts = normaliseContacts(conData);
    const events   = normaliseEvents(evData);
    const crossed  = crossRef(contacts, events);

    const total    = crossed.length;
    const involved = crossed.filter((c) => c.involved).length;
    const clear    = total - involved;
    const coverage = total > 0 ? Math.round((involved / total) * 100) : 0;
    const topInvolved = crossed
      .filter((c) => c.involved)
      .slice(0, 2)
      .map((c) => c.name)
      .join(", ");

    const prompt = `JARVIS contact-ops-event nexus: ${total} contacts cross-referenced against ${events.length} operational events. ${involved} contacts are correlated with active ops events (${coverage}% involvement rate). ${clear} contacts show no operational event linkage. Top operationally-involved contacts: ${topInvolved || "none"}. Provide a 2-sentence operational contact assessment.`;
    const chatRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({ message: prompt }),
    });
    const chatData = chatRes.ok ? await chatRes.json() : {};
    const brief =
      chatData.response || chatData.message || chatData.content ||
      `${involved} of ${total} contacts are correlated with operational events (${coverage}% involvement). ${clear} contacts show no ops-event linkage — potential blind spots in incident coverage.`;

    window.dispatchEvent(
      new CustomEvent("jarvis:speak-dossier", { detail: { text: brief } })
    );
    return brief;
  } catch (err) {
    return `Contact-ops-event nexus error: ${err.message}`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function ContactOpsEventNexus() {
  const [open, setOpen]           = useState(false);
  const [crossed, setCrossed]     = useState([]);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]         = useState("");
  const [loading, setLoading]     = useState(false);
  const timerRef = useRef(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [conRes, evRes] = await Promise.all([
        fetch(`${base}/entities/Contact`,  { headers: hdr }),
        fetch(`${base}/v1/ops/events`,     { headers: hdr }),
      ]);
      const conData = conRes.ok ? await conRes.json() : {};
      const evData  = evRes.ok  ? await evRes.json()  : {};
      const contacts = normaliseContacts(conData);
      const events   = normaliseEvents(evData);
      setCrossed(crossRef(contacts, events));
    } catch (_) {
      /* network unavailable */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:coevt-toggle", onToggle);
    return () => window.removeEventListener("jarvis:coevt-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetch_();
    timerRef.current = setInterval(fetch_, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetch_]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try {
      const result = await buildCoevtScript();
      setBrief(result);
    } finally {
      setAssessing(false);
    }
  }, []);

  const involved = crossed.filter((c) => c.involved);
  const clear    = crossed.filter((c) => !c.involved);
  const coverage = crossed.length > 0
    ? Math.round((involved.length / crossed.length) * 100)
    : 0;

  const visible = crossed
    .filter((c) => {
      if (tab === "INVOLVED") return c.involved;
      if (tab === "CLEAR")    return !c.involved;
      return true;
    })
    .filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.role.toLowerCase().includes(q) ||
        c.org.toLowerCase().includes(q)
      );
    });

  const btnStyle = {
    position: "fixed",
    bottom: 8,
    left: BTN_LEFT,
    zIndex: Z_INDEX,
    background: "rgba(0,20,40,0.85)",
    border: `1px solid ${!open ? DIM : CY}`,
    color: !open ? DIM : CY,
    fontFamily: "monospace",
    fontSize: 10,
    padding: "3px 7px",
    cursor: "pointer",
    borderRadius: 3,
    whiteSpace: "nowrap",
  };

  if (!open) {
    return (
      <button
        style={btnStyle}
        onClick={() => setOpen(true)}
        title="Contact × Ops Events Nexus (COEVT)"
      >
        ◈ COEVT{involved.length > 0 && (
          <span style={{ color: AMB, marginLeft: 4 }}>{involved.length}</span>
        )}
      </button>
    );
  }

  const panel = {
    position: "fixed",
    bottom: 36,
    left: Math.min(BTN_LEFT, window.innerWidth - 480),
    width: 460,
    maxHeight: "75vh",
    overflowY: "auto",
    zIndex: Z_INDEX + 1,
    background: "rgba(0,10,25,0.97)",
    border: `1px solid ${CY}`,
    borderRadius: 6,
    fontFamily: "monospace",
    fontSize: 11,
    color: CY,
    padding: 14,
    boxShadow: `0 0 24px ${CY}44`,
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(false)}>
        ◈ COEVT ✕
      </button>

      <div style={panel}>
        <div style={{ fontSize: 13, fontWeight: "bold", marginBottom: 10 }}>
          ◈ CONTACT × OPS EVENTS NEXUS
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {[
            ["CONTACTS",  crossed.length,   CY],
            ["INVOLVED",  involved.length,  AMB],
            ["CLEAR",     clear.length,     GRN],
            ["COVERAGE",  `${coverage}%`,   coverage > 40 ? AMB : GRN],
          ].map(([label, val, col]) => (
            <div
              key={label}
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${col}55`,
                borderRadius: 4,
                padding: "4px 6px",
                textAlign: "center",
              }}
            >
              <div style={{ color: col, fontSize: 14, fontWeight: "bold" }}>{val}</div>
              <div style={{ color: DIM, fontSize: 9 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {["ALL", "INVOLVED", "CLEAR"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? CY : "transparent",
                color: tab === t ? "#000" : DIM,
                border: `1px solid ${tab === t ? CY : DIM}`,
                borderRadius: 3,
                padding: "2px 8px",
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* search */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search contacts…"
          style={{
            width: "100%",
            background: "rgba(255,255,255,0.05)",
            border: `1px solid ${DIM}`,
            borderRadius: 3,
            color: CY,
            padding: "3px 6px",
            fontSize: 10,
            marginBottom: 8,
            boxSizing: "border-box",
          }}
        />

        {/* list */}
        {loading && !crossed.length ? (
          <div style={{ color: DIM, textAlign: "center", padding: 20 }}>FETCHING…</div>
        ) : visible.length === 0 ? (
          <div style={{ color: DIM, padding: 12 }}>No contacts match.</div>
        ) : (
          visible.map((con) => (
            <div
              key={con.id}
              style={{
                borderBottom: "1px solid rgba(41,231,255,0.1)",
                paddingBottom: 8,
                marginBottom: 8,
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                onClick={() => setExpanded(expanded === con.id ? null : con.id)}
              >
                <span
                  style={{
                    fontSize: 9,
                    padding: "1px 5px",
                    borderRadius: 3,
                    background: con.involved ? `${AMB}22` : `${GRN}22`,
                    color: con.involved ? AMB : GRN,
                    border: `1px solid ${con.involved ? AMB : GRN}55`,
                    flexShrink: 0,
                  }}
                >
                  {con.involved ? "INVOLVED" : "CLEAR"}
                </span>
                <span style={{ color: con.involved ? CY : DIM, flexGrow: 1 }}>{con.name}</span>
                {con.role && (
                  <span
                    style={{
                      fontSize: 9,
                      padding: "1px 4px",
                      borderRadius: 2,
                      background: `${CY}22`,
                      color: DIM,
                      border: `1px solid ${CY}22`,
                      flexShrink: 0,
                      maxWidth: 100,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {con.role}
                  </span>
                )}
                <span style={{ color: DIM }}>{expanded === con.id ? "▲" : "▼"}</span>
              </div>

              {expanded === con.id && (
                <div style={{ marginTop: 6, paddingLeft: 8 }}>
                  {con.org && (
                    <div style={{ color: DIM, fontSize: 10, marginBottom: 4 }}>
                      org: {con.org}
                    </div>
                  )}
                  {con.matches.length === 0 ? (
                    <div style={{ color: GRN, fontSize: 10 }}>No ops events correlated.</div>
                  ) : (
                    con.matches.map((ev) => (
                      <div
                        key={ev.id}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 6,
                          marginBottom: 4,
                          paddingLeft: 4,
                          borderLeft: `2px solid ${sevColour(ev.severity)}55`,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 8,
                            padding: "1px 4px",
                            borderRadius: 2,
                            background: `${sevColour(ev.severity)}22`,
                            color: sevColour(ev.severity),
                            border: `1px solid ${sevColour(ev.severity)}44`,
                            flexShrink: 0,
                            marginTop: 1,
                          }}
                        >
                          {ev.severity}
                        </span>
                        <div style={{ flexGrow: 1 }}>
                          <div style={{ color: CY, fontSize: 10 }}>{ev.title}</div>
                          {ev.source && (
                            <div style={{ color: DIM, fontSize: 9 }}>
                              source: {ev.source}
                            </div>
                          )}
                        </div>
                        <span style={{ color: DIM, fontSize: 9, flexShrink: 0 }}>{ev.hits}↑</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {/* assess */}
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            marginTop: 8,
            width: "100%",
            background: assessing ? "transparent" : `${GRN}22`,
            border: `1px solid ${GRN}`,
            color: GRN,
            borderRadius: 3,
            padding: "4px 0",
            cursor: assessing ? "not-allowed" : "pointer",
            fontSize: 10,
          }}
        >
          {assessing ? "ASSESSING…" : "▶ ASSESS"}
        </button>

        {brief && (
          <div
            style={{
              marginTop: 8,
              padding: 8,
              background: "rgba(0,229,160,0.06)",
              border: `1px solid ${GRN}44`,
              borderRadius: 4,
              color: GRN,
              fontSize: 10,
              lineHeight: 1.5,
            }}
          >
            {brief}
          </div>
        )}
      </div>
    </>
  );
}
