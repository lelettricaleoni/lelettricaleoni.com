# Da dove riprendere — 2026-09-10

> File temporaneo. Quando le PR qui elencate sono chiuse, questo file va cancellato:
> ciò che sopravvive va in `ROADMAP.md`, non qui.

## La cosa che blocca tutto: il check `browser`

**Undici PR aperte, tutte con `browser` rosso.** È l'unico controllo che fallisce, e finché
non passa nessuna PR si chiude.

Nell'ultima esecuzione **33 test su 36 passano**: il preview viene raggiunto, il token di
bypass funziona, la geometria e quasi tutto il contenuto sono verdi. I tre falliti sono lo
stesso caso, a tre larghezze:

```
il dettaglio di un percorso mostra titolo e statistiche
  → expect(locator).not.toBeEmpty() sull'h1
```

**Cosa si sa.** In produzione quell'`h1` è pieno (verificato con curl su due percorsi). La
pagina di dettaglio ha un solo `h1`, quindi non è un selettore che prende l'elemento
sbagliato. Il test naviga verso il primo `href` che trova nella lista.

**L'ipotesi non ancora verificata**: il preview interroga il database di produzione ma con
i flag dell'ambiente *Preview*, e il titolo viene da `route_translations` — un percorso
senza riga per quella lingua rende un `h1` vuoto invece di fallire. Se è così il difetto è
nel test, che deve dire **quale** percorso e distinguere quel caso da una pagina rotta.

Per verificarlo serve interrogare il preview con il token di bypass, che in locale non c'è:
sta solo nei secret del repository.

## PR aperte

| | branch | cosa contiene |
|---|---|---|
| #53 | `fix/codeql-findings` | `permissions` espliciti nei due workflow |
| #52 | `feat/performance-budgets` | budget TTFB/peso/richieste, tetti misurati |
| #51 | `feat/admin-users` | pannello utenti **+ un bug di sicurezza corretto** |
| #50 | `feat/content-tests-and-security` | test di contenuto, Dependabot, CodeQL |
| #43-49 | `dependabot/*` | sette aggiornamenti, fra cui `next` 16.3.4 e `maplibre-gl` 6 |

**#51 contiene la correzione più importante della giornata**: `app/auth/callback/route.ts`
controllava `user_metadata.role`, mentre `proxy.ts`, `getAdminUser()` e `loginAction` usano
`app_metadata.role`. `user_metadata` è scrivibile dal titolare dell'account. Tre punti su
quattro erano corretti — è l'incoerenza che lo rendeva invisibile.

## Lavoro non finito, salvato ma non in PR

**`feat/routes-caching`** — spinto sul remoto, tre commit, l'ultimo marcato WIP. Un agente
stava provando a togliere `headers()` dal percorso di rendering prendendo la lingua
dall'URL, così l'albero può essere prerenderizzato. Era a metà della misurazione quando è
stato fermato: **i numeri non ci sono ancora**, e senza quelli non si giudica.

## Da verificare, scoperto oggi e non ancora affrontato

**CodeQL non gira come credevo.** `codeql.yml` esiste solo sul branch #50, non su `main`:
quello che gira è il *default setup* di GitHub con la suite ristretta. Lo zero segnalazioni
su TypeScript è autentico ma è lo zero di quella suite — le query di `security-extended` e
di qualità **non hanno mai analizzato** i tre confini dove entrano dati esterni. Per
attivarle servono due passi insieme: disattivare il default setup e mergiare #50, oppure
`PATCH .../code-scanning/default-setup` con `query_suite=extended`.

**Le PR di Dependabot non eseguono davvero i test browser.** Non ricevono i secret, quindi
il workflow si salta da sé e riporta successo. Il verde su quelle PR non prova nulla — va
deciso se è accettabile o se serve un percorso diverso per loro.

**`app/api/worker/` non è tracciato da git**, quindi nessuna analisi lo ha mai visto.

## Cose che restano a Kevin

- I record DNS `cluster-bucket` e `cluster-bucket-console` su `kevinleoni.org`: la zona è in
  un altro account Cloudflare, fuori dal mio accesso.
- Revocare il token R2 finito nel transcript di ieri.
- I 72 MiB di video di prova sul bucket `dev-lelettrica-trails`, prefisso
  `public/route-videos/6a0f31f6…`: li rimuovo appena dici che non servono.
- **Il template email dell'invito su Supabase** deve puntare a `{{ .TokenHash }}`: col
  valore predefinito il token torna nel fragment dell'URL, che il server non vede, e ogni
  invito del pannello #51 finirebbe in "Link non valido o scaduto".

## Worktree ancora su disco

Sei cartelle in `.claude/worktrees/`, ignorate da git. Il lavoro dentro è salvato sui
rispettivi branch remoti, quindi si possono rimuovere con `git worktree remove --force`.
