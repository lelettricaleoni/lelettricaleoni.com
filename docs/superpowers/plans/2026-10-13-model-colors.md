# Un colore per ogni modello di bici (primo uso: Google Calendar)

> **Da approvare, non iniziato** (Kevin, 2026-10-13: «poter assegnare, e che venga anche assegnato automaticamente un colore ad ogni modello di bici, a scopo organizzativo; il primo
> posto in cui voglio usarlo è Google Calendar: ogni modello inserito ha il suo colore»). `[ ]` da fare, `[~]` in corso, `[x]` fatto.
> Va su un **ramo a parte** (`feat/model-colors`, da `staging`), con una migrazione: non si mescola con la pagina di prenotazione. Solo `staging`, mai produzione.
> Privacy: nessun dato di persone. Il colore non entra in nessun testo del sito pubblico.

## Cosa c'è già (letto nel codice)
- L'evento su Google nasce da `wantedEvent()` (`lib/integrations/google-calendar/events.ts`), funzione pura. Ha **già** un `colorId`: la manutenzione usa il grafite (`'8'`).
  I noleggi non hanno colore e prendono quello del calendario.
- Chi legge le prenotazioni per il calendario è `lib/integrations/google-calendar/data.ts` (una query con il modello, la taglia e la versione della bici): basta aggiungere il colore del modello.
- «Sync now» e il controllo giornaliero rifanno **ogni** evento della finestra (`reconcile` → `applyReservation`), quindi un colore cambiato si propaga da solo; dopo il salvataggio di un modello si può rilanciare
  subito la sincronizzazione delle sue prenotazioni, come già si fa per un cliente modificato (`syncCustomerReservations`).
- `bike_models` non ha nessuna colonna di colore (ultima migrazione: `0025`).

## Un limite di Google da sapere
Un evento di Google Calendar accetta **solo uno degli 11 colori fissi** (`colorId` da 1 a 11: lavanda, salvia, uva, fenicottero, banana, mandarino, pavone, grafite, mirtillo, basilico, pomodoro), **non un colore a scelta**.
Quindi la tavolozza del sito è quella: **10 colori** (il grafite resta alla manutenzione). Con più di 10 modelli i colori si ripetono (si assegna sempre il meno usato). Oggi in produzione i modelli sono 10.

## Proposta
- Colonna `bike_models.color` (testo, **chiave** della tavolozza, p.es. `lavender`, non l'esadecimale né il numero di Google), con un controllo del database sui valori ammessi. Un solo file nel codice
  (`lib/bike-colors.ts`) lega ogni chiave al suo `colorId` di Google e al colore da mostrare nel pannello.
- **Assegnazione automatica**: alla creazione di un modello prende il colore **meno usato** (a parità, il primo della tavolozza); i modelli esistenti si riempiono nella migrazione, nell'ordine dei modelli.
- **Assegnazione a mano**: nel modulo del modello, una fila di campioni di colore (rettangoli con angoli arrotondati, il scelto con un segno), con l'etichetta del nome del colore.
- **Google**: `wantedEvent` mette `colorId` = quello del modello per i noleggi (banco e online); la manutenzione resta grafite.
- **Pannello**: un pallino del colore accanto al nome nell'elenco dei modelli e davanti alla riga della bici nel calendario `/manage/bookings` (secondo uso, facoltativo).

## Compiti
- [ ] Risposte di Kevin alle domande in fondo.
- [ ] `lib/bike-colors.ts`: tavolozza di 10 voci (chiave, nome, `colorId`, colore del pannello) + `nextColor(used: string[])` + test (meno usato, a parità il primo, oltre le 10 si ripete).
- [ ] Migrazione `0026` (`npx drizzle-kit generate`, `npm run db:migrate`, solo sviluppo): colonna `color` con `CHECK`, riempimento dei modelli esistenti nell'ordine `display_order`. Test del database sul vincolo.
- [ ] Azioni dei modelli (`lib/actions/bike-models.ts`): creare assegna `nextColor`; salvare accetta `color` (validato con `zod` contro la tavolozza); `updateTag('bike-models')`.
- [ ] Modulo del modello (`components/admin/bike-model-form.tsx`): selettore dei campioni.
- [ ] `data.ts` legge il colore del modello; `events.ts`: `colorId` per i noleggi + test (noleggio colorato, manutenzione grafite, modello senza colore → nessun `colorId`).
- [ ] Dopo il salvataggio di un modello con colore cambiato: `after()` → risincronizza le sue prenotazioni confermate non finite (come `syncCustomerReservations`), senza mai far fallire il salvataggio.
- [ ] **Prova dal vivo** contro il calendario vero (`live.test.ts`, `LIVE_GOOGLE_CALENDAR=1`): creare un evento con `colorId`, rileggerlo, e confrontare i 10 colori con quelli che dà l'API dei colori (`colors.get`) per avere i valori giusti nel pannello.
- [ ] Pannello: pallino nell'elenco dei modelli (e, se Kevin vuole, nel calendario delle prenotazioni).
- [ ] Controllo a occhio: modulo (320/1440), calendario Google aperto con due modelli di colore diverso, e il cambio di colore che ripassa gli eventi.
- [ ] `STATE.md` (due righe: la tavolozza è quella di Google; il grafite è della manutenzione) e `prenotazioni-punti-aperti.md`.

## Domande per Kevin
1. **Tavolozza** di 10 colori di Google (il grafite resta alla manutenzione, così si distingue sempre): va bene? Se un domani i modelli superano 10, i colori si ripetono.
2. I **noleggi online** e quelli **al banco** dello stesso modello hanno lo **stesso** colore (consigliato: il colore dice «quale bici», la differenza online/banco è già nel titolo e nel pannello)?
3. **Dove altro** lo vuoi, oltre a Google: pallino nell'elenco dei modelli (consigliato), righe del calendario del pannello, o per ora solo Google?
4. Cambiando il colore di un modello, vuoi che **ripassi anche gli eventi già passati**? (Consigliato: solo quelli non finiti; «Sync now» ripassa il resto.)
