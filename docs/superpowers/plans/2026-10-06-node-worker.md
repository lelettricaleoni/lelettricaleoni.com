# Il worker in Node.js dentro questo repository — ciò che resta del piano (fetta A)

> **Stato al 2026-10-07: i compiti 1-17 sono eseguiti e tolti da questo file.** Il worker gira in produzione dal 2026-10-07 e su `staging`
> dal 2026-10-06. Il piano completo, con tutto il codice e i comandi di ogni compito (5.700 righe), sta nella cronologia di git:
> `git show 25b5302:docs/superpowers/plans/2026-10-06-node-worker.md` (PR #276). Come è andata, i comandi per usarlo e le scelte fuori
> piano: `docs/ai/ideas/node-worker-cutover.md`. Lo stato vincolante: `docs/ai/STATE.md`.

**Spec:** `docs/superpowers/specs/2026-10-06-node-worker-design.md`.

## Eseguito

| Compiti | Cosa | Dove |
|---|---|---|
| 1 | Prova sulla decodifica HEIC (`libheif-js`) | `docs/ai/ideas/heic-decode-spike.md` |
| 2-5 | Regole sulle chiavi condivise, contratto delle code, Redis e code del sito, stato/accodamento/panoramica | `lib/media/`, `lib/queues/`, `lib/redis.ts`, `lib/settle.ts` (PR #277) |
| 6-11 | Fondamenta del worker, foto, video, scansione, avvio e salute | `worker/` (PR #277) |
| 12 | Immagine del worker e job `worker` della CI | `Dockerfile.worker`, `.github/workflows/ci.yml` (PR #277) |
| 13 | Redis sulla VM, ingresso unico SSH, deploy del worker | `deploy/redis/`, `deploy/worker/`, `deploy/deploy-entry.sh`, `deploy-worker.yml` (PR #278) |
| 14 | Il sito sulla nuova coda e sul Redis della VM | `lib/cache.ts`, `lib/video-jobs.ts`, `lib/actions/media-jobs.ts`, `/manage/dev` (PR #278, #279) |
| 15 | Confronto con Pillow sulle foto vere | `docs/ai/ideas/node-worker-parity.md` (PR #278) |
| 16 | `staging` sulla VM e prove dal vivo | 2026-10-06 |
| 17 (passi 1-7) | Produzione, congedo di Python (fermo, non spento), documentazione | 2026-10-07, release #280, documenti #282 |

Fuori piano, aggiunti lungo la strada: controllo del contenuto di un file prima del caricamento (#283), regola `staging` nel CORS del bucket di
sviluppo, utenti Redis per ambiente, validazione di bucket e chiave nei lavori, `-format_whitelist` per ffmpeg.

## Resta da fare

1. **Provare dal pannello** (Kevin): una **foto HEIC verticale dall'iPhone** (orientamento e profilo colore; unica verifica mai fatta con un
   file vero), un JPEG e un MP4; un file rotto per vedere il rifiuto del #283; `/manage/dev` in produzione con le tre code e il carico.
   (Compito 16, passi 7 e 8 del piano originale; in produzione il worker è stato provato con la scansione, non con l'accodamento del browser.)
2. **Dopo una settimana tranquilla, intorno al 2026-10-14** (compito 17, passo 8): `gh repo archive lelettricaleoni/videoStream-bucketWorker`
   (archiviare, non cancellare); sulla VM `cd ~/docker/worker && docker compose down -v` e togliere la cartella; togliere da
   `~/.ssh/authorized_keys` la riga che chiama `docker/worker/deploy.sh`. Finché non si fa, il ritorno indietro è
   `docker stop $(docker ps -q --filter label=lelettrica.worker=production) && cd ~/docker/worker && docker compose start video-worker`.
3. **Chiudere `docs/ai/ideas/heic-decode-spike.md`** con l'esito dell'orientamento (compito 1, passo 5) dopo il punto 1.
4. **Fuori da questo piano:** ruotare i segreti comparsi in chiaro (password del database di produzione, token del tunnel, token `cfat_`),
   configurare Google Calendar nel pannello di produzione, pulizia di Vercel e Upstash dopo qualche settimana, e la **fetta B** (elenco dei
   lavori, «Riprova», pausa e ripresa, «Rielabora» per le sole foto), che vuole una spec e un piano a parte. Sono tutti in `docs/ai/ROADMAP.md`.

Quando 1-3 sono fatti, questo file si può cancellare: la storia sta in git e in `docs/ai/ideas/node-worker-cutover.md`.
