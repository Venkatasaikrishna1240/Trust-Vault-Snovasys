import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asAnon, asUser, asService, expectDenied, makeCast, createDoc, grant, revoke, pool, svc, withRole,
  type Cast, type Doc,
} from './helpers';

/**
 * Direct data-API level tests: what each kind of caller can read or write
 * when they bypass the UI and the Edge Functions entirely.
 */
describe('RLS and privileges (direct database / Data API access)', () => {
  let c: Cast;
  let ownerDoc: Doc; // owned by owner, read-shared with viewer, edit-shared with editor
  let owner2Doc: Doc; // owned by owner2, shared with nobody

  beforeAll(async () => {
    c = await makeCast();
    ownerDoc = await createDoc(c.owner.id, 'Salary letter — Priya Raman');
    owner2Doc = await createDoc(c.owner2.id, 'Drawing 77 — Reactor housing', 'technical_drawing');
    expect((await grant(c.owner, ownerDoc, c.viewer, 'read')).ok).toBe(true);
    expect((await grant(c.owner, ownerDoc, c.editor, 'edit')).ok).toBe(true);
  });

  afterAll(async () => {
    await pool.end();
  });

  // -------------------------------------------------------------------------
  describe('unauthenticated (anon) callers', () => {
    for (const table of ['profiles', 'documents', 'document_versions', 'document_permissions', 'audit_events', 'audit_chain_head']) {
      it(`cannot read ${table}`, async () => {
        const msg = await expectDenied(asAnon((s) => s.query(`select * from public.${table}`)));
        expect(msg).toMatch(/permission denied/i);
      });
    }

    it('cannot call search_documents or dashboard_stats', async () => {
      expect(await expectDenied(asAnon((s) => s.query(`select * from public.search_documents()`)))).toMatch(/permission denied/i);
      expect(await expectDenied(asAnon((s) => s.query(`select * from public.dashboard_stats()`)))).toMatch(/permission denied/i);
    });

    it('cannot call any svc_* function', async () => {
      const msg = await expectDenied(
        asAnon((s) => s.query(`select public.svc_authorize_download($1,$2,null,$3)`, [c.owner.id, ownerDoc.id, randomUUID()])),
      );
      expect(msg).toMatch(/permission denied/i);
    });
  });

  // -------------------------------------------------------------------------
  describe('cross-user reads (IDOR through the Data API)', () => {
    it('owner sees their own document, not the other owner\'s', async () => {
      const r = await asUser(c.owner.id, (s) => s.query(`select id from public.documents order by id`));
      const ids = r.rows.map((x) => x.id);
      expect(ids).toContain(ownerDoc.id);
      expect(ids).not.toContain(owner2Doc.id);
    });

    it('a stranger sees no documents at all', async () => {
      const r = await asUser(c.stranger.id, (s) => s.query(`select id from public.documents`));
      expect(r.rows).toEqual([]);
    });

    it('an owner can publish to signed-in users and turn visibility off again', async () => {
      const d = await createDoc(c.owner.id, 'Authenticated-wide visibility');
      expect((await asUser(c.stranger.id, (s) => s.query(`select id from public.documents where id = $1`, [d.id]))).rows).toEqual([]);
      expect((await svc('svc_set_document_visibility', [c.owner.id, d.id, true, randomUUID()])).ok).toBe(true);
      const visible = await asUser(c.stranger.id, (s) => s.query(`select id from public.documents where id = $1`, [d.id]));
      expect(visible.rows).toEqual([{ id: d.id }]);
      expect((await svc('svc_set_document_visibility', [c.owner.id, d.id, false, randomUUID()])).ok).toBe(true);
      expect((await asUser(c.stranger.id, (s) => s.query(`select id from public.documents where id = $1`, [d.id]))).rows).toEqual([]);
      expect((await asAnon((s) => s.query(`select id from public.documents where id = $1`, [d.id]))).rows).toEqual([]);
    });

    it('guessing a document id returns nothing (same as a non-existent id)', async () => {
      const real = await asUser(c.stranger.id, (s) => s.query(`select id, title from public.documents where id = $1`, [ownerDoc.id]));
      const fake = await asUser(c.stranger.id, (s) => s.query(`select id, title from public.documents where id = $1`, [randomUUID()]));
      expect(real.rows).toEqual([]);
      expect(fake.rows).toEqual(real.rows);
    });

    it('read-grant and edit-grant holders can see the document', async () => {
      for (const u of [c.viewer, c.editor]) {
        const r = await asUser(u.id, (s) => s.query(`select id from public.documents where id = $1`, [ownerDoc.id]));
        expect(r.rows).toHaveLength(1);
      }
    });

    it('a grant on one document does not expose another document of the same owner', async () => {
      const other = await createDoc(c.owner.id, 'Owner second doc');
      const r = await asUser(c.viewer.id, (s) => s.query(`select id from public.documents where id = $1`, [other.id]));
      expect(r.rows).toEqual([]);
    });

    it('administrators do NOT get document metadata just because they are admins', async () => {
      const r = await asUser(c.admin.id, (s) => s.query(`select id from public.documents`));
      expect(r.rows).toEqual([]);
    });

    it('clients cannot select the internal storage_key column', async () => {
      const msg = await expectDenied(asUser(c.owner.id, (s) => s.query(`select storage_key from public.documents`)));
      expect(msg).toMatch(/permission denied/i);
      const msg2 = await expectDenied(asUser(c.owner.id, (s) => s.query(`select * from public.documents`)));
      expect(msg2).toMatch(/permission denied/i);
    });

    it('document_versions never exposes storage keys either', async () => {
      const msg = await expectDenied(asUser(c.owner.id, (s) => s.query(`select storage_key from public.document_versions`)));
      expect(msg).toMatch(/permission denied/i);
    });

    it('revoked users lose metadata visibility immediately', async () => {
      const d = await createDoc(c.owner.id, 'Revocation visibility');
      await grant(c.owner, d, c.viewer, 'read');
      const before = await asUser(c.viewer.id, (s) => s.query(`select id from public.documents where id = $1`, [d.id]));
      expect(before.rows).toHaveLength(1);
      expect((await revoke(c.owner, d, c.viewer)).ok).toBe(true);
      const after = await asUser(c.viewer.id, (s) => s.query(`select id from public.documents where id = $1`, [d.id]));
      expect(after.rows).toEqual([]);
    });

    it('soft-deleted documents are invisible even to the former owner', async () => {
      const d = await createDoc(c.owner.id, 'To be deleted');
      expect((await svc('svc_delete_document', [c.owner.id, d.id, randomUUID()])).ok).toBe(true);
      const r = await asUser(c.owner.id, (s) => s.query(`select id from public.documents where id = $1`, [d.id]));
      expect(r.rows).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  describe('permission grants are private', () => {
    it('owner sees the grants on their document', async () => {
      const r = await asUser(c.owner.id, (s) => s.query(`select user_id from public.document_permissions where document_id = $1`, [ownerDoc.id]));
      expect(r.rows.map((x) => x.user_id).sort()).toEqual([c.viewer.id, c.editor.id].sort());
    });

    it('a grantee sees only their own grant, not other people\'s', async () => {
      const r = await asUser(c.viewer.id, (s) => s.query(`select user_id from public.document_permissions where document_id = $1`, [ownerDoc.id]));
      expect(r.rows.map((x) => x.user_id)).toEqual([c.viewer.id]);
    });

    it('a stranger and a second owner see no grants of someone else\'s document', async () => {
      for (const u of [c.stranger, c.owner2]) {
        const r = await asUser(u.id, (s) => s.query(`select * from public.document_permissions where document_id = $1`, [ownerDoc.id]));
        expect(r.rows).toEqual([]);
      }
    });
  });

  // -------------------------------------------------------------------------
  describe('clients cannot write (every write goes through svc_* functions)', () => {
    const attempts: Array<[string, string, () => unknown[]]> = [
      ['insert into documents',
        `insert into public.documents (owner_id,title,original_filename,storage_key,mime_type,size_bytes,sha256)
         values ($1,'x','x.pdf','k','application/pdf',1,repeat('a',64))`, () => [c.owner.id]],
      ['update documents', `update public.documents set title = 'pwned' where id = $1`, () => [ownerDoc.id]],
      ['delete documents', `delete from public.documents where id = $1`, () => [ownerDoc.id]],
      ['insert into document_permissions',
        `insert into public.document_permissions (document_id,user_id,permission,granted_by) values ($1,$2,'edit',$3)`,
        () => [ownerDoc.id, c.stranger.id, c.owner.id]],
      ['update document_permissions', `update public.document_permissions set revoked_at = null`, () => []],
      ['delete document_permissions', `delete from public.document_permissions`, () => []],
      ['insert into audit_events',
        `insert into public.audit_events (actor_id,action,outcome,request_id) values ($1,'document.download','success',$2)`,
        () => [c.admin.id, randomUUID()]],
      ['update audit_events', `update public.audit_events set outcome = 'success'`, () => []],
      ['delete audit_events', `delete from public.audit_events`, () => []],
      ['truncate audit_events', `truncate public.audit_events`, () => []],
      ['insert into document_versions',
        `insert into public.document_versions (document_id,version,storage_key,original_filename,mime_type,size_bytes,sha256,created_by)
         values ($1,99,'k2','x','application/pdf',1,repeat('a',64),$2)`, () => [ownerDoc.id, c.owner.id]],
    ];

    for (const role of ['owner', 'editor', 'stranger', 'admin'] as const) {
      for (const [label, sql, args] of attempts) {
        it(`${role}: ${label} is denied`, async () => {
          const msg = await expectDenied(asUser(c[role].id, (s) => s.query(sql, args())));
          expect(msg).toMatch(/permission denied|row-level security|append-only/i);
        });
      }
    }

    it('no document row was changed by any of the attempts above', async () => {
      const r = await pool.query(`select title, deleted_at from public.documents where id = $1`, [ownerDoc.id]);
      expect(r.rows[0].title).toBe('Salary letter — Priya Raman');
      expect(r.rows[0].deleted_at).toBeNull();
    });

    it('service_role cannot write audit_events directly either (only app.write_audit can)', async () => {
      const msg = await expectDenied(
        asService((s) => s.query(`insert into public.audit_events (actor_id,action,outcome,request_id) values (null,'x.y','success',$1)`, [randomUUID()])),
      );
      expect(msg).toMatch(/permission denied/i);
    });
  });

  // -------------------------------------------------------------------------
  describe('privilege escalation through profiles', () => {
    it('a user cannot promote themselves (column privilege)', async () => {
      const msg = await expectDenied(asUser(c.stranger.id, (s) => s.query(`update public.profiles set role = 'admin' where id = $1`, [c.stranger.id])));
      expect(msg).toMatch(/permission denied/i);
      const role = await pool.query(`select role from public.profiles where id = $1`, [c.stranger.id]);
      expect(role.rows[0].role).toBe('viewer');
    });

    it('a user cannot change their e-mail or id either', async () => {
      expect(await expectDenied(asUser(c.stranger.id, (s) => s.query(`update public.profiles set email = 'x@y.z' where id = $1`, [c.stranger.id])))).toMatch(/permission denied/i);
      expect(await expectDenied(asUser(c.stranger.id, (s) => s.query(`update public.profiles set id = gen_random_uuid() where id = $1`, [c.stranger.id])))).toMatch(/permission denied/i);
    });

    it('the guard trigger blocks a role change even if a column grant were added by mistake', async () => {
      // Simulate a future misconfiguration inside a rolled-back transaction.
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query(`grant update (role) on public.profiles to authenticated`);
        await client.query(`set local role authenticated`);
        await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: c.stranger.id, role: 'authenticated' })]);
        await expect(client.query(`update public.profiles set role = 'admin' where id = $1`, [c.stranger.id])).rejects.toThrow(/cannot be changed by clients/);
      } finally {
        await client.query('rollback');
        client.release();
      }
    });

    it('a user can change their own display name, but not someone else\'s', async () => {
      const mine = await asUser(c.stranger.id, (s) => s.query(`update public.profiles set display_name = 'New Name' where id = $1 returning display_name`, [c.stranger.id]));
      expect(mine.rows[0].display_name).toBe('New Name');
      const theirs = await asUser(c.stranger.id, (s) => s.query(`update public.profiles set display_name = 'Hacked' where id = $1 returning id`, [c.owner.id]));
      expect(theirs.rows).toEqual([]);
    });

    it('signing up with role metadata does not grant a role', async () => {
      const id = randomUUID();
      await pool.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3)`, [
        id, `evil-${id.slice(0, 6)}@trustvault.test`, JSON.stringify({ role: 'admin', user_role: 'admin', display_name: 'Evil' }),
      ]);
      const r = await pool.query(`select role from public.profiles where id = $1`, [id]);
      expect(r.rows[0].role).toBe('viewer');
    });

    it('JWT claims claiming an admin role do not make someone an admin', async () => {
      const r = await withRole('authenticated', c.stranger.id, async (s) => {
        await s.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ sub: c.stranger.id, role: 'authenticated', app_role: 'admin', user_metadata: { role: 'admin' } }),
        ]);
        return s.query(`select count(*)::int as n from public.profiles`);
      });
      expect(r.rows[0].n).toBe(1); // still only their own profile
    });

    it('profiles: strangers cannot enumerate users; admins can', async () => {
      const stranger = await asUser(c.stranger.id, (s) => s.query(`select id from public.profiles`));
      expect(stranger.rows.map((x) => x.id)).toEqual([c.stranger.id]);
      const admin = await asUser(c.admin.id, (s) => s.query(`select id from public.profiles`));
      expect(admin.rows.length).toBeGreaterThanOrEqual(6);
    });

    it('people who share a document can see each other\'s name; unrelated users cannot', async () => {
      const viewerSeesOwner = await asUser(c.viewer.id, (s) => s.query(`select id from public.profiles where id = $1`, [c.owner.id]));
      expect(viewerSeesOwner.rows).toHaveLength(1);
      const strangerSeesOwner = await asUser(c.stranger.id, (s) => s.query(`select id from public.profiles where id = $1`, [c.owner.id]));
      expect(strangerSeesOwner.rows).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  describe('audit_events visibility', () => {
    it('administrators can read the audit trail (read-only)', async () => {
      const r = await asUser(c.admin.id, (s) => s.query(`select count(*)::int as n from public.audit_events`));
      expect(r.rows[0].n).toBeGreaterThan(0);
    });

    it('an owner sees events on their own documents but not on other owners\' documents', async () => {
      const r = await asUser(c.owner.id, (s) => s.query(`select distinct document_id from public.audit_events where document_id is not null`));
      const ids = r.rows.map((x) => x.document_id);
      expect(ids).toContain(ownerDoc.id);
      expect(ids).not.toContain(owner2Doc.id);
    });

    it('a stranger sees none of the events about other people\'s documents', async () => {
      const r = await asUser(c.stranger.id, (s) => s.query(`select document_id from public.audit_events where document_id in ($1,$2)`, [ownerDoc.id, owner2Doc.id]));
      expect(r.rows).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  describe('search and dashboard do not leak', () => {
    it('search returns only documents the caller may read', async () => {
      const own = await asUser(c.owner.id, (s) => s.query(`select title from public.search_documents()`));
      expect(own.rows.map((x) => x.title)).toContain('Salary letter — Priya Raman');
      expect(own.rows.map((x) => x.title)).not.toContain('Drawing 77 — Reactor housing');
    });

    it('a stranger searching for a confidential title (or with wildcards) gets nothing', async () => {
      for (const q of ['Salary', 'Priya', '%', '_', '%%', 'Drawing 77', "' OR 1=1 --"]) {
        const r = await asUser(c.stranger.id, (s) => s.query(`select * from public.search_documents($1)`, [q]));
        expect(r.rows, `query ${q}`).toEqual([]);
      }
    });

    it('LIKE wildcards in the query are escaped (no accidental match-all)', async () => {
      const r = await asUser(c.owner.id, (s) => s.query(`select title from public.search_documents('%')`));
      expect(r.rows).toEqual([]); // no title literally contains a percent sign
    });

    it('search by owner and category respects visibility', async () => {
      const byOwner = await asUser(c.viewer.id, (s) => s.query(`select id from public.search_documents(p_owner => $1)`, [c.owner.email.split('@')[0]]));
      expect(byOwner.rows.map((x) => x.id)).toContain(ownerDoc.id);
      const strangerByOwner = await asUser(c.stranger.id, (s) => s.query(`select id from public.search_documents(p_owner => $1)`, [c.owner.email.split('@')[0]]));
      expect(strangerByOwner.rows).toEqual([]);
      const byCategory = await asUser(c.stranger.id, (s) => s.query(`select id from public.search_documents(p_category => 'technical_drawing')`));
      expect(byCategory.rows).toEqual([]);
    });

    it('search supports scope and date filters and pagination metadata', async () => {
      const shared = await asUser(c.viewer.id, (s) => s.query(`select id, my_access, total_count from public.search_documents(p_scope => 'shared')`));
      expect(shared.rows.every((x) => x.my_access !== 'owner')).toBe(true);
      const future = await asUser(c.owner.id, (s) => s.query(`select id from public.search_documents(p_from => now() + interval '1 day')`));
      expect(future.rows).toEqual([]);
      const paged = await asUser(c.owner.id, (s) => s.query(`select id, total_count from public.search_documents(p_limit => 1, p_offset => 0)`));
      expect(paged.rows).toHaveLength(1);
      expect(Number(paged.rows[0].total_count)).toBeGreaterThanOrEqual(1);
    });

    it('dashboard counts only count accessible documents', async () => {
      const stranger = await asUser(c.stranger.id, (s) => s.query(`select * from public.dashboard_stats()`));
      expect(Number(stranger.rows[0].owned_count)).toBe(0);
      expect(Number(stranger.rows[0].shared_count)).toBe(0);
      const viewer = await asUser(c.viewer.id, (s) => s.query(`select * from public.dashboard_stats()`));
      expect(Number(viewer.rows[0].owned_count)).toBe(0);
      expect(Number(viewer.rows[0].shared_count)).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  describe('function exposure audit (static check of the privilege model)', () => {
    it('no SECURITY DEFINER function in schema public is executable by anon or authenticated', async () => {
      const r = await pool.query(`
        select p.oid::regprocedure::text as fn,
               has_function_privilege('anon', p.oid, 'execute')          as anon_exec,
               has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.prosecdef`);
      expect(r.rows.length).toBeGreaterThan(10);
      const leaky = r.rows.filter((x) => x.anon_exec || x.auth_exec);
      expect(leaky, `exposed definer functions: ${JSON.stringify(leaky)}`).toEqual([]);
    });

    it('every svc_* function is executable by service_role only', async () => {
      const r = await pool.query(`
        select p.proname,
               has_function_privilege('service_role', p.oid, 'execute') as svc,
               has_function_privilege('anon', p.oid, 'execute')          as anon_exec,
               has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname like 'svc\\_%'`);
      expect(r.rows.length).toBeGreaterThanOrEqual(14);
      for (const row of r.rows) {
        expect(row.svc, row.proname).toBe(true);
        expect(row.anon_exec || row.auth_exec, row.proname).toBe(false);
      }
    });

    it('the only public functions callable by clients are the two RLS-respecting read helpers', async () => {
      const r = await pool.query(`
        select p.proname, p.prosecdef
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.prokind = 'f'
           and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
           and p.proname not like 'pg\\_%'`);
      const names = r.rows.map((x) => x.proname).sort();
      expect(names).toEqual(['dashboard_stats', 'search_documents']);
      expect(r.rows.every((x) => x.prosecdef === false)).toBe(true); // SECURITY INVOKER => RLS applies
    });

    it('clients cannot call internal app.* helpers that take an arbitrary actor id', async () => {
      for (const sql of [
        `select app.access_level($1, $2)`,
        `select app.actor_role($1)`,
        `select app.write_audit($1, null, 'document.download', 'success', gen_random_uuid(), '{}')`,
      ]) {
        const msg = await expectDenied(asUser(c.stranger.id, (s) => s.query(sql, sql.includes('$2') ? [c.owner.id, ownerDoc.id] : [c.owner.id])));
        expect(msg, sql).toMatch(/permission denied/i);
      }
    });

    it('every table in schema public has RLS enabled', async () => {
      const r = await pool.query(`
        select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
      expect(r.rows).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  describe('Storage: private bucket, no client access', () => {
    it('the documents bucket is private with size and MIME limits', async () => {
      const r = await pool.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'documents'`);
      expect(r.rows[0].public).toBe(false);
      expect(Number(r.rows[0].file_size_limit)).toBe(10485760);
      expect(r.rows[0].allowed_mime_types.sort()).toEqual(['application/pdf', 'image/jpeg', 'image/png']);
    });

    async function seedObject(): Promise<string> {
      const name = `${c.owner.id}/${randomUUID()}/${randomUUID()}`;
      await pool.query(`insert into storage.objects (bucket_id, name, owner) values ('documents', $1, $2)`, [name, c.owner.id]);
      return name;
    }

    it('anon and authenticated cannot read, insert, update or delete objects in the bucket', async () => {
      const key = await seedObject();
      for (const actor of [c.owner, c.viewer, c.stranger, c.admin]) {
        const sel = await asUser(actor.id, (s) => s.query(`select name from storage.objects where bucket_id = 'documents'`));
        expect(sel.rows, 'select as authenticated').toEqual([]);
        expect(await expectDenied(asUser(actor.id, (s) => s.query(`insert into storage.objects (bucket_id, name, owner) values ('documents', $1, $2)`, [`${actor.id}/x/y`, actor.id])))).toMatch(/row-level security/i);
        const upd = await asUser(actor.id, (s) => s.query(`update storage.objects set name = name || 'x' where name = $1 returning name`, [key]));
        expect(upd.rows).toEqual([]);
        const del = await asUser(actor.id, (s) => s.query(`delete from storage.objects where name = $1 returning name`, [key]));
        expect(del.rows).toEqual([]);
      }
      const anonSel = await asAnon((s) => s.query(`select name from storage.objects where bucket_id = 'documents'`));
      expect(anonSel.rows).toEqual([]);
      const still = await pool.query(`select 1 from storage.objects where name = $1`, [key]);
      expect(still.rowCount).toBe(1); // object untouched
    });

    it('guessing a storage key does not help: reading by exact name still returns nothing', async () => {
      const key = await seedObject();
      const r = await asUser(c.stranger.id, (s) => s.query(`select name from storage.objects where bucket_id = 'documents' and name = $1`, [key]));
      expect(r.rows).toEqual([]);
    });

    it('the restrictive policy keeps the bucket closed even if a broad permissive policy is added later', async () => {
      const key = await seedObject();
      const client = await pool.connect();
      try {
        await client.query('begin');
        // A future developer adds an over-broad policy for some other feature...
        await client.query(`create policy oops_all_authenticated on storage.objects for all to authenticated using (true) with check (true)`);
        await client.query(`set local role authenticated`);
        await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: c.stranger.id, role: 'authenticated' })]);
        const sel = await client.query(`select name from storage.objects where bucket_id = 'documents' and name = $1`, [key]);
        expect(sel.rows).toEqual([]); // ...and the documents bucket is STILL closed
        await client.query('savepoint before_denied_insert'); // a denied statement aborts the txn otherwise
        await expect(client.query(`insert into storage.objects (bucket_id, name, owner) values ('documents', 'a/b/c', $1)`, [c.stranger.id])).rejects.toThrow(/row-level security/i);
        await client.query('rollback to savepoint before_denied_insert');

        // Other buckets are unaffected by the restrictive policy.
        await client.query(`reset role`);
        await client.query(`insert into storage.buckets (id, name) values ('avatars', 'avatars')`);
        await client.query(`insert into storage.objects (bucket_id, name) values ('avatars', 'pic.png')`);
        await client.query(`set local role authenticated`);
        const other = await client.query(`select name from storage.objects where bucket_id = 'avatars'`);
        expect(other.rows).toHaveLength(1);
      } finally {
        await client.query('rollback');
        client.release();
      }
    });
  });
});
