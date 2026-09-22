/**
 * LiveWorldContactCorrelator — F562
 * "JARVIS, live world contact / lwcnt / world contact / contact signal / world-mentioned contact"
 * Cross-references /functions/getLiveIntel + /entities/Contact.
 * Finds WORLD-MENTIONED contacts (≥1 live event keyword-matches) vs UNMENTIONED.
 * Coverage % tile; ALL/WORLD-MENTIONED/UNMENTIONED filter tabs + search; click-to-expand event detail.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 58_220;
const Z_INDEX  = 126;

const LWCNT_RE =
  /\blwcnt\b|\blive.?world.?contact\b|\bworld.?contact\b|\bcontact.?signal\b|\bworld.?mentioned.?contact\b|\bcontact.?world\b|\blive.?contact.?signal\b|\breal.?world.?contact\b|\bcontact.?activated\b|\bworld.?signaled.?contact\b/i;

export function isLwcntQuery(text) {
  return LWCNT_RE.test(text || "");
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

function normaliseLiveEvents(data) {
  if (!data) return [];
  const all = [];

  const quakes = Array.isArray(data.earthquakes) ? data.earthquakes : [];
  quakes.forEach((q, i) => {
    all.push({
      id: q.id || `quake-${i}`,
      kind: "SEISMIC",
      name: q.place || q.name || `Magnitude ${q.magnitude} quake`,
      description: `Mag ${q.magnitude ?? "?"} at ${q.place || "unknown location"}. ${q.type || ""}`,
      tags: ["seismic", "earthquake", "geologic", "disaster", q.place || ""].join(" "),
    });
  });

  const coins = Array.isArray(data.crypto) ? data.crypto
    : Array.isArray(data.coins) ? data.coins : [];
  coins.forEach((c, i) => {
    const sym = c.symbol || c.coin || c.currency || `COIN${i}`;
    const chg = c.change_pct ?? c.change ?? c.pct_change ?? null;
    all.push({
      id: `crypto-${sym}`,
      kind: "CRYPTO",
      name: `${sym} ${chg !== null ? (chg >= 0 ? `+${chg.toFixed(2)}%` : `${chg.toFixed(2)}%`) : ""}`.trim(),
      description: `Cryptocurrency ${sym}: price ${c.price ?? "?"} USD.${chg !== null ? ` Change: ${chg.toFixed(2)}%` : ""}`,
      tags: `crypto ${sym} ${sym.toLowerCase()} digital asset market finance`.trim(),
    });
  });

  const fx = Array.isArray(data.fx) ? data.fx
    : Array.isArray(data.currencies) ? data.currencies : [];
  fx.forEach((f, i) => {
    const pair = f.pair || f.symbol || f.currency_pair || `FX${i}`;
    const rate = f.rate ?? f.price ?? null;
    all.push({
      id: `fx-${pair}`,
      kind: "FX",
      name: `${pair} ${rate !== null ? `@ ${rate}` : ""}`.trim(),
      description: `FX pair ${pair}. Rate: ${rate ?? "?"}.`,
      tags: `currency forex fx ${pair} ${pair.toLowerCase()} monetary exchange finance`.trim(),
    });
  });

  return all;
}

function normaliseContacts(data) {
  if (!data) return [];
  const raw = data.contacts || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((c, i) => ({
    id:          c.id || `ct-${i}`,
    name:        (c.name || c.full_name || c.display_name || `Contact ${i + 1}`).trim(),
    role:        (c.role || c.title || c.job_title || "").toString(),
    organization: (c.organization || c.org || c.company || "").toString(),
    tags:        [
      ...(Array.isArray(c.tags) ? c.tags : []),
      c.role, c.title, c.organization, c.org, c.company,
    ].filter(Boolean).map((t) => String(t).toLowerCase()).join(" "),
  }));
}

function crossRef(contacts, events) {
  return contacts.map((ct) => {
    const haystack = `${ct.name} ${ct.role} ${ct.organization} ${ct.tags}`;
    const matches = events
      .map((ev) => ({
        ev,
        hits: overlap(haystack, `${ev.name} ${ev.description} ${ev.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...ct,
      mentioned: matches.length > 0,
      matches: matches.map(({ ev, hits }) => ({ ...ev, hits })),
    };
  });
}

// ─── buildLwcntScript (for JarvisBrain) ──────────────────────────────────────

export async function buildLwcntScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [liveRes, ctRes] = await Promise.all([
      fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
      fetch(`${base}/entities/Contact`,       { headers: hdr }),
    ]);
    const liveData = liveRes.ok ? await liveRes.json() : {};
    const ctData   = ctRes.ok  ? await ctRes.json()   : {};

    const events   = normaliseLiveEvents(liveData);
    const contacts = normaliseContacts(ctData);
    const crossed  = crossRef(contacts, events);

    const total     = crossed.length;
    const mentioned = crossed.filter((c) => c.mentioned).length;
    const silent    = total - mentioned;
    const coverage  = total > 0 ? Math.round((mentioned / total) * 100) : 0;
    const topNames  = crossed
      .filter((c) => c.mentioned)
      .slice(0, 2)
      .map((c) => c.name)
      .join(", ");

    const brief =
      `${coverage}% of ${total} contacts correlate with live world events. ` +
      `${mentioned} WORLD-MENTIONED, ${silent} UNMENTIONED.` +
      (topNames ? ` Flagged contacts: ${topNames}.` : "");

    const agentRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Live World × Contact Correlation: ${brief} Provide a 2-sentence operational assessment.`,
      }),
    });
    const agentData = agentRes.ok ? await agentRes.json() : {};
    const agentText = agentData.response || agentData.message || agentData.reply || "";

    return agentText ? `${brief}\n\n${agentText}` : brief;
  } catch (err) {
    return `Live World × Contact Correlator unavailable: ${err.message}`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────

const KIND_COLOR = { SEISMIC: "#FF6B35", CRYPTO: GRN, FX: CY };

export default function LiveWorldContactCorrelator() {
  const [open, setOpen]       = useState(false);
  const [contacts, setContacts] = useState([]);
  const [events, setEvents]   = useState([]);
  const [crossed, setCrossed] = useState([]);
  const [tab, setTab]         = useState("ALL");
  const [query, setQuery]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssess] = useState(false);
  const [brief, setBrief]     = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [liveRes, ctRes] = await Promise.all([
        fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
        fetch(`${base}/entities/Contact`,       { headers: hdr }),
      ]);
      const liveData = liveRes.ok ? await liveRes.json() : {};
      const ctData   = ctRes.ok  ? await ctRes.json()   : {};

      const evs = normaliseLiveEvents(liveData);
      const cts = normaliseContacts(ctData);
      setEvents(evs);
      setContacts(cts);
      setCrossed(crossRef(cts, evs));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => {
      if (!v) load();
      return !v;
    });
    window.addEventListener("jarvis:lwcnt-toggle", onToggle);
    return () => window.removeEventListener("jarvis:lwcnt-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssess(true);
    setBrief("");
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const total     = crossed.length;
      const mentioned = crossed.filter((c) => c.mentioned).length;
      const silent    = total - mentioned;
      const coverage  = total > 0 ? Math.round((mentioned / total) * 100) : 0;
      const prompt = `Live World × Contact: ${coverage}% world-signal coverage (${mentioned}/${total} mentioned, ${silent} unmentioned). Assess in 2 sentences.`;
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      const d = res.ok ? await res.json() : {};
      const text = d.response || d.message || d.reply || "Assessment complete.";
      setBrief(text);
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "onyx" }),
      });
    } catch (e) {
      setBrief(`Assessment error: ${e.message}`);
    } finally {
      setAssess(false);
    }
  }, [crossed]);

  const visible = crossed.filter((c) => {
    if (tab === "WORLD-MENTIONED" && !c.mentioned) return false;
    if (tab === "UNMENTIONED"     &&  c.mentioned) return false;
    if (query) {
      const q = query.toLowerCase();
      if (
        !c.name.toLowerCase().includes(q) &&
        !c.role.toLowerCase().includes(q) &&
        !c.organization.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const total      = crossed.length;
  const nMentioned = crossed.filter((c) => c.mentioned).length;
  const nSilent    = total - nMentioned;
  const coverage   = total > 0 ? Math.round((nMentioned / total) * 100) : 0;

  const btnStyle = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 8,
    zIndex: Z_INDEX,
    background: "rgba(0,0,0,0.85)",
    border: `1px solid ${CY}`,
    color: CY,
    fontFamily: "monospace",
    fontSize: 10,
    padding: "2px 7px",
    cursor: "pointer",
    borderRadius: 3,
    userSelect: "none",
    display: "flex",
    alignItems: "center",
    gap: 4,
  };

  const panelStyle = {
    position: "fixed",
    right: 18,
    bottom: 54,
    width: 460,
    maxHeight: "78vh",
    overflowY: "auto",
    background: "rgba(0,6,18,0.97)",
    border: `1px solid ${CY}44`,
    borderRadius: 8,
    padding: 16,
    zIndex: 9999,
    fontFamily: "monospace",
    color: CY,
    boxSizing: "border-box",
  };

  return (
    <>
      <button
        style={btnStyle}
        onClick={() => { setOpen((v) => { if (!v) load(); return !v; }); }}
        title="Live World × Contact Correlator"
      >
        ◈ LWCNT
        {nMentioned > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 8, padding: "0 4px", fontSize: 9 }}>
            {nMentioned}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: "bold", letterSpacing: 1 }}>LIVE WORLD × CONTACTS</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={load}
                style={{ background: "none", border: `1px solid ${CY}55`, color: CY, cursor: "pointer", padding: "2px 8px", borderRadius: 3, fontSize: 10 }}
                title="Refresh"
              >
                ↺
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {[
              { label: "COVERAGE",       value: `${coverage}%`, color: coverage > 60 ? GRN : coverage > 30 ? AMB : "#FF4466" },
              { label: "WORLD-MENTIONED", value: nMentioned,    color: AMB },
              { label: "UNMENTIONED",    value: nSilent,        color: DIM },
              { label: "LIVE EVENTS",    value: events.length,  color: CY },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  flex: 1, background: "rgba(41,231,255,0.05)", border: `1px solid ${color}33`,
                  borderRadius: 4, padding: "6px 8px", textAlign: "center",
                }}
              >
                <div style={{ fontSize: 16, fontWeight: "bold", color }}>{value}</div>
                <div style={{ fontSize: 8, color: DIM, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Assess */}
          <div style={{ marginBottom: 10 }}>
            <button
              onClick={assess}
              disabled={assessing || crossed.length === 0}
              style={{
                background: assessing ? "rgba(41,231,255,0.1)" : "rgba(41,231,255,0.15)",
                border: `1px solid ${CY}88`,
                color: CY, cursor: assessing ? "wait" : "pointer",
                padding: "4px 14px", borderRadius: 3, fontSize: 10, fontFamily: "monospace",
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, fontSize: 10, color: "#cde", lineHeight: 1.5, padding: "6px 8px", background: "rgba(41,231,255,0.05)", borderRadius: 3 }}>
                {brief}
              </div>
            )}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {["ALL", "WORLD-MENTIONED", "UNMENTIONED"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "none",
                  border: `1px solid ${tab === t ? CY : CY + "33"}`,
                  color: tab === t ? CY : DIM,
                  cursor: "pointer", padding: "2px 10px", borderRadius: 3,
                  fontSize: 10, fontFamily: "monospace",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contacts…"
            style={{
              width: "100%", background: "rgba(41,231,255,0.06)", border: `1px solid ${CY}33`,
              color: CY, padding: "4px 8px", borderRadius: 3, fontSize: 10,
              marginBottom: 8, boxSizing: "border-box", fontFamily: "monospace",
            }}
          />

          {/* Contact rows */}
          {loading ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>Loading…</div>
          ) : visible.length === 0 ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>No contacts match.</div>
          ) : (
            visible.map((ct) => (
              <div key={ct.id}>
                <div
                  onClick={() => setExpanded(expanded === ct.id ? null : ct.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 6px", marginBottom: 3, cursor: "pointer",
                    borderRadius: 3, background: "rgba(41,231,255,0.04)",
                    border: `1px solid ${ct.mentioned ? AMB + "55" : DIM + "22"}`,
                  }}
                >
                  <span style={{ flex: 1, fontSize: 10, color: ct.mentioned ? AMB : DIM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ct.name}
                  </span>
                  {ct.role && (
                    <span style={{ fontSize: 8, color: DIM, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ct.role}
                    </span>
                  )}
                  {ct.mentioned ? (
                    <span style={{ fontSize: 8, color: AMB }}>⬡ {ct.matches.length} ev</span>
                  ) : (
                    <span style={{ fontSize: 8, color: DIM }}>UNMENTIONED</span>
                  )}
                </div>

                {/* Expanded matched events */}
                {expanded === ct.id && ct.mentioned && (
                  <div style={{ marginLeft: 12, marginBottom: 6 }}>
                    {ct.organization && (
                      <div style={{ fontSize: 9, color: DIM, marginBottom: 4 }}>{ct.organization}</div>
                    )}
                    {ct.matches.map((ev) => (
                      <div
                        key={ev.id}
                        style={{
                          padding: "3px 6px", marginBottom: 2, borderRadius: 2,
                          background: "rgba(255,165,0,0.05)", border: `1px solid ${KIND_COLOR[ev.kind] || DIM}33`,
                          fontSize: 9,
                        }}
                      >
                        <span style={{ color: KIND_COLOR[ev.kind] || DIM, marginRight: 4 }}>[{ev.kind}]</span>
                        <span style={{ color: AMB }}>{ev.name}</span>
                        <span style={{ color: DIM, marginLeft: 6 }}>hits:{ev.hits}</span>
                      </div>
                    ))}
                  </div>
                )}

                {expanded === ct.id && !ct.mentioned && (
                  <div style={{ marginLeft: 12, marginBottom: 6, fontSize: 9, color: DIM }}>
                    No live world events correlate with this contact.
                    {ct.organization && <div style={{ marginTop: 2 }}>{ct.organization}</div>}
                  </div>
                )}
              </div>
            ))
          )}

          <div style={{ marginTop: 12, fontSize: 8, color: DIM, textAlign: "right" }}>
            AUTO-REFRESH {POLL_MS / 1000}s · /functions/getLiveIntel + /entities/Contact
          </div>
        </div>
      )}
    </>
  );
}
