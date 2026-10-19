import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Download, Eye, RefreshCw, Trash2 } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { useToast } from '../../components/ui/Toast'
import { FilePicker } from './FilePicker'
import { categoryLabel, formatBytes, formatDateTime } from '../../lib/format'
import { metadataSchema, type MetadataValues } from '../../lib/validation'
import { deleteDocument, downloadDocument, editDocument, previewDocument, replaceFile } from '../../services/documents'
import { errorMessage } from '../../services/api'
import { CATEGORIES, type DocumentDetail } from '../../types'

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm text-slate-900">{children}</dd></div>
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

  const { register, handleSubmit, formState: { errors, isSubmitting, isDirty } } = useForm<MetadataValues>({
    resolver: zodResolver(metadataSchema),
    values: { title: doc.title, description: doc.description ?? '', category: doc.category },
  })

  const download = async () => {
    setDownloading(true)
    try { await downloadDocument(doc.id, doc.original_filename) } catch (e) { toast.error(errorMessage(e)) } finally { setDownloading(false) }
  }
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])
  const preview = async () => {
    setPreviewing(true)
    try {
      const blob = await previewDocument(doc.id)
      setPreviewUrl(URL.createObjectURL(blob))
    } catch (e) { toast.error(errorMessage(e)) } finally { setPreviewing(false) }
  }
  const save = handleSubmit(async (v) => {
    try { await editDocument(doc.id, { title: v.title.trim(), description: v.description.trim(), category: v.category }); toast.success('Details saved.'); onChanged() }
    catch (e) { toast.error(errorMessage(e)) }
  })
  const replace = async () => {
    if (!replacement) return
    setReplacing(true)
    try { await replaceFile(doc.id, replacement); toast.success('File replaced with a new version.'); setReplacement(null); onChanged() }
    catch (e) { toast.error(errorMessage(e)) } finally { setReplacing(false) }
  }
  const remove = async () => {
    setDeleting(true)
    try {
      const r = await deleteDocument(doc.id)
      toast.success(r.purge === 'incomplete' ? 'Document deleted. Stored file cleanup is still pending.' : 'Document deleted.')
      navigate('/documents', { replace: true })
    } catch (e) { toast.error(errorMessage(e)); setDeleting(false); setConfirmDelete(false) }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Details" action={<div className="flex gap-2">
          {canEdit && <Button variant="secondary" onClick={preview} loading={previewing}><Eye className="h-4 w-4" aria-hidden="true" />Preview</Button>}
          {canEdit
            ? <Button onClick={download} loading={downloading}><Download className="h-4 w-4" aria-hidden="true" />Download</Button>
            : <Button onClick={preview} loading={previewing}><Eye className="h-4 w-4" aria-hidden="true" />Preview</Button>}
        </div>} />
        <dl className="grid gap-5 p-5 sm:grid-cols-2">
          <Meta label="Title">{doc.title}</Meta>
          {doc.owner_id !== undefined && <Meta label={isOwner ? 'Owner' : 'Received from'}>{doc.owner_display_name || (isOwner ? 'You' : 'Document owner')}</Meta>}
          <Meta label="Category"><Badge>{categoryLabel(doc.category)}</Badge></Meta>
          <div className="sm:col-span-2"><Meta label="Description">{doc.description || <span className="text-slate-400">No description</span>}</Meta></div>
          <Meta label="File name">{doc.original_filename}</Meta>
          <Meta label="Type and size">{doc.mime_type} · {formatBytes(doc.size_bytes)}</Meta>
          <Meta label="Version">v{doc.current_version}</Meta>
          <Meta label="Last updated">{formatDateTime(doc.updated_at)}</Meta>
          {doc.sha256 && <div className="sm:col-span-2"><Meta label="SHA-256"><code className="break-all text-xs">{doc.sha256}</code></Meta></div>}
        </dl>
      </Card>

      {previewUrl && (
        <Card>
          <CardHeader title="Document preview" action={<Button variant="secondary" onClick={() => setPreviewUrl(null)}>Close preview</Button>} />
          <div className="p-3">
            {doc.mime_type === 'application/pdf'
              ? <iframe title={`Preview of ${doc.original_filename}`} src={`${previewUrl}#toolbar=0&navpanes=0`} className="h-[70vh] w-full rounded-lg border border-slate-200" />
              : <img src={previewUrl} alt={`Preview of ${doc.original_filename}`} className="mx-auto max-h-[70vh] max-w-full object-contain" />}
          </div>
          <p className="px-5 pb-4 text-xs text-slate-500">Preview access is audited. Because your browser receives the file to display it, screenshots or other copying cannot be technically prevented.</p>
        </Card>
      )}

      {canEdit && (
        <Card>
          <CardHeader title="Edit details" />
          <form onSubmit={save} noValidate className="space-y-4 p-5">
            <Input label="Title" error={errors.title?.message} {...register('title')} />
            <Textarea label="Description" error={errors.description?.message} {...register('description')} />
            <Select label="Category" error={errors.category?.message} {...register('category')}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
            <div className="flex justify-end"><Button type="submit" loading={isSubmitting} disabled={!isDirty}>Save changes</Button></div>
          </form>
        </Card>
      )}

      {canEdit && (
        <Card>
          <CardHeader title="Replace file" description="Uploads a new version. Previous versions stay in the history." />
          <div className="space-y-4 p-5">
            <FilePicker label="New file" file={replacement} onChange={setReplacement} />
            <div className="flex justify-end">
              <Button onClick={replace} loading={replacing} disabled={!replacement}><RefreshCw className="h-4 w-4" aria-hidden="true" />Replace file</Button>
            </div>
          </div>
        </Card>
      )}

      {isOwner && (
        <Card className="border-red-200">
          <CardHeader title="Delete document" description="Permanently removes this document and all of its versions." />
          <div className="flex justify-end p-5">
            <Button variant="danger" onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4" aria-hidden="true" />Delete document</Button>
          </div>
        </Card>
      )}

      <ConfirmDialog open={confirmDelete} title="Delete this document?" confirmLabel="Delete" loading={deleting}
        message="This cannot be undone. All versions will be removed and everyone with access will lose it."
        onConfirm={remove} onCancel={() => setConfirmDelete(false)} />
    </div>
  )
}
