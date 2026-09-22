# Design Spec — Pagina pubblica del catalogo bici

**Data**: 2026-09-22
**Branch**: `main`
**Stato**: approvato, pronto per il piano di implementazione

---

## Obiettivo

Prima superficie pubblica costruita sul catalogo bici (`bike_models`, `bike_categories`,
`bike_sizes`, `bike_versions`, `bike_units`), oggi solo admin — esattamente il passo
successivo lasciato esplicitamente fuori scope in
`docs/superpowers/specs/2026-09-17-bike-models-and-inventory-design.md`. Stessa forma della
sezione percorsi: una pagina lista con filtri e una pagina di dettaglio per modello.

### Dentro questa fase

- `/[lang]/bikes` — lista dei modelli pubblicati **con almeno una bici fisica in garage**,
  filtrabile per categoria e per taglia
- `/[lang]/bikes/[id]` — dettaglio: galleria foto/video, descrizione, taglie e versioni
  disponibili (solo quelle con unità in garage), tabella prezzi della categoria, bottone di
  contatto
- Ordinamento manuale drag & drop dei modelli in lista, stesso meccanismo appena costruito
  per i percorsi
- Flag Vercel `bikes`, la sezione nasce spenta
- Analytics (eventi coerenti col resto del sito) e SEO (metadata, hreflang, JSON-LD,
  sitemap) fin dal primo giorno, non un passo successivo

### Fuori da questa fase

- Badge o contatore di disponibilità in tempo reale — la presenza/assenza di unità in
  garage decide solo se un modello compare, non viene mai mostrata come numero o stato
- Collegamento bici↔percorsi ("con quali bici si può completare questo giro") — tocca lo
  schema di `routes` (`bike_types`), è un lavoro a sé
- Prenotazioni, disponibilità in tempo reale, integrazione Stripe
- Video funzionante nel dettaglio: il worker non trascodifica ancora i sorgenti di
  `private/bike-model-videos/` (gap noto, journal 2026-09-17). La galleria si comporta come
  già fa oggi per un video di percorso non ancora pronto: lo ignora finché non ha un
  manifesto. Quando quel gap si chiude, funziona qui senza altre modifiche.

---

## Decisioni chiave, e perché

**Un modello compare solo se ha almeno una bici fisica in garage, ma la disponibilità non
si mostra mai come numero o badge.** Deciso da Kevin: la pagina è un catalogo/listino, non
un tracciamento scorte in tempo reale — quello richiederebbe un sistema di prenotazione che
non esiste ancora. La presenza/assenza è un filtro silenzioso, non un'informazione
mostrata.

**Le taglie e versioni mostrate nel dettaglio sono quelle davvero in garage ora, non quelle
astrattamente ammesse dal modello.** Stessa logica sopra applicata in modo coerente a
entrambe: un modello può ammettere in teoria taglie S/M/L, ma se in garage c'è solo la M,
il dettaglio pubblico mostra solo la M.

**Ordinamento manuale, non cronologico.** Stessa scelta già fatta per i percorsi
(`display_order` + drag & drop): coerenza col pattern appena introdotto, e controllo su
quali modelli mettere in evidenza per primi.

**Filtro per categoria e per taglia**, non solo categoria. La categoria resta il filtro
principale (determina il prezzo), la taglia è un filtro aggiuntivo per chi cerca già una
misura precisa.

**JSON-LD di tipo `Product`, non `ExercisePlan`.** Il dettaglio percorso usa `ExercisePlan`
perché descrive un'attività; un modello di bici è un articolo noleggiabile con un prezzo —
`Product` con un `Offer` è il tipo corretto per un rich snippet coerente con quello che la
pagina rappresenta davvero.

**Analytics e SEO non sono un'aggiunta successiva**, sono nella prima versione: stesso
catalogo eventi già in uso nel resto del sito (`lib/analytics.ts`), stesso schema di
metadata/hreflang/JSON-LD delle pagine percorso. Kevin lo ha richiesto esplicitamente come
priorità fissa, non solo per questa feature.

**I tag cache (`bike-models`, `bike-model-${id}`, `bike-units`) esistono già** —
`lib/actions/bike-models.ts` e `lib/actions/bike-units.ts` chiamano già `updateTag()` su
questi nomi, anche se oggi nessuna funzione `"use cache"` li consuma. Le nuove query
pubbliche li useranno così come sono; le action admin esistenti non si toccano.

**`shortRouteId` diventa `shortId`, generico.** È già una funzione a una riga
(`uuid.slice(0, 8)`), senza nulla di specifico ai percorsi nel corpo — solo il nome lo era.
Un'unica funzione condivisa invece di duplicarla per le bici.

**`RouteGallery` si generalizza invece di duplicarsi.** L'unica prop specifica ai percorsi è
`routeName` (usata per l'alt text), rinominata in `title`. Nessun'altra logica nel
componente dipende dai percorsi — la tabella `media` è già condivisa tra le due entità.

---

## Modello dati

### Nuova colonna

```
bike_models
  display_order  integer not null default 0   -- stessa migrazione/backfill dei percorsi:
                                                 per data di creazione sui modelli esistenti
```

### Query pubbliche — `lib/bikes-data.ts`

Stesso pattern di `lib/routes-data.ts`: `"use cache"`, `cacheLife('routesFlags')` (stesso
profilo, non serve uno nuovo), tag dedicati.

```
getBikeModelsListData(lang)
  cacheTag('bike-models')
  cacheTag('bike-units')
  → modelli pubblicati, join a bike_model_translations (locale) e bike_categories,
    filtrati a "esiste almeno una riga in bike_units per questo modello"
    (inner join/EXISTS, non una select+filter in JS)
  → in una seconda query, taglie in garage per modello: stesso pattern due-query-poi-merge
    già usato in getPublishedModelsWithAllowedOptions (lib/actions/bike-units.ts), ma
    filtrato su bike_units invece che su bike_model_sizes
  → ordinato per display_order

getBikeModelDetailData(lang, id, mediaFlags)
  cacheTag(`bike-model-${id}`)
  cacheTag('bike-units')
  → modello (via shortId, stesso sql`left(id::text, 8) = ${id}` dei percorsi) + traduzione
    + categoria + media (foto sempre, video solo se ha un manifesto pronto — stessa
    resolveHlsUrl già usata da getRouteDetailData)
  → taglie E versioni in garage per questo modello, stessa query di gruppo
```

### Ordinamento

`reorderBikeModelsAction` in `lib/actions/bike-models.ts`, stessa forma sequenziale (non
`Promise.all`, stessa lezione già pagata sul pool a 3 connessioni) di `reorderRoutesAction`.
Componenti UI: generalizzazione di `RouteList`/`SortableRouteRow` in componenti condivisi
parametrizzati sull'azione e sul render della singola riga, non una copia-incolla.

---

## Pagine pubbliche

Stesso scheletro di `app/[lang]/routes/` e `routes/[id]`: niente `generateStaticParams`
(stessa ragione documentata in STATE.md sull'incidente del 2026-09-11), `connection()`
prima di leggere i flag, `notFound()` se `flags.bikes` è spento.

`app/[lang]/bikes/page.tsx`
- `generateMetadata`: title/description da dizionario, `alternates.canonical` +
  `languages` IT/EN/DE/x-default
- JSON-LD `ItemList` di `Product`, stesso schema della lista percorsi
- `SectionViewTracker` con `section_name: 'bikes_list'`
- `components/bike-filters.tsx` (mirror di `route-filters.tsx`): filtro categoria + taglia,
  `trackEvent('filter_bikes', { filter_type, filter_value })`
- Card per modello: foto di copertina in un confine Suspense separato (stessa
  degradazione controllata di R2 già usata per i percorsi), nome, categoria, prezzo da
  `priceForDay(category, 1)`

`app/[lang]/bikes/[id]/page.tsx`
- `generateMetadata`: OG image dalla prima foto (fallback `/opengraph-image`), stesso
  schema di alternates dei percorsi
- JSON-LD `Product`: `name`, `description`, `image`, `category` (nome categoria),
  `additionalProperty` per autonomia batteria/motore/cambio, `offers: { "@type": "Offer",
  price: priceForDay(category, 1), priceCurrency: "EUR", availability:
  "https://schema.org/InStock" }` — `InStock` è sempre corretto qui perché il modello
  compare solo quando ha unità in garage
- `BikeViewTracker` (mirror di `RouteViewTracker`):
  `trackEvent('bike_view', { bike_model_id, category })`
- Galleria: `RouteGallery` generalizzato (prop `title` invece di `routeName`)
- Taglie/versioni disponibili: badge, dalla query di gruppo sopra
- Tabella prezzi: iterazione `priceForDay(category, day)` per `day` da 1 a
  `category.maxRentalDays`, più riga pomeriggio se `afternoonPrice` non è nullo — riuso
  diretto di `lib/bike-pricing.ts`, nessuna nuova logica di calcolo
- Bottone "Richiedi informazioni": `tel:+393381232434` / `mailto:info@lelettricaleoni.com`
  (stessi contatti del footer, non nuovi), `trackEvent('phone_call'/'email_click', {
  source: 'bike_detail' })`

### Navbar e sitemap

`components/navbar.tsx`: prop `showBikes` mirror di `showRoutes`, voce `dict.bikes.nav_label`.

`app/sitemap.ts`: voci `/bikes` e `/bikes/[id]` per i modelli pubblicati con disponibilità,
gated da `flags.bikes`, stesso `alternates.languages` per hreflang.

---

## Feature flag

`lib/flags.ts`: un solo flag `bikes` (niente figli tipo `bikePhotos`/`bikeVideos` per ora —
YAGNI, si aggiungono se servono davvero). Creato **spento** in produzione e preview — che è
anche il default alla creazione di un nuovo flag Vercel (trappola nota in STATE.md), quindi
qui coincide esattamente con quanto richiesto: la sezione nasce spenta finché non è pronta.
Va comunque verificato esplicitamente dopo la creazione, come da regola.

---

## Contenuti e i18n

Nuovo namespace `bikes` in `messages/{it,en,de}.json`, stessa forma di `routes`: titoli,
etichette filtri, etichette specifiche/prezzo, testo del bottone di contatto, `nav_label`.
Scritti direttamente in IT/EN/DE — sono testo statico di interfaccia, non passano da Azure
Translator (quello traduce solo `name`/`description` di ogni modello, già esistente in
`bike_model_translations`).

---

## Rischi noti

| Rischio | Mitigazione |
|---|---|
| La query "modelli con unità in garage" diventa un altro N+1 dentro un `Promise.all` | Stessa lezione di STATE.md (incidente 2026-09-15): join/EXISTS per il filtro esistenza, una singola query di gruppo per taglie/versioni — mai una query per modello dentro un loop |
| Generalizzare `RouteGallery`/`shortRouteId`/`RouteList` rompe qualcosa nei percorsi | Rinomina minima e verificata (prop/nome funzione), nessuna logica toccata; il piano di implementazione include una verifica esplicita che la sezione percorsi funzioni ancora identica dopo ogni generalizzazione |
| Il flag `bikes` nasce acceso per errore (come già successo il 2026-09-09 con i cinque flag percorsi) | Verifica esplicita dei valori per ambiente subito dopo la creazione, prima di aprire la PR che espone la pagina |
| JSON-LD `Product`/`Offer` con un solo prezzo (giorno 1) semplifica un listino a più fasce | Scelta deliberata: schema.org non ha un tipo pulito per prezzi scalari su più giorni: un singolo `Offer` d'ingresso è corretto per i motori di ricerca e non impegna a mantenere una struttura più complessa per un guadagno SEO marginale |
