'use client'
import { SiStrava, SiKomoot } from 'react-icons/si'
import { trackEvent } from '@/lib/analytics'

// The brands' own colours (the icon takes the text colour, white, on top of them).
const STRAVA_COLOR = '#FC4C02'
const KOMOOT_COLOR = '#6AA127'

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
          style={{ backgroundColor: STRAVA_COLOR }}
          onClick={() => trackEvent('outbound_click', { link_domain: 'strava.com', link_type: 'route' })}
        >
          <SiStrava size={14} aria-hidden="true" />
          {openStrava}
        </a>
      )}
      {komootUrl && (
        <a
          href={komootUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 h-9 px-3 rounded-md text-sm font-medium text-white hover:opacity-90 transition-opacity cursor-pointer"
          style={{ backgroundColor: KOMOOT_COLOR }}
          onClick={() => trackEvent('outbound_click', { link_domain: 'komoot.com', link_type: 'route' })}
        >
          <SiKomoot size={14} aria-hidden="true" />
          {openKomoot}
        </a>
      )}
    </>
  )
}
