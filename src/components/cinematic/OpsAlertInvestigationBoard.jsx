/**
 * OpsAlertInvestigationBoard — F52.
 * Polls /v1/ops/alerts + /v1/investigations → keyword cross-reference.
 * Classification:
 *   LINKED     — alert has ≥1 matching investigation (keyword overlap)
 *   STANDALONE — alert has no matching investigation (blind spot)
 * Stat tiles: ALERTS / INVESTIGATIONS / LINKED / STANDALONE.
 * Filter tabs: ALL / LINKED / STANDALONE. Full text search.
 * Expand row → matched investigation cards with relevance score bars.
 * ▶ ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts.
 * ◈ OAIVCORR button left:938120 bottom:8 zIndex:635.
 * Voice: "oaivcorr"/"alert investigation"/"ops investigation"/"linked alerts"/
 *        "alert correlation"/"investigation correlation".
 * 90-s auto-refresh. Additive only — mounted via App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const CY  = "#29E7FF";
const GR  = "#4ADE80";
const AM  = "#F59E0B";
const RD  = "#EF4444";
const DIM = "#1A2A36";
const BG  = "rgba(0,10,20,0.96)";
const MN  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const REFRESH_MS = 90_000;
const BTN_LEFT   = 938120;
const Z          = 635;

const OAIVCORR_RE =
  /\boaivcorr\b|alert\s+investigation|ops\s+investigation|linked\s+alerts?|alert\s+correlat|investigation\s+correlat|ops\s+alert\s+investigation/i;

export function isOaivcorrQuery(text) {
  return OAIVCORR_RE.test(text || "");
}

function authHdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function tokenize(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function alertTokens(alert) {
  return tokenize(
    [
      alert.title,
      alert.message,
      alert.description,
      alert.type,
      alert.category,
      alert.source,
      alert.service,
    ].join(" ")
  );
}

function invTokens(inv) {
  return tokenize(
    [
      inv.title,
      inv.name,
      inv.description,
      inv.type,
      inv.category,
      inv.subject,
      inv.tags?.join?.(" "),
    ].join(" ")
  );
}

function scoreMatch(aToks, bToks) {
  if (!aToks.length || !bToks.length) return 0;
  const bSet = new Set(bToks);
  const hits = aToks.filter((t) => bSet.has(t)).length;
  return Math.round((hits / Math.max(aToks.length, bToks.length)) * 100);
}

async function fetchAlerts() {
  const r = await fetch(`${apiBase()}/v1/ops/alerts`, { headers: authHdr() });
  if (!r.ok) throw new Error(`/v1/ops/alerts ${r.status}`);
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.data)    ? d.data
    : Array.isArray(d?.alerts)  ? d.alerts
    : Array.isArray(d?.items)   ? d.items
    : [];
}

async function fetchInvestigations() {
  const r = await fetch(`${apiBase()}/v1/investigations`, { headers: authHdr() });
  if (!r.ok) throw new Error(`/v1/investigations ${r.status}`);
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.data)           ? d.data
    : Array.isArray(d?.investigations)  ? d.investigations
    : Array.isArray(d?.items)          ? d.items
    : [];
}

function buildRows(alerts, investigations) {
  const invData = investigations.map((inv) => ({
    inv,
    toks: invTokens(inv),
    label: inv.title || inv.name || inv.subject || `Investigation ${inv.id ?? ""}`,
  }));

  return alerts.map((alert) => {
    const aToks = alertTokens(alert);
    const matches = invData
      .map(({ inv, toks, label }) => ({ inv, label, score: scoreMatch(aToks, toks) }))
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    return {
      alert,
      label: alert.title || alert.message || alert.type || `Alert ${alert.id ?? ""}`,
      severity: (alert.severity || alert.level || "").toLowerCase(),
      matches,
      linked: matches.length > 0,
    };
  });
}

export async function buildOaivcorrScript() {
  try {
    const [alerts, investigations] = await Promise.all([fetchAlerts(), fetchInvestigations()]);
    if (!alerts.length)
      return "No ops alerts found. Alert queue is empty.";
    const rows = buildRows(alerts, investigations);
    const linked = rows.filter((r) => r.linked).length;
    const standalone = rows.length - linked;
    const pct = rows.length ? Math.round((linked / rows.length) * 100) : 0;
    return (
      `Ops Alert Investigation Board: ${alerts.length} alerts, ${investigations.length} investigations. ` +
      `${linked} alerts are linked to at least one investigation (${pct}% coverage). ` +
      `${standalone} alerts have no investigation backing — ${standalone} operational blind spots. ` +
      (standalone > 0
        ? `Recommend opening investigations for uncorrelated alerts, sir.`
        : "All alerts are investigation-backed. Excellent coverage.")
    );
  } catch {
    return "Ops Alert Investigation Board is unavailable. Backend may be offline.";
  }
}

const TILE = {
  background: "rgba(0,255,200,0.05)",
  border: "1px solid rgba(41,231,255,0.2)",
  borderRadius: 6,
  padding: "6px 14px",
  minWidth: 80,
  textAlign: "center",
};

function Tile({ label, value, color = CY }) {
  return (
    <div style={TILE}>
      <div style={{ color, fontSize: 20, fontWeight: 700, fontFamily: MN }}>{value}</div>
      <div style={{ color: "#6B8CA3", fontSize: 9, letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

const SEV_COLOR = {
  critical: RD,
  high: AM,
  medium: "#F97316",
  low: GR,
  info: CY,
};

function sevColor(sev) {
  return SEV_COLOR[sev] || "#6B8CA3";
}

function AlertRow({ row, expanded, onToggle }) {
  const sc = sevColor(row.severity);
  return (
    <div
      style={{
        background: row.linked ? "rgba(74,222,128,0.04)" : "rgba(239,68,68,0.04)",
        border: `1px solid ${row.linked ? GR : RD}22`,
        borderRadius: 6,
        padding: "8px 10px",
        marginBottom: 5,
        cursor: "pointer",
      }}
      onClick={onToggle}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            background: row.linked ? GR : RD,
            color: "#000",
            borderRadius: 3,
            fontSize: 8,
            padding: "1px 5px",
            fontFamily: MN,
            fontWeight: 700,
            letterSpacing: 1,
            whiteSpace: "nowrap",
          }}
        >
          {row.linked ? "LINKED" : "STANDALONE"}
        </span>
        {row.severity && (
          <span
            style={{
              color: sc,
              fontSize: 8,
              fontFamily: MN,
              letterSpacing: 1,
              border: `1px solid ${sc}44`,
              borderRadius: 3,
              padding: "1px 4px",
            }}
          >
            {row.severity.toUpperCase()}
          </span>
        )}
        <span
          style={{
            flex: 1,
            color: "#B0C8D8",
            fontSize: 10,
            fontFamily: MN,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {row.label}
        </span>
        <span style={{ color: "#4A6070", fontSize: 9, fontFamily: MN }}>
          {row.matches.length} inv
        </span>
      </div>

      {expanded && row.matches.length > 0 && (
        <div style={{ marginTop: 8, paddingLeft: 4 }}>
          {row.matches.map((m, i) => (
            <div key={m.inv.id || i} style={{ marginBottom: 4 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 2,
                }}
              >
                <span
                  style={{
                    color: AM,
                    fontSize: 9,
                    fontFamily: MN,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: "75%",
                  }}
                >
                  {m.label}
                </span>
                <span style={{ color: "#4A6070", fontSize: 9, fontFamily: MN }}>
                  {m.score}%
                </span>
              </div>
              <div
                style={{
                  height: 3,
                  background: "rgba(245,158,11,0.15)",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${m.score}%`,
                    background: AM,
                    borderRadius: 2,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {expanded && row.matches.length === 0 && (
        <div style={{ color: RD, fontSize: 9, marginTop: 6, fontFamily: MN }}>
          No investigation matches found for this alert.
        </div>
      )}
    </div>
  );
}

const TABS = ["ALL", "LINKED", "STANDALONE"];

export default function OpsAlertInvestigationBoard() {
  const [open,       setOpen]       = useState(false);
  const [rows,       setRows]       = useState([]);
  const [invCount,   setInvCount]   = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [err,        setErr]        = useState("");
  const [tab,        setTab]        = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState({});
  const [assessing,  setAssessing]  = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [alerts, investigations] = await Promise.all([fetchAlerts(), fetchInvestigations()]);
      setRows(buildRows(alerts, investigations));
      setInvCount(investigations.length);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => {
      setOpen((o) => {
        if (!o) load();
        return !o;
      });
    };
    window.addEventListener("jarvis:oaivcorr-toggle", toggle);
    return () => window.removeEventListener("jarvis:oaivcorr-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const handleAssess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = await buildOaivcorrScript();
      const voice  = getActiveVoice();
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method:  "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body:    JSON.stringify({ message: `Ops Alert Investigation Board: ${script}` }),
      });
      const j = await res.json();
      const reply = j.response || j.message || j.answer || script;
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: reply, voice } }));
    } catch {
      const fallback = await buildOaivcorrScript().catch(
        () => "Ops alert investigation assessment unavailable."
      );
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text: fallback, voice: getActiveVoice() } })
      );
    } finally {
      setAssessing(false);
    }
  }, []);

  const linked     = rows.filter((r) => r.linked).length;
  const standalone = rows.length - linked;
  const pct        = rows.length ? Math.round((linked / rows.length) * 100) : 0;

  const visible = rows.filter((r) => {
    if (tab === "LINKED"     && !r.linked) return false;
    if (tab === "STANDALONE" &&  r.linked) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.label.toLowerCase().includes(q);
    }
    return true;
  });

  const standaloneAlert = standalone > 0;

  return (
    <>
      <button
        onClick={() => { setOpen((o) => { if (!o) load(); return !o; }); }}
        style={{
          position:   "fixed",
          left:       BTN_LEFT,
          bottom:     8,
          zIndex:     Z,
          background: open ? "rgba(41,231,255,0.12)" : "rgba(0,10,20,0.7)",
          border:     `1px solid ${open ? CY : "rgba(41,231,255,0.3)"}`,
          color:      open ? CY : "#6B8CA3",
          borderRadius: 4,
          padding:    "3px 8px",
          fontSize:   10,
          cursor:     "pointer",
          fontFamily: MN,
          letterSpacing: 1,
          whiteSpace: "nowrap",
          animation:  standaloneAlert && !open ? "oaivcorr-pulse 1.6s ease-in-out infinite" : "none",
        }}
        title="Ops Alert × Investigation Correlation Board (OAIVCORR)"
      >
        ◈ OAIVCORR
        {rows.length > 0 && (
          <span style={{ color: standaloneAlert ? RD : GR, marginLeft: 4 }}>
            {standalone > 0 ? `${standalone}⚠` : `${pct}%`}
          </span>
        )}
      </button>

      <style>{`
        @keyframes oaivcorr-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
          50%      { box-shadow: 0 0 0 5px rgba(239,68,68,0); }
        }
      `}</style>

      {open && (
        <div
          style={{
            position:      "fixed",
            left:          "50%",
            top:           "50%",
            transform:     "translate(-50%,-50%)",
            zIndex:        Z + 1,
            width:         560,
            maxHeight:     640,
            background:    BG,
            border:        `1px solid ${CY}44`,
            borderRadius:  10,
            boxShadow:     `0 0 40px ${CY}22`,
            display:       "flex",
            flexDirection: "column",
            overflow:      "hidden",
            fontFamily:    MN,
          }}
        >
          {/* Header */}
          <div style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            padding:        "10px 16px",
            borderBottom:   `1px solid ${CY}33`,
          }}>
            <span style={{ color: CY, fontSize: 12, letterSpacing: 2 }}>
              ◈ OPS ALERT × INVESTIGATION BOARD
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleAssess}
                disabled={assessing}
                style={{
                  background:    assessing ? "#0A2030" : "rgba(41,231,255,0.1)",
                  border:        `1px solid ${CY}55`,
                  color:         assessing ? "#6B8CA3" : CY,
                  borderRadius:  4,
                  padding:       "3px 10px",
                  fontSize:      10,
                  cursor:        assessing ? "default" : "pointer",
                  letterSpacing: 1,
                  fontFamily:    MN,
                }}
              >
                {assessing ? "…" : "▶ ASSESS"}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "transparent", border: "none", color: "#6B8CA3", fontSize: 16, cursor: "pointer", lineHeight: 1 }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "10px 16px", flexWrap: "wrap" }}>
            <Tile label="ALERTS"        value={loading ? "…" : rows.length}   color={CY} />
            <Tile label="INVESTIGATIONS" value={loading ? "…" : invCount}      color={AM} />
            <Tile label="LINKED"        value={loading ? "…" : linked}         color={GR} />
            <Tile label="STANDALONE"    value={loading ? "…" : standalone}     color={standalone > 0 ? RD : "#4A6070"} />
          </div>

          {/* Coverage bar */}
          {rows.length > 0 && (
            <div style={{ padding: "0 16px 8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ color: "#6B8CA3", fontSize: 9, letterSpacing: 1 }}>
                  INVESTIGATION COVERAGE
                </span>
                <span style={{ color: pct >= 70 ? GR : pct >= 40 ? AM : RD, fontSize: 9, fontFamily: MN }}>
                  {pct}%
                </span>
              </div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    background: pct >= 70 ? GR : pct >= 40 ? AM : RD,
                    borderRadius: 2,
                    transition: "width 0.5s ease",
                  }}
                />
              </div>
            </div>
          )}

          {/* Tabs + search */}
          <div style={{ display: "flex", gap: 6, padding: "0 16px 8px", alignItems: "center" }}>
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background:    tab === t ? "rgba(41,231,255,0.12)" : "transparent",
                  border:        `1px solid ${tab === t ? CY : "rgba(41,231,255,0.2)"}`,
                  color:         tab === t ? CY : "#6B8CA3",
                  borderRadius:  4,
                  padding:       "2px 8px",
                  fontSize:      9,
                  cursor:        "pointer",
                  fontFamily:    MN,
                  letterSpacing: 1,
                }}
              >
                {t}
              </button>
            ))}
            <input
              placeholder="Search alerts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                flex:          1,
                background:    "rgba(0,20,30,0.5)",
                border:        "1px solid rgba(41,231,255,0.15)",
                borderRadius:  4,
                color:         "#B0C8D8",
                fontSize:      9,
                padding:       "3px 8px",
                fontFamily:    MN,
                outline:       "none",
              }}
            />
          </div>

          {/* Error */}
          {err && (
            <div style={{ color: RD, fontSize: 10, padding: "4px 16px" }}>⚠ {err}</div>
          )}

          {/* List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 12px" }}>
            {loading && rows.length === 0 ? (
              <div style={{ color: "#6B8CA3", fontSize: 11, padding: "20px 0", textAlign: "center" }}>
                Loading alerts…
              </div>
            ) : visible.length === 0 ? (
              <div style={{ color: "#4A6070", fontSize: 10, padding: "20px 0", textAlign: "center" }}>
                No alerts match current filter.
              </div>
            ) : (
              visible.map((row, i) => (
                <AlertRow
                  key={row.alert.id || i}
                  row={row}
                  expanded={!!expanded[row.alert.id || i]}
                  onToggle={() =>
                    setExpanded((e) => ({ ...e, [row.alert.id || i]: !e[row.alert.id || i] }))
                  }
                />
              ))
            )}
          </div>

          {/* Footer */}
          <div style={{
            borderTop:     `1px solid ${CY}22`,
            padding:       "6px 16px",
            color:         "#6B8CA3",
            fontSize:      9,
            letterSpacing: 1,
          }}>
            AUTO-REFRESH 90 s · /v1/ops/alerts × /v1/investigations · Click alert to expand
            {loading && " · LOADING…"}
          </div>
        </div>
      )}
    </>
  );
}
