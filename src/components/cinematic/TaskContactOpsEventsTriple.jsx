import { useState, useEffect, useCallback } from "react";

const API = "";

export function isTcoevtQuery(q) {
  const t = q.toLowerCase();
  return (
    t.includes("tcoevt") ||
    t.includes("task contact ops") ||
    t.includes("contact ops task") ||
    t.includes("task event contact") ||
    t.includes("fully signaled task") ||
    t.includes("contact ops mission") ||
    t.includes("task event triple") ||
    t.includes("task contact ops triple") ||
    t.includes("ops task contact") ||
    t.includes("mission contact ops")
  );
}

export async function buildTcoevtScript() {
  try {
    const [tRes, cRes, oRes] = await Promise.all([
      fetch(`${API}/entities/Task`),
      fetch(`${API}/entities/Contact`),
      fetch(`${API}/v1/ops/events`),
    ]);
    const tj = tRes.ok ? await tRes.json() : [];
    const cj = cRes.ok ? await cRes.json() : [];
    const oj = oRes.ok ? await oRes.json() : [];

    const tasks = Array.isArray(tj) ? tj : tj.items ?? tj.data ?? [];
    const contacts = Array.isArray(cj) ? cj : cj.items ?? cj.data ?? [];
    const events = Array.isArray(oj) ? oj : oj.items ?? oj.data ?? oj.events ?? [];

    let fullySig = 0, contactOnly = 0, opsOnly = 0, clear = 0;
    tasks.forEach((task) => {
      const text = (task.title || task.name || task.description || task.summary || "").toLowerCase();
      const words = text.split(/[\s,._-]+/).filter((w) => w.length >= 3);
      const hasC = words.some((w) =>
        contacts.some((c) => (c.name || c.email || c.role || c.organisation || "").toLowerCase().includes(w))
      );
      const hasO = words.some((w) =>
        events.some((e) => (e.title || e.name || e.description || e.message || "").toLowerCase().includes(w))
      );
      if (hasC && hasO) fullySig++;
      else if (hasC) contactOnly++;
      else if (hasO) opsOnly++;
      else clear++;
    });

    const total = tasks.length;
    const pct = total ? ((fullySig / total) * 100).toFixed(1) : "0.0";
    return `TCOEVT Task × Contact × Ops Events Triple Nexus: ${total} tasks | ${contacts.length} contacts | ${events.length} ops events | ${fullySig} fully signaled (${pct}%) | ${contactOnly} contact-only | ${opsOnly} ops-only | ${clear} clear (no contact or ops coverage).`;
  } catch (e) {
    return `TCOEVT: fetch error — ${e.message}`;
  }
}

function classify(task, contacts, events) {
  const text = (task.title || task.name || task.description || task.summary || "").toLowerCase();
  const words = text.split(/[\s,._-]+/).filter((w) => w.length >= 3);
  const cMatches = contacts.filter((c) =>
    words.some((w) => (c.name || c.email || c.role || c.organisation || "").toLowerCase().includes(w))
  );
  const oMatches = events.filter((e) =>
    words.some((w) => (e.title || e.name || e.description || e.message || "").toLowerCase().includes(w))
  );
  const hasC = cMatches.length > 0;
  const hasO = oMatches.length > 0;
  if (hasC && hasO) return { type: "FULLY_SIGNALED", cMatches, oMatches };
  if (hasC) return { type: "CONTACT_ONLY", cMatches, oMatches };
  if (hasO) return { type: "OPS_ONLY", cMatches, oMatches };
  return { type: "CLEAR", cMatches, oMatches };
}

const TYPE_COLOR = {
  FULLY_SIGNALED: "#00ff88",
  CONTACT_ONLY: "#38bdf8",
  OPS_ONLY: "#f97316",
  CLEAR: "#334155",
};

const STATUS_COLOR = { DONE: "#22c55e", IN_PROGRESS: "#38bdf8", PENDING: "#eab308", BLOCKED: "#ef4444" };
const SEV_COLOR = { CRITICAL: "#ef4444", HIGH: "#f97316", MEDIUM: "#eab308", LOW: "#22c55e", INFO: "#38bdf8" };

export default function TaskContactOpsEventsTriple() {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [tRes, cRes, oRes] = await Promise.all([
        fetch(`${API}/entities/Task`),
        fetch(`${API}/entities/Contact`),
        fetch(`${API}/v1/ops/events`),
      ]);
      const tj = tRes.ok ? await tRes.json() : [];
      const cj = cRes.ok ? await cRes.json() : [];
      const oj = oRes.ok ? await oRes.json() : [];
      setTasks(Array.isArray(tj) ? tj : tj.items ?? tj.data ?? []);
      setContacts(Array.isArray(cj) ? cj : cj.items ?? cj.data ?? []);
      setEvents(Array.isArray(oj) ? oj : oj.items ?? oj.data ?? oj.events ?? []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 90000);
    return () => clearInterval(id);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jarvis:tcoevt-toggle", handler);
    return () => window.removeEventListener("jarvis:tcoevt-toggle", handler);
  }, []);

  const classified = tasks.map((t) => ({ ...t, ...classify(t, contacts, events) }));

  const fullySig = classified.filter((t) => t.type === "FULLY_SIGNALED").length;
  const contactOnly = classified.filter((t) => t.type === "CONTACT_ONLY").length;
  const opsOnly = classified.filter((t) => t.type === "OPS_ONLY").length;
  const clear = classified.filter((t) => t.type === "CLEAR").length;
  const pct = tasks.length ? ((fullySig / tasks.length) * 100).toFixed(1) : "0.0";

  const visible = classified.filter((t) => {
    if (filter !== "ALL" && t.type !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (t.title || t.name || "").toLowerCase().includes(s);
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    try {
      const brief = await buildTcoevtScript();
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `TCOEVT task × contact × ops events coverage: ${brief}. Identify the most critical clear tasks and recommend contact/ops escalation priorities.` }),
      });
      const data = res.ok ? await res.json() : {};
      const text = data.response || data.message || brief;
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      // silent
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Task × Contact × Ops Events Triple Nexus (TCOEVT)"
        style={{
          position: "fixed",
          left: 896940,
          bottom: 8,
          zIndex: 257,
          background: "#0f172a",
          border: "1px solid #334155",
          color: "#94a3b8",
          fontSize: 10,
          padding: "3px 7px",
          borderRadius: 4,
          cursor: "pointer",
          letterSpacing: "0.05em",
          fontFamily: "monospace",
        }}
      >
        ◈ TCOEVT
        {clear > 0 && (
          <span style={{ marginLeft: 5, background: "#1c1700", color: "#fbbf24", borderRadius: 3, padding: "1px 5px", fontSize: 9 }}>
            {clear}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 60,
        right: 20,
        width: 540,
        maxHeight: "82vh",
        overflowY: "auto",
        background: "#0a0f1e",
        border: "1px solid #1e3a5f",
        borderRadius: 8,
        zIndex: 2570,
        fontFamily: "monospace",
        color: "#e2e8f0",
        boxShadow: "0 0 40px #1e3a5f55",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #1e3a5f", background: "#050d1a" }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: "#00ff88", letterSpacing: "0.08em" }}>◈ TCOEVT — Task × Contact × Ops Events</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load} disabled={loading} style={{ background: "none", border: "1px solid #334155", color: "#94a3b8", fontSize: 10, padding: "2px 8px", borderRadius: 3, cursor: "pointer" }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 14, cursor: "pointer" }}>✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6, padding: "10px 14px" }}>
        {[
          { label: "Tasks", val: tasks.length, color: "#38bdf8" },
          { label: "Fully Signaled", val: fullySig, color: "#00ff88" },
          { label: "Contact Only", val: contactOnly, color: "#38bdf8" },
          { label: "Ops Only", val: opsOnly, color: "#f97316" },
          { label: "Coverage %", val: `${pct}%`, color: fullySig > 0 ? "#00ff88" : "#64748b" },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: "#0f172a", border: "1px solid #1e3a5f", borderRadius: 5, padding: "6px 4px", textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {clear > 0 && (
        <div style={{ margin: "0 14px 8px", background: "#1c1700", border: "1px solid #92400e", borderRadius: 4, padding: "5px 10px", fontSize: 11, color: "#fbbf24" }}>
          ⚠ {clear} tasks have no contact or ops event signal (clear — no operational context)
        </div>
      )}

      {err && <div style={{ margin: "0 14px 8px", color: "#f87171", fontSize: 11 }}>Error: {err}</div>}
      {loading && <div style={{ margin: "0 14px 8px", color: "#38bdf8", fontSize: 11 }}>Loading…</div>}

      {/* assess */}
      <div style={{ padding: "0 14px 8px" }}>
        <button
          onClick={assess}
          disabled={assessing}
          style={{ background: "#0f172a", border: "1px solid #334155", color: "#94a3b8", fontSize: 10, padding: "4px 12px", borderRadius: 3, cursor: "pointer" }}
        >
          {assessing ? "Assessing…" : "▶ ASSESS"}
        </button>
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 14px 8px", flexWrap: "wrap" }}>
        {["ALL", "FULLY_SIGNALED", "CONTACT_ONLY", "OPS_ONLY", "CLEAR"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? "#1e3a5f" : "#0f172a",
              border: `1px solid ${filter === f ? "#38bdf8" : "#334155"}`,
              color: filter === f ? "#7dd3fc" : "#64748b",
              fontSize: 10,
              padding: "3px 9px",
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            {f}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search tasks…"
          style={{ flex: 1, minWidth: 100, background: "#0f172a", border: "1px solid #334155", color: "#e2e8f0", fontSize: 10, padding: "3px 8px", borderRadius: 3, outline: "none" }}
        />
      </div>

      {/* task list */}
      <div style={{ padding: "0 14px 14px" }}>
        {visible.slice(0, 80).map((t, i) => {
          const id = t.id || t.title || i;
          const isExp = expanded === id;
          const label = t.title || t.name || `Task ${i + 1}`;
          return (
            <div
              key={id}
              onClick={() => setExpanded(isExp ? null : id)}
              style={{ cursor: "pointer", padding: "6px 8px", marginBottom: 4, background: "#0f172a", border: "1px solid #1e3a5f", borderRadius: 4 }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 11, color: "#e2e8f0" }}>{label}</span>
                  {t.status && (
                    <span style={{ marginLeft: 6, fontSize: 9, color: STATUS_COLOR[t.status] ?? "#94a3b8", background: "#0a0f1e", border: `1px solid ${STATUS_COLOR[t.status] ?? "#334155"}`, borderRadius: 2, padding: "0 4px" }}>
                      {t.status}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: TYPE_COLOR[t.type] ?? "#94a3b8", background: "#0a0f1e", padding: "1px 6px", borderRadius: 3, border: `1px solid ${TYPE_COLOR[t.type] ?? "#334155"}`, whiteSpace: "nowrap", marginLeft: 6 }}>
                  {t.type}
                </span>
              </div>
              {isExp && (
                <div style={{ marginTop: 8 }}>
                  {t.cMatches?.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 10, color: "#38bdf8", marginBottom: 3 }}>Contacts ({t.cMatches.length})</div>
                      {t.cMatches.slice(0, 5).map((c, ci) => (
                        <div key={ci} style={{ fontSize: 10, color: "#94a3b8", padding: "2px 6px", background: "#021220", borderRadius: 3, marginBottom: 2, display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ fontSize: 9, color: "#38bdf8", border: "1px solid #1e3a5f", borderRadius: 2, padding: "0 4px" }}>{c.role || "CONTACT"}</span>
                          {c.name || c.email || c.id}
                        </div>
                      ))}
                    </div>
                  )}
                  {t.oMatches?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: "#f97316", marginBottom: 3 }}>Ops Events ({t.oMatches.length})</div>
                      {t.oMatches.slice(0, 5).map((e, ei) => (
                        <div key={ei} style={{ fontSize: 10, color: "#94a3b8", padding: "2px 6px", background: "#1a0c02", borderRadius: 3, marginBottom: 2, display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ fontSize: 9, color: SEV_COLOR[e.severity] ?? "#94a3b8", border: `1px solid ${SEV_COLOR[e.severity] ?? "#334155"}`, borderRadius: 2, padding: "0 4px" }}>{e.severity || "EVT"}</span>
                          {e.title || e.name || e.message || e.id}
                        </div>
                      ))}
                    </div>
                  )}
                  {t.cMatches?.length === 0 && t.oMatches?.length === 0 && (
                    <div style={{ fontSize: 10, color: "#475569", fontStyle: "italic" }}>No contact or ops event cross-references found</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {visible.length === 0 && !loading && (
          <div style={{ color: "#475569", fontSize: 11, textAlign: "center", padding: "20px 0" }}>No tasks match filter</div>
        )}
        {visible.length > 80 && (
          <div style={{ color: "#475569", fontSize: 10, textAlign: "center", padding: "8px 0" }}>Showing 80 of {visible.length}</div>
        )}
      </div>
    </div>
  );
}
