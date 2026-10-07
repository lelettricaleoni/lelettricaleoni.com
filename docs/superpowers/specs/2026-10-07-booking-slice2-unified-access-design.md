# Design Spec — Prenotazioni, fetta 2: account cliente e accesso unificato

**Data**: 2026-10-07
**Stato**: bozza scritta in autonomia mentre Kevin non c'era (2026-10-07), con le decisioni sotto segnate **[da confermare]**.
Nessuna è definitiva: si correggono al ritorno. Sono quelle che ho preso io perché la scelta ovvia c'era; le vere domande
sono in «Domande per Kevin».
**Dove vive il codice**: branch `staging`, dal ramo `feat/unified-access`. Niente in produzione finché la fetta 3 non è pronta
(decisione di Kevin per tutto il sistema di prenotazioni, 2026-10-02).

---

## Com'è oggi (verificato nel codice e sui due progetti Supabase, 2026-10-07)

- **Una sola interfaccia di accesso c'è già**: `/[lang]/login`, nelle tre lingue (testi in `messages/*.json`), con tre schede
  (password, link via email, password dimenticata). `/manage/login` è soltanto un reindirizzamento a quella.
- **Ma tutto ciò che sta dietro ragiona da amministratore**:
  - `loginAction` manda un admin a `/manage/routes` e a chiunque altro risponde «Accesso non autorizzato»;
  - `magicLinkAction`, `resetPasswordAction` e `app/auth/callback/route.ts` fanno lo stesso: un account che non sia admin viene
    scollegato subito;
  - `updatePasswordAction` rimanda sempre a `/manage/routes`, `logoutAction` sempre a `/it/login`, il link di reset punta
    sempre a `/it/update-password`;
  - gli errori viaggiano come **frasi italiane nell'indirizzo** (`?error=Credenziali+non+valide.+Riprova.`), anche per chi
    usa il sito in inglese o in tedesco;
  - `/[lang]/update-password` ha un dizionario dentro il file, fuori da `messages/*.json`; `/manage/update-password` è un
    duplicato solo inglese.
- **Non esiste la registrazione**, né una pagina dell'account, né il legame tra chi accede e la tabella `customers`
  (che ha già `user_id`, univoco, mai valorizzato).
- **Il ruolo di amministratore** sta in `app_metadata.role = 'admin'` (che solo il servizio può scrivere) e lo leggono
  `getAdminUser()`, `proxy.ts` e `lib/admin-users.ts`. Va lasciato così.
- **Supabase, entrambi i progetti**: le registrazioni sono **già aperte** (`disable_signup: false`), la conferma dell'email è
  richiesta (`mailer_autoconfirm: false`), l'unico provider attivo è l'email: **Google non c'è**. La chiave pubblica sta nel
  browser di chiunque, quindi oggi chiunque può già creare un account non admin chiamando Supabase a mano, anche se il sito
  non ha un modulo per farlo. Non dà accesso a niente (`/manage` chiede il ruolo; le tabelle sono chiuse all'API), ma è
  rumore da tenere d'occhio.

## Obiettivo

Una persona qualsiasi può **creare un account**, **accedere**, vedere una **pagina del suo account** e uscire; un
amministratore accede dallo stesso modulo e arriva al pannello. Chi ha già un noleggio registrato al banco con la sua email
viene riconosciuto, e quando la fetta 3 porterà le prenotazioni online le troverà nel suo account. È la base su cui poggia la
fetta 3 («account obbligatorio per prenotare», Kevin, 2026-10-02).

## Decisioni

1. **Un'unica porta: `/[lang]/login`** per tutti. `/manage/login` resta il reindirizzamento che è. Un solo posto in cui
   cambiare l'aspetto, i testi e le regole. **[da confermare]** (la ROADMAP dice «unificare», quindi è la lettura ovvia)
2. **Chi non è admin è un cliente.** Nessun secondo ruolo in `app_metadata`: l'assenza del ruolo è «cliente». È il default più
   sicuro (un errore non regala il pannello a nessuno) e il più semplice.
3. **Dopo l'accesso**: admin → `/manage`; cliente → `/[lang]/account`. Un parametro `next` (solo un percorso di questo sito,
   controllato come in `callback`) riporta la persona dove stava andando: servirà alla fetta 3, che manderà qui chi prova a
   prenotare senza un account.
4. **Registrazione nella stessa pagina**, come quarta scheda («Crea account»): nome, cognome, email, password, consenso alla
   privacy. Conferma dell'email obbligatoria (già così su Supabase). Subito dopo la conferma la persona è dentro, sull'account.
5. **Legame con `customers` solo per email verificata.** Quando un account entra la prima volta (dal ritorno del link o
   dalla pagina dell'account), si cerca un cliente con la stessa email (minuscole) e `user_id` vuoto e lo si collega; se non
   c'è, se ne crea uno con nome e cognome della registrazione. **Solo se l'email dell'account è confermata**
   (`email_confirmed_at`): collegare un account non verificato a un cliente esistente darebbe a chiunque, scrivendo l'email
   di un altro, lo storico di quella persona. Un solo comando SQL (un indice univoco decide), non due letture e una scrittura.
6. **La pagina dell'account** mostra nome, email, telefono, un modo per cambiare la password, l'uscita, e «le tue prenotazioni»
   (vuoto finché non c'è la fetta 3). Per il principio già scritto in `STATE.md`: **solo le prenotazioni online**, mai i
   noleggi registrati dal pannello, anche per la stessa persona.
7. **Errori e messaggi per codice, nella lingua dell'URL.** `?error=invalid_credentials` e simili, tradotti da
   `messages/*.json`; niente più frasi italiane nell'indirizzo. Anche `update-password` migra a `messages/*.json`. Le
   azioni conoscono la lingua della persona e la usano nei reindirizzamenti (logout, reset, cambio password).
8. **Accesso con Google: pronto nel codice, spento finché non serve.** Un pulsante «Continua con Google» (OAuth di Supabase)
   compare solo con `NEXT_PUBLIC_GOOGLE_LOGIN=true`. Per accenderlo servono due cose che sono tue: un client OAuth in Google
   Cloud e il provider attivato nel progetto Supabase (passi in «Rilascio»). Un interruttore d'ambiente, non un servizio di
   flag: i flag sono stati tolti il 2026-10-05.
9. **Il telefono (deciso da Kevin, 2026-10-07): facoltativo, mai una condizione.** Un campo nella registrazione
   (`user_metadata.customer_phone`, normalizzato con `libphonenumber-js`), e per chi entra con Google il numero del profilo
   Google, **solo con `GOOGLE_LOGIN_PHONE=true`** (permesso sensibile: serve la verifica di Google, vedi
   `docs/google-login-setup.md`). Entra nel cliente solo dove manca e solo se nessun altro cliente lo ha: ciò che il negozio
   ha scritto non si sovrascrive, e un numero inutilizzabile si scarta senza far fallire l'accesso
   (`lib/auth/customer-link.ts`, 5 test in `tests/db/customer-link.test.ts`).
10. **Nessuna migrazione.** `customers.user_id` c'è già; l'account si legge per `user_id`.

## Dentro questa fetta

- `lib/auth/`: la scelta della destinazione dopo l'accesso, la validazione di `next`, i codici d'errore, il legame con
  `customers`, tutti con test.
- Le azioni `loginAction`, `registerAction`, `magicLinkAction`, `resetPasswordAction`, `updatePasswordAction`,
  `logoutAction`, e `app/auth/callback/route.ts`, tutti ragionando per ruolo e per lingua.
- La pagina di accesso con la quarta scheda e il pulsante Google (spento), `update-password` su `messages/*.json`,
  la pagina `/[lang]/account`, la protezione di `/[lang]/account` nel proxy.
- La spec e il piano, `STATE.md` e `ROADMAP.md` aggiornati.

## Fuori da questa fetta

- Prenotare (fetta 3), email e promemoria (fetta 4), appuntamenti di riparazione (fetta 5).
- Cancellare il proprio account e esportare i propri dati (GDPR): servono, sono da disegnare con la fetta 3, quando
  l'account conterrà dati di pagamento e prenotazioni.
- Un captcha sulla registrazione (Cloudflare Turnstile) e i modelli delle email di Supabase nelle tre lingue.
- Cambiare l'email dell'account.

## Sicurezza

- **L'email non è un'identità finché non è confermata**: vedi decisione 5. Lo stesso vale per Google, che restituisce
  `email_verified`.
- **Il ruolo non si legge mai da `user_metadata`**, che l'utente scrive da solo: la registrazione manda nome e cognome lì,
  ed è proprio per questo che nessun controllo di ruolo deve leggere quel campo.
- **`next` è un percorso, non un indirizzo**: deve cominciare con `/` e non con `//` né `/\` (come già in `callback`).
- **Niente enumerazione delle email**: l'accesso risponde sempre «credenziali non valide»; Supabase risponde allo stesso modo a
  una registrazione con un'email già presente.
- **Le registrazioni sono già aperte** (vedi sopra): oltre al captcha, le protezioni sono i limiti di frequenza di Supabase
  e di Cloudflare. Da rivedere quando ci saranno i pagamenti.

## Come si prova

- **Test unitari**: destinazione per ruolo, `next` valido e non, codici d'errore tradotti nelle tre lingue (stesse chiavi in
  `it`, `en`, `de`), logica del legame.
- **Test sul database di sviluppo** (`npm run test:db`): il legame con `customers` (cliente esistente con la stessa email →
  collegato; assente → creato; email diversa per maiuscole → collegato; account non verificato → mai collegato; due account
  con la stessa email non rubano lo stesso cliente).
- **Browser sul sito in locale**, con account creati sul progetto di sviluppo: cliente che entra e arriva all'account, admin
  che arriva a `/manage`, registrazione fino alla conferma (il clic sull'email si simula chiamando il ritorno con il codice
  che Supabase genera), `next` rispettato e `next` ostile ignorato, account anonimo rimandato all'accesso.
- **Test del browser in CI** (senza credenziali): la pagina di accesso ha le quattro schede; `/[lang]/account` da anonimo
  rimanda all'accesso.

## Rilascio

Su `staging` finché la fetta 3 non è pronta; in produzione con tutto il resto («una sola PR `staging → main`»). Prima di
allora, in **produzione** (progetto Supabase `hhfnhz…`) serve controllare a mano, e sono azioni tue:

1. **Site URL e Redirect URLs** (Authentication → URL Configuration): `https://www.lelettricaleoni.com/auth/callback` deve
   essere ammesso (c'è già, per gli inviti e i reset).
2. **Modelli delle email** (Authentication → Emails): il testo di «Confirm signup» è visibile ai clienti.
3. **Google** (solo se lo vuoi): in Google Cloud → API e servizi → Credenziali, un «ID client OAuth» di tipo *Web* con
   come URI di reindirizzamento autorizzato quello che Supabase mostra in Authentication → Providers → Google; poi
   incollare ID e segreto nel provider e impostare `NEXT_PUBLIC_GOOGLE_LOGIN=true` nell'ambiente. **Guida completa, con il
   permesso del telefono e la verifica di Google: `docs/google-login-setup.md`.**
4. **Informativa privacy e cookie: bloccante per il rilascio.** Aggiungere il dato dell'account (nome, email, telefono,
   storico), il cookie di sessione `sb-*-auth-token` tra i necessari nel banner, Google come fornitore dell'accesso. Elenco dei
   fatti e domande per un legale nella skill `.claude/skills/privacy-cookies/`. È un testo legale: lo preparo come bozza sui
   fatti, lo rivede chi di dovere.

## Domande per Kevin

1. **Dopo l'accesso, un admin va a `/manage` o a `/manage/routes`** (oggi: percorsi)? Ho messo `/manage` (la home del
   pannello). Una riga da cambiare.
2. **Il telefono si chiede alla registrazione?** Il noleggio al banco lo registra già, e la fetta 3 ne avrà bisogno; ma ogni
   campo in più fa perdere persone. Ora non lo chiedo; la pagina dell'account lo lascia aggiungere.
3. **Vuoi l'accesso con Google?** Se sì, i tre passi sopra sono tuoi; il codice è pronto.
4. **Registrazione aperta a tutti, o solo con un invito?** Oggi Supabase è aperto. Per un negozio di noleggio aperto al
   pubblico è la scelta naturale; se preferisci l'invito, si chiude `disable_signup` e il modulo sparisce.
