import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './store/store'
import Layout from './components/layout/Layout'
import SessionTimeout from './components/SessionTimeout'
import LoginPage from './pages/auth/LoginPage'
import LandingPage from './pages/landing/LandingPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import AgentsPage from './pages/agents/AgentsPage'
import TasksPage from './pages/tasks/TasksPage'
import JobsPage from './pages/jobs/JobsPage'
import WorkersPage from './pages/workers/WorkersPage'
import ReportsPage from './pages/reports/ReportsPage'
import PaymentsPage from './pages/payments/PaymentsPage'
import UsersPage from './pages/users/UsersPage'
import SettingsPage from './pages/settings/SettingsPage'
import ProfilePage from './pages/profile/ProfilePage'
import AccessLogsPage from './pages/access-logs/AccessLogsPage'
import ManageOrgsPage from './pages/superadmin/ManageOrgsPage'
import SystemReportsPage from './pages/system/SystemReportsPage'
import BillingPage from './pages/billing/BillingPage'
import ChatPage from './pages/chat/ChatPage'
import VerificationPage from './pages/verification/VerificationPage'
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage'
import AuditPage from './pages/audit/AuditPage'
import GpsMapPage from './pages/gps/GpsMapPage'
import WalletPage from './pages/wallet/WalletPage'
import DisputesPage from './pages/disputes/DisputesPage'

function Protected({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.token)
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{
        style: { fontFamily:'DM Sans', fontSize:'13px', borderRadius:'10px' },
        success: { iconTheme: { primary:'#1B6B3A', secondary:'#fff' } },
      }} />
      <Routes>
        {/* Public routes */}
        <Route path="/"                element={<LandingPage />} />
        <Route path="/login"           element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />

        {/* Protected dashboard — pathless layout route */}
        <Route element={<Protected><SessionTimeout /><Layout /></Protected>}>
          <Route path="dashboard"            element={<DashboardPage />} />
          <Route path="agents"               element={<AgentsPage />} />
          <Route path="tasks"                element={<TasksPage />} />
          <Route path="jobs"                 element={<JobsPage />} />
          <Route path="workers"              element={<WorkersPage />} />
          <Route path="payments"             element={<PaymentsPage />} />
          <Route path="reports"              element={<ReportsPage />} />
          <Route path="users"                element={<UsersPage />} />
          <Route path="profile"              element={<ProfilePage />} />
          <Route path="settings"             element={<SettingsPage />} />
          <Route path="access-logs"          element={<AccessLogsPage />} />
          <Route path="audit-logs"           element={<AuditPage />} />
          <Route path="manage-organisations" element={<ManageOrgsPage />} />
          <Route path="system-reports"       element={<SystemReportsPage />} />
          <Route path="billing"              element={<BillingPage />} />
          <Route path="chat"                 element={<ChatPage />} />
          <Route path="verification"         element={<VerificationPage />} />
          <Route path="gps-map"              element={<GpsMapPage />} />
          <Route path="wallet"               element={<WalletPage />} />
          <Route path="disputes"             element={<DisputesPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
