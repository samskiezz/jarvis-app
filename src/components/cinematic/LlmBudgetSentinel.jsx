/**
 * LlmBudgetSentinel — F233.
 *
 * Data sources:
 *   GET /v1/token-governor/spend_status
 *       → {spent_usd, daily_cap_usd, archon_cap_usd, pct_used, ceiling_hit, ts}
 *   GET /v1/aip/providers
 *       → {providers:[{id, model, configured, url?}]}
 *
 * Displays:
 *   - Stat tiles: spent ($) / daily cap ($) / pct used (%) / providers (count)
 *   - Daily budget gauge bar (spent vs cap)
 *   - Archon budget bar (archon cap reference)
 *   - Provider rows: id, model, configured status (green=configured / grey=unconfigured)
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle: ◉ LBSG at left:96480, bottom:8, zIndex:114.
 * Red badge = ceiling_hit, amber badge = pct_used >= 75, no badge = healthy.
 * 60 s auto-refresh.
 *
 * Exported helpers for JarvisBrain:
 *   isLbsgQuery(q) / buildLbsgScript()
 *
 * Voice triggers: "provider status / llm providers / token budget / daily budget /
 *   spend status / budget ceiling / llm spend / budget sentinel / which providers /
 *   model providers / provider health / archon budget / lbsg"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const RED    = "#F87171";
const GREEN  = "#4ADE80";
const GRAY   = "#4E6070";

const BTN_LEFT   = 96480;
const REFRESH_MS = 60_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── fetch helpers ────────────────────────────────────────────────────────────

async function fetchSpend() {
  const r = await fetch(
    `${apiBase()}/v1/token-governor/spend_status`,
    { headers: { Authorization: `Bearer ${API_KEY}` } }
  );
  if (!r.ok) throw new Error(`spend_status ${r.status}`);
  return r.json();
}

async function fetchProviders() {
  const r = await fetch(
    `${apiBase()}/v1/aip/providers`,
    { headers: { Authorization: `Bearer ${API_KEY}` } }
  );
  if (!r.ok) throw new Error(`providers ${r.status}`);
  return r.json();
}

function fmtUsd(v) {
  if (v == null) return "–";
  return `$${Number(v).toFixed(2)}`;
}

function fmtPct(v) {
  if (v == null) return "–";
  return `${Number(v).toFixed(1)}%`;
}

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

export function isLbsgQuery(q) {
  return /provider.status|llm.provider|token.budget|daily.budget|spend.status|budget.ceiling|llm.spend|budget.sentinel|which.provider|model.provider|provider.health|archon.budget|\blbsg\b/i.test(
    q || ""
  );
}

export async function buildLbsgScript() {
  try {
    const [spend, provData] = await Promise.all([fetchSpend(), fetchProviders()]);
    window.dispatchEvent(new CustomEvent("jarvis:lbsg-toggle"));
    const providers = provData?.providers ?? [];
    const configured = providers.filter((p) => p.configured);
    const pct = spend?.pct_used ?? 0;
    const ceilHit = spend?.ceiling_hit;
    if (ceilHit) {
      return `LLM Budget Sentinel — CEILING HIT, sir. Daily token budget of ${fmtUsd(spend.daily_cap_usd)} fully consumed; economy mode is now forced. ${configured.length} of ${providers.length} LLM providers are configured. Archon cap stands at ${fmtUsd(spend.archon_cap_usd)}.`;
    }
    return `LLM Budget Sentinel online, sir. Today's LLM spend is ${fmtUsd(spend.spent_usd)} — ${fmtPct(pct)} of the ${fmtUsd(spend.daily_cap_usd)} daily ceiling. ${configured.length} of ${providers.length} providers configured; archon cap at ${fmtUsd(spend.archon_cap_usd)}.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:lbsg-toggle"));
    return "LLM Budget Sentinel open, sir.";
  }
}

// ─── budget gauge ─────────────────────────────────────────────────────────────

function BudgetBar({ pct, color, label, spent, cap }) {
  const barPct = Math.min(100, Math.max(0, Number(pct) || 0));
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ color: GRAY, fontSize: 8, letterSpacing: 1 }}>{label}</span>
        <span style={{ color, fontSize: 8 }}>
          {fmtUsd(spent)} / {fmtUsd(cap)}
        </span>
      </div>
      <div style={{ height: 5, background: "#0A1420", borderRadius: 3, overflow: "hidden" }}>
        <div
          style={{
            width: `${barPct}%`,
            height: "100%",
            background: color,
            borderRadius: 3,
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <div style={{ textAlign: "right", marginTop: 2 }}>
        <span style={{ color: GRAY, fontSize: 8 }}>{fmtPct(pct)}</span>
      </div>
    </div>
  );
}

// ─── component ────────────────────────────────────────────────────────────────

export default function LlmBudgetSentinel() {
  const [visible,    setVisible]    = useState(false);
  const [spend,      setSpend]      = useState(null);
  const [providers,  setProviders]  = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:lbsg-toggle", onToggle);
    return () => window.removeEventListener("jarvis:lbsg-toggle", onToggle);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [spendData, provData] = await Promise.all([fetchSpend(), fetchProviders()]);
      setSpend(spendData);
      setProviders(provData?.providers ?? []);
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

  const pctUsed   = spend?.pct_used ?? 0;
  const ceilHit   = spend?.ceiling_hit ?? false;
  const configured = providers.filter((p) => p.configured).length;

  const badgeColor = ceilHit ? RED : pctUsed >= 75 ? AMBER : null;
  const badgeVal   = ceilHit ? "CEIL" : pctUsed >= 75 ? `${Math.round(pctUsed)}%` : null;

  const archonPct = spend?.archon_cap_usd
    ? Math.min(100, (spend.spent_usd / spend.archon_cap_usd) * 100)
    : 0;

  async function handleAssess() {
    setAssessing(true);
    try {
      const context = spend
        ? `spent_usd=${spend.spent_usd}, daily_cap_usd=${spend.daily_cap_usd}, pct_used=${spend.pct_used}, ceiling_hit=${spend.ceiling_hit}, archon_cap_usd=${spend.archon_cap_usd}, providers_configured=${configured}/${providers.length}`
        : "spend data unavailable";
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message: `Interpret this JARVIS LLM budget and provider snapshot in 2 sentences: ${context}. Focus on operational risk and any recommended action.`,
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

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        style={{
          position: "fixed",
          bottom: 8,
          left: `min(${BTN_LEFT}px, calc(100vw - 115px))`,
          zIndex: 114,
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
        ◉ LBSG
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
            left: `min(${BTN_LEFT - 330}px, calc(100vw - 490px))`,
            width: 460,
            maxHeight: "74vh",
            overflowY: "auto",
            zIndex: 115,
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
              ◉ LLM BUDGET SENTINEL
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {loading && (
                <span style={{ color: GRAY, fontSize: 9 }}>◌ LOADING</span>
              )}
              <button
                onClick={handleAssess}
                disabled={assessing || !spend}
                style={{
                  background: assessing ? "#1A2030" : `${CY}18`,
                  border: `1px solid ${CY}44`,
                  borderRadius: 5,
                  padding: "2px 8px",
                  color: assessing ? GRAY : CY,
                  fontSize: 9,
                  letterSpacing: 1,
                  cursor: assessing || !spend ? "default" : "pointer",
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
                  fontSize: 13,
                  cursor: "pointer",
                  padding: "0 2px",
                }}
              >
                ✕
              </button>
            </div>
          </div>

          <div style={{ padding: "10px 14px" }}>
            {/* Stat tiles */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 12 }}>
              {[
                { label: "SPENT",     value: fmtUsd(spend?.spent_usd),    color: ceilHit ? RED : CY },
                { label: "DAILY CAP", value: fmtUsd(spend?.daily_cap_usd), color: CY },
                { label: "PCT USED",  value: fmtPct(spend?.pct_used),      color: pctUsed >= 75 ? (ceilHit ? RED : AMBER) : GREEN },
                { label: "PROVIDERS", value: `${configured}/${providers.length}`, color: configured > 0 ? GREEN : GRAY },
              ].map(({ label, value, color }) => (
                <div
                  key={label}
                  style={{
                    background: color + "0E",
                    border: `1px solid ${color}33`,
                    borderRadius: 6,
                    padding: "6px 8px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ color, fontSize: 13, letterSpacing: 0.5 }}>{value}</div>
                  <div style={{ color: GRAY, fontSize: 8, marginTop: 2, letterSpacing: 1 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Budget bars */}
            {spend && (
              <div
                style={{
                  background: "#0A1420",
                  border: `1px solid ${CY}18`,
                  borderRadius: 6,
                  padding: "8px 10px",
                  marginBottom: 10,
                }}
              >
                <BudgetBar
                  pct={spend.pct_used}
                  color={ceilHit ? RED : pctUsed >= 75 ? AMBER : GREEN}
                  label="DAILY BUDGET"
                  spent={spend.spent_usd}
                  cap={spend.daily_cap_usd}
                />
                <BudgetBar
                  pct={archonPct}
                  color={archonPct >= 75 ? AMBER : CY}
                  label="ARCHON CAP"
                  spent={spend.spent_usd}
                  cap={spend.archon_cap_usd}
                />
                {ceilHit && (
                  <div
                    style={{
                      marginTop: 6,
                      background: RED + "18",
                      border: `1px solid ${RED}44`,
                      borderRadius: 4,
                      padding: "4px 8px",
                      color: RED,
                      fontSize: 9,
                      letterSpacing: 1,
                    }}
                  >
                    ⚠ CEILING HIT — economy mode forced (cheapest model)
                  </div>
                )}
              </div>
            )}

            {/* Provider list */}
            <div style={{ marginBottom: 6 }}>
              <div
                style={{
                  color: GRAY,
                  fontSize: 8,
                  letterSpacing: 2,
                  marginBottom: 6,
                  paddingBottom: 3,
                  borderBottom: `1px solid ${CY}18`,
                }}
              >
                LLM PROVIDERS
              </div>
              {providers.length === 0 && !loading && (
                <div style={{ color: GRAY, fontSize: 10, textAlign: "center", padding: "10px 0" }}>
                  No provider data
                </div>
              )}
              {providers.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 8px",
                    marginBottom: 4,
                    background: p.configured ? `${GREEN}08` : "#0A1420",
                    border: `1px solid ${p.configured ? GREEN + "33" : CY + "15"}`,
                    borderRadius: 5,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: p.configured ? GREEN : GRAY,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ color: p.configured ? CY : GRAY, fontSize: 10, flex: "0 0 80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.id}
                  </span>
                  <span style={{ color: GRAY, fontSize: 9, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.model || "–"}
                  </span>
                  <span
                    style={{
                      background: p.configured ? GREEN + "22" : GRAY + "22",
                      border: `1px solid ${p.configured ? GREEN + "55" : GRAY + "44"}`,
                      borderRadius: 3,
                      padding: "0 5px",
                      color: p.configured ? GREEN : GRAY,
                      fontSize: 8,
                      letterSpacing: 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.configured ? "CONFIGURED" : "UNCONFIGURED"}
                  </span>
                </div>
              ))}
            </div>

            {/* Assessment output */}
            {assessment && (
              <div
                style={{
                  background: `${CY}0A`,
                  border: `1px solid ${CY}33`,
                  borderRadius: 6,
                  padding: "8px 10px",
                  color: "#DCEBF5",
                  fontSize: 10,
                  lineHeight: 1.5,
                  letterSpacing: 0.3,
                  marginTop: 8,
                }}
              >
                {assessment}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              borderTop: `1px solid ${CY}1A`,
              padding: "5px 14px",
              color: "#2E4050",
              fontSize: 9,
              letterSpacing: 1,
            }}
          >
            /v1/token-governor/spend_status · /v1/aip/providers · 60 s refresh
          </div>
        </div>
      )}
    </>
  );
}
