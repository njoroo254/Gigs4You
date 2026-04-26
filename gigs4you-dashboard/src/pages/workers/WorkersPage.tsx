import { useEffect, useState } from 'react'
import { Search, Star, MapPin, Heart, X, Check, ExternalLink } from 'lucide-react'
import { getWorkers, getWorkerProfile, getMyWorkerProfile, favouriteWorker, getFavourites } from '../../api/api'

const CATEGORIES = [
  { id:'all',           label:'All skills'    },
  { id:'sales',         label:'Sales'         },
  { id:'technician',    label:'Technician'    },
  { id:'logistics',     label:'Delivery'      },
  { id:'finance',       label:'Finance'       },
  { id:'research',      label:'Research'      },
  { id:'merchandising', label:'Merchandising' },
]


export default function WorkersPage() {
  const [workers, setWorkers]     = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [category, setCategory]   = useState('all')
  const [onlyAvail, setOnlyAvail] = useState(false)
  const [favOnly, setFavOnly]     = useState(false)
  const [selected, setSelected]   = useState<any>(null)
  const [profile, setProfile]     = useState<any>(null)
  const [loadingP, setLoadingP]   = useState(false)
  const [favs, setFavs]           = useState<string[]>(getFavourites())

  const [mySkillIds, setMySkillIds] = useState<string[]>([])
  const [matchOnly, setMatchOnly]   = useState(false)

  useEffect(() => {
    // Load logged-in user's skill IDs for job/worker matching
    getMyWorkerProfile().then((p: any) => {
      if (p?.skills) setMySkillIds(p.skills.map((s: any) => s.id))
    }).catch(() => {})
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const res = await getWorkers({
        category: category !== 'all' ? category : undefined,
        search:   search || undefined,
        available: onlyAvail ? 'true' : undefined,
      })
      const list = res?.workers || (Array.isArray(res) ? res : [])
      setWorkers(list.length ? list : [])
    } catch { setWorkers([]) }
    setLoading(false)
  }

  useEffect(() => { load() }, [category, onlyAvail])

  const toggleFav = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setFavs([...favouriteWorker(id)])
  }

  const openWorker = async (w: any) => {
    setSelected(w); setProfile(null); setLoadingP(true)
    try { setProfile(await getWorkerProfile(w.agentId || w.id)) } catch {}
    setLoadingP(false)
  }

  const filtered = workers.filter(w => {
    if (favOnly && !favs.includes(w.agentId || w.id)) return false
    if (matchOnly && mySkillIds.length > 0) {
      const workerSkillIds = (w.skills || []).map((s: any) => s.id)
      const hasMatch = mySkillIds.some(id => workerSkillIds.includes(id))
      if (!hasMatch) return false
    }
    if (!search) return true
    const name   = w.agent?.user?.name?.toLowerCase() || ''
    const skills = (w.skills || []).map((s: any) => s.name.toLowerCase()).join(' ')
    const q = search.toLowerCase()
    return name.includes(q) || skills.includes(q) || (w.location||'').toLowerCase().includes(q)
  })

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:700 }}>Worker Directory</h1>
          <p style={{ color:'var(--text-3)', fontSize:13, marginTop:2 }}>
            <span style={{ color:'var(--green)', fontWeight:600 }}>{workers.filter(w => w.isAvailable).length} available</span>
            {' · '}{workers.length} total workers
          </p>
        </div>
      </div>

      {/* Filters row */}
      <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ position:'relative', width:240 }}>
          <Search size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-4)', pointerEvents:'none' }} />
          <input className="inp" placeholder="Search name, skill, location..."
            value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key==='Enter' && load()}
            style={{ paddingLeft:30 }} />
        </div>
        <button onClick={() => setOnlyAvail(v => !v)}
          className={`btn ${onlyAvail ? 'btn-primary' : 'btn-ghost'}`}
          style={{ gap:5, fontSize:12 }}>
          <Check size={12} /> Available only
        </button>
        {mySkillIds.length > 0 && (
          <button onClick={() => setMatchOnly(v => !v)}
            className={`btn ${matchOnly ? 'btn-primary' : 'btn-ghost'}`}
            style={{ gap:5, fontSize:12 }}>
            ✨ Skill match ({mySkillIds.length} skills)
          </button>
        )}
        <button onClick={() => setFavOnly(v => !v)}
          className={`btn ${favOnly ? 'btn-primary' : 'btn-ghost'}`}
          style={{ gap:5, fontSize:12 }}>
          <Heart size={12} /> Favourites {favs.length > 0 && `(${favs.length})`}
        </button>
      </div>

      {/* Category chips */}
      <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
        {CATEGORIES.map(c => (
          <button key={c.id} onClick={() => setCategory(c.id)}
            className={`btn ${category===c.id ? 'btn-primary' : 'btn-ghost'}`}
            style={{ padding:'5px 12px', fontSize:12 }}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Grid + panel */}
      <div style={{ display:'grid', gridTemplateColumns: selected ? '1fr 360px' : '1fr', gap:16, alignItems:'start' }}>

        {/* Cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px,1fr))', gap:12 }}>
          {loading ? (
            <div style={{ gridColumn:'1/-1', padding:40, textAlign:'center', color:'var(--text-4)' }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div style={{ gridColumn:'1/-1', padding:40, textAlign:'center', color:'var(--text-4)' }}>
              No workers match your filters
            </div>
          ) : filtered.map(w => (
            <WorkerCard key={w.id} w={w}
              isSelected={selected?.id === w.id}
              isFav={favs.includes(w.agentId || w.id)}
              onFav={(e: React.MouseEvent) => toggleFav(w.agentId || w.id, e)}
              onClick={() => selected?.id===w.id ? setSelected(null) : openWorker(w)} />
          ))}
        </div>

        {/* Detail panel */}
        {selected && (
          <WorkerPanel
            w={selected}
            profile={profile}
            loading={loadingP}
            isFav={favs.includes(selected.agentId || selected.id)}
            onFav={(e: React.MouseEvent) => toggleFav(selected.agentId || selected.id, e)}
            onClose={() => { setSelected(null); setProfile(null) }}
          />
        )}
      </div>
    </div>
  )
}

function WorkerCard({ w, isSelected, isFav, onFav, onClick }: any) {
  const stars = Math.round(w.averageRating || 0)
  return (
    <div onClick={onClick}
      style={{ background:'var(--white)', borderRadius:14, padding:16, cursor:'pointer',
        border: isSelected ? '2px solid var(--green)' : '1px solid var(--border)',
        transition:'all 0.12s', boxShadow:'0 2px 8px rgba(0,0,0,0.04)' }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.08)' }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.04)' }}>

      {/* Top row */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
        <div style={{ width:42, height:42, borderRadius:'50%', flexShrink:0,
          background: w.isAvailable ? 'var(--green-pale)' : 'var(--surface)',
          border: `2px solid ${w.isAvailable ? 'var(--green)' : 'var(--border)'}`,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:16, fontWeight:800, color: w.isAvailable ? 'var(--green)' : 'var(--text-3)' }}>
          {w.agent?.user?.name?.[0] || '?'}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {w.agent?.user?.name || 'Unknown'}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            {'★'.repeat(stars)}{'☆'.repeat(5-stars)}
            <span style={{ fontSize:11, color:'var(--text-4)', marginLeft:3 }}>
              ({(w.averageRating||0).toFixed(1)})
            </span>
          </div>
        </div>
        <button onClick={onFav}
          style={{ background:'none', border:'none', cursor:'pointer', padding:4,
            color: isFav ? '#EF4444' : 'var(--text-4)', flexShrink:0 }}>
          <Heart size={15} fill={isFav ? '#EF4444' : 'none'} />
        </button>
      </div>

      {/* Bio */}
      {w.bio && <p style={{ fontSize:12, color:'var(--text-3)', lineHeight:1.5, marginBottom:10,
        display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
        {w.bio}
      </p>}

      {/* Skills */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:10 }}>
        {(w.skills||[]).slice(0,3).map((s: any) => (
          <span key={s.id||s.name} className="badge badge-blue" style={{ fontSize:10 }}>{s.name}</span>
        ))}
        {(w.skills||[]).length > 3 && (
          <span className="badge badge-gray" style={{ fontSize:10 }}>+{w.skills.length-3}</span>
        )}
      </div>

      {/* Footer */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:11 }}>
        <div style={{ display:'flex', alignItems:'center', gap:3, color:'var(--text-4)' }}>
          <MapPin size={10} />{w.location || '—'}
        </div>
        <div style={{ fontWeight:700, color:'var(--green)', fontSize:12 }}>
          {w.dailyRate ? `KES ${Number(w.dailyRate).toLocaleString()}/day` : '—'}
        </div>
      </div>
      <div style={{ marginTop:8, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span className={`badge ${w.isAvailable ? 'badge-green' : 'badge-gray'}`}>
          {w.isAvailable ? 'Available' : 'Unavailable'}
        </span>
        <span style={{ fontSize:11, color:'var(--text-4)' }}>Lv {w.agent?.level||1} · {w.completedJobs||0} jobs</span>
      </div>
    </div>
  )
}

function WorkerPanel({ w, profile, loading, isFav, onFav, onClose }: any) {
  const skills = profile?.skills || w.skills || []
  const data   = profile || w

  return (
    <div className="card" style={{ padding:20, position:'sticky', top:0,
      maxHeight:'calc(100vh - 120px)', overflowY:'auto' }}>

      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
        <h3 style={{ fontSize:15, fontWeight:700 }}>Worker profile</h3>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={onFav}
            style={{ background:'none', border:'none', cursor:'pointer',
              color: isFav ? '#EF4444' : 'var(--text-4)' }}>
            <Heart size={16} fill={isFav ? '#EF4444' : 'none'} />
          </button>
          <button className="btn-icon" onClick={onClose}><X size={14} /></button>
        </div>
      </div>

      {/* Identity */}
      <div style={{ textAlign:'center', marginBottom:16 }}>
        <div style={{ width:60, height:60, borderRadius:'50%', margin:'0 auto 10px',
          background: w.isAvailable ? 'var(--green-pale)' : 'var(--surface)',
          border:`3px solid ${w.isAvailable?'var(--green)':'var(--border)'}`,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:22, fontWeight:800, color:'var(--green)' }}>
          {w.agent?.user?.name?.[0] || '?'}
        </div>
        <div style={{ fontWeight:700, fontSize:16 }}>{w.agent?.user?.name}</div>
        <div style={{ fontSize:12, color:'var(--text-4)' }}>{w.agent?.user?.phone}</div>
        <div style={{ marginTop:6, display:'flex', justifyContent:'center', gap:6, flexWrap:'wrap' }}>
          <span className={`badge ${w.isAvailable?'badge-green':'badge-gray'}`}>
            {w.isAvailable ? 'Available' : 'Unavailable'}
          </span>
          <span className={`badge ${w.agent?.user?.role==='supervisor'?'badge-purple':'badge-blue'}`}>
            {w.agent?.user?.role || 'agent'}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:16 }}>
        {[
          { l:'Level',    v:`Lv ${w.agent?.level||1}` },
          { l:'XP',       v:(w.agent?.totalXp||0).toLocaleString() },
          { l:'Streak',   v:`🔥 ${w.agent?.currentStreak||0}` },
          { l:'Jobs done',v:w.completedJobs||0 },
          { l:'Rating',   v:`${(w.averageRating||0).toFixed(1)} ⭐` },
          { l:'Status',   v: w.isAvailable ? '✅ Open' : '⛔ Busy' },
        ].map(s => (
          <div key={s.l} style={{ background:'var(--surface)', borderRadius:8, padding:'10px 8px', textAlign:'center' }}>
            <div style={{ fontWeight:700, fontSize:13 }}>{s.v}</div>
            <div style={{ fontSize:10, color:'var(--text-4)', marginTop:2 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {loading && <div style={{ textAlign:'center', color:'var(--text-4)', fontSize:12, padding:8 }}>Loading profile...</div>}

      {/* Bio */}
      {data.bio && (
        <div style={{ marginBottom:14 }}>
          <div className="section-title">About</div>
          <p style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.6 }}>{data.bio}</p>
        </div>
      )}

      {/* Location */}
      {(data.location || w.location) && (
        <div style={{ marginBottom:14 }}>
          <div className="section-title">Location</div>
          <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:13, color:'var(--text-2)' }}>
            <MapPin size={13} color="var(--text-4)" />{data.location || w.location}
          </div>
        </div>
      )}

      {/* Rates */}
      {(data.dailyRate || data.hourlyRate || w.dailyRate || w.hourlyRate) && (
        <div style={{ marginBottom:14 }}>
          <div className="section-title">Rates</div>
          <div style={{ display:'flex', gap:8 }}>
            {(data.dailyRate || w.dailyRate) && (
              <div style={{ background:'var(--green-pale)', borderRadius:8, padding:'8px 12px' }}>
                <div style={{ fontWeight:700, color:'var(--green)' }}>KES {Number(data.dailyRate||w.dailyRate).toLocaleString()}</div>
                <div style={{ fontSize:10, color:'var(--text-4)' }}>per day</div>
              </div>
            )}
            {(data.hourlyRate || w.hourlyRate) && (
              <div style={{ background:'var(--surface)', borderRadius:8, padding:'8px 12px', border:'1px solid var(--border)' }}>
                <div style={{ fontWeight:700 }}>KES {Number(data.hourlyRate||w.hourlyRate).toLocaleString()}</div>
                <div style={{ fontSize:10, color:'var(--text-4)' }}>per hour</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Skills */}
      {skills.length > 0 && (
        <div style={{ marginBottom:14 }}>
          <div className="section-title">Skills ({skills.length})</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
            {skills.map((s: any) => (
              <span key={s.id||s.name} className="badge badge-blue" style={{ fontSize:10 }}>{s.name}</span>
            ))}
          </div>
        </div>
      )}

      {/* Availability note */}
      {data.availabilityNote && (
        <div style={{ marginBottom:14 }}>
          <div className="section-title">Availability note</div>
          <div style={{ fontSize:12, color:'var(--text-2)' }}>{data.availabilityNote}</div>
        </div>
      )}

      {/* M-Pesa */}
      {data.mpesaPhone && (
        <div style={{ padding:'10px 12px', background:'var(--surface)', borderRadius:8, fontSize:12 }}>
          <span style={{ color:'var(--text-4)' }}>M-Pesa: </span>
          <span style={{ fontWeight:600, fontFamily:'monospace' }}>{data.mpesaPhone}</span>
        </div>
      )}
    </div>
  )
}
