import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/*
 * Behind the tunnel the container sees itself at https://0.0.0.0:3000: that is what `request.url` says on the VM, so an address made from it
 * sent every sign-in back to a page nobody can open (found on staging, 2026-10-13: «con il login Google vengo reindirizzato al localhost»).
 * The callback must send people back to THIS site's own address, from its configuration (`SITE_URL`), whatever the request says.
 */
const SITE = 'https://staging.example.test'
const INSIDE_THE_CONTAINER = 'https://0.0.0.0:3000'

const auth = {
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
  getUser: vi.fn(),
}

vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth }) }))
vi.mock('@/lib/admin-users', () => ({ hasAdminRole: () => false }))
vi.mock('@/lib/auth/ensure-customer', () => ({ ensureCustomerFor: vi.fn() }))
vi.mock('@/lib/auth/google-phone', () => ({ REQUEST_GOOGLE_PHONE: false, fetchGooglePhone: vi.fn() }))
vi.mock('@/lib/auth/account-data', () => ({ getCustomerLanguage: async () => 'en' }))

async function callback(query: string) {
  const { GET } = await import('@/app/auth/callback/route')
  const response = await GET(new NextRequest(`${INSIDE_THE_CONTAINER}/auth/callback?${query}`))
  return response.headers.get('location')
}

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', SITE)
})

describe('the sign-in callback sends people back to the site, not to the address the container sees', () => {
  it('a link that does not work goes to the login page of the site', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: new Error('bad code') })
    expect(await callback('code=bad&lang=de')).toBe(`${SITE}/de/login?error=invalid_link`)
  })

  it('a sign-in that works goes to where the person was going, on the site', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: null })
    auth.getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@example.test', app_metadata: {}, user_metadata: {} } } })
    const location = await callback('code=good&lang=it&next=%2Fit%2Frent')
    expect(location?.startsWith(`${SITE}/`)).toBe(true)
    expect(location).not.toContain('0.0.0.0')
  })
})
