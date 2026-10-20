// All Edge Function handlers authenticate and validate before service RPCs.
// Denials are audited by SQL; delivery success is recorded after bytes verify.
import {
  apiError, assertOk, category, contentDisposition, Deps, jsonBody, json, readLimited, sha256Hex,
  str, uuid, validateUpload, wrap, type Ctx,
} from './core.ts';

const rpc = (c: Ctx, fn: string, args: Record<string, unknown>) =>
  c.deps.db.call(fn, { ...args, p_request: c.requestId });
const recordEvent = async (c: Ctx, doc: string | null, action: string, outcome: string, details: Record<string, unknown>) => {
  assertOk(await rpc(c, 'svc_record_event', {
    p_actor: c.user.id, p_document: doc, p_action: action, p_outcome: outcome, p_details: details,
  }));
};

/** Parse multipart after enforcing the size cap while reading. */
async function readMultipart(c: Ctx): Promise<FormData> {
  const ct = c.req.headers.get('content-type') ?? '';
  if (!ct.toLowerCase().startsWith('multipart/form-data')) throw apiError('unsupported_media_type', 'Expected multipart/form-data.');
  const body = await readLimited(c.req, c.deps.config.maxUploadBytes + 64 * 1024);
  try { return await new Response(body as unknown as BodyInit, { headers: { 'content-type': ct } }).formData(); }
  catch { throw apiError('invalid_request', 'Malformed multipart body.'); }
}
async function readFile(form: FormData, max: number) {
  const f = form.get('file');
  if (!(f instanceof File)) throw apiError('invalid_request', 'file is required.');
  const bytes = new Uint8Array(await f.arrayBuffer());
  const v = validateUpload(f.name, f.type, bytes, max);
  return { bytes, ...v, size: bytes.length, sha: await sha256Hex(bytes) };
}
async function discard(c: Ctx, doc: string, key: string) {
  const failed = await c.deps.store.remove([key]).catch(() => [key]);
  if (failed.length) await recordEvent(c, doc, 'storage.orphan', 'error', { reason: 'cleanup_failed' });
}

// ---------------- document-upload ----------------
export const uploadHandler = (deps: Deps) => wrap(deps, ['POST'], async (c) => {
  assertOk(await rpc(c, 'svc_authorize_upload', { p_actor: c.user.id })); // before reading the body
  const form = await readMultipart(c);
  const title = str(form.get('title'), 'title', 1, 200)!;
  const description = str(form.get('description') ?? '', 'description', 0, 2000, true) ?? '';
  const cat = category(form.get('category'), false)!;
  const visibility = form.get('is_global');
  if (visibility !== 'true' && visibility !== 'false') throw apiError('invalid_request', 'is_global must be true or false.');
  const permission = form.get('share_permission');
  if (permission !== 'read' && permission !== 'edit') throw apiError('invalid_request', 'share_permission must be read or edit.');
  const recipients = form.getAll('share_email');
  if (recipients.length > 20 || recipients.some((email) => typeof email !== 'string')) throw apiError('invalid_request', 'At most 20 recipient e-mails may be selected.');
  const file = await readFile(form, c.deps.config.maxUploadBytes);

  const docId = crypto.randomUUID();
  const key = `${c.user.id}/${docId}/${crypto.randomUUID()}`; // server-generated, never user input
  await c.deps.store.put(key, file.bytes, file.mime);
  let res;
  try {
    res = await rpc(c, 'svc_create_document_with_shares', {
      p_actor: c.user.id, p_document: docId, p_title: title, p_description: description, p_category: cat,
      p_filename: file.filename, p_storage_key: key, p_mime: file.mime, p_size: file.size, p_sha256: file.sha,
      p_share_emails: recipients, p_permission: permission, p_is_global: visibility === 'true',
    });
  } catch (e) { await discard(c, docId, key); throw e; }
  if (!res?.ok) { await discard(c, docId, key); }
  assertOk(res);
  return json({ document: res.document }, 201, c.requestId);
});

// ---------------- document-download ----------------
export const downloadHandler = (deps: Deps) => wrap(deps, ['GET'], async (c) => {
  const url = new URL(c.req.url);
  const id = uuid(url.searchParams.get('id'), 'id');
  const vRaw = url.searchParams.get('version');
  const version = vRaw === null ? null : Number(vRaw);
  if (version !== null && (!Number.isInteger(version) || version < 1)) throw apiError('invalid_request', 'version must be a positive integer.');

  // Authorize before Storage; successful delivery is audited after verification.
  const r = assertOk(await rpc(c, 'svc_authorize_download', { p_actor: c.user.id, p_document: id, p_version: version }));
  const bytes = await c.deps.store.get(r.storage_key).catch(() => null);
  if (!bytes) { await recordEvent(c, id, 'document.download', 'error', { stage: 'storage' }); throw apiError('unavailable'); }
  if (bytes.length !== Number(r.size_bytes) || (await sha256Hex(bytes)) !== r.sha256) {
    await recordEvent(c, id, 'document.download', 'error', { stage: 'integrity' });
    throw apiError('internal', 'Integrity check failed; file not delivered.');
  }
  assertOk(await rpc(c, 'svc_record_document_delivery', {
    p_actor: c.user.id, p_document: id, p_action: 'document.download', p_version: r.version,
  }));
  const h = new Headers({
    'Content-Type': r.mime_type, // from DB (validated at upload), not from the client
    'Content-Disposition': contentDisposition(r.original_filename),
    'Content-Length': String(bytes.length),
    'X-Content-SHA256': r.sha256,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': 'no-store',
  });
  return new Response(bytes as unknown as BodyInit, { status: 200, headers: h });
});

// Read-only users can preview supported files inline, but cannot receive an attachment.
export const previewHandler = (deps: Deps) => wrap(deps, ['GET'], async (c) => {
  const id = uuid(new URL(c.req.url).searchParams.get('id'), 'id');
  const r = assertOk(await rpc(c, 'svc_authorize_preview', { p_actor: c.user.id, p_document: id }));
  const bytes = await c.deps.store.get(r.storage_key).catch(() => null);
  if (!bytes) { await recordEvent(c, id, 'document.preview', 'error', { stage: 'storage' }); throw apiError('unavailable'); }
  if (bytes.length !== Number(r.size_bytes) || (await sha256Hex(bytes)) !== r.sha256) {
    await recordEvent(c, id, 'document.preview', 'error', { stage: 'integrity' });
    throw apiError('internal', 'Integrity check failed; file not delivered.');
  }
  assertOk(await rpc(c, 'svc_record_document_delivery', {
    p_actor: c.user.id, p_document: id, p_action: 'document.preview', p_version: r.version,
  }));
  const disposition = contentDisposition(r.original_filename).replace(/^attachment;/, 'inline;');
  const h = new Headers({
    'Content-Type': r.mime_type,
    'Content-Disposition': disposition,
    'Content-Length': String(bytes.length),
    'X-Content-SHA256': r.sha256,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': 'no-store',
  });
  return new Response(bytes as unknown as BodyInit, { status: 200, headers: h });
});

// ---------------- document-get ----------------
export const getHandler = (deps: Deps) => wrap(deps, ['GET'], async (c) => {
  const id = uuid(new URL(c.req.url).searchParams.get('id'), 'id');
  const r = assertOk(await rpc(c, 'svc_get_document', { p_actor: c.user.id, p_document: id }));
  return json({ document: r.document, my_access: r.my_access, permissions: r.permissions, versions: r.versions }, 200, c.requestId);
});

// ---------------- document-edit (JSON = metadata, multipart = replace content) ----------------
export const editHandler = (deps: Deps) => wrap(deps, ['POST'], async (c) => {
  const ct = (c.req.headers.get('content-type') ?? '').toLowerCase();
  if (ct.startsWith('multipart/form-data')) {
    // Authorise BEFORE reading the body; commit re-authorises under a row lock.
    // The document id is in the query string so it is known before the body is read.
    const id = uuid(new URL(c.req.url).searchParams.get('id'), 'id');
    const pre = assertOk(await rpc(c, 'svc_authorize_edit', { p_actor: c.user.id, p_document: id }));
    const form = await readMultipart(c);
    const file = await readFile(form, c.deps.config.maxUploadBytes);
    const key = `${pre.owner_id}/${id}/${crypto.randomUUID()}`;
    await c.deps.store.put(key, file.bytes, file.mime);
    let res;
    try {
      res = await rpc(c, 'svc_commit_replace', {
        p_actor: c.user.id, p_document: id, p_storage_key: key, p_filename: file.filename,
        p_mime: file.mime, p_size: file.size, p_sha256: file.sha,
      });
    } catch (e) { await discard(c, id, key); throw e; }
    if (!res?.ok) await discard(c, id, key);
    assertOk(res);
    return json({ document: res.document }, 200, c.requestId);
  }
  const b = await jsonBody(c.req);
  const id = uuid(b.document_id, 'document_id');
  const res = assertOk(await rpc(c, 'svc_update_metadata', {
    p_actor: c.user.id, p_document: id,
    p_title: str(b.title, 'title', 1, 200, true), p_description: str(b.description, 'description', 0, 2000, true),
    p_category: category(b.category),
  }));
  return json({ document: res.document }, 200, c.requestId);
});

// ---------------- document-delete ----------------
export const deleteHandler = (deps: Deps) => wrap(deps, ['POST'], async (c) => {
  const id = uuid((await jsonBody(c.req)).document_id, 'document_id');
  const r = assertOk(await rpc(c, 'svc_delete_document', { p_actor: c.user.id, p_document: id }));
  // Access is already gone (committed). Now purge the bytes.
  const keys: string[] = r.storage_keys ?? [];
  const failed = await c.deps.store.remove(keys).catch(() => keys);
  await recordEvent(c, id, 'document.purge', failed.length ? 'error' : 'success', { objects: keys.length, failed: failed.length });
  return json({ deleted: true, purge: failed.length ? 'incomplete' : 'completed' }, 200, c.requestId);
});

// ---------------- document-share (grant / revoke) ----------------
export const shareHandler = (deps: Deps) => wrap(deps, ['POST'], async (c) => {
  const b = await jsonBody(c.req);
  if (b.action === 'search_recipients') {
    const r = assertOk(await rpc(c, 'svc_search_share_recipients', { p_actor: c.user.id, p_query: str(b.query, 'query', 3, 100) }));
    return json({ recipients: r.recipients }, 200, c.requestId);
  }
  const id = uuid(b.document_id, 'document_id');
  if (b.action === 'grant') {
    if (b.permission !== 'read' && b.permission !== 'edit') throw apiError('invalid_request', 'permission must be read or edit.');
    const r = assertOk(await rpc(c, 'svc_grant_access', {
      p_actor: c.user.id, p_document: id, p_grantee_email: str(b.grantee_email, 'grantee_email', 3, 320), p_permission: b.permission,
    }));
    return json({ permission: r.permission, grantee: r.grantee, change: r.change }, 200, c.requestId);
  }
  if (b.action === 'revoke') {
    const r = assertOk(await rpc(c, 'svc_revoke_access', { p_actor: c.user.id, p_document: id, p_grantee: uuid(b.grantee_id, 'grantee_id') }));
    return json({ revoked: true, permission_id: r.permission_id }, 200, c.requestId);
  }
  if (b.action === 'set_visibility') {
    if (typeof b.is_global !== 'boolean') throw apiError('invalid_request', 'is_global must be a boolean.');
    const r = assertOk(await rpc(c, 'svc_set_document_visibility', { p_actor: c.user.id, p_document: id, p_is_global: b.is_global }));
    return json({ document: r.document }, 200, c.requestId);
  }
  throw apiError('invalid_request', 'action must be grant, revoke, or set_visibility.');
});

// ---------------- admin-audit-query (read-only) ----------------
export const auditQueryHandler = (deps: Deps) => wrap(deps, ['POST'], async (c) => {
  const b = await jsonBody(c.req);
  const f = (b.filters ?? {}) as Record<string, unknown>;
  const opt = (v: unknown, fn: (x: unknown) => string) => (v === undefined || v === null || v === '' ? null : fn(v));
  const date = (v: unknown) => { const d = new Date(String(v)); if (isNaN(+d)) throw apiError('invalid_request', 'Invalid date.'); return d.toISOString(); };
  const limit = Math.min(Math.max(Number(b.limit ?? 25) | 0, 1), 100);
  const offset = Math.max(Number(b.offset ?? 0) | 0, 0);
  const r = assertOk(await rpc(c, 'svc_admin_query_audit', {
    p_actor: c.user.id,
    p_f_actor: opt(f.actor_id, (v) => uuid(v, 'actor_id')), p_f_document: opt(f.document_id, (v) => uuid(v, 'document_id')),
    p_f_action: opt(f.action, (v) => str(v, 'action', 1, 64)!), p_f_outcome: opt(f.outcome, (v) => str(v, 'outcome', 1, 16)!),
    p_from: opt(f.from, date), p_to: opt(f.to, date), p_limit: limit, p_offset: offset,
  }));
  const out: Record<string, unknown> = { events: r.events, total: r.total, head: r.head };
  if (b.verify_chain === true) {
    const v = assertOk(await rpc(c, 'svc_verify_audit_chain', { p_actor: c.user.id }));
    out.chain = { valid: v.valid, checked: v.checked, first_broken_seq: v.first_broken_seq, head_matches: v.head_matches };
  }
  return json(out, 200, c.requestId);
});

// ---------------- admin-set-role ----------------
export const setRoleHandler = (deps: Deps) => wrap(deps, ['POST'], async (c) => {
  const b = await jsonBody(c.req);
  if (b.role !== 'owner' && b.role !== 'viewer') throw apiError('invalid_request', 'role must be owner or viewer.');
  const r = assertOk(await rpc(c, 'svc_admin_set_role', { p_actor: c.user.id, p_target: uuid(b.user_id, 'user_id'), p_role: b.role }));
  return json({ user: r.user }, 200, c.requestId);
});
