---
name: design-system
description: "Use when building or changing anything visual on the site or in the panel: a page, a section, a component, a button, a form, a menu, a card, a badge, a colour, a radius, a spacing. The rules that keep every page looking like the same site (Kevin, 2026-10-07: «dobbiamo stilare delle regole di design per non ritrovarci con ogni pagina del sito con un design diverso»). Load it before writing the markup, together with the frontend-design skill; this one says WHAT this site already decided, the other says how to design."
---

# Regole di design di questo sito

**Regola madre: prima di creare, cerca.** Un pulsante, un campo, un menu, una finestra, una card, un'etichetta esistono già
(`components/ui/`, shadcn). Si usano, non si rifanno: l'errore da cui nasce questa skill è un menu della navbar fatto con
classi a mano, tondo, accanto a un sito dove i pulsanti sono rettangoli con gli angoli arrotondati. Se un componente non c'è,
si aggiunge con shadcn; se serve una variante, si aggiunge **al componente** (`cva`), non a una pagina.

I valori qui sotto sono **ricavati dal codice del 2026-10-07** (conteggi dell'uso reale), non inventati. Se il codice e questa
pagina divergono, si decide quale ha ragione e si aggiorna l'altro nella stessa PR.

## Raggi: la regola che si sbaglia più spesso

| Cosa | Raggio | Dove |
|---|---|---|
| **Pulsanti, campi, menu a tendina, controlli** | `rounded-md` | sempre tramite `Button` / `buttonVariants` / `Input`. **Mai una pillola** per un'azione |
| **Controllo a segmenti** (video / mappa, accedi / crea account) | contenitore `rounded-md bg-muted`, segmenti `rounded-sm` | `components/route-filters.tsx` |
| **Card e contenitori** | `rounded-xl` (`rounded-2xl` per le superfici grandi) | `bike-card.tsx`, `route-card.tsx` |
| **Riquadri di avviso, campi in pannelli** | `rounded-lg` | messaggi di errore e conferma |
| **Cerchi** (`rounded-full`) | **solo** avatar e iniziali, puntini di stato, icone in un tondo, spinner | `user-menu.tsx` (l'iniziale) |
| **Pillole** (`rounded-full`) | **solo** etichette e filtri a scelta, cioè cose che si leggono come un'etichetta: chip dei filtri, badge di difficoltà | `route-filters.tsx`, `bike-filters.tsx`, `difficulty-badge.tsx` |

Test rapido: *«si può premere per fare qualcosa?»* → rettangolo con angoli arrotondati. *«È un'etichetta o un dato?»* → può essere
una pillola. *«Una persona o un indicatore?»* → cerchio.

## Colori

Solo **token**, mai un esadecimale nuovo nel markup. Definiti in `app/globals.css` (`@theme`):

| Token | Valore | Uso |
|---|---|---|
| `brand-navy` / `brand-navy-dark` | `#1E3A5F` / `#152C4A` | **azione primaria** (pulsante pieno e il suo hover), titoli delle pagine funzionali |
| `brand-blue` (= `primary`, `ring`) | `#366DA1` | link, spunte, stato attivo, anello del focus |
| `brand-purple` | `#795F91` | **riservato** alle sezioni di prenotazione e appuntamenti, dopo uno studio; non sulle bici |
| `brand-dark` | `#3D3D3B` | fondi scuri (footer) |
| `foreground`, `muted-foreground`, `border`, `muted`, `card` | neutri di shadcn | testo, testo secondario, bordi, fondi |
| rosso 50/700 e verde 50/700 | `bg-red-50 text-red-700 border-red-200`, idem verde | errore e conferma in un riquadro |

Un solo pulsante pieno per vista, quello della cosa principale (in navbar: «Accedi»). Gli altri sono `outline` o `ghost`.

## Tipografia

Geist (sans) e Geist Mono, da `next/font`. Titolo di sezione `text-3xl sm:text-4xl font-bold`; titolo di una pagina funzionale
(accesso, account) `text-2xl font-bold text-brand-navy` con sotto `text-sm text-muted-foreground`; testo di servizio `text-xs`.
Frasi in minuscolo con la maiuscola iniziale, mai tutto maiuscolo.

## Misure e ritmo

- **Altezze dei controlli**: `sm` 36 px (navbar, barre di filtri), `default` 40 px, `lg` 44 px. Controlli in fila hanno la stessa altezza.
- **Larghezze**: `max-w-6xl` navbar e sezioni larghe, `max-w-5xl` sezioni di contenuto, `max-w-3xl` / `max-w-2xl` testo e moduli;
  padding laterale `px-4 sm:px-6`; sezioni della home `py-20`.
- **Ombre**: `shadow-sm` di base, `hover:shadow-md` sulle card, `shadow-lg` e oltre solo per ciò che galleggia (menu, finestre).
- **Bordi**: `border` con il colore del token; una card è `border bg-card`.
- **Icone**: `lucide-react`, 16 px dentro i pulsanti (il `Button` le dimensiona da solo). Icone di marca: `react-icons`
  (il logo di Google è `FcGoogle`, a colori, come chiedono le regole di Google). Mai un CDN.
- **Focus e stati**: l'anello del `Button`, `disabled:opacity-50`, `cursor-pointer` sugli elementi cliccabili.

## Comportamento

- **Menu a tendina in una barra fissa**: `DropdownMenu modal={false}`. Quello modale blocca lo scorrimento, fa sparire la barra
  di scorrimento e la barra fissa salta di lato (misurato: 5 px).
- **Niente movimento gratuito**: solo `transition-colors` e ciò che risponde a un gesto. Niente entrate «a dissolvenza» per sezione.
- **Una scelta che cambia ciò che dice l'informativa non è un'impostazione d'ambiente** (vedi `privacy-cookies`).

## Testi dell'interfaccia

L'azione ha un verbo e lo stesso nome lungo tutto il percorso («Crea account» sull'interruttore e sul pulsante). Gli errori dicono
cosa è andato storto e cosa fare, senza scuse. Il sito pubblico è tradotto in it/en/de (`messages/*.json`); il **pannello è
in inglese** e non si traduce. Nessun dettaglio infrastrutturale in ciò che l'utente legge.

## Prima di dire «finito»

1. Provato a **320, 375 e 1440 px**, senza scorrimento orizzontale.
2. Guardato con uno **screenshot**, non solo con il codice.
3. Nessun esadecimale nuovo, nessun `rounded-full` su un'azione, nessun componente rifatto che esisteva già.
4. Se si tocca ciò che sta in ogni pagina (navbar, footer), si misura che nulla si sposti aprendo i menu.

## Debito noto (da sistemare, non da imitare)

- **`#1e3a5f` è scritto a mano ~65 volte e `#366DA1` ~28** nel sito pubblico: i token `brand-navy` e `brand-blue` esistono, la
  migrazione dei file vecchi no (si fa con una sostituzione, in una PR a parte).
- **La barra dei comandi del flyover** (`route-flyover.tsx`) usa pulsanti a pillola per azioni: eccezione non decisa. Da riportare a
  rettangoli o da dichiarare un'eccezione voluta (è sopra una mappa, su un fondo traslucido).
- Il pannello usa soprattutto `rounded-lg`; la differenza con il sito (`rounded-md` sui controlli) è accettata finché non si
  unifica con i token.
