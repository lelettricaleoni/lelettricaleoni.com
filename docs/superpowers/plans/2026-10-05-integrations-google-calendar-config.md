# Integrations section and Google Calendar configuration — plan (PR A)

**Spec:** `docs/superpowers/specs/2026-10-05-integrations-google-calendar-design.md` (on `main`). This plan is
PR A of the spec's four: everything up to a working, tested **configuration** of Google Calendar. The
**sync engine** (events from the actions, *Sync now*, daily check) is PR B and gets its own plan.

**Goal:** an *Integrations* menu with a catalogue and one page per integration; Google Calendar can be
configured from the panel (service account key stored encrypted, calendar id, options, guide beside the form,
*Test connection*, enable/disable).

**Stack:** Next.js 16 server actions, Drizzle, `jose` (JWE A256GCM), `@googleapis/calendar`, `zod`, shadcn.

## Global constraints

- Panel text, guide and errors **in English**. Code and comments in English.
- Server Actions, not route handlers. Every action calls `requireAdmin()` first.
- The secret is decrypted **only on the server** and **never** returned to a client, logged, or put in an error.
- No hand-written regex validation; `zod` and libraries. No custom crypto: `jose`.
- One statement per database operation (no transactions: `max_pipeline: 0`).
- Every `/manage` section has a `layout.tsx` with `AdminShell` (`lib/admin-layouts.test.ts` enforces it).
- New shadcn components: check for the Tailwind v3 variable spelling (`lib/calendar-tailwind.test.ts` covers it).
- TDD: the test is written first and watched failing.

## Review focus

- A key that is corrupt, truncated, from another environment, or encrypted with another key: a clear error, never a crash.
- Saving a *second* key replaces the first and the old ciphertext is gone.
- The page and every action refuse a non-admin; a form can never read the secret back.
- A calendar id with spaces, an empty one, a service account JSON missing `private_key`, a 5 MB upload.
- *Disable* then *Enable* keeps the credentials; *Remove credentials* forces the integration off.

## Files

| File | What |
|---|---|
| `lib/integrations/crypto.ts` (+test) | encrypt / decrypt with `jose`, key from `INTEGRATIONS_ENCRYPTION_KEY` |
| `lib/db/schema.ts`, `migrations/0015_integrations.sql` | table `integrations` |
| `lib/integrations/store.ts` (+DB test) | read states, save config / secret, enable, disable, remove |
| `lib/integrations/registry.ts` (+test) | the list of integrations (one: Google Calendar) |
| `lib/integrations/google-calendar/key.ts` (+test) | `zod` schema of the service account key file |
| `lib/integrations/google-calendar/client.ts` (+test) | `testConnection`, Google errors → plain messages |
| `lib/actions/integrations.ts` (+test) | the admin Server Actions |
| `app/manage/integrations/**`, `components/admin/integrations/**` | catalogue, page with tabs, guide, form |
| `components/admin/admin-sidebar.tsx` | the *Integrations* entry |
| `vitest.config.ts`, `tests/server-only-stub.ts` | lets unit tests import modules that use `server-only` |

## Tasks

### Task 1 — Encryption
Add `jose` as a direct dependency. `encryptSecret(text)` → compact JWE string with `kid`; `decryptSecret(token)`.
Key = `INTEGRATIONS_ENCRYPTION_KEY`, base64, exactly 32 bytes. Tests (red first): round trip; two encryptions of the
same text differ; the token does not contain the plaintext; a flipped character fails; another key fails; missing or
wrong-length key throws `EncryptionKeyError` with a plain message; `isEncryptionConfigured()`.

### Task 2 — Table and store
Schema + migration `0015` (`ENABLE ROW LEVEL SECURITY`). Store functions: `listIntegrationStates()` (never returns the
secret), `getIntegration(id)`, `getDecryptedSecret(id)` (server only), `saveSecret(id, text, by)`, `saveConfig(id,
config, by)`, `setEnabled(id, enabled, by)`, `removeSecret(id, by)` (also turns it off), `recordCheck(id, error|null)`.
DB tests: secret stored is not the plaintext; list has no secret field; remove forces `enabled=false`; replace.

### Task 3 — Registry and key schema
Registry entry `google-calendar` (name, description, what data leaves, icon). Key schema with `zod`: `type` =
`service_account`, `client_email` is an email, `private_key` is a PEM, `project_id`; 10 KB limit; unknown fields
dropped. The error message names what is wrong and never echoes the value.

### Task 4 — Google client
`@googleapis/calendar` with a JWT (scope `calendar.events`). `testConnection({ key, calendarId })`: `events.list` (1),
`events.insert` a marked all-day event and `events.delete` it. Map failures to messages: bad/disabled key,
Calendar API not enabled, calendar not found or not shared, shared read-only. Tests drive it with a fake client and
real Google error shapes.

### Task 5 — Actions
`saveGoogleCalendarKeyAction(formData)` (file or pasted JSON → validate → encrypt → store; returns only the service
account e-mail), `saveGoogleCalendarSettingsAction`, `testGoogleCalendarAction`, `enableIntegrationAction`
(refuses unless the last test passed), `disableIntegrationAction`, `removeCredentialsAction`. Tests: not admin →
throws; invalid input → `{ status: 'invalid' }`; the result never contains the key; encryption missing → clear status.

### Task 6 — UI
Sidebar entry. `/manage/integrations`: card grid (icon, name, description, status badge). `/manage/integrations/[id]`:
header with Enable/Disable, tabs **Overview**, **Setup guide**, **Settings** (guide steps on the left, form on the right;
steps tick themselves), **Activity**. View tests render with static markup; the layout guard test passes.

### Task 7 — Key, docs, review
Generate `INTEGRATIONS_ENCRYPTION_KEY`, set it for Preview and Production on Vercel and in `.env.local` without
printing it. `docs/environment-variables.md`, `STATE.md`. Whole-branch review, then PR to `staging`.
