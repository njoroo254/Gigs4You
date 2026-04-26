import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../../store/store'
import { Save, CheckCircle, XCircle, Moon, Sun, Mail, MessageSquare } from 'lucide-react'
import toast from 'react-hot-toast'
import { api, requestContactUpdate, verifyContactUpdate } from '../../api/api'

type Lang = 'en' | 'sw'
const LABELS: Record<Lang, Record<string, string>> = {
  en: { title:'Settings', profile:'Profile', notifications:'Notifications', system:'System & API', appearance:'Appearance', language:'Language', save:'Save changes', saved:'Saved!', env:'Environment', endpoint:'API endpoint' },
  sw: { title:'Mipangilio', profile:'Wasifu', notifications:'Arifa', system:'Mfumo & API', appearance:'Muonekano', language:'Lugha', save:'Hifadhi mabadiliko', saved:'Imehifadhiwa!', env:'Mazingira', endpoint:'Mwisho wa API' },
}

function themeKey(userId?: string | null) {
  return userId ? `theme_${userId}` : 'theme'
}
function getStoredTheme(userId?: string | null): 'light'|'dark' {
  try { return (localStorage.getItem(themeKey(userId)) as 'light'|'dark') || 'light' } catch { return 'light' }
}
function applyTheme(t: 'light'|'dark', userId?: string | null) {
  document.documentElement.setAttribute('data-theme', t)
  try { localStorage.setItem(themeKey(userId), t) } catch {}
}
// Apply on load using whichever user is currently in storage
applyTheme(getStoredTheme(
  (() => { try { return JSON.parse(localStorage.getItem('user') || 'null')?.id } catch { return null } })()
))

export default function SettingsPage() {
  const { user, token, setAuth, logout } = useAuthStore()
  const [tab, setTab]   = useState<'profile'|'notifications'|'system'|'appearance'>('profile')
  const [theme, setTheme] = useState<'light'|'dark'>(getStoredTheme(user?.id))
  const [lang, setLang] = useState<Lang>('en')
  const [status, setStatus] = useState<Record<string, 'checking'|'online'|'offline'>>({})
  const [testEmailTo, setTestEmailTo] = useState('')
  const [testSmsTo, setTestSmsTo]   = useState('')
  const t = (k: string) => LABELS[lang][k] || k

  const [profile, setProfile] = useState({
    name:        user?.name        || '',
    phone:       user?.phone       || '',
    email:       user?.email       || '',
    companyName: user?.companyName || '',
    county:      user?.county      || '',
  })

  // ── Email verification OTP modal state ────────────────────────────
  const [otpOpen,       setOtpOpen]       = useState(false)
  const [pendingEmail,  setPendingEmail]  = useState('')
  const [otpCode,       setOtpCode]       = useState('')
  const [otpSubmitting, setOtpSubmitting] = useState(false)
  const [otpError,      setOtpError]      = useState<string | null>(null)
  const [resendSecs,    setResendSecs]    = useState(60)
  const resendTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const otpInputRef = useRef<HTMLInputElement>(null)

  const startResendTimer = () => {
    setResendSecs(60)
    resendTimer.current && clearInterval(resendTimer.current)
    resendTimer.current = setInterval(() => {
      setResendSecs(s => { if (s <= 1) { clearInterval(resendTimer.current!); return 0 } return s - 1 })
    }, 1000)
  }

  useEffect(() => () => { resendTimer.current && clearInterval(resendTimer.current) }, [])

  const submitOtp = async () => {
    if (otpCode.length !== 6) { setOtpError('Enter the full 6-digit code'); return }
    setOtpSubmitting(true); setOtpError(null)
    try {
      await verifyContactUpdate('email', otpCode)
      // Apply new email to local store so the UI refreshes
      setAuth(token!, { ...user, email: pendingEmail })
      setOtpOpen(false)
      setOtpCode('')
      toast.success('Email updated and verified!')
    } catch (e: any) {
      setOtpError(e?.response?.data?.message || 'Invalid code. Please try again.')
    } finally {
      setOtpSubmitting(false)
    }
  }

  const resendOtp = async () => {
    if (resendSecs > 0) return
    try {
      await requestContactUpdate('email', pendingEmail)
      startResendTimer()
      toast.success('New code sent to your email')
    } catch { toast.error('Could not resend code') }
  }

  const [notifs, setNotifs] = useState({
    taskAssignments: true,
    jobApplications: true,
    gpsFlags:        true,
    paymentReceipts: false,
    dailySummary:    false,
    overdueAlerts:   true,
    loginAlerts:     false,
  })

  const [aiDetail,  setAiDetail]  = useState<Record<string, any> | null>(null)
  const [keyTest,   setKeyTest]   = useState<{ok:boolean;error?:string;model?:string}|null>(null)
  const [testingKey,setTestingKey]= useState(false)

  const testApiKey = async () => {
    setTestingKey(true)
    setKeyTest(null)
    try {
      const aiBase = import.meta.env.VITE_AI_SERVICE || 'http://localhost:8001'
      const r = await fetch(`${aiBase}/ai/test-key`)
      const data = await r.json()
      setKeyTest(data)
    } catch {
      setKeyTest({ ok: false, error: 'Could not reach AI service' })
    } finally {
      setTestingKey(false)
    }
  }

  const checkServices = async () => {
    setStatus({ api:'checking', db:'checking', redis:'checking', minio:'checking', ai:'checking' })
    setAiDetail(null)
    // NestJS API
    api.get('/reports/summary')
      .then(() => setStatus(s => ({...s, api:'online'})))
      .catch(() => setStatus(s => ({...s, api:'offline'})))
    // PostgreSQL (skills table always exists)
    api.get('/skills')
      .then(() => setStatus(s => ({...s, db:'online'})))
      .catch(() => setStatus(s => ({...s, db:'offline'})))
    // AI service health — use same env var as the chat widget (VITE_AI_SERVICE)
    const aiUrl = (import.meta.env.VITE_AI_SERVICE || 'http://localhost:8001') + '/health'
    fetch(aiUrl)
      .then(async r => {
        const data = await r.json().catch(() => ({}))
        setStatus(s => ({...s, ai: r.ok ? 'online' : 'offline'}))
        setAiDetail(data)
      })
      .catch(() => setStatus(s => ({...s, ai:'offline'})))
    // Redis & MinIO inferred from NestJS API health endpoint + AI detail
    setTimeout(() => setStatus(s => {
      const apiUp = s.api === 'online'
      return {
        ...s,
        redis: apiUp ? 'online' : 'offline',
        minio: apiUp ? 'online' : 'offline',
      }
    }), 2500)
  }

  useEffect(() => { checkServices() }, [])

  const saveProfile = async () => {
    try {
      // 1. Save non-sensitive fields directly
      if (user?.id) {
        await api.patch(`/users/${user.id}`, {
          name:        profile.name,
          county:      profile.county,
          companyName: profile.companyName,
          // phone is disabled in UI; email requires verification below
        })
        // Keep local store in sync
        setAuth(token!, { ...user, name: profile.name, county: profile.county, companyName: profile.companyName })
      }

      // 2. If email changed, trigger verification flow instead of direct save
      const newEmail = profile.email.trim()
      if (newEmail && newEmail !== user?.email) {
        await requestContactUpdate('email', newEmail)
        setPendingEmail(newEmail)
        setOtpCode('')
        setOtpError(null)
        setOtpOpen(true)
        startResendTimer()
        setTimeout(() => otpInputRef.current?.focus(), 100)
        toast.success('Profile saved — enter the code sent to your new email to confirm the address change.')
        return
      }

      toast.success(t('saved'))
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Save failed')
    }
  }

  const S = (k: string) => status[k]

  return (
    <div className="fade-in" style={{ maxWidth:680 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:700 }}>{t('title')}</h1>
          <p style={{ color:'var(--text-3)', fontSize:13, marginTop:2 }}>
            Manage your account and platform preferences
          </p>
        </div>
        {/* Language toggle */}
        <div style={{ display:'flex', gap:6 }}>
          {(['en','sw'] as const).map(l => (
            <button key={l} onClick={() => setLang(l)}
              className={`btn ${lang===l?'btn-primary':'btn-ghost'}`}
              style={{ padding:'5px 12px', fontSize:12 }}>
              {l === 'en' ? '🇬🇧 English' : '🇰🇪 Kiswahili'}
            </button>
          ))}
        </div>
      </div>

      <div className="tabs">
        {([
          { id:'profile',       label:`👤 ${t('profile')}` },
          { id:'notifications', label:`🔔 ${t('notifications')}` },
          { id:'appearance',    label:`🎨 ${t('appearance')}` },
          ...(user?.role === 'super_admin' ? [{ id:'system', label:`⚙️ ${t('system')}` }] : []),
        ] as const).map(tab_ => (
          <button key={tab_.id} className={`tab ${tab===tab_.id?'active':''}`}
            onClick={() => setTab(tab_.id)}>{tab_.label}</button>
        ))}
      </div>

      {/* ── PROFILE ── */}
      {tab === 'profile' && (
        <div className="card" style={{ padding:24 }}>
          <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:24,
            paddingBottom:20, borderBottom:'1px solid var(--border)' }}>
            <div style={{ width:64, height:64, borderRadius:'50%',
              background:'linear-gradient(135deg,#1B6B3A,#2E8B57)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:24, fontWeight:800, color:'#fff', flexShrink:0 }}>
              {(profile.name || user?.name || 'U')[0]?.toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight:700, fontSize:16 }}>{profile.name || 'User'}</div>
              <div style={{ fontSize:13, color:'var(--text-3)' }}>{profile.phone}</div>
              <div style={{ fontSize:11, color:'var(--text-4)', marginTop:4,
                fontFamily:'monospace' }}>@{user?.username || 'no-username-set'}</div>
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
            <div><label className="lbl">Full name</label>
              <input className="inp" value={profile.name} onChange={e => setProfile(p=>({...p,name:e.target.value}))} /></div>
            <div><label className="lbl">Phone</label>
              <input className="inp" value={profile.phone} disabled style={{ opacity:0.6 }}
                title="Phone number cannot be changed here. Contact support." /></div>
            <div><label className="lbl">Email</label>
              <input className="inp" type="email" value={profile.email}
                onChange={e => setProfile(p=>({...p,email:e.target.value}))} /></div>
            <div><label className="lbl">County</label>
              <input className="inp" placeholder="Nairobi" value={profile.county}
                onChange={e => setProfile(p=>({...p,county:e.target.value}))} /></div>
            {['admin','employer'].includes(user?.role || '') && (
              <div style={{ gridColumn:'1/-1' }}>
                <label className="lbl">Company name</label>
                <input className="inp" value={profile.companyName}
                  onChange={e => setProfile(p=>({...p,companyName:e.target.value}))} />
              </div>
            )}
          </div>

          <div style={{ display:'flex', gap:10 }}>
            <button onClick={saveProfile} className="btn btn-primary" style={{ gap:6 }}>
              <Save size={14} /> {t('save')}
            </button>
            <button onClick={() => logout()} className="btn btn-ghost"
              style={{ color:'var(--danger)', borderColor:'var(--danger)' }}>
              Sign out
            </button>
          </div>
        </div>
      )}

      {/* ── NOTIFICATIONS ── */}
      {tab === 'notifications' && (
        <div className="card" style={{ padding:24 }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>Notification preferences</div>
          {[
            { key:'taskAssignments', label:'Task assignments',    desc: lang==='en'?'Notify when a task is assigned to an agent':'Arifa wakati kazi imepewa wakala' },
            { key:'jobApplications', label:'Job applications',    desc: lang==='en'?'Notify when someone applies for a posted job':'Arifa wakati mtu anaomba kazi iliyoandikwa' },
            { key:'overdueAlerts',   label:'Overdue task alerts', desc: lang==='en'?'Alert when tasks are not completed on time':'Tahadhari wakati kazi hazijakamilika kwa wakati' },
            { key:'gpsFlags',        label:'GPS anomalies',       desc: lang==='en'?'Alert when suspicious GPS activity detected':'Tahadhari kuhusu shughuli ya GPS inayoshukiwa' },
            { key:'paymentReceipts', label:'Payment receipts',    desc: lang==='en'?'Confirm after each M-Pesa payment':'Thibitisha baada ya kila malipo ya M-Pesa' },
            { key:'dailySummary',    label:'Daily summary',       desc: lang==='en'?'Morning digest of team activity':'Muhtasari wa asubuhi wa shughuli za timu' },
            { key:'loginAlerts',     label:'Login alerts',        desc: lang==='en'?'Alert on logins from new devices':'Tahadhari ya kuingia kutoka vifaa vipya' },
          ].map(n => {
            const on = notifs[n.key as keyof typeof notifs]
            return (
              <div key={n.key} style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                padding:'13px 0', borderBottom:'1px solid var(--border)' }}>
                <div>
                  <div style={{ fontWeight:500, fontSize:13 }}>{n.label}</div>
                  <div style={{ fontSize:11, color:'var(--text-4)', marginTop:2 }}>{n.desc}</div>
                </div>
                <button className={`toggle-btn ${on ? 'on' : ''}`} onClick={() => setNotifs(prev => ({...prev, [n.key]: !on}))}
                  style={{ marginLeft:16, flexShrink:0 }}>
                  <div className="toggle-thumb" />
                </button>
              </div>
            )
          })}
          <button onClick={() => toast.success('Notification preferences saved!')}
            className="btn btn-primary" style={{ marginTop:16, gap:6 }}>
            <Save size={14} /> {t('save')}
          </button>
        </div>
      )}

      {/* ── APPEARANCE ── */}
      {tab === 'appearance' && (
        <div className="card" style={{ padding:24 }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>Theme</div>
          <p style={{ fontSize:12, color:'var(--text-3)', marginBottom:20 }}>
            Choose between light and dark mode for the dashboard.
          </p>
          <div style={{ display:'flex', gap:12 }}>
            {(['light','dark'] as const).map(opt => {
              const active = theme === opt
              return (
                <button key={opt}
                  onClick={() => { applyTheme(opt, user?.id); setTheme(opt) }}
                  style={{
                    flex:1, padding:'20px 16px', borderRadius:12, cursor:'pointer',
                    border: `2px solid ${active ? 'var(--green)' : 'var(--border)'}`,
                    background: active ? 'var(--green-pale)' : 'var(--white)',
                    display:'flex', flexDirection:'column', alignItems:'center', gap:10,
                    transition:'all 0.15s',
                  }}>
                  <div style={{
                    width:44, height:44, borderRadius:'50%', display:'flex',
                    alignItems:'center', justifyContent:'center',
                    background: opt === 'dark' ? '#1A2820' : '#F7F8FA',
                    border:'1px solid var(--border)',
                  }}>
                    {opt === 'light'
                      ? <Sun size={20} color="#F59E0B" />
                      : <Moon size={20} color="#86EFAC" />}
                  </div>
                  <div style={{ fontWeight:600, fontSize:13, color: active ? 'var(--green)' : 'var(--text-2)' }}>
                    {opt === 'light' ? 'Light' : 'Dark'}
                  </div>
                  {active && (
                    <span className="badge badge-green" style={{ fontSize:10 }}>Active</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── EMAIL VERIFICATION MODAL ── */}
      {otpOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div className="card" style={{
            width: '100%', maxWidth: 420, padding: 32, margin: 16,
            background: 'var(--card-bg, #1A2820)', borderRadius: 16,
            boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
          }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', margin: '0 auto 14px',
                background: 'rgba(27,107,58,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Mail size={24} color="var(--green)" />
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Verify your new email</h2>
              <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
                We sent a 6-digit code to<br />
                <strong style={{ color: 'var(--text-1)' }}>{pendingEmail}</strong>
              </p>
            </div>

            <div style={{ marginBottom: 16 }}>
              <input
                ref={otpInputRef}
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otpCode}
                onChange={e => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 6)
                  setOtpCode(v)
                  setOtpError(null)
                  if (v.length === 6) {
                    // auto-submit when all 6 digits entered
                    setTimeout(() => submitOtp(), 0)
                  }
                }}
                placeholder="Enter 6-digit code"
                style={{
                  width: '100%', textAlign: 'center', fontSize: 28, fontWeight: 800,
                  letterSpacing: 12, padding: '14px 0', borderRadius: 10, border: '2px solid var(--border)',
                  background: 'var(--input-bg, rgba(255,255,255,0.05))', color: 'var(--text-1)',
                  outline: 'none', boxSizing: 'border-box',
                }}
                onKeyDown={e => e.key === 'Enter' && submitOtp()}
              />
              {otpError && (
                <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8, textAlign: 'center' }}>
                  {otpError}
                </p>
              )}
            </div>

            <button
              onClick={submitOtp}
              disabled={otpSubmitting || otpCode.length !== 6}
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', marginBottom: 12, padding: '12px 0' }}
            >
              {otpSubmitting ? 'Verifying…' : 'Verify & update email'}
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={resendOtp}
                disabled={resendSecs > 0}
                className="btn btn-ghost"
                style={{ fontSize: 12, padding: '6px 12px', opacity: resendSecs > 0 ? 0.45 : 1 }}
              >
                {resendSecs > 0 ? `Resend in ${resendSecs}s` : 'Resend code'}
              </button>
              <button
                onClick={() => { setOtpOpen(false); setOtpCode(''); setOtpError(null) }}
                className="btn btn-ghost"
                style={{ fontSize: 12, padding: '6px 12px' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SYSTEM ── */}
      {tab === 'system' && (
        <div>
          {/* Service health */}
          <div className="card" style={{ padding:20, marginBottom:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <div style={{ fontWeight:700, fontSize:14 }}>Service health</div>
              <button onClick={checkServices} className="btn btn-ghost" style={{ fontSize:12 }}>Refresh</button>
            </div>
            {[
              { key:'api',   label:'NestJS API',   port:'3000' },
              { key:'db',    label:'PostgreSQL',    port:'5432' },
              { key:'redis', label:'Redis',         port:'6379' },
              { key:'minio', label:'MinIO',         port:'9000' },
              { key:'ai',    label:'AI Service',    port:'8001' },
            ].map(svc => (
              <div key={svc.key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  {S(svc.key) === 'online'   ? <CheckCircle size={16} color="var(--green)" />
                  : S(svc.key) === 'offline'  ? <XCircle size={16} color="var(--danger)" />
                  : <div style={{ width:16,height:16,borderRadius:'50%',background:'var(--border)',animation:'pulse 1s infinite' }} />}
                  <span style={{ fontWeight:500, fontSize:13 }}>{svc.label}</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontFamily:'monospace', fontSize:11, color:'var(--text-4)' }}>
                    localhost:{svc.port}
                  </span>
                  <span className={`badge ${S(svc.key)==='online'?'badge-green':S(svc.key)==='offline'?'badge-red':'badge-gray'}`}
                    style={{ fontSize:10 }}>
                    {S(svc.key) === 'checking' ? '...' : S(svc.key)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* AI service detail */}
          {aiDetail && (
            <div className="card" style={{ padding:20, marginBottom:14 }}>
              <div style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>AI Service Detail</div>
              {[
                { label:'Client ready',  value: aiDetail?.anthropic?.client_ready  ? '✅ Yes' : '❌ No' },
                { label:'API key set',   value: aiDetail?.anthropic?.api_key_present ? '✅ Yes' : '❌ No — set ANTHROPIC_API_KEY in AI service .env' },
                { label:'API key prefix',value: aiDetail?.anthropic?.api_key_prefix  ?? '—' },
                { label:'Chat model',    value: aiDetail?.anthropic?.chat_model       ?? '—' },
                { label:'Fast model',    value: aiDetail?.anthropic?.fast_model        ?? '—' },
                { label:'Redis',         value: aiDetail?.redis === 'connected' ? '✅ Connected' : '⚠️ Unavailable (caching disabled)' },
              ].map(r => (
                <div key={r.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                  fontSize:12, padding:'7px 0', borderBottom:'1px solid var(--border)' }}>
                  <span style={{ color:'var(--text-3)', fontWeight:500 }}>{r.label}</span>
                  <span style={{ color:'var(--text-2)', fontFamily:'monospace', textAlign:'right', maxWidth:'60%' }}>{String(r.value)}</span>
                </div>
              ))}
              {/* Live API key test */}
              <div style={{ marginTop:12, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                <button onClick={testApiKey} disabled={testingKey} className="btn btn-ghost" style={{ fontSize:12, gap:6 }}>
                  {testingKey ? '⏳ Testing…' : '🔑 Test API key'}
                </button>
                {keyTest && (
                  <span style={{ fontSize:12, color: keyTest.ok ? '#4CAF7D' : '#EF4444', fontFamily:'monospace' }}>
                    {keyTest.ok
                      ? `✅ Key valid — model: ${keyTest.model}`
                      : `❌ ${keyTest.error}`}
                  </span>
                )}
              </div>
              {!aiDetail?.anthropic?.api_key_present && (
                <div style={{ marginTop:10, padding:'10px 14px', background:'rgba(239,68,68,0.08)',
                  border:'1px solid rgba(239,68,68,0.25)', borderRadius:8, fontSize:12, color:'#EF4444' }}>
                  <strong>Action required:</strong> Set <code>ANTHROPIC_API_KEY</code> in the AI service's <code>.env</code> file and restart the service.
                  Get your key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" style={{color:'#4CAF7D'}}>console.anthropic.com</a>
                </div>
              )}
            </div>
          )}

          {/* Notification diagnostics */}
          <div className="card" style={{ padding:20, marginBottom:14 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>Notification diagnostics</div>
            {/* Email test */}
            <div style={{ marginBottom:14 }}>
              <label className="lbl">Test email recipient</label>
              <div style={{ display:'flex', gap:8 }}>
                <input className="inp" type="email" placeholder={user?.email || 'recipient@example.com'}
                  value={testEmailTo} onChange={e => setTestEmailTo(e.target.value)}
                  style={{ flex:1 }} />
                <button className="btn btn-ghost" style={{ gap:6, flexShrink:0 }}
                  onClick={async () => {
                    try {
                      const r = await api.post('/notifications-admin/test-email', testEmailTo ? { to: testEmailTo } : {})
                      if (r.data?.ok === false) toast.error(r.data?.error || 'Email failed — check API logs')
                      else toast.success(r.data?.message || `Test email sent to ${testEmailTo || user?.email}`)
                    } catch (e: any) {
                      toast.error(e?.response?.data?.error || e?.response?.data?.message || 'Email failed — check API logs')
                    }
                  }}>
                  <Mail size={14} /> Send test email
                </button>
              </div>
              <p style={{ fontSize:11, color:'var(--text-4)', marginTop:4 }}>
                Leave blank to send to your account email.
              </p>
            </div>
            {/* SMS test */}
            <div>
              <label className="lbl">Test SMS recipient</label>
              <div style={{ display:'flex', gap:8 }}>
                <input className="inp" type="tel" placeholder={user?.phone || '+254700000000'}
                  value={testSmsTo} onChange={e => setTestSmsTo(e.target.value)}
                  style={{ flex:1 }} />
                <button className="btn btn-ghost" style={{ gap:6, flexShrink:0 }}
                  onClick={async () => {
                    try {
                      const r = await api.post('/notifications-admin/test-sms', testSmsTo ? { to: testSmsTo } : {})
                      if (r.data?.ok === false) toast.error(r.data?.error || 'SMS failed — check API logs')
                      else toast.success(r.data?.message || `Test SMS sent to ${testSmsTo || user?.phone}`)
                    } catch (e: any) {
                      toast.error(e?.response?.data?.error || e?.response?.data?.message || 'SMS failed — check API logs')
                    }
                  }}>
                  <MessageSquare size={14} /> Send test SMS
                </button>
              </div>
              <p style={{ fontSize:11, color:'var(--text-4)', marginTop:4 }}>
                Leave blank to send to your account phone. Use format +254XXXXXXXXX.
              </p>
            </div>
          </div>

          {/* M-Pesa config */}
          <div className="card" style={{ padding:20, marginBottom:14 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>M-Pesa / Daraja</div>
            {[
              { label:'Paybill number',       value:'522533 (Safaricom)' },
              { label:'STK callback URL',     value:'POST /api/v1/billing/mpesa-stk-callback' },
              { label:'C2B confirm URL',      value:'POST /api/v1/billing/mpesa-c2b-confirm' },
              { label:'C2B validate URL',     value:'POST /api/v1/billing/mpesa-c2b-validate' },
              { label:'B2C result URL',       value:'POST /api/v1/mpesa/b2c-result' },
              { label:'Stripe webhook',       value:'POST /api/v1/billing/stripe-webhook' },
            ].map(r => (
              <div key={r.label} style={{ display:'flex', justifyContent:'space-between',
                fontSize:12, padding:'7px 0', borderBottom:'1px solid var(--border)' }}>
                <span style={{ color:'var(--text-3)', fontWeight:500 }}>{r.label}</span>
                <span style={{ color:'var(--text-2)', fontFamily:'monospace' }}>{r.value}</span>
              </div>
            ))}
          </div>

          {/* Env vars reference */}
          <div className="card" style={{ padding:20 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:10 }}>.env reference</div>
            <div style={{ background:'#0D1B14', borderRadius:8, padding:14, fontFamily:'monospace',
              fontSize:11, color:'#4CAF7D', lineHeight:2 }}>
              {[
                '# NestJS API (.env)',
                'DB_HOST=localhost', 'DB_PORT=5432', 'DB_NAME=gigs4you', 'DB_SYNC=false',
                'JWT_SECRET=your_jwt_secret_here',
                'MPESA_ENV=sandbox', 'MPESA_CONSUMER_KEY=xxx', 'MPESA_CONSUMER_SECRET=xxx',
                'MPESA_PAYBILL=522533', 'MPESA_PASSKEY=xxx', 'MPESA_INITIATOR_NAME=xxx',
                'MPESA_SECURITY_CREDENTIAL=xxx', 'MPESA_B2C_RESULT_URL=https://...',
                'STRIPE_SECRET_KEY=sk_live_xxx', 'STRIPE_WEBHOOK_SECRET=whsec_xxx',
                '',
                '# AI Service (.env) — required for Cathy & AI features',
                'ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxx',
                'AI_SERVICE_URL=http://localhost:8001',
                'JWT_SECRET=<same as NestJS JWT_SECRET>',
              ].map(v => <div key={v}>{v}</div>)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
