import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SILTRI_RE = /\b(siltri|skill\s+invest|skill\s+live|skill\s+case\s+live|deployed\s+skill|dormant\s+skill|skill\s+operational\s+triple|skill\s+investigation\s+live)\b/i;

export function isSiltriQuery(t) { return SILTRI_RE.test(t || ''); }

export async function buildSiltriScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [skR, invR, liR] = await Promise.allSettled([
    fetch(`${API}/v1/aip/skill`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/investigations`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/functions/getLiveIntel`, { headers: hdr }).then(r => r.json()),
  ]);
  const skills = Array.isArray(skR.value) ? skR.value : (skR.value?.skills ?? skR.value?.data ?? []);
  const investigations = Array.isArray(invR.value) ? invR.value : (invR.value?.investigations ?? invR.value?.data ?? []);
  const liveItems = Array.isArray(liR.value) ? liR.value : (liR.value?.intel ?? liR.value?.data ?? []);

  const invText = investigations.map(i => `${i.name ?? i.title ?? i.id ?? ''} ${i.description ?? ''}`.toLowerCase()).join(' ');
  const liveText = liveItems.map(l => `${l.title ?? l.headline ?? l.name ?? ''} ${l.summary ?? l.body ?? ''}`.toLowerCase()).join(' ');

  let fullyDeployed = 0, caseRelevant = 0, liveTriggered = 0, dormant = 0;
  for (const sk of skills) {
    const name = `${sk.name ?? sk.title ?? sk.id ?? ''}`.toLowerCase();
    const tokens = name.split(/\W+/).filter(Boolean);
    const score = t => tokens.reduce((s, tok) => s + (t.includes(tok) ? 1 : 0), 0);
    const invHit = score(invText) > 0;
    const liveHit = score(liveText) > 0;
    if (invHit && liveHit) fullyDeployed++;
    else if (invHit) caseRelevant++;
    else if (liveHit) liveTriggered++;
    else dormant++;
  }
  return `SILTRI Skill × Investigation × Live Intel: ${skills.length} skills assessed. ` +
    `FULLY DEPLOYED: ${fullyDeployed} (investigation + live signal). ` +
    `CASE-RELEVANT: ${caseRelevant} (investigation, no live signal). ` +
    `LIVE-TRIGGERED: ${liveTriggered} (live signal, no investigation). ` +
    `DORMANT: ${dormant} (neither). ` +
    `${investigations.length} active investigations. ${liveItems.length} live intel items.`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 90, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = { 'FULLY DEPLOYED': '#22d3ee', 'CASE-RELEVANT': '#a78bfa', 'LIVE-TRIGGERED': '#34d399', 'DORMANT': '#f59e0b' };
const STATE_ORDER = ['FULLY DEPLOYED', 'CASE-RELEVANT', 'LIVE-TRIGGERED', 'DORMANT'];

export default function SkillInvestigationLiveIntelTriple() {
  const [open, setOpen] = useState(false);
  const [skills, setSkills] = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [liveItems, setLiveItems] = useState([]);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const intervalRef = useRef(null);

  const correlate = useCallback((sks, invs, lis) => {
    const invText = invs.map(i => `${i.name ?? i.title ?? i.id ?? ''} ${i.description ?? ''}`.toLowerCase()).join(' ');
    const liveText = lis.map(l => `${l.title ?? l.headline ?? l.name ?? ''} ${l.summary ?? l.body ?? ''}`.toLowerCase()).join(' ');
    return sks.map(sk => {
      const name = `${sk.name ?? sk.title ?? sk.id ?? ''}`;
      const tokens = name.toLowerCase().split(/\W+/).filter(Boolean);
      const score = t => tokens.reduce((s, tok) => s + (t.includes(tok) ? 1 : 0), 0);
      const invHit = score(invText) > 0;
      const liveHit = score(liveText) > 0;
      let state;
      if (invHit && liveHit) state = 'FULLY DEPLOYED';
      else if (invHit) state = 'CASE-RELEVANT';
      else if (liveHit) state = 'LIVE-TRIGGERED';
      else state = 'DORMANT';
      return { id: sk.id ?? sk.name ?? Math.random(), name, state, category: sk.category ?? sk.type ?? '', version: sk.version ?? '' };
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const hdr = { Authorization: `Bearer ${key}` };
      const [skR, invR, liR] = await Promise.allSettled([
        fetch(`${API}/v1/aip/skill`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/investigations`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/functions/getLiveIntel`, { headers: hdr }).then(r => r.json()),
      ]);
      const sks = Array.isArray(skR.value) ? skR.value : (skR.value?.skills ?? skR.value?.data ?? []);
      const invs = Array.isArray(invR.value) ? invR.value : (invR.value?.investigations ?? invR.value?.data ?? []);
      const lis = Array.isArray(liR.value) ? liR.value : (liR.value?.intel ?? liR.value?.data ?? []);
      setSkills(sks);
      setInvestigations(invs);
      setLiveItems(lis);
      setRows(correlate(sks, invs, lis));
      setLastUpdated(new Date());
    } catch {
      // keep stale data
    } finally {
      setLoading(false);
    }
  }, [correlate]);

  const toggle = useCallback(() => setOpen(o => !o), []);

  useEffect(() => {
    window.addEventListener('jarvis:siltri-toggle', toggle);
    return () => window.removeEventListener('jarvis:siltri-toggle', toggle);
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

  const counts = STATE_ORDER.reduce((acc, s) => { acc[s] = rows.filter(r => r.state === s).length; return acc; }, {});

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search && !r.name.toLowerCase().includes(search.toLowerCase()) && !r.category.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const total = rows.length;
  const pct = s => total ? Math.round((counts[s] / total) * 100) : 0;

  const assess = async () => {
    setAssessing(true);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const prompt = `Skill × Investigation × Live Intel triple coverage: ${total} skills. ` +
        `FULLY DEPLOYED: ${counts['FULLY DEPLOYED']}, CASE-RELEVANT: ${counts['CASE-RELEVANT']}, ` +
        `LIVE-TRIGGERED: ${counts['LIVE-TRIGGERED']}, DORMANT: ${counts['DORMANT']}. ` +
        `${investigations.length} investigations, ${liveItems.length} live intel items. ` +
        `Provide a 2-sentence operational readiness brief for skill deployment status.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const text = data.response ?? data.message ?? data.text ?? '';
      if (text) window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch {
      // silent
    } finally {
      setAssessing(false);
    }
  };

  if (!open) {
    const dormantCount = counts['DORMANT'] ?? 0;
    return (
      <button
        onClick={toggle}
        title="Skill × Investigation × Live Intel Triple Coverage"
        style={{
          position: 'fixed', left: 756880, bottom: 8, zIndex: 380,
          background: dormantCount > 0 ? 'rgba(245,158,11,0.18)' : 'rgba(0,0,0,0.55)',
          border: `1px solid ${dormantCount > 0 ? '#f59e0b' : 'rgba(255,255,255,0.18)'}`,
          borderRadius: 6, color: '#e2e8f0', fontFamily: 'monospace', fontSize: 11,
          padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        SILTRI {dormantCount > 0 && <span style={{ color: '#f59e0b', marginLeft: 4 }}>{dormantCount}✕</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, zIndex: 9980, width: 680, maxHeight: 610,
      background: 'rgba(10,10,20,0.96)', border: '1px solid rgba(255,255,255,0.14)',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#e2e8f0', boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>SILTRI</span>
          <span style={{ fontSize: 10, color: '#888', marginLeft: 10 }}>Skill × Investigation × Live Intel</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && <span style={{ fontSize: 10, color: '#888' }}>loading…</span>}
          {lastUpdated && <span style={{ fontSize: 10, color: '#555' }}>{lastUpdated.toLocaleTimeString()}</span>}
          <button onClick={toggle} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexWrap: 'wrap' }}>
        {STATE_ORDER.map(s => (
          <div key={s} style={TILE}>
            <div style={{ ...LABEL, color: STATE_COLOR[s] }}>{s}</div>
            <div style={{ ...VAL, color: STATE_COLOR[s] }}>{counts[s] ?? 0}</div>
          </div>
        ))}
        <div style={TILE}>
          <div style={LABEL}>SKILLS</div>
          <div style={VAL}>{total}</div>
        </div>
        <div style={TILE}>
          <div style={LABEL}>INVEST</div>
          <div style={VAL}>{investigations.length}</div>
        </div>
        <div style={TILE}>
          <div style={LABEL}>LIVE</div>
          <div style={VAL}>{liveItems.length}</div>
        </div>
      </div>

      {/* Coverage bar */}
      <div style={{ margin: '0 14px 8px', height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex', background: 'rgba(255,255,255,0.06)' }}>
        {STATE_ORDER.map(s => (
          <div key={s} style={{ width: `${pct(s)}%`, background: STATE_COLOR[s], transition: 'width 0.4s' }} title={`${s}: ${pct(s)}%`} />
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 14px 8px', flexWrap: 'wrap' }}>
        {['ALL', ...STATE_ORDER].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            background: filter === s ? (STATE_COLOR[s] ?? 'rgba(255,255,255,0.18)') : 'rgba(255,255,255,0.06)',
            border: `1px solid ${filter === s ? (STATE_COLOR[s] ?? '#888') : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 4, color: filter === s ? '#000' : '#aaa', fontSize: 10,
            padding: '3px 8px', cursor: 'pointer', fontFamily: 'monospace',
          }}>
            {s}{s !== 'ALL' ? ` (${counts[s] ?? 0})` : ` (${total})`}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 14px 8px' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter by skill or category…"
          style={{
            width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)', borderRadius: 5, color: '#e2e8f0',
            fontFamily: 'monospace', fontSize: 11, padding: '5px 10px', outline: 'none',
          }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px' }}>
        {visible.length === 0 && (
          <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: 24 }}>
            {loading ? 'Loading…' : 'No skills match the current filter.'}
          </div>
        )}
        {visible.map(r => (
          <div key={r.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '6px 10px', marginBottom: 4,
            background: 'rgba(255,255,255,0.04)', borderRadius: 5,
            border: `1px solid ${STATE_COLOR[r.state]}22`,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
              <div style={{ fontSize: 10, color: '#666', marginTop: 1 }}>{r.category}{r.version ? ` · v${r.version}` : ''}</div>
            </div>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 3,
              background: `${STATE_COLOR[r.state]}22`, color: STATE_COLOR[r.state],
              border: `1px solid ${STATE_COLOR[r.state]}44`, whiteSpace: 'nowrap', marginLeft: 8,
            }}>
              {r.state}
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <button onClick={load} disabled={loading} style={{
          background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)',
          borderRadius: 5, color: '#e2e8f0', fontFamily: 'monospace', fontSize: 11,
          padding: '5px 14px', cursor: loading ? 'not-allowed' : 'pointer',
        }}>
          REFRESH
        </button>
        <button onClick={assess} disabled={assessing} style={{
          background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.3)',
          borderRadius: 5, color: '#22d3ee', fontFamily: 'monospace', fontSize: 11,
          padding: '5px 14px', cursor: assessing ? 'not-allowed' : 'pointer',
        }}>
          {assessing ? 'ASSESSING…' : 'ASSESS'}
        </button>
        <span style={{ fontSize: 10, color: '#444', marginLeft: 'auto', alignSelf: 'center' }}>
          auto-refresh 60s · {visible.length}/{total} visible
        </span>
      </div>
    </div>
  );
}
