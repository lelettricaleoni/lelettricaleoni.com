import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

async function main() {
  // Eseguito fuori da `next`, che normalmente carica .env.local da solo — qui
  // va fatto a mano, e prima di qualsiasi import da lib/db (che legge
  // DATABASE_URL al momento in cui viene valutato il modulo).
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  for (const line of readFileSync(join(root, '.env.local'), 'utf-8').split('\n')) {
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()
    if (key && !(key in process.env)) process.env[key] = value
  }

  const { db, media, routes } = await import('../lib/db')
  const { eq, isNull } = await import('drizzle-orm')
  const { mediaPublicUrl, isStagedPhotoKey } = await import('../lib/media-client')
  const { sha256Hex } = await import('../lib/hash')

  async function hashUrl(key: string): Promise<string> {
    const res = await fetch(mediaPublicUrl(key))
    if (!res.ok) throw new Error(`${res.status} fetching ${key}`)
    const buf = Buffer.from(await res.arrayBuffer())
    return sha256Hex(buf)
  }

  const mediaRows = await db.select().from(media).where(isNull(media.sha256))
  // A staged photo's file is the worker's AVIF master, not the source that was
  // uploaded, so hashing it would record a value no future upload can ever match.
  const photoRows = mediaRows.filter((m) => m.mediaType === 'photo' && !isStagedPhotoKey(m.storageKey))
  console.log(`media senza sha256: ${mediaRows.length} (${photoRows.length} foto, resto video esclusi — vedi spec)`)
  for (const m of photoRows) {
    try {
      const hash = await hashUrl(m.storageKey)
      await db.update(media).set({ sha256: hash }).where(eq(media.id, m.id))
      console.log(`ok   ${m.storageKey}`)
    } catch (err) {
      console.error(`ERRORE ${m.storageKey}:`, err)
    }
  }

  const routeRows = (await db.select().from(routes).where(isNull(routes.gpxSha256))).filter((r) => r.gpxKey)
  console.log(`percorsi senza gpxSha256: ${routeRows.length}`)
  for (const r of routeRows) {
    try {
      const hash = await hashUrl(r.gpxKey!)
      await db.update(routes).set({ gpxSha256: hash }).where(eq(routes.id, r.id))
      console.log(`ok   ${r.gpxKey}`)
    } catch (err) {
      console.error(`ERRORE ${r.gpxKey}:`, err)
    }
  }

  process.exit(0)
}

main()
