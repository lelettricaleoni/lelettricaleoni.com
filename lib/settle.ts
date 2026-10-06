// lib/settle.ts
/**
 * Resolve with null instead of hanging or throwing.
 *
 * An external service must never hold a request or fail it: a feature-flag migration once put one on the path of every
 * request with no bound, and made the home page forty times slower. Every call out of a request goes through this.
 */
export async function settle<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms)
      }),
    ])
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
