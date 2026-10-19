import type { ReactNode } from 'react'
import { cx } from './cx'

export function Table({ children, caption }: { children: ReactNode; caption: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  )
}

export const THead = ({ children }: { children: ReactNode }) => (
  <thead className="border-b border-slate-200/90 bg-slate-50/90 text-xs font-semibold uppercase tracking-wider text-slate-500">
    <tr>{children}</tr>
  </thead>
)

export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <th scope="col" className={cx('px-4 py-3.5 sm:px-5 font-semibold text-slate-600', className)}>
    {children}
  </th>
)

export const TBody = ({ children }: { children: ReactNode }) => (
  <tbody className="divide-y divide-slate-100/90 bg-white">{children}</tbody>
)

export const Tr = ({ children }: { children: ReactNode }) => (
  <tr className="transition-colors duration-150 hover:bg-slate-50/80">{children}</tr>
)

export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <td className={cx('px-4 py-3.5 sm:px-5 align-middle text-slate-700', className)}>{children}</td>
)
