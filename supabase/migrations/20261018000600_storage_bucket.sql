-- =====================================================================
-- TrustVault migration 0600 — private document bucket + Storage policies
--
-- Design decision: clients NEVER talk to the 'documents' bucket directly.
-- Every upload/download/delete goes through an Edge Function that
--   1. verifies the caller,
--   2. makes the authorisation decision against current DB state,
--   3. records the audit event,
--   4. and only then touches the bucket with the service role.
-- That is what makes revocation immediate and audit mandatory: there is no
-- reusable signed URL and no direct path that skips those steps.
--
-- Defence in depth: besides having no permissive policies for the bucket, we
-- add a RESTRICTIVE policy. Restrictive policies are AND-ed with every
-- permissive policy, so even if someone later adds a broad
-- "authenticated can read objects" policy for another feature, the documents
-- bucket stays closed to anon/authenticated.
-- =====================================================================

-- Private bucket, size and MIME limits enforced by Storage itself as well.
-- (The Free plan caps any file at 50 MB; we use 10 MB — keep in step with
-- MAX_UPLOAD_BYTES for the Edge Functions.)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760,
        array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Supabase Storage owns storage.objects and enables RLS itself. Do not ALTER
-- this managed table here: the migration role may not own it.

create policy documents_bucket_deny_clients
  on storage.objects
  as restrictive
  for all
  to anon, authenticated
  using (bucket_id <> 'documents')
  with check (bucket_id <> 'documents');
