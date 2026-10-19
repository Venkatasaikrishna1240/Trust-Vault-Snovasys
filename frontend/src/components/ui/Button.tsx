import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { cx } from './cx'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'sm' | 'md'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const variants: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-blue-600 to-blue-700 text-white shadow-xs shadow-blue-600/30 hover:from-blue-700 hover:to-blue-800 hover:shadow-md hover:shadow-blue-600/25 border border-blue-500/30 active:translate-y-0',
  secondary:
    'bg-white text-slate-700 border border-slate-300/90 shadow-2xs hover:bg-slate-50 hover:text-slate-900 hover:border-slate-400 active:bg-slate-100',
  danger:
    'bg-gradient-to-b from-red-600 to-red-700 text-white shadow-xs shadow-red-600/30 hover:from-red-700 hover:to-red-800 hover:shadow-md hover:shadow-red-600/25 border border-red-500/30',
  ghost:
    'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs font-semibold rounded-lg',
  md: 'h-10 px-4 text-sm font-semibold rounded-lg',
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', loading, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex cursor-pointer items-center justify-center gap-2 tracking-tight transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-px active:translate-y-0 active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 disabled:active:scale-100',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin text-current" aria-hidden="true" />}
      {children}
    </button>
  )
})
