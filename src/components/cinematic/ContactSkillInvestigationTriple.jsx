import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const CASITRI_RE = /\b(casitri|contact\s+skill\s+invest(?:igation)?|contact\s+aip\s+invest(?:igation)?|contact\s+invest(?:igation)?\s+skill|contact\s+invest(?:igation)?\s+aip|skill\s+invest(?:igation)?\s+contact|blind\s+contact\s+skill|tracked\s+contact\s+skill|contact\s+capability\s+invest(?:igation)?|contact\s+case\s+skill|skilled\s+contact\s+invest(?:igation)?|contact\s+skill\s+case)\b/i;
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

function normaliseContacts(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.contacts) ? raw.contacts
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((c, i) => ({
    id: c.id || c._id || `con-${i}`,
    label: c.name || c.full_name || c.display_name || `Contact ${i + 1}`,
    role: c.role || c.title || c.position || '',
    company: c.company || c.organization || c.org || '',
    description: c.description || c.notes || c.bio || c.summary || '',
    tags: Array.isArray(c.tags) ? c.tags.join(' ') : String(c.tags || ''),
    _searchText: [c.name, c.full_name, c.display_name, c.role, c.title, c.company, c.organization, c.description, c.notes, c.bio, c.tags].filter(Boolean).join(' '),
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
  return arr.map((s, i) => ({
    id: s.id || s._id || `sk-${i}`,
    label: s.name || s.title || s.skill_name || `Skill ${i + 1}`,
    category: s.category || s.domain || s.type || '',
    domain: s.domain || s.area || '',
    score: s.score || s.proficiency || s.level || s.rating || 0,
    description: s.description || s.summary || s.objective || '',
    tags: Array.isArray(s.tags) ? s.tags.join(' ') : String(s.tags || ''),
    _searchText: [s.name, s.title, s.skill_name, s.category, s.domain, s.type, s.description, s.summary, s.tags].filter(Boolean).join(' '),
  }));
}

function normaliseInvestigations(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.investigations) ? raw.investigations
    : Array.isArray(raw.cases) ? raw.cases
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((inv, i) => ({
    id: inv.id || inv._id || `inv-${i}`,
    label: inv.name || inv.title || inv.case_title || `Investigation ${i + 1}`,
    kind: inv.kind || inv.type || inv.category || '',
    status: inv.status || inv.state || '',
    description: inv.description || inv.summary || inv.objective || '',
    tags: Array.isArray(inv.tags) ? inv.tags.join(' ') : String(inv.tags || ''),
    _searchText: [inv.name, inv.title, inv.case_title, inv.kind, inv.type, inv.category, inv.status, inv.description, inv.summary, inv.tags].filter(Boolean).join(' '),
  }));
}

function correlate(contacts, skills, investigations) {
  return contacts.map(c => {
    const toks = tok(c._searchText);
    const matchedSkills = skills
      .map(s => ({ ...s, score: matchScore(toks, s._searchText) }))
      .filter(s => s.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const matchedInvs = investigations
      .map(inv => ({ ...inv, score: matchScore(toks, inv._searchText) }))
      .filter(inv => inv.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const hasSk = matchedSkills.length > 0;
    const hasInv = matchedInvs.length > 0;
    const coverage =
      hasSk && hasInv ? 'FULLY_TRACKED' :
      hasSk ? 'SKILLED' :
      hasInv ? 'INVESTIGATED' :
      'BLIND';
    return { ...c, matchedSkills, matchedInvs, coverage };
  });
}

export function isCasitriQuery(t) {
  return CASITRI_RE.test(t || '');
}

export async function buildCasitriScript() {
  try {
    const [cRes, sRes, iRes] = await Promise.all([
      fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : []),
    ]);
    const contacts = normaliseContacts(cRes);
    const skills = normaliseSkills(sRes);
    const investigations = normaliseInvestigations(iRes);
    const correlated = correlate(contacts, skills, investigations);
    const fullyTracked = correlated.filter(c => c.coverage === 'FULLY_TRACKED').length;
    const blind = correlated.filter(c => c.coverage === 'BLIND').length;
    return `CASITRI analysis: ${contacts.length} contacts cross-referenced against ${skills.length} AIP skills and ${investigations.length} open investigations. ${fullyTracked} contacts are FULLY TRACKED with both capability backing and active case coverage. ${blind} contacts are BLIND — no skill capability or investigation coverage — these personnel represent an intelligence and operational gap with neither assigned capabilities nor active cases.`;
  } catch {
    return 'CASITRI data unavailable — check /entities/Contact, /v1/aip/skill, and /v1/investigations endpoints.';
  }
}

const EM = '#10B981';
const VL = '#8B5CF6';
const AM = '#F59E0B';
const GR = '#555';

const FILTER_TABS = ['ALL', 'FULLY TRACKED', 'SKILLED', 'INVESTIGATED', 'BLIND'];
const COV_MAP = {
  'FULLY TRACKED': 'FULLY_TRACKED',
  'SKILLED': 'SKILLED',
  'INVESTIGATED': 'INVESTIGATED',
  'BLIND': 'BLIND',
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

export default function ContactSkillInvestigationTriple() {
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
      const [cRes, sRes, iRes] = await Promise.all([
        fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : []),
      ]);
      const contacts = normaliseContacts(cRes);
      const skills = normaliseSkills(sRes);
      const investigations = normaliseInvestigations(iRes);
      setData(correlate(contacts, skills, investigations));
    } catch { setData([]); }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => { if (!o) load(); return !o; });
    window.addEventListener('jarvis:casitri-toggle', toggle);
    return () => window.removeEventListener('jarvis:casitri-toggle', toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = data.filter(c => {
    if (filter !== 'ALL' && c.coverage !== COV_MAP[filter]) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!c.label.toLowerCase().includes(q) && !c._searchText.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const counts = {
    fullyTracked: data.filter(c => c.coverage === 'FULLY_TRACKED').length,
    skilled: data.filter(c => c.coverage === 'SKILLED').length,
    investigated: data.filter(c => c.coverage === 'INVESTIGATED').length,
    blind: data.filter(c => c.coverage === 'BLIND').length,
  };

  const totalSkills = [...new Set(data.flatMap(c => c.matchedSkills.map(s => s.id)))].length;
  const totalInvs = [...new Set(data.flatMap(c => c.matchedInvs.map(inv => inv.id)))].length;

  const assess = async () => {
    setAssessing(true); setAssessText('');
    try {
      const script = await buildCasitriScript();
      setAssessText(script);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: script } }));
    } catch { setAssessText('Assessment unavailable.'); }
    setAssessing(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Contact × AIP Skill × Investigation Triple Coverage"
        style={{
          position: 'fixed', left: 830240, bottom: 8, zIndex: 511,
          background: 'rgba(5,8,13,0.82)', border: `1px solid ${EM}55`,
          color: EM, fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
          letterSpacing: 1.5, padding: '4px 8px', borderRadius: 4, cursor: 'pointer',
          backdropFilter: 'blur(6px)', whiteSpace: 'nowrap',
        }}>
        ◈ CASITRI
        {counts.blind > 0 && (
          <span style={{ marginLeft: 5, background: GR, color: '#DCEBF5', borderRadius: 3, padding: '0 4px', fontSize: 8, fontWeight: 700 }}>
            {counts.blind}
          </span>
        )}
        {counts.fullyTracked > 0 && (
          <span style={{ marginLeft: 3, background: EM, color: '#04060A', borderRadius: 3, padding: '0 4px', fontSize: 8, fontWeight: 700 }}>
            {counts.fullyTracked}
          </span>
        )}
      </button>
    );
  }

  const covColor = c =>
    c === 'FULLY_TRACKED' ? EM :
    c === 'SKILLED' ? VL :
    c === 'INVESTIGATED' ? AM : GR;

  return (
    <div style={{
      position: 'fixed', top: 60, right: 16, zIndex: 511, width: 'min(820px,95vw)',
      maxHeight: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column',
      background: 'rgba(5,10,18,0.97)', border: `1px solid ${EM}44`,
      borderRadius: 10, fontFamily: "'JetBrains Mono',monospace", overflow: 'hidden',
      boxShadow: `0 0 40px ${EM}22`,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${EM}33`, flexShrink: 0 }}>
        <span style={{ color: EM, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>◈ CASITRI</span>
        <span style={{ color: '#6E8AA0', fontSize: 9 }}>Contact × AIP Skill × Investigation</span>
        {loading && <span style={{ color: EM, fontSize: 8 }}>LOADING…</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={assess} disabled={assessing} style={{
            background: `${EM}22`, border: `1px solid ${EM}55`, color: EM,
            fontSize: 9, padding: '3px 8px', borderRadius: 3, cursor: assessing ? 'default' : 'pointer', letterSpacing: 1,
          }}>{assessing ? 'ASSESSING…' : 'ASSESS'}</button>
          <button onClick={() => setOpen(false)} style={{
            background: 'transparent', border: `1px solid #2A3A50`, color: '#6E8AA0',
            fontSize: 9, padding: '3px 8px', borderRadius: 3, cursor: 'pointer',
          }}>✕</button>
        </div>
      </div>

      {/* Assess output */}
      {assessText && (
        <div style={{ padding: '6px 14px', background: `${EM}11`, borderBottom: `1px solid ${EM}22`, color: '#DCEBF5', fontSize: 9, lineHeight: 1.5, flexShrink: 0 }}>
          {assessText}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: `1px solid ${EM}22`, flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'CONTACTS', val: data.length, color: '#DCEBF5' },
          { label: 'AIP SKILLS', val: totalSkills, color: VL },
          { label: 'INVESTIGATIONS', val: totalInvs, color: AM },
          { label: 'FULLY TRACKED', val: counts.fullyTracked, color: EM },
          { label: 'SKILLED', val: counts.skilled, color: VL },
          { label: 'INVESTIGATED', val: counts.investigated, color: AM },
          { label: 'BLIND', val: counts.blind, color: GR },
        ].map(s => (
          <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 4, padding: '4px 10px', minWidth: 70, textAlign: 'center' }}>
            <div style={{ color: s.color, fontSize: 13, fontWeight: 700 }}>{s.val}</div>
            <div style={{ color: '#4A5A70', fontSize: 8, letterSpacing: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {data.length > 0 && (
        <div style={{ margin: '6px 14px', height: 5, borderRadius: 3, overflow: 'hidden', display: 'flex', flexShrink: 0 }}>
          {[
            { n: counts.fullyTracked, c: EM },
            { n: counts.skilled, c: VL },
            { n: counts.investigated, c: AM },
            { n: counts.blind, c: '#1E1E2A' },
          ].map((seg, i) => (
            <div key={i} style={{ flex: seg.n, background: seg.c, minWidth: seg.n ? 2 : 0, transition: 'flex 0.4s' }} />
          ))}
        </div>
      )}

      {/* Filters + search */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 14px', borderBottom: `1px solid ${EM}22`, flexShrink: 0, flexWrap: 'wrap' }}>
        {FILTER_TABS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? `${EM}33` : 'transparent',
            border: `1px solid ${filter === f ? EM : '#2A3A50'}`,
            color: filter === f ? EM : '#6E8AA0', fontSize: 9, padding: '2px 8px', borderRadius: 3, cursor: 'pointer', letterSpacing: 1,
          }}>{f}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)} placeholder="search contacts…"
          style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.04)', border: `1px solid #2A3A50`, color: '#DCEBF5', fontSize: 9, padding: '2px 8px', borderRadius: 3, outline: 'none', width: 140 }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 10px' }}>
        {visible.length === 0 && (
          <div style={{ color: '#6E8AA0', fontSize: 10, textAlign: 'center', padding: 24 }}>
            {loading ? 'Loading…' : 'No contacts match filter.'}
          </div>
        )}
        {visible.map(c => {
          const isExp = expanded === c.id;
          const cc = covColor(c.coverage);
          return (
            <div key={c.id} style={{ marginBottom: 4, borderRadius: 5, border: `1px solid ${cc}33`, background: `${cc}07`, overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(isExp ? null : c.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: cc, flexShrink: 0 }} />
                <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</span>
                {c.role && <Badge label={c.role} color={EM} />}
                {c.company && <Badge label={c.company} color='#6E8AA0' />}
                <Badge label={`${c.matchedSkills.length}SK / ${c.matchedInvs.length}INV`} color={cc} />
                <span style={{ fontSize: 8, color: cc, letterSpacing: 1, marginLeft: 4 }}>{c.coverage.replace(/_/g, ' ')}</span>
                <span style={{ color: '#6E8AA0', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${cc}22` }}>
                  {c.description && (
                    <div style={{ color: '#6E8AA0', fontSize: 9, marginBottom: 8, lineHeight: 1.4 }}>{c.description.slice(0, 160)}{c.description.length > 160 ? '…' : ''}</div>
                  )}
                  <div style={{ display: 'flex', gap: 10 }}>
                    {/* Skills pane */}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: VL, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>AIP SKILLS ({c.matchedSkills.length})</div>
                      {c.matchedSkills.length === 0
                        ? <div style={{ color: '#3A4A5A', fontSize: 9 }}>No matched skills</div>
                        : c.matchedSkills.slice(0, 6).map(s => (
                          <div key={s.id} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ color: '#DCEBF5', fontSize: 9, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                              {s.category && <Badge label={s.category} color={VL} />}
                            </div>
                            <ScoreBar score={s.score} color={VL} />
                          </div>
                        ))
                      }
                    </div>
                    {/* Investigations pane */}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: AM, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>INVESTIGATIONS ({c.matchedInvs.length})</div>
                      {c.matchedInvs.length === 0
                        ? <div style={{ color: '#3A4A5A', fontSize: 9 }}>No matched investigations</div>
                        : c.matchedInvs.slice(0, 6).map(inv => (
                          <div key={inv.id} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ color: '#DCEBF5', fontSize: 9, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.label}</span>
                              {inv.kind && <Badge label={inv.kind} color={AM} />}
                              {inv.status && <Badge label={inv.status} color='#6E8AA0' />}
                            </div>
                            <ScoreBar score={inv.score} color={AM} />
                          </div>
                        ))
                      }
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
