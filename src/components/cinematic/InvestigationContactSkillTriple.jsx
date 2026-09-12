import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
const API_KEY = (typeof window !== 'undefined' && (window.__JARVIS_API_KEY__ || 'dev-key')) || 'dev-key';
const POLL_MS = 90000;

const ICASK_RE = /\b(icask|investigation[\s_-]*contact[\s_-]*skill|case[\s_-]*contact[\s_-]*skill|investigation[\s_-]*skill[\s_-]*contact|unresourced[\s_-]*invest|equipped[\s_-]*invest|contact[\s_-]*skill[\s_-]*invest|invest[\s_-]*capability[\s_-]*contact|case[\s_-]*skill[\s_-]*contact|invest[\s_-]*aip[\s_-]*contact)\b/i;

export function isIcaskQuery(t) { return ICASK_RE.test(t || ''); }

function tok(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  const bSet = new Set(bTokens);
  const hits = aTokens.filter(t => bSet.has(t)).length;
  return hits / Math.max(aTokens.length, bTokens.length);
}

const THRESHOLD = 0.08;

const COV = { FULLY_EQUIPPED: 'FULLY_EQUIPPED', CONTACT_ONLY: 'CONTACT_ONLY', SKILL_ONLY: 'SKILL_ONLY', UNRESOURCED: 'UNRESOURCED' };

function classifyCase(caseTokens, contacts, skills) {
  let bestContact = null, bestContactScore = 0;
  let bestSkill = null, bestSkillScore = 0;
  for (const c of contacts) {
    const ct = tok([c?.name, c?.email, c?.company, c?.title, c?.description].join(' '));
    const s = matchScore(caseTokens, ct);
    if (s > bestContactScore) { bestContactScore = s; bestContact = c; }
  }
  for (const sk of skills) {
    const st = tok([sk?.name, sk?.description, sk?.category, sk?.domain, (sk?.tags || []).join(' ')].join(' '));
    const s = matchScore(caseTokens, st);
    if (s > bestSkillScore) { bestSkillScore = s; bestSkill = sk; }
  }
  const hasContact = bestContactScore >= THRESHOLD;
  const hasSkill = bestSkillScore >= THRESHOLD;
  let cov;
  if (hasContact && hasSkill) cov = COV.FULLY_EQUIPPED;
  else if (hasContact) cov = COV.CONTACT_ONLY;
  else if (hasSkill) cov = COV.SKILL_ONLY;
  else cov = COV.UNRESOURCED;
  return { cov, bestContact, bestContactScore, bestSkill, bestSkillScore };
}

export async function buildIcaskScript() {
  try {
    const [caseRes, contactRes, skillRes] = await Promise.all([
      fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : []),
    ]);
    const cases = Array.isArray(caseRes) ? caseRes : (caseRes?.items ?? caseRes?.data ?? caseRes?.investigations ?? []);
    const contacts = Array.isArray(contactRes) ? contactRes : (contactRes?.items ?? contactRes?.data ?? []);
    const skills = Array.isArray(skillRes) ? skillRes : (skillRes?.items ?? skillRes?.data ?? skillRes?.skills ?? []);
    const counts = { [COV.FULLY_EQUIPPED]: 0, [COV.CONTACT_ONLY]: 0, [COV.SKILL_ONLY]: 0, [COV.UNRESOURCED]: 0 };
    for (const c of cases) {
      const ct = tok([c?.name, c?.title, c?.subject, c?.description, c?.kind, (c?.tags || []).join(' ')].join(' '));
      const { cov } = classifyCase(ct, contacts, skills);
      counts[cov]++;
    }
    const total = cases.length;
    return `ICASK: ${total} investigations — ${counts[COV.FULLY_EQUIPPED]} fully equipped (contact+skill), ${counts[COV.CONTACT_ONLY]} contact-only, ${counts[COV.SKILL_ONLY]} skill-only, ${counts[COV.UNRESOURCED]} unresourced. ${contacts.length} contacts, ${skills.length} AIP skills indexed. ${counts[COV.UNRESOURCED] > 0 ? `${counts[COV.UNRESOURCED]} investigations have no contact or skill coverage — critical resourcing gap.` : 'All investigations have at least one coverage dimension.'}`;
  } catch {
    return 'ICASK: unable to fetch investigation, contact, or skill data — check endpoints.';
  }
}

export default function InvestigationContactSkillTriple() {
  const [open, setOpen] = useState(false);
  const [cases, setCases] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [skills, setSkills] = useState([]);
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
      const [caseRes, contactRes, skillRes] = await Promise.all([
        fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : []),
      ]);
      setCases(Array.isArray(caseRes) ? caseRes : (caseRes?.items ?? caseRes?.data ?? caseRes?.investigations ?? []));
      setContacts(Array.isArray(contactRes) ? contactRes : (contactRes?.items ?? contactRes?.data ?? []));
      setSkills(Array.isArray(skillRes) ? skillRes : (skillRes?.items ?? skillRes?.data ?? skillRes?.skills ?? []));
    } catch { /* silently ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener('jarvis:icask-toggle', handler);
    return () => window.removeEventListener('jarvis:icask-toggle', handler);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  if (!open) return null;

  const classified = cases.map(c => {
    const label = c?.name ?? c?.title ?? c?.subject ?? '(unnamed)';
    const ct = tok([c?.name, c?.title, c?.subject, c?.description, c?.kind, (c?.tags || []).join(' ')].join(' '));
    const result = classifyCase(ct, contacts, skills);
    return { label, kind: c?.kind ?? c?.category ?? '', status: c?.status ?? c?.state ?? '', ...result };
  });

  const counts = { [COV.FULLY_EQUIPPED]: 0, [COV.CONTACT_ONLY]: 0, [COV.SKILL_ONLY]: 0, [COV.UNRESOURCED]: 0 };
  classified.forEach(r => counts[r.cov]++);

  const covColor = {
    [COV.FULLY_EQUIPPED]: '#22d3ee',
    [COV.CONTACT_ONLY]: '#a78bfa',
    [COV.SKILL_ONLY]: '#fb923c',
    [COV.UNRESOURCED]: '#475569',
  };
  const covLabel = {
    [COV.FULLY_EQUIPPED]: 'FULLY EQUIPPED',
    [COV.CONTACT_ONLY]: 'CONTACT ONLY',
    [COV.SKILL_ONLY]: 'SKILL ONLY',
    [COV.UNRESOURCED]: 'UNRESOURCED',
  };

  const total = classified.length;
  const equippedPct = total ? Math.round((counts[COV.FULLY_EQUIPPED] / total) * 100) : 0;

  const searchLower = search.toLowerCase();
  const visible = classified.filter(r => {
    if (filter !== 'ALL' && r.cov !== filter) return false;
    if (searchLower && !r.label.toLowerCase().includes(searchLower)) return false;
    return true;
  });

  async function assess() {
    setAssessing(true);
    setAssessText('');
    try {
      const prompt = `ICASK investigation resourcing: ${total} investigations — ${counts[COV.FULLY_EQUIPPED]} fully equipped (contact+AIP skill), ${counts[COV.CONTACT_ONLY]} contact-only, ${counts[COV.SKILL_ONLY]} skill-only, ${counts[COV.UNRESOURCED]} unresourced. ${contacts.length} contacts, ${skills.length} skills available. Provide a 2-sentence assessment of investigation resourcing and one actionable recommendation.`;
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      if (r.ok) {
        const j = await r.json();
        const txt = j.response || j.message || j.content || '';
        setAssessText(txt);
        window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
      }
    } catch { /* silently ignore */ }
    setAssessing(false);
  }

  const CY = '#22d3ee';

  return (
    <div style={{
      position: 'fixed', left: 873360, bottom: 8, zIndex: 568, width: 360,
      background: 'rgba(8,12,20,0.97)', border: `1px solid ${CY}44`,
      borderRadius: 10, padding: 14, fontFamily: 'monospace', fontSize: 12,
      color: '#e2e8f0', boxShadow: `0 0 28px ${CY}11`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 13 }}>◈ ICASK — Investigation × Contact × Skill</span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
        {Object.values(COV).map(cov => (
          <div key={cov} style={{ background: covColor[cov] + '11', border: `1px solid ${covColor[cov]}44`, borderRadius: 6, padding: '6px 8px', textAlign: 'center', cursor: 'pointer' }}
            onClick={() => setFilter(f => f === cov ? 'ALL' : cov)}>
            <div style={{ fontSize: 22, fontWeight: 700, color: covColor[cov] }}>{counts[cov]}</div>
            <div style={{ fontSize: 8, color: '#94a3b8', marginTop: 1 }}>{covLabel[cov]}</div>
          </div>
        ))}
      </div>

      {/* Source tiles */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
        {[['Cases', total, CY], ['Contacts', contacts.length, '#a78bfa'], ['Skills', skills.length, '#fb923c']].map(([lbl, val, col]) => (
          <div key={lbl} style={{ flex: 1, background: col + '11', border: `1px solid ${col}33`, borderRadius: 5, padding: '4px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 8, color: '#64748b' }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden', gap: 1 }}>
          {Object.values(COV).map(cov => (
            <div key={cov} style={{ flex: counts[cov], background: covColor[cov], transition: 'flex 0.4s' }} />
          ))}
        </div>
        <div style={{ textAlign: 'right', fontSize: 9, color: '#64748b', marginTop: 2 }}>{equippedPct}% equipped</div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        {['ALL', ...Object.values(COV)].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '2px 8px', fontSize: 9, borderRadius: 4, cursor: 'pointer', fontWeight: filter === f ? 700 : 400,
            background: filter === f ? (f === 'ALL' ? CY + '22' : covColor[f] + '22') : 'transparent',
            border: `1px solid ${filter === f ? (f === 'ALL' ? CY : covColor[f]) : '#1e293b'}`,
            color: filter === f ? (f === 'ALL' ? CY : covColor[f]) : '#64748b',
          }}>{f === 'ALL' ? 'ALL' : covLabel[f].split(' ')[0]}</button>
        ))}
      </div>

      {/* Search */}
      <input
        value={search} onChange={e => setSearch(e.target.value)} placeholder="Search investigations…"
        style={{ width: '100%', boxSizing: 'border-box', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 4, padding: '4px 8px', color: '#94a3b8', fontSize: 11, marginBottom: 8 }}
      />

      {/* Rows */}
      <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {visible.slice(0, 30).map((row, i) => (
          <div key={i}>
            <div
              onClick={() => setExpanded(expanded === i ? null : i)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '4px 6px', borderRadius: 4, background: '#0f172a', border: `1px solid ${covColor[row.cov]}22` }}
            >
              <span style={{ color: '#cbd5e1', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{row.label}</span>
              <span style={{ fontSize: 8, color: covColor[row.cov], fontWeight: 700, marginLeft: 6, whiteSpace: 'nowrap' }}>{covLabel[row.cov].split(' ')[0]}</span>
            </div>
            {expanded === i && (
              <div style={{ padding: '6px 8px', background: '#080c14', borderRadius: 4, marginTop: 2, fontSize: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ color: '#a78bfa', fontWeight: 700, marginBottom: 4 }}>CONTACT</div>
                    {row.bestContact ? (
                      <>
                        <div style={{ color: '#cbd5e1' }}>{row.bestContact?.name ?? '—'}</div>
                        <div style={{ color: '#64748b', fontSize: 9 }}>{row.bestContact?.title ?? row.bestContact?.company ?? ''}</div>
                        <div style={{ background: '#1e293b', borderRadius: 2, height: 3, marginTop: 4 }}>
                          <div style={{ width: `${Math.round(row.bestContactScore * 100)}%`, background: '#a78bfa', height: '100%', borderRadius: 2 }} />
                        </div>
                        <div style={{ textAlign: 'right', color: '#64748b', fontSize: 8 }}>{Math.round(row.bestContactScore * 100)}%</div>
                      </>
                    ) : <div style={{ color: '#475569' }}>No match</div>}
                  </div>
                  <div>
                    <div style={{ color: '#fb923c', fontWeight: 700, marginBottom: 4 }}>SKILL</div>
                    {row.bestSkill ? (
                      <>
                        <div style={{ color: '#cbd5e1' }}>{row.bestSkill?.name ?? '—'}</div>
                        <div style={{ color: '#64748b', fontSize: 9 }}>{row.bestSkill?.category ?? row.bestSkill?.domain ?? ''}</div>
                        <div style={{ background: '#1e293b', borderRadius: 2, height: 3, marginTop: 4 }}>
                          <div style={{ width: `${Math.round(row.bestSkillScore * 100)}%`, background: '#fb923c', height: '100%', borderRadius: 2 }} />
                        </div>
                        <div style={{ textAlign: 'right', color: '#64748b', fontSize: 8 }}>{Math.round(row.bestSkillScore * 100)}%</div>
                      </>
                    ) : <div style={{ color: '#475569' }}>No match</div>}
                  </div>
                </div>
                {(row.kind || row.status) && (
                  <div style={{ marginTop: 5, fontSize: 9, color: '#64748b' }}>
                    {row.kind && <span style={{ marginRight: 6, background: '#1e293b', padding: '1px 5px', borderRadius: 3 }}>{row.kind}</span>}
                    {row.status && <span style={{ background: '#1e293b', padding: '1px 5px', borderRadius: 3 }}>{row.status}</span>}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {visible.length === 0 && <div style={{ fontSize: 10, color: '#475569', textAlign: 'center', padding: 8 }}>No investigations match</div>}
        {visible.length > 30 && <div style={{ fontSize: 9, color: '#334155', textAlign: 'center' }}>…+{visible.length - 30} more</div>}
      </div>

      {/* Assess */}
      <div style={{ borderTop: '1px solid #1e293b', paddingTop: 10, marginTop: 8 }}>
        <button
          onClick={assess} disabled={assessing}
          style={{ width: '100%', padding: '6px 0', background: assessing ? '#1e293b' : CY + '11', border: `1px solid ${CY}`, borderRadius: 4, color: CY, cursor: assessing ? 'default' : 'pointer', fontSize: 11, fontWeight: 700 }}
        >{assessing ? '⟳ Assessing…' : '▶ ASSESS — ICASK resourcing brief'}</button>
        {assessText && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8', background: '#0f172a', borderRadius: 4, padding: 8, lineHeight: 1.5 }}>{assessText}</div>
        )}
      </div>

      <div style={{ marginTop: 6, fontSize: 9, color: '#334155', textAlign: 'right' }}>
        {loading ? 'Refreshing…' : `Polls every ${POLL_MS / 1000}s`}
      </div>
    </div>
  );
}
