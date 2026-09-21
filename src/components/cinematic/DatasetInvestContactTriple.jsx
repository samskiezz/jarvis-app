import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const DICTRI_RE = /\b(dictri|dataset\s+invest(?:igation)?|invest(?:igation)?\s+contact\s+dataset|dataset\s+contact\s+invest(?:igation)?|dark\s+dataset|dataset\s+coverage(?:\s+triple)?|dataset\s+case|dataset\s+person(?:nel)?|investigation\s+dataset\s+contact|contact\s+dataset\s+invest(?:igation)?|fully\s+tracked\s+dataset|case[\s-]linked\s+dataset|person[\s-]linked\s+dataset|dataset\s+intelligence\s+gap|dataset\s+gap|dataset\s+triple)\b/i;
const THRESHOLD = 0.08;

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const fToks = tok(fieldText);
  const fSet = new Set(fToks);
  const hits = toks.filter(t => fSet.has(t)).length;
  return hits / toks.length;
}

function normaliseDatasets(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.datasets || raw.items || raw.data || []);
  return arr.map((d, i) => ({
    id: d.id || d.dataset_id || `ds-${i}`,
    name: d.name || d.title || d.label || `Dataset ${i + 1}`,
    kind: d.kind || d.type || d.category || d.source_type || '',
    description: d.description || d.summary || '',
    tags: Array.isArray(d.tags) ? d.tags.join(' ') : (d.tags || ''),
    schema: d.schema || d.columns || '',
    status: d.status || '',
    _searchText: [d.name, d.title, d.label, d.description, d.summary, d.kind, d.type, d.category, d.tags].filter(Boolean).join(' '),
  }));
}

function normaliseInvestigations(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.investigations || raw.items || raw.data || []);
  return arr.map((inv, i) => ({
    id: inv.id || inv.investigation_id || `inv-${i}`,
    title: inv.title || inv.name || inv.label || `Investigation ${i + 1}`,
    status: inv.status || '',
    type: inv.type || inv.category || '',
    description: inv.description || inv.summary || '',
    subjects: Array.isArray(inv.subjects) ? inv.subjects.join(' ') : (inv.subjects || ''),
    tags: Array.isArray(inv.tags) ? inv.tags.join(' ') : (inv.tags || ''),
    _searchText: [inv.title, inv.name, inv.description, inv.summary, inv.type, inv.category, inv.subjects, inv.tags].filter(Boolean).join(' '),
  }));
}

function normaliseContacts(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.contacts || raw.items || raw.data || []);
  return arr.map((c, i) => ({
    id: c.id || c.contact_id || `ct-${i}`,
    name: c.name || c.full_name || `Contact ${i + 1}`,
    role: c.role || c.title || c.position || '',
    company: c.company || c.organisation || c.org || '',
    description: c.description || c.bio || c.summary || '',
    tags: Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || ''),
    email: c.email || '',
    _searchText: [c.name, c.full_name, c.role, c.title, c.company, c.organisation, c.description, c.bio, c.tags].filter(Boolean).join(' '),
  }));
}

function correlate(datasets, investigations, contacts) {
  return datasets.map(ds => {
    const dsToks = tok(ds._searchText);
    const matchedInvs = investigations
      .map(inv => ({ ...inv, score: matchScore(dsToks, inv._searchText) }))
      .filter(inv => inv.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const matchedCts = contacts
      .map(ct => ({ ...ct, score: matchScore(dsToks, ct._searchText) }))
      .filter(ct => ct.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const hasInv = matchedInvs.length > 0;
    const hasCt = matchedCts.length > 0;
    let coverage;
    if (hasInv && hasCt) coverage = 'FULLY_TRACKED';
    else if (hasInv) coverage = 'CASE_LINKED';
    else if (hasCt) coverage = 'PERSON_LINKED';
    else coverage = 'DARK';
    return { ...ds, matchedInvs, matchedCts, coverage };
  });
}

export function isDictriQuery(t) {
  return DICTRI_RE.test(t || '');
}

export async function buildDictriScript() {
  try {
    const [dsR, invR, ctR] = await Promise.all([
      fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : null),
    ]);
    const rows = correlate(normaliseDatasets(dsR), normaliseInvestigations(invR), normaliseContacts(ctR));
    const dark = rows.filter(r => r.coverage === 'DARK').length;
    const tracked = rows.filter(r => r.coverage === 'FULLY_TRACKED').length;
    return `DICTRI coverage: ${rows.length} datasets assessed — ${tracked} fully tracked (investigation and contact), ${dark} dark (no investigation or contact coverage). ${dark > 0 ? `Priority gap: ${dark} dataset${dark > 1 ? 's have' : ' has'} no case or personnel link — review for intelligence blind spots.` : 'All datasets have either case or personnel coverage.'}`;
  } catch {
    return 'DICTRI: dataset investigation contact coverage data unavailable.';
  }
}

const TABS = ['ALL', 'FULLY TRACKED', 'CASE LINKED', 'PERSON LINKED', 'DARK'];
const TAB_KEY = { 'ALL': null, 'FULLY TRACKED': 'FULLY_TRACKED', 'CASE LINKED': 'CASE_LINKED', 'PERSON LINKED': 'PERSON_LINKED', 'DARK': 'DARK' };

const COVER_COLOR = {
  FULLY_TRACKED: '#22d3ee',
  CASE_LINKED: '#f59e0b',
  PERSON_LINKED: '#818cf8',
  DARK: '#ef4444',
};

const LABEL_MAP = {
  FULLY_TRACKED: 'FULLY TRACKED',
  CASE_LINKED: 'CASE LINKED',
  PERSON_LINKED: 'PERSON LINKED',
  DARK: 'DARK',
};

export default function DatasetInvestContactTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [counts, setCounts] = useState({ total: 0, invs: 0, contacts: 0, tracked: 0, caseLinked: 0, personLinked: 0, dark: 0 });
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [dsR, invR, ctR] = await Promise.all([
        fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : Promise.reject(`datasets ${r.status}`)),
        fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : Promise.reject(`investigations ${r.status}`)),
        fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : Promise.reject(`contacts ${r.status}`)),
      ]);
      const datasets = normaliseDatasets(dsR);
      const investigations = normaliseInvestigations(invR);
      const contacts = normaliseContacts(ctR);
      const correlated = correlate(datasets, investigations, contacts);
      setRows(correlated);
      setCounts({
        total: correlated.length,
        invs: investigations.length,
        contacts: contacts.length,
        tracked: correlated.filter(r => r.coverage === 'FULLY_TRACKED').length,
        caseLinked: correlated.filter(r => r.coverage === 'CASE_LINKED').length,
        personLinked: correlated.filter(r => r.coverage === 'PERSON_LINKED').length,
        dark: correlated.filter(r => r.coverage === 'DARK').length,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.open !== undefined) setOpen(e.detail.open);
      else setOpen(v => !v);
    };
    window.addEventListener('jarvis:dictri-toggle', handler);
    return () => window.removeEventListener('jarvis:dictri-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = rows.filter(r => {
    const tabKey = TAB_KEY[tab];
    if (tabKey && r.coverage !== tabKey) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.name.toLowerCase().includes(s) || r.description.toLowerCase().includes(s) || r.kind.toLowerCase().includes(s);
    }
    return true;
  });

  const total = counts.total || 1;
  const barTracked = (counts.tracked / total * 100).toFixed(1);
  const barCase = (counts.caseLinked / total * 100).toFixed(1);
  const barPerson = (counts.personLinked / total * 100).toFixed(1);
  const barDark = (counts.dark / total * 100).toFixed(1);

  async function assess(row) {
    setAssessing(row.id);
    try {
      const prompt = `Analyse dataset "${row.name}" (kind: ${row.kind || 'unknown'}) for operational intelligence coverage. It is ${LABEL_MAP[row.coverage]}. Matched investigations: ${row.matchedInvs.map(i => i.title).join(', ') || 'none'}. Matched contacts: ${row.matchedCts.map(c => c.name).join(', ') || 'none'}. ${row.coverage === 'DARK' ? 'This dataset has no investigation or contact coverage — identify the intelligence gap and recommend immediate action.' : 'Assess the quality of coverage and any remaining gaps.'} Respond in exactly 2 sentences.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${window.__JARVIS_KEY__ || 'dev-key'}` },
        body: JSON.stringify({ message: prompt }),
      });
      const data = res.ok ? await res.json() : null;
      const text = data?.response || data?.message || data?.content || 'Assessment unavailable.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
      await fetch(`${API}/v1/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    } catch {
      /* silent */
    } finally {
      setAssessing(null);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', left: 820720, bottom: 8, zIndex: 494,
          background: 'rgba(14,20,28,0.82)', border: '1px solid #374151',
          borderRadius: 6, padding: '3px 9px', cursor: 'pointer',
          fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6,
          backdropFilter: 'blur(6px)',
        }}
        title="Dataset × Investigation × Contact Triple Coverage (DICTRI)"
      >
        ◈ DICTRI
        {counts.dark > 0 && (
          <span style={{
            background: '#ef4444', color: '#fff', borderRadius: 8,
            fontSize: 10, padding: '0 5px', fontWeight: 700, lineHeight: '16px',
          }}>{counts.dark}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 44, left: '50%', transform: 'translateX(-50%)',
      width: 880, maxHeight: '78vh', zIndex: 494,
      background: 'rgba(10,14,20,0.97)', border: '1px solid #1e293b',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      boxShadow: '0 8px 40px rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)',
      fontFamily: 'monospace',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: '#22d3ee', fontWeight: 700, fontSize: 13 }}>◈ DICTRI</span>
        <span style={{ color: '#64748b', fontSize: 11, flex: 1 }}>Dataset × Investigation × Contact Triple Coverage</span>
        {loading && <span style={{ color: '#64748b', fontSize: 10 }}>LOADING…</span>}
        <button onClick={load} style={{ background: 'none', border: '1px solid #374151', borderRadius: 4, color: '#64748b', fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>↺</button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexWrap: 'wrap' }}>
        {[
          { label: 'DATASETS', val: counts.total, color: '#94a3b8' },
          { label: 'INVESTIGATIONS', val: counts.invs, color: '#f59e0b' },
          { label: 'CONTACTS', val: counts.contacts, color: '#818cf8' },
          { label: 'FULLY TRACKED', val: counts.tracked, color: '#22d3ee' },
          { label: 'CASE LINKED', val: counts.caseLinked, color: '#f59e0b' },
          { label: 'PERSON LINKED', val: counts.personLinked, color: '#818cf8' },
          { label: 'DARK', val: counts.dark, color: '#ef4444' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'rgba(30,41,59,0.6)', borderRadius: 6, padding: '4px 10px',
            border: `1px solid ${s.color}33`,
          }}>
            <div style={{ fontSize: 9, color: '#475569', letterSpacing: 1 }}>{s.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ margin: '0 14px 8px', height: 6, borderRadius: 3, background: '#1e293b', display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: `${barTracked}%`, background: '#22d3ee', transition: 'width 0.4s' }} />
        <div style={{ width: `${barCase}%`, background: '#f59e0b', transition: 'width 0.4s' }} />
        <div style={{ width: `${barPerson}%`, background: '#818cf8', transition: 'width 0.4s' }} />
        <div style={{ width: `${barDark}%`, background: '#ef4444', transition: 'width 0.4s' }} />
      </div>

      {error && (
        <div style={{ margin: '0 14px 6px', color: '#ef4444', fontSize: 10, background: 'rgba(239,68,68,0.08)', borderRadius: 4, padding: '4px 8px' }}>
          {error}
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 4, padding: '0 14px 8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? 'rgba(34,211,238,0.15)' : 'rgba(30,41,59,0.4)',
            border: `1px solid ${tab === t ? '#22d3ee' : '#374151'}`,
            borderRadius: 4, color: tab === t ? '#22d3ee' : '#64748b',
            fontSize: 10, padding: '2px 8px', cursor: 'pointer',
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search datasets…"
          style={{
            marginLeft: 'auto', background: 'rgba(30,41,59,0.6)', border: '1px solid #374151',
            borderRadius: 4, color: '#cbd5e1', fontSize: 10, padding: '2px 8px', width: 160,
          }}
        />
      </div>

      {/* Row list */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 14px 10px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', fontSize: 11, textAlign: 'center', marginTop: 24 }}>No datasets match current filter.</div>
        )}
        {visible.map(row => (
          <div key={row.id} style={{ marginBottom: 6 }}>
            <div
              onClick={() => setExpanded(expanded === row.id ? null : row.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                background: 'rgba(30,41,59,0.5)', borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${COVER_COLOR[row.coverage]}33`,
              }}
            >
              <span style={{ color: COVER_COLOR[row.coverage], fontSize: 10, fontWeight: 700, minWidth: 96 }}>
                {LABEL_MAP[row.coverage]}
              </span>
              <span style={{ color: '#e2e8f0', fontSize: 11, flex: 1 }}>{row.name}</span>
              {row.kind && <span style={{ color: '#475569', fontSize: 9, background: 'rgba(71,85,105,0.3)', borderRadius: 3, padding: '1px 5px' }}>{row.kind}</span>}
              <span style={{ color: '#64748b', fontSize: 9 }}>
                {row.matchedInvs.length}inv {row.matchedCts.length}ct
              </span>
              <span style={{ color: '#64748b', fontSize: 11 }}>{expanded === row.id ? '▲' : '▼'}</span>
            </div>

            {expanded === row.id && (
              <div style={{ padding: '8px 8px 4px', background: 'rgba(15,23,42,0.6)', borderRadius: '0 0 6px 6px', border: '1px solid #1e293b', borderTop: 'none' }}>
                {row.description && (
                  <div style={{ color: '#64748b', fontSize: 10, marginBottom: 8, fontStyle: 'italic' }}>{row.description.slice(0, 200)}{row.description.length > 200 ? '…' : ''}</div>
                )}
                <div style={{ display: 'flex', gap: 12 }}>
                  {/* Investigations */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#f59e0b', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>INVESTIGATIONS ({row.matchedInvs.length})</div>
                    {row.matchedInvs.length === 0
                      ? <div style={{ color: '#475569', fontSize: 10 }}>No matched investigations.</div>
                      : row.matchedInvs.slice(0, 5).map(inv => (
                        <div key={inv.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(inv.score * 400, 100)}%`, height: '100%', background: '#f59e0b' }} />
                            </div>
                            {inv.status && <span style={{ color: '#64748b', fontSize: 9, background: 'rgba(245,158,11,0.1)', borderRadius: 3, padding: '1px 4px' }}>{inv.status}</span>}
                          </div>
                          <div style={{ color: '#e2e8f0', fontSize: 10 }}>{inv.title}</div>
                        </div>
                      ))
                    }
                  </div>
                  {/* Contacts */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#818cf8', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>CONTACTS ({row.matchedCts.length})</div>
                    {row.matchedCts.length === 0
                      ? <div style={{ color: '#475569', fontSize: 10 }}>No matched contacts.</div>
                      : row.matchedCts.slice(0, 5).map(ct => (
                        <div key={ct.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(ct.score * 400, 100)}%`, height: '100%', background: '#818cf8' }} />
                            </div>
                            {ct.role && <span style={{ color: '#64748b', fontSize: 9, background: 'rgba(129,140,248,0.1)', borderRadius: 3, padding: '1px 4px' }}>{ct.role.slice(0, 16)}</span>}
                          </div>
                          <div style={{ color: '#e2e8f0', fontSize: 10 }}>{ct.name}{ct.company ? ` · ${ct.company}` : ''}</div>
                        </div>
                      ))
                    }
                  </div>
                </div>
                <button
                  onClick={() => assess(row)}
                  disabled={assessing === row.id}
                  style={{
                    marginTop: 8, background: 'rgba(34,211,238,0.1)', border: '1px solid #22d3ee44',
                    borderRadius: 4, color: '#22d3ee', fontSize: 10, padding: '3px 10px', cursor: 'pointer',
                    opacity: assessing === row.id ? 0.5 : 1,
                  }}
                >
                  {assessing === row.id ? 'ASSESSING…' : '⬡ ASSESS'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
