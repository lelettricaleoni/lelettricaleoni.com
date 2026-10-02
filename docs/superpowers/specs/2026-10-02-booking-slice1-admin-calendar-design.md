# Design Spec — Prenotazioni, fetta 1: calendario e stato delle bici nel pannello

**Data**: 2026-10-02
**Stato**: bozza, da approvare da Kevin
**Dove vive il codice**: branch `staging` (vedi «Rilascio»). Questa spec e gli altri documenti
stanno su `main`: sono documentazione, non comportamento del sito.

---

## Il sistema di prenotazioni e le sue fette

Obiettivo generale (già in `docs/superpowers/specs/2026-09-17-bike-models-and-inventory-design.md`,
«primo passo verso un futuro sistema di prenotazioni»): prenotare online le bici con
disponibilità reale e pagamento Stripe, con un profilo cliente.

È troppo grande per una spec sola. Cinque fette indipendenti, ognuna con la sua spec e il suo
piano, nell'ordine in cui si costruiscono:

1. **Calendario e stato delle bici nel pannello** ← questa spec
2. Account cliente e login unificato (oggi `/manage/login` e `/[lang]/login` sono separati)
3. Prenotazione dal sito: pagina pubblica con la disponibilità, Stripe, annullamenti e rimborsi
4. Email e promemoria dal worker (la skill `react-email` è già nel repo)
5. Appuntamenti di riparazione

### Decisioni di Kevin valide per tutto il sistema (2026-10-02)

- **Conferma immediata**, con pagamento **intero** su Stripe (non un acconto, non una richiesta).
- **Rimborso intero fino a 48 ore prima**; oltre quel termine niente, ma Kevin può decidere a
  mano caso per caso (per esempio maltempo).
- **Solo giorni interi**: nessun pomeriggio, nessun orario, in prenotazione online.
- **Account obbligatorio** per prenotare.
- **I noleggi fatti di persona si registrano nel pannello**, nello stesso calendario: solo così
  la disponibilità online è vera.
- **Una prenotazione occupa una bici fisica precisa** per un intervallo di date, e il database
  impedisce le sovrapposizioni.
- **Il posto si tiene 30 minuti durante il pagamento** (il minimo di una sessione Stripe
  Checkout) e poi si libera.
- **Nulla di tutto questo va in produzione finché non è pronto** (vedi «Rilascio»).

---

## Obiettivo della fetta 1

Un calendario nel pannello dove Kevin vede, per ogni bici fisica, quando è occupata, e dove può
registrare un noleggio al banco, annullarlo, spostarlo su un'altra bici e mettere una bici fuori
servizio. È la base di dati e di regole su cui poggiano tutte le fette successive; da sola è già
utile a Kevin, e non è visibile al pubblico.

### Dentro questa fetta

- La tabella `bike_reservations` e il vincolo che impedisce le doppie assegnazioni
- La pagina `/manage/bookings` con la vista a griglia bici × giorni
- Noleggio al banco: crea (con assegnazione automatica della bici), annulla, sposta su un'altra bici
- Fuori servizio senza data di fine, e riattivazione
- La libreria di date del progetto (`date-fns` 4 + `@date-fns/tz`) e `lib/dates.ts`

### Fuori da questa fetta

- Pagina pubblica con la disponibilità (fetta 3)
- Account e profilo cliente (fetta 2)
- Stripe, annullamenti con rimborso, la testata `bookings` che raggruppa le bici di un pagamento
  (fetta 3)
- Email e promemoria (fetta 4)
- Appuntamenti di riparazione (fetta 5)
- Prezzi e importi: il noleggio al banco **non registra importi**, il listino resta com'è
- Sincronizzazione con Google Calendar (idea del repo di prova, non richiesta)

---

## Decisioni di questa fetta, e perché

**Una tabella sola, per ora.** `bike_reservations`: una riga per bici e per periodo, con un
tipo (`counter_rental` o `maintenance`). Il disegno completo prevedeva una testata `bookings`
(un pagamento) più righe per bici, ma oggi non c'è nulla da raggruppare: la testata arriva con
i pagamenti, come migrazione aggiuntiva che aggiunge `booking_id` (nullabile) a questa tabella.
Costo accettato: una migrazione in più più avanti; beneficio: niente tabelle vuote ora.

**Il vincolo sta nel database, non nel codice.** Un vincolo di esclusione Postgres rifiuta due
righe `confirmed` sulla stessa bici con date sovrapposte. È stato provato (spike del 2026-10-02,
sotto) contro richieste concorrenti vere. Il codice deve però **ritentare** quando perde la
gara (errore `23P01`): senza il ciclo, richieste che avevano bici libere verrebbero respinte.

**Due colonne `date`, non un `daterange` letto a mano.** Si salvano `starts_on` e `ends_on`
come date di calendario (stringhe `YYYY-MM-DD` nel codice, regola di `CLAUDE.md`), e
l'intervallo per il vincolo è una colonna generata. Così nessuno deve interpretare in
JavaScript una stringa come `[2026-07-10,2026-07-13)`.

**La fine è esclusiva, nel database, e inclusiva per chi la legge.** Un noleggio dal 10 al 12
compreso è `starts_on = 2026-07-10`, `ends_on = 2026-07-13`. Chi riconsegna il 12 libera la
bici per chi ritira il 13: nessun conflitto. Il pannello mostra e chiede l'ultimo giorno
compreso; la conversione sta in `lib/dates.ts` e in nessun altro punto.

**Fuori servizio senza data di fine** (Kevin, 2026-10-02: «finché non la riattivi»).
`ends_on` è `NULL`, cioè l'intervallo è aperto verso il futuro; «riattiva» valorizza `ends_on`
con il giorno scelto. Rischio accettato: una bici dimenticata resta nascosta ai clienti. Per
questo la lista delle bici mostra **«fuori servizio da N giorni»**.

**Mettere fuori servizio una bici con noleggi futuri viene rifiutato**, con l'elenco dei
noleggi in conflitto (data e nome): Kevin li sposta prima su altre bici. Non si annullano mai
prenotazioni di nascosto.

**Annullare non cancella.** Lo stato passa a `cancelled`; il vincolo vale solo per le righe
`confirmed`, quindi le date tornano libere ma lo storico resta. Un rimborso futuro (fetta 3)
avrà così a cosa riferirsi.

**Noleggio al banco: solo bici, date e nome** (Kevin, 2026-10-02). Il campo `label` è un
nome o una nota libera, non un cliente: niente telefono, email o importo. Per una riga
`maintenance` può contenere il motivo.

**Il sistema assegna la bici**; Kevin sceglie modello, taglia e versione. Per gli scambi al
banco c'è l'azione «sposta», che propone prima le bici libere dello stesso modello e taglia.

**Non si elimina una bici con prenotazioni.** `bike_reservations.bike_unit_id` non ha
`onDelete` (come le altre chiavi di `bike_units`): `deleteBikeUnitAction` deve trasformare
l'errore di chiave esterna in un messaggio comprensibile.

---

## Prove fatte prima di scrivere (2026-10-02, database di sviluppo, poi ripulito)

**Spike di concorrenza**, con le opzioni del client del sito (`max: 3`, `prepare: false`,
`max_pipeline: 0`) e il pooler in transaction mode: 15 controlli su 15.

- 1 bici, 20 richieste insieme: passa 1.
- 5 bici, 20 richieste da 6 «istanze» diverse: passano 5, una per bici. Si sono visti 3 conflitti
  del vincolo (più richieste che sceglievano la stessa bici nello stesso istante), tutti risolti
  ritentando: senza il ciclo di tentativi quelle richieste sarebbero state respinte pur con bici
  libere.
- Un posto tenuto e scaduto blocca la bici finché non viene rilasciato; con un `UPDATE`
  separato di rilascio prima dell'assegnazione si libera, anche con 10 richieste in concorrenza.
- Intervalli `[inizio, fine+1)`: ritiro il giorno dopo la riconsegna non confligge.

**Verifiche sul modello dati reale**: il vincolo funziona su `uuid` (`bike_units.id` lo è),
con un intervallo aperto (`ends_on` nullo), su una colonna generata, e con `WHERE status =
'confirmed'` (una riga annullata non blocca).

L'estensione `btree_gist` è disponibile sia sul database di sviluppo sia su quello di
produzione, ma **non installata** su nessuno dei due: la prima migrazione la crea.

---

## Modello dati

Convenzioni: come `lib/db/schema.ts` esistente (Drizzle, `uuid` con `defaultRandom()`,
`timestamp` per i campi di audit).

```
bike_reservations
  id           uuid         pk, defaultRandom()
  bike_unit_id uuid         not null → bike_units.id   (nessun onDelete)
  kind         enum         'counter_rental' | 'maintenance'
  status       enum         'confirmed' | 'cancelled'
  starts_on    date         not null                    (modo 'string' in Drizzle)
  ends_on      date         null = aperto; esclusivo    (modo 'string' in Drizzle)
  during       daterange    generata: daterange(starts_on, ends_on, '[)'), stored
  label        text         null: nome o nota libera
  created_at   timestamp    not null, defaultNow()

  EXCLUDE USING gist (bike_unit_id extensions.gist_uuid_ops WITH =, during WITH &&)
          WHERE (status = 'confirmed')

  CHECK  ends_on IS NULL OR ends_on > starts_on
  CHECK  kind = 'maintenance' OR ends_on IS NOT NULL      (un noleggio ha sempre una fine)
```

- Drizzle non genera i vincoli di esclusione né le colonne generate di tipo `daterange`: come
  per il CHECK della tabella `media` (spec del 2026-09-17), vanno **scritti a mano nel SQL della
  migrazione**, insieme a `create extension if not exists btree_gist with schema extensions`.
- La migrazione si applica con `npx drizzle-kit generate` e `npm run db:migrate`
  (`.claude/skills/db-migrations/`): su **Preview** durante lo sviluppo, su produzione solo al
  rilascio.
- `starts_on` e `ends_on` sono `date`, mai `timestamp`: nessun fuso orario da gestire.

---

## Regole e flussi

Tutto passa da **Server Action** (non route handler), ognuna con `requireAdmin()` come le altre
di `lib/actions/`, validazione con `zod` (`z.iso.date()`, `z.uuid()`), e **senza
`db.transaction`** (`max_pipeline: 0`): ogni operazione è un solo statement.

1. **Crea un noleggio al banco** — input: modello, taglia, versione, primo e ultimo giorno
   compreso, nome. Un solo `INSERT … SELECT` sceglie la prima bici libera di quel modello,
   taglia e versione. Se il vincolo risponde `23P01` si ritenta (fino a 8 volte, come nello
   spike); se non ci sono bici libere l'errore dice «nessuna bici libera in queste date».
2. **Annulla** — `status = 'cancelled'`.
3. **Sposta** — cambia `bike_unit_id` di una riga `confirmed`; se la nuova bici non è libera il
   vincolo rifiuta e l'azione lo dice.
4. **Metti fuori servizio** — riga `maintenance`, `starts_on` = oggi in `Europe/Rome` (o una data
   scelta), `ends_on` nullo. Se la bici ha righe `confirmed` che si sovrappongono, l'azione
   rifiuta e restituisce l'elenco.
5. **Riattiva** — valorizza `ends_on` con il giorno scelto. Se quel giorno non è successivo a
   `starts_on` (bici messa fuori servizio e riattivata lo stesso giorno) l'intervallo sarebbe
   vuoto e il `CHECK` lo vieta: in quel caso la riga `maintenance` passa a `cancelled`.

Tutte le letture del pannello sono dal vivo, senza `'use cache'`: i dati del calendario devono
essere esatti, non «entro 10-30 secondi».

Un controllo di sensatezza sulle date (la fine non precede l'inizio, intervallo di al massimo
366 giorni per un noleggio) sta in `lib/dates.ts`; il 366 è una scelta di questa spec, non una
regola di Kevin: da confermare.

«Oggi» si calcola sempre in `Europe/Rome` con `@date-fns/tz`, mai con `new Date()` nudo: il
server Vercel gira in UTC e dopo le 22 a Roma vedrebbe già il giorno dopo.

---

## Il pannello

Nuova voce **«Bookings»** (icona `CalendarDays`) nel gruppo «Bikes» di
`components/admin/admin-sidebar.tsx`, pagina `/manage/bookings`. Il pannello non è mai
tradotto: etichette in inglese.

- **Vista a griglia**: righe = bici fisiche, raggruppate per modello (nome, taglia, versione e
  i primi 8 caratteri dell'id, come in `bike-unit-list.tsx`); colonne = giorni del mese.
  Noleggi e fuori servizio colorati in modo distinguibile. Il mese sta nell'URL
  (`?month=2026-07`).
- **Dettaglio**: un clic su un blocco apre un pannello con le azioni (annulla, sposta,
  riattiva).
- **Nuovo noleggio**: modulo con modello → taglia → versione (le opzioni vengono da
  `getPublishedModelsWithAllowedOptions()`, già usata dal modulo «Shop»), intervallo con il
  calendario di shadcn (`react-day-picker`) e nome.
- **Lista «Shop»** (`/manage/bikes/shop`): per ogni bici, l'etichetta «fuori servizio da N giorni»
  quando c'è una riga `maintenance` aperta.

**La vista a griglia non è ancora decisa a livello di componente.** Per la regola «librerie
prima del custom», il primo task del piano è cercare una libreria per una griglia risorse ×
giorni adatta, libera e compatibile con React 19; se non ce n'è una, la griglia si costruisce su
`date-fns` e shadcn. Il calendario di Kevin (`C:\AzureDevOps\firebase`, `app/rent/`) è un
selettore di intervallo per il lato pubblico: serve alla fetta 3, non a questa.

---

## Test

- **Unit** (vitest): `lib/dates.ts` (conversione fine inclusiva ↔ esclusiva, «oggi» a Roma a
  cavallo di mezzanotte UTC, controlli di sensatezza) e le regole pure delle azioni.
- **Concorrenza**: lo spike diventa un test automatico contro il database di Preview. Se la CI
  non può raggiungerlo (oggi i check «non toccano Supabase»), diventa uno script documentato
  da lanciare a mano prima di ogni migrazione su produzione: lo decide il piano.
- **Browser**: se il pannello ha già un percorso di test con login, una prova della pagina; in
  caso contrario il piano lo dice esplicitamente invece di far finta.

---

## Rilascio

Tutto il codice del sistema di prenotazioni va su **`staging`**, con PR verso `staging`. I
deploy di quel branch usano l'ambiente Preview, con database e bucket propri, su
`staging.lelettricaleoni.com`. La migrazione si applica al database di Preview; **a quello di
produzione solo quando si unisce `staging` a `main`**, con una sola PR a lavoro finito.

### Domanda aperta per Kevin

La fetta 1 è solo pannello, quindi invisibile al pubblico. Potrebbe andare in produzione **prima
del resto**, così Kevin comincia a registrare i noleggi veri e il calendario è già popolato
quando si aprono le prenotazioni online. Contro: va contro «nulla in produzione finché non è
pronto», e la migrazione arriva in produzione prima del tempo. Decisione di Kevin, da prendere
prima del piano.

---

## Riferimenti

- `docs/superpowers/specs/2026-09-17-bike-models-and-inventory-design.md` (bici fisiche, categorie
  e prezzi)
- `docs/ai/ROADMAP.md`, voce «Sistema di prenotazioni» (decisioni e convenzioni sulle date)
- `C:\AzureDevOps\firebase` (prove di Kevin: calendario di selezione, Stripe di prova)
- `lib/db/client-options.ts` (perché niente transazioni e come si costruisce il client)
