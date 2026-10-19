// TEST HARNESS (not deployed). Serves the REAL Edge Function handlers + proxies /rest/v1 to PostgREST,
// under one base URL like a Supabase project. Differences from production (documented in docs/testing.md):
//  - token verification is HS256 with a test secret instead of the Auth server (getUser)
//  - Storage is an in-memory map instead of the Storage API
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import * as H from '../../functions/_shared/handlers.ts';
import { DbError, type Deps, type ObjectStore } from '../../functions/_shared/core.ts';

const SECRET = Deno.env.get('TV_JWT_SECRET')!;
const PGRST = Deno.env.get('TV_POSTGREST_URL') ?? 'http://127.0.0.1:54330';
const PORT = Number(Deno.env.get('TV_HARNESS_PORT') ?? 54331);
const enc = new TextEncoder();
const b64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const key = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

async function mint(claims: Record<string, unknown>): Promise<string> {
  const head = b64u(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64u(enc.encode(JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + 3600 })));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${head}.${body}`)));
  return `${head}.${body}.${b64u(sig)}`;
}
const serviceJwt = await mint({ role: 'service_role' });

const objects = new Map<string, Uint8Array>();
const store: ObjectStore = {
  put: (k, b) => { if (objects.has(k)) throw new Error('exists'); objects.set(k, b); return Promise.resolve(); },
  get: (k) => Promise.resolve(objects.get(k) ?? null),
  remove: (ks) => { ks.forEach((k) => objects.delete(k)); return Promise.resolve([]); },
};
const admin = createClient(`http://127.0.0.1:${PORT}`, serviceJwt, { auth: { persistSession: false } });
const deps: Deps = {
  config: { supabaseUrl: '', anonKey: '', serviceKey: '', allowedOrigins: ['http://localhost:5173', 'https://trustvault.test'], maxUploadBytes: 1024 * 1024 },
  authenticate: async (t) => {
    const [h, p, s] = t.split('.');
    if (!h || !p || !s) return null;
    const ok = await crypto.subtle.verify('HMAC', key, b64(s), enc.encode(`${h}.${p}`));
    if (!ok) return null;
    const c = JSON.parse(new TextDecoder().decode(b64(p)));
    if (c.exp < Date.now() / 1000 || !c.sub || c.role !== 'authenticated') return null;
    return { id: c.sub };
  },
  db: { async call(fn, args) { const { data, error } = await admin.rpc(fn, args); if (error) throw new DbError(error.code ?? '', error.message); return data; } },
  store,
};
const routes: Record<string, (r: Request) => Promise<Response>> = {
  'document-upload': H.uploadHandler(deps), 'document-download': H.downloadHandler(deps), 'document-preview': H.previewHandler(deps), 'document-get': H.getHandler(deps),
  'document-edit': H.editHandler(deps), 'document-delete': H.deleteHandler(deps), 'document-share': H.shareHandler(deps),
  'admin-audit-query': H.auditQueryHandler(deps), 'admin-set-role': H.setRoleHandler(deps),
};
Deno.serve({ port: PORT, hostname: '127.0.0.1' }, async (req) => {
  const u = new URL(req.url);
  if (u.pathname === '/__harness/mint') return new Response(await mint(await req.json()));
  if (u.pathname === '/__harness/objects') return Response.json([...objects.keys()]);
  if (u.pathname.startsWith('/rest/v1/')) {
    const target = PGRST + u.pathname.slice('/rest/v1'.length) + u.search;
    return fetch(target, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body, duplex: 'half' } as RequestInit);
  }
  const m = /^\/functions\/v1\/([a-z-]+)$/.exec(u.pathname);
  if (m && routes[m[1]]) return routes[m[1]](req);
  return new Response('not found', { status: 404 });
});
