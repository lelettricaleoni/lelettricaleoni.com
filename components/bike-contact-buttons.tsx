'use client'
import { Phone, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { trackEvent } from '@/lib/analytics'

export function BikeContactButtons({ dict }: { dict: { bikes: Record<string, string> } }) {
  const d = dict.bikes
  return (
    <div className="flex flex-wrap gap-3">
      <Button asChild className="bg-[#1e3a5f] hover:bg-[#152c4a]">
        <a href="tel:+393381232434" onClick={() => trackEvent('phone_call', { source: 'bike_detail' })}>
          <Phone size={16} className="mr-1.5" /> {d.contact_call}
        </a>
      </Button>
      <Button asChild variant="outline">
        <a href="mailto:info@lelettricaleoni.com" onClick={() => trackEvent('email_click', { source: 'bike_detail' })}>
          <Mail size={16} className="mr-1.5" /> {d.contact_email}
        </a>
      </Button>
    </div>
  )
}
