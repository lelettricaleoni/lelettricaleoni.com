# Pagina di prenotazione: rifacimento, checkout, limite di 7 giorni, ordine per categoria

> Piano di lavoro del ramo `feat/rent-page-redesign` (2026-10-13). **Si aggiorna a ogni passo**: `[x]` fatto e provato, `[~]` in corso, `[ ]` da fare.
> Richieste di Kevin, nell'ordine in cui sono arrivate. Regole: tutto su `staging` via una sola PR, **dopo** che Kevin ha provato il flusso su
> `http://localhost:3000/it/rent` (dev server su questo ramo); mai produzione; guardiano `merge-when-green.sh` dopo la PR.
> Next.js: nessuna API nuova. Letta `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md` (redirect in un Server Component), per il resto
> si copiano i modelli di `app/[lang]/rent/page.tsx` e `app/[lang]/rent/cancelled/[id]/page.tsx`. Privacy: nessun dato, cookie, storage o servizio nuovo.

## 1. Footer e navbar della stessa larghezza (Kevin: «navbar e footer di dimensioni diverse»)
- [x] Footer `max-w-5xl` → `max-w-6xl`, come la navbar (`components/footer.tsx`).

## 2. Layout della pagina `/rent` (scelta A: fascia in alto, bici a griglia, riepilogo accanto, barra in basso sul telefono)
- [x] Fascia dei giorni in cima, colonna centrale `max-w-3xl`.
- [x] Bici in griglia da tre, foto 3:2 (non più tagliata), bordo blu sul modello con una bici nel carrello, foto accanto al nome sul telefono.
- [x] Barra fissa in basso sul telefono (numero di bici, totale, «Continua»), nascosta quando il riepilogo è in vista.
- [x] Provato a 1440, 375, 320 px, it/en/de, senza scorrimento orizzontale.

## 3. Barra dei giorni e calendario del mese (Kevin: «orribili»)
- [x] Barra: celle intere, giorno scelto pieno, giorni in mezzo azzurri, giorni non scegliibili barrati.
- [x] Mese: fascia continua tra primo e ultimo giorno con cerchi pieni agli estremi, senza giorni del mese vicino, periodo scelto in alto (`MonthDay` in `period-picker.tsx`).
- [ ] Verdetto di Kevin sul nuovo mese.

## 4. Meno testo sulla pagina (Kevin: «troppe informazioni testuali»)
- [x] Tolti: sottotitolo, frase «si prenota da domani…», legenda dei giorni grigi, «Serve un account…», email nell'avviso fattura, spiegazioni lunghe del ritiro.
- [x] Chiavi tolte dai tre `messages/*.json`: `subtitle`, `dates_hint`, `legend_off_days`, `legend_off_bike`, `login_hint`, `login_cta`.
- [x] Nota in `docs/ai/ideas/prenotazioni-punti-aperti.md`: la spiegazione «entro la chiusura» va nei termini.

## 5. Pagina di checkout (Kevin: «sposta termini, riepilogo, informazioni in una pagina di checkout con il bottone paga che rimanda a Stripe; in futuro si potranno aggiungere extra»)
- [x] `checkoutHref` in `lib/booking/rent-url.ts` (+ test).
- [x] `app/[lang]/rent/checkout/page.tsx` (server: controlla giorni e bici su dati freschi, ospiti → accesso e ritorno, vuoto → `/rent`) e `components/rent/checkout-form.tsx` (riepilogo con foto, ritiro e riconsegna su due righe, telefono se manca, termini, Paga).
- [x] `/rent` ora ha solo il riepilogo corto con «Continua» (link al checkout); `PaySection` e `RentAccount` tolti.
- [x] Il ritorno da Stripe senza pagare (`abandonMyCheckout`) riporta al checkout.
- [x] Provato dal vivo: ospite → accesso → checkout → Paga → pagina di pagamento Stripe (di prova) → indietro → checkout.
- [ ] Controllare a occhio la riga di ritiro su due righe (it/en/de) e il caso «bici presa nel frattempo» (messaggio e «Modifica»).
- [ ] Spazio per gli extra: la pagina è già divisa in schede; nessun codice finché Kevin non decide quali.

## 6. Limite di 7 giorni per tutte le bici (Kevin: «come nel progetto firebase; vale per tutte le bici, non dipende dalla categoria»)
- [x] `MAX_RENTAL_DAYS = 7` in `lib/booking/rules.ts`; `checkStay` risponde `too_long` oltre i 7 giorni (dopo i controlli sulle date), con test.
- [x] Il calendario (barra e mese) ferma la scelta a 7 giorni dal primo giorno (`maxDays` sempre passato; prima solo per una bici sola e per la sua categoria).
- [x] Messaggio `errors.stay_too_long` (it/en/de); `FocusModel.maxDays` tolto. `maxRentalDays` della categoria resta solo per il listino.
- [x] Provato nel browser: dopo il primo tocco (26 ott) il 1 nov (settimo giorno) si sceglie, il 2 nov è spento. Il limite vale dopo il primo tocco: con un periodo già scelto nulla è spento finché non se ne comincia uno nuovo.

## 7. Ordine per categoria (Kevin: «ordine delle categorie, poi dei modelli dentro la categoria; pannello diviso per categoria; anche la prenotazione divisa per categoria»)
- [x] Ordine unico: categoria (`displayOrder`, nome, id) poi modello (`displayOrder`, creazione) in `lib/bikes-data.ts` (2 query), `lib/booking/catalog.ts`, `getBikeModelsForAdmin`.
- [x] `/manage/bikes`: una sezione per categoria, ogni sezione con il suo elenco trascinabile (`reorderBikeModelsAction` riceve gli id di una categoria sola; le altre non cambiano).
- [x] `/rent`: sezioni per categoria (titolo solo nella scelta per giorni), i modelli senza bici libere restano al loro posto, spenti; il distintivo della categoria sulla scheda è tolto.
- [x] Test: `tests/db/catalog.test.ts` (ordine per categoria, poi per modello; 12 test verdi). Il resto di `npm run test:db` da rilanciare a fine lavoro.
- [~] Provato: pannello (sezione «Front» con i due modelli) e `/rent` (titolo di categoria). **Manca**: trascinare in una categoria con altre categorie accanto e la pagina pubblica `/it/bikes`: nel database di sviluppo c'è una sola categoria con modelli, per questo serve la copia dei dati di produzione (piano `2026-10-13-production-data-to-test.md`).
- [ ] Cambiare l'ordine di una categoria nel pannello → pagina pubblica aggiornata (cache `bike-models`/`bike-options`): controllare.

## 8. Chiusura
- [ ] `npx tsc`, `eslint`, `npx vitest run`, `npm run test:db` verdi.
- [x] Utente di prova `claude-rent-test@example.test` cancellato (le sue prenotazioni di prova chiuse con il ritorno dal pagamento). **Da rifare** se si prova di nuovo il flusso con un account.
- [ ] Aggiornare `STATE.md` (ordine per categoria, limite di 7 giorni, checkout) e `prenotazioni-punti-aperti.md` (spostare i punti chiusi).
- [ ] Kevin prova il flusso intero; poi UNA PR verso `staging`, guardiano in background.

## 9. Piani collegati, scritti il 2026-10-13 (non iniziati)
- `docs/superpowers/plans/2026-10-13-contact-page.md`: pagina dei contatti come fonte unica (richiesta di Kevin).
- `docs/superpowers/plans/2026-10-13-production-data-to-test.md`: dati di produzione sul test (richiesta di Kevin; aspetta le sue quattro scelte).
- `docs/superpowers/plans/2026-10-13-hold-expiry-jobs.md`: un job per prenotazione al posto del timer al minuto (consigliato con la fetta 4).
