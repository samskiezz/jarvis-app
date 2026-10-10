/**
 * QuadIntelFusion — F658.
 *
 * Data sources (all real — confirmed endpoints):
 *   GET /entities/RiskSignal   — active risk signals
 *   GET /entities/Task         — mission tasks
 *   GET /v1/investigations     — open cases
 *   GET /functions/getLiveIntel — live world events (quakes / crypto / FX)
 *
 * Cross-references all 4 intel streams per risk signal:
 *   QUAD_LOCKED     — matched on all 3 additional streams
 *   TRIPLE_FUSED    — matched on 2
 *   DUAL_CORRELATED — matched on 1
 *   ISOLATED        — no matches
 *
 * Toggle: ◈ QIF at left:117420, bottom:8, zIndex:195.
 * Badge: cyan = quad-locked count.
 * 90 s auto-refresh when open.
 *
 * JarvisBrain wiring: isQifQuery + buildQifScript
 * Event: jarvis:qif-toggle
 */
import { useState, useEffect, useCallback } from 'react'

const BTN_LEFT = 117420
const Z_INDEX  = 195
const CY  = '#29E7FF'
const DIM = '#334155'
const API_KEY = typeof window !== 'undefined' ? (window.__JARVIS_API_KEY__ || 'dev-key') : 'dev-key'
const apiBase = () =>
  (typeof window !== 'undefined' && window.__JARVIS_API_BASE__)
    ? window.__JARVIS_API_BASE__
    : 'http://localhost:8000'

/* ── named exports for JarvisBrain ─────────────────────────────────────────── */
const QIF_RE =
  /\bqif\b|\bquad.?intel.?fusion\b|\bquad.?intel\b|\brisk.?task.?investigation\b|\bfusion.?correlation\b|\bquad.?locked\b|\bintel.?fusion\b|\bquad.?intel.?corr\b/i

export function isQifQuery(text) {
  return QIF_RE.test(text || '')
}

export async function buildQifScript() {
  const base = apiBase()
  const hdr  = { Authorization: `Bearer ${API_KEY}` }
  try {
    const [rRes, tRes, iRes] = await Promise.allSettled([
      fetch(`${base}/entities/RiskSignal`, { headers: hdr }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/entities/Task`,        { headers: hdr }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/v1/investigations`,    { headers: hdr }).then(r => r.ok ? r.json() : []),
    ])
    const risks = Array.isArray(rRes.value) ? rRes.value : []
    const tasks = Array.isArray(tRes.value) ? tRes.value : []
    const invs  = Array.isArray(iRes.value) ? iRes.value : []
    return (
      `Quad Intel Fusion: ${risks.length} risk signals cross-referenced against ` +
      `${tasks.length} tasks, ${invs.length} investigations, and live world events. ` +
      `Opening the fusion panel now.`
    )
  } catch {
    return 'Quad Intel Fusion: unable to load intel sources. Check backend connectivity.'
  }
}

/* ── helpers ──────────────────────────────────────────────────────────────── */
function kwScore(text, kws) {
  if (!text || !kws.length) return 0
  const t = text.toLowerCase()
  return kws.filter(k => t.includes(k)).length / kws.length
}

function extractKw(str) {
  if (!str) return []
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3)
}

const STATUS_COLOR = {
  QUAD_LOCKED:     CY,
  TRIPLE_FUSED:    '#4ade80',
  DUAL_CORRELATED: '#f59e0b',
  ISOLATED:        '#6b7280',
}

/* ── component ──────────────────────────────────────────────────────────────── */
export default function QuadIntelFusion() {
  const [open, setOpen]           = useState(false)
  const [risks, setRisks]         = useState([])
  const [tasks, setTasks]         = useState([])
  const [invs, setInvs]           = useState([])
  const [liveIntel, setLiveIntel] = useState([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [filter, setFilter]       = useState('ALL')
  const [search, setSearch]       = useState('')
  const [expanded, setExpanded]   = useState(null)
  const [ts, setTs]               = useState(Date.now())
  const [assessing, setAssessing] = useState(false)
  const [brief, setBrief]         = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const base = apiBase()
    const hdr  = { Authorization: `Bearer ${API_KEY}` }
    try {
      const [rRes, tRes, iRes, lRes] = await Promise.allSettled([
        fetch(`${base}/entities/RiskSignal`,   { headers: hdr }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/entities/Task`,          { headers: hdr }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/v1/investigations`,      { headers: hdr }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/functions/getLiveIntel`, { headers: hdr }).then(r => r.ok ? r.json() : {}),
      ])
      setRisks(Array.isArray(rRes.value) ? rRes.value : [])
      setTasks(Array.isArray(tRes.value) ? tRes.value : [])
      setInvs(Array.isArray(iRes.value) ? iRes.value : [])
      const li     = lRes.value || {}
      const quakes = Array.isArray(li.earthquakes) ? li.earthquakes : []
      const crypto = Array.isArray(li.crypto)      ? li.crypto      : []
      const fx     = Array.isArray(li.fx)          ? li.fx          : []
      setLiveIntel([
        ...quakes.map(q => q.place  || q.title  || ''),
        ...crypto.map(c => c.name   || c.symbol || ''),
        ...fx.map(f     => f.pair   || f.symbol || ''),
      ].filter(Boolean))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
      setTs(Date.now())
    }
  }, [])

  /* toggle event */
  useEffect(() => {
    const handler = () => { setOpen(p => !p); }
    window.addEventListener('jarvis:qif-toggle', handler)
    return () => window.removeEventListener('jarvis:qif-toggle', handler)
  }, [])

  /* auto-refresh when open */
  useEffect(() => {
    if (!open) return
    load()
    const id = setInterval(load, 90000)
    return () => clearInterval(id)
  }, [open, load])

  /* fuse data */
  const fused = risks.map(r => {
    const rText = `${r.title || r.name || ''} ${r.description || r.summary || ''} ${(r.tags || []).join(' ')}`
    const kw    = extractKw(rText)
    const matchedTasks = tasks.filter(t =>
      kwScore(`${t.title || t.name || ''} ${t.description || t.notes || ''}`, kw) > 0.1)
    const matchedInvs  = invs.filter(i =>
      kwScore(`${i.title || i.name || ''} ${i.description || i.summary || ''}`, kw) > 0.1)
    const matchedIntel = liveIntel.filter(li => kwScore(li, kw) > 0)
    const hits = (matchedTasks.length > 0 ? 1 : 0) +
                 (matchedInvs.length  > 0 ? 1 : 0) +
                 (matchedIntel.length > 0 ? 1 : 0)
    const status = hits === 3 ? 'QUAD_LOCKED' : hits === 2 ? 'TRIPLE_FUSED'
                 : hits === 1 ? 'DUAL_CORRELATED' : 'ISOLATED'
    return { r, matchedTasks, matchedInvs, matchedIntel, hits, status }
  })

  const counts = { QUAD_LOCKED: 0, TRIPLE_FUSED: 0, DUAL_CORRELATED: 0, ISOLATED: 0 }
  fused.forEach(f => counts[f.status]++)

  const filtered = fused
    .filter(f => filter === 'ALL' || f.status === filter)
    .filter(f => !search || `${f.r.title || f.r.name || ''}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.hits - a.hits)

  const pct = risks.length ? Math.round((counts.QUAD_LOCKED + counts.TRIPLE_FUSED) * 100 / risks.length) : 0

  const assess = async () => {
    setAssessing(true)
    setBrief('')
    try {
      const summary = await buildQifScript()
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `JARVIS quad intel fusion brief: ${summary}` }),
      })
      const d    = await r.json()
      const text = d.response || d.message || d.content || summary
      setBrief(text)
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }))
    } catch {
      setBrief('Assessment unavailable — check backend connectivity, sir.')
    } finally {
      setAssessing(false)
    }
  }

  return (
    <>
      {/* HUD button */}
      <button
        onClick={() => { setOpen(p => !p) }}
        style={{
          position:       'fixed',
          left:           BTN_LEFT,
          bottom:         8,
          zIndex:         Z_INDEX,
          background:     counts.QUAD_LOCKED > 0 ? `${CY}22` : 'rgba(0,0,0,0.55)',
          border:         `1px solid ${counts.QUAD_LOCKED > 0 ? CY : CY}55`,
          borderRadius:   5,
          color:          CY,
          padding:        '3px 8px',
          fontSize:       9,
          letterSpacing:  1,
          cursor:         'pointer',
          backdropFilter: 'blur(4px)',
        }}
      >
        ◈ QIF
        {counts.QUAD_LOCKED > 0 && (
          <span style={{ marginLeft: 5, background: CY, color: '#000', borderRadius: 9, padding: '0 5px', fontSize: 8, fontWeight: 700 }}>
            {counts.QUAD_LOCKED}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position:       'fixed',
            left:           Math.min(BTN_LEFT, (typeof window !== 'undefined' ? window.innerWidth : 1920) - 360),
            bottom:         36,
            zIndex:         Z_INDEX + 1,
            width:          340,
            maxHeight:      520,
            overflow:       'hidden',
            display:        'flex',
            flexDirection:  'column',
            background:     'rgba(6,12,22,0.97)',
            border:         `1px solid ${CY}33`,
            borderRadius:   8,
            padding:        14,
            fontFamily:     'monospace',
            backdropFilter: 'blur(12px)',
          }}
        >
          {/* header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>QUAD INTEL FUSION</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{ background: 'none', border: `1px solid ${CY}55`, color: CY, cursor: 'pointer', fontSize: 9, padding: '2px 7px', borderRadius: 3 }}
              >
                {assessing ? '…' : '▶ ASSESS'}
              </button>
              <button
                onClick={load}
                style={{ background: 'none', border: `1px solid ${CY}44`, color: CY, cursor: 'pointer', fontSize: 9, padding: '2px 7px', borderRadius: 3 }}
              >
                ⟳
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 12 }}>✕</button>
            </div>
          </div>

          {/* sub-label */}
          <div style={{ fontSize: 9, color: '#4ade80', marginBottom: 8, letterSpacing: 1 }}>
            RiskSignal × Task × Investigation × LiveIntel
          </div>

          {/* brief */}
          {brief && (
            <div style={{ fontSize: 9, color: '#a5f3fc', background: `${CY}11`, border: `1px solid ${CY}22`, borderRadius: 4, padding: '6px 8px', marginBottom: 8, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
              {brief}
            </div>
          )}

          {/* stat tiles */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            {[
              { k: 'ALL',             label: 'ALL',        val: risks.length,           color: '#94a3b8' },
              { k: 'QUAD_LOCKED',     label: 'QUAD',       val: counts.QUAD_LOCKED,     color: CY },
              { k: 'TRIPLE_FUSED',    label: 'TRIPLE',     val: counts.TRIPLE_FUSED,    color: '#4ade80' },
              { k: 'DUAL_CORRELATED', label: 'DUAL',       val: counts.DUAL_CORRELATED, color: '#f59e0b' },
              { k: 'ISOLATED',        label: 'ISOLATED',   val: counts.ISOLATED,        color: '#6b7280' },
            ].map(s => (
              <div
                key={s.k}
                onClick={() => setFilter(s.k)}
                style={{
                  cursor:     'pointer',
                  padding:    '3px 8px',
                  borderRadius: 4,
                  border:     `1px solid ${s.color}${filter === s.k ? 'ff' : '44'}`,
                  background: filter === s.k ? s.color + '22' : 'transparent',
                  color:      s.color,
                  fontSize:   9,
                  fontWeight: 700,
                }}
              >
                {s.label} {s.val}
              </div>
            ))}
            <div style={{ marginLeft: 'auto', fontSize: 9, color: '#4ade80', display: 'flex', alignItems: 'center' }}>
              FUSED {pct}%
            </div>
          </div>

          {/* fusion bar */}
          {risks.length > 0 && (
            <div style={{ height: 4, borderRadius: 3, background: '#1e2a3a', marginBottom: 8, display: 'flex', overflow: 'hidden' }}>
              {['QUAD_LOCKED', 'TRIPLE_FUSED', 'DUAL_CORRELATED', 'ISOLATED'].map(s => (
                <div key={s} style={{ flex: counts[s] || 0, background: STATUS_COLOR[s], opacity: 0.85 }} />
              ))}
            </div>
          )}

          {/* search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search risk signals…"
            style={{
              width:       '100%',
              boxSizing:   'border-box',
              background:  '#0a1628',
              border:      `1px solid ${CY}44`,
              color:       CY,
              padding:     '4px 8px',
              borderRadius: 3,
              fontSize:    10,
              marginBottom: 8,
              outline:     'none',
            }}
          />

          {/* list */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading && <div style={{ color: '#4ade80', fontSize: 10 }}>Loading quad intel sources…</div>}
            {error   && <div style={{ color: '#ef4444', fontSize: 10 }}>Error: {error}</div>}

            {filtered.map((f, i) => {
              const isExp = expanded === i
              const sc    = STATUS_COLOR[f.status]
              const label = f.r.title || f.r.name || f.r.id || '—'
              return (
                <div
                  key={i}
                  onClick={() => setExpanded(isExp ? null : i)}
                  style={{ marginBottom: 5, border: `1px solid ${sc}44`, borderRadius: 4, cursor: 'pointer', overflow: 'hidden' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: isExp ? sc + '11' : 'transparent' }}>
                    <span style={{
                      fontSize: 8, fontWeight: 700, color: sc,
                      border: `1px solid ${sc}`, borderRadius: 2,
                      padding: '1px 4px', minWidth: 56, textAlign: 'center', flexShrink: 0,
                    }}>{f.status.replace('_', ' ')}</span>
                    <span style={{ flex: 1, fontSize: 10, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {label}
                    </span>
                    <span style={{ fontSize: 9, color: '#94a3b8', flexShrink: 0 }}>
                      T:{f.matchedTasks.length} I:{f.matchedInvs.length} L:{f.matchedIntel.length}
                    </span>
                    <span style={{ fontSize: 9, color: '#64748b' }}>{isExp ? '▴' : '▾'}</span>
                  </div>
                  {isExp && (
                    <div style={{ padding: '8px 10px', borderTop: `1px solid ${sc}22`, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 8, color: '#4ade80', fontWeight: 700, marginBottom: 4 }}>TASKS ({f.matchedTasks.length})</div>
                        {f.matchedTasks.length === 0
                          ? <div style={{ fontSize: 8, color: '#6b7280' }}>none</div>
                          : f.matchedTasks.slice(0, 4).map((t, ti) => (
                              <div key={ti} style={{ fontSize: 8, color: '#a5f3fc', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                • {t.title || t.name || t.id}
                              </div>
                            ))}
                      </div>
                      <div>
                        <div style={{ fontSize: 8, color: '#f59e0b', fontWeight: 700, marginBottom: 4 }}>CASES ({f.matchedInvs.length})</div>
                        {f.matchedInvs.length === 0
                          ? <div style={{ fontSize: 8, color: '#6b7280' }}>none</div>
                          : f.matchedInvs.slice(0, 4).map((v, vi) => (
                              <div key={vi} style={{ fontSize: 8, color: '#fcd34d', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                • {v.title || v.name || v.id}
                              </div>
                            ))}
                      </div>
                      <div>
                        <div style={{ fontSize: 8, color: CY, fontWeight: 700, marginBottom: 4 }}>LIVE ({f.matchedIntel.length})</div>
                        {f.matchedIntel.length === 0
                          ? <div style={{ fontSize: 8, color: '#6b7280' }}>none</div>
                          : f.matchedIntel.slice(0, 4).map((li, lii) => (
                              <div key={lii} style={{ fontSize: 8, color: '#bae6fd', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                • {li}
                              </div>
                            ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {!loading && filtered.length === 0 && risks.length > 0 && (
              <div style={{ color: '#6b7280', fontSize: 10 }}>No results for current filter.</div>
            )}
            {!loading && risks.length === 0 && !error && (
              <div style={{ color: '#6b7280', fontSize: 10 }}>No risk signals — endpoints may require live data.</div>
            )}
          </div>

          <div style={{ marginTop: 8, fontSize: 8, color: '#334155' }}>
            QIF · {new Date(ts).toLocaleTimeString()} · {risks.length}R · {tasks.length}T · {invs.length}I · {liveIntel.length}L
          </div>
        </div>
      )}
    </>
  )
}
