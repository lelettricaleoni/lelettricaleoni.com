# Design Spec — SHA-256 per ogni file caricato

**Data**: 2026-09-21
**Branch**: `main`
**Stato**: approvato, pronto per il piano di implementazione

---

## Obiettivo

Ogni file caricato nel pannello admin (foto, video, GPX — per percorsi e per modelli di
bici) deve avere uno SHA-256 calcolato e salvato, per tre scopi insieme: **integrità**
(sapere che il file su R2 è davvero quello caricato, non alterato in transito o in
storage), **deduplicazione** (accorgersi se lo stesso contenuto viene caricato due volte,
anche su percorsi/modelli diversi), **audit** (un riferimento verificabile e permanente di
cosa è stato caricato).

Lo scopo concreto che ha portato a questa spec è semplificare il caricamento di un GPX
nel form del percorso: avvisare subito se quel tracciato è già stato caricato altrove, e
mostrare un'anteprima del percorso appena il caricamento va a buon fine — così l'admin
vede subito cosa ha caricato, senza aspettare di salvare il form.

### Dentro questa fase

- SHA-256 calcolato e salvato per ogni nuova foto, video e GPX caricato, sia per i percorsi
  sia per i modelli di bici
- Controllo duplicati con avviso bloccante e possibilità esplicita di procedere comunque
- Anteprima immediata del tracciato nel form, subito dopo un caricamento GPX riuscito
- Backfill dello SHA per foto e GPX già esistenti su R2
- Estensione del contratto worker↔sito per far arrivare lo SHA dei video dal worker

### Fuori da questa fase

- Backfill dei video già trascodificati: il file sorgente non esiste più su R2 (cancellato
  dal worker pochi minuti dopo la transcodifica, per design — vedi `STATE.md`). Solo i
  video caricati da ora in poi avranno uno SHA
- Riutilizzo automatico del file esistente in caso di duplicato (l'admin sceglie sempre se
  procedere o meno, non c'è deduplicazione silenziosa)
- Scansione periodica per rilevare corruzione dello storage nel tempo (bit rot): lo SHA
  serve a verificare l'integrità al momento del caricamento, non a un controllo ricorrente
- Estendere il worker a trascodificare anche i video dei modelli di bici
  (`private/bike-model-videos/`): lavoro non ancora fatto, indipendente da questa feature
  — annotato per una sessione futura

---

## Decisioni chiave, e perché

**Due meccanismi diversi per foto/GPX e per video, non uno solo.** Foto e GPX passano già
dal nostro server (`/api/upload`) prima di arrivare su R2: il server ha il file in memoria
ed è il punto naturale per calcolare lo SHA e bloccare un duplicato *prima* di scrivere
qualsiasi cosa su R2. I video invece vanno **direttamente** dal browser a R2 tramite URL
presigned, per non far passare file grandi dal nostro server — il nostro backend non vede
mai quei byte. Il worker Python però scarica già il sorgente per la transcodifica: è lì,
non nel nostro server, che lo SHA dei video va calcolato.

**Per i video l'avviso di duplicato arriva dopo, non prima.** Conseguenza diretta della
decisione sopra: quando il worker calcola lo SHA, il video è già su R2 e già trascodificato
in HLS. Non c'è modo di saperlo prima senza far passare i video dal nostro server (opzione
scartata: comporterebbe riscrivere il meccanismo di upload diretto e i suoi vantaggi di
banda). L'admin vede l'avviso nel pannello dopo il fatto, con la possibilità di eliminare
il video duplicato con lo stesso bottone di cancellazione già esistente. Scartata anche
l'alternativa di calcolare lo SHA nel browser prima di ogni upload (foto, video e GPX): avrebbe
reso simmetrico l'avviso anche per i video, ma richiede nuovo codice client (Web Crypto API)
e un nuovo controllo server dedicato solo per anticipare un avviso che, nel caso dei video,
resta comunque un'eccezione rara.

**Il contratto worker↔sito si estende, non si sostituisce.** Il worker scrive già lo stato
di ogni job (`videojob:v1:<storage-key>` su Upstash) sotto un token che può **solo** `SET`
su quelle chiavi e non può leggere nulla — un vincolo di sicurezza esistente, documentato in
`STATE.md`. Aggiungere un campo `sha256` opzionale a quel payload, quando il job arriva a
`done`, non richiede nessun nuovo permesso: il sito legge quel payload come dato non
fidato, come fa già oggi (`parseStatus` in `lib/video-jobs.ts`), e lo valida allo stesso
modo.

**Bloccare, non impedire.** Un duplicato mostra un avviso che blocca il salvataggio, ma con
un bottone esplicito per procedere comunque — mai un blocco assoluto. Caso reale che lo
motiva: la stessa foto di un modello di bici finita per errore su un modello diverso, o lo
stesso percorso caricato due volte per sbaglio — situazioni che l'admin deve poter valutare
caso per caso, non un vincolo che gli impedisce di lavorare.

**L'anteprima riusa la stessa funzione già usata nella lista percorsi, non ne inventa
una nuova.** `lib/gpx-svg.ts` ha già `gpxPointsToSvgPath`: una funzione pura che disegna il
profilo del tracciato come path SVG, senza tile di mappa — esattamente la versione "molto
semplice" già visibile nella lista percorsi quando una card non ha né foto né coordinate
per centrare la mappa. È pura (nessuna dipendenza da server, DB o R2), quindi funziona
anche lato client. `GpxUpload` già estrae il testo del file e lo passa a `parseGpxStats`
nel browser per calcolare distanza/dislivello — la stessa estrazione ora restituisce anche
i punti grezzi, riusati per disegnare l'anteprima con la stessa funzione, senza duplicare
la logica di parsing.

**Il backfill si ferma dove i dati non esistono più.** Foto e GPX restano su R2 per
sempre (nessun meccanismo li cancella), quindi un backfill completo è possibile: uno
script li riscarica e calcola lo SHA di ognuno. I video già trascodificati non hanno più il
sorgente — cancellato dal worker per design, non un'omissione di questa fase — quindi non
c'è nulla da hashare per i video vecchi. Non è una scelta di scope, è un limite reale dei
dati disponibili.

---

## Schema

Due colonne nuove, entrambe nullable (uno SHA nullo significa solo "non ancora calcolato",
non blocca nulla):

- `media.sha256` (`text`), più un indice non-unico per la ricerca duplicati — non-unico
  perché i duplicati possono legittimamente esistere (l'admin ha scelto di procedere)
- `routes.gpx_sha256` (`text`) — un solo GPX per percorso, quindi una colonna sulla riga
  del percorso, non una tabella a parte

Niente colonna sui modelli di bici: non hanno un proprio GPX, e le loro foto/video vivono
già nella tabella `media` generalizzata.

---

## Flusso foto/GPX

1. `/api/upload` riceve il buffer come oggi, e calcola `sha256` con il modulo nativo
   `crypto` di Node — nessuna nuova dipendenza
2. **Prima** della `PutObjectCommand` verso R2, cerca un duplicato:
   - foto: `SELECT ... FROM media WHERE sha256 = $1`
   - GPX: `SELECT ... FROM routes WHERE gpx_sha256 = $1`
   (i due tipi non si confrontano tra loro — non avrebbe senso confrontare il contenuto di
   un GPX con quello di una foto)
3. Se trovato e la richiesta non porta `force: true`: risposta che descrive il duplicato
   (a quale percorso/modello appartiene), **senza** scrivere nulla su R2
4. Il client mostra l'avviso bloccante con un bottone "carica comunque", che ripete la
   stessa richiesta con `force: true`
5. Senza duplicati (o con `force`): procede come oggi, e lo SHA viaggia insieme alla chiave
   fino al salvataggio finale della riga (`mediaItems`/`gpxKey` si estendono per portare
   anche lo SHA fino all'azione che scrive su `media`/`routes`)

## Anteprima GPX dopo upload

1. `GpxUpload` oggi chiama `parseGpxStats(text)` nel browser subito dopo il caricamento,
   per calcolare distanza/dislivello/durata. `parseGpxStats` guadagna un valore di ritorno
   in più: i punti grezzi `[lon, lat, ele][]` già estratti internamente, oggi scartati
2. Con quei punti, `GpxUpload` chiama `gpxPointsToSvgPath` (già in `lib/gpx-svg.ts`, non
   serve scriverla) e renderizza il path risultante in un piccolo `<svg>` inline, subito
   sotto la dropzone — stesso stile visivo della versione semplice già usata nella lista
   percorsi
3. L'anteprima compare solo dopo un caricamento riuscito (nessun duplicato bloccante, o
   confermato con `force: true`) — un GPX rifiutato per duplicato non mostra nulla, resta
   solo l'avviso

## Flusso video

1. Il worker (`jobs/transcode.py`, funzione `handle`), dopo aver scaricato il sorgente per
   la transcodifica (cosa che fa già), calcola `hashlib.sha256()` leggendo il file locale in
   streaming — nessuna nuova dipendenza, nessun download aggiuntivo
2. `status.py` (`publish`/`apublish`) guadagna un parametro opzionale `sha256`, incluso nel
   payload solo quando presente — stessa forma degli altri campi opzionali già lì
   (`progress`, `attempt`, `error`)
3. La chiamata finale `apublish(video.key, "done", progress=100)` diventa
   `apublish(video.key, "done", progress=100, sha256=digest)`
4. `VideoJobStatus`/`parseStatus` in `lib/video-jobs.ts` guadagnano lo stesso campo
   opzionale, validato con la stessa cautela già applicata al resto del payload (input
   esterno, mai fidato)
5. Il polling già esistente in `MediaUpload` (che chiama `getVideoJobStatuses`), quando
   vede `phase: 'done'` con uno `sha256` presente, chiama una nuova server action che
   salva lo SHA sulla riga `media` corrispondente e controlla i duplicati
6. Se trovato un duplicato, l'admin lo vede segnalato nel pannello — a quel punto il video
   è già online, quindi l'unica azione disponibile è cancellarlo con la X già esistente

## Backfill

Uno script una tantum (in `scripts/`, eseguito manualmente da riga di comando come gli
altri script di manutenzione del progetto) che:

1. Elenca tutte le righe di `media` senza `sha256` e tutti i percorsi senza `gpx_sha256`
2. Per ognuna, scarica il file dall'URL pubblico R2 e calcola lo SHA-256
3. Scrive il risultato nella colonna corrispondente

Non tocca i video (esclusi per il motivo spiegato sopra). Va eseguito una volta su
produzione dopo il deploy di questa feature.

---

## Testing

- Unit test sulla funzione di calcolo/confronto SHA (pura, isolabile dal resto)
- Verifica dal vivo: caricare la stessa foto due volte, confermare il blocco e il bottone
  "carica comunque"; stesso test su un GPX, confermando anche che l'anteprima compare dopo
  un caricamento riuscito e resta assente su uno bloccato
- Verifica dal vivo: caricare un video, attendere `done`, confermare che lo SHA compare
  sulla riga `media` — non è possibile testare il rilevamento duplicati end-to-end senza
  aspettare una transcodifica reale del worker sulla VM, quindi quella parte si verifica
  per lettura del codice più un test diretto della funzione di controllo duplicati lato
  server
- Il worker ha un proprio repository e una propria pipeline di deploy: le modifiche a
  `status.py`/`transcode.py` vanno testate lì secondo le sue convenzioni esistenti, non con
  i test di questo repository
