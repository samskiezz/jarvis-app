import { useState, useEffect, useCallback } from 'react';

const API = '';

const LSCOV_RE = /\b(lscov|live[._-]?intel[._-]?swarm[._-]?contact|live[._-]?swarm[._-]?contact|world[._-]?swarm[._-]?contact|live[._-]?intel[._-]?contact[._-]?swarm|live[._-]?intel[._-]?coverage|swarm[._-]?live[._-]?contact|contact[._-]?swarm[._-]?live)\b/i;

export function isLscovQuery(t) {
  return LSCOV_RE.test(t || '');
}

function normaliseLiveIntel(raw) {
  if (!raw) return [];
  const events = [];
  const r = raw || {};
  const quakes = Array.isArray(r.earthquakes) ? r.earthquakes : [];
  quakes.forEach((q, i) => {
    events.push({
      id:   `q${i}`,
      name: q.place || q.location || `Earthquake ${i + 1}`,
      type: 'SEISMIC',
      mag:  q.magnitude != null ? `M${q.magnitude}` : '',
      desc: String(q.place || q.description || '').slice(0, 200),
      tags: `earthquake seismic ${q.place || ''} ${q.region || ''}`,
    });
  });
  const cryptos = Array.isArray(r.crypto) ? r.crypto : [];
  cryptos.forEach((c, i) => {
    events.push({
      id:   `c${i}`,
      name: c.symbol || c.name || `Crypto ${i + 1}`,
      type: 'CRYPTO',
      mag:  c.change_24h != null ? `${c.change_24h > 0 ? '+' : ''}${c.change_24h?.toFixed(2)}%` : '',
      desc: String(c.symbol || c.name || '').slice(0, 200),
      tags: `crypto finance market ${c.symbol || ''} ${c.name || ''}`,
    });
  });
  const fx = Array.isArray(r.fx) ? r.fx : [];
  fx.forEach((f, i) => {
    events.push({
      id:   `f${i}`,
      name: f.pair || f.symbol || `FX ${i + 1}`,
      type: 'FX',
      mag:  f.rate != null ? String(f.rate) : '',
      desc: String(f.pair || f.symbol || '').slice(0, 200),
      tags: `forex fx currency ${f.pair || ''} ${f.base || ''} ${f.quote || ''}`,
    });
  });
  return events;
}

function normaliseSwarmJobs(raw) {
  if (!raw) return [];
  const arr = ['swarm_jobs', 'jobs', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((j, i) => ({
    id:     j.id || String(i),
    name:   j.name || j.title || j.label || `Job ${i + 1}`,
    kind:   j.kind || j.type || j.category || '',
    status: j.status || j.state || '',
    desc:   String(j.description || j.summary || j.objective || '').slice(0, 200),
    tags:   Array.isArray(j.tags) ? j.tags.join(' ') : (j.tags || ''),
    domain: j.domain || j.target || '',
  }));
}

function normaliseContacts(raw) {
  if (!raw) return [];
  const arr = ['contacts', 'items', 'results', 'data', 'records', 'people'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((c, i) => ({
    id:    c.id || String(i),
    name:  c.name || c.full_name || c.fullName || `Contact ${i + 1}`,
    title: c.title || c.role || c.position || '',
    org:   c.company || c.organisation || c.organization || c.org || '',
    desc:  String(c.description || c.bio || c.notes || '').slice(0, 200),
    tags:  Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(evToks, other) {
  const otherToks = [
    ...tokens(other.name),
    ...tokens(other.kind || other.title || other.category || ''),
    ...tokens(other.status || other.priority || ''),
    ...tokens(other.desc || other.summary || ''),
    ...tokens(other.tags || ''),
    ...tokens(other.org || other.domain || ''),
  ].filter(Boolean);
  if (!evToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (evToks.has(t)) hits++;
  return hits / Math.max(evToks.size, otherToks.length);
}

function correlate(events, jobs, contacts) {
  return events.map(ev => {
    const toks = new Set([
      ...tokens(ev.name),
      ...tokens(ev.type),
      ...tokens(ev.desc),
      ...tokens(ev.tags),
    ].filter(Boolean));

    const matchedJobs = jobs
      .map(j => ({ ...j, _score: matchScore(toks, j) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedContacts = contacts
      .map(c => ({ ...c, _score: matchScore(toks, c) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasJob     = matchedJobs.length > 0;
    const hasContact = matchedContacts.length > 0;

    let coverage;
    if (hasJob && hasContact)  coverage = 'FULLY TRACKED';
    else if (hasJob)           coverage = 'AUTOMATED';
    else if (hasContact)       coverage = 'HUMAN-MONITORED';
    else                       coverage = 'UNMONITORED';

    return { ...ev, _jobs: matchedJobs, _contacts: matchedContacts, _coverage: coverage };
  });
}

export async function buildLscovScript() {
  const [liR, sjR, cR] = await Promise.allSettled([
    fetch(`${API}/functions/getLiveIntel`).then(r => r.json()),
    fetch(`${API}/entities/SwarmJob`).then(r => r.json()),
    fetch(`${API}/entities/Contact`).then(r => r.json()),
  ]);
  const events   = normaliseLiveIntel(liR.status === 'fulfilled' ? liR.value : null);
  const jobs     = normaliseSwarmJobs(sjR.status === 'fulfilled' ? sjR.value : []);
  const contacts = normaliseContacts(cR.status  === 'fulfilled' ? cR.value : []);
  const enriched = correlate(events, jobs, contacts);
  const ft = enriched.filter(e => e._coverage === 'FULLY TRACKED').length;
  const au = enriched.filter(e => e._coverage === 'AUTOMATED').length;
  const hm = enriched.filter(e => e._coverage === 'HUMAN-MONITORED').length;
  const un = enriched.filter(e => e._coverage === 'UNMONITORED').length;
  return (
    `Live Intel × SwarmJob × Contact Triple Coverage: ${events.length} live world events (quakes/crypto/FX) ` +
    `cross-referenced against ${jobs.length} swarm jobs and ${contacts.length} contacts. ` +
    `${ft} FULLY TRACKED (swarm-automated + contact-owned); ` +
    `${au} AUTOMATED (swarm job found, no contact alignment); ` +
    `${hm} HUMAN-MONITORED (contact match, no swarm automation); ` +
    `${un} UNMONITORED (no swarm or contact coverage — live event with no response capability). ` +
    `Top unmonitored: ${enriched.filter(e => e._coverage === 'UNMONITORED').slice(0, 3).map(e => `${e.name}(${e.type})`).join(', ') || 'none'}.`
  );
}

const PANEL_W = 700;
const PANEL_H = 620;
const CY = '#00CFFF';
const LM = '#A3E635';
const AM = '#F59E0B';
const RD = '#EF4444';

const TYPE_COLOR = { SEISMIC: '#EF4444', CRYPTO: '#A3E635', FX: '#00CFFF' };

const COVERAGE_COLOR = {
  'FULLY TRACKED':    CY,
  'AUTOMATED':        LM,
  'HUMAN-MONITORED':  AM,
  'UNMONITORED':      '#555',
};

const chip = (label, color = CY) => (
  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: color + '22', color, border: `1px solid ${color}55`, marginLeft: 4, whiteSpace: 'nowrap' }}>
    {label}
  </span>
);

const ScoreBar = ({ score, color }) => (
  <div style={{ height: 3, width: '100%', background: '#1a1a2a', borderRadius: 2, marginTop: 2 }}>
    <div style={{ height: 3, width: `${Math.round(score * 100)}%`, background: color, borderRadius: 2, transition: 'width .4s' }} />
  </div>
);

const TABS = ['ALL', 'FULLY TRACKED', 'AUTOMATED', 'HUMAN-MONITORED', 'UNMONITORED'];

export default function LiveIntelSwarmContactCoverage() {
  const [open, setOpen]         = useState(false);
  const [events, setEvents]     = useState([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const [err, setErr]           = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [liR, sjR, cR] = await Promise.allSettled([
        fetch(`${API}/functions/getLiveIntel`).then(r => r.json()),
        fetch(`${API}/entities/SwarmJob`).then(r => r.json()),
        fetch(`${API}/entities/Contact`).then(r => r.json()),
      ]);
      const raw_ev = normaliseLiveIntel(liR.status === 'fulfilled' ? liR.value : null);
      const raw_sj = normaliseSwarmJobs(sjR.status === 'fulfilled' ? sjR.value : []);
      const raw_c  = normaliseContacts(cR.status  === 'fulfilled' ? cR.value : []);
      setEvents(correlate(raw_ev, raw_sj, raw_c));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:lscov-toggle', toggle);
    return () => window.removeEventListener('jarvis:lscov-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessText('');
    try {
      const brief = await buildLscovScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Live Intel × SwarmJob × Contact coverage: ${brief}. Give a 2-sentence assessment of live-event response capability, highlighting the most critical unmonitored events.` }),
      });
      const d = await r.json();
      const msg = d.response || d.message || d.content || brief;
      setAssessText(msg);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: msg } }));
    } catch (e) {
      setAssessText(String(e));
    } finally {
      setAssessing(false);
    }
  }, []);

  if (!open) {
    const unmonitored = events.filter(e => e._coverage === 'UNMONITORED').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Live Intel × SwarmJob × Contact Triple Coverage (LSCOV)"
        style={{
          position: 'fixed', left: 743440, bottom: 8, zIndex: 356,
          background: unmonitored > 0 ? '#00CFFF22' : '#0a0a1a',
          border: `1px solid ${unmonitored > 0 ? CY : CY + '44'}`,
          color: CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ LSCOV{unmonitored > 0 ? ` ⚠${unmonitored}` : ''}
      </button>
    );
  }

  const ft = events.filter(e => e._coverage === 'FULLY TRACKED').length;
  const au = events.filter(e => e._coverage === 'AUTOMATED').length;
  const hm = events.filter(e => e._coverage === 'HUMAN-MONITORED').length;
  const un = events.filter(e => e._coverage === 'UNMONITORED').length;

  const visible = events.filter(e =>
    (tab === 'ALL' || e._coverage === tab) &&
    (!search || e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.type.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #00CFFF33', borderRadius: 8,
      zIndex: 6001, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #00CFFF18',
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ LIVE INTEL × SWARM × CONTACT COVERAGE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>LSCOV</span>
        {un > 0 && <span style={{ fontSize: 10, color: CY, background: CY + '22', border: `1px solid ${CY}55`, borderRadius: 3, padding: '1px 5px' }}>⚠ {un} UNMONITORED</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['LIVE EVENTS',      events.length, CY],
          ['FULLY TRACKED',    ft,            CY],
          ['AUTOMATED',        au,            LM],
          ['HUMAN-MONITORED',  hm,            AM],
          ['UNMONITORED',      un,            '#888'],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: '1 1 80px', minWidth: 70, background: '#08080e', border: `1px solid ${color}33`, borderRadius: 5, padding: '5px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: '#111', display: 'flex' }}>
          {events.length > 0 && [
            [ft, CY], [au, LM], [hm, AM], [un, '#444']
          ].map(([v, c], i) => (
            v > 0 ? <div key={i} style={{ flex: v, background: c, transition: 'flex .4s' }} /> : null
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '2px 8px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
            background: tab === t ? (COVERAGE_COLOR[t] || CY) + '33' : '#0a0a1a',
            border: `1px solid ${tab === t ? (COVERAGE_COLOR[t] || CY) : '#333'}`,
            color: tab === t ? (COVERAGE_COLOR[t] || CY) : '#888',
          }}>{t}{t !== 'ALL' ? ` (${events.filter(e => e._coverage === t).length})` : ''}</button>
        ))}
      </div>

      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search live events…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: AM, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No events match filter.</div>}
        {visible.map(ev => {
          const color = COVERAGE_COLOR[ev._coverage] || CY;
          const tcolor = TYPE_COLOR[ev.type] || '#888';
          const isExp = expanded === ev.id;
          return (
            <div key={ev.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : ev.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.name}</span>
                {ev.type && chip(ev.type, tcolor)}
                {ev.mag && chip(ev.mag, tcolor + '88')}
                {chip(ev._coverage, color)}
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: LM, marginBottom: 4, fontWeight: 600 }}>SWARM JOBS ({ev._jobs.length})</div>
                    {ev._jobs.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No swarm automation</div>
                      : ev._jobs.map(j => (
                        <div key={j.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.name}</span>
                            {j.kind && chip(j.kind, '#888')}
                            {j.status && chip(j.status, j.status === 'running' || j.status === 'active' ? LM : '#888')}
                          </div>
                          <ScoreBar score={j._score} color={LM} />
                        </div>
                      ))
                    }
                  </div>
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: AM, marginBottom: 4, fontWeight: 600 }}>CONTACTS ({ev._contacts.length})</div>
                    {ev._contacts.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No contact alignment</div>
                      : ev._contacts.map(c => (
                        <div key={c.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                            {c.title && chip(c.title, '#888')}
                            {c.org && chip(c.org, AM + '88')}
                          </div>
                          <ScoreBar score={c._score} color={AM} />
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ padding: '6px 12px', borderTop: '1px solid #00CFFF22', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <button onClick={load} disabled={loading} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: '#0a0a1a', border: '1px solid #00CFFF44', color: CY, cursor: 'pointer' }}>
          {loading ? '…' : '↻ REFRESH'}
        </button>
        <button onClick={assess} disabled={assessing} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: assessing ? '#1a1a2a' : CY + '22', border: `1px solid ${CY}55`, color: CY, cursor: 'pointer' }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        {assessText && (
          <span style={{ fontSize: 9, color: '#aaa', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assessText}</span>
        )}
      </div>
    </div>
  );
}
