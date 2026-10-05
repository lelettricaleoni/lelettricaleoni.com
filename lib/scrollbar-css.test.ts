import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Thin scrollbars without arrow buttons. Chromium and Safari only draw them without arrows through the
 * `::-webkit-scrollbar` pieces; but from Chrome 121 on, as soon as the standard `scrollbar-width` or
 * `scrollbar-color` is set on an element, those pieces are IGNORED for it and the default scrollbar,
 * arrows included, comes back. So the standard properties are for the browsers that have no webkit
 * pieces (Firefox) and must never be set where the webkit ones are in use.
 */
// The working tree may have CRLF line endings; the patterns below are written for LF.
const css = readFileSync('app/globals.css', 'utf8').split('\r\n').join('\n')

describe('the global scrollbar style', () => {
  it('hides the arrow buttons and rounds the thumb', () => {
    expect(css).toMatch(/::-webkit-scrollbar-button\s*\{[^}]*display:\s*none/)
    expect(css).toMatch(/::-webkit-scrollbar-thumb\s*\{[^}]*border-radius/)
  })

  it('sets the standard scrollbar properties only for browsers without the webkit pieces', () => {
    // Comments may talk about the properties; only declarations count.
    const declarations = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const outsideTheFallback = declarations.replace(/@supports not selector\(::-webkit-scrollbar\)\s*\{[\s\S]*?\n\}\n/, '')
    expect(outsideTheFallback).not.toMatch(/scrollbar-width|scrollbar-color/)
    expect(declarations).toMatch(/@supports not selector\(::-webkit-scrollbar\)[\s\S]*scrollbar-width:\s*thin/)
  })
})
