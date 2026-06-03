import { NextResponse } from 'next/server'
import { and, eq, sql } from 'drizzle-orm'
import { db, routes, routeTranslations } from '@/lib/db'
import { r2PublicUrl } from '@/lib/r2'
import { watermarkGpx } from '@/lib/gpx'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const [route] = await db.select().from(routes).where(
    and(sql`left(${routes.id}::text, 8) = ${id}`, eq(routes.isPublished, true))
  )

  if (!route?.gpxKey) {
    return new NextResponse('Not Found', { status: 404 })
  }

  const [translation] = await db.select().from(routeTranslations).where(
    and(eq(routeTranslations.routeId, route.id), eq(routeTranslations.locale, 'it'))
  )

  const gpxUrl = r2PublicUrl(route.gpxKey)
  const gpxResponse = await fetch(gpxUrl)
  if (!gpxResponse.ok) {
    return new NextResponse('GPX file not found', { status: 404 })
  }

  const gpxString = await gpxResponse.text()
  const watermarked = watermarkGpx(gpxString, translation?.name ?? id)

  const body = Buffer.from(watermarked, 'utf-8')
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/gpx+xml',
      'Content-Disposition': `attachment; filename="${id}.gpx"`,
      'Content-Length': String(body.length),
      'Cache-Control': 'no-store',
    },
  })
}
