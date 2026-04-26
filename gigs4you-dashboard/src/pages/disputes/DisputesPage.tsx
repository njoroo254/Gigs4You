import { useEffect, useState } from 'react'
import { Scale, AlertTriangle, X, RefreshCw, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { getDisputes, getMyDisputes, getDisputeStats, reviewDispute, resolveDispute, closeDispute, fileDispute } from '../../api/api'
import { useAuthStore } from '../../store/store'

const STATUS_COLOR: Record<string, string> = {
  open:         'var(--info)',
  under_review: 'var(--accent)',
  resolved:     'var(--green)',
  closed:       'var(--text-4)',
}
const STATUS_LABEL: Record<string, string> = {
  open:         'Open',
  under_review: 'Under Review',
  resolved:     'Resolved',
  closed:       'Closed',
}
const TYPE_LABEL: Record<string, string> = {
  payment:      '💰 Payment',
  quality:      '⭐ Quality',
  non_delivery: '📦 Non-Delivery',
  fraud:        '🚨 Fraud',
  harassment:   '🚫 Harassment',
  other:        '❓ Other',
}
const RESOLUTION_OPTIONS = [
  { value: 'PAYMENT_RELEASED',  label: 'Release Payment to Claimant' },
  { value: 'REFUND_ISSUED',     label: 'Issue Full Refund' },
  { value: 'PARTIAL_REFUND',    label: 'Issue Partial Refund' },
  { value: 'NO_ACTION',         label: 'No Action (Unfounded)' },
  { value: 'WARNING_ISSUED',    label: 'Issue Warning' },
  { value: 'ACCOUNT_SUSPENDED', label: 'Suspend Account' },
]

function StatCard({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '16px 20px', minWidth: 140 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value ?? '–'}</div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

export default function DisputesPage() {
  const { user } = useAuthStore()
  const isAdmin = ['super_admin', 'admin'].includes(user?.role || '')

  const [tab,      setTab]      = useState<'all' | 'mine'>('all')
  const [disputes, setDisputes] = useState<any[]>([])
  const [stats,    setStats]    = useState<any>(null)
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState<any>(null)

  // Resolve modal state
  const [resolving,     setResolving]     = useState(false)
  const [resolution,    setResolution]    = useState('NO_ACTION')
  const [resolutionNote,setResolutionNote]= useState('')
  const [refundAmount,  setRefundAmount]  = useState('')
  const [saving,        setSaving]        = useState(false)

  // File dispute modal state
  const [filing,      setFiling]      = useState(false)
  const [fileForm,    setFileForm]    = useState({
    type:          '',
    description:   '',
    againstUserId: '',
    amountKes:     '',
  })
  const [fileSaving,  setFileSaving]  = useState(false)

  // filters
  const [statusFilter, setStatusFilter] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const params: any = {}
      if (statusFilter) params.status = statusFilter
      const data = isAdmin && tab === 'all'
        ? await getDisputes(params)
        : await getMyDisputes()
      setDisputes(Array.isArray(data) ? data : (data?.disputes || []))
      if (isAdmin) {
        const s = await getDisputeStats().catch(() => null)
        setStats(s)
      }
    } catch { setDisputes([]) }
    setLoading(false)
  }

  useEffect(() => { load() }, [tab, statusFilter])

  const handleReview = async (id: string) => {
    try {
      await reviewDispute(id)
      toast.success('Dispute moved to Under Review')
      load()
    } catch { toast.error('Failed to update dispute') }
  }

  const handleResolve = async () => {
    if (!selected) return
    setSaving(true)
    try {
      await resolveDispute(selected.id, {
        resolution,
        resolutionNote,
        refundAmountKes: refundAmount ? Number(refundAmount) : undefined,
      })
      toast.success('Dispute resolved')
      setResolving(false)
      setSelected(null)
      load()
    } catch { toast.error('Failed to resolve dispute') }
    setSaving(false)
  }

  const handleClose = async (id: string) => {
    const reason = prompt('Enter reason for closing this dispute:')
    if (!reason) return
    try {
      await closeDispute(id, reason)
      toast.success('Dispute closed')
      load()
    } catch { toast.error('Failed to close dispute') }
  }

  const handleFileDispute = async () => {
    if (!fileForm.type)          return toast.error('Select a dispute type')
    if (!fileForm.description.trim()) return toast.error('Describe the issue')
    if (!fileForm.againstUserId.trim()) return toast.error('Enter the User ID of the other party')
    setFileSaving(true)
    try {
      await fileDispute({
        type:          fileForm.type as any,
        description:   fileForm.description,
        againstUserId: fileForm.againstUserId.trim(),
        amountKes:     fileForm.amountKes ? Number(fileForm.amountKes) : undefined,
      })
      toast.success('Dispute filed — our team will review within 72 hours')
      setFiling(false)
      setFileForm({ type:'', description:'', againstUserId:'', amountKes:'' })
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to file dispute')
    }
    setFileSaving(false)
  }

  const byStatus = (s: string) => stats?.by_status?.[s] ?? 0

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Scale size={20} color="var(--green)" />
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Dispute Centre</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
              borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)' }}>
            <RefreshCw size={13} /> Refresh
          </button>
          <button onClick={() => setFiling(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
              borderRadius: 8, border: 'none', background: 'var(--green)',
              fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#fff' }}>
            <Plus size={13} /> File a Dispute
          </button>
        </div>
      </div>

      {/* Stats row — admin only */}
      {isAdmin && stats && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          <StatCard label="Open"         value={byStatus('open')}         color="var(--info)"   />
          <StatCard label="Under Review" value={byStatus('under_review')} color="var(--accent)" />
          <StatCard label="Resolved"     value={byStatus('resolved')}     color="var(--green)"  />
          <StatCard label="Overdue"      value={stats.overdue_count}       color="var(--danger)" />
          <StatCard label="Avg Resolution" value={stats.avg_resolution_hours ? `${stats.avg_resolution_hours}h` : '–'} color="var(--text-2)" />
        </div>
      )}

      {/* Tab bar */}
      {isAdmin && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--surface)',
          borderRadius: 10, padding: 4, width: 'fit-content' }}>
          {['all', 'mine'].map(t => (
            <button key={t} onClick={() => setTab(t as any)}
              style={{ padding: '6px 16px', borderRadius: 7, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600,
                background: tab === t ? 'var(--white)' : 'transparent',
                color: tab === t ? 'var(--text-1)' : 'var(--text-3)',
                boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
              {t === 'all' ? 'All Disputes' : 'My Disputes'}
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)',
            fontSize: 12, color: 'var(--text-2)', background: 'var(--white)', cursor: 'pointer' }}>
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="under_review">Under Review</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--white)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Loading disputes…</div>
        ) : disputes.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-4)' }}>
            <Scale size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
            <div style={{ fontSize: 14 }}>No disputes found</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
                {['Type', 'Against', 'Description', 'Amount', 'Status', 'Deadline', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700,
                    color: 'var(--text-3)', fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {disputes.map((d: any) => {
                const isOverdue = d.response_deadline && new Date(d.response_deadline) < new Date()
                  && !['resolved', 'closed'].includes(d.status)
                return (
                  <tr key={d.id} style={{ borderBottom: '1px solid var(--border)',
                    transition: 'background 0.1s', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => setSelected(d)}>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ fontSize: 12 }}>{TYPE_LABEL[d.type] || d.type}</span>
                    </td>
                    <td style={{ padding: '11px 14px', color: 'var(--text-2)' }}>
                      {d.against_user_name || '–'}
                    </td>
                    <td style={{ padding: '11px 14px', color: 'var(--text-3)', maxWidth: 220 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.description}
                      </div>
                    </td>
                    <td style={{ padding: '11px 14px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                      {d.amount_kes ? `KES ${Number(d.amount_kes).toLocaleString()}` : '–'}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 99, fontWeight: 600,
                        background: STATUS_COLOR[d.status] + '18', color: STATUS_COLOR[d.status] }}>
                        {STATUS_LABEL[d.status] || d.status}
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px', whiteSpace: 'nowrap',
                      color: isOverdue ? 'var(--danger)' : 'var(--text-3)' }}>
                      {d.response_deadline
                        ? new Date(d.response_deadline).toLocaleDateString()
                        : '–'}
                      {isOverdue && <AlertTriangle size={11} style={{ marginLeft: 4, verticalAlign: 'middle' }} />}
                    </td>
                    <td style={{ padding: '11px 14px' }} onClick={e => e.stopPropagation()}>
                      {isAdmin && d.status === 'open' && (
                        <button onClick={() => handleReview(d.id)}
                          style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6,
                            border: '1px solid var(--info)', color: 'var(--info)',
                            background: 'transparent', cursor: 'pointer', marginRight: 6 }}>
                          Review
                        </button>
                      )}
                      {isAdmin && d.status === 'under_review' && (
                        <button onClick={() => { setSelected(d); setResolving(true) }}
                          style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6,
                            border: '1px solid var(--green)', color: 'var(--green)',
                            background: 'transparent', cursor: 'pointer', marginRight: 6 }}>
                          Resolve
                        </button>
                      )}
                      {isAdmin && !['resolved', 'closed'].includes(d.status) && (
                        <button onClick={() => handleClose(d.id)}
                          style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6,
                            border: '1px solid var(--border)', color: 'var(--text-3)',
                            background: 'transparent', cursor: 'pointer' }}>
                          Close
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

      {/* Detail drawer */}
      {selected && !resolving && (
        <>
          <div onClick={() => setSelected(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 100 }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 420,
            background: 'var(--white)', zIndex: 101, padding: 24,
            boxShadow: '-4px 0 30px rgba(0,0,0,0.1)', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Dispute Detail</h2>
              <button onClick={() => setSelected(null)}
                style={{ width: 28, height: 28, borderRadius: 7, border: 'none', cursor: 'pointer',
                  background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={14} />
              </button>
            </div>

            {[
              ['ID',          selected.id?.slice(0, 8).toUpperCase()],
              ['Type',        TYPE_LABEL[selected.type] || selected.type],
              ['Status',      STATUS_LABEL[selected.status] || selected.status],
              ['Raised By',   selected.raised_by_name || '–'],
              ['Against',     selected.against_user_name || '–'],
              ['Amount',      selected.amount_kes ? `KES ${Number(selected.amount_kes).toLocaleString()}` : '–'],
              ['Filed',       selected.created_at ? new Date(selected.created_at).toLocaleString() : '–'],
              ['SLA Deadline',selected.response_deadline ? new Date(selected.response_deadline).toLocaleString() : '–'],
              ['Resolution',  selected.resolution || '–'],
              ['Refund Amount', selected.refund_amount_kes ? `KES ${Number(selected.refund_amount_kes).toLocaleString()}` : '–'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                padding: '9px 0', borderBottom: '1px solid var(--border)', gap: 12 }}>
                <span style={{ color: 'var(--text-3)', fontSize: 12, flexShrink: 0 }}>{k}</span>
                <span style={{ color: 'var(--text-1)', fontSize: 12, fontWeight: 600, textAlign: 'right' }}>{v}</span>
              </div>
            ))}

            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 6 }}>DESCRIPTION</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {selected.description}
              </div>
            </div>

            {selected.resolution_note && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 6 }}>RESOLUTION NOTE</div>
                <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
                  {selected.resolution_note}
                </div>
              </div>
            )}

            {isAdmin && selected.status === 'under_review' && (
              <button onClick={() => setResolving(true)}
                style={{ marginTop: 24, width: '100%', padding: '10px', borderRadius: 8,
                  background: 'var(--green)', color: '#fff', fontWeight: 700, fontSize: 13,
                  border: 'none', cursor: 'pointer' }}>
                Resolve Dispute
              </button>
            )}
          </div>
        </>
      )}

      {/* ── File a Dispute modal ── */}
      {filing && (
        <>
          <div onClick={() => setFiling(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)', width: 480, background: 'var(--white)',
            borderRadius: 16, padding: 28, zIndex: 201, boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>File a Dispute</h2>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
                  Our team will review within 72 hours
                </p>
              </div>
              <button onClick={() => setFiling(false)}
                style={{ width: 28, height: 28, borderRadius: 7, border: 'none', cursor: 'pointer',
                  background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={14} />
              </button>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>
                DISPUTE TYPE *
              </label>
              <select value={fileForm.type} onChange={e => setFileForm(f => ({...f, type: e.target.value}))}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box',
                  border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-1)', background: 'var(--white)' }}>
                <option value="">Select type…</option>
                <option value="payment">💰 Payment — money not released / wrong amount</option>
                <option value="quality">⭐ Quality — work was substandard</option>
                <option value="non_delivery">📦 Non-Delivery — job not completed</option>
                <option value="fraud">🚨 Fraud — suspected fraudulent activity</option>
                <option value="harassment">🚫 Harassment — conduct between parties</option>
                <option value="other">❓ Other</option>
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>
                OTHER PARTY USER ID *
              </label>
              <input value={fileForm.againstUserId}
                onChange={e => setFileForm(f => ({...f, againstUserId: e.target.value}))}
                placeholder="Paste the user ID of the other party"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box',
                  border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-1)' }} />
              <p style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 4 }}>
                Find the user ID on their profile page or from a task/job record.
              </p>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>
                AMOUNT IN DISPUTE (KES) — optional
              </label>
              <input type="number" value={fileForm.amountKes}
                onChange={e => setFileForm(f => ({...f, amountKes: e.target.value}))}
                placeholder="e.g. 3500"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box',
                  border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-1)' }} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>
                DESCRIPTION *
              </label>
              <textarea value={fileForm.description}
                onChange={e => setFileForm(f => ({...f, description: e.target.value}))}
                rows={5} placeholder="Describe what happened clearly. Include relevant dates, job IDs, and any evidence you have…"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box',
                  border: '1px solid var(--border)', fontSize: 13, resize: 'vertical',
                  fontFamily: 'inherit', color: 'var(--text-1)' }} />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setFiling(false)} disabled={fileSaving}
                style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'var(--white)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  color: 'var(--text-2)' }}>
                Cancel
              </button>
              <button onClick={handleFileDispute} disabled={fileSaving}
                style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none',
                  background: fileSaving ? 'var(--text-4)' : 'var(--green)', color: '#fff',
                  fontSize: 13, fontWeight: 700, cursor: fileSaving ? 'not-allowed' : 'pointer' }}>
                {fileSaving ? 'Filing…' : 'Submit Dispute'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Resolve modal */}
      {resolving && selected && (
        <>
          <div onClick={() => setResolving(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)', width: 460, background: 'var(--white)',
            borderRadius: 16, padding: 28, zIndex: 201, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Resolve Dispute</h2>
              <button onClick={() => setResolving(false)}
                style={{ width: 28, height: 28, borderRadius: 7, border: 'none', cursor: 'pointer',
                  background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={14} />
              </button>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>
                OUTCOME *
              </label>
              <select value={resolution} onChange={e => setResolution(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8,
                  border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-1)', background: 'var(--white)' }}>
                {RESOLUTION_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {['REFUND_ISSUED', 'PARTIAL_REFUND'].includes(resolution) && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>
                  REFUND AMOUNT (KES)
                </label>
                <input type="number" value={refundAmount}
                  onChange={e => setRefundAmount(e.target.value)}
                  placeholder="e.g. 2500"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box',
                    border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-1)' }} />
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>
                RESOLUTION NOTE (shown to both parties)
              </label>
              <textarea value={resolutionNote} onChange={e => setResolutionNote(e.target.value)}
                rows={4} placeholder="Explain the decision clearly…"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box',
                  border: '1px solid var(--border)', fontSize: 13, resize: 'vertical',
                  fontFamily: 'inherit', color: 'var(--text-1)' }} />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setResolving(false)} disabled={saving}
                style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'var(--white)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  color: 'var(--text-2)' }}>
                Cancel
              </button>
              <button onClick={handleResolve} disabled={saving}
                style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none',
                  background: saving ? 'var(--text-4)' : 'var(--green)', color: '#fff',
                  fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Saving…' : 'Confirm Resolution'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
