import { useState, useEffect, useCallback } from "react";

const API = "";

export function isCoerskQuery(q) {
  const t = q.toLowerCase();
  return (
    t.includes("coersk") ||
    t.includes("contact ops risk") ||
    t.includes("ops risk contact") ||
    t.includes("contact exposure triple") ||
    t.includes("contact risk ops") ||
    t.includes("ops event risk contact") ||
    t.includes("contact ops events risk") ||
    t.includes("fully exposed contact") ||
    t.includes("exposed contact triple")
  );
}

export async function buildCoerskScript() {
  try {
    const [cRes, oRes, rRes] = await Promise.all([
      fetch(`${API}/entities/Contact`),
      fetch(`${API}/v1/ops/events`),
      fetch(`${API}/entities/RiskSignal`),
    ]);
    const contacts = cRes.ok ? await cRes.json() : [];
    const events = oRes.ok ? await oRes.json() : [];
    const risks = rRes.ok ? await rRes.json() : [];

    const cList = Array.isArray(contacts) ? contacts : contacts.items ?? contacts.data ?? [];
    const oList = Array.isArray(events) ? events : events.items ?? events.data ?? [];
    const rList = Array.isArray(risks) ? risks : risks.items ?? risks.data ?? [];

    let fullyExposed = 0, opsOnly = 0, riskOnly = 0, clear = 0;
    cList.forEach((c) => {
      const name = (c.name || c.full_name || c.display_name || c.id || "").toLowerCase();
      const token = name.split(/[\s_,.-]/)[0];
      if (token.length < 2) { clear++; return; }
      const hasO = oList.some((e) => (e.title || e.name || e.description || e.body || "").toLowerCase().includes(token));
      const hasR = rList.some((r) => (r.name || r.title || r.description || r.signal || "").toLowerCase().includes(token));
      if (hasO && hasR) fullyExposed++;
      else if (hasO) opsOnly++;
      else if (hasR) riskOnly++;
      else clear++;
    });

    const total = cList.length;
    const pct = total ? ((fullyExposed / total) * 100).toFixed(1) : "0.0";
    return `COERSK Contact × Ops Events × Risk Signal Triple Nexus: ${total} contacts | ${oList.length} ops events | ${rList.length} risk signals | ${fullyExposed} fully exposed (${pct}%) | ${opsOnly} ops-event-only | ${riskOnly} risk-signal-only | ${clear} contacts with no ops or risk cross-reference.`;
  } catch (e) {
    return `COERSK: fetch error — ${e.message}`;
  }
}

function classify(contact, oList, rList) {
  const name = (contact.name || contact.full_name || contact.display_name || contact.id || "").toLowerCase();
  const token = name.split(/[\s_,.-]/)[0];
  if (token.length < 2) return { type: "CLEAR", oMatches: [], rMatches: [] };
  const oMatches = oList.filter((e) => (e.title || e.name || e.description || e.body || "").toLowerCase().includes(token));
  const rMatches = rList.filter((r) => (r.name || r.title || r.description || r.signal || "").toLowerCase().includes(token));
  const hasO = oMatches.length > 0;
  const hasR = rMatches.length > 0;
  if (hasO && hasR) return { type: "FULLY_EXPOSED", oMatches, rMatches };
  if (hasO) return { type: "OPS_ONLY", oMatches, rMatches };
  if (hasR) return { type: "RISK_ONLY", oMatches, rMatches };
  return { type: "CLEAR", oMatches, rMatches };
}

const TYPE_COLOR = {
  FULLY_EXPOSED: "#ef4444",
  OPS_ONLY: "#f97316",
  RISK_ONLY: "#a78bfa",
  CLEAR: "#64748b",
};

const SEV_COLOR = { CRITICAL: "#ef4444", HIGH: "#f97316", MEDIUM: "#eab308", LOW: "#22c55e" };
const OPS_SEV_COLOR = { CRITICAL: "#ef4444", HIGH: "#f97316", WARNING: "#eab308", INFO: "#38bdf8" };

export default function ContactOpsRiskTriple() {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [events, setEvents] = useState([]);
  const [risks, setRisks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [cRes, oRes, rRes] = await Promise.all([
        fetch(`${API}/entities/Contact`),
        fetch(`${API}/v1/ops/events`),
        fetch(`${API}/entities/RiskSignal`),
      ]);
      const cj = cRes.ok ? await cRes.json() : [];
      const oj = oRes.ok ? await oRes.json() : [];
      const rj = rRes.ok ? await rRes.json() : [];
      setContacts(Array.isArray(cj) ? cj : cj.items ?? cj.data ?? []);
      setEvents(Array.isArray(oj) ? oj : oj.items ?? oj.data ?? []);
      setRisks(Array.isArray(rj) ? rj : rj.items ?? rj.data ?? []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 90000);
    return () => clearInterval(id);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jarvis:coersk-toggle", handler);
    return () => window.removeEventListener("jarvis:coersk-toggle", handler);
  }, []);

  const classified = contacts.map((c) => ({ ...c, ...classify(c, events, risks) }));

  const fullyExposed = classified.filter((c) => c.type === "FULLY_EXPOSED").length;
  const opsOnly = classified.filter((c) => c.type === "OPS_ONLY").length;
  const riskOnly = classified.filter((c) => c.type === "RISK_ONLY").length;
  const clear = classified.filter((c) => c.type === "CLEAR").length;
  const pct = contacts.length ? ((fullyExposed / contacts.length) * 100).toFixed(1) : "0.0";

  const visible = classified.filter((c) => {
    if (filter !== "ALL" && c.type !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (c.name || c.full_name || c.display_name || c.id || "").toLowerCase().includes(s);
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    try {
      const brief = await buildCoerskScript();
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `COERSK contact triple exposure assessment: ${brief}. Identify the highest-risk contacts and propose 2 immediate protective actions.` }),
      });
      const data = res.ok ? await res.json() : {};
      const text = data.response || data.message || brief;
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      // silent
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Contact × Ops Events × Risk Signal Triple Nexus (COERSK)"
        style={{
          position: "fixed",
          left: 894360,
          bottom: 8,
          zIndex: 254,
          background: "#0f172a",
          border: "1px solid #334155",
          color: "#94a3b8",
          fontSize: 10,
          padding: "3px 7px",
          borderRadius: 4,
          cursor: "pointer",
          letterSpacing: "0.05em",
          fontFamily: "monospace",
        }}
      >
        ◈ COERSK
        {fullyExposed > 0 && (
          <span style={{ marginLeft: 5, background: "#7f1d1d", color: "#fca5a5", borderRadius: 3, padding: "1px 5px", fontSize: 9 }}>
            {fullyExposed}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 60,
        right: 20,
        width: 540,
        maxHeight: "82vh",
        overflowY: "auto",
        background: "#0a0f1e",
        border: "1px solid #1e3a5f",
        borderRadius: 8,
        zIndex: 2540,
        fontFamily: "monospace",
        color: "#e2e8f0",
        boxShadow: "0 0 40px #1e3a5f55",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #1e3a5f", background: "#050d1a" }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: "#38bdf8", letterSpacing: "0.08em" }}>◈ COERSK — Contact × Ops Events × Risk Signal</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load} disabled={loading} style={{ background: "none", border: "1px solid #334155", color: "#94a3b8", fontSize: 10, padding: "2px 8px", borderRadius: 3, cursor: "pointer" }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 14, cursor: "pointer" }}>✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6, padding: "10px 14px" }}>
        {[
          { label: "Contacts", val: contacts.length, color: "#38bdf8" },
          { label: "Fully Exposed", val: fullyExposed, color: "#ef4444" },
          { label: "Ops Only", val: opsOnly, color: "#f97316" },
          { label: "Risk Only", val: riskOnly, color: "#a78bfa" },
          { label: "Coverage %", val: `${pct}%`, color: fullyExposed > 0 ? "#ef4444" : "#00ff88" },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: "#0f172a", border: "1px solid #1e3a5f", borderRadius: 5, padding: "6px 4px", textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* exposed alert */}
      {fullyExposed > 0 && (
        <div style={{ margin: "0 14px 8px", background: "#1c0808", border: "1px solid #7f1d1d", borderRadius: 4, padding: "5px 10px", fontSize: 11, color: "#fca5a5" }}>
          ⚠ {fullyExposed} contacts appear in both active ops events AND risk signals
        </div>
      )}

      {err && <div style={{ margin: "0 14px 8px", color: "#f87171", fontSize: 11 }}>Error: {err}</div>}
      {loading && <div style={{ margin: "0 14px 8px", color: "#38bdf8", fontSize: 11 }}>Loading…</div>}

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 14px 8px", flexWrap: "wrap" }}>
        {["ALL", "FULLY_EXPOSED", "OPS_ONLY", "RISK_ONLY", "CLEAR"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? "#1e3a5f" : "#0f172a",
              border: `1px solid ${filter === f ? "#38bdf8" : "#334155"}`,
              color: filter === f ? "#7dd3fc" : "#64748b",
              fontSize: 10,
              padding: "3px 9px",
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            {f}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search contacts…"
          style={{ flex: 1, minWidth: 100, background: "#0f172a", border: "1px solid #334155", color: "#e2e8f0", fontSize: 10, padding: "3px 8px", borderRadius: 3, outline: "none" }}
        />
      </div>

      {/* contact list */}
      <div style={{ padding: "0 14px 14px" }}>
        {visible.slice(0, 80).map((c, i) => {
          const id = c.id || c.name || c.email || i;
          const isExp = expanded === id;
          const label = c.name || c.full_name || c.display_name || c.email || `Contact ${i + 1}`;
          return (
            <div
              key={id}
              onClick={() => setExpanded(isExp ? null : id)}
              style={{ cursor: "pointer", padding: "6px 8px", marginBottom: 4, background: "#0f172a", border: "1px solid #1e3a5f", borderRadius: 4 }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <span style={{ fontSize: 11, color: "#e2e8f0" }}>{label}</span>
                  {c.role && <span style={{ marginLeft: 6, fontSize: 9, color: "#64748b", background: "#0a0f1e", border: "1px solid #334155", borderRadius: 2, padding: "0 4px" }}>{c.role}</span>}
                  {c.organisation && <span style={{ marginLeft: 4, fontSize: 9, color: "#475569" }}>{c.organisation}</span>}
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: TYPE_COLOR[c.type] ?? "#94a3b8", background: "#0a0f1e", padding: "1px 6px", borderRadius: 3, border: `1px solid ${TYPE_COLOR[c.type] ?? "#334155"}` }}>
                  {c.type}
                </span>
              </div>
              {isExp && (
                <div style={{ marginTop: 8 }}>
                  {c.oMatches?.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 10, color: "#f97316", marginBottom: 3 }}>Ops Events ({c.oMatches.length})</div>
                      {c.oMatches.slice(0, 5).map((e, ei) => (
                        <div key={ei} style={{ fontSize: 10, color: "#94a3b8", padding: "2px 6px", background: "#1a0c04", borderRadius: 3, marginBottom: 2, display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ fontSize: 9, color: OPS_SEV_COLOR[e.severity] ?? "#94a3b8", border: `1px solid ${OPS_SEV_COLOR[e.severity] ?? "#334155"}`, borderRadius: 2, padding: "0 4px" }}>{e.severity || e.type || "EVT"}</span>
                          {e.title || e.name || e.description || e.id}
                        </div>
                      ))}
                    </div>
                  )}
                  {c.rMatches?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: "#a78bfa", marginBottom: 3 }}>Risk Signals ({c.rMatches.length})</div>
                      {c.rMatches.slice(0, 5).map((r, ri) => (
                        <div key={ri} style={{ fontSize: 10, color: "#94a3b8", padding: "2px 6px", background: "#1a0828", borderRadius: 3, marginBottom: 2, display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ fontSize: 9, color: SEV_COLOR[r.severity] ?? "#94a3b8", border: `1px solid ${SEV_COLOR[r.severity] ?? "#334155"}`, borderRadius: 2, padding: "0 4px" }}>{r.severity || "?"}</span>
                          {r.name || r.title || r.signal || r.id}
                        </div>
                      ))}
                    </div>
                  )}
                  {c.oMatches?.length === 0 && c.rMatches?.length === 0 && (
                    <div style={{ fontSize: 10, color: "#64748b" }}>No ops event or risk signal cross-references found.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {visible.length === 0 && !loading && <div style={{ fontSize: 11, color: "#64748b", textAlign: "center", padding: 12 }}>No contacts match filter.</div>}
        {visible.length > 80 && <div style={{ fontSize: 10, color: "#64748b", textAlign: "center", padding: 4 }}>Showing 80 of {visible.length} — use search to narrow</div>}
      </div>

      {/* assess */}
      <div style={{ padding: "0 14px 14px" }}>
        <button
          onClick={assess}
          disabled={assessing}
          style={{ width: "100%", background: assessing ? "#0f172a" : "#1e3a5f", border: "1px solid #38bdf8", color: assessing ? "#64748b" : "#7dd3fc", fontSize: 11, padding: "7px 0", borderRadius: 4, cursor: assessing ? "default" : "pointer", letterSpacing: "0.06em" }}
        >
          {assessing ? "▶ ASSESSING…" : "▶ ASSESS — Contact Exposure Triple Brief"}
        </button>
      </div>
    </div>
  );
}
