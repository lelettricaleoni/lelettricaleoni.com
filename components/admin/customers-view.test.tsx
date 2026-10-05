import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CustomerView, CustomersView } from './customers-view'
import type { CustomerDetail, CustomerListItem } from '@/lib/customers'

const mario: CustomerListItem = {
  id: 'c1', firstName: 'Mario', lastName: 'Rossi', email: 'mario@example.com', phone: '+393471234567', notes: null,
  rentals: 3, revenueCents: 12550, lastRentalOn: '2031-08-01',
}
const nobody: CustomerListItem = { ...mario, id: 'c2', firstName: 'Anna', lastName: 'Bianchi', email: null, phone: null, rentals: 0, revenueCents: 0, lastRentalOn: null }

const list = (customers: CustomerListItem[], query = '') =>
  renderToStaticMarkup(createElement(CustomersView, { customers, query }))

describe('CustomersView', () => {
  it('lists each customer with a link to the page, the contacts, the rentals and the total', () => {
    const html = list([mario])
    expect(html).toContain('href="/manage/customers/c1"')
    expect(html).toContain('Mario Rossi')
    expect(html).toContain('+393471234567 · mario@example.com')
    expect(html).toMatch(/125,50\s?€/)
    expect(html).toContain('2031-08-01')
  })

  it('adds up the total of the people shown, and says how many', () => {
    const html = list([mario, nobody])
    expect(html).toContain('2 customers')
    expect(html).toMatch(/125,50\s?€ in total/)
  })

  it('shows dashes for a customer with no contacts and no rentals, not blanks', () => {
    const html = list([nobody])
    expect(html).toContain('1 customer ')
    expect(html.match(/—/g)?.length).toBe(2) // contact and last rental
  })

  it('keeps the search text in the box, offers to clear it, and says when nobody matches', () => {
    const html = list([], 'zzz')
    expect(html).toContain('value="zzz"')
    expect(html).toContain('Clear')
    expect(html).toContain('Nobody matches that search.')
  })

  it('says there are none yet when there is no search either', () => {
    const html = list([])
    expect(html).toContain('No customers yet.')
    expect(html).not.toContain('Clear')
  })
})

const detail: CustomerDetail = {
  customer: { id: 'c1', firstName: 'Mario', lastName: 'Rossi', email: 'mario@example.com', phone: '+393471234567', notes: 'casco M' },
  stats: { rentals: 2, revenueCents: 5500, firstRentalOn: '2031-07-10', lastRentalOn: '2031-09-01' },
  rentals: [
    { id: 'r3', startsOn: '2031-09-01', endsOn: '2031-09-02', status: 'confirmed', amountCents: 1000, bike: 'Flyer · M · Alu · aaaa1111' },
    { id: 'r2', startsOn: '2031-08-01', endsOn: '2031-08-03', status: 'cancelled', amountCents: 3000, bike: 'Flyer · M · Alu · bbbb2222' },
    { id: 'r1', startsOn: '2031-07-10', endsOn: '2031-07-13', status: 'confirmed', amountCents: 4500, bike: 'Flyer · M · Alu · cccc3333' },
  ],
}

describe('CustomerView', () => {
  const html = renderToStaticMarkup(createElement(CustomerView, { detail }))

  it('shows the contacts as links to call and write, and the notes', () => {
    expect(html).toContain('href="tel:+393471234567"')
    expect(html).toContain('href="mailto:mario@example.com"')
    expect(html).toContain('casco M')
  })

  it('shows the numbers: rentals, total paid, last rental', () => {
    expect(html).toContain('>2<')
    expect(html).toMatch(/55\s?€/)
    expect(html).toContain('2031-09-01')
  })

  it('lists every rental with the last day included, and marks the cancelled one without counting it', () => {
    expect(html).toContain('2031-07-10 to 2031-07-12')
    expect(html).toContain('Cancelled')
    expect(html).toContain('cancelled ones are not counted above')
    expect(html.split('Cancelled').length - 1).toBe(1) // one badge, for the one cancelled rental
  })

  it('has the edit button', () => {
    expect(html).toContain('Edit details')
  })

  it('says so when there are no contacts and no rentals', () => {
    const empty = renderToStaticMarkup(createElement(CustomerView, {
      detail: { customer: { ...detail.customer, email: null, phone: null, notes: null }, stats: { rentals: 0, revenueCents: 0, firstRentalOn: null, lastRentalOn: null }, rentals: [] },
    }))
    expect(empty).toContain('No contacts saved.')
    expect(empty).toContain('No rentals yet.')
  })
})
