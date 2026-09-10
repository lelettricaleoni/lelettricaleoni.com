# Coda del video worker e stato visibile — design

> Approvato il 2026-09-09, rivisto e **implementato il 2026-09-10**. Resta aperta solo la
> fase 4, lo spegnimento di MinIO, che aspetta la conferma sul campo.
>
> Due cose sono cambiate in corsa rispetto a quanto scritto sotto, entrambe su richiesta di
> Kevin, e le sezioni successive vanno lette con queste in mente:
>
> - **Lo stato non passa dal sito.** Il worker scrive direttamente su Upstash con un utente
>   ACL che può solo `SET` su `videojob:*` e non può leggere. L'endpoint `/api/worker/...`
>   previsto sotto è stato scritto e poi rimosso: un salto in meno, un endpoint in meno, e
>   un deploy in corso non fa più perdere aggiornamenti.
> - **Il worker è diventato un runner generico.** `main.py` avvia un worker per ogni coda in
>   `jobs/__init__.py`; la transcodifica è uno dei possibili lavori. I cron passano dallo
>   scheduler di BullMQ, non da un loop nostro.
>
> Riguarda il repo `lelettricaleoni/videoStream-bucketWorker` (privato) e questo repo.

## Il problema

Il worker di transcodifica gira in Docker Compose su `clustrenode1` e ha tre difetti,
tutti conseguenza della stessa scelta: la coda è un `queue.Queue` in memoria del processo.

1. **Un riavvio perde il lavoro.** I job in coda evaporano. Il video sorgente resta in
   `private/route-videos/` e non lo raccoglie più nessuno: è un video morto, e nessuno
   se ne accorge.
2. **Lo stato è dedotto, non riportato.** Il sito chiede allo storage se esiste
   `master.m3u8`: un binario sì/no, per giunta cachato sette giorni. Il worker sa se sta
   scaricando, transcodificando o se è fallito, ma quell'informazione muore nei log del
   container. È anche la radice del *video fantasma* in roadmap: senza un canale, il sito
   non può distinguere "in elaborazione" da "storage irraggiungibile".
3. **Il fallimento è silenzioso.** Dopo i tentativi il worker logga `FAIL` e passa oltre.

## Il vincolo che ha dato forma al resto

**La VM può sparire.** Detto da Kevin il 2026-09-09.

Da lì è emerso che i video vivevano **solo** lì: il worker cancella il sorgente dopo la
transcodifica, non c'erano backup, e il volume Docker stava su un disco solo. Foto e GPX
erano già su R2; i video no.

La prima idea era replicare quei 17 MB su R2 come backup. La seconda, migliore, è che se
la copia di sicurezza va su R2 tanto vale **che i video ci vivano**.

### I numeri che hanno deciso

| | oltre il gratuito | replica |
|---|---|---|
| R2 | $0.015 per GB-mese, egress gratis | gestita da Cloudflare |
| Block volume OCI | $0.0425 per GB-mese | nessuna |

Il free tier OCI dà 200 GB di block storage **in totale**, boot volume compreso, ed è già
esaurito: il disco della VM è stato portato a 200 GB. Lo storage della VM costa quindi
quasi il triplo di R2 e nessuno lo replica.

I 10 GB gratuiti di R2 valgono **circa 650 video** al peso attuale (4 MB l'uno oggi a
qualità singola, ~12-15 MB con le tre rendition ABR). Superarli costerebbe 60 centesimi al
mese a 50 GB.

## Architettura d'arrivo

**R2 è l'unico storage.** Foto, GPX, video e flussi HLS. MinIO, Nginx Proxy Manager, i
domini `cluster-bucket` e i loro certificati vengono spenti: esistevano per tenere i video
e per esporre MinIO al webhook.

**La VM resta solo per la CPU.** Un container che prende video da R2, li converte e li
rimette su R2. **Nessuna porta aperta verso internet**, perché il worker parla solo in
uscita.

**La coda è ricostruibile, non durevole.** Una coda non può essere più durevole dei dati
che serve. La verità sta già nello storage: un video senza HLS corrispondente è un lavoro
da fare. Il worker elenca R2 e accoda ciò che manca — all'avvio e a intervalli. Questo
sostituisce il webhook di MinIO, che sparisce insieme a MinIO, ed è auto-riparante:
sopravvive al riavvio del container, alla ricostruzione della VM e a un restore, e recupera
anche i video rimasti indietro in passato.

Il costo è un `LIST` ogni mezzo minuto, cioè ~86.000 operazioni di classe A al mese, dentro
il milione gratuito.

**Lo stato passa dal sito, non da un secondo Redis.** Il worker fa una `POST` autenticata
con token condiviso a `/api/worker/job-status`; è il sito a scrivere lo stato su Upstash,
che già interroga. Così il worker ha una sola dipendenza esterna — R2 — nessuna credenziale
di database sulla VM, e niente porte da aprire.

Scartata l'idea che il sito legga direttamente il Redis della VM: Vercel esegue funzioni
effimere che dovrebbero riaprire una connessione TCP a ogni invocazione, e servirebbe
riesporre una porta pubblica proprio mentre le stiamo chiudendo.

**Redis e BullMQ restano**, per decisione esplicita di Kevin del 2026-09-10: il sito verrà
espanso e serviranno altre code e altri tipi di worker. Va detto chiaramente che per la
sola transcodifica sarebbero sovradimensionati, ora che la coda vive dentro R2 — sono un
investimento sulla piattaforma futura, non un bisogno di oggi.

**La card di stato è solo per l'admin.** Scelta di Kevin. Il sito pubblico resta com'è: un
video senza manifesto non compare.

## Fasi

L'ordine protegge la produzione: fino alla fase 2 MinIO resta acceso e intatto, quindi
ogni passo è reversibile spostando un puntatore.

### Fase 1 — I dati su R2, produzione per prima

Copiare i video e i loro HLS da MinIO a R2. Sono 4 video, 16 MB, e il prefisso `public/`
è leggibile anonimamente, quindi il trasferimento non richiede credenziali nuove sulla VM.

### Fase 2 — Il sito legge da R2

`resolveHlsUrl` e la costruzione degli URL passano da `lib/minio.ts` a `lib/r2.ts`, che già
serve foto e GPX. L'upload dal pannello cambia destinazione: `getPresignedUploadUrl` in
`lib/r2.ts` esiste già e fa esattamente ciò che serve.

**Verificare sulla produzione che i quattro video si vedano davvero, guardando il
contenuto**: qui una pagina spenta risponde comunque 200.

Da ripensare in questa fase la cache a sette giorni di `resolveHlsUrl`, sospettata dietro
il video fantasma.

### Fase 3 — Il worker

- **BullMQ** (port Python ufficiale di Taskforce.sh, interoperabile con quello Node perché
  condividono gli stessi script Lua) con **Redis** `redis:7-alpine` pinnato, `--appendonly
  yes`, nessuna porta esposta. Spariscono `queue.Queue`, il set `_inflight`, il thread
  non-daemon e il ciclo di retry a mano.
- **Sorgente dei job**: elenco di R2, come sopra. Il server HTTP del webhook sparisce.
- **Progresso reale** con `ffmpeg -progress pipe:1`, che emette `out_time_ms` mentre
  lavora; la durata viene da `ffprobe`.
- **Secret key fuori dalla riga di comando**: oggi finisce come argomento di
  `mc alias set`, quindi è leggibile in `ps` e nei log. Usare `MC_HOST_<alias>`.
- **Stato** via `POST` al sito, fail-open: se la chiamata non riesce il worker logga e tira
  dritto — la transcodifica non deve dipendere dal fatto che qualcuno stia guardando.

### Fase 4 — Spegnere MinIO

Solo a produzione confermata: MinIO, NPM, i due domini `cluster-bucket` e i certificati.
Prima di spegnere, un export IAM conservato altrove — **le secret key degli utenti non sono
rileggibili**, trappola già pagata nella migrazione da k3s.

### Fase 5 — Il pannello

- `lib/video-jobs.ts` legge lo stato con lo stesso contratto di `lib/cache.ts`: bounded e
  fail-open, la lezione dei 40×.
- In `components/admin/media-upload.tsx` la riga di un video — oggi muta, con un'icona
  generica appena l'upload finisce — mostra il badge (*In coda · Elaborazione 47% · Pronto
  · Fallito*) e interroga finché il job non è chiuso. La barra di progresso esiste già in
  `ProgressItem`: è il posto in cui innestarsi.
- Test su `lib/video-jobs.ts`, che è puro: parsing, TTL, fail-open.

## Alternative scartate

- **Migrare da R2 a MinIO** (la direzione opposta) — porterebbe dentro l'unico posto
  fragile i dati che stanno in quello solido, e metterebbe la VM sul percorso di rendering
  di ogni pagina, foto delle card comprese.
- **Coda BullMQ ospitata su Upstash** — i job sopravvissuti punterebbero a oggetti spariti,
  e il polling a vuoto è stimato in ~600.000 comandi al mese contro un piano gratuito da
  500.000.
- **Il sito legge il Redis della VM** — connessione TCP da funzioni effimere e una porta
  pubblica da riaprire.
- **Solo un backup dei video su R2**, lasciandoli su MinIO — metà del lavoro per metà del
  risultato: la VM resterebbe critica.
- **Adottare un transcoder già fatto** — i servizi gestiti (Mux, Cloudflare Stream) si
  pagano a minuto; gli open source sono progetti personali, non prodotti; Tdarr e FileFlows
  lavorano su cartelle, non su eventi. Non mancava il transcoder, mancava la coda.
- **Card di stato ricca anche per i visitatori** — esporrebbe il funzionamento interno per
  i pochi minuti che dura una transcodifica.
