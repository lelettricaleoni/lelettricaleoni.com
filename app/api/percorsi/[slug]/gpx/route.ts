import { NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { db, routes, routeTranslations } from '@/lib/db'
import { r2PublicUrl } from '@/lib/r2'
import { watermarkGpx } from '@/lib/gpx'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const [route] = await db.select().from(routes).where(
    and(eq(routes.slug, slug), eq(routes.isPublished, true))
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
  const watermarked = watermarkGpx(gpxString, translation?.name ?? slug)

  return new NextResponse(watermarked, {
    headers: {
      'Content-Type': 'application/gpx+xml',
      'Content-Disposition': `attachment; filename="${slug}.gpx"`,
      'Cache-Control': 'no-store',
    },
  })
}
