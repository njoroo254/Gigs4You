import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, CheckSquare, Briefcase, TrendingUp,
         AlertTriangle, ArrowRight, Clock, Zap, MapPin,
         CreditCard, Star, RefreshCw, Sparkles } from 'lucide-react'
// import Card from '../../components/ui/Card'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
         AreaChart, Area, CartesianGrid } from 'recharts'
import { useAuthStore } from '../../store/store'
import LiveMap from '../../components/maps/LiveMap'
import Card from '../../components/ui/Card'
import { getReportSummary, getTaskStats, getAgents,
         getTasks, getJobStats, getWalletStats } from '../../api/api'

const AI_SERVICE = import.meta.env.VITE_AI_SERVICE || 'http://localhost:8001'

const GREET = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}


export default function DashboardPage() {
  const { user } = useAuthStore()
  const isManager = ['super_admin','admin','manager','supervisor','employer'].includes(user?.role)
  const ROLE_LABELS: Record<string, string> = {
    super_admin: 'Super Admin', admin: 'Admin', manager: 'Manager',
    supervisor: 'Supervisor', employer: 'Employer', agent: 'Field Agent',
  }
  const roleLabel = ROLE_LABELS[user?.role] || 'User'
  const navigate = useNavigate()
  const [summary, setSummary]   = useState<any>({})
  const [taskSt, setTaskSt]     = useState<any>({})
  const [jobSt, setJobSt]       = useState<any>({})
  const [walletSt, setWalletSt] = useState<any>({})
  const [agents, setAgents]     = useState<any[]>([])
  const [tasks, setTasks]       = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [aiInsights, setAiInsights] = useState<string[]>([])
  const [insightsLoading, setInsL]  = useState(false)

  const load = async () => {
    setLoading(true)
    const results = await Promise.allSettled([
      getReportSummary(), getTaskStats(), getJobStats(),
      getWalletStats(), getAgents(), getTasks(),
    ])
    if (results[0].status === 'fulfilled') setSummary(results[0].value)
    if (results[1].status === 'fulfilled') setTaskSt(results[1].value)
    if (results[2].status === 'fulfilled') setJobSt(results[2].value)
    if (results[3].status === 'fulfilled') setWalletSt(results[3].value)
    if (results[4].status === 'fulfilled') setAgents(Array.isArray(results[4].value) ? results[4].value : [])
    if (results[5].status === 'fulfilled') {
      const raw = results[5].value
      setTasks(Array.isArray(raw) ? raw.slice(0, 8) : [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!isManager) return
    setInsL(true)
    fetch(`${AI_SERVICE}/analytics/user-insights`)
      .then(r => r.json())
      .then(data => {
        // ResponseBuilder wraps payload under data.data; fall back to flat shape
        const insights = data?.data?.ai_insights ?? data?.ai_insights
        if (Array.isArray(insights) && insights.length > 0) {
          setAiInsights(insights)
        }
      })
      .catch(() => {})
      .finally(() => setInsL(false))
  }, [])

  const checkedIn = agents.filter(a => a.status === 'checked_in').length
  const totalAgents = agents.length

  // Build last-7-days chart from real tasks
  const weekData = useMemo(() => {
    const today = new Date()
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today)
      d.setDate(d.getDate() - (6 - i))
      const label = d.toLocaleDateString('en', { weekday: 'short' })
      const dayTasks = tasks.filter(t => {
        const td = new Date(t.createdAt)
        return td.toDateString() === d.toDateString()
      })
      return { day: label, tasks: dayTasks.length, done: dayTasks.filter(t => t.status === 'completed').length }
    })
  }, [tasks])

  // Build agent activity from checked-in count by hour (approximation from live data)
  const activityData = useMemo(() => {
    const hours = ['6am','7am','8am','9am','10am','11am','12pm','1pm','2pm','3pm','4pm','5pm']
    return hours.map(t => ({ t, v: 0 }))
  }, [])

  const KPIS = isManager ? [
    { label:'Agents in field', value: checkedIn, sub:`of ${totalAgents} total`, icon:Users, color:'var(--green)',  bg:'var(--green-pale)',  link:'/agents' },
    { label:'Tasks today',     value: taskSt.total ?? 0, sub:`${taskSt.completionRate ?? 0}% complete`, icon:CheckSquare, color:'var(--info)',   bg:'var(--info-pale)',   link:'/tasks' },
    { label:'Open jobs',       value: jobSt.open ?? 0, sub:`${jobSt.total ?? 0} total`, icon:Briefcase, color:'var(--purple)', bg:'var(--purple-pale)', link:'/jobs' },
    { label:'Platform payouts',value: `KES ${Number(walletSt.totalPaidOut || 0).toLocaleString()}`, sub:'all time', icon:CreditCard, color:'var(--accent)', bg:'var(--accent-pale)', link:'/payments' },
  ] : [
    { label:'My tasks', value: taskSt.total ?? 0, sub:`${taskSt.pending ?? 0} pending`, icon:CheckSquare, color:'var(--green)',  bg:'var(--green-pale)',  link:'/tasks' },
    { label:'Completed', value: taskSt.completed ?? 0, sub:`${taskSt.completionRate ?? 0}% rate`, icon:TrendingUp, color:'var(--green)', bg:'var(--green-pale)', link:'/tasks' },
    { label:'Open jobs', value: jobSt.open ?? 0, sub:'available to apply', icon:Briefcase, color:'var(--info)',   bg:'var(--info-pale)',   link:'/jobs' },
    { label:'XP earned', value: user?.totalXp ?? '—', sub:'keep going!', icon:Zap, color:'var(--accent)', bg:'var(--accent-pale)', link:'/workers/me' },
  ]

  const aiHintsFor = (label: string): string[] => {
    switch (label) {
      case 'Agents in field': return ['AI: forecast coverage by region', 'AI: suggest top agents for field work'];
      case 'Tasks today': return ['AI: identify blockers', 'AI: predict completion rate'];
      case 'Open jobs': return ['AI: highlight urgent postings', 'AI: suggest keyword tweaks for open jobs'];
      case 'Platform payouts': return ['AI: detect payout anomalies', 'AI: forecast payouts next 7 days'];
      case 'My tasks': return ['AI: prioritize by deadline', 'AI: flag overdue tasks'];
      case 'Completed': return ['AI: correlate with satisfaction', 'AI: identify repeat buy patterns'];
      default: return ['AI: quick insights available'];
    }
  }

  const statusBadge = (s: string) => {
    const m: Record<string, [string, string]> = {
      completed:   ['var(--green-pale)',  'var(--green)'],
      in_progress: ['var(--info-pale)',   'var(--info)'],
      pending:     ['var(--accent-pale)', 'var(--accent)'],
      failed:      ['var(--danger-pale)', 'var(--danger)'],
      cancelled:   ['var(--surface)',     'var(--text-3)'],
    }
    return m[s] || ['var(--surface)', 'var(--text-3)']
  }

  return (
    <div className="fade-in">

      {/* ── Header ─────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:700 }}>{GREET()}, {user?.name?.split(' ')[0] || 'there'} 👋</h1>
          <p style={{ color:'var(--text-3)', fontSize:13, marginTop:2 }}>
            {new Date().toLocaleDateString('en-KE',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
            {' · '}<span style={{ color:'var(--green)', fontWeight:600 }}>{roleLabel}</span>
          </p>
        </div>
        <button onClick={load} className="btn btn-ghost" style={{ gap:5 }}>
          <RefreshCw size={13} className={loading ? 'pulse' : ''} />
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* ── KPI cards ────────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:22 }}>
        {KPIS.map((k) => (
          <Card
            key={k.label}
            loading={loading}
            title={k.label}
            value={k.value}
            subtitle={k.sub}
            icon={k.icon as any}
            color={k.color}
            bg={k.bg}
            aiHint={aiHintsFor(k.label)}
            onClick={() => navigate(k.link)}
          />
        ))}
      </div>

      {/* ── Charts row ────────────────────────────── */}
      {isManager && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 300px', gap:16, marginBottom:20 }}>
          <div className="card" style={{ padding:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
              <div>
                <div style={{ fontWeight:700, fontSize:14 }}>This week's performance</div>
                <div style={{ fontSize:12, color:'var(--text-3)', marginTop:2 }}>Tasks assigned vs completed</div>
              </div>
              <button onClick={() => navigate('/reports')}
                style={{ display:'flex', alignItems:'center', gap:4, fontSize:12, color:'var(--green)',
                  fontWeight:600, background:'none', border:'none', cursor:'pointer' }}>
                Full report <ArrowRight size={12} />
              </button>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weekData} margin={{ left:-20, right:4, top:4, bottom:0 }} barGap={3}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize:11, fill:'var(--text-4)' }} />
                <YAxis tick={{ fontSize:11, fill:'var(--text-4)' }} />
                <Tooltip contentStyle={{ fontSize:12, borderRadius:8, border:'1px solid var(--border)' }} />
                <Bar dataKey="tasks" name="Assigned" fill="#E8F5EE" radius={[4,4,0,0]} />
                <Bar dataKey="done"  name="Completed" fill="#1B6B3A" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card" style={{ padding:20 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>Agent activity</div>
            <div style={{ fontSize:12, color:'var(--text-3)', marginBottom:14 }}>Active agents today</div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={activityData} margin={{ left:-30, right:4, top:4, bottom:0 }}>
                <defs>
                  <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1B6B3A" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#1B6B3A" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="t" tick={{ fontSize:9, fill:'var(--text-4)' }} />
                <YAxis tick={{ fontSize:10, fill:'var(--text-4)' }} />
                <Tooltip contentStyle={{ fontSize:12, borderRadius:8, border:'1px solid var(--border)' }} />
                <Area type="monotone" dataKey="v" name="Agents" stroke="#1B6B3A" strokeWidth={2}
                  fill="url(#ag)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── AI Insights strip ─────────────────────── */}
      {isManager && (aiInsights.length > 0 || insightsLoading) && (
        <div style={{ marginBottom:20, padding:'14px 18px',
          background:'linear-gradient(135deg, rgba(27,107,58,0.06), rgba(27,107,58,0.02))',
          border:'1px solid rgba(27,107,58,0.18)', borderRadius:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom: aiInsights.length ? 12 : 0 }}>
            <Sparkles size={14} color="var(--green)" />
            <span style={{ fontSize:12, fontWeight:700, color:'var(--green)', textTransform:'uppercase', letterSpacing:'0.4px' }}>
              AI Platform Insights
            </span>
            {insightsLoading && (
              <span style={{ fontSize:11, color:'var(--text-4)', fontWeight:400 }}>— analysing…</span>
            )}
          </div>
          {aiInsights.length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:8 }}>
              {aiInsights.map((insight, i) => (
                <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:8,
                  padding:'9px 11px', background:'var(--white)', borderRadius:8,
                  border:'1px solid rgba(27,107,58,0.12)', fontSize:12, color:'var(--text-2)', lineHeight:1.5 }}>
                  <span style={{ color:'var(--green)', fontWeight:700, flexShrink:0 }}>{i + 1}.</span>
                  {insight}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Bottom row ────────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns: isManager ? '1fr 1fr' : '1fr', gap:16 }}>

        {/* Recent tasks */}
        <div className="card" style={{ overflow:'hidden' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'16px 18px 12px', borderBottom:'1px solid var(--border)' }}>
            <span style={{ fontWeight:700, fontSize:14 }}>Recent tasks</span>
            <button onClick={() => navigate('/tasks')}
              style={{ display:'flex', alignItems:'center', gap:4, fontSize:12,
                color:'var(--green)', fontWeight:600, background:'none', border:'none', cursor:'pointer' }}>
              View all <ArrowRight size={12} />
            </button>
          </div>
          {loading ? (
            <div style={{ padding:32, textAlign:'center', color:'var(--text-4)', fontSize:13 }}>Loading...</div>
          ) : tasks.length === 0 ? (
            <div style={{ padding:'32px 18px', textAlign:'center', color:'var(--text-4)' }}>
              <CheckSquare size={32} style={{ opacity:0.2, marginBottom:8 }} />
              <div style={{ fontSize:13 }}>No tasks yet</div>
              <button onClick={() => navigate('/tasks')} className="btn btn-primary"
                style={{ marginTop:12, fontSize:12, padding:'7px 16px' }}>Create first task</button>
            </div>
          ) : tasks.map((t, i) => {
            const [bg, fg] = statusBadge(t.status)
            return (
              <div key={t.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 18px',
                borderBottom: i < tasks.length-1 ? '1px solid var(--border)' : 'none',
                cursor:'pointer', transition:'background 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.background='var(--surface)'}
                onMouseLeave={e => e.currentTarget.style.background=''}>
                <div style={{ width:8, height:8, borderRadius:'50%', flexShrink:0,
                  background: t.priority==='high'?'#EF4444':t.priority==='medium'?'#F59E0B':'#9CA3AF' }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {t.title}
                  </div>
                  {t.locationName && (
                    <div style={{ fontSize:11, color:'var(--text-4)', display:'flex', alignItems:'center', gap:3, marginTop:1 }}>
                      <MapPin size={9} />{t.locationName}
                    </div>
                  )}
                </div>
                <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:99, flexShrink:0,
                  background:bg, color:fg }}>
                  {t.status.replace('_',' ')}
                </span>
              </div>
            )
          })}
        </div>

        {/* Agents online / quick leaderboard */}
        {isManager && (
          <div className="card" style={{ overflow:'hidden', marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
              padding:'14px 18px', borderBottom:'1px solid var(--border)' }}>
              <span style={{ fontWeight:700, fontSize:14 }}>
                📍 Live field map — <span style={{ color:'var(--green)' }}>{checkedIn} agents</span>
              </span>
              <button onClick={() => navigate('/gps-map')}
                style={{ fontSize:11, color:'var(--green)', fontWeight:600, background:'none', border:'none', cursor:'pointer' }}>
                Full map →
              </button>
            </div>
            <LiveMap />
          </div>
        )}

        {isManager && (
          <div className="card" style={{ overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'16px 18px 12px', borderBottom:'1px solid var(--border)' }}>
              <span style={{ fontWeight:700, fontSize:14 }}>
                Agents — <span style={{ color:'var(--green)' }}>{checkedIn} in field</span>
              </span>
              <button onClick={() => navigate('/agents')}
                style={{ display:'flex', alignItems:'center', gap:4, fontSize:12,
                  color:'var(--green)', fontWeight:600, background:'none', border:'none', cursor:'pointer' }}>
                View all <ArrowRight size={12} />
              </button>
            </div>
            {agents.slice(0, 7).map((a, i) => (
              <div key={a.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 18px',
                borderBottom: i < Math.min(agents.length,7)-1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ width:30, height:30, borderRadius:'50%', background:'var(--green-pale)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:11, fontWeight:700, color:'var(--green)', flexShrink:0 }}>
                  {a.user?.name?.[0] || 'A'}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:500 }}>{a.user?.name}</div>
                  <div style={{ fontSize:11, color:'var(--text-4)' }}>Lv {a.level} · {a.totalXp} XP</div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  {a.currentStreak > 0 && (
                    <span style={{ fontSize:11, color:'#F59E0B' }}>🔥{a.currentStreak}</span>
                  )}
                  <div style={{ width:8, height:8, borderRadius:'50%',
                    background: a.status==='checked_in'?'#10B981':'#9CA3AF' }} />
                </div>
              </div>
            ))}
            {agents.length === 0 && (
              <div style={{ padding:32, textAlign:'center', color:'var(--text-4)', fontSize:13 }}>
                No agents yet
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  )
}
