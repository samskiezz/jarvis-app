/**
 * F37 — Contact × Live Intel Exposure Monitor (CXLINTEL)
 *
 * Parallel-fetches /entities/Contact (people/organisations in JARVIS) and
 * /functions/getLiveIntel (earthquakes + crypto + FX), then keyword-correlates
 * each contact's name / organisation / location / tags against live world events
 * to surface:
 *
 *   EXPOSED — at least one live world event aligns with this contact's domain
 *   CLEAR   — no current live-intel overlap for this contact
 *
 * Stat tiles: contacts / live events / exposed / clear
 * Filter tabs: ALL | EXPOSED | CLEAR + text search
 * Expand any contact → matched live events with type badge (SEISMIC/CRYPTO/FX)
 *   + relevance score bar.
 * Red badge on exposed count (contacts with live world-event overlap).
 * ▶ ASSESS: 2-sentence contact-exposure brief via /v1/jarvis/agent/chat +
 *   jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ CXLINTEL  at bottom:8 left:56760, zIndex:110.
 * Event:   jarvis:cxlintel-toggle
 * Voice:   "contact intel / contact exposure / who is affected / cxlintel /
 *           contact world / people exposed / contacts affected"
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 56760;
const POLL_MS  = 60_000;
const RED      = "#FF4444";
const CYAN     = "#29E7FF";
const GREEN    = "#34D399";
const AMBER    = "#F59E0B";
const VIOLET   = "#A78BFA";
const SLATE    = "#6E8AA0";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const CXLINTEL_RE =
  /\b(contact\s+intel|contact\s+exposure|who\s+is\s+(affected|exposed)|cxlintel|contact\s+world|people\s+exposed|contacts?\s+affected|contact\s+live[\s-]intel|which\s+contacts|contact\s+events?|contact\s+world\s+events?)\b/i;

export function isCxlintelQuery(q) { return CXLINTEL_RE.test(q); }

export async function buildCxlintelScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [ctRes, intelRes] = await Promise.all([
      fetch(`${base}/entities/Contact`,        { headers: hdr }),
      fetch(`${base}/functions/getLiveIntel`,  { headers: hdr }),
    ]);
    const contacts = normaliseContacts(await ctRes.json());
    const events   = normaliseEvents(await intelRes.json());

    const exposed = contacts.filter(
      (c) => events.some((e) => relevance(c, e) > 0)
    ).length;
    const clear = contacts.length - exposed;

    const seismic = events.filter((e) => e.type === "SEISMIC").length;
    const crypto  = events.filter((e) => e.type === "CRYPTO").length;
    const fx      = events.filter((e) => e.type === "FX").length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS contact exposure analysis: ${contacts.length} contacts cross-referenced ` +
          `against ${events.length} live world events ` +
          `(${seismic} seismic, ${crypto} crypto, ${fx} FX). ` +
          `${exposed} contacts show live-world-event exposure; ${clear} contacts are clear. ` +
          `Provide a 2-sentence contact-exposure brief — formal British butler tone, ` +
          `first person, highlight which contact domains are currently touched by live world events.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Contact live-intel exposure assessment complete, sir.").trim();
  } catch {
    return "Contact live-intel exposure assessment unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseContacts(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.contacts)         ? raw.contacts
    : Array.isArray(raw?.items)            ? raw.items
    : Array.isArray(raw?.data)             ? raw.data
    : Array.isArray(raw?.results)          ? raw.results
    : [];
  return arr.map((c, i) => ({
    id:       c.id            || c.contact_id    || String(i),
    name:     c.name          || c.full_name     || c.title   || `Contact ${i + 1}`,
    org:      c.organisation  || c.organization  || c.company || c.employer || "",
    location: c.location      || c.country       || c.region  || c.city     || "",
    role:     c.role          || c.position      || c.type    || "",
    tags:     Array.isArray(c.tags) ? c.tags.join(" ") : (c.tags || ""),
    desc:     (c.description  || c.notes || c.bio || c.summary || "").toString().slice(0, 300),
  }));
}

function normaliseEvents(raw) {
  const quakes = Array.isArray(raw?.earthquakes) ? raw.earthquakes : [];
  const crypto = Array.isArray(raw?.crypto)      ? raw.crypto      : [];
  const fx     = Array.isArray(raw?.fx)          ? raw.fx          :
                 Array.isArray(raw?.forex)        ? raw.forex       : [];
  const out = [];

  quakes.forEach((q, i) => {
    const mag   = q.magnitude ?? q.mag ?? q.properties?.mag ?? "";
    const place = q.place ?? q.location ?? q.properties?.place ?? "";
    const title = q.title ?? q.properties?.title ?? `M${mag} ${place}`;
    out.push({
      id:    `quake-${i}`,
      type:  "SEISMIC",
      title: String(title).slice(0, 120),
      body:  `magnitude:${mag} region:${String(place)} earthquake seismic disaster emergency crisis geophysics geology relief response monitoring geospatial ${String(place)}`.slice(0, 300),
      col:   RED,
    });
  });

  crypto.forEach((c, i) => {
    const sym    = c.symbol ?? c.name ?? `CRYPTO${i}`;
    const change = c.change_24h ?? c.change ?? c.pct_change ?? "";
    out.push({
      id:    `crypto-${i}`,
      type:  "CRYPTO",
      title: `${sym}${change ? " " + (Number(change) >= 0 ? "+" : "") + Number(change).toFixed(2) + "%" : ""}`.trim(),
      body:  `asset:${sym} cryptocurrency blockchain digital-asset defi token trading investment market finance portfolio risk ${sym}`.slice(0, 300),
      col:   CYAN,
    });
  });

  fx.forEach((f, i) => {
    const pair = f.pair ?? f.symbol ?? f.name ?? `FX${i}`;
    const rate  = f.rate ?? f.price ?? f.value ?? "";
    out.push({
      id:    `fx-${i}`,
      type:  "FX",
      title: `${pair}${rate ? " @ " + Number(rate).toFixed(4) : ""}`,
      body:  `currency:${pair} forex exchange-rate international trade monetary policy macroeconomics finance economics ${pair}`.slice(0, 300),
      col:   VIOLET,
    });
  });

  return out;
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"'%+]+/)
    .filter((w) => w.length >= 3);
}

function relevance(contact, event) {
  const cw = keywords(
    `${contact.name} ${contact.org} ${contact.location} ${contact.role} ${contact.tags} ${contact.desc}`
  );
  const ew = keywords(`${event.title} ${event.body}`);
  return cw.filter((w) => ew.some((p) => p.includes(w) || w.includes(p))).length;
}

function buildLinked(contacts, events) {
  return contacts.map((c) => {
    const matched = events
      .map((e) => ({ ...e, score: relevance(c, e) }))
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score);
    const hasSeismic = matched.some((e) => e.type === "SEISMIC");
    return { ...c, events: matched, exposed: matched.length > 0, hasSeismic };
  });
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "EXPOSED", "CLEAR"];

export default function ContactLiveIntelExposure() {
  const [open,      setOpen]      = useState(false);
  const [contacts,  setContacts]  = useState([]);
  const [events,    setEvents]    = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [ctRes, intelRes] = await Promise.all([
        fetch(`${base}/entities/Contact`,        { headers: hdr }),
        fetch(`${base}/functions/getLiveIntel`,  { headers: hdr }),
      ]);
      if (ctRes.ok)    setContacts(normaliseContacts(await ctRes.json()));
      if (intelRes.ok) setEvents(normaliseEvents(await intelRes.json()));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jarvis:cxlintel-toggle", handler);
    return () => window.removeEventListener("jarvis:cxlintel-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const linked  = buildLinked(contacts, events);
  const exposed = linked.filter((c) => c.exposed);
  const clear   = linked.filter((c) => !c.exposed);
  const seismicExposed = exposed.filter((c) => c.hasSeismic).length;

  const visible = linked
    .filter((c) => {
      if (filter === "EXPOSED") return c.exposed;
      if (filter === "CLEAR")   return !c.exposed;
      return true;
    })
    .filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        c.name.toLowerCase().includes(q)     ||
        c.org.toLowerCase().includes(q)      ||
        c.location.toLowerCase().includes(q) ||
        c.role.toLowerCase().includes(q)     ||
        c.tags.toLowerCase().includes(q)
      );
    });

  const assess = async () => {
    setAssessing(true);
    try {
      const script = await buildCxlintelScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } finally {
      setAssessing(false);
    }
  };

  const badgeCount = exposed.length;
  const badgeColor = seismicExposed > 0 ? RED : AMBER;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 110,
          background: badgeCount > 0
            ? "rgba(255,68,68,0.15)"
            : "rgba(41,231,255,0.10)",
          border: `1px solid ${badgeCount > 0 ? badgeColor : CYAN}`,
          color: badgeCount > 0 ? badgeColor : CYAN,
          fontSize: 10,
          padding: "3px 8px",
          borderRadius: 4,
          cursor: "pointer",
          letterSpacing: "0.06em",
          fontFamily: "monospace",
          whiteSpace: "nowrap",
        }}
        title="Contact × Live Intel Exposure Monitor"
      >
        ◈ CXLINTEL
        {badgeCount > 0 && (
          <span
            style={{
              marginLeft: 5,
              background: badgeColor,
              color: "#000",
              borderRadius: 9,
              padding: "0 5px",
              fontSize: 9,
              fontWeight: 700,
            }}
          >
            {badgeCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 36,
        left: Math.min(BTN_LEFT, window.innerWidth - 560),
        width: 530,
        maxHeight: "78vh",
        overflowY: "auto",
        background: "rgba(8,14,24,0.97)",
        border: `1px solid ${badgeCount > 0 ? badgeColor : CYAN}`,
        borderRadius: 10,
        zIndex: 9000,
        padding: "14px 16px",
        fontFamily: "monospace",
        color: CYAN,
        boxShadow: "0 0 32px rgba(255,68,68,0.10)",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.08em" }}>
          ◈ CONTACT × LIVE INTEL EXPOSURE
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={assess}
            disabled={assessing || contacts.length === 0}
            style={{
              background: "rgba(255,68,68,0.12)",
              border: `1px solid ${RED}`,
              color: RED,
              fontSize: 10,
              padding: "3px 9px",
              borderRadius: 4,
              cursor: "pointer",
              fontFamily: "monospace",
            }}
          >
            {assessing ? "ASSESSING…" : "▶ ASSESS"}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "transparent",
              border: "none",
              color: SLATE,
              fontSize: 14,
              cursor: "pointer",
              padding: "0 4px",
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* stat tiles */}
      {(() => {
        const tiles = [
          { label: "CONTACTS",    value: linked.length,   col: CYAN  },
          { label: "LIVE EVENTS", value: events.length,   col: SLATE },
          { label: "EXPOSED",     value: exposed.length,  col: exposed.length > 0 ? badgeColor : GREEN },
          { label: "CLEAR",       value: clear.length,    col: GREEN },
        ];
        return (
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {tiles.map((t) => (
              <div
                key={t.label}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: 6,
                  padding: "6px 8px",
                  textAlign: "center",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 700, color: t.col }}>{t.value}</div>
                <div style={{ fontSize: 9, color: SLATE, marginTop: 2 }}>{t.label}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* last fetch */}
      {lastFetch && (
        <div style={{ fontSize: 9, color: SLATE, marginBottom: 8 }}>
          Last updated: {lastFetch.toLocaleTimeString()} · auto-refresh 60 s
        </div>
      )}

      {/* filter tabs + search */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              background: filter === t ? "rgba(255,68,68,0.15)" : "transparent",
              border: `1px solid ${filter === t ? RED : "rgba(255,255,255,0.1)"}`,
              color: filter === t ? RED : SLATE,
              fontSize: 10,
              padding: "3px 9px",
              borderRadius: 4,
              cursor: "pointer",
              fontFamily: "monospace",
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search contacts…"
          style={{
            marginLeft: "auto",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: CYAN,
            fontSize: 10,
            padding: "3px 8px",
            borderRadius: 4,
            fontFamily: "monospace",
            outline: "none",
            width: 130,
          }}
        />
      </div>

      {/* event type legend */}
      <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
        {[["SEISMIC", RED], ["CRYPTO", CYAN], ["FX", VIOLET]].map(([label, col]) => (
          <span key={label} style={{ fontSize: 9, color: col }}>
            ■ {label} ({events.filter((e) => e.type === label).length})
          </span>
        ))}
      </div>

      {/* loading */}
      {loading && <div style={{ fontSize: 11, color: SLATE, marginBottom: 8 }}>Loading…</div>}

      {/* empty state */}
      {!loading && visible.length === 0 && (
        <div style={{ fontSize: 11, color: SLATE }}>No contacts match the current filter.</div>
      )}

      {/* contact list */}
      {visible.map((contact) => (
        <div
          key={contact.id}
          style={{
            marginBottom: 6,
            background: contact.exposed
              ? contact.hasSeismic ? "rgba(255,68,68,0.07)" : "rgba(245,158,11,0.06)"
              : "rgba(255,255,255,0.03)",
            border: `1px solid ${
              contact.exposed
                ? contact.hasSeismic ? "rgba(255,68,68,0.3)" : "rgba(245,158,11,0.25)"
                : "rgba(255,255,255,0.07)"
            }`,
            borderRadius: 6,
            padding: "7px 10px",
          }}
        >
          <div
            style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", cursor: "pointer" }}
            onClick={() => setExpanded(expanded === contact.id ? null : contact.id)}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  fontSize: 11,
                  color: contact.exposed
                    ? contact.hasSeismic ? RED : AMBER
                    : CYAN,
                  wordBreak: "break-word",
                }}
              >
                {contact.name}
              </span>
              {contact.org && (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 9,
                    padding: "1px 5px",
                    borderRadius: 3,
                    background: "rgba(110,138,160,0.15)",
                    color: SLATE,
                    border: "1px solid rgba(110,138,160,0.3)",
                    verticalAlign: "middle",
                  }}
                >
                  {contact.org.slice(0, 24)}
                </span>
              )}
              {contact.location && (
                <span
                  style={{
                    marginLeft: 4,
                    fontSize: 9,
                    color: SLATE,
                    verticalAlign: "middle",
                  }}
                >
                  📍 {contact.location.slice(0, 20)}
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: 8 }}>
              <span
                style={{
                  fontSize: 9,
                  padding: "1px 6px",
                  borderRadius: 3,
                  background: contact.exposed
                    ? contact.hasSeismic ? `${RED}22` : `${AMBER}22`
                    : `${GREEN}22`,
                  color: contact.exposed
                    ? contact.hasSeismic ? RED : AMBER
                    : GREEN,
                  border: `1px solid ${
                    contact.exposed
                      ? contact.hasSeismic ? `${RED}44` : `${AMBER}44`
                      : `${GREEN}44`
                  }`,
                  fontWeight: 700,
                }}
              >
                {contact.exposed ? `EXPOSED (${contact.events.length})` : "CLEAR"}
              </span>
              <span style={{ fontSize: 10, color: SLATE }}>{expanded === contact.id ? "▲" : "▼"}</span>
            </div>
          </div>

          {expanded === contact.id && (
            <div style={{ marginTop: 8 }}>
              {contact.role && (
                <div style={{ fontSize: 9, color: SLATE, marginBottom: 4 }}>
                  Role: {contact.role}
                </div>
              )}
              {contact.desc && (
                <div style={{ fontSize: 10, color: SLATE, marginBottom: 6, lineHeight: 1.4 }}>
                  {contact.desc.slice(0, 200)}
                </div>
              )}
              {contact.exposed ? (
                contact.events.map((ev) => (
                  <div
                    key={ev.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "4px 6px",
                      marginBottom: 3,
                      background: "rgba(255,255,255,0.03)",
                      borderRadius: 4,
                      border: `1px solid ${ev.col}22`,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 8,
                        padding: "1px 4px",
                        borderRadius: 2,
                        background: `${ev.col}22`,
                        color: ev.col,
                        border: `1px solid ${ev.col}44`,
                        flexShrink: 0,
                      }}
                    >
                      {ev.type}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: "#c0d4e4",
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {ev.title}
                    </span>
                    <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 3 }}>
                      <div
                        style={{
                          width: Math.min(ev.score * 14, 60),
                          height: 4,
                          background: ev.col,
                          borderRadius: 2,
                          opacity: 0.7,
                        }}
                      />
                      <span style={{ fontSize: 9, color: SLATE }}>{ev.score}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 10, color: SLATE }}>
                  No live world events currently align with this contact.
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
