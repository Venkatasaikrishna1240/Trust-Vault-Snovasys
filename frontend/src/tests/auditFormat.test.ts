import { describe, expect, it } from 'vitest'
import { auditActivity } from '../lib/format'
import type { AuditEvent } from '../types'

const base: AuditEvent = {
  seq: 1,
  occurred_at: '2026-10-20T10:00:00Z',
  actor_id: 'user-b',
  actor_display_name: 'User B',
  actor_email: 'b@example.test',
  document_id: 'doc-1',
  document_name: 'Report.pdf',
  document_owner_id: 'user-a',
  owner_display_name: 'User A',
  owner_email: 'a@example.test',
  outcome: 'success',
  action: 'document.preview',
  details: { response_prepared: true },
}

describe('admin audit activity summaries', () => {
  it('summarizes read-only and edit grants with named users and file', () => {
    expect(auditActivity({
      ...base,
      action: 'permission.grant',
      actor_id: 'user-a',
      actor_display_name: 'User A',
      affected_display_name: 'User B',
      permission_type: 'read',
    })).toBe("User A shared 'Report.pdf' with User B — Read-only access granted.")

    expect(auditActivity({
      ...base,
      action: 'permission.grant',
      actor_id: 'user-a',
      actor_display_name: 'User A',
      affected_email: 'b@example.test',
      permission_type: 'edit',
    })).toBe("User A shared 'Report.pdf' with b@example.test — Edit access granted.")
  })

  it('describes verified responses without claiming browser delivery, and describes revocation', () => {
    expect(auditActivity(base))
      .toBe("User B requested a preview of 'Report.pdf' — verified response prepared, shared by User A; browser display is not confirmed.")
    expect(auditActivity({ ...base, action: 'document.download' }))
      .toBe("User B requested a download of 'Report.pdf' — verified response prepared, shared by User A; receipt is not confirmed.")
    expect(auditActivity({
      ...base,
      action: 'permission.revoke',
      actor_display_name: 'User A',
      affected_display_name: 'User B',
    })).toBe("User A revoked User B's access to 'Report.pdf'.")
  })

  it('does not claim legacy authorization events delivered bytes', () => {
    expect(auditActivity({ ...base, details: { version: 1 } }))
      .toBe("User B was authorized to preview 'Report.pdf'; delivery was not verified in this older event.")
  })

  it('describes denied access without exposing raw identifiers', () => {
    expect(auditActivity({ ...base, outcome: 'denied', actor_email: null, actor_display_name: null }))
      .toBe("Unknown user attempted to access 'Report.pdf' — Access denied.")
  })

  it('summarizes upload, edit, replacement and deletion events', () => {
    expect(auditActivity({ ...base, action: 'document.upload', actor_id: 'user-a', actor_display_name: 'User A' }))
      .toBe("User A uploaded 'Report.pdf'.")
    expect(auditActivity({ ...base, action: 'document.edit' })).toBe("User B edited 'Report.pdf'.")
    expect(auditActivity({ ...base, action: 'document.replace' })).toBe("User B replaced the file for 'Report.pdf'.")
    expect(auditActivity({ ...base, action: 'document.delete', actor_id: 'user-a', actor_display_name: 'User A' }))
      .toBe("User A deleted 'Report.pdf'.")
  })
})
