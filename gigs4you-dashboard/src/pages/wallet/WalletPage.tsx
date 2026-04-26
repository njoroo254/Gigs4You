import { useState, useEffect, useCallback } from 'react'
import { Wallet, ArrowDownCircle, ArrowUpCircle, Download, RefreshCw, RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'
import { getOrgWallet, getOrgTransactions, downloadOrgStatement, topupOrgWallet } from '../../api/api'
import { useAuthStore } from '../../store/store'
import { api } from '../../api/api'
import toast from 'react-hot-toast'

const fmt  = (n: any) => Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })
const fmtD = (d: string) => new Date(d).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })

const TYPE_COLOR: Record<string, string> = {
  deposit: 'var(--green)', disbursement: 'var(--danger)', refund: '#6366f1',
}
const TYPE_SIGN: Record<string, string> = {
  deposit: '+', disbursement: '-', refund: '+',
}

export default function WalletPage() {
  const user = useAuthStore(s => s.user)

  const [wallet, setWallet]   = useState<any>(null)
  const [txs, setTxs]         = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [txLoading, setTxLoading] = useState(false)

  // Topup form
  const [showTopup, setShowTopup] = useState(false)
  const [topupPhone, setTopupPhone] = useState('')
  const [topupAmount, setTopupAmount] = useState('')
  const [topuping, setTopuping] = useState(false)

  // Date filter
  const [from, setFrom] = useState('')
  const [to, setTo]     = useState('')

  const fetchWallet = useCallback(async () => {
    try {
      const w = await getOrgWallet()
      setWallet(w)
    } catch { /* wallet may not exist yet */ }
  }, [])

  const fetchTxs = useCallback(async () => {
    setTxLoading(true)
    try {
      const data = await getOrgTransactions({ limit: 100, from: from || undefined, to: to || undefined })
      setTxs(Array.isArray(data) ? data : [])
    } catch {
      setTxs([])
    } finally {
      setTxLoading(false)
    }
  }, [from, to])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchWallet(), fetchTxs()]).finally(() => setLoading(false))
  }, [fetchWallet, fetchTxs])

  const handleTopup = async () => {
    const amount = parseFloat(topupAmount)
    if (!topupPhone.trim()) return toast.error('Enter a phone number')
    if (!amount || amount < 10)  return toast.error('Minimum topup is KES 10')
    setTopuping(true)
    try {
      await topupOrgWallet(topupPhone.trim(), amount)
      toast.success(`STK Push sent to ${topupPhone}. Enter your M-Pesa PIN to confirm.`)
      setShowTopup(false)
      setTopupPhone(''); setTopupAmount('')
      // Refresh after 5 s to pick up the credited balance
      setTimeout(() => fetchWallet(), 5000)
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Topup failed')
    } finally {
      setTopuping(false)
    }
  }

  const handleExport = async () => {
    try {
      await downloadOrgStatement(from || undefined, to || undefined)
      toast.success('Statement downloaded')
    } catch {
      toast.error('Export failed')
    }
  }

  const canTopup = ['super_admin', 'admin', 'manager'].includes(user?.role || '')
  const isAdminOrSA = ['super_admin','admin'].includes(user?.role || '')

  async function reverseTx(txId: string) {
    if (!txId) return
    const ok = window.confirm('Reverse this transaction? This action cannot be undone.')
    if (!ok) return
    try {
      await api.post(`/wallet/admin/reverse/${txId}`)
      toast.success('Transaction reversed')
      // refresh data
      await fetchWallet()
      await fetchTxs()
    } catch (e) {
      toast.error('Reverse failed')
    }
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300, color:'var(--text-4)' }}>
      Loading wallet…
    </div>
  )

  return (
    <div style={{ maxWidth:900, margin:'0 auto' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:800, margin:0 }}>Organisation Wallet</h1>
          <p style={{ margin:'2px 0 0', fontSize:13, color:'var(--text-4)' }}>
            Shared payment pool for agent disbursements
          </p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => { fetchWallet(); fetchTxs() }}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px',
              border:'1px solid var(--border)', borderRadius:8, background:'var(--white)',
              fontSize:13, cursor:'pointer', color:'var(--text-2)' }}>
            <RefreshCw size={14} /> Refresh
          </button>
          {canTopup && (
            <button onClick={() => setShowTopup(true)}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px',
                background:'var(--green)', color:'#fff', border:'none',
                borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>
              <ArrowDownCircle size={14} /> Topup via M-Pesa
            </button>
          )}
        </div>
      </div>

      {/* Balance cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:12, marginBottom:24 }}>
        {[
          { label:'Available Balance', value:`KES ${fmt(wallet?.balance)}`, color:'var(--green)', icon:Wallet },
          { label:'Total Deposited',   value:`KES ${fmt(wallet?.totalDeposited)}`, color:'var(--info)', icon:ArrowDownCircle },
          { label:'Total Disbursed',   value:`KES ${fmt(wallet?.totalDisbursed)}`, color:'var(--danger)', icon:ArrowUpCircle },
        ].map(c => (
          <div key={c.label} style={{ background:'var(--white)', borderRadius:12, padding:'16px 18px',
            border:'1px solid var(--border)', display:'flex', gap:12, alignItems:'flex-start' }}>
            <div style={{ width:36, height:36, borderRadius:10, background:`${c.color}15`,
              display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <c.icon size={18} color={c.color} />
            </div>
            <div>
              <div style={{ fontSize:11, color:'var(--text-4)', marginBottom:2 }}>{c.label}</div>
              <div style={{ fontSize:17, fontWeight:800, color:c.color }}>{c.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Topup modal */}
      {showTopup && (
        <>
          <div onClick={() => setShowTopup(false)}
            style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', zIndex:999 }} />
          <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
            background:'var(--white)', borderRadius:16, padding:28, width:360,
            zIndex:1000, boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin:'0 0 18px', fontWeight:700, fontSize:16 }}>Topup Org Wallet</h3>
            <label style={{ fontSize:12, fontWeight:600, color:'var(--text-3)', display:'block', marginBottom:4 }}>
              M-Pesa Phone
            </label>
            <input value={topupPhone} onChange={e => setTopupPhone(e.target.value)}
              placeholder="2547XXXXXXXX"
              style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid var(--border)',
                fontSize:14, marginBottom:14, boxSizing:'border-box' as const }} />
            <label style={{ fontSize:12, fontWeight:600, color:'var(--text-3)', display:'block', marginBottom:4 }}>
              Amount (KES)
            </label>
            <input value={topupAmount} onChange={e => setTopupAmount(e.target.value)}
              type="number" min={10} placeholder="e.g. 5000"
              style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid var(--border)',
                fontSize:14, marginBottom:20, boxSizing:'border-box' as const }} />
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setShowTopup(false)}
                style={{ flex:1, padding:'9px', borderRadius:8, border:'1px solid var(--border)',
                  background:'none', cursor:'pointer', fontSize:13 }}>Cancel</button>
              <button onClick={handleTopup} disabled={topuping}
                style={{ flex:2, padding:'9px', borderRadius:8, border:'none',
                  background:'var(--green)', color:'#fff', fontSize:13, fontWeight:600,
                  cursor: topuping ? 'not-allowed' : 'pointer', opacity: topuping ? 0.7 : 1 }}>
                {topuping ? 'Sending STK…' : 'Send STK Push'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Transaction history */}
      <div style={{ background:'var(--white)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'14px 18px', borderBottom:'1px solid var(--border)', flexWrap:'wrap', gap:10 }}>
          <span style={{ fontWeight:700, fontSize:14 }}>Transaction History</span>
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              style={{ padding:'5px 8px', border:'1px solid var(--border)', borderRadius:7, fontSize:12 }} />
            <span style={{ fontSize:12, color:'var(--text-4)' }}>to</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              style={{ padding:'5px 8px', border:'1px solid var(--border)', borderRadius:7, fontSize:12 }} />
            <button onClick={handleExport}
              style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 12px',
                border:'1px solid var(--border)', borderRadius:7, background:'none',
                fontSize:12, cursor:'pointer', color:'var(--text-2)' }}>
              <Download size={13} /> Export CSV
            </button>
          </div>
        </div>

        {txLoading ? (
          <div style={{ padding:40, textAlign:'center', color:'var(--text-4)', fontSize:13 }}>Loading…</div>
        ) : txs.length === 0 ? (
          <div style={{ padding:48, textAlign:'center', color:'var(--text-4)', fontSize:13 }}>
            No transactions found
          </div>
              ) : (
                <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'var(--surface)' }}>
                  {['Date', 'Type', 'Description', 'Reference', 'M-Pesa Ref', 'Amount (KES)', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding:'9px 14px', textAlign:'left', fontWeight:600,
                      color:'var(--text-3)', fontSize:11, whiteSpace:'nowrap',
                      borderBottom:'1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {txs.map((tx, i) => (
                  <tr key={tx.id} style={{ background: i % 2 === 0 ? 'var(--white)' : 'var(--surface)' }}>
                    <td style={{ padding:'9px 14px', color:'var(--text-3)', whiteSpace:'nowrap' }}>
                      {fmtD(tx.createdAt)}
                    </td>
                    <td style={{ padding:'9px 14px' }}>
                      <span style={{ padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:600,
                        background:`${TYPE_COLOR[tx.type] || '#888'}18`,
                        color: TYPE_COLOR[tx.type] || '#888' }}>
                        {tx.type}
                      </span>
                    </td>
                    <td style={{ padding:'9px 14px', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {tx.description}
                    </td>
                    <td style={{ padding:'9px 14px', color:'var(--text-4)', fontFamily:'monospace', fontSize:12 }}>
                      {tx.reference || '—'}
                    </td>
                    <td style={{ padding:'9px 14px', color:'var(--text-4)', fontFamily:'monospace', fontSize:12 }}>
                      {tx.mpesaRef || '—'}
                    </td>
                    <td style={{ padding:'9px 14px', fontWeight:700,
                      color: TYPE_COLOR[tx.type] || 'var(--text-1)' }}>
                      {TYPE_SIGN[tx.type] || ''}KES {fmt(tx.amount)}
                    </td>
                    <td style={{ padding:'9px 14px' }}>
                      <span style={{ padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:600,
                        background: tx.status === 'completed' ? 'var(--green-pale)' : tx.status === 'failed' ? 'var(--danger-pale)' : 'var(--accent-pale)',
                        color: tx.status === 'completed' ? 'var(--green)' : tx.status === 'failed' ? 'var(--danger)' : 'var(--accent)' }}>
                        {tx.status}
                      </span>
                    </td>
                    <td style={{ padding:'9px 14px' }}>
                      {isAdminOrSA && tx.status === 'completed' && (
                        <button onClick={() => reverseTx(tx.id)} title="Reverse" className="btn-icon" style={{ background:'transparent', border:'none', padding:6 }}>
                          <RotateCcw size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
