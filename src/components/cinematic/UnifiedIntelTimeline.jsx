/**
 * F64 — Unified Intelligence Timeline (UITL)
 *
 * Merges three live data streams into a single chronological intelligence
 * timeline, giving the operator a unified view of "what is happening across
 * the entire JARVIS information fabric right now."
 *
 * Data sources (confirmed real endpoints):
 *   GET /v1/ops/events       → operational events (type/resource/severity/created_at)
 *   GET /entities/RiskSignal → active risk signals (title/severity/created_at)
 *   GET /knowledge/          → knowledge articles (title/source/created_at/tags)
 *
 * Each item is tagged by source type (OPS / RISK / KNOWLEDGE) with a
 * distinct colour badge. Items are sorted newest-first by timestamp.
 * Source type filter tabs: ALL | OPS | RISK | KNOWLEDGE.
 * Text search narrows by title/description.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence combined situation brief + TTS.
 *
 * Toggle:  ◈ UITL  at bottom:8 left:982680 zIndex:132.
 * Event:   jarvis:uitl-toggle
 * Voice:   "uitl / intel timeline / unified timeline / event timeline /
 *           unified event stream / what is happening / all events"
 * Refresh: 5-min auto-poll.
 */
import { useEffect, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AM  = "#F59E0B";
const RED = "#EF4444";
const GR  = "#10B981";
const PU  = "#A78BFA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const UITL_RE =
  /\buitl\b|\bintel.?timeline|\bunified.?timeline|\bevent.?timeline|\bunified.?event.?stream|\bwhat.?is.?happen|\ball.?events\b/i;

export function isUitlQuery(text) {
  return UITL_RE.test(text || "");
}

// ── normalisers ────────────────────────────────────────────────────────────────

function normOps(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : (raw?.events || raw?.data || raw?.items || []);
  return arr.map((e) => ({
    id:          e.id || e._id || Math.random().toString(36).slice(2),
    kind:        "OPS",
    colour:      CY,
    title:       e.type || e.resource || e.event_type || "Ops Event",
    subtitle:    e.resource || e.service || e.description || "",
    severity:    e.severity || e.status || "",
    ts:          e.created_at || e.timestamp || e.event_time || e.date || null,
  }));
}

function normRisk(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : (raw?.data || raw?.items || raw?.risk_signals || []);
  return arr.map((r) => ({
    id:       r.id || r._id || Math.random().toString(36).slice(2),
    kind:     "RISK",
    colour:   RED,
    title:    r.title || r.name || r.signal_name || "Risk Signal",
    subtitle: r.description || r.category || "",
    severity: r.severity || r.level || "",
    ts:       r.created_at || r.timestamp || r.detected_at || r.date || null,
  }));
}

function normKnow(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : (raw?.articles || raw?.items || raw?.data || []);
  return arr.map((k) => ({
    id:       k.id || k._id || Math.random().toString(36).slice(2),
    kind:     "KNOWLEDGE",
    colour:   GR,
    title:    k.title || k.name || k.topic || "Knowledge Article",
    subtitle: (Array.isArray(k.tags) ? k.tags.slice(0, 3).join(", ") : (k.source || k.category || "")),
    severity: "",
    ts:       k.created_at || k.timestamp || k.published_at || k.date || null,
  }));
}

function parseTs(ts) {
  if (!ts) return 0;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function relTime(ts) {
  if (!ts) return "—";
  const diff = Date.now() - parseTs(ts);
  if (diff < 60_000)  return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

// ── exported build script (used by JarvisBrain voice handler) ─────────────────

export async function buildUitlScript() {
  const base = apiBase();
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const [opsR, riskR, knowR] = await Promise.allSettled([
    fetch(`${base}/v1/ops/events`,       { headers: hdr }).then((r) => r.json()),
    fetch(`${base}/entities/RiskSignal`, { headers: hdr }).then((r) => r.json()),
    fetch(`${base}/knowledge/`,          { headers: hdr }).then((r) => r.json()),
  ]);

  const ops   = normOps(opsR.status   === "fulfilled" ? opsR.value   : []);
  const risks = normRisk(riskR.status === "fulfilled" ? riskR.value  : []);
  const know  = normKnow(knowR.status === "fulfilled" ? knowR.value  : []);

  const total   = ops.length + risks.length + know.length;
  const critical = risks.filter((r) => /critical/i.test(r.severity)).length;

  const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      message:
        `JARVIS unified intelligence timeline: ${total} total events across all streams — ` +
        `${ops.length} operational events, ${risks.length} risk signals (${critical} critical), ` +
        `${know.length} knowledge articles. Newest ops event: "${ops[0]?.title || "none"}". ` +
        `Newest risk signal: "${risks[0]?.title || "none"}". ` +
        `Give a 2-sentence unified situational assessment — formal British butler tone, first person.`,
    }),
  });
  const d = await r.json();
  return (d.answer || "Unified intelligence timeline compiled, sir. All streams are under review.").trim();
}

// ── component ─────────────────────────────────────────────────────────────────

export default function UnifiedIntelTimeline() {
  const [open,      setOpen]      = useState(false);
  const [items,     setItems]     = useState([]);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const [loading,   setLoading]   = useState(false);

  async function load() {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [opsR, riskR, knowR] = await Promise.allSettled([
        fetch(`${base}/v1/ops/events`,       { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/entities/RiskSignal`, { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/knowledge/`,          { headers: hdr }).then((r) => r.json()),
      ]);
      const merged = [
        ...normOps(opsR.status   === "fulfilled" ? opsR.value   : []),
        ...normRisk(riskR.status === "fulfilled" ? riskR.value  : []),
        ...normKnow(knowR.status === "fulfilled" ? knowR.value  : []),
      ].sort((a, b) => parseTs(b.ts) - parseTs(a.ts));
      setItems(merged);
    } catch {
      /* network failure — show what we have */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const toggle = () =>
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    window.addEventListener("jarvis:uitl-toggle", toggle);
    return () => window.removeEventListener("jarvis:uitl-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(load, 300_000); // 5-min refresh
    return () => clearInterval(t);
  }, [open]);

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const script = await buildUitlScript();
      setBrief(script);
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text: script } })
      );
    } catch {
      setBrief("Assessment unavailable, sir.");
    } finally {
      setAssessing(false);
    }
  }

  const opsCnt  = items.filter((i) => i.kind === "OPS").length;
  const riskCnt = items.filter((i) => i.kind === "RISK").length;
  const knowCnt = items.filter((i) => i.kind === "KNOWLEDGE").length;

  const visible = items.filter((item) => {
    if (tab !== "ALL" && item.kind !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const btnStyle = {
    position: "fixed", left: 982680, bottom: 8, zIndex: 132,
    background: "#0a1628cc", border: `1px solid ${CY}55`, borderRadius: 4,
    color: CY, fontSize: 10, fontFamily: "monospace", padding: "3px 8px",
    cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
  };

  if (!open) {
    return (
      <button style={btnStyle} onClick={() => { setOpen(true); load(); }}>
        ◈ UITL
        {riskCnt > 0 && (
          <span style={{ background: RED, color: "#fff", borderRadius: 8, padding: "0 5px", fontSize: 9 }}>
            {riskCnt}
          </span>
        )}
      </button>
    );
  }

  const panelStyle = {
    position: "fixed", bottom: 60, left: "50%", transform: "translateX(-50%)",
    width: 660, maxHeight: "80vh", overflow: "hidden",
    background: "#050d1bec", border: `1px solid ${CY}44`,
    borderRadius: 8, zIndex: 10001, display: "flex", flexDirection: "column",
    fontFamily: "monospace", color: CY,
  };

  const hdr = {
    padding: "10px 14px 6px", borderBottom: `1px solid ${CY}22`,
    display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
  };

  const tabBtn = (label, active) => ({
    padding: "3px 10px", cursor: "pointer", fontSize: 10, borderRadius: 3,
    background: active ? `${CY}22` : "transparent",
    border: `1px solid ${active ? CY : CY + "44"}`,
    color: active ? CY : `${CY}99`,
  });

  const kindColour = { OPS: CY, RISK: RED, KNOWLEDGE: GR };
  const kindBg     = { OPS: `${CY}22`, RISK: `${RED}22`, KNOWLEDGE: `${GR}22` };

  return (
    <div style={panelStyle}>
      {/* header */}
      <div style={hdr}>
        <span style={{ color: CY, letterSpacing: 2, fontSize: 11, fontWeight: "bold" }}>
          ◈ UNIFIED INTEL TIMELINE
        </span>
        <span style={{ fontSize: 10, color: `${CY}99`, marginLeft: 4 }}>
          {items.length} events · {opsCnt} OPS · {riskCnt} RISK · {knowCnt} KNOWLEDGE
        </span>
        {loading && <span style={{ fontSize: 9, color: `${CY}88` }}>loading…</span>}
        <button
          onClick={() => setOpen(false)}
          style={{ marginLeft: "auto", background: "none", border: "none", color: `${CY}99`, cursor: "pointer", fontSize: 14 }}
        >✕</button>
      </div>

      {/* filter row */}
      <div style={{ padding: "6px 14px", borderBottom: `1px solid ${CY}22`, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {["ALL", "OPS", "RISK", "KNOWLEDGE"].map((t) => (
          <button key={t} style={tabBtn(t, tab === t)} onClick={() => setTab(t)}>{t}</button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: "auto", background: "#0a1628", border: `1px solid ${CY}33`,
            borderRadius: 3, color: CY, fontSize: 10, padding: "2px 7px", outline: "none",
          }}
        />
      </div>

      {/* assess button */}
      <div style={{ padding: "6px 14px", borderBottom: `1px solid ${CY}22` }}>
        <button
          onClick={assess}
          disabled={assessing || items.length === 0}
          style={{
            background: assessing ? `${CY}33` : `${CY}22`, border: `1px solid ${CY}55`,
            borderRadius: 3, color: CY, fontSize: 10, padding: "3px 10px", cursor: "pointer",
          }}
        >
          {assessing ? "assessing…" : "▶ ASSESS SITUATION"}
        </button>
        {brief && (
          <p style={{ margin: "6px 0 0", fontSize: 10, color: `${CY}cc`, lineHeight: 1.5 }}>
            {brief}
          </p>
        )}
      </div>

      {/* timeline */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
        {visible.length === 0 && (
          <div style={{ color: `${CY}55`, fontSize: 11, textAlign: "center", padding: 20 }}>
            {loading ? "Loading…" : "No events match filters."}
          </div>
        )}
        {visible.map((item, idx) => (
          <div
            key={item.id + idx}
            style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              padding: "7px 0", borderBottom: `1px solid ${CY}11`,
            }}
          >
            {/* timeline bar + dot */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 14, flexShrink: 0 }}>
              <div style={{
                width: 10, height: 10, borderRadius: "50%",
                background: kindColour[item.kind],
                boxShadow: `0 0 6px ${kindColour[item.kind]}`,
                flexShrink: 0,
              }} />
              {idx < visible.length - 1 && (
                <div style={{ width: 1, flex: 1, background: `${CY}18`, marginTop: 3, minHeight: 14 }} />
              )}
            </div>

            {/* content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                {/* kind badge */}
                <span style={{
                  background: kindBg[item.kind], border: `1px solid ${kindColour[item.kind]}55`,
                  borderRadius: 3, color: kindColour[item.kind], fontSize: 9, padding: "1px 5px",
                  letterSpacing: 1, flexShrink: 0,
                }}>
                  {item.kind}
                </span>

                {/* severity badge (OPS/RISK only) */}
                {item.severity && (
                  <span style={{
                    background: /critical/i.test(item.severity) ? `${RED}33` : `${AM}22`,
                    border: `1px solid ${/critical/i.test(item.severity) ? RED : AM}55`,
                    borderRadius: 3,
                    color: /critical/i.test(item.severity) ? RED : AM,
                    fontSize: 9, padding: "1px 5px", letterSpacing: 1, flexShrink: 0,
                  }}>
                    {item.severity.toUpperCase()}
                  </span>
                )}

                <span style={{ color: `${CY}66`, fontSize: 9, marginLeft: "auto", flexShrink: 0 }}>
                  {relTime(item.ts)}
                </span>
              </div>

              <div style={{ fontSize: 11, color: CY, marginTop: 3, wordBreak: "break-word" }}>
                {item.title}
              </div>
              {item.subtitle && (
                <div style={{ fontSize: 10, color: `${CY}77`, marginTop: 2, wordBreak: "break-word" }}>
                  {item.subtitle}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
