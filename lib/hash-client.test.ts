import { describe, it, expect } from 'vitest'
import { sha256HexOfFile } from './hash-client'
import { sha256Hex } from './hash'

describe('sha256HexOfFile', () => {
  it('matches the well-known digest of "abc"', async () => {
    expect(await sha256HexOfFile(new Blob(['abc']))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
  })

  it('agrees with the server-side hash, so a duplicate is a duplicate on both sides', async () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255])
    expect(await sha256HexOfFile(new Blob([bytes]))).toBe(sha256Hex(Buffer.from(bytes)))
  })

  it('hashes an empty file', async () => {
    expect(await sha256HexOfFile(new Blob([]))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    )
  })
})
