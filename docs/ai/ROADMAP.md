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
  riparazione). Lavoro su `staging`, in produzione solo a lavoro finito. **Deciso da Kevin:**
  conferma immediata con pagamento **intero** su Stripe; rimborso intero fino a 48 ore prima;
  solo giorni interi; account obbligatorio; i noleggi al banco si registrano nello stesso
  calendario del pannello; disponibilità per **bici fisica e intervallo di date**, con un
  vincolo di esclusione di Postgres (`btree_gist`, disponibile e non installata su dev e
  produzione) contro le doppie prenotazioni; posto tenuto 30 minuti (minimo di una sessione
  Stripe Checkout). Da provare per prima cosa con richieste concorrenti vere: rilascio dei
  posti scaduti + assegnazione in istruzioni separate, senza transazioni (`max_pipeline: 0`).
  Il calendario di Kevin sta in `C:\AzureDevOps\firebase` (`app/rent/`, da portare ricollegandolo
  ai dati veri); il resto di quel repo (Firestore, Stripe di prova) non si riusa.
  **Date**: colonne `date`/`daterange` e stringhe `YYYY-MM-DD` (mai `Date` per un giorno di
  calendario: il server Vercel è in UTC e dopo le 22 a Roma vedrebbe già il giorno dopo);
  libreria `date-fns` 4 + `@date-fns/tz`, calendario di shadcn (`react-day-picker`) con la
  vista settimana/mese di Kevin sopra. Validazione con `zod`, telefoni con `libphonenumber-js`,
  firma del webhook Stripe con l'SDK: niente regex né controlli fatti a mano.

## Prossimo

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
  **Restano**: la decisione 2 (Google Business Profile) e rileggere Search Console a fine ottobre
  (punto di partenza: `/it/routes/bdd7a446`, 294 impressioni e CTR 2,7%).

## Un giorno

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
  `jobs/__init__.py` è il registro, un modulo più una riga in `HANDLERS`, e per i cron una
  riga in `SCHEDULES` con lo scheduler di BullMQ. Nota: **il piano Vercel è hobby**, quindi i
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

- **`getFlags()` dentro una funzione `"use cache"`** — pensato per cache-are DB e flag
  insieme sulle pagine percorsi (2026-09-14). `@flags-sdk/vercel` legge `headers()`
  internamente, vietato in uno scope `"use cache"` anche indirettamente: la build fallisce
  con un errore esplicito. I flag restano fuori dalla cache, letti dinamicamente e preceduti
  da `connection()`; solo il lavoro DB/R2 è cache-ato.
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
