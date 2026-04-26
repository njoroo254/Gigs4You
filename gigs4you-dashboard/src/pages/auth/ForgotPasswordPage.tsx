import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Send, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../../api/api'

type Step = 'request' | 'reset' | 'done'

export default function ForgotPasswordPage() {
  const navigate        = useNavigate()
  const [step, setStep] = useState<Step>('request')
  const [id,   setId]   = useState('')
  const [otp,  setOtp]  = useState('')
  const [pw,   setPw]   = useState('')
  const [pw2,  setPw2]  = useState('')
  const [busy, setBusy] = useState(false)

  const requestReset = async () => {
    if (!id.trim()) return toast.error('Enter your phone, email, or username')
    setBusy(true)
    try {
      await api.post('/auth/forgot-password', { identifier: id.trim() })
      setStep('reset')
      toast.success('Reset code sent to your phone / email')
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to send reset code')
    }
    setBusy(false)
  }

  const doReset = async () => {
    if (!otp.trim())   return toast.error('Enter the reset code')
    if (pw.length < 6) return toast.error('Password must be at least 6 characters')
    if (pw !== pw2)    return toast.error('Passwords do not match')
    setBusy(true)
    try {
      await api.post('/auth/reset-password', { otp: otp.trim(), newPassword: pw })
      setStep('done')
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Invalid or expired code')
    }
    setBusy(false)
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      background:'var(--surface)', fontFamily:'DM Sans, sans-serif', padding:24 }}>
      <div style={{ width:'100%', maxWidth:420 }}>

        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ width:52, height:52, borderRadius:14, background:'var(--green)',
            display:'flex', alignItems:'center', justifyContent:'center',
            margin:'0 auto 12px', fontSize:24 }}>📍</div>
          <h1 style={{ fontSize:22, fontWeight:800, color:'var(--text-1)' }}>Gigs4You</h1>
          <p style={{ fontSize:13, color:'var(--text-3)', marginTop:4 }}>Reset your password</p>
        </div>

        <div style={{ background:'#fff', borderRadius:16, padding:28,
          border:'1px solid var(--border)', boxShadow:'0 4px 24px rgba(0,0,0,0.06)' }}>

          {step === 'request' && (
            <>
              <h2 style={{ fontSize:16, fontWeight:700, marginBottom:6 }}>Forgot password?</h2>
              <p style={{ fontSize:13, color:'var(--text-3)', marginBottom:20 }}>
                Enter your phone number, email, or username and we'll send you a reset code.
              </p>
              <label className="lbl">Phone / Email / Username</label>
              <input className="inp" placeholder="0712 345 678 or name@email.com"
                value={id} onChange={e => setId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && requestReset()}
                autoFocus style={{ marginBottom:16 }} />
              <button onClick={requestReset} disabled={busy}
                className="btn btn-primary" style={{ width:'100%', justifyContent:'center', gap:6 }}>
                <Send size={14} /> {busy ? 'Sending…' : 'Send reset code'}
              </button>
            </>
          )}

          {step === 'reset' && (
            <>
              <h2 style={{ fontSize:16, fontWeight:700, marginBottom:6 }}>Enter reset code</h2>
              <p style={{ fontSize:13, color:'var(--text-3)', marginBottom:20 }}>
                Check your phone or email for the 6-digit code. It expires in 15 minutes.
              </p>
              <label className="lbl">Reset code (6 digits)</label>
              <input className="inp" placeholder="123456" maxLength={6}
                value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g,''))}
                autoFocus style={{ marginBottom:12, letterSpacing:6, fontSize:20, textAlign:'center' }} />
              <label className="lbl">New password</label>
              <input className="inp" type="password" placeholder="Min. 6 characters"
                value={pw} onChange={e => setPw(e.target.value)} style={{ marginBottom:12 }} />
              <label className="lbl">Confirm new password</label>
              <input className="inp" type="password" placeholder="Repeat password"
                value={pw2} onChange={e => setPw2(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && doReset()}
                style={{ marginBottom:16 }} />
              <button onClick={doReset} disabled={busy}
                className="btn btn-primary" style={{ width:'100%', justifyContent:'center' }}>
                {busy ? 'Resetting…' : 'Reset password'}
              </button>
              <button onClick={() => setStep('request')}
                style={{ width:'100%', marginTop:8, background:'none', border:'none',
                  color:'var(--text-3)', fontSize:12, cursor:'pointer' }}>
                Didn't receive the code? Try again
              </button>
            </>
          )}

          {step === 'done' && (
            <div style={{ textAlign:'center', padding:'16px 0' }}>
              <CheckCircle size={48} color="var(--green)" style={{ marginBottom:12 }} />
              <h2 style={{ fontSize:16, fontWeight:700, marginBottom:8 }}>Password reset!</h2>
              <p style={{ fontSize:13, color:'var(--text-3)', marginBottom:20 }}>
                Your password has been updated. You can now log in.
              </p>
              <button onClick={() => navigate('/login')}
                className="btn btn-primary" style={{ width:'100%', justifyContent:'center' }}>
                Go to login
              </button>
            </div>
          )}

          <button onClick={() => navigate('/login')}
            style={{ display:'flex', alignItems:'center', gap:5, margin:'16px auto 0',
              background:'none', border:'none', color:'var(--text-3)',
              fontSize:12, cursor:'pointer' }}>
            <ArrowLeft size={12} /> Back to login
          </button>
        </div>
      </div>
    </div>
  )
}
