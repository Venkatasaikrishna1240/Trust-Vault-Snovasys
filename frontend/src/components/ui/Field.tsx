import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cx } from './cx'

const control = 'block w-full rounded-lg border bg-white px-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-500'

interface FieldShell { label: string; error?: string; hint?: string; hideLabel?: boolean }

function Shell({ id, label, error, hint, hideLabel, children }: FieldShell & { id: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={cx('mb-1.5 block text-sm font-medium text-slate-700', hideLabel && 'sr-only')}>{label}</label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-500">{hint}</p>}
      {error && <p id={`${id}-err`} role="alert" className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  )
}

const aria = (id: string, error?: string, hint?: string) => ({
  'aria-invalid': error ? true : undefined,
  'aria-describedby': error ? `${id}-err` : hint ? `${id}-hint` : undefined,
})

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldShell>(
  function Input({ label, error, hint, hideLabel, className, ...rest }, ref) {
    const id = useId()
    return (
      <Shell id={id} label={label} error={error} hint={hint} hideLabel={hideLabel}>
        <input id={id} ref={ref} {...aria(id, error, hint)}
          className={cx(control, 'h-10', error ? 'border-red-400' : 'border-slate-300', className)} {...rest} />
      </Shell>
    )
  })

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldShell>(
  function Textarea({ label, error, hint, hideLabel, className, ...rest }, ref) {
    const id = useId()
    return (
      <Shell id={id} label={label} error={error} hint={hint} hideLabel={hideLabel}>
        <textarea id={id} ref={ref} rows={3} {...aria(id, error, hint)}
          className={cx(control, 'py-2', error ? 'border-red-400' : 'border-slate-300', className)} {...rest} />
      </Shell>
    )
  })

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & FieldShell>(
  function Select({ label, error, hint, hideLabel, className, children, ...rest }, ref) {
    const id = useId()
    return (
      <Shell id={id} label={label} error={error} hint={hint} hideLabel={hideLabel}>
        <select id={id} ref={ref} {...aria(id, error, hint)}
          className={cx(control, 'h-10', error ? 'border-red-400' : 'border-slate-300', className)} {...rest}>
          {children}
        </select>
      </Shell>
    )
  })
