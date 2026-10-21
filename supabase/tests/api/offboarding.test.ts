import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

const BASE = process.env.TV_BASE_URL ?? 'http://127.0.0.1:54331';
const db = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/trustvault_test',
  max: 2,
});

const mint = async (sub: string) => (await (await fetch(`${BASE}/__harness/mint`, {
  method: 'POST',
  body: JSON.stringify({ sub, role: 'authenticated', aud: 'authenticated' }),
})).text());

interface User { id: string; email: string; token: string }
async function user(role: 'admin' | 'owner' | 'viewer'): Promise<User> {
  const id = randomUUID();
  const email = `${role}-${id.slice(0, 8)}@trustvault.test`;
  await db.query('insert into auth.users (id,email) values ($1,$2)', [id, email]);
  if (role !== 'viewer') await db.query('update public.profiles set role=$2 where id=$1', [id, role]);
  return { id, email, token: await mint(id) };
}

const fn = (name: string, actor: User, init: RequestInit = {}) =>
  fetch(`${BASE}/functions/v1/${name}`, {
    ...init,
    headers: { authorization: `******`, ...(init.headers as object) },
  });
const getDocument = (actor: User, documentId: string) =>
  fetch(`${BASE}/functions/v1/document-get?id=${documentId}`, {
    headers: { authorization: `******` },
  });
const rest = (path: string, actor: User, init: RequestInit = {}) =>
  fetch(`${BASE}/rest/v1/${path}`, {
    ...init,
    headers: {
      authorization: `******`,
      'content-type': 'application/json',
      ...(init.headers as object),
    },
  });
const post = (name: string, actor: User, body: unknown) =>
  fn(name, actor, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<<>>\n%%EOF\n');
async function upload(owner: User) {
  const form = new FormData();
  form.set('file', new File([PDF], 'retained.pdf', { type: 'application/pdf' }));
  form.set('title', 'Offboarding retention test');
  form.set('category', 'general');
  form.set('is_global', 'false');
  const response = await fn('document-upload', owner, { method: 'POST', body: form });
  expect(response.status).toBe(201);
  return (await response.json()).data.document as { id: string; title: string };
}
const share = (owner: User, documentId: string, grantee: User) =>
  post('document-share', owner, {
    action: 'grant', document_id: documentId, grantee_email: grantee.email, permission: 'read',
  });
let admin: User;
let ordinary: User;
beforeAll(async () => {
  [admin, ordinary] = await Promise.all([user('admin'), user('owner')]);
});

describe('employee offboarding API', () => {
  it('rejects a non-admin direct invocation and leaves the target active', async () => {
    const target = await user('viewer');
    const response = await post('admin-users', ordinary, { action: 'deactivate', user_id: target.id });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('forbidden');
    const result = await db.query('select is_active from public.profiles where id=$1', [target.id]);
    expect(result.rows[0].is_active).toBe(true);
  });

  it('blocks stale sessions, revokes incoming grants, and retains documents', async () => {
    const target = await user('viewer');
    const document = await upload(admin);
    expect((await share(admin, document.id, target)).status).toBe(200);
    expect((await getDocument(target, document.id)).status).toBe(200);

    const deactivated = await post('admin-users', admin, { action: 'deactivate', user_id: target.id });
    expect(deactivated.status).toBe(200);
    const authBan = await fetch(`${BASE}/__harness/auth-state?user_id=${target.id}`);
    expect((await authBan.json()).banned).toBe(true);
    const state = await db.query('select is_active from public.profiles where id=$1', [target.id]);
    expect(state.rows[0].is_active).toBe(false);

    const staleAccess = await getDocument(target, document.id);
    expect(staleAccess.status).not.toBe(200);
    expect(await staleAccess.text()).not.toContain(document.title);
    const grantState = await db.query(
      'select revoked_at from public.document_permissions where document_id=$1 and user_id=$2',
      [document.id, target.id],
    );
    expect(grantState.rows[0].revoked_at).not.toBeNull();
    const deniedGrant = await share(admin, document.id, target);
    expect(deniedGrant.status).toBe(409);
    expect((await deniedGrant.json()).error.message).toContain('inactive');
    const ownProfile = await rest(`profiles?select=is_active&id=eq.${target.id}`, target);
    expect((await ownProfile.json())[0].is_active).toBe(false);
    const protectedRows = await rest('documents?select=id', target);
    expect(await protectedRows.json()).toEqual([]);
    const notificationRead = await rest('rpc/mark_notifications_read', target, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expect([401, 403]).toContain(notificationRead.status);
    const statusEdit = await rest(`profiles?id=eq.${target.id}`, target, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: true }),
      headers: { Prefer: 'return=representation' },
    });
    expect([401, 403]).toContain(statusEdit.status);

    const ownerAccess = await getDocument(admin, document.id);
    expect(ownerAccess.status).toBe(200);

    expect((await post('admin-users', admin, { action: 'reactivate', user_id: target.id })).status).toBe(200);
    const authUnban = await fetch(`${BASE}/__harness/auth-state?user_id=${target.id}`);
    expect((await authUnban.json()).banned).toBe(false);
    const staleGrantAccess = await getDocument(target, document.id);
    expect(staleGrantAccess.status).not.toBe(200);
    expect((await share(admin, document.id, target)).status).toBe(200);
    const newGrantAccess = await getDocument(target, document.id);
    expect(newGrantAccess.status).toBe(200);
  });

  it('blocks permanent removal while owned documents remain', async () => {
    const target = await user('owner');
    await upload(target);
    expect((await post('admin-users', admin, { action: 'deactivate', user_id: target.id })).status).toBe(200);
    const removal = await post('admin-users', admin, { action: 'remove', user_id: target.id });
    expect(removal.status).toBe(409);
    expect((await removal.json()).error.message).toContain('owned document');
    const retained = await db.query('select count(*)::int as n from public.documents where owner_id=$1', [target.id]);
    expect(retained.rows[0].n).toBeGreaterThan(0);
  });

  it('completes removal idempotently and retains the offboarding audit entry', async () => {
    const target = await user('viewer');
    expect((await post('admin-users', admin, { action: 'deactivate', user_id: target.id })).status).toBe(200);
    const first = await post('admin-users', admin, { action: 'remove', user_id: target.id });
    expect(first.status).toBe(200);
    expect((await first.json()).data.status).toBe('removed');

    const repeated = await post('admin-users', admin, { action: 'remove', user_id: target.id });
    expect(repeated.status).toBe(200);
    expect((await repeated.json()).data.already_removed).toBe(true);

    const authUser = await db.query('select id from auth.users where id=$1', [target.id]);
    expect(authUser.rowCount).toBe(0);
    const audit = await db.query(
      `select outcome, details->>'target_email' as target_email from public.audit_events
        where actor_id=$1 and action='admin.account_removal'
          and details->>'target_id'=$2`,
      [admin.id, target.id],
    );
    expect(audit.rows.some((row) => row.outcome === 'success' && row.target_email === target.email)).toBe(true);
  });

  it('keeps a partial Auth deletion failure retryable without corrupting account state', async () => {
    const target = await user('viewer');
    expect((await post('admin-users', admin, { action: 'deactivate', user_id: target.id })).status).toBe(200);
    await fetch(`${BASE}/__harness/fail-next-auth-delete`, {
      method: 'POST',
      body: JSON.stringify({ user_id: target.id }),
    });

    const failed = await post('admin-users', admin, { action: 'remove', user_id: target.id });
    expect(failed.status).toBe(503);
    const pending = await db.query(
      'select status from public.account_offboarding where user_id=$1',
      [target.id],
    );
    expect(pending.rows[0].status).toBe('removal_pending');
    expect((await db.query('select id from auth.users where id=$1', [target.id])).rowCount).toBe(1);

    const retry = await post('admin-users', admin, { action: 'remove', user_id: target.id });
    expect(retry.status).toBe(200);
    expect((await db.query('select id from auth.users where id=$1', [target.id])).rowCount).toBe(0);
    const outcomes = await db.query(
      `select outcome from public.audit_events
        where actor_id=$1 and action='admin.account_removal'
          and details->>'target_id'=$2`,
      [admin.id, target.id],
    );
    expect(outcomes.rows.map((row) => row.outcome)).toContain('error');
    expect(outcomes.rows.map((row) => row.outcome)).toContain('success');
  });
});
