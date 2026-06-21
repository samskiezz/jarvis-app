import { useCallback, useEffect, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { Task } from "@/api/entities";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { Btn, inputStyle } from "@/components/Wave1Kit";

const ACCENT = C.neon;

const STATUSES = ["TODO", "IN_PROGRESS", "DONE"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH"];

const STATUS_COLOR = { TODO: C.blue, IN_PROGRESS: C.gold, DONE: C.neon };
const PRIORITY_COLOR = { LOW: C.text, MEDIUM: C.gold, HIGH: C.red };

const BLANK_FORM = { title: "", description: "", status: "TODO", priority: "MEDIUM" };

function TaskRow({ task, onStatusChange, onDelete, busy }) {
  const sc = STATUS_COLOR[task.status] || C.textB;
  const pc = PRIORITY_COLOR[task.priority] || C.text;
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 11px",
      borderRadius: 5, background: "rgba(0,0,0,0.25)",
      border: `1px solid rgba(140,170,190,0.08)`, marginBottom: 6,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: C.textB, fontWeight: 600, marginBottom: 3,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {task.title || "(untitled)"}
        </div>
        {task.description && (
          <div style={{ fontSize: 9, color: C.text, marginBottom: 5,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {task.description}
          </div>
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Badge color={sc}>{task.status || "TODO"}</Badge>
          {task.priority && <Badge color={pc}>{task.priority}</Badge>}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
        {STATUSES.filter((s) => s !== task.status).map((s) => (
          <button key={s} disabled={busy} onClick={() => onStatusChange(task.id, s)}
            style={{ fontSize: 8, padding: "2px 7px", borderRadius: 3, cursor: "pointer",
              background: STATUS_COLOR[s] + "1a", color: STATUS_COLOR[s],
              border: `1px solid ${STATUS_COLOR[s]}44`, fontFamily: "inherit",
              opacity: busy ? 0.5 : 1 }}>
            → {s}
          </button>
        ))}
        <button disabled={busy} onClick={() => onDelete(task.id)}
          style={{ fontSize: 8, padding: "2px 7px", borderRadius: 3, cursor: "pointer",
            background: C.red + "1a", color: C.red, border: `1px solid ${C.red}44`,
            fontFamily: "inherit", opacity: busy ? 0.5 : 1 }}>
          ✕
        </button>
      </div>
    </div>
  );
}

function KanbanColumn({ status, tasks, onStatusChange, onDelete, busy }) {
  const color = STATUS_COLOR[status] || C.textB;
  return (
    <PanelCard
      accent={color}
      title={`${status.replace("_", " ")} (${tasks.length})`}
      style={{ minHeight: 200 }}
    >
      {tasks.length === 0
        ? <div style={{ fontSize: 9, color: C.text, paddingTop: 8 }}>No tasks</div>
        : tasks.map((t) => (
          <TaskRow key={t.id} task={t} onStatusChange={onStatusChange} onDelete={onDelete} busy={busy} />
        ))
      }
    </PanelCard>
  );
}

export default function TaskManager() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await Task.list();
      setTasks(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const tasksByStatus = STATUSES.reduce((acc, s) => {
    acc[s] = tasks.filter((t) => (t.status || "TODO") === s);
    return acc;
  }, {});

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setFormError("Title is required."); return; }
    setFormError(null);
    setBusy(true);
    try {
      await Task.create({ ...form, title: form.title.trim() });
      setForm(BLANK_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setFormError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleStatusChange = async (id, status) => {
    setBusy(true);
    try {
      await Task.update(id, { status });
      setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status } : t));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id) => {
    setBusy(true);
    try {
      await Task.remove(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const counts = { todo: tasksByStatus.TODO.length, inProg: tasksByStatus.IN_PROGRESS.length, done: tasksByStatus.DONE.length };

  return (
    <PageShell
      title="TASK MANAGER"
      subtitle="LIVE TASK BOARD — CRUD via Task entity"
      accent={ACCENT}
      actions={
        <Btn accent={ACCENT} onClick={() => setShowForm((v) => !v)}>
          {showForm ? "✕ CANCEL" : "+ NEW TASK"}
        </Btn>
      }
    >
      {/* Stats row */}
      <Grid min={140} gap={10} style={{ marginBottom: 18 }}>
        <StatTile label="Total" value={tasks.length} accent={ACCENT} />
        <StatTile label="Todo" value={counts.todo} accent={C.blue} />
        <StatTile label="In Progress" value={counts.inProg} accent={C.gold} />
        <StatTile label="Done" value={counts.done} accent={C.neon} />
      </Grid>

      {/* New task form */}
      {showForm && (
        <PanelCard title="NEW TASK" accent={ACCENT} style={{ marginBottom: 18 }}>
          <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 4 }}>TITLE *</div>
                <input
                  style={inputStyle}
                  placeholder="Task title"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div>
                <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 4 }}>PRIORITY</div>
                <select
                  style={{ ...inputStyle }}
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                >
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 4 }}>DESCRIPTION</div>
              <input
                style={inputStyle}
                placeholder="Optional description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div>
              <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 4 }}>INITIAL STATUS</div>
              <select
                style={{ ...inputStyle }}
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {formError && <div style={{ fontSize: 9, color: C.red }}>⚠ {formError}</div>}
            <Btn accent={ACCENT} type="submit" disabled={busy}>
              {busy ? "SAVING…" : "CREATE TASK"}
            </Btn>
          </form>
        </PanelCard>
      )}

      {/* Kanban columns */}
      <DataState loading={loading} error={error} empty={false}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
          {STATUSES.map((s) => (
            <KanbanColumn
              key={s}
              status={s}
              tasks={tasksByStatus[s]}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              busy={busy}
            />
          ))}
        </div>
      </DataState>
    </PageShell>
  );
}
