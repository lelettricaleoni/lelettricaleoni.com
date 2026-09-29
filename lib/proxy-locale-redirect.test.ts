import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from '../proxy'

function get(path: string, acceptLanguage?: string) {
  return proxy(
    new NextRequest(`https://www.example.test${path}`, {
      headers: acceptLanguage ? { 'accept-language': acceptLanguage } : {},
    })
  )
}

describe('the redirect from a path with no language', () => {
  it('is temporary, because the language depends on who is asking', async () => {
    const res = await get('/', 'de')
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/de')
  })

  it('says its answer depends on Accept-Language', async () => {
    const res = await get('/bikes', 'en')
    expect(res.headers.get('vary')).toContain('Accept-Language')
  })

  it('keeps the rest of the path', async () => {
    const res = await get('/bikes/b81391a9', 'it')
    expect(new URL(res.headers.get('location')!).pathname).toBe('/it/bikes/b81391a9')
  })

  it('falls back to Italian with no header, as a crawler sends none', async () => {
    const res = await get('/')
    expect(new URL(res.headers.get('location')!).pathname).toBe('/it')
  })

  it('leaves a path that already has a language alone', async () => {
    const res = await get('/de/bikes', 'it')
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })
})
