import { describe, it, expect } from 'vitest'
import {
  ADMIN_ROLE,
  checkGrantAdmin,
  checkRevokeAdmin,
  countAdmins,
  findByEmail,
  hasAdminRole,
  normaliseEmail,
  sortUsers,
  toUserSummary,
  type AdminUserSummary,
} from './admin-users'

function summary(over: Partial<AdminUserSummary> & { id: string }): AdminUserSummary {
  return {
    email: `${over.id}@example.com`,
    isAdmin: false,
    isPending: false,
    createdAt: null,
    lastSignInAt: null,
    ...over,
  }
}

describe('hasAdminRole', () => {
  it('reads the role from app_metadata', () => {
    expect(hasAdminRole({ id: '1', app_metadata: { role: ADMIN_ROLE } })).toBe(true)
  })

  it('ignores a role claimed anywhere else', () => {
    // user_metadata is writable by the account itself: a role found there is a
    // claim, not a fact, and toUserSummary must not carry it across.
    const impostor = {
      id: '1',
      app_metadata: { role: 'authenticated' },
      user_metadata: { role: ADMIN_ROLE },
    } as never
    expect(hasAdminRole(impostor)).toBe(false)
    expect(toUserSummary(impostor).isAdmin).toBe(false)
  })

  it('treats a missing app_metadata as no role', () => {
    expect(hasAdminRole({ id: '1' })).toBe(false)
    expect(hasAdminRole({ id: '1', app_metadata: null })).toBe(false)
    expect(hasAdminRole({ id: '1', app_metadata: {} })).toBe(false)
  })
})

describe('toUserSummary', () => {
  it('calls an invitation pending until the first sign-in', () => {
    expect(toUserSummary({ id: '1', invited_at: '2026-01-01T00:00:00Z' }).isPending).toBe(true)
    expect(
      toUserSummary({
        id: '1',
        invited_at: '2026-01-01T00:00:00Z',
        last_sign_in_at: '2026-01-02T00:00:00Z',
      }).isPending
    ).toBe(false)
  })

  it('does not call an account that was never invited pending', () => {
    expect(toUserSummary({ id: '1' }).isPending).toBe(false)
  })

  it('survives an account with no address on record', () => {
    expect(toUserSummary({ id: '1', email: null }).email).toBe('')
  })
})

describe('sortUsers', () => {
  it('puts admins first and sorts each group by address', () => {
    const list = [
      summary({ id: 'z', email: 'zoe@example.com' }),
      summary({ id: 'b', email: 'bea@example.com', isAdmin: true }),
      summary({ id: 'a', email: 'ada@example.com' }),
      summary({ id: 'c', email: 'carl@example.com', isAdmin: true }),
    ]
    expect(sortUsers(list).map((u) => u.id)).toEqual(['b', 'c', 'a', 'z'])
  })

  it('leaves the given array alone', () => {
    const list = [summary({ id: 'z' }), summary({ id: 'a', isAdmin: true })]
    sortUsers(list)
    expect(list.map((u) => u.id)).toEqual(['z', 'a'])
  })
})

describe('countAdmins', () => {
  it('counts only the accounts holding the role', () => {
    expect(countAdmins([summary({ id: 'a', isAdmin: true }), summary({ id: 'b' })])).toBe(1)
    expect(countAdmins([])).toBe(0)
  })
})

describe('checkRevokeAdmin', () => {
  const alice = summary({ id: 'alice', isAdmin: true })
  const bob = summary({ id: 'bob', isAdmin: true })
  const guest = summary({ id: 'guest' })

  it('refuses to take the role from the last admin left', () => {
    expect(checkRevokeAdmin([alice, guest], 'alice')).toBe('last-admin')
  })

  it('refuses even when the last admin is the only account there is', () => {
    expect(checkRevokeAdmin([alice], 'alice')).toBe('last-admin')
  })

  it('allows it once a second admin exists', () => {
    expect(checkRevokeAdmin([alice, bob], 'alice')).toBeNull()
    expect(checkRevokeAdmin([alice, bob], 'bob')).toBeNull()
  })

  it('refuses on an account that does not hold the role', () => {
    expect(checkRevokeAdmin([alice, bob, guest], 'guest')).toBe('not-admin')
  })

  it('refuses on an id that is not on the list', () => {
    expect(checkRevokeAdmin([alice, bob], 'nobody')).toBe('not-found')
    expect(checkRevokeAdmin([], 'alice')).toBe('not-found')
  })

  it('never leaves the list without an admin, whatever the order of removals', () => {
    // Revoking one at a time, following the rule, can never empty the role:
    // the check is what stands between the panel and a lockout.
    let list = [alice, bob, summary({ id: 'carol', isAdmin: true }), guest]
    for (const id of ['alice', 'bob', 'carol', 'guest']) {
      if (checkRevokeAdmin(list, id) === null) {
        list = list.map((u) => (u.id === id ? { ...u, isAdmin: false } : u))
      }
    }
    expect(countAdmins(list)).toBe(1)
  })
})

describe('checkGrantAdmin', () => {
  it('allows an account that does not hold the role yet', () => {
    expect(checkGrantAdmin([summary({ id: 'guest' })], 'guest')).toBeNull()
  })

  it('refuses an account that already holds it', () => {
    expect(checkGrantAdmin([summary({ id: 'a', isAdmin: true })], 'a')).toBe('already-admin')
  })

  it('refuses an id that is not on the list', () => {
    expect(checkGrantAdmin([], 'ghost')).toBe('not-found')
  })
})

describe('findByEmail', () => {
  const list = [summary({ id: 'a', email: 'Ada@Example.com' })]

  it('matches regardless of case and surrounding space', () => {
    expect(findByEmail(list, '  ada@example.COM ')?.id).toBe('a')
  })

  it('returns nothing when the address is new', () => {
    expect(findByEmail(list, 'bea@example.com')).toBeUndefined()
  })
})

describe('normaliseEmail', () => {
  it('trims and lowercases', () => {
    expect(normaliseEmail('  Foo@Bar.IT ')).toBe('foo@bar.it')
  })
})
