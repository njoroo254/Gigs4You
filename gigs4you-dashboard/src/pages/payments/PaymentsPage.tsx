import { useState, useEffect } from 'react'
import { CreditCard, Send, Download, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { getAgents, bulkPay, payAgent, getFinancialReport, topupOrgWallet } from '../../api/api'

export default function PaymentsPage() {
  const [agents, setAgents]         = useState<any[]>([])
  const [report, setReport]         = useState<any>({})
  const [loading, setLoading]       = useState(true)
  const [tab, setTab]               = useState<'topup'|'bulk'|'single'|'history'>('topup')
  const [selected, setSelected]     = useState<Set<string>>(new Set())
  const [amounts, setAmounts]       = useState<Record<string, string>>({})
  const [remarks, setRemarks]       = useState('Task payment')
  const [paying, setPaying]         = useState(false)
  const [results, setResults]       = useState<any>(null)
  const [sPhone, setSPhone]         = useState('')
  const [sAmount, setSAmount]       = useState('')
  const [sRemarks, setSRemarks]     = useState('Payment')
  const [sPaying, setSPaying]       = useState(false)
  const [topupPhone, setTopupPhone] = useState('')
  const [topupAmount, setTopupAmount] = useState('')
  const [topping, setTopping]       = useState(false)

  useEffect(() => {
    Promise.allSettled([getAgents(), getFinancialReport()]).then(([ag, rp]) => {
      if (ag.status === 'fulfilled') setAgents(Array.isArray(ag.value) ? ag.value : [])
      if (rp.status === 'fulfilled') setReport(rp.value)
      setLoading(false)
    })
  }, [])

  const toggleAgent = (id: string) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  const totalBulk = Array.from(selected).reduce((sum, id) => sum + (Number(amounts[id]) || 0), 0)

  const handleBulkPay = async () => {
    const payments = Array.from(selected)
      .map(agentId => ({ agentId, amount: Number(amounts[agentId]) || 0, remarks }))
      .filter(p => p.amount > 0)
    if (payments.length === 0) return toast.error('Set amounts for selected agents first')
    setPaying(true)
    try {
      const res = await bulkPay(payments)
      setResults(res)
      toast.success(`${res.processed} payments processed · KES ${res.totalPaid?.toLocaleString()}`)
      setSelected(new Set())
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Bulk payment failed') }
    setPaying(false)
  }

  const handleSinglePay = async () => {
    if (!sPhone || !sAmount) return toast.error('Enter phone and amount')
    setSPaying(true)
    try {
      await payAgent({ phone: sPhone, amount: Number(sAmount), remarks: sRemarks })
      toast.success('Payment sent!')
      setSPhone(''); setSAmount('')
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Check Daraja .env credentials') }
    setSPaying(false)
  }

  const handleTopup = async () => {
    if (!topupPhone || !topupAmount) return toast.error('Enter phone and amount')
    setTopping(true)
    try {
      await topupOrgWallet(topupPhone, Number(topupAmount))
      toast.success('STK Push sent! Check your phone to confirm.')
      setTopupPhone(''); setTopupAmount('')
    } catch (e: any) { toast.error(e?.response?.data?.message || 'STK Push failed. Check Daraja credentials.') }
    setTopping(false)
  }

  const summary = report?.summary || {}

  return (
    <div className="fade-in">
      <div style={{ marginBottom:20 }}>
        <h1 style={{ fontSize:20, fontWeight:700 }}>Payments & M-Pesa</h1>
        <p style={{ color:'var(--text-3)', fontSize:13, marginTop:2 }}>
          Pay agents individually or in bulk via M-Pesa Daraja B2C
        </p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:22 }}>
        {[
          { label:'Total paid out', value:`KES ${Number(summary.totalPaid||0).toLocaleString()}`, color:'var(--green)' },
          { label:'Withdrawn',      value:`KES ${Number(summary.totalWithdrawn||0).toLocaleString()}`, color:'var(--info)' },
          { label:'Pending',        value:`KES ${Number(summary.pending||0).toLocaleString()}`, color:'var(--accent)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color:s.color, marginTop:6 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="tabs">
        {([
          { id:'topup',   label:'💳 Load funds (M-Pesa)' },
          { id:'bulk',    label:'👥 Bulk pay agents' },
          { id:'single',  label:'💸 Pay single number' },
          { id:'history', label:'📋 Transaction history' },
        ] as const).map(t => (
          <button key={t.id} className={`tab ${tab===t.id?'active':''}`}
            onClick={() => { setTab(t.id); setResults(null) }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TOPUP: Load funds via STK Push ── */}
      {tab === 'topup' && (
        <div className="card" style={{ padding:24, maxWidth:480 }}>
          <div style={{ fontWeight:700, fontSize:16, marginBottom:6 }}>
            Load funds for agent payments
          </div>
          <p style={{ fontSize:13, color:'var(--text-3)', marginBottom:20, lineHeight:1.7 }}>
            Send an STK Push to your M-Pesa number. Once confirmed, the funds are available
            to pay agents via <strong>Bulk Pay</strong> or <strong>Single Pay</strong>.
          </p>
          <div style={{ padding:'14px 16px', background:'var(--green-pale)', borderRadius:10,
            border:'1px solid var(--green)', marginBottom:20 }}>
            <div style={{ fontWeight:700, fontSize:13, color:'var(--green)', marginBottom:6 }}>
              💚 M-Pesa Paybill (manual alternative)
            </div>
            <div style={{ fontSize:12, color:'var(--text-2)', lineHeight:1.8 }}>
              Paybill: <strong>522533</strong> (Safaricom)<br/>
              Account: Your org reference (visible in Billing page)<br/>
              Payments confirm automatically via webhook.
            </div>
          </div>
          <div style={{ marginBottom:14 }}>
            <label className="lbl">Your M-Pesa phone number</label>
            <input className="inp" type="tel" placeholder="0712 345 678"
              value={topupPhone} onChange={e => setTopupPhone(e.target.value)} />
          </div>
          <div style={{ marginBottom:20 }}>
            <label className="lbl">Amount (KES)</label>
            <input className="inp" type="number" min="100" placeholder="e.g. 5000"
              value={topupAmount} onChange={e => setTopupAmount(e.target.value)} />
          </div>
          <button onClick={handleTopup} disabled={topping || !topupPhone || !topupAmount}
            className="btn btn-primary" style={{ width:'100%', justifyContent:'center', gap:6 }}>
            {topping ? 'Sending...' : '📱 Send M-Pesa STK Push'}
          </button>
          <p style={{ fontSize:11, color:'var(--text-4)', marginTop:10, textAlign:'center' }}>
            A payment prompt will appear on your phone. Enter your PIN to confirm.
          </p>
        </div>
      )}

      {tab === 'bulk' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 300px', gap:16 }}>
          <div className="card" style={{ overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'12px 16px', borderBottom:'1px solid var(--border)', background:'var(--surface)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <input type="checkbox" style={{ cursor:'pointer' }}
                  checked={selected.size === agents.length && agents.length > 0}
                  onChange={() => selected.size === agents.length ? setSelected(new Set()) : setSelected(new Set(agents.map(a => a.id)))} />
                <span style={{ fontSize:13, fontWeight:600 }}>
                  {selected.size > 0 ? `${selected.size} selected` : 'Select agents'}
                </span>
              </div>
              {selected.size > 0 && <span style={{ fontSize:12, color:'var(--green)', fontWeight:600 }}>
                Total: KES {totalBulk.toLocaleString()}
              </span>}
            </div>
            <table className="data-table">
              <thead><tr><th style={{ width:40 }}></th><th>Agent</th><th>Phone</th><th>Level</th><th>Amount (KES)</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={5} style={{ padding:32, textAlign:'center', color:'var(--text-4)' }}>Loading...</td></tr>
                : agents.length === 0 ? <tr><td colSpan={5} style={{ padding:32, textAlign:'center', color:'var(--text-4)' }}>No agents</td></tr>
                : agents.map(a => (
                  <tr key={a.id} onClick={() => toggleAgent(a.id)} style={{ background:selected.has(a.id)?'var(--green-pale)':'var(--white)' }}>
                    <td style={{ paddingLeft:16 }}>
                      <input type="checkbox" style={{ cursor:'pointer' }} checked={selected.has(a.id)}
                        onChange={() => toggleAgent(a.id)} onClick={e => e.stopPropagation()} />
                    </td>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div className="avatar avatar-sm avatar-green">{a.user?.name?.[0]||'A'}</div>
                        <div>
                          <div style={{ fontWeight:500, fontSize:13 }}>{a.user?.name}</div>
                          <div style={{ fontSize:11, color:'var(--text-4)' }}>Lv {a.level} · {a.totalXp} XP</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize:12, color:'var(--text-3)' }}>{a.user?.phone||'—'}</td>
                    <td><span className="badge badge-green">Lv {a.level}</span></td>
                    <td onClick={e => e.stopPropagation()}>
                      <input type="number" min="10" placeholder="0" className="inp"
                        style={{ width:110, padding:'6px 10px', fontSize:12 }}
                        value={amounts[a.id]||''}
                        onChange={e => setAmounts(p => ({...p,[a.id]:e.target.value}))}
                        disabled={!selected.has(a.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <div className="card" style={{ padding:20, marginBottom:14 }}>
              <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>Summary</div>
              {[
                ['Selected agents', selected.size],
                ['With amount', Array.from(selected).filter(id => Number(amounts[id]) > 0).length],
              ].map(([k, v]) => (
                <div key={String(k)} style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:8 }}>
                  <span style={{ color:'var(--text-3)' }}>{k}</span>
                  <span style={{ fontWeight:600 }}>{v}</span>
                </div>
              ))}
              <div className="divider" />
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:15, marginBottom:14 }}>
                <span style={{ fontWeight:600 }}>Total</span>
                <span style={{ fontWeight:800, color:'var(--green)' }}>KES {totalBulk.toLocaleString()}</span>
              </div>

              <label className="lbl">Remarks</label>
              <input className="inp" value={remarks} onChange={e => setRemarks(e.target.value)}
                style={{ marginBottom:10 }} />

              <div style={{ padding:'10px 12px', background:'var(--accent-pale)', borderRadius:8,
                fontSize:11, color:'var(--accent)', lineHeight:1.5, marginBottom:12 }}>
                ⚠️ Set Daraja B2C credentials in <code>.env</code> before paying
              </div>

              <button onClick={handleBulkPay} disabled={paying || selected.size === 0 || totalBulk === 0}
                className="btn btn-primary" style={{ width:'100%', justifyContent:'center' }}>
                {paying ? 'Processing...' : <><Send size={14} /> Send {selected.size} payments</>}
              </button>
            </div>

            {results && (
              <div className="card" style={{ padding:16 }}>
                <div style={{ fontWeight:700, fontSize:13, marginBottom:10 }}>Results</div>
                <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                  <div style={{ flex:1, background:'var(--green-pale)', borderRadius:8, padding:'8px', textAlign:'center' }}>
                    <div style={{ fontWeight:800, color:'var(--green)', fontSize:18 }}>{results.processed}</div>
                    <div style={{ fontSize:10, color:'var(--green)' }}>Sent</div>
                  </div>
                  <div style={{ flex:1, background:'var(--danger-pale)', borderRadius:8, padding:'8px', textAlign:'center' }}>
                    <div style={{ fontWeight:800, color:'var(--danger)', fontSize:18 }}>{results.failed}</div>
                    <div style={{ fontSize:10, color:'var(--danger)' }}>Failed</div>
                  </div>
                </div>
                {results.errors?.map((e: any, i: number) => (
                  <div key={i} style={{ fontSize:11, color:'var(--danger)', marginTop:4 }}>• {e.error}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'single' && (
        <div style={{ maxWidth:460 }}>
          <div className="card" style={{ padding:24 }}>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:20 }}>Pay a phone number directly</div>
            <div style={{ marginBottom:14 }}>
              <label className="lbl">M-Pesa phone</label>
              <input className="inp" type="tel" placeholder="0712345678" value={sPhone} onChange={e => setSPhone(e.target.value)} />
            </div>
            <div style={{ marginBottom:14 }}>
              <label className="lbl">Amount (KES)</label>
              <input className="inp" type="number" min="10" placeholder="1500" value={sAmount} onChange={e => setSAmount(e.target.value)} />
            </div>
            <div style={{ marginBottom:20 }}>
              <label className="lbl">Remarks</label>
              <input className="inp" value={sRemarks} onChange={e => setSRemarks(e.target.value)} />
            </div>
            <div style={{ padding:'12px 14px', background:'var(--surface)', borderRadius:10, fontSize:12, color:'var(--text-3)', marginBottom:16, lineHeight:1.6 }}>
              <strong>Sandbox:</strong> Use test number 254708374149. Set <code>MPESA_ENV=production</code> in .env for live.
            </div>
            <button onClick={handleSinglePay} disabled={sPaying} className="btn btn-primary" style={{ width:'100%', justifyContent:'center' }}>
              {sPaying ? 'Sending...' : <><CreditCard size={14} /> Send payment</>}
            </button>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="card" style={{ overflow:'hidden' }}>
          <div style={{ display:'flex', justifyContent:'space-between', padding:'14px 16px', borderBottom:'1px solid var(--border)' }}>
            <span style={{ fontWeight:700, fontSize:14 }}>Transactions</span>
            <button className="btn btn-ghost" style={{ fontSize:12, gap:5 }}><Download size={12} /> Export CSV</button>
          </div>
          <table className="data-table">
            <thead><tr><th>Description</th><th>Type</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {(report?.transactions||[]).length === 0 ? (
                <tr><td colSpan={5} style={{ padding:32, textAlign:'center', color:'var(--text-4)' }}>No transactions yet</td></tr>
              ) : (report?.transactions||[]).slice(0,20).map((tx: any) => (
                <tr key={tx.id}>
                  <td style={{ fontWeight:500 }}>{tx.description}</td>
                  <td><span className={`badge ${tx.type==='credit'?'badge-green':tx.type==='debit'?'badge-red':'badge-amber'}`}>{tx.type}</span></td>
                  <td style={{ fontWeight:600, color:tx.type==='credit'?'var(--green)':'var(--danger)' }}>
                    {tx.type==='credit'?'+':'-'}KES {Number(tx.amount).toLocaleString()}
                  </td>
                  <td><span className={`badge ${tx.status==='completed'?'badge-green':tx.status==='failed'?'badge-red':'badge-amber'}`}>{tx.status}</span></td>
                  <td style={{ fontSize:12, color:'var(--text-3)' }}>{new Date(tx.createdAt).toLocaleDateString('en-KE',{day:'numeric',month:'short'})}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
