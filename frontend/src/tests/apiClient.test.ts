import { beforeEach, describe, expect, it, vi } from 'vitest'

const signOut = vi.fn().mockResolvedValue({})
const getSession = vi.fn()
vi.mock('../lib/supabase', () => ({
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  supabase: { auth: { getSession: () => getSession(), signOut: () => signOut() } },
}))

import { ApiError, callFn, NOT_FOUND_MESSAGE } from '../services/api'

const respond = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

describe('api client', () => {
  beforeEach(() => {
    signOut.mockClear()
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok123' } } })
  })

  it('sends bearer token and apikey, returns data', async () => {
    const f = respond(200, { data: { ok: 1 }, request_id: 'r' })
    vi.stubGlobal('fetch', f)
    const out = await callFn<{ ok: number }>('document-get', { query: { id: 'abc' } })
    expect(out).toEqual({ ok: 1 })
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://x.supabase.co/functions/v1/document-get?id=abc')
    expect(init.headers.Authorization).toBe('Bearer tok123')
    expect(init.headers.apikey).toBe('anon-key')
    expect(String(url)).not.toContain('tok123')
  })

  it('401 signs the user out', async () => {
    vi.stubGlobal('fetch', respond(401, { error: { code: 'unauthenticated', message: 'x' }, request_id: 'r' }))
    await expect(callFn('document-get')).rejects.toMatchObject({ code: 'unauthenticated', status: 401 })
    expect(signOut).toHaveBeenCalled()
  })

  it('404 maps to one neutral message', async () => {
    vi.stubGlobal('fetch', respond(404, { error: { code: 'not_found', message: 'document 123 owned by bob' }, request_id: 'r' }))
    const err = (await callFn("document-get").catch((e: unknown) => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.message).toBe(NOT_FOUND_MESSAGE)
    expect(err.message).not.toContain('bob')
  })

  it('maps rate limiting and network failures', async () => {
    vi.stubGlobal('fetch', respond(429, { error: { code: 'rate_limited', message: 'slow' }, request_id: 'r' }))
    await expect(callFn('x')).rejects.toMatchObject({ code: 'rate_limited' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')))
    const error = (await callFn('document-upload').catch((e: unknown) => e)) as ApiError
    expect(error.code).toBe('network')
    expect(error.message).toContain('document-upload')
    expect(error.message).toContain(window.location.origin)
    expect(error.message).toContain('ALLOWED_ORIGINS')
    expect(error.message).toContain('Deploy/update')
  })

  it('signs out without a session and never calls fetch', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    await expect(callFn('x')).rejects.toMatchObject({ code: 'unauthenticated' })
    expect(f).not.toHaveBeenCalled()
    expect(signOut).toHaveBeenCalled()
  })
})
