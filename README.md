# Lelettrica — lelettricaleoni.com

Sito web per **Lelettrica di Leoni Gabriele**, noleggio e-bike Flyer e riparazioni bici a Dro (TN), sul Lago di Garda.

## Stack

| Tecnologia | Versione |
|---|---|
| Next.js App Router | 16.2.4 |
| React | 19 |
| TypeScript | — |
| Tailwind CSS | v4 |
| shadcn/ui | — |

## Funzionalità

- **i18n nativo** — IT / EN / DE tramite `proxy.ts` + `app/[lang]/` + dizionari JSON
- **SEO avanzato** — JSON-LD `LocalBusiness` + `BikeShop`, hreflang, OG, sitemap, robots
- **GDPR compliant** — cookie consent via vanilla-cookieconsent v3; GA4 caricato solo dopo consenso
- **GA4 custom events** — `trackEvent` utility consent-aware; 9 eventi (phone_call, cta_click, section_view, file_download, map_load, get_directions, email_click, language_switch, outbound_click)
- **Mappa lazy** — Google Maps iframe caricato solo al click (nessun cookie di terze parti al caricamento)
- **Immagini ottimizzate** — hero desktop + mobile WebP via `next/image`

## Struttura

```
app/
  layout.tsx              # Root layout — html/body, cookie consent
  [lang]/
    layout.tsx            # Metadata locale + JSON-LD
    page.tsx              # Homepage (hero + servizi + prezzi + mappa)
    privacy/page.tsx      # Privacy policy GDPR
  sitemap.ts / robots.ts
  opengraph-image.tsx

components/
  navbar.tsx
  hero-section.tsx
  services-section.tsx
  pricing-section.tsx
  map-section.tsx
  map-embed.tsx           # Lazy iframe Maps (GDPR)
  footer.tsx
  language-switcher.tsx
  cookie-consent.tsx      # vanilla-cookieconsent v3 + GA4 injection
  section-view-tracker.tsx # IntersectionObserver per section_view GA4

lib/
  analytics.ts            # trackEvent() — guard window.gtag (consent-aware)
  utils.ts

messages/
  it.json / en.json / de.json

proxy.ts                  # Rilevamento locale, redirect, header x-locale
```

## Sviluppo locale

```bash
npm install
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000).

## Build

```bash
npm run build
```

TypeScript viene verificato automaticamente durante la build.

## Variabili d'ambiente

Crea un file `.env.local`:

```env
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
NEXT_PUBLIC_MAPS_EMBED_URL=https://www.google.com/maps/embed?...
```

Entrambe opzionali: il sito funziona senza (analytics e mappa semplicemente non si caricano).

## i18n

Il rilevamento della lingua avviene in `proxy.ts` tramite l'header `Accept-Language`. L'utente viene reindirizzato automaticamente a `/it`, `/en` o `/de`. Il cambio manuale avviene tramite il language switcher nella navbar.

Per aggiungere stringhe: modifica i tre file in `messages/` mantenendo le stesse chiavi.

## GA4 Events

Tutti gli eventi sono condizionati al consenso cookie analytics (`window.gtag` presente solo dopo consenso).

| Evento | Parametri | Componente |
|---|---|---|
| `phone_call` | `{ source: 'hero'\|'contact'\|'footer' }` | hero, map-section, footer |
| `email_click` | `{ source: 'contact'\|'footer' }` | map-section, footer |
| `cta_click` | `{ cta_name: 'view_map' }` | hero |
| `get_directions` | — | map-section |
| `map_load` | — | map-embed |
| `file_download` | `{ file_name, file_extension }` | pricing |
| `outbound_click` | `{ link_domain: 'instagram.com' }` | footer |
| `language_switch` | `{ language: 'it'\|'en'\|'de' }` | language-switcher |
| `section_view` | `{ section_name }` | SectionViewTracker in ogni sezione |

## Licenza

Codice proprietario — tutti i diritti riservati.
