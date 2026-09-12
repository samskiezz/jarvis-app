/**
 * MessagesCommsPanel — F260.
 *
 * Data sources (real — backed by server/routes/messages.py):
 *   GET  /v1/messages/recent?limit=50&direction=any
 *       → { ok, items:[{id,ts,direction,channel,peer,text,status}], count, source }
 *   POST /v1/messages/send  { to, text, channel }
 *       → { ok, id, status, channel, source }
 *
 * Displays:
 *   - Stat tiles: total / inbound / outbound / sent
 *   - Inline compose form (to + text + channel → POST /v1/messages/send)
 *   - ALL/IN/OUT filter tabs + text search
 *   - Per-message: direction chip (in=cyan/out=purple) + peer + text + age + status chip
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence comms brief + TTS
 *
 * Toggle: ✉ MSGS at left:210480, bottom:8, zIndex:139.
 * Badge: amber = unread inbound count (>0), green = no inbound pending.
 * 60 s auto-refresh.
 *
 * Exported helpers for JarvisBrain:
 *   isMsgsQuery(q) / buildMsgsScript()
 *
 * Voice triggers: "messages / recent messages / msgs / comms / outbox /
 *   inbound messages / signal / chat log / message log / send message /
 *   msg inbox / new messages / comms panel"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AM  = "#F5A623";
const GN  = "#4ADE80";
const RED = "#F87171";
const DIM = "#3A4A55";
const PUR = "#A78BFA";

const BTN_LEFT   = 210480;
const REFRESH_MS = 60_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const MSGS_RE =
  /\b(messages?|recent messages?|msgs?|comms?|outbox|inbound messages?|signal|chat log|message log|send message|msg inbox|new messages?|comms panel)\b/i;

export function isMsgsQuery(t) {
  return MSGS_RE.test(t || "");
}

export async function buildMsgsScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/messages/recent?limit=50&direction=any`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    const items   = d?.items ?? [];
    const inbound = items.filter((m) => m.direction === "in");
    const outbound = items.filter((m) => m.direction === "out");
    const sent    = outbound.filter((m) => m.status === "sent");
    if (items.length === 0) {
      return "No messages in the comms log at this time. The channel is quiet.";
    }
    const latest = items[0];
    const ageM   = latest ? Math.round((Date.now() / 1000 - latest.ts) / 60) : 0;
    return (
      `Comms log holds ${items.length} message${items.length !== 1 ? "s" : ""}: ` +
      `${inbound.length} inbound, ${outbound.length} outbound (${sent.length} confirmed sent). ` +
      `Latest from ${latest?.peer ?? "unknown"} via ${latest?.channel ?? "??"} ${ageM}m ago.`
    );
  } catch {
    return "Unable to reach the messages endpoint at this time.";
  }
}

// ─── fetch helpers ────────────────────────────────────────────────────────────

async function fetchMessages(direction = "any") {
  const r = await fetch(
    `${apiBase()}/v1/messages/recent?limit=50&direction=${direction}`,
    { headers: { Authorization: `Bearer ${API_KEY}` } }
  );
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function sendMessage(to, text, channel) {
  const r = await fetch(`${apiBase()}/v1/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to, text, channel }),
  });
  return r.json();
}

async function agentAssess(total, inbound, outbound, latestPeer, latestChannel) {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      message:
        `Assess the comms channel in 2 sentences: ${total} message${total !== 1 ? "s" : ""} ` +
        `(${inbound} inbound, ${outbound} outbound). ` +
        (latestPeer
          ? `Latest activity from ${latestPeer} via ${latestChannel}.`
          : "No recent activity."),
    }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "No assessment available.";
}

// ─── sub-components ───────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{
      flex: 1, minWidth: 60, background: `${color}0d`,
      border: `1px solid ${color}33`, borderRadius: 8,
      padding: "8px 10px", display: "flex", flexDirection: "column", gap: 3,
    }}>
      <span style={{ fontSize: 7, color: DIM, letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color, letterSpacing: 1 }}>{value}</span>
    </div>
  );
}

function timeAgo(ts) {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60)    return `${Math.round(diff)}s`;
  if (diff < 3600)  return `${Math.round(diff / 60)}m`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h`;
  return `${Math.round(diff / 86400)}d`;
}

const DIR_COLOR   = { in: CY, out: PUR };
const STATUS_COLOR = { sent: GN, queued: AM, error: RED };

function MessageRow({ item }) {
  const dc = DIR_COLOR[item.direction] || DIM;
  const sc = STATUS_COLOR[item.status] || DIM;
  return (
    <div style={{
      padding: "7px 12px", borderBottom: `1px solid ${CY}11`,
      display: "flex", alignItems: "flex-start", gap: 8,
    }}>
      <span style={{
        fontSize: 7, padding: "1px 5px", borderRadius: 3,
        border: `1px solid ${dc}55`, color: dc, flexShrink: 0,
        alignSelf: "center", minWidth: 18, textAlign: "center",
      }}>
        {item.direction === "in" ? "↓" : "↑"}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 7, color: dc, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.peer || "—"}
          <span style={{ color: DIM, marginLeft: 5 }}>{item.channel}</span>
        </div>
        <div style={{ fontSize: 8, color: "#C8D8E0", lineHeight: 1.4, wordBreak: "break-word" }}>
          {item.text?.slice(0, 120)}{item.text?.length > 120 ? "…" : ""}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
        <span style={{ fontSize: 6, color: DIM }}>{timeAgo(item.ts)}</span>
        <span style={{
          fontSize: 6, padding: "1px 4px", borderRadius: 3,
          border: `1px solid ${sc}44`, color: sc,
        }}>
          {item.status}
        </span>
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function MessagesCommsPanel() {
  const [open,       setOpen]      = useState(false);
  const [items,      setItems]     = useState([]);
  const [loading,    setLoading]   = useState(false);
  const [tab,        setTab]       = useState("ALL");
  const [search,     setSearch]    = useState("");
  const [to,         setTo]        = useState("");
  const [text,       setText]      = useState("");
  const [channel,    setChannel]   = useState("signal");
  const [sending,    setSending]   = useState(false);
  const [sendMsg,    setSendMsg]   = useState(null);
  const [assessing,  setAssessing] = useState(false);
  const [dossier,    setDossier]   = useState(null);

  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchMessages("any");
      setItems(d?.items ?? []);
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
      if (MSGS_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:msgs-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:msgs-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  async function handleSend() {
    const peer = to.trim();
    const body = text.trim();
    if (!peer || !body || sending) return;
    setSending(true);
    setSendMsg(null);
    try {
      const d = await sendMessage(peer, body, channel);
      if (d.ok) {
        setTo("");
        setText("");
        setSendMsg(`✓ ${d.status}`);
        await load();
      } else {
        setSendMsg(`✕ ${d.error || "send failed"}`);
      }
    } catch {
      setSendMsg("✕ Error");
    }
    setSending(false);
    setTimeout(() => setSendMsg(null), 4000);
  }

  async function handleAssess() {
    if (assessing) return;
    setAssessing(true);
    setDossier(null);
    try {
      const inbound  = items.filter((m) => m.direction === "in");
      const outbound = items.filter((m) => m.direction === "out");
      const latest   = items[0];
      const brief    = await agentAssess(
        items.length,
        inbound.length,
        outbound.length,
        latest?.peer,
        latest?.channel,
      );
      setDossier(brief);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: brief } }));
    } catch (_) {
      setDossier("Assessment unavailable.");
    }
    setAssessing(false);
  }

  // derived
  const inbound  = items.filter((m) => m.direction === "in");
  const outbound = items.filter((m) => m.direction === "out");
  const sent     = outbound.filter((m) => m.status === "sent");

  const filtered = items
    .filter((m) => {
      if (tab === "IN")  return m.direction === "in";
      if (tab === "OUT") return m.direction === "out";
      return true;
    })
    .filter((m) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (m.peer || "").toLowerCase().includes(q) ||
        (m.text || "").toLowerCase().includes(q) ||
        (m.channel || "").toLowerCase().includes(q)
      );
    });

  const badgeCount = inbound.length;
  const badgeColor = badgeCount > 0 ? AM : GN;

  const TABS = ["ALL", "IN", "OUT"];

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 139,
          background: "#091520", border: `1px solid ${CY}44`, borderRadius: 6,
          color: CY, fontSize: 7, padding: "3px 7px", cursor: "pointer",
          letterSpacing: 1, display: "flex", alignItems: "center", gap: 4,
          whiteSpace: "nowrap",
        }}
      >
        ✉ MSGS
        {badgeCount > 0 && (
          <span style={{
            background: badgeColor, color: "#000", borderRadius: "50%",
            fontSize: 6, width: 12, height: 12, display: "flex",
            alignItems: "center", justifyContent: "center", fontWeight: 700,
          }}>
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT - 280, bottom: 32, zIndex: 139,
      width: 320, maxHeight: 540,
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
          ✉ COMMS
        </span>
        {loading && <span style={{ fontSize: 8, color: DIM }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: DIM,
          fontSize: 10, cursor: "pointer", lineHeight: 1,
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
        <Tile label="TOTAL"    value={items.length}    color={CY} />
        <Tile label="INBOUND"  value={inbound.length}  color={inbound.length > 0 ? AM : GN} />
        <Tile label="OUTBOUND" value={outbound.length} color={PUR} />
        <Tile label="SENT"     value={sent.length}     color={GN} />
      </div>

      {/* compose form */}
      <div style={{ padding: "0 12px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", gap: 4 }}>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="To (peer / number)…"
            style={{
              flex: 1, fontSize: 7, padding: "3px 7px", borderRadius: 4,
              background: "#0a1a24", border: `1px solid ${CY}33`, color: "#C8D8E0",
              outline: "none",
            }}
          />
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            style={{
              fontSize: 7, background: "#0a1a24", border: `1px solid ${CY}33`,
              color: CY, borderRadius: 4, padding: "2px 4px", cursor: "pointer",
            }}
          >
            <option value="signal">signal</option>
            <option value="matrix">matrix</option>
            <option value="smtp">email</option>
          </select>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) handleSend(); }}
            placeholder="Message text…"
            style={{
              flex: 1, fontSize: 7, padding: "3px 7px", borderRadius: 4,
              background: "#0a1a24", border: `1px solid ${CY}33`, color: "#C8D8E0",
              outline: "none",
            }}
          />
          <button
            onClick={handleSend}
            disabled={sending || !to.trim() || !text.trim()}
            style={{
              fontSize: 8, padding: "3px 8px", borderRadius: 4, cursor: "pointer",
              border: `1px solid ${GN}66`, color: GN, background: `${GN}11`,
              opacity: sending || !to.trim() || !text.trim() ? 0.5 : 1,
            }}
          >
            ↑
          </button>
        </div>
        {sendMsg && (
          <div style={{
            fontSize: 7,
            color: sendMsg.startsWith("✓") ? GN : RED,
          }}>
            {sendMsg}
          </div>
        )}
      </div>

      {/* tabs + search */}
      <div style={{ padding: "0 12px 6px", display: "flex", gap: 4, alignItems: "center" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontSize: 7, padding: "2px 7px", borderRadius: 4, cursor: "pointer",
              border: `1px solid ${tab === t ? CY : CY + "33"}`,
              color: tab === t ? CY : DIM,
              background: tab === t ? `${CY}14` : "transparent",
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            flex: 1, fontSize: 7, padding: "2px 6px", borderRadius: 4,
            background: "#0a1a24", border: `1px solid ${CY}22`, color: "#C8D8E0",
            outline: "none",
          }}
        />
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
      </div>

      {/* message list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {filtered.length === 0 ? (
          <div style={{ fontSize: 8, color: DIM, padding: "12px 16px", textAlign: "center" }}>
            {loading ? "Loading…" : "No messages found."}
          </div>
        ) : (
          filtered.map((item) => (
            <MessageRow key={item.id} item={item} />
          ))
        )}
      </div>

      {/* footer */}
      <div style={{
        padding: "5px 12px", borderTop: `1px solid ${CY}11`,
        fontSize: 7, color: DIM, display: "flex", justifyContent: "space-between",
      }}>
        <span>{filtered.length} shown</span>
        <span>60 s poll · /v1/messages</span>
      </div>
    </div>
  );
}
