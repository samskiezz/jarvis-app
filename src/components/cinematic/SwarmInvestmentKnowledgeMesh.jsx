/**
 * F441 — SwarmJob × Investment × Knowledge Intelligence Mesh (SIKIM)
 *
 * Answers: "Which active swarm jobs have both funding exposure (matched investments)
 * AND knowledge documentation (matched KB articles) — and which are flying dark?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/SwarmJob   → swarm job catalog
 *   GET /entities/Investment → investment portfolio
 *   GET /knowledge/          → knowledge base articles
 *
 * Classification:
 *   FULLY_COVERED  — swarm job matches ≥1 investment AND ≥1 KB article
 *   FUNDED_ONLY    — matches investment(s) but no KB article
 *   DOCUMENTED_ONLY— matches KB article(s) but no investment
 *   DARK           — no investment match, no KB match
 *
 * Stat tiles:  jobs / investments / KB articles / dark
 * Amber badge: dark count on button
 * Expand row:  matched investments (sector badge + relevance bar, max 5)
 *              matched KB articles (topic badge + relevance bar, max 5)
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS
 *
 * Toggle:  ◈ SIKIM  at left:7560 bottom:18, zIndex:68
 * Event:   jarvis:sikim-toggle
 * Voice:   "swarm investment knowledge / sikim / funded swarm / dark swarms /
 *           swarm intelligence mesh / swarm kb / swarm with investment /
 *           swarm documentation / swarm triple"
 * Refresh: 90 s auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

// ─── palette ─────────────────────────────────────────────────────────────────
const BG   = 'rgba(10,12,20,0.97)';
const BD   = 'rgba(255,255,255,0.10)';
const MU   = '#64748B';
const AM   = '#F59E0B';
const CY   = '#06B6D4';
const GR   = '#10B981';
const RD   = '#EF4444';
const MONO = "'JetBrains Mono','Fira Code',monospace";

const FILTERS = ['ALL', 'FULLY_COVERED', 'FUNDED_ONLY', 'DOCUMENTED_ONLY', 'DARK'];
const CLASS_COLOR = {
  FULLY_COVERED:   GR,
  FUNDED_ONLY:     CY,
  DOCUMENTED_ONLY: AM,
  DARK:            RD,
};
const CLASS_LABEL = {
  FULLY_COVERED:   'FULLY COVERED',
  FUNDED_ONLY:     'FUNDED ONLY',
  DOCUMENTED_ONLY: 'DOCUMENTED ONLY',
  DARK:            'DARK',
};

// ─── exports for JarvisBrain ─────────────────────────────────────────────────
const SIKIM_RE =
  /\b(swarm[._-]?investment[._-]?knowledge|sikim|funded[._-]?swarm|dark[._-]?swarm|swarm[._-]?intelligence[._-]?mesh|swarm[._-]?kb|swarm[._-]?with[._-]?investment|swarm[._-]?documentation|swarm[._-]?triple)\b/i;

export function isSikimQuery(t) {
  return SIKIM_RE.test(t || '');
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function keywords(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2);
}

function relevance(jobKw, otherText) {
  const otherKw = keywords(otherText);
  return jobKw.filter(w => otherKw.includes(w)).length;
}

function jobText(job) {
  return [job.name, job.description, job.target, job.objective, job.type,
          Array.isArray(job.tags) ? job.tags.join(' ') : job.tags]
    .filter(Boolean).join(' ');
}

function investmentText(inv) {
  return [inv.name, inv.title, inv.description, inv.sector, inv.type,
          inv.ticker, inv.category,
          Array.isArray(inv.tags) ? inv.tags.join(' ') : inv.tags]
    .filter(Boolean).join(' ');
}

function articleText(art) {
  return [art.title, art.content, art.summary, art.topic,
          Array.isArray(art.tags) ? art.tags.join(' ') : art.tags]
    .filter(Boolean).join(' ');
}

function normJobs(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.items ?? raw?.jobs ?? raw?.data ?? []);
  return arr.map(j => ({
    id:     j.id ?? j._id ?? String(Math.random()),
    name:   j.name ?? j.title ?? '(job)',
    status: (j.status ?? 'UNKNOWN').toUpperCase(),
    type:   j.type ?? j.job_type ?? '',
    _text:  jobText(j),
  }));
}

function normInvestments(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.items ?? raw?.investments ?? raw?.data ?? []);
  return arr.map(i => ({
    id:     i.id ?? i._id ?? String(Math.random()),
    name:   i.name ?? i.title ?? '(investment)',
    sector: i.sector ?? i.category ?? i.type ?? '',
    _text:  investmentText(i),
  }));
}

function normArticles(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.items ?? raw?.articles ?? raw?.data ?? []);
  return arr.map(a => ({
    id:    a.id ?? a._id ?? String(Math.random()),
    title: a.title ?? a.name ?? '(article)',
    topic: a.topic ?? a.category ?? '',
    _text: articleText(a),
  }));
}

// ─── fetch helpers ────────────────────────────────────────────────────────────
async function fetchJobs() {
  const r = await fetch(`${API}/entities/SwarmJob?limit=200`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`SwarmJob ${r.status}`);
  return r.json();
}

async function fetchInvestments() {
  const r = await fetch(`${API}/entities/Investment?limit=200`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`Investment ${r.status}`);
  return r.json();
}

async function fetchKnowledge() {
  const r = await fetch(`${API}/knowledge/?limit=200`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`Knowledge ${r.status}`);
  return r.json();
}

// ─── build script for JarvisBrain ────────────────────────────────────────────
export async function buildSikimScript() {
  try {
    const [jobsRaw, invRaw, kbRaw] = await Promise.all([
      fetchJobs(), fetchInvestments(), fetchKnowledge(),
    ]);
    const jobs        = normJobs(jobsRaw);
    const investments = normInvestments(invRaw);
    const articles    = normArticles(kbRaw);

    let full = 0, funded = 0, documented = 0, dark = 0;
    jobs.forEach(job => {
      const kw      = keywords(job._text);
      const hasInv  = investments.some(i => relevance(kw, i._text) > 0);
      const hasKb   = articles.some(a => relevance(kw, a._text) > 0);
      if (hasInv && hasKb) full++;
      else if (hasInv)     funded++;
      else if (hasKb)      documented++;
      else                 dark++;
    });

    const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `SIKIM Swarm Intelligence Mesh: ${jobs.length} swarm jobs correlated against ${investments.length} investments and ${articles.length} KB articles. Fully covered: ${full}, funded-only: ${funded}, documented-only: ${documented}, dark (no coverage): ${dark}. Provide a 2-sentence swarm intelligence coverage brief.`,
        system_prompt: 'You are JARVIS. Be direct and technical. 2 sentences maximum.',
      }),
    });
    if (r.ok) {
      const d = await r.json();
      return d.response ?? d.message ?? d.content ?? `${full} fully covered, ${dark} dark across ${jobs.length} swarm jobs.`;
    }
  } catch {}
  return 'Swarm intelligence mesh data unavailable. Check /entities/SwarmJob, /entities/Investment, and /knowledge/ endpoints.';
}

// ─── component ───────────────────────────────────────────────────────────────
export default function SwarmInvestmentKnowledgeMesh() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [invCount,  setInvCount]  = useState(0);
  const [kbCount,   setKbCount]   = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [filter,    setFilter]    = useState('ALL');
  const [search,    setSearch]    = useState('');
  const [expanded,  setExpanded]  = useState({});
  const [brief,     setBrief]     = useState('');
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [jobsRaw, invRaw, kbRaw] = await Promise.all([
        fetchJobs(), fetchInvestments(), fetchKnowledge(),
      ]);
      const jobs        = normJobs(jobsRaw);
      const investments = normInvestments(invRaw);
      const articles    = normArticles(kbRaw);
      setInvCount(investments.length);
      setKbCount(articles.length);

      const enriched = jobs.map(job => {
        const kw = keywords(job._text);
        const matchedInv = investments
          .map(i => ({ ...i, _score: relevance(kw, i._text) }))
          .filter(i => i._score > 0)
          .sort((a, b) => b._score - a._score)
          .slice(0, 5);
        const matchedKb = articles
          .map(a => ({ ...a, _score: relevance(kw, a._text) }))
          .filter(a => a._score > 0)
          .sort((a, b) => b._score - a._score)
          .slice(0, 5);

        const hasInv = matchedInv.length > 0;
        const hasKb  = matchedKb.length > 0;
        const cls =
          hasInv && hasKb ? 'FULLY_COVERED' :
          hasInv           ? 'FUNDED_ONLY'   :
          hasKb            ? 'DOCUMENTED_ONLY' :
                             'DARK';

        return { ...job, _class: cls, _inv: matchedInv, _kb: matchedKb };
      });
      setRows(enriched);
    } catch (e) {
      setError(e.message ?? 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener('jarvis:sikim-toggle', onToggle);
    return () => window.removeEventListener('jarvis:sikim-toggle', onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true); setBrief('');
    const script = await buildSikimScript();
    setBrief(script);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: script } }));
  };

  const dark  = rows.filter(r => r._class === 'DARK').length;
  const full  = rows.filter(r => r._class === 'FULLY_COVERED').length;
  const fundedOnly = rows.filter(r => r._class === 'FUNDED_ONLY').length;
  const docOnly    = rows.filter(r => r._class === 'DOCUMENTED_ONLY').length;

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r._class !== filter) return false;
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const maxScore = Math.max(1, ...rows.flatMap(r => [...r._inv, ...r._kb].map(x => x._score)));

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="SwarmJob × Investment × Knowledge Intelligence Mesh (SIKIM)"
        style={{
          position: 'fixed', left: 7560, bottom: 18, zIndex: 68,
          background: 'rgba(10,12,20,0.85)',
          border: `1px solid ${dark > 0 ? AM : 'rgba(255,255,255,0.15)'}`,
          borderRadius: 6, color: '#CBD5E1', fontFamily: MONO, fontSize: 10,
          padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          transition: 'border-color .2s',
        }}
      >
        ◈ SIKIM
        {dark > 0 && (
          <span style={{
            background: AM, color: '#000', borderRadius: 10,
            fontSize: 9, fontWeight: 700, padding: '1px 5px',
          }}>{dark}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 60, left: '50%', transform: 'translateX(-50%)',
      width: 720, maxHeight: '76vh', zIndex: 9000,
      background: BG, border: `1px solid ${BD}`, borderRadius: 10,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
      fontFamily: MONO,
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${BD}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: AM, fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>
          ◈ SWARM × INVESTMENT × KNOWLEDGE MESH
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={assess} disabled={assessing} style={{ background: 'none', border: `1px solid ${AM}`, borderRadius: 4, color: AM, fontFamily: MONO, fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>
            {assessing ? '…' : '▶ ASSESS'}
          </button>
          <button onClick={load} disabled={loading} style={{ background: 'none', border: `1px solid ${MU}`, borderRadius: 4, color: MU, fontFamily: MONO, fontSize: 10, padding: '2px 6px', cursor: 'pointer' }}>
            {loading ? '…' : '↺'}
          </button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: MU, fontFamily: MONO, fontSize: 13, cursor: 'pointer' }}>✕</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px', borderBottom: `1px solid ${BD}`, flexWrap: 'wrap' }}>
        {[
          { label: 'JOBS',       val: rows.length,  color: CY },
          { label: 'INV',        val: invCount,      color: GR },
          { label: 'KB ARTS',    val: kbCount,       color: AM },
          { label: 'DARK',       val: dark,          color: RD },
          { label: 'FULL COV',   val: full,          color: GR },
          { label: 'FUNDED',     val: fundedOnly,    color: CY },
          { label: 'DOCUMENTED', val: docOnly,        color: AM },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${BD}`, borderRadius: 6, padding: '4px 10px', minWidth: 60, textAlign: 'center' }}>
            <div style={{ color, fontSize: 15, fontWeight: 700 }}>{val}</div>
            <div style={{ color: MU, fontSize: 9 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {rows.length > 0 && (
        <div style={{ padding: '4px 14px 6px', display: 'flex', gap: 2, borderBottom: `1px solid ${BD}` }}>
          {[
            { cls: 'FULLY_COVERED', color: GR },
            { cls: 'FUNDED_ONLY',   color: CY },
            { cls: 'DOCUMENTED_ONLY', color: AM },
            { cls: 'DARK',          color: RD },
          ].map(({ cls, color }) => {
            const pct = (rows.filter(r => r._class === cls).length / rows.length) * 100;
            return pct > 0 ? (
              <div key={cls} title={cls} style={{ height: 4, borderRadius: 2, background: color, width: `${pct}%`, transition: 'width .4s' }} />
            ) : null;
          })}
        </div>
      )}

      {/* Filter + Search */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 14px', borderBottom: `1px solid ${BD}`, flexWrap: 'wrap', alignItems: 'center' }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? 'rgba(245,158,11,0.15)' : 'none',
            border: `1px solid ${filter === f ? AM : BD}`,
            borderRadius: 4, color: filter === f ? AM : MU,
            fontFamily: MONO, fontSize: 9, padding: '2px 7px', cursor: 'pointer',
          }}>{f}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search jobs…"
          style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BD}`, borderRadius: 4, color: '#CBD5E1', fontFamily: MONO, fontSize: 10, padding: '2px 8px', outline: 'none', width: 160 }}
        />
      </div>

      {/* Brief */}
      {brief && (
        <div style={{ padding: '6px 14px', background: 'rgba(245,158,11,0.06)', borderBottom: `1px solid ${BD}`, color: AM, fontSize: 10, lineHeight: 1.5 }}>
          {brief}
        </div>
      )}

      {/* Error */}
      {error && <div style={{ padding: '6px 14px', color: RD, fontSize: 10 }}>{error}</div>}

      {/* Rows */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {visible.length === 0 && !loading && (
          <div style={{ padding: 20, textAlign: 'center', color: MU, fontSize: 11 }}>No swarm jobs found.</div>
        )}
        {visible.map(row => {
          const isExp = expanded[row.id];
          const clsColor = CLASS_COLOR[row._class] ?? MU;
          return (
            <div key={row.id} style={{ borderBottom: `1px solid ${BD}` }}>
              {/* Row header */}
              <div
                onClick={() => setExpanded(e => ({ ...e, [row.id]: !e[row.id] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', cursor: 'pointer' }}
              >
                <span style={{ color: clsColor, fontSize: 9, fontWeight: 700, minWidth: 100, textAlign: 'right', flexShrink: 0 }}>
                  {CLASS_LABEL[row._class]}
                </span>
                <span style={{ color: '#CBD5E1', fontSize: 10, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.name}
                </span>
                <span style={{ color: MU, fontSize: 9, flexShrink: 0 }}>
                  {row._inv.length}★ {row._kb.length}📄
                </span>
                <span style={{ color: MU, fontSize: 10, flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {/* Expanded */}
              {isExp && (
                <div style={{ padding: '0 14px 10px 114px' }}>
                  {row._inv.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: GR, fontSize: 9, marginBottom: 4, fontWeight: 700 }}>INVESTMENTS ({row._inv.length})</div>
                      {row._inv.map(inv => (
                        <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          {inv.sector && (
                            <span style={{ background: 'rgba(16,185,129,0.15)', color: GR, fontSize: 8, padding: '1px 5px', borderRadius: 4, flexShrink: 0 }}>
                              {inv.sector}
                            </span>
                          )}
                          <span style={{ color: '#CBD5E1', fontSize: 9, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.name}</span>
                          <div style={{ width: 60, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, flexShrink: 0 }}>
                            <div style={{ height: 3, borderRadius: 2, background: GR, width: `${(inv._score / maxScore) * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {row._kb.length > 0 && (
                    <div>
                      <div style={{ color: AM, fontSize: 9, marginBottom: 4, fontWeight: 700 }}>KB ARTICLES ({row._kb.length})</div>
                      {row._kb.map(art => (
                        <div key={art.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          {art.topic && (
                            <span style={{ background: 'rgba(245,158,11,0.15)', color: AM, fontSize: 8, padding: '1px 5px', borderRadius: 4, flexShrink: 0 }}>
                              {art.topic}
                            </span>
                          )}
                          <span style={{ color: '#CBD5E1', fontSize: 9, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{art.title}</span>
                          <div style={{ width: 60, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, flexShrink: 0 }}>
                            <div style={{ height: 3, borderRadius: 2, background: AM, width: `${(art._score / maxScore) * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {row._inv.length === 0 && row._kb.length === 0 && (
                    <div style={{ color: MU, fontSize: 9 }}>No matches found for this swarm job.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '4px 14px', borderTop: `1px solid ${BD}`, color: MU, fontSize: 9, display: 'flex', justifyContent: 'space-between' }}>
        <span>90 s auto-refresh · {rows.length} jobs</span>
        <span>{visible.length} shown</span>
      </div>
    </div>
  );
}
