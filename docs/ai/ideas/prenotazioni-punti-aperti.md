# Prenotazioni online: i punti ancora aperti

> Scritto il 2026-10-13, a fine del lavoro sulla pagina `/rent`, sugli orari e sul pagamento (PR #330–#334). Serve a non perdere nulla: ogni voce
> dice **chi deve decidere o fare**, **perché** e **dove sta il resto** (spec, piano, codice). Quando una voce è chiusa, si sposta in fondo con la data.
> Tutto il lavoro di prenotazione è su `staging`; **in produzione decide solo Kevin** (vedi «Per il rilascio»).

## Da fare (Kevin, nel pannello di Supabase)

- [ ] **L'accesso con Google da `staging` rimanda a `localhost`** (visto il 2026-10-13). Il codice è giusto (l'immagine di staging è costruita con `NEXT_PUBLIC_SITE_URL=https://staging.lelettricaleoni.com`
  e il ritorno è `https://staging.lelettricaleoni.com/auth/callback`): è Supabase che, se l'indirizzo non è tra quelli consentiti, ripiega sul suo indirizzo predefinito. Nel progetto Supabase di **sviluppo**
  (lo usa anche staging): Authentication → URL Configuration → **Redirect URLs**: aggiungere `https://staging.lelettricaleoni.com/**` (e controllare che il **Site URL** non sia `localhost`).
  Stessa cosa per le email di conferma e di recupero password. Al rilascio, lo stesso per il progetto di produzione con `https://www.lelettricaleoni.com/**`.

## Da decidere (Kevin)

- [ ] **Orari scritti a mano sul sito.** Home (`info.hours_value`), mappa, dati strutturati in `app/[lang]/layout.tsx` (due fasce), descrizioni per i motori
  (dicono «09:00–19:00» senza la pausa) e Google Business Profile non leggono la tabella `shop_opening_hours` (`/manage/hours`): un cambio di orari va fatto in
  due posti (`docs/contact-details.md`). Domanda: li facciamo leggere dalla tabella? (Un lavoro in più, poi si cambia in un posto solo; il Business Profile resta a mano.)
- [ ] **Mancato ritiro.** Cosa succede se il cliente non ritira entro la chiusura del primo giorno (bici tenuta? pagamento perso? rimborso?). Va anche nei termini.
- [ ] **Termini di noleggio: sono una BOZZA** (`/it/terms`, `lib/booking/terms-text.test.ts` ne tiene i numeri). Mancano le decisioni di Kevin su: cauzione (se e quanto),
  danni, furto e smarrimento, età minima e casco, mancata presentazione, maltempo, orari di ritiro e riconsegna. Poi la revisione di chi rivede i testi (diritto di recesso per i
  servizi del tempo libero con data precisa: **da far confermare**). Il tedesco usa «Sie» nei termini e «du» nelle pagine di prenotazione: scegliere una forma (`STATE.md`).
- [ ] **Scontrini e corrispettivi** (regime ordinario, online solo privati, nessuna fattura; Stripe Tax e le app di e-fatturazione per Stripe sono scartate, vedi ROADMAP «Scartato»).
  Da scegliere come certificare i corrispettivi delle prenotazioni online (A-Cube «Scontrino Elettronico Smart», Effatta, ScontrinoZero, la procedura web gratuita dell'Agenzia:
  le ditte individuali devono dare le proprie credenziali Fisconline/CIE, nessun fornitore le prende per delega). **Domande per il commercialista:** come registrare i corrispettivi online
  (interpello 324/2020: un servizio fisico prenotato online non gode dell'esonero e-commerce), quando emettere il documento commerciale (all'incasso, cioè alla prenotazione, art. 6 DPR 633),
  come si fanno annullo e reso (il rimborso per bici è il reso di una riga; un rimborso parziale in euro non è un reso). Proposta non confermata: pagina «Da scontrinare» nel pannello
  (elenco di incassi e rimborsi con il numero dello scontrino scritto a mano). Per collegare A-Cube basterebbero `ACUBE_EMAIL` e `ACUBE_PASSWORD` della sandbox in `.env.local` (mai in chat).
- [ ] **PR di Dependabot** (#324–#328, puntano a `main` su una base vecchia: non si possono unire). Chiuderle? `bullmq` e `ioredis` 6 restano fuori per scelta (restiamo alla 5);
  `jose` 6 e `framer-motion` 14 vanno valutati a parte; i 22 pacchetti minor/patch del gruppo (Radix, AWS SDK, supabase-js, drizzle-orm, Playwright…) si prendono da `staging`
  in una PR sola (Next 16.4.0 è già fatto, #333).
- [ ] **`partialPrefetching`** (Next 16.4): oggi `false` (come prima). Adottarlo cambia ciò che ogni `<Link>` scarica: decisione a parte, guida in
  `node_modules/next/dist/docs/01-app/02-guides/adopting-partial-prefetching.md`.
- [ ] **Modello «Test Model for rent»** (pubblicato, senza nessuna bici, residuo delle prove del 2 ottobre): non compare più su `/rent`, ma sta nel catalogo di sviluppo e di staging. Tenerlo o toglierlo dal pannello?
- [ ] **`dev/validate-fixes`** (ramo tuo nella cartella principale: 4 commit avanti e molti indietro rispetto a `staging`, più `.claude/settings.json` e il journal modificati): allinearlo? Dopo
  l'aggiornamento di Next fai `npm install` lì: la tua `node_modules` è ancora alla 16.3.8.

## Da costruire

- [ ] **Fetta 4: email e promemoria.** Conferma di prenotazione, promemoria prima del ritiro, avviso a Kevin quando un pagamento arriva in ritardo o un rimborso fallisce (oggi solo nei log:
  `lib/booking/late-payment.ts`, `refunds.ts`). Usa il worker (un `createXHandler` in `worker/jobs/`, una coda in `lib/queues/names.ts`, una riga in `worker/main.ts`) e Resend; l'informativa va
  aggiornata prima del codice (`privacy-cookies`). Una scheda sul cron: il timer `settle-holds` oggi chiama una rotta, non il worker.
- [ ] **Fetta 5: appuntamenti di riparazione.** Mai iniziata; il viola del logo (`brand-purple`) è riservato a queste sezioni, dopo uno studio di dove e come.
- [ ] **Matrice modelli × giorni** nella pagina `/rent`: scartata per ora (pesante per un negozio piccolo, difficile a 320 px); se serve si aggiunge sopra gli stessi dati (`busy-intervals.ts`).
- [ ] **Una fonte sola per gli orari** (se la risposta sopra è sì): `loadShopSchedule()` per home, mappa e dati strutturati.
- [ ] **Una pagina di aiuto** (`help@lelettricaleoni.com` esiste): come si prenota, accesso, annullamenti (ROADMAP «Un giorno»).

## Da guardare con gli occhi (non provato in un browser vero)

- [ ] I **colori del calendario del pannello** (online viola, in pagamento viola chiaro tratteggiato, banco blu, manutenzione ambra, legenda) con una sessione admin, su prenotazioni vere.
- [ ] La pagina `/rent` in **de** e **en** con un account vero fino al pagamento (provato: it a 1440, en a 375 e de a 320 fino al giorno scelto, e il pagamento completo in it).
- [ ] Il **telefono** in «Le tue prenotazioni» con una prenotazione in attesa (bottone «Completa il pagamento»): provato a 1440 e a 320 sulla lista, a 375 e 320 sul dettaglio.
- [ ] Un pagamento **Stripe di prova vero** fino alla conferma con **webhook** su staging (l'endpoint c'è, `we_1UPgJk6ZKVtVeZpMqd0V3cCD`, provato il 2026-10-12 con un evento firmato): farne uno dal sito di staging.

## Per il rilascio in produzione (decide solo Kevin; non prima che la prenotazione sia completa)

- [ ] **Migrazioni 0017–0025** sul database di produzione, una per una, con la riga nel tracking (`STATE.md`, «Si applica così»; `execute_sql` + `drizzle.__drizzle_migrations`).
  Le ultime: `0024` (`stripe_events`) e `0025` (`shop_opening_hours`, `shop_closures`, con gli orari di oggi).
- [ ] **Stripe in produzione**: chiave `sk_live_`, endpoint del webhook con i suoi 5 eventi (`checkout.session.completed`/`expired`, `refund.created`/`updated`/`failed`) e il suo segreto in `~/docker/web/production.env`.
- [ ] **Timer `settle-holds@production`** sulla VM (come quello di staging, vedi sotto) e `CRON_SECRET` già presente. Senza, le bici si liberano solo quando qualcuno apre la pagina.
- [ ] **Realtime** in produzione: Supabase → Realtime → Settings → «Allow public access» (senza, il calendario del pannello e la pagina `/rent` non si aggiornano da soli).
- [ ] **Verifica di Google** per il telefono (`REQUEST_GOOGLE_PHONE` in `lib/auth/google-phone.ts`, falso finché Google non approva) e il link ai termini nella schermata di consenso.
- [ ] **Informativa e cookie**: rivederli con chi li controlla, prima del rilascio (`privacy-cookies`). Domande aperte, in più rispetto a quelle già in skill: **Supabase Realtime riceve l'IP di ogni
  visitatore di `/rent` senza consenso** (dichiarato nell'informativa: va bene o serve dietro il banner?).
- [ ] Una sola PR `staging → main`, solo allora la sincronizzazione `main → staging` da un ramo copia con merge commit (`STATE.md`).

## Fatto di recente (per non rifarlo)

- 2026-10-13 — Timer `settle-holds@staging.timer` installato sulla VM (ogni minuto, prova: parte da solo e risponde `200 done`). File in `deploy/web/`, copiati a mano in `/etc/systemd/system`.
- 2026-10-12 — Pagina `/rent` con selettore dei giorni, due modi, aggiornamento in tempo reale (#330). «Le tue prenotazioni» con foto e «Completa il pagamento», attesa a 15 minuti (#331).
  Orari e chiusure dal pannello (#332). Next 16.4.0 (#333). Documenti (#334).
- 2026-10-12 — Stripe collegato (test), endpoint e segreti su staging (#323); fiscale: ricerche fatte, nessun codice.
