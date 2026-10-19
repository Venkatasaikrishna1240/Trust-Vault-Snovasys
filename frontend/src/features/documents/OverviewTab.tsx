import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Copy,
  Download,
  Eye,
  RefreshCw,
  Shield,
  Trash2,
  X,
} from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { useToast } from '../../components/ui/Toast'
import { FilePicker } from './FilePicker'
import { categoryLabel, formatBytes, formatDateTime } from '../../lib/format'
import { metadataSchema, type MetadataValues } from '../../lib/validation'
import {
  deleteDocument,
  downloadDocument,
  editDocument,
  previewDocument,
  replaceFile,
} from '../../services/documents'
import { errorMessage } from '../../services/api'
import { CATEGORIES, type DocumentDetail } from '../../types'

function MetaItem({
  label,
  children,
  fullWidth,
}: {
  label: string
  children: React.ReactNode
  fullWidth?: boolean
}) {
  return (
    <div className={fullWidth ? 'sm:col-span-2' : ''}>
      <dt className="text-2xs font-bold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-slate-800">{children}</dd>
    </div>
  )
}

export function OverviewTab({ detail, onChanged }: { detail: DocumentDetail; onChanged: () => void }) {
  const { document: doc, my_access } = detail
  const canEdit = my_access === 'owner' || my_access === 'edit'
  const isOwner = my_access === 'owner'
  const toast = useToast()
  const navigate = useNavigate()
  const [downloading, setDownloading] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [replacement, setReplacement] = useState<File | null>(null)
  const [replacing, setReplacing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<MetadataValues>({
    resolver: zodResolver(metadataSchema),
    values: { title: doc.title, description: doc.description ?? '', category: doc.category },
  })

  const download = async () => {
    setDownloading(true)
    try {
      await downloadDocument(doc.id, doc.original_filename)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setDownloading(false)
    }
  }

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  const preview = async () => {
    setPreviewing(true)
    try {
      const blob = await previewDocument(doc.id)
      setPreviewUrl(URL.createObjectURL(blob))
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setPreviewing(false)
    }
  }

  const save = handleSubmit(async (v) => {
    try {
      await editDocument(doc.id, {
        title: v.title.trim(),
        description: v.description.trim(),
        category: v.category,
      })
      toast.success('Details saved.')
      onChanged()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  })

  const replace = async () => {
    if (!replacement) return
    setReplacing(true)
    try {
      await replaceFile(doc.id, replacement)
      toast.success('File replaced with a new version.')
      setReplacement(null)
      onChanged()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setReplacing(false)
    }
  }

  const remove = async () => {
    setDeleting(true)
    try {
      const r = await deleteDocument(doc.id)
      toast.success(
        r.purge === 'incomplete'
          ? 'Document deleted. Stored file cleanup is still pending.'
          : 'Document deleted.',
      )
      navigate('/documents', { replace: true })
    } catch (e) {
      toast.error(errorMessage(e))
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const copyHash = async (hash: string) => {
    try {
      await navigator.clipboard.writeText(hash)
      toast.success('SHA-256 hash copied.')
    } catch {
      toast.error('Could not copy automatically.')
    }
  }

  return (
    <div className="space-y-6">
      {/* Details Card */}
      <Card>
        <CardHeader
          title="Details"
          description="Document specifications and cryptographic signature"
          action={
            <div className="flex items-center gap-2">
              {canEdit && (
                <Button variant="secondary" onClick={preview} loading={previewing}>
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  <span>Preview</span>
                </Button>
              )}
              {canEdit ? (
                <Button onClick={download} loading={downloading}>
                  <Download className="h-4 w-4" aria-hidden="true" />
                  <span>Download</span>
                </Button>
              ) : (
                <Button onClick={preview} loading={previewing}>
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  <span>Preview</span>
                </Button>
              )}
            </div>
          }
        />
        <dl className="grid gap-6 p-6 sm:grid-cols-2">
          <MetaItem label="Title">{doc.title}</MetaItem>
          {doc.owner_id !== undefined && (
            <MetaItem label={isOwner ? 'Owner' : 'Received from'}>
              {doc.owner_display_name || (isOwner ? 'You' : 'Document owner')}
            </MetaItem>
          )}
          <MetaItem label="Category">
            <Badge tone="slate">{categoryLabel(doc.category)}</Badge>
          </MetaItem>
          <MetaItem label="Version">
            <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              v{doc.current_version}
            </span>
          </MetaItem>
          <MetaItem label="Description" fullWidth>
            {doc.description || <span className="text-slate-400 italic font-normal">No description provided</span>}
          </MetaItem>
          <MetaItem label="File name">
            <span className="font-mono text-xs">{doc.original_filename}</span>
          </MetaItem>
          <MetaItem label="Type and size">
            <span className="font-mono text-xs">
              {doc.mime_type} · {formatBytes(doc.size_bytes)}
            </span>
          </MetaItem>
          <MetaItem label="Last updated">{formatDateTime(doc.updated_at)}</MetaItem>
          {doc.sha256 && (
            <MetaItem label="SHA-256 Checksum" fullWidth>
              <div className="mt-1 flex items-center gap-2">
                <code className="break-all rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-2xs font-mono text-slate-800">
                  {doc.sha256}
                </code>
                <button
                  type="button"
                  onClick={() => copyHash(doc.sha256!)}
                  className="cursor-pointer text-slate-400 hover:text-slate-600 transition-colors p-1"
                  aria-label="Copy SHA-256 hash"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </MetaItem>
          )}
        </dl>
      </Card>

      {/* Document Preview Frame */}
      {previewUrl && (
        <Card className="overflow-hidden">
          <CardHeader
            title="Document preview"
            description="Verified private viewer"
            action={
              <Button variant="secondary" size="sm" onClick={() => setPreviewUrl(null)}>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Close preview</span>
              </Button>
            }
          />
          <div className="p-4 bg-slate-900/5">
            {doc.mime_type === 'application/pdf' ? (
              <iframe
                title={`Preview of ${doc.original_filename}`}
                src={`${previewUrl}#toolbar=0&navpanes=0`}
                className="h-[75vh] w-full rounded-xl border border-slate-200 bg-white shadow-xs"
              />
            ) : (
              <img
                src={previewUrl}
                alt={`Preview of ${doc.original_filename}`}
                className="mx-auto max-h-[75vh] max-w-full rounded-xl object-contain shadow-xs border border-slate-200 bg-white"
              />
            )}
          </div>
          <div className="flex items-center gap-2 px-6 py-3 bg-slate-50 border-t border-slate-100 text-2xs text-slate-500">
            <Shield className="h-3.5 w-3.5 text-blue-500 shrink-0" aria-hidden="true" />
            <span>
              Preview access is recorded in the tamper-evident audit log. The file is streamed securely to your browser.
            </span>
          </div>
        </Card>
      )}

      {/* Edit details form */}
      {canEdit && (
        <Card>
          <CardHeader title="Edit details" description="Update document title, notes, and category classification" />
          <form onSubmit={save} noValidate className="space-y-4 p-6">
            <Input label="Title" error={errors.title?.message} {...register('title')} />
            <Textarea label="Description" error={errors.description?.message} {...register('description')} />
            <Select label="Category" error={errors.category?.message} {...register('category')}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
            <div className="flex justify-end pt-2">
              <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
                Save changes
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Replace file form */}
      {canEdit && (
        <Card>
          <CardHeader
            title="Replace file"
            description="Uploads a new version. Previous versions stay permanently recorded in the history."
          />
          <div className="space-y-4 p-6">
            <FilePicker label="New file" file={replacement} onChange={setReplacement} />
            <div className="flex justify-end pt-2">
              <Button onClick={replace} loading={replacing} disabled={!replacement}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                <span>Replace file</span>
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Delete document card */}
      {isOwner && (
        <Card className="border-rose-200 bg-rose-50/20">
          <CardHeader
            title="Delete document"
            description="Permanently removes this document and all historical versions from the vault."
          />
          <div className="flex justify-end p-6">
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              <span>Delete document</span>
            </Button>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this document?"
        confirmLabel="Delete"
        loading={deleting}
        message="This cannot be undone. All versions will be removed and everyone with access will lose it immediately."
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
