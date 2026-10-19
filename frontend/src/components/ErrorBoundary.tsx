import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertOctagon, RotateCcw } from 'lucide-react'
import { Button } from './ui/Button'

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(_e: Error, _i: ErrorInfo) {
    /* intentionally no detail logging of user data */
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="grid min-h-screen place-items-center bg-slate-950 p-6 text-center">
        <div className="max-w-md rounded-2xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl text-slate-100">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-500 shadow-md">
            <AlertOctagon className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-400">
            An unexpected error occurred in the vault interface. Reloading usually fixes it.
          </p>
          <div className="mt-6">
            <Button className="w-full" onClick={() => window.location.assign('/')}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span>Reload app</span>
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
