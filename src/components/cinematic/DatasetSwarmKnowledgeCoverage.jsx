/**
 * DatasetSwarmKnowledgeCoverage — F314 / backlog F31
 *
 * Fetches /v1/datasets + /entities/SwarmJob + /knowledge/
 * Keyword-matches each dataset against running swarm jobs and knowledge articles
 * to classify datasets as:
 *   PROCESSING  — matched to an active/running SwarmJob
 *   DOCUMENTED  — matched to a knowledge article (no active job)
 *   ORPHAN      — no match to either
 *
 * Toggle: ◈ DSKPROD button (left:66280, bottom:8, zIndex:127)
 * Stat tiles: datasets / processing / documented / orphan
 * Amber pulse on orphan count.
 * Expandable rows: matched swarm jobs + matched knowledge articles.
 * Filter tabs: ALL / PROCESSING / DOCUMENTED / ORPHAN + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "dataset production"/"dataset coverage"/"dataset swarm"/"orphan datasets"/"dskprod"
 * Event: jarvis:dskprod-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'PROCESSING', 'DOCUMENTED', 'ORPHAN'];

const CLS_COLOR = {
  PROCESSING: '#22c55e',
  DOCUMENTED: '#29E7FF',
  ORPHAN:     '#FFB830',
};

const PULSE_CSS = `@keyframes dskprod-pulse { 0%,100%{opacity:1}50%{opacity:0.3} }`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}
function classifyDataset(dsToks, jobs, knowledge) {
  const matchedJobs = jobs.filter(j => {
    const active = /active|running|processing|in.?progress/i.test(j.status || '');
    const nameOverlap = overlaps(dsToks, [j.name, j.job_type, j.description].join(' '));
    return active && nameOverlap;
  });
  if (matchedJobs.length > 0) return { cls: 'PROCESSING', matchedJobs, matchedKnowledge: [] };

  const matchedKnowledge = knowledge.filter(k =>
    overlaps(dsToks, [k.title, k.topic, k.tags].join(' '))
  );
  if (matchedKnowledge.length > 0) return { cls: 'DOCUMENTED', matchedJobs: [], matchedKnowledge };

  return { cls: 'ORPHAN', matchedJobs: [], matchedKnowledge: [] };
}

export function isDskprodQuery(q) {
  return /\b(dataset production|dataset coverage|dataset swarm|orphan dataset|dskprod|unprocessed dataset|dataset knowledge)\b/i.test(q);
}
export function buildDskprodScript() {
  return 'Opening Dataset Production Coverage Matrix. Cross-referencing datasets against active swarm jobs and knowledge articles to identify orphan datasets with no processing or documentation coverage.';
}

export default function DatasetSwarmKnowledgeCoverage() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [jobCount, setJobCount]   = useState(0);
  const [knowCount, setKnowCount] = useState(0);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const intervalRef               = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [dsRes, jobRes, knowRes] = await Promise.all([
        fetch(`${API}/v1/datasets`,       { headers: hdr }),
        fetch(`${API}/entities/SwarmJob`, { headers: hdr }),
        fetch(`${API}/knowledge/`,        { headers: hdr }),
      ]);

      const dsList  = await dsRes.json().catch(() => []);
      const jobList = await jobRes.json().catch(() => []);
      const knowList= await knowRes.json().catch(() => []);

      const datasets  = Array.isArray(dsList)  ? dsList  : (dsList.datasets  || dsList.items  || []);
      const jobs      = Array.isArray(jobList) ? jobList : (jobList.swarm_jobs|| jobList.items || []);
      const knowledge = Array.isArray(knowList)? knowList: (knowList.articles || knowList.items|| []);

      setJobCount(jobs.length);
      setKnowCount(knowledge.length);

      const classified = datasets.map(ds => {
        const label = [ds.name, ds.title, ds.description, ds.dataset_type].join(' ');
        const dsToks = tokens(label);
        const { cls, matchedJobs, matchedKnowledge } = classifyDataset(dsToks, jobs, knowledge);
        return { ...ds, _cls: cls, _jobs: matchedJobs, _knowledge: matchedKnowledge, _label: label };
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
    window.addEventListener('jarvis:dskprod-toggle', handler);
    return () => window.removeEventListener('jarvis:dskprod-toggle', handler);
  }, []);

  const counts = {
    PROCESSING: rows.filter(r => r._cls === 'PROCESSING').length,
    DOCUMENTED: rows.filter(r => r._cls === 'DOCUMENTED').length,
    ORPHAN:     rows.filter(r => r._cls === 'ORPHAN').length,
  };

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r._label.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const total   = rows.length;
    const orphans = counts.ORPHAN;
    const proc    = counts.PROCESSING;
    const doc     = counts.DOCUMENTED;
    const prompt  = `JARVIS dataset production coverage assessment: ${total} datasets total. ${proc} actively processing via swarm jobs, ${doc} documented in knowledge base, ${orphans} orphaned with no coverage. Provide a 2-sentence operational briefing on dataset health and the highest-priority action.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json().catch(() => ({}));
      const text = d.response || d.message || d.reply || d.content || 'Assessment complete.';
      setAssessment(text);
      if (window.speechSynthesis) {
        const utt = new SpeechSynthesisUtterance(text);
        window.speechSynthesis.speak(utt);
      }
    } catch { setAssessment('Assessment unavailable.'); }
    finally { setAssessing(false); }
  };

  const panel = open ? (
    <div style={{
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%,-50%)',
      width: 680, maxHeight: '85vh',
      background: 'rgba(6,18,32,0.98)',
      border: '1px solid #1A4A6A',
      borderRadius: 10, zIndex: 9200,
      display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#C8E6FA',
      boxShadow: '0 0 40px rgba(0,200,255,0.12)',
      overflow: 'hidden',
    }}>
      <style>{PULSE_CSS}</style>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: '1px solid #1A4A6A',
        background: 'rgba(0,40,70,0.7)', flexShrink: 0,
      }}>
        <span style={{ color: '#29E7FF', fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>
          ◈ DATASET PRODUCTION COVERAGE
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
          { label: 'DATASETS',   val: rows.length,       color: '#29E7FF' },
          { label: 'PROCESSING', val: counts.PROCESSING,  color: '#22c55e' },
          { label: 'DOCUMENTED', val: counts.DOCUMENTED,  color: '#29E7FF' },
          { label: 'ORPHAN',     val: counts.ORPHAN,      color: '#FFB830',
            pulse: counts.ORPHAN > 0 },
          { label: 'SWARM JOBS', val: jobCount,           color: '#9F7AEA' },
          { label: 'KNOWLEDGE',  val: knowCount,          color: '#60A5FA' },
        ].map(t => (
          <div key={t.label} style={{
            flex: 1, background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${t.color}33`,
            borderRadius: 6, padding: '6px 4px', textAlign: 'center',
            animation: t.pulse ? 'dskprod-pulse 1.5s infinite' : 'none',
          }}>
            <div style={{ color: t.color, fontSize: 16, fontWeight: 700 }}>{t.val}</div>
            <div style={{ color: '#6A8BA0', fontSize: 9, letterSpacing: 1 }}>{t.label}</div>
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
          placeholder="search datasets…"
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
          <div style={{ color: '#6A8BA0', fontSize: 11, padding: 10 }}>No datasets match.</div>
        )}
        {visible.map((ds, i) => {
          const id   = ds.id || ds.dataset_id || ds.name || i;
          const name = ds.name || ds.title || ds.dataset_id || `Dataset #${i+1}`;
          const type = ds.dataset_type || ds.type || '';
          const isExp = expanded === id;
          const cls   = ds._cls;
          const cc    = CLS_COLOR[cls];
          return (
            <div key={id} style={{
              borderBottom: '1px solid #0D2A3E', paddingBottom: 6, marginBottom: 4,
            }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  cursor: 'pointer', padding: '4px 0',
                }}
              >
                <span style={{
                  background: `${cc}22`, border: `1px solid ${cc}88`,
                  color: cc, fontSize: 9, padding: '1px 6px', borderRadius: 10,
                  minWidth: 80, textAlign: 'center', letterSpacing: 1,
                }}>
                  {cls}
                </span>
                <span style={{ flex: 1, fontSize: 11, color: '#C8E6FA' }}>{name}</span>
                {type && (
                  <span style={{ color: '#6A8BA0', fontSize: 9 }}>{type}</span>
                )}
                <span style={{ color: '#4A6A7A', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '6px 8px', background: 'rgba(0,0,0,0.3)', borderRadius: 4, fontSize: 10 }}>
                  {ds.description && (
                    <div style={{ color: '#8AA', marginBottom: 6 }}>{ds.description}</div>
                  )}
                  {ds._jobs.length > 0 && (
                    <div>
                      <div style={{ color: '#22c55e', fontWeight: 700, marginBottom: 3 }}>
                        SWARM JOBS ({ds._jobs.length})
                      </div>
                      {ds._jobs.map((j, ji) => (
                        <div key={ji} style={{
                          display: 'flex', gap: 6, padding: '2px 0',
                          borderBottom: '1px solid #0D2A3E',
                        }}>
                          <span style={{
                            background: '#22c55e22', border: '1px solid #22c55e88',
                            color: '#22c55e', fontSize: 9, padding: '1px 4px', borderRadius: 8,
                          }}>{j.status || 'running'}</span>
                          <span style={{ color: '#C8E6FA' }}>{j.name || j.job_type || `Job ${ji+1}`}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {ds._knowledge.length > 0 && (
                    <div style={{ marginTop: ds._jobs.length > 0 ? 6 : 0 }}>
                      <div style={{ color: '#29E7FF', fontWeight: 700, marginBottom: 3 }}>
                        KNOWLEDGE ARTICLES ({ds._knowledge.length})
                      </div>
                      {ds._knowledge.map((k, ki) => (
                        <div key={ki} style={{
                          display: 'flex', gap: 6, padding: '2px 0',
                          borderBottom: '1px solid #0D2A3E',
                        }}>
                          <span style={{
                            background: '#29E7FF22', border: '1px solid #29E7FF88',
                            color: '#29E7FF', fontSize: 9, padding: '1px 4px', borderRadius: 8,
                          }}>{k.topic || k.type || 'article'}</span>
                          <span style={{ color: '#C8E6FA' }}>{k.title || `Article ${ki+1}`}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {ds._jobs.length === 0 && ds._knowledge.length === 0 && (
                    <div style={{ color: '#FFB830' }}>
                      No swarm jobs or knowledge articles matched. Dataset is ORPHAN.
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
        title="Dataset Production Coverage Matrix"
        style={{
          position: 'fixed', left: 66280, bottom: 8, zIndex: 127,
          background: open ? 'rgba(41,231,255,0.18)' : 'rgba(6,18,32,0.85)',
          border: `1px solid ${open ? '#29E7FF' : '#1A4A6A'}`,
          color: open ? '#29E7FF' : '#4A8A9A',
          fontSize: 9, padding: '3px 8px', borderRadius: 4,
          cursor: 'pointer', letterSpacing: 1, fontFamily: 'monospace',
          transition: 'all 0.2s',
        }}
      >
        ◈ DSKPROD
      </button>
      {panel}
    </>
  );
}
