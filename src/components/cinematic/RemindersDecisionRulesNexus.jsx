/**
 * RemindersDecisionRulesNexus — F610
 * "JARVIS, reminders rules / rules reminders / remruls / rule-watched reminders /
 *  unwatched reminders / reminder watchtower / rule reminder coverage"
 * Cross-references /reminders/list against /v1/rules.
 * RULE-WATCHED reminders (≥1 rule keyword-matches) vs UNWATCHED (no watchtower backing).
 * Coverage % tile; ALL/RULE-WATCHED/UNWATCHED filter tabs + search; click-to-expand matched rules.
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

const REMRULS_RE =
  /\bremruls\b|\breminders?.rules?\b|\brules?.reminders?\b|\brule.?watched.?reminders?\b|\bunwatched.?reminders?\b|\breminder.?watchtower\b|\brule.?reminder.?coverage\b|\bwatchtower.?reminders?\b|\breminders?.watchtower\b/i;

export function isRemrulsQuery(text) {
  return REMRULS_RE.test(text || "");
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

function normaliseRules(data) {
  if (!data) return [];
  const arr = Array.isArray(data)           ? data
    : Array.isArray(data?.rules)            ? data.rules
    : Array.isArray(data?.items)            ? data.items
    : Array.isArray(data?.results)          ? data.results
    : [];
  return arr.map((r, i) => ({
    id:        r.id        || `rule-${i}`,
    name:      r.name      || r.title      || `Rule ${i + 1}`,
    target:    r.target    || r.entity     || "",
    condition: r.condition || r.expression || r.expr || "",
    severity:  (r.severity || r.level      || "medium").toString().toUpperCase(),
    enabled:   r.enabled !== false,
  }));
}

function crossRef(reminders, rules) {
  return reminders.map((rem) => {
    const haystack = `${rem.content} ${(rem.tags || []).join(" ")}`;
    const matches = rules
      .map((rule) => {
        const hits = overlap(haystack, `${rule.name} ${rule.target} ${rule.condition}`);
        return hits > 0 ? { ...rule, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 5);
    return { ...rem, rules: matches, watched: matches.length > 0 };
  });
}

export async function buildRemrulsScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [remRes, rulsRes] = await Promise.all([
      fetch(`${base}/reminders/list`, { headers: hdr }),
      fetch(`${base}/v1/rules`,       { headers: hdr }),
    ]);
    const [remData, rulsData] = await Promise.all([remRes.json(), rulsRes.json()]);
    const reminders = normaliseReminders(remData);
    const rules     = normaliseRules(rulsData);
    const rows      = crossRef(reminders, rules);
    const watched   = rows.filter((r) => r.watched).length;
    const unwatched = rows.length - watched;
    const pct       = rows.length ? Math.round((watched / rows.length) * 100) : 0;
    if (!rows.length) return "No reminders found in the system, sir.";
    const topUnwatched = rows
      .filter((r) => !r.watched)
      .slice(0, 2)
      .map((r) => r.content.slice(0, 40))
      .join("; ");
    return (
      `${watched} of ${rows.length} reminders are backed by a watchtower rule (${pct}% coverage). ` +
      (unwatched > 0
        ? `${unwatched} reminder${unwatched !== 1 ? "s" : ""} have no matching decision rule — unwatched notes: ${topUnwatched || "unknown"}.`
        : "All reminders are covered by at least one active watchtower rule.")
    );
  } catch {
    return "Unable to reach reminders or rules endpoints, sir.";
  }
}

const BTN_LEFT = 89_900;

export default function RemindersDecisionRulesNexus() {
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
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [remRes, rulsRes] = await Promise.all([
        fetch(`${base}/reminders/list`, { headers: hdr }),
        fetch(`${base}/v1/rules`,       { headers: hdr }),
      ]);
      const [remData, rulsData] = await Promise.all([remRes.json(), rulsRes.json()]);
      setRows(crossRef(normaliseReminders(remData), normaliseRules(rulsData)));
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen((v) => !v);
    window.addEventListener("jarvis:remruls-toggle", h);
    window.addEventListener("jarvis:ask", (e) => {
      if (isRemrulsQuery(e?.detail?.query)) setOpen(true);
    });
    return () => window.removeEventListener("jarvis:remruls-toggle", h);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const watched   = rows.filter((r) => r.watched);
  const unwatched = rows.filter((r) => !r.watched);

  const visible = rows.filter((r) => {
    if (tab === "RULE-WATCHED" && !r.watched) return false;
    if (tab === "UNWATCHED"   && r.watched)  return false;
    if (search) {
      const s = search.toLowerCase();
      return r.content.toLowerCase().includes(s) ||
        r.rules.some((rule) => rule.name.toLowerCase().includes(s));
    }
    return true;
  });

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
      const ctx  = await buildRemrulsScript();
      const res  = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers: hdr,
        body: JSON.stringify({ message: `Reminders × Decision Rules status: ${ctx}. Give a 2-sentence operational monitoring assessment.` }),
      });
      const d = await res.json();
      const txt = d.response || d.message || d.content || "";
      setBrief(txt);
      if (txt) {
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
      }
    } catch {
      setBrief("Unable to reach agent endpoint.");
    } finally {
      setAssessing(false);
    }
  }, [assessing, rows]);

  const pct = rows.length ? Math.round((watched.length / rows.length) * 100) : 0;

  const SEVERITY_COLOR = { CRITICAL: RED, HIGH: "#FF8800", MEDIUM: AMB, LOW: GRN };

  const MONO = "'JetBrains Mono',monospace";
  const SANS = "'Inter',system-ui,sans-serif";

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Reminders × Decision Rules Nexus (REMRULS)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 163,
          background: open ? `${CY}22` : "rgba(5,12,20,0.75)",
          border: `1px solid ${open ? CY : `${CY}33`}`,
          color: CY, fontFamily: MONO, fontSize: 9, letterSpacing: 1,
          padding: "3px 7px", borderRadius: 5, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(6px)",
        }}
      >
        {unwatched.length > 0 && (
          <span style={{
            display: "inline-block", background: AMB, color: "#000",
            borderRadius: 6, fontSize: 8, padding: "0 4px", marginRight: 4,
          }}>{unwatched.length}</span>
        )}
        ◈ REMRULS
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 38, left: BTN_LEFT - 340, zIndex: 163,
          width: 360, maxHeight: 480,
          background: "rgba(4,10,18,0.95)", backdropFilter: "blur(16px)",
          border: `1px solid ${CY}33`, borderTop: `2px solid ${CY}`,
          borderRadius: 10, display: "flex", flexDirection: "column",
          fontFamily: SANS, overflow: "hidden",
          boxShadow: "0 0 40px rgba(41,231,255,0.08)",
        }}>

          {/* Header */}
          <div style={{
            padding: "8px 12px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ fontFamily: MONO, fontSize: 10, color: CY, letterSpacing: 1.5 }}>
              REMINDERS × DECISION RULES
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14, lineHeight: 1 }}
            >×</button>
          </div>

          {/* Stats */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6,
            padding: "8px 12px", borderBottom: `1px solid ${CY}11`,
          }}>
            {[
              ["TOTAL",       rows.length,      CY],
              ["RULE-BACKED", watched.length,   GRN],
              ["UNWATCHED",   unwatched.length, AMB],
            ].map(([label, val, color]) => (
              <div key={label} style={{
                background: `${color}0D`, border: `1px solid ${color}33`,
                borderRadius: 6, padding: "5px 8px", textAlign: "center",
              }}>
                <div style={{ fontFamily: MONO, fontSize: 14, color, fontWeight: 700 }}>{val}</div>
                <div style={{ fontFamily: MONO, fontSize: 8, color: DIM, letterSpacing: 1, marginTop: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Coverage bar */}
          <div style={{ padding: "4px 12px 6px", borderBottom: `1px solid ${CY}11` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, color: DIM }}>WATCHTOWER COVERAGE</span>
              <span style={{ fontFamily: MONO, fontSize: 9, color: pct >= 70 ? GRN : pct >= 40 ? AMB : CY }}>{pct}%</span>
            </div>
            <div style={{ height: 3, background: `${CY}22`, borderRadius: 2 }}>
              <div style={{
                height: "100%", borderRadius: 2, transition: "width 0.4s",
                width: `${pct}%`,
                background: pct >= 70 ? GRN : pct >= 40 ? AMB : CY,
              }} />
            </div>
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "6px 10px", borderBottom: `1px solid ${CY}11` }}>
            {["ALL", "RULE-WATCHED", "UNWATCHED"].map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                fontFamily: MONO, fontSize: 8, letterSpacing: 0.8,
                background: tab === t ? `${CY}22` : "transparent",
                border: `1px solid ${tab === t ? CY : `${CY}22`}`,
                color: tab === t ? CY : DIM, borderRadius: 4,
                padding: "2px 6px", cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "5px 10px", borderBottom: `1px solid ${CY}11` }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter reminders or rules…"
              style={{
                width: "100%", background: `${CY}0A`, border: `1px solid ${CY}22`,
                borderRadius: 5, color: "#C0DCE8", fontFamily: MONO, fontSize: 9,
                padding: "3px 8px", outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px" }}>
            {loading && rows.length === 0 && (
              <div style={{ color: DIM, fontFamily: MONO, fontSize: 10, textAlign: "center", padding: 20 }}>
                Loading…
              </div>
            )}
            {!loading && visible.length === 0 && (
              <div style={{ color: DIM, fontFamily: MONO, fontSize: 10, textAlign: "center", padding: 20 }}>
                No reminders match this filter.
              </div>
            )}
            {visible.map((rem) => (
              <div
                key={rem.id}
                style={{
                  borderRadius: 6, padding: "6px 8px", marginBottom: 4,
                  background: expanded === rem.id ? `${CY}0A` : `${CY}05`,
                  border: `1px solid ${rem.watched ? `${GRN}33` : `${AMB}22`}`,
                  cursor: "pointer",
                }}
                onClick={() => setExpanded(expanded === rem.id ? null : rem.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    fontFamily: MONO, fontSize: 8, letterSpacing: 0.8,
                    color: rem.watched ? GRN : AMB,
                    background: rem.watched ? `${GRN}1A` : `${AMB}1A`,
                    border: `1px solid ${rem.watched ? `${GRN}44` : `${AMB}44`}`,
                    borderRadius: 4, padding: "1px 5px", flexShrink: 0,
                  }}>
                    {rem.watched ? "RULE-WATCHED" : "UNWATCHED"}
                  </span>
                  <span style={{
                    flex: 1, color: "#C0DCE8", fontSize: 10,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {rem.content}
                  </span>
                  {rem.watched && (
                    <span style={{ fontFamily: MONO, fontSize: 8, color: GRN, flexShrink: 0 }}>
                      {rem.rules.length} rule{rem.rules.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {expanded === rem.id && (
                  <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${CY}15` }}>
                    {rem.rules.length > 0 ? rem.rules.map((rule) => {
                      const sev = rule.severity || "MEDIUM";
                      const sevColor = SEVERITY_COLOR[sev] || AMB;
                      return (
                        <div key={rule.id} style={{
                          marginBottom: 4, padding: "4px 6px",
                          background: `${GRN}0A`, borderRadius: 4,
                          border: `1px solid ${GRN}22`,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                            <span style={{
                              fontFamily: MONO, fontSize: 8,
                              color: sevColor, background: `${sevColor}1A`,
                              border: `1px solid ${sevColor}33`, borderRadius: 4, padding: "1px 4px",
                            }}>{sev}</span>
                            <span style={{ color: GRN, fontSize: 10, flex: 1 }}>{rule.name}</span>
                            <span style={{ fontFamily: MONO, fontSize: 8, color: DIM }}>{rule.hits} hit{rule.hits !== 1 ? "s" : ""}</span>
                          </div>
                          {rule.target && (
                            <div style={{ color: DIM, fontSize: 9 }}>Target: {rule.target}</div>
                          )}
                          {!rule.enabled && (
                            <div style={{ color: AMB, fontSize: 9, marginTop: 2 }}>⚠ Rule disabled</div>
                          )}
                        </div>
                      );
                    }) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No watchtower rules matched this reminder — note has no automated monitoring.</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Assess */}
          <div style={{ padding: "8px 10px", borderTop: `1px solid ${CY}22` }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{
                background: `${CY}18`, border: `1px solid ${CY}55`,
                borderRadius: 5, color: CY, padding: "5px 12px",
                cursor: "pointer", fontSize: 10, letterSpacing: 1,
                width: "100%", opacity: assessing ? 0.6 : 1,
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{
                marginTop: 8, color: "#DCEBF5", fontSize: 10, lineHeight: 1.5,
                borderLeft: `2px solid ${CY}`, paddingLeft: 8,
              }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
