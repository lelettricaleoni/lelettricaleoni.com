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

- **Rendere obbligatori i controlli nuovi su `main`** — oggi la protezione richiede solo
  `verify`. Vanno aggiunti `browser` e `codeql`, altrimenti restano suggerimenti. Da fare
  dopo qualche giro, quando si sa che non danno falsi allarmi. Va deciso anche se
  richiedere una revisione prima del merge, e se togliere l'esenzione amministratore: è
  quella che mi ha lasciato pushare due volte dritto su `main`. Il 2026-09-11 `browser` ha
  preso un guasto della produzione prima di chiunque: è il candidato più forte.

- **Preview sul database di sviluppo** — oggi le preview leggono e scrivono il database di
  produzione, e i test browser di più PR insieme sono carico su di esso: il 2026-09-11
  hanno esaurito il pooler e fatto cadere la lista percorsi in produzione. Serve che il
  database di sviluppo abbia percorsi pubblicati, altrimenti i test di contenuto non hanno
  cosa guardare.

- **Lockfile delle PR npm di Dependabot** — escono tutte rotte (`npm ci` rifiuta l'`esbuild`
  opzionale di vite, tolto dal suo npm 11). Strade: CI su Node 24/npm 11, o un passo che
  rigeneri il lockfile sul branch di Dependabot. Finché non si risolve, ogni suo
  aggiornamento npm va rifatto a mano come in #63.

- **Togliere `maplibre-gl`** — nessun file lo importa più dal passaggio a Cesium, e la
  versione 5 aveva una vulnerabilità critica: una dipendenza morta porta rischi veri.

- **Rifare la barra dei filtri della lista percorsi** — oggi è una fila di pillole per
  difficoltà e una per tipo di bici, che cresce male: con cinque tipi di bici la seconda
  riga è già lunga, e non c'è modo di combinare i filtri in modo leggibile né di vedere a
  colpo d'occhio quanti percorsi restano. Da ripensare come sezione, non da ritoccare.

- **Interruttore foto ↔ mappa sulle card** — come quello di Google Maps che passa fra
  mappa e satellite. Oggi la card mostra la foto *oppure*, se non ce n'è, la traccia GPX
  disegnata: chi vuole vedere dove passa un percorso con le foto deve aprirlo. Il disegno
  della mappa semplificata esiste già (`gpxPointsToMercatorPath` in `lib/gpx-svg.ts`), va
  reso alternabile invece che di ripiego.

- **Far partire i player dal gradino più basso** — il worker produce ora anche un 360p
  (~550k), con segmenti da 4 s allineati fra le rendition. Resta il lato player: `startLevel:
  -1` in `route-card-media.tsx` e `route-gallery.tsx` lascia stimare la banda a hls.js, che
  parte ottimista e fa vedere la rotella prima di scendere. Vale solo per i video
  ritrascodificati: quelli vecchi non hanno il 360p.

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
- **Regole di dominio come skill di progetto** — previste dalla spec del sistema di
  documentazione, non ancora scritte: `nextjs-16`, `i18n`, `db-migrations`,
  `media-storage`, `maps`.

## Un giorno

- **Rendere reale la cache delle pagine percorsi.** Oggi `revalidate = 3600` non ha effetto
  perché il layout radice legge `headers()`. Recuperarla significa ripensare come arriva la
  lingua, ed è la voce con il maggior guadagno su prestazioni e costi. Un tentativo è sul
  branch `feat/routes-caching` (lingua dall'URL invece che da `headers()`): fermo a metà,
  **senza misure** — prima di riprenderlo, misurare.
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
- **CRF al posto del bitrate nel worker** — misurato il 2026-09-11 su un video reale: a
  parità di VMAF solo −5%, distribuito su tutte le rendition, quindi nulla per chi ha poca
  linea. E renderebbe la banda dichiarata di ogni gradino una proprietà del girato, che è
  il numero su cui hls.js decide se scendere. Dettagli nella PR #5 del worker.
- **404 vero al posto del 200 per una sezione spenta** — si otterrebbe spostando il
  controllo in `proxy.ts`, al prezzo di perdere la pagina "Pagina non trovata" curata. Il
  `noindex` iniettato da Next copre già il lato SEO.
