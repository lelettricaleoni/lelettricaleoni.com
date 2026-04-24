# Cookie Consent GDPR — Piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere banner cookie consent GDPR-compliant (vanilla-cookieconsent v3) con caricamento condizionale di GA4 e privacy policy ampliata con tutti i requisiti del Garante italiano.

**Architecture:** `CookieConsentInit` è un client component che inizializza vanilla-cookieconsent v3 con traduzioni IT/EN/DE inline; GA4 viene caricato dinamicamente solo dopo consenso analytics. La privacy policy viene arricchita con nuove sezioni (base giuridica, conservazione, destinatari, diritti) aggiungendo chiavi ai file `messages/`.

**Tech Stack:** vanilla-cookieconsent v3, Next.js 16 App Router, Tailwind v4, TypeScript

---

## File Map

| Operazione | File |
|---|---|
| Crea | `components/cookie-consent.tsx` |
| Modifica | `app/globals.css` |
| Modifica | `app/layout.tsx` |
| Modifica | `messages/it.json` |
| Modifica | `messages/en.json` |
| Modifica | `messages/de.json` |
| Modifica | `app/[lang]/privacy/page.tsx` |
| Modifica | `components/footer.tsx` |

---

### Task 1: Installa vanilla-cookieconsent

- [ ] **Step 1: Installa la libreria**

```bash
npm install vanilla-cookieconsent
```

- [ ] **Step 2: Verifica che sia in package.json**

Controlla che `"vanilla-cookieconsent"` compaia nelle `dependencies` di `package.json`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add vanilla-cookieconsent dependency"
```

---

### Task 2: Crea components/cookie-consent.tsx

**File:** Crea `components/cookie-consent.tsx`

- [ ] **Step 1: Scrivi il componente**

Contenuto completo del file:

```tsx
'use client'

import { useEffect } from 'react'
import 'vanilla-cookieconsent/dist/cookieconsent.css'
import * as CookieConsent from 'vanilla-cookieconsent'

declare global {
  interface Window {
    dataLayer: unknown[]
    gtag: (...args: unknown[]) => void
  }
}

function loadGA4(gaId: string) {
  if (document.getElementById('ga4-script')) return
  window.dataLayer = window.dataLayer || []
  window.gtag = function (...args: unknown[]) {
    window.dataLayer.push(args)
  }
  window.gtag('js', new Date())
  window.gtag('config', gaId)
  const script = document.createElement('script')
  script.id = 'ga4-script'
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`
  document.head.appendChild(script)
}

interface CookieConsentInitProps {
  locale: string
  gaId?: string
}

export function CookieConsentInit({ locale, gaId }: CookieConsentInitProps) {
  useEffect(() => {
    const lang = ['it', 'en', 'de'].includes(locale) ? locale : 'it'

    CookieConsent.run({
      categories: {
        necessary: { enabled: true, readOnly: true },
        analytics: {},
      },
      language: {
        default: lang,
        translations: {
          it: {
            consentModal: {
              title: 'Utilizziamo i cookie',
              description:
                "Questo sito usa cookie analitici (Google Analytics) per capire come viene utilizzato. Puoi accettare tutto, rifiutare o personalizzare le tue preferenze.",
              acceptAllBtn: 'Accetta tutto',
              acceptNecessaryBtn: 'Solo necessari',
              showPreferencesBtn: 'Gestisci preferenze',
              footer: '<a href="/it/privacy">Privacy Policy</a>',
            },
            preferencesModal: {
              title: 'Preferenze cookie',
              acceptAllBtn: 'Accetta tutto',
              acceptNecessaryBtn: 'Rifiuta tutto',
              savePreferencesBtn: 'Salva preferenze',
              closeIconLabel: 'Chiudi',
              sections: [
                {
                  title: 'Cookie necessari',
                  description:
                    'Questi cookie sono essenziali per il corretto funzionamento del sito e non possono essere disattivati.',
                  linkedCategory: 'necessary',
                },
                {
                  title: 'Cookie analitici',
                  description:
                    'Google Analytics raccoglie dati anonimi di navigazione (pagine visitate, durata sessione, tipo di dispositivo). I dati sono elaborati da Google LLC (USA) nel rispetto del Data Privacy Framework EU-USA.',
                  linkedCategory: 'analytics',
                  cookieTable: {
                    caption: 'Cookie utilizzati',
                    headers: { name: 'Nome', domain: 'Dominio', desc: 'Descrizione' },
                    body: [
                      { name: '_ga', domain: 'google.com', desc: 'Identificatore utente GA4 (2 anni)' },
                      { name: '_ga_*', domain: 'google.com', desc: 'Stato sessione GA4 (2 anni)' },
                    ],
                  },
                },
              ],
            },
          },
          en: {
            consentModal: {
              title: 'We use cookies',
              description:
                'This site uses analytics cookies (Google Analytics) to understand how it is used. You can accept all, reject, or customise your preferences.',
              acceptAllBtn: 'Accept all',
              acceptNecessaryBtn: 'Necessary only',
              showPreferencesBtn: 'Manage preferences',
              footer: '<a href="/en/privacy">Privacy Policy</a>',
            },
            preferencesModal: {
              title: 'Cookie preferences',
              acceptAllBtn: 'Accept all',
              acceptNecessaryBtn: 'Reject all',
              savePreferencesBtn: 'Save preferences',
              closeIconLabel: 'Close',
              sections: [
                {
                  title: 'Necessary cookies',
                  description:
                    'These cookies are required for the website to function and cannot be disabled.',
                  linkedCategory: 'necessary',
                },
                {
                  title: 'Analytics cookies',
                  description:
                    'Google Analytics collects anonymous browsing data (pages visited, session duration, device type). Data is processed by Google LLC (USA) under the EU-US Data Privacy Framework.',
                  linkedCategory: 'analytics',
                  cookieTable: {
                    caption: 'Cookies used',
                    headers: { name: 'Name', domain: 'Domain', desc: 'Description' },
                    body: [
                      { name: '_ga', domain: 'google.com', desc: 'GA4 user identifier (2 years)' },
                      { name: '_ga_*', domain: 'google.com', desc: 'GA4 session state (2 years)' },
                    ],
                  },
                },
              ],
            },
          },
          de: {
            consentModal: {
              title: 'Wir verwenden Cookies',
              description:
                'Diese Website verwendet Analyse-Cookies (Google Analytics), um zu verstehen, wie sie genutzt wird. Sie können alles akzeptieren, ablehnen oder Ihre Einstellungen anpassen.',
              acceptAllBtn: 'Alle akzeptieren',
              acceptNecessaryBtn: 'Nur notwendige',
              showPreferencesBtn: 'Einstellungen verwalten',
              footer: '<a href="/de/privacy">Datenschutzerklärung</a>',
            },
            preferencesModal: {
              title: 'Cookie-Einstellungen',
              acceptAllBtn: 'Alle akzeptieren',
              acceptNecessaryBtn: 'Alle ablehnen',
              savePreferencesBtn: 'Einstellungen speichern',
              closeIconLabel: 'Schließen',
              sections: [
                {
                  title: 'Notwendige Cookies',
                  description:
                    'Diese Cookies sind für die Funktion der Website erforderlich und können nicht deaktiviert werden.',
                  linkedCategory: 'necessary',
                },
                {
                  title: 'Analyse-Cookies',
                  description:
                    'Google Analytics erfasst anonyme Browsing-Daten (besuchte Seiten, Sitzungsdauer, Gerätetyp). Die Daten werden von Google LLC (USA) im Rahmen des EU-US Data Privacy Framework verarbeitet.',
                  linkedCategory: 'analytics',
                  cookieTable: {
                    caption: 'Verwendete Cookies',
                    headers: { name: 'Name', domain: 'Domain', desc: 'Beschreibung' },
                    body: [
                      { name: '_ga', domain: 'google.com', desc: 'GA4-Benutzerkennung (2 Jahre)' },
                      { name: '_ga_*', domain: 'google.com', desc: 'GA4-Sitzungsstatus (2 Jahre)' },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
      onConsent: () => {
        if (gaId && CookieConsent.acceptedCategory('analytics')) {
          loadGA4(gaId)
        }
      },
      onChange: () => {
        if (gaId && CookieConsent.acceptedCategory('analytics')) {
          loadGA4(gaId)
        }
      },
    })
  }, [locale, gaId])

  return null
}
```

- [ ] **Step 2: Commit**

```bash
git add components/cookie-consent.tsx
git commit -m "feat: add CookieConsentInit component (vanilla-cookieconsent v3)"
```

---

### Task 3: Aggiorna app/globals.css — tema cookie banner

**File:** Modifica `app/globals.css`

- [ ] **Step 1: Aggiungi overrides CSS per il tema**

Aggiungi alla fine del file:

```css
/* vanilla-cookieconsent: allineamento al brand blu */
:root {
  --cc-btn-primary-bg: #366da1;
  --cc-btn-primary-hover-bg: #2d5c8e;
  --cc-btn-primary-text: #fff;
  --cc-toggle-on-bg: #366da1;
  --cc-toggle-on-knob-bg: #fff;
  --cc-separator-border-color: hsl(214 32% 91%);
}
```

- [ ] **Step 2: Commit**

```bash
git add app/globals.css
git commit -m "style: override vanilla-cookieconsent theme with brand colors"
```

---

### Task 4: Aggiorna app/layout.tsx — rimuovi GoogleAnalytics, aggiungi CookieConsentInit

**File:** Modifica `app/layout.tsx`

- [ ] **Step 1: Sostituisci l'import e il componente**

Rimuovi la riga:
```tsx
import { GoogleAnalytics } from '@next/third-parties/google'
```

Aggiungi:
```tsx
import { CookieConsentInit } from '@/components/cookie-consent'
```

- [ ] **Step 2: Sostituisci il JSX**

Vecchio (nell'html dopo body):
```tsx
      {gaId && <GoogleAnalytics gaId={gaId} />}
```

Nuovo (dentro body, prima di children):
```tsx
        <CookieConsentInit locale={locale} gaId={gaId ?? undefined} />
```

Il body risultante:
```tsx
      <body className="min-h-screen flex flex-col bg-background text-foreground">
        <CookieConsentInit locale={locale} gaId={gaId ?? undefined} />
        {children}
      </body>
```

Rimuovi anche `{gaId && <GoogleAnalytics gaId={gaId} />}` che era dopo il `</body>`.

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: replace unconditional GA4 with consent-gated CookieConsentInit"
```

---

### Task 5: Aggiorna messages/it.json — nuove sezioni privacy + footer

**File:** Modifica `messages/it.json`

- [ ] **Step 1: Aggiungi `cookie_settings` nel blocco `footer`**

Blocco footer attuale:
```json
"footer": {
  "copyright": "© {year} Lelettrica. Tutti i diritti riservati.",
  "privacy": "Privacy Policy",
  "vat": "P.IVA"
}
```

Nuovo:
```json
"footer": {
  "copyright": "© {year} Lelettrica. Tutti i diritti riservati.",
  "privacy": "Privacy Policy",
  "cookie_settings": "Impostazioni cookie",
  "vat": "P.IVA"
}
```

- [ ] **Step 2: Sostituisci il blocco `privacy` con la versione estesa**

```json
"privacy": {
  "title": "Privacy Policy",
  "last_updated": "Ultimo aggiornamento: aprile 2026",
  "controller_title": "Titolare del trattamento",
  "data_title": "Dati raccolti",
  "data_body": "Questo sito utilizza Google Analytics (GA4) esclusivamente previo consenso. GA4 raccoglie dati anonimi di navigazione (pagine visitate, durata sessione, tipo di dispositivo). Nessun dato personale identificativo viene raccolto direttamente tramite il sito.",
  "legal_basis_title": "Base giuridica",
  "legal_basis_body": "Il trattamento dei dati analitici avviene sulla base del consenso dell'utente (art. 6, par. 1, lett. a GDPR), espresso tramite il banner cookie al primo accesso. Il consenso può essere revocato in qualsiasi momento.",
  "cookies_title": "Cookie",
  "cookies_body": "Utilizziamo cookie tecnici necessari al funzionamento del sito e, previo consenso, cookie analitici di terze parti (Google Analytics). Il consenso può essere modificato in qualsiasi momento cliccando su \"Impostazioni cookie\" nel footer.",
  "retention_title": "Conservazione dei dati",
  "retention_body": "I dati raccolti tramite Google Analytics vengono conservati per 14 mesi, secondo la configurazione predefinita di GA4.",
  "third_parties_title": "Destinatari dei dati",
  "third_parties_body": "I dati di navigazione sono trasmessi a Google LLC (1600 Amphitheatre Parkway, Mountain View, CA 94043, USA), che agisce in qualità di responsabile del trattamento ai sensi dell'art. 28 GDPR. Google LLC aderisce al Data Privacy Framework EU-USA. Ulteriori informazioni: policies.google.com/privacy.",
  "rights_title": "Diritti dell'interessato",
  "rights_body": "Ai sensi degli artt. 15–22 GDPR hai il diritto di: accedere ai tuoi dati, richiederne la rettifica o la cancellazione, limitarne il trattamento, opporti al trattamento, richiedere la portabilità dei dati e revocare il consenso in qualsiasi momento. Per esercitare questi diritti scrivi a:",
  "contact_title": "Contatti",
  "contact_body": "Per qualsiasi richiesta relativa al trattamento dei dati: info@lelettricaleoni.com"
}
```

- [ ] **Step 3: Commit**

```bash
git add messages/it.json
git commit -m "content(it): expand privacy policy with GDPR sections + cookie_settings key"
```

---

### Task 6: Aggiorna messages/en.json

**File:** Modifica `messages/en.json`

- [ ] **Step 1: Aggiungi `cookie_settings` nel blocco `footer`**

```json
"footer": {
  "copyright": "© {year} Lelettrica. All rights reserved.",
  "privacy": "Privacy Policy",
  "cookie_settings": "Cookie settings",
  "vat": "VAT"
}
```

- [ ] **Step 2: Sostituisci il blocco `privacy`**

```json
"privacy": {
  "title": "Privacy Policy",
  "last_updated": "Last updated: April 2026",
  "controller_title": "Data Controller",
  "data_title": "Data Collected",
  "data_body": "This website uses Google Analytics (GA4) only after obtaining your consent. GA4 collects anonymous browsing data (pages visited, session duration, device type). No personally identifiable data is collected directly through the website.",
  "legal_basis_title": "Legal Basis",
  "legal_basis_body": "The processing of analytics data is based on the user's consent (Art. 6(1)(a) GDPR), given through the cookie banner on first visit. Consent can be withdrawn at any time.",
  "cookies_title": "Cookies",
  "cookies_body": "We use technically necessary cookies for the website to function, and — subject to consent — third-party analytics cookies (Google Analytics). You can update your preferences at any time by clicking \"Cookie settings\" in the footer.",
  "retention_title": "Data Retention",
  "retention_body": "Data collected through Google Analytics is retained for 14 months, as per the default GA4 configuration.",
  "third_parties_title": "Data Recipients",
  "third_parties_body": "Browsing data is transmitted to Google LLC (1600 Amphitheatre Parkway, Mountain View, CA 94043, USA), acting as a data processor under Art. 28 GDPR. Google LLC participates in the EU-US Data Privacy Framework. More information: policies.google.com/privacy.",
  "rights_title": "Your Rights",
  "rights_body": "Under Arts. 15–22 GDPR you have the right to: access your data, request its rectification or erasure, restrict its processing, object to processing, request data portability, and withdraw consent at any time. To exercise these rights, contact us at:",
  "contact_title": "Contact",
  "contact_body": "For any requests related to data processing: info@lelettricaleoni.com"
}
```

- [ ] **Step 3: Commit**

```bash
git add messages/en.json
git commit -m "content(en): expand privacy policy with GDPR sections + cookie_settings key"
```

---

### Task 7: Aggiorna messages/de.json

**File:** Modifica `messages/de.json`

- [ ] **Step 1: Aggiungi `cookie_settings` nel blocco `footer`**

```json
"footer": {
  "copyright": "© {year} Lelettrica. Alle Rechte vorbehalten.",
  "privacy": "Datenschutzerklärung",
  "cookie_settings": "Cookie-Einstellungen",
  "vat": "MwSt.-Nr."
}
```

- [ ] **Step 2: Sostituisci il blocco `privacy`**

```json
"privacy": {
  "title": "Datenschutzerklärung",
  "last_updated": "Zuletzt aktualisiert: April 2026",
  "controller_title": "Verantwortlicher",
  "data_title": "Erhobene Daten",
  "data_body": "Diese Website verwendet Google Analytics (GA4) nur nach Ihrer Einwilligung. GA4 erfasst anonyme Browsing-Daten (besuchte Seiten, Sitzungsdauer, Gerätetyp). Über die Website werden keine personenbezogenen Daten direkt erhoben.",
  "legal_basis_title": "Rechtsgrundlage",
  "legal_basis_body": "Die Verarbeitung analytischer Daten erfolgt auf Grundlage der Einwilligung des Nutzers (Art. 6 Abs. 1 lit. a DSGVO), die beim ersten Besuch über das Cookie-Banner erteilt wird. Die Einwilligung kann jederzeit widerrufen werden.",
  "cookies_title": "Cookies",
  "cookies_body": "Wir verwenden technisch notwendige Cookies sowie — nach Einwilligung — Analyse-Cookies von Drittanbietern (Google Analytics). Die Einstellungen können jederzeit über „Cookie-Einstellungen" in der Fußzeile geändert werden.",
  "retention_title": "Datenspeicherung",
  "retention_body": "Die über Google Analytics erhobenen Daten werden entsprechend der Standard-GA4-Konfiguration 14 Monate lang gespeichert.",
  "third_parties_title": "Datenempfänger",
  "third_parties_body": "Browsing-Daten werden an Google LLC (1600 Amphitheatre Parkway, Mountain View, CA 94043, USA) übermittelt, die gemäß Art. 28 DSGVO als Auftragsverarbeiter tätig ist. Google LLC nimmt am EU-US Data Privacy Framework teil. Weitere Informationen: policies.google.com/privacy.",
  "rights_title": "Betroffenenrechte",
  "rights_body": "Gemäß Art. 15–22 DSGVO haben Sie das Recht auf: Auskunft, Berichtigung oder Löschung Ihrer Daten, Einschränkung der Verarbeitung, Widerspruch, Datenübertragbarkeit sowie jederzeitigen Widerruf Ihrer Einwilligung. Zur Ausübung dieser Rechte wenden Sie sich an:",
  "contact_title": "Kontakt",
  "contact_body": "Für alle Anfragen zum Datenschutz: info@lelettricaleoni.com"
}
```

- [ ] **Step 3: Commit**

```bash
git add messages/de.json
git commit -m "content(de): expand privacy policy with GDPR sections + cookie_settings key"
```

---

### Task 8: Aggiorna app/[lang]/privacy/page.tsx — nuove sezioni

**File:** Modifica `app/[lang]/privacy/page.tsx`

- [ ] **Step 1: Aggiungi le nuove sezioni nel JSX**

Sostituisci il blocco `<div className="space-y-8 text-foreground">` con:

```tsx
          <div className="space-y-8 text-foreground">
            <section>
              <h2 className="text-lg font-semibold mb-3">{p.controller_title}</h2>
              <p className="text-muted-foreground leading-relaxed">
                Leoni Gabriele — Via Roma, 90, 38074 Dro (TN), Italia<br />
                info@lelettricaleoni.com
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3">{p.data_title}</h2>
              <p className="text-muted-foreground leading-relaxed">{p.data_body}</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3">{p.legal_basis_title}</h2>
              <p className="text-muted-foreground leading-relaxed">{p.legal_basis_body}</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3">{p.cookies_title}</h2>
              <p className="text-muted-foreground leading-relaxed">{p.cookies_body}</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3">{p.retention_title}</h2>
              <p className="text-muted-foreground leading-relaxed">{p.retention_body}</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3">{p.third_parties_title}</h2>
              <p className="text-muted-foreground leading-relaxed">{p.third_parties_body}</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3">{p.rights_title}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {p.rights_body}{' '}
                <a href="mailto:info@lelettricaleoni.com" className="text-primary hover:underline">
                  info@lelettricaleoni.com
                </a>
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3">{p.contact_title}</h2>
              <p className="text-muted-foreground leading-relaxed">{p.contact_body}</p>
            </section>
          </div>
```

- [ ] **Step 2: Commit**

```bash
git add "app/[lang]/privacy/page.tsx"
git commit -m "feat: add GDPR sections to privacy policy page"
```

---

### Task 9: Aggiorna components/footer.tsx — pulsante cookie settings

**File:** Modifica `components/footer.tsx`

- [ ] **Step 1: Aggiorna la FooterProps interface**

Vecchia:
```tsx
interface FooterProps {
  lang: string
  dict: {
    footer: {
      copyright: string
      privacy: string
      vat: string
    }
  }
}
```

Nuova:
```tsx
interface FooterProps {
  lang: string
  dict: {
    footer: {
      copyright: string
      privacy: string
      cookie_settings: string
      vat: string
    }
  }
}
```

- [ ] **Step 2: Aggiungi il pulsante cookie settings nel footer**

Nella riga del footer inferiore (dopo il link Privacy Policy), aggiungi:

```tsx
          <button
            type="button"
            data-cc="show-preferencesModal"
            className="hover:text-white/70 transition-colors cursor-pointer"
          >
            {dict.footer.cookie_settings}
          </button>
```

Il blocco `flex flex-col sm:flex-row` risultante:

```tsx
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/40">
          <p>{copyright}</p>
          <p className="text-white/30">
            {dict.footer.vat} 02622600225 • LELETTRICA DI LEONI GABRIELE
          </p>
          <div className="flex items-center gap-4">
            <Link
              href={`/${lang}/privacy`}
              className="hover:text-white/70 transition-colors"
            >
              {dict.footer.privacy}
            </Link>
            <button
              type="button"
              data-cc="show-preferencesModal"
              className="hover:text-white/70 transition-colors cursor-pointer"
            >
              {dict.footer.cookie_settings}
            </button>
          </div>
        </div>
```

- [ ] **Step 3: Commit**

```bash
git add components/footer.tsx
git commit -m "feat: add cookie settings button to footer"
```

---

### Task 10: Verifica finale

- [ ] **Step 1: Build**

```bash
npm run build
```

Risultato atteso: nessun errore TypeScript, nessun warning critico.

- [ ] **Step 2: Dev server + test visivo**

```bash
npm run dev
```

Aprire http://localhost:3000 e verificare:
- Banner cookie appare al primo caricamento
- "Solo necessari" / "Accetta tutto" funzionano
- "Gestisci preferenze" apre il modal con le categorie
- Dopo aver accettato analytics, GA4 si carica (Network tab: richiesta a `googletagmanager.com`)
- Dopo aver rifiutato, GA4 NON si carica
- Footer mostra "Impostazioni cookie" e cliccando riapre il modal preferenze
- Pagina `/it/privacy` mostra tutte le sezioni nuove

- [ ] **Step 3: Test lingua EN e DE**

Navigare su `/en` e `/de` e verificare che il banner sia nella lingua corretta.

- [ ] **Step 4: Commit finale se tutto ok**

```bash
git add -A
git commit -m "chore: verify GDPR compliance implementation complete"
```
