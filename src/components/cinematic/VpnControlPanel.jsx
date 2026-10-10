/**
 * VpnControlPanel — F251.
 *
 * Data sources (real — backed by server/routes/vpn.py):
 *   GET  /v1/vpn/status  every 60 s
 *       → { ok, installed, active, interfaces:[{iface, listen_port, public_key, peers, latest_handshake}],
 *           schema_version, source, hint }
 *   POST /v1/vpn/toggle  { iface, action:"up"|"down" }
 *       → { ok, iface, action, rc, stdout, stderr, source }
 *
 * Displays:
 *   - Stat tiles: installed / active / interfaces / total peers
 *   - Source chip: LIVE or SCHEMA
 *   - Per-interface rows: iface name, listen_port, peer count, last-handshake age
 *   - ▲ UP / ▼ DOWN toggle buttons (bearer-authenticated)
 *   - Peer detail on expand (public_key, allowed_ips, endpoint, rx/tx bytes, handshake)
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence VPN brief + TTS
 *
 * Toggle: ◈ VPN at left:174000, bottom:8, zIndex:131.
 * Badge: green = active tunnels, amber = installed but no active interface, dim = not installed.
 * 60 s auto-refresh.
 *
 * Exported helpers for JarvisBrain:
 *   isVpnQuery(q) / buildVpnScript()
 *
 * Voice triggers: "vpn / wireguard / vpn status / tunnel / vpn control /
 *   network tunnel / vpn peers / wireguard tunnel / vpn panel / wg tunnel /
 *   vpn up / vpn down / wg status"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RED  = "#F87171";
const DIM  = "#3A4A55";
const ORNG = "#FB923C";

const BTN_LEFT   = 174000;
const REFRESH_MS = 60_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const VPN_RE =
  /\b(vpn|wireguard|vpn\s*status|tunnel|vpn\s*control|network\s*tunnel|vpn\s*peers?|wireguard\s*tunnel|vpn\s*panel|wg\s*tunnel|vpn\s*up|vpn\s*down|wg\s*status)\b/i;

export function isVpnQuery(t) {
  return VPN_RE.test(t || "");
}

export async function buildVpnScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/vpn/status`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    const installed = d?.installed ?? false;
    const active    = d?.active ?? false;
    const ifaces    = d?.interfaces ?? [];
    const peerCount = ifaces.reduce((acc, i) => {
      const p = i.peers;
      return acc + (Array.isArray(p) ? p.length : typeof p === "number" ? p : 0);
    }, 0);
    if (!installed) {
      return "WireGuard is not installed on this host. Install wireguard-tools and configure a wg0.conf to enable tunnels.";
    }
    if (!active) {
      return `WireGuard is installed but no interfaces are currently active. ${ifaces.length} interface config${ifaces.length !== 1 ? "s" : ""} found with ${peerCount} peer${peerCount !== 1 ? "s" : ""}. Use ▲ UP to bring a tunnel online.`;
    }
    const ifaceNames = ifaces.map((i) => i.iface).join(", ");
    return (
      `WireGuard is active on ${ifaces.length} interface${ifaces.length !== 1 ? "s" : ""} (${ifaceNames}) ` +
      `with ${peerCount} configured peer${peerCount !== 1 ? "s" : ""}. ` +
      `Tunnels appear healthy — use ▼ DOWN to safely disconnect an interface.`
    );
  } catch {
    return "Unable to reach the VPN status endpoint at this time, sir.";
  }
}

// ─── fetch helpers ──────────────────────────────────────────────────────────

async function fetchStatus() {
  const r = await fetch(`${apiBase()}/v1/vpn/status`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function postToggle(iface, action) {
  const r = await fetch(`${apiBase()}/v1/vpn/toggle`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ iface, action }),
  });
  return r.json();
}

async function agentAssess(installed, active, ifaceCount, peerCount) {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      message:
        `Assess the VPN tunnel status in 2 sentences: WireGuard is ${installed ? "installed" : "NOT installed"}, ` +
        `${active ? "active" : "inactive"}, ${ifaceCount} interface${ifaceCount !== 1 ? "s" : ""}, ` +
        `${peerCount} peer${peerCount !== 1 ? "s" : ""} configured.`,
    }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "No assessment available.";
}

// ─── sub-components ─────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{
      flex: 1, minWidth: 64, background: `${color}0d`,
      border: `1px solid ${color}33`, borderRadius: 8,
      padding: "8px 10px", display: "flex", flexDirection: "column", gap: 3,
    }}>
      <span style={{ fontSize: 7, color: DIM, letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color, letterSpacing: 1 }}>{value}</span>
    </div>
  );
}

function handshakeAge(ts) {
  if (!ts || ts === 0) return "never";
  const diff = Date.now() / 1000 - ts;
  if (diff < 60)    return `${Math.round(diff)}s ago`;
  if (diff < 3600)  return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

function bytesLabel(n) {
  if (!n) return "0 B";
  if (n < 1024)      return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function IfaceRow({ iface, expanded, onToggle, onUp, onDown, busy }) {
  const peers = iface.peers;
  const peerCount = Array.isArray(peers) ? peers.length : typeof peers === "number" ? peers : 0;
  const latestHs  = Array.isArray(peers)
    ? Math.max(0, ...peers.map((p) => p?.latest_handshake ?? 0))
    : iface.latest_handshake ?? 0;
  const hasPeers  = Array.isArray(peers) && peers.length > 0;

  return (
    <div style={{
      padding: "8px 12px", borderBottom: `1px solid ${CY}11`,
      background: expanded ? `${CY}06` : "transparent",
    }}>
      {/* header row */}
      <div
        onClick={onToggle}
        style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
      >
        <span style={{
          fontSize: 9, color: CY, fontFamily: "monospace", fontWeight: 700, flex: 1,
        }}>
          {iface.iface}
        </span>
        {iface.listen_port && (
          <span style={{ fontSize: 7, color: DIM }}>:{iface.listen_port}</span>
        )}
        <span style={{ fontSize: 7, color: GN }}>{peerCount} peer{peerCount !== 1 ? "s" : ""}</span>
        {latestHs > 0 && (
          <span style={{ fontSize: 7, color: AM }}>{handshakeAge(latestHs)}</span>
        )}
        {/* UP / DOWN buttons */}
        <button
          disabled={!!busy}
          onClick={(e) => { e.stopPropagation(); onUp(); }}
          style={{
            fontSize: 7, padding: "2px 6px", borderRadius: 3, cursor: "pointer",
            border: `1px solid ${GN}77`, color: GN, background: `${GN}11`,
            opacity: busy ? 0.5 : 1,
          }}
          title="wg-quick up"
        >
          ▲ UP
        </button>
        <button
          disabled={!!busy}
          onClick={(e) => { e.stopPropagation(); onDown(); }}
          style={{
            fontSize: 7, padding: "2px 6px", borderRadius: 3, cursor: "pointer",
            border: `1px solid ${RED}77`, color: RED, background: `${RED}11`,
            opacity: busy ? 0.5 : 1,
          }}
          title="wg-quick down"
        >
          ▼ DOWN
        </button>
        <span style={{ fontSize: 8, color: DIM }}>{expanded ? "▴" : "▾"}</span>
      </div>

      {expanded && (
        <div style={{ marginTop: 8 }}>
          {/* public key */}
          {iface.public_key && (
            <div style={{
              fontSize: 7, color: DIM, fontFamily: "monospace", marginBottom: 6,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              pubkey: {iface.public_key}
            </div>
          )}
          {/* peer list */}
          {hasPeers ? (
            peers.map((peer, pi) => (
              <div
                key={peer.public_key || pi}
                style={{
                  marginBottom: 4, padding: "5px 8px",
                  background: `${CY}05`, borderRadius: 5, border: `1px solid ${CY}15`,
                }}
              >
                <div style={{
                  fontSize: 7, color: "#8899A6", fontFamily: "monospace",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  marginBottom: 3,
                }}>
                  {(peer.name ? `[${peer.name}] ` : "")}
                  {peer.public_key?.slice(0, 24)}…
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {peer.allowed_ips && (
                    <span style={{ fontSize: 7, color: CY }}>
                      {peer.allowed_ips}
                    </span>
                  )}
                  {peer.endpoint && (
                    <span style={{ fontSize: 7, color: ORNG }}>
                      ep: {peer.endpoint}
                    </span>
                  )}
                  {peer.latest_handshake != null && (
                    <span style={{ fontSize: 7, color: AM }}>
                      hs: {handshakeAge(peer.latest_handshake)}
                    </span>
                  )}
                  {(peer.rx_bytes != null || peer.tx_bytes != null) && (
                    <span style={{ fontSize: 7, color: GN }}>
                      ↓{bytesLabel(peer.rx_bytes)} ↑{bytesLabel(peer.tx_bytes)}
                    </span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div style={{ fontSize: 7, color: DIM, padding: "4px 0" }}>
              No peer detail available.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── main component ─────────────────────────────────────────────────────────

export default function VpnControlPanel() {
  const [open,      setOpen]      = useState(false);
  const [status,    setStatus]    = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [dossier,   setDossier]   = useState(null);
  const [expanded,  setExpanded]  = useState(null);
  const [busy,      setBusy]      = useState({});
  const [toggleMsg, setToggleMsg] = useState(null);

  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchStatus();
      setStatus(d);
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (VPN_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:vpn-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:vpn-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  async function handleAssess() {
    if (assessing || !status) return;
    setAssessing(true);
    setDossier(null);
    try {
      const ifaces   = status.interfaces ?? [];
      const peerCount = ifaces.reduce((acc, i) => {
        const p = i.peers;
        return acc + (Array.isArray(p) ? p.length : typeof p === "number" ? p : 0);
      }, 0);
      const text = await agentAssess(
        status.installed ?? false,
        status.active    ?? false,
        ifaces.length,
        peerCount,
      );
      setDossier(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {
      setDossier("Assessment unavailable.");
    }
    setAssessing(false);
  }

  async function handleToggle(iface, action) {
    const key = `${iface}_${action}`;
    setBusy((b) => ({ ...b, [key]: true }));
    setToggleMsg(null);
    try {
      const d = await postToggle(iface, action);
      if (d.ok) {
        setToggleMsg(`✓ ${iface} ${action.toUpperCase()}`);
        await load();
      } else {
        setToggleMsg(`✕ ${d.error || d.stderr?.slice(0, 80) || "failed"}`);
      }
    } catch (err) {
      setToggleMsg(`✕ ${err.message}`);
    }
    setBusy((b) => ({ ...b, [key]: false }));
    setTimeout(() => setToggleMsg(null), 4000);
  }

  // derived
  const installed  = status?.installed ?? false;
  const active     = status?.active    ?? false;
  const ifaces     = status?.interfaces ?? [];
  const peerTotal  = ifaces.reduce((acc, i) => {
    const p = i.peers;
    return acc + (Array.isArray(p) ? p.length : typeof p === "number" ? p : 0);
  }, 0);
  const isLive     = status?.source === "live";

  const badgeColor = active ? GN : (installed ? AM : DIM);
  const badgeVal   = active ? ifaces.length : null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 131,
          background: "#091520", border: `1px solid ${CY}44`, borderRadius: 6,
          color: CY, fontSize: 7, padding: "3px 7px", cursor: "pointer",
          letterSpacing: 1, display: "flex", alignItems: "center", gap: 4,
          whiteSpace: "nowrap",
        }}
      >
        ◈ VPN
        {badgeVal !== null && (
          <span style={{
            background: badgeColor, color: "#000", borderRadius: "50%",
            fontSize: 6, width: 12, height: 12, display: "flex",
            alignItems: "center", justifyContent: "center", fontWeight: 700,
          }}>
            {badgeVal > 9 ? "9+" : badgeVal}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT - 280, bottom: 32, zIndex: 131,
      width: 320, maxHeight: 500,
      background: "rgba(6,16,24,0.97)", border: `1px solid ${CY}44`,
      borderRadius: 10, display: "flex", flexDirection: "column",
      fontFamily: "monospace", boxShadow: `0 0 18px ${CY}22`,
    }}>
      {/* header */}
      <div style={{
        padding: "8px 12px", borderBottom: `1px solid ${CY}22`,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 8, color: CY, letterSpacing: 2, fontWeight: 700, flex: 1 }}>
          ◈ VPN CONTROL PANEL
        </span>
        {/* live/schema chip */}
        <span style={{
          fontSize: 7, padding: "1px 5px", borderRadius: 3,
          border: `1px solid ${isLive ? GN : AM}55`,
          color: isLive ? GN : AM,
        }}>
          {isLive ? "LIVE" : "SCHEMA"}
        </span>
        {loading && <span style={{ fontSize: 8, color: DIM }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: DIM,
          fontSize: 10, cursor: "pointer", lineHeight: 1,
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
        <Tile label="INSTALLED" value={installed ? "YES" : "NO"} color={installed ? GN : RED} />
        <Tile label="ACTIVE"    value={active ? "YES" : "NO"}    color={active ? GN : DIM} />
        <Tile label="IFACES"    value={ifaces.length}            color={CY} />
        <Tile label="PEERS"     value={peerTotal}                color={AM} />
      </div>

      {/* assess */}
      <div style={{ padding: "0 12px 6px" }}>
        <button
          onClick={handleAssess}
          disabled={assessing}
          style={{
            width: "100%", fontSize: 8, padding: "4px 0", borderRadius: 5, cursor: "pointer",
            border: `1px solid ${CY}55`, color: CY, background: `${CY}0d`,
            opacity: assessing ? 0.6 : 1,
          }}
        >
          {assessing ? "▶ Assessing…" : "▶ ASSESS"}
        </button>
        {dossier && (
          <div style={{
            marginTop: 5, fontSize: 8, color: AM, lineHeight: 1.4,
            padding: "5px 7px", background: `${AM}0a`, borderRadius: 5,
          }}>
            {dossier}
          </div>
        )}
        {toggleMsg && (
          <div style={{
            marginTop: 4, fontSize: 8,
            color: toggleMsg.startsWith("✓") ? GN : RED,
            padding: "3px 6px", background: toggleMsg.startsWith("✓") ? `${GN}0a` : `${RED}0a`,
            borderRadius: 4,
          }}>
            {toggleMsg}
          </div>
        )}
      </div>

      {/* hint */}
      {status?.hint && (
        <div style={{
          margin: "0 12px 6px", fontSize: 7, color: DIM,
          padding: "4px 7px", background: `${DIM}11`, borderRadius: 4,
        }}>
          {status.hint}
        </div>
      )}

      {/* interface list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {ifaces.length === 0 ? (
          <div style={{ fontSize: 8, color: DIM, padding: "12px 16px", textAlign: "center" }}>
            {loading ? "Loading…" : "No interfaces found."}
          </div>
        ) : (
          ifaces.map((iface) => (
            <IfaceRow
              key={iface.iface}
              iface={iface}
              expanded={expanded === iface.iface}
              onToggle={() => setExpanded((v) => (v === iface.iface ? null : iface.iface))}
              onUp={()   => handleToggle(iface.iface, "up")}
              onDown={()  => handleToggle(iface.iface, "down")}
              busy={!!(busy[`${iface.iface}_up`] || busy[`${iface.iface}_down`])}
            />
          ))
        )}
      </div>

      {/* footer */}
      <div style={{
        padding: "5px 12px", borderTop: `1px solid ${CY}11`,
        fontSize: 7, color: DIM, display: "flex", justifyContent: "space-between",
      }}>
        <span>{ifaces.length} interface{ifaces.length !== 1 ? "s" : ""}</span>
        <span>60 s poll · /v1/vpn</span>
      </div>
    </div>
  );
}
