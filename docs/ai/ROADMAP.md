# Roadmap

> Quattro orizzonti, una riga per voce. Le idee che meritano dettaglio hanno una scheda in
> `ideas/`. Quando una voce entra in implementazione diventa una spec in
> `docs/superpowers/specs/` e qui resta il puntatore.
>
> **"Scartato" non è decorativo**: serve a non far riproporre a nessuno un'idea già
> valutata e bocciata.

## Adesso

- **Elaborazione delle foto sul worker: in produzione dal 2026-09-25**, resta la verifica.
  Le foto caricate dal pannello diventano un master AVIF prodotto dal worker, con sorgente
  cancellato e SHA-256 pubblicato (worker PR #9, sito #162; spec e piano in
  `docs/superpowers/specs/2026-09-23-image-processing-worker-design.md` e nel piano gemello).
  Verificato: un TIF vero di Kevin, e sulla VM una foto sintetica (TIFF RGB, PNG trasparente,
  TIFF grigio a 16 bit, un `.jpg` corrotto che resta dov'è). **Da fare**: HEIC e PNG
  trasparente dal pannello, anteprima social con lo Sharing Debugger, tempi della pagina di un
  percorso con foto in staging prima e dopo. La qualità AVIF (`IMAGE_QUALITY=65`) resta
  com'è: Kevin la trova buona a occhio e ha chiesto di non toccarla (2026-09-25).
  **Fatto il 2026-09-25 (soluzione 3):** il worker scrive anche tre versioni AVIF
  ridimensionate accanto a ogni master (worker PR #10, con il recupero dei master esistenti)
  e il sito le sceglie con un loader suo (#176), perché l'ottimizzatore di Vercel non
  ridimensiona l'AVIF. Verificato in produzione: le card caricano `…w480.avif`.

## Prossimo

- **Mettere a punto Google Search Console e Analytics**, dopo il giro di implementazioni in
  corso (chiesto da Kevin il 2026-09-25). Su Analytics: costruire qualche dashboard. Su
  Search Console: oggi è in disordine ("un bel casino") — prima un inventario di cosa c'è
  (proprietà, sitemap, pagine indicizzate, errori) e solo dopo si tocca qualcosa. Gli MCP
  `google-search-console` e `google-analytics` sono già registrati sulla macchina di Kevin.

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
