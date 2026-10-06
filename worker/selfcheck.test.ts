// worker/selfcheck.test.ts
import { afterEach, describe, expect, it } from 'vitest'
import { selfCheck } from './selfcheck'
import { hasFfmpeg } from './testing/ffmpeg'

describe('selfCheck', () => {
  const savedPath = process.env.PATH
  afterEach(() => { process.env.PATH = savedPath })

  it.skipIf(!hasFfmpeg())('finds nothing wrong where ffmpeg, AVIF and libheif are all available', async () => {
    expect(await selfCheck()).toEqual([])
  })

  it('names ffmpeg when it is missing, instead of failing on the first video', async () => {
    process.env.PATH = ''
    const problems = await selfCheck()
    expect(problems.some((problem) => /ffmpeg/.test(problem))).toBe(true)
  })
})
