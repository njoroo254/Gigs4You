import { useEffect, useState } from 'react'
import { ClipboardCheck, Search, RefreshCw, Download, BarChart3 } from 'lucide-react'
import { getAuditLogs, getAuditStats } from '../../api/api'
import { useAuthStore } from '../../store/store'

const ACTION_BADGE: Record<string, string> = {
  LOGIN: 'badge-green', LOGOUT: 'badge-gray',
  CREATE: 'badge-blue', UPDATE: 'badge-amber', DELETE: 'badge-red',
  APPROVE: 'badge-green', REJECT: 'badge-red',
  ASSIGN: 'badge-purple', EXPORT: 'badge-gray',
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: '#3B82F6', UPDATE: '#F59E0B', DELETE: '#EF4444',
  LOGIN: '#10B981', LOGOUT: '#9CA3AF', APPROVE: '#10B981',
  REJECT: '#EF4444', ASSIGN: '#8B5CF6', EXPORT: '#6B7280',
}

export default function AuditPage() {
  const { user } = useAuthStore()
  const isSuperAdmin = user?.role === 'super_admin'

  const [logs,    setLogs]    = useState<any[]>([])
  const [stats,   setStats]   = useState<any[]>([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [page,    setPage]    = useState(1)
  const [tab,     setTab]     = useState<'logs'|'stats'>('logs')

  // filters
  const [search,  setSearch]  = useState('')
  const [action,  setAction]  = useState('')
  const [entity,  setEntity]  = useState('')
  const [from,    setFrom]    = useState('')
  const [to,      setTo]      = useState('')

  const limit = 50

  const load = async (pg = page) => {
    setLoading(true)
    try {
      const params: any = { page: pg, limit }
      if (action) params.action = action
      if (entity) params.entity = entity
      if (from)   params.from   = from
      if (to)     params.to     = to
      const data = await getAuditLogs(params)
      setLogs(data.logs || [])
      setTotal(data.total || 0)
    } catch { setLogs([]) }
    setLoading(false)
  }

  const loadStats = async () => {
    try { const data = await getAuditStats(); setStats(Array.isArray(data) ? data : []) }
    catch { setStats([]) }
  }

  useEffect(() => { load(1); loadStats() }, [])

  const filtered = search
    ? logs.filter(l =>
        l.entity?.toLowerCase().includes(search.toLowerCase()) ||
        l.action?.toLowerCase().includes(search.toLowerCase()) ||
        l.userId?.includes(search) ||
        l.ip?.includes(search)
      )
    : logs

  const exportCSV = () => {
    const rows = [
      ['Time','Action','Entity','Entity ID','User ID','Role','Org','IP'],
      ...filtered.map(l => [
        new Date(l.createdAt).toISOString(), l.action, l.entity,
        l.entityId||'', l.userId||'', l.userRole||'', l.orgId||'', l.ip||'',
      ]),
    ]
    const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type:'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `audit-logs-${new Date().toISOString().slice(0,10)}.csv`; a.click()
  }

  // aggregate stats for the mini chart
  const actionTotals = stats.reduce((acc: Record<string,number>, s) => {
    acc[s.action] = (acc[s.action] || 0) + parseInt(s.count)
    return acc
  }, {})
  const topActions = Object.entries(actionTotals)
    .sort(([,a],[,b]) => b - a).slice(0, 8)
  const maxCount = topActions[0]?.[1] || 1

  const entityTotals = stats.reduce((acc: Record<string,number>, s) => {
    acc[s.entity] = (acc[s.entity] || 0) + parseInt(s.count)
    return acc
  }, {})
  const topEntities = Object.entries(entityTotals)
    .sort(([,a],[,b]) => b - a).slice(0, 8)

  return (
    <div className="fade-in">
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:'var(--green-pale)',
            display:'flex', alignItems:'center', justifyContent:'center' }}>
            <ClipboardCheck size={18} color="var(--green)" />
          </div>
          <div>
            <h1 style={{ fontSize:20, fontWeight:700 }}>Audit Trail</h1>
            <p style={{ color:'var(--text-3)', fontSize:13, marginTop:2 }}>
              {isSuperAdmin ? 'All system activity' : 'Your organisation activity'} — {total.toLocaleString()} events
            </p>
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => { load(1); loadStats() }} className="btn btn-ghost" style={{ gap:5 }}>
            <RefreshCw size={13} /> Refresh
          </button>
          <button onClick={exportCSV} className="btn btn-ghost" style={{ gap:5 }}>
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${tab==='logs'?'active':''}`} onClick={() => setTab('logs')}>
          📋 Event log
        </button>
        <button className={`tab ${tab==='stats'?'active':''}`} onClick={() => setTab('stats')}>
          <BarChart3 size={12} style={{ marginRight:4, verticalAlign:'middle' }} />
          Activity breakdown
        </button>
      </div>

      {tab === 'stats' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
          {/* Actions chart */}
          <div className="card" style={{ padding:20 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:16 }}>Actions (last 30 days)</div>
            {topActions.map(([act, cnt]) => (
              <div key={act} style={{ marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <span className={`badge ${ACTION_BADGE[act]||'badge-gray'}`} style={{ fontSize:10 }}>{act}</span>
                  <span style={{ fontSize:12, fontWeight:600, color:'var(--text-2)' }}>{cnt.toLocaleString()}</span>
                </div>
                <div style={{ height:6, borderRadius:99, background:'var(--border)' }}>
                  <div style={{ height:'100%', borderRadius:99, width:`${(cnt/maxCount)*100}%`,
                    background: ACTION_COLORS[act] || 'var(--green)', transition:'width 0.4s' }} />
                </div>
              </div>
            ))}
          </div>
          {/* Entities chart */}
          <div className="card" style={{ padding:20 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:16 }}>Resources (last 30 days)</div>
            {topEntities.map(([ent, cnt], i) => {
              const colors = ['#1B6B3A','#3B82F6','#8B5CF6','#F59E0B','#EF4444','#0D9488','#EC4899','#6B7280']
              const c = colors[i % colors.length]
              return (
                <div key={ent} style={{ marginBottom:10 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ fontSize:12, fontWeight:500, color:'var(--text-2)' }}>{ent}</span>
                    <span style={{ fontSize:12, fontWeight:600, color:'var(--text-2)' }}>{cnt.toLocaleString()}</span>
                  </div>
                  <div style={{ height:6, borderRadius:99, background:'var(--border)' }}>
                    <div style={{ height:'100%', borderRadius:99,
                      width:`${(cnt/(topEntities[0]?.[1]||1))*100}%`,
                      background:c, transition:'width 0.4s' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'logs' && (
        <>
          {/* Filters */}
          <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
            <div style={{ position:'relative', width:220 }}>
              <Search size={13} style={{ position:'absolute', left:10, top:'50%',
                transform:'translateY(-50%)', color:'var(--text-4)', pointerEvents:'none' }} />
              <input className="inp" placeholder="Search action, entity, IP..." value={search}
                onChange={e => setSearch(e.target.value)} style={{ paddingLeft:30 }} />
            </div>
            <select className="inp" style={{ width:130, fontSize:12 }} value={action}
              onChange={e => setAction(e.target.value)}>
              <option value="">All actions</option>
              {['LOGIN','LOGOUT','CREATE','UPDATE','DELETE','APPROVE','REJECT','ASSIGN','EXPORT'].map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <select className="inp" style={{ width:130, fontSize:12 }} value={entity}
              onChange={e => setEntity(e.target.value)}>
              <option value="">All entities</option>
              {['User','Task','Job','Agent','Organisation','Payment','KYC','Subscription'].map(e => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
            <input type="date" className="inp" style={{ width:140, fontSize:12 }} value={from}
              onChange={e => setFrom(e.target.value)} />
            <input type="date" className="inp" style={{ width:140, fontSize:12 }} value={to}
              onChange={e => setTo(e.target.value)} />
            <button onClick={() => { setPage(1); load(1) }} className="btn btn-primary"
              style={{ fontSize:12, padding:'8px 14px' }}>Filter</button>
          </div>

          <div className="card" style={{ overflow:'hidden' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time</th><th>Action</th><th>Entity</th>
                  <th>User</th><th>IP</th>
                  {isSuperAdmin && <th>Org</th>}
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={isSuperAdmin ? 7 : 6} style={{ padding:40, textAlign:'center', color:'var(--text-4)' }}>
                    Loading audit logs...
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={isSuperAdmin ? 7 : 6} style={{ padding:40, textAlign:'center', color:'var(--text-4)' }}>
                    No audit events found
                  </td></tr>
                ) : filtered.map((log) => (
                  <tr key={log.id}>
                    <td style={{ fontSize:11, color:'var(--text-3)', whiteSpace:'nowrap' }}>
                      {new Date(log.createdAt).toLocaleString('en-KE', {
                        day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', second:'2-digit',
                      })}
                    </td>
                    <td>
                      <span className={`badge ${ACTION_BADGE[log.action]||'badge-gray'}`}
                        style={{ fontSize:10 }}>{log.action}</span>
                    </td>
                    <td style={{ fontSize:12, fontWeight:500, color:'var(--text-2)' }}>
                      {log.entity}
                      {log.entityId && (
                        <div style={{ fontSize:10, color:'var(--text-4)', fontFamily:'monospace' }}>
                          {log.entityId.slice(0, 8)}…
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontSize:11, fontFamily:'monospace', color:'var(--text-3)' }}>
                        {log.userId?.slice(0,8)||'—'}
                      </div>
                      {log.userRole && (
                        <div style={{ fontSize:10, color:'var(--text-4)' }}>{log.userRole.replace('_',' ')}</div>
                      )}
                    </td>
                    <td style={{ fontSize:11, fontFamily:'monospace', color:'var(--text-4)' }}>
                      {log.ip||'—'}
                    </td>
                    {isSuperAdmin && (
                      <td style={{ fontSize:11, fontFamily:'monospace', color:'var(--text-4)' }}>
                        {log.orgId ? log.orgId.slice(0,8)+'…' : '—'}
                      </td>
                    )}
                    <td style={{ fontSize:11, color:'var(--text-3)', maxWidth:200 }}>
                      {log.details ? (
                        <span style={{ fontFamily:'monospace', fontSize:10,
                          display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {JSON.stringify(log.details)}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > limit && (
            <div style={{ display:'flex', justifyContent:'center', gap:8, marginTop:16, alignItems:'center' }}>
              <button className="btn btn-ghost" disabled={page <= 1}
                style={{ padding:'6px 12px', fontSize:12 }}
                onClick={() => { const p = page - 1; setPage(p); load(p) }}>
                ← Previous
              </button>
              <span style={{ fontSize:12, color:'var(--text-3)' }}>
                Page {page} of {Math.ceil(total / limit)}
              </span>
              <button className="btn btn-ghost" disabled={page >= Math.ceil(total / limit)}
                style={{ padding:'6px 12px', fontSize:12 }}
                onClick={() => { const p = page + 1; setPage(p); load(p) }}>
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
