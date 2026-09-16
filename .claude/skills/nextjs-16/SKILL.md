---
name: nextjs-16
description: "Use when writing or reviewing Next.js code in this project: routing, layouts, params/searchParams, viewport, Cache Components (\"use cache\", cacheLife, cacheTag, updateTag), or anything touching proxy.ts. Triggers: adding a page or route handler, editing a layout, reading/writing dynamic route params, caching a data fetch, or debugging why a cache isn't invalidating or a page is slower/faster than expected."
---

# Next.js 16 in questo progetto

Questo repository è su una versione con cambiamenti sostanziali rispetto a quanto un modello
sa di default. **Prima di scrivere codice, leggi `node_modules/next/dist/docs/`** (percorso
risolto dalla directory di questo file) — è la regola in `AGENTS.md`, non ripetuta qui.

## Routing e layout — cosa è cambiato

- `middleware.ts` non esiste più: usa `proxy.ts` con `export async function proxy(request)`.
- Il vero root layout (`<html>`/`<body>`) è **`app/[lang]/layout.tsx`**, non `app/layout.tsx`
  (che non esiste). Legge `params.lang`, noto a build time — non un header. Se stai per
  scrivere o leggere `app/layout.tsx`, fermati: probabilmente vuoi quel file.
- `params` e `searchParams` sono sempre `Promise` → `const { lang } = await params`.
- `viewport` è un export separato: `export const viewport: Viewport = { ... }`, mai dentro
  `metadata`.

## Cache Components (`cacheComponents: true` in `next.config.ts`)

- `"use cache"` in cima a una funzione async, seguito da `cacheLife('<profilo>')` e
  `cacheTag('<tag>')`. I profili di `cacheLife` sono dichiarati in `next.config.ts` — un nome
  non dichiarato è un errore di tipo a build time, non a runtime.
- **`headers()`/`cookies()` sono vietati dentro uno scope `"use cache"`, anche indirettamente.**
  `@flags-sdk/vercel` (i feature flag) legge `headers()` internamente: per questo `getFlags()`
  non entra mai in una funzione `"use cache"` — vedi `lib/routes-data.ts`, che separa
  deliberatamente il lavoro DB/R2 (cache-abile) dai flag (letti dynamic, fuori dalla cache).
  Tentare di unirli fa fallire la build con un errore esplicito, non un warning.
- Una pagina che chiama `getFlags()` (o qualsiasi dynamic API) deve precederla con
  `await connection()` — altrimenti, durante il prerender in build, `headers()` va in timeout,
  il fallback fail-open del chiamante intercetta l'errore, e quel valore resta congelato nello
  shell statico finché non c'è un nuovo deploy. È già successo in produzione: un kill-switch
  smetteva di funzionare senza che la build lo segnalasse.
- Invalidazione: `updateTag('nome-tag')` nelle Server Action che cambiano i dati, non
  `revalidatePath`. Cerca gli usi esistenti in `lib/actions/routes.ts` prima di aggiungerne
  uno nuovo — ogni mutazione che tocca `routes` aggiorna sia `routes-list` che
  `route-${id}` che (dal 2026-09-16) `sitemap`.
- Un `cacheLife` generoso è sicuro **quando l'invalidazione è già mirata via tag** su ogni
  percorso di mutazione reale: il TTL diventa allora solo una rete di sicurezza per
  un'invalidazione mancata, non il meccanismo primario di freschezza. Vedi `app/sitemap.ts`
  (TTL 1h/1d, invalidata all'istante da `updateTag('sitemap')`) come esempio recente.

## Trappole verificate dal vivo

- **Una pagina "spenta" da un feature flag risponde 200, non 404.** Le pagine con
  `loading.tsx` vengono trasmesse in streaming, e lo stato HTTP non è più modificabile quando
  `notFound()` scatta più tardi. Next inietta `<meta name="robots" content="noindex">` per
  compensare lato SEO. Non usare mai il codice HTTP per verificare se una sezione è accesa —
  guarda il contenuto della risposta.
- `--webpack` sempre, mai Turbopack, per `dev` e `build`: `next.config.ts` mappa `cesium` su
  `window.Cesium` per evitare che SWC analizzi shader GLSL con sequenze di escape ottali.
  Turbopack ignora quella configurazione.

Per l'architettura i18n (che usa `params.lang`, non un header) vedi la skill `i18n`.
