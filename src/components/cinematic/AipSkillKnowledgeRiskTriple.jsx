import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const AIPKRSTRI_RE = /\b(aipkrstri|aip\s+skill\s+knowledge\s+risk|skill\s+knowledge\s+risk|aip\s+skill\s+risk|skill\s+risk\s+knowledge|dormant\s+skill|skill\s+kb\s+risk|fully\s+armed\s+skill|skill\s+capability\s+risk|skill\s+intel\s+risk|skill\s+risk\s+kb|capability\s+risk\s+coverage|risk\s+linked\s+skill|aip\s+skill\s+triple|skill\s+triple\s+coverage)\b/i;

export function isAipkrstriQuery(t) { return AIPKRSTRI_RE.test(t || ''); }

export async function buildAipkrstriScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [skR, kbR, rsR] = await Promise.allSettled([
    fetch(`${API}/v1/aip/skill`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/entities/RiskSignal`, { headers: hdr }).then(r => r.json()),
  ]);
  const skRaw = skR.value ?? {};
  const skills = Array.isArray(skRaw) ? skRaw : (skRaw.skills ?? skRaw.data ?? skRaw.results ?? []);
  const kbRaw = kbR.value ?? {};
  const articles = Array.isArray(kbRaw) ? kbRaw : (kbRaw.articles ?? kbRaw.items ?? kbRaw.data ?? kbRaw.results ?? []);
  const rsRaw = rsR.value ?? {};
  const risks = Array.isArray(rsRaw) ? rsRaw : (rsRaw.risks ?? rsRaw.data ?? rsRaw.results ?? []);

  const kbText = articles.map(a =>
    `${a.title ?? a.name ?? ''} ${a.summary ?? a.description ?? ''} ${a.category ?? ''} ${(a.tags ?? []).join(' ')}`.toLowerCase()
  ).join(' ');
  const riskText = risks.map(r =>
    `${r.title ?? r.name ?? r.id ?? ''} ${r.description ?? ''} ${r.category ?? ''} ${r.source ?? ''}`.toLowerCase()
  ).join(' ');

  let fullyArmed = 0, kbBacked = 0, riskLinked = 0, dormant = 0;
  for (const sk of skills) {
    const text = `${sk.name ?? sk.id ?? ''} ${sk.description ?? ''} ${sk.category ?? ''} ${(sk.tags ?? []).join(' ')}`.toLowerCase();
    const tokens = text.split(/\W+/).filter(t => t.length > 2);
    const hasKb = tokens.some(tok => kbText.includes(tok));
    const hasRisk = tokens.some(tok => riskText.includes(tok));
    if (hasKb && hasRisk) fullyArmed++;
    else if (hasKb) kbBacked++;
    else if (hasRisk) riskLinked++;
    else dormant++;
  }
  return `AIPKRSTRI AIP Skill × Knowledge × Risk Signal: ${skills.length} skills assessed against ` +
    `${articles.length} KB articles and ${risks.length} risk signals. ` +
    `FULLY ARMED: ${fullyArmed} (KB coverage + risk signal — skill has both knowledge backing and active risk context). ` +
    `KB-BACKED: ${kbBacked} (knowledge article found, no risk signal — skill documented but no risk context). ` +
    `RISK-LINKED: ${riskLinked} (risk signal overlap, no KB backing — risk-linked but undocumented). ` +
    `DORMANT: ${dormant} (no KB or risk signal coverage — capability gap).`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 80, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = {
  'FULLY ARMED': '#4ade80',
  'KB-BACKED': '#60a5fa',
  'RISK-LINKED': '#f97316',
  DORMANT: '#6b7280',
};

function tokenize(text) {
  return `${text}`.toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function scoreArticles(skill, articles) {
  const text = `${skill.name ?? skill.id ?? ''} ${skill.description ?? ''} ${skill.category ?? ''} ${(skill.tags ?? []).join(' ')}`.toLowerCase();
  const tokens = tokenize(text);
  const matched = [];
  for (const a of articles) {
    const aText = `${a.title ?? a.name ?? ''} ${a.summary ?? a.description ?? ''} ${a.category ?? ''} ${(a.tags ?? []).join(' ')}`.toLowerCase();
    const hits = tokens.filter(tok => aText.includes(tok));
    if (hits.length > 0) matched.push({ item: a, score: Math.min(100, hits.length * 25) });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function scoreRiskSignals(skill, risks) {
  const text = `${skill.name ?? skill.id ?? ''} ${skill.description ?? ''} ${skill.category ?? ''} ${(skill.tags ?? []).join(' ')}`.toLowerCase();
  const tokens = tokenize(text);
  const matched = [];
  for (const r of risks) {
    const rText = `${r.title ?? r.name ?? r.id ?? ''} ${r.description ?? ''} ${r.category ?? ''} ${r.source ?? ''}`.toLowerCase();
    const hits = tokens.filter(tok => rText.includes(tok));
    if (hits.length > 0) matched.push({ item: r, score: Math.min(100, hits.length * 25) });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function correlate(skill, articles, risks) {
  const text = `${skill.name ?? skill.id ?? ''} ${skill.description ?? ''} ${skill.category ?? ''} ${(skill.tags ?? []).join(' ')}`.toLowerCase();
  const tokens = tokenize(text);
  const kbText = articles.map(a => `${a.title ?? a.name ?? ''} ${a.summary ?? a.description ?? ''} ${a.category ?? ''} ${(a.tags ?? []).join(' ')}`.toLowerCase()).join(' ');
  const riskText = risks.map(r => `${r.title ?? r.name ?? r.id ?? ''} ${r.description ?? ''} ${r.category ?? ''} ${r.source ?? ''}`.toLowerCase()).join(' ');
  const hasKb = tokens.some(tok => kbText.includes(tok));
  const hasRisk = tokens.some(tok => riskText.includes(tok));
  if (hasKb && hasRisk) return 'FULLY ARMED';
  if (hasKb) return 'KB-BACKED';
  if (hasRisk) return 'RISK-LINKED';
  return 'DORMANT';
}

export default function AipSkillKnowledgeRiskTriple() {
  const [open, setOpen] = useState(false);
  const [skills, setSkills] = useState([]);
  const [articles, setArticles] = useState([]);
  const [risks, setRisks] = useState([]);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const hdr = { Authorization: `Bearer ${key}` };
      const [skR, kbR, rsR] = await Promise.allSettled([
        fetch(`${API}/v1/aip/skill`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/entities/RiskSignal`, { headers: hdr }).then(r => r.json()),
      ]);
      const skRaw = skR.value ?? {};
      const sks = Array.isArray(skRaw) ? skRaw : (skRaw.skills ?? skRaw.data ?? skRaw.results ?? []);
      const kbRaw = kbR.value ?? {};
      const arts = Array.isArray(kbRaw) ? kbRaw : (kbRaw.articles ?? kbRaw.items ?? kbRaw.data ?? kbRaw.results ?? []);
      const rsRaw = rsR.value ?? {};
      const rks = Array.isArray(rsRaw) ? rsRaw : (rsRaw.risks ?? rsRaw.data ?? rsRaw.results ?? []);
      setSkills(sks);
      setArticles(arts);
      setRisks(rks);
      setRows(sks.map(sk => ({
        sk,
        state: correlate(sk, arts, rks),
        leftMatched: scoreArticles(sk, arts),
        rightMatched: scoreRiskSignals(sk, rks),
      })));
      setLastUpdated(new Date());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:aipkrstri-toggle', onToggle);
    return () => window.removeEventListener('jarvis:aipkrstri-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fullyArmedCount = rows.filter(r => r.state === 'FULLY ARMED').length;
  const kbBackedCount = rows.filter(r => r.state === 'KB-BACKED').length;
  const riskLinkedCount = rows.filter(r => r.state === 'RISK-LINKED').length;
  const dormantCount = rows.filter(r => r.state === 'DORMANT').length;

  const visible = rows.filter(row => {
    if (filter !== 'ALL' && row.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const text = `${row.sk.name ?? row.sk.id ?? ''} ${row.sk.description ?? ''} ${row.sk.category ?? ''}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  const assess = async (row) => {
    const id = row.sk.name ?? row.sk.id ?? 'skill';
    setAssessing(id);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const kbNames = row.leftMatched.slice(0, 2).map(m => m.item.title ?? m.item.name ?? m.item.id ?? '?').join(', ');
      const riskNames = row.rightMatched.slice(0, 2).map(m => m.item.title ?? m.item.name ?? m.item.id ?? '?').join(', ');
      const stateDesc = row.state === 'FULLY ARMED'
        ? `has KB coverage (${kbNames || 'found'}) AND active risk signals (${riskNames || 'found'}) — skill is armed with knowledge and risk context`
        : row.state === 'KB-BACKED'
          ? `has KB article backing (${kbNames || 'found'}) but no active risk signals — documented but not risk-linked`
          : row.state === 'RISK-LINKED'
            ? `has active risk signal overlap (${riskNames || 'found'}) but no KB backing — risk-linked but undocumented`
            : 'has no KB coverage or active risk signal alignment — dormant capability with no intelligence context';
      const prompt = `AIP skill "${id}" ${stateDesc}. In exactly 2 sentences, assess the capability coverage and risk intelligence status of this skill.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const brief = data.response ?? data.message ?? data.content ?? data.text ?? '';
      if (brief) window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: brief } }));
    } catch (_) {}
    setAssessing(null);
  };

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', left: 792720, bottom: 8, zIndex: 444,
      width: 560, maxHeight: '82vh',
      background: 'rgba(10,15,30,0.97)', border: '1px solid rgba(107,114,128,0.22)',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: '#a78bfa', letterSpacing: 2, fontWeight: 700, flex: 1 }}>◈ AIPKRSTRI — AIP SKILL × KNOWLEDGE × RISK SIGNAL</span>
        {dormantCount > 0 && (
          <span style={{ background: '#6b7280', color: '#fff', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{dormantCount} DORMANT</span>
        )}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'Skills', val: skills.length },
          { label: 'KB Articles', val: articles.length },
          { label: 'Risk Signals', val: risks.length },
          { label: 'Fully Armed', val: fullyArmedCount, color: '#4ade80' },
          { label: 'KB-Backed', val: kbBackedCount, color: '#60a5fa' },
          { label: 'Risk-Linked', val: riskLinkedCount, color: '#f97316' },
          { label: 'Dormant', val: dormantCount, color: '#6b7280' },
        ].map(t => (
          <div key={t.label} style={TILE}>
            <div style={LABEL}>{t.label}</div>
            <div style={{ ...VAL, color: t.color ?? '#e2e8f0' }}>{loading ? '…' : t.val}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {rows.length > 0 && (
        <div style={{ padding: '0 14px 8px', flexShrink: 0 }}>
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', display: 'flex' }}>
            <div style={{ height: '100%', width: `${Math.round((fullyArmedCount / rows.length) * 100)}%`, background: '#4ade80', transition: 'width 0.4s' }} />
            <div style={{ height: '100%', width: `${Math.round((kbBackedCount / rows.length) * 100)}%`, background: '#60a5fa', transition: 'width 0.4s' }} />
            <div style={{ height: '100%', width: `${Math.round((riskLinkedCount / rows.length) * 100)}%`, background: '#f97316', transition: 'width 0.4s' }} />
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 3 }}>
            {rows.length ? Math.round((dormantCount / rows.length) * 100) : 0}% dormant · {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
          </div>
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {['ALL', 'FULLY ARMED', 'KB-BACKED', 'RISK-LINKED', 'DORMANT'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? (STATE_COLOR[f] ?? '#4ade80') : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 700,
            color: filter === f ? (f === 'DORMANT' ? '#fff' : f === 'FULLY ARMED' ? '#000' : '#000') : '#aaa',
            cursor: 'pointer', letterSpacing: 1,
          }}>{f}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search skills…"
          style={{ flex: 1, minWidth: 100, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '3px 8px', color: '#e2e8f0', fontSize: 11, outline: 'none' }}
        />
      </div>

      {/* Row list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 10px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: 20 }}>no skills match</div>
        )}
        {visible.map((row, i) => {
          const id = row.sk.name ?? row.sk.id ?? `skill-${i}`;
          const isExp = expanded === id;
          return (
            <div key={id} style={{ marginBottom: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.07)' }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', userSelect: 'none' }}
              >
                <span style={{ flex: 1, fontSize: 11, color: '#e2e8f0', fontWeight: 600 }}>{id}</span>
                {row.sk.category && (
                  <span style={{ fontSize: 10, color: '#94a3b8', background: 'rgba(148,163,184,0.1)', borderRadius: 3, padding: '1px 5px' }}>{row.sk.category}</span>
                )}
                <span style={{ fontSize: 10, color: STATE_COLOR[row.state] ?? '#888', fontWeight: 700, letterSpacing: 1 }}>{row.state}</span>
                <span style={{ fontSize: 10, color: '#555' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 10px 10px' }}>
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing === id}
                    style={{ background: assessing === id ? '#444' : 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 4, color: '#a78bfa', fontSize: 10, padding: '3px 10px', cursor: assessing === id ? 'not-allowed' : 'pointer', marginBottom: 8 }}
                  >
                    {assessing === id ? 'ASSESSING…' : '▶ ASSESS'}
                  </button>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {/* Left pane: KB Articles */}
                    <div>
                      <div style={{ fontSize: 10, color: '#60a5fa', marginBottom: 5, letterSpacing: 1, fontWeight: 700 }}>KB ARTICLES ({row.leftMatched.length})</div>
                      {row.leftMatched.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no KB article matches</div>
                      ) : row.leftMatched.slice(0, 4).map((m, mi) => {
                        const n = m.item.title ?? m.item.name ?? m.item.id ?? `article-${mi}`;
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ flex: 1, fontSize: 10, color: '#93c5fd' }}>{n}</span>
                              {m.item.category && (
                                <span style={{ fontSize: 9, color: '#60a5fa', background: 'rgba(96,165,250,0.12)', borderRadius: 3, padding: '1px 4px' }}>{m.item.category}</span>
                              )}
                              <span style={{ fontSize: 10, color: '#60a5fa', fontWeight: 700 }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#60a5fa', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Right pane: Risk Signals */}
                    <div>
                      <div style={{ fontSize: 10, color: '#fb923c', marginBottom: 5, letterSpacing: 1, fontWeight: 700 }}>RISK SIGNALS ({row.rightMatched.length})</div>
                      {row.rightMatched.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no risk signal matches</div>
                      ) : row.rightMatched.slice(0, 4).map((m, mi) => {
                        const n = m.item.title ?? m.item.name ?? m.item.id ?? `risk-${mi}`;
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ flex: 1, fontSize: 10, color: '#fdba74' }}>{n}</span>
                              {m.item.severity && (
                                <span style={{ fontSize: 9, color: '#f97316', background: 'rgba(249,115,22,0.12)', borderRadius: 3, padding: '1px 4px' }}>{m.item.severity}</span>
                              )}
                              <span style={{ fontSize: 10, color: '#fb923c', fontWeight: 700 }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#f97316', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
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
