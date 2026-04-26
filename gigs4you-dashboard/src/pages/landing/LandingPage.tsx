import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/store'
import { useEffect, useRef, useState } from 'react'
import {
  MapPin, Zap, Shield, BarChart3, Sparkles, CreditCard,
  ArrowRight, CheckCircle2, Star, Users, TrendingUp, Phone,
} from 'lucide-react'

/* ─────────────────────────────────────────────────────────────────────────
   CSS — injected once into <head> equivalent via <style>
───────────────────────────────────────────────────────────────────────── */
const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --green:    #1B6B3A;
    --green-l:  #3DCE64;
    --green-ll: #5BDC85;
    --amber:    #F59E0B;
    --blue:     #60A5FA;
    --purple:   #A78BFA;
    --bg:       #020609;
    --card:     rgba(255,255,255,0.028);
    --border:   rgba(255,255,255,0.07);
  }

  .lp {
    background: var(--bg);
    min-height: 100vh;
    color: #fff;
    font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
    overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
  }

  /* ── Noise film ── */
  .lp::after {
    content: '';
    position: fixed;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
    pointer-events: none;
    z-index: 999;
    opacity: 1;
  }

  /* ── Dot grid ── */
  .lp-dots {
    position: fixed;
    inset: 0;
    background-image: radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px);
    background-size: 28px 28px;
    pointer-events: none;
    z-index: 0;
    mask-image: radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%);
    -webkit-mask-image: radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%);
  }

  /* ── Atmospheric glow orbs ── */
  .lp-orb {
    position: fixed;
    border-radius: 50%;
    pointer-events: none;
    z-index: 0;
  }
  .lp-orb-1 {
    width: 900px; height: 900px;
    background: radial-gradient(circle at center, rgba(27,107,58,0.38) 0%, rgba(27,107,58,0.08) 50%, transparent 70%);
    top: -360px; left: -260px;
    filter: blur(2px);
  }
  .lp-orb-2 {
    width: 640px; height: 640px;
    background: radial-gradient(circle at center, rgba(245,158,11,0.18) 0%, transparent 70%);
    top: -100px; right: -180px;
    filter: blur(2px);
  }
  .lp-orb-3 {
    width: 560px; height: 560px;
    background: radial-gradient(circle at center, rgba(27,107,58,0.2) 0%, transparent 70%);
    bottom: -200px; right: 100px;
    filter: blur(2px);
  }
  .lp-orb-4 {
    width: 400px; height: 400px;
    background: radial-gradient(circle at center, rgba(96,165,250,0.10) 0%, transparent 70%);
    bottom: 400px; left: -80px;
    filter: blur(2px);
  }

  /* ── Content layer ── */
  .lp-z { position: relative; z-index: 1; }

  /* ── Layout ── */
  .lp-wrap { max-width: 1160px; margin: 0 auto; padding: 0 28px; }

  /* ── Nav ── */
  .lp-nav {
    position: sticky; top: 0; z-index: 200;
    background: rgba(2,6,9,0.72);
    backdrop-filter: blur(28px) saturate(160%);
    -webkit-backdrop-filter: blur(28px) saturate(160%);
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .lp-nav-inner {
    max-width: 1160px; margin: 0 auto; padding: 0 28px;
    height: 64px; display: flex; align-items: center; justify-content: space-between;
  }

  /* ── Buttons ── */
  .lp-btn {
    display: inline-flex; align-items: center; gap: 8px;
    font-family: inherit; font-weight: 700; cursor: pointer;
    border: none; border-radius: 11px;
    transition: all 0.2s ease; white-space: nowrap;
    text-decoration: none;
  }
  .lp-btn-solid {
    background: linear-gradient(135deg, #1B6B3A 0%, #22854C 100%);
    color: #fff; padding: 11px 22px; font-size: 14px;
    box-shadow:
      0 0 0 1px rgba(91,220,133,0.22),
      0 4px 24px rgba(27,107,58,0.5),
      0 0 60px rgba(27,107,58,0.18),
      inset 0 1px 0 rgba(255,255,255,0.14);
  }
  .lp-btn-solid:hover {
    background: linear-gradient(135deg, #22854C 0%, #2AA85F 100%);
    box-shadow:
      0 0 0 1px rgba(91,220,133,0.35),
      0 8px 36px rgba(27,107,58,0.65),
      0 0 80px rgba(27,107,58,0.28),
      inset 0 1px 0 rgba(255,255,255,0.18);
    transform: translateY(-2px);
  }
  .lp-btn-ghost {
    background: rgba(255,255,255,0.05);
    color: rgba(255,255,255,0.72);
    border: 1px solid rgba(255,255,255,0.1);
    padding: 10px 20px; font-size: 14px;
  }
  .lp-btn-ghost:hover {
    background: rgba(255,255,255,0.1);
    border-color: rgba(255,255,255,0.22);
    color: #fff;
  }
  .lp-btn-lg {
    padding: 15px 32px; font-size: 16px; border-radius: 13px;
    box-shadow:
      0 0 0 1px rgba(91,220,133,0.28),
      0 8px 36px rgba(27,107,58,0.55),
      0 0 80px rgba(27,107,58,0.22),
      inset 0 1px 0 rgba(255,255,255,0.15);
  }
  .lp-btn-lg:hover {
    box-shadow:
      0 0 0 1px rgba(91,220,133,0.4),
      0 14px 50px rgba(27,107,58,0.7),
      0 0 100px rgba(27,107,58,0.32),
      inset 0 1px 0 rgba(255,255,255,0.2);
    transform: translateY(-3px);
  }

  /* ── Badge pill ── */
  .lp-badge {
    display: inline-flex; align-items: center; gap: 8px;
    background: rgba(91,220,133,0.06);
    border: 1px solid rgba(91,220,133,0.2);
    border-radius: 99px; padding: 6px 16px 6px 10px;
    font-size: 12px; font-weight: 600; color: #5BDC85; letter-spacing: 0.1px;
  }
  .lp-dot-live {
    width: 7px; height: 7px; border-radius: 50%;
    background: #5BDC85; box-shadow: 0 0 10px #5BDC85;
    animation: lp-blink 2s ease-in-out infinite; flex-shrink: 0;
  }
  @keyframes lp-blink {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.45; transform: scale(1.4); }
  }

  /* ── Gradient text ── */
  .lp-grad-green {
    background: linear-gradient(125deg, #5BDC85 0%, #22C55E 45%, #F59E0B 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .lp-grad-white {
    background: linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.65) 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  /* ── Glass card ── */
  .lp-glass {
    background: rgba(255,255,255,0.026);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 20px;
    backdrop-filter: blur(24px) saturate(140%);
    -webkit-backdrop-filter: blur(24px) saturate(140%);
  }
  .lp-glass-green {
    border-color: rgba(91,220,133,0.18);
    box-shadow: 0 0 0 1px rgba(91,220,133,0.06) inset,
                0 24px 64px rgba(0,0,0,0.55),
                0 0 40px rgba(27,107,58,0.1);
  }

  /* ── Animated gradient border (hero preview) ── */
  .lp-glow-border {
    position: relative; border-radius: 22px; padding: 1.5px;
    background: linear-gradient(135deg,
      rgba(91,220,133,0.5) 0%,
      rgba(27,107,58,0.1) 30%,
      rgba(245,158,11,0.3) 60%,
      rgba(91,220,133,0.4) 100%);
    box-shadow: 0 0 60px rgba(27,107,58,0.25), 0 0 120px rgba(27,107,58,0.1);
    animation: lp-border-rotate 6s linear infinite;
    background-size: 300% 300%;
  }
  @keyframes lp-border-rotate {
    0%   { background-position: 0% 50%; }
    50%  { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  .lp-glow-border-inner {
    border-radius: 20px;
    overflow: hidden;
  }

  /* ── Divider ── */
  .lp-hr {
    height: 1px;
    background: linear-gradient(90deg,
      transparent 0%, rgba(91,220,133,0.2) 25%,
      rgba(245,158,11,0.15) 75%, transparent 100%);
  }

  /* ── Feature card ── */
  .lp-feat {
    transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
    cursor: default;
  }
  .lp-feat:hover {
    transform: translateY(-6px);
  }

  /* ── Testimonial card ── */
  .lp-testi {
    transition: transform 0.2s ease, border-color 0.2s ease;
    cursor: default;
  }
  .lp-testi:hover {
    transform: translateY(-4px);
    border-color: rgba(91,220,133,0.2) !important;
  }

  /* ── Pricing card ── */
  .lp-price-card {
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    cursor: default;
  }
  .lp-price-card:hover {
    transform: translateY(-6px);
  }

  /* ── Stats strip ── */
  .lp-stat {
    text-align: center; padding: 28px 24px;
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px;
  }

  /* ── Entrance animations ── */
  @keyframes lp-rise {
    from { opacity: 0; transform: translateY(32px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .r1 { animation: lp-rise 0.72s cubic-bezier(0.22,1,0.36,1) 0.05s both; }
  .r2 { animation: lp-rise 0.72s cubic-bezier(0.22,1,0.36,1) 0.15s both; }
  .r3 { animation: lp-rise 0.72s cubic-bezier(0.22,1,0.36,1) 0.26s both; }
  .r4 { animation: lp-rise 0.72s cubic-bezier(0.22,1,0.36,1) 0.38s both; }
  .r5 { animation: lp-rise 0.72s cubic-bezier(0.22,1,0.36,1) 0.50s both; }

  @keyframes lp-pop {
    from { opacity: 0; transform: translateY(18px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  .p1 { animation: lp-pop 0.65s cubic-bezier(0.22,1,0.36,1) 0.4s  both; }
  .p2 { animation: lp-pop 0.65s cubic-bezier(0.22,1,0.36,1) 0.55s both; }
  .p3 { animation: lp-pop 0.65s cubic-bezier(0.22,1,0.36,1) 0.7s  both; }

  /* ── Map floating dots ── */
  @keyframes lp-float {
    0%, 100% { transform: translate(-50%,-50%) translateY(0); }
    50%       { transform: translate(-50%,-50%) translateY(-5px); }
  }
  .f1 { animation: lp-float 3.4s ease-in-out 0s   infinite; }
  .f2 { animation: lp-float 4.0s ease-in-out 0.8s infinite; }
  .f3 { animation: lp-float 3.7s ease-in-out 1.5s infinite; }

  /* ── Agent avatar ring pulse ── */
  @keyframes lp-ring {
    0%,100% { box-shadow: 0 0 0 0 currentColor; }
    50%     { box-shadow: 0 0 0 5px rgba(91,220,133,0); }
  }

  /* ── Shimmer ── */
  @keyframes lp-shim {
    0%   { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
  .lp-shim {
    position: relative; overflow: hidden;
  }
  .lp-shim::after {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.035) 50%, transparent 100%);
    animation: lp-shim 3.5s ease-in-out infinite;
  }

  /* ── Scroll reveal (JS-driven) ── */
  .lp-reveal {
    opacity: 0; transform: translateY(28px);
    transition: opacity 0.65s cubic-bezier(0.22,1,0.36,1),
                transform 0.65s cubic-bezier(0.22,1,0.36,1);
  }
  .lp-reveal.lp-visible {
    opacity: 1; transform: translateY(0);
  }

  /* ── Responsive ── */
  @media (max-width: 960px) {
    .hero-grid   { grid-template-columns: 1fr !important; }
    .hero-right  { display: none !important; }
    .feat-grid   { grid-template-columns: 1fr 1fr !important; }
    .stat-grid   { grid-template-columns: 1fr 1fr !important; }
    .testi-grid  { grid-template-columns: 1fr 1fr !important; }
    .price-grid  { grid-template-columns: 1fr !important; max-width: 380px !important; margin: 0 auto !important; }
    .hiw-grid    { grid-template-columns: 1fr !important; }
    .hiw-text    { max-width: none !important; }
  }
  @media (max-width: 600px) {
    .lp-h1       { font-size: 40px !important; letter-spacing: -1.5px !important; }
    .lp-h2       { font-size: 30px !important; }
    .feat-grid   { grid-template-columns: 1fr !important; }
    .testi-grid  { grid-template-columns: 1fr !important; }
    .cta-btns    { flex-direction: column !important; align-items: stretch !important; }
    .lp-wrap     { padding: 0 16px !important; }
    .stat-grid   { grid-template-columns: 1fr 1fr !important; }
  }
`

/* ─────────────────────────────────────────────────────────────────────────
   Counter
───────────────────────────────────────────────────────────────────────── */
function Counter({ end, prefix = '', suffix = '' }: { end: number; prefix?: string; suffix?: string }) {
  const [n, setN] = useState(0)
  const started = useRef(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true
        const dur = 1800; const t0 = performance.now()
        const tick = (now: number) => {
          const p = Math.min((now - t0) / dur, 1)
          const ease = 1 - Math.pow(1 - p, 3)
          setN(Math.round(ease * end))
          if (p < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }
    }, { threshold: 0.3 })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [end])
  return <span ref={ref}>{prefix}{n.toLocaleString()}{suffix}</span>
}

/* ─────────────────────────────────────────────────────────────────────────
   Scroll reveal hook
───────────────────────────────────────────────────────────────────────── */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { el.classList.add('lp-visible'); obs.disconnect() }
    }, { threshold: 0.12 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return ref
}

/* ─────────────────────────────────────────────────────────────────────────
   HeroPreview — the "product screenshot" in the hero
───────────────────────────────────────────────────────────────────────── */
function HeroPreview() {
  const agents = [
    { name: 'James Mwangi',  loc: 'Westlands', status: 'live',    init: 'J', c: '#5BDC85' },
    { name: 'Amina Hassan',  loc: 'Kilimani',  status: 'en route',init: 'A', c: '#F59E0B' },
    { name: 'David Omondi',  loc: 'Ngong Rd',  status: 'done',    init: 'D', c: '#60A5FA' },
    { name: 'Faith Njeri',   loc: 'Thika Rd',  status: 'pending', init: 'F', c: '#9CA3AF' },
    { name: 'Brian Kamau',   loc: 'Kasarani',  status: 'live',    init: 'B', c: '#5BDC85' },
  ]
  const dots = [
    { x:'22%',  y:'38%', c:'#5BDC85', cls:'f1', s:11 },
    { x:'38%',  y:'22%', c:'#F59E0B', cls:'f2', s:9  },
    { x:'56%',  y:'52%', c:'#5BDC85', cls:'f1', s:11 },
    { x:'44%',  y:'68%', c:'#5BDC85', cls:'f3', s:9  },
    { x:'72%',  y:'32%', c:'#60A5FA', cls:'f2', s:11 },
    { x:'82%',  y:'62%', c:'#9CA3AF', cls:'f1', s:7  },
    { x:'28%',  y:'72%', c:'#5BDC85', cls:'f3', s:9  },
    { x:'64%',  y:'78%', c:'#F59E0B', cls:'f2', s:8  },
  ]

  return (
    <div className="p1" style={{ position: 'relative', paddingBottom: 30, paddingLeft: 20, paddingRight: 16 }}>
      {/* Glowing border wrapper */}
      <div className="lp-glow-border">
        <div className="lp-glow-border-inner lp-glass lp-glass-green"
          style={{ background: 'rgba(4,12,8,0.9)' }}>

          {/* App header bar */}
          <div style={{
            padding: '14px 18px 12px',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'rgba(27,107,58,0.04)',
          }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {['#ff5f57','#febc2e','#28c840'].map((c,i) => (
                <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.7 }} />
              ))}
            </div>
            <div style={{ flex: 1, height: 22, borderRadius: 6, background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center',
              paddingLeft: 10, gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#5BDC85', boxShadow: '0 0 6px #5BDC85' }} />
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>gigs4you.app/dashboard</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(91,220,133,0.07)', border: '1px solid rgba(91,220,133,0.18)',
              borderRadius: 99, padding: '3px 10px' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#5BDC85', boxShadow: '0 0 7px #5BDC85', animation: 'lp-blink 2s ease-in-out infinite' }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: '#5BDC85' }}>47 active</span>
            </div>
          </div>

          {/* Map strip */}
          <div style={{ height: 110, background: 'linear-gradient(180deg,rgba(27,107,58,0.08),rgba(27,107,58,0.03))',
            position: 'relative', overflow: 'hidden', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ position: 'absolute', inset: 0,
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)',
              backgroundSize: '22px 22px' }} />
            {/* Road lines */}
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.08 }} preserveAspectRatio="none">
              <line x1="20%" y1="0" x2="60%" y2="100%" stroke="white" strokeWidth="1.5" />
              <line x1="50%" y1="0" x2="80%" y2="100%" stroke="white" strokeWidth="1.5" />
              <line x1="0"   y1="45%" x2="100%" y2="38%" stroke="white" strokeWidth="1.5" />
              <line x1="0"   y1="72%" x2="100%" y2="65%" stroke="white" strokeWidth="1.5" />
            </svg>
            {dots.map((d, i) => (
              <div key={i} className={d.cls} style={{
                position: 'absolute', left: d.x, top: d.y,
                width: d.s, height: d.s, borderRadius: '50%',
                background: d.c, boxShadow: `0 0 ${d.s + 6}px ${d.c}88`,
                border: '1.5px solid rgba(2,6,9,0.7)',
                transform: 'translate(-50%,-50%)',
              }} />
            ))}
            <div style={{ position: 'absolute', bottom: 7, right: 12, fontSize: 9,
              color: 'rgba(255,255,255,0.18)', fontWeight: 600, letterSpacing: '0.5px' }}>
              NAIROBI METRO
            </div>
          </div>

          {/* Agent rows */}
          <div>
            {agents.map((a, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 18px',
                borderBottom: i < agents.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
              }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: `${a.c}18`, border: `1px solid ${a.c}35`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 800, color: a.c }}>
                  {a.init}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                  <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.28)', marginTop: 1 }}>{a.loc}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: a.c, boxShadow: `0 0 6px ${a.c}` }} />
                  <span style={{ fontSize: 10, color: a.c, fontWeight: 700 }}>{a.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Floating card — Tasks */}
      <div className="p2" style={{ position: 'absolute', bottom: -6, left: -8, zIndex: 3 }}>
        <div className="lp-glass" style={{ padding: '12px 16px', borderRadius: 16, minWidth: 158,
          border: '1px solid rgba(245,158,11,0.2)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 24px rgba(245,158,11,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(245,158,11,0.1)',
              border: '1px solid rgba(245,158,11,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Zap size={15} color="#F59E0B" />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.5px' }}>127</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.32)', marginTop: 3 }}>Tasks today</div>
            </div>
          </div>
          <div style={{ marginTop: 10, height: 3, borderRadius: 99,
            background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
            <div style={{ width: '78%', height: '100%', borderRadius: 99,
              background: 'linear-gradient(90deg,#1B6B3A,#5BDC85)' }} />
          </div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.22)', marginTop: 5 }}>78% completion rate</div>
        </div>
      </div>

      {/* Floating card — Payments */}
      <div className="p3" style={{ position: 'absolute', bottom: -6, right: 0, zIndex: 3 }}>
        <div className="lp-glass" style={{ padding: '12px 16px', borderRadius: 16, minWidth: 152,
          border: '1px solid rgba(96,165,250,0.18)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 24px rgba(96,165,250,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(96,165,250,0.1)',
              border: '1px solid rgba(96,165,250,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <CreditCard size={14} color="#60A5FA" />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: '-0.3px' }}>KES 48.2K</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.32)', marginTop: 3 }}>Paid out today</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 9 }}>
            <CheckCircle2 size={11} color="#5BDC85" />
            <span style={{ fontSize: 10, color: '#5BDC85', fontWeight: 700 }}>M-Pesa · Instant</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   Data
───────────────────────────────────────────────────────────────────────── */
const FEATS = [
  { icon: MapPin,    c:'#5BDC85', bg:'rgba(91,220,133,0.07)',  border:'rgba(91,220,133,0.15)',  num:'01', title:'Real-time GPS tracking',    desc:'Watch every agent check in, move through routes, and complete tasks — live on an interactive map of Kenya.' },
  { icon: Sparkles,  c:'#F59E0B', bg:'rgba(245,158,11,0.07)',  border:'rgba(245,158,11,0.15)',  num:'02', title:'Claude AI built-in',         desc:'AI writes task checklists from plain-English descriptions, suggests fair pricing, and flags anomalies automatically.' },
  { icon: CreditCard,c:'#60A5FA', bg:'rgba(96,165,250,0.07)', border:'rgba(96,165,250,0.15)', num:'03', title:'Instant M-Pesa payroll',     desc:'Pay agents directly the moment a task is approved. Every shilling tracked, every wallet balanced in real time.' },
  { icon: Shield,    c:'#A78BFA', bg:'rgba(167,139,250,0.07)',border:'rgba(167,139,250,0.15)',num:'04', title:'KYC & compliance',           desc:'ID verification with face-match scoring, role-based access, full audit logs, and Kenya data-residency compliance.' },
  { icon: BarChart3, c:'#FB923C', bg:'rgba(251,146,60,0.07)', border:'rgba(251,146,60,0.15)', num:'05', title:'Deep analytics',             desc:'Task completion rates, agent performance rankings, billing health, and exportable reports for every stakeholder.' },
  { icon: Zap,       c:'#34D399', bg:'rgba(52,211,153,0.07)', border:'rgba(52,211,153,0.15)', num:'06', title:'Multi-tenant platform',      desc:'One installation serves hundreds of organisations. Fully isolated tenants with their own billing, branding, and data.' },
]

const TESTIMONIALS = [
  { name:'Sarah Kamau', role:'Head of Ops, LogistiKe', stars:5,
    quote:'We replaced three spreadsheets and a WhatsApp group with Gigs4You. Task errors dropped 60% in the first month.',
    init:'S', c:'#5BDC85', bg:'rgba(91,220,133,0.1)' },
  { name:'Michael Otieno', role:'CEO, DeliverNairobi', stars:5,
    quote:'The M-Pesa integration alone was worth it. Agents get paid instantly and fraud dropped to zero.',
    init:'M', c:'#F59E0B', bg:'rgba(245,158,11,0.1)' },
  { name:'Grace Wanjiku', role:'Field Manager, BuildKe', stars:5,
    quote:'GPS tracking changed everything. I can see exactly where every worker is and dispatch faster than ever.',
    init:'G', c:'#60A5FA', bg:'rgba(96,165,250,0.1)' },
]

const PRICING = [
  {
    name: 'Starter', price: 'KES 4,900', period: '/mo',
    desc: 'Perfect for small teams getting started',
    color: '#5BDC85', borderColor: 'rgba(91,220,133,0.18)',
    highlight: false,
    features: ['Up to 25 field agents','Real-time GPS tracking','M-Pesa payroll','Basic analytics','Email support'],
  },
  {
    name: 'Growth', price: 'KES 14,900', period: '/mo',
    desc: 'For scaling operations across Nairobi',
    color: '#5BDC85', borderColor: 'rgba(91,220,133,0.4)',
    highlight: true,
    features: ['Up to 150 field agents','AI task parsing (Claude)','Full KYC suite','Advanced analytics','Priority support','Custom branding'],
  },
  {
    name: 'Enterprise', price: 'Custom', period: '',
    desc: 'For large organisations across Kenya',
    color: '#A78BFA', borderColor: 'rgba(167,139,250,0.2)',
    highlight: false,
    features: ['Unlimited agents','White-label deployment','SLA guarantee (99.9%)','Dedicated account manager','API access + webhooks','On-premise option'],
  },
]

/* ─────────────────────────────────────────────────────────────────────────
   Main page
───────────────────────────────────────────────────────────────────────── */
export default function LandingPage() {
  const navigate = useNavigate()
  const token    = useAuthStore(s => s.token)
  useEffect(() => { if (token) navigate('/dashboard', { replace: true }) }, [token])

  const go = () => navigate('/login')

  const revealFeats  = useReveal()
  const revealStats  = useReveal()
  const revealTesti  = useReveal()
  const revealPrice  = useReveal()
  const revealHiw    = useReveal()

  return (
    <div className="lp">
      <style>{CSS}</style>

      {/* Background layers */}
      <div className="lp-dots" />
      <div className="lp-orb lp-orb-1" />
      <div className="lp-orb lp-orb-2" />
      <div className="lp-orb lp-orb-3" />
      <div className="lp-orb lp-orb-4" />

      <div className="lp-z">

        {/* ═══════════════════════════════════════════════════════
            NAV
        ═══════════════════════════════════════════════════════ */}
        <nav className="lp-nav">
          <div className="lp-nav-inner">
            <div style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer' }} onClick={go}>
              <div style={{ width:36, height:36, borderRadius:10, flexShrink:0,
                background:'linear-gradient(135deg,#1B6B3A,#26974F)',
                display:'flex', alignItems:'center', justifyContent:'center',
                boxShadow:'0 0 22px rgba(27,107,58,0.55), 0 0 60px rgba(27,107,58,0.15), inset 0 1px 0 rgba(255,255,255,0.15)' }}>
                <MapPin size={16} color="#fff" />
              </div>
              <div>
                <div style={{ color:'#fff', fontWeight:800, fontSize:15.5, letterSpacing:'-0.4px' }}>Gigs4You</div>
                <div style={{ color:'rgba(255,255,255,0.2)', fontSize:9, letterSpacing:'0.9px', textTransform:'uppercase', marginTop:-1 }}>Field Ops Platform</div>
              </div>
            </div>

            {/* Nav links */}
            <div style={{ display:'flex', gap:28, alignItems:'center' }} className="lp-nav-links" >
              {['Features','Pricing','How it works'].map(l => (
                <span key={l} style={{ fontSize:13, color:'rgba(255,255,255,0.45)', fontWeight:500,
                  cursor:'pointer', transition:'color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.color='rgba(255,255,255,0.9)')}
                  onMouseLeave={e => (e.currentTarget.style.color='rgba(255,255,255,0.45)')}>
                  {l}
                </span>
              ))}
            </div>

            <div style={{ display:'flex', gap:10, alignItems:'center' }}>
              <button className="lp-btn lp-btn-ghost" style={{ fontSize:13, padding:'8px 16px' }} onClick={go}>Sign in</button>
              <button className="lp-btn lp-btn-solid" style={{ fontSize:13, padding:'9px 18px' }} onClick={go}>
                Get started <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </nav>

        {/* ═══════════════════════════════════════════════════════
            HERO
        ═══════════════════════════════════════════════════════ */}
        <section style={{ minHeight:'calc(100vh - 64px)', display:'flex', alignItems:'center', padding:'80px 0 130px' }}>
          <div className="lp-wrap" style={{ width:'100%' }}>
            <div className="hero-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:70, alignItems:'center' }}>

              {/* Copy */}
              <div>
                <div className="r1" style={{ marginBottom:24 }}>
                  <span className="lp-badge">
                    <span className="lp-dot-live" />
                    AI-powered · Built for Africa
                  </span>
                </div>

                <h1 className="r2 lp-h1" style={{
                  fontSize:68, fontWeight:900, lineHeight:1.06,
                  letterSpacing:'-2.5px', marginBottom:22,
                }}>
                  Hire. Deploy.<br />
                  Track. Pay.<br />
                  <span className="lp-grad-green">All in one platform.</span>
                </h1>

                <p className="r3" style={{
                  fontSize:16.5, lineHeight:1.75, color:'rgba(255,255,255,0.42)',
                  marginBottom:36, maxWidth:460,
                }}>
                  The command centre for Africa's field workforce. Real-time GPS, Claude AI task parsing, and instant M-Pesa payouts — in one beautiful platform.
                </p>

                <div className="r4 cta-btns" style={{ display:'flex', gap:14, marginBottom:44, flexWrap:'wrap' }}>
                  <button className="lp-btn lp-btn-solid lp-btn-lg" onClick={go}>
                    Start free today <ArrowRight size={16} />
                  </button>
                  <button className="lp-btn lp-btn-ghost" style={{ padding:'14px 24px', fontSize:15, borderRadius:13 }} onClick={go}>
                    View dashboard →
                  </button>
                </div>

                {/* Social proof numbers */}
                <div className="r5" style={{ display:'flex', gap:0, flexWrap:'wrap' }}>
                  {[
                    { end:200, suffix:'+', label:'organisations' },
                    { end:5000, suffix:'+', label:'field agents' },
                    { end:50000, suffix:'+', label:'tasks done' },
                    { end:98, suffix:'%', label:'uptime SLA' },
                  ].map((s, i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center' }}>
                      {i > 0 && <div style={{ width:1, height:28, background:'rgba(255,255,255,0.08)', margin:'0 18px' }} />}
                      <div style={{ textAlign:'center' }}>
                        <div style={{ fontSize:22, fontWeight:900, color:'#fff', letterSpacing:'-0.5px' }}>
                          <Counter end={s.end} suffix={s.suffix} />
                        </div>
                        <div style={{ fontSize:11, color:'rgba(255,255,255,0.28)', marginTop:2, fontWeight:500 }}>{s.label}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Hero preview */}
              <div className="hero-right">
                <HeroPreview />
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════
            LOGOS / TRUST STRIP
        ═══════════════════════════════════════════════════════ */}
        <div className="lp-hr" />
        <section style={{ padding:'44px 0' }}>
          <div className="lp-wrap">
            <div style={{ textAlign:'center', marginBottom:28, fontSize:11, fontWeight:600,
              color:'rgba(255,255,255,0.2)', textTransform:'uppercase', letterSpacing:'1.2px' }}>
              Trusted by operations teams across Kenya
            </div>
            <div style={{ display:'flex', gap:0, justifyContent:'center', flexWrap:'wrap', alignItems:'center' }}>
              {[
                { n:'LogistiKe', icon:'🚚' },
                { n:'BuildKe',   icon:'🏗️' },
                { n:'DeliverNBI',icon:'📦' },
                { n:'FieldForce',icon:'⚡' },
                { n:'OpsAfrica', icon:'🌍' },
                { n:'GigSquad',  icon:'🎯' },
              ].map((l, i) => (
                <div key={i} style={{
                  display:'flex', alignItems:'center', gap:8, padding:'10px 24px',
                  borderRight: i < 5 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                }}>
                  <span style={{ fontSize:16 }}>{l.icon}</span>
                  <span style={{ fontSize:13, fontWeight:700, color:'rgba(255,255,255,0.22)', letterSpacing:'-0.2px' }}>{l.n}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
        <div className="lp-hr" />

        {/* ═══════════════════════════════════════════════════════
            STATS
        ═══════════════════════════════════════════════════════ */}
        <section style={{ padding:'80px 0' }}>
          <div className="lp-wrap">
            <div ref={revealStats} className="lp-reveal stat-grid" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
              {[
                { end:200,   suffix:'+', label:'Tenant organisations', c:'#5BDC85',  icon:<Users size={18} color="#5BDC85" /> },
                { end:5000,  suffix:'+', label:'Active field agents',   c:'#F59E0B',  icon:<MapPin size={18} color="#F59E0B" /> },
                { end:50000, suffix:'+', label:'Tasks completed',       c:'#60A5FA',  icon:<CheckCircle2 size={18} color="#60A5FA" /> },
                { end:4800,  prefix:'KES ', suffix:'K avg/day', label:'Daily payroll processed', c:'#A78BFA', icon:<TrendingUp size={18} color="#A78BFA" /> },
              ].map((s, i) => (
                <div key={i} className="lp-stat lp-shim">
                  <div style={{ display:'flex', justifyContent:'center', marginBottom:14,
                    width:44, height:44, borderRadius:12, margin:'0 auto 14px',
                    background:`${s.c}12`, border:`1px solid ${s.c}22`,
                    alignItems:'center' }}>
                    {s.icon}
                  </div>
                  <div style={{ fontSize:34, fontWeight:900, color:s.c, letterSpacing:'-1px', lineHeight:1 }}>
                    <Counter end={s.end} prefix={s.prefix ?? ''} suffix={s.suffix} />
                  </div>
                  <div style={{ fontSize:12, color:'rgba(255,255,255,0.3)', marginTop:8, fontWeight:500, lineHeight:1.4 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="lp-hr" />

        {/* ═══════════════════════════════════════════════════════
            FEATURES
        ═══════════════════════════════════════════════════════ */}
        <section style={{ padding:'100px 0' }}>
          <div className="lp-wrap">
            <div style={{ textAlign:'center', marginBottom:16 }}>
              <span style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.22)',
                textTransform:'uppercase', letterSpacing:'1.5px' }}>Platform capabilities</span>
            </div>
            <h2 className="lp-h2" style={{ fontSize:44, fontWeight:900, textAlign:'center',
              letterSpacing:'-1.5px', lineHeight:1.12, marginBottom:64 }}>
              Everything field ops needs<br />
              <span className="lp-grad-green">built into one platform</span>
            </h2>

            <div ref={revealFeats} className="lp-reveal feat-grid" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }}>
              {FEATS.map(f => {
                const Icon = f.icon
                return (
                  <div key={f.num} className="lp-glass lp-feat" style={{
                    padding:'28px 24px',
                    border:`1px solid ${f.border}`,
                    background:`linear-gradient(145deg, ${f.bg} 0%, rgba(255,255,255,0.012) 100%)`,
                  }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
                      <div style={{ width:46, height:46, borderRadius:13, background:f.bg,
                        border:`1px solid ${f.border}`,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        boxShadow:`0 0 20px ${f.c}14` }}>
                        <Icon size={20} color={f.c} />
                      </div>
                      <span style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.12)', letterSpacing:'0.5px' }}>
                        {f.num}
                      </span>
                    </div>
                    <div style={{ fontSize:15.5, fontWeight:700, marginBottom:10, lineHeight:1.3 }}>{f.title}</div>
                    <div style={{ fontSize:13, color:'rgba(255,255,255,0.36)', lineHeight:1.72 }}>{f.desc}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <div className="lp-hr" />

        {/* ═══════════════════════════════════════════════════════
            HOW IT WORKS
        ═══════════════════════════════════════════════════════ */}
        <section style={{ padding:'100px 0' }}>
          <div className="lp-wrap">
            <div ref={revealHiw} className="lp-reveal hiw-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1.35fr', gap:80, alignItems:'center' }}>
              <div className="hiw-text">
                <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.22)',
                  textTransform:'uppercase', letterSpacing:'1.5px', marginBottom:14 }}>
                  Simple to start
                </div>
                <h2 className="lp-h2" style={{ fontSize:40, fontWeight:900, letterSpacing:'-1px', lineHeight:1.15, marginBottom:18 }}>
                  Live in<br /><span className="lp-grad-green">15 minutes</span>
                </h2>
                <p style={{ fontSize:14.5, color:'rgba(255,255,255,0.32)', lineHeight:1.82, maxWidth:340 }}>
                  No lengthy onboarding. No IT team required. Sign up, configure your tenant, and your team is live.
                </p>
                <div style={{ marginTop:32 }}>
                  <button className="lp-btn lp-btn-solid" style={{ padding:'13px 26px', fontSize:14 }} onClick={go}>
                    Get started free <ArrowRight size={14} />
                  </button>
                </div>
              </div>

              <div style={{ display:'grid', gap:12 }}>
                {[
                  { n:1, c:'#5BDC85', title:'Create your organisation',   desc:'Sign up and configure your tenant — billing, branding, and compliance ready from day one.' },
                  { n:2, c:'#F59E0B', title:'Add agents and managers',     desc:'Invite your team by phone number. Agents use the mobile app; managers get the full dashboard.' },
                  { n:3, c:'#60A5FA', title:'Post jobs and assign tasks',  desc:'Publish gigs or assign tasks directly. AI fills in checklists from a plain-English description.' },
                  { n:4, c:'#A78BFA', title:'Track, approve, and pay',     desc:'GPS proof, photo evidence, e-signatures. Approve and agents are paid instantly via M-Pesa.' },
                ].map((s, i) => (
                  <div key={i} style={{
                    display:'flex', gap:16, alignItems:'flex-start',
                    padding:'18px 22px',
                    background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.055)',
                    borderRadius:16, transition:'all 0.22s ease', cursor:'default',
                  }}
                  onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.background='rgba(255,255,255,0.04)'; el.style.borderColor=`${s.c}25`; el.style.transform='translateX(4px)'; }}
                  onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.background='rgba(255,255,255,0.02)'; el.style.borderColor='rgba(255,255,255,0.055)'; el.style.transform='translateX(0)'; }}>
                    <div style={{ width:36, height:36, borderRadius:99, flexShrink:0,
                      background:`${s.c}12`, border:`1px solid ${s.c}28`,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:13, fontWeight:900, color:s.c, boxShadow:`0 0 16px ${s.c}18` }}>
                      {s.n}
                    </div>
                    <div>
                      <div style={{ fontSize:14.5, fontWeight:700, marginBottom:6 }}>{s.title}</div>
                      <div style={{ fontSize:12.5, color:'rgba(255,255,255,0.3)', lineHeight:1.7 }}>{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="lp-hr" />

        {/* ═══════════════════════════════════════════════════════
            TESTIMONIALS
        ═══════════════════════════════════════════════════════ */}
        <section style={{ padding:'100px 0' }}>
          <div className="lp-wrap">
            <div style={{ textAlign:'center', marginBottom:14 }}>
              <span style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.22)',
                textTransform:'uppercase', letterSpacing:'1.5px' }}>What teams say</span>
            </div>
            <h2 className="lp-h2" style={{ fontSize:40, fontWeight:900, textAlign:'center',
              letterSpacing:'-1px', lineHeight:1.15, marginBottom:56 }}>
              Real results from<br /><span className="lp-grad-green">real operations</span>
            </h2>

            <div ref={revealTesti} className="lp-reveal testi-grid" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
              {TESTIMONIALS.map((t, i) => (
                <div key={i} className="lp-glass lp-testi" style={{
                  padding:'28px 24px',
                  border:'1px solid rgba(255,255,255,0.07)',
                  background:'rgba(255,255,255,0.024)',
                }}>
                  {/* Stars */}
                  <div style={{ display:'flex', gap:4, marginBottom:18 }}>
                    {Array.from({length:t.stars}).map((_,j) => (
                      <Star key={j} size={13} color="#F59E0B" fill="#F59E0B" />
                    ))}
                  </div>
                  <p style={{ fontSize:14, color:'rgba(255,255,255,0.6)', lineHeight:1.75, marginBottom:22, fontStyle:'italic' }}>
                    "{t.quote}"
                  </p>
                  <div style={{ display:'flex', alignItems:'center', gap:11 }}>
                    <div style={{ width:38, height:38, borderRadius:'50%', flexShrink:0,
                      background:t.bg, border:`1px solid ${t.c}35`,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:14, fontWeight:800, color:t.c }}>
                      {t.init}
                    </div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700 }}>{t.name}</div>
                      <div style={{ fontSize:11, color:'rgba(255,255,255,0.28)', marginTop:2 }}>{t.role}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="lp-hr" />

        {/* ═══════════════════════════════════════════════════════
            PRICING
        ═══════════════════════════════════════════════════════ */}
        <section style={{ padding:'100px 0' }}>
          <div className="lp-wrap">
            <div style={{ textAlign:'center', marginBottom:14 }}>
              <span style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.22)',
                textTransform:'uppercase', letterSpacing:'1.5px' }}>Simple pricing</span>
            </div>
            <h2 className="lp-h2" style={{ fontSize:40, fontWeight:900, textAlign:'center',
              letterSpacing:'-1px', lineHeight:1.15, marginBottom:56 }}>
              Plans that grow<br /><span className="lp-grad-green">with your team</span>
            </h2>

            <div ref={revealPrice} className="lp-reveal price-grid" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
              {PRICING.map((p, i) => (
                <div key={i} className={`lp-price-card ${p.highlight ? 'lp-shim' : ''}`} style={{
                  padding:'32px 28px',
                  background: p.highlight
                    ? 'linear-gradient(160deg, rgba(27,107,58,0.18) 0%, rgba(91,220,133,0.04) 100%)'
                    : 'rgba(255,255,255,0.024)',
                  border: `1px solid ${p.borderColor}`,
                  borderRadius:22,
                  boxShadow: p.highlight
                    ? '0 0 0 1px rgba(91,220,133,0.18) inset, 0 32px 80px rgba(0,0,0,0.5), 0 0 60px rgba(27,107,58,0.12)'
                    : '0 0 0 1px rgba(255,255,255,0.04) inset, 0 24px 64px rgba(0,0,0,0.4)',
                  position:'relative', overflow:'hidden',
                }}>
                  {p.highlight && (
                    <div style={{ position:'absolute', top:0, right:0,
                      background:'linear-gradient(135deg,#1B6B3A,#5BDC85)',
                      fontSize:10, fontWeight:800, color:'#fff',
                      padding:'5px 14px', borderRadius:'0 22px 0 12px',
                      letterSpacing:'0.3px' }}>
                      POPULAR
                    </div>
                  )}
                  <div style={{ marginBottom:20 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.35)',
                      textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:8 }}>
                      {p.name}
                    </div>
                    <div style={{ display:'flex', alignItems:'flex-end', gap:3, marginBottom:8 }}>
                      <span style={{ fontSize:36, fontWeight:900, color:p.highlight ? '#5BDC85' : '#fff', letterSpacing:'-1.5px', lineHeight:1 }}>
                        {p.price}
                      </span>
                      <span style={{ fontSize:13, color:'rgba(255,255,255,0.3)', paddingBottom:4, fontWeight:500 }}>{p.period}</span>
                    </div>
                    <div style={{ fontSize:12.5, color:'rgba(255,255,255,0.3)', lineHeight:1.6 }}>{p.desc}</div>
                  </div>
                  <div style={{ height:1, background:'rgba(255,255,255,0.06)', marginBottom:22 }} />
                  <div style={{ display:'grid', gap:10, marginBottom:28 }}>
                    {p.features.map((f, j) => (
                      <div key={j} style={{ display:'flex', alignItems:'center', gap:9 }}>
                        <CheckCircle2 size={14} color={p.color} />
                        <span style={{ fontSize:13, color:'rgba(255,255,255,0.55)' }}>{f}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={go} className="lp-btn" style={{
                    width:'100%', justifyContent:'center',
                    padding:'13px', fontSize:14,
                    ...(p.highlight ? {
                      background:'linear-gradient(135deg,#1B6B3A,#22854C)',
                      color:'#fff',
                      boxShadow:'0 0 0 1px rgba(91,220,133,0.25), 0 6px 28px rgba(27,107,58,0.5), inset 0 1px 0 rgba(255,255,255,0.14)',
                    } : {
                      background:'rgba(255,255,255,0.05)',
                      color:'rgba(255,255,255,0.7)',
                      border:'1px solid rgba(255,255,255,0.1)',
                    }),
                  }}>
                    {p.name === 'Enterprise' ? 'Contact sales' : 'Start free trial'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="lp-hr" />

        {/* ═══════════════════════════════════════════════════════
            FINAL CTA
        ═══════════════════════════════════════════════════════ */}
        <section style={{ padding:'120px 0', position:'relative', overflow:'hidden' }}>
          {/* CTA glow */}
          <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
            width:700, height:400, borderRadius:'50%',
            background:'radial-gradient(ellipse, rgba(27,107,58,0.28) 0%, transparent 70%)',
            filter:'blur(4px)', pointerEvents:'none' }} />

          <div className="lp-wrap" style={{ textAlign:'center', position:'relative' }}>
            {/* Glowing CTA card */}
            <div style={{
              maxWidth:720, margin:'0 auto',
              background:'rgba(255,255,255,0.025)',
              border:'1px solid rgba(91,220,133,0.2)',
              borderRadius:28, padding:'64px 48px',
              boxShadow:'0 0 0 1px rgba(91,220,133,0.07) inset, 0 40px 100px rgba(0,0,0,0.6), 0 0 80px rgba(27,107,58,0.15)',
              backdropFilter:'blur(24px)', WebkitBackdropFilter:'blur(24px)',
            }}>
              <div style={{ marginBottom:24 }}>
                <span className="lp-badge" style={{ display:'inline-flex' }}>
                  <span className="lp-dot-live" />
                  Start in 5 minutes, no credit card needed
                </span>
              </div>
              <h2 style={{ fontSize:52, fontWeight:900, letterSpacing:'-2px', lineHeight:1.1, marginBottom:18 }}>
                Ready to transform<br />
                <span className="lp-grad-green">your field operations?</span>
              </h2>
              <p style={{ fontSize:15.5, color:'rgba(255,255,255,0.35)', marginBottom:40, lineHeight:1.75, maxWidth:460, margin:'0 auto 40px' }}>
                Join organisations across Kenya already using Gigs4You to manage their field workforce with real-time precision.
              </p>
              <div className="cta-btns" style={{ display:'flex', gap:14, justifyContent:'center', flexWrap:'wrap' }}>
                <button className="lp-btn lp-btn-solid lp-btn-lg" style={{ fontSize:16, padding:'16px 40px' }} onClick={go}>
                  Get started free <ArrowRight size={16} />
                </button>
                <button className="lp-btn lp-btn-ghost" style={{ fontSize:15, padding:'15px 30px', borderRadius:13 }} onClick={go}>
                  <Phone size={15} />
                  Talk to sales
                </button>
              </div>

              {/* Small trust indicators */}
              <div style={{ display:'flex', gap:24, justifyContent:'center', marginTop:36, flexWrap:'wrap' }}>
                {['No credit card required','Free 30-day trial','Cancel any time'].map((t, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <CheckCircle2 size={13} color="#5BDC85" />
                    <span style={{ fontSize:12, color:'rgba(255,255,255,0.3)', fontWeight:500 }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════
            FOOTER
        ═══════════════════════════════════════════════════════ */}
        <div className="lp-hr" />
        <footer style={{ padding:'32px 0' }}>
          <div className="lp-wrap" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:14 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:24, height:24, borderRadius:7, background:'linear-gradient(135deg,#1B6B3A,#25934F)',
                display:'flex', alignItems:'center', justifyContent:'center' }}>
                <MapPin size={11} color="#fff" />
              </div>
              <span style={{ fontSize:13, color:'rgba(255,255,255,0.22)', fontWeight:500 }}>Gigs4You © 2026</span>
              <span style={{ fontSize:13, color:'rgba(255,255,255,0.08)' }}>·</span>
              <span style={{ fontSize:13, color:'rgba(255,255,255,0.15)' }}>Nairobi, Kenya</span>
            </div>
            <div style={{ display:'flex', gap:24 }}>
              {['Privacy','Terms','Status','Contact'].map(l => (
                <span key={l} style={{ fontSize:12, color:'rgba(255,255,255,0.2)', fontWeight:500, cursor:'pointer',
                  transition:'color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.color='rgba(255,255,255,0.5)')}
                  onMouseLeave={e => (e.currentTarget.style.color='rgba(255,255,255,0.2)')}>
                  {l}
                </span>
              ))}
            </div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.1)', fontStyle:'italic' }}>
              Built for Africa's field workforce
            </div>
          </div>
        </footer>

      </div>{/* lp-z */}
    </div>
  )
}
