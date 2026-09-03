import { useState, useEffect, useCallback } from 'react';

const API = '';
const RLNK_RE = /\b(report[._-]?knowledge|knowledge[._-]?report|rlnk|report[._-]?link|report[._-]?articles?|linked[._-]?report|document[._-]?knowledge|report[._-]?coverage|report[._-]?to[._-]?knowledge|knowledge[._-]?backing|reports[._-]?without[._-]?knowledge|knowledge[._-]?linker)\b/i;

export function isRlnkQuery(t) {
  return RLNK_RE.test(t || '');
}

export async function buildRlnkScript() {
  const [rpR, knR] = await Promise.allSettled([
    fetch(`${API}/v1/reports`).then(r => r.json()),
    fetch(`${API}/knowledge/articles`).then(r => r.json()),
  ]);
  const reports = normaliseArray(rpR.status === 'fulfilled' ? rpR.value : []);
  const articles = normaliseArray(knR.status === 'fulfilled' ? knR.value : []);
  const linked = reports.filter(r => correlate(r, articles).length > 0).length;
  const blind = reports.length - linked;
  const topBlind = reports
    .filter(r => correlate(r, articles).length === 0)
    .slice(0, 3)
    .map(r => r.title || r.name || r.id || '?')
    .join(', ');
  return `Report × Knowledge Linker: ${reports.length} reports, ${articles.length} knowledge articles in system. ` +
    `${linked} report(s) are LINKED to at least one knowledge article; ${blind} are BLIND (no knowledge backing). ` +
    `${blind > 0 ? `Unlinked reports include: ${topBlind}.` : 'All reports have knowledge article coverage.'}`;
}

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'reports', 'articles', 'entries', 'records', 'list']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(s => s.length > 2);
}

function correlate(report, articles) {
  const rToks = new Set([
    ...tokens(report.title), ...tokens(report.name),
    ...tokens(report.summary), ...tokens(report.kind),
    ...tokens(report.category), ...tokens(report.type),
  ]);
  const matched = [];
  for (const a of articles) {
    const aToks = [
      ...tokens(a.title), ...tokens(a.name),
      ...tokens(a.summary), ...tokens(a.content),
      ...tokens(a.category), ...tokens(a.tags),
    ];
    const overlap = aToks.filter(t => rToks.has(t));
    if (overlap.length > 0) matched.push({ ...a, _score: overlap.length });
  }
  return matched.sort((a, b) => b._score - a._score);
}

const CY = '#00D4FF';
const GN = '#22C55E';
const AM = '#F59E0B';
const RD = '#F43F5E';
const DIM = '#3A4A5A';

function age(ts) {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function Chip({ label, color = CY, dim }) {
  return (
    <span style={{
      fontSize: 10, padding: '1px 7px', borderRadius: 4, letterSpacing: 1,
      border: `1px solid ${dim ? DIM : color}55`,
      color: dim ? DIM : color, background: `${dim ? DIM : color}11`,
    }}>{label}</span>
  );
}

function StatTile({ label, value, color = CY }) {
  return (
    <div style={{
      flex: 1, minWidth: 70, background: `${color}0D`, border: `1px solid ${color}33`,
      borderRadius: 8, padding: '8px 10px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: "'JetBrains Mono',monospace" }}>{value}</div>
      <div style={{ fontSize: 9, color: '#6E8AA0', letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function ScoreBar({ value, max, color = CY }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 4, background: '#1A2535', borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 9, color: '#6E8AA0', minWidth: 22, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

export default function ReportKnowledgeLinker() {
  const [open, setOpen] = useState(false);
  const [reports, setReports] = useState([]);
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rpR, knR] = await Promise.allSettled([
        fetch(`${API}/v1/reports`).then(r => r.json()),
        fetch(`${API}/knowledge/articles`).then(r => r.json()),
      ]);
      setReports(normaliseArray(rpR.status === 'fulfilled' ? rpR.value : []));
      setArticles(normaliseArray(knR.status === 'fulfilled' ? knR.value : []));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:rlnk-toggle', onToggle);
    return () => window.removeEventListener('jarvis:rlnk-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90000);
    return () => clearInterval(id);
  }, [open, load]);

  const enriched = reports.map(r => {
    const matches = correlate(r, articles);
    return { ...r, _matches: matches, _linked: matches.length > 0 };
  });

  const linked = enriched.filter(r => r._linked).length;
  const blind = enriched.length - linked;

  const visible = enriched.filter(r => {
    if (filter === 'LINKED' && !r._linked) return false;
    if (filter === 'BLIND' && r._linked) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.title || r.name || '').toLowerCase().includes(q) ||
        (r.kind || r.category || r.type || '').toLowerCase().includes(q);
    }
    return true;
  });

  const maxScore = Math.max(1, ...enriched.flatMap(r => r._matches.map(m => m._score)));

  async function assess() {
    setAssessing(true); setAssessText('');
    try {
      const script = await buildRlnkScript();
      setAssessText(script);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: script } }));
    } finally {
      setAssessing(false);
    }
  }

  const badgeColor = blind > 0 ? AM : GN;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Report × Knowledge Linker"
        style={{
          position: 'fixed', left: 383760, bottom: 8, zIndex: 177,
          background: 'rgba(5,8,13,0.75)', border: `1px solid ${badgeColor}55`,
          color: badgeColor, borderRadius: 6, padding: '3px 9px',
          fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          letterSpacing: 1, cursor: 'pointer', backdropFilter: 'blur(6px)',
        }}
      >
        ◈ RLNK
        {blind > 0 && (
          <span style={{
            marginLeft: 5, background: AM, color: '#000', borderRadius: 8,
            fontSize: 9, padding: '0 5px', fontWeight: 700,
          }}>{blind}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', left: 18, top: 60, zIndex: 177, width: 480,
      maxHeight: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column',
      background: 'rgba(6,10,18,0.95)', border: `1px solid ${CY}33`,
      borderRadius: 14, fontFamily: "'JetBrains Mono',monospace",
      backdropFilter: 'blur(14px)', boxShadow: `0 0 60px ${CY}18`,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
        borderBottom: `1px solid ${CY}22`,
      }}>
        <span style={{ color: CY, fontSize: 12, fontWeight: 700, letterSpacing: 2, flex: 1 }}>
          ◈ REPORT × KNOWLEDGE LINKER
        </span>
        {loading && <span style={{ fontSize: 9, color: '#6E8AA0' }}>loading…</span>}
        <button onClick={assess} disabled={assessing} style={{
          background: `${CY}18`, border: `1px solid ${CY}44`, color: CY,
          borderRadius: 5, padding: '2px 8px', fontSize: 9, cursor: 'pointer', letterSpacing: 1,
        }}>▶ ASSESS</button>
        <button onClick={() => setOpen(false)} style={{
          background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14,
        }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px' }}>
        <StatTile label="REPORTS" value={reports.length} color={CY} />
        <StatTile label="ARTICLES" value={articles.length} color="#A855F7" />
        <StatTile label="LINKED" value={linked} color={GN} />
        <StatTile label="BLIND" value={blind} color={blind > 0 ? AM : DIM} />
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px 8px' }}>
        {['ALL', 'LINKED', 'BLIND'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            fontSize: 9, padding: '2px 9px', borderRadius: 4, cursor: 'pointer', letterSpacing: 1,
            border: `1px solid ${filter === f ? CY : '#2A3A4A'}`,
            background: filter === f ? `${CY}18` : 'transparent',
            color: filter === f ? CY : '#6E8AA0',
          }}>{f}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search reports…"
          style={{
            flex: 1, background: 'rgba(0,212,255,0.05)', border: `1px solid ${CY}22`,
            borderRadius: 5, padding: '3px 8px', color: '#DCEBF5', fontSize: 10,
            outline: 'none', fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Assess output */}
      {assessText && (
        <div style={{
          margin: '0 14px 8px', padding: '8px 10px', borderRadius: 8,
          background: `${CY}0D`, border: `1px solid ${CY}33`, fontSize: 10, color: '#DCEBF5',
          lineHeight: 1.5,
        }}>{assessText}</div>
      )}

      {/* List */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 14px 14px' }}>
        {visible.length === 0 && (
          <div style={{ color: '#3A4A5A', fontSize: 11, textAlign: 'center', padding: 20 }}>
            {loading ? 'loading…' : 'no reports'}
          </div>
        )}
        {visible.map((r, i) => {
          const id = r.id || r.report_id || i;
          const isExp = expanded === id;
          const color = r._linked ? GN : AM;
          const label = r._linked ? 'LINKED' : 'BLIND';
          return (
            <div key={id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
                  background: `${color}09`, border: `1px solid ${color}${isExp ? '55' : '22'}`,
                  transition: 'border-color 0.2s',
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ flex: 1, color: '#DCEBF5', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.title || r.name || r.id || '(untitled)'}
                </span>
                <Chip label={label} color={color} />
                {(r.kind || r.category || r.type) && (
                  <Chip label={(r.kind || r.category || r.type).toUpperCase()} color="#A855F7" />
                )}
                {(r.created_at || r.updated_at || r.date) && (
                  <span style={{ fontSize: 9, color: '#3A4A5A' }}>
                    {age(r.created_at || r.updated_at || r.date)}
                  </span>
                )}
                <span style={{ fontSize: 9, color: '#3A4A5A' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{
                  margin: '4px 0 0 16px', padding: '8px 10px', borderRadius: 6,
                  background: 'rgba(0,212,255,0.04)', border: `1px solid ${CY}18`,
                }}>
                  {r.summary && (
                    <div style={{ fontSize: 10, color: '#8899AA', marginBottom: 8, lineHeight: 1.4 }}>
                      {r.summary}
                    </div>
                  )}
                  {r._matches.length === 0 ? (
                    <div style={{ fontSize: 10, color: AM }}>
                      No knowledge articles matched — report is BLIND.
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 9, color: '#6E8AA0', letterSpacing: 1, marginBottom: 6 }}>
                        MATCHED KNOWLEDGE ARTICLES ({r._matches.length})
                      </div>
                      {r._matches.slice(0, 5).map((m, mi) => (
                        <div key={m.id || mi} style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <span style={{ fontSize: 10, color: GN, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {m.title || m.name || m.id || '(article)'}
                            </span>
                            {(m.category || m.kind) && (
                              <Chip label={(m.category || m.kind).toUpperCase()} color="#A855F7" />
                            )}
                          </div>
                          <ScoreBar value={m._score} max={maxScore} color={GN} />
                        </div>
                      ))}
                      {r._matches.length > 5 && (
                        <div style={{ fontSize: 9, color: '#3A4A5A', marginTop: 4 }}>
                          +{r._matches.length - 5} more article(s)
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
