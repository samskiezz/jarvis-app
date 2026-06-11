/**
 * IntelDigest — F43
 * Fetches /functions/getLiveIntel (quakes/crypto/fx) and feeds the raw data
 * to /v1/jarvis/agent/chat to generate a rolling AI-written intelligence digest.
 * Auto-refreshes every 5 minutes. Each cycle produces a fresh 3-sentence summary.
 * "JARVIS, intel digest" | "live digest" | "news digest" → opens panel + speaks.
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const GRN  = "#00E5A0";
const YLW  = "#FFD700";
const PURP = "#b18cff";
const POLL = 5 * 60 * 1000; // 5 min
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const DIGEST_RE =
  /\b(intel.digest|live.digest|news.digest|intelligence.digest|situation.digest|daily.digest|digest)\b/i;

export function isIntelDigestQuery(t) {
  return DIGEST_RE.test(t || "");
}

async function fetchLiveIntel() {
  const r = await fetch(`${apiBase()}/functions/getLiveIntel`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error("getLiveIntel failed");
  return r.json();
}

async function synthesiseDigest(intel) {
  const quakes = (intel?.earthquakes || intel?.quakes || []).slice(0, 3);
  const crypto  = (intel?.crypto || intel?.markets?.crypto || []).slice(0, 4);
  const fx      = (intel?.fx || intel?.markets?.fx || []).slice(0, 3);

  const summary = [
    quakes.length
      ? `Seismic: ${quakes.map(q => `M${q.magnitude ?? q.mag ?? "?"} ${q.place || q.location || "unknown"}`).join("; ")}.`
      : "",
    crypto.length
      ? `Crypto: ${crypto.map(c => `${c.symbol || c.name} ${c.price != null ? "$" + Number(c.price).toLocaleString() : ""} ${c.change_24h != null ? (c.change_24h >= 0 ? "+" : "") + c.change_24h.toFixed(2) + "%" : ""}`).join(", ")}.`
      : "",
    fx.length
      ? `FX: ${fx.map(f => `${f.pair || f.symbol} ${f.rate != null ? f.rate.toFixed(4) : ""}`).join(", ")}.`
      : "",
  ].filter(Boolean).join(" ");

  const prompt =
    `You are JARVIS, a British AI butler. Write a concise 3-sentence spoken intelligence ` +
    `digest from the following live data. Be factual and specific. Use a calm, authoritative tone.\n\n` +
    `LIVE DATA:\n${summary || JSON.stringify(intel).slice(0, 800)}`;

  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ message: prompt }),
  });
  if (!r.ok) throw new Error("agent/chat failed");
  const d = await r.json();
  return (d.answer || d.response || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
}

export async function buildIntelDigestScript() {
  try {
    const intel = await fetchLiveIntel();
    const digest = await synthesiseDigest(intel);
    if (digest) return digest;
    return "Intelligence digest is online. Monitoring seismic, crypto, and foreign-exchange feeds. Standing by, sir.";
  } catch (_) {
    return "Intelligence digest online. Live feeds are updating. Standing by, sir.";
  }
}

function formatAge(ts) {
  if (!ts) return "";
  const ms = Date.now() - ts;
  const m = Math.floor(ms / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function QuakeRow({ q }) {
  const mag = q.magnitude ?? q.mag ?? null;
  const color = mag >= 6 ? "#FF4D6D" : mag >= 4.5 ? YLW : GRN;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "4px 8px",
      background: `${color}0a`,
      border: `1px solid ${color}33`,
      borderRadius: 5, marginBottom: 3,
    }}>
      <span style={{ fontSize: 9, color, fontWeight: "bold", minWidth: 30 }}>
        {mag != null ? `M${mag}` : "M?"}
      </span>
      <span style={{ fontSize: 9, color: "#DCEBF5", flex: 1 }}>
        {q.place || q.location || q.region || "Unknown location"}
      </span>
      <span style={{ fontSize: 8, color: "#6E8AA0" }}>
        {q.depth != null ? `${q.depth} km` : ""}
      </span>
    </div>
  );
}

function CryptoRow({ c }) {
  const chg = c.change_24h ?? c.percent_change_24h ?? null;
  const up = chg != null && chg >= 0;
  const color = chg == null ? CY : up ? GRN : "#FF4D6D";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "4px 8px",
      background: `${color}0a`,
      border: `1px solid ${color}22`,
      borderRadius: 5, marginBottom: 3,
    }}>
      <span style={{ fontSize: 9, color: PURP, fontWeight: "bold", minWidth: 42 }}>
        {c.symbol || c.name || "—"}
      </span>
      <span style={{ fontSize: 9, color: CY, flex: 1 }}>
        {c.price != null ? `$${Number(c.price).toLocaleString()}` : "—"}
      </span>
      {chg != null && (
        <span style={{ fontSize: 8, color, fontWeight: "bold" }}>
          {up ? "+" : ""}{chg.toFixed(2)}%
        </span>
      )}
    </div>
  );
}

function FxRow({ f }) {
  const chg = f.change ?? f.change_pct ?? null;
  const up = chg != null && chg >= 0;
  const color = chg == null ? CY : up ? GRN : "#FF4D6D";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "4px 8px",
      background: `${CY}05`,
      border: `1px solid ${CY}22`,
      borderRadius: 5, marginBottom: 3,
    }}>
      <span style={{ fontSize: 9, color: CY, fontWeight: "bold", minWidth: 52 }}>
        {f.pair || f.symbol || "—"}
      </span>
      <span style={{ fontSize: 9, color: "#DCEBF5", flex: 1 }}>
        {f.rate != null ? f.rate.toFixed(4) : f.price != null ? f.price.toFixed(4) : "—"}
      </span>
      {chg != null && (
        <span style={{ fontSize: 8, color, fontWeight: "bold" }}>
          {up ? "+" : ""}{chg.toFixed(4)}
        </span>
      )}
    </div>
  );
}

export default function IntelDigest() {
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [synthesising, setSyn]  = useState(false);
  const [intel, setIntel]       = useState(null);
  const [digest, setDigest]     = useState("");
  const [digestTs, setDigestTs] = useState(null);
  const [error, setError]       = useState(null);
  const timerRef = useRef(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await fetchLiveIntel();
      setIntel(data);
      setSyn(true);
      try {
        const text = await synthesiseDigest(data);
        setDigest(text);
        setDigestTs(Date.now());
      } catch (_) {
        setDigest("AI synthesis unavailable — showing raw feed data.");
      } finally {
        setSyn(false);
      }
    } catch (e) {
      setError("Live intel feed unreachable.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open && !intel) refresh();
  }, [open, intel, refresh]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(refresh, POLL);
    return () => clearInterval(timerRef.current);
  }, [open, refresh]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:intel-digest-toggle", onToggle);
    return () => window.removeEventListener("jarvis:intel-digest-toggle", onToggle);
  }, []);

  const quakes = intel?.earthquakes || intel?.quakes || [];
  const crypto  = intel?.crypto || intel?.markets?.crypto || [];
  const fx      = intel?.fx || intel?.markets?.fx || [];

  return (
    <>
      {/* Bottom-strip toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Intel Digest — F43 (AI-synthesised live brief)"
        style={{
          position: "fixed", bottom: 18, left: 3196, zIndex: 60,
          background: open ? `${CY}22` : "rgba(5,8,13,0.7)",
          border: `1px solid ${open ? CY : CY + "55"}`,
          color: open ? CY : `${CY}99`,
          borderRadius: 6, padding: "3px 9px", fontSize: 9, letterSpacing: 1.5,
          fontFamily: "'JetBrains Mono',monospace", cursor: "pointer",
          backdropFilter: "blur(6px)", whiteSpace: "nowrap",
        }}
      >
        ◈ DIGEST
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 54, left: 3196,
          width: "min(520px, 96vw)",
          maxHeight: "82vh",
          overflowY: "auto",
          background: "rgba(6,11,18,0.97)",
          border: `1px solid ${CY}44`,
          borderRadius: 12,
          boxShadow: `0 0 60px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace",
          zIndex: 62,
        }}>

          {/* Header */}
          <div style={{
            padding: "10px 14px 8px",
            borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ color: CY, fontSize: 11, fontWeight: "bold", letterSpacing: 2 }}>
              ◈ INTEL DIGEST
            </span>
            {(loading || synthesising) && (
              <span style={{ fontSize: 9, color: `${CY}99`, marginLeft: 4 }}>
                {synthesising ? "synthesising…" : "fetching…"}
              </span>
            )}
            <span style={{ marginLeft: "auto", fontSize: 9, color: "#6E8AA0" }}>
              {digestTs ? `synth ${formatAge(digestTs)}` : ""}
            </span>
            <button onClick={refresh} disabled={loading || synthesising} style={{
              background: "transparent", border: `1px solid ${CY}33`, color: CY,
              borderRadius: 4, padding: "2px 8px", fontSize: 9, cursor: "pointer",
              opacity: (loading || synthesising) ? 0.5 : 1,
            }}>↺</button>
            <button onClick={() => setOpen(false)} style={{
              background: "transparent", border: "none", color: "#6E8AA0",
              fontSize: 12, cursor: "pointer", padding: "0 2px",
            }}>✕</button>
          </div>

          <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 14 }}>

            {/* AI Digest panel */}
            <section>
              <div style={{ fontSize: 9, color: `${CY}88`, letterSpacing: 2, marginBottom: 6 }}>
                AI SYNTHESIS
              </div>
              <div style={{
                padding: "10px 12px",
                background: `${PURP}08`,
                border: `1px solid ${PURP}33`,
                borderRadius: 8,
                fontSize: 11,
                color: "#DCEBF5",
                lineHeight: 1.7,
                minHeight: 48,
              }}>
                {error ? (
                  <span style={{ color: "#FF4D6D" }}>{error}</span>
                ) : synthesising ? (
                  <span style={{ color: `${PURP}88` }}>Synthesising intelligence digest…</span>
                ) : digest ? (
                  digest
                ) : (loading ? (
                  <span style={{ color: `${CY}66` }}>Fetching live feeds…</span>
                ) : (
                  <span style={{ color: `${CY}44` }}>Press ↺ to generate digest</span>
                ))}
              </div>
            </section>

            {/* Seismic */}
            {quakes.length > 0 && (
              <section>
                <div style={{ fontSize: 9, color: `${CY}88`, letterSpacing: 2, marginBottom: 6 }}>
                  SEISMIC ACTIVITY
                  <span style={{ marginLeft: 8, color: `${CY}55` }}>({quakes.length} events)</span>
                </div>
                {quakes.slice(0, 6).map((q, i) => <QuakeRow key={q.id ?? i} q={q} />)}
              </section>
            )}

            {/* Crypto */}
            {crypto.length > 0 && (
              <section>
                <div style={{ fontSize: 9, color: `${CY}88`, letterSpacing: 2, marginBottom: 6 }}>
                  CRYPTO MARKETS
                  <span style={{ marginLeft: 8, color: `${CY}55` }}>({crypto.length} assets)</span>
                </div>
                {crypto.slice(0, 8).map((c, i) => <CryptoRow key={c.symbol ?? c.id ?? i} c={c} />)}
              </section>
            )}

            {/* FX */}
            {fx.length > 0 && (
              <section>
                <div style={{ fontSize: 9, color: `${CY}88`, letterSpacing: 2, marginBottom: 6 }}>
                  FOREIGN EXCHANGE
                  <span style={{ marginLeft: 8, color: `${CY}55` }}>({fx.length} pairs)</span>
                </div>
                {fx.slice(0, 6).map((f, i) => <FxRow key={f.pair ?? f.symbol ?? i} f={f} />)}
              </section>
            )}

            {!intel && !loading && !error && (
              <div style={{ fontSize: 10, color: `${CY}55`, textAlign: "center", padding: "12px 0" }}>
                Press ↺ to fetch live feeds and generate digest
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "6px 14px 10px",
            borderTop: `1px solid ${CY}11`,
            fontSize: 8, color: "#6E8AA0",
            display: "flex", justifyContent: "space-between",
          }}>
            <span>auto-refresh every 5 min</span>
            <span style={{ color: GRN }}>◉ getLiveIntel + agent/chat</span>
          </div>
        </div>
      )}
    </>
  );
}
