import { callFn, callFnBlob } from './api'
import { safeFilename } from '../lib/format'
import type { Category, DocumentDetail, DocumentRecord } from '../types'

export interface ShareRecipient { id: string; email: string; display_name: string | null }
export interface UploadInput {
  file: File; title: string; description: string; category: Category
  shareEmails: string[]; permission: 'read' | 'edit'; isGlobal: boolean
}

export async function uploadDocument(i: UploadInput): Promise<DocumentRecord> {
  const form = new FormData()
  form.append('file', i.file)
  form.append('title', i.title)
  if (i.description) form.append('description', i.description)
  form.append('category', i.category)
  form.append('is_global', String(i.isGlobal))
  form.append('share_permission', i.permission)
  for (const email of i.shareEmails) form.append('share_email', email)
  const r = await callFn<{ document: DocumentRecord }>('document-upload', { method: 'POST', form })
  return r.document
}

export const searchShareRecipients = async (query: string): Promise<ShareRecipient[]> => {
  const r = await callFn<{ recipients: ShareRecipient[] }>('document-share', { json: { action: 'search_recipients', query } })
  return r.recipients
}

export const getDocument = (id: string) => callFn<DocumentDetail>('document-get', { query: { id } })

export async function editDocument(id: string, patch: { title?: string; description?: string; category?: Category }) {
  const r = await callFn<{ document: DocumentRecord }>('document-edit', { json: { document_id: id, ...patch } })
  return r.document
}

export async function replaceFile(id: string, file: File): Promise<DocumentRecord> {
  const form = new FormData()
  form.append('file', file)
  const r = await callFn<{ document: DocumentRecord }>('document-edit', { method: 'POST', query: { id }, form })
  return r.document
}

export const deleteDocument = (id: string) =>
  callFn<{ deleted: boolean; purge: 'completed' | 'incomplete' }>('document-delete', { json: { document_id: id } })

export const grantAccess = (id: string, email: string, permission: 'read' | 'edit') =>
  callFn<{ permission: string; grantee: { id: string; display_name: string | null; email: string }; change: string }>(
    'document-share', { json: { action: 'grant', document_id: id, grantee_email: email, permission } })

export const revokeAccess = (id: string, granteeId: string) =>
  callFn<{ revoked: boolean }>('document-share', { json: { action: 'revoke', document_id: id, grantee_id: granteeId } })

export const setDocumentVisibility = (id: string, isGlobal: boolean) =>
  callFn<{ document: DocumentRecord }>('document-share', { json: { action: 'set_visibility', document_id: id, is_global: isGlobal } })

/** Downloads via fetch + temporary object URL (no tokens in URLs). */
export async function downloadDocument(id: string, fallbackName: string, version?: number) {
  const { blob, filename } = await callFnBlob('document-download', { query: { id, version } })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = safeFilename(filename ?? fallbackName)
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

export async function previewDocument(id: string): Promise<Blob> {
  const { blob } = await callFnBlob('document-preview', { query: { id } })
  return blob
}
