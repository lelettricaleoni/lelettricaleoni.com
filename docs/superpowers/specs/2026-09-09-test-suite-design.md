# Design Spec — Suite di test e finti servizi

**Data**: 2026-09-09
**Branch**: `fix/flyover-terrain-anchoring`
**Stato**: approvato, pronto per implementazione

---

## Obiettivo

Tre strati, costruiti in quest'ordine, ognuno utile da solo:

1. **Rete di sicurezza** — test veloci sulla logica dove un errore fa il danno peggiore
2. **Finti servizi** — poter sviluppare e testare con Supabase, R2/MinIO o Azure Translator irraggiungibili
3. **End-to-end e CI** — verifica dei pochi flussi che il cliente vede davvero, in automatico su ogni push

### Fuori scope

- Copertura totale. L'obiettivo non è una percentuale, è proteggere ciò che rompendosi costa di più.
- Test del flyover 3D. Vedi "Buchi dichiarati".

---

## Stato di partenza

Esiste la toolchain, non la suite.

| | Stato al 2026-09-09 |
|---|---|
| Runner | vitest 4.1.7, nessun file di configurazione |
| Ambiente DOM | assente (né `jsdom` né `happy-dom`) |
| Testing di componenti | assente |
| Mocking di rete | assente |
| E2E | Playwright presente solo come strumento MCP interattivo, non come runner |
| CI | assente |
| Test scritti | `lib/gpx.test.ts` (4), `lib/terrain.test.ts` (10) |

Scoperti: 34 componenti, 16 moduli in `lib/`, 31 fra pagine e route handler.

Un fatto che rende il lavoro fattibile: i confini verso i servizi esterni sono già
concentrati in 9 moduli sotto `lib/` (`db/index.ts`, `r2.ts`, `minio.ts`,
`minio-client.ts`, `supabase/server.ts`, `supabase/client.ts`, `actions/translate.ts`,
`actions/auth.ts`, più `app/api/map-tile/`). Non sono sparsi nei punti di chiamata.

---

## Strato 1 — Rete di sicurezza

### Fondamenta

`vitest.config.ts` con due progetti:

- `unit` — ambiente Node, per logica e moduli server
- `dom` — ambiente `happy-dom`, per i componenti

Dipendenze nuove: `happy-dom`, `@testing-library/react`, `@testing-library/user-event`,
`@vitejs/plugin-react`, `@playwright/test`.

Script: `test` (unit + dom), `test:watch`, `test:e2e`, `test:contract:real`, `typecheck`.

### Cosa coprire, in ordine di danno

**`proxy.ts`** — fa due lavori distinti: il redirect di lingua e la protezione di
`/manage`. Se si rompe il secondo, l'area amministrativa resta aperta. È il singolo file
più critico del progetto e oggi non ha un test. Casi: rilevamento locale da
`Accept-Language`, redirect verso `/it`, `/en`, `/de`, iniezione dell'header `x-locale`,
richiesta a `/manage/*` senza sessione, richiesta con sessione priva di
`user_metadata.role === 'admin'`.

**Chiavi dei dizionari** — `it.json`, `en.json` e `de.json` devono avere insiemi di
chiavi identici. Dieci righe di test. Intercetta un errore ricorrente nella storia del
progetto: le traduzioni vengono toccate spesso, e una chiave mancante in una lingua non
produce un errore ma una stringa vuota in produzione.

**`lib/actions/routes.ts`** — cancella foto e file GPX da R2. Un test qui protegge da
perdite di dati irreversibili.

**`lib/gpx.ts` e `lib/gpx-svg.ts`** — oggi coperti solo in parte.

---

## Strato 2 — Finti servizi

### Meccanismo

Ogni modulo di confine sotto `lib/` prende un gemello in memoria con la stessa
interfaccia. La scelta avviene tramite `USE_FAKE_SERVICES=1`.

Due vincoli non negoziabili:

1. **L'interruttore lancia un errore se `NODE_ENV === 'production'`.** Un finto database
   che parte per sbaglio in produzione è peggio del guasto che dovrebbe tamponare.
2. **La sostituzione avviene solo al confine del modulo**, mai nei punti di chiamata.
   Altrimenti il finto si infiltra ovunque e non lo si toglie più.

### Dati

Un solo set realistico in `fixtures/`, usato sia dai test sia dallo sviluppo a servizi
spenti: un percorso con GPX vero, qualche foto locale, le tre traduzioni. Un solo set
perché due set divergono.

### Contro la divergenza fra finto e vero

Il rischio di questa strada è che il finto resti indietro rispetto al vero: i test
passano su codice rotto. Due difese, di costo molto diverso.

**Gratuita, strutturale.** Il finto database si costruisce sui tipi di
`lib/db/schema.ts`. Se lo schema cambia e il finto non si adegua, non compila.
TypeScript fa da guardiano senza che nessuno debba ricordarsene.

**A comando, comportamentale.** I test dei moduli di confine si scrivono contro
l'interfaccia, non contro l'implementazione, e girano due volte: sempre contro il finto,
e su richiesta contro i servizi veri con `npm run test:contract:real`. Quella seconda
esecuzione non sta in CI perché richiede credenziali; si lancia quando si tocca lo schema
o prima di un rilascio.

---

## Strato 3 — End-to-end e CI

### Runner

`@playwright/test` come runner vero, distinto dallo strumento MCP usato in modo
interattivo. Gira contro `next build && next start` con `USE_FAKE_SERVICES=1`:
deterministico, offline, e **senza credenziali**.

### Flussi coperti

Cinque, scelti per danno potenziale e non per copertura:

1. `/manage` senza autenticazione reindirizza al login
2. Home nelle tre lingue e cambio lingua
3. Lista percorsi, filtro, apertura del dettaglio
4. Il download GPX restituisce un file contenente il watermark Lelettrica
5. Login admin, creazione percorso, comparsa nella lista pubblica

### CI

`.github/workflows/ci.yml`, su push e pull request: installazione, `typecheck`, `lint`,
test unitari, end-to-end sui finti. Nessun segreto da configurare — una CI che non
possiede credenziali non può perderle. Cache di `node_modules` e dei browser Playwright.

Nota: `npm run build` esegue `scripts/copy-cesium.mjs`, quindi la CI produce anche
`public/cesium/`. Non va versionata (è già in `.gitignore`).

---

## Buchi dichiarati

**Il flyover 3D non viene testato end-to-end.** WebGL in headless più un token Cesium Ion
significa un test lento e ballerino, che verrebbe disattivato al primo fallimento
casuale. L'ancoraggio al terreno è coperto dai test unitari su `lib/terrain.ts`; il resto
si verifica a vista. Meglio un buco dichiarato che un test che nessuno si fida di leggere.

**Gli end-to-end sui finti non testano le integrazioni vere.** Qualcosa può passare la CI
e rompersi in produzione perché R2 ha cambiato comportamento. È il prezzo di poter
lavorare offline; la contromisura è `test:contract:real`.

---

## Fasi

Ogni fase è utile da sola e si può fermare lì.

1. Fondamenta, `proxy.ts`, chiavi dei dizionari — il rapporto valore/lavoro migliore
2. Finti servizi e test dei moduli di confine
3. End-to-end e CI

---

## Rischi

| Rischio | Mitigazione |
|---|---|
| Il finto diverge dal vero | Tipi condivisi con lo schema Drizzle; `test:contract:real` a comando |
| I finti finiscono in produzione | L'interruttore lancia se `NODE_ENV === 'production'` |
| Gli end-to-end diventano ballerini | Solo cinque flussi, su dati deterministici, senza rete |
| La suite viene abbandonata | Fasi indipendenti: anche fermandosi alla prima resta valore |
