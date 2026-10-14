# Prenotazioni online: i punti ancora aperti

> Scritto il 2026-10-13, a fine del lavoro sulla pagina `/rent`, sugli orari e sul pagamento (PR #330–#334). Serve a non perdere nulla: ogni voce
> dice **chi deve decidere o fare**, **perché** e **dove sta il resto** (spec, piano, codice). Quando una voce è chiusa, si sposta in fondo con la data.
> Tutto il lavoro di prenotazione è su `staging`; **in produzione decide solo Kevin** (vedi «Per il rilascio»).

## Dove siamo, e da dove si riprende (2026-10-14)

**Regola nuova di Kevin (2026-10-13): su `staging` si pubblica liberamente** (PR e merge senza aspettare il suo via). Produzione e `main` restano solo suoi, e nessuna scrittura sul database di produzione.

**Rami già pubblicati ma senza PR** (tutti pushati su GitHub; le cartelle di lavoro locali sono nella cartella temporanea della sessione e **non vanno date per esistenti**: si ricreano con
`git worktree add <cartella> <ramo>`). Vanno aperti in quest'ordine, uno alla volta (dopo ogni merge i successivi risultano indietro: `git merge origin/staging` nel ramo, poi push):

1. **`feat/model-colors`** (5 commit avanti): colore per ogni modello (`bike_models.color`, migrazione `0026` **già applicata allo sviluppo**), campo «Colour» nel modulo del modello, etichette di Google Calendar
   per modello (`lib/integrations/google-calendar/labels.ts`, `fixed-colors.ts`, `prepareColours` in `sync.ts`). Provato dal vivo con l'account di servizio al massimo sul calendario di **sviluppo** (live test 2/2,
   «Sync now» vero). Piano: `docs/superpowers/plans/2026-10-13-model-colors.md` (esiste solo su quel ramo). Per il rilascio: migrazione `0026` e il permesso «Make changes and manage sharing» sul calendario di **produzione** (vedi sotto).
2. **`feat/rent-page-redesign`** (12 commit avanti; contiene già il merge di `feat/category-reorder`, ora in staging con #340): layout nuovo di `/rent` (fascia dei giorni, bici in griglia, barra fissa sul telefono, mese riscritto
   con `MonthDay`), **pagina di checkout** (`app/[lang]/rent/checkout`, `components/rent/checkout-form.tsx`), **limite di 7 giorni per tutte le bici** (`MAX_RENTAL_DAYS` in `lib/booking/rules.ts`), **ordine per categoria**
   (`lib/bikes-data.ts`, `lib/booking/catalog.ts`, `/manage/bikes` a sezioni), testi ridotti, piani nuovi (`2026-10-13-contact-page.md`, `2026-10-13-hold-expiry-jobs.md`, `2026-10-13-production-data-to-test.md`, `2026-10-13-rent-page-redesign.md`).
   **Prima della PR:** controllare la riga di ritiro su due righe in it/en/de; provare il caso «bici presa da altri nel frattempo» al checkout; **aggiornare `STATE.md`** (ordine per categoria, limite di 7 giorni, checkout, ordine
   delle categorie trascinabile); verdetto di Kevin sul nuovo calendario e sulla barra dei giorni. `npm run test:db` completo: già verde (34 file, 374 test) sui dati di produzione copiati.
3. **`chore/copy-prod-media-to-test`** (1 commit): `scripts/copy-prod-media-to-test.mts`, copia i file dal dominio pubblico di produzione al bucket di sviluppo (rifiuta di scrivere contro produzione; `--dry`).

**Il database di sviluppo (= staging, anteprime, CI) contiene dal 2026-10-13 il catalogo di produzione** (7 categorie, 10 modelli, 23 bici, 12 percorsi, 70 media, 297 file nel bucket di sviluppo), senza clienti, prenotazioni,
utenti di accesso né l'integrazione del calendario. Copia di sicurezza di ciò che c'era prima: `temp/dev-backup-2026-10-13/` (fuori da git). Le 7 categorie hanno `display_order` 0 (come in produzione): si ordinano
trascinandole in `Bike options → Categories`. Dettagli e come rifarlo: `docs/superpowers/plans/2026-10-13-production-data-to-test.md` (su `feat/rent-page-redesign`).

**Accesso con Google su staging:** due cause, entrambe sistemate. (1) il callback usava l'origine della richiesta (`https://0.0.0.0:3000` dietro il tunnel): #338. (2) il progetto Supabase di **sviluppo** non ammetteva
l'indirizzo di staging tra i *Redirect URLs* e rimandava alla *Site URL* (`localhost:3000`): Kevin ha messo la Site URL su `https://staging.lelettricaleoni.com`, e il controllo senza accesso (`docs/google-login-setup.md`,
punto 6) ora risponde con l'indirizzo di staging. **Kevin deve ancora riprovare l'accesso dal browser** e confermare.

**Cosa aspetta Kevin da me / cosa deve fare lui**
- Provare `/rent` sul catalogo vero (dev server sul ramo `feat/rent-page-redesign`) e dire cosa pensa del calendario; guardare il campo colore in `/manage/bikes` (matita su un modello → «Category and price» → «Colour») e gli eventi sul calendario Google di sviluppo.
- Pagina contatti (`2026-10-13-contact-page.md`, 6 domande: contenuto, WhatsApp, voce nella navbar, orari dalla tabella, modulo sì/no, nome `/contact`) e job di scadenza dei posti (`2026-10-13-hold-expiry-jobs.md`: il consiglio è farlo con la fetta 4).
- Le decisioni nella sezione seguente.

**Per riprendere il lavoro (trappole di ambiente già pagate: memoria `reference_ambiente_di_lavoro`)**
- La `node_modules` della cartella principale è ancora alla 16.3.8: in una cartella di lavoro nuova serve `npm ci` (Next 16.4.0), mai `npm install` dentro una giunzione; copiare `.env.local` dalla cartella principale. Dev server: `npx next dev --webpack -p 3000`.
- Dopo aver aperto una PR: `scripts/merge-when-green.sh <pr> <sha> <ramo>` in background (unisce solo con tutti i check verdi sullo stesso commit). Si ferma se la sessione finisce.
- Utente di prova (`claude-rent-test@example.test`) già cancellato: si ricrea con l'API admin di Supabase (sviluppo), password solo nello script, mai in chat né in git.

## Da decidere (Kevin)

- [ ] **Orari scritti a mano sul sito.** Home (`info.hours_value`), mappa, dati strutturati in `app/[lang]/layout.tsx` (due fasce), descrizioni per i motori
  (dicono «09:00–19:00» senza la pausa) e Google Business Profile non leggono la tabella `shop_opening_hours` (`/manage/hours`): un cambio di orari va fatto in
  due posti (`docs/contact-details.md`). Domanda: li facciamo leggere dalla tabella? (Un lavoro in più, poi si cambia in un posto solo; il Business Profile resta a mano.)
- [ ] **Mancato ritiro.** Cosa succede se il cliente non ritira entro la chiusura del primo giorno (bici tenuta? pagamento perso? rimborso?). Va anche nei termini.
  La pagina di prenotazione (2026-10-13, Kevin: «troppe informazioni testuali») non spiega più perché si riconsegna entro la chiusura (le bici vanno ricaricate, non si riconsegnano il giorno dopo) né «per accordi diversi, chiamaci»: dice solo giorni e orari. La spiegazione va nei termini.
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
- [ ] **Scadenza dei posti tenuti con un job per prenotazione** invece del timer al minuto (Kevin, 2026-10-13): piano e raccomandazione (farlo con la fetta 4, il worker senza chiavi, il controllo periodico resta come rete di sicurezza) in `docs/superpowers/plans/2026-10-13-hold-expiry-jobs.md`.
- [ ] **Dati di produzione sul test** (Kevin, 2026-10-13): piano e quattro scelte in `docs/superpowers/plans/2026-10-13-production-data-to-test.md`.
- [ ] **Pagina dei contatti** (Kevin, 2026-10-13): un posto solo per telefono, email, indirizzo e orari, linkato da tutto il sito. Piano e domande: `docs/superpowers/plans/2026-10-13-contact-page.md`. Chiude anche «Orari scritti a mano».
- [ ] **Una pagina di aiuto** (`help@lelettricaleoni.com` esiste): come si prenota, accesso, annullamenti (ROADMAP «Un giorno»).

## Da guardare con gli occhi (non provato in un browser vero)

- [ ] I **colori del calendario del pannello** (online viola, in pagamento viola chiaro tratteggiato, banco blu, manutenzione ambra, legenda) con una sessione admin, su prenotazioni vere.
- [ ] La pagina `/rent` in **de** e **en** con un account vero fino al pagamento (provato: it a 1440, en a 375 e de a 320 fino al giorno scelto, e il pagamento completo in it).
- [ ] Il **telefono** in «Le tue prenotazioni» con una prenotazione in attesa (bottone «Completa il pagamento»): provato a 1440 e a 320 sulla lista, a 375 e 320 sul dettaglio.
- [ ] Un pagamento **Stripe di prova vero** fino alla conferma con **webhook** su staging (l'endpoint c'è, `we_1UPgJk6ZKVtVeZpMqd0V3cCD`, provato il 2026-10-12 con un evento firmato): farne uno dal sito di staging.

## Per il rilascio in produzione (decide solo Kevin; non prima che la prenotazione sia completa)

- [ ] **Migrazioni 0017–0025** sul database di produzione, una per una, con la riga nel tracking (`STATE.md`, «Si applica così»; `execute_sql` + `drizzle.__drizzle_migrations`).
  Le ultime: `0024` (`stripe_events`) e `0025` (`shop_opening_hours`, `shop_closures`, con gli orari di oggi). **Più la `0026`** (colore dei modelli) quando `feat/model-colors` sarà in staging.
- [ ] **Calendario Google di produzione**: l'account di servizio (`calendar-sync@lelettricaleoni-509607.iam.gserviceaccount.com`) deve avere «Make changes and manage sharing» (le etichette per modello lo richiedono; senza, ripiego sui colori fissi e un avviso in *Activity*).
- [ ] **Supabase di produzione**: Site URL `https://www.lelettricaleoni.com` e `https://www.lelettricaleoni.com/**` tra i *Redirect URLs* (`docs/google-login-setup.md`, punto 6).
- [ ] **Stripe in produzione**: chiave `sk_live_`, endpoint del webhook con i suoi 5 eventi (`checkout.session.completed`/`expired`, `refund.created`/`updated`/`failed`) e il suo segreto in `~/docker/web/production.env`.
- [ ] **Timer `settle-holds@production`** sulla VM (come quello di staging, vedi sotto) e `CRON_SECRET` già presente. Senza, le bici si liberano solo quando qualcuno apre la pagina.
- [ ] **Realtime** in produzione: Supabase → Realtime → Settings → «Allow public access» (senza, il calendario del pannello e la pagina `/rent` non si aggiornano da soli).
- [ ] **Verifica di Google** per il telefono (`REQUEST_GOOGLE_PHONE` in `lib/auth/google-phone.ts`, falso finché Google non approva) e il link ai termini nella schermata di consenso.
- [ ] **Informativa e cookie**: rivederli con chi li controlla, prima del rilascio (`privacy-cookies`). Domande aperte, in più rispetto a quelle già in skill: **Supabase Realtime riceve l'IP di ogni
  visitatore di `/rent` senza consenso** (dichiarato nell'informativa: va bene o serve dietro il banner?).
- [ ] Una sola PR `staging → main`, solo allora la sincronizzazione `main → staging` da un ramo copia con merge commit (`STATE.md`).

## Fatto di recente (per non rifarlo)

- 2026-10-14 — Staging: PR #339 (documenti sugli indirizzi di ritorno di Supabase) e #340 (categorie bici trascinabili, `reorderBikeCategoriesAction`). Site URL del progetto di sviluppo su staging.
- 2026-10-13 — Catalogo di produzione copiato sul database e sul bucket di sviluppo (solo lettura da produzione, impronte `md5` uguali tabella per tabella).
- 2026-10-13 — **L'accesso con Google da `staging` finiva su `localhost`, per due cause una dopo l'altra.** (1) `app/auth/callback/route.ts` costruiva il ritorno dall'origine della richiesta, e dietro
  il tunnel quella è `https://0.0.0.0:3000`: ora usa `SITE_URL` (`lib/auth/callback-route.test.ts`). (2) **Supabase non ammetteva l'indirizzo di staging** tra i *Redirect URLs* del progetto di sviluppo e
  rimandava alla *Site URL* (`http://localhost:3000`): provato con un link di verifica sbagliato (vedi `docs/google-login-setup.md`, «Controlli rapidi»), staging e `www` tornavano a `localhost:3000`, mentre
  `localhost:3000` e `:3001` erano ammessi. **Serve un'azione nel pannello di Supabase** (Authentication → URL Configuration → Redirect URLs: `https://staging.lelettricaleoni.com/**`); al rilascio lo stesso
  per `https://www.lelettricaleoni.com/**` nel progetto di produzione.
- 2026-10-13 — Timer `settle-holds@staging.timer` installato sulla VM (ogni minuto, prova: parte da solo e risponde `200 done`). File in `deploy/web/`, copiati a mano in `/etc/systemd/system`.
- 2026-10-12 — Pagina `/rent` con selettore dei giorni, due modi, aggiornamento in tempo reale (#330). «Le tue prenotazioni» con foto e «Completa il pagamento», attesa a 15 minuti (#331).
  Orari e chiusure dal pannello (#332). Next 16.4.0 (#333). Documenti (#334).
- 2026-10-12 — Stripe collegato (test), endpoint e segreti su staging (#323); fiscale: ricerche fatte, nessun codice.
