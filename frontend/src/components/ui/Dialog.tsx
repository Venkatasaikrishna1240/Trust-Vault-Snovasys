import { useEffect, useId, useRef, type ReactNode } from 'react'
import { AlertTriangle, HelpCircle, X } from 'lucide-react'
import { Button } from './Button'

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

interface DialogProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

export function Dialog({ open, title, onClose, children, footer }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const root = ref.current
    const first = root?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? root)?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !root) return
      const els = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (!els.length) {
        e.preventDefault()
        return
      }
      const a = els[0],
        z = els[els.length - 1]
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault()
        z.focus()
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault()
        a.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      prev?.focus()
    }
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div
        className="vault-fade fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="vault-enter relative w-full max-w-md rounded-2xl border border-slate-200/90 bg-white shadow-2xl transition-all"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4.5">
          <h2 id={titleId} className="text-base font-bold tracking-tight text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="px-6 py-5 text-sm leading-relaxed text-slate-600">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2.5 border-t border-slate-100 bg-slate-50/50 px-6 py-3.5 rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

interface ConfirmProps {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
  danger?: boolean
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  loading,
  danger = true,
}: ConfirmProps) {
  return (
    <Dialog
      open={open}
      title={title}
      onClose={loading ? () => {} : onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3.5">
        <div
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${
            danger
              ? 'border-rose-200 bg-rose-50 text-rose-600'
              : 'border-blue-200 bg-blue-50 text-blue-600'
          }`}
        >
          {danger ? (
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          ) : (
            <HelpCircle className="h-5 w-5" aria-hidden="true" />
          )}
        </div>
        <div className="flex-1">{message}</div>
      </div>
    </Dialog>
  )
}
