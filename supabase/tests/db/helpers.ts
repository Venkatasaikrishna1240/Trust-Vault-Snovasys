import { randomUUID } from 'node:crypto';
import pg from 'pg';

/**
 * Database test helpers.
 *
 * `asUser()` reproduces what PostgREST does for every API request:
 *     SET LOCAL ROLE <anon|authenticated>;
 *     set_config('request.jwt.claims', '<claims json>', true);
 * so RLS, column privileges and function privileges are evaluated exactly as
 * they are for a real client call.
 */

export const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/trustvault_test';

export const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });

export type Role = 'anon' | 'authenticated' | 'service_role';

export interface Session {
  query: <T extends pg.QueryResultRow = any>(sql: string, params?: unknown[]) => Promise<pg.QueryResult<T>>;
}

/** Run `fn` inside a transaction as the given API role / user. Always rolls back unless commit=true. */
export async function withRole<T>(
  role: Role,
  userId: string | null,
  fn: (s: Session) => Promise<T>,
  opts: { commit?: boolean } = {},
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`set local role ${role}`);
    const claims = userId ? { sub: userId, role } : { role };
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    const result = await fn({ query: (sql, params) => client.query(sql, params as any[]) });
    await client.query(opts.commit ? 'commit' : 'rollback');
    return result;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export const asAnon = <T>(fn: (s: Session) => Promise<T>) => withRole('anon', null, fn);
export const asUser = <T>(userId: string, fn: (s: Session) => Promise<T>) =>
  withRole('authenticated', userId, fn);

/** Trusted server path: what an Edge Function does with the service-role key. Commits. */
export const asService = <T>(fn: (s: Session) => Promise<T>) =>
  withRole('service_role', null, fn, { commit: true });

/** Expect a query to fail; returns the error message so tests can assert on it. */
export async function expectDenied(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return String((e as Error).message);
  }
  throw new Error('expected the statement to be denied, but it succeeded');
}

// ---------------------------------------------------------------------------
// Fixtures — every test group makes its own users, so tests never depend on
// each other and the per-actor throttle never leaks between groups.
// ---------------------------------------------------------------------------
export type AppRole = 'admin' | 'owner' | 'viewer';

export interface TestUser {
  id: string;
  email: string;
}

export async function makeUser(role: AppRole, label = role): Promise<TestUser> {
  const id = randomUUID();
  const email = `${label}-${id.slice(0, 8)}@trustvault.test`;
  await pool.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
    id,
    email,
    JSON.stringify({ display_name: `${label} ${id.slice(0, 4)}` }),
  ]);
  // Trusted provisioning: direct SQL as the project owner (what the docs describe).
  if (role !== 'viewer') {
    await pool.query(`update public.profiles set role = $2 where id = $1`, [id, role]);
  }
  return { id, email };
}

export interface Cast {
  admin: TestUser;
  owner: TestUser;
  owner2: TestUser;
  viewer: TestUser; // gets read grants in tests
  editor: TestUser; // gets edit grants in tests
  stranger: TestUser; // never granted anything
}

export async function makeCast(): Promise<Cast> {
  return {
    admin: await makeUser('admin'),
    owner: await makeUser('owner', 'owner'),
    owner2: await makeUser('owner', 'owner2'),
    viewer: await makeUser('viewer', 'viewer'),
    editor: await makeUser('viewer', 'editor'),
    stranger: await makeUser('viewer', 'stranger'),
  };
}

export function sha256Hex(seed: string): string {
  // Any 64-hex string satisfies the CHECK; derive one from the seed deterministically.
  let h = '';
  for (let i = 0; i < 64; i++) h += ((seed.charCodeAt(i % seed.length) + i * 7) % 16).toString(16);
  return h;
}

export interface Doc {
  id: string;
  storageKey: string;
  title: string;
}

/** Create a document through the real trusted path (svc_authorize_upload + svc_create_document). */
export async function createDoc(
  ownerId: string,
  title = `Confidential ${randomUUID().slice(0, 6)}`,
  category = 'contract',
): Promise<Doc> {
  const id = randomUUID();
  const storageKey = `${ownerId}/${id}/${randomUUID()}`;
  const res = await svc('svc_create_document', [
    ownerId, id, title, 'secret description', category, 'file.pdf', storageKey,
    'application/pdf', 1234, sha256Hex(id), randomUUID(),
  ]);
  if (!res.ok) throw new Error(`createDoc failed: ${JSON.stringify(res)}`);
  return { id, storageKey, title };
}

/** Call a svc_* function as service_role and return its jsonb result. */
export async function svc(fn: string, args: unknown[]): Promise<any> {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(', ');
  const r = await asService((s) => s.query(`select public.${fn}(${placeholders}) as r`, args));
  return r.rows[0].r;
}

export async function grant(
  owner: TestUser, doc: Doc, grantee: TestUser, permission: 'read' | 'edit',
): Promise<any> {
  return svc('svc_grant_access', [owner.id, doc.id, grantee.email, permission, randomUUID()]);
}

export async function revoke(owner: TestUser, doc: Doc, grantee: TestUser): Promise<any> {
  return svc('svc_revoke_access', [owner.id, doc.id, grantee.id, randomUUID()]);
}

export async function download(actor: TestUser, doc: Doc, version: number | null = null): Promise<any> {
  return svc('svc_authorize_download', [actor.id, doc.id, version, randomUUID()]);
}

/** Audit rows for a document, read as superuser (test oracle only). */
export async function auditFor(documentId: string) {
  const r = await pool.query(
    `select seq, actor_id, action, outcome, details from public.audit_events
      where document_id = $1 order by seq`,
    [documentId],
  );
  return r.rows as Array<{ seq: string; actor_id: string | null; action: string; outcome: string; details: any }>;
}
