# Categorie percorso e collegamento col catalogo bici — design

## Il problema

`routes.bikeTypes` (il tipo di terreno per cui un percorso è adatto) e
`bike_categories` (il catalogo bici, con relative tariffe) parlano due lingue
diverse, e oggi non esiste alcun modo di sapere quali bici del catalogo
servono a fare un dato giro — la card "bici adatte a questo giro" richiesta
in ROADMAP.md non ha dati su cui appoggiarsi.

Verificato sui dati reali di produzione prima di disegnare qualunque cosa:

**Categorie bici (7)**: `eMTB Front`, `eMTB Full • Alu`, `eMTB Full • Carbon`,
`Gravel`, `City eBike`, `City Bike`, `MTB`.

**Tipi bici sui percorsi (5, in uso)**: `eMTB`, `MTB`, `Gravel`, `E-Gravel`,
`E-City Bike`. Non sono testo libero: sono una costante fissa nel codice
(`BIKE_TYPES`, duplicata in `route-filters.tsx` e `route-form.tsx`), che ne
contiene anche due mai usati e senza controparte nel catalogo (`Road Bike`,
`E-Road Bike`).

Il disallineamento non è di battitura, è strutturale:
- `Gravel` e `MTB` combaciano già
- `E-City Bike` (percorsi) e `City eBike` (categorie) sono lo stesso concetto
  scritto diverso
- `eMTB` (percorsi) dovrebbe corrispondere a *tre* categorie insieme — un
  percorso non ha motivo di sapere se serve il telaio alluminio o carbonio,
  quella distinzione esiste solo per il listino prezzi
- `E-Gravel` (percorsi) non ha ancora nessuna categoria bici corrispondente:
  non è un bug, il catalogo non ha ancora una gravel elettrica

## Decisioni prese con Kevin

- **Le categorie percorso diventano una tabella vera, modificabile
  dall'admin** — non più una costante nel codice. Stesso pattern CRUD già
  in uso per `bike_categories`/`bike_sizes`/`bike_versions` in
  `/manage/bike-options`.
- **Il raggruppamento fra le tre eMTB si fa con un campo dedicato**, non
  per corrispondenza di prefisso sul nome — un rename di categoria non deve
  poter rompere in silenzio l'abbinamento coi percorsi.
- **Sul lato bici si mostra solo un'etichetta col terreno/stile** (stessa
  relazione letta al contrario, nessuna query nuova) — non anche una card
  "percorsi adatti a questa bici": è il contrario esatto della card che si
  sta costruendo, raddoppierebbe lo scope. Rimane un'idea per un secondo
  giro, non decisa qui.

## Architettura

**Nuova tabella `route_bike_categories`**: `id`, `name`, `displayOrder` —
stessa forma di `bike_versions`. Amministrata da una quarta scheda "Route
categories" in `/manage/bike-options`, stesso pattern CRUD (lista + form +
tre server action) già usato per le altre tre.

**`bike_categories` riceve `routeCategoryId`**, FK opzionale verso
`route_bike_categories`. Opzionale perché non ogni categoria di prezzo ha
un motivo di comparire nei percorsi (`City Bike` oggi non ne ha uno).
Modificabile dal form esistente della categoria bici, con una select
popolata da `route_bike_categories`.

**Seed dai dati reali, non inventato**: la nuova tabella nasce con i 5
valori già in uso dai percorsi in produzione (`eMTB`, `MTB`, `Gravel`,
`E-Gravel`, `E-City Bike`) — così nessun percorso esistente perde il
proprio tag, e la lista di checkbox nel form (ora dinamica) contiene fin
da subito solo valori realmente usati, senza bisogno di logiche per
preservare valori orfani. `Road Bike`/`E-Road Bike` restano fuori: mai
usati, mai avuto una categoria.

Collegamento iniziale (backfill sulle 7 categorie esistenti):

| Categoria bici | → Categoria percorso |
|---|---|
| `eMTB Front` | `eMTB` |
| `eMTB Full • Alu` | `eMTB` |
| `eMTB Full • Carbon` | `eMTB` |
| `Gravel` | `Gravel` |
| `City eBike` | `E-City Bike` |
| `City Bike` | *(nessuna)* |
| `MTB` | `MTB` |

`E-Gravel` esiste come categoria percorso (i percorsi la usano già) ma non
ha ancora nessuna categoria bici collegata — corretto: il catalogo non ha
ancora una gravel elettrica, la card mostrerà semplicemente nessuna bici
per quei percorsi, che è la verità.

**`routes.bikeTypes` non cambia forma**: resta `text[]`, continua a
contenere nomi di categorie percorso. Cambia solo *da dove* il form admin e
il filtro pubblico prendono la lista di opzioni: non più la costante
`BIKE_TYPES`, ma `route_bike_categories` ordinata per `displayOrder`. Il
filtro pubblico (`route-filters.tsx`, oggi importa la costante direttamente
in un componente client) riceve la lista come prop dal componente server
che già la può leggere, invece di importarla.

**Nuova card "Bici adatte a questo giro"** nella pagina di dettaglio
percorso: per ogni tipo bici del percorso, trova le `bike_categories`
collegate a quel gruppo (via `routeCategoryId`), poi i `bike_models`
pubblicati in quelle categorie. Riusa `BikeCard`, nessun componente visivo
nuovo — la card semplicemente non appare se non c'è nessuna bici collegata
(comportamento già stabilito altrove nel sito per le sezioni senza dati).

**Etichetta terreno sul lato bici**: la card bici (`bike-card.tsx`) e il
dettaglio (`app/[lang]/bikes/[id]/page.tsx`) mostrano, quando
`category.routeCategoryId` è valorizzato, un secondo badge col nome della
categoria percorso collegata — accanto a quello già esistente con
`category.name` (la categoria di prezzo). Stessa relazione della card
percorsi→bici, letta al contrario, nessuna query aggiuntiva: il dato è già
nella riga di `bike_categories` che la pagina carica comunque.

## Cosa NON cambia

- Nessuna card "percorsi adatti a questa bici" — deliberatamente fuori
  scope, vedi sopra.
- `routes.bikeTypes` resta un array di testo, non diventa una relazione:
  la card di suggerimento fa il join a runtime tramite i nomi, non serve
  normalizzare anche quel lato per ottenere il risultato voluto.
- `BikeTypeIcon`/`bikeTypeBadgeClass` (icone e stile dei badge tipo-bici
  sui percorsi) restano invariati: le chiavi che già gestiscono
  (`eMTB`, `MTB`, `Gravel`, `E-Gravel`, `E-City Bike`) sono esattamente i
  valori con cui si popola la nuova tabella.

## Alternative scartate

- **Corrispondenza per prefisso del nome invece di un campo gruppo** —
  scartata da Kevin: implicita, si rompe in silenzio rinominando una
  categoria senza rispettare la convenzione.
- **Nessun raggruppamento: un percorso specifica la categoria eMTB esatta**
  — più lavoro per chi carica i percorsi, e nella pratica probabilmente
  arbitrario: un percorso non ha un motivo reale per preferire il telaio
  alluminio a quello carbonio.
- **Riusare/reinterpretare `bike_categories.name` come tipo-terreno**
  invece di aggiungere una tabella e un campo dedicati — scartata dopo aver
  verificato i dati reali: sono davvero due concetti diversi (terreno vs
  categoria di prezzo), forzarli nello stesso campo avrebbe rotto il
  listino prezzi esistente.
- **Card "percorsi adatti a questa bici" inclusa subito** — non scartata,
  solo rimandata: raddoppierebbe lo scope di questa spec. Kevin la vuole
  per un giro successivo — vedi ROADMAP.md, "Un giorno". I dati per
  costruirla ci sono già una volta fatto questo lavoro: stessa relazione
  `bike_categories.routeCategoryId`, letta nella direzione opposta.
