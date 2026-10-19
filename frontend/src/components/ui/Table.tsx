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
  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{children}</tr></thead>
)
export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <th scope="col" className={cx('px-4 py-3 font-medium', className)}>{children}</th>
)
export const TBody = ({ children }: { children: ReactNode }) => <tbody className="divide-y divide-slate-100">{children}</tbody>
export const Tr = ({ children }: { children: ReactNode }) => <tr className="hover:bg-slate-50/60">{children}</tr>
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <td className={cx('px-4 py-3 align-middle text-slate-700', className)}>{children}</td>
)
