'use client'

import { useState } from 'react'
import { MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'

const MAPS_EMBED_URL =
  process.env.NEXT_PUBLIC_MAPS_EMBED_URL ??
  'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d4283.21849862206!2d10.904293412981577!3d45.95890037096577!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x4782137485b09a53%3A0x3cef2078cbf6719b!2sLelettrica%20di%20Leoni%20Gabriele!5e1!3m2!1sit!2sit!4v1776352242185!5m2!1sit!2sit'

interface MapEmbedProps {
  title: string
  loadPrompt: string
  loadNotice: string
  loadButton: string
}

export function MapEmbed({ title, loadPrompt, loadNotice, loadButton }: MapEmbedProps) {
  const [loaded, setLoaded] = useState(false)

  if (loaded) {
    return (
      <iframe
        src={MAPS_EMBED_URL}
        width="100%"
        height="100%"
        style={{ border: 0 }}
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        title={title}
      />
    )
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-slate-100">
      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
        <MapPin size={26} className="text-primary" />
      </div>
      <div className="text-center px-6">
        <p className="font-semibold text-foreground text-sm">{loadPrompt}</p>
        <p className="text-xs text-muted-foreground mt-1">{loadNotice}</p>
      </div>
      <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => setLoaded(true)}>
        {loadButton}
      </Button>
    </div>
  )
}
