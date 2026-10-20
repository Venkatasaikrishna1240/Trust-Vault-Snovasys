import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Globe2, Lock, Sparkles, Upload, Users } from 'lucide-react'
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
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MetadataValues>({
    resolver: zodResolver(metadataSchema),
    defaultValues: { title: '', description: '', category: 'general' },
  })

  useEffect(() => {
    if (audience !== 'selected' || searchTerm.length < 3) {
      setRecipients([])
      setRecipientError(null)
      setRecipientLoading(false)
      return
    }
    let active = true
    setRecipientLoading(true)
    setRecipientError(null)
    searchShareRecipients(searchTerm)
      .then((rows) => {
        if (active) setRecipients(rows)
      })
      .catch((e) => {
        if (active) {
          setRecipients([])
          setRecipientError(errorMessage(e))
        }
      })
      .finally(() => {
        if (active) setRecipientLoading(false)
      })
    return () => {
      active = false
    }
  }, [audience, searchTerm])

  const onSubmit = handleSubmit(async (v) => {
    if (!file) {
      setFileError('Choose a file to upload.')
      return
    }
    if (audience === 'selected' && selectedRecipients.length === 0) {
      setShareError('Choose at least one registered recipient.')
      return
    }
    setFileError(undefined)
    setServerError(null)
    setShareError(null)
    try {
      const doc = await uploadDocument({
        file,
        title: v.title.trim(),
        description: v.description.trim(),
        category: v.category,
        shareEmails: audience === 'selected' ? selectedRecipients.map((person) => person.email) : [],
        permission,
        isGlobal: audience === 'global',
      })
      toast.success(
        audience === 'global'
          ? 'Document uploaded and shared with all signed-in users.'
          : audience === 'selected'
          ? `Document uploaded and shared with ${selectedRecipients.length} user${
              selectedRecipients.length === 1 ? '' : 's'
            }.`
          : 'Private document uploaded.',
      )
      navigate(`/documents/${doc.id}`)
    } catch (e) {
      setServerError(errorMessage(e))
    }
  })

  const toggleRecipient = (person: ShareRecipient, checked: boolean) => {
    setShareError(null)
    setSelectedRecipients((current) =>
      checked
        ? current.some((item) => item.id === person.id)
          ? current
          : [...current, person]
        : current.filter((item) => item.id !== person.id),
    )
  }

  return (
    <>
      <PageHeader
        title="Upload document"
        description="Files are checked and stored securely. Every action is recorded in the audit log."
      />

      {/* Security notice banner */}
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-900">
        <Sparkles className="h-4 w-4 text-blue-600 shrink-0" aria-hidden="true" />
        <span className="font-medium">
          Your files are entering the vault. Encrypted in private storage and sealed with SHA-256 verification.
        </span>
      </div>

      <Card className="max-w-2xl p-6 sm:p-7">
        <form onSubmit={onSubmit} noValidate className="space-y-6">
          {serverError && (
            <p
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700"
            >
              {serverError}
            </p>
          )}

          <FilePicker
            label="File"
            file={file}
            error={fileError}
            onChange={(f) => {
              setFile(f)
              setFileError(undefined)
            }}
          />

          <Input
            label="Title"
            placeholder="e.g. Master Services Agreement 2026"
            error={errors.title?.message}
            {...register('title')}
          />

          <Textarea
            label="Description (optional)"
            placeholder="Add context, project references, or notes…"
            error={errors.description?.message}
            {...register('description')}
          />

          <Select label="Category" error={errors.category?.message} {...register('category')}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>

          {/* Access Control Fieldset */}
          <fieldset className="space-y-3.5 rounded-xl border border-slate-200/90 bg-slate-50/50 p-5">
            <legend className="px-1 text-xs font-bold uppercase tracking-wider text-slate-700">
              Who can access this document?
            </legend>

            <div className="space-y-2.5">
              <label
                className={`flex cursor-pointer items-start gap-3.5 rounded-xl border p-3.5 transition-all ${
                  audience === 'private'
                    ? 'border-blue-500 bg-white shadow-xs ring-2 ring-blue-500/20'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="audience"
                  value="private"
                  checked={audience === 'private'}
                  onChange={() => setAudience('private')}
                  className="mt-1 text-blue-600 focus:ring-blue-500"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-semibold text-sm text-slate-900">
                    <Lock className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                    <span>Keep private</span>
                  </div>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    Only you can access it until you explicitly share it later.
                  </span>
                </div>
              </label>

              <label
                className={`flex cursor-pointer items-start gap-3.5 rounded-xl border p-3.5 transition-all ${
                  audience === 'selected'
                    ? 'border-blue-500 bg-white shadow-xs ring-2 ring-blue-500/20'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="audience"
                  value="selected"
                  checked={audience === 'selected'}
                  onChange={() => {
                    setAudience('selected')
                    setShareError(null)
                  }}
                  className="mt-1 text-blue-600 focus:ring-blue-500"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-semibold text-sm text-slate-900">
                    <Users className="h-3.5 w-3.5 text-blue-500" aria-hidden="true" />
                    <span>Specific people</span>
                  </div>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    Find existing accounts by name or e-mail and choose their access level.
                  </span>
                </div>
              </label>

              <label
                className={`flex cursor-pointer items-start gap-3.5 rounded-xl border p-3.5 transition-all ${
                  audience === 'global'
                    ? 'border-blue-500 bg-white shadow-xs ring-2 ring-blue-500/20'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="audience"
                  value="global"
                  checked={audience === 'global'}
                  onChange={() => setAudience('global')}
                  className="mt-1 text-blue-600 focus:ring-blue-500"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-semibold text-sm text-slate-900">
                    <Globe2 className="h-3.5 w-3.5 text-indigo-500" aria-hidden="true" />
                    <span>All signed-in users</span>
                  </div>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    Visible to any TrustVault account; this is not a public internet link.
                  </span>
                </div>
              </label>
            </div>

            {/* Recipient picker when 'specific people' is chosen */}
            {audience === 'selected' && (
              <div className="space-y-3.5 border-t border-slate-200/90 pt-4 mt-2">
                <div>
                  <label htmlFor="recipient-search" className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                    Find recipient by name or username
                  </label>
                  <input
                    id="recipient-search"
                    type="search"
                    autoComplete="off"
                    value={recipientQuery}
                    onChange={(e) => setRecipientQuery(e.target.value)}
                    placeholder="Type a name or email username…"
                    className="block h-10 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm shadow-2xs placeholder:text-slate-400 focus:border-blue-600 focus:ring-3 focus:ring-blue-500/15 focus:outline-hidden"
                  />
                  <p className="mt-1.5 text-2xs text-slate-500">
                    {selectedRecipients.length} selected · changes apply when you upload.
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Type at least 3 characters. Results show the account email for confirmation.
                  </p>
                </div>

                {shareError && (
                  <p role="alert" className="text-xs font-medium text-rose-600">
                    {shareError}
                  </p>
                )}
                {recipientLoading && (
                  <p role="status" className="text-xs text-slate-500">
                    Searching accounts…
                  </p>
                )}
                {recipientError && (
                  <p role="alert" className="text-xs font-medium text-rose-600">
                    {recipientError}
                  </p>
                )}
                {!recipientLoading && !recipientError && searchTerm.length >= 3 && recipients.length === 0 && (
                  <p className="text-xs text-slate-500">No matching registered accounts.</p>
                )}

                {recipients.length > 0 && (
                  <ul
                    aria-label="Recipient search results"
                    className="max-h-52 divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-200 bg-white shadow-2xs"
                  >
                    {recipients.map((person) => (
                      <li key={person.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-3.5 py-2.5 hover:bg-slate-50 transition-colors">
                          <input
                            type="checkbox"
                            aria-label={person.email}
                            checked={selectedRecipients.some((item) => item.id === person.id)}
                            disabled={
                              selectedRecipients.length >= 20 &&
                              !selectedRecipients.some((item) => item.id === person.id)
                            }
                            onChange={(e) => toggleRecipient(person, e.target.checked)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-900">
                              {person.display_name || person.email}
                            </span>
                            {person.display_name && (
                              <span className="block truncate text-xs text-slate-500 font-mono">
                                {person.email}
                              </span>
                            )}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}

                {selectedRecipients.length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-2xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Selected Recipients
                    </p>
                    <ul aria-label="Selected recipients" className="space-y-1.5">
                      {selectedRecipients.map((person) => (
                        <li
                          key={person.id}
                          className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 border border-slate-200/60"
                        >
                          <span className="truncate">
                            <span className="font-semibold">{person.display_name || person.email}</span>{' '}
                            <span className="text-slate-400 font-mono">({person.email})</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleRecipient(person, false)}
                            className="cursor-pointer font-semibold text-rose-600 hover:text-rose-800 hover:underline text-2xs uppercase"
                            aria-label={`Remove ${person.email}`}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <Select
                  label="Recipient access"
                  value={permission}
                  onChange={(e) => setPermission(e.target.value as 'read' | 'edit')}
                >
                  <option value="read">Reader — view in app, no attachment download</option>
                  <option value="edit">Editor — edit and download</option>
                </Select>
              </div>
            )}
          </fieldset>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => navigate('/documents')} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              <Upload className="h-4 w-4" aria-hidden="true" />
              <span>Upload</span>
            </Button>
          </div>
        </form>
      </Card>
    </>
  )
}
