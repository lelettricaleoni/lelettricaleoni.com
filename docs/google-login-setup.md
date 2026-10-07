# Accesso con Google: come attivarlo e come chiedere a Google i permessi in più

> Guida operativa per Kevin. Scritta il 2026-10-07 sulla documentazione ufficiale di Supabase e di Google
> (fonti in fondo). **Vale per lo staging**: l'accesso unificato non va in produzione finché la prenotazione dei
> noleggi non è completa, quindi tutto ciò che segue si fa prima sul progetto Supabase di **sviluppo**, che è
> quello che usano `localhost` e `staging.lelettricaleoni.com`.

## Prima di tutto: l'«OAuth server» di Supabase NON serve

Nel pannello di Supabase (Authentication → OAuth Server) c'è un interruttore con questo nome. **Lascialo spento.**
È la funzione inversa: trasforma il tuo progetto Supabase in un fornitore di identità, cioè *altre* applicazioni
fanno «Accedi con Lelettrica». A noi serve il contrario: il nostro sito fa «Accedi con Google», e Supabase sta
nel mezzo. Quella si chiama **Providers → Google**, ed è un'altra pagina.

## Come funziona il giro

```
cliente → il nostro sito → Supabase Auth → Google (schermata di consenso) → Supabase Auth → /auth/callback → account
```

Il cliente non lascia mai la password a noi né a Supabase: la inserisce su Google. Il sito riceve da Supabase una
sessione, e il codice di `app/auth/callback/route.ts` lega l'account al cliente (per email, solo se verificata).
Con i permessi base (`openid`, email, profilo) **Google non richiede nessuna verifica**. Serve una verifica solo
se si chiedono permessi *sensibili*, come il telefono.

## Fase 1 — Accesso con Google, senza permessi in più (consigliata per partire)

Tempo: circa mezz'ora, nessuna revisione da parte di Google.

1. **Google Cloud Console** → crea un progetto (es. «Lelettrica») → *Google Auth Platform* (o «API e servizi →
   Schermata consenso OAuth»).
2. **Branding / Schermata di consenso**:
   - nome app «Lelettrica», email di assistenza, logo;
   - **Pagina iniziale**: `https://www.lelettricaleoni.com`;
   - **Informativa sulla privacy**: `https://www.lelettricaleoni.com/it/privacy` (deve stare sullo stesso dominio
     della pagina iniziale, ed essere raggiungibile da chiunque);
   - **Domini autorizzati**: `lelettricaleoni.com`;
   - **Pubblico**: *Esterno*.
3. **Accesso a dati (Scopes)**: lascia solo i tre di base che Supabase richiede: `openid`,
   `…/auth/userinfo.email`, `…/auth/userinfo.profile`. Non aggiungere altro in questa fase.
4. **Clients → Crea client OAuth** → tipo **Applicazione web**. Uno per ambiente, nello stesso progetto Google:
   - **«Lelettrica – sviluppo e staging»**
     - Origini JavaScript autorizzate: `https://staging.lelettricaleoni.com` e `http://localhost:3000`
     - URI di reindirizzamento autorizzati: `https://<ref-sviluppo>.supabase.co/auth/v1/callback`
   - **«Lelettrica – produzione»** (si crea solo al rilascio)
     - Origini: `https://www.lelettricaleoni.com`
     - URI di reindirizzamento: `https://<ref-produzione>.supabase.co/auth/v1/callback`

   L'URI di reindirizzamento giusto lo mostra Supabase stesso nella pagina del provider (punto 5): copialo da lì,
   non scriverlo a mano. È l'indirizzo di **Supabase**, non del nostro sito.
5. **Supabase** (progetto di sviluppo) → *Authentication → Sign In / Providers → Google* → **Enable** → incolla
   *Client ID* e *Client secret* → Salva. Il segreto resta in Supabase e non va mai in git né nelle variabili del sito.
6. **Supabase → Authentication → URL Configuration**: nei *Redirect URLs* ci devono essere
   `https://staging.lelettricaleoni.com/auth/callback` e `http://localhost:3000/auth/callback`
   (in produzione, al rilascio, `https://www.lelettricaleoni.com/auth/callback`). Senza, Supabase rimanda
   alla *Site URL* invece che alla pagina giusta.
7. **Il pulsante non ha un interruttore** (Kevin, 2026-10-07: niente file d'ambiente come feature flag). «Continua con
   Google» compare sempre, e funziona se il provider è **attivo nel progetto Supabase** di quell'ambiente: è quello
   l'interruttore. Se il provider è spento, Supabase risponde con un errore e la persona torna al login con il messaggio
   generico. Per questo il provider di produzione si attiva solo al rilascio.
8. **Pubblica l'app su Google**: nella schermata di consenso, stato di pubblicazione → **«In produzione»**.
   Se resta in «Test», possono accedere solo gli indirizzi che aggiungi a mano come *utenti di test* (massimo 100).
   Con i soli permessi base, passare a «In produzione» **non richiede una revisione**.
9. **Provalo**: apri `/it/login` → «Continua con Google». Se Google dice `redirect_uri_mismatch`, l'URI del punto 4
   non è identico a quello di Supabase (anche un `/` finale conta).

**Consiglio di Supabase, a pagamento: un dominio personalizzato** (`auth.lelettricaleoni.com`). Senza, la schermata di
Google mostra «continua su `<ref>.supabase.co`», che a un cliente può sembrare sospetto e, per la documentazione
di Supabase, rende più facili i tentativi di phishing. È un componente aggiuntivo a pagamento del progetto Supabase:
conviene valutarlo al rilascio, non prima. Se lo attivi, l'indirizzo nuovo va aggiunto agli URI autorizzati di Google.

## Fase 2 — Chiedere a Google il numero di telefono (permesso sensibile)

Il permesso è `https://www.googleapis.com/auth/user.phonenumbers.read`. È classificato da Google come **sensibile**:
si può chiedere solo dopo che Google ha **verificato** l'app.

### Cosa cambia senza verifica
- finché l'app non è verificata, chi accede vede una **schermata di avviso** («Google non ha verificato questa app»);
- l'app è limitata a **100 utenti**, contati per sempre;
- quindi **non va attivato in produzione prima della verifica**.

### Un avvertimento sul vantaggio reale
Il telefono arriva da Google **solo se la persona lo ha nel profilo Google**, ed è un'informazione che molti non hanno.
Il numero di recupero e quello della verifica in due passaggi **non vengono mai restituiti**. Quindi per molti clienti il
campo resterà vuoto e lo scriveranno loro. Il sito è già pensato così (campo facoltativo, mai un errore).
**Il mio parere:** parti con la Fase 1, e chiedi il permesso del telefono solo se, a regime, vedi che pesa davvero.

### Cosa serve per la verifica
Dalla documentazione di Google («Sensitive scope verification»):

1. **Dominio verificato**: in **Google Search Console** il dominio `lelettricaleoni.com` deve essere verificato dallo
   stesso account che possiede (Owner o Editor) il progetto Google Cloud. (La proprietà Search Console esiste già.)
2. **Pagina iniziale pubblica** (non dietro login) e **informativa privacy sullo stesso dominio**, che dichiari come
   si accede, si usa, si conserva e si condivide il dato di Google. **Qui entra la revisione della privacy e dei cookie:
   senza un'informativa aggiornata la verifica viene respinta.** Va scritta prima di inviare la richiesta (vedi
   `.claude/skills/privacy-cookies/SKILL.md`). Deve dire che il numero di telefono è usato per precompilare il profilo,
   che non viene ceduto a terzi e che il token di Google non viene conservato (è vero: il codice lo usa una volta e lo
   scarta; vedi `lib/auth/google-phone.ts`).
3. **Schermata di consenso corretta**: nome, email di assistenza, logo, domini.
4. **Giustificazione del permesso** (testo, in inglese): perché serve proprio `user.phonenumbers.read` e perché non basta un
   permesso più stretto. Bozza:
   > Lelettrica rents e-bikes and repairs bicycles. Customers create an account to book rentals. We request the
   > user's phone number once, at sign-in, to pre-fill the optional phone field of their customer profile, so the
   > shop can reach them about a rental. The number is shown to the customer for confirmation, is not shared with
   > third parties, and the access token is discarded immediately after the request and never stored.
5. **Video dimostrativo**, **non in elenco su YouTube**, in cui si vede, in inglese: il pulsante «Continua con Google»,
   la schermata di consenso di Google **con l'ID client visibile nell'indirizzo**, il nome dell'app, la concessione del
   permesso del telefono, e dove nell'app il numero viene usato (il campo telefono precompilato nel profilo).
6. **Invio**: Google Cloud Console → *Google Auth Platform → Centro di verifica* (*Verification Center*) → invia.
   Tempi: di norma **3–5 giorni lavorativi**, con scambio di email in caso di domande.
7. **Dominio di Supabase**: dopo l'invio Google può chiedere di verificare tutti i domini della tua lista, compreso
   `supabase.co`. Quello non è tuo: si risponde all'email dicendo che appartiene al servizio di terze parti usato per
   l'integrazione (Supabase). Con il dominio personalizzato il problema non si pone.

Per i permessi *sensibili* **non serve** la valutazione di sicurezza (la richiede solo per i permessi *riservati*).

### Dopo l'approvazione
1. In Google Cloud, nella sezione *Accesso ai dati*, il permesso `user.phonenumbers.read` è già dichiarato.
2. In `lib/auth/google-phone.ts` cambia la costante `REQUEST_GOOGLE_PHONE` da `false` a `true`, in un commit
   (una decisione presa una volta, nel codice: non un valore d'ambiente che può essere diverso da una macchina all'altra).
   Il codice chiede allora il permesso in più al momento dell'accesso con Google; finché è `false` chiede solo i tre
   permessi base.
3. Per usare il permesso nel codice, Supabase passa il token di Google **una sola volta**, al login, e non lo conserva:
   il callback lo legge dalla sessione appena creata, interroga l'API People per il solo campo `phoneNumbers` e lo butta.
   (Se un giorno servisse riusarlo, andrebbe salvato cifrato a nostra cura, e **non è previsto**.)

### Se Google risponde di no
Succede soprattutto quando il video non mostra bene l'uso del dato, o l'informativa non nomina il telefono.
Si corregge e si invia di nuovo: non c'è penale. Intanto l'accesso base (Fase 1) funziona e basta.

## Controlli rapidi

| Sintomo | Causa probabile |
|---|---|
| `redirect_uri_mismatch` | l'URI di Google non è identico a quello mostrato da Supabase |
| Dopo Google si torna alla *Site URL* e non alla pagina | l'indirizzo del sito non è nei *Redirect URLs* di Supabase |
| Dopo «Continua con Google» si torna al login con un errore generico | il provider Google non è attivo (o ID e segreto sono sbagliati) nel progetto Supabase di quell'ambiente |
| «Accesso bloccato: app non verificata» a persone che non sono utenti di test | l'app è ancora in stato «Test» invece che «In produzione» |
| Schermata con avviso «app non verificata» | è stato chiesto un permesso sensibile prima della verifica |

## Fonti
- Supabase, *Login with Google*: https://supabase.com/docs/guides/auth/social-login/auth-google
- Supabase, *OAuth Server* (il contrario di ciò che serve): https://supabase.com/docs/guides/auth/oauth-server
- Google, *App verification for sensitive scopes*:
  https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification
- Supabase, discussione su dominio personalizzato e schermata di Google:
  https://github.com/orgs/supabase/discussions/2925
