import { useEffect, useState } from 'react'
import { Shield, Search, RefreshCw, Download } from 'lucide-react'
import { getLoginReport } from '../../api/api'

const ROLE_BADGE: Record<string,string> = {
  super_admin:'badge-red', admin:'badge-red', manager:'badge-blue',
  supervisor:'badge-purple', employer:'badge-amber', agent:'badge-green',
}

export default function AccessLogsPage() {
  const [logs, setLogs]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [from, setFrom]     = useState('')
  const [to, setTo]         = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const data = await getLoginReport({ from: from||undefined, to: to||undefined })
      setLogs(Array.isArray(data?.loginLogs) ? data.loginLogs : [])
    } catch { setLogs([]) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = logs.filter(l =>
    !search || l.name?.toLowerCase().includes(search.toLowerCase()) ||
    l.phone?.includes(search) || l.ip?.includes(search) || l.role?.includes(search)
  )

  const exportCSV = () => {
    const rows = [['Name','Phone','Role','IP','Login time'], ...filtered.map(l => [l.name,l.phone,l.role,l.ip,l.loginAt])]
    const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type:'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = 'access-logs.csv'; a.click()
  }

  return (
    <div className="fade-in">
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:700 }}>Access Logs</h1>
          <p style={{ color:'var(--text-3)', fontSize:13, marginTop:2 }}>
            {filtered.length} login events recorded across all organisations
          </p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={load} className="btn btn-ghost" style={{ gap:5 }}><RefreshCw size={13} /> Refresh</button>
          <button onClick={exportCSV} className="btn btn-ghost" style={{ gap:5 }}><Download size={13} /> Export CSV</button>
        </div>
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ position:'relative', width:240 }}>
          <Search size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-4)', pointerEvents:'none' }} />
          <input className="inp" placeholder="Search name, phone, IP, role..." value={search}
            onChange={e => setSearch(e.target.value)} style={{ paddingLeft:30 }} />
        </div>
        <input type="date" className="inp" style={{ width:140, fontSize:12 }} value={from} onChange={e => setFrom(e.target.value)} />
        <input type="date" className="inp" style={{ width:140, fontSize:12 }} value={to} onChange={e => setTo(e.target.value)} />
        <button onClick={load} className="btn btn-primary" style={{ fontSize:12, padding:'8px 14px' }}>Filter</button>
      </div>

      <div className="card" style={{ overflow:'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>User</th><th>Role</th><th>Organisation</th><th>IP address</th><th>Login time</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding:40, textAlign:'center', color:'var(--text-4)' }}>Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} style={{ padding:40, textAlign:'center', color:'var(--text-4)' }}>No access logs yet</td></tr>
            ) : filtered.slice(0,100).map((log, i) => (
              <tr key={i}>
                <td>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div className="avatar avatar-sm avatar-blue">{log.name?.[0]||'?'}</div>
                    <div>
                      <div style={{ fontWeight:500, fontSize:13 }}>{log.name}</div>
                      <div style={{ fontSize:11, color:'var(--text-4)' }}>{log.phone}</div>
                    </div>
                  </div>
                </td>
                <td><span className={`badge ${ROLE_BADGE[log.role]||'badge-gray'}`}>{log.role?.replace('_',' ')}</span></td>
                <td style={{ fontSize:12, color:'var(--text-3)' }}>{log.organisationId?.slice(0,8)||'—'}</td>
                <td style={{ fontFamily:'monospace', fontSize:12, color:'var(--text-3)' }}>{log.ip||'—'}</td>
                <td style={{ fontSize:12, color:'var(--text-3)' }}>
                  {log.loginAt ? new Date(log.loginAt).toLocaleString('en-KE',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
