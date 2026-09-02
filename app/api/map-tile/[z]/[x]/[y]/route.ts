import { NextResponse } from 'next/server'

const TILE_COORD = /^\d+$/

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ z: string; x: string; y: string }> }
) {
  const { z, x, y } = await params

  if (![z, x, y].every((v) => TILE_COORD.test(v))) {
    return new NextResponse('Invalid tile coordinates', { status: 400 })
  }

  const apiKey = process.env.CARTO_API_KEY
  const tileUrl = `https://basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png${apiKey ? `?key=${apiKey}` : ''}`

  const tileRes = await fetch(tileUrl)
  if (!tileRes.ok || !tileRes.body) {
    return new NextResponse('Tile fetch failed', { status: tileRes.status })
  }

  return new NextResponse(tileRes.body, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400, s-maxage=604800, immutable',
    },
  })
}
