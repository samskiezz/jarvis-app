/**
 * DataGovernanceMonitor — F238.
 *
 * Data sources (all real — backed by server/services/governance.py SQLite):
 *   GET /v1/governance/purposes
 *       → {items:[{name, description, allowed_marks:[]}], count}
 *   GET /v1/governance/retention
 *       → {items:[{type_id, ttl_days}], count}
 *   GET /v1/governance/due-for-deletion
 *       → {items:[{id, type_id, created_ts, age_days}], count}
 *   GET /v1/governance/requests
 *       → {items:[{id, kind, subject_id, status, actor, created_ts}], count}
 *
 * Displays:
 *   - Stat tiles: purposes / retention policies / overdue / pending requests
 *   - PURPOSES | RETENTION | OVERDUE | REQUESTS tab switcher + text search
 *   - PURPOSES: name, description, allowed_marks chips
 *   - RETENTION: object type, TTL days bar
 *   - OVERDUE: id, type, age in days (red if >2×TTL)
 *   - REQUESTS: kind badge, subject_id, status, age
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence compliance brief + TTS
 *
 * Toggle: ◈ DSGOV at left:114720, bottom:8, zIndex:118.
 * Badge: red = overdue objects or PENDING ERASE requests; amber = any pending requests.
 * 90 s auto-refresh.
 *
 * Exported helpers for JarvisBrain:
 *   isGovQuery(q) / buildGovScript()
 *
 * Voice triggers: "data governance / governance monitor / retention policy /
 *   due for deletion / subject rights / access purposes / governance compliance /
 *   data rights / deletion queue / dsgov / compliance monitor / overdue objects /
 *   data retention / gdpr / subject access / erase request"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#4ADE80";
const RED   = "#F87171";
const GRAY  = "#4E6070";
const PURP  = "#B06EFF";
const TEAL  = "#2DD4BF";
const ORNG  = "#FB923C";

const BTN_LEFT   = 114720;
const REFRESH_MS = 90_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ──────────────────────────────────────────────────────────────────

function relAge(epochMs) {
  if (!epochMs) return "–";
  const s = Math.floor((Date.now() - epochMs) / 1000);
  if (s < 0) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const MARK_COLOR = {
  PUBLIC: GREEN,
  INTERNAL: CY,
  FINANCIAL: AMBER,
  PII: ORNG,
  RESTRICTED: RED,
};

const KIND_COLOR = {
  access: CY,
  export: PURP,
  erase: RED,
};

const STATUS_COLOR = {
  PENDING: AMBER,
  DONE: GREEN,
  REJECTED: GRAY,
};

// ─── fetch ────────────────────────────────────────────────────────────────────

async function fetchAll() {
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [purRes, retRes, dueRes, reqRes] = await Promise.allSettled([
    fetch(`${base}/v1/governance/purposes`,        { headers }),
    fetch(`${base}/v1/governance/retention`,       { headers }),
    fetch(`${base}/v1/governance/due-for-deletion`,{ headers }),
    fetch(`${base}/v1/governance/requests`,        { headers }),
  ]);
  async function safe(result) {
    if (result.status !== "fulfilled" || !result.value.ok) return null;
    try { return await result.value.json(); } catch { return null; }
  }
  const [pur, ret, due, req] = await Promise.all([purRes, retRes, dueRes, reqRes].map(safe));
  return { pur, ret, due, req };
}

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

const GOV_RE =
  /\b(data.?governance|governance.?monitor|retention.?polic|due.?for.?deletion|subject.?rights|access.?purpose|governance.?compliance|data.?rights|deletion.?queue|dsgov|compliance.?monitor|overdue.?object|data.?retention|gdpr|subject.?access|erase.?request|purpose.?registr|privacy.?request|governance.?board|gov.?compliance|data.?compliance)\b/i;

export function isGovQuery(q) {
  return GOV_RE.test(q || "");
}

export async function buildGovScript() {
  try {
    const { pur, ret, due, req } = await fetchAll();
    window.dispatchEvent(new CustomEvent("jarvis:dsgov-toggle"));
    const purposes  = pur?.count ?? 0;
    const policies  = ret?.count ?? 0;
    const overdue   = due?.count ?? 0;
    const requests  = req?.items ?? [];
    const pending   = requests.filter((r) => r.status === "PENDING").length;
    const pendErase = requests.filter((r) => r.status === "PENDING" && r.kind === "erase").length;
    if (overdue > 0 || pendErase > 0) {
      return (
        `Data Governance alert, sir. ${overdue} object${overdue !== 1 ? "s" : ""} past retention TTL awaiting deletion` +
        (pendErase > 0 ? `, and ${pendErase} pending erase request${pendErase !== 1 ? "s" : ""} require approval.` : ".") +
        ` Registry holds ${purposes} purpose${purposes !== 1 ? "s" : ""} and ${policies} retention polic${policies !== 1 ? "ies" : "y"}. Recommend reviewing overdue records immediately.`
      );
    }
    if (pending > 0) {
      return (
        `Data Governance standing by, sir. ${pending} subject-rights request${pending !== 1 ? "s" : ""} pending resolution. ` +
        `${purposes} registered purposes across ${policies} retention policies. No overdue objects at this time.`
      );
    }
    return (
      `Data Governance is clean, sir. ${purposes} registered purposes, ${policies} retention policies, zero overdue objects, zero pending requests. All compliance markers nominal.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:dsgov-toggle"));
    return "Data Governance monitor open, sir.";
  }
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatTile({ label, value, color }) {
  return (
    <div
      style={{
        flex: 1,
        background: "rgba(41,231,255,0.04)",
        border: `1px solid ${CY}22`,
        borderRadius: 7,
        padding: "7px 10px",
        textAlign: "center",
      }}
    >
      <div style={{ color: color ?? CY, fontSize: 15, fontWeight: 700, letterSpacing: 1 }}>
        {value ?? "–"}
      </div>
      <div style={{ color: GRAY, fontSize: 8, letterSpacing: 1, marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

function Chip({ label, color }) {
  return (
    <span
      style={{
        display: "inline-block",
        background: `${color}22`,
        border: `1px solid ${color}55`,
        borderRadius: 3,
        padding: "1px 5px",
        color,
        fontSize: 8,
        letterSpacing: 0.5,
        marginRight: 3,
        marginTop: 2,
      }}
    >
      {label}
    </span>
  );
}

function TtlBar({ days }) {
  if (days == null) return null;
  const isForever = days === 0;
  const pct = isForever ? 0 : Math.min(100, (days / 365) * 100);
  const col = days === 0 ? GRAY : days <= 30 ? AMBER : GREEN;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div
        style={{
          flex: 1,
          height: 3,
          background: `${GRAY}33`,
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        {!isForever && (
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: col,
              borderRadius: 2,
            }}
          />
        )}
      </div>
      <span style={{ color: col, fontSize: 8, whiteSpace: "nowrap" }}>
        {isForever ? "∞ keep forever" : `${days}d`}
      </span>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function DataGovernanceMonitor() {
  const [visible,    setVisible]    = useState(false);
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [tab,        setTab]        = useState("PURPOSES");
  const [search,     setSearch]     = useState("");
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:dsgov-toggle", onToggle);
    return () => window.removeEventListener("jarvis:dsgov-toggle", onToggle);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchAll();
      setData(d);
    } catch {
      // retain stale data on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [visible, load]);

  const purposes = data?.pur?.items ?? [];
  const policies = data?.ret?.items ?? [];
  const overdue  = data?.due?.items ?? [];
  const requests = data?.req?.items ?? [];

  const purCount = data?.pur?.count ?? 0;
  const retCount = data?.ret?.count ?? 0;
  const dueCount = data?.due?.count ?? 0;
  const pendReqs = requests.filter((r) => r.status === "PENDING").length;
  const pendErase= requests.filter((r) => r.status === "PENDING" && r.kind === "erase").length;

  const badgeColor = (dueCount > 0 || pendErase > 0) ? RED : pendReqs > 0 ? AMBER : null;
  const badgeVal   = dueCount > 0
    ? `${dueCount} OVERDUE`
    : pendErase > 0
    ? `${pendErase} ERASE`
    : pendReqs > 0
    ? `${pendReqs} PENDING`
    : null;

  const q = search.toLowerCase();

  const filteredPurposes = purposes.filter(
    (p) => !q || (p.name || "").toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q)
  );
  const filteredPolicies = policies.filter(
    (p) => !q || (p.type_id || "").toLowerCase().includes(q)
  );
  const filteredOverdue  = overdue.filter(
    (o) => !q || (o.id || "").toLowerCase().includes(q) || (o.type_id || "").toLowerCase().includes(q)
  );
  const filteredRequests = requests.filter(
    (r) => !q || (r.kind || "").toLowerCase().includes(q) || (r.subject_id || "").toLowerCase().includes(q) || (r.status || "").toLowerCase().includes(q)
  );

  async function handleAssess() {
    setAssessing(true);
    try {
      const context = [
        `purposes=${purCount}`,
        `retention_policies=${retCount}`,
        `overdue_objects=${dueCount}`,
        `pending_requests=${pendReqs}`,
        `pending_erase=${pendErase}`,
      ].join(", ");
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message: `Assess this data governance snapshot in 2 sentences: ${context}. Focus on compliance posture and most urgent action.`,
        }),
      });
      const d = await r.json();
      const text = d.response || d.reply || d.message || "Assessment complete.";
      setAssessment(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setAssessment("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }

  const TABS = ["PURPOSES", "RETENTION", "OVERDUE", "REQUESTS"];

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        style={{
          position: "fixed",
          bottom: 8,
          left: `min(${BTN_LEFT}px, calc(100vw - 120px))`,
          zIndex: 118,
          background: visible ? `${CY}22` : "rgba(5,10,18,0.82)",
          border: `1px solid ${visible ? CY : CY + "55"}`,
          borderRadius: 6,
          padding: "3px 9px",
          color: visible ? CY : CY + "AA",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 10,
          letterSpacing: 1,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ◈ DSGOV
        {badgeVal != null && (
          <span
            style={{
              marginLeft: 5,
              background: badgeColor + "33",
              border: `1px solid ${badgeColor}66`,
              borderRadius: 3,
              padding: "0 4px",
              color: badgeColor,
              fontSize: 9,
            }}
          >
            {badgeVal}
          </span>
        )}
      </button>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position: "fixed",
            bottom: 38,
            left: `min(${BTN_LEFT - 400}px, calc(100vw - 510px))`,
            width: 490,
            maxHeight: "76vh",
            overflowY: "auto",
            zIndex: 119,
            background: "rgba(5,10,18,0.97)",
            border: `1px solid ${CY}44`,
            borderRadius: 12,
            fontFamily: "'JetBrains Mono',monospace",
            boxShadow: `0 0 60px ${CY}18, 0 20px 40px rgba(0,0,0,0.8)`,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderBottom: `1px solid ${CY}33`,
            }}
          >
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>
              ◈ DATA GOVERNANCE
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {loading && <span style={{ color: GRAY, fontSize: 9 }}>◌</span>}
              <button
                onClick={handleAssess}
                disabled={assessing || !data}
                style={{
                  background: assessing ? "#1A2030" : `${CY}18`,
                  border: `1px solid ${CY}44`,
                  borderRadius: 5,
                  padding: "2px 8px",
                  color: assessing ? GRAY : CY,
                  fontSize: 9,
                  letterSpacing: 1,
                  cursor: assessing || !data ? "default" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {assessing ? "◌ ASSESSING" : "▶ ASSESS"}
              </button>
              <button
                onClick={() => setVisible(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: GRAY,
                  cursor: "pointer",
                  fontSize: 14,
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Stat tiles */}
          {data && (
            <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
              <StatTile label="PURPOSES"  value={purCount} color={CY} />
              <StatTile label="RETENTION" value={retCount} color={TEAL} />
              <StatTile label="OVERDUE"   value={dueCount} color={dueCount > 0 ? RED : GRAY} />
              <StatTile label="REQUESTS"  value={pendReqs} color={pendReqs > 0 ? AMBER : GRAY} />
            </div>
          )}

          {/* Tab bar + search */}
          <div
            style={{
              display: "flex",
              gap: 5,
              padding: "0 12px 8px",
              borderBottom: `1px solid ${CY}22`,
              flexWrap: "wrap",
            }}
          >
            {TABS.map((t) => {
              const badge = t === "OVERDUE" && dueCount > 0 ? dueCount : t === "REQUESTS" && pendReqs > 0 ? pendReqs : null;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    background: tab === t ? `${CY}22` : "transparent",
                    border: `1px solid ${tab === t ? CY + "88" : CY + "22"}`,
                    borderRadius: 4,
                    padding: "2px 7px",
                    color: tab === t ? CY : GRAY,
                    fontSize: 9,
                    letterSpacing: 1,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {t}
                  {badge != null && (
                    <span
                      style={{
                        marginLeft: 4,
                        color: t === "OVERDUE" ? RED : AMBER,
                        fontSize: 8,
                      }}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                marginLeft: "auto",
                background: "rgba(41,231,255,0.06)",
                border: `1px solid ${CY}22`,
                borderRadius: 4,
                padding: "2px 8px",
                color: CY,
                fontSize: 9,
                fontFamily: "inherit",
                width: 100,
                outline: "none",
              }}
            />
          </div>

          {/* Assessment */}
          {assessment && (
            <div
              style={{
                margin: "8px 12px",
                padding: "7px 10px",
                background: `${CY}0A`,
                border: `1px solid ${CY}33`,
                borderRadius: 6,
                color: CY,
                fontSize: 9,
                lineHeight: 1.5,
              }}
            >
              {assessment}
            </div>
          )}

          {/* Loading */}
          {!data && loading && (
            <div style={{ color: GRAY, fontSize: 9, padding: 16, textAlign: "center" }}>
              ◌ LOADING…
            </div>
          )}

          {/* ── PURPOSES tab ─────────────────────────────────────────────── */}
          {tab === "PURPOSES" && data && (
            <>
              {filteredPurposes.length === 0 && (
                <div style={{ color: GRAY, fontSize: 9, padding: 16, textAlign: "center" }}>
                  No purposes registered.
                </div>
              )}
              {filteredPurposes.map((p) => (
                <div
                  key={p.name}
                  style={{
                    padding: "8px 14px",
                    borderBottom: `1px solid ${CY}18`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ color: CY, fontSize: 10, fontWeight: 600 }}>{p.name}</span>
                  </div>
                  {p.description && (
                    <div style={{ color: GRAY, fontSize: 8, marginTop: 3, lineHeight: 1.5 }}>
                      {p.description}
                    </div>
                  )}
                  {p.allowed_marks && p.allowed_marks.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      {p.allowed_marks.map((m) => (
                        <Chip key={m} label={m} color={MARK_COLOR[m] ?? CY} />
                      ))}
                    </div>
                  )}
                  {(!p.allowed_marks || p.allowed_marks.length === 0) && (
                    <div style={{ marginTop: 4 }}>
                      <Chip label="NO MARKS" color={GRAY} />
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {/* ── RETENTION tab ────────────────────────────────────────────── */}
          {tab === "RETENTION" && data && (
            <>
              {filteredPolicies.length === 0 && (
                <div style={{ color: GRAY, fontSize: 9, padding: 16, textAlign: "center" }}>
                  No retention policies set.
                </div>
              )}
              {filteredPolicies.map((p) => (
                <div
                  key={p.type_id}
                  style={{
                    padding: "8px 14px",
                    borderBottom: `1px solid ${CY}18`,
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "4px 12px",
                    alignItems: "center",
                  }}
                >
                  <span style={{ color: CY, fontSize: 9 }}>{p.type_id}</span>
                  <span style={{ color: GRAY, fontSize: 8 }}>
                    {p.ttl_days === 0 ? "∞ permanent" : `${p.ttl_days}d TTL`}
                  </span>
                  <div style={{ gridColumn: "1/-1" }}>
                    <TtlBar days={p.ttl_days} />
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ── OVERDUE tab ──────────────────────────────────────────────── */}
          {tab === "OVERDUE" && data && (
            <>
              {filteredOverdue.length === 0 && (
                <div style={{ color: GREEN, fontSize: 9, padding: 16, textAlign: "center" }}>
                  ✓ No objects past retention TTL.
                </div>
              )}
              {filteredOverdue.map((o) => (
                <div
                  key={o.id}
                  style={{
                    padding: "8px 14px",
                    borderBottom: `1px solid ${RED}22`,
                    background: "rgba(248,113,113,0.03)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span
                      style={{
                        color: RED,
                        fontSize: 9,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "70%",
                      }}
                    >
                      {o.id}
                    </span>
                    <span style={{ color: GRAY, fontSize: 8 }}>
                      {relAge(o.created_ts)}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 3 }}>
                    <Chip label={o.type_id || "unknown"} color={ORNG} />
                    {o.age_days != null && (
                      <span style={{ color: RED, fontSize: 8 }}>
                        {o.age_days}d past TTL
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ── REQUESTS tab ─────────────────────────────────────────────── */}
          {tab === "REQUESTS" && data && (
            <>
              {filteredRequests.length === 0 && (
                <div style={{ color: GRAY, fontSize: 9, padding: 16, textAlign: "center" }}>
                  No subject-rights requests on record.
                </div>
              )}
              {filteredRequests.map((r) => (
                <div
                  key={r.id}
                  style={{
                    padding: "8px 14px",
                    borderBottom: `1px solid ${CY}18`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Chip label={(r.kind || "?").toUpperCase()} color={KIND_COLOR[r.kind] ?? CY} />
                      <span style={{ color: CY, fontSize: 9 }}>{r.subject_id || "(no subject)"}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span
                        style={{
                          color: STATUS_COLOR[r.status] ?? GRAY,
                          fontSize: 8,
                          letterSpacing: 0.5,
                        }}
                      >
                        {r.status || "?"}
                      </span>
                      <span style={{ color: GRAY, fontSize: 8 }}>{relAge(r.created_ts)}</span>
                    </div>
                  </div>
                  {r.actor && (
                    <div style={{ color: GRAY, fontSize: 7, marginTop: 3 }}>
                      actor: {r.actor}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {/* Footer */}
          {data && (
            <div
              style={{
                textAlign: "right",
                padding: "4px 12px",
                color: GRAY,
                fontSize: 8,
                borderTop: `1px solid ${CY}18`,
              }}
            >
              live · {purCount} purpose{purCount !== 1 ? "s" : ""} · {retCount} polic{retCount !== 1 ? "ies" : "y"} · {dueCount} overdue
            </div>
          )}
        </div>
      )}
    </>
  );
}
