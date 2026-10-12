# Fetta 3c — il flusso di prenotazione dal sito (con pagamento finto su staging)

> Piano **compatto**: elenca file, interfacce e prove di ogni compito; il codice si scrive durante l'esecuzione, test prima (TDD), con un dev
> server acceso perché Kevin provi il flusso mentre prende forma (Kevin, 2026-10-12: «prima il flusso, poi si pubblica, in una sola PR
> verso `staging`»). Le parti visive seguono le skill `design-system` e `frontend-design`, e si guardano con uno screenshot prima di dire «fatto».

**Goal:** una persona sceglie date e bici su `/[lang]/rent`, paga (su staging con una pagina finta), vede la prenotazione in «Account rents» e
può annullare una bici; Kevin vede e gestisce le prenotazioni online dal pannello.

**Architecture:** tutta la logica è già nel motore della 3b (`lib/booking/`). La 3c aggiunge: letture per le pagine (`catalog`, `my-bookings`),
lo stato del flusso **nell'indirizzo** (`rent-url`, nessuno storage del browser: niente voce nel banner), uno strato che ricava l'identità dalla
sessione (`rent-actions`), le Server Action sottili, le pagine e i componenti, e il retroscena (worker, pannello, Google Calendar, termini).

**Spec:** `docs/superpowers/specs/2026-10-07-booking-slice3-online-booking-design.md` (sezioni «Il percorso», «Account rents», «Dal pannello», «Pagina dei termini», «Privacy e cookie»).
**Documentazione di Next letta:** `02-guides/server-actions.md` (ogni azione è un POST pubblico: identità dalla sessione, input validati, ritorni ridotti
al necessario; il browser le accoda una alla volta; gli id cambiano a ogni deploy → «riprova» nell'interfaccia) e
`03-api-reference/03-file-conventions/02-route-segment-config/instant.md` (`instant = false` sulle pagine che leggono i cookie). Prima di scrivere
`after()` o un `redirect()` in un'azione si rilegge la pagina di quell'API.

## Vincoli
- Solo `staging`. In produzione `paymentsAvailable()` è falso: **la pagina `/rent` e il pulsante «Prenota» non compaiono** (404 / assenti), e la pagina finta di pagamento risponde 404.
- Nessun dato personale nell'indirizzo del flusso; nessun cookie o storage nuovo. Nei log solo id.
- Prezzi, date, disponibilità e proprietà delle righe si decidono sul server (`quoteBikes`, `checkStay`, `cancelOnlineReservation`); il browser mostra una stima.
- Pannello in inglese e mai tradotto; sito pubblico in IT/EN/DE (`messages/*.json`); codice e commenti in inglese.
- Il pulsante «Paga» si spegne al primo clic, e la chiave del modulo (`bookingKey`) nasce all'apertura del riepilogo (stessa chiave = stessa prenotazione).

## Compiti (nell'ordine in cui si fanno)

| # | Cosa | File | Prova |
|---|---|---|---|
| 1 | **Stato nell'indirizzo**: `parseRentState(searchParams)` / `rentHref(state)`: date, carrello `modello.taglia.versione.quantità`, validati con `zod`, mai fiducia | `lib/booking/rent-url.ts` | unit: andata e ritorno, valori rotti scartati, tetto di 10 bici |
| 2 | **Bici prenotabili** per un periodo: modelli pubblicati con bici libere, taglie e versioni (la versione solo se per quella taglia ce n'è più d'una libera), prezzo del periodo, tetto di quantità = bici libere; prima libera i posti scaduti (`settleOverdueHolds`, a richiesta, senza mai bloccare la pagina) | `lib/booking/catalog.ts` | db: disponibilità vera con righe `held`/`confirmed`, versione nascosta se unica, modello oltre `maxRentalDays` segnalato |
| 3 | **Dal browser al motore**: `startCheckoutForUser` (utente dalla sessione, mai admin, email confermata, cliente, telefono valido con `libphonenumber-js` salvato nel profilo, termini accettati, poi `beginCheckout`), `cancelMyBike`, `confirmMyBooking` (la pagina di ritorno) | `lib/booking/rent-actions.ts` | db con gateway finta: ogni rifiuto (admin, non confermato, senza telefono, senza termini), la riga di un altro non si annulla |
| 4 | **Server Action sottili** che chiamano il punto 3 con l'utente della sessione e danno al client solo ciò che serve | `lib/actions/rent.ts` | tipi + prova nel browser |
| 5 | **Testi** in italiano, inglese e tedesco (`rent.*`, `account.rents.*`, avvisi) | `messages/{it,en,de}.json` | test di parità delle chiavi già in CI |
| 6 | **Pagina `/[lang]/rent`**: tre passi (date → bici → riepilogo e pagamento), calendario a intervallo (shadcn), carrello, telefono se manca, casella dei termini, «Accedi per prenotare» che riporta qui con tutto intatto | `app/[lang]/rent/page.tsx`, `components/rent/*` | a occhio nel browser (3 larghezze) + unit sulle parti pure |
| 7 | **Pagina finta di pagamento** (solo fuori produzione): riepilogo, «Paga» e «Annulla» | `app/[lang]/rent/fake-checkout/[session]/page.tsx` | 404 in produzione; a mano nel browser |
| 8 | **Account rents**: elenco (prossime/passate), dettaglio con «Annulla» per bici e l'importo che torna, atterraggio `?paid=1` che conferma | `lib/booking/my-bookings.ts`, `app/[lang]/account/rents/**`, `components/account/*`, menu | db sulle letture; nel browser |
| 9 | **Pulsante «Prenota»** sulla pagina della bici (apre `/rent` con il modello scelto) | `app/[lang]/bikes/[id]/page.tsx` | a occhio |
| 10 | **Pannello**: il vecchio «Cancel»/«Move» non tocca le righe online (filtro per tipo); le prenotazioni online nel calendario con un segno (e «in pagamento» per `held`); «annulla e rimborsa» (intero, parziale, niente) | `lib/reservations.ts`, `components/admin/*`, `lib/actions/rent.ts` | db: il vecchio annulla rifiuta una riga online; nel browser |
| 11 | **Retroscena**: lavoro del worker ogni minuto che chiama `settleOverdueHolds`; Google Calendar dopo conferma e annullamento (`after()` + `syncReservation`) | `worker/jobs/`, `lib/queues/names.ts`, `worker/main.ts` | unit del gestore |
| 12 | **Termini di noleggio** (bozza sui fatti già decisi, in tre lingue, marcata come da rivedere) e **informativa** (telefono obbligatorio per prenotare, pagamenti) | `app/[lang]/terms/page.tsx`, `messages/*.json` | a occhio; `lib/privacy-surface.test.ts` |

## Cosa resta fuori (3d e oltre)
Stripe vero e il webhook, l'email di conferma (fetta 4), il lavoro che avvisa Kevin dei pagamenti tardivi (oggi un log).

## Review Focus
1. Un cliente senza telefono o senza termini non prenota, e il telefono salvato è quello del profilo, mai di un altro (identità sempre dalla sessione).
2. `/rent` e la pagina finta non esistono in produzione (nessun «prenotare gratis»).
3. Doppio clic su «Paga» e ricarica dopo il pagamento: una sola prenotazione, una sola sessione.
4. Tornare indietro dalla pagina di pagamento (`cancel_url`) libera le bici subito, senza aspettare i 30 minuti.
5. Una persona non vede né annulla le bici di un'altra, nemmeno indovinando un id.
