import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { metadataSchema, type MetadataValues } from '../lib/validation'
import { uploadDocument } from '../services/documents'
import { errorMessage } from '../services/api'
import { Card, PageHeader } from '../components/ui/Card'
import { Input, Select, Textarea } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import { useToast } from '../components/ui/Toast'
import { FilePicker } from '../features/documents/FilePicker'
import { CATEGORIES } from '../types'
import { useDebounce } from '../hooks/useDebounce'
import { searchShareRecipients, type ShareRecipient } from '../services/documents'

type Audience = 'private' | 'selected' | 'global'

export default function UploadPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string>()
  const [serverError, setServerError] = useState<string | null>(null)
  const [audience, setAudience] = useState<Audience>('private')
  const [permission, setPermission] = useState<'read' | 'edit'>('read')
  const [recipientQuery, setRecipientQuery] = useState('')
  const [recipients, setRecipients] = useState<ShareRecipient[]>([])
  const [selectedRecipients, setSelectedRecipients] = useState<ShareRecipient[]>([])
  const [recipientLoading, setRecipientLoading] = useState(false)
  const [recipientError, setRecipientError] = useState<string | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)
  const searchTerm = useDebounce(recipientQuery.trim(), 250)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<MetadataValues>({
    resolver: zodResolver(metadataSchema), defaultValues: { title: '', description: '', category: 'general' },
  })

  useEffect(() => {
    if (audience !== 'selected' || searchTerm.length < 3) { setRecipients([]); setRecipientError(null); setRecipientLoading(false); return }
    let active = true
    setRecipientLoading(true)
    setRecipientError(null)
    searchShareRecipients(searchTerm)
      .then((rows) => { if (active) setRecipients(rows) })
      .catch((e) => { if (active) { setRecipients([]); setRecipientError(errorMessage(e)) } })
      .finally(() => { if (active) setRecipientLoading(false) })
    return () => { active = false }
  }, [audience, searchTerm])

  const onSubmit = handleSubmit(async (v) => {
    if (!file) { setFileError('Choose a file to upload.'); return }
    if (audience === 'selected' && selectedRecipients.length === 0) { setShareError('Choose at least one registered recipient.'); return }
    setFileError(undefined); setServerError(null)
    setShareError(null)
    try {
      const doc = await uploadDocument({
        file, title: v.title.trim(), description: v.description.trim(), category: v.category,
        shareEmails: audience === 'selected' ? selectedRecipients.map((person) => person.email) : [],
        permission, isGlobal: audience === 'global',
      })
      toast.success(audience === 'global' ? 'Document uploaded and shared with all signed-in users.' : audience === 'selected' ? `Document uploaded and shared with ${selectedRecipients.length} user${selectedRecipients.length === 1 ? '' : 's'}.` : 'Private document uploaded.')
      navigate(`/documents/${doc.id}`)
    } catch (e) { setServerError(errorMessage(e)) }
  })

  const toggleRecipient = (person: ShareRecipient, checked: boolean) => {
    setShareError(null)
    setSelectedRecipients((current) => checked
      ? current.some((item) => item.id === person.id) ? current : [...current, person]
      : current.filter((item) => item.id !== person.id))
  }

  return (
    <>
      <PageHeader title="Upload document" description="Files are checked and stored securely. Every action is recorded in the audit log." />
      <Card className="max-w-2xl p-6">
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          {serverError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>}
          <FilePicker label="File" file={file} error={fileError} onChange={(f) => { setFile(f); setFileError(undefined) }} />
          <Input label="Title" error={errors.title?.message} {...register('title')} />
          <Textarea label="Description (optional)" error={errors.description?.message} {...register('description')} />
          <Select label="Category" error={errors.category?.message} {...register('category')}>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
          <fieldset className="space-y-3 rounded-lg border border-slate-200 p-4">
            <legend className="px-1 text-sm font-semibold text-slate-800">Who can access this document?</legend>
            <label className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-slate-50">
              <input type="radio" name="audience" value="private" checked={audience === 'private'} onChange={() => setAudience('private')} className="mt-1" />
              <span><span className="block text-sm font-medium">Keep private</span><span className="block text-xs text-slate-500">Only you can access it until you share it later.</span></span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-slate-50">
              <input type="radio" name="audience" value="selected" checked={audience === 'selected'} onChange={() => { setAudience('selected'); setShareError(null) }} className="mt-1" />
              <span><span className="block text-sm font-medium">Specific people</span><span className="block text-xs text-slate-500">Find existing accounts by name or e-mail and choose their access level.</span></span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-slate-50">
              <input type="radio" name="audience" value="global" checked={audience === 'global'} onChange={() => setAudience('global')} className="mt-1" />
              <span><span className="block text-sm font-medium">All signed-in users</span><span className="block text-xs text-slate-500">Visible to any TrustVault account; this is not a public internet link.</span></span>
            </label>
            {audience === 'selected' && (
              <div className="space-y-3 border-t border-slate-200 pt-4">
                <label htmlFor="recipient-search" className="block text-sm font-medium text-slate-700">Find recipients by name or e-mail</label>
                <input id="recipient-search" type="search" autoComplete="off" value={recipientQuery} onChange={(e) => setRecipientQuery(e.target.value)} placeholder="Type at least 3 characters" className="block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm placeholder:text-slate-400" />
                <p className="text-xs text-slate-500">{selectedRecipients.length} selected · changes apply when you upload.</p>
                {shareError && <p role="alert" className="text-sm text-red-600">{shareError}</p>}
                {recipientLoading && <p role="status" className="text-xs text-slate-500">Searching accounts…</p>}
                {recipientError && <p role="alert" className="text-sm text-red-600">{recipientError}</p>}
                {!recipientLoading && !recipientError && searchTerm.length >= 3 && recipients.length === 0 && <p className="text-xs text-slate-500">No matching registered accounts.</p>}
                {recipients.length > 0 && (
                  <ul aria-label="Recipient search results" className="max-h-52 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200">
                    {recipients.map((person) => (
                      <li key={person.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50">
                          <input type="checkbox" checked={selectedRecipients.some((item) => item.id === person.id)} disabled={selectedRecipients.length >= 20 && !selectedRecipients.some((item) => item.id === person.id)} onChange={(e) => toggleRecipient(person, e.target.checked)} />
                          <span className="min-w-0"><span className="block truncate text-sm font-medium">{person.display_name || person.email}</span>{person.display_name && <span className="block truncate text-xs text-slate-500">{person.email}</span>}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                {selectedRecipients.length > 0 && (
                  <ul aria-label="Selected recipients" className="space-y-1">
                    {selectedRecipients.map((person) => <li key={person.id} className="flex items-center justify-between gap-2 text-xs text-slate-600">
                      <span>{person.display_name || person.email} <span className="text-slate-400">({person.email})</span></span>
                      <button type="button" onClick={() => toggleRecipient(person, false)} className="font-medium text-red-700 hover:underline" aria-label={`Remove ${person.email}`}>Remove</button>
                    </li>)}
                  </ul>
                )}
                <Select label="Recipient access" value={permission} onChange={(e) => setPermission(e.target.value as 'read' | 'edit')}>
                  <option value="read">Reader — view in app, no attachment download</option>
                  <option value="edit">Editor — edit and download</option>
                </Select>
              </div>
            )}
          </fieldset>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => navigate('/documents')} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" loading={isSubmitting}>Upload</Button>
          </div>
        </form>
      </Card>
    </>
  )
}
