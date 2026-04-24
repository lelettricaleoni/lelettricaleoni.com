# GA4 Custom Events — Piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tracciare con GA4 tutte le interazioni significative del sito (click CTA, telefono, email, mappa, PDF, Instagram, lingua, sezioni viste) condizionando ogni evento alla presenza di `window.gtag` (consenso cookie già dato).

**Architecture:** Utility centralizzata `trackEvent` in `lib/analytics.ts` importata da ciascun componente. Componenti server convertiti a `'use client'` dove necessario per `onClick`. `SectionViewTracker` client component con `IntersectionObserver` (fires once) inserito dentro le sezioni principali.

**Tech Stack:** Next.js 16 App Router, TypeScript, vanilla GA4 (`window.gtag`)

---

## File Map

| Op | File |
|---|---|
| Crea | `lib/analytics.ts` |
| Crea | `components/section-view-tracker.tsx` |
| Modifica | `components/language-switcher.tsx` |
| Modifica | `components/map-embed.tsx` |
| Modifica | `components/hero-section.tsx` |
| Modifica | `components/services-section.tsx` |
| Modifica | `components/map-section.tsx` |
| Modifica | `components/pricing-section.tsx` |
| Modifica | `components/footer.tsx` |

---

### Task 1: Crea lib/analytics.ts

**File:** Crea `lib/analytics.ts`

- [ ] **Step 1: Scrivi il file**

```ts
export function trackEvent(name: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined' || !window.gtag) return
  window.gtag('event', name, params)
}
```

- [ ] **Step 2: Verifica TypeScript**

```bash
npx tsc --noEmit
```

Risultato atteso: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add lib/analytics.ts
git commit -m "feat: add trackEvent analytics utility"
```

---

### Task 2: Crea components/section-view-tracker.tsx

**File:** Crea `components/section-view-tracker.tsx`

- [ ] **Step 1: Scrivi il file**

```tsx
'use client'

import { useEffect, useRef } from 'react'
import { trackEvent } from '@/lib/analytics'

export function SectionViewTracker({ name }: { name: string }) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let fired = false
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !fired) {
          fired = true
          trackEvent('section_view', { section_name: name })
          observer.disconnect()
        }
      },
      { threshold: 0 },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [name])

  return (
    <span
      ref={ref}
      aria-hidden="true"
      className="absolute w-px h-px pointer-events-none"
    />
  )
}
```

- [ ] **Step 2: Verifica TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/section-view-tracker.tsx
git commit -m "feat: add SectionViewTracker component (IntersectionObserver)"
```

---

### Task 3: language-switcher.tsx — evento language_switch

**File:** Modifica `components/language-switcher.tsx`

- [ ] **Step 1: Aggiungi import trackEvent**

Dopo la riga `import { cn } from '@/lib/utils'` aggiungi:

```tsx
import { trackEvent } from '@/lib/analytics'
```

- [ ] **Step 2: Aggiungi onClick a ogni Link lingua**

Sostituisci il `<Link>` esistente (righe 26-44) con:

```tsx
<Link
  key={locale.code}
  href={buildHref(locale.code)}
  title={locale.label}
  onClick={() => {
    if (locale.code !== currentLang) {
      trackEvent('language_switch', { language: locale.code })
    }
  }}
  className={cn(
    'flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-semibold transition-all duration-150',
    currentLang === locale.code
      ? 'bg-slate-100 text-foreground'
      : 'text-muted-foreground hover:text-foreground hover:bg-slate-50'
  )}
>
  <ReactCountryFlag
    countryCode={locale.countryCode}
    svg
    style={{ width: '1.2em', height: '1.2em', borderRadius: '2px' }}
    aria-label={locale.label}
  />
  <span>{locale.label}</span>
</Link>
```

- [ ] **Step 3: Verifica TypeScript + Commit**

```bash
npx tsc --noEmit
git add components/language-switcher.tsx
git commit -m "feat(analytics): track language_switch event"
```

---

### Task 4: map-embed.tsx — evento map_load

**File:** Modifica `components/map-embed.tsx`

- [ ] **Step 1: Aggiungi import trackEvent**

Dopo `import { Button } from '@/components/ui/button'` aggiungi:

```tsx
import { trackEvent } from '@/lib/analytics'
```

- [ ] **Step 2: Aggiorna onClick del Button**

Riga 45 — sostituisci:
```tsx
onClick={() => setLoaded(true)}
```
con:
```tsx
onClick={() => { setLoaded(true); trackEvent('map_load') }}
```

- [ ] **Step 3: Verifica TypeScript + Commit**

```bash
npx tsc --noEmit
git add components/map-embed.tsx
git commit -m "feat(analytics): track map_load event"
```

---

### Task 5: hero-section.tsx — phone_call, cta_click, section_view

**File:** Modifica `components/hero-section.tsx`

- [ ] **Step 1: Aggiungi 'use client' e nuovi import**

In cima al file, aggiungi `'use client'` come prima riga, poi aggiungi gli import:

```tsx
'use client'

import Link from 'next/link'
import Image from 'next/image'
import { MapPin, Phone, Clock, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { trackEvent } from '@/lib/analytics'
import { SectionViewTracker } from '@/components/section-view-tracker'
```

- [ ] **Step 2: Aggiungi SectionViewTracker all'inizio della section**

Dopo `<section className="relative min-h-screen ...">` aggiungi come primo figlio:

```tsx
<SectionViewTracker name="hero" />
```

- [ ] **Step 3: Aggiungi onClick al Link CTA "Come raggiungerci"**

Riga 97 — modifica il Link:

```tsx
<Link
  href={`/${lang}#contatti`}
  onClick={() => trackEvent('cta_click', { cta_name: 'view_map' })}
>
  {dict.hero.cta_map}
</Link>
```

- [ ] **Step 4: Aggiungi onClick al link telefono**

Riga 105 — modifica il tag `<a>`:

```tsx
<a
  href="tel:+393381232434"
  onClick={() => trackEvent('phone_call', { source: 'hero' })}
>
  {dict.hero.cta_contact}
</a>
```

- [ ] **Step 5: Verifica TypeScript + Commit**

```bash
npx tsc --noEmit
git add components/hero-section.tsx
git commit -m "feat(analytics): track cta_click, phone_call, section_view in hero"
```

---

### Task 6: services-section.tsx — section_view

**File:** Modifica `components/services-section.tsx`

Nota: questo componente rimane server component — `SectionViewTracker` è un client component che può essere importato da server components senza problemi.

- [ ] **Step 1: Aggiungi import SectionViewTracker**

Dopo gli import esistenti aggiungi:

```tsx
import { SectionViewTracker } from '@/components/section-view-tracker'
```

- [ ] **Step 2: Aggiungi SectionViewTracker dentro la section**

Dopo `<section id="servizi" className="py-20 bg-white">` aggiungi:

```tsx
<SectionViewTracker name="services" />
```

- [ ] **Step 3: Verifica TypeScript + Commit**

```bash
npx tsc --noEmit
git add components/services-section.tsx
git commit -m "feat(analytics): track section_view in services"
```

---

### Task 7: map-section.tsx — phone_call, email_click, get_directions, section_view

**File:** Modifica `components/map-section.tsx`

- [ ] **Step 1: Aggiungi 'use client' e nuovi import**

```tsx
'use client'

import { MapPin, Phone, Mail, Clock, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MapEmbed } from '@/components/map-embed'
import { trackEvent } from '@/lib/analytics'
import { SectionViewTracker } from '@/components/section-view-tracker'
```

- [ ] **Step 2: Aggiungi SectionViewTracker all'inizio della section**

Dopo `<section id="contatti" className="py-20 bg-white">` aggiungi:

```tsx
<SectionViewTracker name="contacts" />
```

- [ ] **Step 3: Aggiungi onClick al link telefono (riga ~49)**

```tsx
<a
  href="tel:+393381232434"
  className="hover:text-primary transition-colors"
  onClick={() => trackEvent('phone_call', { source: 'contact' })}
>
  +39 338 123 2434
</a>
```

- [ ] **Step 4: Aggiungi onClick al link email (riga ~60)**

```tsx
<a
  href="mailto:info@lelettricaleoni.com"
  className="hover:text-primary transition-colors"
  onClick={() => trackEvent('email_click', { source: 'contact' })}
>
  info@lelettricaleoni.com
</a>
```

- [ ] **Step 5: Aggiungi onClick al link indicazioni (riga ~75)**

```tsx
<a
  href={MAPS_DIRECTIONS_URL}
  target="_blank"
  rel="noopener noreferrer"
  onClick={() => trackEvent('get_directions')}
>
  <ExternalLink size={16} />
  {dict.info.directions}
</a>
```

- [ ] **Step 6: Verifica TypeScript + Commit**

```bash
npx tsc --noEmit
git add components/map-section.tsx
git commit -m "feat(analytics): track phone_call, email_click, get_directions, section_view in contacts"
```

---

### Task 8: pricing-section.tsx — file_download, section_view

**File:** Modifica `components/pricing-section.tsx`

- [ ] **Step 1: Aggiungi 'use client' e nuovi import**

```tsx
'use client'

import { Download, Zap, Bike, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { trackEvent } from '@/lib/analytics'
import { SectionViewTracker } from '@/components/section-view-tracker'
```

- [ ] **Step 2: Aggiungi SectionViewTracker all'inizio della section**

Dopo `<section id="prezzi" className="py-20 bg-slate-50">` aggiungi:

```tsx
<SectionViewTracker name="pricing" />
```

- [ ] **Step 3: Aggiungi onClick al link PDF (riga ~145)**

```tsx
<a
  href="/pdf/Volantino 2023.pdf"
  target="_blank"
  rel="noopener noreferrer"
  onClick={() => trackEvent('file_download', { file_name: 'listino-prezzi', file_extension: 'pdf' })}
>
  <Download size={18} />
  {p.download_pdf}
</a>
```

- [ ] **Step 4: Verifica TypeScript + Commit**

```bash
npx tsc --noEmit
git add components/pricing-section.tsx
git commit -m "feat(analytics): track file_download, section_view in pricing"
```

---

### Task 9: footer.tsx — phone_call, email_click, outbound_click

**File:** Modifica `components/footer.tsx`

- [ ] **Step 1: Aggiungi 'use client' e import trackEvent**

Aggiungi `'use client'` come prima riga, poi aggiungi dopo gli import esistenti:

```tsx
import { trackEvent } from '@/lib/analytics'
```

- [ ] **Step 2: Aggiungi onClick al link telefono (riga ~60)**

```tsx
<a
  href="tel:+393381232434"
  className="hover:text-white transition-colors"
  onClick={() => trackEvent('phone_call', { source: 'footer' })}
>
  +39 338 123 2434
</a>
```

- [ ] **Step 3: Aggiungi onClick al link email (riga ~64)**

```tsx
<a
  href="mailto:info@lelettricaleoni.com"
  className="hover:text-white transition-colors"
  onClick={() => trackEvent('email_click', { source: 'footer' })}
>
  info@lelettricaleoni.com
</a>
```

- [ ] **Step 4: Aggiungi onClick al link Instagram (riga ~71)**

```tsx
<a
  href="https://www.instagram.com/lelettricaleoni"
  target="_blank"
  rel="noopener noreferrer"
  className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
  aria-label="Instagram"
  onClick={() => trackEvent('outbound_click', { link_domain: 'instagram.com' })}
>
  <InstagramIcon size={22} />
  <span className="text-sm">@lelettricaleoni</span>
</a>
```

- [ ] **Step 5: Verifica TypeScript + Commit**

```bash
npx tsc --noEmit
git add components/footer.tsx
git commit -m "feat(analytics): track phone_call, email_click, outbound_click in footer"
```

---

### Task 10: Verifica finale build

- [ ] **Step 1: Build produzione**

```bash
npm run build
```

Risultato atteso: build verde, TypeScript clean, 15 pagine generate.

- [ ] **Step 2: Verifica manuale**

Aprire `http://localhost:3000/it` con le DevTools aperte (Console + Network).

Accettare i cookie analytics, poi verificare che cliccando su:
- Telefono nell'hero → log `phone_call {source: "hero"}` in console (o Network: richiesta a google-analytics.com)
- "Come raggiungerci" → log `cta_click {cta_name: "view_map"}`
- "Carica la mappa" → log `map_load`
- Cambio lingua → log `language_switch {language: "en"}`
- Download PDF → log `file_download`
- Instagram nel footer → log `outbound_click`

Per verificare i section_view senza attendere lo scroll: aprire DevTools → Application → eventListeners oppure aggiungere temporaneamente `console.log` nel `trackEvent`.
