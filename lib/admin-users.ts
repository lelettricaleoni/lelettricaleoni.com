/**
 * The rules about who may manage the panel, kept away from the network.
 *
 * The role lives in `app_metadata`, never in `user_metadata`: the second one is
 * writable by the account it belongs to, so reading a role from it would let
 * anyone with a login promote themselves. Every check in the codebase reads
 * `app_metadata.role` — `getAdminUser()`, `proxy.ts`, `loginAction` — and this
 * module is the only place that decides what goes there.
 *
 * Nothing here talks to the auth service. That is deliberate: the one rule
 * worth being sure about — the role cannot be taken from the last admin left,
 * or the panel locks everybody out with no way back in short of the database
 * console — is a decision about a list, and a decision about a list can be
 * tested without a service to talk to.
 */

export const ADMIN_ROLE = 'admin'

/**
 * The fields read off an account, and nothing else.
 *
 * The auth client hands back a much larger object; naming only what is used
 * keeps the tests honest and stops a change upstream from quietly widening
 * what this module depends on.
 */
export interface RawAuthUser {
  id: string
  email?: string | null
  // The index signature is not decoration: without it this is a "weak type"
  // and the auth client's own user object fails to assign to it.
  app_metadata?: { role?: unknown; [key: string]: unknown } | null
  created_at?: string | null
  invited_at?: string | null
  last_sign_in_at?: string | null
}

export interface AdminUserSummary {
  id: string
  email: string
  isAdmin: boolean
  /** True while the invitation has been sent but never accepted. */
  isPending: boolean
  createdAt: string | null
  lastSignInAt: string | null
}

export function hasAdminRole(user: RawAuthUser): boolean {
  return user.app_metadata?.role === ADMIN_ROLE
}

export function toUserSummary(user: RawAuthUser): AdminUserSummary {
  return {
    id: user.id,
    email: user.email ?? '',
    isAdmin: hasAdminRole(user),
    isPending: Boolean(user.invited_at) && !user.last_sign_in_at,
    createdAt: user.created_at ?? null,
    lastSignInAt: user.last_sign_in_at ?? null,
  }
}

/** Admins first, then alphabetically: the list answers "who can get in?" first. */
export function sortUsers(users: AdminUserSummary[]): AdminUserSummary[] {
  return [...users].sort((a, b) => {
    if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1
    return a.email.localeCompare(b.email)
  })
}

export function countAdmins(users: AdminUserSummary[]): number {
  return users.filter((u) => u.isAdmin).length
}

export type RoleChangeRefusal = 'not-found' | 'not-admin' | 'already-admin' | 'last-admin'

/**
 * Why revoking would be refused, or null when it may go ahead.
 *
 * `last-admin` is the reason this function exists. Revoking one's own role is
 * allowed as long as somebody else keeps it: an admin handing the panel over
 * and stepping back is a normal thing to want, and forbidding it would only
 * push the work back to the database console — which is what this panel exists
 * to avoid.
 */
export function checkRevokeAdmin(
  users: AdminUserSummary[],
  targetId: string
): RoleChangeRefusal | null {
  const target = users.find((u) => u.id === targetId)
  if (!target) return 'not-found'
  if (!target.isAdmin) return 'not-admin'
  if (countAdmins(users) <= 1) return 'last-admin'
  return null
}

export function checkGrantAdmin(
  users: AdminUserSummary[],
  targetId: string
): RoleChangeRefusal | null {
  const target = users.find((u) => u.id === targetId)
  if (!target) return 'not-found'
  if (target.isAdmin) return 'already-admin'
  return null
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** An address already on the list, matched the way the auth service does: case-insensitively. */
export function findByEmail(
  users: AdminUserSummary[],
  email: string
): AdminUserSummary | undefined {
  const wanted = normaliseEmail(email)
  return users.find((u) => normaliseEmail(u.email) === wanted)
}
