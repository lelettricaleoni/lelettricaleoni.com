import { NextResponse } from 'next/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getAdminUser } from '@/lib/supabase/server'
import { s3, R2_BUCKET } from '@/lib/r2'

export async function POST(request: Request) {
  const user = await getAdminUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const key = formData.get('key') as string | null

  if (!file || !key) return new NextResponse('Missing file or key', { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
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

  return NextResponse.json({ key })
}
