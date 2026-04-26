import { useEffect, useState } from 'react'
import { Plus, Users, X, Building2, Trash2, UserPlus, RefreshCw, Crown, Shield, UserCheck, GitBranch, AlertCircle, MapPin } from 'lucide-react'
import toast from 'react-hot-toast'
import { api, getSystemOptions, addSystemOption } from '../../api/api'
import { useAuthStore } from '../../store/store'

const ROLE_META: Record<string,{ label:string; badge:string; Icon: any }> = {
  super_admin: { label:'Super Admin', badge:'badge-red',    Icon: Crown },
  admin:       { label:'Admin',       badge:'badge-purple', Icon: Crown },
  manager:     { label:'Manager',     badge:'badge-blue',   Icon: Shield },
  supervisor:  { label:'Supervisor',  badge:'badge-purple', Icon: Shield },
  agent:       { label:'Agent',       badge:'badge-green',  Icon: UserCheck },
  employer:    { label:'Employer',    badge:'badge-amber',  Icon: Crown },
  worker:      { label:'Worker',      badge:'badge-gray',   Icon: UserCheck },
}
const ROLE_ORDER = ['admin','manager','supervisor','agent','employer','worker','super_admin']

const INDUSTRIES = ['FMCG / Distribution','Microfinance','Solar / Energy','Logistics',
  'Research','Merchandising','Construction','Healthcare','Technology','Other']

export default function OrganisationsPage() {
  const { user } = useAuthStore()
  const isSuperAdmin = user?.role === 'super_admin'
  const [orgs, setOrgs]           = useState<any[]>([])
  const [selected, setSelected]   = useState<any>(null)
  const [members, setMembers]     = useState<any>(null)
  const [branches, setBranches]   = useState<any[]>([])
  const [tab, setTab]             = useState<'members' | 'branches'>('members')
  const [loading, setLoading]     = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showBranch, setShowBranch] = useState(false)
  const [invitePhone, setInvitePhone] = useState('')
  const [inviting, setInviting]   = useState(false)
  const [creating, setCreating]   = useState(false)
  const [creatingBranch, setCreatingBranch] = useState(false)
  const [form, setForm] = useState({ name:'', industry:'', county:'', description:'' })
  const [branchForm, setBranchForm] = useState({ branchName:'', county:'', address:'', description:'' })
  const [otherIndustry, setOtherIndustry]       = useState('')
  const [customIndustries, setCustomIndustries] = useState<string[]>([])

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.get('/organisations').then(r => r.data)
      setOrgs(Array.isArray(data) ? data : [])
    } catch { setOrgs([]) }
    setLoading(false)
  }

  const loadMembers = async (orgId: string) => {
    try {
      const data = await api.get(`/organisations/${orgId}/members`).then(r => r.data)
      setMembers(data)
    } catch { setMembers({ agents:[], users:[], totalMembers:0 }) }
  }

  const loadBranches = async (orgId: string) => {
    try {
      const data = await api.get(`/organisations/${orgId}/branches`).then(r => r.data)
      setBranches(Array.isArray(data) ? data : [])
    } catch { setBranches([]) }
  }

  useEffect(() => {
    load()
    getSystemOptions('industry').then(setCustomIndustries).catch(() => {})
  }, [])

  const handleCreate = async () => {
    if (!form.name) return toast.error('Organisation name required')
    if (form.industry === 'Other' && !otherIndustry.trim()) return toast.error('Please specify your industry')
    const resolvedIndustry = form.industry === 'Other' ? otherIndustry.trim() : form.industry
    setCreating(true)
    try {
      if (form.industry === 'Other' && otherIndustry.trim()) {
        await addSystemOption('industry', otherIndustry.trim()).catch(() => {})
        setCustomIndustries(prev => prev.includes(otherIndustry.trim()) ? prev : [...prev, otherIndustry.trim()])
      }
      await api.post('/organisations', { ...form, industry: resolvedIndustry })
      toast.success('Organisation created!')
      setShowCreate(false)
      setForm({ name:'', industry:'', county:'', description:'' })
      setOtherIndustry('')
      load()
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Failed to create') }
    setCreating(false)
  }

  const handleCreateBranch = async () => {
    if (!branchForm.branchName.trim()) return toast.error('Branch name required')
    if (!selected) return
    setCreatingBranch(true)
    try {
      await api.post(`/organisations/${selected.id}/branches`, branchForm)
      toast.success('Branch created!')
      setShowBranch(false)
      setBranchForm({ branchName:'', county:'', address:'', description:'' })
      loadBranches(selected.id)
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Failed to create branch') }
    setCreatingBranch(false)
  }

  const handleInvite = async () => {
    if (!invitePhone || !selected) return
    setInviting(true)
    try {
      const res = await api.post(`/organisations/${selected.id}/invite`, { phone: invitePhone }).then(r => r.data)
      toast.success(res.message || 'Invitation sent!')
      setInvitePhone('')
      loadMembers(selected.id)
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Failed to invite') }
    setInviting(false)
  }

  const handleRemove = async (orgId: string, agentId: string, name: string) => {
    if (!confirm(`Remove ${name} from this organisation?`)) return
    try {
      await api.delete(`/organisations/${orgId}/members/${agentId}`)
      toast.success(`${name} removed`)
      loadMembers(orgId)
    } catch { toast.error('Failed to remove') }
  }

  const handleToggleActive = async (org: any) => {
    const action = org.isActive === false ? 'activate' : 'deactivate'
    try {
      await api.patch(`/organisations/${org.id}/${action}`)
      toast.success(action === 'activate' ? 'Organisation reactivated' : 'Organisation deactivated')
      load()
      setSelected((prev: any) => prev?.id === org.id ? { ...prev, isActive: action === 'activate' } : prev)
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Failed') }
  }

  const openOrg = (org: any) => {
    setSelected(org)
    setTab('members')
    loadMembers(org.id)
    loadBranches(org.id)
  }

  return (
    <div className="fade-in">
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:700 }}>Organisation Management</h1>
          <p style={{ color:'var(--text-3)', fontSize:13, marginTop:2 }}>
            Manage your teams, invite agents and track membership
          </p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={load} className="btn btn-ghost" style={{ gap:5 }}><RefreshCw size={13} /> Refresh</button>
          <button onClick={() => setShowCreate(true)} className="btn btn-primary"><Plus size={14} /> New organisation</button>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns: selected ? '280px 1fr' : '1fr', gap:16 }}>

        {/* Org list */}
        <div>
          {loading ? (
            <div style={{ color:'var(--text-4)', fontSize:13, padding:20 }}>Loading...</div>
          ) : orgs.length === 0 ? (
            <div className="card" style={{ padding:32, textAlign:'center' }}>
              <Building2 size={36} style={{ color:'var(--text-4)', margin:'0 auto 12px' }} />
              <div style={{ fontWeight:600, marginBottom:6 }}>No organisations yet</div>
              <p style={{ fontSize:13, color:'var(--text-4)', marginBottom:16 }}>
                Create your first organisation to start managing a team
              </p>
              <button onClick={() => setShowCreate(true)} className="btn btn-primary" style={{ margin:'0 auto' }}>
                <Plus size={14} /> Create organisation
              </button>
            </div>
          ) : orgs.map(org => (
            <div key={org.id} onClick={() => openOrg(org)}
              className="card"
              style={{ padding:16, marginBottom:10, cursor:'pointer',
                border: selected?.id===org.id ? '2px solid var(--green)' : '1px solid var(--border)',
                transition:'all 0.12s' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:40, height:40, borderRadius:10, background:'var(--green-pale)',
                  display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <Building2 size={18} color="var(--green)" />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{ fontWeight:700, fontSize:14, color:'var(--text-1)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{org.name}</div>
                    {org.isActive === false && (
                      <span className="badge badge-red" style={{ fontSize:9, flexShrink:0 }}>Inactive</span>
                    )}
                  </div>
                  <div style={{ fontSize:11, color:'var(--text-4)' }}>{org.industry || 'No industry set'} {org.county ? `· ${org.county}` : ''}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Org detail */}
        {selected && (
          <div>
            {/* Header card */}
            <div className="card" style={{ padding:20, marginBottom:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                    <h2 style={{ fontSize:18, fontWeight:700 }}>{selected.name}</h2>
                    {selected.branchName && (
                      <span className="badge badge-blue" style={{ display:'flex', alignItems:'center', gap:3 }}>
                        <GitBranch size={10} /> Branch
                      </span>
                    )}
                    <span className={`badge ${selected.isActive === false ? 'badge-red' : 'badge-green'}`}>
                      {selected.isActive === false ? 'Inactive' : 'Active'}
                    </span>
                  </div>
                  <div style={{ fontSize:13, color:'var(--text-4)' }}>
                    {selected.industry}{selected.county ? ` · ${selected.county}` : ''}
                  </div>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  {isSuperAdmin && (
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize:12, color: selected.isActive === false ? 'var(--green)' : 'var(--danger)', borderColor: selected.isActive === false ? 'var(--green)' : 'var(--danger)' }}
                      onClick={() => handleToggleActive(selected)}>
                      {selected.isActive === false
                        ? <><AlertCircle size={12} /> Reactivate</>
                        : <><AlertCircle size={12} /> Deactivate</>}
                    </button>
                  )}
                  <button className="btn-icon" onClick={() => { setSelected(null); setMembers(null); setBranches([]) }}><X size={14} /></button>
                </div>
              </div>
              {selected.description && (
                <p style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.6, marginBottom:10 }}>{selected.description}</p>
              )}
              <div style={{ display:'flex', gap:16 }}>
                <div style={{ display:'flex', gap:8, alignItems:'center', padding:'10px 14px', background:'var(--surface)', borderRadius:8, flex:1 }}>
                  <Users size={15} color="var(--text-3)" />
                  <span style={{ fontSize:13, color:'var(--text-2)' }}>{members?.totalMembers ?? '…'} members</span>
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center', padding:'10px 14px', background:'var(--surface)', borderRadius:8, flex:1 }}>
                  <GitBranch size={15} color="var(--text-3)" />
                  <span style={{ fontSize:13, color:'var(--text-2)' }}>{branches.length} branch{branches.length !== 1 ? 'es' : ''}</span>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="tabs" style={{ marginBottom:16 }}>
              <button className={`tab ${tab === 'members' ? 'active' : ''}`} onClick={() => setTab('members')}>
                Members ({members?.totalMembers ?? 0})
              </button>
              <button className={`tab ${tab === 'branches' ? 'active' : ''}`} onClick={() => setTab('branches')}>
                Branches ({branches.length})
              </button>
            </div>

            {tab === 'branches' && (
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                  <span style={{ fontSize:13, color:'var(--text-3)' }}>Manage regional offices or branch locations</span>
                  <button className="btn btn-primary" style={{ fontSize:12 }} onClick={() => setShowBranch(true)}>
                    <Plus size={13} /> Add branch
                  </button>
                </div>
                {branches.length === 0 ? (
                  <div className="card" style={{ padding:32, textAlign:'center' }}>
                    <MapPin size={32} style={{ color:'var(--text-4)', margin:'0 auto 10px' }} />
                    <div style={{ fontWeight:600, color:'var(--text-2)', marginBottom:6 }}>No branches yet</div>
                    <p style={{ fontSize:13, color:'var(--text-4)', marginBottom:16 }}>
                      Add a branch to manage separate locations under this organisation
                    </p>
                    <button className="btn btn-primary" style={{ margin:'0 auto' }} onClick={() => setShowBranch(true)}>
                      <Plus size={13} /> Add first branch
                    </button>
                  </div>
                ) : (
                  <div style={{ display:'grid', gap:10 }}>
                    {branches.map((b: any) => (
                      <div key={b.id} className="card" style={{ padding:16, display:'flex', alignItems:'center', gap:14 }}>
                        <div style={{ width:38, height:38, borderRadius:10, background:'var(--green-pale)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                          <GitBranch size={16} color="var(--green)" />
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:700, fontSize:14 }}>{b.branchName}</div>
                          <div style={{ fontSize:12, color:'var(--text-4)' }}>
                            {b.county ? `${b.county} · ` : ''}{b.stats?.totalMembers ?? 0} members
                          </div>
                          {b.address && <div style={{ fontSize:11, color:'var(--text-4)', marginTop:2 }}>{b.address}</div>}
                        </div>
                        <span className={`badge ${b.isActive === false ? 'badge-red' : 'badge-green'}`}>
                          {b.isActive === false ? 'Inactive' : 'Active'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'members' && (
            <div>
            {/* Invite panel */}
            <div className="card" style={{ padding:20, marginBottom:16 }}>
              <div style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>Invite agent / worker</div>
              <p style={{ fontSize:12, color:'var(--text-3)', marginBottom:12, lineHeight:1.5 }}>
                Enter their phone number. They must already have a Gigs4You account.
                Once invited, Tasks will unlock in their app.
              </p>
              <div style={{ display:'flex', gap:8 }}>
                <input className="inp" type="tel" placeholder="0712 345 678" style={{ flex:1 }}
                  value={invitePhone} onChange={e => setInvitePhone(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleInvite()} />
                <button onClick={handleInvite} disabled={inviting || !invitePhone} className="btn btn-primary">
                  {inviting ? '...' : <><UserPlus size={14} /> Invite</>}
                </button>
              </div>
            </div>

            {/* Members list — all roles grouped */}
            <div className="card" style={{ overflow:'hidden' }}>
              <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)',
                display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontWeight:700, fontSize:14 }}>
                  Team members ({members?.totalMembers ?? 0})
                </span>
                {members?.byRole && (
                  <div style={{ display:'flex', gap:6 }}>
                    {Object.entries(members.byRole as Record<string,number>).map(([role, count]) => {
                      const meta = ROLE_META[role]
                      return meta ? (
                        <span key={role} className={`badge ${meta.badge}`} style={{ fontSize:10 }}>
                          {meta.label} × {count}
                        </span>
                      ) : null
                    })}
                  </div>
                )}
              </div>
              {!members ? (
                <div style={{ padding:24, textAlign:'center', color:'var(--text-4)' }}>Loading members...</div>
              ) : (members.members ?? members.agents ?? []).length === 0 ? (
                <div style={{ padding:32, textAlign:'center', color:'var(--text-4)' }}>
                  No members yet — invite agents using the form above
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr><th>Member</th><th>Phone</th><th>Role</th><th>Field status</th><th>Confirmed</th><th></th></tr>
                  </thead>
                  <tbody>
                    {(members.members ?? members.agents ?? [])
                      .slice()
                      .sort((a: any, b: any) =>
                        (ROLE_ORDER.indexOf(a.role ?? a.user?.role) - ROLE_ORDER.indexOf(b.role ?? b.user?.role)))
                      .map((m: any) => {
                        const role = m.role ?? m.user?.role ?? 'agent'
                        const meta = ROLE_META[role] ?? ROLE_META.agent
                        const Icon = meta.Icon
                        const name  = m.name  ?? m.user?.name  ?? '—'
                        const phone = m.phone ?? m.user?.phone ?? '—'
                        const email = m.email ?? m.user?.email
                        const agentId = m.agentId ?? m.id
                        const status = m.status ?? 'offline'
                        const confirmed = m.isConfirmed ?? false
                        return (
                          <tr key={m.id}>
                            <td>
                              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                <div style={{ width:30, height:30, borderRadius:'50%',
                                  background:'var(--green-pale)', display:'flex', alignItems:'center',
                                  justifyContent:'center', fontSize:12, fontWeight:700, color:'var(--green)', flexShrink:0 }}>
                                  {name[0]?.toUpperCase() || <Icon size={14} />}
                                </div>
                                <div>
                                  <div style={{ fontWeight:500, fontSize:13 }}>{name}</div>
                                  {email && <div style={{ fontSize:11, color:'var(--text-4)' }}>{email}</div>}
                                </div>
                              </div>
                            </td>
                            <td style={{ fontSize:12, color:'var(--text-3)' }}>{phone}</td>
                            <td>
                              <span className={`badge ${meta.badge}`} style={{ display:'flex', alignItems:'center', gap:4, width:'fit-content' }}>
                                <Icon size={10} /> {meta.label}
                              </span>
                            </td>
                            <td>
                              {['agent','supervisor'].includes(role) ? (
                                <span style={{ fontSize:11, padding:'2px 8px', borderRadius:99, fontWeight:600,
                                  background: status==='checked_in'?'var(--green-pale)':'var(--surface)',
                                  color: status==='checked_in'?'var(--green)':'var(--text-3)' }}>
                                  {status==='checked_in'?'In field':status==='checked_out'?'Checked out':'Offline'}
                                </span>
                              ) : <span style={{ color:'var(--text-4)', fontSize:12 }}>—</span>}
                            </td>
                            <td>
                              {['agent','supervisor'].includes(role) ? (
                                <span className={`badge ${confirmed?'badge-green':'badge-amber'}`}>
                                  {confirmed ? 'Confirmed' : 'Pending'}
                                </span>
                              ) : <span style={{ color:'var(--text-4)', fontSize:12 }}>—</span>}
                            </td>
                            <td onClick={e => e.stopPropagation()}>
                              {['agent','supervisor'].includes(role) && (
                                <button className="btn-icon"
                                  style={{ color:'var(--danger)', borderColor:'var(--danger)' }}
                                  onClick={() => handleRemove(selected.id, agentId, name)}>
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              )}
            </div>
            </div>
            )}
          </div>
        )}
      </div>

      {/* Branch modal */}
      {showBranch && selected && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowBranch(false)}>
          <div className="modal modal-sm">
            <div className="modal-header">
              <div>
                <h2 style={{ fontSize:17, fontWeight:700 }}>Add branch</h2>
                <p style={{ fontSize:12, color:'var(--text-4)', marginTop:3 }}>
                  Under: <strong>{selected.name}</strong>
                </p>
              </div>
              <button className="btn-icon" onClick={() => setShowBranch(false)}><X size={15} /></button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom:12 }}>
                <label className="lbl">Branch name *</label>
                <input className="inp" placeholder="e.g. Mombasa Branch"
                  value={branchForm.branchName}
                  onChange={e => setBranchForm(f => ({ ...f, branchName: e.target.value }))} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                <div>
                  <label className="lbl">County</label>
                  <input className="inp" placeholder="Mombasa"
                    value={branchForm.county}
                    onChange={e => setBranchForm(f => ({ ...f, county: e.target.value }))} />
                </div>
                <div>
                  <label className="lbl">Address</label>
                  <input className="inp" placeholder="Tom Mboya St"
                    value={branchForm.address}
                    onChange={e => setBranchForm(f => ({ ...f, address: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="lbl">Description</label>
                <textarea className="inp" rows={2} style={{ resize:'vertical' }}
                  placeholder="What does this branch handle?"
                  value={branchForm.description}
                  onChange={e => setBranchForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" style={{ flex:1, justifyContent:'center' }} onClick={() => setShowBranch(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={handleCreateBranch} disabled={creatingBranch}>
                {creatingBranch ? 'Creating...' : <><GitBranch size={13} /> Create branch</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="modal-backdrop" onClick={e => e.target===e.currentTarget && setShowCreate(false)}>
          <div className="modal modal-sm">
            <div className="modal-header">
              <div>
                <h2 style={{ fontSize:17, fontWeight:700 }}>Create organisation</h2>
                <p style={{ fontSize:12, color:'var(--text-4)', marginTop:3 }}>Set up a team for managing field agents</p>
              </div>
              <button className="btn-icon" onClick={() => setShowCreate(false)}><X size={15} /></button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom:12 }}>
                <label className="lbl">Organisation name *</label>
                <input className="inp" placeholder="e.g. Bidco Field Team" value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                <div>
                  <label className="lbl">Industry</label>
                  <select className="inp" value={form.industry} onChange={e => setForm(f=>({...f,industry:e.target.value}))}>
                    <option value="">Select</option>
                    {[...INDUSTRIES.filter(i => i !== 'Other'), ...customIndustries.filter(i => !INDUSTRIES.includes(i)), 'Other'].map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                  {form.industry === 'Other' && (
                    <input className="inp" required placeholder="Enter your industry"
                      style={{ marginTop:6 }}
                      value={otherIndustry}
                      onChange={e => setOtherIndustry(e.target.value)} />
                  )}
                </div>
                <div>
                  <label className="lbl">County / HQ</label>
                  <input className="inp" placeholder="Nairobi" value={form.county} onChange={e => setForm(f=>({...f,county:e.target.value}))} />
                </div>
              </div>
              <div>
                <label className="lbl">Description</label>
                <textarea className="inp" rows={2} style={{ resize:'vertical' }} placeholder="What does this team do?"
                  value={form.description} onChange={e => setForm(f=>({...f,description:e.target.value}))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" style={{ flex:1, justifyContent:'center' }} onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={handleCreate} disabled={creating}>
                {creating ? 'Creating...' : 'Create organisation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
