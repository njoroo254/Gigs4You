import { useEffect, useState } from 'react'
import { Search, RefreshCw, MapPin, Users, X, MessageCircle, Building2, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getAgents, getWorkerProfile, getAgentNarrative, api } from '../../api/api'
import { useAuthStore, getIsManager, getIsSuperAdmin } from '../../store/store'
import LiveMap from '../../components/maps/LiveMap'

const STATUS_BADGE: Record<string,[string,string]> = {
  checked_in:  ['var(--green-pale)',  'var(--green)'],
  checked_out: ['var(--accent-pale)', 'var(--accent)'],
  offline:     ['var(--surface)',     'var(--text-3)'],
}
const STATUS_LABEL: Record<string,string> = {
  checked_in: 'In field', checked_out: 'Checked out', offline: 'Offline',
}

export default function AgentsPage() {
  const { user }                  = useAuthStore()
  const activeOrgId               = useAuthStore(s => s.activeOrgId)
  const activeOrgName             = useAuthStore(s => s.activeOrgName)
  const isManager                 = getIsManager(user)
  const isSuperAdmin              = getIsSuperAdmin(user)
  const navigate                  = useNavigate()
  const [agents, setAgents]       = useState<any[]>([])
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState<'all'|'active'|'offline'>('all')
  const [showMap, setShowMap]     = useState(false)
  const [selected, setSelected]   = useState<any>(null)
  const [profile, setProfile]     = useState<any>(null)
  const [loadingProfile, setLP]   = useState(false)
  const [narrative, setNarrative] = useState<string|null>(null)
  const [narrativeLoading, setNL] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const orgParam = isSuperAdmin && activeOrgId ? { organisationId: activeOrgId } : undefined
      const data = await getAgents(orgParam)
      setAgents(Array.isArray(data) ? data : [])
    } catch {
      setAgents([])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [activeOrgId])

  const selectAgent = async (agent: any) => {
    setSelected(agent)
    setProfile(null)
    setNarrative(null)
    setLP(true)
    setNL(true)
    try {
      const [wp, narr] = await Promise.allSettled([
        getWorkerProfile(agent.id),
        getAgentNarrative(agent.id),
      ])
      setProfile(wp.status === 'fulfilled' ? wp.value : null)
      setNarrative(narr.status === 'fulfilled' ? narr.value?.narrative ?? null : null)
    } catch {}
    setLP(false)
    setNL(false)
  }

  const filtered = agents.filter(a => {
    const q = search.toLowerCase()
    const matchQ = !q || a.user?.name?.toLowerCase().includes(q) || a.user?.phone?.includes(q)
    const matchF = filter === 'all' ? true :
                   filter === 'active' ? a.status === 'checked_in' :
                   a.status !== 'checked_in'
    return matchQ && matchF
  })

  const counts = {
    total:  agents.length,
    active: agents.filter(a => a.status === 'checked_in').length,
    offline:agents.filter(a => a.status === 'offline').length,
  }

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:700 }}>Agents & Supervisors</h1>
          <p style={{ color:'var(--text-3)', fontSize:13, marginTop:2 }}>
            <span style={{ color:'var(--green)', fontWeight:600 }}>{counts.active} in field</span>
            {' · '}{counts.offline} offline · {counts.total} total
          </p>
          {isSuperAdmin && activeOrgId && (
            <div style={{ marginTop:6, display:'inline-flex', alignItems:'center', gap:6,
              background:'var(--green-pale)', border:'1px solid var(--green)', borderRadius:6,
              padding:'3px 10px', fontSize:11, color:'var(--green)', fontWeight:600 }}>
              <Users size={11} />
              Scoped to: {activeOrgName || activeOrgId}
            </div>
          )}
          {isSuperAdmin && !activeOrgId && (
            <div style={{ marginTop:6, display:'inline-flex', alignItems:'center', gap:6,
              background:'var(--accent-pale)', border:'1px solid var(--accent)', borderRadius:6,
              padding:'3px 10px', fontSize:11, color:'var(--accent)', fontWeight:600 }}>
              Platform-wide view — select an org in Manage Orgs to scope
            </div>
          )}
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => setShowMap(s => !s)}
            className={`btn ${showMap ? 'btn-primary' : 'btn-ghost'}`} style={{ gap:5 }}>
            <MapPin size={13} /> {showMap ? 'Hide map' : 'Live map'}
          </button>
          <button onClick={load} className="btn btn-ghost" style={{ gap:5 }}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* Live map panel */}
      {showMap && (
        <div className="card" style={{ overflow:'hidden', marginBottom:16 }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)',
            display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontWeight:700, fontSize:13 }}>
              📍 Live agent positions — {agents.filter(a => a.status==='checked_in').length} in field
            </span>
            <span style={{ fontSize:11, color:'var(--text-4)' }}>
              Updates every 30 seconds via GPS ping
            </span>
          </div>
          <LiveMap />
        </div>
      )}

      {/* Stat strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'In field',  value:counts.active,        color:'var(--green)', bg:'var(--green-pale)' },
          { label:'Checked out',value:agents.filter(a=>a.status==='checked_out').length, color:'var(--accent)', bg:'var(--accent-pale)' },
          { label:'Total',     value:counts.total,         color:'var(--text-1)', bg:'var(--surface)' },
        ].map(s => (
          <div key={s.label} style={{ background:s.bg, borderRadius:12, padding:'14px 16px' }}>
            <div style={{ fontSize:22, fontWeight:800, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:11, color:'var(--text-4)', marginTop:2, fontWeight:500, textTransform:'uppercase', letterSpacing:'0.4px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:8, marginBottom:16, alignItems:'center' }}>
        <div style={{ position:'relative', flex:'0 0 240px' }}>
          <Search size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-4)', pointerEvents:'none' }} />
          <input className="inp" placeholder="Search by name or phone..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft:30 }} />
        </div>
        {(['all','active','offline'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`btn ${filter===f?'btn-primary':'btn-ghost'}`}
            style={{ padding:'6px 14px', fontSize:12 }}>
            {f === 'all' ? 'All' : f === 'active' ? 'In field' : 'Offline'}
          </button>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns: selected ? '1fr 380px' : '1fr', gap:16 }}>
        {/* Agents table */}
        <div className="card" style={{ overflow:'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Role</th>
                {isSuperAdmin && <th>Organisation</th>}
                <th>Status</th>
                <th>Level / XP</th>
                <th>Streak</th>
                <th>Location</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding:40, textAlign:'center', color:'var(--text-4)' }}>Loading agents...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ padding:40, textAlign:'center', color:'var(--text-4)' }}>No agents found</td></tr>
              ) : filtered.map(a => {
                const [bg,fg] = STATUS_BADGE[a.status] || STATUS_BADGE.offline
                const isSelected = selected?.id === a.id
                return (
                  <tr key={a.id} onClick={() => selectAgent(a)}
                    style={{ background: isSelected ? 'var(--green-pale)' : 'var(--white)' }}>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                        <div style={{
                          width:34, height:34, borderRadius:'50%', flexShrink:0,
                          background: a.status === 'checked_in' ? 'var(--green-pale)' : 'var(--surface)',
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:12, fontWeight:700,
                          color: a.status === 'checked_in' ? 'var(--green)' : 'var(--text-3)',
                          border: a.status === 'checked_in' ? '2px solid var(--green)' : '1px solid var(--border)',
                          position:'relative',
                        }}>
                          {a.user?.name?.[0]?.toUpperCase() || 'A'}
                          {a.status === 'checked_in' && (
                            <div className="pulse" style={{
                              position:'absolute', top:-1, right:-1, width:9, height:9,
                              borderRadius:'50%', background:'var(--green)', border:'2px solid #fff',
                            }} />
                          )}
                        </div>
                        <div>
                          <div style={{ fontWeight:600, fontSize:13 }}>{a.user?.name}</div>
                          <div style={{ fontSize:11, color:'var(--text-4)' }}>{a.user?.phone}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${a.user?.role === 'supervisor' ? 'badge-purple' : 'badge-green'}`}>
                        {a.user?.role === 'supervisor' ? 'Supervisor' : 'Agent'}
                      </span>
                    </td>
                    {isSuperAdmin && (
                      <td style={{ fontSize:11, color:'var(--text-3)' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                          <Building2 size={11} />
                          {a.organisationId ? a.organisationId.slice(0,8)+'…' : <span style={{ color:'var(--text-4)' }}>No org</span>}
                        </div>
                      </td>
                    )}
                    <td><span style={{ fontSize:11, fontWeight:600, padding:'2px 10px', borderRadius:99, background:bg, color:fg }}>{STATUS_LABEL[a.status] || a.status}</span></td>
                    <td>
                      <div style={{ fontSize:12 }}>
                        <span style={{ fontWeight:700, color:'var(--green)' }}>Lv {a.level}</span>
                        <span style={{ color:'var(--text-4)' }}> · {(a.totalXp||0).toLocaleString()} XP</span>
                      </div>
                    </td>
                    <td>
                      {a.currentStreak > 0
                        ? <span style={{ color:'#F59E0B', fontWeight:600 }}>🔥 {a.currentStreak}</span>
                        : <span style={{ color:'var(--text-4)' }}>—</span>}
                    </td>
                    <td style={{ fontSize:11, color:'var(--text-3)', maxWidth:120 }}>
                      {(a.lastLatitude && a.lastLongitude)
                        ? <span style={{ display:'flex', alignItems:'center', gap:3 }}><MapPin size={10} />{Number(a.lastLatitude).toFixed(3)}, {Number(a.lastLongitude).toFixed(3)}</span>
                        : '—'}
                    </td>
                    <td style={{ fontSize:11, color:'var(--text-4)' }}>
                      {a.lastSeenAt ? new Date(a.lastSeenAt).toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'}) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Detail panel */}
        {selected && (
          <AgentDetailPanel
            agent={selected}
            profile={profile}
            loading={loadingProfile}
            narrative={narrative}
            narrativeLoading={narrativeLoading}
            isManager={isManager}
            onClose={() => { setSelected(null); setProfile(null); setNarrative(null) }}
            onMessage={(agentUserId: string, agentName: string) =>
              navigate('/chat', { state: { startWith: agentUserId, name: agentName } })
            }
          />
        )}
      </div>
    </div>
  )
}

function AgentDetailPanel({ agent: a, profile, loading, narrative, narrativeLoading, isManager, onClose, onMessage }: any) {
  const skills = profile?.skills || []
  return (
    <div className="card" style={{ padding:20, position:'sticky', top:0, maxHeight:'calc(100vh - 120px)', overflowY:'auto' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
        <h3 style={{ fontSize:15, fontWeight:700 }}>Agent profile</h3>
        <button className="btn-icon" onClick={onClose} style={{ width:28, height:28 }}><X size={14} /></button>
      </div>

      {/* Avatar */}
      <div style={{ textAlign:'center', marginBottom:16 }}>
        <div style={{
          width:64, height:64, borderRadius:'50%', margin:'0 auto 10px',
          background: a.status==='checked_in' ? 'var(--green-pale)' : 'var(--surface)',
          border: `3px solid ${a.status==='checked_in' ? 'var(--green)' : 'var(--border)'}`,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:24, fontWeight:800, color:'var(--green)',
        }}>
          {a.user?.name?.[0] || 'A'}
        </div>
        <div style={{ fontWeight:700, fontSize:16 }}>{a.user?.name}</div>
        <div style={{ fontSize:12, color:'var(--text-4)', marginTop:2 }}>{a.user?.phone}</div>
        <div style={{ marginTop:6, display:'flex', justifyContent:'center', gap:6 }}>
          <span className={`badge ${a.status==='checked_in'?'badge-green':a.status==='checked_out'?'badge-amber':'badge-gray'}`}>
            {STATUS_LABEL[a.status] || a.status}
          </span>
          <span className={`badge ${a.user?.role==='supervisor'?'badge-purple':'badge-blue'}`}>
            {a.user?.role === 'supervisor' ? 'Supervisor' : 'Agent'}
          </span>
        </div>
        {isManager && a.user?.id && (
          <button
            onClick={() => onMessage(a.user.id, a.user.name)}
            className="btn btn-ghost"
            style={{ marginTop:10, width:'100%', justifyContent:'center', gap:6, fontSize:12 }}>
            <MessageCircle size={13} /> Message agent
          </button>
        )}
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:14 }}>
        {[
          { l:'Level',   v:`Lv ${a.level}` },
          { l:'XP',      v:(a.totalXp||0).toLocaleString() },
          { l:'Streak',  v:`🔥 ${a.currentStreak||0}` },
          { l:'Jobs',    v:a.completedJobs||0 },
          { l:'Rating',  v:a.averageRating ? (a.averageRating*1).toFixed(1)+'⭐' : '—' },
          { l:'Tasks',   v:'View →' },
        ].map(s => (
          <div key={s.l} style={{ background:'var(--surface)', borderRadius:8, padding:'10px 8px', textAlign:'center' }}>
            <div style={{ fontWeight:700, fontSize:14 }}>{s.v}</div>
            <div style={{ fontSize:10, color:'var(--text-4)', marginTop:2, fontWeight:500 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* ── AI Performance Narrative ── */}
      {narrativeLoading && (
        <div style={{ display:'flex', alignItems:'center', gap:7, padding:'10px 12px', marginBottom:12,
          background:'var(--green-pale)', borderRadius:8, fontSize:12, color:'var(--green)' }}>
          <Sparkles size={13} />
          <span>Generating AI performance summary…</span>
        </div>
      )}
      {narrative && !narrativeLoading && (
        <div style={{ marginBottom:14, padding:'12px 14px', background:'linear-gradient(135deg, rgba(27,107,58,0.06), rgba(27,107,58,0.02))',
          border:'1px solid rgba(27,107,58,0.2)', borderRadius:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:6 }}>
            <Sparkles size={12} color="var(--green)" />
            <span style={{ fontSize:10, fontWeight:700, color:'var(--green)', textTransform:'uppercase', letterSpacing:'0.4px' }}>
              AI Performance Summary
            </span>
          </div>
          <p style={{ fontSize:12, color:'var(--text-2)', lineHeight:1.65, margin:0 }}>{narrative}</p>
        </div>
      )}

      {loading && <div style={{ fontSize:12, color:'var(--text-4)', textAlign:'center', padding:'8px 0' }}>Loading profile...</div>}

      {/* Worker profile data */}
      {profile && (
        <>
          {profile.bio && (
            <div style={{ marginBottom:12 }}>
              <div className="section-title">About</div>
              <p style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.6 }}>{profile.bio}</p>
            </div>
          )}

          {(profile.location || profile.county) && (
            <div style={{ marginBottom:12 }}>
              <div className="section-title">Location</div>
              <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:13 }}>
                <MapPin size={13} color="var(--text-4)" />
                {profile.location || profile.county}
              </div>
            </div>
          )}

          {(profile.dailyRate || profile.hourlyRate) && (
            <div style={{ marginBottom:12 }}>
              <div className="section-title">Rates</div>
              <div style={{ display:'flex', gap:8 }}>
                {profile.dailyRate && (
                  <div style={{ background:'var(--green-pale)', borderRadius:8, padding:'8px 12px' }}>
                    <div style={{ fontWeight:700, color:'var(--green)', fontSize:14 }}>KES {Number(profile.dailyRate).toLocaleString()}</div>
                    <div style={{ fontSize:10, color:'var(--text-4)' }}>per day</div>
                  </div>
                )}
                {profile.hourlyRate && (
                  <div style={{ background:'var(--surface)', borderRadius:8, padding:'8px 12px', border:'1px solid var(--border)' }}>
                    <div style={{ fontWeight:700, fontSize:14 }}>KES {Number(profile.hourlyRate).toLocaleString()}</div>
                    <div style={{ fontSize:10, color:'var(--text-4)' }}>per hour</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {skills.length > 0 && (
            <div style={{ marginBottom:12 }}>
              <div className="section-title">Skills ({skills.length})</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                {skills.map((s: any) => (
                  <span key={s.id||s.name} className="badge badge-blue" style={{ fontSize:10 }}>{s.name}</span>
                ))}
              </div>
            </div>
          )}

          {profile.isAvailable !== undefined && (
            <div style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 12px', borderRadius:8,
              background: profile.isAvailable ? 'var(--green-pale)' : 'var(--surface)',
              fontSize:12, color: profile.isAvailable ? 'var(--green)' : 'var(--text-4)', fontWeight:500 }}>
              <div style={{ width:7, height:7, borderRadius:'50%', background: profile.isAvailable ? 'var(--green)' : 'var(--text-4)' }} />
              {profile.isAvailable ? 'Available for work' : 'Not available'}
            </div>
          )}
        </>
      )}

      {!profile && !loading && (
        <div style={{ padding:'16px 0', textAlign:'center', color:'var(--text-4)', fontSize:13 }}>
          No worker profile set up yet
        </div>
      )}

      {/* GPS location */}
      {a.lastLatitude && (
        <div style={{ marginTop:12, padding:'10px 12px', background:'var(--surface)', borderRadius:8 }}>
          <div className="section-title" style={{ marginBottom:4 }}>Last GPS position</div>
          <div style={{ fontSize:12, fontFamily:'monospace', color:'var(--text-3)' }}>
            {Number(a.lastLatitude).toFixed(6)}, {Number(a.lastLongitude).toFixed(6)}
          </div>
          <div style={{ fontSize:11, color:'var(--text-4)', marginTop:2 }}>
            {a.lastSeenAt ? new Date(a.lastSeenAt).toLocaleString('en-KE') : ''}
          </div>
        </div>
      )}
    </div>
  )
}

