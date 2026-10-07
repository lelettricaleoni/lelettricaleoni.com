# Fetta 3 — prenotazione e pagamento dal sito

Data: 2026-10-07. Decisioni di Kevin nella conversazione del 2026-10-07 e quelle valide per tutto il sistema
(`2026-10-02-booking-slice1-admin-calendar-design.md`). **Stato: spec da rivedere**, nessun codice scritto.

**Come leggere questa spec.** Le sezioni «Decisioni» e «Ipotesi» dicono cosa è stato scelto e da chi; il resto è il disegno che ne
discende. Le «Questioni aperte» in fondo sono ciò che serve a Kevin e che non blocca la costruzione.

## Obiettivo

Una persona con un account prenota una o più bici dal sito, vedendo la disponibilità vera, paga **intero** con Stripe, e la
prenotazione è confermata subito. Può annullare una bici alla volta, con rimborso intero, fino a due giorni prima del ritiro;
oltre, decide Kevin dal pannello. I noleggi del banco restano nello stesso calendario, quindi la disponibilità online è vera.

Successo: un cliente fa tutto da solo (accesso, scelta, pagamento, annullamento) senza che Kevin tocchi nulla; **nessuna bici è mai
venduta due volte**, **nessun pagamento resta senza prenotazione né il contrario**, e Kevin vede ogni prenotazione online nel suo calendario.

## Decisioni di Kevin

Dal 2026-10-02 (sistema): conferma immediata con pagamento intero su Stripe; rimborso intero fino a 48 ore prima, poi a mano caso per
caso; solo giorni interi; account obbligatorio; noleggi del banco nello stesso calendario; una prenotazione occupa **una bici fisica**
per un intervallo e il database impedisce le sovrapposizioni; posto tenuto 30 minuti durante il pagamento; al massimo **180 giorni**
da oggi (solo pagina pubblica); controlli contro gli inserimenti doppi; aggiornamenti in tempo reale; «Account rents» mostra **solo**
le prenotazioni online.

Del 2026-10-07 (questa spec):
1. **Un carrello con più bici** in un solo pagamento, anche di modelli e taglie diverse.
2. Per ogni bici il cliente sceglie **modello, taglia e versione** (la versione compare solo se per quella taglia ce n'è più d'una libera;
   oggi esiste solo «Unisex»).
3. **Una bici alla volta si annulla**, con il suo rimborso parziale.
4. **Un solo periodo per prenotazione**: tutte le bici hanno le stesse date.
5. Il **telefono è obbligatorio per prenotare**: se manca nel profilo lo si chiede nella pagina della prenotazione e si salva nel profilo.
6. Stripe Checkout ospitato.

## Ipotesi confermate il 2026-10-07

1. Si prenota **da domani**; il giorno stesso lo registra Kevin al banco.
2. Al massimo **10 bici** per prenotazione.
3. Rimborso intero fino alle **09:00 (ora di Roma) di due giorni prima** del primo giorno (il ritiro è all'apertura).

## Dentro e fuori

**Dentro**: tabelle e stati; pagina pubblica `/[lang]/rent`; tenere, confermare e rilasciare i posti; Stripe Checkout, webhook e
riconciliazione; Account rents (elenco, dettaglio, annulla una bici); azioni del pannello per prenotazioni online (annulla e rimborsa:
intero, parziale o niente); la pagina dei **termini di noleggio**; privacy e cookie.

**Fuori**: l'email di conferma e i promemoria (fetta 4; per ora la ricevuta è quella di Stripe); gli appuntamenti di riparazione (fetta 5);
scontrino o fattura (restano come oggi); spostare una prenotazione di date (si annulla e si prenota di nuovo); codici sconto; pagamento in negozio.

## Dati

Una migrazione per passo, perché Postgres non lascia usare un valore di enum aggiunto nella stessa transazione.

### Stati e tipi
- `reservation_status` aggiunge **`held`** (tenuta, in attesa del pagamento) ed **`expired`** (la bici è stata tenuta e il pagamento non è arrivato).
  Resta `confirmed` e `cancelled`.
- `reservation_kind` aggiunge **`online_rental`**.
- Il vincolo `bike_reservations_no_overlap` (oggi `WHERE status = 'confirmed'`) si ricrea con **`WHERE status IN ('confirmed','held')`**: chi sta
  pagando blocca la bici. Una riga `expired` o `cancelled` non blocca.

### `bookings` (la testata di un pagamento)
`id`, `customer_id` (non nullo), `request_key` (uuid, unico: l'idempotenza della prenotazione), `status` (`pending`, `confirmed`, `cancelled`,
`expired`, `failed_refunded`), `starts_on`, `ends_on` (le stesse di ogni riga), `total_cents`, `language` (della pagina in cui si è prenotato),
`stripe_session_id` (unico), `stripe_payment_intent_id`, `hold_expires_at`, `created_at`, `confirmed_at`.
- `pending`: bici tenute, pagamento in corso. `confirmed`: pagata. `expired`: scaduta senza pagamento. `cancelled`: **tutte** le bici annullate.
  `failed_refunded`: il pagamento è arrivato quando il posto non c'era più ed è stato rimborsato per intero.
- RLS acceso e nessuna policy, come le altre tabelle (l'app si collega come `postgres`).

### `bike_reservations`
Aggiunge `booking_id` (nullo per i noleggi del banco e le manutenzioni). Ogni bici è **una riga** con il suo `amount_cents`, il suo stato e la sua
`request_key`, derivata in modo deterministico da quella della prenotazione (uuid v5 con l'indice della riga: ripetere la richiesta ritrova le stesse righe).

### `booking_refunds` (un rimborso per riga, al massimo)
`id`, `reservation_id` (**unico**: una bici non si rimborsa due volte), `booking_id`, `amount_cents`, `status` (`pending`, `succeeded`, `failed`),
`stripe_refund_id`, `reason` (`customer`, `staff`, `late_payment`), `created_by` (id dell'utente che l'ha chiesto, nullo per il sistema), `created_at`.
Le righe `pending` sono ritentabili; quelle `succeeded` non si toccano.

### `stripe_events`
`id` (l'id dell'evento di Stripe, chiave primaria), `type`, `received_at`, `processed_at`. Un evento già visto non si rielabora.

## Disponibilità e prezzo

**Disponibilità** per `(modello, taglia, versione)` e intervallo `[inizio, fine+1)`: le bici non ritirate (`retired_on` nullo o oltre la fine) senza
una riga `confirmed` o `held` che si sovrappone. Il calendario dei giorni non prenotabili di un modello è «tutte le bici di quel modello occupate».
Si ricalcola quando arriva il campanello di Realtime (già c'è, senza dati personali, con il limite `lib/coalesce.ts`).
Prima di ogni calcolo si liberano le righe `held` scadute (un `UPDATE`, già provato con richieste concorrenti).

**Prezzo**, sempre sul server: per ogni bici `priceForDay(categoria, giorni, percentuale del modello)` (listino per categoria + la percentuale), in centesimi
(`lib/money.ts`), somma per il totale. Solo giorni interi: la tariffa del pomeriggio non si offre online. La lunghezza massima è `maxRentalDays` della
categoria (le bici «lineari» arrivano oltre i 7). Il browser mostra una stima; **chi decide è sempre il server**.

## Il percorso

Una pagina, **`/[lang]/rent`**, in tre passi; lo stato (date, bici, quantità) sta **nell'indirizzo**, senza nessuno storage del browser (che richiederebbe
una voce nel banner), così Indietro funziona e un link si condivide. Nessun dato personale nell'indirizzo.

1. **Date**: calendario a intervallo (`calendar` di shadcn), da domani a 180 giorni.
2. **Bici**: i modelli con le taglie e le versioni davvero libere per quelle date, il prezzo per il periodo, la quantità fino alle bici libere. La versione solo
   se per quella taglia ce n'è più d'una.
3. **Riepilogo e pagamento**: righe, totale, telefono (se manca), «Accetto i termini di noleggio» (link a `/[lang]/terms`), «Paga con Stripe». Il pulsante
   resta spento dopo il primo clic. Senza accesso: «Accedi per prenotare» porta a `/[lang]/login` e riporta qui con tutto intatto (`next`).

La pagina di ogni bici ha un pulsante «Prenota» che apre il flusso con il modello scelto. **Dopo il pagamento**: `/[lang]/account/rents/<id>?paid=1`, che aspetta
il webhook (pochi secondi, poi mostra «in conferma» e continua a controllare) e mostra bici, date, importi e il link alla ricevuta di Stripe.

**Account rents** (`/[lang]/account/rents`, nel menu accanto a «Account settings»): le prenotazioni online del cliente, mai quelle del banco, in
«prossime» e «passate»; il dettaglio di ognuna con le sue bici. Ogni bici ha «Annulla» finché è rimborsabile, con una finestra che dice l'importo che torna;
dopo il termine c'è scritto di contattare il negozio (`help@lelettricaleoni.com`).

## Stripe

**Libreria**: l'SDK ufficiale `stripe` (firma del webhook, sessioni, rimborsi, idempotenza); niente richieste a mano. Validazione con `zod`, date con `date-fns` + `@date-fns/tz`.

### Iniziare il pagamento — Server Action `startCheckout`
1. Controlla da capo, sul server: accesso e email confermata, date (da domani, fino a 180 giorni, `maxRentalDays` per riga), carrello (1–10 bici),
   telefono valido (`libphonenumber-js`), consenso ai termini. Un amministratore non prenota.
2. Un cliente ha **al massimo una prenotazione `pending`**: avviarne un'altra fa scadere la precedente (e la sua sessione di Stripe). Se un cliente ha lasciato
   scadere 5 prenotazioni nell'ultima ora, per un'ora non può avviarne di nuove (contro chi tiene le bici per scherzo).
3. Libera le righe `held` scadute; **ricalcola i prezzi** dal listino.
4. Crea la testata `pending` (`hold_expires_at` = adesso + 30 minuti, `request_key` dal modulo) e **tiene le bici una alla volta** con la logica di
   `createCounterRental` (assegnazione di una bici libera, ritentando sul vincolo `23P01`), ma con stato `held`. Se una riga fallisce (nessuna bici libera):
   si rilasciano quelle già tenute, la testata diventa `expired`, e si risponde dicendo **quale riga** non è più disponibile. Niente transazioni (`max_pipeline: 0`):
   le righe tenute scadono comunque da sole.
5. Crea la **sessione di Stripe Checkout** (pagamento unico, EUR, una riga per bici con `price_data`, `client_reference_id` = id della prenotazione,
   `metadata.booking_id`, `customer_email`, lingua del cliente, `expires_at` = la scadenza del posto, `success_url`, `cancel_url`), con la
   `request_key` come chiave di idempotenza. Salva `stripe_session_id` e manda il cliente all'indirizzo di Stripe.
6. `cancel_url` riporta al carrello e **rilascia subito** le bici (un clic su «indietro» non deve tenerle 30 minuti).

### Confermare — webhook `POST /api/stripe/webhook`
È l'**unica** rotta `app/api/` di questa fetta, perché a chiamare è Stripe e non il nostro sito (regola del progetto).
- Verifica la firma sul corpo grezzo con l'SDK (`constructEvent`) e il segreto del webhook; scarta ciò che non è firmato.
- Salta gli eventi già in `stripe_events` (insert con `ON CONFLICT DO NOTHING`).
- `checkout.session.completed` con pagamento riuscito: **un'istruzione sola** porta `pending → confirmed` la testata e `held → confirmed` le righe, e salva il
  `payment_intent`. Se le righe erano già scadute e la bici è stata presa, **rimborsa tutto il pagamento** (`reason = late_payment`), segna `failed_refunded`
  e lo registra: è il caso raro che non deve costare soldi a nessuno.
- `checkout.session.expired`: rilascia le righe.
- `refund.updated` / `charge.refunded`: allinea `booking_refunds` (anche per i rimborsi fatti dal pannello di Stripe).
- Risponde `200` appena l'evento è registrato; un errore interno risponde `500` e Stripe ritenta.

### Scadere e riconciliare — lavoro del worker ogni 5 minuti
Un lavoro ripetuto di BullMQ (l'impalcatura c'è: un `createXHandler` in `worker/jobs/`, una coda in `lib/queues/names.ts`, una riga in `worker/main.ts`):
1. **Libera** le righe `held` con la scadenza passata e porta la testata a `expired`.
2. **Riconcilia**: per le testate `pending` scadute da più di 5 minuti chiede a Stripe lo stato della sessione; se risulta pagata (webhook perso), conferma.
Il rilascio «pigro» nella disponibilità resta come prima rete.

## Annullare e rimborsare

**Termine**: la funzione `refundDeadline(startsOn)` (pura, provata) dice le 09:00 Europe/Rome di due giorni prima; l'interfaccia lo mostra.

**Il cliente annulla una bici** — Server Action `cancelReservation`: controlla che la riga sia sua, `online_rental`, `confirmed` e prima del termine. Poi, in ordine:
1. inserisce la riga `booking_refunds` `pending` (la chiave unica su `reservation_id` rende impossibile il secondo rimborso);
2. chiede il rimborso a Stripe per l'importo della bici, con `Idempotency-Key = refund-<reservation_id>`;
3. segna la riga `cancelled` e il rimborso `succeeded`. Se Stripe rifiuta, la riga resta `confirmed` e il rimborso `failed` (ritentabile); se il database fallisce dopo
   che Stripe ha rimborsato, un nuovo tentativo ritrova il rimborso (stessa chiave) e finisce il lavoro. Quando tutte le bici sono annullate la testata è `cancelled`.

**Dal pannello** (`/manage/bookings`): le prenotazioni online compaiono nel calendario con un segno (e quelle `held` come «in pagamento», perché la bici è occupata) e mostrano la prenotazione e il suo pagamento; Kevin può **annullare una
bici online e rimborsare intero, parziale o niente**, in qualsiasi momento (maltempo, accordi). Stessa procedura, `reason = staff`, con l'id di chi l'ha fatto.

## Pagina dei termini di noleggio

Una pagina pubblica `/[lang]/terms` (testi in `messages/*.json`, tre lingue) a cui rimanda la casella «Accetto». **Blocca il rilascio.** Parte dalle regole già decise
(pagamento intero, rimborso fino alle 09:00 di due giorni prima, solo giorni interi, ritiro all'apertura e riconsegna entro la chiusura dell'ultimo giorno) e
**aspetta le risposte di Kevin** su cauzione, danni, furto e smarrimento, età minima e casco, mancata presentazione, maltempo. Il diritto di recesso (servizi del tempo libero
con data precisa) va comunicato: da far confermare a chi rivede i testi. È un testo legale: bozza sui fatti, da far rivedere.

## Privacy e cookie (pensati prima)

1. **Dati nuovi**: righe della prenotazione, importi, id di Stripe; il telefono (obbligatorio per prenotare). **I dati della carta non transitano da noi.**
2. **Chi li vede**: Kevin dal pannello, il cliente da Account rents, Stripe.
3. **Cancellazione ed esportazione**: le prenotazioni entrano nel file «scarica i miei dati»; con l'eliminazione dell'account restano come i noleggi del banco
   (domanda per chi rivede i testi, già in `privacy-cookies`).
4. **Informativa**: Stripe tra i destinatari (nome del soggetto da verificare sul tuo account Stripe), telefono richiesto alla prenotazione, nessun dato di
   carta presso di noi, cookie propri di Stripe su stripe.com; stessa PR del codice, e il test `lib/privacy-surface.test.ts` aggiornato.
5. **Prima del consenso**: nessuno script di Stripe sul nostro sito (Checkout è una pagina di Stripe). Nessun cookie nuovo da parte nostra: lo stato del flusso è nell'indirizzo.
- **Log**: mai dati di persone; errori di query con `safeErrorSummary`. Gli eventi di Analytics del flusso (`rent_start`, `rent_checkout`, …) solo con categorie, mai importi
  legati a un utente né email.

## Sicurezza e concorrenza

- Prezzi, date, disponibilità e proprietà della riga si decidono **solo sul server**; ogni azione rilegge l'utente dalla sessione, mai dal modulo.
- Idempotenza a tre livelli: `request_key` della prenotazione (e derivate delle righe), chiavi di idempotenza di Stripe, `stripe_events`.
- Concorrenza: il vincolo del database è l'ultima parola; i conflitti si ritentano (già provato con richieste vere sul pooler).
- Il webhook non si fida del contenuto: verifica la firma, e rilegge dal database lo stato della prenotazione prima di agire.
- Un rimborso non si ripete (unicità per riga) e non si fa senza una riga `pending` scritta prima.

## Prove

- **Funzioni pure** (`vitest`): prezzo del carrello, `refundDeadline`, regole sulle date (da domani, 180 giorni, `maxRentalDays`), validazione del carrello e della richiesta.
- **Database** (`npm run test:db`, solo sviluppo): tenere/confermare/scadere con richieste concorrenti; carrello con una bici mancante (rilascio delle altre e riga indicata);
  webhook ripetuto; pagamento tardivo con rimborso; nessun doppio rimborso; l'annullamento rilascia le date e non le altre bici.
- **Webhook** con eventi firmati davvero dall'SDK (`generateTestHeaderString`), senza rete.
- **Browser** su staging con la carta di prova di Stripe (a mano o in una suite a parte), non in CI.
- Test di contratto sul client di Stripe sostituito (le azioni non devono toccare la rete nei test).

## Rilascio e dipendenze

- Tutto su `staging`, con Stripe in **modalità di prova** (webhook su `https://staging.lelettricaleoni.com/api/stripe/webhook`; la rotta deve passare da Cloudflare senza
  essere fermata). Chiavi e segreto del webhook nei file dei segreti della VM, mai in git (modello `deploy/web/env.template`, `docs/environment-variables.md`).
- In produzione con **una sola PR `staging → main`**, che porta le migrazioni (con le righe nel tracking), le chiavi vere di Stripe, il webhook di produzione, **la pagina dei termini**
  e **la revisione di informativa e cookie**. Nessuno dei quattro può mancare.
- **Prima di cominciare** serve che l'accesso unificato sia unito su `staging` (la PR #309: porta anche `main` nel ramo, quindi la migrazione `0016` e la percentuale dei prezzi)
  e che Kevin abbia un **account Stripe**: chiavi di prova per lo staging; per il rilascio l'attivazione e il soggetto (paese, ragione sociale) che compare nell'informativa.
- Ordine di costruzione, in pezzi che si provano da soli: **(a)** dati, disponibilità, posto tenuto e scadenza, senza pagamento; **(b)** Stripe, webhook, conferma e riconciliazione;
  **(c)** Account rents, annullamento e rimborsi, azioni del pannello; **(d)** la pagina `/rent`, il pulsante sulla bici e i termini.

## Rischi e cose da sapere

- **Tenere le bici per scherzo**: coperto da una prenotazione `pending` per cliente e dal limite di 5 scadute all'ora.
- **Webhook perso o in ritardo**: coperto dalla riconciliazione ogni 5 minuti e dal rimborso automatico del pagamento tardivo.
- **Stripe raggiungibile solo se il tunnel lo lascia passare**: da provare su staging prima di qualunque altra cosa.
- **Più bici = più rimborsi parziali**: ogni importo è per riga, in centesimi; la somma dei rimborsi di una prenotazione non supera mai il suo totale (controllo nella stessa istruzione che inserisce la riga `pending`).
- **Il prototipo di Kevin** (`C:\AzureDevOps\firebase`, calendario di selezione) si guarda per l'interfaccia del calendario, non si porta il resto (Firestore, Stripe di prova).

## Questioni aperte

1. **Contenuto dei termini**: cauzione (se e quanto), danni, furto e smarrimento, età minima e casco, mancata presentazione, maltempo, orari di ritiro e riconsegna. *Servono a Kevin per
   scriverla; bloccano solo il rilascio, non la costruzione.*
2. **Account Stripe**: esiste? Chiavi di prova per lo staging; soggetto e paese per l'informativa; ricevute via email attive nelle impostazioni.
3. **Scontrino o fattura** per i pagamenti online: oggi Kevin li gestisce a parte per il banco; per l'online vale lo stesso? (Stripe non emette documenti fiscali italiani.)
