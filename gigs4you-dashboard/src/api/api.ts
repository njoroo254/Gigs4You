import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

const PUBLIC_AUTH_401_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/verify-otp',
  '/auth/verify-contact',
  '/auth/resend-verification',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/refresh',
]

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(r => r, err => {
  const requestUrl = String(err.config?.url || '')
  const isPublicAuthRequest = PUBLIC_AUTH_401_PATHS.some(path => requestUrl.includes(path))
  if (err.response?.status === 401 && localStorage.getItem('token') && !isPublicAuthRequest) {
    localStorage.removeItem('token'); localStorage.removeItem('user')
    window.location.href = '/login'
  }
  return Promise.reject(err)
})

// ── Auth ────────────────────────────────────────────────
export const login       = (identifier: string, password: string) => api.post('/auth/login', { identifier, password }).then(r => r.data)
export const verifyOtp   = (challengeToken: string, code: string) => api.post('/auth/verify-otp', { challengeToken, code }).then(r => r.data)
export const verifyContact = (verificationToken: string, type: 'phone' | 'email', code: string) =>
  api.post('/auth/verify-contact', { verificationToken, type, code }).then(r => r.data)
export const resendVerification = (verificationToken: string, type: 'phone' | 'email') =>
  api.post('/auth/resend-verification', { verificationToken, type }).then(r => r.data)
export const register      = (d: any) => api.post('/auth/register', d).then(r => r.data)
export const createOrgUser = (d: any) => api.post('/auth/create-org-user', d).then(r => r.data)

// Contact update verification — sends OTP to new contact, then verifies before applying
export const requestContactUpdate = (type: 'email' | 'phone', newValue: string) =>
  api.post('/auth/request-contact-update', { type, newValue }).then(r => r.data)
export const verifyContactUpdate  = (type: 'email' | 'phone', code: string) =>
  api.post('/auth/verify-contact-update', { type, code }).then(r => r.data)

// ── Agents ──────────────────────────────────────────────
export const getAgents     = (p?: { organisationId?: string }) => api.get('/agents', { params: p }).then(r => r.data)
export const getLiveAgents = (p?: { organisationId?: string }) => api.get('/agents/live', { params: p }).then(r => r.data)
export const getGpsTrail   = (agentId: string, hours = 8) => api.get(`/gps/trail/${agentId}`, { params: { hours } }).then(r => r.data)
export const getAllUsers   = () => api.get('/users').then(r => r.data)
export const updateUser    = (id: string, d: any) => api.patch(`/users/${id}`, d).then(r => r.data)
export const deactivateUser = (id: string) => api.patch(`/users/${id}/deactivate`).then(r => r.data)
export const activateUser   = (id: string) => api.patch(`/users/${id}/activate`).then(r => r.data)

// ── Tasks ───────────────────────────────────────────────
export const getTasks      = (p?: any) => api.get('/tasks', { params: p }).then(r => r.data)
export const getTaskStats  = () => api.get('/tasks/stats').then(r => r.data)
export const createTask    = (d: any) => api.post('/tasks', d).then(r => r.data)
export const updateTask    = (id: string, d: any) => api.patch(`/tasks/${id}`, d).then(r => r.data)
export const deleteTask    = (id: string) => api.delete(`/tasks/${id}`).then(r => r.data)
export const startTask     = (id: string) => api.patch(`/tasks/${id}/start`).then(r => r.data)
export const completeTask  = (id: string, d?: any) => api.patch(`/tasks/${id}/complete`, d).then(r => r.data)
export const failTask      = (id: string, reason: string) => api.patch(`/tasks/${id}/fail`, { reason }).then(r => r.data)
export const approveTask   = (id: string, paymentAmount?: number) => api.patch(`/tasks/${id}/approve`, paymentAmount != null ? { paymentAmount } : {}).then(r => r.data)

// ── Jobs ────────────────────────────────────────────────
export const getJobs             = (p?: any) => api.get('/jobs', { params: p }).then(r => r.data)
export const getJobStats         = () => api.get('/jobs/stats').then(r => r.data)
export const createJob           = (d: any) => api.post('/jobs', d).then(r => r.data)
export const getJobApplications  = (id: string) => api.get(`/jobs/${id}/applications`).then(r => r.data)
export const assignJob           = (jobId: string, agentId: string) => api.patch(`/jobs/${jobId}/assign/${agentId}`).then(r => r.data)
export const completeJob         = (id: string, d: any) => api.patch(`/jobs/${id}/complete`, d).then(r => r.data)

// ── Workers ─────────────────────────────────────────────
export const getWorkers       = (p?: any) => api.get('/workers/search', { params: p }).then(r => r.data)
export const getWorkerProfile    = (id: string) => api.get(`/workers/${id}`).then(r => r.data)
export const getMyWorkerProfile  = () => api.get('/workers/me').then(r => r.data)
export const getLeaderboard   = () => api.get('/workers/leaderboard').then(r => r.data)
export const favouriteWorker  = (id: string) => {
  const favs: string[] = (() => { try { return JSON.parse(localStorage.getItem('fav_workers') || '[]') } catch { return [] } })()
  const idx = favs.indexOf(id)
  if (idx === -1) favs.push(id); else favs.splice(idx, 1)
  localStorage.setItem('fav_workers', JSON.stringify(favs))
  return favs
}
export const getFavourites = (): string[] => { try { return JSON.parse(localStorage.getItem('fav_workers') || '[]') } catch { return [] } }

// ── Skills ──────────────────────────────────────────────
export const getSkills   = (p?: any) => api.get('/skills', { params: p }).then(r => r.data)
export const createSkill = (name: string, category?: string) => api.post('/skills', { name, category }).then(r => r.data)
export const seedSkills = () => api.get('/skills/seed').then(r => r.data)

// ── Reports ─────────────────────────────────────────────
export const getReportSummary     = () => api.get('/reports/summary').then(r => r.data)
export const getTaskReport        = (p?: any) => api.get('/reports/tasks', { params: p }).then(r => r.data)
export const getAttendanceReport  = (p?: any) => api.get('/reports/attendance', { params: p }).then(r => r.data)
export const getFinancialReport   = (p?: any) => api.get('/reports/financial', { params: p }).then(r => r.data)
export const getLoginReport       = (p?: any) => api.get('/reports/logins', { params: p }).then(r => r.data)
export const getAgentPerformance  = () => api.get('/reports/agent-performance').then(r => r.data)

// ── Wallet / M-Pesa ─────────────────────────────────────
export const getWalletStats      = () => api.get('/wallet/platform-stats').then(r => r.data)
export const payAgent            = (d: any) => api.post('/mpesa/pay-agent', d).then(r => r.data)
export const bulkPay             = (payments: any[]) => api.post('/mpesa/bulk-pay', { payments }).then(r => r.data)
export const getOrgWallet        = () => api.get('/wallet/org').then(r => r.data)
export const getOrgTransactions  = (p?: { limit?: number; from?: string; to?: string }) =>
  api.get('/wallet/org/transactions', { params: p }).then(r => r.data)
export const downloadOrgStatement = (from?: string, to?: string) =>
  api.get('/wallet/org/statement', { params: { from, to }, responseType: 'blob' })
    .then(r => { _triggerDownload(r.data, `org-wallet-statement.csv`) })

function _triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ── Notifications ────────────────────────────────────────
export const getNotifications = () => api.get('/notifications').then(r => r.data)
export const markAllRead      = () => api.patch('/notifications/read-all').then(r => r.data)
export const markOneRead      = (id: string) => api.patch(`/notifications/${id}/read`).then(r => r.data)

export default api

// Billing
export const getSubscription        = () => api.get('/billing/subscription').then(r => r.data)
export const getInvoices            = () => api.get('/billing/invoices').then(r => r.data)
export const subscribePlan          = (plan: string) => api.post('/billing/subscribe', { plan }).then(r => r.data)
export const initiateStkPush        = (invoiceId: string, phone: string) => api.post(`/billing/invoices/${invoiceId}/pay-mpesa`, { phone }).then(r => r.data)
export const getAllSubscriptions     = () => api.get('/billing/admin/subscriptions').then(r => r.data)
export const confirmManualPayment    = (id: string, note: string) => api.patch(`/billing/admin/invoices/${id}/confirm`, { note }).then(r => r.data)
// Chat — DMs
export const getConversations       = () => api.get('/chat/conversations').then(r => r.data)
export const getChatMessages        = (otherId: string, limit = 50) => api.get(`/chat/conversations/${otherId}/messages`, { params: { limit } }).then(r => r.data)
export const sendChatMessage        = (otherId: string, body: string, taskId?: string) => api.post(`/chat/conversations/${otherId}/messages`, { body, taskId }).then(r => r.data)
export const markConvRead           = (otherId: string) => api.patch(`/chat/conversations/${otherId}/read`).then(r => r.data)
export const getUnreadCount         = () => api.get('/chat/unread-count').then(r => r.data)
export const getChatContacts        = () => api.get('/chat/contacts').then(r => r.data)
// Chat — Groups
export const getGroups              = () => api.get('/chat/groups').then(r => r.data)
export const createGroup            = (name: string, memberIds: string[], description?: string) => api.post('/chat/groups', { name, memberIds, description }).then(r => r.data)
export const getGroupMessages       = (groupId: string, limit = 60) => api.get(`/chat/groups/${groupId}/messages`, { params: { limit } }).then(r => r.data)
export const sendGroupMessage       = (groupId: string, body: string, attachmentUrl?: string) => api.post(`/chat/groups/${groupId}/messages`, { body, attachmentUrl }).then(r => r.data)
export const getGroupMembers        = (groupId: string) => api.get(`/chat/groups/${groupId}/members`).then(r => r.data)
export const addGroupMembers        = (groupId: string, userIds: string[]) => api.post(`/chat/groups/${groupId}/members`, { userIds }).then(r => r.data)
export const removeGroupMember      = (groupId: string, userId: string) => api.delete(`/chat/groups/${groupId}/members/${userId}`).then(r => r.data)
// Matching
export const getJobCandidates       = (jobId: string) => api.get(`/matching/jobs/${jobId}/candidates`).then(r => r.data)
export const getRecommendedJobs     = () => api.get('/matching/workers/recommended-jobs').then(r => r.data)
export const predictJobTime         = (jobId: string, agentId?: string) => api.get(`/matching/jobs/${jobId}/predict-time`, { params: { agentId } }).then(r => r.data)
export const getEfficiencyReport    = () => api.get('/matching/analytics/efficiency').then(r => r.data)
// Verification
export const getMyVerification      = () => api.get('/verification/me').then(r => r.data)
export const submitVerification     = (data: any) => api.post('/verification/submit', data).then(r => r.data)
export const getPendingVerifications= () => api.get('/verification/pending').then(r => r.data)
export const approveVerification    = (id: string, note?: string) => api.patch(`/verification/${id}/approve`, { note }).then(r => r.data)
export const rejectVerification     = (id: string, note: string) => api.patch(`/verification/${id}/reject`, { note }).then(r => r.data)
export const topupOrgWallet    = (phone: string, amount: number) => api.post('/mpesa/topup', { phone, amount }).then(r => r.data)
export const getSystemOptions  = (type: string) => api.get(`/system-options/${type}`).then(r => r.data) as Promise<string[]>
export const addSystemOption   = (type: string, value: string) => api.post('/system-options', { type, value }).then(r => r.data)

export const getAuditLogs  = (params: any) => api.get('/audit', { params }).then(r => r.data)
export const getAuditStats = () => api.get('/audit/stats').then(r => r.data)

// ── Disputes ──────────────────────────────────────────────
export const getDisputes     = (params?: any)          => api.get('/disputes',           { params }).then(r => r.data)
export const getMyDisputes   = ()                      => api.get('/disputes/mine').then(r => r.data)
export const fileDispute     = (d: { type: string; description: string; againstUserId: string; referenceId?: string; referenceType?: string; amountKes?: number }) =>
  api.post('/disputes', d).then(r => r.data)
export const getDisputeStats = ()                      => api.get('/disputes/admin/stats').then(r => r.data)
export const reviewDispute   = (id: string)            => api.patch(`/disputes/${id}/review`).then(r => r.data)
export const resolveDispute  = (id: string, d: { resolution: string; resolutionNote?: string; refundAmountKes?: number }) =>
  api.patch(`/disputes/${id}/resolve`, d).then(r => r.data)
export const closeDispute    = (id: string, reason: string) => api.patch(`/disputes/${id}/close`, { reason }).then(r => r.data)

// ── AI features ──────────────────────────────────────────
export const suggestJobPricing = (d: {
  description: string; category: string; county: string;
  is_urgent?: boolean; similar_jobs?: any[]
}) => api.post('/jobs/suggest-pricing', d).then(r => r.data)

export const getAgentNarrative = (agentId: string) =>
  api.get(`/agents/${agentId}/narrative`).then(r => r.data)

export const getBillingRecommendation = () =>
  api.get('/billing/recommend-plan').then(r => r.data)

export const parseJobDescription = (description: string, context?: any) =>
  api.post('/jobs/parse-intent', { description, context: context ?? {} }).then(r => r.data)
