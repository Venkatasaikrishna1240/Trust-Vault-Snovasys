import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUser, createDoc, grant, makeCast, pool, svc, type Cast } from './helpers';

describe('recipient notifications', () => {
  let cast: Cast;
  beforeAll(async () => { cast = await makeCast(); });
  afterAll(async () => { await pool.end(); });

  it('records a private notification for a newly granted user', async () => {
    const document = await createDoc(cast.owner.id, 'Shared notification test');
    const result = await grant(cast.owner, document, cast.viewer, 'read');
    expect(result.ok).toBe(true);

    const own = await asUser(cast.viewer.id, (s) => s.query(
      `select notification_type, actor_name, document_title
         from public.user_notifications
        where recipient_id = $1 and document_id = $2`,
      [cast.viewer.id, document.id],
    ));
    expect(own.rows).toEqual([{
      notification_type: 'document_shared',
      actor_name: expect.stringContaining('owner'),
      document_title: 'Shared notification test',
    }]);

    const unrelated = await asUser(cast.stranger.id, (s) => s.query(
      'select id from public.user_notifications where document_id = $1',
      [document.id],
    ));
    expect(unrelated.rows).toEqual([]);
  });

  it('notifies active recipients and the owner after an editor adds a version', async () => {
    const document = await createDoc(cast.owner.id, 'Updated notification test');
    await grant(cast.owner, document, cast.editor, 'edit');
    await grant(cast.owner, document, cast.viewer, 'read');
    const key = `${cast.owner.id}/${document.id}/${randomUUID()}`;
    const requestId = randomUUID();
    const committed = await svc('svc_commit_replace', [
      cast.editor.id, document.id, key, 'updated.pdf', 'application/pdf',
      100, 'a'.repeat(64), requestId,
    ]);
    expect(committed.ok).toBe(true);

    const notifications = await pool.query(
      `select recipient_id, actor_name, notification_type, document_title
         from public.user_notifications
         where source_id = $1 and document_id = $2
         order by recipient_id`,
      [requestId, document.id],
    );
    expect(notifications.rows).toHaveLength(2);
    expect(notifications.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        recipient_id: cast.owner.id,
        actor_name: expect.stringContaining('editor'),
        notification_type: 'document_updated',
        document_title: 'Updated notification test',
      }),
      expect.objectContaining({
        recipient_id: cast.viewer.id,
        actor_name: expect.stringContaining('editor'),
        notification_type: 'document_updated',
        document_title: 'Updated notification test',
      }),
    ]));
  });

  it('notifies signed-in recipients when a globally shared document is updated', async () => {
    const document = await createDoc(cast.owner.id, 'Global update notification');
    const shareRequest = randomUUID();
    expect(await svc('svc_set_document_visibility', [
      cast.owner.id, document.id, true, shareRequest,
    ])).toMatchObject({ ok: true });

    const updateRequest = randomUUID();
    const key = `${cast.owner.id}/${document.id}/${randomUUID()}`;
    expect(await svc('svc_commit_replace', [
      cast.owner.id, document.id, key, 'global-update.pdf', 'application/pdf',
      100, 'b'.repeat(64), updateRequest,
    ])).toMatchObject({ ok: true });

    const notices = await pool.query(
      `select recipient_id
         from public.user_notifications
        where document_id = $1
          and notification_type = 'document_updated'
          and source_id = $2`,
      [document.id, updateRequest],
    );
    expect(notices.rows.map((row) => row.recipient_id)).toEqual(expect.arrayContaining([
      cast.viewer.id,
      cast.editor.id,
      cast.stranger.id,
    ]));
    expect(notices.rows.map((row) => row.recipient_id)).not.toContain(cast.owner.id);
  });

  it('notifies signed-in users when a document becomes globally shared', async () => {
    const document = await createDoc(cast.owner.id, 'Global share notice');
    expect(await svc('svc_set_document_visibility', [
      cast.owner.id, document.id, true, randomUUID(),
    ])).toMatchObject({ ok: true });
    expect(await svc('svc_set_document_visibility', [
      cast.owner.id, document.id, false, randomUUID(),
    ])).toMatchObject({ ok: true });
    expect(await svc('svc_set_document_visibility', [
      cast.owner.id, document.id, true, randomUUID(),
    ])).toMatchObject({ ok: true });

    const notices = await pool.query(
      `select recipient_id from public.user_notifications
        where document_id = $1 and notification_type = 'document_shared'`,
      [document.id],
    );
    expect(notices.rows.map((row) => row.recipient_id)).toContain(cast.viewer.id);
    expect(notices.rows.filter((row) => row.recipient_id === cast.viewer.id)).toHaveLength(2);
    expect(notices.rows.map((row) => row.recipient_id)).not.toContain(cast.owner.id);
  });

  it('allows users to mark only their own notifications read through a bounded RPC', async () => {
    const document = await createDoc(cast.owner.id, 'Read-state test');
    await grant(cast.owner, document, cast.viewer, 'read');
    await grant(cast.owner, document, cast.editor, 'read');

    const notices = await pool.query(
      `select id, recipient_id from public.user_notifications
        where document_id = $1 and notification_type = 'document_shared'`,
      [document.id],
    );
    const viewerNotice = notices.rows.find((row) => row.recipient_id === cast.viewer.id);
    const editorNotice = notices.rows.find((row) => row.recipient_id === cast.editor.id);
    expect(viewerNotice).toBeTruthy();
    expect(editorNotice).toBeTruthy();

    const changed = await asUser(cast.viewer.id, (s) => s.query(
      'select public.mark_notifications_read($1::uuid[]) as changed',
      [[viewerNotice.id, editorNotice.id]],
    ));
    expect(changed.rows[0].changed).toBe(1);

    const states = await pool.query(
      'select id, read_at from public.user_notifications where id = any($1::uuid[])',
      [[viewerNotice.id, editorNotice.id]],
    );
    expect(states.rows.find((row) => row.id === viewerNotice.id).read_at).not.toBeNull();
    expect(states.rows.find((row) => row.id === editorNotice.id).read_at).toBeNull();

    await expect(asUser(cast.viewer.id, (s) => s.query(
      `update public.user_notifications set read_at = now() where id = $1`,
      [editorNotice.id],
    ))).rejects.toThrow(/permission denied/i);
  });
});
