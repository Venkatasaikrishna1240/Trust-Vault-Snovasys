import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

/**
 * Black-box HTTP security tests: Edge Functions + PostgREST Data API, exactly as a malicious
 * client would call them (no UI). Runs against the local harness (see docs/testing.md).
 */
const BASE = process.env.TV_BASE_URL ?? 'http://127.0.0.1:54331';
const db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/trustvault_test', max: 2 });

const mint = async (sub: string) =>
  (await (await fetch(`${BASE}/__harness/mint`, { method: 'POST', body: JSON.stringify({ sub, role: 'authenticated', aud: 'authenticated' }) })).text());

interface U { id: string; email: string; token: string }
async function user(role: 'admin' | 'owner' | 'viewer', label: string): Promise<U> {
  const id = randomUUID(); const email = `${label}-${id.slice(0, 6)}@trustvault.test`;
  await db.query(`insert into auth.users (id,email) values ($1,$2)`, [id, email]);
  if (role !== 'viewer') await db.query(`update public.profiles set role=$2 where id=$1`, [id, role]);
  return { id, email, token: await mint(id) };
}
const fn = (name: string, u: U | null, init: RequestInit = {}, qs = '') =>
  fetch(`${BASE}/functions/v1/${name}${qs}`, { ...init, headers: { ...(u ? { authorization: `Bearer ${u.token}` } : {}), ...(init.headers as object) } });
const post = (name: string, u: U | null, body: unknown) => fn(name, u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const rest = (path: string, u: U | null, init: RequestInit = {}) =>
  fetch(`${BASE}/rest/v1/${path}`, { ...init, headers: { 'content-type': 'application/json', ...(u ? { authorization: `Bearer ${u.token}` } : {}), ...(init.headers as object) } });

// Minimal VALID files (signature + terminator)
const PDF = (marker = 'x') => new TextEncoder().encode(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${marker}\ntrailer<<>>\n%%EOF\n`);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0x1f, 0x15, 0xc4, 0x89, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
async function upload(u: U, bytes: Uint8Array, over: { name?: string; type?: string; title?: string; shareEmails?: string[]; permission?: 'read' | 'edit'; isGlobal?: boolean } = {}) {
  const f = new FormData();
  f.set('file', new File([bytes], over.name ?? 'salary.pdf', { type: over.type ?? 'application/pdf' }));
  f.set('title', over.title ?? 'Salary letter'); f.set('category', 'salary_letter');
  f.set('is_global', String(over.isGlobal ?? false)); f.set('share_permission', over.permission ?? 'read');
  for (const email of over.shareEmails ?? []) f.append('share_email', email);
  return fn('document-upload', u, { method: 'POST', body: f });
}
const makeDoc = async (owner: U, title = 'Confidential ' + randomUUID().slice(0, 5)) => {
  const r = await upload(owner, PDF(title), { title });
  expect(r.status).toBe(201);
  return (await r.json()).data.document as { id: string; title: string };
};
const dl = (u: U | null, id: string) => fn('document-download', u, {}, `?id=${id}`);
const share = (owner: U, id: string, grantee: U, permission: 'read' | 'edit') =>
  post('document-share', owner, { action: 'grant', document_id: id, grantee_email: grantee.email, permission });

let admin: U, owner: U, owner2: U, viewer: U, editor: U, stranger: U;
beforeAll(async () => {
  [admin, owner, owner2, viewer, editor, stranger] = await Promise.all([
    user('admin', 'admin'), user('owner', 'owner'), user('owner', 'owner2'),
    user('viewer', 'viewer'), user('viewer', 'editor'), user('viewer', 'stranger'),
  ]);
});

describe('authentication', () => {
  it('rejects missing, malformed, forged and unknown-user tokens on every function', async () => {
    const names = ['document-upload', 'document-download', 'document-preview', 'document-get', 'document-edit', 'document-delete', 'document-share', 'admin-audit-query', 'admin-set-role'];
    const forged = (await mint(randomUUID())).replace(/.$/, 'A'); // broken signature
    for (const n of names) {
      for (const h of [undefined, 'Bearer', 'Bearer abc.def.ghi', `Bearer ${forged}`, 'Basic Zm9v']) {
        const r = await fetch(`${BASE}/functions/v1/${n}?id=${randomUUID()}`, { method: n.includes('download') || n.includes('preview') || n.includes('get') ? 'GET' : 'POST', headers: h ? { authorization: h } : {} });
        expect(r.status, `${n} ${h}`).toBe(401);
        expect((await r.json()).error.code).toBe('unauthenticated');
      }
    }
  });
  it('anonymous Data API calls are denied', async () => {
    for (const t of ['documents?select=id', 'profiles?select=id', 'audit_events?select=seq', 'document_permissions?select=id']) {
      expect([401, 403], t).toContain((await rest(t, null)).status);
    }
  });
  it('rejects wrong HTTP methods and disallowed CORS origins', async () => {
    expect((await fn('document-download', owner, { method: 'POST' })).status).toBe(405);
    const r = await fetch(`${BASE}/functions/v1/document-get`, { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' } });
    expect(r.status).toBe(403);
    const ok = await fetch(`${BASE}/functions/v1/document-get`, { method: 'OPTIONS', headers: { origin: 'http://localhost:5173' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');

    const randomVitePort = await fetch(`${BASE}/functions/v1/document-share`, {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:5176',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type,apikey',
      },
    });
    expect(randomVitePort.status).toBe(204);
    expect(randomVitePort.headers.get('access-control-allow-origin')).toBe('http://localhost:5176');

    const configuredProductionOrigin = await fetch(`${BASE}/functions/v1/document-share`, {
      method: 'OPTIONS', headers: { origin: 'https://trustvault.test' },
    });
    expect(configuredProductionOrigin.status).toBe(204);
    expect(configuredProductionOrigin.headers.get('access-control-allow-origin')).toBe('https://trustvault.test');
  });
});

describe('cross-user access through the Edge Functions', () => {
  let doc: { id: string; title: string };
  beforeAll(async () => { doc = await makeDoc(owner, 'Salary letter — Priya Raman'); });

  it('upload atomically grants selected readers/editors or makes the document globally visible', async () => {
    const readerUpload = await upload(owner, PDF('upload shared to readers'), { title: 'Readers at upload', shareEmails: [viewer.email, stranger.email], permission: 'read' });
    expect(readerUpload.status).toBe(201);
    const readerDoc = (await readerUpload.json()).data.document as { id: string };
    expect((await fn('document-preview', viewer, {}, `?id=${readerDoc.id}`)).status).toBe(200);
    expect((await dl(viewer, readerDoc.id)).status).toBe(403);
    expect((await fn('document-preview', stranger, {}, `?id=${readerDoc.id}`)).status).toBe(200);
    const received = await fn('document-get', viewer, {}, `?id=${readerDoc.id}`);
    expect(received.status).toBe(200);
    expect((await received.json()).data.document.owner_display_name).toBeTruthy();

    const editorUpload = await upload(owner, PDF('upload shared to editor'), { title: 'Editor at upload', shareEmails: [editor.email], permission: 'edit' });
    expect(editorUpload.status).toBe(201);
    const editorDoc = (await editorUpload.json()).data.document as { id: string };
    expect((await dl(editor, editorDoc.id)).status).toBe(200);

    const globalUpload = await upload(owner, PDF('upload globally'), { title: 'Global at upload', isGlobal: true });
    expect(globalUpload.status).toBe(201);
    const globalDoc = (await globalUpload.json()).data.document as { id: string; is_global: boolean };
    expect(globalDoc.is_global).toBe(true);
    expect((await fn('document-get', stranger, {}, `?id=${globalDoc.id}`)).status).toBe(200);
  });

  it('recipient lookup requires an exact email and excludes the searching user', async () => {
    const partial = await post('document-share', owner, { action: 'search_recipients', query: 'stranger-' });
    expect(partial.status).toBe(200);
    expect((await partial.json()).data.recipients).toEqual([]);

    const byName = await post('document-share', owner, { action: 'search_recipients', query: 'Stranger' });
    expect(byName.status).toBe(200);
    expect((await byName.json()).data.recipients).toEqual([]);

    const r = await post('document-share', owner, { action: 'search_recipients', query: stranger.email });
    expect(r.status).toBe(200);
    const found = (await r.json()).data.recipients as Array<{ id: string; email: string }>;
    expect(found).toEqual([expect.objectContaining({ id: stranger.id, email: stranger.email })]);
    expect(found.some((person) => person.id === owner.id)).toBe(false);
  });

  it('owner downloads the exact bytes', async () => {
    const r = await dl(owner, doc.id);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/pdf');
    expect(r.headers.get('content-disposition')).toMatch(/^attachment/);
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new TextDecoder().decode(await r.arrayBuffer())).toContain('%PDF-1.4');
  });

  it('owner can publish for signed-in users; read access previews inline but cannot download, and unpublishing revokes access', async () => {
    const published = await post('document-share', owner, { action: 'set_visibility', document_id: doc.id, is_global: true });
    expect(published.status).toBe(200);
    expect((await published.json()).data.document.is_global).toBe(true);

    expect((await fn('document-get', stranger, {}, `?id=${doc.id}`)).status).toBe(200);
    const search = await rest('rpc/search_documents', stranger, { method: 'POST', body: JSON.stringify({ p_scope: 'all', p_limit: 100, p_offset: 0 }) });
    expect(search.status).toBe(200);
    expect((await search.json()).some((row: { id: string }) => row.id === doc.id)).toBe(true);
    const preview = await fn('document-preview', stranger, {}, `?id=${doc.id}`);
    expect(preview.status).toBe(200);
    expect(preview.headers.get('content-disposition')).toMatch(/^inline/);
    expect(new TextDecoder().decode(await preview.arrayBuffer())).toContain('%PDF-1.4');
    expect((await dl(stranger, doc.id)).status).toBe(403);

    expect((await post('document-share', owner, { action: 'set_visibility', document_id: doc.id, is_global: false })).status).toBe(200);
    expect((await fn('document-preview', stranger, {}, `?id=${doc.id}`)).status).toBe(404);
    expect((await fn('document-get', stranger, {}, `?id=${doc.id}`)).status).toBe(404);
  });

  it('strangers / other owners / admins get 404 with NO metadata and NO bytes (same as a random id)', async () => {
    const randomMiss = await (await dl(stranger, randomUUID())).json();
    for (const u of [stranger, owner2, admin]) {
      const r = await dl(u, doc.id);
      expect(r.status).toBe(404);
      const text = await r.text();
      expect(text).not.toContain('Priya'); expect(text).not.toContain('%PDF'); expect(text).not.toContain(doc.id);
      expect(JSON.parse(text).error).toEqual(randomMiss.error);
      const g = await fn('document-get', u, {}, `?id=${doc.id}`);
      expect(g.status).toBe(404); expect(await g.text()).not.toContain('Priya');
    }
  });

  it('strangers cannot edit, delete, share or revoke (and nothing changes)', async () => {
    expect((await post('document-edit', stranger, { document_id: doc.id, title: 'pwned' })).status).toBe(404);
    expect((await post('document-delete', stranger, { document_id: doc.id })).status).toBe(404);
    expect((await share(stranger, doc.id, stranger, 'edit')).status).toBe(404);
    expect((await post('document-share', stranger, { action: 'revoke', document_id: doc.id, grantee_id: owner.id })).status).toBe(404);
    const d = await db.query(`select title, deleted_at from public.documents where id=$1`, [doc.id]);
    expect(d.rows[0]).toEqual({ title: 'Salary letter — Priya Raman', deleted_at: null });
  });

  it('malformed ids and bodies are rejected before any lookup', async () => {
    expect((await dl(owner, 'not-a-uuid')).status).toBe(400);
    expect((await dl(owner, doc.id + "' or 1=1")).status).toBe(400);
    expect((await post('document-share', owner, { action: 'grant', document_id: doc.id, grantee_email: viewer.email, permission: 'admin' })).status).toBe(400);
    expect((await post('document-share', owner, { action: 'nuke', document_id: doc.id })).status).toBe(400);
    expect((await fn('document-edit', owner, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '[1,2' })).status).toBe(400);
  });

  it('user id / role in the request body is ignored (identity comes from the token)', async () => {
    const r = await post('document-share', stranger, { action: 'grant', document_id: doc.id, grantee_email: stranger.email, permission: 'edit', user_id: owner.id, actor_id: owner.id, granted_by: owner.id, role: 'owner' });
    expect(r.status).toBe(404);
    const e = await post('admin-set-role', owner, { user_id: stranger.id, role: 'owner', actor_id: admin.id });
    expect(e.status).toBe(403);
  });
});

describe('read / edit grants and IMMEDIATE revocation', () => {
  it('read grant: can read+preview but not download/edit/delete/share; edit grant can download/edit; revocation blocks the very next preview', async () => {
    const doc = await makeDoc(owner);
    expect((await share(owner, doc.id, viewer, 'read')).status).toBe(200);
    expect((await share(owner, doc.id, editor, 'edit')).status).toBe(200);

    expect((await fn('document-preview', viewer, {}, `?id=${doc.id}`)).status).toBe(200);
    expect((await dl(viewer, doc.id)).status).toBe(403);
    expect((await fn('document-get', viewer, {}, `?id=${doc.id}`)).status).toBe(200);
    expect((await post('document-edit', viewer, { document_id: doc.id, title: 'x' })).status).toBe(403);
    expect((await post('document-delete', viewer, { document_id: doc.id })).status).toBe(403);
    expect((await share(viewer, doc.id, stranger, 'read')).status).toBe(403);

    const ed = await post('document-edit', editor, { document_id: doc.id, title: 'Edited by editor' });
    expect(ed.status).toBe(200);
    expect((await ed.json()).data.document.title).toBe('Edited by editor');
    expect((await post('document-delete', editor, { document_id: doc.id })).status).toBe(403);
    expect((await share(editor, doc.id, stranger, 'read')).status).toBe(403);

    // Revoke -> next preview requests fail, with no content
    expect((await post('document-share', owner, { action: 'revoke', document_id: doc.id, grantee_id: viewer.id })).status).toBe(200);
    for (let i = 0; i < 3; i++) {
      const r = await fn('document-preview', viewer, {}, `?id=${doc.id}`);
      expect(r.status).toBe(404);
      expect(await r.text()).not.toContain('%PDF');
    }
    expect((await dl(editor, doc.id)).status).toBe(200); // other grants unaffected
  });

  it('an edit grant can replace content and download older versions; read grants remain preview-only', async () => {
    const doc = await makeDoc(owner);
    await share(owner, doc.id, editor, 'edit');
    await share(owner, doc.id, viewer, 'read');
    const f = new FormData(); f.set('file', new File([PDF('v2')], 'v2.pdf', { type: 'application/pdf' }));
    const r = await fn('document-edit', editor, { method: 'POST', body: f }, `?id=${doc.id}`);
    expect(r.status).toBe(200);
    expect((await r.json()).data.document.current_version).toBe(2);
    const editorOldVersion = await fn('document-download', editor, {}, `?id=${doc.id}&version=1`);
    expect(editorOldVersion.status).toBe(200);
    expect(new TextDecoder().decode(await editorOldVersion.arrayBuffer())).toContain('v1');
    expect((await fn('document-download', viewer, {}, `?id=${doc.id}&version=1`)).status).toBe(403);
    expect((await fn('document-download', owner, {}, `?id=${doc.id}&version=1`)).status).toBe(200);
    expect(new TextDecoder().decode(await (await dl(editor, doc.id)).arrayBuffer())).toContain('v2');
    expect((await post('document-share', owner, { action: 'revoke', document_id: doc.id, grantee_id: editor.id })).status).toBe(200);
    expect((await fn('document-download', editor, {}, `?id=${doc.id}&version=1`)).status).toBe(404);
  });

  it('delete removes access for everyone and purges the stored bytes', async () => {
    const doc = await makeDoc(owner);
    await share(owner, doc.id, viewer, 'read');
    const before = (await (await fetch(`${BASE}/__harness/objects`)).json()).filter((k: string) => k.includes(doc.id));
    expect(before.length).toBe(1);
    const r = await post('document-delete', owner, { document_id: doc.id });
    expect((await r.json()).data.purge).toBe('completed');
    expect((await dl(owner, doc.id)).status).toBe(404);
    expect((await dl(viewer, doc.id)).status).toBe(404);
    const after = (await (await fetch(`${BASE}/__harness/objects`)).json()).filter((k: string) => k.includes(doc.id));
    expect(after).toEqual([]);
  });

  it('viewers and admins can upload documents they own', async () => {
    expect((await upload(viewer, PDF('viewer upload'))).status).toBe(201);
    expect((await upload(admin, PDF('admin upload'))).status).toBe(201);
  });
});

describe('direct Data API (PostgREST) access — bypassing the UI', () => {
  let doc: { id: string; title: string };
  beforeAll(async () => { doc = await makeDoc(owner, 'DataAPI-secret-title'); await share(owner, doc.id, viewer, 'read'); });

  it('strangers and admins see nothing; grantee sees metadata; storage_key is never selectable', async () => {
    for (const u of [stranger, admin, owner2]) {
      const r = await rest(`documents?select=id,title&id=eq.${doc.id}`, u);
      expect(r.status).toBe(200); expect(await r.json()).toEqual([]);
    }
    expect((await (await rest(`documents?select=id,title&id=eq.${doc.id}`, viewer)).json()).length).toBe(1);
    expect((await rest(`documents?select=storage_key`, owner)).status).toBe(403);
  });

  it('writes are denied for everyone: documents, grants, audit_events', async () => {
    for (const u of [owner, viewer, stranger, admin]) {
      expect((await rest(`documents?id=eq.${doc.id}`, u, { method: 'PATCH', body: JSON.stringify({ title: 'x' }) })).status).toBe(403);
      expect((await rest(`documents?id=eq.${doc.id}`, u, { method: 'DELETE' })).status).toBe(403);
      expect((await rest(`document_permissions`, u, { method: 'POST', body: JSON.stringify({ document_id: doc.id, user_id: u.id, permission: 'edit', granted_by: owner.id }) })).status).toBe(403);
      expect((await rest(`audit_events`, u, { method: 'POST', body: JSON.stringify({ actor_id: owner.id, action: 'document.download', outcome: 'success', request_id: randomUUID() }) })).status).toBe(403);
      expect((await rest(`audit_events`, u, { method: 'PATCH', body: JSON.stringify({ outcome: 'success' }) })).status).toBe(403);
      expect((await rest(`audit_events`, u, { method: 'DELETE' })).status).toBe(403);
    }
    const t = await db.query(`select title from public.documents where id=$1`, [doc.id]);
    expect(t.rows[0].title).toBe('DataAPI-secret-title');
  });

  it('a user cannot promote themselves or call svc_* / app helpers', async () => {
    expect((await rest(`profiles?id=eq.${stranger.id}`, stranger, { method: 'PATCH', body: JSON.stringify({ role: 'admin' }) })).status).toBe(403);
    expect((await db.query(`select role from public.profiles where id=$1`, [stranger.id])).rows[0].role).toBe('viewer');
    const r = await rest(`rpc/svc_authorize_download`, stranger, { method: 'POST', body: JSON.stringify({ p_actor: owner.id, p_document: doc.id, p_version: null, p_request: randomUUID() }) });
    expect([401, 403, 404]).toContain(r.status);
    expect(await r.text()).not.toContain('storage_key');
  });

  it('search never leaks: stranger finds nothing by title, wildcard or SQL-ish input', async () => {
    for (const q of ['DataAPI', '%', '_', "' or 1=1 --"]) {
      const r = await rest('rpc/search_documents', stranger, { method: 'POST', body: JSON.stringify({ p_query: q }) });
      expect(await r.json()).toEqual([]);
    }
    const mine = await (await rest('rpc/search_documents', owner, { method: 'POST', body: JSON.stringify({ p_query: 'DataAPI' }) })).json();
    expect(mine.length).toBe(1);
  });
});

describe('audit trail over HTTP', () => {
  it('successful and denied attempts are recorded with the true actor; admin API is read-only and admin-only', async () => {
    const doc = await makeDoc(owner);
    await dl(owner, doc.id); await dl(stranger, doc.id);
    expect((await post('admin-audit-query', owner, {})).status).toBe(403);
    expect((await post('admin-audit-query', stranger, {})).status).toBe(403);
    const r = await post('admin-audit-query', admin, { filters: { document_id: doc.id }, verify_chain: true });
    expect(r.status).toBe(200);
    const { events, chain, head } = (await r.json()).data;
    const has = (a: string, o: string, actor: string) => events.some((e: any) => e.action === a && e.outcome === o && e.actor_id === actor);
    expect(has('document.upload', 'success', owner.id)).toBe(true);
    expect(has('document.download', 'success', owner.id)).toBe(true);
    expect(has('document.download', 'denied', stranger.id)).toBe(true);
    expect(chain.valid).toBe(true);
    expect(head.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(events)).not.toContain('%PDF');
  });

  it('an admin cannot read content; role changes work only on non-admin others', async () => {
    const doc = await makeDoc(owner);
    expect((await dl(admin, doc.id)).status).toBe(404);
    const t = await user('viewer', 'promo');
    expect((await post('admin-set-role', admin, { user_id: t.id, role: 'owner' })).status).toBe(200);
    expect((await post('admin-set-role', admin, { user_id: admin.id, role: 'viewer' })).status).toBe(403);
    expect((await post('admin-set-role', admin, { user_id: t.id, role: 'admin' })).status).toBe(400);
  });

  it('fails closed: if the audit write fails, no bytes are returned', async () => {
    const doc = await makeDoc(owner);
    const c = await db.connect();
    try {
      // Break the audit trail for a moment, committed so the other connection sees it, then repair it.
      await c.query(`alter table public.audit_events add constraint tv_break check (false) not valid`);
      const r = await dl(owner, doc.id);
      expect(r.status).toBeGreaterThanOrEqual(500);
      expect(await r.text()).not.toContain('%PDF');
    } finally {
      await c.query(`alter table public.audit_events drop constraint if exists tv_break`);
      c.release();
    }
    expect((await dl(owner, doc.id)).status).toBe(200);
  });
});

describe('upload validation', () => {
  it('accepts valid PDF and PNG', async () => {
    expect((await upload(owner, PDF('ok1'))).status).toBe(201);
    expect((await upload(owner, PNG, { name: 'p.png', type: 'image/png' })).status).toBe(201);
  });
  it('rejects wrong content, MIME/extension mismatch, truncated, empty, oversize, bad metadata', async () => {
    const text = new TextEncoder().encode('just some text pretending to be a pdf, long enough');
    expect((await upload(owner, text)).status).toBe(415);
    expect((await upload(owner, PDF(), { name: 'evil.exe' })).status).toBe(415);
    expect((await upload(owner, PDF(), { type: 'image/png' })).status).toBe(415);
    expect((await upload(owner, PNG, { name: 'x.pdf', type: 'application/pdf' })).status).toBe(415);
    expect((await upload(owner, PDF().slice(0, 20))).status).toBe(415); // truncated (no %%EOF)
    expect((await upload(owner, new Uint8Array())).status).toBe(400);
    expect((await upload(owner, new Uint8Array([...PDF(), ...new Uint8Array(2 * 1024 * 1024)]))).status).toBe(413);
    expect((await upload(owner, PDF(), { title: '' })).status).toBe(400);
    const html = new TextEncoder().encode('<script>alert(1)</script>'.padEnd(40, ' '));
    expect((await upload(owner, html, { name: 'x.pdf' })).status).toBe(415);
    expect((await fn('document-upload', owner, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(415);
  });
  it('hostile filenames are sanitised; storage key never contains user input', async () => {
    const r = await upload(owner, PDF('n'), { name: '..\\..\\etc\\pass<b>wd.pdf' });
    expect(r.status, await r.clone().text()).toBe(201);
    const d = (await r.json()).data.document;
    expect(d.original_filename).not.toMatch(/[\\/<>]/);
    const k = await db.query(`select storage_key from public.documents where id=$1`, [d.id]);
    expect(k.rows[0].storage_key).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/);
  });
});
