import { useState, useEffect, useRef, useCallback } from 'react';

const API = window.__JARVIS_API__ || '';
const API_KEY = window.__JARVIS_API_KEY__ || 'dev-key';
const POLL_MS = 90000;

const COV = {
  FULLY_MAPPED:  'FULLY_MAPPED',
  SWARM_LINKED:  'SWARM_LINKED',
  NODE_ALIGNED:  'NODE_ALIGNED',
  DARK:          'DARK',
};

const COV_COLOUR = {
  FULLY_MAPPED:  '#00ffcc',
  SWARM_LINKED:  '#c084fc',
  NODE_ALIGNED:  '#7bd4ff',
  DARK:          '#ff4455',
};

const COV_LABEL = {
  FULLY_MAPPED:  '◈ FULLY MAPPED',
  SWARM_LINKED:  '◈ SWARM LINKED',
  NODE_ALIGNED:  '◈ NODE ALIGNED',
  DARK:          '◈ DARK',
};

function tok(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(aTokens, bSet) {
  if (!aTokens.length || !bSet.size) return 0;
  return aTokens.filter(t => bSet.has(t)).length / Math.max(aTokens.length, bSet.size);
}

const THRESHOLD = 0.06;

function normaliseArray(raw, ...keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (raw && Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function classify(contactTokens, swarmJobs, centralityNodes) {
  const swarmSet = new Set(
    swarmJobs.flatMap(j =>
      tok((j.name || '') + ' ' + (j.description || '') + ' ' + (j.target || '') + ' ' + (j.tags || []).join(' '))
    )
  );
  const nodeSet = new Set(
    centralityNodes.flatMap(n =>
      tok((n.id || '') + ' ' + (n.label || '') + ' ' + (n.name || '') + ' ' + (n.type || ''))
    )
  );
  const swScore = matchScore(contactTokens, swarmSet);
  const ndScore = matchScore(contactTokens, nodeSet);
  const hasSwarm = swScore >= THRESHOLD;
  const hasNode  = ndScore >= THRESHOLD;
  let cov;
  if (hasSwarm && hasNode) cov = COV.FULLY_MAPPED;
  else if (hasSwarm)       cov = COV.SWARM_LINKED;
  else if (hasNode)        cov = COV.NODE_ALIGNED;
  else                     cov = COV.DARK;
  return { cov, swScore, ndScore };
}

async function fetchAll() {
  const h = { Authorization: `Bearer ${API_KEY}` };
  const [cRes, sRes, gRes] = await Promise.all([
    fetch(`${API}/entities/Contact`, { headers: h }),
    fetch(`${API}/entities/SwarmJob`, { headers: h }),
    fetch(`${API}/v1/graph/centrality`, { headers: h }),
  ]);
  const [cRaw, sRaw, gRaw] = await Promise.all([
    cRes.ok ? cRes.json() : {},
    sRes.ok ? sRes.json() : {},
    gRes.ok ? gRes.json() : {},
  ]);
  const contacts      = normaliseArray(cRaw, 'items', 'data', 'results', 'contacts');
  const swarmJobs     = normaliseArray(sRaw, 'items', 'data', 'results', 'jobs');
  const centralityRaw = normaliseArray(gRaw, 'nodes', 'items', 'data', 'results');
  return { contacts, swarmJobs, centralityNodes: centralityRaw };
}

const CSJGC_RE = /\b(csjgc|contact[._-]?swarm[._-]?centrality|swarm[._-]?centrality[._-]?coverage|cscc|contact[._-]?graph[._-]?centrality)\b/i;
export function isCsjgcQuery(t) { return CSJGC_RE.test(t || ''); }

export async function buildCsjgcScript() {
  try {
    const { contacts, swarmJobs, centralityNodes } = await fetchAll();
    const rows = contacts.map(c => {
      const ct = tok((c.name || '') + ' ' + (c.email || '') + ' ' + (c.role || '') + ' ' + (c.organisation || ''));
      const { cov } = classify(ct, swarmJobs, centralityNodes);
      return cov;
    });
    const counts = Object.fromEntries(Object.values(COV).map(k => [k, 0]));
    rows.forEach(r => counts[r]++);
    const pct = v => contacts.length ? Math.round(100 * v / contacts.length) : 0;
    return (
      `Contact × Swarm × Centrality triple coverage: ` +
      `${counts[COV.FULLY_MAPPED]} fully mapped (${pct(counts[COV.FULLY_MAPPED])}%), ` +
      `${counts[COV.SWARM_LINKED]} swarm-linked (${pct(counts[COV.SWARM_LINKED])}%), ` +
      `${counts[COV.NODE_ALIGNED]} node-aligned (${pct(counts[COV.NODE_ALIGNED])}%), ` +
      `${counts[COV.DARK]} dark (${pct(counts[COV.DARK])}%). ` +
      `${swarmJobs.length} active swarm jobs, ${centralityNodes.length} centrality nodes indexed.`
    );
  } catch (e) {
    return `CSJGC coverage unavailable: ${e.message}`;
  }
}

const S = {
  wrap:   { position: 'fixed', left: 880080, bottom: 8, zIndex: 580, fontFamily: "'JetBrains Mono',monospace" },
  btn:    { background: 'rgba(0,0,0,0.82)', border: '1px solid #c084fc', color: '#c084fc', padding: '2px 9px', fontSize: 10, letterSpacing: 1, cursor: 'pointer', borderRadius: 3, userSelect: 'none' },
  panel:  { position: 'fixed', left: 880080, bottom: 36, zIndex: 580, width: 360, maxHeight: 520, background: 'rgba(10,0,20,0.97)', border: '1px solid #c084fc', borderRadius: 6, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  hdr:    { padding: '6px 10px', borderBottom: '1px solid rgba(192,132,252,0.25)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title:  { color: '#c084fc', fontSize: 10, letterSpacing: 2, fontWeight: 700 },
  body:   { flex: 1, overflowY: 'auto', padding: '6px 0' },
  row:    { padding: '5px 10px', borderBottom: '1px solid rgba(192,132,252,0.08)', display: 'flex', flexDirection: 'column', gap: 2 },
  name:   { color: '#e2e8f0', fontSize: 10, letterSpacing: 1 },
  meta:   { display: 'flex', gap: 6, alignItems: 'center' },
  badge:  (cov) => ({ color: COV_COLOUR[cov], fontSize: 9, letterSpacing: 1 }),
  bar:    (score, colour) => ({ width: `${Math.round(score * 100)}%`, height: 2, background: colour, borderRadius: 1, minWidth: 2 }),
  barWrap:{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 2 },
  barLbl: { color: '#64748b', fontSize: 8, minWidth: 22 },
  barOuter:{ flex: 1, background: 'rgba(255,255,255,0.07)', height: 2, borderRadius: 1 },
  tabs:   { display: 'flex', gap: 1, padding: '4px 10px 2px', borderBottom: '1px solid rgba(192,132,252,0.15)' },
  tab:    (active) => ({ background: active ? 'rgba(192,132,252,0.18)' : 'transparent', border: active ? '1px solid #c084fc' : '1px solid transparent', color: active ? '#c084fc' : '#64748b', fontSize: 9, letterSpacing: 1, padding: '1px 6px', borderRadius: 2, cursor: 'pointer' }),
  search: { margin: '4px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(192,132,252,0.2)', color: '#e2e8f0', fontSize: 10, padding: '3px 6px', borderRadius: 3, width: 'calc(100% - 20px)', boxSizing: 'border-box' },
  assess: { margin: '4px 10px 6px', background: 'rgba(192,132,252,0.12)', border: '1px solid #c084fc', color: '#c084fc', fontSize: 9, padding: '3px 8px', letterSpacing: 1, cursor: 'pointer', borderRadius: 3, width: 'calc(100% - 20px)' },
  footer: { padding: '3px 10px', borderTop: '1px solid rgba(192,132,252,0.15)', color: '#475569', fontSize: 8, letterSpacing: 1 },
  err:    { color: '#ff4455', fontSize: 9, padding: 10 },
  loading:{ color: '#c084fc', fontSize: 9, padding: 10, letterSpacing: 2 },
};

const TABS = ['ALL', ...Object.values(COV)];

export default function ContactSwarmCentralityTriple() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState(null);
  const [tab, setTab]         = useState('ALL');
  const [q, setQ]             = useState('');
  const [assessing, setAssessing] = useState(false);
  const [lastTs, setLastTs]   = useState(null);
  const timerRef              = useRef(null);
  const pollRef               = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { contacts, swarmJobs, centralityNodes } = await fetchAll();
      const classified = contacts.map(c => {
        const ct = tok((c.name || '') + ' ' + (c.email || '') + ' ' + (c.role || '') + ' ' + (c.organisation || ''));
        const { cov, swScore, ndScore } = classify(ct, swarmJobs, centralityNodes);
        return { id: c.id || c.name || String(Math.random()), name: c.name || c.email || '(unnamed)', email: c.email || '', role: c.role || '', cov, swScore, ndScore };
      });
      setRows(classified);
      setLastTs(new Date().toISOString().slice(11, 19) + 'Z');
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:csjgc-toggle', h);
    return () => window.removeEventListener('jarvis:csjgc-toggle', h);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    pollRef.current = setInterval(load, POLL_MS);
    return () => { clearInterval(pollRef.current); };
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: 'Briefly assess contact × swarm-job × graph-centrality coverage. What are the top gaps and next actions?' }),
      });
      const d = await r.json();
      const text = d.response || d.answer || d.message || d.content || JSON.stringify(d);
      try {
        const tRes = await fetch(`${API}/v1/voice/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text }),
        });
        if (tRes.ok) {
          const blob = await tRes.blob();
          const url = URL.createObjectURL(blob);
          window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { url, text } }));
        }
      } catch { /* tts optional */ }
    } catch (e) {
      setErr(e.message);
    } finally {
      setAssessing(false);
    }
  }, [assessing]);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cov !== tab) return false;
    if (q) {
      const lq = q.toLowerCase();
      return r.name.toLowerCase().includes(lq) || r.email.toLowerCase().includes(lq) || r.role.toLowerCase().includes(lq);
    }
    return true;
  });

  const darkCount = rows.filter(r => r.cov === COV.DARK).length;

  if (!open) {
    return (
      <div style={S.wrap}>
        <button style={S.btn} onClick={() => setOpen(true)}>
          ◈ CSJGC{darkCount > 0 ? ` [${darkCount}]` : ''}
        </button>
      </div>
    );
  }

  return (
    <div style={S.panel}>
      <div style={S.hdr}>
        <span style={S.title}>CONTACT × SWARM × CENTRALITY</span>
        <button style={{ ...S.btn, fontSize: 9 }} onClick={() => setOpen(false)}>✕</button>
      </div>
      <div style={S.tabs}>
        {TABS.map(t => (
          <button key={t} style={S.tab(tab === t)} onClick={() => setTab(t)}>
            {t === 'ALL' ? 'ALL' : COV_LABEL[t].replace('◈ ', '')}
            {t === COV.DARK && darkCount > 0 ? ` [${darkCount}]` : ''}
          </button>
        ))}
      </div>
      <input
        style={S.search}
        placeholder="filter contacts…"
        value={q}
        onChange={e => setQ(e.target.value)}
      />
      <div style={S.body}>
        {loading && <div style={S.loading}>◌ LOADING…</div>}
        {err && <div style={S.err}>⚠ {err}</div>}
        {!loading && !err && visible.map(r => (
          <div key={r.id} style={S.row}>
            <div style={S.name}>{r.name}{r.role ? ` · ${r.role}` : ''}</div>
            <div style={S.meta}>
              <span style={S.badge(r.cov)}>{COV_LABEL[r.cov]}</span>
            </div>
            <div style={S.barWrap}>
              <span style={S.barLbl}>SW</span>
              <div style={S.barOuter}>
                <div style={S.bar(r.swScore, COV_COLOUR.SWARM_LINKED)} />
              </div>
              <span style={S.barLbl}>ND</span>
              <div style={S.barOuter}>
                <div style={S.bar(r.ndScore, COV_COLOUR.NODE_ALIGNED)} />
              </div>
            </div>
          </div>
        ))}
        {!loading && !err && visible.length === 0 && (
          <div style={{ color: '#64748b', fontSize: 9, padding: 10 }}>no contacts match</div>
        )}
      </div>
      <button style={S.assess} onClick={assess} disabled={assessing}>
        {assessing ? '◌ ASSESSING…' : '▶ ASSESS COVERAGE'}
      </button>
      <div style={S.footer}>
        {lastTs ? `updated ${lastTs} · ${rows.length} contacts · poll 90s` : 'awaiting data'}
      </div>
    </div>
  );
}
