# Pagina pubblica del catalogo bici — Implementation Plan

> **Per chi esegue questo piano:** SUB-SKILL RICHIESTA: usa
> superpowers:subagent-driven-development (consigliata) oppure
> superpowers:executing-plans per eseguire il piano attività per attività. I passi usano
> la sintassi checkbox (`- [ ]`) per il tracciamento.

**Obiettivo:** costruire `/[lang]/bikes` (lista) e `/[lang]/bikes/[id]` (dettaglio), la
prima superficie pubblica sul catalogo bici oggi solo admin, con ordinamento manuale,
filtri, analytics e SEO completa fin dal primo giorno.

**Architettura:** stesso scheletro delle pagine percorsi (`app/[lang]/routes/`): query
`"use cache"` dedicate in `lib/bikes-data.ts`, componenti server per le pagine, client
component solo dove serve interattività (filtri, drag & drop, tracking). Tre pezzi già
esistenti nei percorsi si generalizzano invece di duplicarsi: lo short id, il componente
media di copertina, la galleria.

**Tech Stack:** Next.js 16 (Cache Components, `"use cache"`/`cacheTag`/`updateTag`),
Drizzle ORM, `@dnd-kit` (drag & drop, già in uso), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-22-bikes-public-page-design.md`

## Vincoli globali

- Un modello compare in lista/dettaglio solo se ha almeno una bici fisica in `bike_units`
  — mai un contatore o un badge di disponibilità
- Taglie e versioni mostrate nel dettaglio sono solo quelle davvero in garage ora
- Un solo flag `bikes`, nessun figlio (niente `bikePhotos`/`bikeVideos`)
- Query mai dentro un loop `Promise.all` — un incidente di produzione già pagato due volte
  (STATE.md, 2026-09-15) per questa esatta forma di bug
- `--webpack`, mai Turbopack; Server Action per tutto ciò che parte dal client; codice in
  inglese, testi utente in `messages/{it,en,de}.json`
- **Correzione rispetto allo spec**: `app/sitemap.ts` non deve filtrare sul flag `bikes` —
  è una scelta già misurata e documentata nel file stesso (leggere il commento prima di
  toccarlo): valutare i flag lì ha reso quella rotta la più costosa in Active CPU nonostante
  sia visitata a bassa frequenza, per un valore che il codice non usava nemmeno

---

### Task 1: Schema — `display_order` su `bike_models`

**Files:**
- Modify: `lib/db/schema.ts:96-106`
- Create: `lib/db/migrations/0008_<nome_generato>.sql`

**Interfaces:**
- Produces: `bikeModels.displayOrder: number`, colonna `not null default 0`

- [ ] **Step 1: Aggiungere la colonna**

In `lib/db/schema.ts`, trova:

```ts
export const bikeModels = pgTable('bike_models', {
  id:             uuid('id').primaryKey().defaultRandom(),
  categoryId:     uuid('category_id').notNull().references(() => bikeCategories.id),
  priceSurcharge: numeric('price_surcharge'),
  batteryRange:   text('battery_range'),
  motor:          text('motor'),
  gearCount:      text('gear_count'),
  isPublished:    boolean('is_published').notNull().default(false),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
  updatedAt:      timestamp('updated_at').notNull().defaultNow(),
})
```

Sostituisci con:

```ts
export const bikeModels = pgTable('bike_models', {
  id:             uuid('id').primaryKey().defaultRandom(),
  categoryId:     uuid('category_id').notNull().references(() => bikeCategories.id),
  priceSurcharge: numeric('price_surcharge'),
  batteryRange:   text('battery_range'),
  motor:          text('motor'),
  gearCount:      text('gear_count'),
  isPublished:    boolean('is_published').notNull().default(false),
  // Ordine assegnato dall'admin, sia nella lista di /manage/bikes sia nella
  // pagina pubblica /bikes. Cambia solo tramite reorderBikeModelsAction, un
  // drag alla volta nella lista admin — stesso meccanismo di
  // routes.displayOrder.
  displayOrder:   integer('display_order').notNull().default(0),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
  updatedAt:      timestamp('updated_at').notNull().defaultNow(),
})
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: nessun errore.

- [ ] **Step 3: Generare e applicare la migrazione**

```bash
npx drizzle-kit generate
```

Ispeziona il file generato in `lib/db/migrations/`: deve contenere un solo
`ALTER TABLE "bike_models" ADD COLUMN "display_order" integer DEFAULT 0 NOT NULL;`.
Applica con lo strumento MCP `apply_migration` — prima su **dev**, poi su **produzione** —
mai con `drizzle-kit migrate` (vedi Vincoli globali e STATE.md). Dopo ogni applicazione:

```sql
select column_name from information_schema.columns
where table_name = 'bike_models' and column_name = 'display_order';
```

Deve restituire una riga, su entrambi i database.

- [ ] **Step 4: Backfill — ordine per data di creazione**

Su **dev** e poi su **produzione**, via MCP `execute_sql`:

```sql
update bike_models m
set display_order = sub.rn
from (
  select id, row_number() over (order by created_at asc) - 1 as rn
  from bike_models
) sub
where m.id = sub.id;
```

Verifica:

```sql
select id, display_order from bike_models order by display_order;
```

I valori devono essere `0, 1, 2, ...` senza ripetizioni.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations/
git commit -m "Add display_order to bike_models, backfilled by creation date"
```

---

### Task 2: Riordino admin — `SortableList` condivisa + `reorderBikeModelsAction`

**Files:**
- Create: `components/admin/sortable-list.tsx`
- Modify: `components/admin/route-list.tsx` (sostituzione completa)
- Create: `components/admin/bike-model-list.tsx`
- Modify: `lib/actions/bike-models.ts`
- Modify: `app/manage/bikes/page.tsx`

**Interfaces:**
- Consumes: `Route`, `BikeModel` da `@/lib/db`; `RouteListItem` da
  `./route-list-item`; `BikeModelListItem` da `./bike-model-list-item`;
  `reorderRoutesAction` esistente in `lib/actions/routes.ts`
- Produces: `SortableList({ items: { id: string; node: ReactNode }[], onReorder: (orderedIds: string[]) => Promise<void>, errorMessage?: string })`;
  `reorderBikeModelsAction(orderedIds: string[]): Promise<void>`

- [ ] **Step 1: Estrarre la parte generica del drag & drop in `SortableList`**

`RouteList` e `SortableRouteRow` (in `components/admin/route-list.tsx`) non hanno nulla di
specifico ai percorsi a parte il tipo della riga e l'azione chiamata: si generalizzano in
un componente condiviso, riusato tale e quale per le bici.

Crea `components/admin/sortable-list.tsx`:

```tsx
'use client'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  DndContext, closestCenter,
  KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'

export interface SortableItem {
  id: string
  node: ReactNode
}

function SortableRow({ item }: { item: SortableItem }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center gap-2"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="text-muted-foreground hover:text-foreground cursor-grab shrink-0 p-2"
        aria-label="Drag to reorder"
      >
        <GripVertical size={16} />
      </button>
      <div className="flex-1 min-w-0">{item.node}</div>
    </div>
  )
}

export function SortableList({
  items, onReorder, errorMessage = 'Could not save the new order',
}: {
  items: SortableItem[]
  onReorder: (orderedIds: string[]) => Promise<void>
  errorMessage?: string
}) {
  const [rows, setRows] = useState(items)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = rows.findIndex((r) => r.id === active.id)
    const newIndex = rows.findIndex((r) => r.id === over.id)
    const reordered = arrayMove(rows, oldIndex, newIndex)
    setRows(reordered)

    onReorder(reordered.map((r) => r.id)).catch(() => toast.error(errorMessage))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {rows.map((item) => <SortableRow key={item.id} item={item} />)}
        </div>
      </SortableContext>
    </DndContext>
  )
}
```

- [ ] **Step 2: Riscrivere `RouteList` come wrapper sottile**

Sostituisci **tutto** il contenuto di `components/admin/route-list.tsx` con:

```tsx
import { SortableList } from './sortable-list'
import { reorderRoutesAction } from '@/lib/actions/routes'
import { RouteListItem } from './route-list-item'
import type { Route } from '@/lib/db'

interface RouteRow {
  route: Route
  name: string
}

export function RouteList({ initialRoutes }: { initialRoutes: RouteRow[] }) {
  return (
    <SortableList
      items={initialRoutes.map(({ route, name }) => ({
        id: route.id,
        node: <RouteListItem route={route} name={name} />,
      }))}
      onReorder={reorderRoutesAction}
    />
  )
}
```

(Non è più `'use client'`: non ha più stato proprio, `SortableList` sotto lo è già.)

- [ ] **Step 3: Verificare che la sezione percorsi funzioni ancora identica**

```bash
npm run typecheck
npm run test -- lib/actions/routes.test.ts
```

Poi manualmente: `npm run dev`, apri `/manage/routes`, trascina una riga, conferma che
l'ordine persiste dopo un refresh e che la lista pubblica `/it/routes` riflette lo stesso
ordine. Questo è l'unico task che tocca codice percorsi già in produzione — va verificato
prima di proseguire, non dopo.

- [ ] **Step 4: `reorderBikeModelsAction`**

In `lib/actions/bike-models.ts`, trova la riga d'importazione:

```ts
import { eq, and, desc } from 'drizzle-orm'
```

Sostituisci con (nessun altro uso di `desc` nel file: l'unico era nell'ordinamento che il
prossimo step sostituisce):

```ts
import { eq, and, asc } from 'drizzle-orm'
```

Poi trova `getBikeModelsForAdmin`:

```ts
export async function getBikeModelsForAdmin() {
  await requireAdmin()
  return db
    .select({ model: bikeModels, name: bikeModelTranslations.name })
    .from(bikeModels)
    .leftJoin(
      bikeModelTranslations,
      and(eq(bikeModelTranslations.bikeModelId, bikeModels.id), eq(bikeModelTranslations.locale, 'it'))
    )
    .orderBy(desc(bikeModels.createdAt))
}
```

Sostituisci l'ultima riga:

```ts
export async function getBikeModelsForAdmin() {
  await requireAdmin()
  return db
    .select({ model: bikeModels, name: bikeModelTranslations.name })
    .from(bikeModels)
    .leftJoin(
      bikeModelTranslations,
      and(eq(bikeModelTranslations.bikeModelId, bikeModels.id), eq(bikeModelTranslations.locale, 'it'))
    )
    .orderBy(asc(bikeModels.displayOrder))
}
```

Poi aggiungi, alla fine del file:

```ts
export async function reorderBikeModelsAction(orderedIds: string[]) {
  await requireAdmin()
  for (let displayOrder = 0; displayOrder < orderedIds.length; displayOrder++) {
    await db.update(bikeModels).set({ displayOrder }).where(eq(bikeModels.id, orderedIds[displayOrder]))
  }
  updateTag('bike-models')
}
```

Aggiornamenti in sequenza, non `Promise.all`: stessa lezione già pagata su questo stesso
pool a 3 connessioni (STATE.md, incidente 2026-09-15).

- [ ] **Step 5: `BikeModelList`**

Crea `components/admin/bike-model-list.tsx`:

```tsx
import { SortableList } from './sortable-list'
import { reorderBikeModelsAction } from '@/lib/actions/bike-models'
import { BikeModelListItem } from './bike-model-list-item'
import type { BikeModel } from '@/lib/db'

interface BikeModelRow {
  model: BikeModel
  name: string
}

export function BikeModelList({ initialModels }: { initialModels: BikeModelRow[] }) {
  return (
    <SortableList
      items={initialModels.map(({ model, name }) => ({
        id: model.id,
        node: <BikeModelListItem model={model} name={name} />,
      }))}
      onReorder={reorderBikeModelsAction}
    />
  )
}
```

- [ ] **Step 6: Wire `/manage/bikes`**

In `app/manage/bikes/page.tsx`, trova:

```tsx
import { getBikeModelsForAdmin } from '@/lib/actions/bike-models'
import { getAdminUser } from '@/lib/supabase/server'
import { BikeModelListItem } from '@/components/admin/bike-model-list-item'
import { redirect } from 'next/navigation'
```

Sostituisci con:

```tsx
import { getBikeModelsForAdmin } from '@/lib/actions/bike-models'
import { getAdminUser } from '@/lib/supabase/server'
import { BikeModelList } from '@/components/admin/bike-model-list'
import { redirect } from 'next/navigation'
```

Poi trova:

```tsx
      {models.length === 0 ? (
        <p className="text-muted-foreground text-sm">No models yet. Create the first one!</p>
      ) : (
        <div className="space-y-3">
          {models.map(({ model, name }) => (
            <BikeModelListItem key={model.id} model={model} name={name ?? 'Untitled'} />
          ))}
        </div>
      )}
```

Sostituisci con:

```tsx
      {models.length === 0 ? (
        <p className="text-muted-foreground text-sm">No models yet. Create the first one!</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Drag to reorder. The order here is the order shown on the public bikes page.
          </p>
          <BikeModelList initialModels={models.map(({ model, name }) => ({ model, name: name ?? 'Untitled' }))} />
        </>
      )}
```

- [ ] **Step 7: Typecheck e build**

```bash
npm run typecheck
npm run build
```

Expected: nessun errore.

- [ ] **Step 8: Verifica dal vivo**

`npm run dev`, apri `/manage/bikes` con almeno due modelli, trascina una card, conferma
che l'ordine persiste dopo un refresh.

- [ ] **Step 9: Commit**

```bash
git add components/admin/sortable-list.tsx components/admin/route-list.tsx \
        components/admin/bike-model-list.tsx lib/actions/bike-models.ts \
        app/manage/bikes/page.tsx
git commit -m "Add drag-and-drop reordering to the admin bike models list"
```

---

### Task 3: Generalizzare `shortRouteId` → `shortId`

**Files:**
- Modify: `lib/utils.ts`
- Modify: `app/sitemap.ts`
- Modify: `app/[lang]/routes/page.tsx`
- Modify: `components/route-card.tsx`
- Modify: `lib/actions/routes.ts`

**Interfaces:**
- Produces: `shortId(uuid: string): string` (stessa funzione, nuovo nome)

- [ ] **Step 1: Rinominare la funzione**

In `lib/utils.ts`, trova:

```ts
export function shortRouteId(uuid: string): string {
  return uuid.slice(0, 8)
}
```

Sostituisci con:

```ts
export function shortId(uuid: string): string {
  return uuid.slice(0, 8)
}
```

- [ ] **Step 2: Aggiornare i 4 punti che la importano**

In ciascuno di questi file, sostituisci `shortRouteId` con `shortId` (nell'import e in ogni
chiamata — nessun'altra logica cambia):

- `app/sitemap.ts`: `import { shortRouteId } from '@/lib/utils'` → `import { shortId } from '@/lib/utils'`; `const sid = shortRouteId(route.id)` → `const sid = shortId(route.id)`
- `app/[lang]/routes/page.tsx`: stesso import; `${shortRouteId(route.id)}` → `${shortId(route.id)}`
- `components/route-card.tsx`: stesso import; `${shortRouteId(route.id)}` → `${shortId(route.id)}`
- `lib/actions/routes.ts`: stesso import; le 5 occorrenze di `shortRouteId(...)` (righe con
  `updateTag(\`route-${shortRouteId(...)}\`)`) → `shortId(...)`

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: nessun errore, nessun riferimento residuo a `shortRouteId`.

```bash
grep -rn "shortRouteId" --include="*.ts" --include="*.tsx" .
```

Expected: nessun risultato.

- [ ] **Step 4: Test e verifica**

```bash
npm run test
```

Poi manualmente: apri `/it/routes`, apri un percorso, conferma che l'URL è ancora
`/it/routes/<8 caratteri>` come prima.

- [ ] **Step 5: Commit**

```bash
git add lib/utils.ts app/sitemap.ts "app/[lang]/routes/page.tsx" \
        components/route-card.tsx lib/actions/routes.ts
git commit -m "Generalize shortRouteId to shortId, shared by routes and bikes"
```

---

### Task 4: Flag `bikes`

**Files:**
- Modify: `lib/flags.ts`
- Modify: `lib/flags.test.ts`

**Interfaces:**
- Consumes: `flag` da `flags/next`, `vercelAdapter` da `@flags-sdk/vercel` (già importati)
- Produces: `FLAG_DEFAULTS.bikes: boolean`, `definitions.bikes`, override dev
  `FEATURE_BIKES`

- [ ] **Step 1: Scrivere i test che falliscono**

In `lib/flags.test.ts`, nel blocco `describe('applyCascade', ...)`, aggiungi dopo l'ultimo
`it(...)`:

```ts
  it('leaves bikes alone: it has no children of its own', () => {
    const out = applyCascade({ ...allOn(), bikes: false })
    expect(out.bikes).toBe(false)
    expect(out.routes).toBe(true)
  })
```

Nel blocco `describe('readDevOverrides', ...)`, aggiungi dopo l'ultimo `it(...)`:

```ts
  it('reads the bikes override from its own variable', () => {
    expect(readDevOverrides({ FEATURE_BIKES: 'off' })).toEqual({ bikes: false })
  })
```

- [ ] **Step 2: Eseguire i test, verificare che falliscano**

```bash
npm run test -- lib/flags.test.ts
```

Expected: FAIL — `bikes` non esiste ancora in `FLAG_DEFAULTS`.

- [ ] **Step 3: Aggiungere il flag**

In `lib/flags.ts`, trova:

```ts
export const FLAG_DEFAULTS = {
  /** The whole routes section: pages, navbar link, sitemap entries. */
  routes: true,
  /** Photo galleries on route cards and detail pages. */
  routePhotos: true,
  /** Video playback on route detail pages. */
  routeVideos: true,
  /** The Cesium 3D flyover on route detail pages. */
  routeFlyover: true,
  /** The GPX download button and the endpoint that serves the file. */
  routeGpxDownload: true,
} as const
```

Sostituisci con:

```ts
export const FLAG_DEFAULTS = {
  /** The whole routes section: pages, navbar link, sitemap entries. */
  routes: true,
  /** Photo galleries on route cards and detail pages. */
  routePhotos: true,
  /** Video playback on route detail pages. */
  routeVideos: true,
  /** The Cesium 3D flyover on route detail pages. */
  routeFlyover: true,
  /** The GPX download button and the endpoint that serves the file. */
  routeGpxDownload: true,
  /** The whole bikes catalog section: pages, navbar link, sitemap entries. */
  bikes: true,
} as const
```

Trova:

```ts
export const definitions = {
  routes: flag<boolean>({
    key: 'routes',
    adapter: vercelAdapter(),
    defaultValue: true,
    description: 'The whole routes section: pages, navbar link, sitemap entries.',
  }),
```

Aggiungi, subito dopo la chiusura dell'oggetto `definitions` (prima di
`} satisfies Record<FlagName, unknown>`, alla fine dell'ultima voce `routeGpxDownload`):

```ts
  routeGpxDownload: flag<boolean>({
    key: 'route-gpx-download',
    adapter: vercelAdapter(),
    defaultValue: true,
    description: 'The GPX download button and the endpoint that serves the file.',
  }),
  bikes: flag<boolean>({
    key: 'bikes',
    adapter: vercelAdapter(),
    defaultValue: true,
    description: 'The whole bikes catalog section: pages, navbar link, sitemap entries.',
  }),
} satisfies Record<FlagName, unknown>
```

Trova:

```ts
const ENV_NAMES: Record<FlagName, string> = {
  routes: 'FEATURE_ROUTES',
  routePhotos: 'FEATURE_ROUTE_PHOTOS',
  routeVideos: 'FEATURE_ROUTE_VIDEOS',
  routeFlyover: 'FEATURE_ROUTE_FLYOVER',
  routeGpxDownload: 'FEATURE_ROUTE_GPX_DOWNLOAD',
}
```

Sostituisci con:

```ts
const ENV_NAMES: Record<FlagName, string> = {
  routes: 'FEATURE_ROUTES',
  routePhotos: 'FEATURE_ROUTE_PHOTOS',
  routeVideos: 'FEATURE_ROUTE_VIDEOS',
  routeFlyover: 'FEATURE_ROUTE_FLYOVER',
  routeGpxDownload: 'FEATURE_ROUTE_GPX_DOWNLOAD',
  bikes: 'FEATURE_BIKES',
}
```

Non serve toccare `CHILDREN_OF_ROUTES`/`applyCascade`: `bikes` non ha figli.
`FlagsExplorer` e l'endpoint discovery (`app/.well-known/vercel/flags/route.ts`) sono già
generici su `Flags`/`definitions` — nessuna modifica lì.

- [ ] **Step 4: Eseguire i test, verificare che passino**

```bash
npm run test -- lib/flags.test.ts
```

Expected: PASS, tutti i test verdi.

- [ ] **Step 5: Creare il flag su Vercel e verificarlo**

Nel dashboard Vercel Flags, crea il flag `bikes` (key `bikes`). **Verifica subito i valori
per ambiente**: il default alla creazione è Off in produzione e preview, On solo in
sviluppo (trappola nota in STATE.md) — qui coincide con quanto richiesto (la sezione nasce
spenta), ma va comunque confermato guardando il dashboard, non assunto.

- [ ] **Step 6: Commit**

```bash
git add lib/flags.ts lib/flags.test.ts
git commit -m "Add the bikes feature flag"
```

---

### Task 5: Contenuti i18n — namespace `bikes`

**Files:**
- Modify: `messages/it.json`
- Modify: `messages/en.json`
- Modify: `messages/de.json`

**Interfaces:**
- Produces: `dict.bikes.*` (chiavi usate dai task 10-13)

- [ ] **Step 1: `messages/it.json`**

Trova (fine del blocco `routes`, inizio di `login`):

```json
    "share_modal_native": "Condividi"
  },
  "login": {
```

Sostituisci con:

```json
    "share_modal_native": "Condividi"
  },
  "bikes": {
    "page_title": "Le nostre bici",
    "bikes_count": "modelli",
    "page_subtitle": "Il nostro parco bici a noleggio a Dro, sul Lago di Garda: elettriche e muscolari, per ogni tipo di uscita.",
    "filter_all": "Tutte",
    "filter_category": "Categoria",
    "filter_size": "Taglia",
    "filters_button": "Filtri",
    "results_count_one": "{count} modello",
    "results_count_other": "{count} modelli",
    "from_price": "a partire da",
    "price_per_day": "/ giorno",
    "no_results": "Nessuna bici trovata con questi filtri.",
    "no_results_reset": "Reimposta filtri",
    "back_to_list": "Tutte le bici",
    "nav_label": "Bici",
    "specs_title": "Caratteristiche",
    "spec_battery_range": "Autonomia batteria",
    "spec_motor": "Motore",
    "spec_gear_count": "Cambio",
    "sizes_available_title": "Taglie disponibili",
    "versions_available_title": "Versioni disponibili",
    "pricing_title": "Prezzi di noleggio",
    "price_day": "Giorno {day}",
    "price_afternoon": "Pomeriggio / mezza giornata",
    "contact_button": "Richiedi informazioni",
    "contact_call": "Chiama",
    "contact_email": "Scrivi",
    "copyright_notice": "Le foto sono proprietà esclusiva di Lelettrica di Leoni Gabriele. Tutti i diritti riservati."
  },
  "login": {
```

- [ ] **Step 2: `messages/en.json`**

Stessa posizione (trova `"share_modal_native": "Share"` seguito da `},\n  "login": {`):

```json
    "share_modal_native": "Share"
  },
  "bikes": {
    "page_title": "Our bikes",
    "bikes_count": "models",
    "page_subtitle": "Our rental bike fleet in Dro, on Lake Garda: electric and muscular, for every kind of ride.",
    "filter_all": "All",
    "filter_category": "Category",
    "filter_size": "Size",
    "filters_button": "Filters",
    "results_count_one": "{count} model",
    "results_count_other": "{count} models",
    "from_price": "from",
    "price_per_day": "/ day",
    "no_results": "No bikes found with these filters.",
    "no_results_reset": "Reset filters",
    "back_to_list": "All bikes",
    "nav_label": "Bikes",
    "specs_title": "Specifications",
    "spec_battery_range": "Battery range",
    "spec_motor": "Motor",
    "spec_gear_count": "Gears",
    "sizes_available_title": "Available sizes",
    "versions_available_title": "Available versions",
    "pricing_title": "Rental prices",
    "price_day": "Day {day}",
    "price_afternoon": "Afternoon / half day",
    "contact_button": "Request information",
    "contact_call": "Call",
    "contact_email": "Email",
    "copyright_notice": "Photos are the exclusive property of Lelettrica di Leoni Gabriele. All rights reserved."
  },
  "login": {
```

- [ ] **Step 3: `messages/de.json`**

Stessa posizione (trova `"share_modal_native": "Teilen"` seguito da `},\n  "login": {`):

```json
    "share_modal_native": "Teilen"
  },
  "bikes": {
    "page_title": "Unsere Fahrräder",
    "bikes_count": "Modelle",
    "page_subtitle": "Unser Verleih-Fuhrpark in Dro, am Gardasee: elektrisch und muskelbetrieben, für jede Art von Ausflug.",
    "filter_all": "Alle",
    "filter_category": "Kategorie",
    "filter_size": "Größe",
    "filters_button": "Filter",
    "results_count_one": "{count} Modell",
    "results_count_other": "{count} Modelle",
    "from_price": "ab",
    "price_per_day": "/ Tag",
    "no_results": "Mit diesen Filtern wurden keine Fahrräder gefunden.",
    "no_results_reset": "Filter zurücksetzen",
    "back_to_list": "Alle Fahrräder",
    "nav_label": "Fahrräder",
    "specs_title": "Eigenschaften",
    "spec_battery_range": "Akku-Reichweite",
    "spec_motor": "Motor",
    "spec_gear_count": "Schaltung",
    "sizes_available_title": "Verfügbare Größen",
    "versions_available_title": "Verfügbare Versionen",
    "pricing_title": "Mietpreise",
    "price_day": "Tag {day}",
    "price_afternoon": "Nachmittag / halber Tag",
    "contact_button": "Informationen anfordern",
    "contact_call": "Anrufen",
    "contact_email": "Schreiben",
    "copyright_notice": "Die Fotos sind ausschließliches Eigentum von Lelettrica di Leoni Gabriele. Alle Rechte vorbehalten."
  },
  "login": {
```

- [ ] **Step 4: Validare il JSON e typecheck**

```bash
node -e "require('./messages/it.json'); require('./messages/en.json'); require('./messages/de.json'); console.log('ok')"
npm run typecheck
```

Expected: `ok`, nessun errore.

- [ ] **Step 5: Commit**

```bash
git add messages/it.json messages/en.json messages/de.json
git commit -m "Add bikes namespace to UI dictionaries (IT/EN/DE)"
```

---

### Task 6: Query pubblica — lista bici

**Files:**
- Create: `lib/bikes-data.ts`

**Interfaces:**
- Consumes: `db, bikeModels, bikeModelTranslations, bikeCategories, bikeUnits, bikeSizes` da `@/lib/db`
- Produces:
  `getBikeModelsListData(lang: 'it'|'en'|'de'): Promise<{ model: BikeModel; translation: BikeModelTranslation; category: BikeCategory; sizesInGarage: BikeSize[] }[]>`

- [ ] **Step 1: Creare il file con la query lista**

```ts
import { eq, and, asc } from 'drizzle-orm'
import { cacheLife, cacheTag } from 'next/cache'
import {
  db, bikeModels, bikeModelTranslations, bikeCategories, bikeUnits, bikeSizes,
  bikeVersions, media,
} from '@/lib/db'
import { resolveHlsUrl } from '@/lib/media'

type Locale = 'it' | 'en' | 'de'

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((i) => [i.id, i])).values()]
}

// Un modello compare solo se ha almeno una bici fisica in garage: l'inner
// join a bike_units è quello che rende "nessuna bici in garage" equivalente
// a "non in lista", senza un controllo di esistenza separato. selectDistinct
// perché un modello con più unità altrimenti si ripeterebbe una volta per
// unità — dedup sulle sole colonne selezionate (model/translation/category),
// non su bike_units.
export async function getBikeModelsListData(lang: Locale) {
  'use cache'
  cacheLife('routesFlags')
  cacheTag('bike-models')
  cacheTag('bike-units')

  const models = await db
    .selectDistinct({ model: bikeModels, translation: bikeModelTranslations, category: bikeCategories })
    .from(bikeModels)
    .innerJoin(
      bikeModelTranslations,
      and(eq(bikeModelTranslations.bikeModelId, bikeModels.id), eq(bikeModelTranslations.locale, lang))
    )
    .innerJoin(bikeCategories, eq(bikeCategories.id, bikeModels.categoryId))
    .innerJoin(bikeUnits, eq(bikeUnits.bikeModelId, bikeModels.id))
    .where(eq(bikeModels.isPublished, true))
    .orderBy(asc(bikeModels.displayOrder))

  // Taglie davvero in garage, una sola query per tutti i modelli insieme —
  // non una query per modello dentro il map sotto: la stessa forma N+1 che
  // ha bloccato /routes due volte (STATE.md, 2026-09-15) non va reintrodotta
  // qui.
  const sizeLinks = await db
    .selectDistinct({ bikeModelId: bikeUnits.bikeModelId, size: bikeSizes })
    .from(bikeUnits)
    .innerJoin(bikeSizes, eq(bikeSizes.id, bikeUnits.bikeSizeId))

  return models.map(({ model, translation, category }) => ({
    model,
    translation,
    category,
    sizesInGarage: dedupeById(
      sizeLinks.filter((l) => l.bikeModelId === model.id).map((l) => l.size)
    ),
  }))
}
```

(La funzione dettaglio del Task 7 va in questo stesso file, aggiunta sotto — import già
pronti sopra per entrambe: `bikeVersions` e `media` sono usati lì.)

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add lib/bikes-data.ts
git commit -m "Add public bikes list query, filtered by garage availability"
```

---

### Task 7: Query pubblica — dettaglio bici

**Files:**
- Modify: `lib/bikes-data.ts`

**Interfaces:**
- Consumes: come Task 6, più `sql` da `drizzle-orm`
- Produces:
  `getBikeModelDetailData(lang: 'it'|'en'|'de', id: string): Promise<{ model: BikeModel; translation: BikeModelTranslation; category: BikeCategory; allMedia: MediaWithHls[]; sizesInGarage: BikeSize[]; versionsInGarage: BikeVersion[] } | null>`

- [ ] **Step 1: Aggiungere `sql` all'import**

In `lib/bikes-data.ts`, trova:

```ts
import { eq, and, asc } from 'drizzle-orm'
```

Sostituisci con:

```ts
import { eq, and, asc, sql } from 'drizzle-orm'
```

- [ ] **Step 2: Aggiungere la funzione dettaglio**

Alla fine di `lib/bikes-data.ts`, aggiungi:

```ts
export async function getBikeModelDetailData(lang: Locale, id: string) {
  'use cache'
  cacheLife('routesFlags')
  cacheTag('bike-units')

  const [model] = await db.select().from(bikeModels).where(
    and(sql`left(${bikeModels.id}::text, 8) = ${id}`, eq(bikeModels.isPublished, true))
  )
  if (!model) return null

  // Taggato con l'uuid pieno del modello, non con lo short id dell'URL: le
  // action admin in lib/actions/bike-models.ts chiamano già
  // updateTag(`bike-model-${id}`) con quello stesso uuid pieno (il form
  // admin non vede mai lo short id) — deve combaciare esattamente, altrimenti
  // una modifica non invaliderebbe mai questa voce di cache.
  cacheTag(`bike-model-${model.id}`)

  const [translation] = await db.select().from(bikeModelTranslations).where(
    and(eq(bikeModelTranslations.bikeModelId, model.id), eq(bikeModelTranslations.locale, lang))
  )
  const [category] = await db.select().from(bikeCategories).where(eq(bikeCategories.id, model.categoryId))

  const unitsInGarage = await db
    .select({ size: bikeSizes, version: bikeVersions })
    .from(bikeUnits)
    .innerJoin(bikeSizes, eq(bikeSizes.id, bikeUnits.bikeSizeId))
    .innerJoin(bikeVersions, eq(bikeVersions.id, bikeUnits.bikeVersionId))
    .where(eq(bikeUnits.bikeModelId, model.id))

  const sizesInGarage = dedupeById(unitsInGarage.map((u) => u.size))
  const versionsInGarage = dedupeById(unitsInGarage.map((u) => u.version))
  // Nessuna unità: equivalente a un modello non pubblicato — stessa regola
  // della lista, applicata anche qui in caso di link diretto a un modello
  // appena svuotato dal garage.
  if (sizesInGarage.length === 0) return null

  const rawMedia = await db.select().from(media)
    .where(eq(media.bikeModelId, model.id))
    .orderBy(media.displayOrder)

  // Un video senza manifesto pronto viene ignorato, non mostrato "in
  // caricamento": il worker non trascodifica ancora i sorgenti dei modelli
  // di bici (journal 2026-09-17), quindi oggi questo filtra sempre fuori i
  // video — le foto restano. Quando quel gap si chiude, funziona da solo.
  const allMedia = (await Promise.all(
    rawMedia.map(async (m) => {
      if (m.mediaType !== 'video') return m
      const hlsUrl = await resolveHlsUrl(m.storageKey)
      return hlsUrl ? { ...m, hlsUrl } : null
    })
  )).filter((m): m is NonNullable<typeof m> => m !== null)

  return { model, translation, category, allMedia, sizesInGarage, versionsInGarage }
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add lib/bikes-data.ts
git commit -m "Add public bike model detail query"
```

---

### Task 8: Generalizzare il componente media di copertina

**Files:**
- Modify: `components/route-card-media.tsx` → rinominato `components/card-media.tsx`
- Modify: `components/route-card-media-async.tsx`
- Create: `components/bike-card-media-async.tsx`

**Interfaces:**
- Produces: `CardMedia({ media?, gpxPath?, mapCenter?, difficulty?, title }: ...)`;
  `BikeCardMediaAsync({ model: BikeModel; title: string })`

- [ ] **Step 1: Rinominare il file e generalizzare la prop**

Rinomina `components/route-card-media.tsx` in `components/card-media.tsx`. Nel file, la
sola prop specifica ai percorsi è `routeName` (usata solo per il fallback dell'alt text):
tutte le altre (`gpxPath`, `mapCenter`, `difficulty`) restano, sono già opzionali e un
chiamante bici le omette semplicemente.

Trova (2 occorrenze: l'interfaccia e la firma della funzione):

```ts
interface RouteCardMediaProps {
  media?: MediaWithHls
  gpxPath?: string
  mapCenter?: MapCenter
  difficulty?: string | null
  routeName: string
}
```

```ts
export function RouteCardMedia({ media, gpxPath, mapCenter, difficulty, routeName }: RouteCardMediaProps) {
```

Sostituisci rispettivamente con:

```ts
interface CardMediaProps {
  media?: MediaWithHls
  gpxPath?: string
  mapCenter?: MapCenter
  difficulty?: string | null
  title: string
}
```

```ts
export function CardMedia({ media, gpxPath, mapCenter, difficulty, title }: CardMediaProps) {
```

Poi, nello stesso file, l'unico altro uso di `routeName` è nell'`alt` dell'`<Image>`:

```ts
        alt={media.altText ?? routeName}
```

Sostituisci con:

```ts
        alt={media.altText ?? title}
```

- [ ] **Step 2: Aggiornare `RouteCardMediaAsync`**

In `components/route-card-media-async.tsx`, trova:

```ts
import { RouteCardMedia } from './route-card-media'

interface RouteCardMediaAsyncProps {
  route: Route
  routeName: string
}
```

Sostituisci con:

```ts
import { CardMedia } from './card-media'

interface RouteCardMediaAsyncProps {
  route: Route
  routeName: string
}
```

Trova (dentro il componente):

```tsx
  return (
    <RouteCardMedia
      media={coverMedia}
      gpxPath={gpxPath}
      mapCenter={mapCenter}
      difficulty={route.difficulty}
      routeName={routeName}
    />
  )
```

Sostituisci con:

```tsx
  return (
    <CardMedia
      media={coverMedia}
      gpxPath={gpxPath}
      mapCenter={mapCenter}
      difficulty={route.difficulty}
      title={routeName}
    />
  )
```

(`RouteCardMediaAsync` resta com'è per il resto: la logica GPX/mappa è genuinamente
specifica ai percorsi, non si generalizza.)

- [ ] **Step 3: Creare `BikeCardMediaAsync`**

```tsx
import { eq } from 'drizzle-orm'
import { db, media } from '@/lib/db'
import type { BikeModel } from '@/lib/db'
import { resolveHlsUrl } from '@/lib/media'
import { CardMedia } from './card-media'

interface BikeCardMediaAsyncProps {
  model: BikeModel
  title: string
}

// Stessa forma di RouteCardMediaAsync, senza la parte GPX/mappa che le bici
// non hanno. Un video senza manifesto pronto viene scartato, non mostra un
// segnaposto "in caricamento" — il worker non trascodifica ancora i video
// dei modelli di bici (journal 2026-09-17), quindi qui oggi non arriva mai
// un video pronto, solo foto.
export async function BikeCardMediaAsync({ model, title }: BikeCardMediaAsyncProps) {
  const mediaItems = await db
    .select()
    .from(media)
    .where(eq(media.bikeModelId, model.id))
    .orderBy(media.displayOrder)

  const readyMedia = await Promise.all(
    mediaItems.map(async (m) => {
      if (m.mediaType !== 'video') return m
      const hlsUrl = await resolveHlsUrl(m.storageKey)
      return hlsUrl ? { ...m, hlsUrl } : null
    })
  )
  const coverMedia = readyMedia.find(Boolean) ?? undefined

  return <CardMedia media={coverMedia} title={title} />
}
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: nessun errore.

- [ ] **Step 5: Verifica che i percorsi funzionino ancora identici**

`npm run dev`, apri `/it/routes`: le card devono mostrare foto/video di copertina esattamente
come prima.

- [ ] **Step 6: Commit**

```bash
git add components/card-media.tsx components/route-card-media-async.tsx \
        components/bike-card-media-async.tsx
git rm components/route-card-media.tsx 2>/dev/null || true
git commit -m "Generalize the cover media component, add BikeCardMediaAsync"
```

---

### Task 9: Generalizzare `RouteGallery` → `MediaGallery`

**Files:**
- Modify: `components/route-gallery.tsx` → rinominato `components/media-gallery.tsx`
- Modify: `app/[lang]/routes/[id]/page.tsx`

**Interfaces:**
- Produces: `MediaGallery({ media: MediaWithHls[]; title: string })`

- [ ] **Step 1: Rinominare file, componente e prop**

Rinomina `components/route-gallery.tsx` in `components/media-gallery.tsx`.

Nel file, rinomina l'identificatore `routeName` in `title` ovunque compaia (rinomina
puramente meccanica, stesso identico comportamento — nessun'altra logica cambia):
alla dichiarazione del tipo di prop di un sotto-componente interno, alla sua destrutturazione,
in tre punti dove costruisce un `alt` di fallback, e nella firma/destrutturazione della
funzione esportata:

```ts
export function RouteGallery({ media, routeName }: { media: MediaWithHls[]; routeName: string }) {
```

diventa:

```ts
export function MediaGallery({ media, title }: { media: MediaWithHls[]; title: string }) {
```

e ogni prop `routeName={routeName}` passata internamente diventa `title={title}`, ogni
`` `${routeName} ...` `` diventa `` `${title} ...` ``.

- [ ] **Step 2: Aggiornare l'unico chiamante**

In `app/[lang]/routes/[id]/page.tsx`, trova:

```tsx
import { RouteGallery } from '@/components/route-gallery'
```

Sostituisci con:

```tsx
import { MediaGallery } from '@/components/media-gallery'
```

Trova:

```tsx
            <RouteGallery media={allMedia} routeName={translation?.name ?? id} />
```

Sostituisci con:

```tsx
            <MediaGallery media={allMedia} title={translation?.name ?? id} />
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
grep -rn "RouteGallery\|routeName" components/media-gallery.tsx
```

Expected: nessun errore di tipo; il grep non deve trovare `RouteGallery` né `routeName`
residui in quel file.

- [ ] **Step 4: Verifica che il dettaglio percorso funzioni ancora identico**

`npm run dev`, apri il dettaglio di un percorso con foto/video: la galleria deve
comportarsi esattamente come prima.

- [ ] **Step 5: Commit**

```bash
git add components/media-gallery.tsx "app/[lang]/routes/[id]/page.tsx"
git rm components/route-gallery.tsx 2>/dev/null || true
git commit -m "Generalize RouteGallery to MediaGallery, shared by routes and bikes"
```

---

### Task 10: Componente `BikeCard`

**Files:**
- Create: `components/bike-card.tsx`

**Interfaces:**
- Consumes: `priceForDay` da `@/lib/bike-pricing`; `shortId` da `@/lib/utils`; `Badge` da
  `@/components/ui/badge`
- Produces: `BikeCard({ model, translation, category, media, lang, dict })`

- [ ] **Step 1: Creare il componente**

```tsx
import type { ReactNode } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { shortId } from '@/lib/utils'
import { priceForDay } from '@/lib/bike-pricing'
import type { BikeModel, BikeModelTranslation, BikeCategory } from '@/lib/db'

interface BikeCardProps {
  model: BikeModel
  translation: BikeModelTranslation
  category: BikeCategory
  media: ReactNode
  lang: string
  dict: { bikes: Record<string, string> }
}

// Stessa tecnica grid-rows-subgrid di RouteCard: le tre fasce (media, titolo,
// prezzo) sono righe della griglia esterna, non della card, così restano
// allineate fra card vicine anche quando un titolo va su due righe.
export function BikeCard({ model, translation, category, media, lang, dict }: BikeCardProps) {
  const d = dict.bikes

  // day1Price non è mai null nello schema e il giorno 1 è sempre entro
  // maxRentalDays (che è almeno 1): priceForDay ritorna null solo per un
  // giorno che la categoria non offre, e il giorno 1 non lo è mai.
  const priceFrom = priceForDay(category, 1) ?? 0

  return (
    <Link
      href={`/${lang}/bikes/${shortId(model.id)}`}
      className="group grid grid-cols-1 grid-rows-subgrid row-span-3 min-w-0 gap-y-3 mb-6 rounded-xl overflow-hidden border bg-card hover:shadow-md transition-shadow [&>*]:min-w-0"
    >
      <div className="relative h-48 bg-[#c8dae8] overflow-hidden">
        {media}
        <Badge variant="secondary" className="absolute top-3 right-3 shadow-sm z-10">
          {category.name}
        </Badge>
      </div>

      <h3 className="px-4 font-bold text-[#1e3a5f] line-clamp-2 group-hover:text-[#366DA1] transition-colors">
        {translation.name}
      </h3>

      <div className="px-4 pb-4">
        <p className="text-sm text-muted-foreground">
          {d.from_price} <span className="font-bold text-[#1e3a5f]">€{priceFrom}</span> {d.price_per_day}
        </p>
      </div>
    </Link>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add components/bike-card.tsx
git commit -m "Add BikeCard component"
```

---

### Task 11: Componente `BikeFilters`

**Files:**
- Create: `components/bike-filters.tsx`

**Interfaces:**
- Consumes: `BikeCard` dal Task 10; `trackEvent` da `@/lib/analytics`
- Produces: `BikeFilters({ models, lang, dict })`

- [ ] **Step 1: Creare il componente**

```tsx
'use client'
import { useState, type ReactNode } from 'react'
import { SlidersHorizontal, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { trackEvent } from '@/lib/analytics'
import { BikeCard } from './bike-card'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Button } from './ui/button'
import type { BikeModel, BikeModelTranslation, BikeCategory, BikeSize } from '@/lib/db'

interface BikeModelWithData {
  model: BikeModel
  translation: BikeModelTranslation
  category: BikeCategory
  sizesInGarage: BikeSize[]
  media: ReactNode
}

interface BikeFiltersProps {
  models: BikeModelWithData[]
  lang: string
  dict: { bikes: Record<string, string> }
}

const PILL_ACTIVE   = 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
const PILL_INACTIVE = 'bg-background text-muted-foreground border-border hover:border-[#366DA1] hover:text-[#366DA1]'

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((i) => [i.id, i])).values()]
}

export function BikeFilters({ models, lang, dict }: BikeFiltersProps) {
  const d = dict.bikes
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [activeSizeId, setActiveSizeId] = useState<string | null>(null)

  const filtered = models.filter(({ category, sizesInGarage }) => {
    if (activeCategoryId && category.id !== activeCategoryId) return false
    if (activeSizeId && !sizesInGarage.some((s) => s.id === activeSizeId)) return false
    return true
  })

  const availableCategories = uniqueById(models.map((m) => m.category))
  const availableSizes = uniqueById(models.flatMap((m) => m.sizesInGarage))

  const activeFilterCount = (activeCategoryId ? 1 : 0) + (activeSizeId ? 1 : 0)

  function toggle(current: string | null, value: string, set: (v: string | null) => void, filterType: string) {
    set(current === value ? null : value)
    trackEvent('filter_bikes', { filter_type: filterType, filter_value: value })
  }

  function resetFilters() {
    setActiveCategoryId(null)
    setActiveSizeId(null)
  }

  const resultsLabel = (filtered.length === 1 ? d.results_count_one : d.results_count_other)
    .replace('{count}', String(filtered.length))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5 sm:gap-3">
        <Popover>
          <PopoverTrigger asChild>
            <button className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border cursor-pointer transition-colors shrink-0',
              activeFilterCount > 0 ? PILL_ACTIVE : PILL_INACTIVE
            )}>
              <SlidersHorizontal size={15} />
              {d.filters_button}
              {activeFilterCount > 0 && (
                <span className="flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold bg-white text-[#1e3a5f]">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" collisionPadding={8} className="w-72 space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">{d.filter_category}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveCategoryId(null)}
                  className={cn('px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-colors', activeCategoryId === null ? PILL_ACTIVE : PILL_INACTIVE)}
                >
                  {d.filter_all}
                </button>
                {availableCategories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => toggle(activeCategoryId, category.id, setActiveCategoryId, 'category')}
                    className={cn('px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-colors', activeCategoryId === category.id ? PILL_ACTIVE : PILL_INACTIVE)}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">{d.filter_size}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveSizeId(null)}
                  className={cn('px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-colors', activeSizeId === null ? PILL_ACTIVE : PILL_INACTIVE)}
                >
                  {d.filter_all}
                </button>
                {availableSizes.map((size) => (
                  <button
                    key={size.id}
                    onClick={() => toggle(activeSizeId, size.id, setActiveSizeId, 'size')}
                    className={cn('px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-colors', activeSizeId === size.id ? PILL_ACTIVE : PILL_INACTIVE)}
                  >
                    {size.name}
                  </button>
                ))}
              </div>
            </div>

            {activeFilterCount > 0 && (
              <div className="flex justify-end pt-3 border-t">
                <Button variant="outline" size="sm" onClick={resetFilters} className="h-8 text-xs gap-1.5 text-muted-foreground">
                  <RotateCcw size={13} />
                  {d.no_results_reset}
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">{resultsLabel}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 min-h-[50vh] text-center">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-muted">
            <SlidersHorizontal size={24} className="text-muted-foreground" />
          </div>
          <p className="font-medium text-[#1e3a5f]">{d.no_results}</p>
          <button onClick={resetFilters} className="text-sm font-medium text-[#366DA1] cursor-pointer hover:underline underline-offset-4">
            {d.no_results_reset}
          </button>
        </div>
      ) : (
        <div className={cn(
          'grid gap-x-6 gap-y-0',
          filtered.length === 1 ? 'grid-cols-1 max-w-sm' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
        )}>
          {filtered.map(({ model, translation, category, media }) => (
            <BikeCard
              key={model.id}
              model={model}
              translation={translation}
              category={category}
              media={media}
              lang={lang}
              dict={dict}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add components/bike-filters.tsx
git commit -m "Add BikeFilters component (category and size filters)"
```

---

### Task 12: Pagina pubblica lista — `app/[lang]/bikes/page.tsx`

**Files:**
- Create: `app/[lang]/bikes/page.tsx`

**Interfaces:**
- Consumes: `getBikeModelsListData` (Task 6), `BikeFilters` (Task 11),
  `BikeCardMediaAsync` (Task 8), `shortId` (Task 3), `getFlags`, `getDictionary`

- [ ] **Step 1: Creare la pagina**

```tsx
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import type { Metadata } from 'next'
import { getDictionary, hasLocale } from '../dictionaries'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { BikeFilters } from '@/components/bike-filters'
import { BikeCardMediaAsync } from '@/components/bike-card-media-async'
import { SectionViewTracker } from '@/components/section-view-tracker'
import { Skeleton } from '@/components/ui/skeleton'
import { FlagsExplorer } from '@/components/flags-explorer'
import { shortId } from '@/lib/utils'
import { getFlags } from '@/lib/flags'
import { getBikeModelsListData } from '@/lib/bikes-data'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata({
  params,
}: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  if (!hasLocale(lang)) return {}
  await connection()
  const flags = await getFlags()
  if (!flags.bikes) return {}
  const dict = await getDictionary(lang)
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')
  return {
    title: dict.bikes.page_title,
    description: dict.bikes.page_subtitle,
    alternates: {
      canonical: `${siteUrl}/${lang}/bikes`,
      languages: {
        it: `${siteUrl}/it/bikes`,
        en: `${siteUrl}/en/bikes`,
        de: `${siteUrl}/de/bikes`,
        'x-default': `${siteUrl}/it/bikes`,
      },
    },
  }
}

export default async function BikesPage({
  params,
}: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()

  await connection()
  const flags = await getFlags()
  if (!flags.bikes) notFound()

  const modelsWithTranslations = await getBikeModelsListData(lang as 'it' | 'en' | 'de')
  const dict = await getDictionary(lang)

  const modelsWithData = modelsWithTranslations.map(({ model, translation, category, sizesInGarage }) => ({
    model,
    translation,
    category,
    sizesInGarage,
    media: (
      <Suspense fallback={<Skeleton className="h-48 w-full rounded-none" />}>
        <BikeCardMediaAsync model={model} title={translation.name} />
      </Suspense>
    ),
  }))

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: dict.bikes.page_title,
    url: `${siteUrl}/${lang}/bikes`,
    numberOfItems: modelsWithData.length,
    itemListElement: modelsWithData.map(({ model, translation: t }, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${siteUrl}/${lang}/bikes/${shortId(model.id)}`,
      name: t.name,
    })),
  }

  return (
    <>
      <FlagsExplorer flags={flags} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Navbar lang={lang} dict={dict} showRoutes={flags.routes} showBikes={flags.bikes} />
      <main className="w-full pt-24 pb-16">
        <div className="max-w-6xl mx-auto px-12 sm:px-20 space-y-8">
          <div>
            <SectionViewTracker name="bikes_list" />
            <h1 className="text-3xl font-bold text-[#1e3a5f]">{dict.bikes.page_title}</h1>
            <p className="text-muted-foreground mt-2 max-w-xl">{dict.bikes.page_subtitle}</p>
          </div>
          <BikeFilters models={modelsWithData} lang={lang} dict={dict} />
        </div>
      </main>
      <Footer lang={lang} dict={dict} />
    </>
  )
}
```

- [ ] **Step 2: Typecheck e build**

```bash
npm run typecheck
npm run build
```

Expected: nessun errore. Il flag `bikes` è ancora spento in produzione/preview a questo
punto (Task 4) — la pagina esiste ma resta irraggiungibile finché non la si accende.

- [ ] **Step 3: Verifica dal vivo**

`FEATURE_BIKES=on npm run dev`, apri `/it/bikes` con almeno un modello pubblicato e con
unità in garage: la lista deve mostrare la card, i filtri devono funzionare.

- [ ] **Step 4: Commit**

```bash
git add "app/[lang]/bikes/page.tsx"
git commit -m "Add the public bikes list page"
```

---

### Task 13: Pagina pubblica dettaglio — `app/[lang]/bikes/[id]/page.tsx`

**Files:**
- Create: `components/bike-view-tracker.tsx`
- Create: `components/bike-contact-buttons.tsx`
- Create: `app/[lang]/bikes/[id]/page.tsx`

**Interfaces:**
- Consumes: `getBikeModelDetailData` (Task 7), `MediaGallery` (Task 9),
  `priceForDay`/`isRentalDayAllowed` da `@/lib/bike-pricing`, `trackEvent`

- [ ] **Step 1: `BikeViewTracker`**

```tsx
'use client'
import { useEffect } from 'react'
import { trackEvent } from '@/lib/analytics'

export function BikeViewTracker({
  bikeModelId,
  category,
}: {
  bikeModelId: string
  category?: string | null
}) {
  useEffect(() => {
    trackEvent('bike_view', { bike_model_id: bikeModelId, ...(category && { category }) })
  }, [bikeModelId, category])

  return null
}
```

- [ ] **Step 2: `BikeContactButtons`**

```tsx
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
```

Stessi contatti già in `components/footer.tsx` — nessun nuovo canale.

- [ ] **Step 3: La pagina**

```tsx
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'
import { getDictionary, hasLocale } from '../../dictionaries'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { Badge } from '@/components/ui/badge'
import { MediaGallery } from '@/components/media-gallery'
import { BikeViewTracker } from '@/components/bike-view-tracker'
import { BikeContactButtons } from '@/components/bike-contact-buttons'
import { FlagsExplorer } from '@/components/flags-explorer'
import { r2PublicUrl } from '@/lib/r2'
import { getFlags } from '@/lib/flags'
import { getBikeModelDetailData } from '@/lib/bikes-data'
import { priceForDay } from '@/lib/bike-pricing'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata({
  params,
}: { params: Promise<{ lang: string; id: string }> }): Promise<Metadata> {
  const { lang, id } = await params
  if (!hasLocale(lang)) return {}
  await connection()
  const flags = await getFlags()
  if (!flags.bikes) return {}

  const data = await getBikeModelDetailData(lang as 'it' | 'en' | 'de', id)
  if (!data) return {}
  const { translation, allMedia } = data

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')
  const title = translation?.name ?? id
  const description = translation?.description?.slice(0, 155) ?? ''
  const coverPhoto = allMedia.find((m) => m.mediaType === 'photo')
  const ogImage = coverPhoto ? r2PublicUrl(coverPhoto.storageKey) : `${siteUrl}/opengraph-image`

  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: ogImage }], url: `${siteUrl}/${lang}/bikes/${id}` },
    alternates: {
      canonical: `${siteUrl}/${lang}/bikes/${id}`,
      languages: {
        it: `${siteUrl}/it/bikes/${id}`,
        en: `${siteUrl}/en/bikes/${id}`,
        de: `${siteUrl}/de/bikes/${id}`,
        'x-default': `${siteUrl}/it/bikes/${id}`,
      },
    },
  }
}

export default async function BikeDetailPage({
  params,
}: { params: Promise<{ lang: string; id: string }> }) {
  const { lang, id } = await params
  if (!hasLocale(lang)) notFound()

  await connection()
  const flags = await getFlags()
  if (!flags.bikes) notFound()

  const dict = await getDictionary(lang)
  const d = dict.bikes

  const data = await getBikeModelDetailData(lang as 'it' | 'en' | 'de', id)
  if (!data) notFound()
  const { model, translation, category, allMedia, sizesInGarage, versionsInGarage } = data

  const coverPhoto = allMedia.find((m) => m.mediaType === 'photo')
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: translation?.name ?? id,
    description: translation?.description,
    url: `${siteUrl}/${lang}/bikes/${id}`,
    image: coverPhoto ? r2PublicUrl(coverPhoto.storageKey) : undefined,
    category: category.name,
    additionalProperty: [
      ...(model.batteryRange ? [{ '@type': 'PropertyValue', name: 'Battery range', value: model.batteryRange }] : []),
      ...(model.motor ? [{ '@type': 'PropertyValue', name: 'Motor', value: model.motor }] : []),
      ...(model.gearCount ? [{ '@type': 'PropertyValue', name: 'Gears', value: model.gearCount }] : []),
    ],
    offers: {
      '@type': 'Offer',
      price: priceForDay(category, 1) ?? 0,
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
    },
    brand: { '@type': 'Brand', name: 'Lelettrica di Leoni Gabriele' },
  }

  const priceDays = Array.from({ length: category.maxRentalDays }, (_, i) => i + 1)
    .map((day) => ({ day, price: priceForDay(category, day) }))
    .filter((p): p is { day: number; price: number } => p.price !== null)

  return (
    <>
      <FlagsExplorer flags={flags} />
      <BikeViewTracker bikeModelId={model.id} category={category.name} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Navbar lang={lang} dict={dict} showRoutes={flags.routes} showBikes={flags.bikes} />
      <main className="w-full pt-24 pb-8">
        <div className="max-w-6xl mx-auto px-12 sm:px-20 space-y-8">
          <Link href={`/${lang}/bikes`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-[#366DA1]">
            <ArrowLeft size={16} /> {d.back_to_list}
          </Link>

          <MediaGallery media={allMedia} title={translation?.name ?? id} />

          <div className="space-y-2">
            <Badge variant="secondary">{category.name}</Badge>
            <h1 className="text-3xl font-bold text-[#1e3a5f]">{translation?.name ?? id}</h1>
            <p className="text-muted-foreground max-w-2xl">{translation?.description}</p>
          </div>

          {(model.batteryRange || model.motor || model.gearCount) && (
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-[#1e3a5f]">{d.specs_title}</h2>
              <div className="flex flex-wrap gap-2">
                {model.batteryRange && <Badge variant="outline">{d.spec_battery_range}: {model.batteryRange}</Badge>}
                {model.motor && <Badge variant="outline">{d.spec_motor}: {model.motor}</Badge>}
                {model.gearCount && <Badge variant="outline">{d.spec_gear_count}: {model.gearCount}</Badge>}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <h2 className="text-lg font-bold text-[#1e3a5f]">{d.sizes_available_title}</h2>
            <div className="flex flex-wrap gap-2">
              {sizesInGarage.map((size) => <Badge key={size.id} variant="outline">{size.name}</Badge>)}
            </div>
          </div>

          {versionsInGarage.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-[#1e3a5f]">{d.versions_available_title}</h2>
              <div className="flex flex-wrap gap-2">
                {versionsInGarage.map((version) => <Badge key={version.id} variant="outline">{version.name}</Badge>)}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <h2 className="text-lg font-bold text-[#1e3a5f]">{d.pricing_title}</h2>
            <div className="rounded-lg border divide-y">
              {priceDays.map(({ day, price }) => (
                <div key={day} className="flex justify-between px-4 py-2 text-sm">
                  <span>{d.price_day.replace('{day}', String(day))}</span>
                  <span className="font-bold text-[#1e3a5f]">€{price}</span>
                </div>
              ))}
              {category.afternoonPrice !== null && (
                <div className="flex justify-between px-4 py-2 text-sm">
                  <span>{d.price_afternoon}</span>
                  <span className="font-bold text-[#1e3a5f]">€{Number(category.afternoonPrice)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-bold text-[#1e3a5f]">{d.contact_button}</h2>
            <BikeContactButtons dict={dict} />
          </div>
        </div>
      </main>
      <Footer lang={lang} dict={dict} />
    </>
  )
}
```

- [ ] **Step 4: Typecheck e build**

```bash
npm run typecheck
npm run build
```

Expected: nessun errore.

- [ ] **Step 5: Verifica dal vivo**

`FEATURE_BIKES=on npm run dev`, apri il dettaglio di un modello dalla lista: titolo,
descrizione, taglie/versioni disponibili, tabella prezzi, bottoni di contatto devono
essere tutti presenti e corretti.

- [ ] **Step 6: Commit**

```bash
git add components/bike-view-tracker.tsx components/bike-contact-buttons.tsx \
        "app/[lang]/bikes/[id]/page.tsx"
git commit -m "Add the public bike model detail page"
```

---

### Task 14: Navbar e sitemap

**Files:**
- Modify: `components/navbar.tsx`
- Modify: `app/[lang]/page.tsx`
- Modify: `app/[lang]/privacy/page.tsx`
- Modify: `app/[lang]/login/page.tsx`
- Modify: `app/[lang]/routes/page.tsx`
- Modify: `app/[lang]/routes/[id]/page.tsx`
- Modify: `app/sitemap.ts`

**Interfaces:**
- Produces: `Navbar` con prop `showBikes?: boolean` e `dict.bikes?: { nav_label: string }`

- [ ] **Step 1: `Navbar`**

Trova:

```tsx
interface NavbarProps {
  lang: string
  dict: {
    nav: { services: string; pricing: string; contact: string }
    routes?: { nav_label: string }
  }
  /**
   * Whether the routes section is reachable. Passed in rather than read here:
   * this component is rendered from client pages too, so it must not depend on
   * server-only state.
   */
  showRoutes?: boolean
}

export function Navbar({ lang, dict, showRoutes = true }: NavbarProps) {
  const navLinks = [
    { href: `/${lang}`, label: 'Home' },
    { href: `/${lang}#servizi`, label: dict.nav.services },
    { href: `/${lang}#prezzi`, label: dict.nav.pricing },
    { href: `/${lang}#contatti`, label: dict.nav.contact },
    ...(showRoutes && dict.routes ? [{ href: `/${lang}/routes`, label: dict.routes.nav_label }] : []),
  ]
```

Sostituisci con:

```tsx
interface NavbarProps {
  lang: string
  dict: {
    nav: { services: string; pricing: string; contact: string }
    routes?: { nav_label: string }
    bikes?: { nav_label: string }
  }
  /**
   * Whether the routes/bikes sections are reachable. Passed in rather than
   * read here: this component is rendered from client pages too, so it must
   * not depend on server-only state.
   */
  showRoutes?: boolean
  showBikes?: boolean
}

export function Navbar({ lang, dict, showRoutes = true, showBikes = true }: NavbarProps) {
  const navLinks = [
    { href: `/${lang}`, label: 'Home' },
    { href: `/${lang}#servizi`, label: dict.nav.services },
    { href: `/${lang}#prezzi`, label: dict.nav.pricing },
    { href: `/${lang}#contatti`, label: dict.nav.contact },
    ...(showRoutes && dict.routes ? [{ href: `/${lang}/routes`, label: dict.routes.nav_label }] : []),
    ...(showBikes && dict.bikes ? [{ href: `/${lang}/bikes`, label: dict.bikes.nav_label }] : []),
  ]
```

Trova:

```tsx
          {showRoutes && dict.routes && (
            <Link href={`/${lang}/routes`} className="hover:text-primary transition-colors">
              {dict.routes.nav_label}
            </Link>
          )}
        </div>
```

Sostituisci con:

```tsx
          {showRoutes && dict.routes && (
            <Link href={`/${lang}/routes`} className="hover:text-primary transition-colors">
              {dict.routes.nav_label}
            </Link>
          )}
          {showBikes && dict.bikes && (
            <Link href={`/${lang}/bikes`} className="hover:text-primary transition-colors">
              {dict.bikes.nav_label}
            </Link>
          )}
        </div>
```

- [ ] **Step 2: I 5 chiamanti che già passano `showRoutes`**

In ciascuno di questi file, aggiungi `showBikes={...}` accanto a `showRoutes={...}`,
leggendo lo stesso `flags.bikes` che il file già legge per `flags.routes` (stesso
pattern di accesso già in uso in quel file specifico):

`app/[lang]/page.tsx`, trova:
```tsx
      <Navbar lang={lang} dict={dict} showRoutes={flags.routes} />
```
Sostituisci con:
```tsx
      <Navbar lang={lang} dict={dict} showRoutes={flags.routes} showBikes={flags.bikes} />
```

`app/[lang]/privacy/page.tsx`, trova:
```tsx
      <Navbar lang={lang} dict={dict} showRoutes={(await getFlags()).routes} />
```
Sostituisci con:
```tsx
      <Navbar lang={lang} dict={dict} showRoutes={(await getFlags()).routes} showBikes={(await getFlags()).bikes} />
```

`app/[lang]/login/page.tsx`, trova:
```tsx
      <Navbar lang={lang} dict={dict} showRoutes={(await getFlags()).routes} />
```
Sostituisci con:
```tsx
      <Navbar lang={lang} dict={dict} showRoutes={(await getFlags()).routes} showBikes={(await getFlags()).bikes} />
```

`app/[lang]/routes/page.tsx`, trova:
```tsx
      <Navbar lang={lang} dict={dict} showRoutes={flags.routes} />
```
Sostituisci con:
```tsx
      <Navbar lang={lang} dict={dict} showRoutes={flags.routes} showBikes={flags.bikes} />
```

`app/[lang]/routes/[id]/page.tsx`, trova:
```tsx
      <Navbar lang={lang} dict={dict} showRoutes={flags.routes} />
```
Sostituisci con:
```tsx
      <Navbar lang={lang} dict={dict} showRoutes={flags.routes} showBikes={flags.bikes} />
```

(`app/[lang]/update-password/page.tsx` non passa `showRoutes` e non partecipa a questo
pattern: resta invariato.)

- [ ] **Step 3: Sitemap**

**Non** aggiungere un controllo sul flag `bikes` — vedi il commento già presente in cima a
`app/sitemap.ts` e i Vincoli globali di questo piano.

Trova:

```ts
import { db, routes } from '@/lib/db'
import { shortRouteId } from '@/lib/utils'
```

Sostituisci con:

```ts
import { db, routes, bikeModels, bikeUnits } from '@/lib/db'
import { shortId } from '@/lib/utils'
```

Trova:

```ts
  const staticRoutes: { path: string; priority: number; freq: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
    { path: '',          priority: 1.0, freq: 'weekly'  },
    { path: '/routes',   priority: 0.9, freq: 'weekly'  },
    { path: '/privacy',  priority: 0.3, freq: 'monthly' },
  ]
```

Sostituisci con:

```ts
  const staticRoutes: { path: string; priority: number; freq: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
    { path: '',          priority: 1.0, freq: 'weekly'  },
    { path: '/routes',   priority: 0.9, freq: 'weekly'  },
    { path: '/bikes',    priority: 0.9, freq: 'weekly'  },
    { path: '/privacy',  priority: 0.3, freq: 'monthly' },
  ]
```

Trova (le due occorrenze di `shortRouteId` restanti in questo file, già rinominate al
Task 3):

```ts
    const sid = shortId(route.id)
```

(nessuna modifica qui — è già `shortId` dal Task 3, confermare solo che compili)

Trova la fine della funzione, dopo il blocco `try { ... } catch {}` dei percorsi:

```ts
  } catch {}

  return [...staticEntries, ...dynamicEntries]
}
```

Sostituisci con:

```ts
  } catch {}

  try {
    // selectDistinct per lo stesso motivo della lista pubblica (Task 6): un
    // modello con più unità in bike_units non deve ripetersi.
    const publishedModelsWithUnits = await db
      .selectDistinct({ id: bikeModels.id, updatedAt: bikeModels.updatedAt })
      .from(bikeModels)
      .innerJoin(bikeUnits, eq(bikeUnits.bikeModelId, bikeModels.id))
      .where(eq(bikeModels.isPublished, true))

    dynamicEntries.push(...publishedModelsWithUnits.flatMap((model) => {
      const sid = shortId(model.id)
      return locales.map((lang) => ({
        url: `${BASE_URL}/${lang}/bikes/${sid}`,
        lastModified: model.updatedAt,
        changeFrequency: 'monthly' as const,
        priority: 0.7,
        alternates: {
          languages: {
            ...Object.fromEntries(locales.map((l) => [l, `${BASE_URL}/${l}/bikes/${sid}`])),
            'x-default': `${BASE_URL}/it/bikes/${sid}`,
          },
        },
      }))
    }))
  } catch {}

  return [...staticEntries, ...dynamicEntries]
}
```

- [ ] **Step 4: Typecheck e build**

```bash
npm run typecheck
npm run build
```

Expected: nessun errore.

- [ ] **Step 5: Verifica dal vivo**

`FEATURE_BIKES=on npm run dev`, apri `/it` e conferma che il link "Bici" compare in navbar;
apri `/it/sitemap.xml` e conferma che contiene voci `/it/bikes` e `/it/bikes/<id>`.

- [ ] **Step 6: Commit**

```bash
git add components/navbar.tsx "app/[lang]/page.tsx" "app/[lang]/privacy/page.tsx" \
        "app/[lang]/login/page.tsx" "app/[lang]/routes/page.tsx" \
        "app/[lang]/routes/[id]/page.tsx" app/sitemap.ts
git commit -m "Wire the bikes section into the navbar and sitemap"
```

---

### Task 15: Test browser — copertura pagine bici

**Files:**
- Modify: `tests/browser/content.spec.ts`
- Modify: `tests/browser/geometry.spec.ts`

**Interfaces:** nessuna nuova — solo test contro le pagine già costruite

- [ ] **Step 0: Prerequisito — dati reali nell'ambiente di dev/preview**

Questi test girano contro il deployment di anteprima della PR, che dal 2026-09-14 usa il
progetto Supabase e il bucket R2 di **dev**, separati dalla produzione. Prima di scrivere i
test, verifica che nel database di dev esista **almeno un modello di bici pubblicato con
almeno un'unità in garage** — altrimenti "nessuna bici nella lista" sarebbe corretto ma per
un motivo estraneo al codice. Se manca, crealo ora via `/manage/bikes` e
`/manage/bikes/shop` puntati al database di dev.

- [ ] **Step 1: Aggiungere i test di contenuto**

In `tests/browser/content.spec.ts`, aggiungi dopo il test `'una pagina inesistente non
finge di esistere'`:

```ts
test('la lista bici mostra delle card complete', async ({ page }) => {
  await visit(page, '/it/bikes')

  const cards = page.locator('a[href*="/bikes/"]').filter({ has: page.locator('h3') })
  const count = await cards.count()
  expect(count, 'nessuna bici nella lista').toBeGreaterThan(0)

  const first = cards.first()
  await expect(first.locator('h3')).not.toBeEmpty()
})

test('il dettaglio di una bici mostra titolo e prezzo', async ({ page }) => {
  await visit(page, '/it/bikes')

  const href = await page.locator('a[href*="/bikes/"]').filter({ has: page.locator('h3') })
    .first().getAttribute('href')
  expect(href, 'nessuna bici da aprire').toBeTruthy()

  await visit(page, href!)
  await expect(page.locator('h1')).not.toBeEmpty()
  await expect(page.getByText('€', { exact: false }).first()).toBeVisible()
})
```

- [ ] **Step 2: Aggiungere `/it/bikes` alla geometria**

In `tests/browser/geometry.spec.ts`, trova:

```ts
const PAGES = ['/it', '/it/routes', '/it/privacy'] as const
```

Sostituisci con:

```ts
const PAGES = ['/it', '/it/routes', '/it/bikes', '/it/privacy'] as const
```

(Coerente con la lista già esistente: solo le pagine lista, non i dettagli — stessa scelta
già fatta per `/it/routes`.)

Niente budget di prestazione dedicato in `performance.spec.ts` per ora: quella copertura è
nata da un incidente reale sui percorsi (STATE.md), non da una richiesta per le bici —
aggiungerla oggi sarebbe tracciare un budget senza uno storico rispetto a cui misurarlo.
Da riconsiderare se la pagina bici mostra problemi di prestazioni reali.

- [ ] **Step 3: Eseguire la suite in locale (senza `BASE_URL`, contro dev server)**

```bash
FEATURE_BIKES=on npm run dev
```

In un altro terminale:

```bash
BASE_URL=http://localhost:3000 npm run test:browser -- -g "bici"
```

Expected: PASS. Se fallisce per mancanza di dati, torna allo Step 0.

- [ ] **Step 4: Commit**

```bash
git add tests/browser/content.spec.ts tests/browser/geometry.spec.ts
git commit -m "Add browser test coverage for the public bikes pages"
```

---

## Nota post-piano

Aprire la PR, monitorare `verify`/`browser`/CodeQL, mergiare solo a check verdi (nessuna
esenzione admin). Il flag `bikes` resta spento in produzione fino a una verifica esplicita
in produzione stessa (contenuto, non solo codice 200) prima di accenderlo — stessa
disciplina già seguita per la sezione percorsi.
