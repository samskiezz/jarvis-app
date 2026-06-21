/**
 * MorningBriefing — F33
 * "JARVIS, brief me" / "JARVIS, morning briefing" opens a live briefing panel.
 * Parallel-fetches /v1/jarvis/system/status + /v1/cinematic/brain + /functions/getLiveIntel,
 * assembles a structured spoken briefing from real data, speaks via /v1/voice/tts.
 * Toggle button at left:2156 bottom strip. Additive only — mounted via App.jsx.
 */
import { useState, useCallback, useEffect } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const RED = "#FF3B3B";
const YLW = "#FFD700";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const BRIEF_RE = /\b(brief|briefing|morning|morning.brief|daily.brief|debrief|report.in|run.briefing|give.me.a.brief|status.report|daily.report)\b/i;

export function isBriefingQuery(text) {
  return BRIEF_RE.test(text || "");
}

async function fetchAll() {
  const [sysRes, brainRes, intelRes] = await Promise.allSettled([
    fetch(`${apiBase()}/v1/jarvis/system/status`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then((r) => (r.ok ? r.json() : null)),
    fetch(`${apiBase()}/v1/cinematic/brain`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then((r) => (r.ok ? r.json() : null)),
    fetch(`${apiBase()}/functions/getLiveIntel`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then((r) => (r.ok ? r.json() : null)),
  ]);

  return {
    sys:   sysRes.status   === "fulfilled" ? sysRes.value   : null,
    brain: brainRes.status === "fulfilled" ? brainRes.value : null,
    intel: intelRes.status === "fulfilled" ? intelRes.value : null,
  };
}

function parseSys(sys) {
  if (!sys) return null;
  const cpu    = sys.cpu_percent ?? sys.cpu ?? sys.load?.["1m"] ?? null;
  const mem    = sys.memory_percent ?? sys.memory?.percent ?? sys.mem ?? null;
  const status = sys.status || sys.overall || sys.health || "unknown";
  const uptime = sys.uptime || sys.uptime_str || null;
  return { cpu, mem, status, uptime };
}

function parseBrain(brain) {
  if (!brain) return null;
  const nodes    = brain.nodes ?? brain.node_count ?? brain.total_nodes ?? null;
  const synapses = brain.synapses ?? brain.synapse_count ?? brain.total_synapses ?? null;
  const health   = brain.health ?? brain.status ?? null;
  return { nodes, synapses, health };
}

function parseIntel(intel) {
  if (!intel) return { quakes: [], crypto: [], fx: [] };
  const quakes = (intel.earthquakes || intel.quakes || []).slice(0, 3);
  const crypto = (intel.crypto || intel.cryptocurrencies || []).slice(0, 3);
  const fx     = (intel.fx || intel.forex || intel.currency || []).slice(0, 3);
  return { quakes, crypto, fx };
}

export async function buildBriefingScript() {
  const { sys, brain, intel } = await fetchAll();
  const s = parseSys(sys);
  const b = parseBrain(brain);
  const { quakes, crypto } = parseIntel(intel);

  const lines = ["Good morning, sir. Here is your tactical briefing."];

  if (s) {
    const cpuStr = s.cpu != null ? `CPU at ${Math.round(s.cpu)} percent` : "";
    const memStr = s.mem != null ? `memory at ${Math.round(s.mem)} percent` : "";
    const sysHealth = [cpuStr, memStr].filter(Boolean).join(", ");
    lines.push(`System status is ${s.status}${sysHealth ? ". " + sysHealth : ""}.${s.uptime ? " Uptime: " + s.uptime + "." : ""}`);
  }

  if (b) {
    const nStr = b.nodes != null ? `${b.nodes} active nodes` : "";
    const sStr = b.synapses != null ? `${b.synapses} synapses` : "";
    const both = [nStr, sStr].filter(Boolean).join(" and ");
    if (both) lines.push(`The intelligence brain is tracking ${both}.`);
  }

  if (quakes.length > 0) {
    const top = quakes[0];
    const mag = top.magnitude ?? top.mag ?? "";
    const loc = top.location || top.place || top.region || "";
    if (mag || loc) lines.push(`World alert: magnitude ${mag} seismic event ${loc ? "near " + loc : ""}.`);
    if (quakes.length > 1) lines.push(`${quakes.length - 1} additional seismic event${quakes.length > 2 ? "s" : ""} recorded in the last period.`);
  }

  if (crypto.length > 0) {
    const entries = crypto
      .filter((c) => c.symbol || c.name)
      .map((c) => {
        const sym = c.symbol || c.name;
        const price = c.price != null ? `${Number(c.price).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : null;
        const chg = c.change_24h ?? c.change ?? c.percent_change ?? null;
        return `${sym}${price ? " at " + price : ""}${chg != null ? " (" + (chg > 0 ? "+" : "") + Number(chg).toFixed(1) + "%)" : ""}`;
      });
    if (entries.length) lines.push(`Markets: ${entries.join("; ")}.`);
  }

  lines.push("All systems nominal. Standing by for your orders, sir.");
  return lines.join(" ");
}

function StatusBadge({ label, color }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: "2px 7px",
      border: `1px solid ${color}66`, borderRadius: 4, color, background: `${color}11`,
    }}>{label}</span>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, color: `${CY}77`, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

export default function MorningBriefing() {
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData]       = useState(null);
  const [error, setError]     = useState(null);

  useEffect(() => {
    const onOpen = () => { setOpen(true); load(); };
    window.addEventListener("jarvis:briefing-open", onOpen);
    return () => window.removeEventListener("jarvis:briefing-open", onOpen);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAll();
      setData(result);
    } catch (e) {
      setError("Briefing data unavailable.");
    } finally {
      setLoading(false);
    }
  }, [loading]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !data) load();
    if (next && data) load(); // always refresh on open
  }

  const sys   = data ? parseSys(data.sys)     : null;
  const brain = data ? parseBrain(data.brain) : null;
  const { quakes, crypto, fx } = data ? parseIntel(data.intel) : { quakes: [], crypto: [], fx: [] };

  function sysStatusColor(s = "") {
    if (/ok|online|healthy|nominal|running|active/i.test(s)) return GRN;
    if (/warn|degraded|slow/i.test(s)) return YLW;
    if (/error|down|fail|offline|critical/i.test(s)) return RED;
    return CY;
  }

  return (
    <>
      {/* Toggle button — bottom strip at left:2156 */}
      <button
        onClick={toggle}
        title="Morning Briefing (F33)"
        style={{
          position: "fixed", left: 2156, bottom: 18, zIndex: 68,
          background: open ? `${CY}22` : "rgba(5,8,13,0.82)",
          border: `1px solid ${open ? CY : CY + "44"}`,
          color: open ? CY : `${CY}88`, borderRadius: 6, padding: "4px 10px",
          fontSize: 10, letterSpacing: 1.5, cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace",
        }}
      >
        ☀ BRIEF
      </button>

      {/* Briefing panel */}
      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 68,
          width: "min(480px,92vw)", maxHeight: "70vh",
          background: "rgba(6,11,18,0.95)", border: `1px solid ${CY}44`,
          borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column",
          boxShadow: `0 0 60px ${CY}14`, fontFamily: "'JetBrains Mono',monospace",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
          }}>
            <span style={{ color: CY, fontSize: 14 }}>☀</span>
            <span style={{ color: CY, fontSize: 11, fontWeight: 700, letterSpacing: 3 }}>MORNING BRIEFING</span>
            {loading && (
              <span style={{ marginLeft: "auto", color: `${CY}77`, fontSize: 10, letterSpacing: 1 }}>
                ◌ compiling…
              </span>
            )}
            {!loading && data && (
              <button onClick={load} style={{
                marginLeft: "auto", background: "transparent", border: `1px solid ${CY}33`,
                color: `${CY}77`, borderRadius: 4, padding: "2px 7px", cursor: "pointer",
                fontSize: 9, letterSpacing: 1, fontFamily: "'JetBrains Mono',monospace",
              }}>↻ refresh</button>
            )}
            <button onClick={() => setOpen(false)} style={{
              background: "transparent", border: "none", color: `${CY}55`,
              cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0,
              fontFamily: "'JetBrains Mono',monospace",
            }}>✕</button>
          </div>

          <div style={{ overflowY: "auto", padding: "14px" }}>
            {error && (
              <div style={{ color: RED, fontSize: 12 }}>{error}</div>
            )}

            {!loading && !data && !error && (
              <div style={{ color: `${CY}66`, fontSize: 12 }}>Loading briefing data…</div>
            )}

            {/* System Health */}
            {sys && (
              <Section title="System Health">
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <StatusBadge label={String(sys.status).toUpperCase()} color={sysStatusColor(sys.status)} />
                  {sys.cpu != null && (
                    <span style={{ fontSize: 11, color: "#8AAABB" }}>
                      CPU <span style={{ color: sys.cpu > 80 ? RED : sys.cpu > 60 ? YLW : GRN }}>{Math.round(sys.cpu)}%</span>
                    </span>
                  )}
                  {sys.mem != null && (
                    <span style={{ fontSize: 11, color: "#8AAABB" }}>
                      MEM <span style={{ color: sys.mem > 85 ? RED : sys.mem > 65 ? YLW : GRN }}>{Math.round(sys.mem)}%</span>
                    </span>
                  )}
                  {sys.uptime && (
                    <span style={{ fontSize: 11, color: "#8AAABB" }}>
                      UP <span style={{ color: CY }}>{sys.uptime}</span>
                    </span>
                  )}
                </div>
              </Section>
            )}

            {/* Brain Stats */}
            {brain && (
              <Section title="Intelligence Brain">
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {brain.nodes != null && (
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: CY }}>{Number(brain.nodes).toLocaleString()}</div>
                      <div style={{ fontSize: 9, color: `${CY}66`, letterSpacing: 1 }}>NODES</div>
                    </div>
                  )}
                  {brain.synapses != null && (
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: GRN }}>{Number(brain.synapses).toLocaleString()}</div>
                      <div style={{ fontSize: 9, color: `${GRN}66`, letterSpacing: 1 }}>SYNAPSES</div>
                    </div>
                  )}
                  {brain.health && (
                    <StatusBadge label={String(brain.health).toUpperCase()} color={sysStatusColor(brain.health)} />
                  )}
                </div>
              </Section>
            )}

            {/* World Intel — Earthquakes */}
            {quakes.length > 0 && (
              <Section title="Seismic Activity">
                {quakes.map((q, i) => {
                  const mag = q.magnitude ?? q.mag ?? "?";
                  const loc = q.location || q.place || q.region || "Unknown";
                  const magNum = parseFloat(mag);
                  const magColor = magNum >= 6 ? RED : magNum >= 4.5 ? YLW : CY;
                  return (
                    <div key={i} style={{
                      display: "flex", gap: 8, alignItems: "center",
                      padding: "4px 0", borderBottom: i < quakes.length - 1 ? `1px solid ${CY}11` : "none",
                    }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: magColor, minWidth: 36 }}>M{mag}</span>
                      <span style={{ fontSize: 11, color: "#8AAABB", flex: 1 }}>{loc}</span>
                    </div>
                  );
                })}
              </Section>
            )}

            {/* World Intel — Crypto */}
            {crypto.length > 0 && (
              <Section title="Crypto Markets">
                {crypto.map((c, i) => {
                  const sym = c.symbol || c.name || "?";
                  const price = c.price != null
                    ? Number(c.price).toLocaleString("en-US", { maximumFractionDigits: 2 })
                    : null;
                  const chg = c.change_24h ?? c.change ?? c.percent_change ?? null;
                  const chgColor = chg == null ? CY : chg >= 0 ? GRN : RED;
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "4px 0",
                      borderBottom: i < crypto.length - 1 ? `1px solid ${CY}11` : "none",
                    }}>
                      <span style={{ fontSize: 11, color: CY, fontWeight: 700, minWidth: 52 }}>{sym}</span>
                      {price && <span style={{ fontSize: 11, color: "#DCEBF5", flex: 1 }}>${price}</span>}
                      {chg != null && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: chgColor }}>
                          {chg >= 0 ? "+" : ""}{Number(chg).toFixed(2)}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </Section>
            )}

            {/* FX */}
            {fx.length > 0 && (
              <Section title="FX / Forex">
                {fx.map((f, i) => {
                  const pair = f.pair || f.symbol || f.name || "?";
                  const rate = f.rate ?? f.price ?? f.value ?? null;
                  const chg  = f.change ?? f.change_24h ?? null;
                  const chgColor = chg == null ? CY : chg >= 0 ? GRN : RED;
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "4px 0",
                      borderBottom: i < fx.length - 1 ? `1px solid ${CY}11` : "none",
                    }}>
                      <span style={{ fontSize: 11, color: CY, fontWeight: 700, minWidth: 60 }}>{pair}</span>
                      {rate != null && <span style={{ fontSize: 11, color: "#DCEBF5", flex: 1 }}>{Number(rate).toFixed(4)}</span>}
                      {chg != null && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: chgColor }}>
                          {chg >= 0 ? "+" : ""}{Number(chg).toFixed(4)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </Section>
            )}

            {/* Empty state */}
            {!loading && data && !sys && !brain && quakes.length === 0 && crypto.length === 0 && fx.length === 0 && (
              <div style={{ color: `${CY}66`, fontSize: 12 }}>
                Briefing data received but no structured fields extracted. Raw endpoints may be returning non-standard shapes.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
