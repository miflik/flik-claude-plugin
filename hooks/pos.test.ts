import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { EngineInterface, McpToolResult, On } from 'claude-code'

import {
  cartTotals,
  checkoutItems,
  money,
  parseClients,
  parseDiscount,
  parseNumber,
  parsePosArgs,
  parseSearchHits,
} from './pos-core'

const PANE_PROPS = {
  title: 'Flik POS',
  isFocused: true,
  bodyColumns: 56,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
}

const SURFACES = ['terminal', 'desktop'] as const

type Call = { tool: string; args: Record<string, unknown> }

/** Fakes the Flik connector beneath the plugin and records every call. */
function fakeFlik(on: On, options: { textOnly?: boolean; buildError?: string } = {}) {
  const calls: Call[] = []

  // The plugin's own server, as a session names it once connected.
  on('mcp.connect', (_: EngineInterface, e: { server: string }) => ({
    value: { isConnected: true as const, server: `plugin:flik:${e.server}` },
  }))

  // An op event answers `{ value }`: the McpToolResult the plugin's $.mcp.call resolves to.
  on('mcp.call', (_: EngineInterface, e: { server: string; tool: string; args: Record<string, unknown> }) => {
    expect(e.server).toBe('plugin:flik:flik')

    return { value: answer(e) }
  })

  function answer(e: { tool: string; args: Record<string, unknown> }): McpToolResult {
    calls.push({ tool: e.tool, args: e.args })
    const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }], isError: false })

    switch (e.tool) {
      case 'list_businesses':
        return options.textOnly
          ? text('2 business(es):\n\n- Point (biz1) [in use]\n- Depósito (biz2)')
          : {
              ...text('2 business(es)'),
              structuredContent: {
                businesses: [
                  { id: 'biz1', name: 'Point', inUse: true },
                  { id: 'biz2', name: 'Depósito', inUse: false },
                ],
              },
            }
      case 'search_products':
        return options.textOnly
          ? text(
              'Found 2 products matching "galle" for business "Point":\n\n' +
                '1. GALLETAS LINCOLN - $1700.00 (Stock: 4) [Barcode: 779] — ID: p1\n' +
                '2. GALLETITAS AGUA - $900.00 — ID: p2',
            )
          : {
              ...text('Found 2 products'),
              structuredContent: {
                query: 'galle',
                found: 2,
                page: 1,
                hits: [
                  { productId: 'p1', name: 'GALLETAS LINCOLN', price: 1700, stock: 4, barcode: '779', sku: null, isActive: true },
                  { productId: 'p2', name: 'GALLETITAS AGUA', price: 900, stock: null, barcode: null, sku: null, isActive: true },
                ],
              },
            }
      case 'list_clients':
        return options.textOnly
          ? text('Found 1 client for business "Point":\n\n1. **Ana Pérez** (ID: c1) | Phone: 11')
          : {
              ...text('Found 1 client'),
              structuredContent: { found: 1, page: 1, clients: [{ clientId: 'c1', name: 'Ana Pérez', isActive: true, email: null, phone: '11', taxId: null, identificationNumber: null }] },
            }
      case 'build_sale': {
        if (options.buildError) return { content: [{ type: 'text' as const, text: options.buildError }], isError: true }
        const items = e.args.items as Array<{ quantity: number; price?: number }>
        const subtotal = items.reduce((s, i) => s + i.quantity * (i.price ?? 1700), 0)
        const discount = e.args.discount as { type: string; value: number } | undefined
        const off = discount ? (discount.type === 'percent' ? (subtotal * discount.value) / 100 : discount.value) : 0

        return { ...text(`Sale ready\n\nTotal: $${(subtotal - off).toFixed(2)}`), structuredContent: { status: 'pending', token: 'tok-1', total: subtotal - off } }
      }
      case 'complete_sale':
        return {
          ...text('Sale completed (#42). Total: $3400.00 (cash).'),
          structuredContent: { status: 'completed', saleId: 'sale1', saleNumber: 42, total: 3400, warnings: ['No open cash register session'] },
        }
      default:
        return { content: [{ type: 'text' as const, text: `unknown tool ${e.tool}` }], isError: true }
    }
  }

  return calls
}

async function mountPane($: Engine, surface: (typeof SURFACES)[number]) {
  return $.ui.mount({ plugin: 'flik', surface, component: 'Pane', requestId: 'flik-pos', props: PANE_PROPS })
}

/** Opens the pane and picks the first business, as the first run does. */
async function mountWithBusiness($: Engine, surface: (typeof SURFACES)[number]) {
  const pane = await mountPane($, surface)

  await pane.press({ key: 'biz-view' })
  expect(await pane.find({ key: 'biz-1', text: /Depósito/ })).toBeDefined()
  await pane.press({ key: 'biz-0' })
  expect(await pane.find({ type: 'Text', text: /Flik POS · Point/ })).toBeDefined()

  return pane
}

test('pure helpers: money, numbers, discounts, args', () => {
  expect(money(1234.5)).toBe('$1.234,50')
  expect(money(0)).toBe('$0,00')
  expect(parseNumber('1.500,50')).toBe(1500.5)
  expect(parseNumber('1500')).toBe(1500)
  expect(parseNumber('abc')).toBeNull()
  expect(parseDiscount('10%')).toEqual({ type: 'percent', value: 10 })
  expect(parseDiscount('500')).toEqual({ type: 'amount', value: 500 })
  expect(parseDiscount('')).toBeNull()
  expect(parseDiscount('150%')).toEqual({ error: expect.stringMatching(/100%/) })
  expect(cartTotals({ items: [{ productId: 'p', name: 'x', listPrice: 100, price: 90, quantity: 3, stock: null }], discount: { type: 'percent', value: 10 } })).toEqual({ subtotal: 270, discount: 27, total: 243 })
  expect(parsePosArgs('park tarde noche')).toEqual({ kind: 'park', label: 'tarde noche' })
  expect(parsePosArgs('resume 2')).toEqual({ kind: 'resume', index: 1 })
  expect(parsePosArgs('')).toEqual({ kind: 'open' })
  expect(parsePosArgs('wat')).toEqual({ kind: 'help' })
})

test('parsers read structured content and fall back to the text lines', () => {
  const textOnly = {
    content: [{ type: 'text', text: '1. GALLETAS LINCOLN - $1700.00 (Stock: -1) [Barcode: 779] — ID: p1\n2. AGUA - $900.00 — ID: p2' }],
    isError: false,
  }

  expect(parseSearchHits(textOnly)).toEqual([
    { productId: 'p1', name: 'GALLETAS LINCOLN', price: 1700, stock: -1 },
    { productId: 'p2', name: 'AGUA', price: 900, stock: null },
  ])
  expect(parseSearchHits({ ...textOnly, structuredContent: { hits: [{ productId: 'z', name: 'Z', price: 1, stock: 2 }] } })).toEqual([
    { productId: 'z', name: 'Z', price: 1, stock: 2 },
  ])
  expect(parseClients({ content: [{ type: 'text', text: '1. **Ana Pérez** (ID: c1) | Phone: 11' }], isError: false })).toEqual([{ clientId: 'c1', name: 'Ana Pérez' }])
})

test('search, add, override the price and complete a sale on every keyboard surface', async ($, on) => {
  mock.store(on)
  const calls = fakeFlik(on)

  for (const surface of SURFACES) {
    calls.length = 0
    const pane = await mountWithBusiness($, surface)

    await pane.input({ key: 'q', text: 'galle' })
    expect(calls.at(-1)).toEqual({ tool: 'search_products', args: { business_id: 'biz1', q: 'galle', limit: 9 } })
    expect(await pane.find({ key: 'hit-0', text: /GALLETAS LINCOLN/ })).toBeDefined()

    await pane.press({ key: 'hit-0' })
    expect(await pane.find({ key: 'hit-0' })).toBeUndefined() // hits clear after an add
    expect(await pane.find({ type: 'Text', text: /Total \$1\.700,00/ })).toBeDefined()

    await pane.press({ key: 'qty-inc-0' })
    expect(await pane.find({ type: 'Text', text: /Total \$3\.400,00/ })).toBeDefined()

    await pane.press({ key: 'price-0' })
    await pane.input({ key: 'edit', text: '1500' })
    expect(await pane.find({ type: 'Text', text: /Total \$3\.000,00/ })).toBeDefined()

    await pane.press({ key: 'checkout' })
    const build = calls.find(c => c.tool === 'build_sale')

    expect(build?.args).toEqual({
      business_id: 'biz1',
      paymentMethod: 'cash',
      items: [{ product: 'p1', quantity: 2, price: 1500 }],
    })
    expect(calls.at(-1)).toEqual({ tool: 'complete_sale', args: { business_id: 'biz1', token: 'tok-1' } })
    expect(await pane.find({ type: 'Text', text: /Venta #42 cobrada/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /No open cash register/ })).toBeDefined()

    await pane.press({ key: 'again' })
    expect(await pane.find({ type: 'Text', text: /Carrito vacío/ })).toBeDefined()
    await pane.unmount()
  }
})

test('works against a server that answers text only', async ($, on) => {
  mock.store(on)
  const calls = fakeFlik(on, { textOnly: true })
  const pane = await mountWithBusiness($, 'terminal')

  await pane.input({ key: 'q', text: 'galle' })
  expect(await pane.find({ key: 'hit-1', text: /GALLETITAS AGUA/ })).toBeDefined()
  await pane.press({ key: 'hit-1' })
  expect(await pane.find({ type: 'Text', text: /Total \$900,00/ })).toBeDefined()
  expect(calls.map(c => c.tool)).toEqual(['list_businesses', 'search_products'])
  await pane.unmount()
})

test('fiado needs a client; the discount and client travel to build_sale', async ($, on) => {
  mock.store(on)
  const calls = fakeFlik(on)
  const pane = await mountWithBusiness($, 'terminal')

  await pane.input({ key: 'q', text: 'galle' })
  await pane.press({ key: 'hit-0' })
  await pane.select({ key: 'pay', value: 'debt' })
  await pane.press({ key: 'checkout' })
  expect(calls.some(c => c.tool === 'build_sale')).toBe(false)
  expect(await pane.find({ type: 'Text', text: /necesita un cliente/ })).toBeDefined()

  await pane.press({ key: 'client' })
  await pane.input({ key: 'cq', text: 'ana' })
  expect(calls.at(-1)).toEqual({ tool: 'list_clients', args: { business_id: 'biz1', limit: 9, search: 'ana' } })
  await pane.press({ key: 'client-0' })
  expect(await pane.find({ type: 'Text', text: /Ana Pérez/ })).toBeDefined()

  await pane.press({ key: 'discount' })
  await pane.input({ key: 'disc', text: '10%' })
  expect(await pane.find({ type: 'Text', text: /Desc -\$170,00 \(10%\)/ })).toBeDefined()

  await pane.press({ key: 'checkout' })
  const build = calls.find(c => c.tool === 'build_sale')

  expect(build?.args).toEqual({
    business_id: 'biz1',
    paymentMethod: 'debt',
    items: [{ product: 'p1', quantity: 1 }],
    client_id: 'c1',
    discount: { type: 'percent', value: 10 },
  })
  await pane.unmount()
})

test('a build_sale error keeps the cart and never completes', async ($, on) => {
  mock.store(on)
  const calls = fakeFlik(on, { buildError: 'Search is not configured on this server' })
  const pane = await mountWithBusiness($, 'terminal')

  await pane.input({ key: 'q', text: 'galle' })
  await pane.press({ key: 'hit-0' })
  await pane.press({ key: 'checkout' })

  expect(calls.map(c => c.tool)).toEqual(['list_businesses', 'search_products', 'build_sale'])
  expect(await pane.find({ type: 'Text', text: /Search is not configured/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /Total \$1\.700,00/ })).toBeDefined()
  await pane.unmount()
})

test('park and resume keep carts in the store', async ($, on) => {
  mock.store(on)
  fakeFlik(on)
  const pane = await mountWithBusiness($, 'terminal')

  await pane.input({ key: 'q', text: 'galle' })
  await pane.press({ key: 'hit-0' })
  await pane.press({ key: 'park' })
  expect(await pane.find({ type: 'Text', text: /Carrito vacío/ })).toBeDefined()
  expect(await pane.find({ key: 'parked-view', text: /guardados\(1\)/ })).toBeDefined()

  await pane.press({ key: 'parked-view' })
  expect(await pane.find({ key: 'parked-0', text: /1 ít/ })).toBeDefined()
  await pane.press({ key: 'parked-0' })
  expect(await pane.find({ type: 'Text', text: /Total \$1\.700,00/ })).toBeDefined()
  expect(await pane.find({ key: 'parked-view', text: /guardados\(0\)/ })).toBeDefined()
  await pane.unmount()
})

test('the mobile surface shows a read-only summary with no fields', async ($, on) => {
  mock.store(on)
  const pane = await $.ui.mount({ plugin: 'flik', surface: 'mobile', component: 'Pane', requestId: 'flik-pos', props: PANE_PROPS })

  expect(await pane.find({ type: 'Text', text: /teclado/ })).toBeDefined()
  expect(await pane.findAll({ type: 'Button' })).toHaveLength(0)
  await pane.unmount()
})

test('checkoutItems sends an override only where the price differs', () => {
  const tab = {
    id: 't',
    label: 'Venta',
    items: [
      { productId: 'a', name: 'A', listPrice: 10, price: 10, quantity: 1, stock: null },
      { productId: 'b', name: 'B', listPrice: 10, price: 8, quantity: 2, stock: null },
    ],
    paymentMethod: 'cash' as const,
    discount: null,
    clientId: null,
    clientName: null,
    createdAt: 0,
  }

  expect(checkoutItems(tab)).toEqual([
    { product: 'a', quantity: 1 },
    { product: 'b', quantity: 2, price: 8 },
  ])
})
