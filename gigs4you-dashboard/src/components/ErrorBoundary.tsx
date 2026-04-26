import React from 'react'

interface ErrorBoundaryProps {
  children: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('React ErrorBoundary caught an error:', error, info)
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div style={{ padding:24, minHeight:'calc(100vh - 56px)', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ maxWidth:560, width:'100%', background:'#fff', borderRadius:16, border:'1px solid var(--border)', boxShadow:'0 18px 40px rgba(0,0,0,0.08)', padding:28 }}>
          <h2 style={{ margin:0, fontSize:22, fontWeight:700 }}>Something went wrong</h2>
          <p style={{ margin:'12px 0 18px', color:'var(--text-3)', lineHeight:1.6 }}>
            The page failed to load due to an unexpected error. Please refresh, or contact support if it keeps happening.
          </p>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            <button onClick={() => window.location.reload()}
              className="btn btn-primary"
              style={{ minWidth:120, padding:'10px 14px' }}>
              Reload page
            </button>
            <button onClick={() => this.setState({ hasError:false, error:null })}
              className="btn btn-ghost"
              style={{ minWidth:120, padding:'10px 14px' }}>
              Try again
            </button>
          </div>
          {this.state.error && (
            <div style={{ marginTop:20, padding:14, background:'var(--surface)', borderRadius:12, color:'var(--text-4)', fontSize:12, whiteSpace:'pre-wrap' }}>
              <strong>Error:</strong> {this.state.error.message}
            </div>
          )}
        </div>
      </div>
    )
  }
}
