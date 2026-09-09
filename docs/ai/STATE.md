# Stato del progetto

> Regola di ammissione: **entra solo ciò che il codice non dice già.** Un elenco di
> componenti si ricava con `ls`; il motivo per cui i tile CARTO passano dal server no.
> Se questo file supera le ~150 righe, qualcosa è entrato che non doveva.
>
> Ultimo allineamento: 2026-09-09.

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
Autenticazione admin con Supabase Auth: serve `user_metadata.role = 'admin'`.
Foto e GPX su **Cloudflare R2**; i video e i loro flussi HLS su **MinIO**.
Traduzioni IT→EN/DE generate da **Azure Translator**: l'admin scrive solo l'italiano.

Se R2 o MinIO rallentano, le card dei percorsi si degradano da sole — i media stanno in un
confine Suspense separato apposta, per non bloccare il resto della pagina.

**Cache di lettura su Upstash Redis** (`lib/cache.ts`): URL dei manifesti HLS e punti GPX
già analizzati, che non cambiano mai una volta prodotti. Senza credenziali è un no-op, e
ogni lettura fallisce aperta entro 250 ms — nessuna richiesta può restare appesa al servizio.

## Infrastruttura MinIO

Dal 2026-09-09 MinIO **non è più su Kubernetes**. Gira in Docker Compose sulla VM
`clustrenode1` (Oracle Cloud, ARM64, Milano), insieme al worker di transcodifica e a Nginx
Proxy Manager, che fa da ingresso pubblico. Il cluster k3s è stato smontato del tutto:
niente più Longhorn, etcd, Traefik né tunnel Cloudflare.

| | |
|---|---|
| Compose | `~/docker/minio` (MinIO + worker), `~/docker/npm` (proxy), rete condivisa `proxy-net` |
| Domini | `cluster-bucket` (API) e `cluster-bucket-console`, record A su `80.225.95.153`, **DNS only** |
| TLS | Let's Encrypt gestito da NPM, non più terminato da Cloudflare |
| Porte MinIO | pubblicate solo su `127.0.0.1`: l'ingresso passa da NPM |
| Bucket | `lelettricaleoni.com` (quota 100 GiB), `dev.lelettricaleoni.com` (10 GiB) |
| Accesso anonimo | in sola lettura sul **solo prefisso `public/`**; `private/` resta chiuso |
| Notifiche | `notify_webhook:videoworker` → `http://video-worker:8080`, evento `put` su `private/route-videos/` |

Non essendoci più il proxy Cloudflare davanti all'endpoint S3, **è caduto il limite di
100 MB per richiesta** che tagliava i caricamenti dei video più grandi.

Il worker esegue ora l'immagine con ABR: produce `master.m3u8` più `1080p/720p/480p`.
Fino al 2026-09-09 girava una versione più vecchia che produceva una sola qualità piatta,
ed è per questo che `resolveHlsUrl` accetta entrambi i formati.

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
solo `VERCEL_OIDC_TOKEN` e `FLAGS_SECRET`; R2, MinIO, Supabase e Azure vivono solo in
`.env.local`. Scaricare fuori dal progetto e copiare la singola riga che serve.

**La CLI Vercel installata (48.9.0) non ha il comando `flags`** e cade silenziosamente su
`deploy`. Usare `npx vercel@latest`.

## Debito noto

- **`README.md` è disallineato**: descrive `/percorsi`, `/manage/percorsi`,
  `/api/percorsi/[slug]/gpx`, mentre il codice usa `/routes`. Non cita Cesium, MapLibre,
  HLS né MinIO.
- **`revalidate = 3600` è codice morto** (vedi sopra). È la voce con l'impatto maggiore su
  prestazioni e costi fra quelle aperte.
- **Nessun finto servizio**, quindi la CI non può eseguire build né test end-to-end.
- Tre avvisi `react-hooks/set-state-in-effect` su codice funzionante: il pattern `mounted`
  in `mobile-menu.tsx` e `route-card-media.tsx`, e la chiusura del menù al cambio pagina.

## Decisioni passate ancora rilevanti

- `docs/superpowers/specs/2026-09-09-ai-docs-system-design.md` — questo sistema
- `docs/superpowers/specs/2026-09-09-test-suite-design.md` — suite di test, approvata, tre
  fasi, nessuna implementata
- `docs/superpowers/specs/2026-05-29-percorsi-admin-design.md` — sezione percorsi e admin
- `docs/superpowers/plans/2026-05-29-route-detail-redesign.md` — flyover 3D e bento grid
