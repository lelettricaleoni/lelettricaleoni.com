# Deploy sul server Oracle e worker nello stesso repository — disegno

> Stato: **bozza da rivedere** (Kevin, 2026-10-05). Nessun codice scritto, **nessuna modifica al server né a Vercel**.
> Vercel continua a servire il sito finché non si decide il passaggio (fase 5).
> Decisione di Kevin: si va con **Compose + proxy + GitHub Actions**, non con Coolify (confronto nella conversazione:
> il server ha 2 CPU, ffmpeg le satura, e il deploy del worker ha già guardrail migliori di quelli di default di Coolify).

## Perché

Vercel (piano Hobby) ha raggiunto i suoi limiti (**quale esattamente è ancora da dire**: vedi Domande). Il sito passa
a girare sulla VM Oracle dove già gira il worker, e il worker entra in questo repository: un solo posto per il codice,
per i test e per la pubblicazione.

## Cosa non cambia

Supabase (database e login), Cloudflare R2 (media), Upstash (cache e stato del worker), Azure Translator, Google Calendar.
Nessuna migrazione di dati. Il DNS è **già su Cloudflare** (verificato: i nameserver sono `*.ns.cloudflare.com`); oggi
`www` e l'apex puntano agli indirizzi di Vercel.

## Architettura

```
Internet ──▶ Cloudflare (DNS, proxy, cache, WAF) ──▶ VM Oracle ARM64
                                                      ├─ ingresso (Cloudflare Tunnel, oppure Caddy)
                                                      ├─ web        Next.js standalone, Node, istanza unica
                                                      ├─ web-staging  lo stesso, con i servizi di Preview
                                                      ├─ worker     Python + ffmpeg (quello di oggi)
                                                      └─ redis      coda del worker (append-only, com'è)
```

- **Un'istanza sola del sito.** `'use cache'` sta in memoria di un solo processo: sparisce il limite documentato in STATE per cui
  `updateTag` scade la voce solo nell'istanza che esegue l'azione.
- **Docker Compose** per tutto, in `deploy/`. Il sito e il worker sono due servizi con **limiti di risorse espliciti**: il worker
  ha un peso CPU basso (`cpu_shares`) e un tetto, il sito ha la precedenza. Un video in trascodifica non deve rallentare le pagine.
- **Ingresso: scelta aperta.**
  - **A. Cloudflare Tunnel** (`cloudflared`, solo connessioni in uscita): il server non apre né 80 né 443, nessun certificato da
    gestire, l'origine non è raggiungibile se non attraverso Cloudflare. *La mia raccomandazione.*
  - **B. Caddy** con certificati automatici, 80/443 aperti **solo agli indirizzi di Cloudflare** (firewall di Oracle), più
    l'origine autenticata. Una parte in più da mantenere, ma niente dipendenza da `cloudflared`.
  - Il video non passa mai di qui (sta su R2), quindi nessuna delle due strade tocca i limiti di Cloudflare sul traffico.
- **SSH resta com'è per il worker oggi:** chiave dedicata con comando forzato, solo per la pubblicazione.

## Il repository

```
/            l'app Next.js, come oggi
worker/      il worker Python (main.py, jobs/, tests/, requirements*, Dockerfile), con la storia dei commit
deploy/      docker-compose.yml (prod e staging), deploy.sh, configurazione dell'ingresso, RUNBOOK.md
```

- Il worker **resta in Python** (ffmpeg, boto3): riscriverlo non porta niente.
- **Il contratto sito ⇄ worker sotto test.** Oggi (nomi delle code, prefisso `videojob:`, mappatura `private/` → `public/`,
  estensioni delle foto) è scritto nei commenti di due repository. Nello stesso repository i test dei due lati si fissano a vicenda.
- **Attenzione, decisione di Kevin:** questo repository è **pubblico**, quello del worker è **privato**. Portare il worker qui
  **lo rende pubblico** (insieme alla storia dei commit). Prima: scansione della storia per segreti (gitleaks) e decisione.
  Alternative: rendere privato questo repository (si perdono i runner ARM gratuiti per i repository pubblici e le immagini si
  costruiscono con minuti a pagamento) oppure tenere il worker in un repository privato collegato.

## Pubblicazione (CI/CD)

- GitHub Actions **costruisce fuori dal server**: le build di Next.js sono pesanti e su 2 CPU fermerebbero sito e worker. Runner
  ARM nativi (`ubuntu-24.04-arm`, gratuiti per i repository pubblici: niente emulazione). Immagini su GHCR, **fissate per digest**.
- **Due immagini del sito, non una:** `NEXT_PUBLIC_*` è incorporato nella build, e staging e produzione hanno valori diversi
  (Supabase, bucket). `main` costruisce quella di produzione, `staging` quella di staging, come oggi faceva Vercel.
- Il segreto di runtime non passa mai da GitHub: sta in un file `.env` per ambiente sul server (permessi 600), fuori dal repository.
- `deploy.sh` generalizza quello del worker (`smoke test` a freddo con l'`.env` vero, ritorno automatico) e aggiunge, per il sito:
  **blu/verde**. Parte la versione nuova accanto alla vecchia su un'altra porta, si aspetta che `/api/health` risponda con lo SHA atteso
  per N secondi, e solo allora l'ingresso cambia destinazione; la vecchia resta qualche minuto per un ritorno immediato.
- Nuova rotta `/api/health` (DB e Redis raggiungibili, versione = SHA del commit).
- **Staging al posto delle anteprime per PR** (perdita accettata: su 2 CPU ogni anteprima è una build e un processo in più). Il
  controllo `browser` (oggi contro l'anteprima Vercel, con `VERCEL_AUTOMATION_BYPASS_SECRET`) passa a girare contro staging
  dopo il deploy; una PR si unisce con `verify` e `CodeQL`, e `browser` diventa il controllo dopo l'unione su `staging`.

## Cosa del progetto dipende da Vercel (inventario fatto)

| Cosa | Dove | Cosa si fa |
|---|---|---|
| `VERCEL_ENV` | `app/[lang]/layout.tsx` (Analytics solo in produzione), `components/flags-explorer.tsx` | variabile propria `APP_ENV=production\|staging` |
| **Feature flag** `@flags-sdk/vercel` | `lib/flags.ts`, `app/.well-known/vercel/flags/route.ts`, `next.config.ts` | **da verificare per prima:** il servizio Vercel Flags risponde anche da fuori con la chiave dell'SDK? Se sì, si tiene. Se no, flag nel nostro database con un interruttore nel pannello (la sezione Integrations è già lì). Il kill switch non deve mai dipendere da un servizio che non possiamo raggiungere |
| Cron `vercel.json` | controllo giornaliero di Google Calendar | lavoro pianificato del worker (c'è già lo scheduler di BullMQ) o cron del sistema; la rotta `/api/cron/google-calendar` resta |
| `outputFileTracingIncludes` | `next.config.ts` (immagine Open Graph) | non serve: con `output: 'standalone'` la cartella `public/` viaggia con l'immagine (da verificare con `/opengraph-image`) |
| `x-vercel-*` | `playwright.config.ts`, test browser | via, con la CI che passa a staging |
| Anteprime, protezione dei deploy | `browser.yml` | staging |
| Ottimizzazione immagini | `next.config.ts` (`images`) | gira sul nostro server con `sharp` (ARM64); le foto sono già servite da `lib/photo-loader.ts` senza ottimizzatore; Cloudflare mette in cache il resto |
| **Cache HTML** | tutte le pagine | a oggi `s-maxage` lo onora la CDN di Vercel; Cloudflare di default **non** mette in cache l'HTML. Si misura prima di decidere regole di cache (e un purge a ogni deploy) |

## Rischi, e cosa li tiene a bada

| Rischio | Contromisura |
|---|---|
| ffmpeg e sito sulle stesse 2 CPU | `cpu_shares` bassi per il worker, tetto di CPU e memoria, `-threads` del worker; **prova di carico su staging mentre il worker trascodifica** prima della produzione |
| Un solo server | controllo di raggiungibilità esterno (UptimeRobot o simile), `RUNBOOK.md` per ricostruire la VM da zero (Compose, `.env` custoditi altrove, credenziali del tunnel), nessuno stato che non sia ricostruibile (Redis lo è) |
| Oracle recupera le macchine «inattive» dei piani gratuiti | verificare il piano e le regole di Oracle; passare a *Pay As You Go* (le risorse Always Free restano gratuite) è il modo consueto per evitarlo |
| Sicurezza e aggiornamenti a nostro carico | `unattended-upgrades`, firewall di Oracle, accesso SSH solo con chiave, Cloudflare WAF davanti, aggiornamento delle immagini con Dependabot, un controllo periodico di Next |
| Build a freddo con `NEXT_PUBLIC_*` sbagliati | una build per ambiente, e il test di fumo di `deploy.sh` controlla che l'immagine punti al Supabase giusto |
| Il passaggio va male | Vercel **resta pronto** per almeno due settimane; il ritorno è cambiare i record DNS su Cloudflare (proxy attivo: effetto in pochi secondi) |

## Fasi, ognuna con la sua verifica

0. **Prerequisiti e misure.** Domande qui sotto; misura di base sul sito su Vercel (TTFB di `/it`, `/it/bikes`, una pagina percorso;
   dimensione delle risposte) da confrontare dopo il passaggio.
1. **Il worker entra nel repository.** Storia importata in `worker/` (con scansione dei segreti), test e CI con filtro per percorsi,
   contratto sito ⇄ worker sotto test. Il worker in produzione non cambia ancora.
2. **Il sito in un container.** `Dockerfile` (standalone, ARM64), `/api/health`, `APP_ENV`, decisione sui flag, `docker run` in locale con
   le variabili di staging. Verifica: `/opengraph-image`, login admin, un percorso con video, `after()` di Google Calendar.
3. **Il server.** Compose, ingresso, firewall, `deploy.sh` blu/verde, workflow di pubblicazione per `staging` e `main`, stack di staging
   su `staging.lelettricaleoni.com`, `browser` contro staging. Verifica: un deploy riuscito, uno fatto fallire apposta e tornato
   indietro da solo.
4. **Prova di carico su staging**, con il worker che trascodifica un video vero. Soglia da concordare (per esempio TTFB delle pagine
   cacheate sotto 400 ms al 95° percentile durante la trascodifica).
5. **Passaggio.** Orario scelto da Kevin, TTL bassi già impostati il giorno prima, DNS su Cloudflare verso l'ingresso, controllo del
   contenuto (non del codice HTTP) delle pagine principali, dell'admin e di un percorso con video; Vercel pronto al ritorno.
6. **Pulizia.** Via `vercel.json`, i segreti `VERCEL_*`, il progetto Vercel (dopo le due settimane), STATE e ROADMAP aggiornati.

## Domande aperte

1. **Quale limite di Vercel è stato raggiunto?** (messaggio o schermata): se è il numero di deploy, c'è anche una via più corta.
2. **La VM:** `nproc; free -h; df -h; uname -a`, IPv6, porte aperte, e se ci gira altro oltre al worker.
3. **Repository del worker:** lo rendiamo pubblico con il resto, o rendiamo privato questo, o li teniamo separati?
4. **Ingresso:** Cloudflare Tunnel (A, consigliato) o Caddy (B)?
5. **Flag:** si verifica prima se Vercel Flags risponde da fuori; se no, flag nel database?
6. **Giorno del passaggio:** quanta instabilità è accettabile, e a che ora?
7. **Anteprime per PR:** va bene perderle, tenendo solo staging?

## Esito (2026-10-06)

Fatto, con queste differenze dal disegno:

- **Ingresso**: Cloudflare Tunnel, deciso con Kevin (nessuna porta aperta, nessun certificato da gestire).
- **Deploy**: non un file Compose per il sito ma `deploy/web/deploy.sh`, che avvia il container nuovo accanto al vecchio
  con lo stesso alias di rete e ferma il vecchio solo a nuovo sano (nessuna interruzione), con `rollback`.
- **Segreti**: sulla VM, non su GitHub; su GitHub solo la chiave di deploy e i valori pubblici `NEXT_PUBLIC_*`
  (cotti nell'immagine in build). `next-runtime-env` valutato e scartato: dichiara compatibilità solo con Next 14.
- **`browser` in CI**: costruisce l'immagine nel job e prova `localhost` (ambiente `ci`), invece dell'anteprima di
  Vercel.
- **Trovato confrontando con Vercel**: la sitemap preparata in build senza database (39 URL contro 90).
- **Vercel**: in pausa dal 2026-10-06, non cancellato.
- **Non ancora fatto**: il worker non è stato spostato in questo repository (e sarà riscritto in Node, vedi ROADMAP);
  Upstash resta finché c'è il ripiego.
