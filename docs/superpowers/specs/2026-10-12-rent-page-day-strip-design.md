# Pagina di prenotazione con il selettore dei giorni, e orari di apertura

> Spec del 2026-10-12, da rivedere con Kevin. Parte dalla pagina `/rent` della fetta 3c (calendario a due mesi + elenco delle bici
> libere) e la rifà intorno a un selettore dei giorni ispirato alla barra che Kevin aveva iniziato nel repo `firebase` (`app/rent/`), ma ripensato. Due parti, due piani:
> **A** la pagina e i due modi di entrare; **B** gli orari di apertura e le chiusure. Solo `staging`: in produzione decide Kevin.

## Che cosa vuole Kevin (le sue parole, e le sue risposte)

1. **Priorità alle giornate** (`/rent`): una pagina simile a quella delle bici, con una **barra dei giorni** (poi ripensata, vedi «Il selettore») che permette di navigare tra i giorni e di
   vedere **quali modelli sono disponibili**. Si sceglie un periodo e il periodo ha la priorità sul modello.
2. **Priorità alla bici**: dal dettaglio di una bici (`/bikes/…`, che esiste già) si apre la prenotazione con quella bici; la pagina chiede il
   periodo, e **i giorni in cui quella bici non è disponibile sono oscurati e non selezionabili**.
3. **Card per modello, non per bici fisica** (risposta di Kevin): due bici dello stesso modello e taglia sono intercambiabili, e la bici fisica
   la assegniamo noi. Dentro la card le taglie libere con − e + per il carrello, come in `/bikes` per la grafica.
4. **Giorni oscurati e fine del periodo** (risposta di Kevin): si oscurano i giorni senza bici e, scelto il primo giorno, anche quelli oltre il
   punto in cui nessuna bici resta libera. Un periodo scelto è sempre prenotabile.
5. **Orari e chiusure** (priorità più bassa): Kevin li dichiara dal pannello. Nei giorni di chiusura non si prenota; gli orari si comunicano al
   cliente durante la prenotazione. **Giorno chiuso**: solo il primo e l'ultimo giorno devono essere aperti (si ritira e si riconsegna in negozio);
   in mezzo il negozio può essere chiuso (risposta di Kevin).
6. **Regola del noleggio** (Kevin, 2026-10-12): le bici si ritirano **entro la fine del primo giorno** e si riconsegnano **entro la fine
   dell'ultimo giorno**, non il giorno dopo né la mattina dopo, perché vanno ricaricate; accordi diversi solo contattando il negozio. Oggi i testi
   dicono «ritiro all'apertura del primo giorno»: è sbagliato e va corretto (vedi «Testi»).

**Resta com'è:** il carrello di più bici, il riepilogo, il pagamento (Stripe), «Le tue prenotazioni», i termini, il pannello. La disponibilità
(una bici è occupata per tutto l'ultimo giorno: `ends_on` esclusivo) non cambia.

## Approccio scelto

**Una sola pagina `/rent` con due modi, e un motore di disponibilità puro che gira nel browser** (scelto da Kevin tra tre). Il server manda, all'apertura
della pagina, i periodi in cui ogni bici fisica è occupata nei prossimi 180 giorni (pochi dati); il browser calcola da solo giorni oscurati e fine
massima, senza aspettare una risposta a ogni tocco. Il server **ricontrolla tutto al pagamento** (`beginCheckout`, come oggi): il selettore guida,
non decide. Scartati: due pagine separate (selettore, carrello e pagamento duplicati) e un server che decide a ogni clic (ogni tocco aspetta la rete).

## Parte A: la pagina e il selettore

### I due modi
| | Per giornate | Per bici |
|---|---|---|
| Indirizzo | `/rent` | `/rent?model=<uuid>` (il pulsante «Prenota» del dettaglio bici già lo manda) |
| In cima | il selettore del periodo | la bici scelta (foto, nome, categoria) e il selettore |
| Giorni oscurati | passati, oltre i 180 giorni, chiusi (parte B), e quelli in cui **nessuna bici** è libera | gli stessi, ma «nessuna bici libera» riguarda **quel modello**; scelto il primo giorno, oltre la fine massima coprivibile da una sola bici e oltre i giorni massimi della categoria |
| Sotto | una card per modello libero nel periodo; i modelli non liberi restano visibili e spenti, con «non disponibile in queste date» | la card di quel modello (taglie, − e +) e un link «vedi tutte le bici libere in questo periodo», che passa al modo per giornate **tenendo il periodo** |
| Carrello | uguale, e si possono aggiungere altre bici allo stesso carrello | uguale |

Il periodo e il carrello restano nell'indirizzo (`from`, `to`, `b`, `model`), come oggi: un aggiornamento della pagina o un link condiviso li conserva.

### Il selettore del periodo (`components/rent/period-picker.tsx`)
> **Rifatto il 2026-10-13 sulla richiesta di Kevin** («non ti avevo chiesto la barra come calendario?»): la barra è quella di Kevin, una **striscia di sette giorni con una freccia per lato**
> (una settimana alla volta, i giorni della settimana allineati dal lunedì, il giorno scelto in un cerchio pieno) e **sotto la freccia che apre il mese** (`period-strip.ts`). Due tocchi fanno il
> periodo, come nella sua barra; i giorni grigi dicono perché. La pagina si apre **già su domani** (o sul primo giorno dopo domani in cui si può prenotare: `firstBookableDay`), così ci sono subito
> dei risultati. Il testo che segue, con il mese che si richiude in una riga e «giorno prima / giorno dopo», è **superato**: era una mia reinterpretazione, non quello che Kevin voleva.

**Non copia la barra del repo `firebase`** (Kevin, 2026-10-12: va riadattata, e forse non è nemmeno la navigazione ottimale). Quella barra mostra una settimana
alla volta: va bene per chi sa già le date e per spostarsi di pochi giorni, ma nel modo per bici serve capire **quando** una bici è libera, e con sette giorni
alla volta servono molti tocchi (e a 180 giorni di distanza, ancora di più). Il mese dà il colpo d'occhio che manca. Scelta: **un solo componente con due
stati**, che tiene dell'idea di Kevin la parte che funziona (spostarsi di giorno in giorno e vedere cambiare le bici):
- **Aperto** (finché non c'è un periodo, o con «Cambia»): la griglia del mese (un mese a telefono, due da `lg`), frecce tra i mesi fino a 180 giorni, giorni
  oscurati con la legenda. È la griglia di shadcn (`Calendar` / `react-day-picker`), con i giorni disabili calcolati dal motore.
- **Compatto** (periodo scelto): una riga con il periodo («lun 7 – mar 8 dic · 2 giorni»), due pulsanti **‹ giorno prima / giorno dopo ›** che spostano
  **tutto il periodo di un giorno** (disabilitati se il periodo spostato non è prenotabile) e «Cambia», che riapre il mese. L'elenco delle bici si
  ricarica a ogni spostamento: è il modo di «navigare nei giorni e vedere quali modelli sono disponibili». A telefono l'elenco sta subito sotto, senza
  un calendario alto in mezzo.
- **Scelta del periodo** (stato aperto): tocco sul primo giorno (inizia), tocco sull'ultimo (chiude); lo stesso giorno due volte = noleggio di un giorno;
  un tocco prima del primo giorno ricomincia da lì. Completato il periodo l'indirizzo cambia (come oggi: `router.push` in una transizione, l'elenco si
  ricarica con `listBookableBikes`) e il selettore passa allo stato compatto.
- **Aspetto**: regole di `design-system` (`rounded-md`, colore `primary` per il periodo scelto, nessuna pillola per le azioni, `Button` `outline`/`ghost`
  per i pulsanti, icone `react-icons/lu`). Giorno oscurato = sfondo `muted`, testo attenuato, **nome accessibile che dice perché** («lun 7 dic, chiuso»,
  «lun 7 dic, nessuna bici libera»); una legenda lo spiega. Tastiera: frecce tra i giorni, Invio sceglie. Nessun movimento gratuito: solo le
  transizioni di colore e ciò che risponde a un gesto.
- **Scartati** (per ora): la sola striscia di una settimana (poco colpo d'occhio, molti tocchi per le date lontane); una **matrice modelli × giorni**
  (righe i modelli, colonne i giorni, colorata per disponibilità): potente per chi esplora, ma pesante per un cliente di un negozio piccolo e difficile a
  320 px. Se serve, si aggiunge dopo sopra gli stessi dati.

### Il motore di disponibilità (`lib/booking/day-availability.ts`, puro, senza database)
```
type UnitBusy = { unitId, sizeId, versionId, retiredOn: IsoDate | null, busy: DayRange[] }   // busy = periodi occupati, già uniti

freeUnits(units, day): UnitBusy[]                       // bici libere in quel giorno (e non ritirate)
dayHasBike(units, day): boolean                         // almeno una bici libera
lastSelectableDay(units, start, maxDays): IsoDate|null  // massimo, tra le bici libere in `start`, di
                                                        //   min(giorno prima del prossimo occupato o del ritiro, start + maxDays - 1)
isSelectable(day, state): { ok } | { ok:false, reason: 'past'|'too_far'|'closed'|'no_bike'|'beyond_end' }
```
- Nel modo per giornate `units` sono tutte le bici dei modelli pubblicati e **non** c'è la fine massima: ogni modello dice poi se è libero per tutto il
  periodo (`listBookableBikes`, che c'è già).
- Nel modo per bici `units` sono quelle del modello, e `maxDays` è `maxRentalDays` della sua categoria.
- Lo stesso modulo lo usa il server per ricontrollare un periodo prima di mostrarlo e nei test: **una sola definizione di «libero»** (`OCCUPYING_STATUSES` in
  `lib/booking/occupancy.ts`: `confirmed` e `held` occupano).

### Dati dal server (`lib/booking/busy-intervals.ts`)
`getUnitBusyIntervals({ modelId?, window })`: una query come `getFreeBikes` ma per bici fisica, con i periodi `confirmed`/`held` nella finestra
(da domani a `MAX_DAYS_AHEAD`), uniti in periodi continui, più `retired_on`. Solo modelli pubblicati. La pagina li legge a ogni richiesta (già
dinamica: `await connection()`), niente cache condivisa: una prenotazione appena fatta deve vedersi. Dopo il pagamento, il ricontrollo è del server.

### File toccati
`app/[lang]/rent/page.tsx` (carica i dati e il modo), `components/rent/rent-flow.tsx` (usa il selettore al posto del `Calendar`; elenco delle card),
nuovi `components/rent/period-picker.tsx`, `components/rent/model-card.tsx` (card per modello con taglie e carrello, grafica di `BikeCard`),
`lib/booking/day-availability.ts`, `lib/booking/busy-intervals.ts`, `lib/booking/rent-url.ts` (invariato salvo il nome del modo), `messages/*.json`
(`rent.*`), `app/[lang]/bikes/[id]/page.tsx` (nessun cambio: il pulsante c'è già).

## Parte B: orari di apertura e chiusure

### Dati
- `shop_opening_hours(id, weekday smallint 1..7 ISO, opens_at time, closes_at time)`: una riga per ogni fascia (più fasce nello stesso giorno per la
  pausa); un giorno senza righe è chiuso. Orari **locali di Roma** (colonne `time`, nessun fuso nel dato).
- `shop_closures(id, starts_on date, ends_on date, reason text|null)`: giorni o periodi di chiusura (`ends_on` esclusivo come ovunque nel
  database; nel modulo si scrive l'ultimo giorno incluso). Il motivo è per Kevin (non si mostra al cliente).
- Migrazione con i valori di oggi (tutti i giorni 09:00–13:00 e 14:00–19:00, da `docs/contact-details.md`), RLS esplicito, nessuna policy. `drizzle-kit
  generate` + `npm run db:migrate` (solo sviluppo; la produzione la decide Kevin).

### Pannello (in inglese, `/manage/hours`, voce «Opening hours» nella barra laterale con `layout.tsx` e `AdminShell`)
Un modulo per i sette giorni (fasce con «+ Add a range», «Closed» per un giorno intero) e un elenco di chiusure con «Add closure» (da / a / motivo) e
«Remove». Server Actions con `getAdminUser()` e validazione `zod` (apertura < chiusura, fasce non sovrapposte, chiusure con data valida), rifiuto per
chi non è admin (e il test dell'elenco delle azioni lo impone, come per `reservations`). Una modifica aggiorna `updateTag('shop-schedule')`.

### Lettura (`lib/shop-schedule.ts`)
`getShopSchedule()` con `"use cache"` e tag `shop-schedule` (profilo `catalog`); funzioni pure `isOpenOn(schedule, day)`,
`hoursOn(schedule, day)` («09:00–13:00 e 14:00–19:00»), `closingTimeOn(schedule, day)`.

### Dove si applica
- **Selettore**: un giorno chiuso è oscurato (motivo `closed`) come primo o ultimo giorno. Per il giorno **in mezzo** ci si può passare (la bici resta al
  cliente): un giorno chiuso non si può toccare come estremo, ma il periodo può attraversarlo.
- **Server**: `checkStay` (`lib/booking/rules.ts`) rifiuta un primo o un ultimo giorno chiuso (`reason: 'closed_day'`, con il giorno), così un
  indirizzo scritto a mano non aggira il selettore. Il pannello (noleggio al banco) **non** è limitato.
- **Cliente**: nel riepilogo e in «Le tue prenotazioni» gli orari del giorno di ritiro e di riconsegna (vedi «Testi»).

## Testi (nelle due parti, tre lingue, tono «tu» come le altre pagine di prenotazione)
- Corregge «Ritiro in negozio all'apertura del primo giorno, riconsegna entro la chiusura dell'ultimo» (`rent.pickup_note`, `account.rents.pickup_note`,
  `terms.pickup_body`) in: *«Ritiro il lun 7 dic, entro le 19:00. Riconsegna il mar 8 dic, entro le 19:00. Le bici vanno ricaricate: non si riconsegnano
  il giorno dopo. Per accordi diversi, chiamaci.»* (le ore e i giorni dal calendario di orari quando c'è la parte B; prima, la frase senza le ore). Il tedesco
  segue «du» come le altre pagine di prenotazione: resta aperta la scelta «du/Sie» (in `STATE.md`).
- Etichette nuove: «non disponibile in queste date», legenda («giorno oscurato: il negozio è chiuso o non c'è una bici libera»), «vedi tutte le bici
  libere in questo periodo», nomi accessibili dei giorni.

## Privacy e cookie
Nessun dato nuovo, nessun cookie o storage, nessun servizio esterno: `lib/privacy-surface.test.ts` deve restare verde senza modifiche. Gli orari e le
chiusure sono dati del negozio, non di persone.

## Test (prima i test, poi il codice)
- **Unità** (`day-availability.test.ts`): il caso di Kevin della bici A (lun–mar) e B (mer–gio): un periodo lun–gio non è coprivibile; la fine massima da un
  giorno di partenza; bici ritirata nel mezzo; massimo di giorni della categoria; prima del primo giorno vendibile e oltre 180; nessuna bici libera; più unità.
  `shop-schedule.test.ts`: giorno senza fasce, chiusura che copre il primo/ultimo/mezzo, orari in ora legale/solare.
- **Componente** (`period-picker.test.tsx`): stato aperto e compatto, giorni oscurati con il loro motivo, i due tocchi, il secondo tocco sullo stesso giorno,
  ‹ giorno prima / giorno dopo › (anche quando il periodo spostato non è prenotabile), frecce tra i mesi a inizio e fine finestra.
- **Database** (`tests/db/busy-intervals.test.ts`): `held` e `confirmed` occupano, `expired`/`cancelled` no, i periodi si uniscono, la bici ritirata, solo
  modelli pubblicati; `tests/db/shop-schedule*.test.ts`; `checkStay` con orari. Il test sulle azioni del pannello include le nuove.
- **Browser** (a mano su un browser vero, in italiano, inglese e tedesco, a 320, 375 e 1440 px, senza scorrimento orizzontale): entrambi i modi, il selettore
  aperto e compatto, un giorno oscurato che non si lascia selezionare, il passaggio tra i modi con il periodo tenuto, il pagamento di prova fino in fondo.
- Il pagamento di Stripe e i test esistenti di `/rent` restano verdi.

## Fasi
**A** (`rent-page`): motore e dati → selettore → card per modello → i due modi → correzione dei testi sul ritiro. **B** (`shop-hours`): schema e migrazione → lettura
→ pannello → applicazione al selettore e a `checkStay` → testi con gli orari. Ognuna con il suo piano in `docs/superpowers/plans/`, una PR verso `staging`.

## Da confermare con Kevin
1. **Modelli non liberi nel modo per giornate**: li mostro spenti (assunzione mia: «vedere che modelli sono disponibili»); in alternativa si nascondono.
2. **Una fonte per gli orari**: oggi gli orari sul sito (home, mappa, dati strutturati) sono scritti a mano (`docs/contact-details.md`). La parte B parte dai
   valori di oggi e **non** li sostituisce; vuoi che home e mappa leggano la stessa tabella (un lavoro in più, poi si cambia in un posto solo)?
3. **Mancato ritiro**: cosa succede se il cliente non ritira entro la chiusura del primo giorno? È una delle voci dei termini ancora senza decisione.
4. **Limite dei giorni nel modo per giornate**: ogni categoria ha il suo `maxRentalDays`; nel modo per giornate un periodo lungo spegne i modelli che non lo
   permettono («al massimo N giorni»), come oggi.
5. **La navigazione**: il selettore è un mese che si richiude in una riga con ‹ giorno prima / giorno dopo › (consigliato per questa spec). Alternative scartate:
   la sola striscia di una settimana e una matrice modelli × giorni.
