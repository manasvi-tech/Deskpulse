import React from 'react'

/**
 * Error boundary specifically for Recharts components.
 * Recharts can throw synchronous TypeErrors (e.g. "filter is not a function")
 * during render if data is unexpectedly shaped. This boundary catches those
 * crashes so the rest of the app stays alive.
 */
export class ChartErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Log for debugging — not just console.log, includes component stack
    console.error('[ChartErrorBoundary] Chart render failed:', error.message, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[120px] gap-2 text-center">
          <span className="text-2xl">📊</span>
          <p className="text-slate-400 text-sm font-medium">Chart unavailable</p>
          <p className="text-slate-600 text-xs max-w-xs">
            {this.state.error.message || 'Could not render chart with current data'}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-1 text-xs text-teal-400 hover:text-teal-300 underline"
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
