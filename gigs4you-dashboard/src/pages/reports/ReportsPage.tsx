import { useEffect, useState, useCallback, useRef } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import {
  Download, RefreshCw, TrendingUp, TrendingDown, Minus,
  Users, CheckSquare, DollarSign, MapPin, Briefcase, Star,
  Shield, Clock, AlertCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../../api/api'
import { useAuthStore } from '../../store/store'
import { downloadReportPDF } from '../../utils/pdf'

const C = { green:'#1B6B3A', blue:'#3B82F6', amber:'#F59E0B', red:'#EF4444', purple:'#8B5CF6', teal:'#14B8A6' }
const PIE_COLORS = [C.green, C.blue, C.amber, C.red, C.purple, C.teal]
const fmtKES  = (v: number) => `KES ${Number(v).toLocaleString()}`
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-KE',{day:'numeric',month:'short'})
const TooltipStyle = {
  contentStyle: { background:'var(--white)', border:'1px solid var(--border)', borderRadius:8, fontSize:12 },
  labelStyle:   { color:'var(--text-3)', fontWeight:600 },
  itemStyle:    { color:'var(--text-1)' },
}

function KpiCard({ label, value, icon: Icon, color='var(--green)', sub, trend }:
  { label:string; value:string|number; icon?:any; color?:string; sub?:string; trend?:'up'|'down'|'flat' }) {
  return (
    <div className="stat-card">
      {Icon && <Icon size={18} color={color} style={{ marginBottom:6 }} />}
      <div className="stat-value" style={{ color }}>{value}</div>
      <div className="stat-label">{label}</div>
      {sub && (
        <div className={`stat-change ${trend||''}`} style={{ display:'flex', alignItems:'center', gap:3 }}>
          {trend==='up'   && <TrendingUp  size={12}/>}
          {trend==='down' && <TrendingDown size={12}/>}
          {trend==='flat' && <Minus       size={12}/>}
          {sub}
        </div>
      )}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.8px',
      color:'var(--text-4)', marginBottom:12, marginTop:20 }}>
      {children}
    </div>
  )
}

function Empty({ msg='No data for this period' }: { msg?: string }) {
  return <div style={{ padding:'40px 20px', textAlign:'center', color:'var(--text-4)', fontSize:13 }}>{msg}</div>
}

function Spinner() {
  return <div style={{ padding:60, textAlign:'center' }}>
    <RefreshCw size={22} className="spin" style={{ color:'var(--green)' }} />
  </div>
}

// ─── Tasks report ────────────────────────────────────────────────────
function TasksReport({ from, to, registerExport }: { from:string; to:string; registerExport:(fn:()=>void)=>void }) {
  const [data, setData] = useState<any>(null)
  useEffect(() => {
    api.get('/reports/tasks', { params:{from,to} }).then(r=>setData(r.data)).catch(()=>{})
  },[from,to])
  useEffect(() => {
    if (!data) return
    registerExport(() => downloadReportPDF({
      title: 'Tasks Report',
      period: `${from} — ${to}`,
      kpis: [
        { label:'Total tasks',     value: data.summary?.total || 0 },
        { label:'Completed',       value: data.summary?.completed || 0 },
        { label:'Completion rate', value: `${data.summary?.completionRate || 0}%` },
        { label:'Failed',          value: data.byStatus?.failed || 0 },
      ],
      tables: [
        {
          heading: 'By status',
          columns: ['Status','Count'],
          rows: Object.entries(data.byStatus||{}).map(([k,v]) => [k, v as number]),
        },
        {
          heading: 'By priority',
          columns: ['Priority','Count'],
          rows: Object.entries(data.byPriority||{}).map(([k,v]) => [k, v as number]),
        },
        ...(data.dailyTrend?.length ? [{
          heading: 'Daily trend',
          columns: ['Date','Total','Completed'],
          rows: data.dailyTrend.map((d:any) => [d.date, d.total, d.completed]),
        }] : []),
      ],
    }))
  }, [data])
  if (!data) return <Spinner/>
  const statusData = Object.entries(data.byStatus||{}).map(([k,v]) => ({ name:k, value: v as number }))
  const prioData   = Object.entries(data.byPriority||{}).map(([k,v]) => ({ name:k, value: v as number }))
  return (
    <>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        <KpiCard label="Total Tasks"     value={data.summary?.total||0}                       icon={CheckSquare} color={C.green}  />
        <KpiCard label="Completed"       value={data.summary?.completed||0}                   icon={CheckSquare} color={C.teal}   />
        <KpiCard label="Completion rate" value={`${data.summary?.completionRate||0}%`}        icon={TrendingUp}  color={C.blue}   />
        <KpiCard label="Failed"          value={data.byStatus?.failed||0}                     icon={AlertCircle} color={C.red}    />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:14 }}>
        <div className="card" style={{ padding:16 }}>
          <SectionTitle>Daily volume</SectionTitle>
          {data.dailyTrend?.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={data.dailyTrend}>
                <defs>
                  <linearGradient id="gT" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.green} stopOpacity={0.15}/><stop offset="95%" stopColor={C.green} stopOpacity={0}/></linearGradient>
                  <linearGradient id="gD" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.teal}  stopOpacity={0.15}/><stop offset="95%" stopColor={C.teal}  stopOpacity={0}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize:10 }}/>
                <YAxis tick={{ fontSize:10 }}/>
                <Tooltip {...TooltipStyle}/>
                <Area type="monotone" dataKey="total"     stroke={C.green} fill="url(#gT)" name="Total"    />
                <Area type="monotone" dataKey="completed" stroke={C.teal}  fill="url(#gD)" name="Completed"/>
              </AreaChart>
            </ResponsiveContainer>
          ) : <Empty/>}
        </div>
        <div className="card" style={{ padding:16 }}>
          <SectionTitle>By status</SectionTitle>
          {statusData.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}
                  label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false} style={{fontSize:9}}>
                  {statusData.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                </Pie>
                <Tooltip {...TooltipStyle}/>
              </PieChart>
            </ResponsiveContainer>
          ) : <Empty/>}
        </div>
        <div className="card" style={{ padding:16 }}>
          <SectionTitle>By priority</SectionTitle>
          {prioData.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={prioData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                <XAxis type="number" tick={{ fontSize:10 }}/>
                <YAxis dataKey="name" type="category" tick={{ fontSize:10 }} width={55}/>
                <Tooltip {...TooltipStyle}/>
                <Bar dataKey="value" name="Tasks" radius={[0,4,4,0]}>
                  {prioData.map((_,i)=><Cell key={i} fill={[C.red,C.amber,C.blue][i%3]}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty/>}
        </div>
      </div>
    </>
  )
}

// ─── Agent performance ───────────────────────────────────────────────
function AgentPerformanceReport({ from, to, registerExport }: { from:string; to:string; registerExport:(fn:()=>void)=>void }) {
  const [data, setData] = useState<any>(null)
  useEffect(() => {
    api.get('/reports/agent-performance', { params:{from,to} }).then(r=>setData(r.data)).catch(()=>{})
  },[from,to])
  useEffect(() => {
    if (!data) return
    const agents: any[] = data.agents || []
    registerExport(() => downloadReportPDF({
      title: 'Agent Performance Report',
      period: `${from} — ${to}`,
      kpis: [
        { label:'Total agents',   value: agents.length },
        { label:'Avg completion', value: `${Math.round(agents.reduce((s,a)=>s+a.completionRate,0)/(agents.length||1))}%` },
        { label:'Top performer',  value: agents[0]?.name || '—' },
      ],
      tables: [{
        heading: 'Agent leaderboard',
        columns: ['#','Agent','Tasks','Done','Rate %','XP','Level','Streak','Rating'],
        rows: agents.map((a,i) => [i+1, a.name||'—', a.tasksTotal, a.tasksCompleted,
          `${a.completionRate}%`, a.totalXp, `L${a.level}`, `${a.streak}🔥`,
          Number(a.averageRating||0).toFixed(1)]),
      }],
    }))
  }, [data])
  if (!data) return <Spinner/>
  const agents: any[] = data.agents || []
  return (
    <>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
        <KpiCard label="Agents"          value={agents.length}        icon={Users}     color={C.green}/>
        <KpiCard label="Avg completion"  value={`${Math.round(agents.reduce((s,a)=>s+a.completionRate,0)/(agents.length||1))}%`} icon={TrendingUp} color={C.teal}/>
        <KpiCard label="Top performer"   value={agents[0]?.name||'—'} icon={Star}      color={C.amber}/>
      </div>
      <div className="card" style={{ overflow:'hidden' }}>
        <table className="data-table">
          <thead><tr>
            <th>#</th><th>Agent</th><th>Tasks</th><th>Done</th><th>Rate</th><th>XP</th><th>Level</th><th>Streak</th><th>Rating</th>
          </tr></thead>
          <tbody>
            {agents.length === 0
              ? <tr><td colSpan={9} style={{padding:32,textAlign:'center',color:'var(--text-4)'}}>No data</td></tr>
              : agents.map((a,i) => (
                <tr key={a.agentId}>
                  <td style={{ fontWeight:700, color:'var(--text-4)' }}>#{i+1}</td>
                  <td style={{ fontWeight:600 }}>{a.name||'—'}</td>
                  <td>{a.tasksTotal}</td>
                  <td style={{ color:C.teal, fontWeight:600 }}>{a.tasksCompleted}</td>
                  <td>
                    <span style={{ padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:700,
                      background:a.completionRate>=80?'var(--green-pale)':a.completionRate>=50?'var(--accent-pale)':'var(--danger-pale)',
                      color:     a.completionRate>=80?C.green:a.completionRate>=50?'#92400E':C.red }}>
                      {a.completionRate}%
                    </span>
                  </td>
                  <td style={{ color:C.amber, fontWeight:600 }}>{a.totalXp}</td>
                  <td>L{a.level}</td>
                  <td>{a.streak}🔥</td>
                  <td>{'⭐'.repeat(Math.round(a.averageRating||0))} {Number(a.averageRating||0).toFixed(1)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── Attendance & GPS ────────────────────────────────────────────────
function AttendanceReport({ from, to, registerExport }: { from:string; to:string; registerExport:(fn:()=>void)=>void }) {
  const [att, setAtt] = useState<any>(null)
  const [gps, setGps] = useState<any>(null)
  useEffect(() => {
    Promise.allSettled([
      api.get('/reports/attendance',    { params:{from,to} }),
      api.get('/reports/gps-analytics', { params:{from,to} }),
    ]).then(([a,g]) => {
      if (a.status==='fulfilled') setAtt(a.value.data)
      if (g.status==='fulfilled') setGps(g.value.data)
    })
  },[from,to])
  useEffect(() => {
    if (!att && !gps) return
    const attAgents: any[] = att?.attendance || []
    const gpsAgents: any[] = gps?.agents || []
    registerExport(() => downloadReportPDF({
      title: 'Attendance & GPS Report',
      period: `${from} — ${to}`,
      kpis: [
        { label:'GPS pings',     value: gps?.totalPings || 0 },
        { label:'Agents logged', value: attAgents.length },
        { label:'Anomalies',     value: gps?.anomalies?.length || 0 },
      ],
      tables: [
        { heading:'Attendance', columns:['Agent','Days present','Streak'],
          rows: attAgents.map((a:any) => [a.name||'—', a.daysPresent, `${a.streak||0}🔥`]) },
        { heading:'GPS activity', columns:['Agent','Pings','Active days','Max km/h','Flags'],
          rows: gpsAgents.map((a:any) => [a.name||'—', a.totalPings, a.activeDays, a.maxSpeed, a.flaggedPings]) },
      ],
    }))
  }, [att, gps])
  const attAgents: any[] = att?.attendance || []
  const gpsAgents: any[] = gps?.agents     || []
  return (
    <>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
        <KpiCard label="GPS pings"     value={gps?.totalPings||0}         icon={MapPin}      color={C.blue}  />
        <KpiCard label="Agents logged" value={attAgents.length}           icon={Users}       color={C.green} />
        <KpiCard label="Anomalies"     value={gps?.anomalies?.length||0}  icon={AlertCircle} color={C.red}   />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <div className="card" style={{ overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}>Attendance</div>
          <table className="data-table">
            <thead><tr><th>Agent</th><th>Days present</th><th>Streak</th></tr></thead>
            <tbody>
              {attAgents.length === 0
                ? <tr><td colSpan={3} style={{padding:24,textAlign:'center',color:'var(--text-4)'}}>No data</td></tr>
                : attAgents.sort((a:any,b:any)=>b.daysPresent-a.daysPresent).map((a:any) => (
                  <tr key={a.agentId}>
                    <td style={{ fontWeight:500 }}>{a.name||'—'}</td>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div className="progress-track" style={{ flex:1 }}>
                          <div className="progress-fill" style={{ width:`${Math.min(100,(a.daysPresent/30)*100)}%` }}/>
                        </div>
                        <span style={{ fontSize:12, fontWeight:700 }}>{a.daysPresent}</span>
                      </div>
                    </td>
                    <td>{a.streak||0}🔥</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="card" style={{ overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}>GPS Activity</div>
          <table className="data-table">
            <thead><tr><th>Agent</th><th>Pings</th><th>Days</th><th>Max km/h</th><th>Flags</th></tr></thead>
            <tbody>
              {gpsAgents.length === 0
                ? <tr><td colSpan={5} style={{padding:24,textAlign:'center',color:'var(--text-4)'}}>No GPS data</td></tr>
                : gpsAgents.map((a:any) => (
                  <tr key={a.agentId}>
                    <td style={{ fontWeight:500 }}>{a.name||'—'}</td>
                    <td>{a.totalPings}</td>
                    <td>{a.activeDays}</td>
                    <td>{a.maxSpeed}</td>
                    <td>{a.flaggedPings>0
                      ? <span className="badge badge-red">{a.flaggedPings}</span>
                      : <span className="badge badge-green">0</span>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ─── Financial ───────────────────────────────────────────────────────
function FinancialReport({ from, to, isSuperAdmin, registerExport }: { from:string; to:string; isSuperAdmin:boolean; registerExport:(fn:()=>void)=>void }) {
  const [data, setData] = useState<any>(null)
  const [plat, setPlat] = useState<any>(null)
  const [err,  setErr]  = useState(false)
  useEffect(() => {
    setErr(false); setData(null)
    api.get('/reports/financial', { params:{from,to} }).then(r=>setData(r.data)).catch(()=>setErr(true))
    if (isSuperAdmin) api.get('/reports/platform-financial').then(r=>setPlat(r.data)).catch(()=>{})
  },[from,to,isSuperAdmin])
  useEffect(() => {
    if (!data) return
    const txs: any[] = data.transactions || []
    registerExport(() => downloadReportPDF({
      title: 'Financial Report',
      period: `${from} — ${to}`,
      kpis: [
        { label:'Total credits',   value: `KES ${Number(data.summary?.totalPaid||0).toLocaleString()}` },
        { label:'Total debits',    value: `KES ${Number(data.summary?.totalWithdrawn||0).toLocaleString()}` },
        { label:'Pending',         value: `KES ${Number(data.summary?.pending||0).toLocaleString()}` },
        { label:'Net flow',        value: `KES ${Number(data.summary?.netFlow||0).toLocaleString()}` },
      ],
      tables: [{
        heading: 'Transactions',
        columns: ['Reference','M-Pesa Ref','Type','Amount (KES)','Description','Status','Date'],
        rows: txs.slice(0, 100).map((tx:any) => [
          tx.reference || '—',
          tx.mpesaRef  || '—',
          tx.type,
          Number(tx.amount).toLocaleString(),
          tx.description,
          tx.status,
          new Date(tx.createdAt).toLocaleDateString('en-KE'),
        ]),
      }],
    }))
  }, [data])
  if (err)  return <Empty msg="Financial data could not be loaded. Check API connectivity." />
  if (!data) return <Spinner/>
  const txs: any[] = data.transactions || []
  return (
    <>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        <KpiCard label="Total credits"  value={fmtKES(data.summary?.totalPaid||0)}      icon={DollarSign} color={C.green} />
        <KpiCard label="Total debits"   value={fmtKES(data.summary?.totalWithdrawn||0)} icon={DollarSign} color={C.amber} />
        <KpiCard label="Pending"        value={fmtKES(data.summary?.pending||0)}        icon={Clock}      color={C.blue}  />
        <KpiCard label="Net flow"       value={fmtKES(data.summary?.netFlow||0)}        icon={TrendingUp}  color={C.teal}  />
      </div>
      {data.paymentTrend?.length > 0 && (
        <div className="card" style={{ padding:16, marginBottom:14 }}>
          <SectionTitle>Payment trend</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data.paymentTrend}>
              <defs>
                <linearGradient id="gCr" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.green} stopOpacity={0.15}/><stop offset="95%" stopColor={C.green} stopOpacity={0}/></linearGradient>
                <linearGradient id="gDb" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.red}   stopOpacity={0.15}/><stop offset="95%" stopColor={C.red}   stopOpacity={0}/></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
              <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize:10 }}/>
              <YAxis tick={{ fontSize:10 }}/>
              <Tooltip {...TooltipStyle} formatter={(v:any)=>`KES ${Number(v).toLocaleString()}`}/>
              <Area type="monotone" dataKey="credits" stroke={C.green} fill="url(#gCr)" name="Credits"/>
              <Area type="monotone" dataKey="debits"  stroke={C.red}   fill="url(#gDb)" name="Debits" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {isSuperAdmin && plat?.monthlyTrend?.length > 0 && (
        <div className="card" style={{ padding:16, marginBottom:14 }}>
          <SectionTitle>Platform monthly revenue</SectionTitle>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={plat.monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
              <XAxis dataKey="month" tick={{ fontSize:10 }}/>
              <YAxis tick={{ fontSize:10 }}/>
              <Tooltip {...TooltipStyle} formatter={(v:any)=>`KES ${Number(v).toLocaleString()}`}/>
              <Bar dataKey="credits" name="Credits" fill={C.green} radius={[4,4,0,0]}/>
              <Bar dataKey="debits"  name="Debits"  fill={C.red}   radius={[4,4,0,0]}/>
              <Legend/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="card" style={{ overflow:'hidden' }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}>
          Transactions ({txs.length})
        </div>
        <table className="data-table">
          <thead><tr><th>Ref</th><th>Type</th><th>Amount</th><th>Description</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>
            {txs.length === 0
              ? <tr><td colSpan={6} style={{padding:24,textAlign:'center',color:'var(--text-4)'}}>No transactions</td></tr>
              : txs.slice(0,50).map((tx:any) => (
                <tr key={tx.id}>
                  <td style={{ fontFamily:'monospace', fontSize:11, color:'var(--text-4)' }}>{tx.reference||'—'}</td>
                  <td><span className={`badge ${tx.type==='credit'?'badge-green':'badge-red'}`}>{tx.type}</span></td>
                  <td style={{ fontWeight:700, color:tx.type==='credit'?C.green:C.red }}>KES {Number(tx.amount).toLocaleString()}</td>
                  <td style={{ fontSize:12 }}>{tx.description}</td>
                  <td><span className={`badge ${tx.status==='completed'?'badge-green':'badge-amber'}`}>{tx.status}</span></td>
                  <td style={{ fontSize:11, color:'var(--text-4)' }}>{new Date(tx.createdAt).toLocaleDateString('en-KE')}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── Jobs analytics ──────────────────────────────────────────────────
function JobsReport({ from, to, registerExport }: { from:string; to:string; registerExport:(fn:()=>void)=>void }) {
  const [data, setData] = useState<any>(null)
  const [err,  setErr]  = useState(false)
  useEffect(() => {
    setData(null); setErr(false)
    api.get('/reports/jobs-analytics', { params:{from,to} }).then(r=>setData(r.data)).catch(()=>setErr(true))
  },[from,to])
  useEffect(() => {
    if (!data) return
    registerExport(() => downloadReportPDF({
      title: 'Jobs & Hiring Report',
      period: `${from} — ${to}`,
      kpis: [
        { label:'Total applications', value: data.total || 0 },
        { label:'Shortlisted',        value: data.byStatus?.shortlisted || 0 },
        { label:'Hired',              value: data.byStatus?.accepted || 0 },
      ],
      tables: [
        { heading:'Application funnel', columns:['Stage','Count'],
          rows: (data.funnel||[]).map((f:any) => [f.stage, f.count]) },
        { heading:'Per job', columns:['Job title','Applied','Shortlisted','Hired'],
          rows: (data.byJob||[]).map((j:any) => [j.title, j.total, j.shortlisted, j.hired]) },
      ],
    }))
  }, [data])
  if (err)   return <Empty msg="Jobs & Hiring data could not be loaded. Check API connectivity."/>
  if (!data) return <Spinner/>
  const funnel: any[] = data.funnel||[]
  const byJob:  any[] = data.byJob ||[]
  return (
    <>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
        <KpiCard label="Total applications" value={data.total||0}               icon={Briefcase} color={C.green} />
        <KpiCard label="Shortlisted"        value={data.byStatus?.shortlisted||0} icon={Users}   color={C.blue}  />
        <KpiCard label="Hired"              value={data.byStatus?.accepted||0}    icon={Star}    color={C.amber} />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <div className="card" style={{ padding:16 }}>
          <SectionTitle>Application funnel</SectionTitle>
          {funnel.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={funnel} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                <XAxis type="number" tick={{ fontSize:10 }}/>
                <YAxis dataKey="stage" type="category" tick={{ fontSize:11 }} width={80}/>
                <Tooltip {...TooltipStyle}/>
                <Bar dataKey="count" name="Applicants" fill={C.green} radius={[0,4,4,0]}/>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty/>}
        </div>
        <div className="card" style={{ overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}>Per job</div>
          <table className="data-table">
            <thead><tr><th>Job</th><th>Applied</th><th>Shortlisted</th><th>Hired</th></tr></thead>
            <tbody>
              {byJob.length === 0
                ? <tr><td colSpan={4} style={{padding:24,textAlign:'center',color:'var(--text-4)'}}>No data</td></tr>
                : byJob.map((j:any,i:number) => (
                  <tr key={i}>
                    <td style={{ fontWeight:500, fontSize:12 }}>{j.title?.length>40?j.title.slice(0,40)+'…':j.title}</td>
                    <td>{j.total}</td>
                    <td style={{ color:C.blue }}>{j.shortlisted}</td>
                    <td style={{ color:C.green, fontWeight:700 }}>{j.hired}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ─── System overview (super_admin) ───────────────────────────────────
function SystemReport() {
  const [data,  setData]  = useState<any>(null)
  const [orgs,  setOrgs]  = useState<any[]>([])
  const [usage, setUsage] = useState<any>(null)
  useEffect(() => {
    Promise.allSettled([
      api.get('/reports/system-overview'),
      api.get('/reports/org-comparison'),
      api.get('/reports/system-usage', { params:{ period:'daily' }}),
    ]).then(([d,o,u]) => {
      if (d.status==='fulfilled') setData(d.value.data)
      if (o.status==='fulfilled') setOrgs(Array.isArray(o.value.data)?o.value.data:[])
      if (u.status==='fulfilled') setUsage(u.value.data)
    })
  },[])
  if (!data) return <Spinner/>
  const roleData   = Object.entries(data.byRole||{}).map(([k,v]) => ({ name:k, value:v as number }))
  const usageTrend = Object.entries(usage?.buckets||{}).map(([label,count]) => ({ label, count }))
  return (
    <>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        <KpiCard label="Total users"      value={data.users?.total||0}           icon={Users}       color={C.green}  />
        <KpiCard label="Active"           value={data.users?.active||0}          icon={Users}       color={C.teal}   />
        <KpiCard label="Signed up today"  value={data.users?.registeredToday||0} icon={TrendingUp}  color={C.blue}   />
        <KpiCard label="Total tasks"      value={data.tasks?.total||0}           icon={CheckSquare} color={C.purple} />
        <KpiCard label="Completed tasks"  value={data.tasks?.completed||0}       icon={CheckSquare} color={C.green}  />
        <KpiCard label="Completion rate"  value={`${data.tasks?.rate||0}%`}      icon={TrendingUp}  color={C.teal}   />
        <KpiCard label="Field agents"     value={data.agents?.total||0}          icon={MapPin}      color={C.amber}  />
        <KpiCard label="Organisations"    value={orgs.length}                    icon={Shield}      color={C.red}    />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
        <div className="card" style={{ padding:16 }}>
          <SectionTitle>Users by role</SectionTitle>
          {roleData.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={roleData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}
                  label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} style={{fontSize:9}}>
                  {roleData.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                </Pie>
                <Tooltip {...TooltipStyle}/>
              </PieChart>
            </ResponsiveContainer>
          ) : <Empty/>}
        </div>
        <div className="card" style={{ padding:16 }}>
          <SectionTitle>Daily logins (last 30 days)</SectionTitle>
          {usageTrend.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={usageTrend}>
                <defs><linearGradient id="gL" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.blue} stopOpacity={0.2}/><stop offset="95%" stopColor={C.blue} stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                <XAxis dataKey="label" tick={{ fontSize:9 }}/><YAxis tick={{ fontSize:10 }}/>
                <Tooltip {...TooltipStyle}/>
                <Area type="monotone" dataKey="count" stroke={C.blue} fill="url(#gL)" name="Logins"/>
              </AreaChart>
            </ResponsiveContainer>
          ) : <Empty/>}
        </div>
      </div>
      <div className="card" style={{ overflow:'hidden' }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}>Organisation comparison</div>
        <table className="data-table">
          <thead><tr><th>Org</th><th>Members</th><th>Agents</th><th>Tasks</th><th>Done</th><th>Rate</th></tr></thead>
          <tbody>
            {orgs.length === 0
              ? <tr><td colSpan={6} style={{padding:24,textAlign:'center',color:'var(--text-4)'}}>No orgs</td></tr>
              : orgs.sort((a:any,b:any)=>b.completionRate-a.completionRate).map((o:any) => (
                <tr key={o.orgId}>
                  <td style={{ fontFamily:'monospace', fontSize:11 }}>{o.orgId?.slice(0,12)}…</td>
                  <td>{o.members}</td><td>{o.agents}</td><td>{o.tasks}</td>
                  <td style={{ color:C.teal, fontWeight:600 }}>{o.completedTasks}</td>
                  <td><span style={{ padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:700,
                    background:o.completionRate>=70?'var(--green-pale)':'var(--accent-pale)',
                    color:     o.completionRate>=70?C.green:'#92400E' }}>{o.completionRate}%</span></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── My performance (agent/worker) ───────────────────────────────────
function MyPerformanceReport() {
  const [data, setData] = useState<any>(null)
  useEffect(() => {
    api.get('/reports/my-performance').then(r=>setData(r.data)).catch(()=>{})
  },[])
  if (!data) return <Spinner/>
  if (data.error) return <Empty msg={data.error}/>
  return (
    <>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        <KpiCard label="Total tasks"   value={data.tasks?.total||0}               icon={CheckSquare} color={C.green}  />
        <KpiCard label="Completed"     value={data.tasks?.completed||0}           icon={CheckSquare} color={C.teal}   />
        <KpiCard label="This month"    value={data.tasks?.thisMonth?.completed||0} icon={TrendingUp} color={C.blue}   />
        <KpiCard label="Completion %"  value={`${data.tasks?.completionRate||0}%`} icon={Star}       color={C.amber}  />
        <KpiCard label="Total XP"      value={data.totalXp||0}                    icon={Star}        color={C.amber}  />
        <KpiCard label="Level"         value={`Level ${data.level||1}`}           icon={TrendingUp}  color={C.green}  />
        <KpiCard label="Streak"        value={`${data.streak||0} days 🔥`}        icon={TrendingUp}  color={C.red}    />
        <KpiCard label="Active days"   value={data.attendance?.activeDaysThisMonth||0} icon={MapPin} color={C.purple} />
      </div>
      {data.tasks?.dailyTrend?.length > 0 && (
        <div className="card" style={{ padding:16 }}>
          <SectionTitle>My tasks — last 30 days</SectionTitle>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.tasks.dailyTrend}>
              <defs><linearGradient id="gMe" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.green} stopOpacity={0.15}/><stop offset="95%" stopColor={C.green} stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
              <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize:10 }}/><YAxis tick={{ fontSize:10 }}/>
              <Tooltip {...TooltipStyle}/>
              <Area type="monotone" dataKey="total"     stroke={C.green} fill="url(#gMe)" name="Tasks"/>
              <Area type="monotone" dataKey="completed" stroke={C.teal}  fill="none"      name="Completed" strokeDasharray="4 2"/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  )
}

// ─── Compliance ──────────────────────────────────────────────────────
function ComplianceReport() {
  const [data, setData] = useState<any>(null)
  const [err,  setErr]  = useState(false)
  useEffect(() => {
    api.get('/reports/compliance').then(r=>setData(r.data)).catch(()=>setErr(true))
  },[])
  if (err)   return <Empty msg="Compliance data could not be loaded. Check API connectivity."/>
  if (!data) return <Spinner/>
  return (
    <>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
        <KpiCard label="KYC verified"  value={data.verifications?.verified||0}  icon={Shield}      color={C.green} />
        <KpiCard label="Unverified"    value={data.verifications?.unverified||0} icon={Shield}      color={C.amber} />
        <KpiCard label="GPS anomalies" value={data.fraud?.flaggedGpsLogs||0}     icon={AlertCircle} color={C.red}   />
      </div>
      <div className="card" style={{ padding:20 }}>
        <SectionTitle>Verification breakdown</SectionTitle>
        <div style={{ display:'flex', gap:14 }}>
          {[
            { l:'Total profiles', v:data.verifications?.total||0 },
            { l:'Verified',       v:data.verifications?.verified||0 },
            { l:'Pending / unverified', v:data.verifications?.unverified||0 },
          ].map(s => (
            <div key={s.l} style={{ flex:1, textAlign:'center', padding:16,
              background:'var(--surface)', borderRadius:10, border:'1px solid var(--border)' }}>
              <div style={{ fontSize:22, fontWeight:800, color:'var(--text-1)' }}>{s.v}</div>
              <div style={{ fontSize:11, color:'var(--text-4)', marginTop:4 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════
const today30ago = () => new Date(Date.now()-30*86400000).toISOString().slice(0,10)
const todayStr   = () => new Date().toISOString().slice(0,10)

export default function ReportsPage() {
  const { user } = useAuthStore()
  const role = user?.role || 'agent'

  const allTabs = [
    { id:'tasks',      label:'📋 Tasks',            roles:['super_admin','admin','manager','supervisor','employer'] },
    { id:'agents',     label:'👥 Agent performance', roles:['super_admin','admin','manager','supervisor'] },
    { id:'attendance', label:'📍 Attendance & GPS',  roles:['super_admin','admin','manager','supervisor'] },
    { id:'financial',  label:'💰 Financial',         roles:['super_admin','admin','manager'] },
    { id:'jobs',       label:'💼 Jobs & Hiring',     roles:['super_admin','admin','employer'] },
    { id:'compliance', label:'🛡 Compliance',        roles:['super_admin','admin'] },
    { id:'system',     label:'🌐 System overview',   roles:['super_admin'] },
    { id:'mine',       label:'⭐ My performance',    roles:['agent','worker'] },
  ]
  const tabs = allTabs.filter(t => t.roles.includes(role))

  const [tab,  setTab]  = useState(tabs[0]?.id || 'mine')
  const [from, setFrom] = useState(today30ago())
  const [to,   setTo]   = useState(todayStr())

  const exportFnRef = useRef<(() => void) | null>(null)
  const registerExport = useCallback((fn: () => void) => { exportFnRef.current = fn }, [])

  const handleDownload = useCallback(() => {
    if (exportFnRef.current) {
      exportFnRef.current()
      toast.success('PDF downloading…')
    } else {
      toast.error('No data loaded yet — wait for the report to load then try again')
    }
  }, [])

  // Reset export fn when tab changes
  useEffect(() => { exportFnRef.current = null }, [tab])

  const showDateRange = !['mine','system','compliance'].includes(tab)

  return (
    <div className="fade-in">
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:700 }}>Reports & Analytics</h1>
          <p style={{ color:'var(--text-3)', fontSize:13, marginTop:2 }}>
            {role==='super_admin' ? 'Platform-wide insights across all organisations'
             : role==='admin'     ? 'Organisation analytics and team performance'
             : role==='manager'   ? 'Team task management and agent performance'
             : role==='supervisor'? 'Field operations and GPS monitoring'
             : role==='employer'  ? 'Job posting and hiring analytics'
             : 'Your personal performance dashboard'}
          </p>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          {showDateRange && (
            <>
              <input type="date" className="inp" style={{ width:140 }} value={from} onChange={e=>setFrom(e.target.value)}/>
              <span style={{ color:'var(--text-4)', fontSize:12 }}>to</span>
              <input type="date" className="inp" style={{ width:140 }} value={to}   onChange={e=>setTo(e.target.value)}/>
            </>
          )}
          <button onClick={handleDownload} className="btn btn-ghost" style={{ gap:5 }}>
            <Download size={13}/> Export PDF
          </button>
        </div>
      </div>

      <div className="tabs" style={{ flexWrap:'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} className={`tab ${tab===t.id?'active':''}`} onClick={()=>setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab==='tasks'      && <TasksReport           from={from} to={to} registerExport={registerExport}/>}
      {tab==='agents'     && <AgentPerformanceReport from={from} to={to} registerExport={registerExport}/>}
      {tab==='attendance' && <AttendanceReport       from={from} to={to} registerExport={registerExport}/>}
      {tab==='financial'  && <FinancialReport        from={from} to={to} isSuperAdmin={role==='super_admin'} registerExport={registerExport}/>}
      {tab==='jobs'       && <JobsReport             from={from} to={to} registerExport={registerExport}/>}
      {tab==='compliance' && <ComplianceReport/>}
      {tab==='system'     && <SystemReport/>}
      {tab==='mine'       && <MyPerformanceReport/>}
    </div>
  )
}
