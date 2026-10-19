import { Link } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { Table, TBody, Td, Th, THead, Tr } from '../../components/ui/Table'
import { AccessBadge, Badge } from '../../components/ui/Badge'
import { categoryLabel, formatBytes, formatDate } from '../../lib/format'
import type { DocumentRow } from '../../types'

export function DocumentTable({ rows }: { rows: DocumentRow[] }) {
  return (
    <Table caption="Documents">
      <THead><Th>Title</Th><Th>Category</Th><Th>Shared by / owner</Th><Th>Size</Th><Th>Updated</Th><Th>Access</Th></THead>
      <TBody>
        {rows.map((d) => (
          <Tr key={d.id}>
            <Td className="max-w-xs">
              <Link to={`/documents/${d.id}`} className="flex items-center gap-3 font-medium text-slate-900 hover:text-brand-700">
                <FileText className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate">{d.title}</span>
                  <span className="block truncate text-xs font-normal text-slate-500">{d.original_filename}</span>
                </span>
              </Link>
            </Td>
            <Td><Badge>{categoryLabel(d.category)}</Badge></Td>
            <Td className="max-w-[10rem] truncate">{d.owner_display_name || d.owner_email || (d.my_access === 'read' ? 'Shared globally' : '—')}</Td>
            <Td>{formatBytes(d.size_bytes)}</Td>
            <Td>{formatDate(d.updated_at)}</Td>
            <Td><AccessBadge access={d.my_access} /></Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  )
}
