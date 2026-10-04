import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SCENE_IDS = [
  '01_command_atrium',
  '02_neural_bridge',
  '03_threat_matrix',
  '04_quantum_core',
  '05_data_vault',
  '06_field_ops',
  '07_comms_hub',
  '08_analytics_grid',
  '09_strategic_ops',
  '10_deep_intel',
];

const SCCOSK_RE = /\b(sccosk|scene[._-]?contact[._-]?skill|scene[._-]?skill[._-]?contact|capable[._-]?scene|scene[._-]?fully[._-]?capable|scene[._-]?staffed[._-]?skilled|scene[._-]?personnel[._-]?skill|scene[._-]?skill[._-]?coverage|scene[._-]?triple[._-]?coverage|skilled[._-]?scene|scene[._-]?unmapped[._-]?triple)\b/i;

export function isSccoskQuery(t) { return SCCOSK_RE.test(t || ''); }

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function anchorTokens(scene) {
  const anchors = scene.anchors || scene.anchor_points || scene.data || [];
  const anchorText = Array.isArray(anchors)
    ? anchors.map(a => `${a.label || a.name || ''} ${a.description || a.value || ''}`).join(' ')
    : '';
  return new Set([
    ...tok(scene.title || ''),
    ...tok(scene.name || ''),
    ...tok(scene.description || ''),
    ...tok(String(scene.id || '')),
    ...tok(anchorText),
  ].filter(Boolean));
}

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'data', 'results', 'records', 'entities']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (typeof raw === 'object') return Object.values(raw).filter(v => v && typeof v === 'object');
  return [];
}

function normContacts(raw) {
  return normaliseArray(raw).map(c => ({
    id:   c.id || c.contact_id || String(Math.random()),
    name: c.name || c.full_name || c.display_name || 'Unnamed',
    role: c.role || c.title || c.position || '',
    org:  c.org || c.organisation || c.organization || c.company || c.department || '',
    desc: c.description || c.bio || c.notes || '',
    tags: [...(c.tags || []), ...(c.labels || [])].map(String),
  }));
}

function normSkills(raw) {
  return normaliseArray(raw).map(s => ({
    id:   s.id || s.skill_id || String(Math.random()),
    name: s.name || s.title || s.skill_name || s.label || 'Unnamed',
    category: s.category || s.type || s.domain || '',
    desc: s.description || s.summary || s.notes || '',
    tags: [...(s.tags || []), ...(s.labels || []), ...(s.keywords || [])].map(String),
  }));
}

function contactTokens(c) {
  return [...tok(c.name), ...tok(c.role), ...tok(c.org), ...tok(c.desc), ...c.tags.flatMap(tok)];
}

function skillTokens(s) {
  return [...tok(s.name), ...tok(s.category), ...tok(s.desc), ...s.tags.flatMap(tok)];
}

function matchScore(sceneToks, itemToks) {
  if (!sceneToks.size || !itemToks.length) return 0;
  let hits = 0;
  for (const t of itemToks) if (sceneToks.has(t)) hits++;
  return hits / Math.max(sceneToks.size, itemToks.length);
}

const THRESHOLD = 0.1;

function correlate(scenes, contacts, skills) {
  return scenes.map(scene => {
    const sToks = anchorTokens(scene);
    const hasContact = contacts.some(c => matchScore(sToks, contactTokens(c)) >= THRESHOLD);
    const hasSkill   = skills.some(s => matchScore(sToks, skillTokens(s)) >= THRESHOLD);

    let state;
    if (hasContact && hasSkill) state = 'FULLY CAPABLE';
    else if (hasContact)        state = 'STAFFED';
    else if (hasSkill)          state = 'SKILLED';
    else                        state = 'UNMAPPED';

    const label = scene.title || scene.name || scene.scene_name || String(scene.id);
    return {
      id:    scene.id,
      label,
      state,
      hasContact,
      hasSkill,
    };
  });
}

export async function buildSccoskScript() {
  const [sceneResults, ctR, skR] = await Promise.allSettled([
    Promise.all(SCENE_IDS.map(id =>
      fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.json()).catch(() => null)
    )),
    fetch(`${API}/entities/Contact`).then(r => r.json()),
    fetch(`${API}/v1/aip/skill`).then(r => r.json()),
  ]);
  const rawScenes = sceneResults.status === 'fulfilled'
    ? sceneResults.value.map((s, i) => s ? { ...s, _id: SCENE_IDS[i] } : { id: SCENE_IDS[i] })
    : SCENE_IDS.map(id => ({ id }));
  const contacts = normContacts(ctR.status === 'fulfilled' ? ctR.value : []);
  const skills   = normSkills(skR.status === 'fulfilled' ? skR.value : []);
  const rows = correlate(rawScenes, contacts, skills);
  const fc  = rows.filter(r => r.state === 'FULLY CAPABLE').length;
  const st  = rows.filter(r => r.state === 'STAFFED').length;
  const sk  = rows.filter(r => r.state === 'SKILLED').length;
  const un  = rows.filter(r => r.state === 'UNMAPPED').length;
  const topUn = rows.filter(r => r.state === 'UNMAPPED').slice(0, 3).map(r => r.label).join(', ') || 'none';
  return (
    `Scene × Contact × Skill Triple Coverage: ${rows.length} cinematic scenes cross-correlated against ` +
    `${contacts.length} contacts and ${skills.length} skills. ` +
    `${fc} scene${fc !== 1 ? 's' : ''} FULLY CAPABLE (personnel and skills both present); ` +
    `${st} STAFFED (contact match only); ` +
    `${sk} SKILLED (skill match only); ` +
    `${un} UNMAPPED (no coverage). ` +
    `Unmapped scenes: ${topUn}.`
  );
}

const STATE_COLOR = {
  'FULLY CAPABLE': '#39FF14',
  'STAFFED':       '#29E7FF',
  'SKILLED':       '#FFD700',
  'UNMAPPED':      '#FF4444',
};

const STATE_ORDER = ['FULLY CAPABLE', 'STAFFED', 'SKILLED', 'UNMAPPED'];

export default function SceneContactSkillTriple() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [filter, setFilter]       = useState('ALL');
  const [search, setSearch]       = useState('');
  const [loading, setLoading]     = useState(false);
  const [assessing, setAssessing] = useState(false);
  const timerRef                  = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sceneResults, ctR, skR] = await Promise.allSettled([
        Promise.all(SCENE_IDS.map(id =>
          fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.json()).catch(() => null)
        )),
        fetch(`${API}/entities/Contact`).then(r => r.json()),
        fetch(`${API}/v1/aip/skill`).then(r => r.json()),
      ]);
      const rawScenes = sceneResults.status === 'fulfilled'
        ? sceneResults.value.map((s, i) => s ? { ...s, _id: SCENE_IDS[i] } : { id: SCENE_IDS[i] })
        : SCENE_IDS.map(id => ({ id }));
      const contacts = normContacts(ctR.status === 'fulfilled' ? ctR.value : []);
      const skills   = normSkills(skR.status === 'fulfilled' ? skR.value : []);
      setRows(correlate(rawScenes, contacts, skills));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:sccosk-toggle', toggle);
    return () => window.removeEventListener('jarvis:sccosk-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 120_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message:
            'Analyse Scene × Contact × Skill triple coverage. Identify unmapped scenes lacking both personnel and skill coverage. ' +
            'Propose concrete staffing or skill-development actions to close the most critical gaps. ' +
            'Return a ranked recommendation list with scene name, gap type, and suggested action.',
        }),
      });
      const data = await res.json();
      const text = data?.response || data?.message || data?.content || JSON.stringify(data);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch {
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', {
        detail: { text: 'Scene Contact Skill assessment unavailable.' },
      }));
    } finally {
      setAssessing(false);
    }
  }, []);

  const counts = STATE_ORDER.reduce((acc, s) => {
    acc[s] = rows.filter(r => r.state === s).length;
    return acc;
  }, {});

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.label.toLowerCase().includes(q) || r.state.toLowerCase().includes(q);
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 761360, zIndex: 388,
          background: 'rgba(10,20,40,0.85)', border: '1px solid #39FF14',
          color: '#39FF14', fontSize: 10, padding: '3px 7px', borderRadius: 4,
          cursor: 'pointer', fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
        title="Scene × Contact × Skill Triple Coverage"
      >
        SCCOSK
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 8, left: 761360, zIndex: 388,
      width: 520, maxHeight: 580,
      background: 'rgba(5,15,30,0.97)', border: '1px solid #39FF14',
      borderRadius: 8, fontFamily: 'monospace', color: '#cce8ff',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', borderBottom: '1px solid rgba(57,255,20,0.25)',
        background: 'rgba(57,255,20,0.07)',
      }}>
        <span style={{ color: '#39FF14', fontWeight: 700, fontSize: 12, letterSpacing: 1 }}>
          SCENE × CONTACT × SKILL
        </span>
        <button onClick={() => setOpen(false)} style={{
          background: 'none', border: 'none', color: '#39FF14', cursor: 'pointer', fontSize: 14,
        }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0 }}>
        {STATE_ORDER.map(s => (
          <div key={s} style={{
            flex: 1, textAlign: 'center', padding: '5px 2px',
            background: 'rgba(255,255,255,0.04)', borderRadius: 5,
            border: `1px solid ${STATE_COLOR[s]}33`,
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: STATE_COLOR[s] }}>
              {counts[s] || 0}
            </div>
            <div style={{ fontSize: 8, color: '#8fb3cc', marginTop: 2 }}>{s}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {rows.length > 0 && (
        <div style={{ padding: '0 12px 8px', flexShrink: 0 }}>
          <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', display: 'flex' }}>
            {STATE_ORDER.map(s => (
              <div key={s} style={{
                flex: counts[s], background: STATE_COLOR[s], opacity: 0.8,
              }} />
            ))}
          </div>
          <div style={{ fontSize: 9, color: '#8fb3cc', marginTop: 3 }}>
            {rows.length} scenes · {counts['FULLY CAPABLE']} fully capable
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 8px', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', ...STATE_ORDER].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            fontSize: 9, padding: '2px 7px', borderRadius: 10, cursor: 'pointer',
            background: filter === f ? '#39FF14' : 'rgba(255,255,255,0.06)',
            color: filter === f ? '#000' : '#8fb3cc',
            border: `1px solid ${filter === f ? '#39FF14' : 'rgba(255,255,255,0.12)'}`,
            fontFamily: 'monospace',
          }}>
            {f === 'ALL' ? `ALL (${rows.length})` : `${f} (${counts[f]})`}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 8px', flexShrink: 0 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search scenes…"
          style={{
            width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(57,255,20,0.2)', color: '#cce8ff',
            borderRadius: 4, padding: '4px 8px', fontSize: 11, fontFamily: 'monospace',
          }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px 8px' }}>
        {loading && (
          <div style={{ color: '#8fb3cc', fontSize: 11, textAlign: 'center', padding: 16 }}>
            Loading scene data…
          </div>
        )}
        {!loading && visible.length === 0 && (
          <div style={{ color: '#8fb3cc', fontSize: 11, textAlign: 'center', padding: 16 }}>
            No scenes match current filter.
          </div>
        )}
        {!loading && visible.map(row => (
          <div key={row.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: STATE_COLOR[row.state],
            }} />
            <div style={{ flex: 1, fontSize: 11, color: '#cce8ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.label}
            </div>
            <div style={{
              fontSize: 9, padding: '1px 5px', borderRadius: 8, flexShrink: 0,
              background: `${STATE_COLOR[row.state]}22`, color: STATE_COLOR[row.state],
              border: `1px solid ${STATE_COLOR[row.state]}44`,
            }}>
              {row.state}
            </div>
          </div>
        ))}
      </div>

      {/* Footer buttons */}
      <div style={{
        display: 'flex', gap: 8, padding: '8px 12px',
        borderTop: '1px solid rgba(57,255,20,0.2)', flexShrink: 0,
      }}>
        <button onClick={load} disabled={loading} style={{
          flex: 1, padding: '5px 0', fontSize: 10, borderRadius: 4, cursor: 'pointer',
          background: 'rgba(57,255,20,0.1)', border: '1px solid #39FF14', color: '#39FF14',
          fontFamily: 'monospace',
        }}>
          {loading ? 'LOADING…' : 'REFRESH'}
        </button>
        <button onClick={assess} disabled={assessing} style={{
          flex: 1, padding: '5px 0', fontSize: 10, borderRadius: 4, cursor: 'pointer',
          background: assessing ? 'rgba(57,255,20,0.05)' : 'rgba(57,255,20,0.15)',
          border: '1px solid #39FF14', color: '#39FF14', fontFamily: 'monospace',
        }}>
          {assessing ? 'ASSESSING…' : 'ASSESS'}
        </button>
      </div>
    </div>
  );
}
