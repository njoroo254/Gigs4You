import { create } from 'zustand'

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin', admin: 'Admin', manager: 'Manager',
  supervisor:  'Supervisor',  employer: 'Employer', agent: 'Field Agent',
  worker:      'Worker',
}

const MANAGER_ROLES = ['super_admin','admin','manager','supervisor','employer']

// Safe localStorage helpers — never crash on corrupt / missing data
const safeGet = (key: string) => {
  try { return localStorage.getItem(key) } catch { return null }
}
const safeSet = (key: string, val: string) => {
  try { localStorage.setItem(key, val) } catch { /* storage full */ }
}
const safeRemove = (key: string) => {
  try { localStorage.removeItem(key) } catch { /* ignore */ }
}
const safeParse = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback
  try { return JSON.parse(raw) as T } catch { return fallback }
}

interface AuthState {
  token:        string | null
  user:         any | null
  activeOrgId:  string | null
  activeOrgName: string | null
  setAuth:      (token: string, user: any) => void
  logout:       () => void
  setActiveOrg: (id: string, name: string) => void
  clearActiveOrg: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token:         safeGet('token'),
  user:          safeParse(safeGet('user'), null),
  activeOrgId:   safeGet('activeOrgId'),
  activeOrgName: safeGet('activeOrgName'),

  setAuth: (token, user) => {
    safeSet('token', token)
    safeSet('user', JSON.stringify(user))
    set({ token, user })
  },

  setActiveOrg: (id, name) => {
    safeSet('activeOrgId', id)
    safeSet('activeOrgName', name)
    set({ activeOrgId: id, activeOrgName: name })
  },

  clearActiveOrg: () => {
    safeRemove('activeOrgId')
    safeRemove('activeOrgName')
    set({ activeOrgId: null, activeOrgName: null })
  },

  logout: () => {
    // Clear auth
    const userId = safeParse(safeGet('user'), null as any)?.id
    safeRemove('token')
    safeRemove('user')
    safeRemove('activeOrgId')
    safeRemove('activeOrgName')
    // Clear Cathy AI chat history so it doesn't persist across sessions
    if (userId) safeRemove(`cathy_history_${userId}`)
    else {
      // Fallback: sweep any cathy_history_* keys
      try {
        Object.keys(localStorage)
          .filter(k => k.startsWith('cathy_history_'))
          .forEach(k => localStorage.removeItem(k))
      } catch { /* ignore */ }
    }
    // Reset to light so the login screen and the next user start clean
    try { document.documentElement.setAttribute('data-theme', 'light') } catch { /* ignore */ }
    set({ token: null, user: null, activeOrgId: null, activeOrgName: null })
  },
}))

// ── Stable selectors — use these instead of getters ──────────────────
// These are plain functions, never stale, always read current state
export const getRoleLabel  = (user: any) => ROLE_LABELS[user?.role] || 'User'
export const getIsManager  = (user: any) => MANAGER_ROLES.includes(user?.role)
export const getIsSuperAdmin = (user: any) => user?.role === 'super_admin'
export const getInitials   = (user: any) => {
  const name = user?.name || user?.companyName || ''
  const parts = name.trim().split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name[0]?.toUpperCase() || 'U'
}
