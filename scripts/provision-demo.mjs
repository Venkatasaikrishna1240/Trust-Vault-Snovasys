#!/usr/bin/env node
// Creates fictional demo accounts + documents + grants through the REAL API (so the audit trail is real).
// Secrets come from your shell, never from files:
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... [DEMO_PASSWORD=...] node scripts/provision-demo.mjs
// If DEMO_PASSWORD is unset a random one is generated and printed ONCE. Roles are set with the service key
// (trusted provisioning). Do not commit or publish the printed password.
import { randomBytes } from 'node:crypto';
const { SUPABASE_URL: URL_, SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE } = process.env;
if (!URL_ || !ANON || !SERVICE) { console.error('Set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const password = process.env.DEMO_PASSWORD ?? randomBytes(12).toString('base64url') + 'Aa1!';
const users = [
  ['admin', 'admin@trustvault.test', 'Asha Admin', 'admin'], ['owner', 'owner@trustvault.test', 'Omar Owner', 'owner'],
  ['owner2', 'owner2@trustvault.test', 'Olga Owner', 'owner'], ['viewer', 'viewer@trustvault.test', 'Vik Viewer', 'viewer'],
  ['outsider', 'outsider@trustvault.test', 'Uma Unrelated', 'viewer'],
];
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' };
const ids = {};
for (const [key, email, name, role] of users) {
  let r = await fetch(`${URL_}/auth/v1/admin/users`, { method: 'POST', headers: svc, body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { display_name: name } }) });
  let b = await j(r);
  if (!r.ok) { // already exists: look it up and reset the password
    const list = await j(await fetch(`${URL_}/auth/v1/admin/users?per_page=200`, { headers: svc }));
    b = list.users.find((u) => u.email === email);
    await fetch(`${URL_}/auth/v1/admin/users/${b.id}`, { method: 'PUT', headers: svc, body: JSON.stringify({ password }) });
  }
  ids[key] = b.id;
  await fetch(`${URL_}/rest/v1/profiles?id=eq.${b.id}`, { method: 'PATCH', headers: svc, body: JSON.stringify({ role }) });
}
const token = {};
for (const [key, email] of users) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  token[key] = (await j(r)).access_token;
}
const pdf = (t) => new TextEncoder().encode(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${t} (fictional)\ntrailer<<>>\n%%EOF\n`);
const fn = (name, who, init = {}) => fetch(`${URL_}/functions/v1/${name}`, { ...init, headers: { apikey: ANON, Authorization: `Bearer ${token[who]}`, ...(init.headers ?? {}) } });
async function upload(who, title, category) {
  const f = new FormData(); f.set('file', new File([pdf(title)], `${category}.pdf`, { type: 'application/pdf' })); f.set('title', title); f.set('category', category);
  const r = await fn('document-upload', who, { method: 'POST', body: f }); const b = await j(r);
  if (!r.ok) throw new Error(`upload failed: ${JSON.stringify(b)}`); return b.data.document.id;
}
const share = (who, id, email, permission) => fn('document-share', who, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'grant', document_id: id, grantee_email: email, permission }) });
const d1 = await upload('owner', 'Salary letter — fictional employee', 'salary_letter');
const d2 = await upload('owner', 'Supplier contract 2026 (fictional)', 'contract');
const d3 = await upload('owner2', 'Drawing 77 — fictional housing', 'technical_drawing');
await share('owner', d1, 'viewer@trustvault.test', 'read');
await share('owner', d2, 'viewer@trustvault.test', 'edit');
console.log('Demo data created. Accounts: ' + users.map((u) => u[1]).join(', '));
console.log('Password (shown once, do not publish): ' + password);
console.log('Try: outsider@ opens a document id -> 404; viewer@ downloads d1 -> OK; owner revokes -> viewer gets 404.');
