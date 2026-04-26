import { useEffect, useState, useRef } from 'react'
import { Plus, X, Search, MapPin, Clock, Users, Star, Briefcase,
         Zap, RefreshCw, ChevronRight, Building2, Sparkles, CheckCircle2, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { getJobs, createJob, getJobApplications, assignJob, getSkills, getAgents,
         suggestJobPricing, parseJobDescription } from '../../api/api'

const CATEGORIES  = ['all','sales','technician','logistics','finance','research','merchandising','general']
const STATUSES    = ['all','open','in_progress','completed']
const BUDGET_TYPES = ['fixed','daily','hourly','monthly']

const CAT_COLOR: Record<string,string> = {
  sales:'#3B82F6', technician:'#F97316', logistics:'#0D9488',
  finance:'#8B5CF6', research:'#EC4899', merchandising:'#1B6B3A', general:'#6B7280',
}


export default function JobsPage() {
  const [jobs, setJobs]           = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [showPost, setShowPost]   = useState(false)
  const [selected, setSelected]   = useState<any>(null)
  const [applications, setApps]   = useState<any[]>([])
  const [appsLoading, setAppsL]   = useState(false)
  const [catFilter, setCat]       = useState('all')
  const [statusFilter, setStatus] = useState('all')
  const [search, setSearch]       = useState('')
  const [skills, setSkills]       = useState<any[]>([])
  const [agents, setAgents]       = useState<any[]>([])

  const [form, setForm] = useState({
    title:'', description:'', category:'sales',
    budgetMin:'', budgetMax:'', budgetType:'fixed',
    location:'', county:'', isUrgent:false,
    deadline:'', companyName:'', positionsAvailable:'1',
    requiredSkillIds:[] as string[],
  })
  const [priceSuggestion, setPriceSuggestion] = useState<any>(null)
  const [pricingLoading, setPricingLoading]   = useState(false)
  const [parseLoading, setParseLoading]       = useState(false)
  const descDebounce = useRef<ReturnType<typeof setTimeout>|null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await getJobs({
        status:   statusFilter !== 'all' ? statusFilter : undefined,
        category: catFilter    !== 'all' ? catFilter    : undefined,
        search:   search || undefined,
      })
      const list = res?.jobs || (Array.isArray(res) ? res : [])
      setJobs(list.length ? list : [])
    } catch { setJobs([]) }
    setLoading(false)
  }

  useEffect(() => { load() }, [statusFilter, catFilter])
  useEffect(() => {
    getSkills().then(s => setSkills(Array.isArray(s) ? s : [])).catch(()=>{})
    getAgents().then(a => setAgents(Array.isArray(a) ? a : [])).catch(()=>{})
  }, [])

  const openJob = async (job: any) => {
    setSelected(job); setApps([]); setAppsL(true)
    try { setApps(await getJobApplications(job.id)) } catch {}
    setAppsL(false)
  }

  const handleParseDescription = async (description: string) => {
    if (description.length < 30) return
    setParseLoading(true)
    try {
      const result = await parseJobDescription(description, { county: form.county || 'Kenya' })
      if (result.confidence > 0.4) {
        setForm(f => ({
          ...f,
          title:    result.suggestedTitle && !f.title ? result.suggestedTitle : f.title,
          county:   result.county && !f.county ? result.county : f.county,
          isUrgent: result.isUrgent ?? f.isUrgent,
        }))
        if (result.suggestedTitle && !form.title) {
          toast.success('AI filled in suggested title', { duration: 2500 })
        }
      }
    } catch {}
    setParseLoading(false)
  }

  const handleGetPricingSuggestion = async () => {
    if (!form.description || form.description.length < 20) {
      return toast.error('Add a description first so AI can suggest a fair price')
    }
    setPricingLoading(true)
    setPriceSuggestion(null)
    try {
      const result = await suggestJobPricing({
        description: form.description,
        category:    form.category,
        county:      form.county || 'Nairobi',
        is_urgent:   form.isUrgent,
        similar_jobs: [],
      })
      if (result.budgetMin || result.budgetMax) {
        setPriceSuggestion(result)
      } else {
        toast.error('AI could not suggest a price for this description')
      }
    } catch {
      toast.error('Pricing suggestion unavailable')
    }
    setPricingLoading(false)
  }

  const applyPriceSuggestion = () => {
    if (!priceSuggestion) return
    setForm(f => ({
      ...f,
      budgetMin: String(priceSuggestion.budgetMin ?? f.budgetMin),
      budgetMax: String(priceSuggestion.budgetMax ?? f.budgetMax),
    }))
    setPriceSuggestion(null)
    toast.success('Budget range applied')
  }

  const handlePost = async () => {
    if (!form.title || !form.location) return toast.error('Title and location required')
    try {
      await createJob({
        ...form,
        budgetMin: Number(form.budgetMin)||0,
        budgetMax: Number(form.budgetMax)||0,
        positionsAvailable: Number(form.positionsAvailable)||1,
      })
      toast.success('Job posted!')
      setShowPost(false)
      load()
    } catch (e:any) { toast.error(e?.response?.data?.message || 'Failed to post job') }
  }

  const handleAssign = async (jobId: string, workerId: string, workerName: string) => {
    try {
      await assignJob(jobId, workerId)
      toast.success(`Hired ${workerName}`)
      load(); setSelected(null)
    } catch (e:any) { toast.error(e?.response?.data?.message || 'Failed to hire') }
  }

  const filtered = jobs.filter(j => {
    if (statusFilter !== 'all' && j.status !== statusFilter) return false
    if (catFilter    !== 'all' && j.category !== catFilter)  return false
    if (search && !j.title?.toLowerCase().includes(search.toLowerCase()) &&
        !j.companyName?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const counts = {
    open:  jobs.filter(j => j.status==='open').length,
    total: jobs.length,
  }

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:700 }}>Jobs Marketplace</h1>
          <p style={{ color:'var(--text-3)', fontSize:13, marginTop:2 }}>
            <span style={{ color:'var(--green)', fontWeight:600 }}>{counts.open} open</span>
            {' · '}{counts.total} total listings
          </p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={load} className="btn btn-ghost" style={{ gap:5 }}><RefreshCw size={13} /> Refresh</button>
          <button onClick={() => setShowPost(true)} className="btn btn-primary"><Plus size={14} /> Post job</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ position:'relative', width:220 }}>
          <Search size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-4)', pointerEvents:'none' }} />
          <input className="inp" placeholder="Search jobs..." value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key==='Enter' && load()}
            style={{ paddingLeft:30 }} />
        </div>
        <select className="inp" style={{ width:130 }} value={statusFilter} onChange={e => setStatus(e.target.value)}>
          {STATUSES.map(s => <option key={s} value={s}>{s==='all'?'All statuses':s.replace('_',' ')}</option>)}
        </select>
      </div>

      {/* Category chips */}
      <div style={{ display:'flex', gap:6, marginBottom:18, flexWrap:'wrap' }}>
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => setCat(c)}
            className={`btn ${catFilter===c ? 'btn-primary' : 'btn-ghost'}`}
            style={{ padding:'5px 12px', fontSize:12 }}>
            {c === 'all' ? 'All categories' : c}
          </button>
        ))}
      </div>

      {/* Card grid + detail panel */}
      <div style={{ display:'grid', gridTemplateColumns: selected ? '1fr 380px' : '1fr', gap:16, alignItems:'start' }}>

        {/* Job cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px,1fr))', gap:14 }}>
          {loading ? (
            <div style={{ gridColumn:'1/-1', padding:40, textAlign:'center', color:'var(--text-4)' }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div style={{ gridColumn:'1/-1', padding:40, textAlign:'center', color:'var(--text-4)' }}>
              No jobs match your filters
            </div>
          ) : filtered.map(job => (
            <JobCard key={job.id} job={job}
              isSelected={selected?.id===job.id}
              onClick={() => selected?.id===job.id ? setSelected(null) : openJob(job)} />
          ))}
        </div>

        {/* Job detail panel */}
        {selected && (
          <div className="card" style={{ padding:0, overflow:'hidden', position:'sticky', top:0 }}>
            {/* Header */}
            <div style={{ padding:'16px 18px', borderBottom:'1px solid var(--border)',
              background: selected.isUrgent ? 'var(--accent-pale)' : 'var(--white)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  {selected.isUrgent && (
                    <span style={{ fontSize:10, fontWeight:800, color:'var(--accent)', background:'var(--accent-pale)',
                      padding:'2px 8px', borderRadius:99, marginBottom:8, display:'inline-block' }}>
                      ⚡ URGENT
                    </span>
                  )}
                  <h2 style={{ fontSize:16, fontWeight:700, lineHeight:1.3 }}>{selected.title}</h2>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4 }}>
                    <Building2 size={12} color="var(--text-4)" />
                    <span style={{ fontSize:12, color:'var(--text-3)' }}>{selected.companyName || 'Unknown company'}</span>
                  </div>
                </div>
                <button className="btn-icon" onClick={() => { setSelected(null); setApps([]) }}><X size={14} /></button>
              </div>
            </div>

            <div style={{ padding:'16px 18px', maxHeight:'calc(100vh - 200px)', overflowY:'auto' }}>
              {/* Budget + location */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
                <div style={{ background:'var(--green-pale)', borderRadius:8, padding:'10px 12px' }}>
                  <div style={{ fontSize:10, color:'var(--text-4)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.3px', marginBottom:3 }}>Budget</div>
                  <div style={{ fontWeight:700, color:'var(--green)' }}>
                    KES {Number(selected.budgetMin).toLocaleString()}
                    {selected.budgetMax > selected.budgetMin ? `–${Number(selected.budgetMax).toLocaleString()}` : ''}
                  </div>
                  <div style={{ fontSize:11, color:'var(--text-4)' }}>per {selected.budgetType}</div>
                </div>
                <div style={{ background:'var(--surface)', borderRadius:8, padding:'10px 12px', border:'1px solid var(--border)' }}>
                  <div style={{ fontSize:10, color:'var(--text-4)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.3px', marginBottom:3 }}>Location</div>
                  <div style={{ fontWeight:600, fontSize:13 }}>{selected.location}</div>
                  {selected.county && <div style={{ fontSize:11, color:'var(--text-4)' }}>{selected.county} County</div>}
                </div>
              </div>

              {/* Status + applicants */}
              <div style={{ display:'flex', gap:8, marginBottom:14 }}>
                <span className={`badge ${selected.status==='open'?'badge-green':selected.status==='in_progress'?'badge-blue':'badge-gray'}`} style={{ fontSize:11 }}>
                  {selected.status}
                </span>
                <span style={{ fontSize:12, color:'var(--text-3)', display:'flex', alignItems:'center', gap:4 }}>
                  <Users size={12} /> {selected.applicantCount||0} applicants
                </span>
              </div>

              {/* Description */}
              <div style={{ marginBottom:14 }}>
                <div className="section-title">Description</div>
                <p style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.7 }}>{selected.description}</p>
              </div>

              {/* Skills */}
              {selected.requiredSkills?.length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <div className="section-title">Required skills</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                    {selected.requiredSkills.map((s:any) => (
                      <span key={s.name||s.id} className="badge badge-blue" style={{ fontSize:11 }}>{s.name}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Hire external worker */}
              {selected.status === 'open' && (
                <div style={{ marginBottom:14 }}>
                  <div className="section-title">Hire a worker</div>
                  <p style={{ fontSize:12, color:'var(--text-4)', marginBottom:8 }}>
                    Select an applicant to hire for this job (B2C marketplace)
                  </p>
                  <select className="inp" style={{ marginBottom:8 }}
                    onChange={e => {
                      const [workerId, name] = e.target.value.split('|')
                      if (workerId) handleAssign(selected.id, workerId, name)
                    }}>
                    <option value="">Select applicant to hire...</option>
                    {applications.filter((a: any) => a.status === 'accepted').map((app: any) => (
                      <option key={app.workerId || app.id} value={`${app.workerId || app.applicantId}|${app.worker?.name || app.applicantName || 'Worker'}`}>
                        {app.worker?.name || app.applicantName || 'Worker'} - {app.proposedRate ? `KES ${app.proposedRate}` : 'Default rate'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Applications */}
              <div>
                <div className="section-title">Applications ({applications.length})</div>
                {appsLoading ? <div style={{ fontSize:12, color:'var(--text-4)' }}>Loading...</div>
                : applications.length === 0 ? <div style={{ fontSize:12, color:'var(--text-4)' }}>No applications yet. Workers will apply through the marketplace.</div>
                : applications.slice(0,8).map((app:any) => (
                  <div key={app.id} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 0',
                    borderBottom:'1px solid var(--border)' }}>
                    <div className="avatar avatar-sm avatar-green">{(app.worker?.name || app.applicantName || 'W')[0]?.toUpperCase()}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:600, fontSize:13 }}>{app.worker?.name || app.applicantName || 'External Worker'}</div>
                      <div style={{ fontSize:11, color:'var(--text-4)', marginTop:1 }}>
                        {app.proposedRate ? `Proposing KES ${app.proposedRate}` : 'Using job budget'}
                      </div>
                      {app.coverNote && (
                        <p style={{ fontSize:12, color:'var(--text-3)', marginTop:4, lineHeight:1.5 }}>
                          {app.coverNote}
                        </p>
                      )}
                    </div>
                    <span className={`badge ${app.status==='accepted'?'badge-green':app.status==='rejected'?'badge-red':'badge-amber'}`} style={{ fontSize:10 }}>
                      {app.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Post job modal */}
      {showPost && (
        <div className="modal-backdrop" onClick={e => e.target===e.currentTarget && setShowPost(false)}>
          <div className="modal">
            <div className="modal-header">
              <div>
                <h2 style={{ fontSize:17, fontWeight:700 }}>Post a new job</h2>
                <p style={{ fontSize:12, color:'var(--text-4)', marginTop:3 }}>Workers and agents will see this in their Jobs marketplace</p>
              </div>
              <button className="btn-icon" onClick={() => { setShowPost(false); setPriceSuggestion(null) }}><X size={15} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div style={{ gridColumn:'1/-1' }}>
                  <label className="lbl">Job title *</label>
                  <input className="inp" placeholder="e.g. Route Sales Rep — Westlands"
                    value={form.title} onChange={e => setForm(f=>({...f,title:e.target.value}))} />
                </div>
                <div style={{ gridColumn:'1/-1' }}>
                  <label className="lbl" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span>Description *</span>
                    {parseLoading && <span style={{ fontSize:10, color:'var(--green)', fontWeight:500 }}>✨ AI parsing…</span>}
                  </label>
                  <textarea className="inp" rows={3} style={{ resize:'vertical' }}
                    placeholder="Duties, requirements, hours, materials provided — AI will auto-fill title, county and urgency from your description"
                    value={form.description}
                    onChange={e => {
                      const val = e.target.value
                      setForm(f => ({...f, description: val}))
                      // debounced parse-intent
                      if (descDebounce.current) clearTimeout(descDebounce.current)
                      descDebounce.current = setTimeout(() => handleParseDescription(val), 900)
                    }} />
                </div>
                <div>
                  <label className="lbl">Category</label>
                  <select className="inp" value={form.category} onChange={e => setForm(f=>({...f,category:e.target.value}))}>
                    {CATEGORIES.filter(c=>c!=='all').map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="lbl">Company name</label>
                  <input className="inp" placeholder="Your company" value={form.companyName} onChange={e => setForm(f=>({...f,companyName:e.target.value}))} />
                </div>
                <div>
                  <label className="lbl">Budget type</label>
                  <select className="inp" value={form.budgetType} onChange={e => setForm(f=>({...f,budgetType:e.target.value}))}>
                    {BUDGET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  <div>
                    <label className="lbl">Budget min (KES)</label>
                    <input className="inp" type="number" placeholder="800" value={form.budgetMin} onChange={e => setForm(f=>({...f,budgetMin:e.target.value}))} />
                  </div>
                  <div>
                    <label className="lbl">Budget max (KES)</label>
                    <input className="inp" type="number" placeholder="1200" value={form.budgetMax} onChange={e => setForm(f=>({...f,budgetMax:e.target.value}))} />
                  </div>
                </div>

                {/* ── AI Pricing Suggestion ── */}
                <div style={{ gridColumn:'1/-1' }}>
                  <button
                    type="button"
                    onClick={handleGetPricingSuggestion}
                    disabled={pricingLoading}
                    className="btn btn-ghost"
                    style={{ width:'100%', justifyContent:'center', gap:6, fontSize:12,
                      borderStyle:'dashed', color:'var(--green)', borderColor:'var(--green)' }}>
                    <Sparkles size={13} />
                    {pricingLoading ? 'Asking AI for market rate…' : '✨ Suggest budget range with AI'}
                  </button>

                  {priceSuggestion && (
                    <div style={{ marginTop:8, padding:'12px 14px', background:'var(--green-pale)',
                      border:'1px solid var(--green)', borderRadius:10 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                        <div>
                          <div style={{ fontWeight:700, fontSize:13, color:'var(--green)', marginBottom:4 }}>
                            AI suggests: KES {Number(priceSuggestion.budgetMin).toLocaleString()} – {Number(priceSuggestion.budgetMax).toLocaleString()}
                          </div>
                          <div style={{ fontSize:11, color:'var(--text-3)', marginBottom:4 }}>
                            Market rate ≈ KES {Number(priceSuggestion.marketRate).toLocaleString()}
                            {' · '}Confidence {Math.round((priceSuggestion.confidence || 0) * 100)}%
                          </div>
                          <div style={{ fontSize:12, color:'var(--text-2)', lineHeight:1.5 }}>
                            {priceSuggestion.rationale}
                          </div>
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', gap:6, flexShrink:0 }}>
                          <button onClick={applyPriceSuggestion} className="btn btn-primary"
                            style={{ fontSize:11, padding:'5px 12px', gap:4, whiteSpace:'nowrap' }}>
                            <CheckCircle2 size={11} /> Apply
                          </button>
                          <button onClick={() => setPriceSuggestion(null)} className="btn btn-ghost"
                            style={{ fontSize:11, padding:'5px 10px' }}>
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="lbl">Location *</label>
                  <input className="inp" placeholder="e.g. Westlands, Nairobi" value={form.location} onChange={e => setForm(f=>({...f,location:e.target.value}))} />
                </div>
                <div>
                  <label className="lbl">County</label>
                  <input className="inp" placeholder="Nairobi" value={form.county} onChange={e => setForm(f=>({...f,county:e.target.value}))} />
                </div>
                <div>
                  <label className="lbl">Deadline</label>
                  <input className="inp" type="datetime-local" value={form.deadline} onChange={e => setForm(f=>({...f,deadline:e.target.value}))} />
                </div>
                <div>
                  <label className="lbl">Positions available</label>
                  <input className="inp" type="number" min="1" value={form.positionsAvailable} onChange={e => setForm(f=>({...f,positionsAvailable:e.target.value}))} />
                </div>
                <div style={{ gridColumn:'1/-1', display:'flex', alignItems:'center', gap:10 }}>
                  <input type="checkbox" id="urgent" checked={form.isUrgent} onChange={e => setForm(f=>({...f,isUrgent:e.target.checked}))} />
                  <label htmlFor="urgent" style={{ fontSize:13, cursor:'pointer' }}>
                    ⚡ Mark as urgent — highlighted in marketplace
                  </label>
                </div>
                {skills.length > 0 && (
                  <div style={{ gridColumn:'1/-1' }}>
                    <label className="lbl">Required skills</label>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                      {skills.slice(0,20).map((s:any) => {
                        const sel = form.requiredSkillIds.includes(s.id)
                        return (
                          <button key={s.id}
                            onClick={() => setForm(f => ({
                              ...f, requiredSkillIds: sel
                                ? f.requiredSkillIds.filter(id => id!==s.id)
                                : [...f.requiredSkillIds, s.id]
                            }))}
                            className={`btn ${sel?'btn-primary':'btn-ghost'}`}
                            style={{ padding:'4px 10px', fontSize:11 }}>
                            {s.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" style={{ flex:1, justifyContent:'center' }} onClick={() => setShowPost(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={handlePost}>
                Post job
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function JobCard({ job, isSelected, onClick }: any) {
  const catColor = CAT_COLOR[job.category] || '#6B7280'
  const daysAgo  = Math.floor((Date.now() - new Date(job.createdAt).getTime()) / 86400000)

  return (
    <div onClick={onClick}
      style={{ background:'var(--white)', borderRadius:16, overflow:'hidden', cursor:'pointer',
        border: isSelected ? '2px solid var(--green)' : '1px solid var(--border)',
        boxShadow: isSelected ? '0 4px 20px rgba(27,107,58,0.12)' : '0 2px 8px rgba(0,0,0,0.04)',
        transition:'all 0.15s' }}
      onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.transform='translateY(-3px)'; e.currentTarget.style.boxShadow='0 8px 24px rgba(0,0,0,0.1)' } }}
      onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.04)' } }}>

      {/* Category bar */}
      <div style={{ height:4, background:catColor }} />

      <div style={{ padding:'14px 16px' }}>
        {/* Top row */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
          <div style={{ flex:1, minWidth:0 }}>
            {job.isUrgent && (
              <span style={{ fontSize:9, fontWeight:800, color:'var(--accent)', background:'var(--accent-pale)',
                padding:'2px 7px', borderRadius:99, marginBottom:5, display:'inline-block' }}>
                ⚡ URGENT
              </span>
            )}
            <h3 style={{ fontSize:14, fontWeight:700, lineHeight:1.3, marginBottom:3,
              overflow:'hidden', textOverflow:'ellipsis', display:'-webkit-box',
              WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
              {job.title}
            </h3>
            <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:12, color:'var(--text-4)' }}>
              <Building2 size={11} />
              {job.companyName || 'Company'}
            </div>
          </div>
          <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:99, flexShrink:0, marginLeft:8,
            background:`${catColor}15`, color:catColor }}>
            {job.category}
          </span>
        </div>

        {/* Budget */}
        <div style={{ fontWeight:800, color:'var(--green)', fontSize:15, marginBottom:10 }}>
          KES {Number(job.budgetMin).toLocaleString()}
          {job.budgetMax > job.budgetMin && `–${Number(job.budgetMax).toLocaleString()}`}
          <span style={{ fontSize:11, fontWeight:400, color:'var(--text-4)', marginLeft:4 }}>
            /{job.budgetType}
          </span>
        </div>

        {/* Skills */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:10 }}>
          {(job.requiredSkills||[]).slice(0,3).map((s:any) => (
            <span key={s.name||s.id} style={{ fontSize:10, padding:'2px 8px', borderRadius:99,
              background:'var(--surface)', border:'1px solid var(--border)', color:'var(--text-2)' }}>
              {s.name}
            </span>
          ))}
          {(job.requiredSkills||[]).length > 3 && (
            <span style={{ fontSize:10, color:'var(--text-4)' }}>+{job.requiredSkills.length-3}</span>
          )}
        </div>

        {/* Footer */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:11, color:'var(--text-4)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:3 }}>
            <MapPin size={10} />
            {job.location}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ display:'flex', alignItems:'center', gap:3 }}>
              <Users size={10} /> {job.applicantCount||0}
            </span>
            <span style={{ display:'flex', alignItems:'center', gap:3 }}>
              <Clock size={10} /> {daysAgo === 0 ? 'Today' : `${daysAgo}d ago`}
            </span>
            <span className={`badge ${job.status==='open'?'badge-green':job.status==='assigned'?'badge-blue':'badge-gray'}`}
              style={{ fontSize:9 }}>
              {job.status}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
