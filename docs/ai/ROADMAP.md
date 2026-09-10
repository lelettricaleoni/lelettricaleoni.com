# Roadmap

> Quattro orizzonti, una riga per voce. Le idee che meritano dettaglio hanno una scheda in
> `ideas/`. Quando una voce entra in implementazione diventa una spec in
> `docs/superpowers/specs/` e qui resta il puntatore.
>
> **"Scartato" non è decorativo**: serve a non far riproporre a nessuno un'idea già
> valutata e bocciata.

## Adesso

_(niente in lavorazione)_

## Prossimo

- **Pannello per gli account amministratori** — oggi un admin si crea solo dalla console
  Supabase, mettendo a mano `app_metadata.role = 'admin'`: non è una cosa che Kevin possa
  fare da solo quando serve. Serve una sezione in `/manage` che inviti un utente, gli
  assegni il ruolo e lo revochi. Va costruita sull'API admin di Supabase, quindi con la
  service role key, che non deve mai raggiungere il client — e va decisa la regola che
  impedisce a un admin di togliere il ruolo all'ultimo rimasto.

- **Aggiornare il player video** — siamo su `@videojs/react` e `@videojs/hlsjs-video`
  `10.0.0-rc.1`; il 2026-09-09 è uscita la **rc.2**, che è fuori dalla beta ma ancora una
  release candidate: la 10.0.0 stabile non è pubblicata. Da aggiornare alla rc.2 subito e
  alla stabile appena esce. Nello stesso giro anche `hls.js`, fermo a `^1.6.16` con la
  1.7.2 disponibile.

- **Card dei percorsi allineate fra loro** — nella lista le card si sfalsano: il titolo ha
  `line-clamp-2` ma se sta su una riga la card si accorcia, e i tag delle bici vanno a capo
  quando sono molti. Kevin propone di riservare sempre due righe al titolo; meglio ancora
  **`grid-rows-subgrid`**, che fa ereditare alle card le righe della griglia in
  `route-filters.tsx:117` — titolo, tag e statistiche si allineano da soli e senza spazio
  sprecato quando i titoli sono corti. I tag su **una riga sola con scroll orizzontale
  manuale** e una sfumatura sul bordo: l'auto-scroll obbliga ad aspettare che il tag
  ripassi, e andrebbe comunque disattivato con `prefers-reduced-motion`.

- **Il logo nella 404 non deve essere premibile** — `app/not-found.tsx:12` lo avvolge in un
  `<Link href="/it">`, mentre sotto ci sono già i pulsanti per tornare indietro.

- **Un gradino più basso per chi ha poca linea** — la scala adattiva si ferma al 480p, che
  pretende ~1 Mbps stabile: sotto quella soglia hls.js non ha dove scendere e il video si
  pianta invece di degradarsi. I clienti guardano questi video sui sentieri sopra Dro, dove
  la linea è scarsa. Serve un **360p attorno ai 500-600k** (+~8% di spazio), e i player
  vanno fatti partire dal gradino più basso: oggi `startLevel: -1` in `route-card-media.tsx`
  e `route-gallery.tsx` lascia stimare la banda a hls.js, che parte ottimista e fa vedere la
  rotella prima di scendere.

- **Qualità costante al posto del bitrate fisso nel worker** — misurato il 2026-09-10 su un
  video reale di 93 s: **72 MiB, cioè 46 MiB al minuto** con le tre rendition (1080p 55%,
  720p 29%, 480p 16%). Il worker usa `-b:v` fisso, quindi spende lo stesso su un'inquadratura
  ferma e su una discesa. Con `-crf` più un tetto `-maxrate` le tre qualità **restano tutte**
  e il video parte prima su connessioni lente: meno byte a parità di resa, non meno qualità.
  Kevin vuole tenere le tre rendition e l'esperienza migliore possibile — questa voce non le
  toglie, ma va misurata sul suo materiale prima di adottarla.
  Per dimensionare: 10 GB gratuiti R2 = ~222 minuti; 100 GB costerebbero $1,35 al mese.

- **Video fantasma a storage irraggiungibile** — con lo storage giù il video compare lo
  stesso con la scritta "Video in elaborazione", invece di sparire. Sospetto che la cache
  del manifesto (7 giorni) lo faccia risultare pronto anche quando lo storage non risponde.
  Ora il dato per distinguere i due casi esiste: il worker pubblica lo stato reale su
  Upstash, e la pagina pubblica può leggerlo invece di dedurlo.

- **Primi lavori non-video sul worker** — promemoria prenotazioni ed estratti conto, che
  Kevin ha in programma. L'impalcatura c'è: `jobs/__init__.py` è il registro, un modulo più
  una riga in `HANDLERS`, e per i cron una riga in `SCHEDULES` con lo scheduler di BullMQ.
  Nota: **il piano Vercel è hobby**, quindi i cron di Vercel (due per progetto, uno al
  giorno) non sono un'alternativa per lavori più frequenti.
- **Suite di test, fase 1** — fondamenta vitest con ambiente DOM, più i test su `proxy.ts`
  e sull'allineamento delle chiavi dei dizionari. → `docs/superpowers/specs/2026-09-09-test-suite-design.md`
- **Test di ogni pagina e budget di prestazioni** — richiesti esplicitamente dopo che una
  regressione da 40× è arrivata in produzione senza che nulla la fermasse. Devono
  verificare il **contenuto**, non il codice HTTP: qui una pagina spenta risponde 200.
- **Suite di test, fase 2** — finti servizi dietro `USE_FAKE_SERVICES`, per lavorare a
  Supabase o R2 irraggiungibili e per far girare build ed end-to-end in CI.
- **Regole di dominio come skill di progetto** — previste dalla spec del sistema di
  documentazione, non ancora scritte: `nextjs-16`, `i18n`, `db-migrations`,
  `media-storage`, `maps`.

## Un giorno

- **Rendere reale la cache delle pagine percorsi.** Oggi `revalidate = 3600` non ha effetto
  perché il layout radice legge `headers()`. Recuperarla significa ripensare come arriva la
  lingua, ed è la voce con il maggior guadagno su prestazioni e costi.
- **Riscrivere `README.md`**, che descrive rotte e stack non più esistenti. È il documento
  per lettori umani e va trattato come tale, non fuso con `STATE.md`.
- **Sistemare i tre `set-state-in-effect`** in `mobile-menu.tsx` e `route-card-media.tsx`,
  oggi declassati ad avviso in `eslint.config.mjs`.
- **Flags Explorer nella Vercel Toolbar** — permette di sovrascrivere un flag solo per sé
  dal browser, senza toccare ciò che vedono i visitatori.
- **Ridurre il tetto di attesa a freddo dei flag** da 1,5 s a poche centinaia di
  millisecondi, ora che i flag esistono e la valutazione è rapida.

## Scartato

- **Precomputation dei feature flag** — pensata per pagine statiche servite dalla CDN. Qui
  non serve: tutte le rotte sono già dinamiche, quindi porterebbe fino a 32 varianti di
  pagina senza alcun guadagno.
- **Variabili d'ambiente come sorgente dei feature flag** — sostituite da Vercel Flags il
  2026-09-09. Sono legate al singolo deployment, quindi spegnere una sezione costava una
  build. Sopravvivono solo come override di sviluppo.
- **Conversione geoide→ellissoide per la traccia 3D** — avrebbe corretto lo scarto
  sistematico di −46 m ma non la dispersione di ±29 m dovuta al DEM, lasciando la traccia
  sepolta a tratti. Ancorare al terreno risolve entrambi.
- **Test end-to-end del flyover 3D** — WebGL headless più un token Cesium Ion: lento,
  ballerino, e verrebbe disattivato al primo fallimento casuale. Meglio un buco dichiarato.
- **Coda BullMQ ospitata su Upstash** — sposterebbe la coda fuori dalla VM, ma i job
  sopravvissuti punterebbero a un bucket sparito, e il polling a vuoto è stimato in
  ~600.000 comandi al mese contro un piano gratuito da 500.000.
- **Migrare da R2 a MinIO** (la direzione opposta a quella presa) — porterebbe dentro
  l'unico posto fragile i dati che stanno in quello solido, e metterebbe la VM sul percorso
  di rendering di ogni pagina. Inoltre lo storage OCI costa **$0.0425/GB-mese** contro i
  **$0.015** di R2, con un tetto di 200 GB già esaurito dal disco della VM.
- **Windmill o Temporal come orchestratore** — valutati il 2026-09-10 per far girare più
  lavori diversi. Windmill gira su ARM e darebbe UI, cron e log già pronti, al prezzo di
  Postgres e ~2 GB di RAM su una macchina con due sole CPU che ffmpeg satura. Scelto invece
  di estendere il worker che c'è. Da riprendere se i lavori diventano molti e la mancanza
  di una UI comincia a pesare.
- **Cloudflare Stream al posto del worker** — farebbe transcodifica, storage e player, con
  encoding gratuito. Ma lo storage è prepagato a scatti di **$5/mese ogni 1.000 minuti**,
  quindi per quattro video corti si pagherebbero 60 euro l'anno contro lo zero attuale.
  Diventa conveniente quando i video crescono di numero o durata.
- **Adottare un transcoder già fatto invece del worker custom** — i servizi gestiti (Mux,
  Cloudflare Stream) si pagano a minuto e portano fuori dal proprio storage; gli open
  source sono progetti personali, non prodotti; Tdarr e FileFlows lavorano su cartelle di
  libreria, non su eventi S3. Non mancava il transcoder, mancava la coda.
- **404 vero al posto del 200 per una sezione spenta** — si otterrebbe spostando il
  controllo in `proxy.ts`, al prezzo di perdere la pagina "Pagina non trovata" curata. Il
  `noindex` iniettato da Next copre già il lato SEO.
