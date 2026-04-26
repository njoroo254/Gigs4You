import { useEffect, useState, useRef } from 'react'
import { Plus, X, Search, MapPin, RefreshCw, Clock,
         Trash2, CheckSquare, Camera, List, AlertCircle, ZoomIn, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { getTasks, createTask, updateTask, deleteTask, getAgents, approveTask } from '../../api/api'
import { useAuthStore } from '../../store/store'

const AI_SERVICE = import.meta.env.VITE_AI_SERVICE || 'http://localhost:8001'

const STATUSES   = ['all','pending','in_progress','completed','failed','cancelled']
const PRIORITIES = ['low','medium','high']
const STATUS_COLOR: Record<string,[string,string]> = {
  pending:     ['var(--accent-pale)', 'var(--accent)'],
  in_progress: ['var(--info-pale)',   'var(--info)'],
  completed:   ['var(--green-pale)',  'var(--green)'],
  failed:      ['var(--danger-pale)', 'var(--danger)'],
  cancelled:   ['var(--surface)',     'var(--text-3)'],
}
const PRIORITY_DOT: Record<string,string> = { high:'#EF4444', medium:'#F59E0B', low:'#9CA3AF' }

const emptyForm = () => ({
  title:'', description:'', priority:'medium', locationName:'',
  dueAt:'', agentId:'', xpReward:'50', latitude:'', longitude:'',
  requiresPhoto: false, requiresSignature: false,
  acceptanceWindowMinutes: '120',
  checklist: [] as Array<{label:string; required:boolean; requiresPhoto:boolean; requiredPhotoCount:number}>,
})


export default function TasksPage() {
  const user         = useAuthStore(s => s.user)
  const activeOrgId  = useAuthStore(s => s.activeOrgId)
  const activeOrgName = useAuthStore(s => s.activeOrgName)
  const isSuperAdmin = user?.role === 'super_admin'

  const [tasks, setTasks]         = useState<any[]>([])
  const [agents, setAgents]       = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState<'create'|'edit'|'view'|null>(null)
  const [selected, setSelected]   = useState<any>(null)
  const [statusFilter, setStatus] = useState('all')
  const [prioFilter, setPrio]     = useState('all')
  const [search, setSearch]       = useState('')
  const [saving, setSaving]       = useState(false)
  const [approving, setApproving] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [lightboxUrl, setLightboxUrl] = useState<string|null>(null)
  const [form, setForm]           = useState(emptyForm())
  const [checkInput, setCheckInput] = useState('')
  const [parseLoading, setParseLoading] = useState(false)
  const taskDescDebounce = useRef<ReturnType<typeof setTimeout>|null>(null)

  const load = async () => {
    setLoading(true)
    const orgParam = isSuperAdmin && activeOrgId ? { organisationId: activeOrgId } : undefined
    const [t, a] = await Promise.allSettled([getTasks(orgParam), getAgents(orgParam)])
    setTasks(t.status === 'fulfilled' && Array.isArray(t.value) ? t.value : [])
    setAgents(a.status === 'fulfilled' && Array.isArray(a.value) ? a.value : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [activeOrgId])

  const filtered = tasks.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false
    if (prioFilter   !== 'all' && t.priority !== prioFilter) return false
    if (search && !t.title?.toLowerCase().includes(search.toLowerCase()) &&
        !t.locationName?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const openCreate = () => { setForm(emptyForm()); setModal('create') }
  const openView   = (t: any) => { setSelected(t); setPayAmount(String(t.paymentAmount || '')); setModal('view') }
  const openEdit   = (t: any) => {
    setSelected(t)
    setForm({
      title:       t.title || '', description: t.description || '',
      priority:    t.priority || 'medium', locationName: t.locationName || '',
      dueAt:       t.dueAt?.slice(0,16) || '', agentId: t.agentId || '',
      xpReward:    String(t.xpReward || 50),
      latitude:    String(t.latitude || ''), longitude: String(t.longitude || ''),
      requiresPhoto:      t.requiresPhoto || false,
      requiresSignature:  t.requiresSignature || false,
      acceptanceWindowMinutes: String(t.acceptanceWindowMinutes || 120),
      checklist:   (t.checklist || []).map((c: any) => ({
        label: c.label || '', required: c.required ?? false,
        requiresPhoto: c.requiresPhoto ?? false, requiredPhotoCount: c.requiredPhotoCount ?? 1,
      })),
    })
    setModal('edit')
  }
  const closeModal = () => { setModal(null); setSelected(null) }

  const handleApprove = async () => {
    if (!selected) return
    setApproving(true)
    try {
      const amount = payAmount ? Number(payAmount) : undefined
      const updated = await approveTask(selected.id, amount)
      toast.success(amount ? `Approved & KES ${amount} queued for payment` : 'Task approved')
      setSelected(updated)
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Approval failed')
    }
    setApproving(false)
  }

  const addChecklistItem = () => {
    if (!checkInput.trim()) return
    setForm(f => ({ ...f, checklist: [...f.checklist, { label: checkInput.trim(), required: false, requiresPhoto: false, requiredPhotoCount: 1 }] }))
    setCheckInput('')
  }

  const removeChecklistItem = (i: number) =>
    setForm(f => ({ ...f, checklist: f.checklist.filter((_,idx) => idx !== i) }))

  const toggleRequired = (i: number) =>
    setForm(f => ({ ...f, checklist: f.checklist.map((c,idx) =>
      idx === i ? {...c, required:!c.required} : c) }))

  const toggleItemPhoto = (i: number) =>
    setForm(f => ({ ...f, checklist: f.checklist.map((c,idx) =>
      idx === i ? {...c, requiresPhoto:!c.requiresPhoto} : c) }))

  const setItemPhotoCount = (i: number, count: number) =>
    setForm(f => ({ ...f, checklist: f.checklist.map((c,idx) =>
      idx === i ? {...c, requiredPhotoCount: Math.min(10, Math.max(1, count))} : c) }))

  const handleParseTaskDescription = async (description: string) => {
    if (description.length < 25) return
    setParseLoading(true)
    try {
      const res = await fetch(`${AI_SERVICE}/ai/parse-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      })
      if (!res.ok) return
      const result = await res.json()
      if (!result || result.confidence < 0.4) return
      let applied = false
      setForm(f => {
        const updates: any = {}
        // Apply priority if AI is confident and form is still at default
        if (result.priority && f.priority === 'medium' && result.priority !== 'medium') {
          updates.priority = result.priority
          applied = true
        }
        // Apply checklist items if form checklist is empty
        if (f.checklist.length === 0 && result.checklist?.length > 0) {
          updates.checklist = result.checklist.map((label: string) => ({
            label, required: false, requiresPhoto: false, requiredPhotoCount: 1,
          }))
          applied = true
        }
        // Apply estimated XP from minutes estimate
        if (result.estimatedMinutes && f.xpReward === '50') {
          const xp = Math.min(200, Math.max(20, Math.round(result.estimatedMinutes / 2)))
          updates.xpReward = String(xp)
          applied = true
        }
        return applied ? { ...f, ...updates } : f
      })
      if (applied) toast.success('AI filled in checklist and priority', { duration: 2500 })
    } catch {}
    setParseLoading(false)
  }

  const handleSave = async () => {
    if (!form.title.trim()) return toast.error('Title is required')
    setSaving(true)
    try {
      const payload = {
        ...form,
        xpReward:    Number(form.xpReward),
        latitude:    form.latitude  ? Number(form.latitude)  : undefined,
        longitude:   form.longitude ? Number(form.longitude) : undefined,
        agentId:     form.agentId   || undefined,
        dueAt:       form.dueAt     || undefined,
        acceptanceWindowMinutes: Number(form.acceptanceWindowMinutes),
      }
      if (modal === 'edit' && selected) {
        await updateTask(selected.id, payload)
        toast.success('Task updated')
      } else {
        await createTask(payload)
        toast.success('Task created')
      }
      closeModal(); load()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to save')
    }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this task?')) return
    try { await deleteTask(id); toast.success('Deleted'); load() }
    catch { toast.error('Failed to delete') }
  }

  const counts = {
    pending:     tasks.filter(t => t.status==='pending').length,
    active:      tasks.filter(t => t.status==='in_progress').length,
    completed:   tasks.filter(t => t.status==='completed').length,
    failed:      tasks.filter(t => t.status==='failed').length,
    overdue:     tasks.filter(t => t.acceptanceOverdue).length,
  }

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:700 }}>Tasks</h1>
          <p style={{ color:'var(--text-3)', fontSize:13, marginTop:2 }}>
            {counts.active} active · {counts.pending} pending · {counts.completed} completed
            {counts.overdue > 0 && <span style={{ color:'var(--danger)', fontWeight:600 }}> · {counts.overdue} awaiting acceptance</span>}
          </p>
          {isSuperAdmin && activeOrgId && (
            <div style={{ marginTop:6, display:'inline-flex', alignItems:'center', gap:6,
              background:'var(--green-pale)', border:'1px solid var(--green)', borderRadius:6,
              padding:'3px 10px', fontSize:11, color:'var(--green)', fontWeight:600 }}>
              <MapPin size={11} />
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
          <button onClick={load} className="btn btn-ghost" style={{ gap:5 }}><RefreshCw size={13} /> Refresh</button>
          <button onClick={openCreate} className="btn btn-primary"><Plus size={14} /> New task</button>
        </div>
      </div>

      {/* Stat strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10, marginBottom:18 }}>
        {[
          { l:'Pending',   v:counts.pending,   color:'var(--accent)', bg:'var(--accent-pale)' },
          { l:'Active',    v:counts.active,    color:'var(--info)',   bg:'var(--info-pale)' },
          { l:'Completed', v:counts.completed, color:'var(--green)', bg:'var(--green-pale)' },
          { l:'Failed',    v:counts.failed,    color:'var(--danger)', bg:'var(--danger-pale)' },
          { l:'Overdue accept', v:counts.overdue, color:counts.overdue?'var(--danger)':'var(--text-4)', bg:counts.overdue?'var(--danger-pale)':'var(--surface)' },
        ].map(s => (
          <div key={s.l} style={{ background:s.bg, borderRadius:10, padding:'10px 14px' }}>
            <div style={{ fontWeight:800, fontSize:18, color:s.color }}>{s.v}</div>
            <div style={{ fontSize:10, color:s.color, opacity:0.7, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.3px' }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ position:'relative', width:220 }}>
          <Search size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-4)', pointerEvents:'none' }} />
          <input className="inp" placeholder="Search tasks..." value={search}
            onChange={e => setSearch(e.target.value)} style={{ paddingLeft:30 }} />
        </div>
        <select className="inp" style={{ width:130 }} value={statusFilter} onChange={e => setStatus(e.target.value)}>
          {STATUSES.map(s => <option key={s} value={s}>{s==='all'?'All statuses':s.replace('_',' ')}</option>)}
        </select>
        <select className="inp" style={{ width:130 }} value={prioFilter} onChange={e => setPrio(e.target.value)}>
          <option value="all">All priorities</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <span style={{ fontSize:12, color:'var(--text-4)', marginLeft:4 }}>{filtered.length} of {tasks.length} tasks</span>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow:'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width:14 }}></th>
              <th>Task</th>
              <th>Agent</th>
              <th>Status</th>
              <th>Acceptance</th>
              <th>Time tracking</th>
              <th>Checklist</th>
              <th>Due</th>
              <th>XP</th>
              <th style={{ width:80 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ padding:40, textAlign:'center', color:'var(--text-4)' }}>Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} style={{ padding:40, textAlign:'center', color:'var(--text-4)' }}>No tasks found</td></tr>
            ) : filtered.map(task => {
              const [sbg,sfg] = STATUS_COLOR[task.status] || STATUS_COLOR.cancelled
              const agent = agents.find(a => a.id === task.agentId)
              const hasChecklist = task.checklist?.length > 0
              const doneItems = task.checklist?.filter((c:any) => c.checked).length || 0
              return (
                <tr key={task.id} onClick={() => openView(task)} style={{ cursor:'pointer' }}>
                  <td style={{ paddingLeft:16 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:PRIORITY_DOT[task.priority]||'#9CA3AF' }} />
                  </td>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                      {task.acceptanceOverdue && (
                        <span style={{ fontSize:9, fontWeight:800, color:'var(--danger)', background:'var(--danger-pale)', padding:'2px 6px', borderRadius:4 }}>AWAITING ACCEPT</span>
                      )}
                      {task.acceptanceStatus === 'declined' && (
                        <span style={{ fontSize:9, fontWeight:800, color:'var(--accent)', background:'var(--accent-pale)', padding:'2px 6px', borderRadius:4 }}>DECLINED</span>
                      )}
                      <span style={{ fontWeight:500, fontSize:13 }}>{task.title}</span>
                    </div>
                    {task.locationName && (
                      <div style={{ display:'flex', alignItems:'center', gap:3, fontSize:11, color:'var(--text-4)', marginTop:2 }}>
                        <MapPin size={10} />{task.locationName}
                      </div>
                    )}
                    <div style={{ display:'flex', gap:6, marginTop:3 }}>
                      {task.requiresPhoto && <span style={{ fontSize:9, color:'var(--text-4)' }}>📷 Photo required</span>}
                      {task.requiresSignature && <span style={{ fontSize:9, color:'var(--text-4)' }}>✍️ Signature required</span>}
                    </div>
                  </td>
                  <td style={{ fontSize:12, color:'var(--text-2)' }}>
                    {agent?.user?.name || (task.agentId ? '—' : <span style={{ color:'var(--text-4)' }}>Unassigned</span>)}
                  </td>
                  <td>
                    <span style={{ fontSize:11, fontWeight:600, padding:'2px 10px', borderRadius:99, background:sbg, color:sfg }}>
                      {task.status.replace('_',' ')}
                    </span>
                  </td>
                  <td style={{ fontSize:12 }}>
                    {task.acceptanceStatus === 'accepted' ? (
                      <span style={{ color:'var(--green)', fontWeight:600 }}>✓ Accepted</span>
                    ) : task.acceptanceStatus === 'declined' ? (
                      <span style={{ color:'var(--danger)' }}>✗ Declined</span>
                    ) : (
                      <span style={{ color:'var(--text-4)' }}>Pending…</span>
                    )}
                  </td>
                  <td style={{ fontSize:11, color:'var(--text-3)' }}>
                    {task.minutesToStart != null && (
                      <div style={{ display:'flex', alignItems:'center', gap:3 }}>
                        <Clock size={10} /> Start: {task.minutesToStart}m
                      </div>
                    )}
                    {task.minutesToComplete != null && (
                      <div style={{ display:'flex', alignItems:'center', gap:3, marginTop:2 }}>
                        <CheckSquare size={10} /> Done: {task.minutesToComplete}m
                      </div>
                    )}
                    {task.minutesToStart == null && '—'}
                  </td>
                  <td style={{ fontSize:12 }}>
                    {hasChecklist
                      ? <span style={{ color: doneItems===task.checklist.length?'var(--green)':'var(--text-3)' }}>
                          {doneItems}/{task.checklist.length}
                        </span>
                      : <span style={{ color:'var(--text-4)' }}>—</span>}
                  </td>
                  <td style={{ fontSize:11, color:'var(--text-3)' }}>
                    {task.dueAt ? new Date(task.dueAt).toLocaleDateString('en-KE',{day:'numeric',month:'short'}) : '—'}
                  </td>
                  <td style={{ fontWeight:600, color:'var(--green)', fontSize:12 }}>+{task.xpReward}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <div style={{ display:'flex', gap:4 }}>
                      <button className="btn-icon" title="Edit" onClick={() => openEdit(task)} style={{ fontSize:12 }}>✎</button>
                      <button className="btn-icon" title="Delete"
                        style={{ color:'var(--danger)', borderColor:'var(--danger)' }}
                        onClick={() => handleDelete(task.id)}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ══ CREATE / EDIT MODAL ══ */}
      {(modal === 'create' || modal === 'edit') && (
        <div className="modal-backdrop" onClick={e => e.target===e.currentTarget && closeModal()}>
          <div className="modal">
            <div className="modal-header">
              <div>
                <h2 style={{ fontSize:17, fontWeight:700 }}>{modal==='create' ? 'Create new task' : 'Edit task'}</h2>
                <p style={{ fontSize:12, color:'var(--text-4)', marginTop:3 }}>
                  {modal==='edit' ? 'Update task details' : 'Define what the agent needs to do, require proof, build a checklist'}
                </p>
              </div>
              <button className="btn-icon" onClick={closeModal}><X size={15} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {/* Title */}
                <div style={{ gridColumn:'1/-1' }}>
                  <label className="lbl">Task title *</label>
                  <input className="inp" placeholder="e.g. Route sales audit — Westlands"
                    value={form.title} onChange={e => setForm(f=>({...f,title:e.target.value}))} />
                </div>
                {/* Description */}
                <div style={{ gridColumn:'1/-1' }}>
                  <label className="lbl" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span>Description / instructions</span>
                    {parseLoading && <span style={{ fontSize:10, color:'var(--green)', fontWeight:500 }}>✨ AI parsing…</span>}
                  </label>
                  <textarea className="inp" rows={2} style={{ resize:'vertical' }}
                    placeholder="Describe what the agent needs to do — AI will auto-fill checklist items, priority and XP estimate"
                    value={form.description}
                    onChange={e => {
                      const val = e.target.value
                      setForm(f => ({...f, description: val}))
                      if (modal === 'create') {
                        if (taskDescDebounce.current) clearTimeout(taskDescDebounce.current)
                        taskDescDebounce.current = setTimeout(() => handleParseTaskDescription(val), 900)
                      }
                    }} />
                </div>
                {/* Priority + agent */}
                <div>
                  <label className="lbl">Priority</label>
                  <select className="inp" value={form.priority} onChange={e => setForm(f=>({...f,priority:e.target.value}))}>
                    {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="lbl">Assign to agent</label>
                  <select className="inp" value={form.agentId} onChange={e => setForm(f=>({...f,agentId:e.target.value}))}>
                    <option value="">Unassigned</option>
                    {agents.map(a => <option key={a.id} value={a.id}>{a.user?.name}</option>)}
                  </select>
                </div>
                {/* Location */}
                <div>
                  <label className="lbl">Location name</label>
                  <input className="inp" placeholder="e.g. Westlands Supermarket"
                    value={form.locationName} onChange={e => setForm(f=>({...f,locationName:e.target.value}))} />
                </div>
                {/* Due */}
                <div>
                  <label className="lbl">Due date & time</label>
                  <input className="inp" type="datetime-local"
                    value={form.dueAt} onChange={e => setForm(f=>({...f,dueAt:e.target.value}))} />
                </div>
                {/* XP + acceptance window */}
                <div>
                  <label className="lbl">XP reward</label>
                  <input className="inp" type="number" min="0" placeholder="50"
                    value={form.xpReward} onChange={e => setForm(f=>({...f,xpReward:e.target.value}))} />
                </div>
                <div>
                  <label className="lbl">Acceptance window (minutes)</label>
                  <input className="inp" type="number" min="15" placeholder="120"
                    value={form.acceptanceWindowMinutes}
                    onChange={e => setForm(f=>({...f,acceptanceWindowMinutes:e.target.value}))} />
                  <div style={{ fontSize:10, color:'var(--text-4)', marginTop:3 }}>
                    Agent must accept within this many minutes or it flags as overdue
                  </div>
                </div>

                {/* ── Proof requirements ── */}
                <div style={{ gridColumn:'1/-1' }}>
                  <div className="section-title" style={{ marginBottom:8 }}>Proof requirements</div>
                  <div style={{ display:'flex', gap:16 }}>
                    <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
                      <input type="checkbox" checked={form.requiresPhoto}
                        onChange={e => setForm(f=>({...f,requiresPhoto:e.target.checked}))} />
                      <Camera size={14} />
                      Require photo upload
                    </label>
                    <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
                      <input type="checkbox" checked={form.requiresSignature}
                        onChange={e => setForm(f=>({...f,requiresSignature:e.target.checked}))} />
                      ✍️ Require customer signature
                    </label>
                  </div>
                </div>

                {/* ── Checklist builder ── */}
                <div style={{ gridColumn:'1/-1' }}>
                  <div className="section-title" style={{ marginBottom:8 }}>
                    <List size={12} style={{ display:'inline', marginRight:4 }} />
                    Task checklist ({form.checklist.length} items)
                  </div>
                  <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                    <input className="inp" placeholder="Add checklist item..."
                      value={checkInput} onChange={e => setCheckInput(e.target.value)}
                      onKeyDown={e => e.key==='Enter' && addChecklistItem()}
                      style={{ flex:1 }} />
                    <button onClick={addChecklistItem} className="btn btn-ghost" style={{ gap:5, flexShrink:0 }}>
                      <Plus size={13} /> Add
                    </button>
                  </div>
                  {form.checklist.length === 0 ? (
                    <div style={{ fontSize:12, color:'var(--text-4)', padding:'8px 0' }}>
                      No checklist items. Add items the agent must tick off to complete this task.
                    </div>
                  ) : (
                    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                      {form.checklist.map((item, i) => (
                        <div key={i} style={{ background:'var(--surface)', borderRadius:8, border:'1px solid var(--border)', overflow:'hidden' }}>
                          {/* Item row */}
                          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px' }}>
                            <CheckSquare size={13} color="var(--text-4)" />
                            <span style={{ flex:1, fontSize:13 }}>{item.label}</span>
                            <label style={{ display:'flex', alignItems:'center', gap:4, fontSize:11,
                              cursor:'pointer', color: item.required ? 'var(--danger)' : 'var(--text-4)' }}>
                              <input type="checkbox" checked={item.required} onChange={() => toggleRequired(i)} />
                              Required
                            </label>
                            <label style={{ display:'flex', alignItems:'center', gap:4, fontSize:11,
                              cursor:'pointer', color: item.requiresPhoto ? 'var(--blue, #3B82F6)' : 'var(--text-4)' }}>
                              <input type="checkbox" checked={item.requiresPhoto} onChange={() => toggleItemPhoto(i)} />
                              <Camera size={11} /> Photo
                            </label>
                            <button onClick={() => removeChecklistItem(i)}
                              style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-4)', display:'flex' }}>
                              <X size={13} />
                            </button>
                          </div>
                          {/* Photo count sub-row */}
                          {item.requiresPhoto && (
                            <div style={{ padding:'4px 12px 8px', borderTop:'1px solid var(--border)',
                              display:'flex', alignItems:'center', gap:8, background:'#EFF6FF' }}>
                              <Camera size={11} color="#3B82F6" />
                              <span style={{ fontSize:11, color:'#3B82F6' }}>Photos required:</span>
                              <input type="number" min={1} max={10}
                                value={item.requiredPhotoCount}
                                onChange={e => setItemPhotoCount(i, Number(e.target.value))}
                                style={{ width:52, padding:'2px 6px', borderRadius:6, border:'1px solid #BFDBFE',
                                  fontSize:12, background:'#fff', textAlign:'center' }} />
                              <span style={{ fontSize:11, color:'#6B7280' }}>(max 10, up to 2 MB each)</span>
                            </div>
                          )}
                        </div>
                      ))}
                      <div style={{ fontSize:11, color:'var(--text-4)', marginTop:2 }}>
                        <AlertCircle size={10} style={{ display:'inline', marginRight:3 }} />
                        "Required" items must be checked · "Photo" items need the specified number of photos
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" style={{ flex:1, justifyContent:'center' }} onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : modal==='create' ? 'Create task' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ LIGHTBOX ══ */}
      {lightboxUrl && (
        <div onClick={() => setLightboxUrl(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:9999,
            display:'flex', alignItems:'center', justifyContent:'center', cursor:'zoom-out' }}>
          {lightboxUrl.match(/\.(pdf)$/i) ? (
            <iframe src={lightboxUrl} style={{ width:'90vw', height:'90vh', border:'none', borderRadius:8 }} />
          ) : (
            <img src={lightboxUrl} alt="preview"
              style={{ maxWidth:'92vw', maxHeight:'92vh', borderRadius:8, boxShadow:'0 8px 40px rgba(0,0,0,0.6)' }} />
          )}
          <button onClick={() => setLightboxUrl(null)}
            style={{ position:'absolute', top:16, right:16, background:'rgba(255,255,255,0.15)',
              border:'none', borderRadius:'50%', width:36, height:36, color:'#fff', cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>✕</button>
        </div>
      )}

      {/* ══ VIEW MODAL ══ */}
      {modal === 'view' && selected && (
        <div className="modal-backdrop" onClick={e => e.target===e.currentTarget && closeModal()}>
          <div className="modal" style={{ maxWidth:680 }}>
            <div className="modal-header">
              <div>
                <h2 style={{ fontSize:16, fontWeight:700 }}>{selected.title}</h2>
                <div style={{ display:'flex', gap:6, marginTop:4 }}>
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99,
                    background:STATUS_COLOR[selected.status]?.[0], color:STATUS_COLOR[selected.status]?.[1] }}>
                    {selected.status?.replace('_',' ')}
                  </span>
                  <span className={`badge ${selected.priority==='high'?'badge-red':selected.priority==='medium'?'badge-amber':'badge-gray'}`}>
                    {selected.priority}
                  </span>
                  {selected.approvedAt && (
                    <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99,
                      background:'var(--green-pale)', color:'var(--green)' }}>✓ Approved</span>
                  )}
                </div>
              </div>
              <button className="btn-icon" onClick={closeModal}><X size={15} /></button>
            </div>
            <div className="modal-body" style={{ maxHeight:'75vh', overflowY:'auto' }}>
              {selected.description && (
                <p style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.6, marginBottom:14 }}>{selected.description}</p>
              )}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
                {[
                  ['Acceptance', selected.acceptanceStatus],
                  ['XP reward',  `+${selected.xpReward} XP`],
                  ['Start time', selected.minutesToStart != null ? `${selected.minutesToStart} min after assignment` : 'Not started'],
                  ['Completion', selected.minutesToComplete != null ? `${selected.minutesToComplete} min to complete` : 'Not done'],
                  ['Photo req.', selected.requiresPhoto ? 'Yes' : 'No'],
                  ['Signature',  selected.requiresSignature ? 'Yes' : 'No'],
                ].map(([k,v]) => (
                  <div key={k} style={{ background:'var(--surface)', borderRadius:8, padding:'10px 12px' }}>
                    <div style={{ fontSize:10, color:'var(--text-4)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.3px', marginBottom:3 }}>{k}</div>
                    <div style={{ fontSize:13, fontWeight:600 }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* ── Checklist with per-item photos ── */}
              {selected.checklist?.length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <div className="section-title">Checklist</div>
                  {selected.checklist.map((item: any) => (
                    <div key={item.id} style={{ borderBottom:'1px solid var(--border)', paddingBottom:10, marginBottom:10 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13 }}>
                        <div style={{ width:18, height:18, borderRadius:4, border:'1.5px solid',
                          borderColor: item.checked ? 'var(--green)' : 'var(--border)',
                          background: item.checked ? 'var(--green)' : 'var(--white)',
                          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                          {item.checked && <span style={{ color:'#fff', fontSize:10 }}>✓</span>}
                        </div>
                        <span style={{ flex:1, textDecoration: item.checked ? 'line-through' : 'none',
                          color: item.checked ? 'var(--text-4)' : 'var(--text-1)', fontWeight:500 }}>{item.label}</span>
                        {item.requiresPhoto && (
                          <span style={{ fontSize:10, color: (item.photoUrls?.length||0) >= (item.requiredPhotoCount||1) ? 'var(--green)' : '#3B82F6', fontWeight:700 }}>
                            📷 {item.photoUrls?.length || 0}/{item.requiredPhotoCount || 1}
                          </span>
                        )}
                        {item.required && !item.checked && (
                          <span style={{ fontSize:9, color:'var(--danger)', fontWeight:700 }}>REQUIRED</span>
                        )}
                      </div>
                      {/* Per-item proof photos */}
                      {item.photoUrls?.length > 0 && (
                        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:8, paddingLeft:26 }}>
                          {item.photoUrls.map((url: string, pi: number) => (
                            <div key={pi} style={{ position:'relative', cursor:'pointer' }}
                              onClick={() => setLightboxUrl(url)}>
                              <img src={url} alt={`${item.label} photo ${pi+1}`}
                                style={{ width:64, height:64, objectFit:'cover', borderRadius:6,
                                  border:'1px solid var(--border)' }} />
                              <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0)', borderRadius:6,
                                display:'flex', alignItems:'center', justifyContent:'center',
                                transition:'background 0.15s' }}
                                onMouseEnter={e => (e.currentTarget.style.background='rgba(0,0,0,0.25)')}
                                onMouseLeave={e => (e.currentTarget.style.background='rgba(0,0,0,0)')}>
                                <ZoomIn size={16} color="#fff" style={{ opacity:0 }}
                                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity='1')}
                                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity='0')} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {selected.notes && (
                <div style={{ marginBottom:16 }}>
                  <div className="section-title">Agent notes</div>
                  <p style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.6 }}>{selected.notes}</p>
                </div>
              )}

              {/* ── Overall proof photos ── */}
              {selected.photoUrls?.length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <div className="section-title">Proof photos ({selected.photoUrls.length})</div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {selected.photoUrls.map((url: string, i: number) => (
                      <img key={i} src={url} alt="proof" onClick={() => setLightboxUrl(url)}
                        style={{ width:80, height:80, objectFit:'cover', borderRadius:8, cursor:'pointer',
                          border:'1px solid var(--border)' }} />
                    ))}
                  </div>
                </div>
              )}

              {/* ── AI Photo Verification ── */}
              {selected.status === 'completed' && selected.photoUrls?.length > 0 && (
                <div style={{ marginBottom:14 }}>
                  <div className="section-title">AI photo verification</div>
                  {selected.photoVerified === true && (
                    <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 12px',
                      background:'var(--green-pale)', border:'1px solid var(--green)', borderRadius:8 }}>
                      <span style={{ fontSize:16 }}>✅</span>
                      <div>
                        <div style={{ fontWeight:700, fontSize:12, color:'var(--green)' }}>
                          Photo verified by AI
                          {selected.aiCompletionScore != null && (
                            <span style={{ marginLeft:8, fontWeight:400, color:'var(--text-3)' }}>
                              · score {Math.round(selected.aiCompletionScore * 100)}%
                            </span>
                          )}
                        </div>
                        {selected.photoVerificationNote && (
                          <div style={{ fontSize:11, color:'var(--text-2)', marginTop:2 }}>{selected.photoVerificationNote}</div>
                        )}
                      </div>
                    </div>
                  )}
                  {selected.photoVerified === false && (
                    <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 12px',
                      background:'var(--danger-pale)', border:'1px solid var(--danger)', borderRadius:8 }}>
                      <span style={{ fontSize:16 }}>⚠️</span>
                      <div>
                        <div style={{ fontWeight:700, fontSize:12, color:'var(--danger)' }}>Photo did not pass AI verification</div>
                        {selected.photoVerificationNote && (
                          <div style={{ fontSize:11, color:'var(--text-2)', marginTop:2 }}>{selected.photoVerificationNote}</div>
                        )}
                      </div>
                    </div>
                  )}
                  {selected.photoVerified == null && (
                    <div style={{ fontSize:12, color:'var(--text-4)', fontStyle:'italic' }}>
                      Verification pending — Claude will review the photo in the background
                    </div>
                  )}
                </div>
              )}

              {/* ── Approve & pay ── */}
              {selected.status === 'completed' && !selected.approvedAt && (
                <div style={{ background:'var(--green-pale)', border:'1px solid var(--green)', borderRadius:10, padding:14, marginTop:4 }}>
                  <div style={{ fontWeight:700, fontSize:13, color:'var(--green)', marginBottom:10 }}>
                    ✓ Approve this task &amp; pay agent
                  </div>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <div style={{ flex:1 }}>
                      <label style={{ fontSize:11, color:'var(--text-3)', fontWeight:600, display:'block', marginBottom:4 }}>
                        Payment amount (KES) — optional
                      </label>
                      <input className="inp" type="number" min="0" placeholder="e.g. 500"
                        value={payAmount} onChange={e => setPayAmount(e.target.value)}
                        style={{ fontSize:13 }} />
                      <div style={{ fontSize:10, color:'var(--text-4)', marginTop:3 }}>
                        Leave blank to approve without payment
                      </div>
                    </div>
                    <button className="btn btn-primary" style={{ alignSelf:'flex-end', padding:'10px 20px' }}
                      onClick={handleApprove} disabled={approving}>
                      {approving ? 'Approving…' : payAmount ? `Approve & Pay KES ${payAmount}` : 'Approve'}
                    </button>
                  </div>
                </div>
              )}
              {selected.approvedAt && (
                <div style={{ background:'var(--green-pale)', borderRadius:8, padding:'10px 14px', marginTop:4, fontSize:12, color:'var(--green)' }}>
                  ✓ Approved on {new Date(selected.approvedAt).toLocaleDateString('en-KE', { day:'numeric', month:'short', year:'numeric' })}
                  {selected.paymentAmount && ` · KES ${selected.paymentAmount} paid to agent`}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" style={{ flex:1, justifyContent:'center' }} onClick={closeModal}>Close</button>
              <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={() => { closeModal(); openEdit(selected) }}>Edit task</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
