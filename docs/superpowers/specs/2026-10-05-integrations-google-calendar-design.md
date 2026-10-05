# Integrazioni nel pannello e Google Calendar — disegno

> Stato: **bozza da rivedere** (Kevin, 2026-10-05; aggiornata lo stesso giorno: tutto in inglese e guida sempre nel
> pannello). Nessun codice scritto. Prima fetta del lavoro sulle
> integrazioni; la fetta 2 delle prenotazioni (account cliente, login con Google) ci passa dopo.

## Obiettivo

1. Una sezione **Integrations** nel pannello, nello stile di quella di Vercel: un **catalogo** con tutte le
   integrazioni, ognuna con la **sua pagina** (spiegazione, pulsante per abilitarla, guida passo passo, impostazioni).
2. La prima integrazione è **Google Calendar**: ogni noleggio e manutenzione registrati nel pannello compaiono come
   evento in un calendario Google, in una sola direzione (pannello → Google). Si configura **tutta dal pannello**:
   la chiave dell'account di servizio si carica lì e sta nel database **cifrata**.

Il calendario del pannello resta la fonte di verità; Google è una vista.

## Fuori scopo (apposta)

- Sincronizzazione nell'altra direzione (modificare un evento in Google non cambia il pannello).
- Un calendario per ogni bici, e le disponibilità pubbliche per i clienti.
- Accesso con il proprio account Google (OAuth): si usa un **account di servizio**, la cui chiave non scade.
- Le altre integrazioni (Stripe, Resend, accesso dei clienti con Google): il catalogo è fatto per accoglierle, ma
  ognuna ha il suo disegno quando arriva.

## Il catalogo (`/manage/integrations`)

- Voce **Integrations** nella barra laterale, gruppo *System*.
- Una **griglia di card**: icona, nome, riga di descrizione, **stato** (*Not enabled* / *Enabled* / *Needs attention*).
  Clic sulla card = pagina dell'integrazione.
- Le integrazioni sono un **registro nel codice** (`lib/integrations/registry.ts`: id, nome, descrizione, icona,
  categoria, schema delle impostazioni). Aggiungerne una è una riga nel registro più la sua pagina. Oggi il registro ne
  ha una sola (Google Calendar); non mostro schede «prossimamente» finché non esistono (scelta di default, vedi domande).

## La pagina di un'integrazione (`/manage/integrations/[id]`)

Intestazione con icona, nome e stato, e il pulsante **Enable** / **Disable**. Sotto, quattro schede:

| Scheda | Cosa contiene |
|---|---|
| **Overview** | Cosa fa, quali dati partono verso il servizio esterno, cosa non fa. Il pulsante **Enable** la avvia. |
| **Setup guide** | Il tutorial passo passo (sotto), con i link giusti e «cosa dovresti vedere» a ogni passo. |
| **Settings** | Il modulo di configurazione (credenziali, impostazioni, **Test connection**) **con la guida accanto**: vedi sotto. |
| **Activity** | Ultima sincronizzazione, ultimo errore, **Sync now**. |

**Cosa vuol dire «abilitare».** *Enable* porta alla guida e al modulo delle credenziali; l'integrazione risulta
**Enabled** solo dopo che *Test connection* è riuscito. *Disable* ferma la sincronizzazione e **tiene** la
configurazione; *Remove credentials* cancella la chiave. Se la chiave smette di funzionare (calendario non più
condiviso, chiave disattivata) lo stato diventa **Needs attention** con il motivo, e il pannello continua a funzionare.

## Dati

Tabella `integrations` (una riga per integrazione, RLS esplicito, nessuna policy: l'app si collega come `postgres`):

| Colonna | Cosa |
|---|---|
| `id` text, PK | l'id del registro, es. `google-calendar` |
| `enabled` boolean | acceso o no |
| `config` jsonb | impostazioni **non segrete** (id del calendario, e-mail dell'account di servizio, opzioni) |
| `secret_encrypted` text | il segreto cifrato (la chiave JSON), o nulla |
| `last_checked_at`, `last_sync_at` timestamp | per la scheda Activity |
| `last_error` text | l'ultimo errore, **mai** con pezzi del segreto |
| `updated_at`, `updated_by` | chi ha toccato per ultimo |

## Lingua e posizione della guida (deciso da Kevin, 2026-10-05)

- **Tutto in inglese**, guida compresa: è il pannello, e il pannello non si traduce mai (regola del progetto).
- **La guida vive nel pannello**, mai in un documento o in una pagina esterna, e **non sta solo in una scheda a parte**:
  nella scheda *Settings* è **accanto al modulo** (a sinistra i passi, a destra i campi; su telefono sopra i campi, in
  fisarmonica). Così si segue il passo e si compila il campo che gli corrisponde senza cambiare pagina.
- Ogni passo della guida ha un titolo, cosa fare, il link esatto in Google, e *«what you should see»*. I passi che
  corrispondono a un campo del modulo (carica la chiave, incolla l'ID del calendario) lo evidenziano; il passo si segna
  fatto da solo quando il campo è compilato e valido. L'ultimo passo è *Test connection*.
- Anche il modulo è in inglese: etichette, aiuti sotto ai campi, errori («The key file is not a service account key»,
  «The calendar is not shared with this service account», …).

## Cifratura

- **Libreria `jose`** (JWE, `alg: dir`, `enc: A256GCM`): cifratura autenticata fatta da una libreria collaudata, niente
  crittografia scritta a mano. `jose` è già nell'albero (5.10); diventa dipendenza diretta.
- Chiave: variabile d'ambiente **`INTEGRATIONS_ENCRYPTION_KEY`** (32 byte in base64) su Vercel (produzione e Preview)
  e in `.env.local`. **Un dump del database da solo non serve a nulla**. La chiave la genero io e la metto con la CLI
  senza mai stamparla. Il formato porta un `kid`, così una rotazione futura è possibile senza migrare tutto in un colpo.
- Il segreto si decifra **solo sul server** (`import 'server-only'`) e solo dentro le funzioni che parlano con Google.
  Non esce mai verso il browser: la pagina mostra l'e-mail dell'account di servizio e «chiave salvata ✓», niente di più.
  Per cambiarla si ricarica.
- Senza la variabile d'ambiente la pagina lo dice e **rifiuta di salvare** (non cade mai in chiaro per ripiego).
- Errori e log non contengono mai la chiave; il file caricato si valida con `zod` (`type: service_account`,
  `client_email`, `private_key`, `project_id`; dimensione massima 10 KB) e si butta subito dopo la cifratura.

## Google Calendar

**Guida passo passo** (in inglese, nel pannello: scheda *Setup guide* e accanto al modulo in *Settings*):
1. Crea un progetto su Google Cloud (o usa uno esistente).
2. Abilita la *Google Calendar API*.
3. Crea un **account di servizio** (nessun ruolo necessario).
4. Crea e scarica la sua **chiave in formato JSON**.
5. In Google Calendar crea il calendario «Noleggi» (o usa uno esistente) → *Impostazioni e condivisione* →
   *Condividi con persone specifiche* → aggiungi l'e-mail dell'account di servizio con permesso **«Apporta modifiche
   agli eventi»**.
6. Copia l'**ID del calendario** (*Integra calendario*).
7. Qui nel pannello: carica il JSON, incolla l'ID, premi **Test connection**.
8. Sul telefono: aggiungi il calendario al tuo account Google per vederlo.

**Test connection:** legge il calendario e crea e cancella un evento di prova; dice con parole chiare cosa non va
(chiave non valida, calendario non condiviso, API non abilitata).

**Impostazioni** (tutte nel modulo): ID del calendario; *Include customer phone in the event*; *Include maintenance*.
Un calendario solo. Chi lo vede si decide in Google, condividendolo.

**Evento:** di tutta la giornata, uno per noleggio o manutenzione (tre giorni = un evento di tre giorni; la fine
esclusiva di Google coincide con la nostra). Titolo `Mondraker Arid S · M · Mario Rossi` (manutenzione: `Maintenance ·
bici · motivo`), descrizione con il telefono se l'opzione è accesa. **Mai** importo né note private.

**Sincronizzazione:**
- **Idempotente.** L'id dell'evento deriva da quello della prenotazione (l'UUID senza trattini è un id valido per
  Google), quindi ripetere non crea doppioni. L'upsert prova `update`, poi `insert` se l'evento manca, e se l'insert
  dice «id già usato» (evento cancellato in Google) lo rimette in vita con `update` e `status: confirmed`.
- **Quando:** dopo crea, sposta, annulla, pianifica e modifica manutenzione, con `after()` di Next: **dopo** la risposta,
  senza far aspettare chi usa il pannello. Un annullamento cancella l'evento (404 o 410 sono un successo).
- **Se Google non risponde**, il noleggio si salva comunque; l'errore va in *Activity*, e **Sync now** (finestra: da
  ieri a 12 mesi avanti) più un controllo giornaliero con il cron di Vercel (il piano hobby ne dà uno al giorno)
  ricostruiscono ciò che manca. Nessuna coda, nessuna tabella in più.
- Un segno privato (`extendedProperties.private`: id prenotazione) marca gli eventi nostri: il controllo non tocca mai
  quelli che metti tu a mano nello stesso calendario.

## Sicurezza e accessi

- Pagine e azioni **solo admin** (`requireAdmin()` in ogni azione, come le altre), niente route handler tranne il cron
  (che si autentica con il segreto di Vercel).
- Staging usa un'altra riga di `integrations` (il suo database) e quindi un **altro calendario**, senza fare niente.
- I nomi dei clienti finiscono nel tuo Google Calendar: va nel contratto di noleggio, non sul sito.

## Come lo spezzo (una PR ciascuna, su `staging`)

1. **Struttura:** tabella, cifratura (con test: andata e ritorno, manomissione, chiave sbagliata, chiave mancante),
   voce di menù, catalogo, pagina dell'integrazione con le schede, abilita/disabilita, registro.
2. **Google Calendar, configurazione:** guida, caricamento della chiave, *Test connection*, impostazioni.
3. **Sincronizzazione:** eventi da tutte le azioni, *Sync now*, controllo giornaliero, *Activity*.
4. Prova con il tuo calendario vero, documentazione, poi il rilascio in produzione con le migrazioni.

**Prove:** cifratura e validazione con test unitari; tabella e sincronizzazione con test sul database; Google dietro
un'interfaccia sostituibile nei test; il collaudo con le tue credenziali vere a fine PR 2 e 3.

## Decisioni prese

1. **Lingua:** tutto in inglese, guida e modulo compresi; la guida sempre nel pannello, accanto al modulo (Kevin).
2. **Chi vede le integrazioni:** tutti gli admin.
3. **Catalogo:** solo le integrazioni esistenti, senza schede «Coming soon».
4. **Manutenzioni** nel calendario Google: sì, con l'opzione per spegnerle.

Le ultime tre sono le mie proposte, non contestate da Kevin: da confermare con la revisione del documento.
