import { useCallback, useEffect, useMemo, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { WorkflowMapping } from "@/api/entities";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";

const ACCENT = C.neon;

const ACTIONS = ["ASSERT", "LINK", "REVISE", "REVOKE", "INGEST", "VERIFY"];

// Deterministic-ish short hash for ledger entries (FNV-1a over a seed string).
const hashId = (seed) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
};

const blankForm = { actor: "jarvis", action: "ASSERT", subject: "" };

const input = {
  background: "rgba(0,0,0,0.4)", border: `1px solid ${ACCENT}33`, borderRadius: 5, color: C.textB,
  fontFamily: "inherit", fontSize: 10, padding: "6px 8px", boxSizing: "border-box",
};

const btn = {
  background: ACCENT + "11", border: `1px solid ${ACCENT}55`, color: ACCENT, fontFamily: "inherit",
  fontSize: 10, letterSpacing: 2, padding: "7px 14px", borderRadius: 5, cursor: "pointer", fontWeight: 700,
};

const mapWorkflowToEntry = (w, prev) => {
  const ts = w.created_date || w.updated_date || w.timestamp || new Date(0).toISOString();
  const seed = `${prev}|${ts}|${w.id}|${w.name || w.workflow || ""}`;
  return {
    hash: hashId(seed),
    prev: prev.slice(0, 8),
    ts,
    actor: w.actor || w.owner || "workflow-engine",
    action: "INGEST",
    subject: w.name || w.workflow || w.id || "workflow mapping",
    source: "WorkflowMapping",
  };
};

export default function KGIKLedger() {
  const [chainSource, setChainSource] = useState([]);
  const [local, setLocal] = useState([]); // session-appended entries
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(blankForm);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await WorkflowMapping.list();
      setChainSource(Array.isArray(res) ? res : []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Build an immutable-style chain: genesis → WorkflowMapping entries → local appends.
  const ledger = useMemo(() => {
    const entries = [];
    let prev = "00000000genesis";
    chainSource.forEach((w) => {
      const e = mapWorkflowToEntry(w, prev);
      entries.push(e);
      prev = e.hash;
    });
    local.forEach((l) => {
      const seed = `${prev}|${l.ts}|${l.actor}|${l.action}|${l.subject}`;
      const e = { ...l, hash: hashId(seed), prev: prev.slice(0, 8), source: "local" };
      entries.push(e);
      prev = e.hash;
    });
    return entries;
  }, [chainSource, local]);

  const append = useCallback((e) => {
    e.preventDefault();
    if (!form.subject.trim()) return;
    setLocal((prev) => [...prev, {
      ts: new Date().toISOString(),
      actor: form.actor.trim() || "anon",
      action: form.action,
      subject: form.subject.trim(),
    }]);
    setForm((f) => ({ ...f, subject: "" }));
  }, [form]);

  const actorCount = useMemo(() => new Set(ledger.map((e) => e.actor)).size, [ledger]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const empty = !loading && !error && ledger.length === 0;

  return (
    <PageShell
      title="KGIK LEDGER"
      subtitle="IMMUTABLE KNOWLEDGE-EVENT LEDGER · HASH-CHAINED · APPEND-ONLY"
      accent={ACCENT}
      actions={<button onClick={load} disabled={loading} style={btn}>{loading ? "◌ SYNC" : "↻ REFRESH"}</button>}
    >
      <Grid min={160} style={{ marginBottom: 14 }}>
        <StatTile label="Ledger Entries" value={ledger.length} accent={ACCENT} sub="total in chain" />
        <StatTile label="From Workflows" value={chainSource.length} accent={C.blue} sub="WorkflowMapping" />
        <StatTile label="Session Appends" value={local.length} accent={C.purple} />
        <StatTile label="Distinct Actors" value={actorCount} accent={C.gold} />
      </Grid>

      <PanelCard title="APPEND KNOWLEDGE EVENT" accent={ACCENT} style={{ marginBottom: 14 }}>
        <form onSubmit={append} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <input style={{ ...input, width: 130 }} value={form.actor} onChange={set("actor")} placeholder="actor" />
          <select style={{ ...input, width: 110 }} value={form.action} onChange={set("action")}>
            {ACTIONS.map((a) => <option key={a}>{a}</option>)}
          </select>
          <input style={{ ...input, flex: "1 1 220px" }} value={form.subject} onChange={set("subject")} placeholder="subject / assertion (e.g. sam CONTROLS psg)" />
          <button type="submit" disabled={!form.subject.trim()} style={btn}>⊕ APPEND</button>
        </form>
        <div style={{ fontSize: 8, color: C.text, marginTop: 8 }}>
          Each append is hash-chained to the previous entry — entries are never edited or deleted.
        </div>
      </PanelCard>

      <PanelCard title="LEDGER" accent={ACCENT} right={<Badge color={ACCENT}>{ledger.length}</Badge>}>
        <DataState
          loading={loading}
          error={error}
          empty={empty}
          emptyLabel="Ledger is empty — append a knowledge event above to seed the chain."
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
              <thead>
                <tr style={{ color: C.text, textAlign: "left" }}>
                  <th style={{ padding: "5px 8px" }}>#</th>
                  <th style={{ padding: "5px 8px" }}>HASH</th>
                  <th style={{ padding: "5px 8px" }}>PREV</th>
                  <th style={{ padding: "5px 8px" }}>TIMESTAMP</th>
                  <th style={{ padding: "5px 8px" }}>ACTOR</th>
                  <th style={{ padding: "5px 8px" }}>ACTION</th>
                  <th style={{ padding: "5px 8px" }}>SUBJECT</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((e, i) => (
                  <tr key={e.hash} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: "6px 8px", color: C.text }}>{i}</td>
                    <td style={{ padding: "6px 8px", color: ACCENT, fontFamily: "monospace" }}>{e.hash}</td>
                    <td style={{ padding: "6px 8px", color: C.text, fontFamily: "monospace" }}>{e.prev}</td>
                    <td style={{ padding: "6px 8px", color: C.text, whiteSpace: "nowrap" }}>{String(e.ts).replace("T", " ").slice(0, 19)}</td>
                    <td style={{ padding: "6px 8px", color: C.textB }}>{e.actor}</td>
                    <td style={{ padding: "6px 8px" }}><Badge color={e.source === "local" ? C.purple : C.blue}>{e.action}</Badge></td>
                    <td style={{ padding: "6px 8px", color: C.textB }}>{e.subject}</td>
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
