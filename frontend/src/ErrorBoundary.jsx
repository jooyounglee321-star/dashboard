import { Component } from 'react'

const DEBUG = import.meta.env.VITE_DEBUG_MODE === 'true'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    if (DEBUG) {
      console.group('[ErrorBoundary] 컴포넌트 오류 감지')
      console.error('error:', error)
      console.error('componentStack:', info.componentStack)
      console.groupEnd()
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div style={{
        padding: '1rem', borderRadius: 10, margin: '0.5rem 0',
        background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)',
        color: 'var(--ink2)', fontSize: '0.82rem',
      }}>
        <div style={{ fontWeight: 600, color: 'var(--red)', marginBottom: '0.3rem' }}>
          ⚠️ {this.props.label || '위젯'} 오류
        </div>
        {DEBUG && this.state.error && (
          <pre style={{ fontSize: '0.72rem', color: 'var(--ink3)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: '0.4rem' }}>
            {this.state.error.toString()}
          </pre>
        )}
        <button
          onClick={() => this.setState({ hasError: false, error: null })}
          style={{
            marginTop: '0.5rem', padding: '0.25rem 0.7rem', fontSize: '0.78rem',
            border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)',
            color: 'var(--ink)', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          다시 시도
        </button>
      </div>
    )
  }
}
