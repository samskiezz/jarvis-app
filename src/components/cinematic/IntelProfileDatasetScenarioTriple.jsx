import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const IDSCTRI_RE = /\b(idsctri|intel\s+profile\s+dataset\s+scenario|intel\s+dataset\s+scenario|unarmed\s+intel(?:\s+profile)?|intel(?:\s+profile)?\s+fully\s+armed|intel\s+profile\s+unarmed\s+triple|armed\s+intel(?:\s+profile)?|intel\s+data\s+scenario|intel\s+profile\s+scenario\s+dataset|intel\s+profile\s+dataset\s+triple)\b/i;

export function isIdsctriQuery(t) { return IDSCTRI_RE.test(t || ''); }

export async function buildIdsctriScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [ipR, dsR, scnR] = await Promise.allSettled([
    fetch(`${API}/entities/IntelProfile`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/datasets`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.json()),
  ]);
  const ipRaw = ipR.value ?? {};
  const profiles = Array.isArray(ipRaw) ? ipRaw : (ipRaw.profiles ?? ipRaw.data ?? ipRaw.results ?? []);
  const dsRaw = dsR.value ?? {};
  const datasets = Array.isArray(dsRaw) ? dsRaw : (dsRaw.datasets ?? dsRaw.data ?? dsRaw.results ?? []);
  const scnRaw = scnR.value ?? {};
  const scenarios = Array.isArray(scnRaw) ? scnRaw : (scnRaw.scenarios ?? scnRaw.data ?? scnRaw.results ?? []);

  const dsBlob = datasets.map(d => `${d.name ?? d.title ?? d.id ?? ''} ${d.description ?? ''} ${d.category ?? ''} ${d.type ?? ''}`.toLowerCase()).join(' ');
  const scnBlob = scenarios.map(s => `${s.name ?? s.title ?? s.id ?? ''} ${s.description ?? ''} ${s.type ?? ''}`.toLowerCase()).join(' ');

  let fullyArmed = 0, datasetBacked = 0, scenarioPlanned = 0, unarmed = 0;
  for (const ip of profiles) {
    const text = `${ip.name ?? ip.id ?? ''} ${ip.email ?? ''} ${ip.company ?? ''} ${ip.role ?? ''} ${ip.sector ?? ''} ${(ip.tags ?? []).join(' ')}`.toLowerCase();
    const tokens = text.split(/\W+/).filter(t => t.length > 2);
    const hasDs = tokens.some(tok => dsBlob.includes(tok));
    const hasScn = tokens.some(tok => scnBlob.includes(tok));
    if (hasDs && hasScn) fullyArmed++;
    else if (hasDs) datasetBacked++;
    else if (hasScn) scenarioPlanned++;
    else unarmed++;
  }
  return `IDSCTRI Intel Profile × Dataset × Scenario Triple: ${profiles.length} intel profiles assessed against ${datasets.length} datasets and ${scenarios.length} scenarios. ` +
    `FULLY ARMED: ${fullyArmed} (dataset + scenario). ` +
    `DATASET-BACKED: ${datasetBacked}. SCENARIO-PLANNED: ${scenarioPlanned}. ` +
    `UNARMED: ${unarmed} (no dataset or scenario coverage — intelligence gap).`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 80, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = {
  'FULLY ARMED': '#34d399',
  'DATASET-BACKED': '#10b981',
  'SCENARIO-PLANNED': '#a78bfa',
  UNARMED: '#ef4444',
};

function tokenize(text) {
  return `${text}`.toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function scoreAgainst(profile, items, nameFields) {
  const text = `${profile.name ?? profile.id ?? ''} ${profile.email ?? ''} ${profile.company ?? ''} ${profile.role ?? ''} ${profile.sector ?? ''} ${(profile.tags ?? []).join(' ')}`.toLowerCase();
  const tokens = tokenize(text);
  const matched = [];
  for (const item of items) {
    const itext = nameFields.map(f => `${item[f] ?? ''}`).join(' ').toLowerCase();
    const hits = tokens.filter(tok => itext.includes(tok));
    if (hits.length > 0) matched.push({ item, score: Math.min(100, hits.length * 30) });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function classifyProfile(profile, datasets, scenarios) {
  const text = `${profile.name ?? profile.id ?? ''} ${profile.email ?? ''} ${profile.company ?? ''} ${profile.role ?? ''} ${profile.sector ?? ''} ${(profile.tags ?? []).join(' ')}`.toLowerCase();
  const tokens = tokenize(text);
  const dsBlob = datasets.map(d => `${d.name ?? d.title ?? d.id ?? ''} ${d.description ?? ''} ${d.category ?? ''} ${d.type ?? ''}`.toLowerCase()).join(' ');
  const scnBlob = scenarios.map(s => `${s.name ?? s.title ?? s.id ?? ''} ${s.description ?? ''} ${s.type ?? ''}`.toLowerCase()).join(' ');
  const hasDs = tokens.some(tok => dsBlob.includes(tok));
  const hasScn = tokens.some(tok => scnBlob.includes(tok));
  if (hasDs && hasScn) return 'FULLY ARMED';
  if (hasDs) return 'DATASET-BACKED';
  if (hasScn) return 'SCENARIO-PLANNED';
  return 'UNARMED';
}

export default function IntelProfileDatasetScenarioTriple() {
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [scenarios, setScenarios] = useState([]);
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
      const [ipR, dsR, scnR] = await Promise.allSettled([
        fetch(`${API}/entities/IntelProfile`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/datasets`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.json()),
      ]);
      const ipRaw = ipR.value ?? {};
      const profs = Array.isArray(ipRaw) ? ipRaw : (ipRaw.profiles ?? ipRaw.data ?? ipRaw.results ?? []);
      const dsRaw = dsR.value ?? {};
      const dss = Array.isArray(dsRaw) ? dsRaw : (dsRaw.datasets ?? dsRaw.data ?? dsRaw.results ?? []);
      const scnRaw = scnR.value ?? {};
      const scns = Array.isArray(scnRaw) ? scnRaw : (scnRaw.scenarios ?? scnRaw.data ?? scnRaw.results ?? []);
      setProfiles(profs);
      setDatasets(dss);
      setScenarios(scns);
      setRows(profs.map(ip => ({
        ip,
        state: classifyProfile(ip, dss, scns),
        matchedDatasets: scoreAgainst(ip, dss, ['name', 'title', 'id', 'description', 'category', 'type']),
        matchedScenarios: scoreAgainst(ip, scns, ['name', 'title', 'id', 'description', 'type']),
      })));
      setLastUpdated(new Date());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:idsctri-toggle', onToggle);
    return () => window.removeEventListener('jarvis:idsctri-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fullyArmedCount = rows.filter(r => r.state === 'FULLY ARMED').length;
  const datasetBackedCount = rows.filter(r => r.state === 'DATASET-BACKED').length;
  const scenarioPlannedCount = rows.filter(r => r.state === 'SCENARIO-PLANNED').length;
  const unarmedCount = rows.filter(r => r.state === 'UNARMED').length;

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = `${r.ip.name ?? r.ip.id ?? ''} ${r.ip.company ?? ''} ${r.ip.role ?? ''}`.toLowerCase();
      if (!name.includes(q)) return false;
    }
    return true;
  });

  const assess = async (row) => {
    const id = row.ip.name ?? row.ip.id ?? 'profile';
    setAssessing(id);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const dsNames = row.matchedDatasets.slice(0, 2).map(m => m.item.name ?? m.item.title ?? m.item.id ?? '?').join(', ');
      const scnNames = row.matchedScenarios.slice(0, 2).map(m => m.item.name ?? m.item.title ?? m.item.id ?? '?').join(', ');
      const stateDesc = row.state === 'FULLY ARMED'
        ? `is fully armed with datasets (${dsNames || 'found'}) and scenario plans (${scnNames || 'found'})`
        : row.state === 'DATASET-BACKED'
        ? `is backed by datasets (${dsNames || 'found'}) but has no scenario plan`
        : row.state === 'SCENARIO-PLANNED'
        ? `has scenario plans (${scnNames || 'found'}) but no dataset coverage`
        : 'is UNARMED — no dataset or scenario coverage exists';
      const prompt = `Intel profile "${id}" ${stateDesc}. In exactly 2 sentences, assess the intelligence coverage gap for this profile.`;
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
      position: 'fixed', left: 785440, bottom: 8, zIndex: 431,
      width: 560, maxHeight: '82vh',
      background: 'rgba(10,15,30,0.97)', border: '1px solid rgba(52,211,153,0.22)',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: '#34d399', letterSpacing: 2, fontWeight: 700, flex: 1 }}>◈ IDSCTRI — INTEL PROFILE × DATASET × SCENARIO</span>
        {unarmedCount > 0 && (
          <span style={{ background: '#ef4444', color: '#fff', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{unarmedCount} UNARMED</span>
        )}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'Profiles', val: profiles.length },
          { label: 'Fully Armed', val: fullyArmedCount, color: '#34d399' },
          { label: 'Dataset-Backed', val: datasetBackedCount, color: '#10b981' },
          { label: 'Scen-Planned', val: scenarioPlannedCount, color: '#a78bfa' },
          { label: 'Unarmed', val: unarmedCount, color: '#ef4444' },
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
            <div style={{ height: '100%', width: `${Math.round((fullyArmedCount / rows.length) * 100)}%`, background: '#34d399', transition: 'width 0.4s' }} />
            <div style={{ height: '100%', width: `${Math.round((datasetBackedCount / rows.length) * 100)}%`, background: '#10b981', transition: 'width 0.4s' }} />
            <div style={{ height: '100%', width: `${Math.round((scenarioPlannedCount / rows.length) * 100)}%`, background: '#a78bfa', transition: 'width 0.4s' }} />
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 3 }}>
            {rows.length ? Math.round((fullyArmedCount / rows.length) * 100) : 0}% fully armed · {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
          </div>
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {['ALL', 'FULLY ARMED', 'DATASET-BACKED', 'SCENARIO-PLANNED', 'UNARMED'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? (STATE_COLOR[f] ?? '#34d399') : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 700,
            color: filter === f ? (f === 'UNARMED' ? '#fff' : '#000') : '#aaa',
            cursor: 'pointer', letterSpacing: 1,
          }}>{f}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search profiles…"
          style={{ flex: 1, minWidth: 100, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '3px 8px', color: '#e2e8f0', fontSize: 11, outline: 'none' }}
        />
      </div>

      {/* Row list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 10px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: 20 }}>no intel profiles match</div>
        )}
        {visible.map((row, i) => {
          const id = row.ip.name ?? row.ip.id ?? `ip-${i}`;
          const isExp = expanded === id;
          return (
            <div key={id} style={{ marginBottom: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.07)' }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', userSelect: 'none' }}
              >
                <span style={{ flex: 1, fontSize: 11, color: '#e2e8f0', fontWeight: 600 }}>{id}</span>
                {row.ip.company && (
                  <span style={{ fontSize: 10, color: '#94a3b8', background: 'rgba(148,163,184,0.1)', borderRadius: 3, padding: '1px 5px' }}>{row.ip.company}</span>
                )}
                {row.ip.role && (
                  <span style={{ fontSize: 10, color: '#64748b', background: 'rgba(100,116,139,0.1)', borderRadius: 3, padding: '1px 5px' }}>{row.ip.role}</span>
                )}
                <span style={{ fontSize: 10, color: STATE_COLOR[row.state] ?? '#888', fontWeight: 700, letterSpacing: 1 }}>{row.state}</span>
                <span style={{ fontSize: 10, color: '#555' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 10px 10px' }}>
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing === id}
                    style={{ background: assessing === id ? '#444' : 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 4, color: '#34d399', fontSize: 10, padding: '3px 10px', cursor: assessing === id ? 'not-allowed' : 'pointer', marginBottom: 8 }}
                  >
                    {assessing === id ? 'ASSESSING…' : '▶ ASSESS'}
                  </button>

                  <div style={{ display: 'flex', gap: 10 }}>
                    {/* Left: matched datasets */}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: '#10b981', marginBottom: 6, letterSpacing: 1, fontWeight: 700 }}>
                        DATASETS ({row.matchedDatasets.length})
                      </div>
                      {row.matchedDatasets.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no dataset match — data gap</div>
                      ) : row.matchedDatasets.slice(0, 4).map((m, mi) => {
                        const n = m.item.name ?? m.item.title ?? m.item.id ?? `ds-${mi}`;
                        const type = m.item.type ?? m.item.category ?? '';
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                              <span style={{ fontSize: 10, color: '#6ee7b7', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>{n}</span>
                              {type && <span style={{ fontSize: 9, color: '#065f46', background: 'rgba(6,95,70,0.2)', borderRadius: 2, padding: '0 3px', marginRight: 4 }}>{type}</span>}
                              <span style={{ fontSize: 10, color: '#10b981', fontWeight: 700 }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#10b981', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Right: matched scenarios */}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: '#a78bfa', marginBottom: 6, letterSpacing: 1, fontWeight: 700 }}>
                        SCENARIOS ({row.matchedScenarios.length})
                      </div>
                      {row.matchedScenarios.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no scenario match — planning gap</div>
                      ) : row.matchedScenarios.slice(0, 4).map((m, mi) => {
                        const n = m.item.name ?? m.item.title ?? m.item.id ?? `scn-${mi}`;
                        const cat = m.item.type ?? m.item.category ?? '';
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                              <span style={{ fontSize: 10, color: '#c4b5fd', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>{n}</span>
                              {cat && <span style={{ fontSize: 9, color: '#6d28d9', background: 'rgba(109,40,217,0.15)', borderRadius: 2, padding: '0 3px', marginRight: 4 }}>{cat}</span>}
                              <span style={{ fontSize: 10, color: '#a78bfa', fontWeight: 700 }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#a78bfa', borderRadius: 2 }} />
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
