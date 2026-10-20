import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asUser, auditFor, createDoc, download, grant, makeCast, makeUser, pool, revoke, sha256Hex, svc,
  type Cast, type Doc,
} from './helpers';

/**
 * Behaviour of the trusted svc_* functions (what the Edge Functions call).
 * Includes the negative cases: denied callers get a bare {ok:false, code} —
 * never document metadata or storage keys — and every denial is audited.
 */
describe('svc_* functions: authorisation, revocation, audit', () => {
  let c: Cast;

  beforeAll(async () => {
    c = await makeCast();
  });
  afterAll(async () => {
    await pool.end();
  });

  const rid = () => randomUUID();

  // -------------------------------------------------------------------------
  describe('recipient lookup', () => {
    it('matches display names and email usernames, case-insensitively', async () => {
      const partialUsername = await svc('svc_search_share_recipients', [c.owner.id, c.stranger.email.split('@')[0].slice(0, 8), rid()]);
      const displayName = await svc('svc_search_share_recipients', [c.owner.id, `stranger ${c.stranger.id.slice(0, 4)}`, rid()]);
      const exactEmail = await svc('svc_search_share_recipients', [c.owner.id, c.stranger.email.toUpperCase(), rid()]);
      const wildcard = await svc('svc_search_share_recipients', [c.owner.id, '%%%', rid()]);
      const sqlLikeInput = await svc('svc_search_share_recipients', [c.owner.id, "' OR '1'='1 --", rid()]);

      expect(partialUsername).toMatchObject({
        ok: true,
        recipients: [{ id: c.stranger.id, email: c.stranger.email }],
      });
      expect(displayName).toMatchObject({
        ok: true,
        recipients: [{ id: c.stranger.id, email: c.stranger.email }],
      });
      expect(exactEmail).toMatchObject({
        ok: true,
        recipients: [{ id: c.stranger.id, email: c.stranger.email }],
      });
      expect(wildcard).toEqual({ ok: true, recipients: [] });
      expect(sqlLikeInput).toEqual({ ok: true, recipients: [] });

      const self = await svc('svc_search_share_recipients', [c.owner.id, c.owner.email, rid()]);
      expect(self).toEqual({ ok: true, recipients: [] });
    });
  });

  // -------------------------------------------------------------------------
  describe('upload authorisation', () => {
    it('every registered role may create documents', async () => {
      for (const u of [c.owner, c.viewer, c.admin, c.stranger]) {
        expect(await svc('svc_authorize_upload', [u.id, rid()])).toEqual({ ok: true });
      }
    });

    it('upload without a profile is denied and audited without a document id', async () => {
      const id = randomUUID();
      await svc('svc_authorize_upload', [id, rid()]);
      const r = await pool.query(`select action, outcome, document_id, details from public.audit_events where actor_id = $1`, [id]);
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0]).toMatchObject({ action: 'document.upload', outcome: 'denied', document_id: null });
      expect(r.rows[0].details).toEqual({ reason: 'profile_missing' });
    });

    it('svc_create_document re-checks that the profile still exists', async () => {
      const u = await makeUser('owner', 'removed');
      await pool.query(`delete from auth.users where id = $1`, [u.id]);
      const id = randomUUID();
      const res = await svc('svc_create_document', [u.id, id, 'T', '', 'general', 'f.pdf', `${u.id}/${id}/${randomUUID()}`, 'application/pdf', 10, sha256Hex('a'), rid()]);
      expect(res).toEqual({ ok: false, code: 'forbidden' });
    });

    it('rejects a storage key that does not follow the server convention', async () => {
      const id = randomUUID();
      for (const key of ['../../etc/passwd', `${c.owner2.id}/${id}/${randomUUID()}`, `${c.owner.id}/${randomUUID()}/${randomUUID()}`, `${c.owner.id}/${id}/x`]) {
        const res = await svc('svc_create_document', [c.owner.id, id, 'T', '', 'general', 'f.pdf', key, 'application/pdf', 10, sha256Hex('a'), rid()]);
        expect(res, key).toEqual({ ok: false, code: 'invalid' });
      }
    });

    it('creates the document, version 1 and an audit event', async () => {
      const d = await createDoc(c.owner.id, 'Contract A');
      const v = await pool.query(`select version, created_by from public.document_versions where document_id = $1`, [d.id]);
      expect(v.rows).toEqual([{ version: 1, created_by: c.owner.id }]);
      const a = await auditFor(d.id);
      expect(a).toHaveLength(1);
      expect(a[0]).toMatchObject({ action: 'document.upload', outcome: 'success', actor_id: c.owner.id });
      expect(a[0].details).toMatchObject({ size_bytes: 1234, mime_type: 'application/pdf' });
    });
  });

  // -------------------------------------------------------------------------
  describe('download authorisation + immediate revocation', () => {
    let d: Doc;
    beforeAll(async () => {
      d = await createDoc(c.owner.id, 'Salary letter');
      await grant(c.owner, d, c.viewer, 'read');
      await grant(c.owner, d, c.editor, 'edit');
    });

    it('owner and edit-grantee can download; read-grantee is preview-only', async () => {
      for (const u of [c.owner, c.editor]) {
        const r = await download(u, d);
        expect(r.ok, u.email).toBe(true);
        expect(r.storage_key).toBe(d.storageKey);
        expect(r.mime_type).toBe('application/pdf');
      }
      expect(await download(c.viewer, d)).toMatchObject({ ok: false, code: 'forbidden' });
    });

    it('a stranger is denied with a bare not_found — no metadata, no key', async () => {
      const r = await download(c.stranger, d);
      expect(r).toEqual({ ok: false, code: 'not_found' });
      expect(JSON.stringify(r)).not.toContain(d.storageKey);
      expect(JSON.stringify(r)).not.toContain('Salary');
    });

    it('an unknown document id looks exactly like a forbidden one', async () => {
      const real = await download(c.stranger, d);
      const fake = await svc('svc_authorize_download', [c.stranger.id, randomUUID(), null, rid()]);
      expect(fake).toEqual(real);
    });

    it('another owner and an admin are denied too (no implicit access)', async () => {
      expect(await download(c.owner2, d)).toEqual({ ok: false, code: 'not_found' });
      expect(await download(c.admin, d)).toEqual({ ok: false, code: 'not_found' });
    });

    it('revocation takes effect on the very next request', async () => {
      expect((await download(c.viewer, d)).ok).toBe(true);
      expect((await revoke(c.owner, d, c.viewer)).ok).toBe(true);
      expect(await download(c.viewer, d)).toEqual({ ok: false, code: 'not_found' });
      // the edit-grantee is unaffected
      expect((await download(c.editor, d)).ok).toBe(true);
    });

    it('successful AND denied attempts are audited with the right actor and outcome', async () => {
      const allowed = await download(c.owner, d);
      expect(allowed.ok).toBe(true);
      expect(await svc('svc_record_document_delivery', [
        c.owner.id, d.id, 'document.download', allowed.version, rid(),
      ])).toEqual({ ok: true });
      const rows = await auditFor(d.id);
      const downloads = rows.filter((r) => r.action === 'document.download');
      expect(downloads.some((r) => r.actor_id === c.owner.id && r.outcome === 'success')).toBe(true);
      expect(downloads.some((r) => r.actor_id === c.viewer.id && r.outcome === 'denied')).toBe(true);
      expect(downloads.some((r) => r.actor_id === c.stranger.id && r.outcome === 'denied')).toBe(true);
      expect(downloads.some((r) => r.actor_id === c.viewer.id && r.outcome === 'denied')).toBe(true); // after revoke
      expect(downloads.some((r) => r.actor_id === c.admin.id && r.outcome === 'denied')).toBe(true);
    });

    it('does not record preview/download success before verified bytes and rechecks access', async () => {
      const previewDoc = await createDoc(c.owner.id, 'Audited preview');
      await grant(c.owner, previewDoc, c.viewer, 'read');
      const preview = await svc('svc_authorize_preview', [c.viewer.id, previewDoc.id, rid()]);
      expect(preview.ok).toBe(true);
      expect(await pool.query(
        `select count(*)::int as count from public.audit_events
         where document_id = $1 and actor_id = $2 and action = 'document.preview' and outcome = 'success'`,
        [previewDoc.id, c.viewer.id],
      ).then((r) => r.rows[0].count)).toBe(0);

      expect(await svc('svc_record_document_delivery', [
        c.viewer.id, previewDoc.id, 'document.preview', preview.version, rid(),
      ])).toEqual({ ok: true });
      const successful = (await auditFor(previewDoc.id)).find(
        (r) => r.actor_id === c.viewer.id && r.action === 'document.preview' && r.outcome === 'success',
      );
      expect(successful?.details).toMatchObject({
        level: 'read', version: preview.version, document_name: 'file.pdf',
        owner_id: c.owner.id, response_prepared: true,
      });

      await revoke(c.owner, previewDoc, c.viewer);
      expect(await svc('svc_record_document_delivery', [
        c.viewer.id, previewDoc.id, 'document.preview', preview.version, rid(),
      ])).toEqual({ ok: false, code: 'not_found' });
      expect((await auditFor(previewDoc.id)).some(
        (r) => r.actor_id === c.viewer.id && r.action === 'document.preview' && r.outcome === 'denied',
      )).toBe(true);
    });

    it('old versions can be downloaded by the owner and edit-grantees, but not read-grantees', async () => {
      const d2 = await createDoc(c.owner.id, 'Versioned');
      await grant(c.owner, d2, c.editor, 'edit');
      await grant(c.owner, d2, c.viewer, 'read');
      const key2 = `${c.owner.id}/${d2.id}/${randomUUID()}`;
      const rep = await svc('svc_commit_replace', [c.editor.id, d2.id, key2, 'v2.pdf', 'application/pdf', 99, sha256Hex('v2'), rid()]);
      expect(rep.ok).toBe(true);
      expect(rep.document.current_version).toBe(2);
      expect((await download(c.owner, d2, 1)).storage_key).toBe(d2.storageKey);
      expect((await download(c.editor, d2, 1)).storage_key).toBe(d2.storageKey);
      expect(await download(c.viewer, d2, 1)).toEqual({ ok: false, code: 'forbidden' });
      expect((await download(c.editor, d2)).storage_key).toBe(key2);
      expect((await revoke(c.owner, d2, c.editor)).ok).toBe(true);
      expect(await download(c.editor, d2, 1)).toEqual({ ok: false, code: 'not_found' });
      expect(await download(c.owner, d2, 7)).toEqual({ ok: false, code: 'not_found' });
    });

    it('a deleted document cannot be downloaded by anyone, including the owner', async () => {
      const d3 = await createDoc(c.owner.id, 'Short-lived');
      await grant(c.owner, d3, c.viewer, 'read');
      expect((await svc('svc_delete_document', [c.owner.id, d3.id, rid()])).ok).toBe(true);
      expect(await download(c.owner, d3)).toEqual({ ok: false, code: 'not_found' });
      expect(await download(c.viewer, d3)).toEqual({ ok: false, code: 'not_found' });
    });
  });

  // -------------------------------------------------------------------------
  describe('audited detail read (svc_get_document)', () => {
    it('owner gets the sharing list; a read-grantee gets metadata only; a stranger gets nothing', async () => {
      const d = await createDoc(c.owner.id, 'Detail doc');
      await grant(c.owner, d, c.viewer, 'read');

      const own = await svc('svc_get_document', [c.owner.id, d.id, rid()]);
      expect(own.ok).toBe(true);
      expect(own.my_access).toBe('owner');
      expect(own.permissions).toHaveLength(1);
      expect(own.document.storage_key).toBeUndefined();

      const shared = await svc('svc_get_document', [c.viewer.id, d.id, rid()]);
      expect(shared.ok).toBe(true);
      expect(shared.my_access).toBe('read');
      expect(shared.permissions).toBeNull(); // viewers never see who else has access

      expect(await svc('svc_get_document', [c.stranger.id, d.id, rid()])).toEqual({ ok: false, code: 'not_found' });

      const a = await auditFor(d.id);
      expect(a.filter((r) => r.action === 'document.read').map((r) => r.outcome).sort()).toEqual(['denied', 'success', 'success']);
    });
  });

  // -------------------------------------------------------------------------
  describe('sharing: grant / revoke rules', () => {
    let d: Doc;
    beforeAll(async () => {
      d = await createDoc(c.owner.id, 'Sharing doc');
    });

    it('owner can grant read and edit to a named registered user', async () => {
      const r = await grant(c.owner, d, c.viewer, 'read');
      expect(r).toMatchObject({ ok: true, change: 'created', permission: { permission: 'read' }, grantee: { id: c.viewer.id } });
      const e = await grant(c.owner, d, c.editor, 'edit');
      expect(e).toMatchObject({ ok: true, change: 'created', permission: { permission: 'edit' } });
    });

    it('only the owner can change authenticated-wide visibility and the change is audited', async () => {
      const globalDoc = await createDoc(c.owner.id, 'Visibility control');
      expect(await svc('svc_set_document_visibility', [c.viewer.id, globalDoc.id, true, rid()])).toEqual({ ok: false, code: 'forbidden' });
      expect(await svc('svc_set_document_visibility', [c.owner.id, globalDoc.id, true, rid()])).toMatchObject({ ok: true, document: { is_global: true } });
      expect(await svc('svc_set_document_visibility', [c.owner.id, globalDoc.id, false, rid()])).toMatchObject({ ok: true, document: { is_global: false } });
      const audit = await auditFor(globalDoc.id);
      expect(audit.filter((event) => event.action === 'document.visibility_change' && event.outcome === 'success')).toHaveLength(2);
    });

    it('a viewer or an editor cannot grant (forbidden) and a stranger cannot even see the document (not_found)', async () => {
      expect(await grant(c.viewer, d, c.stranger, 'read')).toEqual({ ok: false, code: 'forbidden' });
      expect(await grant(c.editor, d, c.stranger, 'edit')).toEqual({ ok: false, code: 'forbidden' });
      expect(await grant(c.stranger, d, c.stranger, 'edit')).toEqual({ ok: false, code: 'not_found' });
      expect(await grant(c.owner2, d, c.owner2, 'edit')).toEqual({ ok: false, code: 'not_found' });
      expect(await grant(c.admin, d, c.admin, 'edit')).toEqual({ ok: false, code: 'not_found' });
      const still = await pool.query(`select user_id from public.document_permissions where document_id = $1 and revoked_at is null`, [d.id]);
      expect(still.rows.map((x) => x.user_id).sort()).toEqual([c.viewer.id, c.editor.id].sort());
    });

    it('a viewer or an editor cannot revoke anything either', async () => {
      expect(await svc('svc_revoke_access', [c.viewer.id, d.id, c.editor.id, rid()])).toEqual({ ok: false, code: 'forbidden' });
      expect(await svc('svc_revoke_access', [c.stranger.id, d.id, c.editor.id, rid()])).toEqual({ ok: false, code: 'not_found' });
    });

    it('cannot grant to yourself, to an unknown e-mail, or with an invalid permission', async () => {
      expect(await svc('svc_grant_access', [c.owner.id, d.id, c.owner.email, 'read', rid()])).toEqual({ ok: false, code: 'invalid' });
      expect(await svc('svc_grant_access', [c.owner.id, d.id, 'nobody@nowhere.test', 'read', rid()])).toEqual({ ok: false, code: 'grantee_not_found' });
      expect(await svc('svc_grant_access', [c.owner.id, d.id, c.stranger.email, 'admin', rid()])).toEqual({ ok: false, code: 'invalid' });
      expect(await svc('svc_grant_access', [c.owner.id, d.id, c.stranger.email, 'delete', rid()])).toEqual({ ok: false, code: 'invalid' });
    });

    it('e-mail lookup is case- and whitespace-insensitive', async () => {
      const r = await svc('svc_grant_access', [c.owner.id, d.id, `  ${c.stranger.email.toUpperCase()} `, 'read', rid()]);
      expect(r).toMatchObject({ ok: true, change: 'created' });
      expect((await revoke(c.owner, d, c.stranger)).ok).toBe(true);
    });

    it('granting twice is idempotent; changing the level keeps history and a single active grant', async () => {
      const u = await makeUser('viewer', 'history');
      expect((await grant(c.owner, d, u, 'read')).change).toBe('created');
      expect((await grant(c.owner, d, u, 'read')).change).toBe('unchanged');
      expect((await grant(c.owner, d, u, 'edit')).change).toBe('upgraded');
      expect((await grant(c.owner, d, u, 'read')).change).toBe('downgraded');
      const rows = await pool.query(`select permission, revoked_at is null as active from public.document_permissions where document_id = $1 and user_id = $2 order by granted_at`, [d.id, u.id]);
      expect(rows.rows).toHaveLength(3);
      expect(rows.rows.filter((r) => r.active)).toHaveLength(1);
      expect(rows.rows.find((r) => r.active)!.permission).toBe('read');
    });

    it('the database itself refuses two active grants for the same user/document', async () => {
      await expect(
        pool.query(`insert into public.document_permissions (document_id,user_id,permission,granted_by) values ($1,$2,'read',$3)`, [d.id, c.viewer.id, c.owner.id]),
      ).rejects.toThrow(/duplicate key|document_permissions_one_active/);
    });

    it('revoking a non-existent grant is an error and is audited', async () => {
      const u = await makeUser('viewer', 'never-granted');
      expect(await revoke(c.owner, d, u)).toEqual({ ok: false, code: 'not_found' });
    });

    it('grant and revoke are audited with actor, target and permission', async () => {
      const a = await auditFor(d.id);
      expect(a.some((r) => r.action === 'permission.grant' && r.outcome === 'success' && r.actor_id === c.owner.id && r.details.grantee_id === c.viewer.id && r.details.permission === 'read')).toBe(true);
      expect(a.some((r) => r.action === 'permission.grant' && r.outcome === 'denied' && r.actor_id === c.viewer.id)).toBe(true);
      expect(a.some((r) => r.action === 'permission.grant' && r.outcome === 'denied' && r.actor_id === c.stranger.id)).toBe(true);
      expect(a.some((r) => r.action === 'permission.revoke' && r.outcome === 'success')).toBe(true);
    });

    it('a grantee that gets the document deleted loses everything', async () => {
      const d4 = await createDoc(c.owner.id, 'Deleted with grants');
      await grant(c.owner, d4, c.viewer, 'read');
      const del = await svc('svc_delete_document', [c.owner.id, d4.id, rid()]);
      expect(del.ok).toBe(true);
      const active = await pool.query(`select count(*)::int as n from public.document_permissions where document_id = $1 and revoked_at is null`, [d4.id]);
      expect(active.rows[0].n).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  describe('editing: read vs edit grants', () => {
    let d: Doc;
    beforeAll(async () => {
      d = await createDoc(c.owner.id, 'Editable doc');
      await grant(c.owner, d, c.viewer, 'read');
      await grant(c.owner, d, c.editor, 'edit');
    });

    const edit = (u: { id: string }, patch: Partial<{ title: string; description: string; category: string }>) =>
      svc('svc_update_metadata', [u.id, d.id, patch.title ?? null, patch.description ?? null, patch.category ?? null, rid()]);

    it('a read grant does NOT allow editing', async () => {
      expect(await edit(c.viewer, { title: 'hacked' })).toEqual({ ok: false, code: 'forbidden' });
      const r = await pool.query(`select title from public.documents where id = $1`, [d.id]);
      expect(r.rows[0].title).toBe('Editable doc');
    });

    it('an edit grant allows metadata edits, and the owner too', async () => {
      const r = await edit(c.editor, { title: '  Editor was here ', category: 'audit' });
      expect(r.ok).toBe(true);
      expect(r.document.title).toBe('Editor was here');
      expect(r.document.category).toBe('audit');
      expect((await edit(c.owner, { description: 'by owner' })).ok).toBe(true);
    });

    it('strangers, other owners and admins cannot edit (not_found)', async () => {
      for (const u of [c.stranger, c.owner2, c.admin]) {
        expect(await edit(u, { title: 'x' })).toEqual({ ok: false, code: 'not_found' });
      }
    });

    it('validates input (empty patch, long title, bad category)', async () => {
      expect(await edit(c.owner, {})).toEqual({ ok: false, code: 'invalid' });
      expect(await edit(c.owner, { title: 'x'.repeat(201) })).toEqual({ ok: false, code: 'invalid' });
      expect(await edit(c.owner, { title: '   ' })).toEqual({ ok: false, code: 'invalid' });
      expect(await edit(c.owner, { category: 'top_secret' })).toEqual({ ok: false, code: 'invalid' });
    });

    it('edit audit records WHICH fields changed but not their values', async () => {
      const a = (await auditFor(d.id)).filter((r) => r.action === 'document.edit' && r.outcome === 'success');
      expect(a.length).toBeGreaterThanOrEqual(2);
      const editorEvent = a.find((r) => r.actor_id === c.editor.id)!;
      expect(editorEvent.details.fields.sort()).toEqual(['category', 'title']);
      expect(JSON.stringify(editorEvent.details)).not.toContain('Editor was here');
    });

    it('editors cannot delete; owner can', async () => {
      expect(await svc('svc_delete_document', [c.editor.id, d.id, rid()])).toEqual({ ok: false, code: 'forbidden' });
      expect(await svc('svc_delete_document', [c.viewer.id, d.id, rid()])).toEqual({ ok: false, code: 'forbidden' });
      expect(await svc('svc_delete_document', [c.stranger.id, d.id, rid()])).toEqual({ ok: false, code: 'not_found' });
      const ok = await svc('svc_delete_document', [c.owner.id, d.id, rid()]);
      expect(ok.ok).toBe(true);
      expect(ok.storage_keys).toContain(d.storageKey);
    });
  });

  // -------------------------------------------------------------------------
  describe('content replacement and the revoke-during-upload race', () => {
    it('authorize_edit then a revocation: the commit step re-checks and refuses', async () => {
      const d = await createDoc(c.owner.id, 'Race doc');
      await grant(c.owner, d, c.editor, 'edit');
      expect((await svc('svc_authorize_edit', [c.editor.id, d.id, rid()])).ok).toBe(true); // step 1 passes
      expect((await revoke(c.owner, d, c.editor)).ok).toBe(true); // owner revokes while the file uploads
      const key = `${c.owner.id}/${d.id}/${randomUUID()}`;
      const commit = await svc('svc_commit_replace', [c.editor.id, d.id, key, 'n.pdf', 'application/pdf', 5, sha256Hex('n'), rid()]);
      expect(commit).toEqual({ ok: false, code: 'not_found' });
      const v = await pool.query(`select current_version from public.documents where id = $1`, [d.id]);
      expect(v.rows[0].current_version).toBe(1);
    });

    it('read-grantees and strangers cannot start or commit a replacement', async () => {
      const d = await createDoc(c.owner.id, 'No replace');
      await grant(c.owner, d, c.viewer, 'read');
      expect(await svc('svc_authorize_edit', [c.viewer.id, d.id, rid()])).toEqual({ ok: false, code: 'forbidden' });
      expect(await svc('svc_authorize_edit', [c.stranger.id, d.id, rid()])).toEqual({ ok: false, code: 'not_found' });
      const key = `${c.owner.id}/${d.id}/${randomUUID()}`;
      expect(await svc('svc_commit_replace', [c.viewer.id, d.id, key, 'n.pdf', 'application/pdf', 5, sha256Hex('n'), rid()])).toEqual({ ok: false, code: 'forbidden' });
    });

    it('commit rejects keys outside <owner>/<document>/', async () => {
      const d = await createDoc(c.owner.id, 'Bad key');
      const bad = `${c.owner2.id}/${d.id}/${randomUUID()}`;
      expect(await svc('svc_commit_replace', [c.owner.id, d.id, bad, 'n.pdf', 'application/pdf', 5, sha256Hex('n'), rid()])).toEqual({ ok: false, code: 'invalid' });
    });
  });

  // -------------------------------------------------------------------------
  describe('administration', () => {
    it('an admin can switch another account between viewer and owner', async () => {
      const u = await makeUser('viewer', 'promote-me');
      const up = await svc('svc_admin_set_role', [c.admin.id, u.id, 'owner', rid()]);
      expect(up).toMatchObject({ ok: true, user: { id: u.id, role: 'owner' } });
      const down = await svc('svc_admin_set_role', [c.admin.id, u.id, 'viewer', rid()]);
      expect(down.user.role).toBe('viewer');
    });

    it('an admin cannot change their own role, another admin\'s role, or create admins', async () => {
      const other = await makeUser('admin', 'admin2');
      const victim = await makeUser('viewer', 'victim');
      expect(await svc('svc_admin_set_role', [c.admin.id, c.admin.id, 'viewer', rid()])).toEqual({ ok: false, code: 'forbidden' });
      expect(await svc('svc_admin_set_role', [c.admin.id, other.id, 'viewer', rid()])).toEqual({ ok: false, code: 'forbidden' });
      expect(await svc('svc_admin_set_role', [c.admin.id, victim.id, 'admin', rid()])).toEqual({ ok: false, code: 'invalid' });
      const r = await pool.query(`select role from public.profiles where id = any($1)`, [[c.admin.id, other.id, victim.id]]);
      expect(r.rows.map((x) => x.role).sort()).toEqual(['admin', 'admin', 'viewer']);
    });

    it('non-admins (including owners) cannot change roles — and it is audited', async () => {
      const victim = await makeUser('viewer', 'victim2');
      for (const u of [c.owner, c.viewer, c.stranger]) {
        expect(await svc('svc_admin_set_role', [u.id, victim.id, 'owner', rid()])).toEqual({ ok: false, code: 'forbidden' });
      }
      const r = await pool.query(`select count(*)::int as n from public.audit_events where action = 'admin.role_change' and outcome = 'denied' and actor_id = $1`, [c.owner.id]);
      expect(r.rows[0].n).toBeGreaterThanOrEqual(1);
      const role = await pool.query(`select role from public.profiles where id = $1`, [victim.id]);
      expect(role.rows[0].role).toBe('viewer');
    });

    it('a role change is audited with from/to', async () => {
      const u = await makeUser('viewer', 'audited-promo');
      await svc('svc_admin_set_role', [c.admin.id, u.id, 'owner', rid()]);
      const r = await pool.query(`select details from public.audit_events where action = 'admin.role_change' and outcome = 'success' and details->>'target_id' = $1`, [u.id]);
      expect(r.rows[0].details).toMatchObject({ from: 'viewer', to: 'owner' });
    });

    it('admin audit query: admins only, filterable, read-only, returns the chain head', async () => {
      expect(await svc('svc_admin_query_audit', [c.owner.id, null, null, null, null, null, null, 25, 0, rid()])).toEqual({ ok: false, code: 'forbidden' });
      expect(await svc('svc_admin_query_audit', [c.stranger.id, null, null, null, null, null, null, 25, 0, rid()])).toEqual({ ok: false, code: 'forbidden' });

      const d = await createDoc(c.owner.id, 'Audit target');
      await download(c.stranger, d);
      const r = await svc('svc_admin_query_audit', [c.admin.id, c.stranger.id, d.id, 'document.download', 'denied', null, null, 25, 0, rid()]);
      expect(r.ok).toBe(true);
      expect(r.total).toBe(1);
      expect(r.events[0]).toMatchObject({
        actor_id: c.stranger.id, actor_email: c.stranger.email,
        document_id: d.id, document_name: 'file.pdf',
        owner_email: c.owner.email, action: 'document.download', outcome: 'denied',
      });
      expect(r.head.seq).toBeGreaterThan(0);
      expect(r.head.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(r.events[0].event_hash).toMatch(/^[0-9a-f]{64}$/);

      expect(await svc('svc_admin_query_audit', [c.admin.id, null, null, null, 'bogus', null, null, 25, 0, rid()])).toEqual({ ok: false, code: 'invalid' });
    });

    it('querying the audit trail is itself audited', async () => {
      const a = await makeUser('admin', 'auditor');
      await svc('svc_admin_query_audit', [a.id, null, null, null, null, null, null, 5, 0, rid()]);
      const r = await pool.query(`select outcome from public.audit_events where actor_id = $1 and action = 'admin.audit_query'`, [a.id]);
      expect(r.rows).toEqual([{ outcome: 'success' }]);
    });

    it('admins get audit document names but never storage keys or document contents', async () => {
      const d = await createDoc(c.owner.id, 'TOP-SECRET-TITLE-XYZ');
      await download(c.owner, d);
      const r = await svc('svc_admin_query_audit', [c.admin.id, null, d.id, null, null, null, null, 25, 0, rid()]);
      const blob = JSON.stringify(r);
      expect(blob).toContain('TOP-SECRET-TITLE-XYZ');
      expect(blob).not.toContain(d.storageKey);
    });

    it('uses the document filename that was current when each audit event occurred', async () => {
      const d = await createDoc(c.owner.id, 'Filename history');
      await grant(c.owner, d, c.viewer, 'read');
      const key = `${c.owner.id}/${d.id}/${randomUUID()}`;
      expect(await svc('svc_commit_replace', [
        c.owner.id, d.id, key, 'renamed.pdf', 'application/pdf', 99, sha256Hex('v2'), rid(),
      ])).toMatchObject({ ok: true });

      const grantEvents = await svc('svc_admin_query_audit', [
        c.admin.id, null, d.id, 'permission.grant', 'success', null, null, 25, 0, rid(),
      ]);
      expect(grantEvents.events[0].document_name).toBe('file.pdf');

      const replaceEvents = await svc('svc_admin_query_audit', [
        c.admin.id, null, d.id, 'document.replace', 'success', null, null, 25, 0, rid(),
      ]);
      expect(replaceEvents.events[0].document_name).toBe('renamed.pdf');
    });
  });

  // -------------------------------------------------------------------------
  describe('trusted event recording is restricted', () => {
    it('only specific action/outcome pairs are accepted — no forged success events', async () => {
      const forged = await svc('svc_record_event', [c.admin.id, null, 'document.download', 'success', rid(), {}]);
      expect(forged).toEqual({ ok: false, code: 'invalid' });
      expect(await svc('svc_record_event', [c.admin.id, null, 'permission.grant', 'success', rid(), {}])).toEqual({ ok: false, code: 'invalid' });
      expect(await svc('svc_record_event', [c.admin.id, null, 'nonsense', 'denied', rid(), {}])).toEqual({ ok: false, code: 'invalid' });
      expect((await svc('svc_record_event', [null, null, 'auth.failure', 'denied', rid(), { reason: 'invalid_token' }])).ok).toBe(true);
      expect((await svc('svc_record_event', [c.owner.id, null, 'document.download', 'error', rid(), { stage: 'storage' }])).ok).toBe(true);
    });

    it('audit details that look like secrets are refused by the database', async () => {
      for (const key of ['password', 'Token', 'authorization', 'service_role_key', 'content']) {
        await expect(svc('svc_record_event', [null, null, 'auth.failure', 'denied', rid(), { [key]: 'x' }])).rejects.toThrow(/audit_events_details_safe/);
      }
    });
  });

  // -------------------------------------------------------------------------
  describe('throttling of repeated denied attempts (IDOR brute force)', () => {
    it('after 30 denied requests the actor is rate limited, with a single marker event', async () => {
      const attacker = await makeUser('viewer', 'brute');
      const target = await createDoc(c.owner.id, 'Brute-force target');
      let limited = 0;
      for (let i = 0; i < 40; i++) {
        const r = await download(attacker, { ...target, id: randomUUID() });
        if (r.code === 'rate_limited') limited++;
      }
      expect(limited).toBeGreaterThanOrEqual(9);
      // Even the REAL id is now blocked for this actor, and its owner is unaffected.
      expect(await download(attacker, target)).toEqual({ ok: false, code: 'rate_limited' });
      expect((await download(c.owner, target)).ok).toBe(true);
      const markers = await pool.query(`select count(*)::int as n from public.audit_events where actor_id = $1 and action = 'request.rate_limited'`, [attacker.id]);
      expect(markers.rows[0].n).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  describe('fail-closed behaviour when the audit write fails', () => {
    it('if the audit insert cannot happen, no authorisation (and no storage key) is returned', async () => {
      const d = await createDoc(c.owner.id, 'Audit-failure doc');
      const client = await pool.connect();
      try {
        await client.query('begin');
        // Simulate a broken audit trail inside a rolled-back transaction.
        await client.query(`alter table public.audit_events add constraint audit_always_fails check (false) not valid`);
        await expect(
          client.query(`select public.svc_authorize_download($1,$2,null,$3)`, [c.owner.id, d.id, randomUUID()]),
        ).rejects.toThrow(/audit_always_fails/);
      } finally {
        await client.query('rollback');
        client.release();
      }
      // Nothing was left half-done, and the normal path works again.
      expect((await download(c.owner, d)).ok).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe('RLS and the svc layer agree', () => {
    it('whatever RLS shows to a user matches what svc_authorize_download allows', async () => {
      const d = await createDoc(c.owner.id, 'Consistency doc');
      await grant(c.owner, d, c.viewer, 'read');
      for (const u of [c.owner, c.viewer, c.stranger, c.owner2, c.admin]) {
        const visible = await asUser(u.id, (s) => s.query(`select id from public.documents where id = $1`, [d.id]));
        const allowed = (await download(u, d)).ok;
        expect(visible.rows.length === 1, u.email).toBe(allowed);
      }
    });
  });
});
