# Categorie percorso e collegamento col catalogo bici — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promuovere i tipi bici dei percorsi da costante nel codice a tabella
admin-editabile, collegarla al catalogo bici, e mostrare su ogni percorso le
bici del catalogo adatte a farlo.

**Architecture:** Nuova tabella `route_bike_categories` (id, name,
displayOrder) con CRUD admin identico a `bike_versions`. `bike_categories`
riceve un FK opzionale `routeCategoryId` verso quella tabella. `routes.bikeTypes`
resta un array di testo invariato, ma il form admin e il filtro pubblico
smettono di leggere la costante `BIKE_TYPES` e leggono la nuova tabella. Una
nuova query fa il join a runtime tra `route.bikeTypes` e le categorie bici
collegate, per popolare la card "Bici adatte a questo giro".

**Tech Stack:** Next.js 16 (Server Actions, Cache Components), Drizzle ORM,
Postgres via Supabase, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-09-23-route-bike-categories-design.md`

## Global Constraints

- Niente `drizzle-kit migrate` — genera l'SQL con `drizzle-kit generate`,
  applicalo con lo strumento MCP `apply_migration` (dev prima, poi
  produzione solo con conferma esplicita — vedi Task 2). `drizzle-kit
  migrate` fallisce in silenzio da quando esiste una migrazione applicata
  via MCP (STATE.md).
- Codice in inglese ovunque, anche nel pannello admin — solo
  `messages/*.json` è in lingua.
- Mai un N+1 dentro un `Promise.all`: la query per i suggerimenti bici è UN
  join, non un giro per ogni tipo bici del percorso.
- Segui i pattern già in uso, non inventarne di nuovi: `bike-version-list.tsx`
  per la lista CRUD, `bike-options.ts` per le server action, `bikes-data.ts`
  per le query cache-ate.

---

### Task 1: Schema — nuova tabella e nuovo campo

**Files:**
- Modify: `lib/db/schema.ts`

**Interfaces:**
- Produces: `routeBikeCategories` (tabella Drizzle), `RouteBikeCategory`
  (tipo inferito), `NewRouteBikeCategory` (tipo insert), campo
  `bikeCategories.routeCategoryId`

- [ ] **Step 1: Aggiungi la tabella `route_bike_categories`**

Vicino alla definizione di `bikeVersions` (stessa forma esatta):

```ts
export const routeBikeCategories = pgTable('route_bike_categories', {
  id:           uuid('id').primaryKey().defaultRandom(),
  name:         text('name').notNull().unique(),
  displayOrder: integer('display_order').notNull().default(0),
})

export type RouteBikeCategory = typeof routeBikeCategories.$inferSelect
export type NewRouteBikeCategory = typeof routeBikeCategories.$inferInsert
```

- [ ] **Step 2: Aggiungi il campo `routeCategoryId` a `bikeCategories`**

Nella definizione esistente di `bikeCategories`, subito dopo `displayOrder`:

```ts
  routeCategoryId:  uuid('route_category_id').references(() => routeBikeCategories.id),
```

`routeBikeCategories` deve essere dichiarata PRIMA di `bikeCategories` nel
file (Drizzle richiede che la tabella referenziata da un `.references()`
esista già nello scope) — spostala subito prima del blocco
`// Prices: numeric()...` che introduce `bikeCategories`, se non è già lì.

- [ ] **Step 3: Verifica TypeScript**

Run: `npx tsc --noEmit`
Expected: nessun errore

- [ ] **Step 4: Commit**

```bash
git add lib/db/schema.ts
git commit -m "Add route_bike_categories table and bike_categories.routeCategoryId"
```

---

### Task 2: Migrazione — schema + seed dai dati reali

**Files:**
- Create: `lib/db/migrations/0009_route_bike_categories.sql` (il nome esatto
  del suffisso lo decide `drizzle-kit generate`, non forzarlo a mano)

**Interfaces:**
- Consumes: lo schema di Task 1
- Produces: tabella `route_bike_categories` popolata con 5 righe, 5 delle 7
  righe di `bike_categories` collegate

- [ ] **Step 1: Genera la migrazione**

Run: `npx drizzle-kit generate`
Expected: un nuovo file in `lib/db/migrations/000X_<nome>.sql` con
`CREATE TABLE "route_bike_categories"` e
`ALTER TABLE "bike_categories" ADD COLUMN "route_category_id" uuid`

- [ ] **Step 2: Aggiungi il seed alla fine dello stesso file di migrazione**

I 5 nomi sono quelli già usati oggi dai percorsi in produzione (verificato
con una query diretta durante il brainstorming — non inventati), i
collegamenti sono quelli decisi nella spec:

```sql
INSERT INTO "route_bike_categories" ("name", "display_order") VALUES
  ('eMTB', 0),
  ('MTB', 1),
  ('Gravel', 2),
  ('E-Gravel', 3),
  ('E-City Bike', 4);

UPDATE "bike_categories" SET "route_category_id" = (SELECT "id" FROM "route_bike_categories" WHERE "name" = 'eMTB')
  WHERE "name" IN ('eMTB Front', 'eMTB Full • Alu', 'eMTB Full • Carbon');
UPDATE "bike_categories" SET "route_category_id" = (SELECT "id" FROM "route_bike_categories" WHERE "name" = 'Gravel')
  WHERE "name" = 'Gravel';
UPDATE "bike_categories" SET "route_category_id" = (SELECT "id" FROM "route_bike_categories" WHERE "name" = 'MTB')
  WHERE "name" = 'MTB';
UPDATE "bike_categories" SET "route_category_id" = (SELECT "id" FROM "route_bike_categories" WHERE "name" = 'E-City Bike')
  WHERE "name" = 'City eBike';
-- 'City Bike' resta senza collegamento: nessun percorso ne ha bisogno oggi.
```

Questo seed è pensato per i nomi categoria **di produzione**
(`eMTB Front`, `eMTB Full • Alu`, `eMTB Full • Carbon`, `Gravel`, `City eBike`,
`City Bike`, `MTB`). Il database di sviluppo ha oggi una sola categoria di
prova (`Front`, senza nessuno di questi nomi): gli `UPDATE` semplicemente non
troveranno corrispondenze lì, il che va bene — l'ambiente di sviluppo non ha
dati realistici da collegare, e chi lo usa può creare le proprie categorie
di prova e collegarle a mano dal pannello (Task 6).

- [ ] **Step 3: Applica la migrazione su dev con l'MCP, non con `drizzle-kit migrate`**

Usa lo strumento MCP `apply_migration` (progetto `supabase-dev`) col
contenuto SQL del file generato.

- [ ] **Step 4: Verifica su dev con una query diretta**

Con lo strumento MCP `execute_sql` (progetto `supabase-dev`):

```sql
SELECT name, display_order FROM route_bike_categories ORDER BY display_order;
```

Expected: le 5 righe del seed.

- [ ] **Step 5: STOP — chiedi conferma esplicita prima di toccare produzione**

Non applicare la stessa migrazione al progetto Supabase di produzione senza
che l'utente lo confermi esplicitamente in questa sessione: è uno schema
change su un database condiviso col sito live, diverso da un cambiamento
solo-dev. Riporta il contenuto della migrazione e aspetta il via libera,
poi ripeti Step 3-4 con lo strumento MCP del progetto `supabase` (senza
`-dev`) — verificando con la stessa query di Step 4 che le 5 righe seed e i
collegamenti esistano davvero anche lì, dato che i nomi categoria reali
esistono solo in produzione.

- [ ] **Step 6: Commit**

```bash
git add lib/db/migrations/
git commit -m "Migration: route_bike_categories table, seeded from production data"
```

---

### Task 3: Server actions — CRUD categorie percorso

**Files:**
- Modify: `lib/actions/bike-options.ts`

**Interfaces:**
- Consumes: `routeBikeCategories` da Task 1
- Produces: `listRouteBikeCategories()`, `createRouteBikeCategoryAction(name, displayOrder)`,
  `updateRouteBikeCategoryAction(id, name, displayOrder)`, `deleteRouteBikeCategoryAction(id)`

- [ ] **Step 1: Aggiungi le action, stessa forma esatta di quelle per `bikeVersions`**

Alla fine del file:

```ts
// --- Route categories -----------------------------------------------------

export async function listRouteBikeCategories() {
  await requireAdmin()
  return db.select().from(routeBikeCategories).orderBy(asc(routeBikeCategories.displayOrder))
}

export async function createRouteBikeCategoryAction(name: string, displayOrder: number) {
  await requireAdmin()
  await db.insert(routeBikeCategories).values({ name, displayOrder })
  updateTag('route-bike-categories')
}

export async function updateRouteBikeCategoryAction(id: string, name: string, displayOrder: number) {
  await requireAdmin()
  await db.update(routeBikeCategories).set({ name, displayOrder }).where(eq(routeBikeCategories.id, id))
  updateTag('route-bike-categories')
}

export async function deleteRouteBikeCategoryAction(id: string) {
  await requireAdmin()
  // bike_categories.route_category_id non ha onDelete cascade (vedi schema):
  // cancellarne una ancora collegata deve fallire rumorosamente, non
  // scollegare in silenzio le categorie bici che la usano.
  await db.delete(routeBikeCategories).where(eq(routeBikeCategories.id, id))
  updateTag('route-bike-categories')
}
```

Aggiungi `routeBikeCategories` all'import da `@/lib/db` in cima al file.

- [ ] **Step 2: Verifica TypeScript**

Run: `npx tsc --noEmit`
Expected: nessun errore

- [ ] **Step 3: Commit**

```bash
git add lib/actions/bike-options.ts
git commit -m "Add route bike category server actions"
```

---

### Task 4: Lista admin categorie percorso

**Files:**
- Create: `components/admin/route-bike-category-list.tsx`
- Modify: `app/manage/bike-options/page.tsx`

**Interfaces:**
- Consumes: le 4 action di Task 3, tipo `RouteBikeCategory` da Task 1
- Produces: `<RouteBikeCategoryList categories={...} />`

- [ ] **Step 1: Crea il componente, copia esatta di `bike-version-list.tsx`**

`components/admin/route-bike-category-list.tsx` — stesso identico
componente di `components/admin/bike-version-list.tsx`, con:
- `BikeVersion` → `RouteBikeCategory`
- `versions` → `categories`
- `createBikeVersionAction`/`updateBikeVersionAction`/`deleteBikeVersionAction`
  → `createRouteBikeCategoryAction`/`updateRouteBikeCategoryAction`/`deleteRouteBikeCategoryAction`
- messaggi toast: `'Category added'`/`'Category updated'`/`'Category deleted'`
- messaggio di errore alla cancellazione: `'This category is still linked to a bike category'`
- placeholder del nuovo campo: `'New category (e.g. eMTB)'`
- il componente esportato si chiama `RouteBikeCategoryList`

- [ ] **Step 2: Aggiungi la quarta scheda alla pagina**

In `app/manage/bike-options/page.tsx`:

```ts
import { listBikeSizes, listBikeVersions, listBikeCategories, listRouteBikeCategories } from '@/lib/actions/bike-options'
import { RouteBikeCategoryList } from '@/components/admin/route-bike-category-list'
```

```ts
  const [sizes, versions, categories, routeCategories] = await Promise.all([
    listBikeSizes(),
    listBikeVersions(),
    listBikeCategories(),
    listRouteBikeCategories(),
  ])
```

```tsx
        <TabsList>
          <TabsTrigger value="sizes">Sizes</TabsTrigger>
          <TabsTrigger value="versions">Versions</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="route-categories">Route categories</TabsTrigger>
        </TabsList>
        <TabsContent value="sizes"><BikeSizeList sizes={sizes} /></TabsContent>
        <TabsContent value="versions"><BikeVersionList versions={versions} /></TabsContent>
        <TabsContent value="categories"><BikeCategoryList categories={categories} /></TabsContent>
        <TabsContent value="route-categories"><RouteBikeCategoryList categories={routeCategories} /></TabsContent>
```

- [ ] **Step 3: Verifica TypeScript**

Run: `npx tsc --noEmit`
Expected: nessun errore

- [ ] **Step 4: Verifica dal vivo**

Avvia `npm run dev --webpack`, vai su `/manage/bike-options`, apri la scheda
"Route categories": devi vedere le 5 categorie del seed (su dev saranno
comunque visibili una volta applicata la migrazione di Task 2, anche se non
collegate a nessuna categoria bici locale). Crea, rinomina ed elimina una
categoria di prova per confermare che il CRUD funzioni.

- [ ] **Step 5: Commit**

```bash
git add components/admin/route-bike-category-list.tsx app/manage/bike-options/page.tsx
git commit -m "Add the route categories tab to the bike options admin page"
```

---

### Task 5: Collega una categoria bici a una categoria percorso dal form

**Files:**
- Modify: `components/admin/bike-category-form.tsx`
- Modify: `components/admin/bike-category-list.tsx`
- Modify: `app/manage/bike-options/page.tsx`
- Modify: `lib/actions/bike-options.ts`

**Interfaces:**
- Consumes: `listRouteBikeCategories()` da Task 3
- Produces: `BikeCategoryInput.routeCategoryId?: string | null`

- [ ] **Step 1: Estendi `BikeCategoryInput`**

In `lib/actions/bike-options.ts`, nell'interfaccia esistente:

```ts
export interface BikeCategoryInput {
  name: string
  displayOrder: number
  routeCategoryId?: string | null
  maxRentalDays: number
  // ...resto invariato
}
```

`createBikeCategoryAction`/`updateBikeCategoryAction` non cambiano: passano
già `input` per intero a Drizzle.

- [ ] **Step 2: Aggiungi la select al form**

In `components/admin/bike-category-form.tsx`, il form riceve una nuova prop
`routeCategories: RouteBikeCategory[]`:

```tsx
export function BikeCategoryForm({
  category,
  routeCategories,
  onSubmit,
  onCancel,
}: {
  category?: BikeCategory
  routeCategories: RouteBikeCategory[]
  onSubmit: (input: BikeCategoryInput) => void
  onCancel: () => void
}) {
  // ...stato esistente invariato
  const [routeCategoryId, setRouteCategoryId] = useState<string>(category?.routeCategoryId ?? 'none')
```

Nel submit:

```ts
    onSubmit({
      name,
      displayOrder: category?.displayOrder ?? 0,
      routeCategoryId: routeCategoryId === 'none' ? null : routeCategoryId,
      // ...resto invariato
    })
```

Nel JSX, subito dopo il campo "Name":

```tsx
      <div className="space-y-1">
        <Label htmlFor="cat-route-category">Route terrain group</Label>
        <Select value={routeCategoryId} onValueChange={setRouteCategoryId}>
          <SelectTrigger id="cat-route-category"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {routeCategories.map((rc) => (
              <SelectItem key={rc.id} value={rc.id}>{rc.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
```

Importa `RouteBikeCategory` da `@/lib/db`.

- [ ] **Step 3: Passa `routeCategories` attraverso la lista**

In `components/admin/bike-category-list.tsx`, la lista riceve la stessa
nuova prop e la passa al form:

```tsx
export function BikeCategoryList({
  categories, routeCategories,
}: { categories: BikeCategory[]; routeCategories: RouteBikeCategory[] }) {
```

```tsx
      <BikeCategoryForm
        category={editing === 'new' ? undefined : editing}
        routeCategories={routeCategories}
        onSubmit={handleSubmit}
        onCancel={() => setEditing(null)}
      />
```

Importa `RouteBikeCategory` da `@/lib/db`.

- [ ] **Step 4: Passa `routeCategories` dalla pagina**

In `app/manage/bike-options/page.tsx`:

```tsx
        <TabsContent value="categories"><BikeCategoryList categories={categories} routeCategories={routeCategories} /></TabsContent>
```

- [ ] **Step 5: Verifica TypeScript**

Run: `npx tsc --noEmit`
Expected: nessun errore

- [ ] **Step 6: Verifica dal vivo**

Su `/manage/bike-options`, scheda "Categories", modifica una categoria
esistente: la select "Route terrain group" deve mostrare le categorie
percorso disponibili, e salvare deve persistere la scelta (ricaricando la
pagina, la select deve mostrare lo stesso valore).

- [ ] **Step 7: Commit**

```bash
git add lib/actions/bike-options.ts components/admin/bike-category-form.tsx components/admin/bike-category-list.tsx app/manage/bike-options/page.tsx
git commit -m "Link a bike category to a route terrain group from its admin form"
```

---

### Task 6: Il form percorso e il filtro pubblico leggono la tabella, non la costante

**Files:**
- Modify: `components/admin/route-form.tsx`
- Modify: `app/manage/routes/new/page.tsx`
- Modify: `app/manage/routes/[id]/page.tsx`
- Modify: `components/route-filters.tsx`
- Modify: `app/[lang]/routes/page.tsx`

**Interfaces:**
- Consumes: `listRouteBikeCategories()` da Task 3

- [ ] **Step 1: `RouteForm` riceve le opzioni invece di importare la costante**

In `components/admin/route-form.tsx`, rimuovi la riga
`const BIKE_TYPES = [...]` e aggiungi una prop:

```ts
interface RouteFormProps {
  action: (prev: RouteFormState, formData: FormData) => Promise<RouteFormState>
  route?: Route
  translations?: RouteTranslation[]
  photos?: Media[]
  bikeTypeOptions: string[]
}

export function RouteForm({ action, route, translations, photos, bikeTypeOptions }: RouteFormProps) {
```

Nel JSX, `BIKE_TYPES.map(...)` diventa `bikeTypeOptions.map(...)` (unica
occorrenza, la sezione "Bike type").

- [ ] **Step 2: Le due pagine che istanziano `RouteForm` recuperano le opzioni**

In `app/manage/routes/new/page.tsx`:

```ts
import { listRouteBikeCategories } from '@/lib/actions/bike-options'
```

```ts
  const routeBikeCategories = await listRouteBikeCategories()
```

```tsx
      <RouteForm action={createRouteAction} bikeTypeOptions={routeBikeCategories.map((c) => c.name)} />
```

Stessa cosa in `app/manage/routes/[id]/page.tsx`: stesso import, stesso
fetch, e `bikeTypeOptions={routeBikeCategories.map((c) => c.name)}` aggiunto
alla `<RouteForm>` esistente.

- [ ] **Step 3: `RouteFilters` riceve le opzioni invece di importare la costante**

In `components/route-filters.tsx`, rimuovi
`const BIKE_TYPES = [...]` e aggiungi una prop:

```ts
interface RouteFiltersProps {
  routes: RouteWithData[]
  lang: string
  dict: { routes: Record<string, string> }
  bikeTypeOptions: string[]
}

export function RouteFilters({ routes, lang, dict, bikeTypeOptions }: RouteFiltersProps) {
```

La riga che filtra i tipi effettivamente presenti:

```ts
  const availableBikeTypes = [...new Set(routes.flatMap((r) => r.route.bikeTypes))]
    .filter((t) => bikeTypeOptions.includes(t))
```

- [ ] **Step 4: La pagina lista percorsi recupera le opzioni**

In `app/[lang]/routes/page.tsx`:

```ts
import { listRouteBikeCategories } from '@/lib/actions/bike-options'
```

`listRouteBikeCategories` chiama `requireAdmin()` — questa è una pagina
pubblica, non admin. Aggiungi invece una funzione non protetta, pubblica
davvero, nello stesso file delle action:

In `lib/actions/bike-options.ts`, una funzione a parte per la lettura
pubblica (nessun `requireAdmin`, nessun `'use server'` extra necessario dato
che il file lo è già):

```ts
// Pubblica: usata dal filtro dei percorsi, che chiunque può vedere.
export async function listRouteBikeCategoriesPublic() {
  return db.select().from(routeBikeCategories).orderBy(asc(routeBikeCategories.displayOrder))
}
```

In `app/[lang]/routes/page.tsx`:

```ts
import { listRouteBikeCategoriesPublic } from '@/lib/actions/bike-options'
```

```ts
  const routeBikeCategories = await listRouteBikeCategoriesPublic()
```

```tsx
          <RouteFilters routes={routesWithData} lang={lang} dict={dict} bikeTypeOptions={routeBikeCategories.map((c) => c.name)} />
```

- [ ] **Step 5: Verifica TypeScript**

Run: `npx tsc --noEmit`
Expected: nessun errore

- [ ] **Step 6: Verifica dal vivo**

Su `/manage/routes/new`, la sezione "Bike type" deve mostrare le checkbox
delle categorie percorso (non più la vecchia lista con Road Bike incluso).
Su `/it/routes`, il pannello filtri deve mostrare gli stessi tipi bici di
prima (nessuna regressione visibile per un visitatore, cambia solo la
fonte dei dati).

- [ ] **Step 7: Commit**

```bash
git add lib/actions/bike-options.ts components/admin/route-form.tsx app/manage/routes/new/page.tsx "app/manage/routes/[id]/page.tsx" components/route-filters.tsx "app/[lang]/routes/page.tsx"
git commit -m "Read bike type options from route_bike_categories, not the BIKE_TYPES constant"
```

---

### Task 7: Query dei suggerimenti — quali bici vanno bene per questo percorso

**Files:**
- Modify: `lib/bikes-data.ts`

**Interfaces:**
- Produces: `getSuggestedBikesForRoute(lang: Locale, bikeTypes: string[])`,
  stessa forma di ritorno di `getBikeModelsListData` (`{ model, translation,
  category, sizesInGarage }[]`)

- [ ] **Step 1: Aggiungi la query, un solo join — niente N+1**

In `lib/bikes-data.ts`, dopo `getBikeModelsListData`:

```ts
// Un solo join, non un giro per ogni tipo bici del percorso — stessa
// lezione di getRoutesListData (STATE.md, 2026-09-15): un N+1 dentro un
// Promise.all è quello che ha bloccato /routes due volte in produzione.
export async function getSuggestedBikesForRoute(lang: Locale, bikeTypes: string[]) {
  'use cache'
  cacheLife('routesFlags')
  cacheTag('bike-models')
  cacheTag('bike-units')
  cacheTag('bike-options')

  if (bikeTypes.length === 0) return []

  const models = await db
    .selectDistinct({ model: bikeModels, translation: bikeModelTranslations, category: bikeCategories })
    .from(bikeModels)
    .innerJoin(
      bikeModelTranslations,
      and(eq(bikeModelTranslations.bikeModelId, bikeModels.id), eq(bikeModelTranslations.locale, lang))
    )
    .innerJoin(bikeCategories, eq(bikeCategories.id, bikeModels.categoryId))
    .innerJoin(routeBikeCategories, eq(routeBikeCategories.id, bikeCategories.routeCategoryId))
    .innerJoin(bikeUnits, eq(bikeUnits.bikeModelId, bikeModels.id))
    .where(and(eq(bikeModels.isPublished, true), inArray(routeBikeCategories.name, bikeTypes)))
    .orderBy(asc(bikeModels.displayOrder))

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

Aggiungi `routeBikeCategories` e `inArray` agli import in cima al file
(`inArray` da `drizzle-orm`, accanto a `eq, and, asc, sql`).

- [ ] **Step 2: Verifica TypeScript**

Run: `npx tsc --noEmit`
Expected: nessun errore

- [ ] **Step 3: Commit**

```bash
git add lib/bikes-data.ts
git commit -m "Add getSuggestedBikesForRoute: one join, no N+1"
```

---

### Task 8: Card "Bici adatte a questo giro" nel dettaglio percorso

**Files:**
- Create: `components/route-suggested-bikes.tsx`
- Modify: `app/[lang]/routes/[id]/page.tsx`
- Modify: `messages/it.json`, `messages/en.json`, `messages/de.json`

**Interfaces:**
- Consumes: `getSuggestedBikesForRoute` da Task 7, `BikeCard` (esistente),
  `BikeCardMediaAsync` (esistente)
- Produces: `<RouteSuggestedBikes bikes={...} lang={lang} dict={dict} title={...} />`

- [ ] **Step 1: Aggiungi la chiave i18n del titolo sezione**

In `messages/it.json`, dentro `"routes"`, subito dopo `"description_title"`:

```json
    "suggested_bikes_title": "Bici adatte a questo giro",
```

In `messages/en.json`, stessa posizione:

```json
    "suggested_bikes_title": "Bikes suited to this route",
```

In `messages/de.json`, stessa posizione:

```json
    "suggested_bikes_title": "Passende Fahrräder für diese Strecke",
```

- [ ] **Step 2: Crea il componente**

`components/route-suggested-bikes.tsx` — riusa `BikeCard`, stessa griglia
già in uso su `/bikes` (`app/[lang]/bikes/page.tsx`), non ne inventa una
nuova. Non appare affatto se non c'è nessuna bici collegata: un percorso
"E-Gravel" senza ancora una gravel elettrica in catalogo non deve mostrare
una sezione vuota.

```tsx
import { BikeCard } from '@/components/bike-card'
import { BikeCardMediaAsync } from '@/components/bike-card-media-async'
import type { BikeModel, BikeModelTranslation, BikeCategory } from '@/lib/db'

interface SuggestedBike {
  model: BikeModel
  translation: BikeModelTranslation
  category: BikeCategory
}

export function RouteSuggestedBikes({
  bikes, lang, dict, title,
}: {
  bikes: SuggestedBike[]
  lang: string
  dict: { bikes: Record<string, string> }
  title: string
}) {
  if (bikes.length === 0) return null

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-[#1e3a5f]">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-0">
        {bikes.map(({ model, translation, category }) => (
          <BikeCard
            key={model.id}
            model={model}
            translation={translation}
            category={category}
            media={<BikeCardMediaAsync model={model} title={translation.name} />}
            lang={lang}
            dict={dict}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire nella pagina di dettaglio percorso**

In `app/[lang]/routes/[id]/page.tsx`:

```ts
import { getSuggestedBikesForRoute } from '@/lib/bikes-data'
import { RouteSuggestedBikes } from '@/components/route-suggested-bikes'
```

Dopo il fetch di `data` (che dà `route`), prima del `return`:

```ts
  const suggestedBikes = await getSuggestedBikesForRoute(lang as 'it' | 'en' | 'de', route.bikeTypes)
```

Nel JSX, subito dopo la sezione "Description" esistente:

```tsx
        {suggestedBikes.length > 0 && (
          <RouteSuggestedBikes bikes={suggestedBikes} lang={lang} dict={dict} title={d.suggested_bikes_title} />
        )}
```

`dict` qui è il dizionario completo (`getDictionary(lang)`), che ha sia
`.routes` (già usato come `d`) sia `.bikes` — `RouteSuggestedBikes` vuole
`{ bikes: ... }`, quindi passagli `dict` per intero, non `d`.

- [ ] **Step 4: Verifica JSON e TypeScript**

Run: `node -e "require('./messages/it.json'); require('./messages/en.json'); require('./messages/de.json'); console.log('json ok')"`
Run: `npx tsc --noEmit`
Expected: entrambi puliti

- [ ] **Step 5: Verifica dal vivo**

Su dev, apri un percorso taggato con un tipo bici collegato a una categoria
reale (dopo aver collegato manualmente una categoria bici di test dal
pannello, Task 5) — la sezione deve apparire con la card della bici. Un
percorso il cui unico tipo bici non è collegato a nessuna categoria non
deve mostrare la sezione affatto.

- [ ] **Step 6: Commit**

```bash
git add components/route-suggested-bikes.tsx "app/[lang]/routes/[id]/page.tsx" messages/it.json messages/en.json messages/de.json
git commit -m "Add the suggested-bikes card to the route detail page"
```

---

### Task 9: Etichetta del terreno sul lato bici

**Files:**
- Modify: `components/bike-card.tsx`
- Modify: `app/[lang]/bikes/[id]/page.tsx`
- Modify: `lib/bikes-data.ts`

**Interfaces:**
- Consumes: `category.routeCategoryId` da Task 1, `routeBikeCategories` da Task 1

- [ ] **Step 1: Le query bici portano già dietro il nome della categoria percorso**

`getBikeModelsListData` e `getBikeModelDetailData` selezionano già
`category: bikeCategories` per intero — `category.routeCategoryId` è già
nel risultato, ma serve anche il *nome* della categoria percorso, non solo
il suo id. In `lib/bikes-data.ts`, aggiungi un left join in entrambe le
funzioni (left, non inner: molte categorie non hanno un collegamento, e
quel modello deve comunque comparire).

In `getBikeModelsListData`, la select diventa:

```ts
  const models = await db
    .selectDistinct({
      model: bikeModels, translation: bikeModelTranslations, category: bikeCategories,
      routeCategory: routeBikeCategories,
    })
    .from(bikeModels)
    .innerJoin(
      bikeModelTranslations,
      and(eq(bikeModelTranslations.bikeModelId, bikeModels.id), eq(bikeModelTranslations.locale, lang))
    )
    .innerJoin(bikeCategories, eq(bikeCategories.id, bikeModels.categoryId))
    .leftJoin(routeBikeCategories, eq(routeBikeCategories.id, bikeCategories.routeCategoryId))
    .innerJoin(bikeUnits, eq(bikeUnits.bikeModelId, bikeModels.id))
    .where(eq(bikeModels.isPublished, true))
    .orderBy(asc(bikeModels.displayOrder))
```

E il map finale aggiunge `routeCategory` all'oggetto restituito:

```ts
  return models.map(({ model, translation, category, routeCategory }) => ({
    model,
    translation,
    category,
    routeCategory,
    sizesInGarage: dedupeById(
      sizeLinks.filter((l) => l.bikeModelId === model.id).map((l) => l.size)
    ),
  }))
```

Stessa aggiunta (left join + campo nel risultato) in
`getBikeModelDetailData`.

- [ ] **Step 2: Badge sulla card lista**

In `components/bike-card.tsx`, la prop `category` diventa anche
`routeCategory?: RouteBikeCategory | null`:

```tsx
interface BikeCardProps {
  model: BikeModel
  translation: BikeModelTranslation
  category: BikeCategory
  routeCategory?: RouteBikeCategory | null
  media: ReactNode
  lang: string
  dict: { bikes: Record<string, string> }
}
```

Nel JSX, accanto al badge esistente `<Badge variant="secondary">{category.name}</Badge>`:

```tsx
        <Badge variant="secondary">{category.name}</Badge>
        {routeCategory && <Badge variant="outline">{routeCategory.name}</Badge>}
```

Importa `RouteBikeCategory` da `@/lib/db`.

- [ ] **Step 3: Passa `routeCategory` lungo la catena fino a `BikeCard`**

`app/[lang]/bikes/page.tsx` non istanzia `<BikeCard>` direttamente: passa
`modelsWithData` a `<BikeFilters>`, che è quello che poi rende ogni
`<BikeCard>`. Il campo va aggiunto in tre punti:

In `app/[lang]/bikes/page.tsx`, dentro il `.map` che costruisce
`modelsWithData` (che già destruttura `category`, `sizesInGarage` dal
risultato di Step 1):

```ts
  const modelsWithData = modelsWithTranslations.map(({ model, translation, category, routeCategory, sizesInGarage }) => ({
    model,
    translation,
    category,
    routeCategory,
    sizesInGarage,
    media: (
      <Suspense fallback={<Skeleton className="h-48 w-full rounded-none" />}>
        <BikeCardMediaAsync model={model} title={translation.name} />
      </Suspense>
    ),
  }))
```

In `components/bike-filters.tsx`, l'interfaccia `BikeModelWithData`:

```ts
interface BikeModelWithData {
  model: BikeModel
  translation: BikeModelTranslation
  category: BikeCategory
  routeCategory?: RouteBikeCategory | null
  sizesInGarage: BikeSize[]
  media: ReactNode
}
```

Importa `RouteBikeCategory` da `@/lib/db`. E nel render loop finale:

```tsx
          {filtered.map(({ model, translation, category, routeCategory, media }) => (
            <BikeCard
              key={model.id}
              model={model}
              translation={translation}
              category={category}
              routeCategory={routeCategory}
              media={media}
              lang={lang}
              dict={dict}
            />
          ))}
```

`components/route-suggested-bikes.tsx` (Task 8) non passa `routeCategory`:
la sua query (Task 7) non fa quel join, e il badge lì sarebbe comunque
ridondante — il contesto della sezione è già "questa bici va bene per
questo terreno".

- [ ] **Step 4: Badge sul dettaglio bici**

In `app/[lang]/bikes/[id]/page.tsx`, accanto al badge esistente
`<Badge variant="secondary">{category.name}</Badge>`:

```tsx
            <Badge variant="secondary">{category.name}</Badge>
            {routeCategory && <Badge variant="outline">{routeCategory.name}</Badge>}
```

`routeCategory` arriva già da `data` (Step 1 lo aggiunge al ritorno di
`getBikeModelDetailData`), destrutturalo insieme al resto:
`const { model, translation, category, routeCategory, allMedia, sizesInGarage, versionsInGarage } = data`.

- [ ] **Step 5: Verifica TypeScript**

Run: `npx tsc --noEmit`
Expected: nessun errore

- [ ] **Step 6: Verifica dal vivo**

Dopo aver collegato una categoria bici di test a una categoria percorso dal
pannello (Task 5), la card su `/it/bikes` e il dettaglio `/it/bikes/<id>`
devono mostrare entrambi i badge — quello di prezzo esistente e quello del
terreno, uno accanto all'altro. Un modello la cui categoria non è collegata
a nessuna categoria percorso deve mostrare solo il primo badge, invariato.

- [ ] **Step 7: Commit**

```bash
git add components/bike-card.tsx "app/[lang]/bikes/[id]/page.tsx" "app/[lang]/bikes/page.tsx" lib/bikes-data.ts
git commit -m "Show the linked terrain category as a second badge on bike cards"
```

---

### Task 10: Verifica finale e build

**Files:** nessuno — solo verifica

- [ ] **Step 1: Suite unitaria**

Run: `npm run test`
Expected: tutti verdi, nessuna regressione

- [ ] **Step 2: Build di produzione**

Run: `npm run build --webpack`
Expected: verde

- [ ] **Step 3: Verifica end-to-end dal vivo (Playwright contro `next start`, non `next dev`)**

Le pagine percorsi non completano la navigazione sotto `next dev`
(STATE.md) — build e `next start` prima di qualunque test browser.

Percorso di verifica:
1. `/manage/bike-options` → scheda "Route categories": CRUD funzionante
2. `/manage/bike-options` → scheda "Categories": collega una categoria di
   test a un gruppo percorso
3. `/manage/routes/new`: le checkbox "Bike type" mostrano le categorie
   percorso reali
4. Un percorso taggato con quel tipo → la card "Bici adatte a questo giro"
   appare con la bici collegata
5. `/it/bikes` e il dettaglio bici → il secondo badge col terreno appare
6. `/it/routes`: il filtro tipo bici funziona come prima (nessuna
   regressione visibile)

- [ ] **Step 4: Aggiorna STATE.md**

Sposta la voce da ROADMAP.md "Adesso" a un puntatore in STATE.md sotto
"Decisioni passate ancora rilevanti", stesso formato delle altre voci —
solo dopo che il merge in produzione (inclusa la migrazione, Task 2 Step 5)
è confermato.
