# Coda del video worker e stato visibile — design

> Approvato il 2026-09-09. Nessuna fase implementata.
> Riguarda il repo `lelettricaleoni/videoStream-bucketWorker` (privato) e questo repo.

## Il problema

Il worker di transcodifica gira in Docker Compose su `clustrenode1` e ha tre difetti,
tutti conseguenza della stessa scelta: la coda è un `queue.Queue` in memoria del processo.

1. **Un riavvio perde il lavoro.** I job in coda evaporano. Il video sorgente resta in
   `private/route-videos/` e non lo raccoglie più nessuno: è un video morto, e nessuno
   se ne accorge.
2. **Lo stato è dedotto, non riportato.** Il sito chiama `resolveHlsUrl`, che chiede a
   MinIO se esiste `master.m3u8`: un binario sì/no, per giunta cachato sette giorni. Il
   worker sa se sta scaricando, transcodificando o se è fallito, ma quell'informazione
   muore nei log del container. È anche la radice del *video fantasma* in roadmap: senza
   un canale, il sito non può distinguere "in elaborazione" da "storage irraggiungibile".
3. **Il fallimento è silenzioso.** Dopo i tentativi il worker logga `FAIL` e passa oltre.

## I vincoli

**La VM può sparire.** Detto da Kevin, ed è il vincolo che dà forma al resto.

**I dati MinIO sono 17 MB** (misurato il 2026-09-09) su un volume Docker che vive solo
dentro quella VM. Il worker cancella il sorgente dopo la transcodifica, quindi **gli HLS
su quella macchina sono l'unica copia esistente dei video del sito**.

**`~/docker` non è versionato.** Compose, `.env`, certificati Let's Encrypt,
configurazione NPM ed export IAM vivono solo lì. L'`iam-backup` prodotto durante la
migrazione sta sulla stessa macchina che potrebbe sparire.

**Upstash free tier: 500.000 comandi al mese**, 256 MB, 10 GB di banda; pay-as-you-go a
$0.20 ogni 100.000 comandi.

## Decisioni

### La coda è ricostruibile, non durevole

Una coda non può essere più durevole dei dati che serve: se la VM sparisce, i job
sopravvissuti altrove punterebbero a oggetti in un bucket che non esiste più — zombie,
non lavoro recuperato.

La verità sta già nello storage: **un oggetto in `private/route-videos/` senza HLS
corrispondente in `public/route-videos/` è un lavoro da fare.** Il worker riconcilia
all'avvio e poi a intervalli, confrontando i due prefissi e accodando ciò che manca.

Il webhook di MinIO resta, ma diventa un'ottimizzazione per reagire subito, non l'unica
via. Il risultato è auto-riparante: sopravvive al riavvio del container, alla
ricostruzione della VM e a un restore da backup, e recupera anche i video rimasti
indietro *prima* di questo lavoro.

### Due Redis, divisi per chi legge il dato

Non per velocità — Upstash è il più lento dei due — ma per topologia.

| | Redis sulla VM | Upstash |
|---|---|---|
| Chi ci parla | il worker, da dentro lo stesso host | il sito, da Vercel |
| Protocollo | TCP permanente, latenza sotto il millisecondo | HTTP, decine di millisecondi |
| Traffico | alta frequenza: polling della coda, lock, progresso | poche scritture per video |
| Contenuto | coda BullMQ | stato dei job, più la cache di lettura che già c'è |

Nessuno dei due può fare il mestiere dell'altro. Il locale è irraggiungibile da una
funzione serverless, che non tiene aperta una connessione TCP fra un'invocazione e
l'altra; esporlo pubblicamente metterebbe la VM sul percorso di ogni richiesta del sito —
la dipendenza che è già costata i 40× sulla home. Upstash, dal canto suo, non regge il
polling: un Worker BullMQ in attesa fa un comando bloccante ogni 5 secondi più un
controllo degli stalled ogni 30, stimati **~600.000 comandi al mese a coda vuota**, sopra
il piano gratuito senza aver transcodificato niente.

Detto in una riga: il Redis locale è lo spazio di lavoro del worker, Upstash è la bacheca
dove appende i risultati.

Con la riconciliazione, Redis sulla VM smette di essere un deposito di verità e diventa un
dettaglio interno rimpiazzabile. BullMQ resta per ciò che sa fare davvero — retry con
backoff, concorrenza, priorità, stato del job già modellato — non per la durabilità.

### La card di stato è solo per l'admin

Scelta di Kevin. Il sito pubblico resta com'è: un video senza manifesto non compare. Il
*video fantasma* resta in roadmap, ma dopo questo lavoro avrà finalmente il dato che oggi
non esiste per risolverlo.

## Fasi

### Fase 0 — Mettere in sicurezza ciò che c'è

Indipendente dal resto, e va per prima perché i video hanno una sola copia.

- `~/docker` diventa un repository git, segreti esclusi, con un `.env.example` dentro: la
  VM si ricostruisce da zero in pochi minuti invece che a memoria.
- `mc mirror` schedulato replica i 17 MB su R2, dove ci sono già credenziali e spazio
  gratuito.
- Al mirror va aggiunto l'export IAM: **le secret key degli utenti non sono rileggibili**,
  quindi senza export gli utenti non si ricreano (trappola già pagata nella migrazione).

### Fase 1 — Il worker

- **BullMQ** (port Python ufficiale di Taskforce.sh, interoperabile con quello Node perché
  condividono gli stessi script Lua). Spariscono `queue.Queue`, il set `_inflight`, il
  thread non-daemon e il ciclo di retry a mano: la deduplica diventa il job id
  (`bucket/key`), i tentativi diventano `attempts` più backoff. Una sessantina di righe di
  logica delicata che si cancellano.
- **Redis** `redis:7-alpine` pinnato, `--appendonly yes`, volume, nessuna porta esposta:
  parla solo col worker sulla rete interna.
- **Riconciliazione** all'avvio e a intervalli, come sopra.
- **Progresso reale** con `ffmpeg -progress pipe:1`, che emette `out_time_ms` mentre
  lavora; la durata viene da `ffprobe`. Percentuale onesta, non un'animazione finta.
- **Secret key fuori dalla riga di comando.** Oggi finisce come argomento di
  `mc alias set`, quindi è leggibile in `ps` e nei log. `mc` supporta
  `MC_HOST_minio=https://ACCESS:SECRET@host`, che è il modo canonico.
- **Stato su Upstash**: chiave `videojob:v1:<storageKey>` con fase, percentuale, tentativo
  ed eventuale errore. Solo alle transizioni, e al massimo una volta ogni pochi secondi per
  il progresso. Scrittura **fail-open**: se Upstash non risponde il worker logga e tira
  dritto — la transcodifica non deve dipendere dal fatto che qualcuno stia guardando.

Verifica su `dev.lelettricaleoni.com` prima di puntarci la produzione.

### Fase 2 — Il pannello

- `lib/video-jobs.ts` legge lo stato con lo stesso contratto di `lib/cache.ts`: bounded e
  fail-open, la lezione dei 40×.
- Route handler protetto sotto `/manage`, che accetta un elenco di storage key.
- In `components/admin/media-upload.tsx` la riga di un video — oggi muta, con un'icona
  generica appena l'upload finisce — mostra il badge (*In coda · Elaborazione 47% · Pronto
  · Fallito*) e interroga ogni tre secondi finché il job non è chiuso, poi smette. La barra
  di progresso esiste già in `ProgressItem`: è il posto in cui innestarsi.
- Test su `lib/video-jobs.ts`, che è puro: parsing, TTL, fail-open.

## Alternative scartate

- **Coda BullMQ su Upstash** — sposterebbe la coda fuori dalla VM, ma i job sopravvissuti
  punterebbero a un bucket sparito, e il polling a vuoto sfora il piano gratuito.
- **Redis locale esposto pubblicamente e letto dal sito** — un solo Redis, ma mette la VM
  sul percorso di ogni richiesta del sito.
- **Adottare un transcoder esistente** — i servizi gestiti (Mux, Cloudflare Stream,
  api.video) si pagano a minuto e portano fuori dal proprio storage; gli open source
  (`azotranscode` e vari transcoder Node/FastAPI) sono progetti personali, non prodotti
  mantenuti; Tdarr e FileFlows lavorano su cartelle di libreria media, non su eventi S3.
  Ciò che mancava non era il transcoder, era la coda.
- **Card di stato ricca anche per i visitatori** — esporrebbe il funzionamento interno per
  i pochi minuti che dura una transcodifica.
