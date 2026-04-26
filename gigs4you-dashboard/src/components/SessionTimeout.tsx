/**
 * SessionTimeout — inactivity guard for the dashboard.
 *
 * After IDLE_MS of no user activity a warning modal appears.
 * The user has WARN_SECS seconds to click "Stay logged in".
 * If they don't, they are automatically logged out.
 *
 * Timings:
 *   IDLE_MS   = 60 000 ms  (1 minute idle before warning)
 *   WARN_SECS = 30          (30-second countdown in modal)
 *   Total time before forced logout = 1 min 30 sec
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, ShieldAlert } from 'lucide-react'
import { useAuthStore } from '../store/store'

const IDLE_MS   = 60_000  // 1 minute idle → show warning
const WARN_SECS = 30      // 30-second countdown before auto-logout

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'] as const

export default function SessionTimeout() {
  const logout   = useAuthStore(s => s.logout)
  const token    = useAuthStore(s => s.token)
  const navigate = useNavigate()

  const [warning, setWarning] = useState(false)
  const [countdown, setCountdown] = useState(WARN_SECS)

  const idleTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countTimer   = useRef<ReturnType<typeof setInterval> | null>(null)
  const warningRef   = useRef(false) // avoid stale closure in listeners

  const doLogout = useCallback(() => {
    clearTimeout(idleTimer.current!)
    clearInterval(countTimer.current!)
    setWarning(false)
    warningRef.current = false
    logout()
    navigate('/login', { replace: true })
  }, [logout, navigate])

  const resetIdle = useCallback(() => {
    if (warningRef.current) return // don't reset while warning is shown
    clearTimeout(idleTimer.current!)
    idleTimer.current = setTimeout(() => {
      setWarning(true)
      warningRef.current = true
      setCountdown(WARN_SECS)

      let remaining = WARN_SECS
      countTimer.current = setInterval(() => {
        remaining -= 1
        setCountdown(remaining)
        if (remaining <= 0) {
          clearInterval(countTimer.current!)
          doLogout()
        }
      }, 1_000)
    }, IDLE_MS)
  }, [doLogout])

  const stayLoggedIn = useCallback(() => {
    clearInterval(countTimer.current!)
    setWarning(false)
    warningRef.current = false
    setCountdown(WARN_SECS)
    resetIdle()
  }, [resetIdle])

  useEffect(() => {
    if (!token) return // no session — nothing to guard

    ACTIVITY_EVENTS.forEach(ev => window.addEventListener(ev, resetIdle, { passive: true }))
    resetIdle() // start first idle timer

    return () => {
      ACTIVITY_EVENTS.forEach(ev => window.removeEventListener(ev, resetIdle))
      clearTimeout(idleTimer.current!)
      clearInterval(countTimer.current!)
    }
  }, [token, resetIdle])

  if (!warning) return null

  const pct = (countdown / WARN_SECS) * 100
  const urgentColor = countdown <= 10 ? '#EF4444' : countdown <= 20 ? '#F59E0B' : '#1B6B3A'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '36px 32px',
        maxWidth: 400, width: '90%', textAlign: 'center',
        boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
      }}>
        {/* Icon */}
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: countdown <= 10 ? '#FEE2E2' : '#F0FDF4',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
          transition: 'background 0.3s',
        }}>
          <ShieldAlert size={28} color={urgentColor} />
        </div>

        <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#111827' }}>
          Still there?
        </h2>
        <p style={{ margin: '0 0 24px', fontSize: 14, color: '#6B7280', lineHeight: 1.6 }}>
          You've been inactive for a minute. You'll be automatically signed out in:
        </p>

        {/* Countdown ring */}
        <div style={{ position: 'relative', width: 80, height: 80, margin: '0 auto 24px' }}>
          <svg width="80" height="80" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="40" cy="40" r="34" fill="none" stroke="#E5E7EB" strokeWidth="6" />
            <circle cx="40" cy="40" r="34" fill="none"
              stroke={urgentColor} strokeWidth="6"
              strokeDasharray={`${2 * Math.PI * 34}`}
              strokeDashoffset={`${2 * Math.PI * 34 * (1 - pct / 100)}`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
            />
          </svg>
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 800, color: urgentColor,
            transition: 'color 0.3s',
          }}>
            {countdown}
          </div>
        </div>

        {/* Actions */}
        <button onClick={stayLoggedIn} style={{
          width: '100%', padding: '12px', marginBottom: 10,
          background: '#1B6B3A', color: '#fff', border: 'none',
          borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer',
        }}>
          Stay logged in
        </button>
        <button onClick={doLogout} style={{
          width: '100%', padding: '10px',
          background: 'transparent', color: '#6B7280',
          border: '1px solid #E5E7EB', borderRadius: 10,
          fontSize: 13, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <LogOut size={14} /> Sign out now
        </button>
      </div>
    </div>
  )
}
