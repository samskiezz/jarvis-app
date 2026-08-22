import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SCENE_IDS = [
  '01_command_atrium', '02_intelligence_nexus', '03_threat_theatre',
  '04_mission_forge', '05_signals_bridge', '06_synthetic_oracle',
  '07_sovereign_archive', '08_field_operations', '09_crisis_calculus', '10_sentinel_watch',
];

const SISC_RE = /\b(sisc|scene\s+investigation\s+skill|scene\s+skill\s+investigation|investigation\s+skill\s+scene|scene\s+case\s+skill|cinematic\s+investigation\s+skill|scene\s+investigation\s+capability|unaddressed\s+scene|scene\s+skill\s+case|scene\s+case\s+capability|investigation\s+capability\s+scene)\b/i;
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
        id, label, description, anchors, tags,
        _searchText: [label, description, anchors, tags].filter(Boolean).join(' '),
      };
    })
    .filter(Boolean);
}

function normaliseInvestigations(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.investigations) ? raw.investigations
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((inv, i) => ({
    id: inv.id || inv._id || `inv-${i}`,
    label: inv.title || inv.name || inv.subject || `Case ${i + 1}`,
    kind: inv.kind || inv.type || inv.category || '',
    status: inv.status || inv.state || '',
    description: inv.description || inv.summary || inv.notes || '',
    tags: Array.isArray(inv.tags) ? inv.tags.join(' ') : String(inv.tags || ''),
    _searchText: [inv.title, inv.name, inv.subject, inv.kind, inv.type, inv.description, inv.summary, inv.tags].filter(Boolean).join(' '),
  }));
}

function normaliseSkills(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.skills) ? raw.skills
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((sk, i) => ({
    id: sk.id || sk._id || `skill-${i}`,
    label: sk.title || sk.name || `Skill ${i + 1}`,
    category: sk.category || sk.type || sk.kind || '',
    domain: sk.domain || sk.area || '',
    description: sk.description || sk.summary || '',
    tags: Array.isArray(sk.tags) ? sk.tags.join(' ') : String(sk.tags || ''),
    _searchText: [sk.name, sk.title, sk.category, sk.domain, sk.description, sk.tags].filter(Boolean).join(' '),
  }));
}

function correlate(scenes, investigations, skills) {
  return scenes.map(scene => {
    const sToks = tok(scene._searchText);
    const matchedInv = investigations
      .map(inv => ({ ...inv, score: matchScore(sToks, inv._searchText) }))
      .filter(inv => inv.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const matchedSkills = skills
      .map(sk => ({ ...sk, score: matchScore(sToks, sk._searchText) }))
      .filter(sk => sk.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const hasInv = matchedInv.length > 0;
    const hasSkill = matchedSkills.length > 0;
    let coverage;
    if (hasInv && hasSkill) coverage = 'FULLY_COVERED';
    else if (hasInv) coverage = 'INVESTIGATED';
    else if (hasSkill) coverage = 'SKILLED';
    else coverage = 'UNADDRESSED';
    return { ...scene, matchedInv, matchedSkills, coverage };
  });
}

export function isSiscQuery(t) {
  return SISC_RE.test(t || '');
}

export async function buildSiscScript() {
  try {
    const sceneRaws = await Promise.all(
      SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.ok ? r.json() : null))
    );
    const [invRes, skillRes] = await Promise.all([
      fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : []),
    ]);
    const scenes = normaliseScenes(sceneRaws);
    const investigations = normaliseInvestigations(invRes);
    const skills = normaliseSkills(skillRes);
    const correlated = correlate(scenes, investigations, skills);
    const fullyCovered = correlated.filter(s => s.coverage === 'FULLY_COVERED').length;
    const unaddressed = correlated.filter(s => s.coverage === 'UNADDRESSED').length;
    return `SISC analysis: ${scenes.length} cinematic scenes cross-referenced against ${investigations.length} open investigations and ${skills.length} JARVIS skills. ${fullyCovered} scenes are FULLY COVERED — both active investigative case and skill capability confirmed. ${unaddressed} scenes are UNADDRESSED with no investigative backing or skill support — these represent operational blind spots requiring immediate case assignment and capability development.`;
  } catch {
    return 'SISC data unavailable — check /v1/cinematic/scene, /v1/investigations, and /v1/aip/skill endpoints.';
  }
}

const RD = '#FF4466';
const AM = '#FFB347';
const LM = '#AAFF66';
const GR = '#555';

const FILTER_TABS = ['ALL', 'FULLY COVERED', 'INVESTIGATED', 'SKILLED', 'UNADDRESSED'];
const COV_MAP = {
  'FULLY COVERED': 'FULLY_COVERED',
  'INVESTIGATED': 'INVESTIGATED',
  'SKILLED': 'SKILLED',
  'UNADDRESSED': 'UNADDRESSED',
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

export default function SceneInvestigationSkillTriple() {
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
      const [invRes, skillRes] = await Promise.all([
        fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : []),
      ]);
      const scenes = normaliseScenes(sceneRaws);
      const investigations = normaliseInvestigations(invRes);
      const skills = normaliseSkills(skillRes);
      setData(correlate(scenes, investigations, skills));
    } catch { setData([]); }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => { if (!o) load(); return !o; });
    window.addEventListener('jarvis:sisc-toggle', toggle);
    return () => window.removeEventListener('jarvis:sisc-toggle', toggle);
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
    fullyCovered: data.filter(s => s.coverage === 'FULLY_COVERED').length,
    investigated: data.filter(s => s.coverage === 'INVESTIGATED').length,
    skilled: data.filter(s => s.coverage === 'SKILLED').length,
    unaddressed: data.filter(s => s.coverage === 'UNADDRESSED').length,
  };

  const totalInv = [...new Set(data.flatMap(s => s.matchedInv.map(i => i.id)))].length;
  const totalSkills = [...new Set(data.flatMap(s => s.matchedSkills.map(sk => sk.id)))].length;

  const assess = async () => {
    setAssessing(true); setAssessText('');
    try {
      const script = await buildSiscScript();
      setAssessText(script);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: script } }));
    } catch { setAssessText('Assessment unavailable.'); }
    setAssessing(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Scene × Investigation × Skill Triple Coverage"
        style={{
          position: 'fixed', left: 828000, bottom: 8, zIndex: 507,
          background: 'rgba(5,8,13,0.82)', border: `1px solid ${RD}55`,
          color: RD, fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
          letterSpacing: 1.5, padding: '4px 8px', borderRadius: 4, cursor: 'pointer',
          backdropFilter: 'blur(6px)', whiteSpace: 'nowrap',
        }}>
        ◈ SISC
        {counts.unaddressed > 0 && (
          <span style={{ marginLeft: 5, background: RD, color: '#04060A', borderRadius: 3, padding: '0 4px', fontSize: 8, fontWeight: 700 }}>
            {counts.unaddressed}
          </span>
        )}
        {counts.fullyCovered > 0 && (
          <span style={{ marginLeft: 3, background: LM, color: '#04060A', borderRadius: 3, padding: '0 4px', fontSize: 8, fontWeight: 700 }}>
            {counts.fullyCovered}
          </span>
        )}
      </button>
    );
  }

  const covColor = c =>
    c === 'FULLY_COVERED' ? LM :
    c === 'INVESTIGATED' ? AM :
    c === 'SKILLED' ? '#29E7FF' : GR;

  return (
    <div style={{
      position: 'fixed', top: 60, right: 16, zIndex: 507, width: 'min(820px,95vw)',
      maxHeight: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column',
      background: 'rgba(5,10,18,0.97)', border: `1px solid ${RD}44`,
      borderRadius: 10, fontFamily: "'JetBrains Mono',monospace", overflow: 'hidden',
      boxShadow: `0 0 60px ${RD}22`,
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${RD}33`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{ color: RD, fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ SISC</span>
        <span style={{ color: '#6E8AA0', fontSize: 10, flex: 1 }}>Scene × Investigation × Skill Triple Coverage</span>
        {loading && <span style={{ color: RD, fontSize: 9, animation: 'sisc_pulse 1s infinite' }}>◌ LOADING</span>}
        <button onClick={assess} disabled={assessing} style={{ background: `${RD}22`, border: `1px solid ${RD}55`, color: RD, fontSize: 9, padding: '2px 7px', borderRadius: 3, cursor: 'pointer', letterSpacing: 1 }}>
          {assessing ? '…' : 'ASSESS'}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#6E8AA0', fontSize: 14, cursor: 'pointer', padding: '0 4px' }}>✕</button>
      </div>

      {assessText && (
        <div style={{ padding: '8px 14px', background: `${RD}11`, borderBottom: `1px solid ${RD}22`, fontSize: 10, color: '#DCEBF5', lineHeight: 1.5 }}>
          {assessText}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px', borderBottom: `1px solid ${RD}22`, flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'SCENES', val: data.length, color: '#6E8AA0' },
          { label: 'CASES', val: totalInv, color: AM },
          { label: 'SKILLS', val: totalSkills, color: '#29E7FF' },
          { label: 'COVERED', val: counts.fullyCovered, color: LM },
          { label: 'INVESTIGATED', val: counts.investigated, color: AM },
          { label: 'SKILLED', val: counts.skilled, color: '#29E7FF' },
          { label: 'UNADDRESSED', val: counts.unaddressed, color: RD },
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
            { n: counts.fullyCovered, c: LM },
            { n: counts.investigated, c: AM },
            { n: counts.skilled, c: '#29E7FF' },
            { n: counts.unaddressed, c: '#2A1520' },
          ].map((seg, i) => (
            <div key={i} style={{ flex: seg.n, background: seg.c, minWidth: seg.n ? 2 : 0, transition: 'flex 0.4s' }} />
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 14px', borderBottom: `1px solid ${RD}22`, flexShrink: 0, flexWrap: 'wrap' }}>
        {FILTER_TABS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? `${RD}33` : 'transparent',
            border: `1px solid ${filter === f ? RD : '#2A3A50'}`,
            color: filter === f ? RD : '#6E8AA0', fontSize: 9, padding: '2px 8px', borderRadius: 3, cursor: 'pointer', letterSpacing: 1,
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
                <Badge label={`${scene.matchedInv.length}I / ${scene.matchedSkills.length}S`} color={cc} />
                <span style={{ fontSize: 8, color: cc, letterSpacing: 1, marginLeft: 4 }}>{scene.coverage.replace(/_/g, ' ')}</span>
                <span style={{ color: '#6E8AA0', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${cc}22` }}>
                  {scene.description && (
                    <div style={{ color: '#6E8AA0', fontSize: 9, marginBottom: 8, lineHeight: 1.4 }}>{scene.description.slice(0, 160)}{scene.description.length > 160 ? '…' : ''}</div>
                  )}
                  <div style={{ display: 'flex', gap: 10 }}>
                    {/* Left: investigations */}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: AM, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>INVESTIGATIONS ({scene.matchedInv.length})</div>
                      {scene.matchedInv.length === 0
                        ? <div style={{ color: '#444', fontSize: 9 }}>no case match</div>
                        : scene.matchedInv.slice(0, 5).map(inv => (
                          <div key={inv.id} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ color: '#DCEBF5', fontSize: 9, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.label}</span>
                              {inv.kind && <Badge label={inv.kind} color={AM} />}
                              {inv.status && <Badge label={inv.status} color='#6E8AA0' />}
                            </div>
                            <ScoreBar score={inv.score} color={AM} />
                          </div>
                        ))}
                    </div>
                    {/* Right: skills */}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#29E7FF', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>SKILLS ({scene.matchedSkills.length})</div>
                      {scene.matchedSkills.length === 0
                        ? <div style={{ color: '#444', fontSize: 9 }}>no skill match</div>
                        : scene.matchedSkills.slice(0, 5).map(sk => (
                          <div key={sk.id} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ color: '#DCEBF5', fontSize: 9, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sk.label}</span>
                              {sk.category && <Badge label={sk.category} color='#29E7FF' />}
                              {sk.domain && <Badge label={sk.domain} color='#7B4EFF' />}
                            </div>
                            <ScoreBar score={sk.score} color='#29E7FF' />
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
      <style>{`@keyframes sisc_pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
}
