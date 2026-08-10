import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const TGCLI_RE = /\b(tgcli|task\s+graph\s+live|task\s+community\s+live|task\s+graph\s+community\s+live|activated\s+task|live\s+triggered\s+task|community\s+backed\s+task|dormant\s+task\s+triple|task\s+live\s+community|task\s+triple\s+live|graph\s+live\s+task)\b/i;

export function isTgcliQuery(t) { return TGCLI_RE.test(t || ''); }

function normComm(raw) {
  const arr = ['communities', 'clusters', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((c, i) => ({
    label: c.label || c.name || c.title || `Community ${i + 1}`,
    summary: String(c.summary || c.description || '').toLowerCase(),
    members: Array.isArray(c.members) ? c.members.join(' ').toLowerCase() : String(c.members || '').toLowerCase(),
    tags: Array.isArray(c.tags) ? c.tags.join(' ').toLowerCase() : String(c.tags || '').toLowerCase(),
  }));
}

function normTasks(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.tasks ?? raw?.data ?? []);
  return arr.map(t => ({
    id: t.id ?? t._id ?? String(Math.random()),
    label: t.title ?? t.name ?? t.mission ?? String(t.id ?? ''),
    description: String(t.description ?? t.notes ?? ''),
    priority: t.priority ?? t.urgency ?? '',
    status: t.status ?? t.state ?? '',
    tags: Array.isArray(t.tags) ? t.tags.join(' ') : String(t.tags ?? ''),
  }));
}

function normLive(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.intel ?? raw?.data ?? raw?.events ?? []);
  return arr.map(l => ({
    type: l.type ?? l.category ?? (l.magnitude != null ? 'SEISMIC' : l.symbol ? 'CRYPTO' : 'FX'),
    text: `${l.title ?? l.headline ?? l.name ?? ''} ${l.summary ?? l.body ?? ''} ${l.location ?? ''} ${l.symbol ?? ''}`.toLowerCase(),
  }));
}

function classify(task, commText, liveText) {
  const tokens = `${task.label} ${task.description} ${task.tags}`.toLowerCase().split(/\W+/).filter(t => t.length > 2);
  const score = src => tokens.reduce((s, tok) => s + (src.includes(tok) ? 1 : 0), 0);
  const commHit = score(commText) > 0;
  const liveHit = score(liveText) > 0;
  if (commHit && liveHit) return 'FULLY ACTIVATED';
  if (commHit) return 'COMMUNITY-BACKED';
  if (liveHit) return 'LIVE-TRIGGERED';
  return 'DORMANT';
}

export async function buildTgcliScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [tR, cR, lR] = await Promise.allSettled([
    fetch(`${API}/entities/Task`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/graph/communities`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/functions/getLiveIntel`, { headers: hdr }).then(r => r.json()),
  ]);
  const tasks = normTasks(tR.status === 'fulfilled' ? tR.value : []);
  const comms = normComm(cR.status === 'fulfilled' ? cR.value : []);
  const live  = normLive(lR.status === 'fulfilled' ? lR.value : []);
  const commText = comms.map(c => `${c.label} ${c.summary} ${c.members} ${c.tags}`).join(' ');
  const liveText = live.map(l => l.text).join(' ');
  let fa = 0, cb = 0, lt = 0, dm = 0;
  for (const t of tasks) {
    const s = classify(t, commText, liveText);
    if (s === 'FULLY ACTIVATED') fa++;
    else if (s === 'COMMUNITY-BACKED') cb++;
    else if (s === 'LIVE-TRIGGERED') lt++;
    else dm++;
  }
  return `TGCLI Task × Graph Community × Live Intel: ${tasks.length} tasks cross-referenced against ${comms.length} graph communities and ${live.length} live intel events. ` +
    `FULLY ACTIVATED: ${fa} (graph community backing + live world trigger). ` +
    `COMMUNITY-BACKED: ${cb} (network cluster aligned, no live signal). ` +
    `LIVE-TRIGGERED: ${lt} (live event match, no community context). ` +
    `DORMANT: ${dm} (no graph or live coverage — operational gap).`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 90, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = {
  'FULLY ACTIVATED': '#22d3ee',
  'COMMUNITY-BACKED': '#a78bfa',
  'LIVE-TRIGGERED': '#34d399',
  'DORMANT': '#f59e0b',
};
const STATE_ORDER = ['FULLY ACTIVATED', 'COMMUNITY-BACKED', 'LIVE-TRIGGERED', 'DORMANT'];

export default function TaskGraphCommunityLiveIntelTriple() {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [comms, setComms] = useState([]);
  const [live, setLive] = useState([]);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    const hdr = { Authorization: `Bearer ${key}` };
    try {
      const [tR, cR, lR] = await Promise.allSettled([
        fetch(`${API}/entities/Task`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/graph/communities`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/functions/getLiveIntel`, { headers: hdr }).then(r => r.json()),
      ]);
      const ts = normTasks(tR.status === 'fulfilled' ? tR.value : []);
      const cs = normComm(cR.status === 'fulfilled' ? cR.value : []);
      const ls = normLive(lR.status === 'fulfilled' ? lR.value : []);
      setTasks(ts);
      setComms(cs);
      setLive(ls);
      const commText = cs.map(c => `${c.label} ${c.summary} ${c.members} ${c.tags}`).join(' ');
      const liveText = ls.map(l => l.text).join(' ');
      setRows(ts.map(t => ({ ...t, state: classify(t, commText, liveText) })));
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (_) {}
    setLoading(false);
  }, []);

  const toggle = useCallback(() => setOpen(o => !o), []);

  useEffect(() => {
    window.addEventListener('jarvis:tgcli-toggle', toggle);
    return () => window.removeEventListener('jarvis:tgcli-toggle', toggle);
  }, [toggle]);

  useEffect(() => {
    if (open) {
      load();
      intervalRef.current = setInterval(load, 60_000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    const fa = rows.filter(r => r.state === 'FULLY ACTIVATED').length;
    const dm = rows.filter(r => r.state === 'DORMANT').length;
    const summary = `TGCLI: ${rows.length} tasks. FULLY ACTIVATED: ${fa}. COMMUNITY-BACKED: ${rows.filter(r => r.state === 'COMMUNITY-BACKED').length}. LIVE-TRIGGERED: ${rows.filter(r => r.state === 'LIVE-TRIGGERED').length}. DORMANT: ${dm}. ${comms.length} graph communities. ${live.length} live intel events.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: `Assess this TGCLI task-graph-community-live-intel triple coverage state and recommend the two highest-priority actions: ${summary}` }),
      });
      const d = await r.json();
      const text = d.response ?? d.message ?? summary;
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (_) {}
    setAssessing(false);
  }, [rows, comms, live]);

  const stateCounts = STATE_ORDER.reduce((acc, s) => ({ ...acc, [s]: rows.filter(r => r.state === s).length }), {});
  const visible = rows.filter(r =>
    (filter === 'ALL' || r.state === filter) &&
    (!search || r.label.toLowerCase().includes(search.toLowerCase()))
  );
  const activatedCount = stateCounts['FULLY ACTIVATED'] ?? 0;

  const PANEL = {
    position: 'fixed', right: 16, top: 16, zIndex: 9985, width: 680, maxHeight: 610,
    background: 'rgba(4,7,12,0.97)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10, display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
    color: '#e2e8f0', boxShadow: '0 0 60px rgba(34,211,238,0.08)', overflow: 'hidden',
  };

  if (!open) {
    return (
      <button onClick={toggle} title="TGCLI Task × Graph Community × Live Intel Triple Coverage" style={{
        position: 'fixed', left: 759680, bottom: 8, zIndex: 385,
        background: 'rgba(4,7,12,0.82)', border: '1px solid rgba(255,255,255,0.15)',
        color: '#94a3b8', fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
        letterSpacing: 1, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        ◈ TGCLI
        {activatedCount > 0 && (
          <span style={{ background: '#22d3ee', color: '#000', borderRadius: 3, fontSize: 8, padding: '1px 4px', fontWeight: 700 }}>
            {activatedCount}
          </span>
        )}
      </button>
    );
  }

  const total = rows.length;
  const covered = stateCounts['FULLY ACTIVATED'] ?? 0;
  const pct = total > 0 ? Math.round((covered / total) * 100) : 0;

  return (
    <div style={PANEL}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#22d3ee', fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ TGCLI</span>
        <span style={{ color: '#64748b', fontSize: 10, flex: 1 }}>Task × Graph Community × Live Intel Triple Coverage</span>
        {loading && <span style={{ color: '#64748b', fontSize: 9 }}>updating…</span>}
        {lastUpdated && <span style={{ color: '#475569', fontSize: 9 }}>{lastUpdated}</span>}
        <button onClick={toggle} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {STATE_ORDER.map(s => (
          <div key={s} style={TILE}>
            <div style={{ ...LABEL, color: STATE_COLOR[s] }}>{s}</div>
            <div style={{ ...VAL, color: STATE_COLOR[s] }}>{stateCounts[s] ?? 0}</div>
          </div>
        ))}
        <div style={TILE}>
          <div style={LABEL}>TOTAL</div>
          <div style={VAL}>{total}</div>
        </div>
      </div>

      <div style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#64748b', marginBottom: 4 }}>
          <span>FULLY ACTIVATED COVERAGE</span>
          <span>{pct}% · {comms.length} communities · {live.length} live events</span>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#22d3ee', borderRadius: 2, transition: 'width 0.4s' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {['ALL', ...STATE_ORDER].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? (STATE_COLOR[f] ?? '#22d3ee') : 'rgba(255,255,255,0.05)',
            border: 'none', borderRadius: 3, color: filter === f ? '#000' : '#94a3b8',
            fontSize: 8, padding: '2px 7px', cursor: 'pointer', letterSpacing: 0.5, fontFamily: 'inherit',
          }}>{f}</button>
        ))}
      </div>

      <div style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search tasks…"
          style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e2e8f0', fontFamily: 'inherit', fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px' }}>
        {visible.length === 0 ? (
          <div style={{ color: '#475569', fontSize: 10, textAlign: 'center', padding: 20 }}>no tasks match</div>
        ) : visible.map((t, i) => (
          <div key={t.id ?? i} style={{
            padding: '6px 8px', marginBottom: 4, borderRadius: 5,
            background: 'rgba(255,255,255,0.03)', border: `1px solid ${STATE_COLOR[t.state]}22`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 8, color: STATE_COLOR[t.state], minWidth: 120, letterSpacing: 0.5 }}>{t.state}</span>
            <span style={{ fontSize: 10, color: '#cbd5e1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.label || '—'}
            </span>
            {t.priority && <span style={{ fontSize: 8, color: '#64748b', background: 'rgba(255,255,255,0.06)', borderRadius: 3, padding: '1px 5px' }}>{t.priority}</span>}
            {t.status && <span style={{ fontSize: 8, color: '#475569' }}>{t.status}</span>}
          </div>
        ))}
      </div>

      <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8 }}>
        <button onClick={load} disabled={loading} style={{
          flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 4, color: '#94a3b8', fontSize: 9, padding: '5px 0', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 1,
        }}>⟳ REFRESH</button>
        <button onClick={assess} disabled={assessing} style={{
          flex: 1, background: assessing ? 'rgba(34,211,238,0.08)' : 'rgba(34,211,238,0.12)',
          border: '1px solid rgba(34,211,238,0.3)', borderRadius: 4,
          color: '#22d3ee', fontSize: 9, padding: '5px 0', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 1,
        }}>{assessing ? '…ASSESSING' : '⬡ ASSESS'}</button>
      </div>
    </div>
  );
}
