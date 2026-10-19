import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { AlertCircle } from 'lucide-react'
import { cx } from './cx'

const controlBase =
  'block w-full rounded-lg border bg-white px-3.5 text-sm text-slate-900 shadow-2xs placeholder:text-slate-400 transition-[border-color,box-shadow] duration-150 focus:border-blue-600 focus:ring-3 focus:ring-blue-500/15 focus:outline-hidden disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed'

interface FieldShell {
  label: string
  error?: string
  hint?: string
  hideLabel?: boolean
}

function Shell({
  id,
  label,
  error,
  hint,
  hideLabel,
  children,
}: FieldShell & { id: string; children: ReactNode }) {
  return (
    <div className="w-full">
      <label
        htmlFor={id}
        className={cx('mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-700', hideLabel && 'sr-only')}
      >
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-rose-600">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
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
        <input
          id={id}
          ref={ref}
          {...aria(id, error, hint)}
          className={cx(
            controlBase,
            'h-10',
            error ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/15' : 'border-slate-300/90',
            className,
          )}
          {...rest}
        />
      </Shell>
    )
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldShell>(
  function Textarea({ label, error, hint, hideLabel, className, ...rest }, ref) {
    const id = useId()
    return (
      <Shell id={id} label={label} error={error} hint={hint} hideLabel={hideLabel}>
        <textarea
          id={id}
          ref={ref}
          rows={3}
          {...aria(id, error, hint)}
          className={cx(
            controlBase,
            'py-2.5',
            error ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/15' : 'border-slate-300/90',
            className,
          )}
          {...rest}
        />
      </Shell>
    )
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & FieldShell>(
  function Select({ label, error, hint, hideLabel, className, children, ...rest }, ref) {
    const id = useId()
    return (
      <Shell id={id} label={label} error={error} hint={hint} hideLabel={hideLabel}>
        <select
          id={id}
          ref={ref}
          {...aria(id, error, hint)}
          className={cx(
            controlBase,
            'h-10 cursor-pointer bg-[length:1.25rem_1.25rem] bg-[right_0.5rem_center] bg-no-repeat pr-8',
            error ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/15' : 'border-slate-300/90',
            className,
          )}
          {...rest}
        >
          {children}
        </select>
      </Shell>
    )
  },
)
