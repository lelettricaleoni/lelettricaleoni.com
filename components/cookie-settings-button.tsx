'use client'
import * as CookieConsent from 'vanilla-cookieconsent'

export function CookieSettingsButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => CookieConsent.showPreferences()}
      className="hover:text-white/70 transition-colors cursor-pointer"
    >
      {label}
    </button>
  )
}
