/**
 * RemindersPanel — F252.
 *
 * Data sources (real — backed by server/routes/reminders.py):
 *   GET    /reminders/list?limit=50&include_done=false
 *       → { ok, items:[{id,ts,text,kind,done}], count }
 *   POST   /reminders/save  { text, kind? }
 *       → { ok, id, ts }
 *   POST   /reminders/done/{id}
 *       → { ok, id }
 *   DELETE /reminders/{id}
 *       → { ok, id, deleted }
 *
 * Displays:
 *   - Stat tiles: active / total / notes / tasks
 *   - Inline capture form (text + kind select → POST /reminders/save)
 *   - ALL/NOTES/TASKS filter tabs + text search
 *   - Per-reminder row: kind chip + text + age
 *   - ✓ DONE button → POST /reminders/done/{id}
 *   - ✕ DELETE button → DELETE /reminders/{id}
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle: ◎ RMNDR at left:178560, bottom:8, zIndex:132.
 * Badge: amber = active reminder count (>0), green = all done.
 * 60 s auto-refresh.
 *
 * Exported helpers for JarvisBrain:
 *   isReminderQuery(q) / buildReminderScript()
 *
 * Voice triggers: "reminders / my reminders / what to do / reminder list /
 *   active reminders / rmndr / add reminder / saved notes / tasks list /
 *   pending reminders / quick notes / note to self"
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
const PUR  = "#A78BFA";

const BTN_LEFT   = 178560;
const REFRESH_MS = 60_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const RMNDR_RE =
  /\b(reminders?|my reminders?|what to do|reminder list|active reminders?|rmndr|add reminder|saved notes?|tasks? list|pending reminders?|quick notes?|note to self)\b/i;

export function isReminderQuery(t) {
  return RMNDR_RE.test(t || "");
}

export async function buildReminderScript() {
  try {
    const r = await fetch(`${apiBase()}/reminders/list?limit=50`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    const items  = d?.items ?? [];
    const active = items.filter((i) => !i.done);
    const notes  = active.filter((i) => i.kind === "note");
    const tasks  = active.filter((i) => i.kind === "task");
    if (active.length === 0) {
      return "All clear — no active reminders at this time. The reminder board is empty.";
    }
    const oldest = active[active.length - 1];
    const ageH   = oldest ? Math.round((Date.now() / 1000 - oldest.ts) / 3600) : 0;
    return (
      `There are ${active.length} active reminder${active.length !== 1 ? "s" : ""} ` +
      `(${notes.length} note${notes.length !== 1 ? "s" : ""}, ${tasks.length} task${tasks.length !== 1 ? "s" : ""}). ` +
      `Oldest is ${ageH}h old: "${oldest?.text?.slice(0, 60) ?? "—"}". ` +
      `Review and clear to keep the board clean.`
    );
  } catch {
    return "Unable to reach the reminders endpoint at this time.";
  }
}

// ─── fetch helpers ──────────────────────────────────────────────────────────

async function fetchReminders(includeDone = false) {
  const r = await fetch(
    `${apiBase()}/reminders/list?limit=100&include_done=${includeDone}`,
    { headers: { Authorization: `Bearer ${API_KEY}` } }
  );
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function saveReminder(text, kind) {
  const r = await fetch(`${apiBase()}/reminders/save`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, kind }),
  });
  return r.json();
}

async function markDone(id) {
  const r = await fetch(`${apiBase()}/reminders/done/${id}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  return r.json();
}

async function deleteReminder(id) {
  const r = await fetch(`${apiBase()}/reminders/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  return r.json();
}

async function agentAssess(activeCount, noteCount, taskCount, oldestText) {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      message:
        `Assess the reminders board in 2 sentences: ${activeCount} active reminder${activeCount !== 1 ? "s" : ""} ` +
        `(${noteCount} note${noteCount !== 1 ? "s" : ""}, ${taskCount} task${taskCount !== 1 ? "s" : ""}). ` +
        (oldestText ? `Oldest: "${oldestText.slice(0, 80)}".` : "Board is empty."),
    }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "No assessment available.";
}

// ─── sub-components ─────────────────────────────────────────────────────────

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

const KIND_COLOR = { note: CY, task: PUR };

function ReminderRow({ item, onDone, onDelete, busy }) {
  const kColor = KIND_COLOR[item.kind] || AM;
  return (
    <div style={{
      padding: "7px 12px", borderBottom: `1px solid ${CY}11`,
      display: "flex", alignItems: "flex-start", gap: 8,
      opacity: item.done ? 0.4 : 1,
    }}>
      <span style={{
        fontSize: 7, padding: "1px 5px", borderRadius: 3,
        border: `1px solid ${kColor}55`, color: kColor, flexShrink: 0,
        alignSelf: "center",
      }}>
        {item.kind || "note"}
      </span>
      <span style={{ flex: 1, fontSize: 8, color: item.done ? DIM : "#C8D8E0", lineHeight: 1.4 }}>
        {item.text}
      </span>
      <span style={{ fontSize: 7, color: DIM, flexShrink: 0, alignSelf: "center" }}>
        {timeAgo(item.ts)}
      </span>
      {!item.done && (
        <button
          onClick={() => onDone(item.id)}
          disabled={busy}
          style={{
            fontSize: 7, padding: "2px 5px", borderRadius: 3, cursor: "pointer",
            border: `1px solid ${GN}66`, color: GN, background: `${GN}11`,
            flexShrink: 0, opacity: busy ? 0.5 : 1,
          }}
          title="Mark done"
        >
          ✓
        </button>
      )}
      <button
        onClick={() => onDelete(item.id)}
        disabled={busy}
        style={{
          fontSize: 7, padding: "2px 5px", borderRadius: 3, cursor: "pointer",
          border: `1px solid ${RED}66`, color: RED, background: `${RED}11`,
          flexShrink: 0, opacity: busy ? 0.5 : 1,
        }}
        title="Delete"
      >
        ✕
      </button>
    </div>
  );
}

// ─── main component ─────────────────────────────────────────────────────────

export default function RemindersPanel() {
  const [open,       setOpen]       = useState(false);
  const [items,      setItems]      = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [tab,        setTab]        = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [newText,    setNewText]    = useState("");
  const [newKind,    setNewKind]    = useState("note");
  const [saving,     setSaving]     = useState(false);
  const [saveMsg,    setSaveMsg]    = useState(null);
  const [busy,       setBusy]       = useState({});
  const [assessing,  setAssessing]  = useState(false);
  const [dossier,    setDossier]    = useState(null);

  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchReminders(false);
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
      if (RMNDR_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:rmndr-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:rmndr-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  async function handleSave() {
    const text = newText.trim();
    if (!text || saving) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const d = await saveReminder(text, newKind);
      if (d.ok) {
        setNewText("");
        setSaveMsg("✓ Saved");
        await load();
      } else {
        setSaveMsg("✕ Save failed");
      }
    } catch {
      setSaveMsg("✕ Error");
    }
    setSaving(false);
    setTimeout(() => setSaveMsg(null), 3000);
  }

  async function handleDone(id) {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      await markDone(id);
      await load();
    } catch (_) {}
    setBusy((b) => ({ ...b, [id]: false }));
  }

  async function handleDelete(id) {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      await deleteReminder(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (_) {}
    setBusy((b) => ({ ...b, [id]: false }));
  }

  async function handleAssess() {
    if (assessing) return;
    setAssessing(true);
    setDossier(null);
    try {
      const active = items.filter((i) => !i.done);
      const oldest = active[active.length - 1];
      const text   = await agentAssess(
        active.length,
        active.filter((i) => i.kind === "note").length,
        active.filter((i) => i.kind === "task").length,
        oldest?.text,
      );
      setDossier(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {
      setDossier("Assessment unavailable.");
    }
    setAssessing(false);
  }

  // derived
  const active   = items.filter((i) => !i.done);
  const notesCnt = active.filter((i) => i.kind === "note").length;
  const tasksCnt = active.filter((i) => i.kind === "task").length;

  const filtered = items
    .filter((i) => {
      if (tab === "NOTES") return !i.done && i.kind === "note";
      if (tab === "TASKS") return !i.done && i.kind === "task";
      return !i.done;
    })
    .filter((i) => !search || i.text.toLowerCase().includes(search.toLowerCase()));

  const badgeCount = active.length;
  const badgeColor = badgeCount > 0 ? AM : GN;

  const TABS = ["ALL", "NOTES", "TASKS"];

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 132,
          background: "#091520", border: `1px solid ${CY}44`, borderRadius: 6,
          color: CY, fontSize: 7, padding: "3px 7px", cursor: "pointer",
          letterSpacing: 1, display: "flex", alignItems: "center", gap: 4,
          whiteSpace: "nowrap",
        }}
      >
        ◎ RMNDR
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
      position: "fixed", left: BTN_LEFT - 280, bottom: 32, zIndex: 132,
      width: 320, maxHeight: 520,
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
          ◎ REMINDERS
        </span>
        {loading && <span style={{ fontSize: 8, color: DIM }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: DIM,
          fontSize: 10, cursor: "pointer", lineHeight: 1,
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
        <Tile label="ACTIVE"   value={active.length} color={active.length > 0 ? AM : GN} />
        <Tile label="TOTAL"    value={items.length}  color={CY} />
        <Tile label="NOTES"    value={notesCnt}       color={CY} />
        <Tile label="TASKS"    value={tasksCnt}       color={PUR} />
      </div>

      {/* capture form */}
      <div style={{ padding: "0 12px 8px", display: "flex", gap: 5 }}>
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
          placeholder="Add reminder…"
          style={{
            flex: 1, fontSize: 8, padding: "4px 8px", borderRadius: 4,
            background: "#0a1a24", border: `1px solid ${CY}33`, color: "#C8D8E0",
            outline: "none",
          }}
        />
        <select
          value={newKind}
          onChange={(e) => setNewKind(e.target.value)}
          style={{
            fontSize: 7, background: "#0a1a24", border: `1px solid ${CY}33`,
            color: CY, borderRadius: 4, padding: "2px 4px", cursor: "pointer",
          }}
        >
          <option value="note">note</option>
          <option value="task">task</option>
        </select>
        <button
          onClick={handleSave}
          disabled={saving || !newText.trim()}
          style={{
            fontSize: 8, padding: "4px 8px", borderRadius: 4, cursor: "pointer",
            border: `1px solid ${GN}66`, color: GN, background: `${GN}11`,
            opacity: saving || !newText.trim() ? 0.5 : 1,
          }}
        >
          +
        </button>
      </div>
      {saveMsg && (
        <div style={{
          margin: "-4px 12px 6px", fontSize: 7,
          color: saveMsg.startsWith("✓") ? GN : RED,
        }}>
          {saveMsg}
        </div>
      )}

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

      {/* list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {filtered.length === 0 ? (
          <div style={{ fontSize: 8, color: DIM, padding: "12px 16px", textAlign: "center" }}>
            {loading ? "Loading…" : "No reminders found."}
          </div>
        ) : (
          filtered.map((item) => (
            <ReminderRow
              key={item.id}
              item={item}
              onDone={handleDone}
              onDelete={handleDelete}
              busy={!!busy[item.id]}
            />
          ))
        )}
      </div>

      {/* footer */}
      <div style={{
        padding: "5px 12px", borderTop: `1px solid ${CY}11`,
        fontSize: 7, color: DIM, display: "flex", justifyContent: "space-between",
      }}>
        <span>{filtered.length} shown</span>
        <span>60 s poll · /reminders</span>
      </div>
    </div>
  );
}
