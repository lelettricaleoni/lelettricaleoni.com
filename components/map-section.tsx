'use client'

import { MapPin, Phone, Mail, Clock, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MapEmbed } from '@/components/map-embed'
import { trackEvent } from '@/lib/analytics'
import { SectionViewTracker } from '@/components/section-view-tracker'

interface MapSectionProps {
  dict: {
    info: {
      title: string
      address_label: string
      phone_label: string
      email_label: string
      hours_label: string
      hours_value: string
      directions: string
    }
    map: {
      title: string
      load_prompt: string
      load_notice: string
      load_button: string
    }
  }
}

const MAPS_DIRECTIONS_URL =
  'https://www.google.com/maps/dir/?api=1&destination=Lelettrica+di+Leoni+Gabriele,Via+Roma+90,+Dro+TN'

export function MapSection({ dict }: MapSectionProps) {
  return (
    <section id="contatti" className="py-20 bg-white">
      <SectionViewTracker name="contacts" />
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-center text-foreground mb-12">
          {dict.info.title}
        </h2>

        <div className="grid lg:grid-cols-2 gap-10 items-start">
          {/* Info card */}
          <div className="space-y-6">
            <InfoRow
              icon={<MapPin className="text-primary" size={20} />}
              label={dict.info.address_label}
              value="Via Roma, 90 — Dro, TN 38074, Italia"
            />
            <InfoRow
              icon={<Phone className="text-primary" size={20} />}
              label={dict.info.phone_label}
              value={
                <a
                  href="tel:+393381232434"
                  className="hover:text-primary transition-colors"
                  onClick={() => trackEvent('phone_call', { source: 'contact' })}
                >
                  +39 338 123 2434
                </a>
              }
            />
            <InfoRow
              icon={<Mail className="text-primary" size={20} />}
              label={dict.info.email_label}
              value={
                <a
                  href="mailto:info@lelettricaleoni.com"
                  className="hover:text-primary transition-colors"
                  onClick={() => trackEvent('email_click', { source: 'contact' })}
                >
                  info@lelettricaleoni.com
                </a>
              }
            />
            <InfoRow
              icon={<Clock className="text-primary" size={20} />}
              label={dict.info.hours_label}
              value={dict.info.hours_value}
            />

            <Button asChild className="mt-2 gap-2" size="lg">
              <a
                  href={MAPS_DIRECTIONS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackEvent('get_directions')}
                >
                <ExternalLink size={16} />
                {dict.info.directions}
              </a>
            </Button>
          </div>

          {/* Map — caricata solo al click per evitare cookie di terze parti */}
          <div className="rounded-2xl overflow-hidden border border-border shadow-sm aspect-[4/3]">
            <MapEmbed
              title={dict.map.title}
              loadPrompt={dict.map.load_prompt}
              loadNotice={dict.map.load_notice}
              loadButton={dict.map.load_button}
            />
          </div>
        </div>
      </div>
    </section>
  )
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        {icon}
      </div>
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
        <div className="text-foreground font-medium">{value}</div>
      </div>
    </div>
  )
}
