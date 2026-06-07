import { useCallback, useEffect, useMemo, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";

const ACCENT = C.gold;
const Patent = kimiClient.entities.Patent;

const COLUMNS = [
  { key: "id", label: "ID" },
  { key: "title", label: "TITLE" },
  { key: "assignee", label: "ASSIGNEE" },
  { key: "filing_date", label: "FILED" },
  { key: "status", label: "STATUS" },
  { key: "classification", label: "CLASS" },
];

// Patents are loaded from the Patent entity API.
const statusColor = (s) => ({ ACTIVE: C.neon, PENDING: C.gold, EXPIRED: C.text }[s] || C.text);

const btn = {
  background: ACCENT + "11", border: `1px solid ${ACCENT}55`, color: ACCENT, fontFamily: "inherit",
  fontSize: 10, letterSpacing: 2, padding: "7px 14px", borderRadius: 5, cursor: "pointer", fontWeight: 700,
};

const input = {
  background: "rgba(0,0,0,0.4)", border: `1px solid ${ACCENT}33`, borderRadius: 5, color: C.textB,
  fontFamily: "inherit", fontSize: 10, padding: "6px 8px", boxSizing: "border-box", width: "100%",
};

const blankForm = { id: "", title: "", assignee: "", filing_date: "", status: "PENDING", classification: "", abstract: "" };

export default function PatentRegistry() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sortKey, setSortKey] = useState("filing_date");
  const [sortDir, setSortDir] = useState("desc");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankForm);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await Patent.list();
      setRows(Array.isArray(res) ? res : []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addPatent = useCallback(async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await Patent.create({ ...form, id: form.id.trim() || `PAT-${Date.now()}` });
      setForm(blankForm);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }, [form, load]);

  const remove = useCallback(async (id) => {
    setBusy(true);
    setError(null);
    try {
      await Patent.remove(id);
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }, [load]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = String(a[sortKey] ?? "").toLowerCase();
      const bv = String(b[sortKey] ?? "").toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const empty = !loading && !error && rows.length === 0;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <PageShell
      title="PATENT REGISTRY"
      subtitle="MASTER REGISTER · SORTABLE · CRUD"
      accent={ACCENT}
      actions={
        <>
          <button onClick={() => setShowForm((v) => !v)} style={btn}>{showForm ? "✕ CANCEL" : "+ ADD PATENT"}</button>
          <button onClick={load} disabled={loading} style={btn}>{loading ? "◌ SYNC" : "↻ REFRESH"}</button>
        </>
      }
    >
      <Grid min={160} style={{ marginBottom: 14 }}>
        <StatTile label="Total Records" value={rows.length} accent={ACCENT} />
        <StatTile label="Active" value={rows.filter((r) => r.status === "ACTIVE").length} accent={C.neon} />
        <StatTile label="Pending" value={rows.filter((r) => r.status === "PENDING").length} accent={C.gold} />
        <StatTile label="Expired" value={rows.filter((r) => r.status === "EXPIRED").length} accent={C.text} />
      </Grid>

      {showForm && (
        <PanelCard title="NEW PATENT" accent={ACCENT} style={{ marginBottom: 14 }}>
          <form onSubmit={addPatent}>
            <Grid min={200} gap={10}>
              <label style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>ID (optional)
                <input style={input} value={form.id} onChange={set("id")} placeholder="auto-generated" /></label>
              <label style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>TITLE *
                <input style={input} value={form.title} onChange={set("title")} required /></label>
              <label style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>ASSIGNEE
                <input style={input} value={form.assignee} onChange={set("assignee")} /></label>
              <label style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>FILING DATE
                <input style={input} type="date" value={form.filing_date} onChange={set("filing_date")} /></label>
              <label style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>CLASSIFICATION
                <input style={input} value={form.classification} onChange={set("classification")} placeholder="e.g. H02S" /></label>
              <label style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>STATUS
                <select style={input} value={form.status} onChange={set("status")}>
                  <option>PENDING</option><option>ACTIVE</option><option>EXPIRED</option>
                </select></label>
            </Grid>
            <label style={{ fontSize: 8, color: C.text, letterSpacing: 1, display: "block", marginTop: 10 }}>ABSTRACT
              <textarea style={{ ...input, minHeight: 56, resize: "vertical" }} value={form.abstract} onChange={set("abstract")} /></label>
            <button type="submit" disabled={busy} style={{ ...btn, marginTop: 10 }}>{busy ? "◌ SAVING" : "✓ COMMIT TO REGISTER"}</button>
          </form>
        </PanelCard>
      )}

      <PanelCard title="REGISTER" accent={ACCENT} right={<Badge color={ACCENT}>{rows.length}</Badge>}>
        <DataState loading={loading} error={error} empty={empty} emptyLabel="Register is empty.">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
              <thead>
                <tr style={{ color: C.text, textAlign: "left" }}>
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => toggleSort(col.key)}
                      style={{ padding: "5px 8px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", userSelect: "none" }}
                    >
                      {col.label}{sortKey === col.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                    </th>
                  ))}
                  <th style={{ padding: "5px 8px" }} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: "6px 8px", color: ACCENT, fontFamily: "inherit" }}>{r.id}</td>
                    <td style={{ padding: "6px 8px", color: C.textB }}>{r.title}</td>
                    <td style={{ padding: "6px 8px", color: C.textB }}>{r.assignee || "—"}</td>
                    <td style={{ padding: "6px 8px", color: C.text, whiteSpace: "nowrap" }}>{r.filing_date || "—"}</td>
                    <td style={{ padding: "6px 8px" }}><Badge color={statusColor(r.status)}>{r.status || "—"}</Badge></td>
                    <td style={{ padding: "6px 8px", color: C.blue }}>{r.classification || "—"}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>
                      <button
                        onClick={() => remove(r.id)} disabled={busy}
                        style={{ background: C.redD, border: `1px solid ${C.red}55`, color: C.red, fontFamily: "inherit",
                          fontSize: 8, padding: "3px 8px", borderRadius: 4, cursor: "pointer", letterSpacing: 1 }}
                      >DEL</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataState>
      </PanelCard>
    </PageShell>
  );
}
