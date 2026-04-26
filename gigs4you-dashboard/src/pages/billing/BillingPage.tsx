import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CreditCard, CheckCircle, AlertCircle, Clock, Zap,
         RefreshCw, X, Phone, ArrowRight, Download, Building2, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { api, getBillingRecommendation } from '../../api/api'
import { useAuthStore } from '../../store/store'
import { downloadInvoicePDF } from '../../utils/pdf'

const PLANS = [
  { id:'free',       name:'Free trial',  price:0,     agents:2,    jobs:5,    color:'var(--text-3)',  badge:'Trial' },
  { id:'starter',    name:'Starter',     price:2999,  agents:10,   jobs:50,   color:'var(--info)',    badge:'Popular for small teams' },
  { id:'growth',     name:'Growth',      price:7999,  agents:50,   jobs:500,  color:'var(--green)',   badge:'Most popular' },
  { id:'scale',      name:'Scale',       price:19999, agents:200,  jobs:5000, color:'var(--purple)',  badge:'Fast-growing teams' },
  { id:'enterprise', name:'Enterprise',  price:0,     agents:9999, jobs:9999, color:'var(--accent)',  badge:'Contact us' },
]

const STATUS_BADGE: Record<string,string> = {
  active:'badge-green', trial:'badge-blue', past_due:'badge-red',
  expired:'badge-red', cancelled:'badge-gray',
}
const INV_BADGE: Record<string,string> = {
  paid:'badge-green', pending:'badge-amber', overdue:'badge-red',
  draft:'badge-gray', cancelled:'badge-gray',
}

export default function BillingPage() {
  const { user } = useAuthStore()
  const isSuperAdmin = user?.role === 'super_admin'
  const [searchParams, setSearchParams] = useSearchParams()
  const autoUpgradePlan = searchParams.get('autoUpgrade') || ''
  const autoUpgradeDone = useRef(false)

  const [sub, setSub]           = useState<any>(null)
  const [org, setOrg]           = useState<any>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [allSubs, setAllSubs]   = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState<'overview'|'invoices'|'plans'|'admin'>('overview')
  const [showPay, setShowPay]   = useState<any>(null)
  const [payPhone, setPayPhone] = useState('')
  const [paying, setPaying]     = useState(false)
  const [upgrading, setUpgrading] = useState('')
  const [aiRec, setAiRec]       = useState<any>(null)
  const [aiRecLoading, setAiRL] = useState(false)

  const load = async () => {
    setLoading(true)
    const [s, invs, o] = await Promise.allSettled([
      api.get('/billing/subscription').then(r => r.data),
      api.get('/billing/invoices').then(r => r.data),
      api.get('/organisations/mine').then(r => r.data),
    ])
    setSub(s.status === 'fulfilled' ? s.value : null)
    setInvoices(invs.status === 'fulfilled' && Array.isArray(invs.value) ? invs.value : [])
    const orgData = o.status === 'fulfilled' ? o.value : null
    setOrg(Array.isArray(orgData) ? orgData[0] ?? null : orgData)
    if (isSuperAdmin) {
      const all = await api.get('/billing/admin/subscriptions').then(r => r.data).catch(() => [])
      setAllSubs(Array.isArray(all) ? all : [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])
  useEffect(() => { if (tab === 'plans' && !loading) fetchAiRecommendation() }, [tab, loading])

  // Auto-upgrade: if user came from website with plan param, trigger upgrade once after loading
  useEffect(() => {
    if (!loading && autoUpgradePlan && !autoUpgradeDone.current) {
      const validPlans = PLANS.map(p => p.id)
      if (validPlans.includes(autoUpgradePlan) && autoUpgradePlan !== 'free' && autoUpgradePlan !== 'enterprise') {
        // Only auto-upgrade if they don't already have this plan or better
        const isAlreadyOnPlan = sub?.plan === autoUpgradePlan && sub?.isActive
        if (!isAlreadyOnPlan) {
          autoUpgradeDone.current = true
          setTab('plans')
          // Remove the query param so it doesn't re-trigger on refresh
          setSearchParams({})
          // Small delay so user sees the plans tab open
          setTimeout(() => {
            handleUpgrade(autoUpgradePlan)
          }, 800)
        } else {
          setSearchParams({})
        }
      }
    }
  }, [loading, autoUpgradePlan])

  const handleUpgrade = async (planId: string) => {
    setUpgrading(planId)
    try {
      const res = await api.post('/billing/subscribe', { plan: planId })
      const { invoice, message } = res.data
      toast.success(message || `Invoice ${invoice?.invoiceNumber} created. Pay to activate.`, { duration: 6000 })
      await load()
      setTab('invoices')
      // Auto-open the STK push modal for the newly created pending invoice
      if (invoice && invoice.status === 'pending') {
        setShowPay(invoice)
        setPayPhone('')
      }
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Failed') }
    setUpgrading('')
  }

  const handleStkPush = async () => {
    if (!showPay || !payPhone) return
    setPaying(true)
    try {
      await api.post(`/billing/invoices/${showPay.id}/pay-mpesa`, { phone: payPhone })
      toast.success('M-Pesa prompt sent! Check your phone.')
      setShowPay(null)
      setTimeout(load, 5000)
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Failed') }
    setPaying(false)
  }

  const handleConfirm = async (invoiceId: string) => {
    try {
      await api.patch(`/billing/admin/invoices/${invoiceId}/confirm`, { note: 'Confirmed by super admin' })
      toast.success('Payment confirmed')
      load()
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Failed') }
  }

  const handleDownloadInvoice = (inv: any) => {
    downloadInvoicePDF({
      invoiceNumber: inv.invoiceNumber,
      amountKes:     inv.amountKes,
      plan:          inv.plan,
      status:        inv.status,
      dueDate:       inv.dueDate,
      paidAt:        inv.paidAt,
      mpesaCode:     inv.mpesaCode,
      org: org ? {
        name:       org.name,
        kraPin:     org.kraPin,
        vatNumber:  org.vatNumber,
        address:    org.address,
      } : undefined,
      lineItems: inv.lineItems,
    })
  }

  const fetchAiRecommendation = async () => {
    if (aiRec || aiRecLoading) return
    setAiRL(true)
    try {
      const rec = await getBillingRecommendation()
      if (rec?.recommendedPlan) setAiRec(rec)
    } catch {}
    setAiRL(false)
  }

  const activePlan = PLANS.find(p => p.id === sub?.plan) || PLANS[0]

  const planInfo = PLANS.find(p => p.id === autoUpgradePlan)

  return (
    <div className="fade-in">
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:700 }}>Billing & Subscription</h1>
          <p style={{ color:'var(--text-3)', fontSize:13, marginTop:2 }}>
            Manage your plan, invoices and payments
          </p>
        </div>
        <button onClick={load} className="btn btn-ghost" style={{ gap:5 }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Welcome banner — shown when redirected from website plan selection */}
      {planInfo && !autoUpgradeDone.current && (
        <div style={{
          display:'flex', alignItems:'center', gap:14, marginBottom:20,
          padding:'16px 20px', borderRadius:14,
          background:'linear-gradient(135deg, #0D1B14, #1B6B3A)',
          color:'#fff',
        }}>
          <div style={{ fontSize:28 }}>🎉</div>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, fontSize:15 }}>
              Account created! Activating your {planInfo.name} plan…
            </div>
            <div style={{ fontSize:12, opacity:0.7, marginTop:3 }}>
              We're creating your invoice now. You'll receive an M-Pesa STK push to complete payment.
            </div>
          </div>
          {loading && <RefreshCw size={16} style={{ animation:'spin 1s linear infinite', opacity:0.7 }} />}
        </div>
      )}

      {/* Current plan strip */}
      {sub && (
        <div style={{ background:`linear-gradient(135deg, #0D1B14, #1B6B3A)`,
          borderRadius:14, padding:'20px 24px', color:'#fff', marginBottom:20,
          display:'flex', alignItems:'center', justifyContent:'space-between', gap:16 }}>
          <div>
            <div style={{ fontSize:12, opacity:0.6, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>Current plan</div>
            <div style={{ fontSize:24, fontWeight:800, marginTop:4 }}>{activePlan.name}</div>
            <div style={{ fontSize:13, opacity:0.7, marginTop:4 }}>
              {sub.daysRemaining > 0
                ? `${sub.daysRemaining} days remaining · renews ${new Date(sub.currentPeriodEnd).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'})}`
                : 'Subscription expired'}
            </div>
          </div>
          <div style={{ textAlign:'right' }}>
            <span className={`badge ${STATUS_BADGE[sub.status] || 'badge-gray'}`} style={{ fontSize:12, marginBottom:8, display:'inline-block' }}>
              {sub.status?.replace('_',' ')}
            </span>
            <div style={{ fontSize:13, opacity:0.7 }}>
              {activePlan.agents} agents · {activePlan.jobs} jobs/mo
            </div>
            <button onClick={() => setTab('plans')} className="btn btn-ghost"
              style={{ marginTop:8, color:'#fff', borderColor:'rgba(255,255,255,0.3)', fontSize:12 }}>
              Upgrade plan <ArrowRight size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        {([
          { id:'overview', label:'📊 Overview' },
          { id:'invoices', label:`🧾 Invoices (${invoices.length})` },
          { id:'plans',    label:'⚡ Change plan' },
          ...(isSuperAdmin ? [{ id:'admin', label:`🔑 All orgs (${allSubs.length})` }] : []),
        ] as const).map((t: any) => (
          <button key={t.id} className={`tab ${tab===t.id?'active':''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }}>
            {[
              { l:'Plan',           v:activePlan.name,              icon:'📋', color:'var(--text-1)' },
              { l:'Status',         v:sub?.status?.replace('_',' ') || 'No subscription', icon:'🔄', color: sub?.isActive?'var(--green)':'var(--danger)' },
              { l:'Days remaining', v:sub?.daysRemaining ?? '—',     icon:'📅', color:'var(--info)' },
              { l:'Agent limit',    v:`${activePlan.agents} agents`, icon:'👥', color:'var(--green)' },
              { l:'Job limit',      v:`${activePlan.jobs} jobs/mo`,  icon:'💼', color:'var(--accent)' },
              { l:'Invoices',       v:invoices.length,               icon:'🧾', color:'var(--purple)' },
            ].map(s => (
              <div key={s.l} className="stat-card">
                <div style={{ fontSize:22 }}>{s.icon}</div>
                <div className="stat-value" style={{ color:s.color, marginTop:4 }}>{s.v}</div>
                <div className="stat-label">{s.l}</div>
              </div>
            ))}
          </div>

          {/* M-Pesa paybill info */}
          {sub?.mpesaAccountRef && (
            <div className="card" style={{ padding:16, background:'var(--green-pale)', border:'1px solid var(--green)' }}>
              <div style={{ fontWeight:700, fontSize:14, color:'var(--green)', marginBottom:6 }}>
                💚 Pay via M-Pesa Paybill
              </div>
              <div style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.7 }}>
                Paybill number: <strong>522533</strong> (Safaricom) &nbsp;·&nbsp;
                Account number: <strong>{sub.mpesaAccountRef}</strong><br/>
                Payments are automatically confirmed via webhook.
              </div>
            </div>
          )}

          {/* Tax & billing details */}
          {org && (
            <div className="card" style={{ padding:20 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                <Building2 size={16} color="var(--green)" />
                <span style={{ fontWeight:700, fontSize:14 }}>Organisation billing details</span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 }}>
                {[
                  { label:'Organisation name', value: org.name },
                  { label:'Business reg. no.', value: org.businessRegNo || '—' },
                  { label:'KRA PIN',           value: org.kraPin       || '—' },
                  { label:'VAT number',         value: org.vatNumber    || '—' },
                  { label:'Billing email',      value: org.billingEmail || org.email || '—' },
                  { label:'Billing phone',      value: org.billingPhone || '—' },
                  { label:'Address',            value: org.address      || '—' },
                  { label:'County',             value: org.county       || '—' },
                ].map(row => (
                  <div key={row.label} style={{ display:'flex', flexDirection:'column', gap:2 }}>
                    <span style={{ fontSize:11, color:'var(--text-4)', textTransform:'uppercase', letterSpacing:'0.4px' }}>
                      {row.label}
                    </span>
                    <span style={{ fontSize:13, color:'var(--text-1)', fontWeight: row.value === '—' ? 400 : 600 }}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
              {(!org.kraPin || !org.vatNumber) && (
                <div style={{ marginTop:14, padding:'10px 14px', background:'rgba(234,179,8,0.1)',
                  border:'1px solid rgba(234,179,8,0.4)', borderRadius:8, fontSize:12, color:'var(--text-2)' }}>
                  ⚠️ KRA PIN and VAT number are required for tax-compliant invoices.
                  Contact your account manager to update these details.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── INVOICES ── */}
      {tab === 'invoices' && (
        <div className="card" style={{ overflow:'hidden' }}>
          <table className="data-table">
            <thead>
              <tr><th>Invoice</th><th>Plan</th><th>Amount</th><th>Status</th><th>Due date</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding:32, textAlign:'center', color:'var(--text-4)' }}>Loading...</td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={6} style={{ padding:32, textAlign:'center', color:'var(--text-4)' }}>No invoices yet</td></tr>
              ) : invoices.map(inv => (
                <tr key={inv.id}>
                  <td>
                    <div style={{ fontWeight:600, fontSize:13 }}>{inv.invoiceNumber}</div>
                    {inv.mpesaCode && <div style={{ fontSize:10, color:'var(--text-4)', fontFamily:'monospace' }}>{inv.mpesaCode}</div>}
                  </td>
                  <td style={{ fontSize:12, textTransform:'capitalize' }}>{inv.plan}</td>
                  <td style={{ fontWeight:700, color:'var(--green)' }}>KES {Number(inv.amountKes||0).toLocaleString()}</td>
                  <td><span className={`badge ${INV_BADGE[inv.status]||'badge-gray'}`}>{inv.status}</span></td>
                  <td style={{ fontSize:12, color:'var(--text-3)' }}>
                    {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'}) : '—'}
                  </td>
                  <td>
                    <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                      {inv.status === 'pending' && (
                        <button className="btn btn-primary" style={{ fontSize:11, padding:'5px 12px' }}
                          onClick={() => { setShowPay(inv); setPayPhone('') }}>
                          Pay via M-Pesa
                        </button>
                      )}
                      {inv.status === 'paid' && (
                        <span style={{ fontSize:11, color:'var(--green)' }}>
                          ✓ Paid {inv.paidAt ? new Date(inv.paidAt).toLocaleDateString('en-KE') : ''}
                        </span>
                      )}
                      <button className="btn btn-ghost" style={{ fontSize:11, padding:'5px 10px', gap:4 }}
                        onClick={() => handleDownloadInvoice(inv)} title="Download PDF">
                        <Download size={12} /> PDF
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── PLANS ── */}
      {tab === 'plans' && (
        <div>
          {/* ── AI Plan Recommendation ── */}
          {aiRecLoading && (
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14,
              padding:'12px 16px', background:'var(--green-pale)', border:'1px solid var(--green)',
              borderRadius:10, fontSize:13, color:'var(--green)' }}>
              <Sparkles size={14} />
              <span>AI is analysing your usage to recommend the best plan…</span>
            </div>
          )}
          {aiRec && !aiRecLoading && (
            <div style={{ marginBottom:16, padding:'16px 18px',
              background:'linear-gradient(135deg, rgba(27,107,58,0.07), rgba(27,107,58,0.02))',
              border:'1px solid rgba(27,107,58,0.25)', borderRadius:12 }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                <div style={{ width:36, height:36, borderRadius:'50%', flexShrink:0,
                  background:'var(--green-pale)', border:'2px solid var(--green)',
                  display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Sparkles size={16} color="var(--green)" />
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                    <span style={{ fontWeight:700, fontSize:14, color:'var(--text-1)' }}>
                      AI recommends: <span style={{ color:'var(--green)', textTransform:'capitalize' }}>{aiRec.recommendedPlan}</span>
                    </span>
                    <span style={{ fontSize:10, color:'var(--text-4)', padding:'1px 7px',
                      background:'var(--surface)', borderRadius:99, border:'1px solid var(--border)' }}>
                      {Math.round((aiRec.confidence ?? 0) * 100)}% confident
                    </span>
                  </div>
                  <p style={{ fontSize:12, color:'var(--text-2)', margin:0, lineHeight:1.6 }}>{aiRec.reason}</p>
                </div>
                {aiRec.recommendedPlan && aiRec.recommendedPlan !== sub?.plan && (
                  <button
                    onClick={() => handleUpgrade(aiRec.recommendedPlan)}
                    disabled={!!upgrading}
                    className="btn btn-primary"
                    style={{ fontSize:12, padding:'7px 14px', whiteSpace:'nowrap', flexShrink:0 }}>
                    {upgrading === aiRec.recommendedPlan ? 'Creating…' : 'Upgrade now'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Pending invoice warning */}
          {invoices.some(i => i.status === 'pending') && (
            <div style={{ marginBottom:14, padding:'12px 16px', background:'rgba(234,179,8,0.1)',
              border:'1px solid rgba(234,179,8,0.4)', borderRadius:10, fontSize:13, color:'var(--text-2)',
              display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
              <div>
                <strong style={{ color:'var(--text-1)' }}>You have an unpaid invoice.</strong>
                {' '}Pay it first to activate your plan, or contact support to cancel it before switching.
              </div>
              <button className="btn btn-primary" style={{ fontSize:12, whiteSpace:'nowrap' }}
                onClick={() => setTab('invoices')}>
                View invoice
              </button>
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:14 }}>
            {PLANS.filter(p => p.id !== 'free').map(plan => {
              const isCurrent   = sub?.plan === plan.id
              const isEnterprise = plan.id === 'enterprise'
              const hasPending  = invoices.some(i => i.status === 'pending')
              return (
                <div key={plan.id} className="card" style={{
                  padding:20,
                  border: isCurrent ? `2px solid ${plan.color}` : aiRec?.recommendedPlan === plan.id ? `2px solid var(--green)` : '1px solid var(--border)',
                  boxShadow: aiRec?.recommendedPlan === plan.id && !isCurrent ? '0 0 0 4px rgba(27,107,58,0.08)' : undefined,
                  position:'relative', overflow:'hidden' }}>
                  <div style={{ position:'absolute', top:10, right:10, display:'flex', flexDirection:'column', gap:4, alignItems:'flex-end' }}>
                    {isCurrent && <span className="badge badge-green" style={{ fontSize:10 }}>Current</span>}
                    {aiRec?.recommendedPlan === plan.id && !isCurrent && (
                      <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:99,
                        background:'var(--green)', color:'#fff', display:'flex', alignItems:'center', gap:3 }}>
                        ✨ AI pick
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize:11, fontWeight:700, color:plan.color, marginBottom:8,
                    textTransform:'uppercase', letterSpacing:'0.5px' }}>{plan.badge}</div>
                  <div style={{ fontSize:20, fontWeight:800, marginBottom:4 }}>{plan.name}</div>
                  {plan.price > 0
                    ? <div style={{ fontSize:22, fontWeight:800, color:plan.color }}>
                        KES {plan.price.toLocaleString()}<span style={{ fontSize:13, fontWeight:400, color:'var(--text-4)' }}>/mo</span>
                      </div>
                    : <div style={{ fontSize:16, fontWeight:700, color:plan.color }}>
                        {isEnterprise ? 'Custom pricing' : 'Free'}
                      </div>
                  }
                  <div style={{ margin:'12px 0', borderTop:'1px solid var(--border)', paddingTop:12 }}>
                    {[`Up to ${plan.agents === 9999 ? 'unlimited' : plan.agents} agents`,
                      `${plan.jobs === 9999 ? 'Unlimited' : plan.jobs} jobs/month`,
                      'Full task management', 'GPS tracking', 'Reports & analytics',
                    ].map(f => (
                      <div key={f} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5, fontSize:12 }}>
                        <CheckCircle size={12} color={plan.color} /> {f}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => isEnterprise ? null : handleUpgrade(plan.id)}
                    disabled={isCurrent || !!upgrading || isEnterprise}
                    className={isCurrent ? 'btn btn-ghost' : 'btn btn-primary'}
                    style={{ width:'100%', justifyContent:'center',
                      background: isCurrent ? undefined : plan.color, borderColor: plan.color }}>
                    {upgrading === plan.id ? 'Creating invoice...'
                      : isCurrent ? 'Current plan'
                      : isEnterprise ? 'Contact sales'
                      : 'Upgrade → Invoice'}
                  </button>
                  {!isCurrent && !isEnterprise && (
                    <div style={{ marginTop:6, fontSize:10, color:'var(--text-4)', textAlign:'center' }}>
                      An invoice is created first. Your plan activates after payment.
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── SUPER ADMIN: ALL SUBSCRIPTIONS ── */}
      {tab === 'admin' && isSuperAdmin && (
        <div className="card" style={{ overflow:'hidden' }}>
          <table className="data-table">
            <thead>
              <tr><th>Organisation</th><th>Plan</th><th>Status</th><th>Days left</th><th>Agents</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {allSubs.length === 0
                ? <tr><td colSpan={6} style={{ padding:32, textAlign:'center', color:'var(--text-4)' }}>No subscriptions yet</td></tr>
                : allSubs.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight:500, fontSize:11, fontFamily:'monospace' }}>{s.organisationId?.slice(0,12)}...</td>
                    <td><span style={{ fontWeight:600, textTransform:'capitalize' }}>{s.plan}</span></td>
                    <td><span className={`badge ${STATUS_BADGE[s.status]||'badge-gray'}`}>{s.status?.replace('_',' ')}</span></td>
                    <td style={{ fontWeight:700, color: s.daysRemaining > 7 ? 'var(--green)' : 'var(--danger)' }}>
                      {s.daysRemaining}d
                    </td>
                    <td style={{ fontSize:12 }}>{s.planLimit?.agents}</td>
                    <td>
                      <button className="btn btn-ghost" style={{ fontSize:11 }}
                        onClick={() => handleConfirm(s.id)}>
                        Confirm payment
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* M-Pesa STK push modal */}
      {showPay && (
        <div className="modal-backdrop" onClick={e => e.target===e.currentTarget && setShowPay(null)}>
          <div className="modal modal-sm">
            <div className="modal-header">
              <div>
                <h2 style={{ fontSize:17, fontWeight:700 }}>Pay via M-Pesa</h2>
                <p style={{ fontSize:12, color:'var(--text-4)', marginTop:3 }}>
                  Invoice {showPay.invoiceNumber} · KES {Number(showPay.amountKes).toLocaleString()}
                </p>
              </div>
              <button className="btn-icon" onClick={() => setShowPay(null)}><X size={15} /></button>
            </div>
            <div className="modal-body">
              <div style={{ padding:'12px 14px', background:'var(--green-pale)', borderRadius:8,
                border:'1px solid var(--green)', fontSize:13, marginBottom:14 }}>
                <strong>How it works:</strong> Enter your M-Pesa number. You'll receive an STK push
                prompt on your phone. Confirm the payment and your subscription activates automatically.
              </div>
              <label className="lbl">M-Pesa phone number</label>
              <input className="inp" type="tel" placeholder="0712 345 678"
                value={payPhone} onChange={e => setPayPhone(e.target.value)} />
              <div style={{ fontSize:12, color:'var(--text-4)', marginTop:8 }}>
                Or pay manually: Paybill <strong>522533</strong>, Account <strong>{sub?.mpesaAccountRef}</strong>
              </div>
              <div style={{ marginTop:12, borderTop:'1px solid var(--border)', paddingTop:12,
                display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:12, color:'var(--text-3)' }}>Need a copy?</span>
                <button className="btn btn-ghost" style={{ fontSize:11, gap:4 }}
                  onClick={() => handleDownloadInvoice(showPay)}>
                  <Download size={12} /> Download invoice PDF
                </button>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" style={{ flex:1, justifyContent:'center' }} onClick={() => setShowPay(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }}
                onClick={handleStkPush} disabled={!payPhone || paying}>
                {paying ? 'Sending...' : '💚 Send M-Pesa prompt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
