/**
 * InvestmentOpsEventNexus — F527
 * "JARVIS, investment ops / portfolio events / invoev / ops signaled investment / which investments have ops events"
 * Cross-references /entities/Investment + /v1/ops/events.
 * Finds SIGNALED investments (≥1 ops event keyword-matches) vs QUIET (no ops activity).
 * Coverage % tile; ALL/SIGNALED/QUIET filter tabs + search; click-to-expand matched events.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence financial-ops brief + TTS.
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
const BTN_LEFT = 41_020;
const Z_INDEX  = 106;

const INVOEV_RE =
  /\binvoev\b|\binvestment.?ops\b|\bportfolio.?ops\b|\bops.?investment\b|\bops.?portfolio\b|\binvestment.?event\b|\bportfolio.?event\b|\bwhich.?investments?.?have.?ops\b|\binvestment.?ops.?signal\b|\bops.?signaled.?investment\b|\bportfolio.?ops.?signal\b|\binvestment.?incident\b/i;

export function isInvoevQuery(text) {
  return INVOEV_RE.test(text || "");
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

function normaliseInvestments(data) {
  if (!data) return [];
  const raw =
    data.investments || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((inv, i) => ({
    id:     inv.id || `inv-${i}`,
    name:   inv.name || inv.title || inv.ticker || inv.symbol || `Investment ${i + 1}`,
    type:   (inv.type || inv.asset_class || inv.kind || "ASSET").toUpperCase(),
    value:  inv.current_value || inv.value || inv.amount || 0,
    desc:   inv.description || inv.summary || inv.notes || "",
    tags:   Array.isArray(inv.tags) ? inv.tags.join(" ") : String(inv.tags || ""),
  }));
}

function normaliseEvents(data) {
  if (!data) return [];
  const raw =
    data.events || data.ops_events || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((ev, i) => ({
    id:       ev.id || `ev-${i}`,
    title:    ev.title || ev.name || ev.message || `Event ${i + 1}`,
    severity: (ev.severity || ev.level || "INFO").toUpperCase(),
    source:   ev.source || ev.service || ev.origin || "",
    desc:     ev.description || ev.summary || ev.body || "",
    ts:       ev.timestamp || ev.created_at || ev.time || "",
    tags:     Array.isArray(ev.tags) ? ev.tags.join(" ") : String(ev.tags || ""),
  }));
}

function crossRef(investments, events) {
  return investments.map((inv) => {
    const haystack = `${inv.name} ${inv.desc} ${inv.tags}`;
    const matches = events
      .map((ev) => ({
        ev,
        hits: overlap(haystack, `${ev.title} ${ev.desc} ${ev.source} ${ev.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...inv,
      signaled: matches.length > 0,
      matches: matches.map(({ ev, hits }) => ({ ...ev, hits })),
    };
  });
}

function severityColor(sev) {
  if (sev === "CRITICAL") return RED;
  if (sev === "WARNING" || sev === "WARN") return AMB;
  return CY;
}

// ─── buildInvoevScript (for JarvisBrain) ─────────────────────────────────────

export async function buildInvoevScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [invRes, evRes] = await Promise.all([
      fetch(`${base}/entities/Investment`, { headers: hdr }),
      fetch(`${base}/v1/ops/events`,       { headers: hdr }),
    ]);
    const invData = invRes.ok ? await invRes.json() : {};
    const evData  = evRes.ok  ? await evRes.json()  : {};

    const investments = normaliseInvestments(invData);
    const events      = normaliseEvents(evData);
    const crossed     = crossRef(investments, events);

    const total    = crossed.length;
    const signaled = crossed.filter((inv) => inv.signaled).length;
    const quiet    = total - signaled;
    const coverage = total > 0 ? Math.round((signaled / total) * 100) : 0;
    const topSignaled = crossed
      .filter((inv) => inv.signaled)
      .slice(0, 2)
      .map((inv) => inv.name)
      .join(", ");

    const prompt = `JARVIS investment ops event nexus: ${total} investments analysed. ${signaled} have active ops event signals (${coverage}% exposure). ${quiet} remain quiet with no correlated ops activity. Top signaled holdings: ${topSignaled || "none"}. Provide a 2-sentence financial-ops intelligence brief.`;
    const chatRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({ message: prompt }),
    });
    const chatData = chatRes.ok ? await chatRes.json() : {};
    const brief =
      chatData.response || chatData.message || chatData.content ||
      `${signaled} of ${total} investments are correlated with active ops events (${coverage}% exposure). ${quiet} holdings remain operationally quiet.`;

    window.dispatchEvent(
      new CustomEvent("jarvis:speak-dossier", { detail: { text: brief } })
    );
    return brief;
  } catch (err) {
    return `Investment ops event nexus error: ${err.message}`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function InvestmentOpsEventNexus() {
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
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [invRes, evRes] = await Promise.all([
        fetch(`${base}/entities/Investment`, { headers: hdr }),
        fetch(`${base}/v1/ops/events`,       { headers: hdr }),
      ]);
      const invData = invRes.ok ? await invRes.json() : {};
      const evData  = evRes.ok  ? await evRes.json()  : {};
      const investments = normaliseInvestments(invData);
      const events      = normaliseEvents(evData);
      setCrossed(crossRef(investments, events));
    } catch (_) {
      /* network unavailable */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:invoev-toggle", onToggle);
    return () => window.removeEventListener("jarvis:invoev-toggle", onToggle);
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
      const result = await buildInvoevScript();
      setBrief(result);
    } finally {
      setAssessing(false);
    }
  }, []);

  const signaled = crossed.filter((inv) => inv.signaled);
  const quiet    = crossed.filter((inv) => !inv.signaled);
  const coverage = crossed.length > 0
    ? Math.round((signaled.length / crossed.length) * 100)
    : 0;

  const visible = crossed
    .filter((inv) => {
      if (tab === "SIGNALED") return inv.signaled;
      if (tab === "QUIET")    return !inv.signaled;
      return true;
    })
    .filter((inv) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return inv.name.toLowerCase().includes(q) || inv.desc.toLowerCase().includes(q);
    });

  // ── button (always visible) ──
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
        title="Investment × Ops Event Nexus (INVOEV)"
      >
        ◈ INVOEV{signaled.length > 0 && (
          <span style={{ color: AMB, marginLeft: 4 }}>{signaled.length}</span>
        )}
      </button>
    );
  }

  // ── panel ──
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
        ◈ INVOEV ✕
      </button>

      <div style={panel}>
        <div style={{ fontSize: 13, fontWeight: "bold", marginBottom: 10 }}>
          ◈ INVESTMENT × OPS EVENT NEXUS
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {[
            ["TOTAL",    crossed.length,  CY],
            ["SIGNALED", signaled.length, AMB],
            ["QUIET",    quiet.length,    GRN],
            ["EXPOSURE", `${coverage}%`,  coverage > 40 ? AMB : GRN],
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
          {["ALL", "SIGNALED", "QUIET"].map((t) => (
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
          placeholder="search investments…"
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
          <div style={{ color: DIM, padding: 12 }}>No investments match.</div>
        ) : (
          visible.map((inv) => (
            <div
              key={inv.id}
              style={{
                borderBottom: `1px solid rgba(41,231,255,0.1)`,
                paddingBottom: 8,
                marginBottom: 8,
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
              >
                <span
                  style={{
                    fontSize: 9,
                    padding: "1px 5px",
                    borderRadius: 3,
                    background: inv.signaled ? `${AMB}22` : `${GRN}22`,
                    color: inv.signaled ? AMB : GRN,
                    border: `1px solid ${inv.signaled ? AMB : GRN}55`,
                    flexShrink: 0,
                  }}
                >
                  {inv.signaled ? "SIGNALED" : "QUIET"}
                </span>
                <span style={{ color: inv.signaled ? CY : DIM, flexGrow: 1 }}>{inv.name}</span>
                <span
                  style={{
                    fontSize: 9,
                    padding: "1px 4px",
                    borderRadius: 2,
                    background: `${CY}22`,
                    color: CY,
                    border: `1px solid ${CY}44`,
                    flexShrink: 0,
                  }}
                >
                  {inv.type}
                </span>
                <span style={{ color: DIM }}>{expanded === inv.id ? "▲" : "▼"}</span>
              </div>

              {expanded === inv.id && (
                <div style={{ marginTop: 6, paddingLeft: 8 }}>
                  {inv.desc && (
                    <div style={{ color: DIM, fontSize: 10, marginBottom: 6 }}>{inv.desc}</div>
                  )}
                  {inv.matches.length === 0 ? (
                    <div style={{ color: GRN, fontSize: 10 }}>No ops events correlated.</div>
                  ) : (
                    inv.matches.map((ev) => (
                      <div
                        key={ev.id}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 6,
                          marginBottom: 4,
                          paddingLeft: 4,
                          borderLeft: `2px solid ${severityColor(ev.severity)}55`,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 8,
                            padding: "1px 4px",
                            borderRadius: 2,
                            background: `${severityColor(ev.severity)}22`,
                            color: severityColor(ev.severity),
                            border: `1px solid ${severityColor(ev.severity)}44`,
                            flexShrink: 0,
                            marginTop: 1,
                          }}
                        >
                          {ev.severity}
                        </span>
                        <div style={{ flexGrow: 1 }}>
                          <div style={{ color: CY, fontSize: 10 }}>{ev.title}</div>
                          {ev.source && (
                            <div style={{ color: DIM, fontSize: 9 }}>{ev.source}</div>
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
