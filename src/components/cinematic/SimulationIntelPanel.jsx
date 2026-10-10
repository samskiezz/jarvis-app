/**
 * SimulationIntelPanel — F287.
 *
 * Decision-intelligence simulation surface wired to the Jarvis sim engine.
 *
 * Data sources (real — /v1/jarvis/sim):
 *   GET  /v1/ontology/objects?limit=50         (mount — object picker)
 *   GET  /v1/jarvis/sim/recommend/{object_id}  (RECOMMEND tab — ranked actions)
 *   POST /v1/jarvis/sim/whatif                 body: {object_id, action}
 *        → {status, legal, current_state, predicted_state, requires_approval, impacted_objects}
 *   POST /v1/jarvis/sim/risk                   body: {seed_id, decay, max_depth}
 *        → {nodes: [{id,type,risk_score,depth}], edge_count, total_risk}
 *   POST /v1/jarvis/sim/montecarlo             body: {p_success, trials, seed?}
 *        → {p_success, trials, mean, std, p10, p25, p50, p75, p90}
 *
 * Displays:
 *   - Stat tiles: objects loaded / last sim / risk nodes / sim mode
 *   - RECOMMEND | WHATIF | RISK | MONTE CARLO tab switcher + object search
 *   - RECOMMEND: object dropdown → ranked action list with risk/benefit bars
 *   - WHATIF: object + action → legal badge, state transition, impacted object list
 *   - RISK: seed object + decay slider + depth → propagation table sorted by risk_score
 *   - MONTECARLO: p_success slider + trials input → percentile table + status bar
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence decision-intelligence brief + TTS
 *
 * Toggle: ⊛ SIML at left:329040, bottom:8, zIndex:165.
 * Badge: green=recommendations available, amber=sim running, dim=idle.
 *
 * Exported helpers for JarvisBrain:
 *   isSimlQuery(q) / buildSimlScript()
 *
 * Voice triggers: "simulation / sim intelligence / what if / whatif /
 *   risk propagation / monte carlo / action recommendations / object simulation /
 *   recommend action / siml / blast radius / risk sim / simulation intel /
 *   decision engine / propagate risk / sim engine"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RD   = "#F87171";
const PU   = "#A78BFA";
const DIM  = "#3A4A55";
const GRAY = "#4E6070";

const BTN_LEFT = 329040;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

const SIML_RE =
  /\b(sim(ulation)?\s*intel|siml\b|what\s*if\b|risk\s+propagat|monte\s*carlo|action\s+recommend|object\s+simul|recommend\s+action|blast\s+radius|risk\s+sim|sim\s+engine|decision\s+engine|propagate\s+risk|sim\s+intelligence)\b/i;

export function isSimlQuery(q) {
  return SIML_RE.test(q || "");
}

export async function buildSimlScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/ontology/objects?limit=50`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    const objs = d?.items ?? d?.objects ?? [];
    window.dispatchEvent(new CustomEvent("jarvis:siml-toggle"));
    if (!objs.length)
      return "Simulation Intel Panel: no ontology objects loaded — run a simulation after objects are seeded.";
    return (
      `Simulation Intel Panel: ${objs.length} ontology objects available for simulation. ` +
      "Use RECOMMEND to surface ranked actions, WHATIF to predict state transitions, " +
      "RISK to propagate blast radius, or MONTE CARLO to estimate outcome probability."
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:siml-toggle"));
    return "Simulation Intel Panel open. Load ontology objects to begin simulating decisions.";
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function hdr(json = false) {
  const h = { Authorization: `Bearer ${API_KEY}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

function StatTile({ label, value, color }) {
  return (
    <div
      style={{
        flex: 1,
        background: "rgba(41,231,255,0.03)",
        border: `1px solid ${color}22`,
        borderRadius: 5,
        padding: "5px 7px",
        textAlign: "center",
      }}
    >
      <div style={{ color, fontSize: 15, fontWeight: 700, lineHeight: 1.1 }}>{value}</div>
      <div style={{ color: GRAY, fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function TabBtn({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? `${CY}18` : "transparent",
        border: `1px solid ${active ? CY : DIM}`,
        borderRadius: 3,
        color: active ? CY : GRAY,
        cursor: "pointer",
        fontFamily: "monospace",
        fontSize: 9,
        letterSpacing: "0.06em",
        padding: "2px 7px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

function RiskBar({ value, max }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = pct > 75 ? RD : pct > 40 ? AM : GN;
  return (
    <div
      style={{
        height: 4,
        background: `${DIM}55`,
        borderRadius: 2,
        overflow: "hidden",
        flex: 1,
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: color,
          borderRadius: 2,
          transition: "width 0.3s",
        }}
      />
    </div>
  );
}

// ─── RECOMMEND tab ────────────────────────────────────────────────────────────

function RecommendTab({ objects }) {
  const [selId, setSelId]   = useState("");
  const [recs, setRecs]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");

  const handleFetch = useCallback(async () => {
    if (!selId) return;
    setLoading(true);
    setRecs(null);
    setError("");
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/sim/recommend/${encodeURIComponent(selId)}`, {
        headers: hdr(),
      });
      const d = await r.json();
      setRecs(d);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [selId]);

  const actions = recs?.actions ?? recs?.recommendations ?? [];
  const maxScore = actions.reduce((m, a) => Math.max(m, a.score ?? 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <select
          value={selId}
          onChange={(e) => setSelId(e.target.value)}
          style={{
            flex: 1,
            background: "rgba(41,231,255,0.05)",
            border: `1px solid ${CY}33`,
            borderRadius: 4,
            color: "#ADC1CD",
            fontFamily: "monospace",
            fontSize: 9,
            outline: "none",
            padding: "3px 6px",
          }}
        >
          <option value="">— select object —</option>
          {objects.map((o) => (
            <option key={o.id} value={o.id}>
              [{o.type ?? "?"}] {o.id}
            </option>
          ))}
        </select>
        <button
          onClick={handleFetch}
          disabled={!selId || loading}
          style={{
            background: loading ? `${GN}08` : `${GN}12`,
            border: `1px solid ${loading ? DIM : GN + "55"}`,
            borderRadius: 4,
            color: loading ? GRAY : GN,
            cursor: loading ? "wait" : "pointer",
            fontFamily: "monospace",
            fontSize: 9,
            padding: "3px 9px",
            whiteSpace: "nowrap",
          }}
        >
          {loading ? "▷…" : "▶ REC"}
        </button>
      </div>
      {error && (
        <div style={{ color: RD, fontSize: 9 }}>⚠ {error}</div>
      )}
      {recs && !actions.length && (
        <div style={{ color: GRAY, fontSize: 9 }}>No recommendations available for this object.</div>
      )}
      {actions.length > 0 && (
        <div>
          <div style={{ color: GRAY, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>
            {actions.length} RANKED ACTION{actions.length !== 1 ? "S" : ""}
          </div>
          {actions.map((a, i) => (
            <div
              key={`${a.action}-${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 2px",
                borderBottom: `1px solid ${CY}0a`,
              }}
            >
              <span style={{ color: GRAY, fontSize: 8, width: 14, flexShrink: 0 }}>#{i + 1}</span>
              <span
                style={{
                  background: `${PU}18`,
                  border: `1px solid ${PU}44`,
                  borderRadius: 3,
                  color: PU,
                  fontSize: 9,
                  padding: "1px 5px",
                  flexShrink: 0,
                  maxWidth: 120,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {a.action ?? a.name ?? "?"}
              </span>
              <RiskBar value={a.score ?? 0} max={maxScore || 1} />
              <span style={{ color: AM, fontSize: 8, flexShrink: 0, width: 36, textAlign: "right" }}>
                {typeof a.score === "number" ? a.score.toFixed(2) : "—"}
              </span>
              {a.risk && (
                <span
                  style={{
                    background:
                      a.risk === "high" ? `${RD}18` :
                      a.risk === "medium" ? `${AM}18` : `${GN}18`,
                    border: `1px solid ${a.risk === "high" ? RD : a.risk === "medium" ? AM : GN}44`,
                    borderRadius: 3,
                    color: a.risk === "high" ? RD : a.risk === "medium" ? AM : GN,
                    fontSize: 8,
                    padding: "1px 4px",
                    flexShrink: 0,
                  }}
                >
                  {a.risk.toUpperCase()}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── WHATIF tab ───────────────────────────────────────────────────────────────

function WhatIfTab({ objects }) {
  const [objId, setObjId]     = useState("");
  const [action, setAction]   = useState("");
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const handleRun = useCallback(async () => {
    if (!objId || !action.trim()) return;
    setLoading(true);
    setResult(null);
    setError("");
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/sim/whatif`, {
        method: "POST",
        headers: hdr(true),
        body: JSON.stringify({ object_id: objId, action: action.trim() }),
      });
      const d = await r.json();
      setResult(d);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [objId, action]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <select
        value={objId}
        onChange={(e) => setObjId(e.target.value)}
        style={{
          background: "rgba(41,231,255,0.05)",
          border: `1px solid ${CY}33`,
          borderRadius: 4,
          color: "#ADC1CD",
          fontFamily: "monospace",
          fontSize: 9,
          outline: "none",
          padding: "3px 6px",
          width: "100%",
        }}
      >
        <option value="">— select object —</option>
        {objects.map((o) => (
          <option key={o.id} value={o.id}>
            [{o.type ?? "?"}] {o.id}
          </option>
        ))}
      </select>
      <input
        value={action}
        onChange={(e) => setAction(e.target.value)}
        placeholder="action name (e.g. approve, archive, escalate)"
        style={{
          background: "rgba(41,231,255,0.05)",
          border: `1px solid ${CY}33`,
          borderRadius: 4,
          color: "#ADC1CD",
          fontFamily: "monospace",
          fontSize: 9,
          outline: "none",
          padding: "4px 7px",
          width: "100%",
          boxSizing: "border-box",
        }}
      />
      <button
        onClick={handleRun}
        disabled={!objId || !action.trim() || loading}
        style={{
          alignSelf: "flex-start",
          background: loading ? `${CY}08` : `${CY}12`,
          border: `1px solid ${loading ? DIM : CY + "55"}`,
          borderRadius: 4,
          color: loading ? GRAY : CY,
          cursor: loading ? "wait" : "pointer",
          fontFamily: "monospace",
          fontSize: 9,
          padding: "3px 10px",
        }}
      >
        {loading ? "▷ simulating…" : "▶ SIMULATE"}
      </button>
      {error && <div style={{ color: RD, fontSize: 9 }}>⚠ {error}</div>}
      {result && (
        <div
          style={{
            background: "rgba(41,231,255,0.03)",
            border: `1px solid ${CY}22`,
            borderRadius: 5,
            padding: "8px 10px",
            display: "flex",
            flexDirection: "column",
            gap: 5,
          }}
        >
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span
              style={{
                background: result.legal ? `${GN}18` : `${RD}18`,
                border: `1px solid ${result.legal ? GN : RD}44`,
                borderRadius: 3,
                color: result.legal ? GN : RD,
                fontSize: 9,
                padding: "1px 6px",
              }}
            >
              {result.legal ? "✓ LEGAL" : "✗ NOT LEGAL"}
            </span>
            {result.requires_approval && (
              <span
                style={{
                  background: `${AM}18`,
                  border: `1px solid ${AM}44`,
                  borderRadius: 3,
                  color: AM,
                  fontSize: 9,
                  padding: "1px 6px",
                }}
              >
                ⚠ REQUIRES APPROVAL
              </span>
            )}
          </div>
          {result.current_state && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9 }}>
              <span style={{ color: GRAY }}>STATE:</span>
              <span style={{ color: "#ADC1CD" }}>{result.current_state}</span>
              <span style={{ color: GRAY }}>→</span>
              <span style={{ color: result.legal ? GN : GRAY }}>
                {result.predicted_state ?? "unchanged"}
              </span>
            </div>
          )}
          {result.impacted_objects?.length > 0 && (
            <div>
              <div style={{ color: GRAY, fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>
                {result.impact_count ?? result.impacted_objects.length} IMPACTED OBJECTS
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {result.impacted_objects.slice(0, 12).map((id) => (
                  <span
                    key={id}
                    style={{
                      background: `${AM}12`,
                      border: `1px solid ${AM}33`,
                      borderRadius: 3,
                      color: AM,
                      fontSize: 8,
                      padding: "1px 4px",
                    }}
                  >
                    {id}
                  </span>
                ))}
                {result.impacted_objects.length > 12 && (
                  <span style={{ color: GRAY, fontSize: 8 }}>
                    +{result.impacted_objects.length - 12} more
                  </span>
                )}
              </div>
            </div>
          )}
          {result.status && (
            <div style={{ color: GRAY, fontSize: 8, letterSpacing: 1 }}>
              STATUS: {result.status.toUpperCase()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── RISK tab ─────────────────────────────────────────────────────────────────

function RiskTab({ objects }) {
  const [seedId, setSeedId]   = useState("");
  const [decay, setDecay]     = useState(0.5);
  const [depth, setDepth]     = useState(3);
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const handleRun = useCallback(async () => {
    if (!seedId) return;
    setLoading(true);
    setResult(null);
    setError("");
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/sim/risk`, {
        method: "POST",
        headers: hdr(true),
        body: JSON.stringify({ seed_id: seedId, decay, max_depth: depth }),
      });
      const d = await r.json();
      setResult(d);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [seedId, decay, depth]);

  const nodes = result?.nodes ?? [];
  const maxRisk = nodes.reduce((m, n) => Math.max(m, n.risk_score ?? 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <select
        value={seedId}
        onChange={(e) => setSeedId(e.target.value)}
        style={{
          background: "rgba(41,231,255,0.05)",
          border: `1px solid ${CY}33`,
          borderRadius: 4,
          color: "#ADC1CD",
          fontFamily: "monospace",
          fontSize: 9,
          outline: "none",
          padding: "3px 6px",
          width: "100%",
        }}
      >
        <option value="">— seed object —</option>
        {objects.map((o) => (
          <option key={o.id} value={o.id}>
            [{o.type ?? "?"}] {o.id}
          </option>
        ))}
      </select>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: GRAY, fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>
            DECAY: {decay.toFixed(2)}
          </div>
          <input
            type="range"
            min="0.1"
            max="0.99"
            step="0.05"
            value={decay}
            onChange={(e) => setDecay(parseFloat(e.target.value))}
            style={{ width: "100%", accentColor: AM }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: GRAY, fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>
            DEPTH: {depth}
          </div>
          <input
            type="range"
            min="1"
            max="5"
            step="1"
            value={depth}
            onChange={(e) => setDepth(parseInt(e.target.value, 10))}
            style={{ width: "100%", accentColor: RD }}
          />
        </div>
      </div>
      <button
        onClick={handleRun}
        disabled={!seedId || loading}
        style={{
          alignSelf: "flex-start",
          background: loading ? `${AM}08` : `${AM}12`,
          border: `1px solid ${loading ? DIM : AM + "55"}`,
          borderRadius: 4,
          color: loading ? GRAY : AM,
          cursor: loading ? "wait" : "pointer",
          fontFamily: "monospace",
          fontSize: 9,
          padding: "3px 10px",
        }}
      >
        {loading ? "▷ propagating…" : "▶ PROPAGATE"}
      </button>
      {error && <div style={{ color: RD, fontSize: 9 }}>⚠ {error}</div>}
      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ display: "flex", gap: 8, fontSize: 9 }}>
            <span style={{ color: GRAY }}>NODES:</span>
            <span style={{ color: "#ADC1CD" }}>{nodes.length}</span>
            <span style={{ color: GRAY }}>EDGES:</span>
            <span style={{ color: "#ADC1CD" }}>{result.edge_count ?? "—"}</span>
            <span style={{ color: GRAY }}>TOTAL RISK:</span>
            <span style={{ color: RD }}>{typeof result.total_risk === "number" ? result.total_risk.toFixed(3) : "—"}</span>
          </div>
          {nodes.slice(0, 15).map((n) => (
            <div
              key={n.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 0",
                borderBottom: `1px solid ${CY}0a`,
              }}
            >
              <span style={{ color: GRAY, fontSize: 8, width: 20, flexShrink: 0 }}>
                D{n.depth ?? 0}
              </span>
              <span
                style={{
                  color: "#ADC1CD",
                  fontSize: 9,
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {n.id}
              </span>
              <span style={{ color: GRAY, fontSize: 8, flexShrink: 0, width: 32 }}>
                {n.type ?? "?"}
              </span>
              <RiskBar value={n.risk_score ?? 0} max={maxRisk || 1} />
              <span style={{ color: RD, fontSize: 8, flexShrink: 0, width: 36, textAlign: "right" }}>
                {typeof n.risk_score === "number" ? n.risk_score.toFixed(3) : "—"}
              </span>
            </div>
          ))}
          {nodes.length > 15 && (
            <div style={{ color: GRAY, fontSize: 8 }}>+{nodes.length - 15} more nodes…</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── MONTECARLO tab ───────────────────────────────────────────────────────────

function MonteCarloTab() {
  const [pSuccess, setPSuccess] = useState(0.65);
  const [trials, setTrials]     = useState(1000);
  const [result, setResult]     = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const handleRun = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setError("");
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/sim/montecarlo`, {
        method: "POST",
        headers: hdr(true),
        body: JSON.stringify({ p_success: pSuccess, trials }),
      });
      const d = await r.json();
      setResult(d);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [pSuccess, trials]);

  const pct = (v) => (typeof v === "number" ? `${(v * 100).toFixed(1)}%` : "—");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div>
        <div style={{ color: GRAY, fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>
          P(SUCCESS): {pct(pSuccess)}
        </div>
        <input
          type="range"
          min="0.01"
          max="0.99"
          step="0.01"
          value={pSuccess}
          onChange={(e) => setPSuccess(parseFloat(e.target.value))}
          style={{ width: "100%", accentColor: GN }}
        />
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ color: GRAY, fontSize: 8, letterSpacing: 1, flexShrink: 0 }}>TRIALS:</div>
        <input
          type="number"
          min="100"
          max="10000"
          step="100"
          value={trials}
          onChange={(e) => setTrials(Math.max(100, parseInt(e.target.value, 10) || 1000))}
          style={{
            background: "rgba(41,231,255,0.05)",
            border: `1px solid ${CY}33`,
            borderRadius: 4,
            color: "#ADC1CD",
            fontFamily: "monospace",
            fontSize: 9,
            outline: "none",
            padding: "3px 7px",
            width: 80,
          }}
        />
      </div>
      {/* visual p_success bar */}
      <div style={{ height: 6, background: `${DIM}55`, borderRadius: 3, overflow: "hidden" }}>
        <div
          style={{
            width: `${pSuccess * 100}%`,
            height: "100%",
            background: pSuccess > 0.7 ? GN : pSuccess > 0.4 ? AM : RD,
            borderRadius: 3,
            transition: "width 0.15s, background 0.15s",
          }}
        />
      </div>
      <button
        onClick={handleRun}
        disabled={loading}
        style={{
          alignSelf: "flex-start",
          background: loading ? `${PU}08` : `${PU}12`,
          border: `1px solid ${loading ? DIM : PU + "55"}`,
          borderRadius: 4,
          color: loading ? GRAY : PU,
          cursor: loading ? "wait" : "pointer",
          fontFamily: "monospace",
          fontSize: 9,
          padding: "3px 10px",
        }}
      >
        {loading ? `▷ running ${trials} trials…` : "▶ RUN MONTE CARLO"}
      </button>
      {error && <div style={{ color: RD, fontSize: 9 }}>⚠ {error}</div>}
      {result && (
        <div
          style={{
            background: "rgba(41,231,255,0.03)",
            border: `1px solid ${CY}22`,
            borderRadius: 5,
            padding: "8px 10px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={{ color: GRAY, fontSize: 8, letterSpacing: 1, marginBottom: 2 }}>
            OUTCOME DISTRIBUTION · {result.trials ?? trials} TRIALS
          </div>
          {[
            ["P10", result.p10],
            ["P25", result.p25],
            ["P50 (MEDIAN)", result.p50],
            ["P75", result.p75],
            ["P90", result.p90],
          ].map(([lbl, v]) => (
            <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: GRAY, fontSize: 8, width: 80, flexShrink: 0 }}>{lbl}</span>
              <div
                style={{
                  flex: 1,
                  height: 4,
                  background: `${DIM}55`,
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${(v ?? 0) * 100}%`,
                    height: "100%",
                    background: (v ?? 0) > 0.7 ? GN : (v ?? 0) > 0.4 ? AM : RD,
                    borderRadius: 2,
                  }}
                />
              </div>
              <span style={{ color: "#ADC1CD", fontSize: 9, width: 38, textAlign: "right", flexShrink: 0 }}>
                {pct(v)}
              </span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 10, marginTop: 2, fontSize: 9 }}>
            <span style={{ color: GRAY }}>MEAN:</span>
            <span style={{ color: GN }}>{pct(result.mean)}</span>
            <span style={{ color: GRAY }}>STD:</span>
            <span style={{ color: AM }}>±{pct(result.std)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function SimulationIntelPanel() {
  const [open, setOpen]             = useState(false);
  const [objects, setObjects]       = useState([]);
  const [tab, setTab]               = useState("RECOMMEND");
  const [assessing, setAssessing]   = useState(false);
  const [assessText, setAssessText] = useState("");

  const timerRef = useRef(null);

  // Load objects once on open
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch(`${apiBase()}/v1/ontology/objects?limit=50`, { headers: hdr() })
      .then((r) => r.json())
      .then((d) => {
        if (alive) setObjects(d?.items ?? d?.objects ?? []);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [open]);

  // Toggle listener
  useEffect(() => {
    const fn = () => setOpen((v) => !v);
    window.addEventListener("jarvis:siml-toggle", fn);
    return () => window.removeEventListener("jarvis:siml-toggle", fn);
  }, []);

  const handleAssess = useCallback(async () => {
    setAssessing(true);
    setAssessText("");
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: hdr(true),
        body: JSON.stringify({
          message:
            `Simulation Intel Panel: ${objects.length} ontology objects loaded. ` +
            "Available sim tools: RECOMMEND (ranked actions per object), " +
            "WHATIF (predict state transitions), RISK (blast-radius propagation), " +
            "MONTE CARLO (probabilistic outcome estimation). " +
            "Give a 2-sentence assessment of how to use simulation intelligence for current operational decisions.",
        }),
      });
      const d = await r.json();
      const txt = d?.response ?? d?.message ?? d?.text ?? "";
      setAssessText(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setAssessText("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }, [objects.length]);

  const TABS = ["RECOMMEND", "WHATIF", "RISK", "MONTE CARLO"];

  const badgeColor = objects.length > 0 ? GN : DIM;
  const badgeVal   = objects.length;

  const PANEL_W = 440;

  return (
    <>
      {/* ── dock button ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Simulation Intel Panel (F287)"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 165,
          background: open ? `${CY}22` : "rgba(10,18,28,0.88)",
          border: `1px solid ${open ? CY : "#1E3040"}`,
          borderRadius: 4,
          color: open ? CY : "#3A6070",
          cursor: "pointer",
          fontFamily: "monospace",
          fontSize: 9,
          letterSpacing: "0.08em",
          padding: "4px 7px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          whiteSpace: "nowrap",
          userSelect: "none",
          transition: "border-color 0.15s, color 0.15s, background 0.15s",
        }}
      >
        <span style={{ fontSize: 13 }}>⊛</span>
        <span>SIML</span>
        <span
          style={{
            position: "absolute",
            top: -4,
            right: -4,
            background: badgeColor,
            borderRadius: "50%",
            width: 8,
            height: 8,
            border: "1px solid #0A121C",
          }}
        />
      </button>

      {/* ── panel ── */}
      {open && (
        <div
          style={{
            position: "fixed",
            left: BTN_LEFT - PANEL_W + 40,
            bottom: 36,
            width: PANEL_W,
            zIndex: 900,
            background: "rgba(4,10,20,0.97)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: `1px solid ${CY}33`,
            borderRadius: 8,
            fontFamily: "monospace",
            fontSize: 11,
            color: "#ADC1CD",
            display: "flex",
            flexDirection: "column",
            maxHeight: 600,
            boxShadow: `0 0 24px ${PU}18`,
          }}
        >
          {/* header */}
          <div
            style={{
              padding: "10px 14px 8px",
              borderBottom: `1px solid ${CY}22`,
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <span style={{ color: PU, letterSpacing: 2, fontWeight: 700, fontSize: 11 }}>
              ⊛ SIMULATION INTEL
            </span>
            <span
              style={{
                marginLeft: "auto",
                background: `${GN}18`,
                color: GN,
                border: `1px solid ${GN}44`,
                borderRadius: 3,
                padding: "1px 6px",
                fontSize: 9,
                letterSpacing: 1,
              }}
            >
              {objects.length} OBJ
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                color: GRAY,
                cursor: "pointer",
                fontSize: 13,
                lineHeight: 1,
                padding: "0 2px",
              }}
            >
              ×
            </button>
          </div>

          {/* stat tiles */}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "8px 12px",
              flexShrink: 0,
              borderBottom: `1px solid ${CY}11`,
            }}
          >
            <StatTile label="Objects"  value={objects.length}  color={objects.length > 0 ? GN   : GRAY} />
            <StatTile label="Rec"      value="RANK"            color={CY}                                />
            <StatTile label="Risk"     value="PROP"            color={AM}                                />
            <StatTile label="MC"       value="PROB"            color={PU}                                />
          </div>

          {/* tab switcher */}
          <div
            style={{
              display: "flex",
              gap: 5,
              padding: "6px 12px",
              flexShrink: 0,
              borderBottom: `1px solid ${CY}11`,
              flexWrap: "wrap",
            }}
          >
            {TABS.map((t) => (
              <TabBtn key={t} label={t} active={tab === t} onClick={() => setTab(t)} />
            ))}
          </div>

          {/* tab body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
            {tab === "RECOMMEND" && <RecommendTab objects={objects} />}
            {tab === "WHATIF"    && <WhatIfTab objects={objects} />}
            {tab === "RISK"      && <RiskTab objects={objects} />}
            {tab === "MONTE CARLO" && <MonteCarloTab />}
          </div>

          {/* assess footer */}
          <div
            style={{
              borderTop: `1px solid ${CY}11`,
              padding: "7px 12px",
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <button
              onClick={handleAssess}
              disabled={assessing}
              style={{
                background: assessing ? `${PU}05` : `${PU}0a`,
                border: `1px solid ${assessing ? DIM : PU + "55"}`,
                borderRadius: 4,
                color: assessing ? GRAY : PU,
                cursor: assessing ? "wait" : "pointer",
                fontFamily: "monospace",
                fontSize: 10,
                letterSpacing: "0.06em",
                padding: "4px 10px",
                textAlign: "left",
              }}
            >
              {assessing ? "▷ assessing…" : "▶ ASSESS"}
            </button>
            {assessText && (
              <div
                style={{
                  background: `${PU}09`,
                  border: `1px solid ${PU}22`,
                  borderRadius: 4,
                  color: "#ADC1CD",
                  fontSize: 10,
                  lineHeight: 1.5,
                  padding: "6px 8px",
                }}
              >
                {assessText}
              </div>
            )}
            <span style={{ color: "#1E3040", fontSize: 9, letterSpacing: 1 }}>
              GET /v1/jarvis/sim/recommend · POST /v1/jarvis/sim/whatif · /sim/risk · /sim/montecarlo
            </span>
          </div>
        </div>
      )}
    </>
  );
}
