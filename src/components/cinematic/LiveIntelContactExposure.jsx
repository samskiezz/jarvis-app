/**
 * LiveIntelContactExposure — F205
 *
 * Parallel-fetches /functions/getLiveIntel (quakes/crypto/FX) + /entities/Contact
 * then keyword-correlates each contact (name/role/org/dept/tags) against live
 * world events to surface:
 *   EXPOSED (≥1 live event matches contact context)
 *   SAFE    (0 matches — no world event touches this contact's profile)
 *
 * Stat tiles: events / contacts / exposed / safe
 * Filter tabs: ALL / EXPOSED / SAFE
 * Text search.
 * Expand contact → matched live event cards with type badge + relevance bar.
 * ▶ ASSESS EXPOSURE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90 s auto-refresh.
 *
 * Intent: "licontact" / "contact exposure" / "exposed contacts" /
 *         "who is exposed" / "live contact" / "contact world event" /
 *         "contact world exposure" / "live intel contact"
 *   → jarvis:licontact-toggle + TTS brief via buildLicontactScript()
 *
 * Toggle: ◈ LICONTACT at left:36840, bottom:8, zIndex:105.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF4444";
const DIM   = "#4A6070";
const BG    = "rgba(3,5,9,0.97)";
const BTN_LEFT   = 36840;
const REFRESH_MS = 90_000;
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,monospace";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── intent exports ────────────────────────────────────────────────────────────

const LICONTACT_RE =
  /\b(licontact|contact.exposure|exposed.contacts?|who.is.exposed|live.contact|contact.world.event|contact.world.exposure|live.intel.contact|contact.live.intel)\b/i;

export function isLicontactQuery(t) { return LICONTACT_RE.test(t || ""); }

export async function buildLicontactScript() {
  const [iRaw, cRaw] = await Promise.allSettled([
    fetch(`${apiBase()}/functions/getLiveIntel`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then((r) => r.json()),
    fetch(`${apiBase()}/entities/Contact`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then((r) => r.json()),
  ]);
  const events   = normaliseEvents(iRaw.status === "fulfilled" ? iRaw.value : {});
  const contacts = normaliseContacts(cRaw.status === "fulfilled" ? cRaw.value : []);
  const pairs    = correlate(contacts, events);
  const exposed = pairs.filter((p) => p.matches.length >= 1).length;
  const safe    = pairs.filter((p) => p.matches.length === 0).length;
  const topExposed = pairs
    .filter((p) => p.matches.length >= 1)
    .slice(0, 3)
    .map((p) => p.contact.name)
    .join(", ") || "none";
  return (
    `Assess JARVIS live intel contact exposure in 2 sentences. ` +
    `${events.length} live world events vs ${contacts.length} contacts: ` +
    `${exposed} EXPOSED (contact profile matches a live event), ` +
    `${safe} SAFE (no live event match). ` +
    `Top exposed contacts: ${topExposed}.`
  );
}

// ─── normalise helpers ─────────────────────────────────────────────────────────

function normaliseArray(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (raw && Array.isArray(raw[k])) return raw[k];
  }
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseEvents(data) {
  const events = [];
  if (!data || typeof data !== "object") return events;

  const quakes = Array.isArray(data.earthquakes) ? data.earthquakes : [];
  quakes.forEach((q, i) => {
    events.push({
      id:   q.id || `quake-${i}`,
      type: "seismic",
      name: q.place || q.name || `Magnitude ${q.magnitude} quake`,
      desc: `Mag ${q.magnitude ?? "?"} at ${q.place || "unknown location"}`,
      keywords: `seismic earthquake ${q.place || ""} magnitude disaster geologic tremor tectonic geology fault region infrastructure supply chain`.toLowerCase(),
    });
  });

  const coins = Array.isArray(data.crypto) ? data.crypto : [];
  coins.slice(0, 10).forEach((c, i) => {
    const sym = c.symbol || c.coin || c.currency || `COIN${i}`;
    const chg = c.change_24h ?? c.pct_change ?? null;
    events.push({
      id:   `crypto-${sym}`,
      type: "crypto",
      name: `${sym} ${chg !== null ? (chg >= 0 ? "+" : "") + chg.toFixed(2) + "%" : ""}`.trim(),
      desc: `Cryptocurrency ${sym}: price ${c.price ?? "?"} USD`,
      keywords: `crypto ${sym} ${sym.toLowerCase()} digital asset market finance blockchain currency defi token investment portfolio treasury analyst`.toLowerCase(),
    });
  });

  const fx = Array.isArray(data.fx) ? data.fx : [];
  fx.slice(0, 8).forEach((f, i) => {
    const pair = f.pair || f.symbol || f.currency_pair || `FX${i}`;
    const rate = f.rate ?? f.price ?? "?";
    events.push({
      id:   `fx-${pair}`,
      type: "fx",
      name: `${pair} ${rate}`,
      desc: `FX pair ${pair}: rate ${rate}`,
      keywords: `forex fx ${pair} ${pair.toLowerCase()} currency exchange rate finance market monetary treasury international trade`.toLowerCase(),
    });
  });

  return events;
}

function normaliseContacts(raw) {
  return normaliseArray(raw, ["contacts", "people", "directory", "items", "data"]).map((c) => ({
    id:   c.id || c.contact_id || String(Math.random()),
    name: c.name || c.full_name || c.display_name || "Unknown",
    role: c.role || c.title || c.job_title || "",
    org:  c.org || c.organisation || c.company || c.department || "",
    dept: c.dept || c.department || c.division || "",
    tags: [...(c.tags || []), ...(c.categories || []), ...(c.interests || [])].map(String),
    summary: c.summary || c.bio || c.description || "",
  }));
}

function tokens(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function matchScore(contact, event) {
  const contactText = `${contact.name} ${contact.role} ${contact.org} ${contact.dept} ${contact.tags.join(" ")} ${contact.summary}`;
  const contactWords = tokens(contactText);
  const eventText = `${event.name} ${event.desc} ${event.keywords}`;
  const hits = contactWords.filter((w) => eventText.toLowerCase().includes(w));
  return hits.length / Math.max(contactWords.length, 1);
}

function correlate(contacts, events) {
  return contacts.map((contact) => {
    const scored = events
      .map((e) => ({ e, score: matchScore(contact, e) }))
      .filter((x) => x.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    return { contact, matches: scored };
  });
}

// ─── sub-components ────────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{
      flex: "1 1 0", minWidth: 55, background: "rgba(0,0,0,0.3)",
      border: `1px solid ${color}33`, borderRadius: 6,
      padding: "6px 8px", textAlign: "center",
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: MONO }}>{value}</div>
      <div style={{ fontSize: 9, color: DIM, letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function ScoreBar({ score }) {
  const color = score > 0.5 ? GREEN : score > 0.25 ? AMBER : CY;
  return (
    <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, flex: 1 }}>
      <div style={{
        width: `${Math.round(score * 100)}%`, height: "100%",
        background: color, borderRadius: 2, transition: "width 0.4s ease",
      }} />
    </div>
  );
}

const TYPE_COLOR = { seismic: AMBER, crypto: CY, fx: GREEN };
const TYPE_ICON  = { seismic: "⚡", crypto: "◆", fx: "◈" };

// ─── main component ────────────────────────────────────────────────────────────

export default function LiveIntelContactExposure() {
  const [open, setOpen]           = useState(false);
  const [pairs, setPairs]         = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [iRes, cRes] = await Promise.allSettled([
        fetch(`${apiBase()}/functions/getLiveIntel`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
        fetch(`${apiBase()}/entities/Contact`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
      ]);
      const events   = normaliseEvents(iRes.status === "fulfilled" ? iRes.value : {});
      const contacts = normaliseContacts(cRes.status === "fulfilled" ? cRes.value : []);
      setPairs(correlate(contacts, events));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:licontact-toggle", onToggle);
    return () => window.removeEventListener("jarvis:licontact-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const exposed = pairs.filter((p) => p.matches.length >= 1);
  const safe    = pairs.filter((p) => p.matches.length === 0);

  const visible = pairs
    .filter((p) => {
      if (tab === "EXPOSED") return p.matches.length >= 1;
      if (tab === "SAFE")    return p.matches.length === 0;
      return true;
    })
    .filter((p) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        p.contact.name.toLowerCase().includes(q) ||
        p.contact.role.toLowerCase().includes(q) ||
        p.contact.org.toLowerCase().includes(q) ||
        p.matches.some((m) => m.e.name.toLowerCase().includes(q))
      );
    });

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildLicontactScript();
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: script }),
      });
      const json = await res.json();
      const text =
        json.response || json.reply || json.message || json.content ||
        json.answer || JSON.stringify(json).slice(0, 200);
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text } })
      );
    } catch (_) {
      // silently ignore
    } finally {
      setAssessing(false);
    }
  }

  const toggleRow = (id) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Live Intel × Contact Exposure (LICONTACT)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 105,
          background: "rgba(3,5,9,0.85)", border: `1px solid ${AMBER}55`,
          borderRadius: 4, color: AMBER, fontFamily: MONO, fontSize: 9,
          letterSpacing: 1, padding: "3px 7px", cursor: "pointer",
        }}
      >
        ◈ LICONTACT
        {exposed.length > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 8, fontWeight: 700,
          }}>
            {exposed.length}
          </span>
        )}
      </button>
    );
  }

  const TABS = ["ALL", "EXPOSED", "SAFE"];
  const tabColor = (t) => {
    if (t === "EXPOSED") return AMBER;
    if (t === "SAFE")    return GREEN;
    return CY;
  };

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT - 200, bottom: 48, zIndex: 105,
      width: 520, maxHeight: "75vh",
      background: BG, border: `1px solid ${AMBER}66`,
      borderRadius: 8, fontFamily: MONO, fontSize: 10,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderBottom: `1px solid ${AMBER}33`,
        background: "rgba(0,0,0,0.4)",
      }}>
        <span style={{ color: AMBER, fontSize: 11, letterSpacing: 2 }}>
          ◈ LIVE INTEL × CONTACT EXPOSURE
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              background: "none", border: `1px solid ${CY}66`,
              borderRadius: 4, color: CY, fontFamily: MONO, fontSize: 9,
              letterSpacing: 1, padding: "2px 8px", cursor: "pointer",
            }}
          >
            {assessing ? "…" : "▶ ASSESS EXPOSURE"}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "none", border: "none", color: DIM,
              fontSize: 14, cursor: "pointer", lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
        <Tile label="EVENTS"   value={
          [...new Set(pairs.flatMap((p) => p.matches.map((m) => m.e.id)))].length
        } color={CY} />
        <Tile label="CONTACTS" value={pairs.length}   color={CY}    />
        <Tile label="EXPOSED"  value={exposed.length} color={AMBER} />
        <Tile label="SAFE"     value={safe.length}    color={GREEN} />
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 12px 6px" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? `${tabColor(t)}22` : "none",
              border: `1px solid ${tab === t ? tabColor(t) : DIM}`,
              borderRadius: 3, color: tab === t ? tabColor(t) : DIM,
              fontFamily: MONO, fontSize: 8, letterSpacing: 1,
              padding: "2px 6px", cursor: "pointer",
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: "auto", background: "rgba(0,0,0,0.4)",
            border: `1px solid ${DIM}`, borderRadius: 3,
            color: CY, fontFamily: MONO, fontSize: 9,
            padding: "2px 6px", width: 120, outline: "none",
          }}
        />
      </div>

      {/* list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 12px" }}>
        {loading && (
          <div style={{ color: DIM, padding: "8px 0" }}>◌ loading…</div>
        )}
        {error && (
          <div style={{ color: RED, padding: "4px 0" }}>⚠ {error}</div>
        )}
        {!loading && visible.length === 0 && !error && (
          <div style={{ color: DIM, padding: "8px 0" }}>no results</div>
        )}
        {visible.map((p) => {
          const status = p.matches.length >= 1 ? "EXPOSED" : "SAFE";
          const statusColor = status === "EXPOSED" ? AMBER : GREEN;
          const isExp = expanded[p.contact.id];
          return (
            <div
              key={p.contact.id}
              style={{
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                paddingBottom: 6, marginBottom: 6,
              }}
            >
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  cursor: "pointer", padding: "4px 0",
                }}
                onClick={() => toggleRow(p.contact.id)}
              >
                <span style={{ color: CY, fontSize: 10, flexShrink: 0 }}>◎</span>
                <span style={{
                  fontSize: 8, border: `1px solid ${statusColor}`,
                  borderRadius: 3, color: statusColor,
                  padding: "1px 4px", letterSpacing: 1, flexShrink: 0,
                }}>
                  {status}
                </span>
                <span style={{
                  color: CY, flex: 1, overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {p.contact.name}
                </span>
                {p.contact.role && (
                  <span style={{
                    color: DIM, fontSize: 8, flexShrink: 0,
                    overflow: "hidden", textOverflow: "ellipsis",
                    maxWidth: 120, whiteSpace: "nowrap",
                  }}>
                    {p.contact.role}
                  </span>
                )}
                <span style={{ color: DIM, fontSize: 8, flexShrink: 0 }}>
                  {p.matches.length} evt
                </span>
                <span style={{ color: DIM, fontSize: 10 }}>
                  {isExp ? "▲" : "▼"}
                </span>
              </div>

              {isExp && (
                <div style={{ paddingLeft: 16, paddingBottom: 4 }}>
                  {p.contact.org && (
                    <div style={{ color: DIM, fontSize: 8, marginBottom: 4 }}>
                      {p.contact.org}{p.contact.dept ? ` · ${p.contact.dept}` : ""}
                    </div>
                  )}
                  {p.matches.length === 0 ? (
                    <div style={{ color: GREEN, fontSize: 9 }}>
                      ◎ no live world event matches this contact — SAFE
                    </div>
                  ) : (
                    p.matches.map(({ e, score }) => {
                      const tc = TYPE_COLOR[e.type] || CY;
                      const ti = TYPE_ICON[e.type] || "◈";
                      return (
                        <div key={e.id} style={{
                          display: "flex", alignItems: "center", gap: 6,
                          marginBottom: 4,
                        }}>
                          <span style={{ color: tc, fontSize: 9, flexShrink: 0 }}>{ti}</span>
                          <span style={{
                            fontSize: 7, border: `1px solid ${tc}55`,
                            borderRadius: 3, color: tc,
                            padding: "0 3px", letterSpacing: 1, flexShrink: 0,
                          }}>
                            {e.type.toUpperCase()}
                          </span>
                          <span style={{
                            color: AMBER, fontSize: 9, flex: 1,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {e.name}
                          </span>
                          <ScoreBar score={score} />
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{
        padding: "4px 12px", borderTop: `1px solid ${AMBER}22`,
        color: DIM, fontSize: 8, letterSpacing: 1,
        display: "flex", justifyContent: "space-between",
      }}>
        <span>LICONTACT · /functions/getLiveIntel × /entities/Contact</span>
        <span
          onClick={load}
          style={{ cursor: "pointer", color: CY }}
          title="refresh now"
        >
          ↺ {REFRESH_MS / 1000}s
        </span>
      </div>
    </div>
  );
}
