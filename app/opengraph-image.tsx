import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const alt = 'Lelettrica — Noleggio E-Bike Dro, Lago di Garda'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OgImage() {
  const logoSvg = await readFile(
    join(process.cwd(), 'public', 'svg', 'LogoLelettrica_full.svg'),
    'utf8',
  )
  const logoSrc = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString('base64')}`

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '80px',
          fontFamily: 'sans-serif',
          background:
            'linear-gradient(135deg, #eaf1fa 0%, #ffffff 45%, #f2ecf3 100%)',
        }}
      >
        {/* Open badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'rgba(34,197,94,0.12)',
            border: '1px solid rgba(34,197,94,0.35)',
            borderRadius: 999,
            padding: '8px 20px',
            color: '#15803d',
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: 40,
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#22c55e',
              boxShadow: '0 0 10px #22c55e',
            }}
          />
          Aperto ora
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} width={720} height={352} alt="Lelettrica" />

        <div
          style={{
            color: '#366DA1',
            fontSize: 34,
            marginTop: 36,
            fontWeight: 500,
            letterSpacing: '0.01em',
          }}
        >
          Noleggio E-Bike · Riparazioni
        </div>

        <div
          style={{
            color: 'rgba(0,0,0,0.45)',
            fontSize: 20,
            marginTop: 12,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
          }}
        >
          Dro · Lago di Garda
        </div>
      </div>
    ),
    { ...size },
  )
}
