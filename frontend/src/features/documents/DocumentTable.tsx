import { Link } from 'react-router-dom'
import { FileText, FileSpreadsheet, FileCode } from 'lucide-react'
import { Table, TBody, Td, Th, THead, Tr } from '../../components/ui/Table'
import { AccessBadge, Badge } from '../../components/ui/Badge'
import { categoryLabel, formatBytes, formatDate } from '../../lib/format'
import type { DocumentRow } from '../../types'

function FileIcon({ mime }: { mime: string }) {
  if (mime.includes('pdf')) {
    return (
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-600 border border-rose-200/70">
        <FileText className="h-4 w-4" aria-hidden="true" />
      </div>
    )
  }
  if (mime.includes('image')) {
    return (
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-200/70">
        <FileCode className="h-4 w-4" aria-hidden="true" />
      </div>
    )
  }
  return (
    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600 border border-blue-200/70">
      <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
    </div>
  )
}

export function DocumentTable({ rows }: { rows: DocumentRow[] }) {
  return (
    <Table caption="Documents">
      <THead>
        <Th>Title & Document</Th>
        <Th>Category</Th>
        <Th>Shared by / owner</Th>
        <Th>Size</Th>
        <Th>Updated</Th>
        <Th>Access</Th>
      </THead>
      <TBody>
        {rows.map((d) => (
          <Tr key={d.id}>
            <Td className="max-w-xs sm:max-w-sm">
              <Link
                to={`/documents/${d.id}`}
                className="group flex items-center gap-3 font-semibold text-slate-900 hover:text-blue-600 transition-colors"
              >
                <FileIcon mime={d.mime_type} />
                <span className="min-w-0">
                  <span className="block truncate text-sm tracking-tight group-hover:text-blue-600">{d.title}</span>
                  <span className="block truncate text-xs font-mono font-normal text-slate-400">
                    {d.original_filename}
                  </span>
                </span>
              </Link>
            </Td>
            <Td>
              <Badge tone="slate">{categoryLabel(d.category)}</Badge>
            </Td>
            <Td className="max-w-[11rem] truncate text-xs text-slate-600">
              {d.owner_display_name || d.owner_email || (d.my_access === 'read' ? 'Shared globally' : '—')}
            </Td>
            <Td className="font-mono text-xs text-slate-600">{formatBytes(d.size_bytes)}</Td>
            <Td className="text-xs text-slate-500">{formatDate(d.updated_at)}</Td>
            <Td>
              <AccessBadge access={d.my_access} />
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  )
}
