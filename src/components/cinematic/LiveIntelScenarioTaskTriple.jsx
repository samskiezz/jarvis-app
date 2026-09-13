import { useState, useEffect, useCallback } from 'react';

const API = '';
const API_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) || 'dev-key';

const BG   = '#0a0e1a';
const BD   = '#1e2a3a';
const MU   = '#7b8fa6';
const AM   = '#f59e0b';
const CY   = '#06b6d4';
const GR   = '#22c55e';
const RD   = '#ef4444';
const MONO = '#e2e8f0';

const FILTERS = ['ALL', 'MANAGED', 'SCENARIO_ONLY', 'TASK_ONLY', 'UNRESPONDED'];

const CLASS_COLOR = {
  MANAGED:       GR,
  SCENARIO_ONLY: CY,
  TASK_ONLY:     AM,
  UNRESPONDED:   RD,
};
const CLASS_LABEL = {
  MANAGED:       'Managed',
  SCENARIO_ONLY: 'Scenario Only',
  TASK_ONLY:     'Task Only',
  UNRESPONDED:   'Unresponded',
};

const LISTR_RE = /\b(live[._-]?intel[._-]?scenario[._-]?task|listr|managed[._-]?events?|unresponded[._-]?events?|world[._-]?event[._-]?response|live[._-]?world[._-]?task|which[._-]?events?[._-]?have[._-]?plans?)\b/i;
export function isListrQuery(t) { return LISTR_RE.test(t || ''); }

function keywords(text) {
  if (!text) return [];
  return text.toLowerCase().split(/\W+/).filter(w => w.length > 3);
}
function relevance(intelKw, otherText) {
  if (!otherText) return 0;
  const otherKw = keywords(otherText);
  return intelKw.filter(k => otherKw.includes(k)).length;
}

function normIntel(raw) {
  return {
    id: raw.id || raw._id || '',
    title: raw.title || raw.name || raw.headline || '',
    summary: raw.summary || raw.description || raw.content || '',
    source: raw.source || raw.provider || '',
    severity: raw.severity || raw.level || '',
    ts: raw.timestamp || raw.created_at || raw.date || '',
  };
}
function normScenario(raw) {
  return {
    id: raw.id || raw._id || '',
    name: raw.name || raw.title || '',
    description: raw.description || raw.summary || '',
  };
}
function normTask(raw) {
  return {
    id: raw.id || raw._id || '',
    title: raw.title || raw.name || '',
    status: raw.status || '',
    description: raw.description || '',
  };
}

async function fetchIntel() {
  const r = await fetch(`${API}/functions/getLiveIntel`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`getLiveIntel ${r.status}`);
  const d = await r.json();
  const arr = d.data ?? d.items ?? d.intel ?? d.results ?? (Array.isArray(d) ? d : []);
  return arr.map(normIntel);
}
async function fetchScenarios() {
  const r = await fetch(`${API}/v1/scenario/list`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`scenario/list ${r.status}`);
  const d = await r.json();
  const arr = d.data ?? d.items ?? d.scenarios ?? d.results ?? (Array.isArray(d) ? d : []);
  return arr.map(normScenario);
}
async function fetchTasks() {
  const r = await fetch(`${API}/entities/Task`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`entities/Task ${r.status}`);
  const d = await r.json();
  const arr = d.data ?? d.items ?? d.tasks ?? d.results ?? (Array.isArray(d) ? d : []);
  return arr.map(normTask);
}

function classify(intel, scenarios, tasks) {
  const kw = keywords(`${intel.title} ${intel.summary}`);
  const hasScen = scenarios.some(s => relevance(kw, `${s.name} ${s.description}`) > 0);
  const hasTask = tasks.some(t => relevance(kw, `${t.title} ${t.description}`) > 0);
  if (hasScen && hasTask) return 'MANAGED';
  if (hasScen) return 'SCENARIO_ONLY';
  if (hasTask) return 'TASK_ONLY';
  return 'UNRESPONDED';
}

export async function buildListrScript() {
  try {
    const [intels, scenarios, tasks] = await Promise.all([fetchIntel(), fetchScenarios(), fetchTasks()]);
    const rows = intels.map(i => ({ ...i, cls: classify(i, scenarios, tasks) }));
    const counts = { MANAGED: 0, SCENARIO_ONLY: 0, TASK_ONLY: 0, UNRESPONDED: 0 };
    rows.forEach(r => { counts[r.cls] = (counts[r.cls] || 0) + 1; });
    const ctx = `Live Intel events: ${rows.length}. Managed: ${counts.MANAGED}, Scenario only: ${counts.SCENARIO_ONLY}, Task only: ${counts.TASK_ONLY}, Unresponded: ${counts.UNRESPONDED}. Top unresponded: ${rows.filter(r => r.cls === 'UNRESPONDED').slice(0, 3).map(r => r.title).join('; ') || 'none'}.`;
    const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ message: `${ctx} In exactly two sentences, summarise the live intel response posture and most urgent gap.` }),
    });
    if (!r.ok) return ctx;
    const d = await r.json();
    return d.response || d.message || d.text || ctx;
  } catch {
    return 'Live intel × scenario × task correlation unavailable.';
  }
}

export default function LiveIntelScenarioTaskTriple() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [filter, setFilter]     = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState({});
  const [brief, setBrief]       = useState('');
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [intels, scenarios, tasks] = await Promise.all([fetchIntel(), fetchScenarios(), fetchTasks()]);
      setRows(intels.map(i => ({ ...i, cls: classify(i, scenarios, tasks) })));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener('jarvis:listr-toggle', onToggle);
    return () => window.removeEventListener('jarvis:listr-toggle', onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true); setBrief('');
    try { setBrief(await buildListrScript()); } catch { setBrief('Assessment unavailable.'); }
    finally { setAssessing(false); }
  }, []);

  const counts = { MANAGED: 0, SCENARIO_ONLY: 0, TASK_ONLY: 0, UNRESPONDED: 0 };
  rows.forEach(r => { counts[r.cls] = (counts[r.cls] || 0) + 1; });
  const unresponded = counts.UNRESPONDED;

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.cls !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.title + r.summary + r.source).toLowerCase().includes(q);
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Live Intel × Scenario × Task Triple (LISTR)"
        style={{
          position: 'fixed', left: 7920, bottom: 18, zIndex: 68,
          background: unresponded > 0 ? RD : BD,
          border: `1px solid ${unresponded > 0 ? RD : CY}`,
          color: MONO, borderRadius: 6, padding: '4px 10px',
          fontSize: 11, cursor: 'pointer', fontFamily: 'monospace',
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        ◈ LISTR
        {unresponded > 0 && (
          <span style={{ background: RD, color: '#fff', borderRadius: 10, padding: '0 6px', fontSize: 10 }}>
            {unresponded}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 60, left: '50%', transform: 'translateX(-50%)',
      width: 720, maxHeight: '76vh', zIndex: 9000,
      background: BG, border: `1px solid ${BD}`,
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', fontSize: 12, color: MONO, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${BD}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: CY, fontWeight: 700, flex: 1 }}>◈ LIVE INTEL × SCENARIO × TASK (LISTR)</span>
        <button onClick={assess} disabled={assessing}
          style={{ background: assessing ? BD : AM, color: '#000', border: 'none', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 11 }}>
          {assessing ? '…' : 'ASSESS'}
        </button>
        <button onClick={load} disabled={loading}
          style={{ background: BD, color: MONO, border: `1px solid ${BD}`, borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}>
          {loading ? '…' : '↺'}
        </button>
        <button onClick={() => setOpen(false)}
          style={{ background: 'transparent', color: MU, border: 'none', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px', borderBottom: `1px solid ${BD}` }}>
        {Object.entries(CLASS_LABEL).map(([k, label]) => (
          <div key={k} style={{ flex: 1, background: BD, borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: CLASS_COLOR[k] }}>{counts[k]}</div>
            <div style={{ fontSize: 10, color: MU }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {rows.length > 0 && (
        <div style={{ display: 'flex', height: 4, margin: '0 14px 8px' }}>
          {Object.entries(CLASS_COLOR).map(([k, col]) => (
            counts[k] > 0 && (
              <div key={k} style={{ flex: counts[k], background: col }} title={`${CLASS_LABEL[k]}: ${counts[k]}`} />
            )
          ))}
        </div>
      )}

      {/* Filters + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ background: filter === f ? CY : BD, color: filter === f ? '#000' : MU, border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}>
            {f === 'ALL' ? `ALL (${rows.length})` : `${CLASS_LABEL[f] || f} (${counts[f] || 0})`}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{ marginLeft: 'auto', background: BD, border: `1px solid ${BD}`, color: MONO, borderRadius: 4, padding: '2px 8px', fontSize: 11, width: 140 }}
        />
      </div>

      {/* Brief */}
      {brief && (
        <div style={{ margin: '0 14px 8px', padding: '8px 10px', background: BD, borderRadius: 6, color: CY, fontSize: 11, lineHeight: 1.5 }}>
          {brief}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ margin: '0 14px 8px', padding: '6px 10px', background: '#1a0a0a', borderRadius: 6, color: RD, fontSize: 11 }}>
          {error}
        </div>
      )}

      {/* Rows */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 14px 14px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: MU, padding: '20px 0', textAlign: 'center' }}>No events match.</div>
        )}
        {visible.map(row => (
          <div key={row.id || row.title} style={{ borderBottom: `1px solid ${BD}`, padding: '8px 0' }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
              onClick={() => setExpanded(ex => ({ ...ex, [row.id]: !ex[row.id] }))}
            >
              <span style={{ color: CLASS_COLOR[row.cls], fontWeight: 700, fontSize: 10, minWidth: 110 }}>
                {CLASS_LABEL[row.cls]}
              </span>
              <span style={{ flex: 1, color: MONO }}>{row.title || '(no title)'}</span>
              {row.severity && (
                <span style={{ color: AM, fontSize: 10 }}>{row.severity}</span>
              )}
              <span style={{ color: MU, fontSize: 10 }}>{expanded[row.id] ? '▲' : '▼'}</span>
            </div>
            {expanded[row.id] && (
              <div style={{ marginTop: 6, padding: '6px 10px', background: BD, borderRadius: 6, color: MU, lineHeight: 1.5 }}>
                {row.summary && <div style={{ marginBottom: 4 }}>{row.summary}</div>}
                {row.source && <div style={{ fontSize: 10 }}>Source: <span style={{ color: CY }}>{row.source}</span></div>}
                {row.ts && <div style={{ fontSize: 10 }}>Time: {row.ts}</div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
