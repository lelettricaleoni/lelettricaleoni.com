'use client'
import { siStrava, siKomoot } from 'simple-icons'
import { trackEvent } from '@/lib/analytics'

interface RouteExternalLinksProps {
  stravaUrl?: string | null
  komootUrl?: string | null
  openStrava: string
  openKomoot: string
}

export function RouteExternalLinks({
  stravaUrl,
  komootUrl,
  openStrava,
  openKomoot,
}: RouteExternalLinksProps) {
  return (
    <>
      {stravaUrl && (
        <a
          href={stravaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 h-9 px-3 rounded-md text-sm font-medium text-white hover:opacity-90 transition-opacity cursor-pointer"
          style={{ backgroundColor: `#${siStrava.hex}` }}
          onClick={() => trackEvent('outbound_click', { link_domain: 'strava.com', link_type: 'route' })}
        >
          <svg viewBox="0 0 24 24" fill="white" width={14} height={14} aria-hidden="true">
            <path d={siStrava.path} />
          </svg>
          {openStrava}
        </a>
      )}
      {komootUrl && (
        <a
          href={komootUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 h-9 px-3 rounded-md text-sm font-medium text-white hover:opacity-90 transition-opacity cursor-pointer"
          style={{ backgroundColor: `#${siKomoot.hex}` }}
          onClick={() => trackEvent('outbound_click', { link_domain: 'komoot.com', link_type: 'route' })}
        >
          <svg viewBox="0 0 24 24" fill="white" width={14} height={14} aria-hidden="true">
            <path d={siKomoot.path} />
          </svg>
          {openKomoot}
        </a>
      )}
    </>
  )
}
