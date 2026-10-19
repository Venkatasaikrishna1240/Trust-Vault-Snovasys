import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Shield, X } from 'lucide-react'

type Kind = 'success' | 'error'
interface ToastItem {
  id: number
  kind: Kind
  message: string
}
interface ToastApi {
  success: (m: string) => void
  error: (m: string) => void
}

const Ctx = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const c = useContext(Ctx)
  if (!c) throw new Error('useToast must be used inside ToastProvider')
  return c
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), [])
  const push = useCallback(
    (kind: Kind, message: string) => {
      const id = ++seq.current
      setItems((l) => [...l.slice(-3), { id, kind, message }])
      setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4000)
    },
    [dismiss],
  )
  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
    }),
    [push],
  )

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed bottom-5 right-5 z-[70] flex w-[min(26rem,calc(100vw-2rem))] flex-col gap-2.5"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={`vault-enter pointer-events-auto flex items-start gap-3 rounded-xl border bg-white/95 p-3.5 text-sm shadow-xl backdrop-blur-md transition-all ${
              t.kind === 'success'
                ? 'border-emerald-200 shadow-emerald-500/10'
                : 'border-rose-200 shadow-rose-500/10'
            }`}
          >
            <div
              className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md ${
                t.kind === 'success'
                  ? 'bg-emerald-50 text-emerald-600'
                  : 'bg-rose-50 text-rose-600'
              }`}
            >
              {t.kind === 'success' ? (
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              ) : (
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-slate-400">
                <Shield className="h-3 w-3 text-slate-400" aria-hidden="true" />
                <span>{t.kind === 'success' ? 'Vault Notification' : 'Security Alert'}</span>
              </div>
              <p className="mt-0.5 text-sm font-medium text-slate-800">{t.message}</p>
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="cursor-pointer text-slate-400 hover:text-slate-600 transition-colors p-0.5"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
