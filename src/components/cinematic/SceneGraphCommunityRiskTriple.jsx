import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SCENE_IDS = [
  '01_command_atrium', '02_intelligence_nexus', '03_threat_theatre',
  '04_mission_forge', '05_signals_bridge', '06_synthetic_oracle',
  '07_sovereign_archive', '08_field_operations', '09_crisis_calculus', '10_sentinel_watch',
];

const SCGCRISK_RE = /\b(scgcrisk|scene\s+graph\s+community\s+risk|scene\s+community\s+risk|cinematic\s+community\s+risk|scene\s+risk\s+community|scene\s+risk\s+signal\s+community|community\s+risk\s+scene|alarmed\s+scene\s+community|dark\s+scene\s+community|scene\s+network\s+risk|cinematic\s+risk\s+community|scene\s+community\s+threat)\b/i;
const THRESHOLD = 0.07;

export function isScgcriskQuery(t) {
  return SCGCRISK_RE.test(t || '');
}

export async function buildScgcriskScript() {
  try {
    const [sceneRaws, commRes, riskRes] = await Promise.all([
      Promise.all(SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.ok ? r.json() : null))),
      fetch(`${API}/v1/graph/communities`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/entities/RiskSignal`).then(r => r.ok ? r.json() : []),
    ]);
    const scenes = normaliseScenes(sceneRaws);
    const communities = normaliseCommunities(commRes);
    const risks = normaliseRisks(riskRes);
    const classified = scenes.map(s => classifyScene(s, communities, risks));
    const alarmed = classified.filter(s => s.state === 'FULLY_ALARMED').length;
    const dark = classified.filter(s => s.state === 'DARK').length;
    return `SCGCRISK analysis: ${scenes.length} cinematic scenes cross-referenced against ${communities.length} graph network communities and ${risks.length} active risk signals. ${alarmed} scenes are FULLY ALARMED with both network community context and active risk signal coverage. ${dark} scenes are DARK — no community or risk coverage — representing operational blind spots with no network intelligence or threat signal backing.`;
  } catch {
    return 'SCGCRISK data unavailable — check /v1/cinematic/scene, /v1/graph/communities, and /entities/RiskSignal endpoints.';
  }
}

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

function normaliseCommunities(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.communities) ? raw.communities
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((c, i) => ({
    id: c.id || c._id || `comm-${i}`,
    label: c.name || c.label || c.title || `Community ${i + 1}`,
    type: c.type || c.category || c.kind || '',
    size: c.size || c.member_count || c.members?.length || 0,
    _searchText: [c.name, c.label, c.title, c.description, c.type, c.category, c.kind, c.tags].filter(Boolean).join(' '),
  }));
}

function normaliseRisks(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((r, i) => ({
    id: r.id || r._id || `risk-${i}`,
    label: r.title || r.name || r.signal || `Risk ${i + 1}`,
    severity: r.severity || r.level || r.priority || '',
    category: r.category || r.type || r.kind || '',
    _searchText: [r.title, r.name, r.signal, r.description, r.category, r.type, r.severity, r.source, r.tags].filter(Boolean).join(' '),
  }));
}

function classifyScene(scene, communities, risks) {
  const toks = tok(scene._searchText);
  const commMatches = communities
    .map(c => ({ ...c, score: Math.max(matchScore(toks, c._searchText), matchScore(tok(c._searchText), scene._searchText)) }))
    .filter(c => c.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const riskMatches = risks
    .map(r => ({ ...r, score: Math.max(matchScore(toks, r._searchText), matchScore(tok(r._searchText), scene._searchText)) }))
    .filter(r => r.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const hasComm = commMatches.length > 0;
  const hasRisk = riskMatches.length > 0;
  let state;
  if (hasComm && hasRisk) state = 'FULLY_ALARMED';
  else if (hasComm) state = 'COMMUNITY_BACKED';
  else if (hasRisk) state = 'RISK_FLAGGED';
  else state = 'DARK';
  return { ...scene, state, commMatches, riskMatches };
}

const STATE_LABELS = {
  FULLY_ALARMED: 'FULLY ALARMED',
  COMMUNITY_BACKED: 'COMMUNITY-BACKED',
  RISK_FLAGGED: 'RISK-FLAGGED',
  DARK: 'DARK',
};

const SEV_COLORS = { CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#eab308', LOW: '#22c55e' };

function ScoreBar({ score, color }) {
  return (
    <div style={{ background: '#1e293b', borderRadius: 3, height: 6, width: '100%', overflow: 'hidden', marginTop: 2 }}>
      <div style={{ width: `${Math.round(score * 100)}%`, background: color, height: '100%', transition: 'width 0.3s' }} />
    </div>
  );
}

export default function SceneGraphCommunityRiskTriple() {
  const [open, setOpen] = useState(false);
  const [scenes, setScenes] = useState([]);
  const [communities, setCommunities] = useState([]);
  const [risks, setRisks] = useState([]);
  const [classified, setClassified] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const headers = { 'Content-Type': 'application/json' };
      const [sceneRaws, commRes, riskRes] = await Promise.all([
        Promise.all(SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`, { headers }).then(r => r.ok ? r.json() : null))),
        fetch(`${API}/v1/graph/communities`, { headers }),
        fetch(`${API}/entities/RiskSignal`, { headers }),
      ]);
      const [commJson, riskJson] = await Promise.all([commRes.json(), riskRes.json()]);
      const sc = normaliseScenes(sceneRaws);
      const comm = normaliseCommunities(commJson);
      const rk = normaliseRisks(riskJson);
      setScenes(sc);
      setCommunities(comm);
      setRisks(rk);
      setClassified(sc.map(s => classifyScene(s, comm, rk)));
    } catch (e) {
      setError('Fetch failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.open !== undefined) { setOpen(e.detail.open); return; }
      setOpen(v => !v);
    };
    window.addEventListener('jarvis:scgcrisk-toggle', handler);
    return () => window.removeEventListener('jarvis:scgcrisk-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    timerRef.current = setInterval(fetchAll, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchAll]);

  useEffect(() => {
    const handler = (e) => {
      const q = (e.detail?.transcript || '').toLowerCase();
      if (SCGCRISK_RE.test(q)) { setOpen(true); }
    };
    window.addEventListener('jarvis:voice-query', handler);
    return () => window.removeEventListener('jarvis:voice-query', handler);
  }, []);

  const counts = {
    FULLY_ALARMED: classified.filter(s => s.state === 'FULLY_ALARMED').length,
    COMMUNITY_BACKED: classified.filter(s => s.state === 'COMMUNITY_BACKED').length,
    RISK_FLAGGED: classified.filter(s => s.state === 'RISK_FLAGGED').length,
    DARK: classified.filter(s => s.state === 'DARK').length,
  };

  const visible = classified.filter(s => {
    if (filter !== 'ALL' && s.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return s._searchText.toLowerCase().includes(q) || s.label.toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const prompt = `SCGCRISK Scene × Graph Community × Risk Signal Triple Coverage: ${scenes.length} cinematic scenes cross-referenced against ${communities.length} graph network communities and ${risks.length} active risk signals. Coverage: FULLY ALARMED=${counts.FULLY_ALARMED}, COMMUNITY-BACKED=${counts.COMMUNITY_BACKED}, RISK-FLAGGED=${counts.RISK_FLAGGED}, DARK=${counts.DARK}. In 2 sentences, assess scene network and threat coverage posture and identify the most critical dark scenes requiring immediate community mapping or risk signal assignment to restore operational awareness.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const j = await res.json();
      const text = j.response || j.message || j.content || JSON.stringify(j);
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (e) {
      setAssessment('Assessment failed: ' + e.message);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) return null;

  const alarmedPct = classified.length ? Math.round((counts.FULLY_ALARMED / classified.length) * 100) : 0;
  const commPct = classified.length ? Math.round((counts.COMMUNITY_BACKED / classified.length) * 100) : 0;
  const riskPct = classified.length ? Math.round((counts.RISK_FLAGGED / classified.length) * 100) : 0;
  const darkPct = classified.length ? Math.round((counts.DARK / classified.length) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', left: 842560, bottom: 8, zIndex: 533,
      width: 900, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(10,14,26,0.97)', border: '1px solid #7f1d1d',
      borderRadius: 10, fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      boxShadow: '0 0 32px rgba(127,29,29,0.35)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{ color: '#f87171', fontWeight: 700, fontSize: 13 }}>◈ SCGCRISK</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>Scene × Graph Community × Risk Signal Triple Coverage</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && <span style={{ color: '#f87171', fontSize: 10 }}>SYNCING…</span>}
          <button onClick={fetchAll} style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {error && <div style={{ padding: '6px 14px', color: '#f87171', fontSize: 11, borderBottom: '1px solid #1e293b' }}>{error}</div>}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 6, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        {[
          { label: 'SCENES', val: scenes.length, color: '#e2e8f0' },
          { label: 'COMMUNITIES', val: communities.length, color: '#34d399' },
          { label: 'RISK SIGNALS', val: risks.length, color: '#fb923c' },
          { label: 'FULLY ALARMED', val: counts.FULLY_ALARMED, color: '#f87171', badge: counts.FULLY_ALARMED > 0 },
          { label: 'COMM-BACKED', val: counts.COMMUNITY_BACKED, color: '#34d399' },
          { label: 'RISK-FLAGGED', val: counts.RISK_FLAGGED, color: '#fb923c' },
          { label: 'DARK', val: counts.DARK, color: '#6b7280', badge: counts.DARK > 0 },
          { label: 'COVERAGE', val: `${alarmedPct}%`, color: '#22d3ee' },
        ].map(t => (
          <div key={t.label} style={{ background: '#0f172a', borderRadius: 6, padding: '6px 8px', textAlign: 'center', border: t.badge ? '1px solid ' + t.color : '1px solid #1e293b' }}>
            <div style={{ color: t.color, fontWeight: 700, fontSize: 15 }}>{t.val}</div>
            <div style={{ color: '#475569', fontSize: 9, marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '6px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 10, color: '#64748b', marginBottom: 4 }}>
          <span>Coverage</span>
          <span style={{ marginLeft: 'auto', color: '#f87171' }}>{alarmedPct}% fully alarmed</span>
        </div>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#1e293b' }}>
          {alarmedPct > 0 && <div style={{ width: `${alarmedPct}%`, background: '#f87171' }} />}
          {commPct > 0 && <div style={{ width: `${commPct}%`, background: '#34d399' }} />}
          {riskPct > 0 && <div style={{ width: `${riskPct}%`, background: '#fb923c' }} />}
          {darkPct > 0 && <div style={{ width: `${darkPct}%`, background: '#374151' }} />}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 9, color: '#475569' }}>
          <span style={{ color: '#f87171' }}>● FULLY ALARMED</span>
          <span style={{ color: '#34d399' }}>● COMMUNITY-BACKED</span>
          <span style={{ color: '#fb923c' }}>● RISK-FLAGGED</span>
          <span style={{ color: '#374151' }}>● DARK</span>
        </div>
      </div>

      {/* Filters + search */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY_ALARMED', 'COMMUNITY_BACKED', 'RISK_FLAGGED', 'DARK'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? '#1c0a0a' : '#0f172a',
            border: `1px solid ${filter === f ? '#f87171' : '#1e293b'}`,
            color: filter === f ? '#fca5a5' : '#64748b',
            borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 10, fontFamily: 'monospace',
          }}>
            {STATE_LABELS[f] || f}{f !== 'ALL' ? ` (${counts[f]})` : ` (${classified.length})`}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search scenes…"
          style={{ marginLeft: 'auto', background: '#0f172a', border: '1px solid #1e293b', color: '#e2e8f0', borderRadius: 4, padding: '3px 10px', fontSize: 10, fontFamily: 'monospace', width: 180 }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '6px 14px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', textAlign: 'center', padding: 24 }}>No scenes match current filter.</div>
        )}
        {visible.map(s => {
          const stateColor = s.state === 'FULLY_ALARMED' ? '#f87171' : s.state === 'COMMUNITY_BACKED' ? '#34d399' : s.state === 'RISK_FLAGGED' ? '#fb923c' : '#6b7280';
          const isExp = expanded === s.id;
          return (
            <div key={s.id} style={{ marginBottom: 6, background: '#0f172a', borderRadius: 6, border: `1px solid ${isExp ? '#7f1d1d' : '#1e293b'}` }}>
              <div
                onClick={() => setExpanded(isExp ? null : s.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
              >
                <span style={{ color: stateColor, fontWeight: 700, fontSize: 10, minWidth: 150 }}>{STATE_LABELS[s.state]}</span>
                <span style={{ flex: 1, color: '#e2e8f0', fontWeight: 600 }}>{s.label}</span>
                <span style={{ color: '#334155', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 10px 10px', borderTop: '1px solid #1e293b' }}>
                  {s.description && <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6, marginTop: 6 }}>{s.description.slice(0, 160)}{s.description.length > 160 ? '…' : ''}</div>}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                    {/* Graph Communities pane */}
                    <div>
                      <div style={{ color: '#34d399', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>GRAPH COMMUNITIES ({s.commMatches.length})</div>
                      {s.commMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No community coverage</div>
                        : s.commMatches.slice(0, 6).map(c => (
                          <div key={c.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#6ee7b7', fontSize: 11 }}>{c.label.slice(0, 42)}{c.label.length > 42 ? '…' : ''}</span>
                              {c.type && <span style={{ background: '#052e16', color: '#34d399', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{c.type}</span>}
                            </div>
                            <ScoreBar score={c.score} color="#34d399" />
                          </div>
                        ))
                      }
                    </div>
                    {/* Risk Signals pane */}
                    <div>
                      <div style={{ color: '#fb923c', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>RISK SIGNALS ({s.riskMatches.length})</div>
                      {s.riskMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No risk signal coverage</div>
                        : s.riskMatches.slice(0, 6).map(r => (
                          <div key={r.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#fdba74', fontSize: 11 }}>{r.label.slice(0, 42)}{r.label.length > 42 ? '…' : ''}</span>
                              {r.severity && (
                                <span style={{ background: '#431407', color: SEV_COLORS[r.severity.toUpperCase()] || '#fb923c', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                                  {r.severity.toUpperCase()}
                                </span>
                              )}
                            </div>
                            <ScoreBar score={r.score} color="#fb923c" />
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

      {/* Assessment */}
      <div style={{ padding: '8px 14px', borderTop: '1px solid #1e293b', flexShrink: 0 }}>
        {assessment && <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6, lineHeight: 1.5 }}>{assessment}</div>}
        <button
          onClick={assess}
          disabled={assessing || classified.length === 0}
          style={{
            background: assessing ? '#1e293b' : '#1c0a0a', border: '1px solid #f87171',
            color: assessing ? '#475569' : '#fca5a5', borderRadius: 5, padding: '5px 18px',
            cursor: assessing ? 'not-allowed' : 'pointer', fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
          }}
        >
          {assessing ? 'ASSESSING…' : 'ASSESS'}
        </button>
      </div>
    </div>
  );
}
