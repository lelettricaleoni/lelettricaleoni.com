'use client'

import { useEffect } from 'react'
import 'vanilla-cookieconsent/dist/cookieconsent.css'
import * as CookieConsent from 'vanilla-cookieconsent'

declare global {
  interface Window {
    gtag: (...args: unknown[]) => void
    dataLayer?: unknown[]
  }
}

function loadGA4(gaId: string) {
  if (document.getElementById('ga4-script')) return
  window.dataLayer = window.dataLayer || []
  window.gtag = function (...args: unknown[]) {
    window.dataLayer!.push(args as object)
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
        } else if (gaId && window.gtag) {
          window.gtag('consent', 'update', { analytics_storage: 'denied' })
        }
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
