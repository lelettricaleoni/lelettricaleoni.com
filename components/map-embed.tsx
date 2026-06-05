'use client'

import { useState } from 'react'
import { MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MapLoader } from '@/components/map-loader'
import { trackEvent } from '@/lib/analytics'

const MAPS_EMBED_URL =
  process.env.NEXT_PUBLIC_MAPS_EMBED_URL ??
  'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d4283.21849862206!2d10.904293412981577!3d45.95890037096577!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x4782137485b09a53%3A0x3cef2078cbf6719b!2sLelettrica%20di%20Leoni%20Gabriele!5e1!3m2!1sit!2sit!4v1776352242185!5m2!1sit!2sit'

interface MapEmbedProps {
  title: string
  loadPrompt: string
  loadNotice: string
  loadButton: string
}

type State = 'idle' | 'loading' | 'ready'

export function MapEmbed({ title, loadPrompt, loadNotice, loadButton }: MapEmbedProps) {
  const [state, setState] = useState<State>('idle')

  if (state === 'ready') {
    return (
      <iframe
        src={MAPS_EMBED_URL}
        width="100%"
        height="100%"
        style={{ border: 0 }}
        allowFullScreen
        referrerPolicy="no-referrer-when-downgrade"
        title={title}
      />
    )
  }

  if (state === 'loading') {
    return (
      <div className="w-full h-full relative">
        <MapLoader className="absolute inset-0" />
        <iframe
          src={MAPS_EMBED_URL}
          width="100%"
          height="100%"
          style={{ border: 0, opacity: 0, position: 'absolute', inset: 0 }}
          referrerPolicy="no-referrer-when-downgrade"
          title={title}
          onLoad={() => setState('ready')}
        />
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-muted">
      <div className="w-12 h-12 rounded-full bg-background flex items-center justify-center shadow-sm">
        <MapPin size={22} className="text-primary" />
      </div>
      <div className="text-center px-6">
        <p className="font-semibold text-foreground text-sm">{loadPrompt}</p>
        <p className="text-xs text-muted-foreground mt-1">{loadNotice}</p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="cursor-pointer"
        onClick={() => {
          setState('loading')
          trackEvent('map_load')
        }}
      >
        {loadButton}
      </Button>
    </div>
  )
}
