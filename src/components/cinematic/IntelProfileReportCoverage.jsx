import { useState, useEffect, useCallback } from 'react';

const API = '';
const IPRC_RE = /\b(intel[._-]?profile[._-]?report|report[._-]?intel|iprc|intel[._-]?coverage|profile[._-]?report[._-]?coverage|which[._-]?intel[._-]?profiles?[._-]?have[._-]?reports?|intel[._-]?report[._-]?coverage|undocumented[._-]?profiles?|intel[._-]?governance)\b/i;

export function isIprcQuery(t) {
  return IPRC_RE.test(t || '');
}

export async function buildIprcScript() {
  const [prR, rpR] = await Promise.allSettled([
    fetch(`${API}/entities/IntelProfile`).then(r => r.json()),
    fetch(`${API}/v1/reports`).then(r => r.json()),
  ]);
  const profiles = normaliseProfiles(prR.status === 'fulfilled' ? prR.value : []);
  const reports = normaliseReports(rpR.status === 'fulfilled' ? rpR.value : []);
  const enriched = correlate(profiles, reports);
  const covered = enriched.filter(p => p._linked).length;
  const undocumented = enriched.length - covered;
  return (
    `IntelProfile × Report Coverage: ${profiles.length} intel profiles, ${reports.length} reports indexed. ` +
    `${covered} profiles have report documentation; ${undocumented} have no report coverage. ` +
    `Top undocumented: ${enriched.filter(p => !p._linked).slice(0, 4).map(p => p.name || p.title || p.id || '?').join(', ') || 'none'}.`
  );
}

function normaliseProfiles(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['profiles', 'intel_profiles', 'items', 'results', 'data', 'records']) {
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

function matchScore(profile, report) {
  const pToks = new Set([
    ...tokens(profile.name),
    ...tokens(profile.aka),
    ...tokens(profile.sector),
    ...tokens(profile.description),
    ...tokens(profile.type),
    ...tokens(profile.nationality),
    ...tokens(profile.affiliation),
  ].filter(Boolean));
  const rToks = [
    ...tokens(report.title),
    ...tokens(report.content),
    ...tokens(report.summary),
    ...tokens(report.tags),
    ...tokens(report.body),
    ...tokens(report.text),
  ].filter(Boolean);
  if (!pToks.size || !rToks.length) return 0;
  let hits = 0;
  for (const t of rToks) if (pToks.has(t)) hits++;
  return hits / Math.max(pToks.size, rToks.length);
}

function correlate(profiles, reports) {
  return profiles.map(profile => {
    const scored = reports
      .map(report => ({ report, score: matchScore(profile, report) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...profile, _linked: scored.length > 0, _matches: scored };
  });
}

const PANEL_W = 580;
const PANEL_H = 560;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const PR = '#A78BFA';

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

export default function IntelProfileReportCoverage() {
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState([]);
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
      const [prR, rpR] = await Promise.allSettled([
        fetch(`${API}/entities/IntelProfile`).then(r => r.json()),
        fetch(`${API}/v1/reports`).then(r => r.json()),
      ]);
      setProfiles(normaliseProfiles(prR.status === 'fulfilled' ? prR.value : []));
      setReports(normaliseReports(rpR.status === 'fulfilled' ? rpR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:iprc-toggle', onToggle);
    return () => window.removeEventListener('jarvis:iprc-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 90000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = correlate(profiles, reports);
  const covered = enriched.filter(p => p._linked);
  const undocumented = enriched.filter(p => !p._linked);
  const badgeCount = undocumented.length;
  const badgeColor = badgeCount > 0 ? AM : GR;

  const filtered = enriched
    .filter(p => tab === 'ALL' || (tab === 'COVERED' ? p._linked : !p._linked))
    .filter(p => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        String(p.name || '').toLowerCase().includes(q) ||
        String(p.aka || '').toLowerCase().includes(q) ||
        String(p.sector || '').toLowerCase().includes(q) ||
        String(p.type || '').toLowerCase().includes(q) ||
        String(p.description || '').toLowerCase().includes(q)
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
          message: `You have ${profiles.length} intel profiles and ${reports.length} reports. ${covered.length} profiles have report coverage; ${undocumented.length} profiles are undocumented. Give a 2-sentence intel coverage brief identifying the key intelligence gap and which undocumented profiles most urgently need a dedicated report.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const profileLabel = p => p.name || p.title || p.id || '?';

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="IntelProfile × Report Coverage (IPRC)"
        style={{
          position: 'fixed', left: 752560, bottom: 8, zIndex: 259,
          width: 54, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ IPRC
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
          width: PANEL_W, height: PANEL_H, zIndex: 9200,
          background: 'rgba(6,10,18,0.97)', border: `1px solid ${CY}33`,
          borderRadius: 12, backdropFilter: 'blur(16px)',
          boxShadow: `0 0 60px ${CY}22`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${CY}22`,
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700, textShadow: `0 0 12px ${CY}` }}>
              ◈ INTEL PROFILE × REPORT COVERAGE
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
                style={{
                  background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14, padding: 0,
                }}
              >✕</button>
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'PROFILES', val: profiles.length, col: CY },
              { label: 'REPORTS', val: reports.length, col: PR },
              { label: 'COVERED', val: covered.length, col: GR },
              { label: 'UNDOCUMENTED', val: undocumented.length, col: AM },
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

          <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0 }}>
            {['ALL', 'COVERED', 'UNDOCUMENTED'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '2px 10px', borderRadius: 3, fontSize: 9, letterSpacing: 1, cursor: 'pointer',
                  border: `1px solid ${tab === t ? CY : CY + '33'}`,
                  background: tab === t ? `${CY}18` : 'transparent',
                  color: tab === t ? CY : '#6E8AA0',
                }}
              >{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search profiles…"
              style={{
                marginLeft: 'auto', background: 'rgba(0,207,255,0.06)', border: `1px solid ${CY}33`,
                borderRadius: 3, color: '#DCEBF5', fontSize: 10, padding: '2px 8px',
                outline: 'none', fontFamily: 'inherit', width: 140,
              }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>
            {filtered.length === 0 && (
              <div style={{ color: '#6E8AA0', fontSize: 11, textAlign: 'center', paddingTop: 24 }}>
                {loading ? 'loading…' : 'no profiles found'}
              </div>
            )}
            {filtered.map((profile, i) => {
              const label = profileLabel(profile);
              const isOpen = expanded === i;
              const linkColor = profile._linked ? GR : AM;
              return (
                <div
                  key={profile.id || i}
                  style={{
                    borderRadius: 6, border: `1px solid ${linkColor}22`,
                    background: `${linkColor}08`, marginBottom: 6, overflow: 'hidden',
                  }}
                >
                  <div
                    onClick={() => setExpanded(isOpen ? null : i)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 10px', cursor: 'pointer',
                    }}
                  >
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: linkColor, flexShrink: 0,
                      boxShadow: profile._linked ? undefined : `0 0 6px ${AM}`,
                    }} />
                    <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1 }}>{label}</span>
                    {profile.sector && chip(profile.sector, CY)}
                    {profile.type && chip(profile.type, PR)}
                    {chip(profile._linked ? 'COVERED' : 'UNDOCUMENTED', linkColor)}
                    <span style={{ color: '#6E8AA0', fontSize: 10 }}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                  {isOpen && (
                    <div style={{ padding: '6px 10px 8px 24px', borderTop: `1px solid ${linkColor}22` }}>
                      {profile.description && (
                        <div style={{ color: '#6E8AA0', fontSize: 10, marginBottom: 6 }}>
                          {String(profile.description).slice(0, 120)}{profile.description?.length > 120 ? '…' : ''}
                        </div>
                      )}
                      {profile._matches.length > 0 ? (
                        <>
                          <div style={{ color: '#4E6070', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHED REPORTS ({profile._matches.length})
                          </div>
                          {profile._matches.map(({ report: rp, score }, j) => (
                            <div
                              key={rp.id || j}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '3px 0', borderBottom: j < profile._matches.length - 1 ? `1px solid ${CY}11` : 'none',
                              }}
                            >
                              <span style={{ color: '#7A95AB', fontSize: 10, flex: 1 }}>
                                {rp.title || rp.name || rp.id || '?'}
                              </span>
                              {scorebar(score, GR)}
                            </div>
                          ))}
                        </>
                      ) : (
                        <div style={{ color: AM, fontSize: 10, letterSpacing: 1 }}>
                          ⚠ NO REPORT COVERAGE — intelligence gap
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
              padding: '8px 14px', borderTop: `1px solid ${CY}22`,
              color: '#7A95AB', fontSize: 10, lineHeight: 1.5, flexShrink: 0,
            }}>
              {brief}
            </div>
          )}
        </div>
      )}
    </>
  );
}
