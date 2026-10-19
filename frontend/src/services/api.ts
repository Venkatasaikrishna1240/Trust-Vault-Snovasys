import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from '../lib/supabase'

export type ErrorCode =
  | 'unauthenticated' | 'invalid_request' | 'forbidden' | 'not_found' | 'grantee_not_found'
  | 'payload_too_large' | 'unsupported_media_type' | 'rate_limited' | 'unavailable' | 'internal' | 'network'

export const NOT_FOUND_MESSAGE = 'Not found, or you do not have access to it.'

export class ApiError extends Error {
  code: ErrorCode | string
  status: number
  requestId?: string
  constructor(code: string, message: string, status: number, requestId?: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.requestId = requestId
  }
  get isNotFound() { return this.code === 'not_found' }
}

function friendlyMessage(code: string, serverMessage: string | undefined): string {
  switch (code) {
    case 'not_found': return NOT_FOUND_MESSAGE
    case 'rate_limited': return 'Too many requests. Please wait a moment and try again.'
    case 'unavailable': return 'The service is temporarily unavailable. Please try again shortly.'
    case 'unauthenticated': return 'Your session has ended. Please sign in again.'
    case 'network': return 'Could not reach the Supabase Edge Function. Check your connection, deployment, and allowed frontend origin.'
    case 'internal': return serverMessage || 'Something went wrong on our side. Please try again.'
    default: return serverMessage || 'The request could not be completed.'
  }
}

interface CallOptions {
  method?: 'GET' | 'POST'
  query?: Record<string, string | number | undefined>
  json?: unknown
  form?: FormData
}

async function request(name: string, opts: CallOptions = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) {
    await supabase.auth.signOut()
    throw new ApiError('unauthenticated', friendlyMessage('unauthenticated', undefined), 401)
  }
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) qs.set(k, String(v))
  const url = `${SUPABASE_URL}/functions/v1/${name}${qs.toString() ? `?${qs}` : ''}`
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY }
  let body: BodyInit | undefined
  if (opts.form) body = opts.form // browser sets the multipart boundary
  else if (opts.json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.json) }

  let res: Response
  try {
    res = await fetch(url, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body })
  } catch {
    const origin = typeof window === 'undefined' ? 'this frontend origin' : window.location.origin
    throw new ApiError('network', `Supabase blocked the request to “${name}” before it reached the function. Deploy/update that Edge Function. Localhost ports are supported by the updated CORS handler; non-local app origins must be listed in ALLOWED_ORIGINS (${origin}).`, 0)
  }
  if (!res.ok) {
    let code = 'internal'
    let message: string | undefined
    let requestId: string | undefined
    try {
      const j = await res.json()
      code = j?.error?.code ?? code
      message = typeof j?.error?.message === 'string' ? j.error.message : undefined
      requestId = j?.request_id
    } catch { /* non-JSON error body */ }
    if (res.status === 401) {
      await supabase.auth.signOut()
      code = 'unauthenticated'
    }
    throw new ApiError(code, friendlyMessage(code, message), res.status, requestId)
  }
  return res
}

/** Calls an edge function and returns the `data` payload of the success envelope. */
export async function callFn<T>(name: string, opts: CallOptions = {}): Promise<T> {
  const res = await request(name, opts)
  try {
    const j = await res.json()
    return j.data as T
  } catch {
    throw new ApiError('internal', friendlyMessage('internal', undefined), res.status)
  }
}

/** Calls an edge function that returns raw bytes. */
export async function callFnBlob(name: string, opts: CallOptions = {}): Promise<{ blob: Blob; filename?: string }> {
  const res = await request(name, opts)
  const cd = res.headers.get('Content-Disposition') ?? ''
  const m = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(cd)
  let filename: string | undefined
  try { filename = m ? decodeURIComponent(m[1] ?? m[2]) : undefined } catch { filename = m?.[2] }
  return { blob: await res.blob(), filename }
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error && e.message) return e.message
  return 'Something went wrong. Please try again.'
}
