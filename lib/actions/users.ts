'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  ADMIN_ROLE,
  checkGrantAdmin,
  checkRevokeAdmin,
  findByEmail,
  normaliseEmail,
  sortUsers,
  toUserSummary,
  type AdminUserSummary,
  type RoleChangeRefusal,
} from '@/lib/admin-users'

/**
 * Managing who can get into the panel.
 *
 * Server Actions rather than route handlers: the caller is our own panel, and
 * these carry a key that must not be addressable from outside. Every one of
 * them starts with `requireAdmin()` — the `'use server'` boundary is reachable
 * by anyone who can guess an action id, so the check belongs in the function
 * and not only in `proxy.ts`.
 */

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

/** Where an invited person lands once the link is accepted. */
const INVITE_LANDING = `${SITE_URL}/auth/callback?next=${encodeURIComponent('/manage/update-password')}`

const InviteSchema = z.object({
  email: z.email().max(254),
})

export type UserActionResult = { ok: true; message: string } | { ok: false; message: string }

/** Messages the panel shows. They say what happened, never where it happened. */
const REFUSAL_MESSAGES: Record<RoleChangeRefusal, string> = {
  'not-found': 'Questo account non esiste più.',
  'not-admin': 'Questo account non ha accesso al pannello.',
  'already-admin': 'Questo account ha già accesso al pannello.',
  'last-admin':
    "Non puoi togliere l'accesso all'ultimo amministratore rimasto: nessuno potrebbe più entrare nel pannello. Assegna prima l'accesso a un altro account.",
}

async function requireAdmin() {
  const user = await getAdminUser()
  if (!user) throw new Error('Unauthorized')
  return user
}

/**
 * Every account, one page at a time.
 *
 * The last-admin rule counts admins, so it needs the whole list and not a
 * page of it. The cap exists so a surprise — a project that somehow collected
 * thousands of accounts — costs a truncated list instead of an endless loop.
 */
async function listAllUsers(): Promise<AdminUserSummary[]> {
  const supabase = createSupabaseAdminClient()
  const perPage = 200
  const maxPages = 10
  const collected: AdminUserSummary[] = []

  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    collected.push(...data.users.map(toUserSummary))
    if (data.users.length < perPage) break
  }

  return sortUsers(collected)
}

export async function getUsersForAdmin(): Promise<AdminUserSummary[]> {
  await requireAdmin()
  return listAllUsers()
}

export async function inviteAdminAction(
  _prev: UserActionResult | null,
  formData: FormData
): Promise<UserActionResult> {
  await requireAdmin()

  const parsed = InviteSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) {
    return { ok: false, message: 'Inserisci un indirizzo email valido.' }
  }
  const email = normaliseEmail(parsed.data.email)

  const users = await listAllUsers()
  const existing = findByEmail(users, email)
  if (existing) {
    return {
      ok: false,
      message: existing.isAdmin
        ? 'Questo indirizzo ha già accesso al pannello.'
        : "Questo indirizzo ha già un account: assegnagli l'accesso dalla lista qui sotto.",
    }
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: INVITE_LANDING,
  })
  if (error || !data.user) {
    return { ok: false, message: "Invito non inviato. Controlla l'indirizzo e riprova." }
  }

  // The invitation goes out before the role can be attached: creating the
  // account and sending the email are the same call, and there is no way to
  // ask for one without the other. If this second call fails the account
  // exists without access — recoverable from the list, which is what the
  // message says, rather than something that needs the database console.
  const { error: roleError } = await supabase.auth.admin.updateUserById(data.user.id, {
    app_metadata: { role: ADMIN_ROLE },
  })
  if (roleError) {
    revalidatePath('/manage/users')
    return {
      ok: false,
      message:
        "Invito inviato, ma l'accesso non è stato assegnato. Assegnalo dalla lista qui sotto.",
    }
  }

  revalidatePath('/manage/users')
  return { ok: true, message: `Invito inviato a ${email}.` }
}

export async function grantAdminAction(userId: string): Promise<UserActionResult> {
  await requireAdmin()

  const users = await listAllUsers()
  const refusal = checkGrantAdmin(users, userId)
  if (refusal) return { ok: false, message: REFUSAL_MESSAGES[refusal] }

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { role: ADMIN_ROLE },
  })
  if (error) return { ok: false, message: 'Accesso non assegnato. Riprova.' }

  revalidatePath('/manage/users')
  return { ok: true, message: 'Accesso assegnato.' }
}

export async function revokeAdminAction(userId: string): Promise<UserActionResult> {
  await requireAdmin()

  // Read the list first: the refusal below is the only thing standing between
  // the panel and a lockout, and it can only be decided against the current
  // list, not against what the browser was showing a minute ago.
  const users = await listAllUsers()
  const refusal = checkRevokeAdmin(users, userId)
  if (refusal) return { ok: false, message: REFUSAL_MESSAGES[refusal] }

  const supabase = createSupabaseAdminClient()
  // `app_metadata` is merged, not replaced: null removes the key rather than
  // leaving a role behind that some future check might read differently.
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { role: null },
  })
  if (error) return { ok: false, message: 'Accesso non revocato. Riprova.' }

  revalidatePath('/manage/users')
  return { ok: true, message: 'Accesso revocato.' }
}
