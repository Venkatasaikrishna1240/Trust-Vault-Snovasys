import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from './ui/Button'

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(_e: Error, _i: ErrorInfo) { /* intentionally no detail logging of user data */ }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-500">An unexpected error occurred. Reloading usually fixes it.</p>
          <Button className="mt-5" onClick={() => window.location.assign('/')}>Reload app</Button>
        </div>
      </div>
    )
  }
}
