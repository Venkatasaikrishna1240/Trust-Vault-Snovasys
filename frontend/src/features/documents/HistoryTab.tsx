import { useState } from 'react'
import { Download } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Table, TBody, Td, Th, THead, Tr } from '../../components/ui/Table'
import { useToast } from '../../components/ui/Toast'
import { formatBytes, formatDateTime } from '../../lib/format'
import { downloadDocument } from '../../services/documents'
import { errorMessage } from '../../services/api'
import type { VersionRow } from '../../types'

export function HistoryTab({ documentId, versions, currentVersion, canDownloadOld }: {
  documentId: string; versions: VersionRow[]; currentVersion: number; canDownloadOld: boolean
}) {
  const toast = useToast()
  const [busy, setBusy] = useState<number | null>(null)
  const get = async (v: VersionRow) => {
    setBusy(v.version)
    try { await downloadDocument(documentId, v.original_filename, v.version) } catch (e) { toast.error(errorMessage(e)) } finally { setBusy(null) }
  }
  const sorted = [...versions].sort((a, b) => b.version - a.version)
  return (
    <Card>
      <CardHeader title="Version history" description="Each file replacement creates a new version." />
      <Table caption="Document versions">
        <THead><Th>Version</Th><Th>File name</Th><Th>Size</Th><Th>Uploaded</Th><Th><span className="sr-only">Actions</span></Th></THead>
        <TBody>
          {sorted.map((v) => (
            <Tr key={v.version}>
              <Td><span className="font-medium text-slate-900">v{v.version}</span> {v.version === currentVersion && <Badge tone="indigo">Current</Badge>}</Td>
              <Td className="max-w-xs break-words">{v.original_filename}</Td>
              <Td>{formatBytes(v.size_bytes)}</Td>
              <Td>{formatDateTime(v.created_at)}</Td>
              <Td className="text-right">
                {canDownloadOld && v.version !== currentVersion && (
                  <Button variant="secondary" size="sm" loading={busy === v.version} onClick={() => get(v)} aria-label={`Download version ${v.version}`}>
                    <Download className="h-4 w-4" aria-hidden="true" />Download
                  </Button>
                )}
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </Card>
  )
}
