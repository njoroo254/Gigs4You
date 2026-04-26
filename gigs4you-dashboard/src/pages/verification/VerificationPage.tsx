import { useEffect, useState, useRef } from 'react'
import {
  ShieldCheck, ShieldX, Clock, RefreshCw, CheckCircle, XCircle,
  Upload, Camera, FileText, User, Eye, ChevronRight, AlertTriangle,
  Sparkles, ScanFace,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../../api/api'
import { useAuthStore } from '../../store/store'

const STATUS_META: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  approved:  { icon: ShieldCheck,   color: '#1B6B3A', bg: '#EBF7EE', label: 'Verified'       },
  rejected:  { icon: ShieldX,       color: '#DC2626', bg: '#FEF2F2', label: 'Rejected'       },
  submitted: { icon: Clock,         color: '#2563EB', bg: '#EFF6FF', label: 'Under Review'   },
  pending:   { icon: ShieldX,       color: '#9CA3AF', bg: '#F9FAFB', label: 'Not Verified'   },
}

const DOC_TYPES = [
  { value: 'national_id',      label: 'National ID'      },
  { value: 'passport',         label: 'Passport'         },
  { value: 'driving_license',  label: 'Driving License'  },
]

function FileUploadCard({
  label, hint, value, onChange, icon: Icon,
}: {
  label: string; hint: string; value: File | null;
  onChange: (f: File | null) => void; icon: any
}) {
  const ref = useRef<HTMLInputElement>(null)
  const preview = value ? URL.createObjectURL(value) : null

  return (
    <div
      onClick={() => ref.current?.click()}
      style={{
        border: `2px dashed ${value ? '#1B6B3A' : '#D1D5DB'}`,
        borderRadius: 12, padding: 16, cursor: 'pointer',
        background: value ? '#EBF7EE' : '#FAFAFA',
        transition: 'all 0.15s', textAlign: 'center',
        position: 'relative', overflow: 'hidden',
      }}
    >
      <input
        ref={ref} type="file" accept="image/*"
        style={{ display: 'none' }}
        onChange={e => onChange(e.target.files?.[0] || null)}
      />
      {preview ? (
        <>
          <img src={preview} alt={label}
            style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }} />
          <div style={{ fontSize: 11, color: '#1B6B3A', fontWeight: 600 }}>✓ {value!.name}</div>
        </>
      ) : (
        <>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: '#F3F4F6',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
            <Icon size={18} color="#9CA3AF" />
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: 11, color: '#9CA3AF' }}>{hint}</div>
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 8, fontWeight: 500 }}>
            Click to upload
          </div>
        </>
      )}
    </div>
  )
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 85 ? '#1B6B3A' : score >= 70 ? '#D97706' : '#DC2626'
  const bg    = score >= 85 ? '#EBF7EE' : score >= 70 ? '#FEF3C7' : '#FEF2F2'
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 99, background: bg, border: `1px solid ${color}20` }}>
      <ScanFace size={12} color={color} />
      <span style={{ fontSize: 12, fontWeight: 700, color }}>
        AI Match {score.toFixed(1)}%
      </span>
    </div>
  )
}

export default function VerificationPage() {
  const { user } = useAuthStore()
  const isAdmin = ['super_admin', 'admin'].includes(user?.role || '')

  const [myVerif, setMyVerif]         = useState<any>(null)
  const [pending, setPending]         = useState<any[]>([])
  const [selected, setSelected]       = useState<any>(null)
  const [loading, setLoading]         = useState(true)
  const [reviewNote, setNote]         = useState('')
  const [tab, setTab]                 = useState<'mine' | 'pending'>('mine')
  const [documentType, setDocType]    = useState<string>('national_id')
  const [idNumber, setIdNumber]       = useState('')
  const [idFrontFile, setIdFront]     = useState<File | null>(null)
  const [idBackFile, setIdBack]       = useState<File | null>(null)
  const [selfieFile, setSelfie]       = useState<File | null>(null)
  const [submitting, setSubmitting]   = useState(false)
  const [approving, setApproving]     = useState(false)
  const [rejecting, setRejecting]     = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const me = await api.get('/verification/me').then(r => r.data).catch(() => null)
      setMyVerif(me)
      if (isAdmin) {
        const p = await api.get('/verification/pending').then(r => r.data).catch(() => [])
        setPending(Array.isArray(p) ? p : [])
      }
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const uploadFile = async (docType: string, file: File): Promise<string> => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await api.post(`/upload/kyc-document?docType=${docType}`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data.url
  }

  const handleSubmit = async () => {
    if (!idNumber.trim()) return toast.error('ID number is required')
    if (!idFrontFile)     return toast.error('Front image of your ID is required')
    if (!selfieFile)      return toast.error('A selfie photo is required')
    setSubmitting(true)
    try {
      const [idFrontUrl, selfieUrl] = await Promise.all([
        uploadFile('id_front', idFrontFile),
        uploadFile('selfie', selfieFile),
      ])
      const idBackUrl = idBackFile ? await uploadFile('id_back', idBackFile) : undefined
      await api.post('/verification/submit', { documentType, idNumber, idFrontUrl, idBackUrl, selfieUrl })
      toast.success('Documents submitted — AI is checking your identity now')
      setIdFront(null); setIdBack(null); setSelfie(null); setIdNumber('')
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleApprove = async (id: string) => {
    setApproving(true)
    try {
      await api.patch(`/verification/${id}/approve`, { note: reviewNote || null })
      toast.success('Verification approved')
      setSelected(null); setNote(''); load()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to approve')
    } finally { setApproving(false) }
  }

  const handleReject = async (id: string) => {
    if (!reviewNote.trim()) return toast.error('Rejection reason is required')
    setRejecting(true)
    try {
      await api.patch(`/verification/${id}/reject`, { note: reviewNote })
      toast.success('Verification rejected')
      setSelected(null); setNote(''); load()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to reject')
    } finally { setRejecting(false) }
  }

  const status = myVerif?.status || 'pending'
  const meta   = STATUS_META[status] || STATUS_META.pending
  const StatusIcon = meta.icon

  const STEPS = ['Not verified', 'Submitted', 'Under review', 'Verified']
  const stepIdx = { pending: 0, submitted: 2, rejected: 0, approved: 3 }[status] ?? 0

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Identity Verification</h1>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 3 }}>
            KYC verification builds trust with employers and unlocks more opportunities
          </p>
        </div>
        <button onClick={load} className="btn btn-ghost" style={{ gap: 6 }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Admin tabs */}
      {isAdmin && (
        <div className="tabs" style={{ marginBottom: 20 }}>
          <button className={`tab ${tab === 'mine' ? 'active' : ''}`} onClick={() => setTab('mine')}>
            My verification
          </button>
          <button className={`tab ${tab === 'pending' ? 'active' : ''}`} onClick={() => setTab('pending')}>
            Pending review
            {pending.length > 0 && (
              <span style={{ marginLeft: 6, padding: '1px 7px', borderRadius: 99,
                background: 'var(--danger)', color: '#fff', fontSize: 10, fontWeight: 700 }}>
                {pending.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* ── MY VERIFICATION ── */}
      {(!isAdmin || tab === 'mine') && (
        <div style={{ maxWidth: 620 }}>
          {/* Status card */}
          <div style={{ background: meta.bg, border: `1.5px solid ${meta.color}20`,
            borderRadius: 16, padding: 24, marginBottom: 20,
            display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: meta.color + '18',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <StatusIcon size={26} color={meta.color} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 17, fontWeight: 800, color: meta.color }}>{meta.label}</span>
                {myVerif?.faceMatchScore > 0 && <ScoreBadge score={myVerif.faceMatchScore} />}
              </div>
              <p style={{ fontSize: 13, color: '#4B5563', lineHeight: 1.6, margin: 0 }}>
                {status === 'approved'
                  ? 'Your identity has been verified. You appear as ✓ verified to all employers on the platform.'
                  : status === 'submitted'
                  ? 'Your documents are under review. You will be notified within 24 hours via email and SMS.'
                  : status === 'rejected'
                  ? myVerif?.reviewNote || 'Documents were unclear or invalid. Please resubmit with clearer photos.'
                  : 'Submit your government-issued ID and a selfie to get verified. Verified workers get priority in job matching.'}
              </p>
              {myVerif?.reviewNote && status === 'approved' && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#059669', fontWeight: 500 }}>
                  <Sparkles size={11} style={{ marginRight: 4 }} />{myVerif.reviewNote}
                </div>
              )}
            </div>
          </div>

          {/* Progress steps */}
          {status !== 'rejected' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 24, padding: '0 4px' }}>
              {STEPS.map((s, i) => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 0 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 60 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: i <= stepIdx ? '#1B6B3A' : '#E5E7EB',
                      transition: 'background 0.2s',
                    }}>
                      {i < stepIdx
                        ? <CheckCircle size={14} color="#fff" />
                        : <span style={{ fontSize: 11, fontWeight: 700, color: i === stepIdx ? '#fff' : '#9CA3AF' }}>{i + 1}</span>
                      }
                    </div>
                    <span style={{ fontSize: 10, color: i <= stepIdx ? '#1B6B3A' : '#9CA3AF',
                      fontWeight: i === stepIdx ? 700 : 500, textAlign: 'center', lineHeight: 1.3 }}>{s}</span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div style={{ flex: 1, height: 2, background: i < stepIdx ? '#1B6B3A' : '#E5E7EB',
                      margin: '0 4px', marginBottom: 20, transition: 'background 0.2s' }} />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Submission form */}
          {status !== 'approved' && (
            <div className="card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: '#EBF7EE',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileText size={15} color="#1B6B3A" />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>
                    {status === 'rejected' ? 'Resubmit documents' : 'Submit for verification'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    Supported: National ID · Passport · Driving License
                  </div>
                </div>
              </div>

              {status === 'rejected' && (
                <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderRadius: 10,
                  background: '#FEF2F2', border: '1px solid #FECACA', marginBottom: 16 }}>
                  <AlertTriangle size={14} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 12, color: '#991B1B' }}>
                    {myVerif?.reviewNote || 'Your previous submission was rejected. Please resubmit.'}
                  </span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label className="lbl">Document type</label>
                  <select className="inp" value={documentType} onChange={e => setDocType(e.target.value)}>
                    {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="lbl">ID / Document number</label>
                  <input className="inp" value={idNumber} placeholder="e.g. 12345678"
                    onChange={e => setIdNumber(e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
                <FileUploadCard label="ID Front" hint="Clear photo of front" icon={FileText}
                  value={idFrontFile} onChange={setIdFront} />
                <FileUploadCard label="ID Back" hint="Optional (passport skip)" icon={FileText}
                  value={idBackFile} onChange={setIdBack} />
                <FileUploadCard label="Selfie" hint="Face clearly visible" icon={Camera}
                  value={selfieFile} onChange={setSelfie} />
              </div>

              <div style={{ padding: '10px 14px', background: '#F0FDF4', borderRadius: 10,
                border: '1px solid #BBF7D0', marginBottom: 16, display: 'flex', gap: 8 }}>
                <Sparkles size={14} color="#059669" style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 12, color: '#065F46', lineHeight: 1.5 }}>
                  AI face-matching will automatically verify your identity. High-confidence matches
                  (≥85%) are approved instantly. Others go to admin review within 24h.
                </span>
              </div>

              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center',
                gap: 8, padding: '11px 0', fontSize: 14 }}
                onClick={handleSubmit} disabled={submitting}>
                <ScanFace size={15} />
                {submitting ? 'Uploading & analysing...' : 'Submit for verification'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── ADMIN: PENDING VERIFICATIONS ── */}
      {isAdmin && tab === 'pending' && (
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 420px' : '1fr', gap: 20 }}>
          {/* Table */}
          <div className="card" style={{ overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-4)' }}>Loading...</div>
            ) : pending.length === 0 ? (
              <div style={{ padding: 64, textAlign: 'center' }}>
                <CheckCircle size={40} color="#1B6B3A" style={{ margin: '0 auto 12px' }} />
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>All clear!</div>
                <div style={{ fontSize: 13, color: 'var(--text-3)' }}>No pending verifications right now</div>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User ID</th>
                    <th>Document</th>
                    <th>ID number</th>
                    <th>AI Score</th>
                    <th>Submitted</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map(v => (
                    <tr key={v.id}
                      style={{ cursor: 'pointer', background: selected?.id === v.id ? 'var(--green-pale)' : '' }}
                      onClick={() => setSelected(v)}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-3)' }}>
                        {v.userId?.slice(0, 14)}…
                      </td>
                      <td style={{ textTransform: 'capitalize' }}>
                        {v.documentType?.replace(/_/g, ' ') || '—'}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{v.idNumber || '—'}</td>
                      <td>
                        {v.faceMatchScore > 0
                          ? <ScoreBadge score={v.faceMatchScore} />
                          : <span style={{ fontSize: 11, color: 'var(--text-4)' }}>Pending AI</span>
                        }
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-3)' }}>
                        {v.submittedAt
                          ? new Date(v.submittedAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: '2-digit' })
                          : '—'}
                      </td>
                      <td>
                        <button className="btn btn-ghost" style={{ fontSize: 11, gap: 4 }}
                          onClick={e => { e.stopPropagation(); setSelected(v) }}>
                          <Eye size={12} /> Review <ChevronRight size={10} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Review panel */}
          {selected && (
            <div className="card" style={{ padding: 0, overflow: 'hidden', alignSelf: 'start', position: 'sticky', top: 0 }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>Review submission</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                    {selected.documentType?.replace(/_/g, ' ')} · {selected.idNumber || 'No ID#'}
                  </div>
                </div>
                <button onClick={() => setSelected(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                  <XCircle size={18} color="var(--text-4)" />
                </button>
              </div>

              <div style={{ padding: 20 }}>
                {/* AI Score banner */}
                {selected.faceMatchScore > 0 && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 10, marginBottom: 16,
                    background: selected.faceMatchScore >= 85 ? '#EBF7EE' : selected.faceMatchScore >= 70 ? '#FEF3C7' : '#FEF2F2',
                    border: `1px solid ${selected.faceMatchScore >= 85 ? '#BBF7D0' : selected.faceMatchScore >= 70 ? '#FDE68A' : '#FECACA'}`,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <ScanFace size={15} color={selected.faceMatchScore >= 85 ? '#1B6B3A' : selected.faceMatchScore >= 70 ? '#D97706' : '#DC2626'} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700,
                        color: selected.faceMatchScore >= 85 ? '#065F46' : selected.faceMatchScore >= 70 ? '#92400E' : '#991B1B' }}>
                        AI Face Match: {selected.faceMatchScore.toFixed(1)}%
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                        {selected.faceMatchScore >= 85 ? 'High confidence — auto-approval threshold met' :
                         selected.faceMatchScore >= 70 ? 'Medium confidence — manual review recommended' :
                         'Low confidence — likely mismatch, consider rejecting'}
                      </div>
                    </div>
                  </div>
                )}

                {/* Images side by side */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                  {selected.idFrontUrl && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-4)',
                        textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>ID Front</div>
                      <img src={selected.idFrontUrl} alt="ID front"
                        style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)', display: 'block' }} />
                    </div>
                  )}
                  {selected.selfieUrl && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-4)',
                        textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Selfie</div>
                      <img src={selected.selfieUrl} alt="Selfie"
                        style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)', display: 'block' }} />
                    </div>
                  )}
                </div>

                {selected.idBackUrl && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-4)',
                      textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>ID Back</div>
                    <img src={selected.idBackUrl} alt="ID back"
                      style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)', display: 'block' }} />
                  </div>
                )}

                {/* Details */}
                {[
                  ['Document type', selected.documentType?.replace(/_/g, ' ')],
                  ['ID / Doc number', selected.idNumber],
                  ['Full name on ID', selected.fullNameOnId],
                  ['Date of birth', selected.dobOnId],
                ].map(([l, v]) => v && (
                  <div key={String(l)} style={{ display: 'flex', justifyContent: 'space-between',
                    fontSize: 12, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-4)' }}>{l}</span>
                    <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{v}</span>
                  </div>
                ))}

                {/* Review note */}
                <div style={{ marginTop: 14, marginBottom: 14 }}>
                  <label className="lbl">Note (required for rejection)</label>
                  <textarea className="inp" rows={2} value={reviewNote}
                    onChange={e => setNote(e.target.value)}
                    placeholder="e.g. ID photo unclear, please resubmit with better lighting" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button className="btn btn-primary"
                    style={{ justifyContent: 'center', gap: 6 }}
                    onClick={() => handleApprove(selected.id)} disabled={approving}>
                    <CheckCircle size={14} />
                    {approving ? 'Approving...' : 'Approve'}
                  </button>
                  <button className="btn btn-ghost"
                    style={{ justifyContent: 'center', gap: 6, color: 'var(--danger)', borderColor: 'var(--danger)' }}
                    onClick={() => handleReject(selected.id)} disabled={rejecting}>
                    <XCircle size={14} />
                    {rejecting ? 'Rejecting...' : 'Reject'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
