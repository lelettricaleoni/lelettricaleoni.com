import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = "Lelettrica — Noleggio E-Bike Dro, Lago di Garda"
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #1a3a5c 0%, #366DA1 45%, #795F91 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            color: 'rgba(255,255,255,0.6)',
            fontSize: 22,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            marginBottom: 24,
          }}
        >
          Dro · Lago di Garda · Trentino
        </div>
        <div
          style={{
            color: 'white',
            fontSize: 72,
            fontWeight: 700,
            lineHeight: 1.1,
            textAlign: 'center',
          }}
        >
          Lelettrica
        </div>
        <div
          style={{
            color: 'rgba(255,255,255,0.75)',
            fontSize: 30,
            marginTop: 24,
            textAlign: 'center',
          }}
        >
          Noleggio E-Bike · Riparazioni
        </div>
        <div
          style={{
            marginTop: 48,
            background: 'rgba(255,255,255,0.15)',
            borderRadius: 12,
            padding: '12px 32px',
            color: 'rgba(255,255,255,0.9)',
            fontSize: 20,
          }}
        >
          ● Aperto tutti i giorni 09:00 – 19:00
        </div>
      </div>
    ),
    { ...size }
  )
}
