import { useState, useEffect, useRef, useCallback } from "react";

const CY = "#00D4FF";
const AM = "#F59E0B";
const RD = "#EF4444";
const GN = "#22C55E";
const API_BASE = (typeof window !== "undefined" && window.JARVIS_API_BASE) || "";
const API_KEY = (typeof window !== "undefined" && window.JARVIS_API_KEY) || "dev-key";

function tokenise(s) {
  return (s || "").toLowerCase().split(/[\s,;:/_-]+/).filter(t => t.length > 2);
}

function correlate(contact, risks) {
  const cTokens = [
    ...tokenise(contact.name),
    ...tokenise(contact.role),
    ...tokenise(contact.organisation || contact.organization),
    ...tokenise(contact.description),
    ...tokenise(contact.tags?.join?.(" ")),
  ];
  return risks.filter(risk => {
    const rTokens = [
      ...tokenise(risk.title),
      ...tokenise(risk.description),
      ...tokenise(risk.category),
      ...tokenise(risk.tags?.join?.(" ")),
    ];
    return cTokens.some(ct => rTokens.includes(ct)) || rTokens.some(rt => cTokens.includes(rt));
  });
}

async function fetchContacts() {
  const r = await fetch(`${API_BASE}/entities/Contact`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`contacts ${r.status}`);
  const d = await r.json();
  return Array.isArray(d) ? d : (d.items || d.data || d.contacts || []);
}

async function fetchRisks() {
  const r = await fetch(`${API_BASE}/entities/RiskSignal`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`risks ${r.status}`);
  const d = await r.json();
  return Array.isArray(d) ? d : (d.items || d.data || d.risks || []);
}

export function isCreiskQuery(q) {
  return /\b(contact risk|people risk|who is at risk|crisk|risk contacts|contact exposure|people exposure|at.?risk contacts?|contact.?risk.?exposure)\b/i.test(q);
}

export async function buildCreiskScript() {
  try {
    const [contacts, risks] = await Promise.all([fetchContacts(), fetchRisks()]);
    const linked = contacts.filter(c => correlate(c, risks).length > 0);
    const r = await fetch(`${API_BASE}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `Contact risk exposure report: ${contacts.length} contacts checked against ${risks.length} active risk signals. ${linked.length} contacts appear exposed. In 2 sentences, assess the personnel-level risk exposure and recommend a priority action.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Contact risk exposure analysis complete.").trim();
  } catch {
    return "Unable to assess contact risk exposure at this time.";
  }
}

function SevBadge({ sev }) {
  const s = typeof sev === "number" ? sev : parseInt(sev, 10) || 0;
  const col = s >= 80 ? RD : s >= 50 ? AM : CY;
  return (
    <span style={{
      background: col + "22", border: `1px solid ${col}`, color: col,
      borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 700, letterSpacing: 1,
    }}>
      {s >= 80 ? "CRITICAL" : s >= 50 ? "HIGH" : "MED"} {s}
    </span>
  );
}

export default function ContactRiskExposure() {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [risks, setRisks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [c, r] = await Promise.all([fetchContacts(), fetchRisks()]);
      setContacts(c);
      setRisks(r);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:crisk-toggle", onToggle);
    return () => window.removeEventListener("jarvis:crisk-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const enriched = contacts.map(c => ({
    ...c,
    matched: correlate(c, risks),
  }));

  const atRisk = enriched.filter(c => c.matched.length > 0);
  const clear = enriched.filter(c => c.matched.length === 0);

  const displayed = enriched
    .filter(c => filter === "ALL" ? true : filter === "AT_RISK" ? c.matched.length > 0 : c.matched.length === 0)
    .filter(c => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (c.name || "").toLowerCase().includes(s)
        || (c.role || "").toLowerCase().includes(s)
        || (c.organisation || c.organization || "").toLowerCase().includes(s);
    });

  async function assess() {
    setAssessing(true); setBrief("");
    const script = await buildCreiskScript();
    setBrief(script);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    setAssessing(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Contact Risk Exposure"
        style={{
          position: "fixed", bottom: 8, left: 12920, zIndex: 133,
          background: "rgba(0,0,0,0.85)", border: `1px solid ${atRisk.length > 0 ? AM : CY}`,
          color: atRisk.length > 0 ? AM : CY, borderRadius: 4,
          padding: "3px 8px", fontSize: 10, fontWeight: 700, letterSpacing: 1,
          cursor: "pointer", fontFamily: "monospace",
        }}
      >
        ◈ CRISK{atRisk.length > 0 && <span style={{ marginLeft: 4, color: RD }}>{atRisk.length}</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, right: 20, zIndex: 9100, width: 480,
      background: "rgba(0,8,20,0.97)", border: `1px solid ${CY}44`,
      borderRadius: 8, fontFamily: "monospace", color: CY,
      boxShadow: `0 0 32px ${CY}22`,
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", borderBottom: `1px solid ${CY}33`,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2 }}>
          ◈ CONTACT RISK EXPOSURE
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load} disabled={loading}
            style={{ background: "none", border: `1px solid ${CY}55`, color: CY, borderRadius: 3, padding: "2px 8px", fontSize: 10, cursor: "pointer" }}>
            {loading ? "…" : "↺"}
          </button>
          <button onClick={() => setOpen(false)}
            style={{ background: "none", border: `1px solid ${RD}55`, color: RD, borderRadius: 3, padding: "2px 8px", fontSize: 10, cursor: "pointer" }}>
            ✕
          </button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px" }}>
        {[
          { label: "CONTACTS", val: contacts.length, col: CY },
          { label: "RISKS", val: risks.length, col: CY },
          { label: "AT RISK", val: atRisk.length, col: atRisk.length > 0 ? AM : GN },
          { label: "CLEAR", val: clear.length, col: GN },
        ].map(({ label, val, col }) => (
          <div key={label} style={{
            flex: 1, background: col + "11", border: `1px solid ${col}44`,
            borderRadius: 6, padding: "6px 8px", textAlign: "center",
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 9, opacity: 0.7, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filter + search */}
      <div style={{ padding: "0 14px 8px", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {["ALL", "AT_RISK", "CLEAR"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{
              background: filter === f ? CY + "22" : "none",
              border: `1px solid ${filter === f ? CY : CY + "44"}`,
              color: filter === f ? CY : CY + "88",
              borderRadius: 3, padding: "2px 10px", fontSize: 10, cursor: "pointer",
            }}>
            {f.replace("_", " ")}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search contacts…"
          style={{
            marginLeft: "auto", background: "none", border: `1px solid ${CY}44`,
            color: CY, borderRadius: 3, padding: "2px 8px", fontSize: 10,
            outline: "none", width: 130,
          }}
        />
      </div>

      {/* List */}
      <div style={{ maxHeight: 320, overflowY: "auto", padding: "0 14px" }}>
        {err && <div style={{ color: RD, fontSize: 11, padding: "8px 0" }}>{err}</div>}
        {!err && displayed.length === 0 && !loading && (
          <div style={{ color: CY + "66", fontSize: 11, padding: "12px 0", textAlign: "center" }}>No contacts match.</div>
        )}
        {displayed.map((c, i) => {
          const isEx = expanded === i;
          const isAtR = c.matched.length > 0;
          return (
            <div key={c.id || c.name || i} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isEx ? null : i)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 5,
                  background: isAtR ? RD + "11" : CY + "08",
                  border: `1px solid ${isAtR ? RD + "44" : CY + "22"}`,
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 11, flex: 1, color: isAtR ? "#FFB3B3" : CY }}>
                  {c.name || c.id || "—"}
                </span>
                {c.role && (
                  <span style={{ fontSize: 10, opacity: 0.6, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.role}
                  </span>
                )}
                {isAtR
                  ? <span style={{ fontSize: 10, color: AM, fontWeight: 700 }}>{c.matched.length} risk{c.matched.length > 1 ? "s" : ""} ▼</span>
                  : <span style={{ fontSize: 10, color: GN }}>CLEAR</span>
                }
              </div>
              {isEx && isAtR && (
                <div style={{ padding: "4px 10px 4px 20px", display: "flex", flexDirection: "column", gap: 4 }}>
                  {c.matched.map((rk, ri) => (
                    <div key={rk.id || ri} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "5px 8px", borderRadius: 4,
                      background: RD + "0A", border: `1px solid ${RD}33`,
                    }}>
                      <span style={{ fontSize: 10, flex: 1, color: "#FFB3B3" }}>{rk.title || rk.name || "Risk signal"}</span>
                      <SevBadge sev={rk.severity ?? rk.score ?? 0} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Brief */}
      {brief && (
        <div style={{
          margin: "8px 14px", padding: "8px 10px", background: CY + "0A",
          border: `1px solid ${CY}33`, borderRadius: 5, fontSize: 11, lineHeight: 1.5,
        }}>
          {brief}
        </div>
      )}

      {/* Assess button */}
      <div style={{ padding: "8px 14px 12px", borderTop: `1px solid ${CY}22`, marginTop: 6 }}>
        <button
          onClick={assess} disabled={assessing || loading}
          style={{
            width: "100%", background: CY + "18", border: `1px solid ${CY}66`,
            color: CY, borderRadius: 4, padding: "6px 0", fontSize: 11,
            fontWeight: 700, letterSpacing: 1, cursor: "pointer",
          }}
        >
          {assessing ? "ASSESSING…" : "▶ ASSESS PEOPLE EXPOSURE"}
        </button>
      </div>
    </div>
  );
}
