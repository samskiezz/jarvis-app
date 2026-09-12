import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SCENE_IDS = [
  '01_command_atrium', '02_intelligence_nexus', '03_threat_theatre',
  '04_mission_forge', '05_signals_bridge', '06_synthetic_oracle',
  '07_sovereign_archive', '08_field_operations', '09_crisis_calculus', '10_sentinel_watch',
];

const SCCKCO_RE = /\b(scckco|scene\s+contact\s+knowledge|scene\s+personnel\s+knowledge|scene\s+knowledge\s+contact|cinematic\s+contact\s+knowledge|dark\s+scene\s+contact|informed\s+scene|scene\s+contact\s+kb|scene\s+personnel\s+kb|scene\s+knowledge\s+personnel|cinematic\s+knowledge\s+contact|scene\s+contact\s+intel\s+base)\b/i;
const THRESHOLD = 0.07;

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

function normaliseScenes(rawArr) {
  return rawArr
    .map((raw, i) => {
      if (!raw) return null;
      const id = raw?.id || raw?.scene_id || SCENE_IDS[i] || `scene-${i}`;
      const label = raw?.name || raw?.title || id.replace(/_/g, ' ').replace(/^\d+\s+/, '');
      const description = raw?.description || raw?.summary || '';
      const anchors = Array.isArray(raw?.anchors)
        ? raw.anchors.map(a => typeof a === 'string' ? a : (a?.label || a?.text || '')).join(' ')
        : String(raw?.anchors || '');
      const tags = Array.isArray(raw?.tags) ? raw.tags.join(' ') : String(raw?.tags || '');
      return {
        id,
        label,
        description,
        anchors,
        tags,
        _searchText: [label, description, anchors, tags].filter(Boolean).join(' '),
      };
    })
    .filter(Boolean);
}

function normaliseContacts(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.contacts) ? raw.contacts
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((c, i) => ({
    id: c.id || c._id || `contact-${i}`,
    label: c.name || c.full_name || c.display_name || `Contact ${i + 1}`,
    title: c.title || c.role || c.job_title || '',
    company: c.company || c.organisation || c.org || '',
    description: c.description || c.bio || c.notes || '',
    tags: Array.isArray(c.tags) ? c.tags.join(' ') : String(c.tags || ''),
    _searchText: [c.name, c.full_name, c.email, c.company, c.organisation, c.title, c.role, c.description, c.bio, c.tags].filter(Boolean).join(' '),
  }));
}

function normaliseKnowledge(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.articles) ? raw.articles
    : Array.isArray(raw.knowledge) ? raw.knowledge
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((k, i) => ({
    id: k.id || k._id || `kb-${i}`,
    label: k.title || k.name || k.label || `Article ${i + 1}`,
    category: k.category || k.type || k.kind || '',
    content: k.content || k.body || k.text || k.summary || '',
    tags: Array.isArray(k.tags) ? k.tags.join(' ') : String(k.tags || ''),
    _searchText: [k.title, k.name, k.category, k.type, k.content, k.body, k.summary, k.tags].filter(Boolean).join(' '),
  }));
}

function correlate(scenes, contacts, kbArticles) {
  return scenes.map(scene => {
    const sToks = tok(scene._searchText);
    const matchedContacts = contacts
      .map(c => ({ ...c, score: matchScore(sToks, c._searchText) }))
      .filter(c => c.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const matchedKb = kbArticles
      .map(k => ({ ...k, score: matchScore(sToks, k._searchText) }))
      .filter(k => k.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const hasContact = matchedContacts.length > 0;
    const hasKb = matchedKb.length > 0;
    let coverage;
    if (hasContact && hasKb) coverage = 'FULLY_INFORMED';
    else if (hasContact) coverage = 'CONTACT_LINKED';
    else if (hasKb) coverage = 'KB_BACKED';
    else coverage = 'DARK';
    return { ...scene, matchedContacts, matchedKb, coverage };
  });
}

export function isScckcoQuery(t) {
  return SCCKCO_RE.test(t || '');
}

export async function buildScckcoScript() {
  try {
    const sceneRaws = await Promise.all(
      SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.ok ? r.json() : null))
    );
    const [cRes, kbRes] = await Promise.all([
      fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : []),
    ]);
    const scenes = normaliseScenes(sceneRaws);
    const contacts = normaliseContacts(cRes);
    const kbArticles = normaliseKnowledge(kbRes);
    const correlated = correlate(scenes, contacts, kbArticles);
    const fullyInformed = correlated.filter(s => s.coverage === 'FULLY_INFORMED').length;
    const dark = correlated.filter(s => s.coverage === 'DARK').length;
    return `SCCKCO analysis: ${scenes.length} cinematic scenes cross-referenced against ${contacts.length} contacts and ${kbArticles.length} knowledge base articles. ${fullyInformed} scenes are FULLY INFORMED — both personnel backing and knowledge coverage confirmed. ${dark} scenes are DARK with no contact or knowledge linkage — these represent operational blind spots in the cinematic intelligence grid.`;
  } catch {
    return 'SCCKCO data unavailable — check /v1/cinematic/scene, /entities/Contact, and /knowledge/ endpoints.';
  }
}

const GN = '#00FF9F';
const CY = '#00CFFF';
const IN = '#7B4EFF';
const GR = '#555';

const FILTER_TABS = ['ALL', 'FULLY INFORMED', 'CONTACT LINKED', 'KB BACKED', 'DARK'];
const COV_MAP = {
  'FULLY INFORMED': 'FULLY_INFORMED',
  'CONTACT LINKED': 'CONTACT_LINKED',
  'KB BACKED': 'KB_BACKED',
  'DARK': 'DARK',
};

function ScoreBar({ score, color }) {
  return (
    <div style={{ height: 3, background: '#1A2535', borderRadius: 2, marginTop: 3 }}>
      <div style={{ height: 3, width: `${Math.min(100, Math.round(score * 100))}%`, background: color, borderRadius: 2, transition: 'width 0.3s' }} />
    </div>
  );
}

function Badge({ label, color }) {
  if (!label) return null;
  return (
    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: `${color}22`, color, border: `1px solid ${color}55`, letterSpacing: 1, marginLeft: 4 }}>
      {String(label).toUpperCase().slice(0, 14)}
    </span>
  );
}

export default function SceneContactKnowledgeTriple() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sceneRaws = await Promise.all(
        SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.ok ? r.json() : null))
      );
      const [cRes, kbRes] = await Promise.all([
        fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : []),
      ]);
      const scenes = normaliseScenes(sceneRaws);
      const contacts = normaliseContacts(cRes);
      const kbArticles = normaliseKnowledge(kbRes);
      setData(correlate(scenes, contacts, kbArticles));
    } catch { setData([]); }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => { if (!o) load(); return !o; });
    window.addEventListener('jarvis:scckco-toggle', toggle);
    return () => window.removeEventListener('jarvis:scckco-toggle', toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = data.filter(s => {
    if (filter !== 'ALL' && s.coverage !== COV_MAP[filter]) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!s.label.toLowerCase().includes(q) && !s._searchText.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const counts = {
    fullyInformed: data.filter(s => s.coverage === 'FULLY_INFORMED').length,
    contactLinked: data.filter(s => s.coverage === 'CONTACT_LINKED').length,
    kbBacked: data.filter(s => s.coverage === 'KB_BACKED').length,
    dark: data.filter(s => s.coverage === 'DARK').length,
  };

  const totalContacts = [...new Set(data.flatMap(s => s.matchedContacts.map(c => c.id)))].length;
  const totalKb = [...new Set(data.flatMap(s => s.matchedKb.map(k => k.id)))].length;

  const assess = async () => {
    setAssessing(true); setAssessText('');
    try {
      const script = await buildScckcoScript();
      setAssessText(script);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: script } }));
    } catch { setAssessText('Assessment unavailable.'); }
    setAssessing(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Scene × Contact × Knowledge Triple Coverage"
        style={{
          position: 'fixed', left: 827440, bottom: 8, zIndex: 506,
          background: 'rgba(5,8,13,0.82)', border: `1px solid ${GN}55`,
          color: GN, fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
          letterSpacing: 1.5, padding: '4px 8px', borderRadius: 4, cursor: 'pointer',
          backdropFilter: 'blur(6px)', whiteSpace: 'nowrap',
        }}>
        ◈ SCCKCO
        {counts.fullyInformed > 0 && (
          <span style={{ marginLeft: 5, background: GN, color: '#04060A', borderRadius: 3, padding: '0 4px', fontSize: 8, fontWeight: 700 }}>
            {counts.fullyInformed}
          </span>
        )}
        {counts.dark > 0 && (
          <span style={{ marginLeft: 3, background: '#333', color: '#9EA8B5', borderRadius: 3, padding: '0 4px', fontSize: 8, fontWeight: 700 }}>
            {counts.dark}
          </span>
        )}
      </button>
    );
  }

  const covColor = c =>
    c === 'FULLY_INFORMED' ? GN :
    c === 'CONTACT_LINKED' ? CY :
    c === 'KB_BACKED' ? IN : GR;

  return (
    <div style={{
      position: 'fixed', top: 60, right: 16, zIndex: 506, width: 'min(820px,95vw)',
      maxHeight: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column',
      background: 'rgba(5,10,18,0.97)', border: `1px solid ${GN}44`,
      borderRadius: 10, fontFamily: "'JetBrains Mono',monospace", overflow: 'hidden',
      boxShadow: `0 0 60px ${GN}22`,
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${GN}33`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{ color: GN, fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ SCCKCO</span>
        <span style={{ color: '#6E8AA0', fontSize: 10, flex: 1 }}>Scene × Contact × Knowledge Triple Coverage</span>
        {loading && <span style={{ color: GN, fontSize: 9, animation: 'scckco_pulse 1s infinite' }}>◌ LOADING</span>}
        <button onClick={assess} disabled={assessing} style={{ background: `${GN}22`, border: `1px solid ${GN}55`, color: GN, fontSize: 9, padding: '2px 7px', borderRadius: 3, cursor: 'pointer', letterSpacing: 1 }}>
          {assessing ? '…' : 'ASSESS'}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#6E8AA0', fontSize: 14, cursor: 'pointer', padding: '0 4px' }}>✕</button>
      </div>

      {assessText && (
        <div style={{ padding: '8px 14px', background: `${GN}11`, borderBottom: `1px solid ${GN}22`, fontSize: 10, color: '#DCEBF5', lineHeight: 1.5 }}>
          {assessText}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px', borderBottom: `1px solid ${GN}22`, flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'SCENES', val: data.length, color: '#6E8AA0' },
          { label: 'CONTACTS', val: totalContacts, color: CY },
          { label: 'KB ARTICLES', val: totalKb, color: IN },
          { label: 'INFORMED', val: counts.fullyInformed, color: GN },
          { label: 'CONTACT-LINK', val: counts.contactLinked, color: CY },
          { label: 'KB-BACKED', val: counts.kbBacked, color: IN },
          { label: 'DARK', val: counts.dark, color: GR },
        ].map(s => (
          <div key={s.label} style={{ background: `${s.color}11`, border: `1px solid ${s.color}33`, borderRadius: 4, padding: '4px 8px', textAlign: 'center', minWidth: 64 }}>
            <div style={{ color: s.color, fontSize: 14, fontWeight: 700 }}>{s.val}</div>
            <div style={{ color: '#6E8AA0', fontSize: 8, letterSpacing: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {data.length > 0 && (
        <div style={{ margin: '6px 14px', height: 5, borderRadius: 3, overflow: 'hidden', display: 'flex', flexShrink: 0 }}>
          {[
            { n: counts.fullyInformed, c: GN },
            { n: counts.contactLinked, c: CY },
            { n: counts.kbBacked, c: IN },
            { n: counts.dark, c: '#222' },
          ].map((seg, i) => (
            <div key={i} style={{ flex: seg.n, background: seg.c, minWidth: seg.n ? 2 : 0, transition: 'flex 0.4s' }} />
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 14px', borderBottom: `1px solid ${GN}22`, flexShrink: 0, flexWrap: 'wrap' }}>
        {FILTER_TABS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? `${GN}33` : 'transparent',
            border: `1px solid ${filter === f ? GN : '#2A3A50'}`,
            color: filter === f ? GN : '#6E8AA0', fontSize: 9, padding: '2px 8px', borderRadius: 3, cursor: 'pointer', letterSpacing: 1,
          }}>{f}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)} placeholder="search scenes…"
          style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.04)', border: `1px solid #2A3A50`, color: '#DCEBF5', fontSize: 9, padding: '2px 8px', borderRadius: 3, outline: 'none', width: 130 }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 10px' }}>
        {visible.length === 0 && (
          <div style={{ color: '#6E8AA0', fontSize: 10, textAlign: 'center', padding: 24 }}>
            {loading ? 'Loading…' : 'No scenes match filter.'}
          </div>
        )}
        {visible.map(scene => {
          const isExp = expanded === scene.id;
          const cc = covColor(scene.coverage);
          return (
            <div key={scene.id} style={{ marginBottom: 4, borderRadius: 5, border: `1px solid ${cc}33`, background: `${cc}07`, overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(isExp ? null : scene.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: cc, flexShrink: 0 }} />
                <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{scene.label}</span>
                <Badge label={`${scene.matchedContacts.length}C / ${scene.matchedKb.length}K`} color={cc} />
                <span style={{ fontSize: 8, color: cc, letterSpacing: 1, marginLeft: 4 }}>{scene.coverage.replace(/_/g, ' ')}</span>
                <span style={{ color: '#6E8AA0', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${cc}22` }}>
                  {scene.description && (
                    <div style={{ color: '#6E8AA0', fontSize: 9, marginBottom: 8, lineHeight: 1.4 }}>{scene.description.slice(0, 160)}{scene.description.length > 160 ? '…' : ''}</div>
                  )}
                  <div style={{ display: 'flex', gap: 10 }}>
                    {/* Left: contacts */}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>CONTACTS ({scene.matchedContacts.length})</div>
                      {scene.matchedContacts.length === 0
                        ? <div style={{ color: '#444', fontSize: 9 }}>no contact match</div>
                        : scene.matchedContacts.slice(0, 5).map(c => (
                          <div key={c.id} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ color: '#DCEBF5', fontSize: 9, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
                              {c.title && <Badge label={c.title} color={CY} />}
                            </div>
                            {c.company && <div style={{ color: '#6E8AA0', fontSize: 8, marginTop: 1 }}>{c.company}</div>}
                            <ScoreBar score={c.score} color={CY} />
                          </div>
                        ))}
                    </div>
                    {/* Right: KB articles */}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: IN, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>KB ARTICLES ({scene.matchedKb.length})</div>
                      {scene.matchedKb.length === 0
                        ? <div style={{ color: '#444', fontSize: 9 }}>no knowledge match</div>
                        : scene.matchedKb.slice(0, 5).map(k => (
                          <div key={k.id} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ color: '#DCEBF5', fontSize: 9, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.label}</span>
                              {k.category && <Badge label={k.category} color={IN} />}
                            </div>
                            <ScoreBar score={k.score} color={IN} />
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <style>{`@keyframes scckco_pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
}
