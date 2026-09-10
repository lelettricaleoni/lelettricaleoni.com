# Stato del progetto

> Regola di ammissione: **entra solo ciò che il codice non dice già.** Un elenco di
> componenti si ricava con `ls`; il motivo per cui i tile CARTO passano dal server no.
> Se questo file supera le ~150 righe, qualcosa è entrato che non doveva.
>
> Ultimo allineamento: 2026-09-10.

## Prodotto

Sito di **Lelettrica di Leoni Gabriele** — noleggio e-bike Flyer e riparazioni a Dro (TN),
Lago di Garda. Pubblico: turisti e ciclisti della zona. Oltre alle pagine vetrina ospita
una sezione di percorsi consigliati con GPX, foto, video e mappa 3D, alimentata da un
pannello di amministrazione privato.

## Ambienti

| | |
|---|---|
| Produzione | `main` → https://www.lelettricaleoni.com, deploy automatico Vercel |
| Progetto Vercel | `lelettricaleoni`, team `lelettrica` |
| Branch `staging` | esiste sul remoto, protetto come `main` |
| Merge | solo via PR: il controllo `verify` deve passare (amministratori esenti) |

## Superfici

- `app/[lang]/` — home, privacy, login, update-password, e la sezione `routes`
- `app/[lang]/routes/[id]` — dettaglio percorso. L'`[id]` è uno **short id di 8 caratteri
  esadecimali** derivato dall'UUID, non lo slug: `/it/routes/aa7da601`
- `app/manage/` — pannello amministrativo, non indicizzato, protetto in `proxy.ts`
- `app/api/routes/[id]/gpx` — serve il GPX con watermark iniettato al volo; l'originale su
  R2 resta intatto
- `app/api/map-tile/[z]/[x]/[y]` — proxy server-side dei tile CARTO
- `app/.well-known/vercel/flags` — discovery endpoint dei feature flag

## Dati e servizi

Postgres su **Supabase** via Drizzle (`routes`, `route_translations`, `route_photos`).
Autenticazione admin con Supabase Auth: `getAdminUser()` richiede `app_metadata.role =
'admin'` — **non** `user_metadata`, che è modificabile dall'utente stesso.
Foto, GPX, video e flussi HLS su **Cloudflare R2**.
Traduzioni IT→EN/DE generate da **Azure Translator**: l'admin scrive solo l'italiano.

Se R2 rallenta, le card dei percorsi si degradano da sole: i media stanno in un confine
Suspense separato apposta, per non bloccare il resto della pagina.

**Cache di lettura su Upstash Redis** (`lib/cache.ts`): URL dei manifesti HLS e punti GPX
già analizzati, che non cambiano mai una volta prodotti. Senza credenziali è un no-op, e
ogni lettura fallisce aperta entro 250 ms — nessuna richiesta può restare appesa al servizio.
Lo stesso Upstash tiene lo stato di transcodifica che il worker pubblica.

## Infrastruttura dei media

Dal 2026-09-10 **tutti i media stanno su Cloudflare R2**: un bucket per ambiente
(`lelettrica-trails`, `dev-lelettrica-trails`), serviti da `trails-bucket.lelettricaleoni.com`.
**MinIO è stato eliminato** con Nginx Proxy Manager, i domini `cluster-bucket` e i relativi
certificati: sulla VM restano il worker e il suo Redis, senza porte aperte.

Le chiavi non sono cambiate nel trasloco, quindi il database non è stato toccato: sorgenti
in `private/route-videos/`, flussi in `public/route-videos/`. **Su R2 quel `private/` non
protegge nulla** — un dominio pubblico espone tutto il bucket — ma il sorgente vive solo i
minuti che il worker impiega a cancellarlo.

**Il worker** (`lelettricaleoni/videoStream-bucketWorker`) sta in `~/docker/worker` sulla VM
`clustrenode1` (Oracle Cloud, ARM64, 2 CPU), con un Redis append-only per la coda BullMQ.

| | |
|---|---|
| Trova il lavoro | elencando R2: un sorgente senza manifesto **è** il lavoro da fare |
| Coda | BullMQ, job id = l'oggetto, tre tentativi con backoff |
| Stato | su Upstash, `videojob:v1:*`, letto da `lib/video-jobs.ts` |
| Altri lavori | registro in `jobs/__init__.py`: un modulo, una riga in `HANDLERS`, per i cron una in `SCHEDULES` |

La coda è **ricostruibile, non durevole**: non può esserlo più dei dati che serve, e la
verità sta nello storage — per questo il webhook di MinIO è sparito invece di essere
ripuntato altrove.
Il token Upstash del worker può **solo `SET` su `videojob:*`** e non può leggere: rubato
dalla VM, non raggiunge le cache HLS e GPX che stanno lì accanto.

## Decisioni vincolanti, e perché

**Tutto è renderizzato su richiesta.** Il layout radice legge `x-locale` con `await
headers()`, e questo rende dinamico l'intero albero. Conseguenza da conoscere:
`export const revalidate = 3600` sulle pagine percorsi **non ha mai avuto effetto**, quindi
ogni visita interroga Supabase e scarica il GPX da R2. Verificato leggendo l'output di
`next build`: tutte le rotte sono marcate `ƒ`.

**La traccia GPX si ancora al terreno, non alla propria quota.** Le quote GPX sono
ortometriche, quelle di Cesium ellissoidiche: misurato su un percorso reale, scarto mediano
−46,3 m e dispersione 29,3 m, con il 95% dei punti sottoterra. `lib/terrain.ts` campiona la
quota del terreno sotto il tracciato e ridisegna lì traccia, marker e telecamera.

**Cesium è self-hosted** in `public/cesium/`, copiato da `scripts/copy-cesium.mjs` a ogni
`dev` e `build`. Non è versionato.

**I tile della mappa passano dal server** invece che dal browser, per non esporre la chiave
CARTO.

**Build e dev girano con `--webpack`**, non con Turbopack: `next.config.ts` mappa
`import cesium` su `window.Cesium` per evitare che SWC analizzi shader GLSL con sequenze di
escape ottali. Sotto Turbopack quella configurazione viene ignorata.

**I feature flag stanno su Vercel Flags**, letti da `lib/flags.ts`, che è l'unico punto da
cui passano. Il valore viene valutato una volta e riusato per 30 secondi, e un
aggiornamento avviene in sottofondo: nessuna richiesta attende il servizio. Senza questa
cache la home passava da 0,15 s a 6,2 s — misurato.

## Trappole

**Una pagina spenta risponde 200, non 404.** Le pagine percorsi hanno un `loading.tsx`,
quindi Next le trasmette in streaming e lo stato non è più modificabile quando `notFound()`
scatta. Next compensa iniettando `<meta name="robots" content="noindex">`. **Non usare il
codice HTTP per verificare se una sezione è accesa: guarda il contenuto.**

**Creando un flag su Vercel, il valore predefinito è Off in produzione e preview**, On solo
in sviluppo. Creare i cinque flag ha spento la sezione percorsi in produzione senza che
nulla segnalasse errore. Dopo aver creato un flag, verificare sempre i valori per ambiente.

**`pkill -f "next dev"` non funziona su Windows.** Lascia vivo il server figlio, che
continua a occupare la porta 3000; il nuovo server finisce sulla 3001 e le misure parlano
con quello vecchio. Usare PowerShell sui PID.

**`mc mirror` copia solo gli oggetti.** Utenti, policy, credenziali, notifiche e permessi
anonimi dei bucket non vengono replicati: per un trasloco servono `mc admin cluster iam
export/import`, `mc event add` e `mc anonymous set`. Le secret key degli utenti non sono
rileggibili, quindi ricrearli a mano è impossibile.

**`vercel env pull .env.local` distrugge le chiavi locali.** Il progetto Vercel contiene
solo `VERCEL_OIDC_TOKEN` e `FLAGS_SECRET`; R2, Supabase e Azure vivono solo in `.env.local`.
Scaricare fuori dal progetto e copiare la riga che serve. Le variabili marcate *Secret* non
si scaricano affatto: escono come `[SENSITIVE]`.

**Usare `npx vercel@latest`**: la CLI installata localmente è vecchia, non ha il comando
`flags` e cade in silenzio su `deploy`.

## Debito noto

- **`README.md` è disallineato**: descrive `/percorsi` e `/api/percorsi/[slug]/gpx`, mentre
  il codice usa `/routes`; non cita Cesium, MapLibre né HLS.
- **`revalidate = 3600` è codice morto** (vedi sopra). È la voce con l'impatto maggiore su
  prestazioni e costi fra quelle aperte.
- **Nessun finto servizio**, quindi la CI non può eseguire build né test end-to-end.
- Tre avvisi `react-hooks/set-state-in-effect`: il pattern `mounted` in `mobile-menu.tsx` e
  `route-card-media.tsx`, e la chiusura del menù al cambio pagina.

## Decisioni passate ancora rilevanti

- `docs/superpowers/specs/2026-09-09-ai-docs-system-design.md` — questo sistema
- `docs/superpowers/specs/2026-09-09-test-suite-design.md` — suite di test, approvata, tre
  fasi, nessuna implementata
- `docs/superpowers/specs/2026-05-29-percorsi-admin-design.md` — sezione percorsi e admin
- `docs/superpowers/plans/2026-05-29-route-detail-redesign.md` — flyover 3D e bento grid
