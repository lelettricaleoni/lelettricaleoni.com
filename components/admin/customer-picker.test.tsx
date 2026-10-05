import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// The picker calls Server Actions that talk to the database: nothing of that runs in a static render.
vi.mock('@/lib/actions/customers', () => ({ createCustomerAction: vi.fn(), searchCustomersAction: vi.fn() }))

import { CustomerPicker } from './customer-picker'

const render = (value: Parameters<typeof CustomerPicker>[0]['value'] = null) =>
  renderToStaticMarkup(createElement(CustomerPicker, { value, onChange: () => {} }))

describe('CustomerPicker', () => {
  it('puts the New customer button on the same row as the search box, not under it', () => {
    const html = render()
    // The input and the button share one flex row: the button comes right after the input, inside the same element.
    expect(html).toMatch(/<div class="flex[^"]*"><input[^>]*aria-label="Search customers"[^>]*\/><button[^>]*>.*?New customer<\/button><\/div>/)
  })

  it('shows the chosen customer with a way to change them, and no search box', () => {
    const html = render({ id: 'c1', firstName: 'Mario', lastName: 'Rossi', email: null, phone: '+393471234567', notes: null })
    expect(html).toContain('Mario Rossi')
    expect(html).toContain('Change')
    expect(html).not.toContain('Search customers')
  })
})
