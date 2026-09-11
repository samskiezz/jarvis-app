import { useState, useEffect, useCallback } from 'react';

const API = '';

const TRSSCEN_RE = /\b(task[._-]?risk[._-]?scenario|triple[._-]?coverage|trsscen|task[._-]?readiness[._-]?matrix|mission[._-]?readiness[._-]?matrix|fully[._-]?prepared[._-]?tasks?|task[._-]?risk[._-]?scenario[._-]?coverage|task[._-]?triple|risk[._-]?scenario[._-]?task|task[._-]?intel[._-]?readiness)\b/i;

export function isTrsscenQuery(t) {
  return TRSSCEN_RE.test(t || '');
}

function normaliseTasks(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'tasks', 'entities', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseRiskSignals(raw) {
  if (!raw) return [];
  const arr = ['risk_signals', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((s, i) => ({
    id:          s.id || String(i),
    name:        s.name || s.title || s.signal || `Signal ${i + 1}`,
    category:    s.category || s.type || '',
    severity:    s.severity || s.level || 'medium',
    description: String(s.description || s.summary || s.details || '').slice(0, 300),
    tags:        Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
  }));
}

function normaliseScenarios(raw) {
  if (!raw) return [];
  const arr = ['scenarios', 'items', 'results', 'data', 'entities'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((s, i) => ({
    id:          s.id || String(i),
    name:        s.name || s.title || `Scenario ${i + 1}`,
    status:      s.status || s.state || '',
    category:    s.category || s.type || '',
    description: String(s.description || s.summary || s.objective || '').slice(0, 300),
    tags:        Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(taskToks, other) {
  const otherToks = [
    ...tokens(other.name),
    ...tokens(other.description),
    ...tokens(other.category),
    ...tokens(other.tags),
  ].filter(Boolean);
  if (!taskToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (taskToks.has(t)) hits++;
  return hits / Math.max(taskToks.size, otherToks.length);
}

function correlate(tasks, risks, scenarios) {
  return tasks.map(task => {
    const taskToks = new Set([
      ...tokens(task.name),
      ...tokens(task.title),
      ...tokens(task.description),
      ...tokens(task.mission),
      ...tokens(task.priority),
      ...tokens(Array.isArray(task.tags) ? task.tags.join(' ') : (task.tags || '')),
    ].filter(Boolean));

    const matchedRisks = risks
      .map(r => ({ ...r, _score: matchScore(taskToks, r) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedScenarios = scenarios
      .map(s => ({ ...s, _score: matchScore(taskToks, s) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasRisk = matchedRisks.length > 0;
    const hasScen = matchedScenarios.length > 0;

    let coverage;
    if (hasRisk && hasScen) coverage = 'FULLY PREPARED';
    else if (hasRisk && !hasScen) coverage = 'RISK-ALIGNED';
    else if (!hasRisk && hasScen) coverage = 'SCRIPTED';
    else coverage = 'ISOLATED';

    return { ...task, _risks: matchedRisks, _scenarios: matchedScenarios, _coverage: coverage };
  });
}

export async function buildTrsscenScript() {
  const [taskR, rskR, scnR] = await Promise.allSettled([
    fetch(`${API}/entities/Task`).then(r => r.json()),
    fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`).then(r => r.json()),
  ]);
  const tasks     = normaliseTasks(taskR.status === 'fulfilled' ? taskR.value : []);
  const risks     = normaliseRiskSignals(rskR.status === 'fulfilled' ? rskR.value : []);
  const scenarios = normaliseScenarios(scnR.status === 'fulfilled' ? scnR.value : []);
  const enriched  = correlate(tasks, risks, scenarios);
  const fp  = enriched.filter(t => t._coverage === 'FULLY PREPARED').length;
  const ra  = enriched.filter(t => t._coverage === 'RISK-ALIGNED').length;
  const sc  = enriched.filter(t => t._coverage === 'SCRIPTED').length;
  const iso = enriched.filter(t => t._coverage === 'ISOLATED').length;
  return (
    `Task × Risk × Scenario Triple Coverage: ${tasks.length} tasks analysed against ${risks.length} risk signals and ${scenarios.length} scenarios. ` +
    `${fp} tasks are FULLY PREPARED (risk-aligned + scenario-backed); ${ra} are RISK-ALIGNED only; ` +
    `${sc} are SCRIPTED only; ${iso} are ISOLATED (no backing — operational gap). ` +
    `Top isolated tasks: ${enriched.filter(t => t._coverage === 'ISOLATED').slice(0, 3).map(t => t.name || t.title || t.id || '?').join(', ') || 'none'}.`
  );
}

const PANEL_W = 620;
const PANEL_H = 580;
const CY = '#00CFFF';
const GR = '#22C55E';
const AM = '#F59E0B';
const RD = '#EF4444';
const PU = '#A78BFA';
const LM = '#84CC16';

const COVERAGE_COLOR = {
  'FULLY PREPARED': GR,
  'RISK-ALIGNED':   AM,
  'SCRIPTED':       CY,
  'ISOLATED':       RD,
};

const chip = (label, color = CY) => (
  <span style={{
    display: 'inline-block', padding: '1px 7px', borderRadius: 4,
    border: `1px solid ${color}44`, background: `${color}14`,
    color, fontSize: 10, letterSpacing: 1, marginRight: 4,
  }}>{label}</span>
);

const scorebar = (score, color = CY) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
    <div style={{ width: 56, height: 4, background: '#1a2535', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: color, borderRadius: 2 }} />
    </div>
    <span style={{ color: '#6E8AA0', fontSize: 10 }}>{(score * 100).toFixed(0)}%</span>
  </div>
);

const TABS = ['ALL', 'FULLY PREPARED', 'RISK-ALIGNED', 'SCRIPTED', 'ISOLATED'];

export default function TaskRiskScenarioTripleCoverage() {
  const [open, setOpen]       = useState(false);
  const [tasks, setTasks]     = useState([]);
  const [risks, setRisks]     = useState([]);
  const [scenarios, setScen]  = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab]         = useState('ALL');
  const [search, setSearch]   = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [taskR, rskR, scnR] = await Promise.allSettled([
        fetch(`${API}/entities/Task`).then(r => r.json()),
        fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`).then(r => r.json()),
      ]);
      setTasks(normaliseTasks(taskR.status === 'fulfilled' ? taskR.value : []));
      setRisks(normaliseRiskSignals(rskR.status === 'fulfilled' ? rskR.value : []));
      setScen(normaliseScenarios(scnR.status === 'fulfilled' ? scnR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:trsscen-toggle', onToggle);
    return () => window.removeEventListener('jarvis:trsscen-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 90000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched       = correlate(tasks, risks, scenarios);
  const fullyPrepared  = enriched.filter(t => t._coverage === 'FULLY PREPARED');
  const riskAligned    = enriched.filter(t => t._coverage === 'RISK-ALIGNED');
  const scripted       = enriched.filter(t => t._coverage === 'SCRIPTED');
  const isolated       = enriched.filter(t => t._coverage === 'ISOLATED');
  const badgeCount     = isolated.length;
  const badgeColor     = badgeCount > 0 ? RD : GR;

  const filtered = enriched
    .filter(t => tab === 'ALL' || t._coverage === tab)
    .filter(t => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        String(t.name    || '').toLowerCase().includes(s) ||
        String(t.title   || '').toLowerCase().includes(s) ||
        String(t.mission || '').toLowerCase().includes(s)
      );
    });

  async function assess() {
    setAssessing(true);
    setBrief('');
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({
          message:
            `Task × Risk Signal × Scenario Triple Coverage analysis: ${tasks.length} tasks, ${risks.length} risk signals, ${scenarios.length} scenarios. ` +
            `${fullyPrepared.length} tasks are FULLY PREPARED (both risk-aligned and scenario-backed); ` +
            `${riskAligned.length} are RISK-ALIGNED only (no scenario response plan); ` +
            `${scripted.length} are SCRIPTED only (no risk signal linkage); ` +
            `${isolated.length} are ISOLATED (no risk or scenario backing — full operational gap). ` +
            `Give a 2-sentence triple-coverage mission readiness brief highlighting the most critical gap and strongest coverage area.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const label = t => t.name || t.title || t.id || '?';

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Task × Risk × Scenario Triple Coverage (TRSSCEN)"
        style={{
          position: 'fixed', left: 711520, bottom: 8, zIndex: 299,
          width: 64, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ TRSSCEN
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
          width: PANEL_W, height: PANEL_H, zIndex: 9210,
          background: 'rgba(6,10,18,0.97)', border: `1px solid ${CY}33`,
          borderRadius: 12, backdropFilter: 'blur(16px)',
          boxShadow: `0 0 60px ${CY}22`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${CY}22`,
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700, textShadow: `0 0 12px ${CY}` }}>
              ◈ TASK × RISK × SCENARIO TRIPLE COVERAGE
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {loading && <span style={{ color: '#6E8AA0', fontSize: 10 }}>loading…</span>}
              <button
                onClick={assess}
                disabled={assessing}
                style={{
                  padding: '2px 8px', borderRadius: 3, border: `1px solid ${CY}55`,
                  background: 'transparent', color: CY, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                }}
              >{assessing ? 'assessing…' : '▶ ASSESS'}</button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14, padding: 0 }}
              >✕</button>
            </span>
          </div>

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 6, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'TASKS',          val: tasks.length,         col: CY },
              { label: 'RISK SIGNALS',   val: risks.length,         col: AM },
              { label: 'SCENARIOS',      val: scenarios.length,     col: PU },
              { label: 'FULLY PREPARED', val: fullyPrepared.length, col: GR },
              { label: 'ISOLATED',       val: isolated.length,      col: RD },
            ].map(({ label: l, val, col }) => (
              <div key={l} style={{
                flex: 1, background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 6, padding: '5px 6px', textAlign: 'center',
              }}>
                <div style={{ color: col, fontSize: 15, fontWeight: 700 }}>{val}</div>
                <div style={{ color: '#6E8AA0', fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>

          {/* Coverage breakdown bar */}
          {enriched.length > 0 && (
            <div style={{ padding: '0 14px 8px', flexShrink: 0 }}>
              <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 1 }}>
                {[
                  { count: fullyPrepared.length, color: GR },
                  { count: riskAligned.length,   color: AM },
                  { count: scripted.length,       color: CY },
                  { count: isolated.length,       color: RD },
                ].map(({ count, color }, i) => (
                  <div key={i} style={{
                    flex: count, background: color, minWidth: count > 0 ? 2 : 0,
                    opacity: 0.8,
                  }} />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                {[
                  { label: 'FULLY PREPARED', color: GR, count: fullyPrepared.length },
                  { label: 'RISK-ALIGNED',   color: AM, count: riskAligned.length },
                  { label: 'SCRIPTED',        color: CY, count: scripted.length },
                  { label: 'ISOLATED',        color: RD, count: isolated.length },
                ].map(({ label: l, color, count }) => (
                  <span key={l} style={{ color: '#6E8AA0', fontSize: 9 }}>
                    <span style={{ color }}>{count}</span> {l}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Filter tabs + search */}
          <div style={{ display: 'flex', gap: 4, padding: '0 14px 8px', flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '2px 8px', borderRadius: 3, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                  border: `1px solid ${tab === t ? (COVERAGE_COLOR[t] || CY) : '#2a3a4a'}`,
                  background: tab === t ? `${(COVERAGE_COLOR[t] || CY)}22` : 'transparent',
                  color: tab === t ? (COVERAGE_COLOR[t] || CY) : '#6E8AA0',
                }}
              >{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search tasks…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.03)', border: `1px solid #2a3a4a`,
                borderRadius: 4, color: '#DCEBF5', padding: '2px 8px', fontSize: 10, outline: 'none',
                fontFamily: "'JetBrains Mono',monospace", width: 140,
              }}
            />
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>
            {filtered.length === 0 ? (
              <div style={{ color: '#6E8AA0', fontSize: 11, textAlign: 'center', paddingTop: 40 }}>
                {loading ? 'Loading…' : 'No tasks found.'}
              </div>
            ) : filtered.map((task, i) => {
              const isExp   = expanded === i;
              const covClr  = COVERAGE_COLOR[task._coverage] || CY;
              return (
                <div
                  key={task.id || i}
                  style={{ borderBottom: `1px solid ${CY}11`, paddingBottom: 6, marginBottom: 6 }}
                >
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 0' }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', background: covClr,
                      boxShadow: `0 0 6px ${covClr}`, flexShrink: 0,
                    }} />
                    <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1 }}>{label(task)}</span>
                    {task.priority && chip(String(task.priority).toUpperCase(), covClr)}
                    {chip(task._coverage, covClr)}
                    <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 'auto' }}>
                      {isExp ? '▲' : '▼'}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 14, paddingTop: 4, display: 'flex', gap: 12 }}>
                      {/* Risk signals */}
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          RISK SIGNALS ({task._risks.length})
                        </div>
                        {task._risks.length > 0 ? task._risks.map((r, j) => (
                          <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                            <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>{r.name || r.id || '?'}</span>
                            {r.severity && chip(r.severity.toUpperCase(), AM)}
                            {scorebar(r._score, AM)}
                          </div>
                        )) : (
                          <div style={{ color: RD, fontSize: 10 }}>No risk signals matched.</div>
                        )}
                      </div>
                      {/* Scenarios */}
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          SCENARIOS ({task._scenarios.length})
                        </div>
                        {task._scenarios.length > 0 ? task._scenarios.map((s, j) => (
                          <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                            <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>{s.name || s.id || '?'}</span>
                            {s.status && chip(s.status, PU)}
                            {scorebar(s._score, PU)}
                          </div>
                        )) : (
                          <div style={{ color: AM, fontSize: 10 }}>No scenarios matched.</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Brief block */}
          {brief && (
            <div style={{
              padding: '8px 14px', borderTop: `1px solid ${CY}22`,
              color: '#DCEBF5', fontSize: 11, lineHeight: 1.5, flexShrink: 0,
              background: 'rgba(0,207,255,0.03)',
            }}>
              <span style={{ color: CY, fontSize: 9, letterSpacing: 2 }}>ASSESS ▸ </span>{brief}
            </div>
          )}
        </div>
      )}
    </>
  );
}
