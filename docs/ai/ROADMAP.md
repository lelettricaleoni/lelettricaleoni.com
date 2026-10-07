# Roadmap

> Quattro orizzonti, una riga per voce. Le idee che meritano dettaglio hanno una scheda in
> `ideas/`. Quando una voce entra in implementazione diventa una spec in
> `docs/superpowers/specs/` e qui resta il puntatore.
>
> **"Scartato" non è decorativo**: serve a non far riproporre a nessuno un'idea già
> valutata e bocciata.

## Adesso

- **Sistema di prenotazioni: brainstorming iniziato il 2026-10-02**, la spec andrà in
  `docs/superpowers/specs/`. Troppo grande per una spec sola: fette indipendenti, ognuna con
  spec e piano (calendario e stato bici nel pannello → account cliente e login unificato →
  prenotazione dal sito con Stripe → email e promemoria dal worker → appuntamenti di
  riparazione). Lavoro su `staging`, in produzione solo a lavoro finito, **tranne la fetta 1** (solo pannello):
  ci va appena pronta, perché Kevin registri i noleggi veri (2026-10-02). **Deciso da Kevin:**
  conferma immediata con pagamento **intero** su Stripe; rimborso intero fino a 48 ore prima;
  solo giorni interi; account obbligatorio; i noleggi al banco si registrano nello stesso
  calendario del pannello; disponibilità per **bici fisica e intervallo di date**, con un
  vincolo di esclusione di Postgres (`btree_gist`, disponibile e non installata su dev e
  produzione) contro le doppie prenotazioni; posto tenuto 30 minuti (minimo di una sessione
  Stripe Checkout). **Provato il 2026-10-02** con richieste concorrenti vere sul pooler (spike,
  15/15 controlli): il vincolo regge, ma il codice deve ritentare su `23P01`; rilascio dei
  posti scaduti e assegnazione sono istruzioni separate, senza transazioni (`max_pipeline: 0`).
  **Fetta 1 (calendario e stato delle bici nel pannello): in produzione dal 2026-10-05**, con i clienti
  (anagrafica, ricerca nel modale, pagina Customers con storico e incasso) e l'importo del noleggio
  (PR #227-#251, migrazioni `0010`-`0014`). **Restano a Kevin**: in dashboard Supabase di produzione,
  Realtime → Settings → «Allow public access» (senza, il calendario si aggiorna solo ricaricando) e la
  prova a mano in produzione. Spec in
  `docs/superpowers/specs/2026-10-02-booking-slice1-admin-calendar-design.md`, piano in
  `docs/superpowers/plans/2026-10-02-booking-slice1-admin-calendar.md`. Griglia su `date-fns` e CSS:
  gli scheduler con vista a risorse sono a pagamento o non adatti (confronto nella spec). Le fette 2-5
  sono da disegnare. Per l'account cliente: collegare chi si registra a `customers` per email (`user_id`) e
  mostrargli solo le prenotazioni online; gli account non admin oggi sono tutti di Kevin.
  Il calendario di Kevin sta in `C:\AzureDevOps\firebase` (`app/rent/`, da portare ricollegandolo
  ai dati veri); il resto di quel repo (Firestore, Stripe di prova) non si riusa.
  **Date**: colonne `date`/`daterange` e stringhe `YYYY-MM-DD` (mai `Date` per un giorno di
  calendario: il server Vercel è in UTC e dopo le 22 a Roma vedrebbe già il giorno dopo);
  libreria `date-fns` 4 + `@date-fns/tz`, calendario di shadcn (`react-day-picker`) con la
  vista settimana/mese di Kevin sopra. Validazione con `zod`, telefoni con `libphonenumber-js`,
  firma del webhook Stripe con l'SDK: niente regex né controlli fatti a mano.
  **Anticipo massimo**: pagina pubblica prenotabile fino a 180 giorni da oggi (`MAX_DAYS` del
  calendario di Kevin), solo lì, non nel pannello (Kevin, 2026-10-02).
  **Controlli e tempo reale** (Kevin, 2026-10-02): più livelli contro gli inserimenti doppi, in
  pannello e in pagina pubblica (pulsante disattivato, chiave di idempotenza `request_key`,
  avviso di doppione per lo stesso nome con due bici diverse, controllo su dati freschi,
  vincolo del database), e aggiornamenti in tempo reale con Supabase Realtime Broadcast inviato
  da un trigger del database (solo un campanello senza dati personali, il client rilegge).

## Prossimo

- **Fetta B del worker: una pagina dei lavori nel pannello** (Kevin, 2026-10-06): elenco dei lavori, «Riprova» per i
  falliti, pausa e ripresa di una coda, «Rielabora» per le sole foto (i video non si possono rielaborare: l'originale non si
  conserva, scelta di Kevin). Ora che la coda è BullMQ e il sito la legge (`lib/queues/`), serve una spec e un piano a parte
  (prossimo passo: brainstorming). Il worker in Node è in produzione dal 2026-10-07; spec e piano della fetta A in
  `docs/superpowers/specs/2026-10-06-node-worker-design.md` e `docs/superpowers/plans/2026-10-06-node-worker.md`.
- **Chiudere la migrazione del worker** (Kevin, 2026-10-07; elenco completo, comandi e stato in `docs/ai/ideas/node-worker-cutover.md`,
  piano residuo in `docs/superpowers/plans/2026-10-06-node-worker.md`): **provare dal pannello** una foto HEIC verticale dall'iPhone (l'unica
  verifica mai fatta con un file vero), un JPEG, un MP4 e un file rotto (il #283 deve rifiutarlo), e aprire `/manage/dev` in produzione; **dopo una
  settimana tranquilla (intorno al 2026-10-14)** archiviare il repo Python (`gh repo archive`), `docker compose down -v` in `~/docker/worker` sulla
  VM, togliere la cartella e la riga di `authorized_keys` di quel repo. Python è fermo, non spento: è il ritorno indietro. Fatto il 2026-10-07: in
  produzione, tre PNG che Kevin aveva caricato rotti sono stati cancellati da R2 (erano l'errore di caricamento su `bdd7a446`).
- **Mettere a punto Google Search Console e Analytics**, dopo il giro di implementazioni in
  corso (chiesto da Kevin il 2026-09-25). Su Analytics: costruire qualche dashboard. Su
  Search Console: oggi è in disordine ("un bel casino") — prima un inventario di cosa c'è
  (proprietà, sitemap, pagine indicizzate, errori) e solo dopo si tocca qualcosa. Gli MCP
  `google-search-console` e `google-analytics` sono già registrati sulla macchina di Kevin.
  **Inventario fatto il 2026-09-25** (sola lettura): scheda con numeri, problemi e proposte in
  ordine in `docs/ai/ideas/search-console-analytics.md`. In breve: la ricerca è sana ma l'apex
  senza `www` prende due terzi dei clic pur essendo un reindirizzamento (e il redirect di `/` è
  un 301 che dipende dalla lingua), `staging` compare negli indici, e Analytics non ha né
  dimensioni personalizzate né eventi chiave. **Strategia scritta lo stesso giorno** in
  `docs/ai/ideas/search-strategy.md`: obiettivo (i contatti: telefonate, email, indicazioni),
  punto di partenza, quattro fasi (misurare → sistemare le basi → pagine per chi non ci conosce
  → revisione mensile), i sei numeri da guardare e le quattro decisioni che aspettano Kevin
  (credenziali per la dashboard, Google Business Profile, via alla Fase 1, testi delle pagine
  di servizio). **Aggiornamento 2026-09-30:** la Fase 1 è fatta (staging noindex, titoli, H1 e
  dati strutturati dal database: #189; ogni percorso senza lingua ora con un 307: #190), le
  pagine di servizio e le cinque di zona sono online solo per l'indicizzazione (#185, #188), e
  titoli e descrizioni dei percorsi sono una regola nel codice (#206) con i testi dei 7
  percorsi riscritti in produzione. **Aggiornamento 2026-10-02:** i sette «Product snippets» non
  validi sulla home (annidati in `Offer.itemOffered`) sono corretti con #214: resta da premere
  «Convalida correzione» in Search Console. Kevin ha escluso la dashboard `/manage/analytics`
  (vedi Scartato), e con lei cade la decisione 1 (credenziali di Google su Vercel).
  **Fatto da Kevin il 2026-10-05**: la scheda Google Business Profile (decisione 2), «Convalida correzione» sui
  prodotti della home e la protezione delle password trapelate. **Resta**: rileggere Search Console a fine ottobre
  (punto di partenza: `/it/routes/bdd7a446`, 294 impressioni e CTR 2,7%).

## Un giorno

- **Pulizia di Vercel**, dopo qualche settimana tranquilla dal passaggio del 2026-10-06: cancellare il progetto,
  **cancellare il database Upstash** e togliere le variabili `UPSTASH_*` da Vercel e dalla VM (il sito non le legge più),
  togliere `vercel.json` e le variabili, il segreto `VERCEL_AUTOMATION_BYPASS_SECRET` e gli ambienti GitHub
  «Preview» e «Production» creati dall'integrazione; **ruotare** la password del database di produzione e il
  token del tunnel (comparsi in una trascrizione), togliere il CORS e i record DNS che servivano al ripiego.
- **Più capacità del sito, solo se i picchi la chiedono**: oggi un processo Node per ambiente (una CPU di due)
  regge 4-6 req/s sulle pagine pesanti contro un picco reale di ~0,04. Il primo passo sarebbe la cache di
  Cloudflare davanti alle pagine pubbliche (la durata sarebbe quella del profilo `catalog`, 10-30 s), il secondo
  `pm2` in cluster con 2 processi (cache in memoria per processo, come le istanze di Vercel).
- **Studiare come usare il viola del logo** (`#795F91`, token `brand-purple`, oggi
  inutilizzato). Kevin lo vuole nel sito ma non "blu dappertutto": l'idea è usarlo nelle
  sezioni di **prenotazione e appuntamenti**, quando ci saranno, con uno studio più
  approfondito di dove e come. Provato e bocciato il 2026-09-25: viola per "il lato bici"
  (sezione in home, prezzo e categoria sulle card) — Kevin ha tenuto la composizione della
  sezione ma ha voluto i colori di prima. Il contrasto sul bianco è 5,4:1, quindi regge
  anche come testo.
- **Limitare l'area esplorabile della mappa 3D del flyover** a una zona attorno al
  tracciato GPX — oggi si può navigare su tutto il pianeta. Rimandato apposta il
  2026-09-22 alla consegna del profilo altimetrico, per tenere le due feature separate.
- **Primi lavori non-video sul worker** — promemoria prenotazioni ed estratti conto. Non
  utile finché non si aggiungono molte altre funzionalità di cui Kevin parlerà in futuro:
  spostato qui da "Prossimo" il 2026-09-16, non è più imminente. L'impalcatura c'è già:
  un `createXHandler` in `worker/jobs/`, una coda in `lib/queues/names.ts` e una riga in `worker/main.ts`; per i cron
  lo scheduler di BullMQ. Nota: **il piano Vercel è hobby**, quindi i
  cron di Vercel (due per progetto, uno al giorno) non sono un'alternativa per lavori più
  frequenti.
- **Unificare login/cambio password admin con quelli pubblici** — oggi `/manage/login` e
  `/manage/update-password` sono duplicati admin-only di `/[lang]/login` e
  `/[lang]/update-password`, già multilingua (`/[lang]/login` sul sistema vero
  `messages/*.json`, `/[lang]/update-password` con un dizionario inline da migrare).
  Kevin ha confermato (2026-09-21) che serve quando arriveranno utenti normali che
  prenotano e devono accedere al proprio profilo — lavoro architetturale a sé, da
  affrontare con un brainstorming dedicato insieme al sistema di prenotazioni, non prima.
  `/manage/users` (gestione staff) resta admin-only per sempre, non è coinvolta.

## Scartato

- **Conservare gli originali delle foto e dei video** (silo sulla VM, bucket privato, MinIO — Kevin, 2026-10-06): il
  sorgente si cancella dopo l'elaborazione, come sempre. Costerebbe storage a pagamento e un secondo posto fragile per
  un file che nessuno rilegge; chi vuole l'originale lo tiene sul proprio computer. Non riproporlo. Ne segue che
  «Rielabora» (fetta B) vale solo per le foto, dal master.
- **Un'anteprima per ogni pull request sulla VM** (2026-10-06) — richiederebbe un reverse proxy davanti al tunnel
  e porterebbe CPU a un server con due soli core già contesi dal worker. Il controllo `browser` costruisce invece
  l'immagine nel job e la prova su `localhost`, con i dati di sviluppo.
- **Feature flag (Vercel Flags)** — sei interruttori per spegnere una sezione senza un deploy; tolti il 2026-10-05
  perché Kevin non li usava mai e con il passaggio dal server non avrebbero più il loro servizio. Se servisse di
  nuovo un interruttore d'emergenza: una tabella nel database con una pagina nel pannello, non un servizio esterno.
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
- **Ponte JPEG da 1200 px per le card, via l'ottimizzatore di Vercel** (#175, 2026-09-25) —
  perdeva la trasparenza e a schermi ad alta densità era morbido. Sostituito dalle tre
  versioni AVIF che il worker scrive accanto al master, scelte da `lib/photo-loader.ts`.
- **`'use cache: remote'` per invalidare i cataloghi su tutte le istanze** — risolverebbe il
  limite di `updateTag`, che scade la voce solo nell'istanza che esegue l'azione, ma costa un
  giro di rete a ogni lettura e ha costi di piattaforma. Scartato per ora (2026-09-25): il
  profilo `catalog` a 10s/30s rende sopportabile l'attesa.
- **Fondere in un solo salto apex → `www` e lingua** — guadagnerebbe circa 200 ms, ma il
  redirect dell'apex è un'impostazione di dominio di Vercel: spostarlo nel codice vorrebbe
  dire gestire a mano `sitemap.xml`, `robots.txt` e i file statici, che il matcher del proxy
  esclude e che l'apex servirebbe quindi con 200 (contenuto duplicato). Catena misurata in
  produzione il 2026-09-29: 308 (http→https) → 308 (apex→www) → 301 (lingua, oggi 307) → 200.
- **Dashboard di Analytics e Search Console dentro il pannello (`/manage/analytics`)** — era nella
  strategia di ricerca; esclusa da Kevin il 2026-10-02 («per analytics non si fa nulla sulla
  dashboard del sito»), motivo non dichiarato. Con lei cade la credenziale di Google su Vercel.
  Nota: l'MCP di Analytics è in sola lettura (report, funnel, realtime), non può creare grafici
  o dimensioni dentro Google Analytics.
- **Cambiare la qualità AVIF delle foto (`IMAGE_QUALITY=65`)** — Kevin la trova buona a occhio e
  ha chiesto di non toccarla (2026-09-25).
