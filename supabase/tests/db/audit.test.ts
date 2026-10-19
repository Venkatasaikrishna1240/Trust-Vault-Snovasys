import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asUser, createDoc, download, grant, makeCast, pool, revoke, sha256Hex, svc,
  type Cast,
} from './helpers';

describe('audit trail integrity, concurrency and revocation timing', () => {
  let c: Cast;
  beforeAll(async () => {
    c = await makeCast();
  });
  afterAll(async () => {
    await pool.end();
  });

  const rid = () => randomUUID();
  const verify = () => svc('svc_verify_audit_chain', [c.admin.id, rid()]);

  // -------------------------------------------------------------------------
  describe('hash chain', () => {
    it('is valid for the whole table and the head matches the last event', async () => {
      const d = await createDoc(c.owner.id);
      await download(c.owner, d);
      await download(c.stranger, d);
      const v = await verify();
      expect(v.ok).toBe(true);
      expect(v.valid).toBe(true);
      expect(v.head_matches).toBe(true);
      expect(v.first_broken_seq).toBeNull();
      expect(v.checked).toBeGreaterThan(2);
    });

    it('only admins can run the verification (and a denied attempt is audited)', async () => {
      expect(await svc('svc_verify_audit_chain', [c.owner.id, rid()])).toEqual({ ok: false, code: 'forbidden' });
      const r = await pool.query(`select outcome from public.audit_events where actor_id = $1 and action = 'admin.audit_verify'`, [c.owner.id]);
      expect(r.rows).toEqual([{ outcome: 'denied' }]);
    });

    it('seq is gap-free and each event links to the previous hash', async () => {
      const r = await pool.query(`
        select count(*)::int as n,
               count(*) filter (where prev_hash is distinct from lag_hash)::int as bad_links,
               count(*) filter (where seq is distinct from lag_seq + 1)::int as bad_seq
          from (select seq, prev_hash, lag(event_hash) over (order by seq) as lag_hash,
                       lag(seq) over (order by seq) as lag_seq
                  from public.audit_events) x
         where lag_seq is not null`);
      expect(r.rows[0].bad_links).toBe(0);
      expect(r.rows[0].bad_seq).toBe(0);
    });

    it('callers cannot choose seq or hashes: values supplied on insert are overwritten', async () => {
      // Even a superuser INSERT cannot plant a forged hash: the trigger recomputes it.
      const before = await pool.query(`select last_seq from public.audit_chain_head`);
      const forged = await pool.query(
        `insert into public.audit_events (seq, actor_id, action, outcome, request_id, prev_hash, event_hash)
         values (1, null, 'test.forged', 'success', $1, 'forged', 'forged') returning seq, prev_hash, event_hash`, [rid()]);
      expect(Number(forged.rows[0].seq)).toBe(Number(before.rows[0].last_seq) + 1);
      expect(forged.rows[0].prev_hash).not.toBe('forged');
      expect(forged.rows[0].event_hash).toMatch(/^[0-9a-f]{64}$/);
      expect((await verify()).valid).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe('append-only', () => {
    it('UPDATE, DELETE and TRUNCATE are rejected even for a superuser (without disabling triggers)', async () => {
      await expect(pool.query(`update public.audit_events set outcome = 'success'`)).rejects.toThrow(/append-only/);
      await expect(pool.query(`delete from public.audit_events`)).rejects.toThrow(/append-only/);
      await expect(pool.query(`truncate public.audit_events`)).rejects.toThrow(/append-only/);
    });
  });

  // -------------------------------------------------------------------------
  describe('tamper evidence (each scenario runs in a rolled-back transaction)', () => {
    async function inTamperTxn<T>(tamper: (q: (sql: string, p?: unknown[]) => Promise<any>) => Promise<void>): Promise<any> {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query(`alter table public.audit_events disable trigger audit_events_no_update_delete`);
        await client.query(`alter table public.audit_events disable trigger audit_events_no_truncate`);
        await tamper((sql, p) => client.query(sql, p as any[]));
        const r = await client.query(`select public.svc_verify_audit_chain($1,$2) as r`, [c.admin.id, rid()]);
        return r.rows[0].r;
      } finally {
        await client.query('rollback');
        client.release();
      }
    }

    beforeAll(async () => {
      for (let i = 0; i < 3; i++) await createDoc(c.owner.id);
    });

    it('detects an edited event', async () => {
      const res = await inTamperTxn(async (q) => {
        await q(`update public.audit_events set details = '{"tampered":true}'::jsonb
                  where seq = (select max(seq) - 1 from public.audit_events)`);
      });
      expect(res.valid).toBe(false);
      expect(res.first_broken_seq).not.toBeNull();
    });

    it('detects a deleted event (gap in seq / broken link)', async () => {
      const res = await inTamperTxn(async (q) => {
        await q(`delete from public.audit_events where seq = (select max(seq) - 2 from public.audit_events)`);
      });
      expect(res.valid).toBe(false);
    });

    it('detects removal of the newest events (head no longer matches)', async () => {
      const res = await inTamperTxn(async (q) => {
        await q(`delete from public.audit_events where seq = (select max(seq) from public.audit_events)`);
      });
      expect(res.valid).toBe(false);
      expect(res.head_matches).toBe(false);
    });

    it('detects an edited actor (the "who" is part of the hash)', async () => {
      const res = await inTamperTxn(async (q) => {
        const r = await q(`update public.audit_events set actor_id = gen_random_uuid()
                  where seq = (select max(seq) from public.audit_events where actor_id is not null)`);
        expect(r.rowCount).toBe(1); // make sure the tamper really happened
      });
      expect(res.valid).toBe(false);
    });

    it('detects an edited outcome (denied -> success)', async () => {
      const res = await inTamperTxn(async (q) => {
        const r = await q(`update public.audit_events set outcome = 'success'
                  where seq = (select max(seq) from public.audit_events where outcome = 'denied')`);
        expect(r.rowCount).toBe(1);
      });
      expect(res.valid).toBe(false);
    });

    it('KNOWN LIMITATION: a privileged rewrite that recomputes the whole chain is NOT detected', async () => {
      // This test documents (rather than hides) what a hash chain stored in the
      // same database cannot do. Mitigation: periodically copy the head hash
      // (admin-audit-query returns it) to storage the DB admin cannot modify.
      const res = await inTamperTxn(async (q) => {
        await q(`update public.audit_events set details = '{"rewritten":true}'::jsonb
                  where seq = (select max(seq) - 1 from public.audit_events)`);
        await q(`
          do $$
          declare r record; prev text := repeat('0', 64); h text;
          begin
            for r in select * from public.audit_events order by seq loop
              h := app.audit_event_hash(r.seq, prev, r.occurred_at, r.actor_id, r.document_id,
                                        r.action, r.outcome, r.request_id, r.details);
              update public.audit_events set prev_hash = prev, event_hash = h where seq = r.seq;
              prev := h;
            end loop;
            update public.audit_chain_head set last_hash = prev
             where id = 1;
          end $$`);
      });
      expect(res.valid).toBe(true); // undetected — hence the documented residual risk
    });
  });

  // -------------------------------------------------------------------------
  describe('concurrency', () => {
    it('parallel audit writes keep the chain valid and gap-free', async () => {
      const d = await createDoc(c.owner.id);
      await Promise.all(Array.from({ length: 25 }, (_, i) => download(i % 2 ? c.owner : c.stranger, d)));
      const v = await verify();
      expect(v.valid).toBe(true);
    });

    it('parallel grants for the same user leave exactly one active grant and no errors', async () => {
      const d = await createDoc(c.owner.id);
      const results = await Promise.all(
        Array.from({ length: 12 }, (_, i) => grant(c.owner, d, c.viewer, i % 2 ? 'read' : 'edit')),
      );
      expect(results.every((r) => r.ok)).toBe(true);
      const active = await pool.query(`select count(*)::int as n from public.document_permissions where document_id = $1 and user_id = $2 and revoked_at is null`, [d.id, c.viewer.id]);
      expect(active.rows[0].n).toBe(1);
    });

    it('parallel grant + revoke never leaves an orphaned or duplicate active grant', async () => {
      const d = await createDoc(c.owner.id);
      await grant(c.owner, d, c.editor, 'read');
      await Promise.all([
        ...Array.from({ length: 6 }, () => grant(c.owner, d, c.editor, 'edit')),
        ...Array.from({ length: 6 }, () => revoke(c.owner, d, c.editor)),
      ]);
      const active = await pool.query(`select count(*)::int as n from public.document_permissions where document_id = $1 and user_id = $2 and revoked_at is null`, [d.id, c.editor.id]);
      expect(active.rows[0].n).toBeLessThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  describe('exactly when revocation takes effect', () => {
    it('a request authorised BEFORE the revoking transaction commits may complete; the next one is denied', async () => {
      const d = await createDoc(c.owner.id);
      await grant(c.owner, d, c.viewer, 'read');

      const revoker = await pool.connect();
      try {
        await revoker.query('begin');
        // The revoking UPDATE has run but is NOT yet committed. (Done by hand here:
        // the real svc_revoke_access is a single short transaction, so this
        // intermediate state is exactly the in-flight window we want to observe.)
        const upd = await revoker.query(
          `update public.document_permissions set revoked_at = now(), revoked_by = $2
            where document_id = $1 and user_id = $3 and revoked_at is null`,
          [d.id, c.owner.id, c.viewer.id],
        );
        expect(upd.rowCount).toBe(1);

        // READ COMMITTED: a concurrent request still sees the old, committed grant => allowed.
        // This is the documented in-flight window; those bytes may still be delivered.
        const during = await download(c.viewer, d);
        expect(during.ok).toBe(true);

        await revoker.query('commit');
      } finally {
        revoker.release();
      }

      // After the commit, every NEW request is denied.
      expect(await download(c.viewer, d)).toEqual({ ok: false, code: 'not_found' });
      expect(await svc('svc_get_document', [c.viewer.id, d.id, rid()])).toEqual({ ok: false, code: 'not_found' });
      const rls = await asUser(c.viewer.id, (s) => s.query(`select id from public.documents where id = $1`, [d.id]));
      expect(rls.rows).toEqual([]);
    });

    it('a write that waits on the document lock re-checks access after the lock is granted', async () => {
      const d = await createDoc(c.owner.id);
      await grant(c.owner, d, c.editor, 'edit');

      const holder = await pool.connect();
      try {
        await holder.query('begin');
        await holder.query(`select 1 from public.documents where id = $1 for update`, [d.id]);
        // The editor's metadata edit starts and blocks on the row lock...
        const pending = svc('svc_update_metadata', [c.editor.id, d.id, 'late edit', null, null, rid()]);
        await new Promise((r) => setTimeout(r, 300));
        // ...meanwhile the revocation commits (it also needs the lock, so do it manually here):
        await holder.query(
          `update public.document_permissions set revoked_at = now(), revoked_by = $2 where document_id = $1 and revoked_at is null`,
          [d.id, c.owner.id],
        );
        await holder.query('commit');
        const res = await pending;
        expect(res).toEqual({ ok: false, code: 'not_found' }); // edit refused after the lock was acquired
      } finally {
        holder.release();
      }
      const t = await pool.query(`select title from public.documents where id = $1`, [d.id]);
      expect(t.rows[0].title).not.toBe('late edit');
    });
  });

  // -------------------------------------------------------------------------
  describe('who can read which audit rows (RLS)', () => {
    it('forged-actor attempts: a user can only ever see events attributed to themselves or to their own documents', async () => {
      const d = await createDoc(c.owner.id);
      await download(c.stranger, d); // stranger's denied attempt
      const seenByStranger = await asUser(c.stranger.id, (s) => s.query(`select actor_id, document_id from public.audit_events`));
      expect(seenByStranger.rows.every((x) => x.actor_id === c.stranger.id)).toBe(true);
      const seenByOwner = await asUser(c.owner.id, (s) => s.query(`select actor_id, outcome from public.audit_events where document_id = $1`, [d.id]));
      expect(seenByOwner.rows.some((x) => x.actor_id === c.stranger.id && x.outcome === 'denied')).toBe(true);
      const seenByOwner2 = await asUser(c.owner2.id, (s) => s.query(`select 1 from public.audit_events where document_id = $1`, [d.id]));
      expect(seenByOwner2.rows).toEqual([]);
    });

    it('uploads record hash and size (integrity metadata) but never content', async () => {
      const id = randomUUID();
      const key = `${c.owner.id}/${id}/${randomUUID()}`;
      await svc('svc_create_document', [c.owner.id, id, 'T', '', 'general', 'f.pdf', key, 'application/pdf', 42, sha256Hex('zzz'), rid()]);
      const r = await pool.query(`select details from public.audit_events where document_id = $1 and action = 'document.upload'`, [id]);
      expect(Object.keys(r.rows[0].details).sort()).toEqual(['category', 'mime_type', 'sha256', 'size_bytes']);
    });
  });
});
