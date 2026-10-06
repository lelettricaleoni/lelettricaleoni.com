// worker/hash.test.ts
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sha256OfFile } from './hash'

describe('sha256OfFile', () => {
  it('hashes a file the way sha256sum would', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hash-'))
    try {
      const file = join(dir, 'abc.txt')
      await writeFile(file, 'abc')
      expect(await sha256OfFile(file)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
