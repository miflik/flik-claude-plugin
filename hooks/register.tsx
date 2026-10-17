import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PaymentMethod, PosBusiness, PosCart, PosTab, PosUi } from '../types'
import {
  HELP_TEXT,
  PAYMENT_METHODS,
  addHit,
  barcodeOf,
  cartTotals,
  changeQuantity,
  checkoutItems,
  checkoutProblem,
  compileBarcodePattern,
  describeParked,
  money,
  newTab,
  parseBuilt,
  parseBusinesses,
  parseClients,
  parseCompleted,
  parseDiscount,
  parseNumber,
  parsePosArgs,
  parseSearchHits,
  paymentLabel,
  textOf,
  truncate,
  type ToolResult,
} from './pos-core'

// The Flik MCP server this plugin bundles (.mcp.json → https://miflik.com/api/mcp).
// `$.mcp.connect` answers the name the session runs it under (`plugin:flik:flik`),
// or the one an already-connected copy uses; the claude.ai connector is the
// fallback for a session that has that attached instead.
const FLIK_SERVER_KEY = 'flik'
const FLIK_FALLBACK = 'claude.ai Flik'
const PANE = 'flik-pos'

let flikServer: string | null = null

async function resolveFlik($: Dollar): Promise<string> {
  if (flikServer) return flikServer
  const connected = await $.mcp.connect(FLIK_SERVER_KEY).catch(() => null)

  flikServer = connected?.isConnected ? connected.server : FLIK_FALLBACK

  return flikServer
}
const MAX_HITS = 9

// Scanner options, set from `userConfig` each time register() runs.
let barcodePattern = compileBarcodePattern(undefined)
let scanFromPrompt = true

const first = newTab()
const business = atom({ plugin: 'flik', key: 'business' } as const, null)
const cart = atom({ plugin: 'flik', key: 'cart' } as const, {
  tabs: [first],
  activeTabId: first.id,
})
const parked = atom({ plugin: 'flik', key: 'parked' } as const, [])
const ui = atom({ plugin: 'flik', key: 'ui' } as const, {
  view: 'cart',
  status: null,
  isOpen: false,
  editIndex: null,
  isDiscountOpen: false,
  search: { query: '', hits: [] },
  clients: { query: '', hits: [] },
  businesses: [],
  lastSale: null,
})

type Dollar = EngineInterface

function activeTab(state: PosCart): PosTab {
  return state.tabs.find(t => t.id === state.activeTabId) ?? (state.tabs[0] as PosTab)
}

async function updateTab($: Dollar, fn: (tab: PosTab) => PosTab): Promise<PosCart> {
  const next = await update($, cart, state => ({
    ...state,
    tabs: state.tabs.map(t => (t.id === state.activeTabId ? fn(t) : t)),
  }))

  await syncStatus($, next)

  return next
}

async function setUi($: Dollar, patch: Partial<PosUi>): Promise<PosUi> {
  return update($, ui, state => ({ ...state, ...patch }))
}

async function setStatus($: Dollar, status: PosUi['status']): Promise<void> {
  await setUi($, { status })
}

async function syncStatus($: Dollar, state?: PosCart): Promise<void> {
  const current = state ?? (await read($, cart))
  const biz = await read($, business)
  const tab = activeTab(current)
  const { total } = cartTotals(tab)
  const where = biz ? ` · ${biz.name}` : ''

  $.ui.status(
    tab.items.length === 0 ? undefined : `POS${where} · ${tab.items.length} ít · ${money(total)}`,
  )
}

/** One MCP call with the busy flag around it; an error becomes a status line. */
async function callFlik(
  $: Dollar,
  tool: string,
  args: Record<string, unknown>,
  busy: string,
): Promise<ToolResult | null> {
  const state = await read($, ui)

  if (state.status?.kind === 'busy') return null
  await setStatus($, { kind: 'busy', text: busy })

  try {
    const result = (await $.mcp.call(await resolveFlik($), tool, args)) as ToolResult

    if (result.isError) {
      await setStatus($, { kind: 'error', text: textOf(result) || `${tool} falló` })

      return null
    }
    await setStatus($, null)

    return result
  } catch (error) {
    await setStatus($, {
      kind: 'error',
      text: `${tool}: ${error instanceof Error ? error.message : String(error)}`,
    })

    return null
  }
}

async function loadBusinesses($: Dollar): Promise<void> {
  await setUi($, { view: 'business' })
  const result = await callFlik($, 'list_businesses', {}, 'Cargando negocios…')

  if (!result) return
  const businesses = parseBusinesses(result)

  await setUi($, { businesses })
  if (businesses.length === 0) {
    await setStatus($, { kind: 'error', text: 'Esta cuenta no tiene negocios en Flik.' })
  }
}

async function chooseBusiness($: Dollar, chosen: PosBusiness): Promise<void> {
  await update($, business, () => chosen)
  await $.store.set('business', chosen)
  await setUi($, { view: 'cart', businesses: [] })
  await syncStatus($)
}

/** What a search did: a line added outright, hits shown, or nothing found. */
type SearchOutcome = { kind: 'added'; name: string } | { kind: 'hits'; count: number } | { kind: 'none' }

async function search($: Dollar, query: string): Promise<SearchOutcome> {
  const q = query.trim()
  const biz = await read($, business)
  const view = await read($, ui)

  if (q === '') {
    await setUi($, { search: { query: '', hits: [] } })

    return { kind: 'none' }
  }

  // A single digit while hits are shown picks that hit: the keyboard never
  // leaves the field, which is what a scanner-driven counter needs.
  if (/^[1-9]$/.test(q) && view.search.hits.length > 0) {
    const hit = view.search.hits[Number(q) - 1]

    if (hit) {
      await addToCart($, hit)

      return { kind: 'added', name: hit.name }
    }
  }
  if (!biz) {
    await loadBusinesses($)

    return { kind: 'none' }
  }

  const result = await callFlik(
    $,
    'search_products',
    { business_id: biz.id, q, limit: MAX_HITS },
    `Buscando "${q}"…`,
  )

  if (!result) return { kind: 'none' }
  const hits = parseSearchHits(result)

  // A scanned barcode resolves to one product: straight into the cart.
  if (hits.length === 1 && barcodeOf(q, barcodePattern) !== null) {
    await addToCart($, hits[0]!)

    return { kind: 'added', name: hits[0]!.name }
  }

  await setUi($, { search: { query: q, hits } })
  if (hits.length === 0) {
    await setStatus($, { kind: 'info', text: `Sin resultados para "${q}".` })

    return { kind: 'none' }
  }

  return { kind: 'hits', count: hits.length }
}

async function addToCart($: Dollar, hit: { productId: string; name: string; price: number; stock: number | null }): Promise<void> {
  await updateTab($, tab => ({ ...tab, items: addHit(tab.items, hit) }))
  await setUi($, { search: { query: '', hits: [] } })
  // Back to the search field; a surface that cannot move the ring is fine.
  $.ui.focus({ requestId: PANE, key: 'q' }).catch(() => undefined)
}

/**
 * A barcode that arrived outside the search field (the prompt): back to the
 * cart view if a sale just finished, then the same lookup the field does.
 */
async function scan($: Dollar, code: string): Promise<string> {
  const view = await read($, ui)

  if (view.view !== 'cart') await setUi($, { view: 'cart', lastSale: null })
  const outcome = await search($, code)

  if (outcome.kind === 'added') return `Agregado: ${outcome.name}`
  if (outcome.kind === 'none') return `Sin resultados para ${code}`

  return `${outcome.count} productos para ${code}: elegí uno en la caja`
}

async function openPane($: Dollar, focus: boolean): Promise<{ isPlaced: boolean; reason?: string }> {
  const opened = await $.ui.open({
    id: PANE,
    title: 'Flik POS',
    ...(focus ? { focus: true as const } : {}),
    rows: 28,
    columns: 60,
  })

  await setUi($, { isOpen: true })

  return opened
}

async function searchClients($: Dollar, query: string): Promise<void> {
  const biz = await read($, business)

  if (!biz) return
  const q = query.trim()
  const result = await callFlik(
    $,
    'list_clients',
    { business_id: biz.id, limit: MAX_HITS, ...(q ? { search: q } : {}) },
    'Buscando clientes…',
  )

  if (!result) return
  await setUi($, { clients: { query: q, hits: parseClients(result) } })
}

async function parkActive($: Dollar, label: string | null): Promise<string> {
  const state = await read($, cart)
  const tab = activeTab(state)

  if (tab.items.length === 0) return 'El carrito está vacío; nada que guardar.'
  const saved = { ...tab, label: label ?? tab.label }
  const list = await update($, parked, p => [...p, saved])

  await $.store.set('parked', list)
  await replaceActive($, newTab())

  return `Guardado "${saved.label}" (${list.length} en espera).`
}

async function resumeParked($: Dollar, index: number | null): Promise<string> {
  const list = await read($, parked)
  const i = index ?? list.length - 1
  const tab = list[i]

  if (!tab) return describeParked(list)
  const rest = list.filter((_, j) => j !== i)

  await update($, parked, () => rest)
  await $.store.set('parked', rest)

  const state = await read($, cart)
  const active = activeTab(state)

  if (active.items.length === 0) {
    await replaceActive($, tab)
  } else {
    const next = await update($, cart, s => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))

    await syncStatus($, next)
  }
  await setUi($, { view: 'cart' })

  return `Retomado "${tab.label}".`
}

async function replaceActive($: Dollar, tab: PosTab): Promise<void> {
  const next = await update($, cart, state => ({
    tabs: state.tabs.map(t => (t.id === state.activeTabId ? tab : t)),
    activeTabId: tab.id,
  }))

  await syncStatus($, next)
}

async function dropActive($: Dollar): Promise<void> {
  const next = await update($, cart, state => {
    const rest = state.tabs.filter(t => t.id !== state.activeTabId)

    if (rest.length === 0) {
      const fresh = newTab()

      return { tabs: [fresh], activeTabId: fresh.id }
    }

    return { tabs: rest, activeTabId: (rest[rest.length - 1] as PosTab).id }
  })

  await syncStatus($, next)
}

async function checkout($: Dollar): Promise<void> {
  const biz = await read($, business)
  const state = await read($, cart)
  const tab = activeTab(state)
  const problem = checkoutProblem(tab, biz)

  if (problem || !biz) {
    await setStatus($, { kind: 'error', text: problem ?? 'Sin negocio.' })

    return
  }

  const { total } = cartTotals(tab)
  const built = await callFlik(
    $,
    'build_sale',
    {
      business_id: biz.id,
      paymentMethod: tab.paymentMethod,
      items: checkoutItems(tab),
      ...(tab.clientId ? { client_id: tab.clientId } : {}),
      ...(tab.discount ? { discount: tab.discount } : {}),
    },
    'Armando la venta…',
  )

  if (!built) return
  const { token, total: serverTotal } = parseBuilt(built)

  // The server prices from its catalog: a drift means a price changed since
  // the line was added, and the cashier should see the new figure first.
  if (serverTotal !== null && Math.abs(serverTotal - total) > 0.01) {
    await setStatus($, {
      kind: 'error',
      text: `El servidor calculó ${money(serverTotal)} (acá ${money(total)}). Revisá los precios y volvé a cobrar.`,
    })

    return
  }

  const done = await callFlik(
    $,
    'complete_sale',
    { business_id: biz.id, ...(token ? { token } : {}) },
    'Cobrando…',
  )

  if (!done) return
  const sale = parseCompleted(done, total)

  $.ui.toast(`Venta${sale.saleNumber !== null ? ` #${sale.saleNumber}` : ''} · ${money(sale.total)}`)
  await dropActive($)
  await setUi($, {
    view: 'done',
    lastSale: sale,
    search: { query: '', hits: [] },
    editIndex: null,
    isDiscountOpen: false,
  })
}

export const register: Register = (on, options) => {
  barcodePattern = compileBarcodePattern(options.barcodePattern)
  scanFromPrompt = options.scanFromPrompt !== false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pos',
      description: 'Flik POS: caja con carrito, cliente, descuento y cobro',
      argumentHint: '[park [nombre] | resume [n] | list | business | clear | close]',
    })

    const [savedBusiness, savedParked] = await Promise.all([
      $.store.get('business'),
      $.store.get('parked'),
    ])

    if (savedBusiness && typeof savedBusiness === 'object') {
      await update($, business, () => savedBusiness as PosBusiness)
    }
    if (Array.isArray(savedParked)) {
      await update($, parked, () => savedParked as PosTab[])
    }

    return next(e)
  })

  on('command.run', { command: 'pos' }, async ($, e) => {
    const command = parsePosArgs(e.args)

    switch (command.kind) {
      case 'help':
        return { text: HELP_TEXT }
      case 'list':
        return { text: describeParked(await read($, parked)) }
      case 'park':
        return { text: await parkActive($, command.label) }
      case 'resume': {
        const text = await resumeParked($, command.index)

        await openPane($, true)

        return { text }
      }
      case 'clear':
        await updateTab($, tab => ({ ...tab, items: [], discount: null }))

        return { text: 'Carrito vaciado.' }
      case 'close':
        await $.ui.close({ id: PANE })

        return { text: 'Caja cerrada.' }
      case 'business':
      case 'open': {
        const opened = await openPane($, true)

        if (!opened.isPlaced) {
          return { text: `No se pudo abrir la caja: ${opened.reason}` }
        }
        if (command.kind === 'business' || (await read($, business)) === null) {
          await loadBusinesses($)
        }

        return {
          text: 'Caja abierta. Escribí o escaneá para buscar (un dígito elige el resultado); c cobra, d descuento, l cliente, h guarda.',
        }
      }
    }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    $.ui.status(undefined)
    await setUi($, { isOpen: false })

    return next(e)
  })

  // A keyboard-wedge scanner types the code and presses Enter wherever the
  // keyboard is. Landing in the prompt, that would be a message to the model;
  // a barcode-shaped prompt from the person is a scan for the cart instead.
  on('prompt.submit', async ($, e, next) => {
    const code = scanFromPrompt && isPersonsOwn(e.origin) ? barcodeOf(e.text, barcodePattern) : null

    if (code === null) return next(e)

    const view = await read($, ui)

    if (!view.isOpen) await openPane($, false)

    // Awaited, so the reason shown in place of the prompt is the outcome.
    return { drop: `Escaneado ${code} · ${await scan($, code)}` }
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const biz = await read($, business)
    const state = await read($, cart)
    const view = await read($, ui)
    const parkedList = await read($, parked)
    const tab = activeTab(state)
    const totals = cartTotals(tab)
    const width = Math.max(30, e.props.bodyColumns)

    if (e.surface === 'mobile') {
      const { Box, Text } = $.ui.resolve(e)

      return (
        <Box flexDirection="column">
          <Text bold>Flik POS</Text>
          <Text dimColor>La caja necesita teclado: abrila en la terminal, el escritorio o VS Code.</Text>
          <Text>
            {tab.items.length} ítem(s) · {money(totals.total)}
          </Text>
        </Box>
      )
    }

    const { Box, Text, Button, Input, Select } = $.ui.resolve(e)
    const status = view.status && (
      <Text
        color={view.status.kind === 'error' ? 'error' : view.status.kind === 'busy' ? 'warning' : 'subtle'}
        wrap="wrap"
      >
        {view.status.text}
      </Text>
    )

    if (view.view === 'business') {
      return (
        <Box flexDirection="column">
          <Text bold>Flik POS · Elegí el negocio</Text>
          {view.businesses.length === 0 && (
            <Button key="load-biz" hotkey="b" onPress={() => void loadBusinesses($)}>
              Cargar negocios
            </Button>
          )}
          {view.businesses.map((b, i) => (
            <Button
              key={`biz-${i}`}
              plain
              onPress={() => void chooseBusiness($, b)}
            >
              {b.name} <Text dimColor>{b.id}</Text>
            </Button>
          ))}
          {biz && (
            <Button key="biz-back" plain onPress={() => void setUi($, { view: 'cart' })}>
              Volver a la caja
            </Button>
          )}
          {status}
        </Box>
      )
    }

    if (view.view === 'done' && view.lastSale) {
      const sale = view.lastSale

      return (
        <Box flexDirection="column">
          <Text bold color="success">
            Venta{sale.saleNumber !== null ? ` #${sale.saleNumber}` : ''} cobrada · {money(sale.total)}
          </Text>
          {sale.warnings.map(w => (
            <Text color="warning" wrap="wrap">
              ⚠ {w}
            </Text>
          ))}
          <Button
            key="again"
            variant="primary"
            hotkey="n"
            autoFocus
            onPress={() => void setUi($, { view: 'cart', lastSale: null })}
          >
            Nueva venta
          </Button>
        </Box>
      )
    }

    if (view.view === 'parked') {
      return (
        <Box flexDirection="column">
          <Text bold>Carritos guardados</Text>
          {parkedList.length === 0 && <Text dimColor>No hay carritos guardados.</Text>}
          {parkedList.map((p, i) => (
            <Button
              key={`parked-${i}`}
              plain
              onPress={() => void resumeParked($, i)}
            >
              {p.label} <Text dimColor>{p.items.length} ít · {money(cartTotals(p).total)}</Text>
            </Button>
          ))}
          <Button key="parked-back" plain hotkey="v" onPress={() => void setUi($, { view: 'cart' })}>
            Volver
          </Button>
        </Box>
      )
    }

    if (view.view === 'client') {
      return (
        <Box flexDirection="column">
          <Text bold>Cliente</Text>
          <Input
            key="cq"
            label="Buscar"
            placeholder="nombre, DNI, teléfono"
            value={view.clients.query}
            autoFocus
            onSubmit={value => void searchClients($, value)}
          />
          {view.clients.hits.map((c, i) => (
            <Button
              key={`client-${i}`}
              plain
              onPress={() => {
                void updateTab($, t => ({ ...t, clientId: c.clientId, clientName: c.name })).then(() =>
                  setUi($, { view: 'cart', clients: { query: '', hits: [] } }),
                )
              }}
            >
              {c.name}
            </Button>
          ))}
          <Button
            key="client-none"
            plain
            hotkey="x"
            onPress={() => {
              void updateTab($, t => ({ ...t, clientId: null, clientName: null })).then(() =>
                setUi($, { view: 'cart', clients: { query: '', hits: [] } }),
              )
            }}
          >
            Sin cliente
          </Button>
          <Button key="client-back" plain hotkey="v" onPress={() => void setUi($, { view: 'cart' })}>
            Volver
          </Button>
          {status}
        </Box>
      )
    }

    // The cart view. Room for the name: the line minus qty, prices and buttons.
    const nameWidth = Math.max(8, width - 34)

    return (
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text bold>Flik POS{biz ? ` · ${biz.name}` : ''}</Text>
          <Box gap={1}>
            <Button key="new-tab" plain hotkey="n" onPress={() => void addTab($)}>
              nueva
            </Button>
            <Button key="parked-view" plain hotkey="r" onPress={() => void setUi($, { view: 'parked' })}>
              guardados({parkedList.length})
            </Button>
            <Button key="biz-view" plain hotkey="b" onPress={() => void loadBusinesses($)}>
              negocio
            </Button>
          </Box>
        </Box>
        {state.tabs.length > 1 && (
          <Box gap={1}>
            {state.tabs.map(t => (
              <Button
                key={`tab-${t.id}`}
                plain
                dimColor={t.id !== tab.id}
                onPress={() => {
                  void update($, cart, s => ({ ...s, activeTabId: t.id })).then(s => syncStatus($, s))
                }}
              >
                {t.id === tab.id ? `[${t.label}]` : t.label}
              </Button>
            ))}
          </Box>
        )}
        <Input
          key="q"
          label="Buscar"
          placeholder="nombre, código o SKU · escaneá acá"
          value={view.search.query}
          autoFocus
          submitLabel="buscar"
          onSubmit={value => void search($, value)}
        />
        {view.search.hits.map((hit, i) => (
          <Button key={`hit-${i}`} plain onPress={() => void addToCart($, hit)}>
            <Text dimColor>{i + 1}: </Text>
            {truncate(hit.name, nameWidth)} <Text dimColor>{money(hit.price)}</Text>
            {hit.stock !== null && (
              <Text color={hit.stock <= 0 ? 'error' : 'subtle'}> st {hit.stock}</Text>
            )}
          </Button>
        ))}
        <Text dimColor>{'─'.repeat(Math.min(width, 60))}</Text>
        {tab.items.length === 0 && <Text dimColor>Carrito vacío.</Text>}
        {tab.items.map((line, i) => (
          <Box flexDirection="column">
            <Box gap={1}>
              <Text>{String(line.quantity).padStart(2)}×</Text>
              <Text>{truncate(line.name, nameWidth)}</Text>
              {line.price !== line.listPrice && <Text dimColor strikethrough>{money(line.listPrice)}</Text>}
              <Text>{money(line.price)}</Text>
              <Text bold>{money(line.price * line.quantity)}</Text>
              <Button
                key={`qty-dec-${i}`}
                plain
                onPress={() => void updateTab($, t => ({ ...t, items: changeQuantity(t.items, i, -1) }))}
              >
                -
              </Button>
              <Button
                key={`qty-inc-${i}`}
                plain
                onPress={() => void updateTab($, t => ({ ...t, items: changeQuantity(t.items, i, 1) }))}
              >
                +
              </Button>
              <Button key={`price-${i}`} plain onPress={() => void setUi($, { editIndex: i })}>
                $
              </Button>
              <Button
                key={`del-${i}`}
                plain
                onPress={() => void updateTab($, t => ({ ...t, items: t.items.filter((_, j) => j !== i) }))}
              >
                x
              </Button>
            </Box>
            {view.editIndex === i && (
              <Input
                key="edit"
                label="Precio unitario"
                value={String(line.price)}
                autoFocus
                onSubmit={value => {
                  const price = parseNumber(value)

                  if (price === null || price <= 0) {
                    void setStatus($, { kind: 'error', text: 'Precio inválido.' })

                    return
                  }
                  void updateTab($, t => ({
                    ...t,
                    items: t.items.map((l, j) => (j === i ? { ...l, price } : l)),
                  })).then(() => setUi($, { editIndex: null, status: null }))
                }}
              />
            )}
          </Box>
        ))}
        <Box gap={2}>
          <Text dimColor>Subtotal {money(totals.subtotal)}</Text>
          {totals.discount > 0 && (
            <Text dimColor>
              Desc -{money(totals.discount)}
              {tab.discount?.type === 'percent' ? ` (${tab.discount.value}%)` : ''}
            </Text>
          )}
          <Text bold>Total {money(totals.total)}</Text>
        </Box>
        {view.isDiscountOpen && (
          <Input
            key="disc"
            label="Descuento"
            placeholder="10% o 500; vacío quita"
            value={
              tab.discount
                ? tab.discount.type === 'percent'
                  ? `${tab.discount.value}%`
                  : String(tab.discount.value)
                : ''
            }
            autoFocus
            onSubmit={value => {
              const parsed = parseDiscount(value)

              if (parsed && 'error' in parsed) {
                void setStatus($, { kind: 'error', text: parsed.error })

                return
              }
              void updateTab($, t => ({ ...t, discount: parsed })).then(() =>
                setUi($, { isDiscountOpen: false, status: null }),
              )
            }}
          />
        )}
        <Select
          key="pay"
          label="Pago"
          options={PAYMENT_METHODS.map(m => ({ value: m.value, label: m.label }))}
          value={tab.paymentMethod}
          onSelect={value => void updateTab($, t => ({ ...t, paymentMethod: value as PaymentMethod }))}
        />
        <Box gap={1}>
          <Text dimColor>Cliente:</Text>
          <Text>{tab.clientName ?? '—'}</Text>
          <Button key="client" plain hotkey="l" onPress={() => void setUi($, { view: 'client' })}>
            cambiar
          </Button>
        </Box>
        <Box gap={1}>
          <Button key="checkout" variant="primary" hotkey="c" onPress={() => void checkout($)}>
            Cobrar {money(totals.total)} · {paymentLabel(tab.paymentMethod)}
          </Button>
          <Button
            key="discount"
            plain
            hotkey="d"
            onPress={() => void setUi($, { isDiscountOpen: !view.isDiscountOpen })}
          >
            descuento
          </Button>
          <Button key="park" plain hotkey="h" onPress={() => void parkActive($, null)}>
            guardar
          </Button>
        </Box>
        {status}
      </Box>
    )
  })
}

async function addTab($: Dollar): Promise<void> {
  const tab = newTab()
  const next = await update($, cart, s => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))

  await syncStatus($, next)
}

/** The person's own prompt (typed, or from the phone bridge): never a delivery or a timer's. */
function isPersonsOwn(origin: { kind: string } | undefined): boolean {
  return origin === undefined || origin.kind === 'composer' || origin.kind === 'bridge' || origin.kind === 'unclassified'
}
