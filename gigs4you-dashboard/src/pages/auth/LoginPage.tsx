import { useState, useEffect, useRef, type FormEvent } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { MapPin, Eye, EyeOff, Building2, User, ChevronRight, CheckCircle, Zap, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  addSystemOption,
  getSystemOptions,
  login,
  register,
  resendVerification,
  verifyContact,
  verifyOtp,
} from '../../api/api'
import { useAuthStore } from '../../store/store'

// Apply the stored theme for the given user immediately after login so the
// dashboard never flashes the previous user's theme.
function applyUserTheme(user: any) {
  try {
    const key = user?.id ? `theme_${user.id}` : 'theme'
    const t = (localStorage.getItem(key) as 'light'|'dark') || 'light'
    document.documentElement.setAttribute('data-theme', t)
  } catch { /* ignore */ }
}

type View = 'login' | 'otp' | 'verify-account' | 'register-choice' | 'register-employer' | 'register-worker'
type VerificationType = 'phone' | 'email'

const PLAN_LABELS: Record<string, { name: string; price: string; color: string }> = {
  free:       { name: 'Free Trial',  price: 'KES 0/mo',     color: '#6b7280' },
  starter:    { name: 'Starter',     price: 'KES 2,999/mo', color: '#2563eb' },
  growth:     { name: 'Growth',      price: 'KES 7,999/mo', color: '#16a34a' },
  scale:      { name: 'Scale',       price: 'KES 19,999/mo',color: '#7c3aed' },
  enterprise: { name: 'Enterprise',  price: 'Custom',       color: '#ea580c' },
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const selectedPlan    = searchParams.get('plan') || ''
  const selectedBilling = searchParams.get('billing') || 'monthly'

  const setAuth  = useAuthStore(s => s.setAuth)
  const [view, setView]     = useState<View>('login')
  const [show, setShow]     = useState(false)
  const [loading, setLoading] = useState(false)

  // 2FA state
  const [challengeToken, setChallengeToken] = useState('')
  const [otpEmail, setOtpEmail]             = useState('')
  const [otpCode, setOtpCode]               = useState('')
  const otpRef = useRef<HTMLInputElement>(null)
  const [verificationToken, setVerificationToken] = useState('')
  const [verificationCode, setVerificationCode]   = useState('')
  const [verificationType, setVerificationType]   = useState<VerificationType>('phone')
  const [verificationRemaining, setVerificationRemaining] = useState<VerificationType[]>(['phone'])
  const [verificationTotalSteps, setVerificationTotalSteps] = useState(1)
  const [postVerificationPath, setPostVerificationPath] = useState('/dashboard')
  const verificationRef = useRef<HTMLInputElement>(null)

  const [loginForm, setLoginForm] = useState({ identifier: '', password: '' })

  const [empForm, setEmpForm] = useState({
    name: '', phone: '', email: '', password: '', confirmPassword: '',
    companyName: '', industry: '', county: '', website: '',
    contactPerson: '', role: 'manager',
  })

  const [workerForm, setWorkerForm] = useState({
    name: '', phone: '', email: '', password: '', confirmPassword: '',
    county: '', bio: '', role: 'agent',
  })

  const [customIndustries, setCustomIndustries]   = useState<string[]>([])
  const [customCounties, setCustomCounties]       = useState<string[]>([])
  const [empOtherIndustry, setEmpOtherIndustry]   = useState('')
  const [empOtherCounty, setEmpOtherCounty]       = useState('')
  const [workerOtherCounty, setWorkerOtherCounty] = useState('')

  useEffect(() => {
    getSystemOptions('industry').then(setCustomIndustries).catch(() => {})
    getSystemOptions('county').then(setCustomCounties).catch(() => {})
    // If coming from website with a plan pre-selected, go straight to employer registration
    if (selectedPlan && selectedPlan !== 'free' && selectedPlan !== 'enterprise') {
      setView('register-employer')
    }
  }, [])

  const getPostRegistrationPath = () => (
    selectedPlan && selectedPlan !== 'free' && selectedPlan !== 'enterprise'
      ? `/billing?autoUpgrade=${selectedPlan}&billing=${selectedBilling}`
      : '/dashboard'
  )

  const finishSignedIn = (data: any, nextPath = '/dashboard') => {
    setAuth(data.access_token, data.user)
    applyUserTheme(data.user)
    navigate(nextPath)
  }

  const beginAccountVerification = (data: any, nextPath = '/dashboard') => {
    const remaining: VerificationType[] = ['phone']
    if (data.hasEmail) remaining.push('email')

    setVerificationToken(data.verificationToken)
    setVerificationRemaining(remaining)
    setVerificationTotalSteps(remaining.length)
    setVerificationType('phone')
    setVerificationCode('')
    setPostVerificationPath(nextPath)
    setView('verify-account')
    setTimeout(() => verificationRef.current?.focus(), 100)
  }

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    if (!loginForm.identifier || !loginForm.password) return toast.error('Enter your phone, email or username')
    setLoading(true)
    try {
      const data = await login(loginForm.identifier, loginForm.password)
      if (data.requiresVerification) {
        beginAccountVerification(data, '/dashboard')
        toast.success('Verify your account to continue')
      } else if (data.requiresOtp) {
        setChallengeToken(data.challengeToken)
        const maskedEmail = data.otpVia === 'phone'
          ? 'your registered phone number'
          : loginForm.identifier.includes('@')
          ? loginForm.identifier.replace(/(.{2}).+(@.+)/, '$1***$2')
          : 'your registered email address'
        setOtpEmail(maskedEmail)
        setOtpCode('')
        setView('otp')
        setTimeout(() => otpRef.current?.focus(), 100)
      } else {
        finishSignedIn(data)
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Invalid credentials')
    }
    setLoading(false)
  }

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault()
    if (otpCode.length !== 6) return toast.error('Enter the 6-digit verification code')
    setLoading(true)
    try {
      const data = await verifyOtp(challengeToken, otpCode)
      finishSignedIn(data)
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Invalid or expired code — try again')
      setOtpCode('')
      otpRef.current?.focus()
    }
    setLoading(false)
  }

  const handleVerifyAccount = async (e: FormEvent) => {
    e.preventDefault()
    if (verificationCode.length !== 6) return toast.error('Enter the 6-digit verification code')
    setLoading(true)
    try {
      const data = await verifyContact(verificationToken, verificationType, verificationCode)
      if (data.requiresMoreVerification) {
        const remaining = (data.remaining || []) as VerificationType[]
        setVerificationToken(data.verificationToken || verificationToken)
        setVerificationRemaining(remaining)
        setVerificationType(remaining[0] || 'phone')
        setVerificationCode('')
        toast.success(`Your ${verificationType === 'phone' ? 'phone number' : 'email address'} is verified`)
        setTimeout(() => verificationRef.current?.focus(), 100)
      } else {
        toast.success('Account verified successfully')
        finishSignedIn(data, postVerificationPath)
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Invalid or expired verification code')
      setVerificationCode('')
      verificationRef.current?.focus()
    }
    setLoading(false)
  }

  const handleResendVerification = async () => {
    setLoading(true)
    try {
      await resendVerification(verificationToken, verificationType)
      toast.success(`A new code was sent to your ${verificationType === 'phone' ? 'phone number' : 'email address'}`)
      setTimeout(() => verificationRef.current?.focus(), 100)
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not resend verification code')
    }
    setLoading(false)
  }

  const handleEmpRegister = async (e: FormEvent) => {
    e.preventDefault()
    if (!empForm.companyName.trim()) return toast.error('Company name is required')
    if (!empForm.contactPerson.trim()) return toast.error('Contact person is required')
    if (!empForm.industry.trim()) return toast.error('Select your industry')
    if (empForm.password !== empForm.confirmPassword) return toast.error('Passwords do not match')
    if (empForm.password.length < 6) return toast.error('Password must be at least 6 characters')
    if (empForm.industry === 'Other' && !empOtherIndustry.trim()) return toast.error('Please specify your industry')
    if (empForm.county === 'Other' && !empOtherCounty.trim()) return toast.error('Please specify your county')
    setLoading(true)
    try {
      const county = empForm.county === 'Other' ? empOtherCounty.trim() : empForm.county || undefined
      const data = await register({
        name: empForm.contactPerson.trim(),
        phone: empForm.phone,
        email: empForm.email || undefined,
        password: empForm.password,
        role: 'admin',
        companyName: empForm.companyName.trim(),
        county,
      })
      if (empForm.industry === 'Other' && empOtherIndustry.trim()) {
        addSystemOption('industry', empOtherIndustry.trim()).catch(() => {})
        setCustomIndustries(prev => prev.includes(empOtherIndustry.trim()) ? prev : [...prev, empOtherIndustry.trim()])
      }
      if (empForm.county === 'Other' && empOtherCounty.trim()) {
        addSystemOption('county', empOtherCounty.trim()).catch(() => {})
        setCustomCounties(prev => prev.includes(empOtherCounty.trim()) ? prev : [...prev, empOtherCounty.trim()])
      }
      if (data.requiresVerification) {
        beginAccountVerification(data, getPostRegistrationPath())
        toast.success(`Account created for ${empForm.companyName}. Verify it to continue.`)
      } else {
        toast.success(`Welcome to Gigs4You, ${empForm.companyName}!`)
        finishSignedIn(data, getPostRegistrationPath())
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Registration failed')
    }
    setLoading(false)
  }

  const handleWorkerRegister = async (e: FormEvent) => {
    e.preventDefault()
    if (workerForm.password !== workerForm.confirmPassword) return toast.error('Passwords do not match')
    if (workerForm.password.length < 6) return toast.error('Password must be at least 6 characters')
    if (workerForm.county === 'Other' && !workerOtherCounty.trim()) return toast.error('Please specify your county')
    setLoading(true)
    try {
      const county = workerForm.county === 'Other' ? workerOtherCounty.trim() : workerForm.county || undefined
      const data = await register({
        name: workerForm.name,
        phone: workerForm.phone,
        email: workerForm.email || undefined,
        password: workerForm.password,
        role: 'worker',
        county,
      })
      if (workerForm.county === 'Other' && workerOtherCounty.trim()) {
        addSystemOption('county', workerOtherCounty.trim()).catch(() => {})
        setCustomCounties(prev => prev.includes(workerOtherCounty.trim()) ? prev : [...prev, workerOtherCounty.trim()])
      }
      if (data.requiresVerification) {
        beginAccountVerification(data, '/dashboard')
        toast.success(`Account created for ${workerForm.name}. Verify it to continue.`)
      } else {
        toast.success(`Welcome, ${workerForm.name}! Let's find you work.`)
        finishSignedIn(data)
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Registration failed')
    }
    setLoading(false)
  }

  const INDUSTRIES = ['FMCG / Distribution','Microfinance','Solar / Energy','Logistics','Research','Merchandising','Construction','Healthcare','Technology','Other']
  const COUNTIES   = ['Nairobi','Mombasa','Kisumu','Nakuru','Eldoret','Thika','Machakos','Meru','Nyeri','Other']
  const allIndustries = [...INDUSTRIES.filter(i => i !== 'Other'), ...customIndustries.filter(i => !INDUSTRIES.includes(i)), 'Other']
  const allCounties   = [...COUNTIES.filter(c => c !== 'Other'),   ...customCounties.filter(c => !COUNTIES.includes(c)),   'Other']
  const verificationStep = Math.max(1, verificationTotalSteps - verificationRemaining.length + 1)
  const verificationLabel = verificationType === 'phone' ? 'phone number' : 'email address'

  const inp = {
    className: 'inp' as const,
    style: { marginTop: 0 },
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', background:'#020A05', position:'relative', overflow:'hidden' }}>
      {/* Background glow orbs */}
      <div style={{ position:'absolute', width:500, height:500, borderRadius:'50%', background:'rgba(27,107,58,0.18)',
        filter:'blur(100px)', top:-150, left:-100, pointerEvents:'none' }} />
      <div style={{ position:'absolute', width:300, height:300, borderRadius:'50%', background:'rgba(245,158,11,0.08)',
        filter:'blur(80px)', bottom:50, right:100, pointerEvents:'none' }} />
      {/* Dot texture */}
      <div style={{ position:'absolute', inset:0, backgroundImage:'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)',
        backgroundSize:'24px 24px', pointerEvents:'none' }} />

      {/* ── Left panel ──────────────────────────────── */}
      <div style={{
        width: 400, flexShrink:0,
        display:'flex', flexDirection:'column',
        justifyContent:'space-between',
        padding:'48px 40px',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        position:'relative', zIndex:1,
      }}>
        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:'#1B6B3A', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <MapPin size={18} color="#fff" />
          </div>
          <span style={{ color:'#fff', fontSize:18, fontWeight:700 }}>Gigs4You</span>
        </div>

        {/* Headline */}
        <div>
          <h1 style={{ color:'#fff', fontSize:34, fontWeight:800, lineHeight:1.2, marginBottom:16 }}>
            Africa's skills &<br />work platform
          </h1>
          <p style={{ color:'rgba(255,255,255,0.5)', fontSize:14, lineHeight:1.8, marginBottom:32 }}>
            Connect field agents, manage distributed teams, track performance in real time — all in one platform built for Kenya.
          </p>

          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {[
              ['GPS tracking',     'Real-time location of every agent'],
              ['Jobs marketplace', 'Post roles, get skilled applicants'],
              ['M-Pesa wallet',    'Pay workers instantly after job done'],
              ['Performance AI',   'Fraud detection & agent analytics'],
            ].map(([title, desc]) => (
              <div key={title} style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                <CheckCircle size={15} color="#4CAF7D" style={{ flexShrink:0, marginTop:1 }} />
                <div>
                  <div style={{ color:'#fff', fontSize:13, fontWeight:600 }}>{title}</div>
                  <div style={{ color:'rgba(255,255,255,0.4)', fontSize:12 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p style={{ color:'rgba(255,255,255,0.25)', fontSize:11 }}>© 2026 Gigs4You · Nairobi, Kenya</p>
      </div>

      {/* ── Right panel ─────────────────────────────── */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'40px 60px', position:'relative', zIndex:1 }}>

        {/* ── 2FA OTP ───────────────────────────────── */}
        {view === 'verify-account' && (
          <div style={{ width:'100%', maxWidth:440 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
              <ShieldCheck size={28} color="#4CAF7D" />
              <h2 style={{ color:'#fff', fontSize:26, fontWeight:700, margin:0 }}>Verify your account</h2>
            </div>
            <p style={{ color:'rgba(255,255,255,0.45)', fontSize:13, marginBottom:10, lineHeight:1.6 }}>
              Step {verificationStep} of {verificationTotalSteps}. Enter the 6-digit code we sent to your{' '}
              <strong style={{ color:'rgba(255,255,255,0.75)' }}>{verificationLabel}</strong>.
            </p>
            <p style={{ color:'rgba(255,255,255,0.3)', fontSize:12, marginBottom:28 }}>
              Your workspace will activate after all required contacts are verified.
            </p>

            <form onSubmit={handleVerifyAccount}>
              <div style={{ marginBottom:24 }}>
                <label className="lbl" style={{ color:'rgba(255,255,255,0.5)' }}>Verification code</label>
                <input
                  ref={verificationRef}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={verificationCode}
                  onChange={e => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  style={{
                    background:'rgba(255,255,255,0.06)',
                    border:'1.5px solid rgba(255,255,255,0.1)',
                    color:'#fff', width:'100%', padding:'14px',
                    borderRadius:10, fontSize:28, fontWeight:700,
                    letterSpacing:14, textAlign:'center', outline:'none',
                    fontFamily:'monospace',
                  }}
                  onFocus={e => e.target.style.borderColor='#1B6B3A'}
                  onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.1)'}
                />
              </div>

              <button
                type="submit"
                disabled={loading || verificationCode.length !== 6}
                style={{ width:'100%', padding:'12px', background:'#1B6B3A', color:'#fff', border:'none', borderRadius:10, fontSize:15, fontWeight:600, cursor: verificationCode.length === 6 ? 'pointer' : 'not-allowed', opacity: verificationCode.length === 6 ? 1 : 0.5, transition:'all 0.15s' }}
              >
                {loading ? 'Verifying...' : `Verify ${verificationLabel}`}
              </button>

              <button
                type="button"
                onClick={handleResendVerification}
                disabled={loading}
                style={{ width:'100%', marginTop:12, padding:'10px', background:'transparent', color:'#4CAF7D', border:'1px solid rgba(76,175,125,0.35)', borderRadius:10, fontSize:13, cursor:'pointer' }}
              >
                Resend code
              </button>

              <button
                type="button"
                onClick={() => { setView('login'); setVerificationCode('') }}
                style={{ width:'100%', marginTop:12, padding:'10px', background:'transparent', color:'rgba(255,255,255,0.4)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, fontSize:13, cursor:'pointer' }}
              >
                â† Back to sign in
              </button>
            </form>
          </div>
        )}

        {view === 'otp' && (
          <div style={{ width:'100%', maxWidth:420 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
              <ShieldCheck size={28} color="#4CAF7D" />
              <h2 style={{ color:'#fff', fontSize:26, fontWeight:700, margin:0 }}>Verify it's you</h2>
            </div>
            <p style={{ color:'rgba(255,255,255,0.45)', fontSize:13, marginBottom:32, lineHeight:1.6 }}>
              We sent a 6-digit code to <strong style={{ color:'rgba(255,255,255,0.75)' }}>{otpEmail}</strong>.
              Enter it below to complete sign-in.
            </p>

            <form onSubmit={handleVerifyOtp}>
              <div style={{ marginBottom:24 }}>
                <label className="lbl" style={{ color:'rgba(255,255,255,0.5)' }}>Verification code</label>
                <input
                  ref={otpRef}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  style={{
                    background:'rgba(255,255,255,0.06)',
                    border:'1.5px solid rgba(255,255,255,0.1)',
                    color:'#fff', width:'100%', padding:'14px',
                    borderRadius:10, fontSize:28, fontWeight:700,
                    letterSpacing:14, textAlign:'center', outline:'none',
                    fontFamily:'monospace',
                  }}
                  onFocus={e => e.target.style.borderColor='#1B6B3A'}
                  onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.1)'}
                />
              </div>

              <button type="submit" disabled={loading || otpCode.length !== 6}
                style={{ width:'100%', padding:'12px', background:'#1B6B3A', color:'#fff', border:'none', borderRadius:10, fontSize:15, fontWeight:600, cursor: otpCode.length === 6 ? 'pointer' : 'not-allowed', opacity: otpCode.length === 6 ? 1 : 0.5, transition:'all 0.15s' }}>
                {loading ? 'Verifying...' : 'Verify & sign in'}
              </button>

              <button type="button" onClick={() => { setView('login'); setOtpCode('') }}
                style={{ width:'100%', marginTop:12, padding:'10px', background:'transparent', color:'rgba(255,255,255,0.4)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, fontSize:13, cursor:'pointer' }}>
                ← Back to sign in
              </button>
            </form>

            <p style={{ color:'rgba(255,255,255,0.3)', fontSize:11, textAlign:'center', marginTop:20 }}>
              Code expires in 10 minutes. Check your spam folder if not received.
            </p>
          </div>
        )}

        {/* ── LOGIN ─────────────────────────────────── */}
        {view === 'login' && (
          <div style={{ width:'100%', maxWidth:420 }}>
            <h2 style={{ color:'#fff', fontSize:26, fontWeight:700, marginBottom:6 }}>Sign in</h2>
            <p style={{ color:'rgba(255,255,255,0.45)', fontSize:13, marginBottom:32 }}>
              Manager, supervisor, or field agent access
            </p>

            <form onSubmit={handleLogin}>
              <div style={{ marginBottom:14 }}>
                <label className="lbl" style={{ color:'rgba(255,255,255,0.5)' }}>Phone number</label>
                <input {...inp} type="tel" placeholder="Phone, email or username"
                  style={{ background:'rgba(255,255,255,0.06)', border:'1.5px solid rgba(255,255,255,0.1)', color:'#fff', width:'100%', padding:'10px 14px', borderRadius:10, fontSize:14, outline:'none' }}
                  value={loginForm.identifier} onChange={e => setLoginForm(f=>({...f,identifier:e.target.value}))}
                  onFocus={e => e.target.style.borderColor='#1B6B3A'}
                  onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.1)'}
                />
              </div>

              <div style={{ marginBottom:8 }}>
                <label className="lbl" style={{ color:'rgba(255,255,255,0.5)' }}>Password</label>
                <div style={{ position:'relative' }}>
                  <input {...inp} type={show ? 'text' : 'password'} placeholder="••••••••"
                    style={{ background:'rgba(255,255,255,0.06)', border:'1.5px solid rgba(255,255,255,0.1)', color:'#fff', width:'100%', padding:'10px 40px 10px 14px', borderRadius:10, fontSize:14, outline:'none' }}
                    value={loginForm.password} onChange={e => setLoginForm(f=>({...f,password:e.target.value}))}
                    onFocus={e => e.target.style.borderColor='#1B6B3A'}
                    onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.1)'}
                  />
                  <button type="button" onClick={() => setShow(s=>!s)}
                    style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', color:'rgba(255,255,255,0.4)', background:'none', border:'none', cursor:'pointer' }}>
                    {show ? <EyeOff size={16}/> : <Eye size={16}/>}
                  </button>
                </div>
              </div>

              <div style={{ textAlign:'right', marginBottom:20 }}>
                <Link to="/forgot-password"
                  style={{ color:'#4CAF7D', fontSize:12, textDecoration:'none' }}>
                  Forgot password?
                </Link>
              </div>

              <button type="submit" disabled={loading}
                style={{ width:'100%', padding:'12px', background:'#1B6B3A', color:'#fff', border:'none', borderRadius:10, fontSize:15, fontWeight:600, cursor:'pointer', transition:'background 0.15s' }}
                onMouseEnter={e => !loading && (e.currentTarget.style.background='#2E8B57')}
                onMouseLeave={e => (e.currentTarget.style.background='#1B6B3A')}>
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            <div style={{ textAlign:'center', marginTop:24, color:'rgba(255,255,255,0.4)', fontSize:13 }}>
              New to Gigs4You?{' '}
              <button onClick={() => setView('register-choice')}
                style={{ color:'#4CAF7D', fontWeight:600, background:'none', border:'none', cursor:'pointer', fontSize:13 }}>
                Create account
              </button>
            </div>
          </div>
        )}

        {/* ── REGISTER CHOICE ───────────────────────── */}
        {view === 'register-choice' && (
          <div style={{ width:'100%', maxWidth:480 }}>
            <button onClick={() => setView('login')} style={{ color:'rgba(255,255,255,0.4)', fontSize:13, marginBottom:28, display:'flex', alignItems:'center', gap:4, background:'none', border:'none', cursor:'pointer' }}>
              ← Back to sign in
            </button>
            <h2 style={{ color:'#fff', fontSize:26, fontWeight:700, marginBottom:8 }}>Create your account</h2>
            <p style={{ color:'rgba(255,255,255,0.45)', fontSize:13, marginBottom:32 }}>Choose how you'll use Gigs4You</p>

            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {[
                {
                  type:'register-employer' as View, icon:Building2, color:'#1B6B3A',
                  title:'Employer / Company',
                  desc:'Post jobs, manage field teams, assign tasks, track GPS, pay workers via M-Pesa.',
                  tags:['Post jobs','Team management','GPS tracking','M-Pesa payroll'],
                },
                {
                  type:'register-worker' as View, icon:User, color:'#185FA5',
                  title:'Worker / Field Agent',
                  desc:'Find jobs by skill, complete tasks, earn money, build your verified profile.',
                  tags:['Find jobs','Get paid','Build reputation','Grow skills'],
                },
              ].map(opt => (
                <button key={opt.type} onClick={() => setView(opt.type)}
                  style={{ background:'rgba(255,255,255,0.04)', border:'1.5px solid rgba(255,255,255,0.1)', borderRadius:14, padding:'20px', textAlign:'left', cursor:'pointer', transition:'all 0.15s', display:'flex', alignItems:'center', gap:16 }}
                  onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.25)' }}
                  onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.1)' }}
                >
                  <div style={{ width:48, height:48, borderRadius:12, background:opt.color, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <opt.icon size={22} color="#fff" />
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ color:'#fff', fontSize:15, fontWeight:700, marginBottom:4 }}>{opt.title}</div>
                    <div style={{ color:'rgba(255,255,255,0.45)', fontSize:12, lineHeight:1.5, marginBottom:10 }}>{opt.desc}</div>
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                      {opt.tags.map(t => (
                        <span key={t} style={{ background:'rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.6)', fontSize:10, fontWeight:500, padding:'2px 8px', borderRadius:99 }}>{t}</span>
                      ))}
                    </div>
                  </div>
                  <ChevronRight size={18} color="rgba(255,255,255,0.3)" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── EMPLOYER REGISTRATION ─────────────────── */}
        {view === 'register-employer' && (
          <div style={{ width:'100%', maxWidth:520 }}>
            <button onClick={() => setView('register-choice')} style={{ color:'rgba(255,255,255,0.4)', fontSize:13, marginBottom:24, display:'flex', alignItems:'center', gap:4, background:'none', border:'none', cursor:'pointer' }}>
              ← Back
            </button>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
              <div style={{ width:42, height:42, borderRadius:10, background:'#1B6B3A', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Building2 size={20} color="#fff" />
              </div>
              <div>
                <h2 style={{ color:'#fff', fontSize:22, fontWeight:700 }}>Company registration</h2>
                <p style={{ color:'rgba(255,255,255,0.4)', fontSize:12 }}>Start hiring field workers in minutes</p>
              </div>
            </div>

            <form onSubmit={handleEmpRegister}>
              {/* Plan banner — shown when coming from website pricing */}
              {selectedPlan && PLAN_LABELS[selectedPlan] && (
                <div style={{
                  display:'flex', alignItems:'center', gap:12, marginBottom:20,
                  padding:'12px 16px', borderRadius:12,
                  background:`${PLAN_LABELS[selectedPlan].color}18`,
                  border:`1.5px solid ${PLAN_LABELS[selectedPlan].color}40`,
                }}>
                  <Zap size={18} color={PLAN_LABELS[selectedPlan].color} />
                  <div style={{ flex:1 }}>
                    <div style={{ color:'#fff', fontWeight:700, fontSize:13 }}>
                      Selected plan: {PLAN_LABELS[selectedPlan].name}
                    </div>
                    <div style={{ color:'rgba(255,255,255,0.5)', fontSize:11, marginTop:2 }}>
                      {PLAN_LABELS[selectedPlan].price} · {selectedBilling} billing
                      &nbsp;·&nbsp; You'll complete payment after creating your account
                    </div>
                  </div>
                  <button type="button"
                    onClick={() => navigate('/login')}
                    style={{ color:'rgba(255,255,255,0.35)', fontSize:11, background:'none', border:'none', cursor:'pointer' }}>
                    Change plan
                  </button>
                </div>
              )}

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                <div>
                  <label className="lbl" style={{ color:'rgba(255,255,255,0.45)' }}>Company name *</label>
                  <input {...inp} placeholder="e.g. Bidco Africa Ltd"
                    style={{ background:'rgba(255,255,255,0.06)', border:'1.5px solid rgba(255,255,255,0.1)', color:'#fff', width:'100%', padding:'9px 12px', borderRadius:8, fontSize:13, outline:'none' }}
                    value={empForm.companyName} onChange={e => setEmpForm(f=>({...f,companyName:e.target.value}))}
                    onFocus={e => e.target.style.borderColor='#1B6B3A'}
                    onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.1)'} />
                </div>
                <div>
                  <label className="lbl" style={{ color:'rgba(255,255,255,0.45)' }}>Contact person *</label>
                  <input {...inp} placeholder="Your full name"
                    style={{ background:'rgba(255,255,255,0.06)', border:'1.5px solid rgba(255,255,255,0.1)', color:'#fff', width:'100%', padding:'9px 12px', borderRadius:8, fontSize:13, outline:'none' }}
                    value={empForm.contactPerson} onChange={e => setEmpForm(f=>({...f,contactPerson:e.target.value}))}
                    onFocus={e => e.target.style.borderColor='#1B6B3A'}
                    onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.1)'} />
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                <div>
                  <label className="lbl" style={{ color:'rgba(255,255,255,0.45)' }}>Industry *</label>
                  <select style={{ background:'rgba(255,255,255,0.06)', border:'1.5px solid rgba(255,255,255,0.1)', color:'#fff', width:'100%', padding:'9px 12px', borderRadius:8, fontSize:13, outline:'none' }}
                    value={empForm.industry} onChange={e => setEmpForm(f=>({...f,industry:e.target.value}))}>
                    <option value="">Select industry</option>
                    {allIndustries.map(i => <option key={i} value={i} style={{ color:'#000' }}>{i}</option>)}
                  </select>
                  {empForm.industry === 'Other' && (
                    <input required placeholder="Enter your industry"
                      style={{ background:'rgba(255,255,255,0.06)', border:'1.5px solid rgba(255,255,255,0.1)', color:'#fff', width:'100%', padding:'9px 12px', borderRadius:8, fontSize:13, outline:'none', marginTop:6 }}
                      value={empOtherIndustry} onChange={e => setEmpOtherIndustry(e.target.value)} />
                  )}
                </div>
                <div>
                  <label className="lbl" style={{ color:'rgba(255,255,255,0.45)' }}>County / HQ</label>
                  <select style={{ background:'rgba(255,255,255,0.06)', border:'1.5px solid rgba(255,255,255,0.1)', color:'#fff', width:'100%', padding:'9px 12px', borderRadius:8, fontSize:13, outline:'none' }}
                    value={empForm.county} onChange={e => setEmpForm(f=>({...f,county:e.target.value}))}>
                    <option value="">Select county</option>
                    {allCounties.map(c => <option key={c} value={c} style={{ color:'#000' }}>{c}</option>)}
                  </select>
                  {empForm.county === 'Other' && (
                    <input required placeholder="Enter your county"
                      style={{ background:'rgba(255,255,255,0.06)', border:'1.5px solid rgba(255,255,255,0.1)', color:'#fff', width:'100%', padding:'9px 12px', borderRadius:8, fontSize:13, outline:'none', marginTop:6 }}
                      value={empOtherCounty} onChange={e => setEmpOtherCounty(e.target.value)} />
                  )}
                </div>
              </div>

              {[
                { label:'Phone number *', key:'phone', type:'tel', placeholder:'0712 345 678' },
                { label:'Email address', key:'email', type:'email', placeholder:'hr@company.co.ke' },
                { label:'Password *', key:'password', type:show?'text':'password', placeholder:'Min 6 characters' },
                { label:'Confirm password *', key:'confirmPassword', type:show?'text':'password', placeholder:'Repeat password' },
              ].map(f => (
                <div key={f.key} style={{ marginBottom:12 }}>
                  <label className="lbl" style={{ color:'rgba(255,255,255,0.45)' }}>{f.label}</label>
                  <input type={f.type} placeholder={f.placeholder}
                    style={{ background:'rgba(255,255,255,0.06)', border:'1.5px solid rgba(255,255,255,0.1)', color:'#fff', width:'100%', padding:'9px 12px', borderRadius:8, fontSize:13, outline:'none' }}
                    value={(empForm as any)[f.key]} onChange={e => setEmpForm(prev => ({...prev,[f.key]:e.target.value}))}
                    onFocus={e => e.target.style.borderColor='#1B6B3A'}
                    onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.1)'} />
                </div>
              ))}

              <button type="submit" disabled={loading} style={{ width:'100%', padding:'12px', background:'#1B6B3A', color:'#fff', border:'none', borderRadius:10, fontSize:14, fontWeight:600, cursor:'pointer', marginTop:8 }}>
                {loading ? 'Creating account...'
                  : selectedPlan && selectedPlan !== 'free'
                    ? `Create account & activate ${PLAN_LABELS[selectedPlan]?.name ?? selectedPlan} plan →`
                    : 'Create company account'}
              </button>
            </form>
          </div>
        )}

        {/* ── WORKER REGISTRATION ───────────────────── */}
        {view === 'register-worker' && (
          <div style={{ width:'100%', maxWidth:480 }}>
            <button onClick={() => setView('register-choice')} style={{ color:'rgba(255,255,255,0.4)', fontSize:13, marginBottom:24, display:'flex', alignItems:'center', gap:4, background:'none', border:'none', cursor:'pointer' }}>
              ← Back
            </button>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
              <div style={{ width:42, height:42, borderRadius:10, background:'#185FA5', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <User size={20} color="#fff" />
              </div>
              <div>
                <h2 style={{ color:'#fff', fontSize:22, fontWeight:700 }}>Worker registration</h2>
                <p style={{ color:'rgba(255,255,255,0.4)', fontSize:12 }}>Find your next gig today</p>
              </div>
            </div>

            <form onSubmit={handleWorkerRegister}>
              {[
                { label:'Full name *',     key:'name',            type:'text',                           placeholder:'e.g. Peter Mwangi' },
                { label:'Phone number *',  key:'phone',           type:'tel',                            placeholder:'0712 345 678' },
                { label:'Email address',   key:'email',           type:'email',                          placeholder:'peter@email.com (optional)' },
                { label:'Password *',      key:'password',        type:show?'text':'password',           placeholder:'Min 6 characters' },
                { label:'Confirm password *', key:'confirmPassword', type:show?'text':'password',       placeholder:'Repeat password' },
              ].map(f => (
                <div key={f.key} style={{ marginBottom:12 }}>
                  <label className="lbl" style={{ color:'rgba(255,255,255,0.45)' }}>{f.label}</label>
                  <input type={f.type} placeholder={f.placeholder}
                    style={{ background:'rgba(255,255,255,0.06)', border:'1.5px solid rgba(255,255,255,0.1)', color:'#fff', width:'100%', padding:'9px 12px', borderRadius:8, fontSize:13, outline:'none' }}
                    value={(workerForm as any)[f.key]} onChange={e => setWorkerForm(prev => ({...prev,[f.key]:e.target.value}))}
                    onFocus={e => e.target.style.borderColor='#185FA5'}
                    onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.1)'} />
                </div>
              ))}

              <div style={{ marginBottom:12 }}>
                <label className="lbl" style={{ color:'rgba(255,255,255,0.45)' }}>County (where you work)</label>
                <select style={{ background:'rgba(255,255,255,0.06)', border:'1.5px solid rgba(255,255,255,0.1)', color:'#fff', width:'100%', padding:'9px 12px', borderRadius:8, fontSize:13, outline:'none' }}
                  value={workerForm.county} onChange={e => setWorkerForm(f=>({...f,county:e.target.value}))}>
                  <option value="">Select county</option>
                  {allCounties.map(c => <option key={c} value={c} style={{ color:'#000' }}>{c}</option>)}
                </select>
                {workerForm.county === 'Other' && (
                  <input required placeholder="Enter your county"
                    style={{ background:'rgba(255,255,255,0.06)', border:'1.5px solid rgba(255,255,255,0.1)', color:'#fff', width:'100%', padding:'9px 12px', borderRadius:8, fontSize:13, outline:'none', marginTop:6 }}
                    value={workerOtherCounty} onChange={e => setWorkerOtherCounty(e.target.value)} />
                )}
              </div>

              <div style={{ marginBottom:16 }}>
                <label className="lbl" style={{ color:'rgba(255,255,255,0.45)' }}>Brief bio (optional)</label>
                <textarea rows={2} placeholder="e.g. Route sales rep, 3 years FMCG, own motorbike..."
                  style={{ background:'rgba(255,255,255,0.06)', border:'1.5px solid rgba(255,255,255,0.1)', color:'#fff', width:'100%', padding:'9px 12px', borderRadius:8, fontSize:13, outline:'none', resize:'vertical', fontFamily:'inherit', lineHeight:1.5 }}
                  value={workerForm.bio} onChange={e => setWorkerForm(f=>({...f,bio:e.target.value}))}
                  onFocus={e => e.target.style.borderColor='#185FA5'}
                  onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.1)'} />
              </div>

              <div style={{ background:'rgba(24,95,165,0.15)', border:'1px solid rgba(24,95,165,0.3)', borderRadius:10, padding:'12px', marginBottom:16, fontSize:12, color:'rgba(255,255,255,0.6)', lineHeight:1.6 }}>
                After creating your account, complete your profile by adding your skills, rates, and certifications to get hired faster.
              </div>

              <button type="submit" disabled={loading} style={{ width:'100%', padding:'12px', background:'#185FA5', color:'#fff', border:'none', borderRadius:10, fontSize:14, fontWeight:600, cursor:'pointer' }}>
                {loading ? 'Creating account...' : 'Create worker account'}
              </button>
            </form>

            <p style={{ textAlign:'center', marginTop:16, color:'rgba(255,255,255,0.3)', fontSize:12 }}>
              Already have an account?{' '}
              <button onClick={() => setView('login')} style={{ color:'#4CAF7D', fontWeight:600, background:'none', border:'none', cursor:'pointer', fontSize:12 }}>Sign in</button>
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
