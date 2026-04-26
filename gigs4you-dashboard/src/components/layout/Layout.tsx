import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, ClipboardList, Briefcase, UserCheck,
  BarChart3, LogOut, MapPin, Bell, Menu, CreditCard, Settings,
  ShieldCheck, X, UserCircle, Building2, ScrollText, Globe,
  ChevronDown, ChevronRight, Activity, MessageSquare, ClipboardCheck, Wallet, Scale
} from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import { useAuthStore } from '../../store/store'
import { getNotifications, markAllRead, getUnreadCount, getTaskStats } from '../../api/api'
import AIWidget from '../AIWidget'

const ROLE_LABELS: Record<string,string> = {
  super_admin:'Super Admin', admin:'Admin', manager:'Manager',
  supervisor:'Supervisor', employer:'Employer', agent:'Worker',
}
const getRoleLabel  = (r: string) => ROLE_LABELS[r] || 'User'
const getInitials   = (name='', company='') => {
  const n = (name || company || '').trim()
  const p = n.split(' ')
  return p.length >= 2 ? (p[0][0]+p[1][0]).toUpperCase() : n[0]?.toUpperCase() || 'U'
}

// ── Nav definitions ─────────────────────────────────
// super_admin has a completely different nav tree
const SUPER_ADMIN_NAV = [
  { to:'/dashboard',            icon:LayoutDashboard,  label:'Dashboard'           },
  { to:'/access-logs',          icon:ScrollText,       label:'Access logs'         },
  { to:'/audit-logs',           icon:ClipboardCheck,   label:'Audit trail'         },
  { to:'/jobs',                 icon:Briefcase,        label:'Jobs'                },
  { to:'/disputes',             icon:Scale,            label:'Disputes'            },
  { to:'/chat',                 icon:MessageSquare,    label:'Messages'            },
  { divider: true,              label:'Organisations'                              },
  { to:'/manage-organisations', icon:Building2,        label:'Manage orgs'         },
  { divider: true,              label:'System'                                     },
  { to:'/system-reports',       icon:BarChart3,        label:'System reports'      },
  { to:'/settings',             icon:Settings,         label:'System settings'     },
]

// admin sees their org scope only
const ADMIN_NAV = [
  { to:'/dashboard',     icon:LayoutDashboard,  label:'Dashboard'      },
  { to:'/gps-map',       icon:MapPin,          label:'GPS Map'        },
  { to:'/agents',        icon:Users,            label:'Agents'          },
  { to:'/tasks',         icon:ClipboardList,    label:'Tasks'          },
  { to:'/jobs',          icon:Briefcase,        label:'Jobs'           },
  { to:'/wallet',        icon:Wallet,           label:'Wallet'         },
  { to:'/payments',      icon:CreditCard,       label:'Payments'       },
  { to:'/reports',       icon:BarChart3,        label:'Reports'        },
  { to:'/audit-logs',    icon:ClipboardCheck,   label:'Audit trail'    },
  { to:'/users',         icon:ShieldCheck,      label:'Team users'     },
  { to:'/chat',          icon:MessageSquare,    label:'Messages'       },
  { to:'/billing',       icon:CreditCard,       label:'Billing'        },
  { to:'/verification',  icon:ShieldCheck,      label:'Verification'   },
  { to:'/disputes',      icon:Scale,            label:'Disputes'       },
  { to:'/profile',       icon:UserCircle,       label:'My profile'     },
  { to:'/settings',      icon:Settings,         label:'Settings'       },
]

// manager / supervisor / employer
const MANAGER_NAV = [
  { to:'/dashboard',     icon:LayoutDashboard, label:'Dashboard'      },
  { to:'/gps-map',       icon:MapPin,        label:'GPS Map'        },
  { to:'/agents',        icon:Users,           label:'Agents'          },
  { to:'/tasks',         icon:ClipboardList,   label:'Tasks'          },
  { to:'/jobs',          icon:Briefcase,       label:'Jobs'           },
  { to:'/workers',       icon:UserCheck,       label:'Workers'        },
  { to:'/wallet',        icon:Wallet,          label:'Wallet'         },
  { to:'/payments',      icon:CreditCard,      label:'Payments'       },
  { to:'/reports',       icon:BarChart3,       label:'Reports'        },
  { to:'/disputes',      icon:Scale,           label:'Disputes'       },
  { to:'/chat',          icon:MessageSquare,   label:'Messages'       },
  { to:'/profile',       icon:UserCircle,     label:'My profile'     },
  { to:'/settings',      icon:Settings,        label:'Settings'       },
]

// agent — only profile + settings (tasks/jobs are on mobile)
const AGENT_NAV = [
  { to:'/dashboard',     icon:LayoutDashboard, label:'Dashboard'      },
  { to:'/disputes',      icon:Scale,           label:'Disputes'       },
  { to:'/chat',          icon:MessageSquare,   label:'Messages'       },
  { to:'/profile',       icon:UserCircle,      label:'My profile'     },
  { to:'/settings',      icon:Settings,        label:'Settings'       },
]

// worker (no org) — jobs + profile
const WORKER_NAV = [
  { to:'/jobs',          icon:Briefcase,       label:'Jobs'           },
  { to:'/disputes',      icon:Scale,           label:'Disputes'       },
  { to:'/profile',       icon:UserCircle,      label:'My profile'     },
  { to:'/settings',      icon:Settings,        label:'Settings'       },
]

function getNav(role: string) {
  switch (role) {
    case 'super_admin': return SUPER_ADMIN_NAV
    case 'admin':       return ADMIN_NAV
    case 'manager': case 'supervisor': case 'employer': return MANAGER_NAV
    case 'agent':       return AGENT_NAV
    default:            return WORKER_NAV
  }
}

const NOTIF_ICONS: Record<string,string> = {
  job:'💼', task:'✅', payment:'💰', application:'📋', system:'🔔'
}

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate  = useNavigate()

  const _user     = useMemo(() => { try { return user || JSON.parse(localStorage.getItem('user') || 'null') } catch { return user } }, [user])
  const role      = _user?.role || 'worker'
  const roleLabel = getRoleLabel(role)
  const initials  = getInitials(_user?.name, _user?.companyName)
  const nav       = getNav(role)

  const [open, setOpen]           = useState(true)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifs, setNotifs]       = useState<any[]>([])
  const [unread, setUnread]       = useState(0)
  const [chatUnread, setChatUnread]   = useState(0)
  const [pendingTasks, setPendingTasks] = useState(0)

  useEffect(() => {
    const fetchAll = async () => {
      // Bell notifications
      getNotifications().then((data: any[]) => {
        if (!Array.isArray(data)) return
        setNotifs(data.slice(0, 15))
        setUnread(data.filter((n: any) => !n.isRead).length)
      }).catch(() => {})

      // Chat unread count
      getUnreadCount().then((res: any) => {
        const count = typeof res === 'number' ? res : (res?.count ?? 0)
        setChatUnread(count)
      }).catch(() => {})

      // Pending tasks count (admins / managers only)
      if (['super_admin','admin','manager','supervisor'].includes(role)) {
        getTaskStats().then((stats: any) => {
          setPendingTasks((stats?.pending ?? 0) + (stats?.in_progress ?? 0))
        }).catch(() => {})
      }
    }
    fetchAll()
    const timer = setInterval(fetchAll, 30_000)
    return () => clearInterval(timer)
  }, [role])

  const doMarkAll = () => markAllRead().catch(()=>{}).then(() => {
    setNotifs(n => n.map(x => ({...x, isRead:true}))); setUnread(0)
  })

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden' }}>

      {/* ── Sidebar ─────────────────────────────── */}
      <aside style={{
        width: open ? 220 : 56, minWidth: open ? 220 : 56,
        background:'#0D1B14', display:'flex', flexDirection:'column',
        transition:'width 0.2s, min-width 0.2s', overflow:'hidden', flexShrink:0,
        borderRight:'1px solid rgba(255,255,255,0.05)',
      }}>
        {/* Logo */}
        <div style={{ height:56, padding:'0 12px', display:'flex', alignItems:'center', gap:10,
          borderBottom:'1px solid rgba(255,255,255,0.07)', flexShrink:0 }}>
          <div style={{ width:28, height:28, borderRadius:7, background:'#1B6B3A', flexShrink:0,
            display:'flex', alignItems:'center', justifyContent:'center' }}>
            <MapPin size={14} color="#fff" />
          </div>
          {open && <div>
            <div style={{ color:'#fff', fontWeight:800, fontSize:13 }}>Gigs4You</div>
            <div style={{ color:'rgba(255,255,255,0.25)', fontSize:9, letterSpacing:'0.6px' }}>
              {role === 'super_admin' ? 'SUPER ADMIN' : role === 'admin' ? 'ORG ADMIN' : 'PORTAL'}
            </div>
          </div>}
        </div>

        {/* User badge */}
        {open && _user && (
          <div style={{ margin:'8px 8px 2px', padding:'8px 10px',
            background:'rgba(255,255,255,0.04)', borderRadius:8,
            border:'1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:26, height:26, borderRadius:'50%', background:'#1B6B3A',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:10, fontWeight:700, color:'#fff', flexShrink:0 }}>
                {initials}
              </div>
              <div style={{ minWidth:0, flex:1 }}>
                <div style={{ color:'#fff', fontSize:12, fontWeight:600, whiteSpace:'nowrap',
                  overflow:'hidden', textOverflow:'ellipsis' }}>
                  {_user.name || _user.companyName || 'User'}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <div style={{ width:6, height:6, borderRadius:'50%',
                    background: role==='super_admin'?'#F59E0B':role==='admin'?'#3B82F6':'#1B6B3A' }} />
                  <span style={{ color:'rgba(255,255,255,0.35)', fontSize:10 }}>{roleLabel}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav style={{ flex:1, padding:'6px', overflowY:'auto', overflowX:'hidden' }}>
          <style>{`
            .g4y-nav { transition: background 0.12s, color 0.12s !important; }
            .g4y-nav:hover { background: rgba(255,255,255,0.07) !important; color: rgba(255,255,255,0.85) !important; }
            .g4y-nav.active { background: rgba(255,255,255,0.1) !important; color: #fff !important; font-weight: 600 !important; }
            .g4y-divider { padding: 8px 10px 4px; color: rgba(255,255,255,0.2); font-size: 9px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; }
          `}</style>
          {nav.map((item: any, i: number) => {
            if (item.divider) return (
              open ? <div key={i} className="g4y-divider">{item.label}</div>
              : <div key={i} style={{ height:1, background:'rgba(255,255,255,0.07)', margin:'6px 8px' }} />
            )
            const Icon = item.icon
            const badge =
              item.to === '/chat'  ? chatUnread :
              item.to === '/tasks' ? pendingTasks : 0
            return (
              <NavLink key={item.to} to={item.to}
                className={({ isActive }) => `g4y-nav${isActive ? ' active' : ''}`}
                style={{ display:'flex', alignItems:'center', gap:9, padding:'8px 10px',
                  borderRadius:8, marginBottom:1, textDecoration:'none',
                  color:'rgba(255,255,255,0.38)', fontSize:12, whiteSpace:'nowrap',
                  position:'relative' }}>
                <div style={{ position:'relative', flexShrink:0 }}>
                  <Icon size={15} />
                  {badge > 0 && (
                    <div style={{
                      position:'absolute', top:-5, right:-6,
                      minWidth:14, height:14, borderRadius:99,
                      background: item.to === '/chat' ? '#3B82F6' : '#F59E0B',
                      color:'#fff', fontSize:8, fontWeight:800,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      padding:'0 3px', border:'1.5px solid #0D1B14',
                    }}>
                      {badge > 99 ? '99+' : badge}
                    </div>
                  )}
                </div>
                {open && <span style={{ flex:1 }}>{item.label}</span>}
                {open && badge > 0 && (
                  <span style={{
                    minWidth:18, height:18, borderRadius:99, padding:'0 5px',
                    background: item.to === '/chat' ? 'rgba(59,130,246,0.2)' : 'rgba(245,158,11,0.2)',
                    color: item.to === '/chat' ? '#60A5FA' : '#FCD34D',
                    fontSize:9, fontWeight:700,
                    display:'flex', alignItems:'center', justifyContent:'center',
                  }}>
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Sign out */}
        <div style={{ padding:'6px 6px 8px', borderTop:'1px solid rgba(255,255,255,0.07)', flexShrink:0 }}>
          <button onClick={() => { logout(); navigate('/login') }}
            className="g4y-nav"
            style={{ display:'flex', alignItems:'center', gap:9, padding:'8px 10px',
              borderRadius:8, width:'100%', color:'rgba(255,255,255,0.3)',
              fontSize:12, background:'none', border:'none', cursor:'pointer' }}>
            <LogOut size={14} style={{ flexShrink:0 }} />
            {open && 'Sign out'}
          </button>
        </div>
      </aside>

      {/* ── Main ──────────────────────────────────── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
        <header style={{ height:56, background:'var(--white)', borderBottom:'1px solid var(--border)',
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'0 20px', flexShrink:0 }}>
          <button onClick={() => setOpen(o => !o)}
            style={{ width:32, height:32, borderRadius:8, display:'flex', alignItems:'center',
              justifyContent:'center', color:'var(--text-3)', background:'none', border:'none',
              cursor:'pointer', transition:'background 0.12s' }}
            onMouseEnter={e => e.currentTarget.style.background='var(--surface)'}
            onMouseLeave={e => e.currentTarget.style.background='transparent'}>
            <Menu size={17} />
          </button>
          <div style={{ flex:1 }} />

          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {/* Notifications */}
            <div style={{ position:'relative' }}>
              <button onClick={() => setNotifOpen(o => !o)}
                style={{ width:34, height:34, borderRadius:8, display:'flex', alignItems:'center',
                  justifyContent:'center', color:'var(--text-3)', background:'none', border:'none',
                  cursor:'pointer', position:'relative', transition:'background 0.12s' }}
                onMouseEnter={e => e.currentTarget.style.background='var(--surface)'}
                onMouseLeave={e => { if (!notifOpen) e.currentTarget.style.background='transparent' }}>
                <Bell size={17} />
                {unread > 0 && (
                  <div style={{ position:'absolute', top:5, right:5, width:15, height:15,
                    borderRadius:'50%', background:'var(--danger)', color:'#fff', fontSize:9,
                    fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center',
                    border:'2px solid var(--white)' }}>
                    {unread > 9 ? '9+' : unread}
                  </div>
                )}
              </button>
              {notifOpen && (
                <>
                  <div onClick={() => setNotifOpen(false)} style={{ position:'fixed', inset:0, zIndex:998 }} />
                  <div style={{ position:'absolute', top:'calc(100% + 6px)', right:0, width:320,
                    background:'var(--white)', borderRadius:14, border:'1px solid var(--border)',
                    boxShadow:'0 12px 40px rgba(0,0,0,0.12)', zIndex:999, overflow:'hidden' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                      padding:'12px 14px', borderBottom:'1px solid var(--border)' }}>
                      <span style={{ fontWeight:700, fontSize:14 }}>Notifications</span>
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        {unread > 0 && <button onClick={doMarkAll}
                          style={{ fontSize:11, color:'var(--green)', fontWeight:600, background:'none', border:'none', cursor:'pointer' }}>
                          Mark all read</button>}
                        <button onClick={() => setNotifOpen(false)} style={{ background:'none', border:'none', cursor:'pointer', display:'flex' }}>
                          <X size={14} color="var(--text-4)" /></button>
                      </div>
                    </div>
                    <div style={{ maxHeight:380, overflowY:'auto' }}>
                      {notifs.length === 0
                        ? <div style={{ padding:'28px 16px', textAlign:'center', color:'var(--text-4)', fontSize:13 }}>All caught up</div>
                        : notifs.map(n => (
                          <div key={n.id} style={{ display:'flex', gap:10, padding:'11px 14px',
                            background: n.isRead ? 'var(--white)' : 'var(--green-pale)', borderBottom:'1px solid var(--border)',
                            cursor:'pointer', transition:'background 0.1s' }}
                            onMouseEnter={e => e.currentTarget.style.background='var(--surface)'}
                            onMouseLeave={e => e.currentTarget.style.background=n.isRead?'var(--white)':'var(--green-pale)'}>
                            <div style={{ width:30, height:30, borderRadius:8, background:'var(--surface)',
                              flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15 }}>
                              {NOTIF_ICONS[n.type]||'🔔'}
                            </div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:12, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{n.title}</div>
                              <div style={{ fontSize:11, color:'var(--text-3)', lineHeight:1.4, marginTop:1 }}>{n.body}</div>
                            </div>
                            {!n.isRead && <div style={{ width:7, height:7, borderRadius:'50%', background:'var(--green)', flexShrink:0, marginTop:3 }} />}
                          </div>
                        ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* User pill */}
            <div onClick={() => navigate('/profile')}
              style={{ display:'flex', alignItems:'center', gap:7, padding:'5px 10px',
                background:'var(--surface)', borderRadius:99, border:'1px solid var(--border)', cursor:'pointer' }}>
              <div style={{ width:22, height:22, borderRadius:'50%',
                background: role==='super_admin'?'#F59E0B':role==='admin'?'#3B82F6':'#1B6B3A',
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, color:'#fff' }}>
                {initials}
              </div>
              <span style={{ fontSize:12, fontWeight:600, color:'var(--text-2)',
                maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {_user?.name || 'User'}
              </span>
              <span style={{ fontSize:10, padding:'1px 6px', borderRadius:99,
                background: role==='super_admin'?'var(--accent-pale)':role==='admin'?'var(--info-pale)':'var(--green-pale)',
                color: role==='super_admin'?'var(--accent)':role==='admin'?'var(--info)':'var(--green)',
                fontWeight:600 }}>
                {roleLabel}
              </span>
            </div>
          </div>
        </header>

        <main style={{ flex:1, overflow:'auto', padding:'20px 24px' }}>
          <Outlet />
        </main>
      </div>
      <AIWidget user={_user} />
    </div>
  )
}
