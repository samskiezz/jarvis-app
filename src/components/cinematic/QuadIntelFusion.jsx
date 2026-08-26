import { useState, useEffect, useCallback } from 'react'

const CY = '#29E7FF'
const API_KEY = typeof window !== 'undefined' ? (window.__JARVIS_API_KEY__ || 'dev-key') : 'dev-key'
const apiBase = () => (typeof window !== 'undefined' && window.__JARVIS_API_BASE__) ? window.__JARVIS_API_BASE__ : 'http://localhost:8000'

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
  QUAD_LOCKED: '#29E7FF',
  TRIPLE_FUSED: '#4ade80',
  DUAL_CORRELATED: '#f59e0b',
  ISOLATED: '#6b7280',
}

export default function QuadIntelFusion() {
  const [risks, setRisks] = useState([])
  const [tasks, setTasks] = useState([])
  const [invs, setInvs] = useState([])
  const [liveIntel, setLiveIntel] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [ts, setTs] = useState(Date.now())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const base = apiBase()
    const hdr = { Authorization: `Bearer ${API_KEY}` }
    try {
      const [rRes, tRes, iRes, lRes] = await Promise.allSettled([
        fetch(`${base}/entities/RiskSignal`, { headers: hdr }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/entities/Task`, { headers: hdr }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/v1/investigations`, { headers: hdr }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/functions/getLiveIntel`, { headers: hdr }).then(r => r.ok ? r.json() : {}),
      ])
      setRisks(Array.isArray(rRes.value) ? rRes.value : [])
      setTasks(Array.isArray(tRes.value) ? tRes.value : [])
      setInvs(Array.isArray(iRes.value) ? iRes.value : [])
      const li = lRes.value || {}
      const quakes = Array.isArray(li.earthquakes) ? li.earthquakes : []
      const crypto = Array.isArray(li.crypto) ? li.crypto : []
      const fx = Array.isArray(li.fx) ? li.fx : []
      setLiveIntel([
        ...quakes.map(q => q.place || q.title || ''),
        ...crypto.map(c => c.name || c.symbol || ''),
        ...fx.map(f => f.pair || f.symbol || ''),
      ].filter(Boolean))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
      setTs(Date.now())
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setInterval(load, 90000)
    return () => clearInterval(t)
  }, [load])

  const fused = risks.map(r => {
    const rText = `${r.title || r.name || ''} ${r.description || r.summary || ''} ${(r.tags || []).join(' ')}`
    const kw = extractKw(rText)
    const matchedTasks = tasks.filter(t => kwScore(`${t.title || t.name || ''} ${t.description || t.notes || ''}`, kw) > 0.1)
    const matchedInvs = invs.filter(i => kwScore(`${i.title || i.name || ''} ${i.description || i.summary || ''}`, kw) > 0.1)
    const matchedIntel = liveIntel.filter(li => kwScore(li, kw) > 0)
    const hits = (matchedTasks.length > 0 ? 1 : 0) + (matchedInvs.length > 0 ? 1 : 0) + (matchedIntel.length > 0 ? 1 : 0)
    const status = hits === 3 ? 'QUAD_LOCKED' : hits === 2 ? 'TRIPLE_FUSED' : hits === 1 ? 'DUAL_CORRELATED' : 'ISOLATED'
    return { r, matchedTasks, matchedInvs, matchedIntel, hits, status }
  })

  const counts = { QUAD_LOCKED: 0, TRIPLE_FUSED: 0, DUAL_CORRELATED: 0, ISOLATED: 0 }
  fused.forEach(f => counts[f.status]++)

  const filtered = fused
    .filter(f => filter === 'ALL' || f.status === filter)
    .filter(f => !search || `${f.r.title || f.r.name || ''}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.hits - a.hits)

  const pct = risks.length ? Math.round((counts.QUAD_LOCKED + counts.TRIPLE_FUSED) * 100 / risks.length) : 0

  return (
    <div style={{ color: CY, fontFamily: 'monospace', padding: '12px 16px', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>QUAD INTEL FUSION</span>
        <span style={{ fontSize: 9, color: '#4ade80', border: '1px solid #4ade8044', borderRadius: 3, padding: '1px 6px' }}>
          RiskSignal × Task × Investigation × LiveIntel
        </span>
        <button
          onClick={load}
          style={{ marginLeft: 'auto', background: 'none', border: `1px solid ${CY}44`, color: CY, cursor: 'pointer', fontSize: 10, padding: '2px 8px', borderRadius: 3 }}
        >
          ⟳ REFRESH
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        {[
          { k: 'ALL',             label: 'ALL',          val: risks.length,           color: '#94a3b8' },
          { k: 'QUAD_LOCKED',     label: 'QUAD LOCKED',  val: counts.QUAD_LOCKED,     color: CY },
          { k: 'TRIPLE_FUSED',    label: 'TRIPLE FUSED', val: counts.TRIPLE_FUSED,    color: '#4ade80' },
          { k: 'DUAL_CORRELATED', label: 'DUAL CORR',    val: counts.DUAL_CORRELATED, color: '#f59e0b' },
          { k: 'ISOLATED',        label: 'ISOLATED',     val: counts.ISOLATED,        color: '#6b7280' },
        ].map(s => (
          <div
            key={s.k}
            onClick={() => setFilter(s.k)}
            style={{
              cursor: 'pointer', padding: '4px 10px', borderRadius: 4,
              border: `1px solid ${s.color}${filter === s.k ? 'ff' : '44'}`,
              background: filter === s.k ? s.color + '22' : 'transparent',
              color: s.color, fontSize: 10, fontWeight: 700,
            }}
          >
            {s.label} <span style={{ fontSize: 12 }}>{s.val}</span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: 10, color: '#4ade80', display: 'flex', alignItems: 'center' }}>
          FUSION {pct}%
        </div>
      </div>

      {risks.length > 0 && (
        <div style={{ height: 5, borderRadius: 3, background: '#1e2a3a', marginBottom: 10, display: 'flex', overflow: 'hidden' }}>
          {(['QUAD_LOCKED', 'TRIPLE_FUSED', 'DUAL_CORRELATED', 'ISOLATED']).map(s => (
            <div key={s} style={{ flex: counts[s] || 0, background: STATUS_COLOR[s], opacity: 0.85 }} />
          ))}
        </div>
      )}

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search risk signals…"
        style={{
          width: '100%', boxSizing: 'border-box', background: '#0a1628',
          border: `1px solid ${CY}44`, color: CY, padding: '4px 8px',
          borderRadius: 3, fontSize: 11, marginBottom: 10, outline: 'none',
        }}
      />

      {loading && <div style={{ color: '#4ade80', fontSize: 11 }}>Loading quad intel sources…</div>}
      {error && <div style={{ color: '#ef4444', fontSize: 11 }}>Error: {error}</div>}

      {filtered.map((f, i) => {
        const isExp = expanded === i
        const sc = STATUS_COLOR[f.status]
        const label = f.r.title || f.r.name || f.r.id || '—'
        return (
          <div
            key={i}
            onClick={() => setExpanded(isExp ? null : i)}
            style={{ marginBottom: 5, border: `1px solid ${sc}44`, borderRadius: 4, cursor: 'pointer', overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: isExp ? sc + '11' : 'transparent' }}>
              <span style={{
                fontSize: 9, fontWeight: 700, color: sc,
                border: `1px solid ${sc}`, borderRadius: 2,
                padding: '1px 5px', minWidth: 88, textAlign: 'center', flexShrink: 0,
              }}>{f.status}</span>
              <span style={{ flex: 1, fontSize: 11, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {label}
              </span>
              <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>
                T:{f.matchedTasks.length} I:{f.matchedInvs.length} L:{f.matchedIntel.length}
              </span>
              <span style={{ fontSize: 10, color: '#64748b' }}>{isExp ? '▴' : '▾'}</span>
            </div>
            {isExp && (
              <div style={{ padding: '8px 10px', borderTop: `1px solid ${sc}22`, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 9, color: '#4ade80', fontWeight: 700, marginBottom: 4 }}>TASKS ({f.matchedTasks.length})</div>
                  {f.matchedTasks.length === 0
                    ? <div style={{ fontSize: 9, color: '#6b7280' }}>none</div>
                    : f.matchedTasks.slice(0, 5).map((t, ti) => (
                        <div key={ti} style={{ fontSize: 9, color: '#a5f3fc', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          • {t.title || t.name || t.id}
                        </div>
                      ))}
                </div>
                <div>
                  <div style={{ fontSize: 9, color: '#f59e0b', fontWeight: 700, marginBottom: 4 }}>INVESTIGATIONS ({f.matchedInvs.length})</div>
                  {f.matchedInvs.length === 0
                    ? <div style={{ fontSize: 9, color: '#6b7280' }}>none</div>
                    : f.matchedInvs.slice(0, 5).map((v, vi) => (
                        <div key={vi} style={{ fontSize: 9, color: '#fcd34d', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          • {v.title || v.name || v.id}
                        </div>
                      ))}
                </div>
                <div>
                  <div style={{ fontSize: 9, color: CY, fontWeight: 700, marginBottom: 4 }}>LIVE INTEL ({f.matchedIntel.length})</div>
                  {f.matchedIntel.length === 0
                    ? <div style={{ fontSize: 9, color: '#6b7280' }}>none</div>
                    : f.matchedIntel.slice(0, 5).map((li, lii) => (
                        <div key={lii} style={{ fontSize: 9, color: '#bae6fd', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
        <div style={{ color: '#6b7280', fontSize: 11 }}>No results for current filter.</div>
      )}
      {!loading && risks.length === 0 && !error && (
        <div style={{ color: '#6b7280', fontSize: 11 }}>No risk signals — endpoints may require live data.</div>
      )}

      <div style={{ marginTop: 10, fontSize: 9, color: '#334155' }}>
        QIF · {new Date(ts).toLocaleTimeString()} · {risks.length} risks · {tasks.length} tasks · {invs.length} invs · {liveIntel.length} live
      </div>
    </div>
  )
}
