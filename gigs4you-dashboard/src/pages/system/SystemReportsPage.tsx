import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts'
import { RefreshCw, Download, Activity, Users, TrendingUp,
         Building2, Clock } from 'lucide-react'
import { api, getReportSummary, getAgentPerformance } from '../../api/api'

type ReportTab = 'platform' | 'usage' | 'orgs' | 'workers' | 'financial'

const PIE_COLORS = ['#1B6B3A','#3B82F6','#F59E0B','#8B5CF6','#EF4444','#0D9488','#EC4899']

export default function SystemReportsPage() {
  const [tab, setTab]           = useState<ReportTab>('platform')
  const [loading, setLoading]   = useState(true)
  const [period, setPeriod]     = useState<'hourly'|'daily'|'monthly'>('daily')
  const [data, setData]         = useState<any>({})

  const loadAll = async () => {
    setLoading(true)
    const results = await Promise.allSettled([
      api.get('/reports/system-overview').then(r => r.data),
      api.get(`/reports/system-usage?period=${period}`).then(r => r.data),
      api.get('/reports/org-comparison').then(r => r.data),
      api.get('/reports/worker-pipeline').then(r => r.data),
      api.get('/reports/financial').then(r => r.data),
      getAgentPerformance(),
      api.get('/organisations').then(r => r.data),
    ])
    const [overview, usage, orgs, pipeline, financial, agentPerf, orgList] = results

    setData({
      overview:  overview.status === 'fulfilled'  ? overview.value  : null,
      usage:     usage.status === 'fulfilled'     ? usage.value     : null,
      orgs:      orgs.status === 'fulfilled'      ? orgs.value      : [],
      pipeline:  pipeline.status === 'fulfilled'  ? pipeline.value  : null,
      financial: financial.status === 'fulfilled' ? financial.value : null,
      agentPerf: agentPerf.status === 'fulfilled' ? agentPerf.value : null,
      orgList:   orgList.status === 'fulfilled' && Array.isArray(orgList.value) ? orgList.value : [],
    })
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [period])

  const exportCSV = (rows: any[][], filename: string) => {
    const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type:'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = filename; a.click()
  }

  const usageChartData = data.usage?.buckets
    ? Object.entries(data.usage.buckets).map(([k,v]) => ({ label: k, logins: v }))
    : []

  const byRoleData = data.overview?.byRole
    ? Object.entries(data.overview.byRole).map(([role, count]) => ({ name: role.replace('_',' '), value: count }))
    : []

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:700 }}>System Reports</h1>
          <p style={{ color:'var(--text-3)', fontSize:13, marginTop:2 }}>
            Platform-wide analytics across all {data.orgList?.length || 0} organisations
          </p>
        </div>
        <button onClick={loadAll} disabled={loading} className="btn btn-ghost" style={{ gap:5 }}>
          <RefreshCw size={13} className={loading ? 'spin' : ''} />
          {loading ? 'Loading...' : 'Refresh all'}
        </button>
      </div>

      {/* Platform KPI strip */}
      {data.overview && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:20 }}>
          {[
            { l:'Total users',      v:data.overview.users?.total,    color:'var(--text-1)', icon:'👥' },
            { l:'Active users',     v:data.overview.users?.active,   color:'var(--green)',  icon:'✅' },
            { l:'Registered today', v:data.overview.users?.registeredToday, color:'var(--info)', icon:'🆕' },
            { l:'Total tasks',      v:data.overview.tasks?.total,    color:'var(--accent)', icon:'📋' },
            { l:'Completion rate',  v:`${data.overview.tasks?.rate??0}%`, color:'var(--green)', icon:'📈' },
          ].map(s => (
            <div key={s.l} className="stat-card">
              <div style={{ fontSize:20 }}>{s.icon}</div>
              <div className="stat-value" style={{ color:s.color, marginTop:4 }}>{s.v}</div>
              <div className="stat-label">{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        {([
          { id:'platform', label:'📊 Platform overview' },
          { id:'usage',    label:'⚡ Usage & Traffic' },
          { id:'orgs',     label:'🏢 Organisations' },
          { id:'workers',  label:'👷 Worker pipeline' },
          { id:'financial',label:'💰 Financial' },
        ] as const).map(t => (
          <button key={t.id} className={`tab ${tab===t.id?'active':''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── PLATFORM OVERVIEW ── */}
      {tab === 'platform' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          {/* Users by role pie */}
          <div className="card" style={{ padding:20 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>Users by role</div>
            {byRoleData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={byRoleData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                    dataKey="value" paddingAngle={3} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}
                    labelLine={false}>
                    {byRoleData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize:12, borderRadius:8 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div style={{ color:'var(--text-4)', fontSize:13 }}>No data</div>}
          </div>

          {/* Top agents */}
          <div className="card" style={{ padding:20 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>Top agents — platform wide</div>
            {(data.agentPerf?.agents || []).slice(0,6).map((a: any, i: number) => (
              <div key={a.agentId} style={{ display:'flex', alignItems:'center', gap:8,
                padding:'7px 0', borderBottom:'1px solid var(--border)' }}>
                <span style={{ fontSize:14, width:20 }}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}.`}</span>
                <div className="avatar avatar-sm avatar-green">{a.name?.[0]||'A'}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:500, fontSize:12 }}>{a.name}</div>
                  <div style={{ fontSize:10, color:'var(--text-4)' }}>{a.tasksTotal} tasks</div>
                </div>
                <span className={`badge ${a.completionRate>=90?'badge-green':a.completionRate>=70?'badge-blue':'badge-amber'}`}
                  style={{ fontSize:10 }}>{a.completionRate}%</span>
              </div>
            ))}
            {!(data.agentPerf?.agents?.length) && <div style={{ color:'var(--text-4)', fontSize:13 }}>No agents yet</div>}
          </div>
        </div>
      )}

      {/* ── USAGE & TRAFFIC ── */}
      {tab === 'usage' && (
        <div>
          <div style={{ display:'flex', gap:8, marginBottom:16, alignItems:'center' }}>
            <span style={{ fontSize:13, fontWeight:600, color:'var(--text-2)' }}>View:</span>
            {(['hourly','daily','monthly'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`btn ${period===p?'btn-primary':'btn-ghost'}`}
                style={{ padding:'5px 14px', fontSize:12 }}>
                {p === 'hourly' ? 'By hour (last 24h)' : p === 'daily' ? 'By day (last 30d)' : 'By month (last 12m)'}
              </button>
            ))}
            <span style={{ marginLeft:'auto', fontSize:12, color:'var(--text-4)' }}>
              {data.usage?.totalLogins || 0} total logins in period
            </span>
          </div>

          <div className="card" style={{ padding:20 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>Login traffic</div>
            <div style={{ fontSize:12, color:'var(--text-3)', marginBottom:16 }}>
              {period === 'hourly' ? 'Logins per hour over the last 24 hours'
               : period === 'daily' ? 'Daily login count over the last 30 days'
               : 'Monthly logins over the last 12 months'}
            </div>
            {usageChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={usageChartData} margin={{ left:-20, right:4, top:4, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize:10, fill:'var(--text-4)' }}
                    interval={period==='daily'?4:period==='hourly'?2:0} />
                  <YAxis tick={{ fontSize:11, fill:'var(--text-4)' }} />
                  <Tooltip contentStyle={{ fontSize:12, borderRadius:8 }} />
                  <Bar dataKey="logins" name="Logins" fill="var(--green)" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ padding:40, textAlign:'center', color:'var(--text-4)' }}>
                No login data yet — traffic appears once users start logging in
              </div>
            )}
          </div>

          {/* Quick stats */}
          {data.overview && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginTop:16 }}>
              {[
                { l:'Registered today', v:data.overview.users?.registeredToday ?? 0, icon:'🆕' },
                { l:'Total platform users', v:data.overview.users?.total ?? 0, icon:'👥' },
                { l:'Active users', v:data.overview.users?.active ?? 0, icon:'✅' },
                { l:'Total agents', v:data.overview.agents?.total ?? 0, icon:'🏃' },
              ].map(s => (
                <div key={s.l} className="stat-card" style={{ textAlign:'center' }}>
                  <div style={{ fontSize:22 }}>{s.icon}</div>
                  <div className="stat-value" style={{ marginTop:6 }}>{s.v}</div>
                  <div className="stat-label">{s.l}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ORGANISATIONS ── */}
      {tab === 'orgs' && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:14 }}>
            <div style={{ fontWeight:600, fontSize:14 }}>{data.orgList?.length || 0} organisations on platform</div>
            <button className="btn btn-ghost" style={{ gap:5 }}
              onClick={() => exportCSV(
                [['Name','Industry','County','Members','Active'],
                 ...(data.orgs||[]).map((o: any) => [o.orgId,o.members,o.agents,o.tasks,`${o.completionRate}%`])],
                'org-comparison.csv')}>
              <Download size={12} /> Export
            </button>
          </div>

          {/* Org comparison table */}
          <div className="card" style={{ overflow:'hidden', marginBottom:16 }}>
            <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:14 }}>
              Organisation KPI comparison
            </div>
            <table className="data-table">
              <thead><tr><th>Organisation</th><th>Members</th><th>Agents</th><th>Tasks</th><th>Completion</th></tr></thead>
              <tbody>
                {(data.orgs || []).length === 0 ? (
                  <tr><td colSpan={5} style={{ padding:32, textAlign:'center', color:'var(--text-4)' }}>No org comparison data yet</td></tr>
                ) : (data.orgs || []).map((o: any) => {
                  const orgInfo = data.orgList?.find((org: any) => org.id === o.orgId)
                  return (
                    <tr key={o.orgId}>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ width:28, height:28, borderRadius:6, background:'var(--green-pale)',
                            display:'flex', alignItems:'center', justifyContent:'center' }}>
                            <Building2 size={14} color="var(--green)" />
                          </div>
                          <div>
                            <div style={{ fontWeight:500, fontSize:13 }}>{orgInfo?.name || o.orgId?.slice(0,8)}</div>
                            <div style={{ fontSize:10, color:'var(--text-4)' }}>{orgInfo?.industry || ''}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontWeight:600 }}>{o.members}</td>
                      <td style={{ fontWeight:600 }}>{o.agents}</td>
                      <td style={{ fontWeight:600 }}>{o.tasks}</td>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ flex:1, height:6, background:'var(--border)', borderRadius:3, maxWidth:80 }}>
                            <div style={{ height:'100%', background:o.completionRate>=80?'var(--green)':o.completionRate>=60?'var(--accent)':'var(--danger)',
                              borderRadius:3, width:`${o.completionRate}%` }} />
                          </div>
                          <span style={{ fontSize:12, fontWeight:600 }}>{o.completionRate}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── WORKER PIPELINE ── */}
      {tab === 'workers' && (
        <div>
          {data.pipeline ? (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:20 }}>
                {[
                  { l:'Registered workers', v:data.pipeline.workerCount, color:'var(--text-1)', icon:'👤', pct:null },
                  { l:'Applied for jobs',   v:data.pipeline.applications, color:'var(--info)', icon:'📋', pct: data.pipeline.workerCount > 0 ? Math.round(data.pipeline.applications/data.pipeline.workerCount*100) : 0 },
                  { l:'Hired (in org)',     v:data.pipeline.hired, color:'var(--green)', icon:'✅', pct: data.pipeline.workerCount > 0 ? Math.round(data.pipeline.hired/data.pipeline.workerCount*100) : 0 },
                  { l:'Conversion rate',   v:`${data.pipeline.conversionRate}%`, color:'var(--accent)', icon:'📈', pct:null },
                ].map(s => (
                  <div key={s.l} className="stat-card">
                    <div style={{ fontSize:22 }}>{s.icon}</div>
                    <div className="stat-value" style={{ color:s.color, marginTop:4 }}>{s.v}</div>
                    <div className="stat-label">{s.l}</div>
                    {s.pct !== null && (
                      <div style={{ fontSize:10, color:'var(--text-4)', marginTop:3 }}>{s.pct}% of registered</div>
                    )}
                  </div>
                ))}
              </div>

              {/* Pipeline funnel */}
              <div className="card" style={{ padding:20 }}>
                <div style={{ fontWeight:700, fontSize:14, marginBottom:16 }}>Worker conversion funnel</div>
                {[
                  { label:'Registered workers', value:data.pipeline.workerCount, pct:100 },
                  { label:'Applied for a job',  value:data.pipeline.applications, pct: data.pipeline.workerCount > 0 ? Math.round(data.pipeline.applications/data.pipeline.workerCount*100) : 0 },
                  { label:'Hired into a team',  value:data.pipeline.hired, pct: data.pipeline.conversionRate },
                ].map((step, i) => (
                  <div key={step.label} style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                    <div style={{ width:24, height:24, borderRadius:'50%', background:'var(--green)', color:'#fff',
                      display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>
                      {i+1}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                        <span style={{ fontSize:13, fontWeight:500 }}>{step.label}</span>
                        <span style={{ fontSize:13, fontWeight:700, color:'var(--green)' }}>{step.value} ({step.pct}%)</span>
                      </div>
                      <div style={{ height:8, background:'var(--border)', borderRadius:4 }}>
                        <div style={{ height:'100%', background:'var(--green)', borderRadius:4,
                          width:`${step.pct}%`, transition:'width 0.4s' }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : <div style={{ padding:40, textAlign:'center', color:'var(--text-4)' }}>Loading pipeline data...</div>}
        </div>
      )}

      {/* ── FINANCIAL ── */}
      {tab === 'financial' && (
        <div>
          {data.financial?.summary ? (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:20 }}>
                {[
                  { l:'Total paid out',    v:`KES ${Number(data.financial.summary.totalPaid||0).toLocaleString()}`,      color:'var(--green)' },
                  { l:'Total withdrawn',   v:`KES ${Number(data.financial.summary.totalWithdrawn||0).toLocaleString()}`, color:'var(--info)' },
                  { l:'Pending payouts',   v:`KES ${Number(data.financial.summary.pending||0).toLocaleString()}`,        color:'var(--accent)' },
                ].map(s => (
                  <div key={s.l} className="stat-card">
                    <div className="stat-label">{s.l}</div>
                    <div className="stat-value" style={{ color:s.color, marginTop:6 }}>{s.v}</div>
                  </div>
                ))}
              </div>

              <div className="card" style={{ overflow:'hidden' }}>
                <div style={{ display:'flex', justifyContent:'space-between', padding:'14px 16px',
                  borderBottom:'1px solid var(--border)' }}>
                  <span style={{ fontWeight:700, fontSize:14 }}>
                    Recent transactions ({(data.financial.transactions||[]).length})
                  </span>
                  <button className="btn btn-ghost" style={{ gap:5, fontSize:12 }}
                    onClick={() => exportCSV(
                      [['Description','Type','Amount','Status','Date'],
                       ...(data.financial.transactions||[]).map((t: any) =>
                        [t.description, t.type, t.amount, t.status, t.createdAt])],
                      'financial-report.csv')}>
                    <Download size={12} /> Export CSV
                  </button>
                </div>
                <table className="data-table">
                  <thead><tr><th>Description</th><th>Type</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
                  <tbody>
                    {(data.financial.transactions||[]).length === 0 ? (
                      <tr><td colSpan={5} style={{ padding:32, textAlign:'center', color:'var(--text-4)' }}>No transactions yet</td></tr>
                    ) : (data.financial.transactions||[]).slice(0,20).map((tx: any) => (
                      <tr key={tx.id}>
                        <td style={{ fontWeight:500 }}>{tx.description}</td>
                        <td><span className={`badge ${tx.type==='credit'?'badge-green':'badge-red'}`}>{tx.type}</span></td>
                        <td style={{ fontWeight:600, color:tx.type==='credit'?'var(--green)':'var(--danger)' }}>
                          {tx.type==='credit'?'+':'-'}KES {Number(tx.amount).toLocaleString()}
                        </td>
                        <td><span className={`badge ${tx.status==='completed'?'badge-green':'badge-amber'}`}>{tx.status}</span></td>
                        <td style={{ fontSize:11, color:'var(--text-4)' }}>
                          {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'}) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : <div style={{ padding:40, textAlign:'center', color:'var(--text-4)' }}>Loading financial data...</div>}
        </div>
      )}
    </div>
  )
}
