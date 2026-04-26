import { useEffect, useRef, useState } from 'react'
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Briefcase,
  Building2,
  CheckCircle,
  ChevronRight,
  Clock,
  Crown,
  Edit2,
  ExternalLink,
  FileCheck,
  FileText,
  ListChecks,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  UserX,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { activateUser, api, deactivateUser } from '../../api/api'
import { useAuthStore } from '../../store/store'

const INDUSTRIES = [
  'FMCG / Distribution', 'Microfinance', 'Solar / Energy', 'Logistics', 'Research',
  'Merchandising', 'Construction', 'Healthcare', 'Technology', 'Retail', 'Telecom',
  'NGO / Development', 'Other',
]

const ROLE_BADGE: Record<string, string> = {
  super_admin: 'badge-red', admin: 'badge-red', manager: 'badge-blue',
  supervisor: 'badge-purple', agent: 'badge-green', employer: 'badge-amber', worker: 'badge-gray',
}
const PLAN_BADGE: Record<string, string> = {
  free: 'badge-gray', starter: 'badge-blue', growth: 'badge-green', scale: 'badge-purple', enterprise: 'badge-amber',
}
const STATUS_BADGE: Record<string, string> = {
  active: 'badge-green', trial: 'badge-blue', past_due: 'badge-red', expired: 'badge-red', cancelled: 'badge-gray', inactive: 'badge-red',
}
const TASK_STATUS_BADGE: Record<string, string> = {
  pending: 'badge-gray', in_progress: 'badge-blue', completed: 'badge-green', failed: 'badge-red', cancelled: 'badge-gray',
}
const ATTACHABLE_ROLES = ['admin', 'manager', 'supervisor', 'agent', 'employer', 'worker']

const emptyOrg = () => ({
  name: '', industry: '', county: '', description: '', address: '',
  billingEmail: '', billingPhone: '', kraPin: '', vatNumber: '', businessRegNo: '',
})

const money = (value: any) => `KES ${Number(value || 0).toLocaleString()}`
const roleLabel = (role?: string) => role ? role.replace('_', ' ') : 'user'
const fmt = (value: any, time = false) => {
  if (!value) return '—'
  return new Date(value).toLocaleString(
    'en-KE',
    time
      ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { day: 'numeric', month: 'short', year: 'numeric' },
  )
}
const riskOf = (summary?: any) => {
  if ((summary?.critical || 0) > 0) return { label: 'Critical', badge: 'badge-red', score: 3 }
  if ((summary?.warning || 0) > 0) return { label: 'Attention', badge: 'badge-amber', score: 2 }
  if ((summary?.info || 0) > 0) return { label: 'Monitor', badge: 'badge-blue', score: 1 }
  return { label: 'Healthy', badge: 'badge-green', score: 0 }
}

function Metric({ label, value, icon, color }: any) {
  return (
    <div className="stat-card">
      <div style={{ color }}>{icon}</div>
      <div className="stat-value" style={{ color, marginTop: 6 }}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

type TabId = 'overview' | 'people' | 'tasks' | 'jobs' | 'billing' | 'compliance' | 'activity'
type SubView = { type: 'task' | 'job'; data: any } | null

export default function ManageOrgsPage() {
  const { user, setActiveOrg, clearActiveOrg } = useAuthStore()
  const isSuperAdmin = user?.role === 'super_admin'

  // Core
  const [loading, setLoading] = useState(true)
  const [loadingDashboard, setLoadingDashboard] = useState(false)
  const [overview, setOverview] = useState<any>(null)
  const [directory, setDirectory] = useState<any[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState('')
  const [dashboard, setDashboard] = useState<any>(null)
  const [tab, setTab] = useState<TabId>('overview')
  const [subView, setSubView] = useState<SubView>(null)

  // Directory filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [planFilter, setPlanFilter] = useState('all')
  const [riskFilter, setRiskFilter] = useState('all')

  // Create org
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(emptyOrg())
  const [creating, setCreating] = useState(false)
  const [ownerQuery, setOwnerQuery] = useState('')
  const [ownerResults, setOwnerResults] = useState<any[]>([])
  const [owner, setOwner] = useState<any>(null)

  // Profile edit
  const [profileForm, setProfileForm] = useState(emptyOrg())
  const [saving, setSaving] = useState(false)

  // People tab
  const [invitePhone, setInvitePhone] = useState('')
  const [peopleSearch, setPeopleSearch] = useState('')
  const [peopleResults, setPeopleResults] = useState<any[]>([])
  const [attachRole, setAttachRole] = useState('agent')

  // Member drawer
  const [memberDrawer, setMemberDrawer] = useState<any>(null)
  const [memberVerification, setMemberVerification] = useState<any>(null)
  const [memberRoleEdit, setMemberRoleEdit] = useState('')
  const [savingRole, setSavingRole] = useState(false)

  // Tasks tab
  const [allTasks, setAllTasks] = useState<any[]>([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [taskSearch, setTaskSearch] = useState('')
  const [taskStatusFilter, setTaskStatusFilter] = useState('all')
  const [taskStatusEdit, setTaskStatusEdit] = useState('')
  const [savingTaskStatus, setSavingTaskStatus] = useState(false)

  // Jobs tab
  const [allJobs, setAllJobs] = useState<any[]>([])
  const [loadingJobs, setLoadingJobs] = useState(false)
  const [jobSearch, setJobSearch] = useState('')
  const [jobStatusFilter, setJobStatusFilter] = useState('all')

  // Compliance doc uploads
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null)
  const [docUrls, setDocUrls] = useState<Record<string, string>>({})
  const kraRef = useRef<HTMLInputElement>(null)
  const bizRef = useRef<HTMLInputElement>(null)
  const taxRef = useRef<HTMLInputElement>(null)

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadPortfolio = async (preferredOrgId?: string) => {
    setLoading(true)
    try {
      const [ov, dir] = await Promise.allSettled([
        api.get('/organisations/super-admin/overview').then((r) => r.data),
        api.get('/organisations/super-admin/directory').then((r) => r.data),
      ])
      const nextOverview = ov.status === 'fulfilled' ? ov.value : null
      const nextDirectory = dir.status === 'fulfilled' && Array.isArray(dir.value) ? dir.value : []
      setOverview(nextOverview)
      setDirectory(nextDirectory)
      setSelectedOrgId((current) => {
        if (preferredOrgId && nextDirectory.some((org) => org.id === preferredOrgId)) return preferredOrgId
        // Don't auto-select first org — user picks from card grid
        if (current && nextDirectory.some((org) => org.id === current)) return current
        return ''
      })
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to load organisations')
    } finally {
      setLoading(false)
    }
  }

  const loadDashboard = async (orgId: string) => {
    if (!orgId) return setDashboard(null)
    setLoadingDashboard(true)
    try {
      const data = await api.get(`/organisations/${orgId}/dashboard`).then((r) => r.data)
      setDashboard(data)
      setProfileForm({
        name: data?.org?.name || '',
        industry: data?.org?.industry || '',
        county: data?.org?.county || '',
        description: data?.org?.description || '',
        address: data?.org?.address || '',
        billingEmail: data?.org?.billingEmail || '',
        billingPhone: data?.org?.billingPhone || '',
        kraPin: data?.org?.kraPin || '',
        vatNumber: data?.org?.vatNumber || '',
        businessRegNo: data?.org?.businessRegNo || '',
      })
      setDocUrls({
        kraDocUrl: data?.org?.kraDocUrl || '',
        businessRegDocUrl: data?.org?.businessRegDocUrl || '',
        taxComplianceDocUrl: data?.org?.taxComplianceDocUrl || '',
      })
    } catch (e: any) {
      setDashboard(null)
      toast.error(e?.response?.data?.message || 'Failed to load organisation workspace')
    } finally {
      setLoadingDashboard(false)
    }
  }

  const loadTasks = async (orgId: string) => {
    if (!orgId) return
    setLoadingTasks(true)
    try {
      const data = await api.get('/tasks', { params: { organisationId: orgId } }).then((r) => r.data)
      setAllTasks(Array.isArray(data) ? data : data?.items || [])
    } catch {
      setAllTasks([])
    } finally {
      setLoadingTasks(false)
    }
  }

  const loadJobs = async (orgId: string) => {
    if (!orgId) return
    setLoadingJobs(true)
    try {
      const data = await api.get('/jobs', { params: { organisationId: orgId, limit: 100 } }).then((r) => r.data)
      setAllJobs(Array.isArray(data) ? data : data?.items || [])
    } catch {
      setAllJobs([])
    } finally {
      setLoadingJobs(false)
    }
  }

  useEffect(() => {
    if (isSuperAdmin) loadPortfolio()
  }, [isSuperAdmin])

  useEffect(() => {
    if (isSuperAdmin && selectedOrgId) {
      loadDashboard(selectedOrgId)
      setSubView(null)
      setTab('overview')
    }
  }, [isSuperAdmin, selectedOrgId])

  useEffect(() => {
    if (tab === 'tasks' && selectedOrgId) loadTasks(selectedOrgId)
    if (tab === 'jobs' && selectedOrgId) loadJobs(selectedOrgId)
  }, [tab, selectedOrgId])

  useEffect(() => {
    if (!showCreate || ownerQuery.trim().length < 2) return setOwnerResults([])
    const handle = window.setTimeout(async () => {
      try {
        const data = await api.get('/organisations/search-users', { params: { q: ownerQuery } }).then((r) => r.data)
        setOwnerResults(Array.isArray(data) ? data : [])
      } catch { setOwnerResults([]) }
    }, 250)
    return () => window.clearTimeout(handle)
  }, [showCreate, ownerQuery])

  useEffect(() => {
    if (!selectedOrgId || peopleSearch.trim().length < 2) return setPeopleResults([])
    const handle = window.setTimeout(async () => {
      try {
        const data = await api.get('/organisations/search-users', { params: { q: peopleSearch } }).then((r) => r.data)
        setPeopleResults(Array.isArray(data) ? data : [])
      } catch { setPeopleResults([]) }
    }, 250)
    return () => window.clearTimeout(handle)
  }, [peopleSearch, selectedOrgId])

  const refreshAll = async () => {
    await loadPortfolio(selectedOrgId)
    if (selectedOrgId) await loadDashboard(selectedOrgId)
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!createForm.name.trim()) return toast.error('Organisation name is required')
    setCreating(true)
    try {
      const payload: any = { ...createForm, ...(owner?.id ? { ownerId: owner.id } : {}) }
      const created = await api.post('/organisations', payload).then((r) => r.data)
      toast.success(`${created?.name || createForm.name} created`)
      setShowCreate(false)
      setCreateForm(emptyOrg())
      setOwnerQuery('')
      setOwnerResults([])
      setOwner(null)
      await loadPortfolio(created?.id)
      if (created?.id) { setSelectedOrgId(created.id); setActiveOrg(created.id, created.name || createForm.name) }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to create organisation')
    } finally {
      setCreating(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!selectedOrgId) return
    setSaving(true)
    try {
      await api.patch(`/organisations/${selectedOrgId}`, profileForm)
      toast.success('Organisation updated')
      await refreshAll()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to update organisation')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleOrg = async () => {
    if (!dashboard?.org?.id) return
    try {
      await api.patch(`/organisations/${dashboard.org.id}/${dashboard.org.isActive === false ? 'activate' : 'deactivate'}`)
      toast.success(dashboard.org.isActive === false ? 'Organisation reactivated' : 'Organisation deactivated')
      await refreshAll()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to update organisation status')
    }
  }

  const handleAssignPrimaryAdmin = async (userId: string) => {
    if (!selectedOrgId) return
    try {
      await api.patch(`/organisations/${selectedOrgId}/primary-admin`, { userId })
      toast.success('Primary admin updated')
      await refreshAll()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to assign primary admin')
    }
  }

  const handleAttachUser = async (candidate: any, role = attachRole) => {
    if (!selectedOrgId) return
    try {
      await api.post(`/organisations/${selectedOrgId}/members/${candidate.id}`, { role })
      toast.success(`${candidate.name} attached to organisation`)
      setPeopleSearch('')
      setPeopleResults([])
      await refreshAll()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to attach user')
    }
  }

  const handleAttachAndAssign = async (candidate: any) => {
    await handleAttachUser(candidate, 'admin')
    await handleAssignPrimaryAdmin(candidate.id)
  }

  const handleInvite = async () => {
    if (!selectedOrgId || !invitePhone.trim()) return toast.error('Enter a phone number')
    try {
      const res = await api.post(`/organisations/${selectedOrgId}/invite`, { phone: invitePhone }).then((r) => r.data)
      toast.success(res?.message || 'Invitation sent')
      setInvitePhone('')
      await refreshAll()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to invite user')
    }
  }

  const handleToggleMember = async (member: any) => {
    try {
      if (member.isActive === false) {
        await activateUser(member.id)
        toast.success(`${member.name} reactivated`)
      } else {
        await deactivateUser(member.id)
        toast.success(`${member.name} deactivated`)
      }
      await refreshAll()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to update user')
    }
  }

  const handleRemoveMember = async (member: any) => {
    if (!selectedOrgId || !member.agentId) return
    if (!window.confirm(`Remove ${member.name} from this organisation?`)) return
    try {
      await api.delete(`/organisations/${selectedOrgId}/members/${member.agentId}`)
      toast.success(`${member.name} removed`)
      await refreshAll()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to remove member')
    }
  }

  const openMemberDrawer = async (member: any) => {
    setMemberDrawer(member)
    setMemberRoleEdit(member.role || '')
    setMemberVerification(null)
    try {
      const v = await api.get(`/verification/user/${member.id}`).then((r) => r.data)
      setMemberVerification(v)
    } catch {
      setMemberVerification(null)
    }
  }

  const handleSaveMemberRole = async () => {
    if (!selectedOrgId || !memberDrawer || memberRoleEdit === memberDrawer.role) return
    setSavingRole(true)
    try {
      await api.post(`/organisations/${selectedOrgId}/members/${memberDrawer.id}`, { role: memberRoleEdit })
      toast.success(`Role updated to ${roleLabel(memberRoleEdit)}`)
      setMemberDrawer((d: any) => ({ ...d, role: memberRoleEdit }))
      await refreshAll()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to update role')
    } finally {
      setSavingRole(false)
    }
  }

  const handleDrawerToggleMember = async (member: any) => {
    await handleToggleMember(member)
    setMemberDrawer((d: any) => d ? { ...d, isActive: !d.isActive } : d)
  }

  const openTaskSubView = (task: any) => {
    setSubView({ type: 'task', data: task })
    setTaskStatusEdit(task.status || '')
  }

  const openJobSubView = (job: any) => {
    setSubView({ type: 'job', data: job })
  }

  const handleSaveTaskStatus = async () => {
    if (!subView || subView.type !== 'task' || taskStatusEdit === subView.data.status) return
    setSavingTaskStatus(true)
    try {
      await api.patch(`/tasks/${subView.data.id}`, { status: taskStatusEdit })
      toast.success('Task status updated')
      setSubView((sv) => sv ? { ...sv, data: { ...sv.data, status: taskStatusEdit } } : sv)
      setAllTasks((tasks) => tasks.map((t) => t.id === subView.data.id ? { ...t, status: taskStatusEdit } : t))
      await refreshAll()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to update task')
    } finally {
      setSavingTaskStatus(false)
    }
  }

  const handleUploadOrgDoc = async (docType: string, file: File) => {
    if (!selectedOrgId || !file) return
    const fieldMap: Record<string, string> = {
      kra_doc: 'kraDocUrl',
      business_reg_doc: 'businessRegDocUrl',
      tax_compliance_doc: 'taxComplianceDocUrl',
    }
    const orgField = fieldMap[docType]
    if (!orgField) return
    setUploadingDoc(docType)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await api.post(`/upload/org-document?docType=${docType}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data)
      await api.patch(`/organisations/${selectedOrgId}`, { [orgField]: res.url })
      setDocUrls((prev) => ({ ...prev, [orgField]: res.url }))
      toast.success('Document uploaded successfully')
      await refreshAll()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to upload document')
    } finally {
      setUploadingDoc(null)
    }
  }

  // ── Filter helpers ──────────────────────────────────────────────────────────

  const filteredDirectory = directory
    .filter((org) => {
      const q = search.trim().toLowerCase()
      const risk = riskOf(org.health?.summary)
      const subStatus = org.subscription?.status || 'trial'
      const matchesSearch = !q || org.name?.toLowerCase().includes(q) || org.industry?.toLowerCase().includes(q) || org.county?.toLowerCase().includes(q) || org.primaryAdmin?.name?.toLowerCase().includes(q)
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' && org.isActive !== false) || (statusFilter === 'inactive' && org.isActive === false) || subStatus === statusFilter
      const matchesPlan = planFilter === 'all' || (org.subscription?.plan || 'free') === planFilter
      const matchesRisk = riskFilter === 'all' || (riskFilter === 'healthy' && risk.score === 0) || (riskFilter === 'monitor' && risk.score === 1) || (riskFilter === 'attention' && risk.score === 2) || (riskFilter === 'critical' && risk.score === 3)
      return matchesSearch && matchesStatus && matchesPlan && matchesRisk
    })
    .sort((a, b) => {
      const risk = riskOf(b.health?.summary).score - riskOf(a.health?.summary).score
      return risk || String(a.name || '').localeCompare(String(b.name || ''))
    })

  const filteredTasks = allTasks.filter((t) => {
    const q = taskSearch.trim().toLowerCase()
    const matchesSearch = !q || t.title?.toLowerCase().includes(q) || t.agentName?.toLowerCase().includes(q)
    const matchesStatus = taskStatusFilter === 'all' || t.status === taskStatusFilter
    return matchesSearch && matchesStatus
  })

  const filteredJobs = allJobs.filter((j) => {
    const q = jobSearch.trim().toLowerCase()
    const matchesSearch = !q || j.title?.toLowerCase().includes(q) || j.category?.toLowerCase().includes(q)
    const matchesStatus = jobStatusFilter === 'all' || j.status === jobStatusFilter
    return matchesSearch && matchesStatus
  })

  // ── Guard ───────────────────────────────────────────────────────────────────

  if (!isSuperAdmin) {
    return (
      <div className="fade-in">
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <Crown size={36} style={{ color: 'var(--danger)', margin: '0 auto 12px' }} />
          <div style={{ fontWeight: 700 }}>Super admin access required</div>
          <p style={{ fontSize: 13, color: 'var(--text-4)', marginTop: 6 }}>This workspace is reserved for platform-wide organisation management.</p>
        </div>
      </div>
    )
  }

  // ── Sub-view: Task detail page ──────────────────────────────────────────────

  const renderTaskSubView = () => {
    if (!subView || subView.type !== 'task') return null
    const task = subView.data
    return (
      <div className="fade-in" style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost" onClick={() => { setSubView(null) }}>
            <ArrowLeft size={14} /> Back to tasks
          </button>
          <span style={{ color: 'var(--text-4)', fontSize: 13 }}>/</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{task.title}</span>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>{task.title}</h2>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <span className={`badge ${TASK_STATUS_BADGE[task.status] || 'badge-gray'}`}>{task.status?.replace('_', ' ')}</span>
                {task.priority && <span className={`badge ${task.priority === 'high' ? 'badge-red' : task.priority === 'medium' ? 'badge-amber' : 'badge-gray'}`}>{task.priority}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select className="inp" style={{ width: 160 }} value={taskStatusEdit} onChange={(e) => setTaskStatusEdit(e.target.value)}>
                {['pending', 'in_progress', 'completed', 'failed', 'cancelled'].map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
              <button className="btn btn-primary" disabled={savingTaskStatus || taskStatusEdit === task.status} onClick={handleSaveTaskStatus}>
                {savingTaskStatus ? 'Saving...' : 'Update status'}
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 24 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>Task details</div>
              <div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                  <span style={{ color: 'var(--text-4)' }}>Due date</span><span style={{ fontWeight: 600 }}>{fmt(task.dueAt, true)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                  <span style={{ color: 'var(--text-4)' }}>Assigned to</span><span style={{ fontWeight: 600 }}>{task.agentName || 'Unassigned'}</span>
                </div>
                {task.locationName && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                    <span style={{ color: 'var(--text-4)' }}>Location</span><span>{task.locationName}</span>
                  </div>
                )}
                {task.xpReward != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                    <span style={{ color: 'var(--text-4)' }}>XP reward</span><span>{task.xpReward} XP</span>
                  </div>
                )}
                {task.createdAt && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-4)' }}>Created</span><span>{fmt(task.createdAt, true)}</span>
                  </div>
                )}
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>Description</div>
              {task.description ? (
                <div style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--surface)', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7 }}>
                  {task.description}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--text-4)' }}>No description provided.</div>
              )}

              {(task.completionPhotos?.length > 0) && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Completion photos</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {task.completionPhotos.map((url: string, i: number) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer">
                        <img src={url} alt={`Photo ${i + 1}`} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Sub-view: Job detail page ───────────────────────────────────────────────

  const renderJobSubView = () => {
    if (!subView || subView.type !== 'job') return null
    const job = subView.data
    return (
      <div className="fade-in" style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost" onClick={() => setSubView(null)}>
            <ArrowLeft size={14} /> Back to jobs
          </button>
          <span style={{ color: 'var(--text-4)', fontSize: 13 }}>/</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{job.title}</span>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>{job.title}</h2>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <span className={`badge ${STATUS_BADGE[job.status] || 'badge-gray'}`}>{job.status}</span>
                {job.category && <span className="badge badge-blue">{job.category}</span>}
                {job.isUrgent && <span className="badge badge-red">Urgent</span>}
              </div>
            </div>
            <a href="/jobs" className="btn btn-ghost"><ExternalLink size={14} /> View on Jobs page</a>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 24 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>Job details</div>
              <div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
                {[
                  { label: 'Budget', value: job.budget != null ? money(job.budget) : '—' },
                  { label: 'County', value: job.county || '—' },
                  { label: 'Applications', value: job.applicantCount ?? job.applicationCount ?? 0 },
                  { label: 'Expires', value: fmt(job.expiresAt) },
                  { label: 'Posted', value: fmt(job.createdAt, true) },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                    <span style={{ color: 'var(--text-4)' }}>{label}</span><span style={{ fontWeight: 600 }}>{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>Description</div>
              {job.description ? (
                <div style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--surface)', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7 }}>
                  {job.description}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--text-4)' }}>No description provided.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Main render ─────────────────────────────────────────────────────────────

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Manage Organisations</h1>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 2 }}>
            Super-admin control room for tenant health, ownership, billing, compliance, and recovery actions.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={refreshAll} className="btn btn-ghost" style={{ gap: 5 }}><RefreshCw size={13} /> Refresh</button>
          <button onClick={() => setShowCreate(true)} className="btn btn-primary"><Plus size={14} /> New organisation</button>
        </div>
      </div>

      {overview && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 12, marginBottom: 16 }}>
          <Metric label="Organisations" value={overview.summary?.totalOrgs || 0} icon={<Building2 size={18} />} color="var(--text-1)" />
          <Metric label="Paying orgs" value={overview.summary?.payingOrgs || 0} icon={<Wallet size={18} />} color="var(--green)" />
          <Metric label="Members" value={overview.summary?.totalMembers || 0} icon={<Users size={18} />} color="var(--info)" />
          <Metric label="Agents in field" value={overview.summary?.checkedInAgents || 0} icon={<Activity size={18} />} color="var(--accent)" />
          <Metric label="Outstanding" value={money(overview.summary?.outstandingKes)} icon={<Clock size={18} />} color="var(--danger)" />
          <Metric label="Health alerts" value={overview.summary?.healthAlerts || 0} icon={<AlertCircle size={18} />} color="#D97706" />
        </div>
      )}

      {/* ── Card grid (no org selected) ──────────────────────────────── */}
      {!selectedOrgId && (
        <div>
          {/* Filters row */}
          <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
            <div style={{ position:'relative', flex:1, minWidth:220 }}>
              <Search size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-4)' }} />
              <input className="inp" placeholder="Search name, county, admin..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft:30 }} />
            </div>
            <select className="inp" style={{ width:140 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All status</option><option value="active">Active</option>
              <option value="inactive">Inactive</option><option value="trial">Trial</option><option value="past_due">Past due</option>
            </select>
            <select className="inp" style={{ width:130 }} value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}>
              <option value="all">All plans</option><option value="free">Free</option>
              <option value="starter">Starter</option><option value="growth">Growth</option>
              <option value="scale">Scale</option><option value="enterprise">Enterprise</option>
            </select>
            <select className="inp" style={{ width:160 }} value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
              <option value="all">All health states</option><option value="critical">Critical</option>
              <option value="attention">Attention</option><option value="monitor">Monitor</option><option value="healthy">Healthy</option>
            </select>
          </div>

          {loading ? (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 }}>
              {[1,2,3,4].map(i => <div key={i} className="card" style={{ padding:20, height:160, opacity:0.5 }} />)}
            </div>
          ) : filteredDirectory.length === 0 ? (
            <div className="card empty-state">
              <Building2 size={40} style={{ color:'var(--text-4)' }} />
              <div style={{ fontWeight:700 }}>No organisations match filters</div>
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 }}>
              {filteredDirectory.map((org) => {
                const risk = riskOf(org.health?.summary)
                return (
                  <button key={org.id} type="button"
                    onClick={() => { setSelectedOrgId(org.id); setActiveOrg(org.id, org.name); setTab('overview'); setSubView(null) }}
                    style={{
                      textAlign:'left', cursor:'pointer', padding:0, border:'none', background:'none',
                      transition:'transform 0.15s, box-shadow 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform='translateY(-3px)'; e.currentTarget.style.boxShadow='0 8px 24px rgba(0,0,0,0.14)' }}
                    onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='' }}>
                    <div className="card" style={{ padding:18, height:'100%', display:'flex', flexDirection:'column', gap:10 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:38, height:38, borderRadius:10, background:'var(--green-pale)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                            <Building2 size={18} style={{ color:'var(--green)' }} />
                          </div>
                          <div>
                            <div style={{ fontWeight:700, fontSize:14 }}>{org.name}</div>
                            <div style={{ fontSize:11, color:'var(--text-4)', marginTop:2 }}>
                              {[org.industry, org.county].filter(Boolean).join(' • ') || '—'}
                            </div>
                          </div>
                        </div>
                        <span className={`badge ${STATUS_BADGE[org.isActive === false ? 'inactive' : 'active']}`}>
                          {org.isActive === false ? 'Inactive' : 'Active'}
                        </span>
                      </div>

                      <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                        <span className={`badge ${PLAN_BADGE[org.subscription?.plan || 'free'] || 'badge-gray'}`}>
                          {org.subscription?.plan || 'free'}
                        </span>
                        <span className={`badge ${STATUS_BADGE[org.subscription?.status || 'trial'] || 'badge-gray'}`}>
                          {org.subscription?.status || 'trial'}
                        </span>
                        <span className={`badge ${risk.badge}`}>{risk.label}</span>
                      </div>

                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:'auto', paddingTop:8, borderTop:'1px solid var(--border)' }}>
                        <div style={{ fontSize:11, color:'var(--text-3)' }}>
                          <div style={{ fontWeight:600, color:'var(--text-2)', fontSize:14 }}>{org.stats?.totalMembers || 0}</div>
                          Members
                        </div>
                        <div style={{ fontSize:11, color:'var(--text-3)' }}>
                          <div style={{ fontWeight:600, color:'var(--accent)', fontSize:14 }}>{org.stats?.agentsInField || 0}</div>
                          In field
                        </div>
                      </div>

                      <div style={{ fontSize:11, color:'var(--text-4)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                        <span>{org.primaryAdmin?.name ? `Admin: ${org.primaryAdmin.name}` : 'No admin assigned'}</span>
                        <ChevronRight size={13} style={{ color:'var(--text-4)' }} />
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Detail view (org selected) ───────────────────────────────── */}
      {selectedOrgId && (
        <div>
          {/* Back navigation */}
          <button onClick={() => { setSelectedOrgId(''); setDashboard(null); setSubView(null); clearActiveOrg() }}
            className="btn btn-ghost" style={{ marginBottom:16, gap:6 }}>
            <ArrowLeft size={14} /> All Organisations
          </button>
        <div>
          {!selectedOrgId ? (
            <div className="card" style={{ padding: 40, textAlign: 'center' }}><Building2 size={36} style={{ color: 'var(--text-4)', margin: '0 auto 12px' }} /><div style={{ fontWeight: 700 }}>Select an organisation</div></div>
          ) : loadingDashboard ? (
            <div className="card" style={{ padding: 40, textAlign: 'center' }}><RefreshCw size={22} className="spin" style={{ color: 'var(--green)', margin: '0 auto 12px' }} /><div style={{ fontWeight: 700 }}>Loading workspace</div></div>
          ) : !dashboard ? (
            <div className="card" style={{ padding: 40, textAlign: 'center' }}>
              <AlertCircle size={28} style={{ color: 'var(--danger)', margin: '0 auto 12px' }} />
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Failed to load workspace</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>The organisation dashboard could not be loaded.</div>
              <button className="btn btn-primary" style={{ margin: '0 auto' }} onClick={() => loadDashboard(selectedOrgId)}><RefreshCw size={13} /> Retry</button>
            </div>
          ) : (
            <>
              {/* Org header */}
              <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                      <span className={`badge ${STATUS_BADGE[dashboard.org?.isActive === false ? 'inactive' : 'active']}`}>{dashboard.org?.isActive === false ? 'Inactive' : 'Active'}</span>
                      <span className={`badge ${PLAN_BADGE[dashboard.billing?.subscription?.plan || 'free'] || 'badge-gray'}`}>{dashboard.billing?.subscription?.plan || 'free'}</span>
                      <span className={`badge ${STATUS_BADGE[dashboard.billing?.subscription?.status || 'trial'] || 'badge-gray'}`}>{dashboard.billing?.subscription?.status || 'trial'}</span>
                      <span className={`badge ${riskOf(dashboard.health?.summary).badge}`}>{riskOf(dashboard.health?.summary).label}</span>
                    </div>
                    <h2 style={{ fontSize: 22, fontWeight: 800 }}>{dashboard.org?.name}</h2>
                    <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>{[dashboard.org?.industry, dashboard.org?.county].filter(Boolean).join(' • ') || 'Organisation profile still needs more detail'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost" onClick={() => { setSubView(null); setTab('compliance') }}><Edit2 size={14} /> Edit profile</button>
                    <button className={`btn ${dashboard.org?.isActive === false ? 'btn-primary' : 'btn-ghost'}`} style={dashboard.org?.isActive === false ? undefined : { color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={handleToggleOrg}>
                      {dashboard.org?.isActive === false ? <><CheckCircle size={14} /> Reactivate</> : <><AlertCircle size={14} /> Deactivate</>}
                    </button>
                    <button className="btn btn-ghost" onClick={() => loadDashboard(selectedOrgId)}><RefreshCw size={14} /> Refresh</button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginTop: 18 }}>
                  <Metric label="Members" value={dashboard.stats?.totalMembers || 0} icon={<Users size={16} />} color="var(--text-1)" />
                  <Metric label="Agents in field" value={dashboard.stats?.agentsInField || 0} icon={<Activity size={16} />} color="var(--green)" />
                  <Metric label="Outstanding" value={money(dashboard.billing?.outstandingKes)} icon={<Wallet size={16} />} color="var(--danger)" />
                  <Metric label="Alerts" value={dashboard.health?.summary?.total || 0} icon={<Shield size={16} />} color="var(--info)" />
                </div>
              </div>

              {/* Tabs */}
              {!subView && (
                <div className="tabs">
                  {(['overview', 'people', 'tasks', 'jobs', 'billing', 'compliance', 'activity'] as TabId[]).map((id) => (
                    <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
                      {id === 'people' ? `people (${dashboard.people?.members?.length || 0})` :
                       id === 'tasks' ? <><ListChecks size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />tasks</> :
                       id === 'jobs' ? <><Briefcase size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />jobs</> :
                       id}
                    </button>
                  ))}
                </div>
              )}

              {/* Sub-view: task or job full page */}
              {subView?.type === 'task' && renderTaskSubView()}
              {subView?.type === 'job' && renderJobSubView()}

              {/* ── Overview tab ── */}
              {!subView && tab === 'overview' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 16 }}>
                  <div className="card" style={{ padding: 18 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Health alerts</div>
                    {(dashboard.health?.items || []).length === 0 ? (
                      <div style={{ padding: 16, textAlign: 'center', color: 'var(--green)' }}>
                        <CheckCircle size={20} style={{ margin: '0 auto 8px' }} />No active health alerts
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: 10 }}>
                        {(dashboard.health?.items || []).map((item: any) => (
                          <div key={item.code} style={{ padding: '12px 14px', borderRadius: 10, background: item.level === 'critical' ? 'rgba(239,68,68,0.08)' : item.level === 'warning' ? 'rgba(245,158,11,0.10)' : 'rgba(59,130,246,0.08)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                              <div>
                                <div style={{ fontWeight: 700, fontSize: 13 }}>{item.title}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{item.description}</div>
                              </div>
                              <span className={`badge ${item.level === 'critical' ? 'badge-red' : item.level === 'warning' ? 'badge-amber' : 'badge-blue'}`}>{item.level}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'grid', gap: 16 }}>
                    <div className="card" style={{ padding: 18 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Fast actions</div>
                      <label className="lbl">Invite by phone</label>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                        <input className="inp" placeholder="0712 345 678" value={invitePhone} onChange={(e) => setInvitePhone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleInvite()} />
                        <button className="btn btn-primary" onClick={handleInvite}><Phone size={14} /> Invite</button>
                      </div>
                      <label className="lbl">Find user to add or promote</label>
                      <div style={{ position: 'relative' }}>
                        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)' }} />
                        <input className="inp" placeholder="Search name, phone, email..." value={peopleSearch} onChange={(e) => setPeopleSearch(e.target.value)} style={{ paddingLeft: 30 }} />
                      </div>
                      {peopleSearch.trim().length >= 2 && (
                        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                          {peopleResults.slice(0, 4).map((candidate: any) => (
                            <div key={candidate.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: 13 }}>{candidate.name}</div>
                                  <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 4 }}>{[candidate.phone, candidate.email].filter(Boolean).join(' • ')}</div>
                                </div>
                                <div style={{ display: 'grid', gap: 6 }}>
                                  {candidate.organisationId === selectedOrgId ? (
                                    <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => handleAssignPrimaryAdmin(candidate.id)}><Crown size={12} /> Make admin</button>
                                  ) : (
                                    <>
                                      <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => handleAttachUser(candidate, 'admin')}><UserPlus size={12} /> Add as admin</button>
                                      <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => handleAttachAndAssign(candidate)}><Crown size={12} /> Add and assign</button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="card" style={{ padding: 18 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Work summary</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {[
                          { label: 'Tasks total', value: dashboard.work?.tasks?.total || 0, onClick: () => { setTab('tasks'); loadTasks(selectedOrgId) } },
                          { label: 'Overdue tasks', value: dashboard.work?.tasks?.overdue || 0, onClick: () => { setTab('tasks'); loadTasks(selectedOrgId) } },
                          { label: 'Jobs posted', value: dashboard.work?.jobs?.total || 0, onClick: () => { setTab('jobs'); loadJobs(selectedOrgId) } },
                          { label: 'Applications', value: dashboard.work?.jobs?.applications || 0, onClick: () => { setTab('jobs'); loadJobs(selectedOrgId) } },
                        ].map((item) => (
                          <button key={item.label} type="button" onClick={item.onClick} style={{ background: 'var(--surface)', borderRadius: 10, padding: '12px 14px', textAlign: 'left', border: '1px solid transparent', cursor: 'pointer' }}
                            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'transparent')}>
                            <div style={{ fontSize: 18, fontWeight: 800 }}>{item.value}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-4)' }}>{item.label}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── People tab ── */}
              {!subView && tab === 'people' && (
                <div style={{ display: 'grid', gap: 16 }}>
                  <div className="card" style={{ padding: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>Attach, move, or promote platform users</div>
                        <div style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 3 }}>Search across the entire platform and attach the user with the right role.</div>
                      </div>
                      <select className="inp" style={{ width: 180 }} value={attachRole} onChange={(e) => setAttachRole(e.target.value)}>
                        {ATTACHABLE_ROLES.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
                      </select>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)' }} />
                      <input className="inp" placeholder="Search platform users..." value={peopleSearch} onChange={(e) => setPeopleSearch(e.target.value)} style={{ paddingLeft: 30 }} />
                    </div>
                    {peopleSearch.trim().length >= 2 && (
                      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                        {peopleResults.map((candidate: any) => (
                          <div key={candidate.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
                              <div>
                                <div style={{ fontWeight: 700, fontSize: 13 }}>{candidate.name}</div>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                                  <span className={`badge ${ROLE_BADGE[candidate.role] || 'badge-gray'}`}>{roleLabel(candidate.role)}</span>
                                  {candidate.organisationId === selectedOrgId ? <span className="badge badge-green">Current member</span> : candidate.organisationId ? <span className="badge badge-amber">In another org</span> : <span className="badge badge-gray">Unassigned</span>}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {candidate.organisationId === selectedOrgId ? (
                                  <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => handleAssignPrimaryAdmin(candidate.id)}><Crown size={12} /> Make admin</button>
                                ) : (
                                  <>
                                    <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => handleAttachUser(candidate)}><UserPlus size={12} /> Attach</button>
                                    <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => handleAttachUser(candidate, 'admin')}><Shield size={12} /> Add as admin</button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="card" style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>Current members</div>
                        <div style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 3 }}>{dashboard.people?.members?.length || 0} users • {dashboard.people?.activeMembers || 0} active</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {Object.entries(dashboard.people?.byRole || {}).map(([role, count]) => (
                          <span key={role} className={`badge ${ROLE_BADGE[role] || 'badge-gray'}`}>{roleLabel(role)} × {String(count)}</span>
                        ))}
                      </div>
                    </div>
                    <table className="data-table">
                      <thead>
                        <tr><th>Member</th><th>Role</th><th>Phone</th><th>Last login</th><th>Status</th><th style={{ width: 220 }}>Actions</th></tr>
                      </thead>
                      <tbody>
                        {(dashboard.people?.members || []).length === 0 ? (
                          <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--text-4)' }}>No members in this organisation yet.</td></tr>
                        ) : (
                          (dashboard.people?.members || []).map((member: any) => (
                            <tr key={member.id} style={{ cursor: 'pointer' }} onClick={() => openMemberDrawer(member)}>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div className="avatar avatar-sm avatar-green">{member.name?.[0] || '?'}</div>
                                  <div>
                                    <div style={{ fontWeight: 600, fontSize: 13 }}>{member.name}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-4)' }}>{member.email || member.username || 'No email'}</div>
                                  </div>
                                </div>
                              </td>
                              <td><span className={`badge ${ROLE_BADGE[member.role] || 'badge-gray'}`}>{roleLabel(member.role)}</span></td>
                              <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{member.phone || '—'}</td>
                              <td style={{ fontSize: 12, color: 'var(--text-4)' }}>{fmt(member.lastLoginAt, true)}</td>
                              <td><span className={`badge ${member.isActive === false ? 'badge-red' : 'badge-green'}`}>{member.isActive === false ? 'Inactive' : 'Active'}</span></td>
                              <td onClick={(e) => e.stopPropagation()}>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                  <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => openMemberDrawer(member)}><ChevronRight size={12} /> Manage</button>
                                  <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => handleAssignPrimaryAdmin(member.id)}><Crown size={12} /> Admin</button>
                                  <button className="btn btn-ghost" style={{ fontSize: 11, color: member.isActive === false ? 'var(--green)' : 'var(--danger)', borderColor: member.isActive === false ? 'var(--green)' : 'var(--danger)' }} onClick={() => handleToggleMember(member)}>
                                    {member.isActive === false ? <><UserPlus size={12} /> Reactivate</> : <><UserX size={12} /> Deactivate</>}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Tasks tab ── */}
              {!subView && tab === 'tasks' && (
                <div style={{ display: 'grid', gap: 16 }}>
                  <div className="card" style={{ padding: 16 }}>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 0 }}>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)' }} />
                        <input className="inp" placeholder="Search tasks..." value={taskSearch} onChange={(e) => setTaskSearch(e.target.value)} style={{ paddingLeft: 30 }} />
                      </div>
                      <select className="inp" style={{ width: 180 }} value={taskStatusFilter} onChange={(e) => setTaskStatusFilter(e.target.value)}>
                        <option value="all">All statuses</option>
                        {['pending', 'in_progress', 'completed', 'failed', 'cancelled'].map((s) => (
                          <option key={s} value={s}>{s.replace('_', ' ')}</option>
                        ))}
                      </select>
                      <button className="btn btn-ghost" onClick={() => loadTasks(selectedOrgId)}><RefreshCw size={13} /></button>
                    </div>
                  </div>

                  <div className="card" style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>All tasks</div>
                      <span style={{ fontSize: 12, color: 'var(--text-4)' }}>{filteredTasks.length} tasks</span>
                    </div>
                    {loadingTasks ? (
                      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-4)' }}><RefreshCw size={18} className="spin" style={{ margin: '0 auto 8px' }} /><div>Loading tasks...</div></div>
                    ) : (
                      <table className="data-table">
                        <thead>
                          <tr><th>Task</th><th>Assigned to</th><th>Status</th><th>Priority</th><th>Due</th><th style={{ width: 80 }}></th></tr>
                        </thead>
                        <tbody>
                          {filteredTasks.length === 0 ? (
                            <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--text-4)' }}>No tasks found for this organisation.</td></tr>
                          ) : filteredTasks.map((task: any) => (
                            <tr key={task.id} style={{ cursor: 'pointer' }} onClick={() => openTaskSubView(task)}>
                              <td>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{task.title}</div>
                                {task.locationName && <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>{task.locationName}</div>}
                              </td>
                              <td style={{ fontSize: 13 }}>{task.agentName || <span style={{ color: 'var(--text-4)' }}>Unassigned</span>}</td>
                              <td><span className={`badge ${TASK_STATUS_BADGE[task.status] || 'badge-gray'}`}>{task.status?.replace('_', ' ')}</span></td>
                              <td>{task.priority ? <span className={`badge ${task.priority === 'high' ? 'badge-red' : task.priority === 'medium' ? 'badge-amber' : 'badge-gray'}`}>{task.priority}</span> : <span style={{ color: 'var(--text-4)', fontSize: 12 }}>—</span>}</td>
                              <td style={{ fontSize: 12, color: 'var(--text-4)' }}>{fmt(task.dueAt)}</td>
                              <td><ChevronRight size={14} style={{ color: 'var(--text-4)' }} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {/* ── Jobs tab ── */}
              {!subView && tab === 'jobs' && (
                <div style={{ display: 'grid', gap: 16 }}>
                  <div className="card" style={{ padding: 16 }}>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)' }} />
                        <input className="inp" placeholder="Search jobs..." value={jobSearch} onChange={(e) => setJobSearch(e.target.value)} style={{ paddingLeft: 30 }} />
                      </div>
                      <select className="inp" style={{ width: 180 }} value={jobStatusFilter} onChange={(e) => setJobStatusFilter(e.target.value)}>
                        <option value="all">All statuses</option>
                        {['open', 'closed', 'filled', 'draft'].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      <button className="btn btn-ghost" onClick={() => loadJobs(selectedOrgId)}><RefreshCw size={13} /></button>
                    </div>
                  </div>

                  <div className="card" style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>All jobs</div>
                      <span style={{ fontSize: 12, color: 'var(--text-4)' }}>{filteredJobs.length} jobs</span>
                    </div>
                    {loadingJobs ? (
                      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-4)' }}><RefreshCw size={18} className="spin" style={{ margin: '0 auto 8px' }} /><div>Loading jobs...</div></div>
                    ) : (
                      <table className="data-table">
                        <thead>
                          <tr><th>Job</th><th>Category</th><th>Budget</th><th>Applications</th><th>Status</th><th>Expires</th><th style={{ width: 80 }}></th></tr>
                        </thead>
                        <tbody>
                          {filteredJobs.length === 0 ? (
                            <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--text-4)' }}>No jobs posted by this organisation.</td></tr>
                          ) : filteredJobs.map((job: any) => (
                            <tr key={job.id} style={{ cursor: 'pointer' }} onClick={() => openJobSubView(job)}>
                              <td>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{job.title}</div>
                                {job.county && <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>{job.county}</div>}
                              </td>
                              <td style={{ fontSize: 12 }}>{job.category || '—'}</td>
                              <td style={{ fontSize: 13, fontWeight: 600 }}>{job.budget != null ? money(job.budget) : '—'}</td>
                              <td style={{ fontSize: 13 }}>{job.applicantCount ?? job.applicationCount ?? 0}</td>
                              <td><span className={`badge ${STATUS_BADGE[job.status] || 'badge-gray'}`}>{job.status}</span></td>
                              <td style={{ fontSize: 12, color: 'var(--text-4)' }}>{fmt(job.expiresAt)}</td>
                              <td><ChevronRight size={14} style={{ color: 'var(--text-4)' }} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {/* ── Billing tab ── */}
              {!subView && tab === 'billing' && (
                <div style={{ display: 'grid', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
                    <Metric label="Plan" value={(dashboard.billing?.subscription?.plan || 'free').replace('_', ' ')} icon={<Wallet size={16} />} color="var(--green)" />
                    <Metric label="Subscription status" value={(dashboard.billing?.subscription?.status || 'trial').replace('_', ' ')} icon={<Clock size={16} />} color="var(--info)" />
                    <Metric label="Paid to date" value={money(dashboard.billing?.paidKes)} icon={<CheckCircle size={16} />} color="var(--green)" />
                    <Metric label="Outstanding" value={money(dashboard.billing?.outstandingKes)} icon={<AlertCircle size={16} />} color="var(--danger)" />
                  </div>
                  <div className="card" style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>Recent invoices</div>
                    <table className="data-table">
                      <thead><tr><th>Invoice</th><th>Plan</th><th>Amount</th><th>Status</th><th>Due date</th><th>Paid at</th></tr></thead>
                      <tbody>
                        {(dashboard.billing?.recentInvoices || []).length === 0 ? (
                          <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--text-4)' }}>No invoices recorded yet.</td></tr>
                        ) : (
                          (dashboard.billing?.recentInvoices || []).map((invoice: any) => (
                            <tr key={invoice.id}>
                              <td><div style={{ fontWeight: 600, fontSize: 13 }}>{invoice.invoiceNumber}</div><div style={{ fontSize: 10, color: 'var(--text-4)' }}>{invoice.paymentMethod || 'payment pending'}</div></td>
                              <td style={{ textTransform: 'capitalize' }}>{invoice.plan}</td>
                              <td style={{ fontWeight: 700, color: 'var(--green)' }}>{money(invoice.amountKes)}</td>
                              <td><span className={`badge ${STATUS_BADGE[invoice.status] || 'badge-gray'}`}>{invoice.status}</span></td>
                              <td style={{ fontSize: 12, color: 'var(--text-4)' }}>{fmt(invoice.dueDate)}</td>
                              <td style={{ fontSize: 12, color: 'var(--text-4)' }}>{fmt(invoice.paidAt)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Compliance tab ── */}
              {!subView && tab === 'compliance' && (
                <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0,1fr)', gap: 16 }}>
                  <div style={{ display: 'grid', gap: 16 }}>
                    <div className="card" style={{ padding: 18 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Compliance score</div>
                      <div style={{ fontSize: 34, fontWeight: 900, color: (dashboard.compliance?.completionRate || 0) >= 90 ? 'var(--green)' : (dashboard.compliance?.completionRate || 0) >= 60 ? '#D97706' : 'var(--danger)' }}>
                        {dashboard.compliance?.completionRate || 0}%
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 6 }}>Profile, billing, tax, document uploads, and member identity verification.</div>
                    </div>

                    {dashboard.compliance?.agentKyc && dashboard.compliance.agentKyc.total > 0 && (
                      <div className="card" style={{ padding: 18 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                          <UserCheck size={15} style={{ color: 'var(--info)' }} />
                          <div style={{ fontWeight: 700, fontSize: 14 }}>Member identity verification</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginBottom: 8 }}>
                          <span style={{ fontSize: 26, fontWeight: 900, color: dashboard.compliance.agentKyc.rate === 100 ? 'var(--green)' : dashboard.compliance.agentKyc.rate >= 50 ? '#D97706' : 'var(--danger)' }}>
                            {dashboard.compliance.agentKyc.approved}
                          </span>
                          <span style={{ fontSize: 13, color: 'var(--text-3)' }}>/ {dashboard.compliance.agentKyc.total} verified</span>
                          <span style={{ fontSize: 12, color: 'var(--text-4)', marginLeft: 4 }}>({dashboard.compliance.agentKyc.rate}%)</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 4, background: dashboard.compliance.agentKyc.rate === 100 ? 'var(--green)' : '#D97706', width: `${dashboard.compliance.agentKyc.rate}%`, transition: 'width 0.4s' }} />
                        </div>
                        {dashboard.compliance.agentKyc.rate < 100 && (
                          <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 8 }}>
                            {dashboard.compliance.agentKyc.total - dashboard.compliance.agentKyc.approved} member(s) need identity verification.
                          </div>
                        )}
                        <button className="btn btn-ghost" style={{ fontSize: 11, marginTop: 10 }} onClick={() => setTab('people')}><Users size={12} /> Review members</button>
                      </div>
                    )}

                    {/* Compliance documents */}
                    <div className="card" style={{ padding: 18 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                        <FileText size={15} style={{ color: 'var(--info)' }} />
                        <div style={{ fontWeight: 700, fontSize: 14 }}>Compliance documents</div>
                      </div>
                      {/* Hidden file inputs */}
                      <input ref={kraRef} type="file" accept="image/jpeg,image/png,application/pdf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadOrgDoc('kra_doc', f); e.target.value = '' }} />
                      <input ref={bizRef} type="file" accept="image/jpeg,image/png,application/pdf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadOrgDoc('business_reg_doc', f); e.target.value = '' }} />
                      <input ref={taxRef} type="file" accept="image/jpeg,image/png,application/pdf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadOrgDoc('tax_compliance_doc', f); e.target.value = '' }} />

                      {[
                        { label: 'KRA PIN certificate', key: 'kraDocUrl', ref: kraRef, docType: 'kra_doc' },
                        { label: 'Business registration cert', key: 'businessRegDocUrl', ref: bizRef, docType: 'business_reg_doc' },
                        { label: 'Tax compliance certificate', key: 'taxComplianceDocUrl', ref: taxRef, docType: 'tax_compliance_doc' },
                      ].map(({ label, key, ref, docType }) => (
                        <div key={key} style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 10, background: 'var(--surface)', border: `1px solid ${docUrls[key] ? 'var(--green)' : 'var(--border)'}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
                              {docUrls[key] ? (
                                <a href={docUrls[key]} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--green)', textDecoration: 'none', marginTop: 3, display: 'block' }}>
                                  <ExternalLink size={10} style={{ verticalAlign: 'middle', marginRight: 3 }} />View document
                                </a>
                              ) : (
                                <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 3 }}>Not uploaded</div>
                              )}
                            </div>
                            <button className="btn btn-ghost" style={{ fontSize: 11, flexShrink: 0 }} disabled={uploadingDoc === docType} onClick={() => ref.current?.click()}>
                              {uploadingDoc === docType ? 'Uploading...' : docUrls[key] ? <><Upload size={11} /> Replace</> : <><Upload size={11} /> Upload</>}
                            </button>
                          </div>
                        </div>
                      ))}
                      <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 4 }}>Accepted: JPEG, PNG, PDF • Max 20 MB</div>
                    </div>

                    <div className="card" style={{ padding: 18 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Missing fields</div>
                      {(dashboard.compliance?.missingFields || []).length === 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--green)' }}>
                          <CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />All fields complete.
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gap: 8 }}>
                          {(dashboard.compliance?.missingFields || []).map((field: string) => (
                            <div key={field} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 8, background: 'var(--surface)', fontSize: 12 }}>
                              <AlertCircle size={13} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                              {field}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="card" style={{ padding: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>Organisation profile, tax, and billing records</div>
                        <div style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 3 }}>Keep these details complete so subscriptions, invoices, and compliance reporting stay reliable.</div>
                      </div>
                      <button className="btn btn-primary" onClick={handleSaveProfile} disabled={saving}>{saving ? 'Saving...' : <><CheckCircle size={14} /> Save changes</>}</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div><label className="lbl">Organisation name</label><input className="inp" value={profileForm.name} onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))} /></div>
                      <div><label className="lbl">Industry</label><select className="inp" value={profileForm.industry} onChange={(e) => setProfileForm((f) => ({ ...f, industry: e.target.value }))}><option value="">Select industry</option>{INDUSTRIES.map((industry) => <option key={industry} value={industry}>{industry}</option>)}</select></div>
                      <div><label className="lbl">County</label><input className="inp" value={profileForm.county} onChange={(e) => setProfileForm((f) => ({ ...f, county: e.target.value }))} /></div>
                      <div><label className="lbl">Address</label><input className="inp" value={profileForm.address} onChange={(e) => setProfileForm((f) => ({ ...f, address: e.target.value }))} /></div>
                      <div style={{ gridColumn: '1 / -1' }}><label className="lbl">Description</label><textarea className="inp" rows={3} style={{ resize: 'vertical' }} value={profileForm.description} onChange={(e) => setProfileForm((f) => ({ ...f, description: e.target.value }))} /></div>
                      <div><label className="lbl">Billing email</label><input className="inp" value={profileForm.billingEmail} onChange={(e) => setProfileForm((f) => ({ ...f, billingEmail: e.target.value }))} /></div>
                      <div><label className="lbl">Billing phone</label><input className="inp" value={profileForm.billingPhone} onChange={(e) => setProfileForm((f) => ({ ...f, billingPhone: e.target.value }))} /></div>
                      <div><label className="lbl">KRA PIN</label><input className="inp" value={profileForm.kraPin} onChange={(e) => setProfileForm((f) => ({ ...f, kraPin: e.target.value }))} /></div>
                      <div><label className="lbl">VAT number</label><input className="inp" value={profileForm.vatNumber} onChange={(e) => setProfileForm((f) => ({ ...f, vatNumber: e.target.value }))} /></div>
                      <div><label className="lbl">Business registration number</label><input className="inp" value={profileForm.businessRegNo} onChange={(e) => setProfileForm((f) => ({ ...f, businessRegNo: e.target.value }))} /></div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Activity tab ── */}
              {!subView && tab === 'activity' && (
                <div style={{ display: 'grid', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div className="card" style={{ padding: 18 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>Recent tasks</div>
                        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => { setTab('tasks'); loadTasks(selectedOrgId) }}><ListChecks size={12} /> See all</button>
                      </div>
                      {(dashboard.work?.tasks?.recent || []).length === 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--text-4)' }}>No recent task activity recorded.</div>
                      ) : (
                        <div style={{ display: 'grid', gap: 8 }}>
                          {(dashboard.work?.tasks?.recent || []).map((task: any) => (
                            <button key={task.id} type="button" onClick={() => { setTab('tasks'); openTaskSubView(task) }} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface)', border: '1px solid transparent', textAlign: 'left', cursor: 'pointer', width: '100%' }}
                              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'transparent')}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: 13 }}>{task.title}</div>
                                  <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 4 }}>Due {fmt(task.dueAt)} • {task.agentName || 'Unassigned'}</div>
                                </div>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                                  <span className={`badge ${TASK_STATUS_BADGE[task.status] || 'badge-gray'}`}>{task.status}</span>
                                  <ChevronRight size={13} style={{ color: 'var(--text-4)' }} />
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="card" style={{ padding: 18 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>Recent jobs</div>
                        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => { setTab('jobs'); loadJobs(selectedOrgId) }}><Briefcase size={12} /> See all</button>
                      </div>
                      {(dashboard.work?.jobs?.recent || []).length === 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--text-4)' }}>No recent marketplace jobs from this organisation.</div>
                      ) : (
                        <div style={{ display: 'grid', gap: 10 }}>
                          {(dashboard.work?.jobs?.recent || []).map((job: any) => (
                            <button key={job.id} type="button" onClick={() => { setTab('jobs'); openJobSubView(job) }} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface)', border: '1px solid transparent', textAlign: 'left', cursor: 'pointer', width: '100%' }}
                              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'transparent')}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: 13 }}>{job.title}</div>
                                  <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 4 }}>{job.category || 'General'} • {job.applicantCount || 0} applicants</div>
                                </div>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                                  <span className={`badge ${STATUS_BADGE[job.status] || 'badge-gray'}`}>{job.status}</span>
                                  <ChevronRight size={13} style={{ color: 'var(--text-4)' }} />
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="card" style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>Recent audit trail</div>
                    <table className="data-table">
                      <thead><tr><th>Action</th><th>Entity</th><th>User role</th><th>Time</th></tr></thead>
                      <tbody>
                        {(dashboard.recentActivity || []).length === 0 ? (
                          <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: 'var(--text-4)' }}>No recent audit activity captured.</td></tr>
                        ) : (
                          (dashboard.recentActivity || []).map((entry: any) => (
                            <tr key={entry.id}>
                              <td><div style={{ fontWeight: 600, fontSize: 13 }}>{entry.action}</div><div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 3 }}>{entry.entityId || '—'}</div></td>
                              <td style={{ fontSize: 12 }}>{entry.entity}</td>
                              <td><span className={`badge ${ROLE_BADGE[entry.userRole] || 'badge-gray'}`}>{roleLabel(entry.userRole)}</span></td>
                              <td style={{ fontSize: 12, color: 'var(--text-4)' }}>{fmt(entry.createdAt, true)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      )}

      {/* ── Member management drawer ─────────────────────────────────────── */}
      {memberDrawer && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setMemberDrawer(null) }} style={{ justifyContent: 'flex-end' }}>
          <div style={{ width: 420, maxWidth: '95vw', height: '100vh', background: 'var(--card)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="avatar avatar-green" style={{ width: 44, height: 44, fontSize: 18 }}>{memberDrawer.name?.[0] || '?'}</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{memberDrawer.name}</div>
                  <span className={`badge ${ROLE_BADGE[memberDrawer.role] || 'badge-gray'}`} style={{ marginTop: 4 }}>{roleLabel(memberDrawer.role)}</span>
                </div>
              </div>
              <button className="btn-icon" onClick={() => setMemberDrawer(null)}><X size={15} /></button>
            </div>

            <div style={{ padding: '18px 20px', display: 'grid', gap: 18, flex: 1 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Contact</div>
                <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-4)' }}>Email</span><span>{memberDrawer.email || '—'}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-4)' }}>Phone</span><span>{memberDrawer.phone || '—'}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-4)' }}>Status</span><span className={`badge ${memberDrawer.isActive === false ? 'badge-red' : 'badge-green'}`}>{memberDrawer.isActive === false ? 'Inactive' : 'Active'}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-4)' }}>Last login</span><span>{fmt(memberDrawer.lastLoginAt, true)}</span></div>
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Identity verification (KYC)</div>
                {memberVerification === null ? (
                  <div style={{ fontSize: 12, color: 'var(--text-4)' }}>Loading...</div>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: 'var(--text-4)' }}>Status</span>
                      <span className={`badge ${memberVerification.status === 'approved' ? 'badge-green' : memberVerification.status === 'rejected' ? 'badge-red' : memberVerification.status === 'submitted' ? 'badge-blue' : 'badge-gray'}`}>
                        {memberVerification.status === 'approved' ? '✓ Verified' : memberVerification.status === 'rejected' ? 'Rejected' : memberVerification.status === 'submitted' ? 'Under review' : 'Not submitted'}
                      </span>
                    </div>
                    {memberVerification.documentType && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: 'var(--text-4)' }}>Document</span>
                        <span>{memberVerification.documentType?.replace(/_/g, ' ')}</span>
                      </div>
                    )}
                    {memberVerification.faceMatchScore != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: 'var(--text-4)' }}>Face match</span>
                        <span style={{ color: memberVerification.faceMatchScore >= 85 ? 'var(--green)' : memberVerification.faceMatchScore >= 70 ? '#D97706' : 'var(--danger)' }}>
                          {Number(memberVerification.faceMatchScore).toFixed(1)}%
                        </span>
                      </div>
                    )}
                    {memberVerification.status === 'submitted' && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                        <button className="btn btn-primary" style={{ fontSize: 11, flex: 1 }} onClick={async () => {
                          try {
                            await api.patch(`/verification/${memberVerification.id}/approve`)
                            toast.success('Verification approved')
                            setMemberVerification((v: any) => ({ ...v, status: 'approved' }))
                            await refreshAll()
                          } catch (e: any) { toast.error(e?.response?.data?.message || 'Failed to approve') }
                        }}><FileCheck size={12} /> Approve</button>
                        <button className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--danger)', borderColor: 'var(--danger)', flex: 1 }} onClick={async () => {
                          const note = window.prompt('Rejection reason (required):')
                          if (!note?.trim()) return
                          try {
                            await api.patch(`/verification/${memberVerification.id}/reject`, { note })
                            toast.success('Verification rejected')
                            setMemberVerification((v: any) => ({ ...v, status: 'rejected' }))
                          } catch (e: any) { toast.error(e?.response?.data?.message || 'Failed to reject') }
                        }}><X size={12} /> Reject</button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Role in this organisation</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select className="inp" value={memberRoleEdit} onChange={(e) => setMemberRoleEdit(e.target.value)} style={{ flex: 1 }}>
                    {ATTACHABLE_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                  </select>
                  <button className="btn btn-primary" disabled={savingRole || memberRoleEdit === memberDrawer.role} onClick={handleSaveMemberRole} style={{ fontSize: 12 }}>
                    {savingRole ? '...' : 'Save'}
                  </button>
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Actions</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <button className="btn btn-ghost" style={{ justifyContent: 'flex-start' }} onClick={() => { handleAssignPrimaryAdmin(memberDrawer.id); setMemberDrawer(null) }}>
                    <Crown size={14} /> Make primary admin
                  </button>
                  <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', color: memberDrawer.isActive === false ? 'var(--green)' : 'var(--danger)', borderColor: memberDrawer.isActive === false ? 'var(--green)' : 'var(--danger)' }}
                    onClick={() => handleDrawerToggleMember(memberDrawer)}>
                    {memberDrawer.isActive === false ? <><UserPlus size={14} /> Reactivate account</> : <><UserX size={14} /> Deactivate account</>}
                  </button>
                  {memberDrawer.agentId && (
                    <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                      onClick={() => { handleRemoveMember(memberDrawer); setMemberDrawer(null) }}>
                      <Trash2 size={14} /> Remove from organisation
                    </button>
                  )}
                  <a href={`/agents?user=${memberDrawer.id}`} className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}>
                    <ExternalLink size={14} /> View in Agents page
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Create organisation modal ─────────────────────────────────────── */}
      {showCreate && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="modal">
            <div className="modal-header">
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700 }}>Create organisation</h2>
                <p style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 3 }}>Launch a new tenant with billing, compliance, and ownership ready from day one.</p>
              </div>
              <button className="btn-icon" onClick={() => setShowCreate(false)}><X size={15} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div><label className="lbl">Organisation name *</label><input className="inp" value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} /></div>
                <div><label className="lbl">Industry</label><select className="inp" value={createForm.industry} onChange={(e) => setCreateForm((f) => ({ ...f, industry: e.target.value }))}><option value="">Select industry</option>{INDUSTRIES.map((industry) => <option key={industry} value={industry}>{industry}</option>)}</select></div>
                <div><label className="lbl">County</label><input className="inp" value={createForm.county} onChange={(e) => setCreateForm((f) => ({ ...f, county: e.target.value }))} /></div>
                <div><label className="lbl">Address</label><input className="inp" value={createForm.address} onChange={(e) => setCreateForm((f) => ({ ...f, address: e.target.value }))} /></div>
                <div style={{ gridColumn: '1 / -1' }}><label className="lbl">Description</label><textarea className="inp" rows={3} style={{ resize: 'vertical' }} value={createForm.description} onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))} /></div>
                <div><label className="lbl">Billing email</label><input className="inp" value={createForm.billingEmail} onChange={(e) => setCreateForm((f) => ({ ...f, billingEmail: e.target.value }))} /></div>
                <div><label className="lbl">Billing phone</label><input className="inp" value={createForm.billingPhone} onChange={(e) => setCreateForm((f) => ({ ...f, billingPhone: e.target.value }))} /></div>
                <div><label className="lbl">KRA PIN</label><input className="inp" value={createForm.kraPin} onChange={(e) => setCreateForm((f) => ({ ...f, kraPin: e.target.value }))} /></div>
                <div><label className="lbl">VAT number</label><input className="inp" value={createForm.vatNumber} onChange={(e) => setCreateForm((f) => ({ ...f, vatNumber: e.target.value }))} /></div>
                <div style={{ gridColumn: '1 / -1' }}><label className="lbl">Business registration number</label><input className="inp" value={createForm.businessRegNo} onChange={(e) => setCreateForm((f) => ({ ...f, businessRegNo: e.target.value }))} /></div>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Optional: choose the primary admin now</div>
                <div style={{ position: 'relative' }}>
                  <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)' }} />
                  <input className="inp" placeholder="Search a platform user..." value={ownerQuery} onChange={(e) => setOwnerQuery(e.target.value)} style={{ paddingLeft: 30 }} />
                </div>
                {owner && (
                  <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--green-pale)', border: '1px solid var(--green)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{owner.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{[owner.phone, owner.email].filter(Boolean).join(' • ')}</div>
                      </div>
                      <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setOwner(null)}>Clear</button>
                    </div>
                  </div>
                )}
                {!owner && ownerQuery.trim().length >= 2 && (
                  <div style={{ display: 'grid', gap: 8, marginTop: 10, maxHeight: 220, overflowY: 'auto' }}>
                    {ownerResults.map((candidate: any) => (
                      <button key={candidate.id} type="button" onClick={() => { setOwner(candidate); setOwnerQuery(''); setOwnerResults([]) }} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', textAlign: 'left', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>{candidate.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 4 }}>{[candidate.phone, candidate.email].filter(Boolean).join(' • ')}</div>
                          </div>
                          <span className={`badge ${ROLE_BADGE[candidate.role] || 'badge-gray'}`}>{roleLabel(candidate.role)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleCreate} disabled={creating}>
                {creating ? 'Creating...' : 'Create organisation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
