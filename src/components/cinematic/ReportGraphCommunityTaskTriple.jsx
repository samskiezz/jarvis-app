import { useState, useEffect, useCallback } from 'react';

const API = '';
const API_KEY = 'dev-key';

const RGCTRI_RE = /\b(rgctri|report[._-]?graph[._-]?task|report[._-]?community[._-]?task|community[._-]?report[._-]?task|report[._-]?triple|report[._-]?operational|archival[._-]?report|fully[._-]?operational[._-]?report|community[._-]?backed[._-]?report|report[._-]?task[._-]?community|graph[._-]?report[._-]?task|report[._-]?network[._-]?task)\b/i;

export function isRgctriQuery(t) {
  return RGCTRI_RE.test(t || '');
}

export async function buildRgctriScript() {
  const [rptR, comR, tskR] = await Promise.allSettled([
    fetch(`${API}/v1/reports`).then(r => r.json()),
    fetch(`${API}/v1/graph/communities`).then(r => r.json()),
    fetch(`${API}/entities/Task`).then(r => r.json()),
  ]);
  const rpts = normaliseReports(rptR.status === 'fulfilled' ? rptR.value : []);
  const coms = normaliseCommunities(comR.status === 'fulfilled' ? comR.value : []);
  const tsks = normaliseTasks(tskR.status === 'fulfilled' ? tskR.value : []);
  const enriched = correlate(rpts, coms, tsks);
  const fully    = enriched.filter(r => r._hasCom && r._hasTask).length;
  const archival = enriched.filter(r => !r._hasCom && !r._hasTask).length;
  return (
    `Report × Graph Community × Task Triple: ${rpts.length} reports, ${coms.length} communities, ${tsks.length} tasks indexed. ` +
    `${fully} reports are FULLY OPERATIONAL (community network + task backing). ` +
    `${archival} are ARCHIVAL (no community or task coverage — intelligence sitting idle). ` +
    `Top archival: ${enriched.filter(r => !r._hasCom && !r._hasTask).slice(0, 3).map(r => r.title || r.id || '?').join(', ') || 'none'}.`
  );
}

function normaliseReports(raw) {
  if (!raw) return [];
  const arr = ['reports', 'items', 'results', 'data'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((r, i) => ({
    id:          r.id || String(i),
    title:       r.title || r.name || r.subject || `Report ${i + 1}`,
    summary:     String(r.summary || r.description || r.abstract || '').slice(0, 300),
    type:        r.type || r.category || r.kind || '',
    tags:        Array.isArray(r.tags) ? r.tags.join(' ') : (r.tags || ''),
  }));
}

function normaliseCommunities(raw) {
  if (!raw) return [];
  const arr = ['communities', 'clusters', 'items', 'results', 'data'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((c, i) => ({
    id:      c.id || String(i),
    label:   c.label || c.name || c.title || `Community ${i + 1}`,
    type:    c.type || c.category || '',
    members: c.members || c.member_count || c.size || 0,
    summary: String(c.summary || c.description || c.label || '').slice(0, 200),
    tags:    Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || ''),
  }));
}

function normaliseTasks(raw) {
  if (!raw) return [];
  const arr = ['tasks', 'items', 'results', 'data'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((t, i) => ({
    id:          t.id || String(i),
    title:       t.title || t.name || t.mission || `Task ${i + 1}`,
    description: String(t.description || t.summary || t.notes || '').slice(0, 200),
    status:      t.status || t.state || '',
    priority:    t.priority || '',
    tags:        Array.isArray(t.tags) ? t.tags.join(' ') : (t.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(rpt, item, itemKeys) {
  const rptToks = new Set([
    ...tokens(rpt.title),
    ...tokens(rpt.summary),
    ...tokens(rpt.type),
    ...tokens(rpt.tags),
  ]);
  const itemToks = itemKeys.flatMap(k => tokens(item[k]));
  if (!rptToks.size || !itemToks.length) return 0;
  let hits = 0;
  for (const t of itemToks) if (rptToks.has(t)) hits++;
  return hits / Math.max(rptToks.size, itemToks.length);
}

function correlate(rpts, coms, tsks) {
  const COM_KEYS = ['label', 'type', 'summary', 'tags'];
  const TSK_KEYS = ['title', 'description', 'status', 'tags'];
  return rpts.map(rpt => {
    const comMatches = coms
      .map(c => ({ ...c, _score: matchScore(rpt, c, COM_KEYS) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);
    const tskMatches = tsks
      .map(t => ({ ...t, _score: matchScore(rpt, t, TSK_KEYS) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);
    return {
      ...rpt,
      _hasCom:      comMatches.length > 0,
      _hasTask:     tskMatches.length > 0,
      _comMatches:  comMatches,
      _tskMatches:  tskMatches,
    };
  });
}

function coverageLabel(rpt) {
  if (rpt._hasCom && rpt._hasTask) return 'FULLY OPERATIONAL';
  if (rpt._hasCom)                  return 'COMMUNITY-BACKED';
  if (rpt._hasTask)                 return 'TASKED';
  return 'ARCHIVAL';
}

function coverageColor(rpt) {
  if (rpt._hasCom && rpt._hasTask) return '#22C55E';
  if (rpt._hasCom)                  return '#00CFFF';
  if (rpt._hasTask)                 return '#A78BFA';
  return '#F59E0B';
}

const PANEL_W = 620;
const PANEL_H = 580;
const CY  = '#00CFFF';
const GR  = '#22C55E';
const VIO = '#A78BFA';
const AM  = '#F59E0B';

const chip = (label, color = CY) => (
  <span style={{
    display: 'inline-block', padding: '1px 7px', borderRadius: 4,
    border: `1px solid ${color}44`, background: `${color}14`,
    color, fontSize: 10, letterSpacing: 1, marginRight: 4,
  }}>{label}</span>
);

const scorebar = (score, color = CY) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
    <div style={{ width: 60, height: 4, background: '#1a2535', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: color, borderRadius: 2 }} />
    </div>
    <span style={{ color: '#6E8AA0', fontSize: 10 }}>{(score * 100).toFixed(0)}%</span>
  </div>
);

const TABS = ['ALL', 'FULLY OPERATIONAL', 'COMMUNITY-BACKED', 'TASKED', 'ARCHIVAL'];

export default function ReportGraphCommunityTaskTriple() {
  const [open, setOpen]         = useState(false);
  const [rpts, setRpts]         = useState([]);
  const [coms, setComs]         = useState([]);
  const [tsks, setTsks]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rptR, comR, tskR] = await Promise.allSettled([
        fetch(`${API}/v1/reports`).then(r => r.json()),
        fetch(`${API}/v1/graph/communities`).then(r => r.json()),
        fetch(`${API}/entities/Task`).then(r => r.json()),
      ]);
      setRpts(normaliseReports(rptR.status === 'fulfilled' ? rptR.value : []));
      setComs(normaliseCommunities(comR.status === 'fulfilled' ? comR.value : []));
      setTsks(normaliseTasks(tskR.status === 'fulfilled' ? tskR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:rgctri-toggle', onToggle);
    return () => window.removeEventListener('jarvis:rgctri-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 90000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = correlate(rpts, coms, tsks);
  const fully    = enriched.filter(r => r._hasCom && r._hasTask);
  const commOnly = enriched.filter(r => r._hasCom && !r._hasTask);
  const taskOnly = enriched.filter(r => !r._hasCom && r._hasTask);
  const archival = enriched.filter(r => !r._hasCom && !r._hasTask);
  const badgeCount = archival.length;
  const badgeColor = badgeCount > 0 ? AM : '#6E8AA0';

  const filtered = enriched
    .filter(rpt => {
      const lbl = coverageLabel(rpt);
      if (tab === 'ALL') return true;
      return lbl === tab;
    })
    .filter(rpt => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        String(rpt.title || '').toLowerCase().includes(s) ||
        String(rpt.type || '').toLowerCase().includes(s) ||
        String(rpt.summary || '').toLowerCase().includes(s)
      );
    });

  async function assess() {
    setAssessing(true);
    setBrief('');
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message:
            `Report × Graph Community × Task Triple Coverage: ${rpts.length} reports, ${coms.length} graph communities, ${tsks.length} tasks. ` +
            `${fully.length} FULLY OPERATIONAL (community network + task backing). ` +
            `${commOnly.length} COMMUNITY-BACKED (community only, no active task). ` +
            `${taskOnly.length} TASKED (task assigned, no community context). ` +
            `${archival.length} ARCHIVAL (no community or task coverage — intelligence idle). ` +
            `Give a 2-sentence operational readiness brief highlighting the most critical archival gap or opportunity.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Report × Graph Community × Task Triple (RGCTRI)"
        style={{
          position: 'fixed', left: 754080, bottom: 8, zIndex: 375,
          width: 64, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ RGCTRI
        {badgeCount > 0 && (
          <span style={{
            background: badgeColor, color: '#04060A', borderRadius: 3, padding: '0 4px',
            fontSize: 8, fontWeight: 700, minWidth: 14, textAlign: 'center',
          }}>{badgeCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          width: PANEL_W, height: PANEL_H, zIndex: 9211,
          background: 'rgba(6,10,18,0.97)', border: `1px solid ${AM}33`,
          borderRadius: 12, backdropFilter: 'blur(16px)',
          boxShadow: `0 0 60px ${AM}22`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${AM}22`,
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ color: AM, fontSize: 11, letterSpacing: 2, fontWeight: 700, textShadow: `0 0 12px ${AM}` }}>
              ◈ REPORT × GRAPH COMMUNITY × TASK
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {loading && <span style={{ color: '#6E8AA0', fontSize: 10 }}>loading…</span>}
              <button
                onClick={assess}
                disabled={assessing}
                style={{
                  padding: '2px 8px', borderRadius: 3, border: `1px solid ${AM}55`,
                  background: 'transparent', color: AM, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                }}
              >{assessing ? 'assessing…' : '▶ ASSESS'}</button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14, padding: 0 }}
              >✕</button>
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'REPORTS',           val: rpts.length,    col: '#DCEBF5' },
              { label: 'COMMUNITIES',        val: coms.length,    col: CY },
              { label: 'TASKS',              val: tsks.length,    col: VIO },
              { label: 'FULLY OPERATIONAL',  val: fully.length,   col: GR },
              { label: 'ARCHIVAL',           val: archival.length, col: AM },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                flex: 1, background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 6, padding: '5px 6px', textAlign: 'center',
              }}>
                <div style={{ color: col, fontSize: 15, fontWeight: 700 }}>{val}</div>
                <div style={{ color: '#6E8AA0', fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {enriched.length > 0 && (
            <div style={{ padding: '0 14px 8px', flexShrink: 0 }}>
              <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 1 }}>
                {[
                  { count: fully.length,    col: GR },
                  { count: commOnly.length, col: CY },
                  { count: taskOnly.length, col: VIO },
                  { count: archival.length, col: AM },
                ].map(({ count, col }, i) => (
                  <div key={i} style={{
                    flex: count, background: col, minWidth: count > 0 ? 2 : 0,
                    transition: 'flex 0.3s',
                  }} />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                {[
                  { label: 'FULLY OPERATIONAL', count: fully.length,    col: GR },
                  { label: 'COMMUNITY-BACKED',   count: commOnly.length, col: CY },
                  { label: 'TASKED',             count: taskOnly.length, col: VIO },
                  { label: 'ARCHIVAL',           count: archival.length, col: AM },
                ].map(({ label, count, col }) => (
                  <span key={label} style={{ color: col, fontSize: 9, letterSpacing: 1 }}>
                    {count} {label}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 4, padding: '0 14px 8px', flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '2px 8px', borderRadius: 3, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                  border: `1px solid ${tab === t ? AM : '#2a3a4a'}`,
                  background: tab === t ? `${AM}22` : 'transparent',
                  color: tab === t ? AM : '#6E8AA0',
                }}
              >{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search reports…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.03)', border: `1px solid #2a3a4a`,
                borderRadius: 4, color: '#DCEBF5', padding: '2px 8px', fontSize: 10, outline: 'none',
                fontFamily: "'JetBrains Mono',monospace", width: 140,
              }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>
            {filtered.length === 0 ? (
              <div style={{ color: '#6E8AA0', fontSize: 11, textAlign: 'center', paddingTop: 40 }}>
                {loading ? 'Loading…' : 'No reports found.'}
              </div>
            ) : filtered.map((rpt, i) => {
              const isExp = expanded === i;
              const cov   = coverageLabel(rpt);
              const col   = coverageColor(rpt);
              return (
                <div
                  key={rpt.id || i}
                  style={{ borderBottom: `1px solid ${AM}11`, paddingBottom: 6, marginBottom: 6 }}
                >
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 0' }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', background: col,
                      boxShadow: `0 0 6px ${col}`, flexShrink: 0,
                    }} />
                    <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1, minWidth: 0 }}>
                      {rpt.title || rpt.id || '?'}
                    </span>
                    {rpt.type && chip(rpt.type, AM)}
                    {chip(cov, col)}
                    <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 'auto' }}>
                      {isExp ? '▲' : '▼'}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 14, paddingTop: 6 }}>
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          GRAPH COMMUNITIES ({rpt._comMatches.length})
                        </div>
                        {rpt._comMatches.length > 0 ? rpt._comMatches.map((c, j) => (
                          <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1, minWidth: 0 }}>
                              {c.label || c.id || '?'}
                            </span>
                            {c.type && chip(c.type, CY)}
                            {c.members > 0 && (
                              <span style={{ color: '#6E8AA0', fontSize: 9 }}>{c.members}m</span>
                            )}
                            {scorebar(c._score, CY)}
                          </div>
                        )) : (
                          <div style={{ color: AM, fontSize: 10 }}>No community network match.</div>
                        )}
                      </div>

                      <div>
                        <div style={{ color: VIO, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ACTIVE TASKS ({rpt._tskMatches.length})
                        </div>
                        {rpt._tskMatches.length > 0 ? rpt._tskMatches.map((t, j) => (
                          <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1, minWidth: 0 }}>
                              {t.title || t.id || '?'}
                            </span>
                            {t.status && chip(t.status, VIO)}
                            {t.priority && chip(t.priority, AM)}
                            {scorebar(t._score, VIO)}
                          </div>
                        )) : (
                          <div style={{ color: AM, fontSize: 10 }}>No active task match.</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {brief && (
            <div style={{
              padding: '8px 14px', borderTop: `1px solid ${AM}22`,
              color: '#DCEBF5', fontSize: 11, lineHeight: 1.5, flexShrink: 0,
              background: 'rgba(245,158,11,0.03)',
            }}>
              <span style={{ color: AM, fontSize: 9, letterSpacing: 2 }}>ASSESS ▸ </span>{brief}
            </div>
          )}
        </div>
      )}
    </>
  );
}
