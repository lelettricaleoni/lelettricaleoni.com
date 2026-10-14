# Scadenza dei posti tenuti: un lavoro per ogni prenotazione invece di un controllo ogni minuto

> **Da valutare, non iniziato** (Kevin, 2026-10-13: «per ogni noleggio in attesa di pagamento avviare un job dedicato a farlo scadere invece di un lavoro che gira ogni
> minuto in cerca di noleggi da far scadere»). `[ ]` da fare, `[~]` in corso, `[x]` fatto. Si decide **prima** delle email (fetta 4), perché usa la stessa macchina.
> Next.js: se si scrive una rotta nuova (`app/api/`), leggere prima `node_modules/next/dist/docs/01-app/` per `route.ts` e dire quale pagina.

## Come funziona oggi
- Un timer di systemd (`settle-holds@<ambiente>.timer`, ogni minuto) chiama `GET /api/cron/settle-holds` con `CRON_SECRET`; la rotta fa `settleOverdueHolds()`
  (`lib/booking/cron.ts`, `lib/booking/settle.ts`): cerca i `pending` scaduti, chiude la sessione di pagamento **prima**, poi libera le bici; conferma chi ha pagato senza che il
  webhook arrivasse.
- In più, `listBookableBikes` fa la stessa pulizia prima di contare le bici libere (`settleHoldsQuietly`): **la disponibilità è giusta anche senza il timer**.
- Costo: una query indicizzata al minuto (`{"status":"done","settled":0}`). Ritardo massimo: 60 secondi su 15 minuti di attesa.
- **Per il rilascio** bisogna installare il timer anche in produzione (un passo in più, e `CRON_SECRET` in `production.env`).

## La risposta in breve
Un job per prenotazione (BullMQ, «delayed») è **più preciso e più in linea con il resto** (le email e i promemoria della fetta 4 sono la stessa cosa: un lavoro a una data),
ma **non basta da solo e non è più semplice**:
1. **La coda non è durevole** (`STATE.md`: «ricostruibile, non durevole»). Se Redis perde il lavoro (riavvio senza AOF, svuotamento, Redis spento nell'istante della prenotazione),
   una prenotazione resterebbe `pending` per sempre con le bici tenute. Serve **una rete di sicurezza**: un controllo periodico, anche rado (ogni 5–10 minuti), e la pulizia
   in lettura che c'è già. Quindi il controllo periodico **non sparisce**: si fa più raro.
2. **Il worker oggi non ha il database né la chiave di Stripe** (legge solo `REDIS_URL`, R2 e `LOG_LEVEL`). Il lavoro «scadi questa prenotazione» ha bisogno di entrambi.
   Due strade: (a) dare al worker `DATABASE_URL` e `STRIPE_SECRET_KEY` (allarga ciò che un worker compromesso può fare: oggi non può toccare né clienti né pagamenti);
   (b) il worker, allo scadere, **chiama il sito** (`POST` interno con segreto) e il sito fa `settleHold`: il worker resta senza chiavi, ma resta una rotta con segreto (c'è già `CRON_SECRET`).
3. **Il guadagno vero** è un altro: il controllo periodico di sicurezza può vivere **dentro il worker** (lo scheduler di BullMQ), senza timer di systemd né installazioni sulla VM
   a ogni ambiente. Al rilascio non c'è più il passo «installa il timer».

## Proposta
**Non farlo adesso; farlo insieme alla fetta 4** (email di conferma e promemoria), con la strada (b):
- coda `booking-hold` in `lib/queues/names.ts`, lavoro `expire` con ritardo = scadenza dell'attesa + 5 s, id `hold:<bookingId>` (un doppione lo rifiuta la coda), tre tentativi;
- accodato da `beginCheckout` **dopo** aver tenuto le bici, con `safeErrorSummary` e senza mai far fallire la prenotazione se Redis non risponde (come la cache);
- il gestore nel worker (`createHoldExpiryHandler`, una riga in `worker/main.ts`) chiama la rotta interna del sito, che esegue `settleHold(bookingId)` (già idempotente: se nel frattempo ha pagato,
  conferma; se è già chiusa, non fa nulla);
- lo scheduler del worker lancia ogni 5 minuti `settleOverdueHolds` (rete di sicurezza), e il timer di systemd **si toglie** (`deploy/web/settle-holds@.*`, la guida di installazione, `CRON_SECRET` resta per la rotta);
- la pulizia in lettura di `listBookableBikes` resta.

### Compiti (se Kevin conferma)
- [ ] Decisione di Kevin (domande sotto).
- [ ] Prova con Redis spento: la prenotazione si crea lo stesso, e la rete di sicurezza la chiude entro 5 minuti.
- [ ] Test: il lavoro fa scadere una prenotazione scaduta; è innocuo su una già pagata o già chiusa; un doppione non crea due lavori.
- [ ] Prova dal vivo su `staging`: una prenotazione lasciata a metà si chiude da sola al minuto 15, non al minuto successivo; il timer di staging si spegne dopo la prova.
- [ ] Aggiornare `STATE.md` (la riga del timer), `prenotazioni-punti-aperti.md` (togliere «timer `settle-holds@production`»), la guida di rilascio.

## Alternative viste e scartate
- **Solo pulizia in lettura**: le bici sembrano libere, ma la sessione di Stripe resta pagabile fino al minuto 31 e il calendario del pannello mostra prenotazioni scadute: serve comunque qualcuno che chiuda.
- **`pg_cron` di Supabase** che chiama il sito: sempre un controllo periodico, solo spostato nel database.
- **Aspettare l'evento «sessione scaduta» di Stripe**: arriva al minuto 31 (il minimo di Stripe), non al 15.

## Domande per Kevin
1. Va bene rimandarlo alla fetta 4 (consigliato), tenendo ora il timer al minuto anche per il rilascio?
2. Il worker può restare senza database né chiavi (strada b)? Consigliato.
