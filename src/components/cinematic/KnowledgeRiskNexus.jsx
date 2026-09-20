/**
 * KnowledgeRiskNexus — F595
 * "JARVIS, knowledge risk / risk knowledge / knorsk / which risks have knowledge / knowledge-backed risks"
 * Cross-references /knowledge/ articles against /entities/RiskSignal.
 * Identifies which risk signals have at least one keyword-matching knowledge article
 * (BACKED — risk is documented) vs risks with no matching article (BLIND — knowledge gap).
 * Coverage % tile; ALL/BACKED/BLIND filter tabs + search; click-to-expand matched articles.
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

const KNORSK_RE =
  /\bknorsk\b|\bknowledge.?risk\b|\brisk.?knowledge\b|\bwhich.?risks?.?(have|has).?knowledge\b|\bknowledge.?backed?.?risks?\b|\brisk.?knowledge.?gap\b|\brisk.?articles?\b|\bknowledge.?signal\b|\bknowledge.?risk.?signal\b|\bdocumented.?risks?\b|\bundocumented.?risks?\b|\brisk.?docs?\b/i;

export function isKnorskQuery(text) {
  return KNORSK_RE.test(text || "");
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

const SEV_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function normaliseSignals(data) {
  if (!data) return [];
  const raw =
    data.signals || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((s, i) => ({
    id:          s.id || `sig-${i}`,
    title:       s.title || s.name || s.signal_name || `Signal ${i + 1}`,
    severity:    (s.severity || s.level || "MEDIUM").toUpperCase(),
    description: s.description || s.summary || null,
    source:      s.source || null,
    tags:        s.tags || [],
  }));
}

function normaliseArticles(data) {
  if (!data) return [];
  const raw =
    data.articles || data.items || data.results || data.knowledge ||
    (Array.isArray(data) ? data : []);
  return raw.map((a, i) => ({
    id:      a.id || `art-${i}`,
    title:   a.title || a.name || `Article ${i + 1}`,
    kind:    a.kind || a.category || a.type || "article",
    summary: a.summary || a.content || a.excerpt || null,
    tags:    a.tags || [],
  }));
}

function crossRef(signals, articles) {
  return signals
    .map((sig) => {
      const haystack = `${sig.title} ${sig.description || ""} ${(sig.tags || []).join(" ")}`;
      const matches = articles
        .map((art) => {
          const hits = overlap(
            haystack,
            `${art.title} ${art.summary || ""} ${(art.tags || []).join(" ")}`
          );
          return hits > 0 ? { ...art, hits } : null;
        })
        .filter(Boolean)
        .sort((a, b) => b.hits - a.hits)
        .slice(0, 5);
      return { ...sig, articles: matches, backed: matches.length > 0 };
    })
    .sort((a, b) => {
      if (a.backed !== b.backed) return a.backed ? -1 : 1;
      return (SEV_ORDER[a.severity] ?? 2) - (SEV_ORDER[b.severity] ?? 2);
    });
}

export async function buildKnorskScript() {
  try {
    const base = apiBase();
    const [kRes, sRes] = await Promise.all([
      fetch(`${base}/knowledge/`,          { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const [kData, sData] = await Promise.all([kRes.json(), sRes.json()]);
    const articles = normaliseArticles(kData);
    const signals  = normaliseSignals(sData);
    const rows     = crossRef(signals, articles);
    const backed   = rows.filter((r) => r.backed).length;
    const blind    = rows.length - backed;
    const pct      = rows.length ? Math.round((backed / rows.length) * 100) : 0;
    if (!rows.length) return "No risk signals found in the system, sir.";
    const critBlind = rows.filter(
      (r) => !r.backed && r.severity === "CRITICAL"
    );
    return (
      `${backed} of ${rows.length} risk signals are backed by knowledge articles ` +
      `(${pct}% knowledge coverage). ` +
      (critBlind.length > 0
        ? `${critBlind.length} CRITICAL signal${critBlind.length !== 1 ? "s" : ""} lack any knowledge documentation — immediate gap to address: ${critBlind.slice(0, 2).map((r) => r.title).join(", ")}.`
        : `${blind} lower-severity signal${blind !== 1 ? "s" : ""} remain undocumented in the knowledge base.`)
    );
  } catch {
    return "Unable to reach knowledge or risk signal endpoints, sir.";
  }
}

export default function KnowledgeRiskNexus() {
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
      const [kRes, sRes] = await Promise.all([
        fetch(`${base}/knowledge/`,          { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const [kData, sData] = await Promise.all([kRes.json(), sRes.json()]);
      setRows(crossRef(normaliseSignals(sData), normaliseArticles(kData)));
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
    window.addEventListener("jarvis:knorsk-toggle", toggle);
    return () => window.removeEventListener("jarvis:knorsk-toggle", toggle);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const backed = rows.filter((r) => r.backed);
      const blind  = rows.filter((r) => !r.backed);
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message:
            `Assess knowledge coverage of risk signals: ${rows.length} signals total, ` +
            `${backed.length} have knowledge article backing, ` +
            `${blind.length} are undocumented (knowledge blind spots). ` +
            `Critical undocumented: ${blind.filter((r) => r.severity === "CRITICAL").map((r) => r.title).slice(0, 3).join(", ") || "none"}. ` +
            "Give a 2-sentence intelligence coverage assessment and recommended action.",
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

  const backed   = rows.filter((r) => r.backed).length;
  const blind    = rows.length - backed;
  const pct      = rows.length ? Math.round((backed / rows.length) * 100) : 0;
  const critBlind = rows.filter((r) => !r.backed && r.severity === "CRITICAL").length;

  const visible = rows
    .filter((r) => {
      if (tab === "BACKED") return r.backed;
      if (tab === "BLIND")  return !r.backed;
      return true;
    })
    .filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        r.title.toLowerCase().includes(q) ||
        (r.severity || "").toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q)
      );
    });

  const SEV_COLOR = { CRITICAL: RED, HIGH: AMB, MEDIUM: CY, LOW: GRN };

  const BTN_LEFT = 77_140;
  const BTN_STYLE = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 8,
    zIndex: 148,
    padding: "4px 10px",
    background: "rgba(5,8,13,0.82)",
    border: `1px solid ${critBlind > 0 ? RED : blind > 0 ? AMB : CY}55`,
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
    zIndex: 148,
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

  const KIND_COLOR = {
    article: CY, report: AMB, note: GRN, intelligence: RED,
    analysis: "#BB88FF", brief: "#FF88CC",
  };

  return (
    <>
      <button style={BTN_STYLE} onClick={() => setOpen((o) => !o)} title="Knowledge × Risk Signal Nexus">
        ◈ KNORSK
        {critBlind > 0 && (
          <span style={{ background: RED, color: "#fff", borderRadius: 4, padding: "1px 5px", fontSize: 9 }}>
            {critBlind}
          </span>
        )}
        {critBlind === 0 && blind > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 4, padding: "1px 5px", fontSize: 9 }}>
            {blind}
          </span>
        )}
      </button>

      {open && (
        <div style={PANEL}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>KNOWLEDGE × RISK NEXUS</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              { label: "SIGNALS", value: rows.length, color: CY },
              { label: "BACKED",  value: backed,       color: backed > 0 ? GRN : DIM },
              { label: "BLIND",   value: blind,         color: blind > 0 ? AMB : GRN },
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
              <span style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>KNOWLEDGE COVERAGE</span>
              <span style={{ color: pct >= 70 ? GRN : pct >= 40 ? AMB : RED, fontSize: 10, fontWeight: "bold" }}>{pct}%</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct >= 70 ? GRN : pct >= 40 ? AMB : RED, borderRadius: 2, transition: "width 0.4s" }} />
            </div>
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
            {["ALL", "BACKED", "BLIND"].map((t) => (
              <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search risk signals…"
            style={{ width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.4)", border: `1px solid ${CY}33`, borderRadius: 5, color: "#DCEBF5", padding: "5px 8px", fontSize: 11, marginBottom: 8, outline: "none" }}
          />

          {/* list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 12 }}>No signals match.</div>
            )}
            {visible.map((sig) => (
              <div
                key={sig.id}
                style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${sig.backed ? GRN : AMB}33`, borderRadius: 6, padding: "7px 9px", cursor: "pointer" }}
                onClick={() => setExpanded(expanded === sig.id ? null : sig.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ color: sig.backed ? GRN : AMB, fontSize: 10 }}>{sig.backed ? "●" : "○"}</span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>{sig.title}</span>
                  <span style={{ color: SEV_COLOR[sig.severity] || CY, fontSize: 9, border: `1px solid ${(SEV_COLOR[sig.severity] || CY)}44`, borderRadius: 3, padding: "1px 4px" }}>{sig.severity}</span>
                  <span style={{ color: sig.backed ? GRN : DIM, fontSize: 9 }}>{sig.backed ? `${sig.articles.length} art.` : "BLIND"}</span>
                </div>
                {sig.description && (
                  <div style={{ color: DIM, fontSize: 9 }}>{sig.description.slice(0, 70)}{sig.description.length > 70 ? "…" : ""}</div>
                )}

                {expanded === sig.id && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${CY}22`, paddingTop: 6 }}>
                    {sig.backed ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {sig.articles.map((art) => (
                          <div key={art.id} style={{ background: "rgba(0,229,160,0.04)", border: `1px solid ${GRN}33`, borderRadius: 4, padding: "5px 7px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ color: KIND_COLOR[art.kind] || CY, fontSize: 9, border: `1px solid ${(KIND_COLOR[art.kind] || CY)}44`, borderRadius: 3, padding: "1px 4px" }}>{art.kind}</span>
                              <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{art.title}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>hits: {art.hits}</span>
                            </div>
                            {art.summary && (
                              <div style={{ color: DIM, fontSize: 9, marginTop: 2 }}>{art.summary.slice(0, 80)}{art.summary.length > 80 ? "…" : ""}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No knowledge articles matched this risk signal — intelligence gap.</div>
                    )}
                    {sig.source && (
                      <div style={{ marginTop: 5, color: DIM, fontSize: 9, borderLeft: `2px solid ${CY}33`, paddingLeft: 6 }}>
                        source: {sig.source}
                      </div>
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
