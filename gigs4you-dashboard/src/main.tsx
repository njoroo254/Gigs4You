import * as Sentry from '@sentry/react'
import { BrowserTracing } from '@sentry/tracing'

// Initialise Sentry — only active when VITE_SENTRY_DSN is set
const sentryDsn = import.meta.env.VITE_SENTRY_DSN
if (sentryDsn) {
  Sentry.init({
    dsn:          sentryDsn,
    environment:  import.meta.env.MODE,
    integrations: [new BrowserTracing()],
    tracesSampleRate: 0.2,
  })
}

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/shared/ErrorBoundary'
import 'leaflet/dist/leaflet.css'
import './styles/global.css'

// Show a visible error even if React fails to mount
window.addEventListener('error', (e) => {
  const root = document.getElementById('root')
  if (root && !root.innerHTML.trim()) {
    root.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;
        background:#F7F8FA;font-family:sans-serif;padding:24px;">
        <div style="max-width:560px;width:100%;background:#fff;border-radius:16px;
          border:1px solid #FECACA;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
          <div style="font-size:40px;margin-bottom:12px;">⚠️</div>
          <h2 style="font-size:18px;font-weight:700;color:#111827;margin-bottom:8px;">
            Dashboard failed to start
          </h2>
          <p style="font-size:13px;color:#6B7280;margin-bottom:16px;">
            Open browser DevTools (F12) → Console tab for the exact error.
          </p>
          <pre style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;
            padding:12px;font-size:11px;color:#991B1B;overflow:auto;white-space:pre-wrap;
            word-break:break-all;max-height:300px;">
${e.message || 'Unknown error'}
${e.filename ? `\nFile: ${e.filename}:${e.lineno}` : ''}
          </pre>
          <button onclick="window.location.reload()"
            style="margin-top:16px;background:#1B6B3A;color:#fff;border:none;
            border-radius:8px;padding:10px 20px;font-size:13px;font-weight:600;cursor:pointer;">
            Reload
          </button>
        </div>
      </div>`
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
