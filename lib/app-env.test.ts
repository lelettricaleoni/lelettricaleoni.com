import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appEnv, isProduction } from './app-env'

describe('appEnv', () => {
  const saved = { app: process.env.APP_ENV, vercel: process.env.VERCEL_ENV }
  beforeEach(() => { delete process.env.APP_ENV; delete process.env.VERCEL_ENV })
  afterEach(() => {
    if (saved.app === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = saved.app
    if (saved.vercel === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = saved.vercel
  })

  it('is "development" when nothing says otherwise: a laptop is never production', () => {
    expect(appEnv()).toBe('development')
    expect(isProduction()).toBe(false)
  })

  it('is what APP_ENV says, the variable that works wherever the site runs', () => {
    process.env.APP_ENV = 'production'
    expect(appEnv()).toBe('production')
    expect(isProduction()).toBe(true)
    process.env.APP_ENV = 'staging'
    expect(appEnv()).toBe('staging')
    expect(isProduction()).toBe(false)
  })

  it('falls back to VERCEL_ENV, so the site keeps working on Vercel until it moves', () => {
    process.env.VERCEL_ENV = 'production'
    expect(isProduction()).toBe(true)
    process.env.VERCEL_ENV = 'preview'
    expect(appEnv()).toBe('preview')
    expect(isProduction()).toBe(false)
  })

  it('prefers APP_ENV when both are set', () => {
    process.env.APP_ENV = 'staging'
    process.env.VERCEL_ENV = 'production'
    expect(isProduction()).toBe(false)
  })

  it('ignores an empty APP_ENV', () => {
    process.env.APP_ENV = ''
    process.env.VERCEL_ENV = 'production'
    expect(isProduction()).toBe(true)
  })
})
