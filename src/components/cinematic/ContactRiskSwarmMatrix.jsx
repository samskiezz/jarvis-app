/**
 * ContactRiskSwarmMatrix — F304
 * Fetches /entities/Contact + /entities/RiskSignal + /entities/SwarmJob;
 * keyword-matches each contact against active risks and running swarm jobs
 * to surface personnel exposure and assignment coverage.
 * Stat tiles (contacts / at-risk / assigned / unprotected);
 * severity-sorted rows; expandable rows show matched risks + swarm jobs;
 * filter tabs ALL / AT-RISK / ASSIGNED / UNPROTECTED;
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS;
 * ◈ CRSM toggle (left:60680, bottom:8, zIndex:117);
 * voice "contact risk"/"personnel risk"/"contact swarm"/"personnel matrix"/"crsm";
 * jarvis:contact-risk-swarm-toggle event; 90-s auto-refresh.
 * Additive-only — no edits to CinematicShell/CinematicHome/JarvisLoader.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GR = "#00FF9F";
const AM = "#FFB800";
const RD = "#FF4444";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";
const POLL_MS = 90_000;

const CRSM_RE =
  /\bcontact.?risk\b|\bpersonnel.?risk\b|\bcontact.?swarm\b|\bpersonnel.?swarm\b|\bpersonnel.?matrix\b|\bcrsm\b|\bcontact.?expos\b|\bpersonnel.?expos\b|\bwho.?at.?risk\b|\bcontact.?coverage\b/i;

export function isContactRiskSwarmQuery(text) {
  return CRSM_RE.test(text || "");
}

function tokenize(str) {
  return (str || "")
    .toLowerCase()
    .split(/[\s,;:\-_/()[\]{}\.]+/)
    .filter((t) => t.length >= 3);
}

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

function matchItems(contact, items, itemNameFields = ["title", "name", "description"]) {
  const cTokens = tokenize(
    (contact.name || contact.title || "") +
      " " +
      (contact.role || contact.title || "") +
      " " +
      (contact.department || contact.organization || "") +
      " " +
      (contact.tags || []).join(" "),
  );
  return items.filter((item) => {
    const iText = itemNameFields.map((f) => item[f] || "").join(" ");
    const iTokens = tokenize(iText);
    return cTokens.some((ct) => iTokens.includes(ct));
  });
}

export async function buildContactRiskSwarmScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [cr, rr, sr] = await Promise.allSettled([
    fetch(`${base}/entities/Contact`, { headers }),
    fetch(`${base}/entities/RiskSignal`, { headers }),
    fetch(`${base}/entities/SwarmJob`, { headers }),
  ]);
  if (cr.status !== "fulfilled" || !cr.value.ok)
    return "Contact data unavailable, sir.";
  const cd = await cr.value.json();
  const contacts = Array.isArray(cd) ? cd : cd.contacts || cd.items || cd.data || [];
  const risks = rr.status === "fulfilled" && rr.value.ok
    ? (() => { let d; return rr.value.json().then(d => Array.isArray(d) ? d : d.risks || d.items || d.data || []); })()
    : Promise.resolve([]);
  const swarms = sr.status === "fulfilled" && sr.value.ok
    ? (() => { let d; return sr.value.json().then(d => Array.isArray(d) ? d : d.jobs || d.items || d.data || []); })()
    : Promise.resolve([]);
  const [riskArr, swarmArr] = await Promise.all([risks, swarms]);
  const atRisk = contacts.filter(c => matchItems(c, riskArr, ["title","name","description","category"]).length > 0);
  const assigned = contacts.filter(c => matchItems(c, swarmArr, ["title","name","description","type"]).length > 0);
  const unprotected = contacts.filter(
    c => matchItems(c, riskArr, ["title","name","description","category"]).length > 0 &&
         matchItems(c, swarmArr, ["title","name","description","type"]).length === 0
  );
  if (!contacts.length) return "No contact data available, sir.";
  return (
    `Personnel exposure matrix complete. ${contacts.length} contacts assessed. ` +
    `${atRisk.length} contacts are exposed to active risk signals. ` +
    `${assigned.length} contacts are assigned to swarm jobs. ` +
    `${unprotected.length} contacts are at risk with no swarm job coverage. ` +
    (unprotected.length > 0
      ? `Top unprotected contact: ${unprotected[0].name || unprotected[0].title || "unknown"}.`
      : "All at-risk contacts have swarm job coverage.")
  );
}

const TAG = { background: "rgba(0,0,0,0.75)", border: `1px solid ${CY}33`, borderRadius: 6, padding: "2px 7px", fontSize: 10, color: CY };
const STAT_BOX = { background: "rgba(0,0,0,0.55)", border: `1px solid ${CY}33`, borderRadius: 8, padding: "10px 16px", minWidth: 90, textAlign: "center" };
const SEV_COLORS = { critical: RD, high: AM, medium: CY, low: GR, info: "#888" };

function SevBadge({ sev }) {
  const s = (sev || "").toLowerCase();
  const col = SEV_COLORS[s] || CY;
  return (
    <span style={{ ...TAG, borderColor: col + "55", color: col, textTransform: "uppercase", letterSpacing: 1 }}>
      {sev || "unknown"}
    </span>
  );
}

export default function ContactRiskSwarmMatrix() {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [risks, setRisks] = useState([]);
  const [swarms, setSwarms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState({});
  const [assessText, setAssessText] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const base = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [cr, rr, sr] = await Promise.allSettled([
        fetch(`${base}/entities/Contact`, { headers }),
        fetch(`${base}/entities/RiskSignal`, { headers }),
        fetch(`${base}/entities/SwarmJob`, { headers }),
      ]);
      if (cr.status === "fulfilled" && cr.value.ok) {
        const d = await cr.value.json();
        setContacts(Array.isArray(d) ? d : d.contacts || d.items || d.data || []);
      } else setErr("Contact fetch failed");
      if (rr.status === "fulfilled" && rr.value.ok) {
        const d = await rr.value.json();
        setRisks(Array.isArray(d) ? d : d.risks || d.items || d.data || []);
      }
      if (sr.status === "fulfilled" && sr.value.ok) {
        const d = await sr.value.json();
        setSwarms(Array.isArray(d) ? d : d.jobs || d.items || d.data || []);
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("jarvis:contact-risk-swarm-toggle", handler);
    return () => window.removeEventListener("jarvis:contact-risk-swarm-toggle", handler);
  }, []);

  const mapped = contacts.map((c) => ({
    ...c,
    _risks: matchItems(c, risks, ["title", "name", "description", "category"]),
    _swarms: matchItems(c, swarms, ["title", "name", "description", "type"]),
  }));

  mapped.sort((a, b) => {
    const aMaxSev = a._risks.reduce((m, r) => Math.min(m, SEV_ORDER[(r.severity || "").toLowerCase()] ?? 99), 99);
    const bMaxSev = b._risks.reduce((m, r) => Math.min(m, SEV_ORDER[(r.severity || "").toLowerCase()] ?? 99), 99);
    return aMaxSev - bMaxSev;
  });

  const filtered = mapped
    .filter((c) => {
      const atRisk = c._risks.length > 0;
      const assigned = c._swarms.length > 0;
      if (tab === "AT-RISK") return atRisk;
      if (tab === "ASSIGNED") return assigned;
      if (tab === "UNPROTECTED") return atRisk && !assigned;
      return true;
    })
    .filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (c.name || c.title || "").toLowerCase().includes(q) ||
        (c.role || "").toLowerCase().includes(q) ||
        (c.department || c.organization || "").toLowerCase().includes(q)
      );
    });

  const atRiskCount = mapped.filter((c) => c._risks.length > 0).length;
  const assignedCount = mapped.filter((c) => c._swarms.length > 0).length;
  const unprotectedCount = mapped.filter((c) => c._risks.length > 0 && c._swarms.length === 0).length;

  async function handleAssess() {
    setAssessing(true);
    setAssessText("");
    try {
      const base = apiBase();
      const prompt = `Briefly assess personnel risk exposure: ${atRiskCount} of ${mapped.length} contacts are at risk, ${unprotectedCount} are unprotected (at risk but no swarm job assigned). Summarize in 2 sentences.`;
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      if (res.ok) {
        const d = await res.json();
        const txt = d.response || d.message || d.content || "";
        setAssessText(txt);
        window.dispatchEvent(new CustomEvent("jarvis:speak", { detail: { text: txt } }));
      } else {
        setAssessText("Assessment unavailable at this time.");
      }
    } catch {
      setAssessText("Assessment failed.");
    } finally {
      setAssessing(false);
    }
  }

  const TABS = ["ALL", "AT-RISK", "ASSIGNED", "UNPROTECTED"];

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed", bottom: 8, left: 60680, zIndex: 117,
          background: open ? `${CY}22` : "rgba(0,0,0,0.7)",
          border: `1px solid ${CY}55`, borderRadius: 6, color: CY,
          fontSize: 10, padding: "3px 8px", cursor: "pointer",
          fontFamily: "monospace", letterSpacing: 1, whiteSpace: "nowrap",
        }}
        title="Contact × RiskSignal × SwarmJob Personnel Exposure Matrix"
      >
        ◈ CRSM
      </button>

      {open && (
        <div
          style={{
            position: "fixed", top: 40, right: 16, width: 580, maxHeight: "82vh",
            background: "rgba(5,10,18,0.97)", border: `1px solid ${CY}55`,
            borderRadius: 12, zIndex: 9200, display: "flex", flexDirection: "column",
            fontFamily: "monospace", color: CY, boxShadow: `0 0 40px ${CY}22`,
            overflow: "hidden",
          }}
        >
          {/* header */}
          <div style={{ padding: "12px 16px 8px", borderBottom: `1px solid ${CY}22`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, letterSpacing: 2 }}>◈ CONTACT × RISK × SWARM MATRIX</span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 16, lineHeight: 1 }}
            >×</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "10px 16px", borderBottom: `1px solid ${CY}11` }}>
            <div style={STAT_BOX}>
              <div style={{ fontSize: 18, fontWeight: "bold", color: CY }}>{mapped.length}</div>
              <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>CONTACTS</div>
            </div>
            <div style={STAT_BOX}>
              <div style={{ fontSize: 18, fontWeight: "bold", color: RD }}>{atRiskCount}</div>
              <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>AT RISK</div>
            </div>
            <div style={STAT_BOX}>
              <div style={{ fontSize: 18, fontWeight: "bold", color: GR }}>{assignedCount}</div>
              <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>ASSIGNED</div>
            </div>
            <div style={{ ...STAT_BOX, position: "relative" }}>
              <div style={{ fontSize: 18, fontWeight: "bold", color: unprotectedCount > 0 ? AM : GR }}>
                {unprotectedCount}
              </div>
              <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>UNPROTECTED</div>
              {unprotectedCount > 0 && (
                <span style={{ position: "absolute", top: 4, right: 6, width: 6, height: 6, borderRadius: "50%",
                  background: AM, boxShadow: `0 0 6px ${AM}`, animation: "crsmPulse 1.2s ease-in-out infinite" }} />
              )}
            </div>
          </div>

          {/* filter tabs + search */}
          <div style={{ display: "flex", gap: 4, padding: "8px 16px 0", alignItems: "center", flexWrap: "wrap" }}>
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "rgba(0,0,0,0.4)",
                  border: `1px solid ${tab === t ? CY : CY + "33"}`, borderRadius: 5,
                  color: tab === t ? CY : "#666", fontSize: 9, padding: "3px 10px",
                  cursor: "pointer", letterSpacing: 1,
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
                flex: 1, background: "rgba(0,0,0,0.5)", border: `1px solid ${CY}33`,
                borderRadius: 5, color: CY, fontSize: 10, padding: "3px 8px",
                outline: "none", fontFamily: "monospace", marginLeft: 4, minWidth: 100,
              }}
            />
            <button
              onClick={handleAssess}
              disabled={assessing}
              style={{
                background: assessing ? `${CY}11` : `${CY}22`, border: `1px solid ${CY}55`,
                borderRadius: 5, color: CY, fontSize: 9, padding: "3px 10px",
                cursor: assessing ? "default" : "pointer", letterSpacing: 1, marginLeft: 4,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* assess result */}
          {assessText && (
            <div style={{ margin: "6px 16px 0", padding: "7px 10px", background: "rgba(0,0,0,0.4)",
              border: `1px solid ${CY}33`, borderRadius: 6, fontSize: 10, color: "#aec8e0", lineHeight: 1.5 }}>
              {assessText}
            </div>
          )}

          {/* list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px 12px" }}>
            {loading && !contacts.length && (
              <div style={{ color: "#666", fontSize: 11, textAlign: "center", paddingTop: 24 }}>loading…</div>
            )}
            {err && (
              <div style={{ color: RD, fontSize: 10, padding: "8px 0" }}>⚠ {err}</div>
            )}
            {!loading && !err && filtered.length === 0 && (
              <div style={{ color: "#555", fontSize: 11, textAlign: "center", paddingTop: 24 }}>no contacts match this filter</div>
            )}
            {filtered.map((contact, idx) => {
              const isAtRisk = contact._risks.length > 0;
              const isAssigned = contact._swarms.length > 0;
              const isUnprotected = isAtRisk && !isAssigned;
              const rowKey = contact.id || contact.name || idx;
              const isExp = !!expanded[rowKey];
              const dotColor = isUnprotected ? AM : isAtRisk ? RD : isAssigned ? GR : "#555";
              return (
                <div
                  key={rowKey}
                  style={{ borderBottom: `1px solid ${CY}18`, marginBottom: 4, paddingBottom: 4 }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "5px 0" }}
                    onClick={() => setExpanded((prev) => ({ ...prev, [rowKey]: !isExp }))}
                  >
                    <span style={{ color: dotColor, fontSize: 13, minWidth: 14 }}>●</span>
                    <span style={{ flex: 1, fontSize: 11, color: CY }}>
                      {contact.name || contact.title || `Contact #${idx + 1}`}
                    </span>
                    {contact.role && (
                      <span style={{ ...TAG, color: "#888", fontSize: 9 }}>{contact.role}</span>
                    )}
                    {isAtRisk && (
                      <span style={{ ...TAG, borderColor: RD + "55", color: RD, fontSize: 9 }}>
                        {contact._risks.length} RISK{contact._risks.length > 1 ? "S" : ""}
                      </span>
                    )}
                    {isAssigned && (
                      <span style={{ ...TAG, borderColor: GR + "55", color: GR, fontSize: 9 }}>
                        {contact._swarms.length} JOB{contact._swarms.length > 1 ? "S" : ""}
                      </span>
                    )}
                    {isUnprotected && (
                      <span style={{ ...TAG, borderColor: AM + "55", color: AM, fontSize: 9 }}>UNPROTECTED</span>
                    )}
                    <span style={{ color: "#555", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                  </div>
                  {isExp && (
                    <div style={{ paddingLeft: 22, paddingBottom: 6 }}>
                      {(contact.department || contact.organization) && (
                        <div style={{ fontSize: 9, color: "#666", marginBottom: 6 }}>
                          {contact.department || contact.organization}
                        </div>
                      )}
                      {contact._risks.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ fontSize: 9, color: RD, letterSpacing: 1, marginBottom: 4 }}>RISK SIGNALS</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {contact._risks.map((r, ri) => (
                              <div key={r.id || ri} style={{
                                background: "rgba(0,0,0,0.4)", border: `1px solid ${RD}22`,
                                borderRadius: 6, padding: "4px 10px", display: "flex", gap: 8, alignItems: "center",
                              }}>
                                <span style={{ flex: 1, fontSize: 10, color: "#ccc" }}>
                                  {r.title || r.name || `Risk #${ri + 1}`}
                                </span>
                                <SevBadge sev={r.severity} />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {contact._swarms.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, color: GR, letterSpacing: 1, marginBottom: 4 }}>SWARM JOBS</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {contact._swarms.map((j, ji) => (
                              <div key={j.id || ji} style={{
                                background: "rgba(0,0,0,0.4)", border: `1px solid ${GR}22`,
                                borderRadius: 6, padding: "4px 10px", display: "flex", gap: 8, alignItems: "center",
                              }}>
                                <span style={{ flex: 1, fontSize: 10, color: "#ccc" }}>
                                  {j.title || j.name || `Job #${ji + 1}`}
                                </span>
                                {j.status && (
                                  <span style={{ ...TAG, borderColor: GR + "33", color: GR, fontSize: 9 }}>
                                    {j.status}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {contact._risks.length === 0 && contact._swarms.length === 0 && (
                        <div style={{ fontSize: 10, color: "#555" }}>no cross-references detected</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* footer */}
          <div style={{ padding: "6px 16px", borderTop: `1px solid ${CY}22`, fontSize: 9, color: "#555", display: "flex", justifyContent: "space-between" }}>
            <span>auto-refresh 90 s · {filtered.length} of {mapped.length} contacts shown</span>
            {loading && <span style={{ color: AM }}>refreshing…</span>}
          </div>
        </div>
      )}
      <style>{`@keyframes crsmPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.6)}}`}</style>
    </>
  );
}
