import { useEffect, useState } from 'react'
import { Plus, Eye, EyeOff, RefreshCw, Search, UserCheck, X,
         ShieldCheck, UserX, UserCheck2, Edit2, Shield, Key } from 'lucide-react'
import toast from 'react-hot-toast'
import { getAllUsers, createOrgUser, getLoginReport,
         deactivateUser, activateUser, updateUser, api } from '../../api/api'
import { useAuthStore } from '../../store/store'

const ROLES = ['agent','supervisor','manager','employer']
const ADMIN_ROLES = ['agent','supervisor','manager','employer','admin']

const ROLE_BADGE: Record<string,string> = {
  super_admin:'badge-red', admin:'badge-red', manager:'badge-blue',
  supervisor:'badge-purple', employer:'badge-amber', agent:'badge-green', worker:'badge-gray',
}

// All possible permissions in the system
const ALL_PERMS: Array<{ key: string; label: string; group: string }> = [
  // Jobs
  { key:'canCreateJobs',  label:'Post jobs',      group:'Jobs'  },
  { key:'canEditJobs',    label:'Update jobs',         group:'Jobs'  },
  { key:'canDeleteJobs',  label:'Delete jobs',       group:'Jobs'  },
  { key:'canViewJobs',    label:'View jobs',         group:'Jobs'  },
  // Tasks
  { key:'canCreateTasks', label:'Assign tasks',      group:'Tasks' },
  { key:'canEditTasks',   label:'Update tasks',        group:'Tasks' },
  { key:'canDeleteTasks', label:'Delete tasks',      group:'Tasks' },
  // Team
  { key:'canViewAgents',     label:'View team',      group:'Team'  },
  { key:'canManageUsers',    label:'Manage team',     group:'Team'  },
  { key:'canInviteMembers',  label:'Invite members',   group:'Team'  },
  // Payments
  { key:'canManagePayments', label:'Manage payments',  group:'Payments' },
  // Reports
  { key:'canViewReports',    label:'View reports',     group:'Reports' },
]

export default function UsersPage() {
  const { user: me } = useAuthStore()
  const isSuperAdmin = me?.role === 'super_admin'
  const isAdmin      = ['super_admin','admin'].includes(me?.role)

  const [users, setUsers]     = useState<any[]>([])
  const [loginLogs, setLogs]  = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [roleFilter, setRoleF] = useState('all')
  const [tab, setTab]         = useState<'users'|'logs'|'permissions'>('users')

  const [showCreate, setShowCreate]   = useState(false)
  const [showEdit, setShowEdit]       = useState(false)
  const [showPerms, setShowPerms]     = useState(false)
  const [editing, setEditing]         = useState<any>(null)
  const [creating, setCreating]       = useState(false)
  const [showPass, setShowPass]       = useState(false)

  const [form, setForm] = useState({
    name:'', phone:'', email:'', password:'',
    role:'agent', companyName:'', county:'',
  })
  const [editForm, setEditForm] = useState({ name:'', role:'agent', county:'', companyName:'' })
  const [editPerms, setEditPerms] = useState<Record<string,boolean>>({})

  const [orgs, setOrgs]       = useState<any[]>([])
  const [orgFilter, setOrgF]  = useState<string>('all')

  const load = async () => {
    setLoading(true)
    const orgIdParam = isSuperAdmin && orgFilter !== 'all' ? `?orgId=${orgFilter}` : ''
    const [us, logs, orgList] = await Promise.allSettled([
      isSuperAdmin
        ? api.get(`/users${orgIdParam}`).then(r => r.data)
        : getAllUsers(),
      getLoginReport(),
      isSuperAdmin ? api.get('/organisations').then(r => r.data) : Promise.resolve([]),
    ])
    if (us.status === 'fulfilled')    setUsers(Array.isArray(us.value) ? us.value : [])
    if (logs.status === 'fulfilled')  setLogs((logs.value as any)?.loginLogs || [])
    if (orgList.status === 'fulfilled') setOrgs(Array.isArray(orgList.value) ? orgList.value : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [orgFilter])

  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    const matchQ = !q || u.name?.toLowerCase().includes(q) ||
                   u.phone?.includes(q) || u.role?.includes(q) || u.companyName?.toLowerCase().includes(q)
    const matchR = roleFilter === 'all' || u.role === roleFilter
    return matchQ && matchR
  })

  const handleCreate = async () => {
    if (!form.name || !form.phone || !form.password)
      return toast.error('Name, phone and password required')
    setCreating(true)
    try {
      await createOrgUser(form)
      toast.success('User created!')
      setShowCreate(false)
      setForm({ name:'', phone:'', email:'', password:'', role:'agent', companyName:'', county:'' })
      load()
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Failed to create user') }
    setCreating(false)
  }

  const openEdit = (u: any) => {
    setEditing(u)
    setEditForm({ name:u.name, role:u.role, county:u.county||'', companyName:u.companyName||'' })
    setShowEdit(true)
  }

  const openPerms = (u: any) => {
    setEditing(u)
    setEditPerms(u.permissions || {})
    setShowPerms(true)
  }

  const handleEdit = async () => {
    if (!editing) return
    try {
      await updateUser(editing.id, editForm)
      toast.success('User updated')
      setShowEdit(false)
      load()
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Failed') }
  }

  const handleSavePerms = async () => {
    if (!editing) return
    try {
      await api.patch(`/users/${editing.id}/permissions`, editPerms)
      toast.success('Permissions updated')
      setShowPerms(false)
      load()
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Failed') }
  }

  const handleToggleActive = async (u: any) => {
    try {
      if (u.isActive) { await deactivateUser(u.id); toast.success(`${u.name} deactivated`) }
      else            { await activateUser(u.id);   toast.success(`${u.name} reactivated`) }
      load()
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Failed') }
  }

  const permGroups = ALL_PERMS.reduce((acc, p) => {
    if (!acc[p.group]) acc[p.group] = []
    acc[p.group].push(p)
    return acc
  }, {} as Record<string, typeof ALL_PERMS>)

  const roleCounts = users.reduce((acc, u) => {
    acc[u.role] = (acc[u.role] || 0) + 1
    return acc
  }, {} as Record<string,number>)

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:700 }}>User Management</h1>
          <p style={{ color:'var(--text-3)', fontSize:13, marginTop:2 }}>
            {users.length} users · {users.filter(u => u.isActive!==false).length} active
          </p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={load} className="btn btn-ghost" style={{ gap:5 }}><RefreshCw size={13} /> Refresh</button>
          {isAdmin && <button onClick={() => setShowCreate(true)} className="btn btn-primary"><Plus size={14} /> Add user</button>}
        </div>
      </div>

      {/* Super-admin: org filter */}
      {isSuperAdmin && orgs.length > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14,
          padding:'12px 16px', background:'var(--info-pale)', borderRadius:10,
          border:'1px solid var(--info)' }}>
          <span style={{ fontSize:13, fontWeight:600, color:'var(--info)' }}>Viewing org:</span>
          <select className="inp" style={{ width:260 }} value={orgFilter}
            onChange={e => setOrgF(e.target.value)}>
            <option value="all">All organisations ({users.length} users)</option>
            {orgs.map((o: any) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          {orgFilter !== 'all' && (
            <button className="btn btn-ghost" style={{ fontSize:12 }}
              onClick={() => setOrgF('all')}>
              Clear filter
            </button>
          )}
        </div>
      )}

      {/* Role pills */}
      <div style={{ display:'flex', gap:7, flexWrap:'wrap', marginBottom:16 }}>
        <button onClick={() => setRoleF('all')} className={`btn ${roleFilter==='all'?'btn-primary':'btn-ghost'}`} style={{ fontSize:12, padding:'5px 12px' }}>
          All ({users.length})
        </button>
        {Object.entries(roleCounts).filter(([,n]) => n > 0).map(([r,n]) => (
          <button key={r} onClick={() => setRoleF(r)} className={`btn ${roleFilter===r?'btn-primary':'btn-ghost'}`} style={{ fontSize:12, padding:'5px 12px' }}>
            {r.replace('_',' ')} ({n})
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="tabs">
        {(['users','permissions','logs'] as const).map(t => (
          <button key={t} className={`tab ${tab===t?'active':''}`} onClick={() => setTab(t)}>
            {t === 'users' ? `Users (${filtered.length})` : t === 'permissions' ? '🔑 Permissions guide' : 'Login logs'}
          </button>
        ))}
      </div>

      {/* Search */}
      {tab === 'users' && (
        <div style={{ marginBottom:14 }}>
          <div style={{ position:'relative', width:300 }}>
            <Search size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-4)', pointerEvents:'none' }} />
            <input className="inp" placeholder="Search name, phone, company..." value={search}
              onChange={e => setSearch(e.target.value)} style={{ paddingLeft:30 }} />
          </div>
        </div>
      )}

      {/* ── USERS TABLE ── */}
      {tab === 'users' && (
        <div className="card" style={{ overflow:'hidden' }}>
          <table className="data-table">
            <thead>
              <tr><th>User</th><th>Role</th><th>Phone</th><th>Org</th><th>Agent stats</th><th>Status</th><th>Joined</th><th style={{ width:110 }}>Actions</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding:40, textAlign:'center', color:'var(--text-4)' }}>Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ padding:40, textAlign:'center', color:'var(--text-4)' }}>
                  {users.length === 0 ? 'No users yet' : 'No match'}
                </td></tr>
              ) : filtered.map(u => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                      <div style={{ width:34, height:34, borderRadius:'50%', flexShrink:0,
                        background: u.role==='agent'?'var(--green-pale)':u.role==='worker'?'var(--surface)':'var(--info-pale)',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:12, fontWeight:700,
                        color: u.role==='agent'?'var(--green)':u.role==='worker'?'var(--text-3)':'var(--info)' }}>
                        {u.name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <div style={{ fontWeight:600, fontSize:13 }}>{u.name}</div>
                        {u.email && <div style={{ fontSize:11, color:'var(--text-4)' }}>{u.email}</div>}
                        {u.username && <div style={{ fontSize:10, color:'var(--text-4)', fontFamily:'monospace' }}>@{u.username}</div>}
                      </div>
                    </div>
                  </td>
                  <td><span className={`badge ${ROLE_BADGE[u.role]||'badge-gray'}`}>{u.role?.replace('_',' ')}</span></td>
                  <td style={{ fontSize:12, color:'var(--text-3)', fontFamily:'monospace' }}>{u.phone}</td>
                  <td style={{ fontSize:11, color:'var(--text-4)' }}>{u.companyName || u.county || '—'}</td>
                  <td>
                    {u.agentData ? (
                      <div style={{ fontSize:12 }}>
                        <span style={{ fontWeight:700, color:'var(--green)' }}>Lv {u.agentData.level}</span>
                        <span style={{ color:'var(--text-4)' }}> · {u.agentData.totalXp} XP</span>
                        {u.agentData.currentStreak > 0 && <span style={{ color:'#F59E0B' }}> 🔥{u.agentData.currentStreak}</span>}
                      </div>
                    ) : <span style={{ fontSize:11, color:'var(--text-4)' }}>No agent profile</span>}
                  </td>
                  <td><span className={`badge ${u.isActive!==false?'badge-green':'badge-red'}`}>{u.isActive!==false?'Active':'Inactive'}</span></td>
                  <td style={{ fontSize:11, color:'var(--text-4)' }}>
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'}) : '—'}
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <div style={{ display:'flex', gap:4 }}>
                      <button className="btn-icon" title="Edit" onClick={() => openEdit(u)}><Edit2 size={12} /></button>
                      {isAdmin && <button className="btn-icon" title="Permissions" onClick={() => openPerms(u)}
                        style={{ color:'var(--info)', borderColor:'var(--info)' }}><Key size={12} /></button>}
                      <button className="btn-icon"
                        title={u.isActive!==false?'Deactivate':'Reactivate'}
                        onClick={() => handleToggleActive(u)}
                        style={{ color:u.isActive!==false?'var(--danger)':'var(--green)',
                          borderColor:u.isActive!==false?'var(--danger)':'var(--green)' }}>
                        {u.isActive!==false ? <UserX size={12} /> : <UserCheck2 size={12} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── PERMISSIONS GUIDE ── */}
      {tab === 'permissions' && (
        <div>
          <div style={{ padding:'12px 16px', background:'var(--info-pale)', borderRadius:10,
            border:'1px solid var(--info)', marginBottom:16, fontSize:13, color:'var(--info)' }}>
            <strong>How permissions work:</strong> Each role has default permissions. Admins can override individual permissions per user by clicking the 🔑 key icon on any user.
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px,1fr))', gap:12 }}>
            {Object.entries(permGroups).map(([group, perms]) => (
              <div key={group} className="card" style={{ padding:16 }}>
                <div style={{ fontWeight:700, fontSize:13, marginBottom:10, color:'var(--text-2)' }}>{group}</div>
                {perms.map(p => (
                  <div key={p.key} style={{ display:'flex', justifyContent:'space-between',
                    fontSize:12, padding:'5px 0', borderBottom:'1px solid var(--border)' }}>
                    <span style={{ color:'var(--text-3)' }}>{p.label}</span>
                    <div style={{ display:'flex', gap:6 }}>
                      {['admin','manager','supervisor','agent'].map(role => {
                        const roleDefault: Record<string, Record<string, boolean>> = {
                          admin:      { canCreateJobs:true,  canEditJobs:true,  canDeleteJobs:true,  canCreateTasks:true,  canEditTasks:true,  canDeleteTasks:true,  canViewReports:true,  canManageUsers:true,  canManagePayments:true,  canViewAgents:true,  canInviteMembers:true  },
                          manager:    { canCreateJobs:true,  canEditJobs:true,  canDeleteJobs:false, canCreateTasks:true,  canEditTasks:true,  canDeleteTasks:false, canViewReports:true,  canManageUsers:false, canManagePayments:true,  canViewAgents:true,  canInviteMembers:false },
                          supervisor: { canCreateJobs:false, canEditJobs:false, canDeleteJobs:false, canCreateTasks:true,  canEditTasks:true,  canDeleteTasks:false, canViewReports:true,  canManageUsers:false, canManagePayments:false, canViewAgents:true,  canInviteMembers:false },
                          agent:      { canCreateJobs:false, canEditJobs:false, canDeleteJobs:false, canCreateTasks:false, canEditTasks:false, canDeleteTasks:false, canViewReports:false, canManageUsers:false, canManagePayments:false, canViewAgents:false, canInviteMembers:false },
                        }
                        const has = roleDefault[role]?.[p.key]
                        return (
                          <span key={role} title={role} style={{ fontSize:9, padding:'1px 5px', borderRadius:99,
                            background: has ? 'var(--green-pale)' : 'var(--surface)',
                            color: has ? 'var(--green)' : 'var(--text-4)', fontWeight:600 }}>
                            {role.slice(0,3).toUpperCase()}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── LOGIN LOGS ── */}
      {tab === 'logs' && (
        <div className="card" style={{ overflow:'hidden' }}>
          <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:14 }}>
            Login activity — {loginLogs.length} sessions
          </div>
          <table className="data-table">
            <thead><tr><th>User</th><th>Role</th><th>IP</th><th>Time</th></tr></thead>
            <tbody>
              {loginLogs.length === 0 ? (
                <tr><td colSpan={4} style={{ padding:32, textAlign:'center', color:'var(--text-4)' }}>No login records yet</td></tr>
              ) : loginLogs.slice(0,50).map((log, i) => (
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
                  <td style={{ fontSize:12, fontFamily:'monospace', color:'var(--text-3)' }}>{log.ip||'—'}</td>
                  <td style={{ fontSize:12, color:'var(--text-3)' }}>
                    {log.loginAt ? new Date(log.loginAt).toLocaleString('en-KE',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ══ CREATE USER MODAL ══ */}
      {showCreate && (
        <div className="modal-backdrop" onClick={e => e.target===e.currentTarget && setShowCreate(false)}>
          <div className="modal modal-sm">
            <div className="modal-header">
              <div>
                <h2 style={{ fontSize:17, fontWeight:700 }}>Add user to your organisation</h2>
                <p style={{ fontSize:12, color:'var(--text-4)', marginTop:3 }}>
                  This user will be scoped to your organisation only
                </p>
              </div>
              <button className="btn-icon" onClick={() => setShowCreate(false)}><X size={15} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                <div>
                  <label className="lbl">Full name *</label>
                  <input className="inp" placeholder="Peter Mwangi" value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} />
                </div>
                <div>
                  <label className="lbl">Phone *</label>
                  <input className="inp" type="tel" placeholder="0712345678" value={form.phone} onChange={e => setForm(f=>({...f,phone:e.target.value}))} />
                </div>
              </div>
              <div style={{ marginBottom:12 }}>
                <label className="lbl">Email (optional)</label>
                <input className="inp" type="email" placeholder="user@email.com" value={form.email} onChange={e => setForm(f=>({...f,email:e.target.value}))} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                <div>
                  <label className="lbl">Role *</label>
                  <select className="inp" value={form.role} onChange={e => setForm(f=>({...f,role:e.target.value}))}>
                    {(isSuperAdmin ? ADMIN_ROLES : ROLES).map(r => <option key={r} value={r}>{r.replace('_',' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="lbl">County</label>
                  <input className="inp" placeholder="Nairobi" value={form.county} onChange={e => setForm(f=>({...f,county:e.target.value}))} />
                </div>
              </div>
              <div style={{ position:'relative', marginBottom:8 }}>
                <label className="lbl">Password *</label>
                <input className="inp" type={showPass?'text':'password'} placeholder="Min 6 characters"
                  value={form.password} onChange={e => setForm(f=>({...f,password:e.target.value}))}
                  style={{ paddingRight:40 }} />
                <button type="button" onClick={() => setShowPass(s=>!s)}
                  style={{ position:'absolute', right:10, bottom:9, color:'var(--text-4)', background:'none', border:'none', cursor:'pointer' }}>
                  {showPass ? <EyeOff size={15}/> : <Eye size={15}/>}
                </button>
              </div>
              <div style={{ fontSize:12, color:'var(--text-3)', padding:'10px 12px', background:'var(--surface)', borderRadius:8 }}>
                💡 This user will automatically appear in your organisation only. They can log in with their phone number or the auto-generated username.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" style={{ flex:1, justifyContent:'center' }} onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={handleCreate} disabled={creating}>
                {creating ? 'Creating...' : <><UserCheck size={14} /> Create user</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ EDIT MODAL ══ */}
      {showEdit && editing && (
        <div className="modal-backdrop" onClick={e => e.target===e.currentTarget && setShowEdit(false)}>
          <div className="modal modal-sm">
            <div className="modal-header">
              <h2 style={{ fontSize:17, fontWeight:700 }}>Edit — {editing.name}</h2>
              <button className="btn-icon" onClick={() => setShowEdit(false)}><X size={15} /></button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom:12 }}>
                <label className="lbl">Full name</label>
                <input className="inp" value={editForm.name} onChange={e => setEditForm(f=>({...f,name:e.target.value}))} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label className="lbl">Role</label>
                  <select className="inp" value={editForm.role} onChange={e => setEditForm(f=>({...f,role:e.target.value}))}>
                    {(isSuperAdmin ? ADMIN_ROLES : ROLES).map(r => <option key={r} value={r}>{r.replace('_',' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="lbl">County</label>
                  <input className="inp" value={editForm.county} onChange={e => setEditForm(f=>({...f,county:e.target.value}))} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" style={{ flex:1, justifyContent:'center' }} onClick={() => setShowEdit(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={handleEdit}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ PERMISSIONS MODAL ══ */}
      {showPerms && editing && (
        <div className="modal-backdrop" onClick={e => e.target===e.currentTarget && setShowPerms(false)}>
          <div className="modal">
            <div className="modal-header">
              <div>
                <h2 style={{ fontSize:17, fontWeight:700 }}>Permissions — {editing.name}</h2>
                <p style={{ fontSize:12, color:'var(--text-4)', marginTop:3 }}>
                  Override default permissions for this {editing.role}
                </p>
              </div>
              <button className="btn-icon" onClick={() => setShowPerms(false)}><X size={15} /></button>
            </div>
            <div className="modal-body">
              {Object.entries(permGroups).map(([group, perms]) => (
                <div key={group} style={{ marginBottom:16 }}>
                  <div style={{ fontWeight:700, fontSize:12, color:'var(--text-3)', textTransform:'uppercase',
                    letterSpacing:'0.6px', marginBottom:8 }}>{group}</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    {perms.map(p => (
                      <label key={p.key} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer',
                        padding:'8px 12px', background:'var(--surface)', borderRadius:8,
                        border:`1px solid ${editPerms[p.key] ? 'var(--green)' : 'var(--border)'}` }}>
                        <input type="checkbox" checked={!!editPerms[p.key]}
                          onChange={e => setEditPerms(prev => ({...prev, [p.key]: e.target.checked}))} />
                        <span style={{ fontSize:12, color: editPerms[p.key] ? 'var(--green)' : 'var(--text-2)',
                          fontWeight: editPerms[p.key] ? 600 : 400 }}>{p.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" style={{ flex:1, justifyContent:'center' }} onClick={() => setShowPerms(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={handleSavePerms}>
                <Shield size={14} /> Save permissions
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
