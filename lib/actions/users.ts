'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  ADMIN_ROLE,
  DEV_TOOLS_FLAG,
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
  'not-found': 'This account no longer exists.',
  'not-admin': 'This account has no access to the panel.',
  'already-admin': 'This account already has access to the panel.',
  'last-admin':
    "You can't remove access from the last remaining admin: no one would be able to log into the panel anymore. Grant access to another account first.",
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
    return { ok: false, message: 'Enter a valid email address.' }
  }
  const email = normaliseEmail(parsed.data.email)

  const users = await listAllUsers()
  const existing = findByEmail(users, email)
  if (existing) {
    return {
      ok: false,
      message: existing.isAdmin
        ? 'This address already has access to the panel.'
        : 'This address already has an account: grant it access from the list below.',
    }
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: INVITE_LANDING,
  })
  if (error || !data.user) {
    return { ok: false, message: 'Invite not sent. Check the address and try again.' }
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
      message: "Invite sent, but access wasn't granted. Grant it from the list below.",
    }
  }

  revalidatePath('/manage/users')
  return { ok: true, message: `Invite sent to ${email}.` }
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
  if (error) return { ok: false, message: 'Access not granted. Try again.' }

  revalidatePath('/manage/users')
  return { ok: true, message: 'Access granted.' }
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
  if (error) return { ok: false, message: 'Access not revoked. Try again.' }

  revalidatePath('/manage/users')
  return { ok: true, message: 'Access revoked.' }
}

/**
 * A narrower grant than admin: worth its own actions rather than a third
 * value on the admin ones, because it can be given or taken without the
 * last-admin lockout question — losing it never locks anyone out of the
 * panel itself.
 */
export async function grantDevAccessAction(userId: string): Promise<UserActionResult> {
  await requireAdmin()

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { [DEV_TOOLS_FLAG]: true },
  })
  if (error) return { ok: false, message: 'Dev panel access not granted. Try again.' }

  revalidatePath('/manage/users')
  return { ok: true, message: 'Dev panel access granted.' }
}

export async function revokeDevAccessAction(userId: string): Promise<UserActionResult> {
  await requireAdmin()

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { [DEV_TOOLS_FLAG]: null },
  })
  if (error) return { ok: false, message: 'Dev panel access not revoked. Try again.' }

  revalidatePath('/manage/users')
  return { ok: true, message: 'Dev panel access revoked.' }
}
