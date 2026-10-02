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
- **Pagina pubblica: si prenota al massimo 180 giorni da oggi**, come nel calendario originale
  di Kevin (`MAX_DAYS`). Il limite vale solo per la pagina pubblica, non per il pannello.
- **Nulla di tutto questo va in produzione finché non è pronto** (vedi «Rilascio»).

---

## Obiettivo della fetta 1

Un calendario nel pannello dove Kevin vede, per ogni bici fisica, quando è occupata, e dove può
registrare un noleggio al banco, annullarlo, spostarlo su un'altra bici e pianificare la
manutenzione di una bici, con data di inizio e di fine. È la base di dati e di regole su cui poggiano tutte le fette successive; da sola è già
utile a Kevin, e non è visibile al pubblico.

### Dentro questa fetta

- La tabella `bike_reservations` e il vincolo che impedisce le doppie assegnazioni
- La pagina `/manage/bookings` con la vista a griglia bici × giorni
- Noleggio al banco: crea (con assegnazione automatica della bici), annulla, sposta su un'altra bici
- Manutenzione di una bici con data di inizio e di fine (anche modifica e annullamento)
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

**Manutenzione con data di inizio e di fine** (Kevin, 2026-10-02). Una prima versione
prevedeva il fuori servizio *senza* fine, «finché non la riattivi»; Kevin l'ha corretta: una
bici senza fine resterebbe bloccata per sempre, e nessuno potrebbe prenotarla nemmeno per
l'anno prossimo mentre in realtà è ferma solo per qualche giorno. La manutenzione è quindi un
intervallo come un noleggio, con primo e ultimo giorno compresi, e `ends_on` non è mai nullo.

**Il periodo di manutenzione si sceglie su giorni liberi.** Il selettore di date disabilita i
giorni in cui quella bici ha già una prenotazione e non permette di attraversarli (`disabled`
ed `excludeDisabled` di `react-day-picker` in modalità intervallo, verificato nella 10.0.2).
Se per fermare la bici servono giorni già prenotati, Kevin sposta prima quei noleggi su altre
bici: non si annullano mai prenotazioni di nascosto. Il database resta l'ultima parola: se
due azioni si incrociano, il vincolo rifiuta e l'azione restituisce l'elenco dei noleggi in
conflitto (data e nome).

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
su una colonna generata, e con `WHERE status = 'confirmed'` (una riga annullata non blocca).
È stato provato anche con un intervallo aperto (`ends_on` nullo), ma il disegno non lo usa più.

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
  ends_on      date         not null; esclusivo         (modo 'string' in Drizzle)
  during       daterange    generata: daterange(starts_on, ends_on, '[)'), stored
  label        text         null: nome o nota libera
  created_at   timestamp    not null, defaultNow()

  EXCLUDE USING gist (bike_unit_id extensions.gist_uuid_ops WITH =, during WITH &&)
          WHERE (status = 'confirmed')

  CHECK  ends_on > starts_on                              (mai un intervallo vuoto)
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
4. **Pianifica manutenzione** — riga `maintenance` per una bici, con primo e ultimo giorno
   compresi (convertiti in `starts_on` e `ends_on` esclusivo) e un motivo facoltativo in
   `label`. Se la bici ha righe `confirmed` che si sovrappongono, l'azione rifiuta e
   restituisce l'elenco.
5. **Modifica o annulla la manutenzione** — cambia le date (stesse regole e stesso vincolo:
   per chiuderla prima o allungarla) oppure la passa a `cancelled`.

Tutte le letture del pannello sono dal vivo, senza `'use cache'`: i dati del calendario devono
essere esatti, non «entro 10-30 secondi».

**Nessun limite di anticipo né di durata nel pannello.** Il pannello controlla solo che le date
siano valide e che la fine segua l'inizio (in `lib/dates.ts`): Kevin può registrare un noleggio
o una manutenzione in qualunque data futura. I limiti della prenotazione online sono un'altra
cosa e valgono **solo per la pagina pubblica** (fetta 3), ripresi dal calendario originale di
Kevin (`C:\AzureDevOps\firebase\app\rent\`): prenotabile fino a **180 giorni da oggi**
(`MAX_DAYS = 180`). Quel prototipo limita anche la lunghezza dell'intervallo
(`differenceInDays > 7`, cioè fino a 8 giorni compresi): se tenerla, e come si accorda ai giorni
del listino (da 1 a 7, più una tariffa a giorno per le bici classiche), lo decide la spec della
fetta 3. Questa fetta non implementa nessuno dei due limiti.

«Oggi» si calcola sempre in `Europe/Rome` con `@date-fns/tz`, mai con `new Date()` nudo: il
server Vercel gira in UTC e dopo le 22 a Roma vedrebbe già il giorno dopo.

---

## Il pannello

Nuova voce **«Bookings»** (icona `CalendarDays`) nel gruppo «Bikes» di
`components/admin/admin-sidebar.tsx`, pagina `/manage/bookings`. Il pannello non è mai
tradotto: etichette in inglese.

- **Vista a griglia**: righe = bici fisiche, raggruppate per modello (nome, taglia, versione e
  i primi 8 caratteri dell'id, come in `bike-unit-list.tsx`); colonne = giorni del mese.
  Noleggi e manutenzioni colorati in modo distinguibile. Il mese sta nell'URL
  (`?month=2026-07`).
- **Dettaglio**: un clic su un blocco apre un pannello con le azioni (annulla, sposta, modifica
  le date di una manutenzione).
- **Nuovo noleggio**: modulo con modello → taglia → versione (le opzioni vengono da
  `getPublishedModelsWithAllowedOptions()`, già usata dal modulo «Shop»), intervallo con il
  calendario di shadcn (`react-day-picker`) e nome.
- **Nuova manutenzione**: parte da una bici (dalla griglia o dalla lista «Shop»); intervallo con
  il calendario di shadcn che disabilita i giorni già prenotati di quella bici e un motivo
  facoltativo.
- **Lista «Shop»** (`/manage/bikes/shop`): per ogni bici, `Maintenance until <data>` quando c'è
  una manutenzione in corso, o `Maintenance from <data>` se è la prossima in programma.

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
