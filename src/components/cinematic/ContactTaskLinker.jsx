/**
 * ContactTaskLinker — F86.
 *
 * Parallel-fetches /entities/Contact + /entities/Task and keyword-correlates
 * each contact (name/role/department/org/tags) against task titles/descriptions
 * to surface TASKED contacts (at least one task match found) vs IDLE contacts
 * (no active task assignment found in the catalog).
 *
 * Stat tiles: contacts / tasks / tasked / idle
 * Filter tabs: ALL / TASKED / IDLE + text search
 * Expand any contact → matched tasks with priority + status + relevance score
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence contact-task brief + TTS
 *
 * Toggle: ◈ CTTASK at left:22240, zIndex 65.
 * Voice: "contact task" / "who has tasks" / "task contact" /
 *        "active contacts" / "cttask"
 * Auto-refresh: 90 s.
 *
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GREEN = "#00c878";
const AMBER = "#F5A623";
const RED = "#FF3D5A";
const TEAL = "#1AB8CC";
const BTN_LEFT = 22240;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isCttaskQuery(q) {
  return /contact.{0,20}task|task.{0,20}contact|who.{0,20}has.{0,20}task|active.{0,15}contact|cttask\b/i.test(
    q || ""
  );
}

export async function buildCttaskScript() {
  try {
    const [cr, tr] = await Promise.all([
      fetch(`${apiBase()}/entities/Contact`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({}),
      }),
      fetch(`${apiBase()}/entities/Task`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({}),
      }),
    ]);
    const contacts = normaliseArray(cr.ok ? await cr.json() : []);
    const tasks = normaliseArray(tr.ok ? await tr.json() : []);
    const links = buildLinks(contacts, tasks);
    const taskedIds = new Set(links.map((l) => l.contactId));
    const idleCount = contacts.length - taskedIds.size;
    window.dispatchEvent(new CustomEvent("jarvis:cttask-toggle"));
    if (!contacts.length)
      return "No contacts found in the directory, sir.";
    return (
      `Contact–task linker active, sir. ` +
      `${contacts.length} contact${contacts.length !== 1 ? "s" : ""} cross-referenced ` +
      `against ${tasks.length} task${tasks.length !== 1 ? "s" : ""}. ` +
      `${taskedIds.size} contact${taskedIds.size !== 1 ? "s" : ""} ` +
      `${taskedIds.size === 1 ? "has" : "have"} matching task assignments. ` +
      `${idleCount} contact${idleCount !== 1 ? "s" : ""} ${idleCount === 1 ? "is" : "are"} ` +
      `idle — no correlated tasks in the catalog. Select a contact to review matched tasks.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:cttask-toggle"));
    return "Contact task linker open, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function ContactTaskLinker() {
  const [visible, setVisible] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [aiMap, setAiMap] = useState({});
  const [aiLoading, setAiLoading] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [cr, tr] = await Promise.all([
        fetch(`${apiBase()}/entities/Contact`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_KEY}`,
          },
          body: JSON.stringify({}),
        }),
        fetch(`${apiBase()}/entities/Task`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_KEY}`,
          },
          body: JSON.stringify({}),
        }),
      ]);
      const rawContacts = normaliseArray(cr.ok ? await cr.json() : []);
      const rawTasks = normaliseArray(tr.ok ? await tr.json() : []);
      setContacts(rawContacts);
      setTasks(rawTasks);
      setLinks(buildLinks(rawContacts, rawTasks));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:cttask-toggle", onToggle);
    return () => window.removeEventListener("jarvis:cttask-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, 90_000);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assessLink(contact, task) {
    const cid = contact.id || contact._id || contact.name;
    const tid = task.id || task._id || task.title;
    const key = `${cid}::${tid}`;
    if (aiMap[key] || aiLoading === key) return;
    setAiLoading(key);
    const contactName = contact.name || contact.full_name || contact.email || "Unknown Contact";
    const contactRole = contact.role || contact.title || contact.department || "";
    const taskTitle = task.title || task.name || task.description || "Unknown Task";
    const taskStatus = task.status || "";
    const prompt =
      `As JARVIS, provide a 2-sentence contact-task assessment of how ` +
      `${contactName}` +
      (contactRole ? ` (${contactRole})` : "") +
      ` relates to the task "${taskTitle}"` +
      (taskStatus ? ` [status: ${taskStatus}]` : "") +
      `. Focus on operational relevance and likely involvement. Be direct and concise.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAiMap((prev) => ({ ...prev, [key]: answer }));
      if (answer)
        window.dispatchEvent(
          new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } })
        );
    } catch (_) {
      setAiMap((prev) => ({ ...prev, [key]: "Unable to reach reasoning core." }));
    } finally {
      setAiLoading(null);
    }
  }

  const taskedIds = new Set(links.map((l) => l.contactId));
  const idleCount = contacts.length - taskedIds.size;

  const filtered = contacts
    .filter((c) => {
      const cid = c.id || c._id || c.name;
      if (filter === "tasked") return taskedIds.has(cid);
      if (filter === "idle") return !taskedIds.has(cid);
      return true;
    })
    .filter((c) => {
      if (!search.trim()) return true;
      const txt = [
        c.name || "",
        c.full_name || "",
        c.role || "",
        c.title || "",
        c.email || "",
        c.department || "",
        c.organisation || "",
        c.org || "",
        ...(Array.isArray(c.tags) ? c.tags : []),
      ]
        .join(" ")
        .toLowerCase();
      return txt.includes(search.toLowerCase());
    });

  const selectedLinks = selected
    ? links.filter(
        (l) => l.contactId === (selected.id || selected._id || selected.name)
      )
    : [];

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Contact × Task Linker"
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 65,
          height: 26,
          padding: "0 8px",
          background: visible ? `${TEAL}22` : "rgba(8,14,22,0.82)",
          border: `1px solid ${visible ? TEAL : "#2A3A4A"}`,
          borderRadius: 5,
          color: visible ? TEAL : "#6E8AA0",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: 1,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {idleCount > 0 && !visible && (
          <span
            style={{
              display: "inline-block",
              marginRight: 5,
              background: AMBER,
              color: "#000",
              borderRadius: "50%",
              width: 14,
              height: 14,
              fontSize: 9,
              lineHeight: "14px",
              textAlign: "center",
            }}
          >
            {idleCount}
          </span>
        )}
        ◈ CTTASK
      </button>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position: "fixed",
            bottom: 44,
            left: Math.min(BTN_LEFT, window.innerWidth - 660),
            zIndex: 65,
            width: 640,
            maxHeight: "75vh",
            display: "flex",
            flexDirection: "column",
            background: "rgba(4,10,18,0.96)",
            border: `1px solid ${TEAL}44`,
            borderTop: `2px solid ${TEAL}`,
            borderRadius: 12,
            boxShadow: `0 0 40px ${TEAL}14, 0 8px 32px rgba(0,0,0,0.75)`,
            fontFamily: "'JetBrains Mono', monospace",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderBottom: `1px solid ${TEAL}22`,
              flexShrink: 0,
            }}
          >
            <span style={{ color: TEAL, fontSize: 13 }}>◈</span>
            <span
              style={{
                color: TEAL,
                fontSize: 11,
                letterSpacing: 2,
                fontWeight: 700,
              }}
            >
              CONTACT × TASK LINKER
            </span>
            {loading && (
              <span style={{ marginLeft: "auto", color: "#6E8AA0", fontSize: 10 }}>
                loading…
              </span>
            )}
            <button
              onClick={() => setVisible(false)}
              style={{
                marginLeft: loading ? 0 : "auto",
                background: "transparent",
                border: "none",
                color: "#6E8AA0",
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* Stat tiles */}
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: "8px 14px",
              borderBottom: `1px solid #1A2A3A`,
              flexShrink: 0,
            }}
          >
            {[
              { label: "CONTACTS", val: contacts.length, col: CY },
              { label: "TASKS", val: tasks.length, col: TEAL },
              { label: "TASKED", val: taskedIds.size, col: GREEN },
              { label: "IDLE", val: idleCount, col: AMBER },
            ].map((tile) => (
              <div
                key={tile.label}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid #1A2A3A",
                  borderRadius: 6,
                  padding: "5px 8px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 14, color: tile.col, fontWeight: 700 }}>
                  {tile.val}
                </div>
                <div
                  style={{
                    fontSize: 8,
                    color: "#4E6A7A",
                    letterSpacing: 1,
                    marginTop: 1,
                  }}
                >
                  {tile.label}
                </div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "7px 14px",
              borderBottom: `1px solid #1A2A3A`,
              flexShrink: 0,
              alignItems: "center",
            }}
          >
            {["all", "tasked", "idle"].map((f) => (
              <button
                key={f}
                onClick={() => {
                  setFilter(f);
                  setSelected(null);
                }}
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  border: `1px solid ${filter === f ? TEAL : "#2A3A4A"}`,
                  background: filter === f ? `${TEAL}22` : "transparent",
                  color: filter === f ? TEAL : "#6E8AA0",
                  fontSize: 10,
                  letterSpacing: 1,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textTransform: "uppercase",
                }}
              >
                {f}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                marginLeft: "auto",
                background: "transparent",
                border: `1px solid #2A3A4A`,
                borderRadius: 4,
                padding: "2px 8px",
                color: "#DCEBF5",
                fontSize: 10,
                fontFamily: "inherit",
                width: 120,
                outline: "none",
              }}
            />
          </div>

          {/* Split body */}
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
            {/* Contact list (left) */}
            <div
              style={{
                width: 240,
                borderRight: `1px solid #1A2A3A`,
                overflowY: "auto",
                flexShrink: 0,
              }}
            >
              {!loading && filtered.length === 0 && (
                <div style={{ padding: 14, color: "#6E8AA0", fontSize: 10 }}>
                  No contacts in this filter.
                </div>
              )}
              {filtered.map((c) => {
                const cid = c.id || c._id || c.name;
                const isTasked = taskedIds.has(cid);
                const isActive =
                  selected &&
                  (selected.id || selected._id || selected.name) === cid;
                const initials = (c.name || c.full_name || "?")
                  .split(/\s+/)
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase();
                const matchCount = links.filter((l) => l.contactId === cid).length;
                return (
                  <div
                    key={cid}
                    onClick={() => setSelected(c)}
                    style={{
                      padding: "9px 12px",
                      borderBottom: `1px solid #0E1A26`,
                      cursor: "pointer",
                      background: isActive ? `${TEAL}12` : "transparent",
                      borderLeft: isActive
                        ? `3px solid ${TEAL}`
                        : "3px solid transparent",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                    }}
                  >
                    {/* Avatar */}
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: "50%",
                        background: isTasked ? `${TEAL}33` : "#1A2A3A",
                        border: `1px solid ${isTasked ? TEAL : "#2A3A4A"}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 8,
                        color: isTasked ? TEAL : "#4E6A7A",
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {initials}
                    </div>
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <div
                        style={{
                          fontSize: 10,
                          color: "#DCEBF5",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          marginBottom: 2,
                        }}
                      >
                        {c.name || c.full_name || cid}
                      </div>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {(c.role || c.title) && (
                          <span
                            style={{
                              fontSize: 8,
                              color: "#4E6A7A",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: 130,
                            }}
                          >
                            {c.role || c.title}
                          </span>
                        )}
                        {isTasked ? (
                          <span
                            style={{
                              fontSize: 8,
                              color: GREEN,
                              letterSpacing: 1,
                            }}
                          >
                            {matchCount} task{matchCount !== 1 ? "s" : ""}
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: 8,
                              color: AMBER,
                              letterSpacing: 1,
                            }}
                          >
                            IDLE
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Task detail pane (right) */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {!selected && (
                <div
                  style={{
                    padding: 20,
                    color: "#6E8AA0",
                    fontSize: 10,
                    lineHeight: 1.6,
                  }}
                >
                  Select a contact to see matched tasks.
                </div>
              )}
              {selected && selectedLinks.length === 0 && (
                <div style={{ padding: 20, color: "#6E8AA0", fontSize: 10 }}>
                  No matching tasks for this contact. Contact is IDLE — no
                  correlated task found in the catalog.
                </div>
              )}
              {selected && selectedLinks.length > 0 && (
                <div>
                  <div
                    style={{
                      padding: "8px 14px",
                      borderBottom: `1px solid #1A2A3A`,
                      color: GREEN,
                      fontSize: 10,
                      letterSpacing: 1,
                      fontWeight: 700,
                    }}
                  >
                    {selectedLinks.length} TASK
                    {selectedLinks.length !== 1 ? "S" : ""} FOR "
                    {(
                      selected.name ||
                      selected.full_name ||
                      "CONTACT"
                    ).toUpperCase().slice(0, 38)}
                    {(selected.name || selected.full_name || "").length > 38 ? "…" : ""}
                    "
                  </div>
                  {selectedLinks.map((link, i) => {
                    const task = link.task;
                    const tid = task.id || task._id || task.title;
                    const cid = selected.id || selected._id || selected.name;
                    const aiKey = `${cid}::${tid}`;
                    const aiText = aiMap[aiKey];
                    const isLoadingThis = aiLoading === aiKey;
                    const priority = (task.priority || "").toString().toUpperCase();
                    const status = (task.status || "").toString().toUpperCase();
                    const priorityColor =
                      priority === "CRITICAL" || priority === "HIGH"
                        ? RED
                        : priority === "MEDIUM"
                        ? AMBER
                        : priority === "LOW"
                        ? GREEN
                        : "#4E6A7A";
                    return (
                      <div
                        key={`${aiKey}-${i}`}
                        style={{
                          padding: "10px 14px",
                          borderBottom: `1px solid #0E1A26`,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 8,
                            marginBottom: 5,
                          }}
                        >
                          <span
                            style={{
                              color: TEAL,
                              fontSize: 12,
                              marginTop: 1,
                              flexShrink: 0,
                            }}
                          >
                            ◉
                          </span>
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                fontSize: 11,
                                color: "#DCEBF5",
                                marginBottom: 3,
                              }}
                            >
                              {task.title || task.name || task.description || tid}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: 5,
                                flexWrap: "wrap",
                              }}
                            >
                              {status && (
                                <span
                                  style={{
                                    fontSize: 8,
                                    color: CY,
                                    letterSpacing: 1,
                                    padding: "1px 4px",
                                    border: `1px solid ${CY}44`,
                                    borderRadius: 3,
                                  }}
                                >
                                  {status}
                                </span>
                              )}
                              {priority && (
                                <span
                                  style={{
                                    fontSize: 8,
                                    color: priorityColor,
                                    letterSpacing: 1,
                                    padding: "1px 4px",
                                    border: `1px solid ${priorityColor}44`,
                                    borderRadius: 3,
                                  }}
                                >
                                  {priority}
                                </span>
                              )}
                              <span
                                style={{
                                  fontSize: 8,
                                  color: "#4E6A7A",
                                  letterSpacing: 1,
                                }}
                              >
                                [{link.matchScore} keyword match
                                {link.matchScore !== 1 ? "es" : ""}]
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => assessLink(selected, task)}
                            disabled={isLoadingThis || !!aiText}
                            style={{
                              flexShrink: 0,
                              padding: "2px 8px",
                              borderRadius: 4,
                              border: `1px solid ${
                                aiText ? GREEN + "66" : TEAL + "66"
                              }`,
                              background: aiText
                                ? `${GREEN}12`
                                : isLoadingThis
                                ? `${TEAL}22`
                                : "transparent",
                              color: aiText ? GREEN : TEAL,
                              fontSize: 9,
                              letterSpacing: 1,
                              cursor:
                                isLoadingThis || aiText ? "default" : "pointer",
                              fontFamily: "inherit",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {aiText
                              ? "✓ ASSESSED"
                              : isLoadingThis
                              ? "consulting…"
                              : "▶ ASSESS"}
                          </button>
                        </div>

                        {/* Task description */}
                        {task.description && (
                          <div
                            style={{
                              marginLeft: 20,
                              marginBottom: 4,
                              fontSize: 10,
                              color: "#4E8A9A",
                              lineHeight: 1.5,
                            }}
                          >
                            {String(task.description).slice(0, 160)}
                            {String(task.description).length > 160 ? "…" : ""}
                          </div>
                        )}

                        {/* AI assessment */}
                        {aiText && (
                          <div
                            style={{
                              marginLeft: 20,
                              marginTop: 5,
                              padding: "6px 10px",
                              background: `${GREEN}0A`,
                              border: `1px solid ${GREEN}22`,
                              borderRadius: 5,
                              fontSize: 10,
                              color: "#A0D8B0",
                              lineHeight: 1.5,
                            }}
                          >
                            <span
                              style={{
                                color: GREEN,
                                fontSize: 8,
                                letterSpacing: 1,
                                fontWeight: 700,
                                display: "block",
                                marginBottom: 3,
                              }}
                            >
                              JARVIS ASSESSMENT
                            </span>
                            {aiText}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "5px 14px",
              borderTop: `1px solid ${TEAL}18`,
              fontSize: 10,
              color: "#4E6A7A",
              letterSpacing: 1,
              flexShrink: 0,
            }}
          >
            /entities/Contact + /entities/Task · 90-s auto-refresh ·
            click ▶ ASSESS for contact-task relevance brief
          </div>
        </div>
      )}
    </>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const k of [
      "items",
      "results",
      "data",
      "contacts",
      "tasks",
      "records",
      "list",
      "nodes",
    ]) {
      if (Array.isArray(data[k])) return data[k];
    }
  }
  return [];
}

function keywords(str) {
  if (!str) return [];
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function buildLinks(contacts, tasks) {
  if (!contacts.length || !tasks.length) return [];
  const results = [];
  for (const c of contacts) {
    const cid = c.id || c._id || c.name;
    const cText = [
      c.name || "",
      c.full_name || "",
      c.role || "",
      c.title || "",
      c.email || "",
      c.department || "",
      c.organisation || "",
      c.org || "",
      c.notes || "",
      ...(Array.isArray(c.tags) ? c.tags : []),
    ].join(" ");
    const cKws = keywords(cText);
    if (!cKws.length) continue;
    for (const t of tasks) {
      const tText = [
        t.title || "",
        t.name || "",
        t.description || "",
        t.type || "",
        t.priority || "",
        t.assignee || "",
        t.owner || "",
        ...(Array.isArray(t.tags) ? t.tags : []),
      ].join(" ");
      const tKws = keywords(tText);
      const score = cKws.filter((w) => tKws.includes(w)).length;
      if (score >= 1)
        results.push({ contactId: cid, task: t, matchScore: score });
    }
  }
  results.sort((a, b) => b.matchScore - a.matchScore);
  return results;
}
