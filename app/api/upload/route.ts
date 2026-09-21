import { NextResponse } from 'next/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { eq } from 'drizzle-orm'
import { getAdminUser } from '@/lib/supabase/server'
import { s3, R2_BUCKET } from '@/lib/r2'
import { db, media, routes } from '@/lib/db'
import { sha256Hex } from '@/lib/hash'

async function findDuplicateOwner(kind: 'photo' | 'gpx', sha256: string) {
  if (kind === 'gpx') {
    const [match] = await db.select({ id: routes.id }).from(routes).where(eq(routes.gpxSha256, sha256)).limit(1)
    return match ? { routeId: match.id, bikeModelId: null as string | null } : null
  }
  const [match] = await db
    .select({ routeId: media.routeId, bikeModelId: media.bikeModelId })
    .from(media)
    .where(eq(media.sha256, sha256))
    .limit(1)
  return match ?? null
}

export async function POST(request: Request) {
  const user = await getAdminUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const key = formData.get('key') as string | null
  const kindRaw = formData.get('kind') as string | null
  const force = formData.get('force') === 'true'
  const kind = kindRaw === 'photo' || kindRaw === 'gpx' ? kindRaw : null

  if (!file || !key) return new NextResponse('Missing file or key', { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const sha256 = sha256Hex(buffer)

  if (kind && !force) {
    const owner = await findDuplicateOwner(kind, sha256)
    if (owner) {
      return NextResponse.json({ duplicate: true, sha256, owner }, { status: 409 })
    }
  }

  try {
    await s3.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: file.type || 'application/octet-stream',
    }))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('R2 upload error:', msg)
    return new NextResponse(`R2 error: ${msg}`, { status: 500 })
  }

  return NextResponse.json({ key, sha256 })
}
