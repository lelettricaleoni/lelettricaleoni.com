/*
 * Money is stored in whole cents (an integer), never as a float of euros: 0.1 + 0.2 is not 0.3.
 * Only the form speaks euros; the conversion lives here and nowhere else.
 */

/** Euros typed in a form → whole cents. */
export function toCents(euros: number): number {
  return Math.round(euros * 100)
}

const euros = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 })
const eurosWithCents = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })

/** "45 €", "45,50 €", "1.234,56 €": cents are shown only when there are some. */
export function formatEuros(cents: number): string {
  return (cents % 100 === 0 ? euros : eurosWithCents).format(cents / 100)
}
