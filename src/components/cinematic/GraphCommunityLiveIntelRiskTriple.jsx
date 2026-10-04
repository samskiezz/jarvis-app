/**
 * F187 — Graph Community × Live Intel × RiskSignal Triple Coverage (GCLRSTRI)
 * Parallel-fetches /v1/graph/communities + /functions/getLiveIntel + /entities/RiskSignal.
 * Three-way keyword-correlates each network cluster to surface:
 *   FULLY ALARMED (live event + risk signal both point at community)
 *   LIVE-ONLY     (live event matches, no risk signal)
 *   RISK-ONLY     (risk signal aligns, no live event)
 *   QUIET         (neither)
 * Red badge on fully-alarmed count. 60-s auto-refresh.
 */

import { useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AM  = "#FFB300";
const RD  = "#FF4444";
const PR  = "#B57BFF";
const SL  = "#6E8AA0";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_KEY) ||
  "dev-key";

const GCLRSTRI_RE =
  /\b(gclrstri|community\s+alarm|network\s+alarm|live\s+risk\s+communit\w*|communit\w*\s+live\s+risk|graph\s+community\s+live\s+risk|communit\w*\s+alarm|fully\s+alarmed\s+communit\w*|alarmed\s+communit\w*|communit\w*\s+risk\s+live|network\s+live\s+risk|live\s+community\s+risk)\b/i;

export function isGclrstriQuery(t) {
  return GCLRSTRI_RE.test(t || "");
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function tok(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function normaliseCommunities(raw) {
  const arr = Array.isArray(raw)               ? raw
    : Array.isArray(raw?.communities)           ? raw.communities
    : Array.isArray(raw?.clusters)              ? raw.clusters
    : Array.isArray(raw?.data)                  ? raw.data
    : Array.isArray(raw?.results)               ? raw.results
    : Array.isArray(raw?.items)                 ? raw.items
    : [];
  return arr.map((c, i) => ({
    id:      c.id        || String(i),
    label:   c.label     || c.name   || c.title     || `Community ${i + 1}`,
    members: Array.isArray(c.members) ? c.members.join(" ") : (c.members || ""),
    summary: String(c.summary || c.description || c.notes || "").slice(0, 300),
    size:    c.size || (Array.isArray(c.members) ? c.members.length : 0) || 0,
  }));
}

function normaliseLive(raw) {
  if (!raw) return [];
  const out = [];
  for (const e of (Array.isArray(raw.earthquakes) ? raw.earthquakes : [])) {
    const place = e.place || e.location || "";
    const mag   = e.magnitude || e.mag || "";
    out.push({ type: "SEISMIC", label: `M${mag} ${place}`.trim(),
      tokens: tok(`${place} earthquake seismic quake tectonic geological`) });
  }
  for (const c of (Array.isArray(raw.crypto) ? raw.crypto : [])) {
    const sym = c.symbol || c.name || "";
    out.push({ type: "CRYPTO", label: sym,
      tokens: tok(`${sym} crypto bitcoin blockchain digital currency asset finance market`) });
  }
  for (const f of (Array.isArray(raw.fx) ? raw.fx : [])) {
    const pair = f.pair || f.symbol || f.name || "";
    out.push({ type: "FX", label: pair,
      tokens: tok(`${pair} forex currency exchange rate finance market trade`) });
  }
  return out;
}

function normaliseSignals(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.signals)             ? raw.signals
    : Array.isArray(raw?.risk_signals)        ? raw.risk_signals
    : Array.isArray(raw?.data)                ? raw.data
    : Array.isArray(raw?.items)               ? raw.items
    : Array.isArray(raw?.results)             ? raw.results
    : [];
  return arr.map((s, i) => ({
    id:       s.id       || String(i),
    title:    s.title    || s.name        || s.signal || `Signal ${i + 1}`,
    severity: s.severity || s.level       || "MEDIUM",
    category: s.category || s.type        || "",
    tokens:   tok([s.title, s.name, s.signal, s.description, s.sector,
                   s.category, s.source, ...(Array.isArray(s.tags) ? s.tags : [])].join(" ")),
  }));
}

function liveRelevance(community, event) {
  const cw = tok(`${community.label} ${community.members} ${community.summary}`);
  const ev = new Set(event.tokens);
  return cw.filter((w) => ev.has(w)).length;
}

function riskRelevance(community, signal) {
  const cw = new Set(tok(`${community.label} ${community.members} ${community.summary}`));
  return signal.tokens.filter((w) => cw.has(w)).length;
}

function correlate(communities, liveEvents, signals) {
  return communities.map((c) => {
    const matchedLive = liveEvents
      .map((ev) => ({ ...ev, sc: liveRelevance(c, ev) }))
      .filter((ev) => ev.sc > 0)
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 6);
    const matchedRisk = signals
      .map((s)  => ({ ...s,  sc: riskRelevance(c, s)  }))
      .filter((s)  => s.sc  > 0)
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 6);
    const hasLive = matchedLive.length > 0;
    const hasRisk = matchedRisk.length > 0;
    const cls =
      hasLive && hasRisk ? "FULLY ALARMED"
      : hasLive          ? "LIVE-ONLY"
      : hasRisk          ? "RISK-ONLY"
      :                    "QUIET";
    return { ...c, _live: matchedLive, _risk: matchedRisk, _class: cls };
  });
}

// ── script (called by JarvisBrain) ───────────────────────────────────────────

export async function buildGclrstriScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [cr, lr, rr] = await Promise.allSettled([
      fetch(`${base}/v1/graph/communities`,   { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/functions/getLiveIntel`, { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/entities/RiskSignal`,    { headers: hdr }).then((r) => r.json()),
    ]);
    const communities = normaliseCommunities(cr.status  === "fulfilled" ? cr.value  : []);
    const liveEvents  = normaliseLive       (lr.status  === "fulfilled" ? lr.value  : {});
    const signals     = normaliseSignals    (rr.status  === "fulfilled" ? rr.value  : []);
    const linked      = correlate(communities, liveEvents, signals);

    const fullyAlarmed = linked.filter((c) => c._class === "FULLY ALARMED").length;
    const liveOnly     = linked.filter((c) => c._class === "LIVE-ONLY").length;
    const riskOnly     = linked.filter((c) => c._class === "RISK-ONLY").length;
    const quiet        = linked.filter((c) => c._class === "QUIET").length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS community alarm triple coverage: ${communities.length} network clusters ` +
          `correlated against ${liveEvents.length} live world signals and ${signals.length} active risk signals. ` +
          `${fullyAlarmed} FULLY ALARMED (both live event and risk signal alignment), ` +
          `${liveOnly} LIVE-ONLY, ${riskOnly} RISK-ONLY, ${quiet} QUIET. ` +
          `Provide a 2-sentence community network alarm assessment — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Community alarm coverage analysis complete, sir.").trim();
  } catch {
    return "Community alarm triple coverage assessment unavailable at this time, sir.";
  }
}

// ── UI helpers ────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'JetBrains Mono', monospace" };

const ScoreBar = ({ sc, color }) => (
  <div style={{ background: "#111", borderRadius: 2, height: 3, width: "100%", overflow: "hidden", marginTop: 2 }}>
    <div style={{ width: `${Math.min(100, Math.round(sc * 33))}%`, background: color, height: "100%" }} />
  </div>
);

const Chip = ({ label, color = CY }) => (
  <span style={{ display: "inline-block", padding: "1px 5px", border: `1px solid ${color}`,
    borderRadius: 3, color, fontSize: 9, letterSpacing: 0.8, marginRight: 3 }}>
    {label}
  </span>
);

function classColor(cls) {
  if (cls === "FULLY ALARMED") return RD;
  if (cls === "LIVE-ONLY")     return AM;
  if (cls === "RISK-ONLY")     return PR;
  return "#444";
}

function liveTypeColor(type) {
  if (type === "SEISMIC") return "#F59E0B";
  if (type === "CRYPTO")  return "#A78BFA";
  if (type === "FX")      return "#34D399";
  return SL;
}

function sevColor(sev) {
  if (!sev) return SL;
  const s = sev.toUpperCase();
  if (s === "CRITICAL" || s === "HIGH") return RD;
  if (s === "MEDIUM")                   return AM;
  return "#555";
}

const TABS = ["ALL", "FULLY ALARMED", "LIVE-ONLY", "RISK-ONLY", "QUIET"];

export default function GraphCommunityLiveIntelRiskTriple() {
  const [open,        setOpen]        = useState(false);
  const [communities, setCommunities] = useState([]);
  const [liveEvents,  setLiveEvents]  = useState([]);
  const [signals,     setSignals]     = useState([]);
  const [linked,      setLinked]      = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [tab,         setTab]         = useState("ALL");
  const [search,      setSearch]      = useState("");
  const [expanded,    setExpanded]    = useState(null);
  const [assessing,   setAssessing]   = useState(false);
  const [assessText,  setAssessText]  = useState("");
  const [err,         setErr]         = useState("");
  const timerRef = useRef(null);

  async function load() {
    setLoading(true); setErr("");
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [cr, lr, rr] = await Promise.allSettled([
        fetch(`${base}/v1/graph/communities`,   { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/functions/getLiveIntel`, { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/entities/RiskSignal`,    { headers: hdr }).then((r) => r.json()),
      ]);
      const c = normaliseCommunities(cr.status === "fulfilled" ? cr.value : []);
      const l = normaliseLive       (lr.status === "fulfilled" ? lr.value : {});
      const s = normaliseSignals    (rr.status === "fulfilled" ? rr.value : []);
      setCommunities(c);
      setLiveEvents(l);
      setSignals(s);
      setLinked(correlate(c, l, s));
    } catch (e) {
      setErr(String(e));
    }
    setLoading(false);
  }

  useEffect(() => {
    const handler = () => { setOpen((o) => !o); };
    window.addEventListener("jarvis:gclrstri-toggle", handler);
    return () => window.removeEventListener("jarvis:gclrstri-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 60_000);
    return () => clearInterval(timerRef.current);
  }, [open]);

  async function assess() {
    setAssessing(true); setAssessText("");
    const script = await buildGclrstriScript();
    setAssessText(script);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    setAssessing(false);
  }

  const fullyAlarmedCount = linked.filter((c) => c._class === "FULLY ALARMED").length;
  const liveOnlyCount     = linked.filter((c) => c._class === "LIVE-ONLY").length;
  const riskOnlyCount     = linked.filter((c) => c._class === "RISK-ONLY").length;
  const quietCount        = linked.filter((c) => c._class === "QUIET").length;

  const filtered = linked
    .filter((c) => {
      if (tab === "ALL") return true;
      return c._class === tab;
    })
    .filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (c.label + c.summary + c.members).toLowerCase().includes(q);
    });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          bottom: 8,
          left: 731680,
          zIndex: 335,
          background: fullyAlarmedCount > 0 ? "#1a0505" : "#0b0b0f",
          border: `1px solid ${fullyAlarmedCount > 0 ? RD : "#1a2a3a"}`,
          color: fullyAlarmedCount > 0 ? RD : "#444",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9,
          padding: "3px 8px",
          borderRadius: 3,
          cursor: "pointer",
          letterSpacing: 1,
        }}
      >
        ◈ GCLRSTRI{fullyAlarmedCount > 0 ? ` ▲${fullyAlarmedCount}` : ""}
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 40,
        left: "50%",
        transform: "translateX(-50%)",
        width: 840,
        maxHeight: "85vh",
        overflowY: "auto",
        background: "#060810",
        border: "1px solid #1a2a3a",
        borderRadius: 6,
        zIndex: 9502,
        ...mono,
        fontSize: 11,
        color: "#ccc",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #1a2a3a", gap: 8 }}>
        <span style={{ color: RD, fontSize: 13, fontWeight: 700, flex: 1 }}>
          ◈ GRAPH COMMUNITY × LIVE INTEL × RISK SIGNAL TRIPLE
        </span>
        {loading && <span style={{ color: "#555", fontSize: 9 }}>LOADING…</span>}
        <button
          onClick={assess}
          disabled={assessing}
          style={{ background: "#111", border: `1px solid ${RD}`, color: RD, fontSize: 9, padding: "2px 8px", borderRadius: 3, cursor: "pointer" }}
        >
          {assessing ? "ASSESSING…" : "▶ ASSESS"}
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: "#555", fontSize: 14, cursor: "pointer" }}
        >✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "10px 14px", borderBottom: "1px solid #111" }}>
        {[
          ["COMMUNITIES",    communities.length, "#888"],
          ["LIVE EVENTS",    liveEvents.length,  "#888"],
          ["RISK SIGNALS",   signals.length,     "#888"],
          ["FULLY ALARMED",  fullyAlarmedCount,  RD],
          ["LIVE-ONLY",      liveOnlyCount,      AM],
          ["RISK-ONLY",      riskOnlyCount,      PR],
          ["QUIET",          quietCount,         "#444"],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: 1, background: "#0c0c0c", border: "1px solid #1a1a1a", borderRadius: 3, padding: "6px 4px", textAlign: "center" }}>
            <div style={{ color, fontSize: 15, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#555", fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* coverage bar */}
      {linked.length > 0 && (
        <div style={{ padding: "6px 14px", borderBottom: "1px solid #111" }}>
          <div style={{ display: "flex", height: 5, borderRadius: 3, overflow: "hidden" }}>
            {[
              [fullyAlarmedCount, RD],
              [liveOnlyCount,     AM],
              [riskOnlyCount,     PR],
              [quietCount,        "#333"],
            ].map(([count, color], i) => (
              <div key={i} style={{ width: `${(count / linked.length) * 100}%`, background: color }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 9, color: "#555" }}>
            {[["● FULLY ALARMED", RD], ["● LIVE-ONLY", AM], ["● RISK-ONLY", PR], ["● QUIET", "#555"]].map(([lbl, c]) => (
              <span key={lbl} style={{ color: c }}>{lbl}</span>
            ))}
          </div>
        </div>
      )}

      {/* tabs + search */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 14px", borderBottom: "1px solid #111", flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? `${RD}22` : "none",
              border: `1px solid ${tab === t ? RD : "#333"}`,
              color: tab === t ? RD : "#666",
              fontSize: 9, padding: "2px 8px", borderRadius: 3, cursor: "pointer", ...mono,
            }}
          >{t}</button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search communities…"
          style={{
            marginLeft: "auto", background: "#0c0c0c", border: "1px solid #222",
            color: "#aaa", fontSize: 9, padding: "2px 8px", borderRadius: 3,
            outline: "none", width: 150, ...mono,
          }}
        />
      </div>

      {/* assess result */}
      {assessText && (
        <div style={{ padding: "8px 14px", background: "#0a0e14", borderBottom: "1px solid #111", color: RD, fontSize: 10, lineHeight: 1.5 }}>
          {assessText}
        </div>
      )}

      {err && (
        <div style={{ padding: "6px 14px", color: RD, fontSize: 9 }}>ERROR: {err}</div>
      )}

      {/* community list */}
      <div>
        {filtered.map((c) => {
          const isExp = expanded === c.id;
          const clr   = classColor(c._class);
          return (
            <div
              key={c.id}
              style={{ borderBottom: "1px solid #0d1420", cursor: "pointer" }}
              onClick={() => setExpanded(isExp ? null : c.id)}
            >
              <div style={{ display: "flex", alignItems: "center", padding: "7px 14px", gap: 8 }}>
                <span style={{ color: clr, fontSize: 9, minWidth: 100, letterSpacing: 0.5 }}>{c._class}</span>
                <span style={{ flex: 1, color: "#ccc", fontSize: 10 }}>{c.label}</span>
                {c.size > 0 && (
                  <span style={{ color: "#555", fontSize: 9 }}>⟨{c.size} members⟩</span>
                )}
                <span style={{ color: "#444", fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "0 14px 10px 14px", display: "flex", gap: 10 }}>
                  {/* left: live events */}
                  <div style={{ flex: 1, borderRight: "1px solid #111", paddingRight: 10 }}>
                    <div style={{ color: AM, fontSize: 8, letterSpacing: 1, marginBottom: 5 }}>
                      LIVE WORLD EVENTS ({c._live.length})
                    </div>
                    {c._live.length === 0
                      ? <div style={{ color: "#333", fontSize: 9 }}>no live event alignment</div>
                      : c._live.map(({ type, label, sc }, i) => (
                          <div key={i} style={{ marginBottom: 5 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 1 }}>
                              <Chip label={type} color={liveTypeColor(type)} />
                              <span style={{ color: "#aaa", fontSize: 9, flex: 1 }}>{label}</span>
                            </div>
                            <ScoreBar sc={sc} color={AM} />
                          </div>
                        ))
                    }
                  </div>
                  {/* right: risk signals */}
                  <div style={{ flex: 1, paddingLeft: 10 }}>
                    <div style={{ color: RD, fontSize: 8, letterSpacing: 1, marginBottom: 5 }}>
                      RISK SIGNALS ({c._risk.length})
                    </div>
                    {c._risk.length === 0
                      ? <div style={{ color: "#333", fontSize: 9 }}>no risk signal alignment</div>
                      : c._risk.map(({ title, severity, category, sc }, i) => (
                          <div key={i} style={{ marginBottom: 5 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 1 }}>
                              <Chip label={severity} color={sevColor(severity)} />
                              {category && <Chip label={category} color={SL} />}
                              <span style={{ color: "#aaa", fontSize: 9, flex: 1 }}>{title}</span>
                            </div>
                            <ScoreBar sc={sc} color={RD} />
                          </div>
                        ))
                    }
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && !loading && (
          <div style={{ padding: 20, color: "#333", textAlign: "center", fontSize: 10 }}>
            no communities match current filter
          </div>
        )}
      </div>
    </div>
  );
}
