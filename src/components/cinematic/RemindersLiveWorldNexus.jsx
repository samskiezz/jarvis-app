/**
 * RemindersLiveWorldNexus — F611
 * "JARVIS, remlw / reminders world / live world reminders / world-signaled reminders"
 * Cross-references /reminders/list against /functions/getLiveIntel (quakes/crypto/fx).
 * WORLD-SIGNALED reminders (≥1 live event keyword-matches) vs FLOATING (no live world backing).
 * Coverage % tile; ALL/WORLD-SIGNALED/FLOATING filter tabs + search; click-to-expand matched events.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const DIM = "#8899AA";
const ORG = "#FF6B35";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS = 90_000;

const REMLW_RE =
  /\bremlw\b|\breminders?.world\b|\blive.?world.?reminders?\b|\bworld.?signaled.?reminders?\b|\blive.?intel.?reminders?\b|\breal.?world.?reminders?\b|\bworld.?reminder.?coverage\b|\breminder.?live.?world\b|\bworld.?backed.?reminders?\b/i;

export function isRemlwQuery(text) {
  return REMLW_RE.test(text || "");
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

function normaliseLiveEvents(data) {
  if (!data) return [];
  const all = [];

  const quakes = Array.isArray(data.earthquakes) ? data.earthquakes : [];
  quakes.forEach((q, i) => {
    all.push({
      id:          q.id || `quake-${i}`,
      kind:        "SEISMIC",
      name:        q.place || q.name || `Magnitude ${q.magnitude} quake`,
      description: `Mag ${q.magnitude ?? "?"} at ${q.place || "unknown location"}.`,
      tags:        `seismic earthquake geologic disaster ${q.place || ""}`,
    });
  });

  const coins = Array.isArray(data.crypto)
    ? data.crypto
    : Array.isArray(data.coins)
    ? data.coins
    : [];
  coins.forEach((c, i) => {
    const sym = c.symbol || c.coin || c.currency || `COIN${i}`;
    const chg = c.change_pct ?? c.change ?? c.pct_change ?? null;
    all.push({
      id:          `crypto-${sym}`,
      kind:        "CRYPTO",
      name:        `${sym}${chg !== null ? ` ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%` : ""}`,
      description: `Cryptocurrency ${sym} price ${c.price ?? "?"} USD.`,
      tags:        `crypto ${sym} ${sym.toLowerCase()} digital asset market`,
    });
  });

  const fx = Array.isArray(data.fx)
    ? data.fx
    : Array.isArray(data.currencies)
    ? data.currencies
    : [];
  fx.forEach((f, i) => {
    const pair = f.pair || f.symbol || f.currency_pair || `FX${i}`;
    const rate = f.rate ?? f.price ?? null;
    all.push({
      id:          `fx-${pair}`,
      kind:        "FX",
      name:        `${pair}${rate !== null ? ` @ ${rate}` : ""}`,
      description: `FX pair ${pair}. Rate: ${rate ?? "?"}.`,
      tags:        `currency forex fx ${pair} ${pair.toLowerCase()} monetary exchange`,
    });
  });

  return all;
}

function crossRef(reminders, events) {
  return reminders.map((rem) => {
    const haystack = `${rem.content} ${rem.kind} ${(rem.tags || []).join(" ")}`;
    const matches = events
      .map((ev) => {
        const hits = overlap(haystack, `${ev.name} ${ev.description} ${ev.tags}`);
        return hits > 0 ? { ...ev, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 5);
    return { ...rem, events: matches, signaled: matches.length > 0 };
  });
}

export async function buildRemlwScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [remRes, intelRes] = await Promise.all([
      fetch(`${base}/reminders/list`,          { headers: hdr }),
      fetch(`${base}/functions/getLiveIntel`,  { headers: hdr }),
    ]);
    const [remData, intelData] = await Promise.all([remRes.json(), intelRes.json()]);
    const reminders = normaliseReminders(remData);
    const events    = normaliseLiveEvents(intelData);
    const rows      = crossRef(reminders, events);
    const signaled  = rows.filter((r) => r.signaled).length;
    const floating  = rows.length - signaled;
    const pct       = rows.length ? Math.round((signaled / rows.length) * 100) : 0;
    if (!rows.length) return "No reminders found in the system, sir.";
    const topEvent = rows
      .filter((r) => r.signaled)
      .flatMap((r) => r.events)
      .sort((a, b) => b.hits - a.hits)[0];
    return (
      `${signaled} of ${rows.length} reminders are correlated to live world events (${pct}% coverage). ` +
      (topEvent
        ? `Strongest signal match: ${topEvent.kind} event "${topEvent.name.slice(0, 50)}" — situational awareness may be required.`
        : floating > 0
        ? `${floating} reminder${floating !== 1 ? "s" : ""} have no live world context — they may be temporally disconnected action items.`
        : "All reminders have live world event backing.")
    );
  } catch {
    return "Unable to reach reminders or live-intel endpoints, sir.";
  }
}

const KIND_COLOR = { SEISMIC: ORG, CRYPTO: GRN, FX: CY };

export default function RemindersLiveWorldNexus() {
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
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [remRes, intelRes] = await Promise.all([
        fetch(`${base}/reminders/list`,         { headers: hdr }),
        fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
      ]);
      const [remData, intelData] = await Promise.all([remRes.json(), intelRes.json()]);
      setRows(crossRef(normaliseReminders(remData), normaliseLiveEvents(intelData)));
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
    window.addEventListener("jarvis:remlw-toggle", toggle);
    return () => window.removeEventListener("jarvis:remlw-toggle", toggle);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try {
      const base     = apiBase();
      const signaled = rows.filter((r) => r.signaled);
      const floating = rows.filter((r) => !r.signaled);
      const topEvents = signaled
        .flatMap((r) => r.events)
        .sort((a, b) => b.hits - a.hits)
        .slice(0, 3)
        .map((ev) => `${ev.kind}:${ev.name.slice(0, 30)}`)
        .join("; ");
      const resp = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message:
            `Assess reminder-to-live-world-intel linkage: ${rows.length} reminders total, ` +
            `${signaled.length} matched to live world events (seismic/crypto/fx), ` +
            `${floating.length} have no live world context. ` +
            (topEvents ? `Top correlated events: ${topEvents}. ` : "") +
            "Give a 2-sentence operational situational-awareness assessment with recommended action.",
        }),
      });
      const d    = await resp.json();
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

  const signaled = rows.filter((r) => r.signaled).length;
  const floating = rows.length - signaled;
  const pct      = rows.length ? Math.round((signaled / rows.length) * 100) : 0;

  const visible = rows
    .filter((r) => {
      if (tab === "WORLD-SIGNALED") return r.signaled;
      if (tab === "FLOATING")       return !r.signaled;
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

  const KIND_REM_COLOR = { note: CY, task: GRN, alert: "#FF4444", reminder: AMB };

  const BTN_LEFT = 90_760;
  const BTN_STYLE = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 8,
    zIndex: 164,
    padding: "4px 10px",
    background: "rgba(5,8,13,0.82)",
    border: `1px solid ${floating > 0 ? AMB : CY}55`,
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
    zIndex: 164,
    width: 410,
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
        title="Reminders × Live World Intel Nexus (REMLW)"
      >
        ◈ REMLW
        {floating > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 4, padding: "1px 5px", fontSize: 9 }}>
            {floating}
          </span>
        )}
      </button>

      {open && (
        <div style={PANEL}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>REMINDERS × LIVE WORLD INTEL</span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
            >✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              { label: "REMINDERS",      value: rows.length, color: CY },
              { label: "WORLD-SIGNALED", value: signaled,    color: signaled > 0 ? GRN : DIM },
              { label: "FLOATING",       value: floating,    color: floating > 0 ? AMB : GRN },
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
              <span style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>LIVE WORLD SIGNAL COVERAGE</span>
              <span style={{ color: pct >= 70 ? GRN : pct >= 40 ? AMB : "#FF4444", fontSize: 10, fontWeight: "bold" }}>{pct}%</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct >= 70 ? GRN : pct >= 40 ? AMB : "#FF4444", borderRadius: 2, transition: "width 0.4s" }} />
            </div>
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
            {["ALL", "WORLD-SIGNALED", "FLOATING"].map((t) => (
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
                style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${rem.signaled ? GRN : AMB}33`, borderRadius: 6, padding: "7px 9px", cursor: "pointer" }}
                onClick={() => setExpanded(expanded === rem.id ? null : rem.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ color: rem.signaled ? GRN : AMB, fontSize: 10 }}>{rem.signaled ? "●" : "○"}</span>
                  <span style={{ color: KIND_REM_COLOR[rem.kind] || CY, fontSize: 9, border: `1px solid ${(KIND_REM_COLOR[rem.kind] || CY)}44`, borderRadius: 3, padding: "1px 4px" }}>{rem.kind}</span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>{rem.content.slice(0, 58)}{rem.content.length > 58 ? "…" : ""}</span>
                  <span style={{ color: rem.signaled ? GRN : DIM, fontSize: 9 }}>
                    {rem.signaled ? `${rem.events.length} event${rem.events.length !== 1 ? "s" : ""}` : "FLOATING"}
                  </span>
                </div>

                {expanded === rem.id && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${CY}22`, paddingTop: 6 }}>
                    {rem.signaled ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {rem.events.map((ev) => (
                          <div key={ev.id} style={{ background: "rgba(0,229,160,0.04)", border: `1px solid ${(KIND_COLOR[ev.kind] || CY)}33`, borderRadius: 4, padding: "5px 7px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ color: KIND_COLOR[ev.kind] || CY, fontSize: 9, border: `1px solid ${(KIND_COLOR[ev.kind] || CY)}44`, borderRadius: 3, padding: "1px 4px" }}>{ev.kind}</span>
                              <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{ev.name.slice(0, 45)}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>hits: {ev.hits}</span>
                            </div>
                            <div style={{ color: DIM, fontSize: 9, marginTop: 2 }}>{ev.description.slice(0, 80)}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No live world events matched this reminder — no real-time situational context.</div>
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
