/**
 * ScenarioDatasetSkillReadiness — F33
 *
 * Fetches /v1/scenario/list + /v1/datasets + /v1/aip/skill
 * Keyword-matches each scenario against available datasets AND AIP skills to
 * classify execution readiness as:
 *   READY   — matched to both a dataset AND a skill
 *   SKILLED — matched to a skill only (no dataset backing)
 *   DATAD   — matched to a dataset only (no skill coverage)
 *   BLOCKED — no dataset and no skill match
 *
 * Toggle: ◈ SCNRDY button (left:67400, bottom:8, zIndex:129)
 * Stat tiles: scenarios / ready / skilled / datad / blocked
 * Amber pulse on BLOCKED count.
 * Expandable rows: matched skills + matched datasets.
 * Filter tabs: ALL / READY / SKILLED / DATAD / BLOCKED + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "scenario readiness"/"scenario dataset skill"/"execution readiness"/"scnrdy"/"blocked scenarios"/"scenario coverage"
 * Event: jarvis:scnrdy-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'READY', 'SKILLED', 'DATAD', 'BLOCKED'];

const CLS_COLOR = {
  READY:   '#22c55e',
  SKILLED: '#29E7FF',
  DATAD:   '#9F7AEA',
  BLOCKED: '#FFB830',
};

const PULSE_CSS = `@keyframes scnrdy-pulse { 0%,100%{opacity:1}50%{opacity:0.3} }`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}
function classifyScenario(scnToks, datasets, skills) {
  const matchedDatasets = datasets.filter(ds =>
    overlaps(scnToks, [ds.name, ds.title, ds.description, ds.dataset_type, ds.tags].join(' '))
  );
  const matchedSkills = skills.filter(sk =>
    overlaps(scnToks, [sk.name, sk.description, sk.tags, sk.capability, sk.domain].join(' '))
  );
  if (matchedDatasets.length > 0 && matchedSkills.length > 0)
    return { cls: 'READY', matchedDatasets, matchedSkills };
  if (matchedSkills.length > 0)
    return { cls: 'SKILLED', matchedDatasets: [], matchedSkills };
  if (matchedDatasets.length > 0)
    return { cls: 'DATAD', matchedDatasets, matchedSkills: [] };
  return { cls: 'BLOCKED', matchedDatasets: [], matchedSkills: [] };
}

export function isScnrdyQuery(q) {
  return /\b(scenario readiness|scenario dataset skill|execution readiness|scnrdy|blocked scenario|scenario coverage|scenario skill|scenario dataset)\b/i.test(q);
}
export function buildScnrdyScript() {
  return 'Opening Scenario Execution Readiness Grid. Cross-referencing scenarios against available datasets and AIP skills to surface blocked scenarios with no data or skill support.';
}

export default function ScenarioDatasetSkillReadiness() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [datasetCount, setDsCount]  = useState(0);
  const [skillCount, setSkCount]    = useState(0);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const intervalRef                 = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [scnRes, dsRes, skRes] = await Promise.all([
        fetch(`${API}/v1/scenario/list`, { headers: hdr }),
        fetch(`${API}/v1/datasets`,      { headers: hdr }),
        fetch(`${API}/v1/aip/skill`,     { headers: hdr }),
      ]);

      const scnRaw = await scnRes.json().catch(() => []);
      const dsRaw  = await dsRes.json().catch(() => []);
      const skRaw  = await skRes.json().catch(() => []);

      const scenarios = Array.isArray(scnRaw) ? scnRaw : (scnRaw.scenarios || scnRaw.items || []);
      const datasets  = Array.isArray(dsRaw)  ? dsRaw  : (dsRaw.datasets   || dsRaw.items  || []);
      const skills    = Array.isArray(skRaw)  ? skRaw  : (skRaw.skills     || skRaw.items  || []);

      setDsCount(datasets.length);
      setSkCount(skills.length);

      const classified = scenarios.map(scn => {
        const label = [scn.name, scn.title, scn.description, scn.type, scn.tags, scn.params].join(' ');
        const scnToks = tokens(label);
        const { cls, matchedDatasets, matchedSkills } = classifyScenario(scnToks, datasets, skills);
        return { ...scn, _cls: cls, _datasets: matchedDatasets, _skills: matchedSkills, _label: label };
      });

      setRows(classified);
    } catch (e) {
      setError(e.message || 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    intervalRef.current = setInterval(fetchData, 90_000);
    return () => clearInterval(intervalRef.current);
  }, [open, fetchData]);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:scnrdy-toggle', handler);
    return () => window.removeEventListener('jarvis:scnrdy-toggle', handler);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    const counts = { READY: 0, SKILLED: 0, DATAD: 0, BLOCKED: 0 };
    rows.forEach(r => { counts[r._cls] = (counts[r._cls] || 0) + 1; });
    const prompt = `Scenario execution readiness: ${rows.length} scenarios. READY: ${counts.READY}, SKILLED: ${counts.SKILLED}, DATAD: ${counts.DATAD}, BLOCKED: ${counts.BLOCKED}. In 2 sentences, identify the highest-risk blocked scenarios and recommend actions.`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json().catch(() => ({}));
      const text = data.response || data.message || data.content || JSON.stringify(data);
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (e) {
      setAssessment(`Assessment error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  }, [rows]);

  const counts = { READY: 0, SKILLED: 0, DATAD: 0, BLOCKED: 0 };
  rows.forEach(r => { counts[r._cls] = (counts[r._cls] || 0) + 1; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search && !r._label.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const panel = open ? (
    <div style={{
      position: 'fixed', right: 20, bottom: 48, zIndex: 129,
      width: 480, maxHeight: '70vh',
      background: 'rgba(4,14,26,0.97)',
      border: '1px solid #1A4A6A', borderRadius: 8,
      display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#C8E6FA',
      boxShadow: '0 0 24px rgba(41,231,255,0.15)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 14px', borderBottom: '1px solid #1A4A6A',
        background: 'rgba(0,40,70,0.7)', flexShrink: 0,
      }}>
        <span style={{ color: '#29E7FF', fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>
          ◈ SCENARIO EXECUTION READINESS
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={fetchData} disabled={loading}
            style={{ background: 'none', border: '1px solid #29E7FF', color: '#29E7FF',
              fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer' }}>
            ▶ REFRESH
          </button>
          <button onClick={assess} disabled={assessing}
            style={{ background: 'none', border: '1px solid #00E5A0', color: '#00E5A0',
              fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer' }}>
            {assessing ? '...' : '▶ ASSESS'}
          </button>
          <button onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', color: '#8AA', fontSize: 16, cursor: 'pointer' }}>
            ✕
          </button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexShrink: 0 }}>
        {[
          { label: 'SCENARIOS', val: rows.length,        color: '#29E7FF' },
          { label: 'READY',     val: counts.READY,       color: '#22c55e' },
          { label: 'SKILLED',   val: counts.SKILLED,     color: '#29E7FF' },
          { label: 'DATAD',     val: counts.DATAD,       color: '#9F7AEA' },
          { label: 'BLOCKED',   val: counts.BLOCKED,     color: '#FFB830',
            pulse: counts.BLOCKED > 0 },
          { label: 'DATASETS',  val: datasetCount,       color: '#60A5FA' },
          { label: 'SKILLS',    val: skillCount,         color: '#00E5A0' },
        ].map(t => (
          <div key={t.label} style={{
            flex: 1, background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${t.color}33`,
            borderRadius: 6, padding: '6px 4px', textAlign: 'center',
            animation: t.pulse ? 'scnrdy-pulse 1.5s infinite' : 'none',
          }}>
            <div style={{ color: t.color, fontSize: 14, fontWeight: 700 }}>{t.val}</div>
            <div style={{ color: '#6A8BA0', fontSize: 8, letterSpacing: 1 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              background: tab === t ? '#29E7FF22' : 'none',
              border: `1px solid ${tab === t ? '#29E7FF' : '#1A4A6A'}`,
              color: tab === t ? '#29E7FF' : '#6A8BA0',
              fontSize: 10, padding: '3px 10px', borderRadius: 12, cursor: 'pointer',
            }}>
            {t}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search scenarios…"
          style={{
            marginLeft: 'auto', background: 'rgba(255,255,255,0.04)',
            border: '1px solid #1A4A6A', color: '#C8E6FA',
            fontSize: 10, padding: '3px 8px', borderRadius: 4,
          }}
        />
      </div>

      {/* Rows */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 14px 10px' }}>
        {loading && <div style={{ color: '#6A8BA0', fontSize: 11, padding: 10 }}>Loading…</div>}
        {error   && <div style={{ color: '#ef4444', fontSize: 11, padding: 10 }}>{error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div style={{ color: '#6A8BA0', fontSize: 11, padding: 10 }}>No scenarios match.</div>
        )}
        {visible.map((scn, i) => {
          const id   = scn.id || scn.scenario_id || scn.name || i;
          const name = scn.name || scn.title || scn.scenario_id || `Scenario #${i + 1}`;
          const type = scn.type || scn.scenario_type || '';
          const isExp = expanded === id;
          const cls  = scn._cls;
          const cc   = CLS_COLOR[cls];
          return (
            <div key={id} style={{ borderBottom: '1px solid #0D2A3E', paddingBottom: 6, marginBottom: 4 }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 0' }}
              >
                <span style={{
                  background: `${cc}22`, border: `1px solid ${cc}88`,
                  color: cc, fontSize: 9, padding: '1px 6px', borderRadius: 10,
                  minWidth: 60, textAlign: 'center', letterSpacing: 1,
                }}>
                  {cls}
                </span>
                <span style={{ flex: 1, fontSize: 11, color: '#C8E6FA' }}>{name}</span>
                {type && <span style={{ color: '#6A8BA0', fontSize: 9 }}>{type}</span>}
                <span style={{ color: '#4A6A7A', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '6px 8px', background: 'rgba(0,0,0,0.3)', borderRadius: 4, fontSize: 10 }}>
                  {scn.description && (
                    <div style={{ color: '#8AA', marginBottom: 6 }}>{scn.description}</div>
                  )}
                  {scn._skills.length > 0 && (
                    <div>
                      <div style={{ color: '#00E5A0', fontWeight: 700, marginBottom: 3 }}>
                        AIP SKILLS ({scn._skills.length})
                      </div>
                      {scn._skills.map((sk, si) => (
                        <div key={si} style={{ display: 'flex', gap: 6, padding: '2px 0', borderBottom: '1px solid #0D2A3E' }}>
                          <span style={{
                            background: '#00E5A022', border: '1px solid #00E5A088',
                            color: '#00E5A0', fontSize: 9, padding: '1px 4px', borderRadius: 8,
                          }}>{sk.domain || sk.capability || 'skill'}</span>
                          <span style={{ color: '#C8E6FA' }}>{sk.name || `Skill ${si + 1}`}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {scn._datasets.length > 0 && (
                    <div style={{ marginTop: scn._skills.length > 0 ? 6 : 0 }}>
                      <div style={{ color: '#9F7AEA', fontWeight: 700, marginBottom: 3 }}>
                        DATASETS ({scn._datasets.length})
                      </div>
                      {scn._datasets.map((ds, di) => (
                        <div key={di} style={{ display: 'flex', gap: 6, padding: '2px 0', borderBottom: '1px solid #0D2A3E' }}>
                          <span style={{
                            background: '#9F7AEA22', border: '1px solid #9F7AEA88',
                            color: '#9F7AEA', fontSize: 9, padding: '1px 4px', borderRadius: 8,
                          }}>{ds.dataset_type || ds.type || 'dataset'}</span>
                          <span style={{ color: '#C8E6FA' }}>{ds.name || ds.title || `Dataset ${di + 1}`}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {scn._skills.length === 0 && scn._datasets.length === 0 && (
                    <div style={{ color: '#FFB830' }}>
                      No matching skills or datasets found. Scenario is BLOCKED.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assessment */}
      {assessment && (
        <div style={{
          flexShrink: 0, padding: '8px 14px', borderTop: '1px solid #1A4A6A',
          background: 'rgba(0,40,70,0.7)', fontSize: 11, color: '#00E5A0',
          maxHeight: 80, overflowY: 'auto',
        }}>
          {assessment}
        </div>
      )}
    </div>
  ) : null;

  return (
    <>
      <style>{PULSE_CSS}</style>
      <button
        onClick={() => setOpen(o => !o)}
        title="Scenario Execution Readiness Grid"
        style={{
          position: 'fixed', left: 67400, bottom: 8, zIndex: 129,
          background: open ? 'rgba(41,231,255,0.18)' : 'rgba(6,18,32,0.85)',
          border: `1px solid ${open ? '#29E7FF' : '#1A4A6A'}`,
          color: open ? '#29E7FF' : '#4A8A9A',
          fontSize: 9, padding: '3px 8px', borderRadius: 4,
          cursor: 'pointer', letterSpacing: 1, fontFamily: 'monospace',
          transition: 'all 0.2s',
        }}
      >
        ◈ SCNRDY
      </button>
      {panel}
    </>
  );
}
