import { describe, it, expect } from 'vitest'
import { needsRetranslation } from './translations'

const testo = (name: string, description: string) => ({ name, description })

describe('needsRetranslation', () => {
  it('ritraduce quando il nome cambia', () => {
    expect(needsRetranslation(testo('Vecchio', 'uguale'), testo('Nuovo', 'uguale'))).toBe(true)
  })

  it('ritraduce quando cambia la descrizione', () => {
    expect(needsRetranslation(testo('uguale', 'Vecchia'), testo('uguale', 'Nuova'))).toBe(true)
  })

  it('non chiama il traduttore se l’italiano è identico', () => {
    // Il caso che conta per il costo: salvare per cambiare la distanza o
    // riordinare le foto non deve pagare una traduzione.
    expect(needsRetranslation(testo('Uguale', 'Uguale'), testo('Uguale', 'Uguale'))).toBe(false)
  })

  it('ritraduce se non esiste ancora una versione italiana', () => {
    expect(needsRetranslation(undefined, testo('Primo', 'salvataggio'))).toBe(true)
  })

  it('rispetta la forzatura anche su testo immutato', () => {
    // Serve quando una traduzione è venuta male e vale un secondo tentativo.
    expect(needsRetranslation(testo('Uguale', 'Uguale'), testo('Uguale', 'Uguale'), true)).toBe(true)
  })

  it('distingue differenze che sembrano invisibili', () => {
    expect(needsRetranslation(testo('Giro', 'testo'), testo('Giro ', 'testo'))).toBe(true)
    expect(needsRetranslation(testo('Giro', 'testo'), testo('giro', 'testo'))).toBe(true)
  })
})
