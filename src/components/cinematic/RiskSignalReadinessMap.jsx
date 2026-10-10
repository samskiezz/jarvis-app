/**
 * F439 — Risk Signal × Scenario × Knowledge Readiness Map (RSSKR)
 *
 * Answers: "For each active risk signal, does JARVIS have a response scenario
 * AND a KB article?  READY (both), SCENARIO_ONLY, KB_ONLY, or EXPOSED (neither
 * — no playbook, no documentation)."
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/RiskSignal  → active risk signals
 *   GET /v1/scenario/list     → response / action scenarios
 *   GET /knowledge/           → KB articles
 *
 * Classification:
 *   READY         — signal has BOTH a matched scenario AND a matched KB article
 *   SCENARIO_ONLY — scenario matched, no KB coverage
 *   KB_ONLY       — KB article matched, no scenario
 *   EXPOSED       — neither (no playbook, no documentation — readiness gap)
 *
 * Stat tiles:  risk signals / scenarios / KB articles / exposed
 * Red badge:   exposed count on button
 * Expand row:  matched scenarios (max 5) + matched KB articles (max 5)
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS
 *
 * Toggle:  ◈ RSSKR  at left:7440 bottom:18, zIndex:68
 * Event:   jarvis:rsskr-toggle
 * Voice:   "risk readiness / rsskr / risk scenario knowledge / exposed risks /
 *           unready risks / risk with no playbook / risk knowledge gap /
 *           scenario readiness / risk preparedness / jarvis readiness"
 * Refresh: 60 s auto-poll.
 */
import { useState, useEffect, useCallback, useRef } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) || 'dev-key';

const BG   = 'rgba(10,12,20,0.97)';
const BD   = 'rgba(255,255,255,0.10)';
const MU   = '#64748B';
const RD   = '#EF4444';
const AM   = '#F59E0B';
const CY   = '#06B6D4';
const GR   = '#10B981';
const MONO = "'JetBrains Mono','Fira Code',monospace";

const FILTERS     = ['ALL', 'READY', 'SCENARIO_ONLY', 'KB_ONLY', 'EXPOSED'];
const CLASS_COLOR = {
  READY         : GR,
  SCENARIO_ONLY : AM,
  KB_ONLY       : CY,
  EXPOSED       : RD,
};

// ─── exports for JarvisBrain ─────────────────────────────────────────────────
const RSSKR_RE =
  /\b(risk[._-]?readiness|rsskr|risk[._-]?scenario[._-]?knowledge|exposed[._-]?risks?|unready[._-]?risks?|risk[._-]?with[._-]?no[._-]?playbook|risk[._-]?knowledge[._-]?gap|scenario[._-]?readiness|risk[._-]?preparedness|jarvis[._-]?readiness)\b/i;

export function isRsskrQuery(t) { return RSSKR_RE.test(t || ''); }

export async function buildRsskrScript() {
  const [rsR, scR, kbR] = await Promise.allSettled([
    fetch(`${API}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${API}/knowledge/`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
  ]);
  const signals   = normSignals(rsR.status === 'fulfilled' ? rsR.value : []);
  const scenarios = normScenarios(scR.status === 'fulfilled' ? scR.value : []);
  const articles  = normKb(kbR.status === 'fulfilled' ? kbR.value : []);
  const enriched  = enrich(signals, scenarios, articles);
  const exposed   = enriched.filter(r => r._class === 'EXPOSED').length;
  const ready     = enriched.filter(r => r._class === 'READY').length;
  return (
    `Risk Signal Readiness Map: ${signals.length} active risk signals, ` +
    `${scenarios.length} scenarios, ${articles.length} KB articles. ` +
    `${ready} signals are READY (scenario + KB coverage); ` +
    `${exposed} are EXPOSED (no playbook, no KB documentation — readiness gap). ` +
    `Exposed signals: ${enriched.filter(r => r._class === 'EXPOSED').slice(0, 3)
      .map(r => r.name || r.id || '?').join(', ') || 'none'}.`
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function tokens(str) {
  if (!str) return [];
  return String(str).toLowerCase().match(/\b[a-z0-9]{3,}\b/g) || [];
}

function overlap(aTokens, bTokens) {
  const bs = new Set(bTokens);
  return aTokens.filter(t => bs.has(t)).length;
}

function normSignals(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.items || raw?.signals || raw?.data || []);
  return arr.map(s => ({
    id         : s.id || s._id || String(Math.random()),
    name       : s.name || s.title || s.signal_name || '(unnamed)',
    description: s.description || s.summary || '',
    severity   : (s.severity || s.level || 'INFO').toUpperCase(),
    source     : s.source || '',
    tags       : Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
    _toks      : tokens([s.name, s.title, s.signal_name, s.description, s.source, s.tags].join(' ')),
  }));
}

function normScenarios(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.scenarios || raw?.data || raw?.items || []);
  return arr.map(s => ({
    id   : s.id || s._id || String(Math.random()),
    name : s.name || s.title || s.scenario_name || '(unnamed)',
    _toks: tokens([s.name, s.title, s.scenario_name, s.description, s.category, s.tags].join(' ')),
  }));
}

function normKb(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.articles || raw?.items || raw?.data || []);
  return arr.map(a => ({
    id   : a.id || a._id || String(Math.random()),
    title: a.title || a.name || '(untitled)',
    topic: a.topic || a.category || '',
    _toks: tokens([a.title, a.name, a.description, a.topic, a.category, a.tags].join(' ')),
  }));
}

function scoreMatch(sigToks, itemToks) {
  const hits = overlap(sigToks, itemToks);
  if (!hits) return 0;
  return Math.round((hits / Math.max(sigToks.length, 1)) * 100);
}

function enrich(signals, scenarios, articles) {
  return signals.map(sig => {
    const matchedSc = scenarios
      .map(sc => ({ ...sc, score: scoreMatch(sig._toks, sc._toks) }))
      .filter(sc => sc.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const matchedKb = articles
      .map(a => ({ ...a, score: scoreMatch(sig._toks, a._toks) }))
      .filter(a => a.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const hasSc = matchedSc.length > 0;
    const hasKb = matchedKb.length > 0;
    const _class =
      hasSc && hasKb ? 'READY'
      : hasSc        ? 'SCENARIO_ONLY'
      : hasKb        ? 'KB_ONLY'
                     : 'EXPOSED';
    return { ...sig, matchedSc, matchedKb, _class };
  });
}

// ─── component ───────────────────────────────────────────────────────────────
export default function RiskSignalReadinessMap() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [filter, setFilter]   = useState('ALL');
  const [search, setSearch]   = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const [stats, setStats]     = useState({ signals: 0, scenarios: 0, articles: 0, exposed: 0 });
  const timerRef              = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rsR, scR, kbR] = await Promise.allSettled([
        fetch(`${API}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`,    { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${API}/knowledge/`,           { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
      ]);
      const signals   = normSignals(rsR.status === 'fulfilled'  ? rsR.value : []);
      const scenarios = normScenarios(scR.status === 'fulfilled' ? scR.value : []);
      const articles  = normKb(kbR.status === 'fulfilled'       ? kbR.value : []);
      const enriched  = enrich(signals, scenarios, articles);
      setRows(enriched);
      setStats({
        signals  : signals.length,
        scenarios: scenarios.length,
        articles : articles.length,
        exposed  : enriched.filter(r => r._class === 'EXPOSED').length,
      });
    } catch (_) { /* network unavailable — retain previous rows */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener('jarvis:rsskr-toggle', onToggle);
    return () => window.removeEventListener('jarvis:rsskr-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 60_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessText('');
    try {
      const script = await buildRsskrScript();
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method : 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body   : JSON.stringify({ message: `In exactly 2 sentences, assess: ${script}` }),
      });
      const j   = await res.json();
      const txt = j?.response || j?.message || j?.content || script;
      setAssessText(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch (e) {
      setAssessText(`Error: ${e.message}`);
    }
    setAssessing(false);
  }, []);

  const visible = rows
    .filter(r => filter === 'ALL' || r._class === filter)
    .filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()));

  const SEV_COLOR = { CRITICAL: RD, HIGH: '#F97316', MEDIUM: AM, LOW: GR, INFO: CY };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position:'fixed', left:7440, bottom:18, zIndex:68,
          background:'rgba(20,24,40,0.92)', border:`1px solid ${BD}`,
          color: stats.exposed > 0 ? RD : '#94A3B8',
          fontFamily:MONO, fontSize:10, padding:'4px 8px', cursor:'pointer',
          borderRadius:4, display:'flex', alignItems:'center', gap:6,
        }}
        title="Risk Signal Readiness Map (RSSKR) — risk signals vs scenarios + KB"
      >
        ◈ RSSKR
        {stats.exposed > 0 && (
          <span style={{
            background:RD, color:'#fff', borderRadius:10,
            fontSize:9, padding:'1px 5px', animation:'pulse 2s infinite',
          }}>
            {stats.exposed}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position:'fixed', right:20, top:60, width:560, maxHeight:'80vh',
      background:BG, border:`1px solid ${BD}`, borderRadius:8,
      zIndex:10068, display:'flex', flexDirection:'column', overflow:'hidden',
      fontFamily:MONO,
    }}>
      {/* header */}
      <div style={{
        padding:'10px 14px', borderBottom:`1px solid ${BD}`,
        display:'flex', alignItems:'center', justifyContent:'space-between',
      }}>
        <span style={{ color: RD, fontSize:11, fontWeight:700, letterSpacing:1 }}>
          ◈ RISK SIGNAL READINESS MAP
        </span>
        <div style={{ display:'flex', gap:6 }}>
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              background:'rgba(239,68,68,0.12)', border:`1px solid ${RD}`,
              color:RD, fontFamily:MONO, fontSize:10, padding:'3px 8px',
              cursor:'pointer', borderRadius:4,
            }}
          >
            {assessing ? '...' : '▶ ASSESS'}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background:'none', border:'none', color:MU,
              cursor:'pointer', fontSize:14, lineHeight:1,
            }}
          >✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, padding:'10px 14px', borderBottom:`1px solid ${BD}` }}>
        {[
          { label:'SIGNALS',   val: stats.signals,   col: RD },
          { label:'SCENARIOS', val: stats.scenarios,  col: AM },
          { label:'KB ARTICLES', val: stats.articles, col: CY },
          { label:'EXPOSED',   val: stats.exposed,   col: RD },
        ].map(t => (
          <div key={t.label} style={{
            background:'rgba(255,255,255,0.03)', border:`1px solid ${BD}`,
            borderRadius:4, padding:'6px 8px', textAlign:'center',
          }}>
            <div style={{ color:t.col, fontSize:18, fontWeight:700 }}>{t.val}</div>
            <div style={{ color:MU, fontSize:8, marginTop:2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* assess text */}
      {assessText && (
        <div style={{
          margin:'8px 14px 0', padding:'8px 10px',
          background:'rgba(239,68,68,0.06)', border:`1px solid rgba(239,68,68,0.2)`,
          borderRadius:4, color:'#CBD5E1', fontSize:10, lineHeight:1.6,
        }}>
          {assessText}
        </div>
      )}

      {/* filters + search */}
      <div style={{ padding:'8px 14px', borderBottom:`1px solid ${BD}`, display:'flex', flexDirection:'column', gap:6 }}>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                background: filter === f ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${filter === f ? RD : BD}`,
                color: filter === f ? RD : MU,
                fontFamily:MONO, fontSize:9, padding:'2px 8px',
                cursor:'pointer', borderRadius:3,
              }}
            >
              {f}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search signals…"
          style={{
            background:'rgba(255,255,255,0.04)', border:`1px solid ${BD}`,
            color:'#CBD5E1', fontFamily:MONO, fontSize:10,
            padding:'4px 8px', borderRadius:3, outline:'none',
          }}
        />
      </div>

      {/* rows */}
      <div style={{ overflowY:'auto', flex:1 }}>
        {loading && rows.length === 0 && (
          <div style={{ color:MU, fontSize:10, textAlign:'center', padding:20 }}>loading…</div>
        )}
        {!loading && visible.length === 0 && (
          <div style={{ color:MU, fontSize:10, textAlign:'center', padding:20 }}>no signals match</div>
        )}
        {visible.map(row => {
          const isOpen = expanded === row.id;
          return (
            <div key={row.id} style={{ borderBottom:`1px solid ${BD}` }}>
              <div
                onClick={() => setExpanded(isOpen ? null : row.id)}
                style={{
                  padding:'8px 14px', cursor:'pointer', display:'flex',
                  alignItems:'center', gap:8,
                  background: isOpen ? 'rgba(255,255,255,0.03)' : 'transparent',
                }}
              >
                <span style={{
                  background: CLASS_COLOR[row._class] + '22',
                  border: `1px solid ${CLASS_COLOR[row._class]}`,
                  color: CLASS_COLOR[row._class],
                  fontSize:8, padding:'1px 5px', borderRadius:3, minWidth:90, textAlign:'center',
                }}>
                  {row._class}
                </span>
                <span style={{
                  background: (SEV_COLOR[row.severity] || MU) + '22',
                  border: `1px solid ${SEV_COLOR[row.severity] || MU}`,
                  color: SEV_COLOR[row.severity] || MU,
                  fontSize:8, padding:'1px 5px', borderRadius:3,
                }}>
                  {row.severity}
                </span>
                <span style={{ color:'#CBD5E1', fontSize:10, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {row.name}
                </span>
                <span style={{ color:MU, fontSize:9 }}>{isOpen ? '▲' : '▼'}</span>
              </div>

              {isOpen && (
                <div style={{ padding:'0 14px 10px', background:'rgba(255,255,255,0.02)' }}>
                  {/* matched scenarios */}
                  {row.matchedSc.length > 0 ? (
                    <>
                      <div style={{ color:AM, fontSize:9, marginBottom:4, marginTop:4 }}>MATCHED SCENARIOS</div>
                      {row.matchedSc.map(sc => (
                        <div key={sc.id} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                          <span style={{ color:'#94A3B8', fontSize:9, flex:1 }}>{sc.name}</span>
                          <div style={{ width:60, height:4, background:'rgba(255,255,255,0.08)', borderRadius:2 }}>
                            <div style={{ width:`${Math.min(sc.score, 100)}%`, height:'100%', background:AM, borderRadius:2 }} />
                          </div>
                          <span style={{ color:AM, fontSize:8, minWidth:28, textAlign:'right' }}>{sc.score}%</span>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div style={{ color:MU, fontSize:9, marginTop:4 }}>no scenario match</div>
                  )}

                  {/* matched KB articles */}
                  {row.matchedKb.length > 0 ? (
                    <>
                      <div style={{ color:CY, fontSize:9, marginBottom:4, marginTop:8 }}>MATCHED KB ARTICLES</div>
                      {row.matchedKb.map(a => (
                        <div key={a.id} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                          <span style={{ color:'#94A3B8', fontSize:9, flex:1 }}>{a.title}</span>
                          {a.topic && (
                            <span style={{
                              background: CY + '22', border:`1px solid ${CY}`,
                              color:CY, fontSize:8, padding:'1px 4px', borderRadius:3,
                            }}>{a.topic}</span>
                          )}
                          <div style={{ width:60, height:4, background:'rgba(255,255,255,0.08)', borderRadius:2 }}>
                            <div style={{ width:`${Math.min(a.score, 100)}%`, height:'100%', background:CY, borderRadius:2 }} />
                          </div>
                          <span style={{ color:CY, fontSize:8, minWidth:28, textAlign:'right' }}>{a.score}%</span>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div style={{ color:MU, fontSize:9, marginTop:8 }}>no KB article match</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{ padding:'6px 14px', borderTop:`1px solid ${BD}`, color:MU, fontSize:9, display:'flex', justifyContent:'space-between' }}>
        <span>{visible.length} of {rows.length} signals</span>
        <span>{loading ? 'refreshing…' : '60 s auto-refresh'}</span>
      </div>
    </div>
  );
}
