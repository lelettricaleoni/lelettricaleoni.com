---
name: clean-project
description: "Use when adding or removing a dependency, a library, a component, a helper, a config file, an env variable or a script; when a change makes two things do the same job; when finishing a feature (leftovers); or when asked to tidy up, audit or simplify the project. Keeps the repository clean: one tool per job, nothing unused, nothing duplicated, nothing left behind (Kevin, 2026-10-08: «a me piace sempre avere un progetto pulito»). The reasoning habit behind it: before adding X, ask what already does X; after adding X, ask what X makes useless."
---

# Un progetto pulito

**Origine**: aggiungendo `react-icons` per il logo di Google, Kevin ha notato che portava già con sé le icone di Lucide, che il
progetto installava a parte: due librerie per lo stesso lavoro. Non l'avevo visto io. Questa skill è il modo di vederlo prima.

La regola in una riga: **un lavoro, uno strumento.** Ogni cosa che entra deve avere una ragione; ogni cosa che esce deve
portarsi via i propri resti.

## 1. Prima di aggiungere: cosa fa già questo lavoro?

Per una dipendenza, un componente, una funzione, una variabile d'ambiente:

1. **Cerca nel progetto** (`grep`, `ls components/ui`, `package.json`) ciò che fa già quel lavoro. Se esiste, si usa o si estende.
2. **Cerca nelle dipendenze già installate**: una libreria nuova può contenere ciò che ne sostituisce una vecchia
   (`react-icons` ⊃ Lucide, Font Awesome, Simple Icons…; `date-fns` ⊃ la matematica sulle date; `zod` ⊃ le regex di validazione).
   Si guarda **l'albero**, non solo `package.json`: `npm ls <nome>`.
3. **Cerca la libreria consolidata** prima del codice a mano (regola già in `CLAUDE.md`). Ma una libreria in più è un costo:
   se il lavoro è una funzione di dieci righe e non ha casi limite, la funzione costa meno.
4. Se la cosa nuova **ne rende inutile una vecchia**, nella stessa PR (o in una gemella subito dopo) si toglie la vecchia.
   «Lo tolgo poi» non succede.

### Le sovrapposizioni tipiche, da controllare a ogni aggiunta

| Lavoro | Un solo strumento in questo progetto |
|---|---|
| Icone | una sola famiglia (vedi `design-system`); i loghi di marca stanno dove stanno le altre icone |
| Date e fusi | `date-fns` 4 + `@date-fns/tz` |
| Validazione | `zod` |
| Telefoni | `libphonenumber-js` |
| Stili | Tailwind + `cn()`; niente CSS-in-JS né secondo sistema di classi |
| Componenti UI | shadcn (`components/ui/`) |
| Stato del server | Server Action; `app/api/` solo per chi non è il nostro frontend |
| Cache/coda | il Redis della VM, non un secondo servizio |

Se un'aggiunta non rientra in una riga della tabella, chiediti se serve una riga nuova **e** che cosa sostituisce.

## 2. Dopo aver fatto: cosa resta?

Prima di dichiarare finito (e prima di committare), una passata rapida su ciò che *questa* modifica può aver lasciato:

- **Import e export non più usati** (`npx tsc --noEmit` con `noUnusedLocals` non basta per gli export: cerca con `grep` il nome).
- **File orfani**: un componente, una pagina, un'immagine, un messaggio in `messages/*.json` che nessuno referenzia più.
- **Dipendenze non più importate**: `grep -r "from '<pacchetto>'"`. Se non c'è nulla, `npm uninstall`. Attenzione ai pacchetti usati
  solo da configurazione o da script (`next.config.ts`, `scripts/`, `.github/`, `Dockerfile`) e ai peer richiesti da altri.
- **Variabili d'ambiente**: se il codice non legge più `FOO`, via anche da `deploy/web/env.template`, da
  `docs/environment-variables.md` e dalla CI.
- **Codice morto dietro un interruttore tolto** (i feature flag non ci sono più: STATE.md).
- **Commenti e documenti che descrivono la cosa vecchia** (`STATE.md`, skill, README): una frase falsa è peggio di una mancante.
- **File di lavoro nella root o in `public/`** (screenshot, dump, log): vedi «Igiene del repository» in `CLAUDE.md`.
- **`git status` prima del commit**: ogni file che compare e che non hai scritto di proposito non si aggiunge.

## 3. Quando togliere qualcosa, come farlo

1. **Misura l'estensione prima di promettere**: quanti file, quante occorrenze, cosa non ha equivalente diretto (nomi diversi,
   valori predefiniti diversi come la dimensione di un'icona, tipi).
2. **Una PR sola, solo di sostituzione**, senza mischiare altri cambi: se qualcosa si rompe, si capisce da dove viene.
3. **Mappa i nomi con uno script**, non a mano; poi `npx tsc --noEmit` deve dire che ogni nome esiste.
4. **Guarda il risultato**: una sostituzione che compila può cambiare l'aspetto (dimensioni, spessori, colori ereditati).
   Confronta prima e dopo con un browser vero, nelle pagine che usano la cosa.
5. **Ricorda i generatori**: `shadcn add` riscrive i componenti con la sua libreria predefinita; se il progetto ne usa un'altra,
   dopo ogni `add` va rifatta la sostituzione (e la regola va scritta dove il prossimo la legge: `design-system`, `CLAUDE.md`).
6. **Aggiorna chi lo racconta**: la riga nella skill o in `CLAUDE.md` che nominava la cosa tolta.

## 4. Un controllo periodico (quando Kevin chiede di «fare pulizia», o a fine di un grande lavoro)

In sola lettura, poi si propone; non si cancella in blocco.

- Dipendenze dichiarate e mai importate; dipendenze importate e non dichiarate.
- Due pacchetti per lo stesso lavoro (tabella sopra).
- File in `components/`, `lib/`, `scripts/` che nessuno importa; rotte senza link né sitemap che non siano pagine di servizio volute.
- Rami remoti già uniti (`git branch -r --merged origin/staging`) e worktree rimasti.
- Voci di `STATE.md` e `ROADMAP.md` fatte o false (per quello c'è `/distill`).
- Cartelle di scarto ignorate da git ma cresciute (`temp/`, `.playwright-mcp/`).

Il risultato è un elenco ordinato per «costa poco, vale molto», non una pulizia fatta senza chiedere. Le cose che non si
possono ripristinare (cancellare dati, rami non uniti) si confermano sempre.

## Cosa NON è pulizia

- Riscrivere codice che funziona perché «non è come lo farei io».
- Togliere una duplicazione voluta (la tabella `ROADMAP → Scartato` serve a non rifare valutazioni: non toglierla).
- Unificare due cose che sembrano uguali ma cambiano per ragioni diverse.
- Un refactor che non è stato chiesto e che gonfia la PR di chi la deve rivedere.
