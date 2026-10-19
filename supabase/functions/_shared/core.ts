// Shared building blocks for all TrustVault Edge Functions.
// Security rules: identity ONLY from the verified token; every decision is made
// by a svc_* SQL function; errors never include document data.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

// ---------- config ----------
export interface Config {
  supabaseUrl: string;
  anonKey: string;
  serviceKey: string;
  allowedOrigins: string[];
  maxUploadBytes: number;
}
export function loadConfig(get: (k: string) => string | undefined = (k) => Deno.env.get(k)): Config {
  const url = get('SUPABASE_URL');
  const anon = get('SUPABASE_ANON_KEY') ?? get('SUPABASE_PUBLISHABLE_KEY');
  const service = get('SUPABASE_SERVICE_ROLE_KEY') ?? get('SUPABASE_SECRET_KEY');
  if (!url || !anon || !service) throw new Error('Missing Supabase environment configuration');
  const max = Number(get('MAX_UPLOAD_BYTES') ?? 10 * 1024 * 1024);
  return {
    supabaseUrl: url,
    anonKey: anon,
    serviceKey: service,
    // Never "*": production origins are listed explicitly (ALLOWED_ORIGINS=https://app.example.com,...)
    allowedOrigins: (get('ALLOWED_ORIGINS') ?? 'http://localhost:5173,http://localhost:5174,http://localhost:5175').split(',').map((s) => s.trim()).filter(Boolean),
    maxUploadBytes: Number.isFinite(max) ? Math.min(Math.max(max, 1), 20 * 1024 * 1024) : 10 * 1024 * 1024,
  };
}

// ---------- dependency interfaces (injectable for tests) ----------
export interface AuthUser { id: string; email?: string }
export type Authenticator = (token: string) => Promise<AuthUser | null>;
export interface ServiceDb { call(fn: string, args: Record<string, unknown>): Promise<any> }
export interface ObjectStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  remove(keys: string[]): Promise<string[]>; // returns keys that FAILED to delete
}
export interface Deps { config: Config; authenticate: Authenticator; db: ServiceDb; store: ObjectStore }

export function prodDeps(): Deps {
  const config = loadConfig();
  const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const anon = createClient(config.supabaseUrl, config.anonKey, opts);
  const admin = createClient(config.supabaseUrl, config.serviceKey, opts);
  return {
    config,
    // getUser() asks the Auth server, so deleted/disabled users and signed-out tokens are rejected.
    authenticate: async (token) => {
      const { data, error } = await anon.auth.getUser(token);
      return error || !data.user ? null : { id: data.user.id, email: data.user.email ?? undefined };
    },
    db: {
      async call(fn, args) {
        const { data, error } = await admin.rpc(fn, args);
        if (error) throw new DbError(error.code ?? '', error.message);
        return data;
      },
    },
    store: {
      async put(key, bytes, contentType) {
        const { error } = await admin.storage.from('documents').upload(key, bytes, { contentType, upsert: false });
        if (error) throw new Error('storage put failed');
      },
      async get(key) {
        const { data, error } = await admin.storage.from('documents').download(key);
        if (error || !data) return null;
        return new Uint8Array(await data.arrayBuffer());
      },
      async remove(keys) {
        if (!keys.length) return [];
        const { data, error } = await admin.storage.from('documents').remove(keys);
        if (error) return keys;
        const gone = new Set((data ?? []).map((o: { name: string }) => o.name));
        return keys.filter((k) => !gone.has(k));
      },
    },
  };
}

// ---------- errors & responses ----------
export class DbError extends Error { constructor(public code: string, m: string) { super(m); } }
export class ApiError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); }
}
const STATUS: Record<string, [number, string]> = {
  unauthenticated: [401, 'Authentication required.'],
  invalid_request: [400, 'The request is invalid.'],
  invalid: [400, 'The request is invalid.'],
  forbidden: [403, 'You do not have permission to perform this action.'],
  not_found: [404, 'Not found, or you do not have access.'],
  grantee_not_found: [404, 'No registered user with that e-mail address.'],
  conflict: [409, 'The request conflicts with the current state.'],
  payload_too_large: [413, 'The file is too large.'],
  unsupported_media_type: [415, 'Unsupported file type.'],
  rate_limited: [429, 'Too many denied requests. Try again in a minute.'],
  method_not_allowed: [405, 'Method not allowed.'],
  unavailable: [503, 'The service is temporarily unavailable. Nothing was returned.'],
  internal: [500, 'Internal error.'],
};
export function apiError(code: string, message?: string): ApiError {
  const [status, msg] = STATUS[code] ?? STATUS.internal;
  return new ApiError(code, status, message ?? msg);
}
/** Throw the right ApiError for a svc_* result that is not ok. */
export function assertOk<T extends { ok: boolean; code?: string }>(r: T): T {
  if (!r || r.ok !== true) throw apiError(r?.code && STATUS[r.code] ? r.code : 'internal');
  return r;
}

export function corsHeaders(req: Request, allowed: string[]): Headers {
  const h = new Headers();
  const origin = req.headers.get('origin');
  let isLocalhostDevOrigin = false;
  if (origin) {
    try {
      const parsed = new URL(origin);
      isLocalhostDevOrigin = parsed.protocol === 'http:'
        && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    } catch { /* invalid Origin is never allowed */ }
  }
  if (origin && (allowed.includes(origin) || isLocalhostDevOrigin)) {
    h.set('Access-Control-Allow-Origin', origin);
    h.set('Vary', 'Origin');
    h.set('Access-Control-Allow-Headers', 'authorization, content-type, apikey, x-client-info');
    h.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    h.set('Access-Control-Expose-Headers', 'x-request-id, content-disposition, x-content-sha256');
    h.set('Access-Control-Max-Age', '600');
  }
  return h;
}

export interface Ctx { req: Request; user: AuthUser; requestId: string; deps: Deps }
type Impl = (ctx: Ctx) => Promise<Response>;

export function json(data: unknown, status: number, requestId: string, extra?: Headers): Response {
  const h = new Headers(extra);
  h.set('Content-Type', 'application/json; charset=utf-8');
  h.set('Cache-Control', 'no-store');
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('X-Request-Id', requestId);
  return new Response(JSON.stringify({ data, request_id: requestId }), { status, headers: h });
}

/** Wrap a function: CORS, method check, request id, authentication, uniform errors. */
export function wrap(deps: Deps, methods: string[], impl: Impl) {
  return async (req: Request): Promise<Response> => {
    const requestId = crypto.randomUUID(); // server-generated; client values are ignored
    const cors = corsHeaders(req, deps.config.allowedOrigins);
    const fail = (e: ApiError): Response => {
      const h = new Headers(cors);
      h.set('Content-Type', 'application/json; charset=utf-8');
      h.set('Cache-Control', 'no-store');
      h.set('X-Request-Id', requestId);
      if (e.status === 429) h.set('Retry-After', '60');
      return new Response(JSON.stringify({ error: { code: e.code, message: e.message }, request_id: requestId }), { status: e.status, headers: h });
    };
    try {
      if (req.method === 'OPTIONS') {
        return cors.has('Access-Control-Allow-Origin') ? new Response(null, { status: 204, headers: cors }) : new Response(null, { status: 403 });
      }
      if (!methods.includes(req.method)) throw apiError('method_not_allowed');

      const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '');
      if (!m) throw apiError('unauthenticated');
      let user: AuthUser | null = null;
      try { user = await deps.authenticate(m[1]); } catch { throw apiError('unavailable'); }
      if (!user) {
        // Best effort: record the failed identity check (no token material is stored).
        await deps.db.call('svc_record_event', { p_actor: null, p_document: null, p_action: 'auth.failure', p_outcome: 'denied', p_request: requestId, p_details: { reason: 'invalid_token' } }).catch(() => {});
        throw apiError('unauthenticated');
      }
      const res = await impl({ req, user, requestId, deps });
      for (const [k, v] of cors) res.headers.set(k, v);
      res.headers.set('X-Request-Id', requestId);
      return res;
    } catch (e) {
      if (e instanceof ApiError) return fail(e);
      // Unknown failure (including audit-write failure): FAIL CLOSED, no data, no details.
      console.error(JSON.stringify({ request_id: requestId, error: e instanceof Error ? e.name : 'unknown' }));
      const lockTimeout = e instanceof DbError && e.code === '55P03';
      return fail(apiError(lockTimeout || (e instanceof DbError && e.code === '') ? 'unavailable' : 'internal'));
    }
  };
}

/** Read a request body but refuse to buffer more than `limit` bytes. */
export async function readLimited(req: Request, limit: number): Promise<Uint8Array> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > limit) throw apiError('payload_too_large');
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) { await reader.cancel(); throw apiError('payload_too_large'); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

// ---------- file validation ----------
export type FileKind = { mime: 'application/pdf' | 'image/png' | 'image/jpeg'; ext: string[] };
const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);

/** Detect the real type from the BYTES (never from the filename or browser MIME). Also rejects truncated files. */
export function detectFileType(b: Uint8Array): FileKind | null {
  if (b.length < 16) return null;
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d])) { // %PDF-
    const tail = new TextDecoder('latin1').decode(b.slice(Math.max(0, b.length - 2048)));
    return tail.includes('%%EOF') ? { mime: 'application/pdf', ext: ['pdf'] } : null;
  }
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) && startsWith(b, [0x49, 0x48, 0x44, 0x52], 12)) {
    const iend = [0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
    return startsWith(b, iend, b.length - 8) ? { mime: 'image/png', ext: ['png'] } : null;
  }
  if (startsWith(b, [0xff, 0xd8, 0xff])) {
    let end = b.length;
    while (end > 2 && b[end - 1] === 0) end--;
    return b[end - 2] === 0xff && b[end - 1] === 0xd9 ? { mime: 'image/jpeg', ext: ['jpg', 'jpeg'] } : null;
  }
  return null;
}

/** Strip path parts and control characters; cap the length. Only ever DISPLAYED, never used as a path. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // deno-lint-ignore no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').replace(/^\.+/, '').trim();
  return (clean || 'document').slice(0, 200);
}

export function validateUpload(filename: string, declaredMime: string, bytes: Uint8Array, max: number): { mime: string; filename: string } {
  if (bytes.length === 0) throw apiError('invalid_request', 'The file is empty.');
  if (bytes.length > max) throw apiError('payload_too_large');
  const kind = detectFileType(bytes);
  if (!kind) throw apiError('unsupported_media_type', 'Only valid PDF, PNG and JPEG files are accepted.');
  const safe = sanitizeFilename(filename);
  const ext = (safe.split('.').pop() ?? '').toLowerCase();
  if (!kind.ext.includes(ext)) throw apiError('unsupported_media_type', 'The file extension does not match the file contents.');
  if (declaredMime && declaredMime !== 'application/octet-stream' && declaredMime !== kind.mime) {
    throw apiError('unsupported_media_type', 'The declared file type does not match the file contents.');
  }
  return { mime: kind.mime, filename: safe };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource));
  return [...d].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

// ---------- tiny validators (no external schema library needed) ----------
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CATEGORIES = ['general', 'contract', 'salary_letter', 'technical_drawing', 'audit', 'customer_record'];
export function uuid(v: unknown, field: string): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw apiError('invalid_request', `${field} must be a UUID.`);
  return v.toLowerCase();
}
export function str(v: unknown, field: string, min: number, max: number, optional = false): string | null {
  if (v === undefined || v === null) { if (optional) return null; throw apiError('invalid_request', `${field} is required.`); }
  if (typeof v !== 'string') throw apiError('invalid_request', `${field} must be text.`);
  const t = v.trim();
  if (t.length < min || v.length > max) throw apiError('invalid_request', `${field} must be ${min}-${max} characters.`);
  return t;
}
export function category(v: unknown, optional = true): string | null {
  if (v === undefined || v === null || v === '') { if (optional) return null; return 'general'; }
  if (typeof v !== 'string' || !CATEGORIES.includes(v)) throw apiError('invalid_request', 'Unknown category.');
  return v;
}
export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  if (!(req.headers.get('content-type') ?? '').includes('application/json')) throw apiError('unsupported_media_type', 'Expected application/json.');
  const raw = await readLimited(req, 64 * 1024);
  try {
    const v = JSON.parse(new TextDecoder().decode(raw));
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw 0;
    return v as Record<string, unknown>;
  } catch { throw apiError('invalid_request', 'Body must be a JSON object.'); }
}
