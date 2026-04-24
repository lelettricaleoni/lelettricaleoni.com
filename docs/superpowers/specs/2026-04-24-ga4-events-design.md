# GA4 Custom Events — Design Spec

**Goal:** Tracciare tutte le interazioni significative del sito con GA4, condizionato al consenso cookie.

**Approccio:** Utility `trackEvent` in `lib/analytics.ts` con guard `window.gtag`. Componenti convertiti a `'use client'` dove necessario per aggiungere `onClick`. `SectionViewTracker` client component con IntersectionObserver per i section views.

---

## Nuovi file

### `lib/analytics.ts`
Utility centralizzata:
```ts
export function trackEvent(name: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined' || !window.gtag) return
  window.gtag('event', name, params)
}
```

### `components/section-view-tracker.tsx`
Client component con IntersectionObserver, fires once at 30% visibility:
- Props: `name: string`
- Inserito come primo figlio nelle sezioni principali

---

## Eventi

| Evento GA4 | Parametri | Componenti |
|---|---|---|
| `phone_call` | `{ source: 'hero'\|'contact'\|'footer'\|'404' }` | hero-section, map-section, footer, not-found |
| `email_click` | `{ source: 'contact'\|'footer'\|'privacy' }` | map-section, footer, privacy/page |
| `get_directions` | — | map-section |
| `file_download` | `{ file_name: 'listino-prezzi', file_extension: 'pdf' }` | pricing-section |
| `map_load` | — | map-embed |
| `outbound_click` | `{ link_domain: 'instagram.com' }` | footer |
| `language_switch` | `{ language: 'it'\|'en'\|'de' }` | language-switcher |
| `cta_click` | `{ cta_name: 'view_map'\|'contact' }` | hero-section |
| `section_view` | `{ section_name: 'hero'\|'services'\|'pricing'\|'contacts' }` | SectionViewTracker in ogni sezione |

---

## Componenti da modificare

| File | Cambiamento |
|---|---|
| `lib/analytics.ts` | Nuovo |
| `components/section-view-tracker.tsx` | Nuovo |
| `components/hero-section.tsx` | Aggiungi `'use client'`, onClick su tel + CTA, SectionViewTracker |
| `components/map-section.tsx` | Aggiungi `'use client'`, onClick su tel/email/directions, SectionViewTracker |
| `components/map-embed.tsx` | Già client — trackEvent nel onClick esistente |
| `components/pricing-section.tsx` | Aggiungi `'use client'`, onClick su PDF download, SectionViewTracker |
| `components/footer.tsx` | Aggiungi `'use client'`, onClick su tel/email/Instagram |
| `components/language-switcher.tsx` | Già client — onClick su ogni lingua |
| `components/services-section.tsx` | SectionViewTracker (nessun onClick) |
| `app/[lang]/privacy/page.tsx` | Già server-rendered — wrappare email in client component minimo |
| `app/not-found.tsx` | Aggiungi `'use client'`, onClick su tel |
