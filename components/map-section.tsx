import { MapPin, Phone, Mail, Clock, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'

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
    }
  }
}

const MAPS_EMBED_URL =
  'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d4283.21849862206!2d10.904293412981577!3d45.95890037096577!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x4782137485b09a53%3A0x3cef2078cbf6719b!2sLelettrica%20di%20Leoni%20Gabriele!5e1!3m2!1sit!2sit!4v1776352242185!5m2!1sit!2sit'

const MAPS_DIRECTIONS_URL =
  'https://www.google.com/maps/dir/?api=1&destination=Lelettrica+di+Leoni+Gabriele,Via+Roma+90,+Dro+TN'

export function MapSection({ dict }: MapSectionProps) {
  return (
    <section id="contatti" className="py-20 bg-white">
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
                  href="mailto:lelettricaleoni@gmail.com"
                  className="hover:text-primary transition-colors"
                >
                  lelettricaleoni@gmail.com
                </a>
              }
            />
            <InfoRow
              icon={<Clock className="text-primary" size={20} />}
              label={dict.info.hours_label}
              value={dict.info.hours_value}
            />

            <Button asChild className="mt-2 gap-2" size="lg">
              <a href={MAPS_DIRECTIONS_URL} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={16} />
                {dict.info.directions}
              </a>
            </Button>
          </div>

          {/* Map iframe */}
          <div className="rounded-2xl overflow-hidden border border-border shadow-sm aspect-[4/3]">
            <iframe
              src={MAPS_EMBED_URL}
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title={dict.map.title}
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
