import { Component, ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: any) {
    console.error('Gigs4You Error Boundary caught:', error, info)
    // Report to Sentry if available
    try {
      const Sentry = (window as any).__SENTRY__ || require('@sentry/react')
      Sentry.captureException(error, { contexts: { react: info } })
    } catch (_) {}
  }

  render() {
    if (!this.state.error) return this.props.children

    const msg = this.state.error.message || 'Unknown error'
    const isDev = import.meta.env.DEV

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#F7F8FA', fontFamily: 'DM Sans, sans-serif', padding: 24,
      }}>
        <div style={{
          maxWidth: 540, width: '100%', background: '#fff', borderRadius: 16,
          border: '1px solid #FEE2E2', padding: 32, textAlign: 'center',
          boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 20 }}>
            The dashboard encountered an error. Your data is safe.
          </p>
          {isDev && (
            <pre style={{
              background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8,
              padding: 12, fontSize: 11, color: '#991B1B', textAlign: 'left',
              overflowX: 'auto', marginBottom: 20, whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}>
              {msg}
              {'\n\n'}
              {this.state.error.stack?.split('\n').slice(0, 6).join('\n')}
            </pre>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button
              onClick={() => this.setState({ error: null })}
              style={{
                background: '#1B6B3A', color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
              Try again
            </button>
            <button
              onClick={() => window.location.href = '/'}
              style={{
                background: '#F3F4F6', color: '#374151', border: 'none', borderRadius: 8,
                padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
              Go to home
            </button>
          </div>
        </div>
      </div>
    )
  }
}
