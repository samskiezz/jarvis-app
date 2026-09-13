import { useState, useEffect, useCallback } from 'react';

const API = '';
const SJRP_RE = /\b(swarm[._-]?report|report[._-]?swarm|sjrp|swarm[._-]?job[._-]?report|undocumented[._-]?swarm|swarm[._-]?report[._-]?coverage|which[._-]?swarm[._-]?jobs[._-]?have[._-]?reports|swarm[._-]?job[._-]?report[._-]?gap|swarm[._-]?documentation)\b/i;

export function isSwarmJobRptQuery(t) {
  return SJRP_RE.test(t || '');
}

export async function buildSwarmJobRptScript() {
  const [jobR, rptR] = await Promise.allSettled([
    fetch(`${API}/entities/SwarmJob`).then(r => r.json()),
    fetch(`${API}/v1/reports`).then(r => r.json()),
  ]);
  const jobs = normaliseJobs(jobR.status === 'fulfilled' ? jobR.value : []);
  const reports = normaliseReports(rptR.status === 'fulfilled' ? rptR.value : []);
  const enriched = correlate(jobs, reports);
  const covered = enriched.filter(j => j._linked).length;
  const undocumented = enriched.length - covered;
  return (
    `SwarmJob × Report Coverage: ${jobs.length} swarm jobs, ${reports.length} reports indexed. ` +
    `${covered} jobs have report documentation; ${undocumented} remain undocumented. ` +
    `Top undocumented: ${enriched.filter(j => !j._linked).slice(0, 4).map(j => j.name || j.kind || j.id || '?').join(', ') || 'none'}.`
  );
}

function normaliseJobs(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['jobs', 'swarm_jobs', 'items', 'results', 'data', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseReports(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['reports', 'items', 'results', 'data', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(job, report) {
  const jToks = new Set([
    ...tokens(job.name),
    ...tokens(job.kind),
    ...tokens(job.target),
    ...tokens(job.description),
    ...tokens(job.type),
    ...tokens(job.status),
  ].filter(Boolean));
  const rToks = [
    ...tokens(report.title),
    ...tokens(report.content),
    ...tokens(report.summary),
    ...tokens(report.tags),
    ...tokens(report.category),
  ].filter(Boolean);
  if (!jToks.size || !rToks.length) return 0;
  let hits = 0;
  for (const t of rToks) if (jToks.has(t)) hits++;
  return hits / Math.max(jToks.size, rToks.length);
}

function correlate(jobs, reports) {
  return jobs.map(job => {
    const scored = reports
      .map(rpt => ({ rpt, score: matchScore(job, rpt) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...job, _linked: scored.length > 0, _matches: scored };
  });
}

const PANEL_W = 580;
const PANEL_H = 560;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const PR = '#A78BFA';
const RD = '#F43F5E';

const KIND_COLOR = { scraper: CY, summarizer: PR, classifier: AM, translator: GR, vision: '#EC4899', research: '#F97316' };
const STATUS_COLOR = { running: GR, done: GR, complete: GR, completed: GR, active: CY, queued: AM, failed: RD, errored: RD, declared: AM };
const RPT_COLOR = { generated: GR, published: GR, final: GR, draft: AM, deprecated: RD };

const chip = (label, color = CY) => (
  <span style={{
    display: 'inline-block', padding: '1px 7px', borderRadius: 4, border: `1px solid ${color}44`,
    background: `${color}14`, color, fontSize: 10, letterSpacing: 1, marginRight: 4,
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

export default function SwarmJobReportCoverage() {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [jobR, rptR] = await Promise.allSettled([
        fetch(`${API}/entities/SwarmJob`).then(r => r.json()),
        fetch(`${API}/v1/reports`).then(r => r.json()),
      ]);
      setJobs(normaliseJobs(jobR.status === 'fulfilled' ? jobR.value : []));
      setReports(normaliseReports(rptR.status === 'fulfilled' ? rptR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:sjrp-toggle', onToggle);
    return () => window.removeEventListener('jarvis:sjrp-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 90000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = correlate(jobs, reports);
  const covered = enriched.filter(j => j._linked);
  const undocumented = enriched.filter(j => !j._linked);
  const badgeCount = undocumented.length;
  const badgeColor = badgeCount > 0 ? AM : GR;

  const filtered = enriched
    .filter(j => tab === 'ALL' || (tab === 'COVERED' ? j._linked : !j._linked))
    .filter(j => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        String(j.name || '').toLowerCase().includes(q) ||
        String(j.kind || '').toLowerCase().includes(q) ||
        String(j.target || '').toLowerCase().includes(q) ||
        String(j.status || '').toLowerCase().includes(q) ||
        String(j.description || '').toLowerCase().includes(q)
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
          message: `You have ${jobs.length} swarm jobs and ${reports.length} reports. ${covered.length} swarm jobs have report documentation; ${undocumented.length} are undocumented. Give a 2-sentence swarm job report coverage brief identifying the most critical documentation gap and which job kinds most urgently need report backing.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const jobLabel = j => j.name || j.kind || j.id || '?';

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="SwarmJob × Report Coverage (SJRP)"
        style={{
          position: 'fixed', left: 798160, bottom: 8, zIndex: 269,
          width: 54, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ SJRP
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
          width: PANEL_W, height: PANEL_H, zIndex: 9203,
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
              ◈ SWARM JOB × REPORT COVERAGE
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
                style={{
                  background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14, padding: 0,
                }}
              >✕</button>
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'SWARM JOBS', val: jobs.length, col: PR },
              { label: 'REPORTS', val: reports.length, col: AM },
              { label: 'COVERED', val: covered.length, col: GR },
              { label: 'UNDOCUMENTED', val: undocumented.length, col: RD },
            ].map(({ label: l, val, col }) => (
              <div key={l} style={{
                flex: 1, background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 6, padding: '6px 8px', textAlign: 'center',
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, alignItems: 'center' }}>
            {['ALL', 'COVERED', 'UNDOCUMENTED'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '2px 10px', borderRadius: 3, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                  border: `1px solid ${tab === t ? AM : '#2a3a4a'}`,
                  background: tab === t ? `${AM}22` : 'transparent',
                  color: tab === t ? AM : '#6E8AA0',
                }}
              >{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search jobs…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.03)', border: `1px solid #2a3a4a`,
                borderRadius: 4, color: '#DCEBF5', padding: '2px 8px', fontSize: 10, outline: 'none',
                fontFamily: "'JetBrains Mono',monospace", width: 160,
              }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>
            {filtered.length === 0 ? (
              <div style={{ color: '#6E8AA0', fontSize: 11, textAlign: 'center', paddingTop: 40 }}>
                {loading ? 'Loading…' : 'No swarm jobs found.'}
              </div>
            ) : filtered.map((job, i) => {
              const isExp = expanded === i;
              const statusColor = job._linked ? GR : RD;
              const kindCol = KIND_COLOR[String(job.kind || '').toLowerCase()] || CY;
              const stCol = STATUS_COLOR[String(job.status || '').toLowerCase()] || CY;
              return (
                <div
                  key={job.id || i}
                  style={{ borderBottom: `1px solid ${AM}11`, paddingBottom: 6, marginBottom: 6 }}
                >
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 0' }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', background: statusColor,
                      boxShadow: `0 0 6px ${statusColor}`, flexShrink: 0,
                    }} />
                    <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1 }}>{jobLabel(job)}</span>
                    {job.kind && chip(job.kind, kindCol)}
                    {job.status && chip(job.status, stCol)}
                    {chip(job._linked ? 'COVERED' : 'UNDOCUMENTED', statusColor)}
                    <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 'auto' }}>
                      {isExp ? '▲' : '▼'}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 14, paddingTop: 4 }}>
                      {job._matches.length > 0 ? (
                        <>
                          <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHED REPORTS
                          </div>
                          {job._matches.map(({ rpt, score }, j) => {
                            const rCol = RPT_COLOR[String(rpt.status || rpt.kind || '').toLowerCase()] || AM;
                            return (
                              <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                {(rpt.status || rpt.kind) && chip(rpt.status || rpt.kind, rCol)}
                                <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>
                                  {rpt.title || rpt.id || '?'}
                                </span>
                                {scorebar(score, GR)}
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <div style={{ color: RD, fontSize: 10 }}>No reports matched this swarm job.</div>
                      )}
                      {job.description && (
                        <div style={{ color: '#6E8AA0', fontSize: 10, marginTop: 6, lineHeight: 1.5, borderTop: `1px solid ${AM}11`, paddingTop: 4 }}>
                          {String(job.description).slice(0, 200)}{job.description.length > 200 ? '…' : ''}
                        </div>
                      )}
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
