// Pure helpers behind the Flik POS pane: cart math, the parsers for the Flik
// MCP tools' answers (structured first, text lines as a fallback for a server
// that predates the outputSchema), and the /pos argument grammar. No `$`
// here, so every rule is unit-testable without the engine.

import type {
  PaymentMethod,
  PosBusiness,
  PosClient,
  PosDiscount,
  PosHit,
  PosLine,
  PosTab,
} from '../types'

export const PAYMENT_METHODS: ReadonlyArray<{ value: PaymentMethod; label: string }> = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'debitCard', label: 'Débito' },
  { value: 'creditCard', label: 'Crédito' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'mercadopago', label: 'MercadoPago' },
  { value: 'debt', label: 'Fiado (cuenta corriente)' },
  { value: 'other', label: 'Otro' },
]

export function paymentLabel(method: PaymentMethod): string {
  return PAYMENT_METHODS.find(m => m.value === method)?.label ?? method
}

/** What an MCP tool answers, as `$.mcp.call` resolves it. */
export type ToolResult = {
  content: ReadonlyArray<{ type: string; text?: string }>
  isError: boolean
  structuredContent?: unknown
}

export const round2 = (n: number): number => Math.round(n * 100) / 100

export function money(n: number): string {
  const sign = n < 0 ? '-' : ''
  const [whole, cents] = Math.abs(round2(n)).toFixed(2).split('.')
  const grouped = (whole ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.')

  return `${sign}$${grouped},${cents}`
}

export function truncate(text: string, width: number): string {
  if (width <= 0) return ''
  if (text.length <= width) return text

  return width <= 1 ? text.slice(0, width) : `${text.slice(0, width - 1)}…`
}

let tabCounter = 0

export function newTab(label?: string): PosTab {
  tabCounter += 1
  const id = `${Date.now().toString(36)}-${tabCounter}-${Math.random().toString(36).slice(2, 6)}`

  return {
    id,
    label: label ?? `Venta ${tabCounter}`,
    items: [],
    paymentMethod: 'cash',
    discount: null,
    clientId: null,
    clientName: null,
    createdAt: Date.now(),
  }
}

export function cartTotals(tab: Pick<PosTab, 'items' | 'discount'>): {
  subtotal: number
  discount: number
  total: number
} {
  const subtotal = round2(tab.items.reduce((sum, l) => sum + l.price * l.quantity, 0))
  const discount = discountAmount(subtotal, tab.discount)

  return { subtotal, discount, total: round2(subtotal - discount) }
}

export function discountAmount(subtotal: number, discount: PosDiscount): number {
  if (!discount) return 0
  if (discount.type === 'percent') return round2((subtotal * discount.value) / 100)

  return round2(Math.min(discount.value, subtotal))
}

/** "1.500,50", "1500.5" and "1500" all read as 1500.5; anything else is null. */
export function parseNumber(text: string): number | null {
  let s = text.trim().replace(/^\$/, '')

  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(s)) return null

  return Number(s)
}

/** "10%" is a percentage, "500" a money amount, "" clears the discount. */
export function parseDiscount(text: string): PosDiscount | { error: string } {
  const s = text.trim()

  if (s === '' || s === '0') return null

  const isPercent = s.endsWith('%')
  const value = parseNumber(isPercent ? s.slice(0, -1) : s)

  if (value === null || value <= 0) return { error: 'Descuento inválido: usá 10% o 500.' }
  if (isPercent && value > 100) return { error: 'El porcentaje no puede superar 100%.' }

  return { type: isPercent ? 'percent' : 'amount', value }
}

/** EAN-8, UPC-A, EAN-13 and ITF-14: what a retail keyboard-wedge scanner types. */
export const DEFAULT_BARCODE_PATTERN = '^\\d{6,14}$'

/** The user's `barcodePattern` option, or the default when it is not a regex. */
export function compileBarcodePattern(source: unknown): RegExp {
  if (typeof source === 'string' && source.trim() !== '') {
    try {
      return new RegExp(source.trim())
    } catch {
      // Fall through to the default: a bad option must not disable scanning.
    }
  }

  return new RegExp(DEFAULT_BARCODE_PATTERN)
}

/**
 * The barcode a scan typed, or null when the text is anything else. A wedge
 * may leave a CR/LF before the Enter it sends; both are stripped first.
 */
export function barcodeOf(text: string, pattern: RegExp): string | null {
  const code = text.replace(/[\r\n]+$/, '').trim()

  return code !== '' && pattern.test(code) ? code : null
}

export function addHit(items: PosLine[], hit: PosHit): PosLine[] {
  const index = items.findIndex(l => l.productId === hit.productId)

  if (index >= 0) {
    return items.map((l, i) => (i === index ? { ...l, quantity: l.quantity + 1 } : l))
  }

  return [
    ...items,
    {
      productId: hit.productId,
      name: hit.name,
      listPrice: hit.price,
      price: hit.price,
      quantity: 1,
      stock: hit.stock,
    },
  ]
}

export function changeQuantity(items: PosLine[], index: number, delta: number): PosLine[] {
  return items
    .map((l, i) => (i === index ? { ...l, quantity: l.quantity + delta } : l))
    .filter(l => l.quantity > 0)
}

export function textOf(result: ToolResult): string {
  return result.content
    .filter(block => block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text as string)
    .join('\n')
    .trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const SEARCH_LINE = /^\d+\.\s+(.+?)\s+-\s+\$([\d.]+)(?:\s+\(Stock:\s*(-?[\d.]+)\))?.*?—\s*ID:\s*(\S+)\s*$/

/** search_products: structuredContent.hits, else the numbered text lines. */
export function parseSearchHits(result: ToolResult): PosHit[] {
  const sc = result.structuredContent

  if (isRecord(sc) && Array.isArray(sc.hits)) {
    return sc.hits.filter(isRecord).map(hit => ({
      productId: String(hit.productId),
      name: String(hit.name),
      price: Number(hit.price),
      stock: typeof hit.stock === 'number' ? hit.stock : null,
    }))
  }

  const hits: PosHit[] = []

  for (const line of textOf(result).split('\n')) {
    const m = SEARCH_LINE.exec(line.trim())

    if (!m) continue
    hits.push({
      productId: m[4] as string,
      name: m[1] as string,
      price: Number(m[2]),
      stock: m[3] === undefined ? null : Number(m[3]),
    })
  }

  return hits
}

const CLIENT_LINE = /^\d+\.\s+\*\*(.+?)\*\*\s+\(ID:\s*(\S+?)\)/

export function parseClients(result: ToolResult): PosClient[] {
  const sc = result.structuredContent

  if (isRecord(sc) && Array.isArray(sc.clients)) {
    return sc.clients
      .filter(isRecord)
      .map(c => ({ clientId: String(c.clientId), name: String(c.name) }))
  }

  const clients: PosClient[] = []

  for (const line of textOf(result).split('\n')) {
    const m = CLIENT_LINE.exec(line.trim())

    if (m) clients.push({ clientId: m[2] as string, name: m[1] as string })
  }

  return clients
}

const BUSINESS_LINE = /^-\s+(.+?)\s+\(([A-Za-z0-9_-]+)\)/

export function parseBusinesses(result: ToolResult): PosBusiness[] {
  const sc = result.structuredContent

  if (isRecord(sc) && Array.isArray(sc.businesses)) {
    return sc.businesses.filter(isRecord).map(b => ({ id: String(b.id), name: String(b.name) }))
  }

  const businesses: PosBusiness[] = []

  for (const line of textOf(result).split('\n')) {
    const m = BUSINESS_LINE.exec(line.trim())

    if (m) businesses.push({ id: m[2] as string, name: m[1] as string })
  }

  return businesses
}

export type BuiltSale = { token: string | null; total: number | null }

export function parseBuilt(result: ToolResult): BuiltSale {
  const sc = result.structuredContent

  if (isRecord(sc)) {
    return {
      token: typeof sc.token === 'string' ? sc.token : null,
      total: typeof sc.total === 'number' ? sc.total : null,
    }
  }

  const m = /Total:\s*\$([\d.]+)/.exec(textOf(result))

  return { token: null, total: m ? Number(m[1]) : null }
}

export type CompletedSale = {
  saleId: string
  saleNumber: number | null
  total: number
  warnings: string[]
}

export function parseCompleted(result: ToolResult, fallbackTotal: number): CompletedSale {
  const sc = result.structuredContent

  if (isRecord(sc) && typeof sc.saleId === 'string') {
    return {
      saleId: sc.saleId,
      saleNumber: typeof sc.saleNumber === 'number' ? sc.saleNumber : null,
      total: typeof sc.total === 'number' ? sc.total : fallbackTotal,
      warnings: Array.isArray(sc.warnings) ? sc.warnings.map(String) : [],
    }
  }

  const text = textOf(result)
  const number = /#(\d+)/.exec(text)
  const total = /Total:\s*\$([\d.]+)/.exec(text)

  return {
    saleId: '',
    saleNumber: number ? Number(number[1]) : null,
    total: total ? Number(total[1]) : fallbackTotal,
    warnings: text
      .split('\n')
      .filter(line => line.startsWith('Warning:'))
      .map(line => line.slice('Warning:'.length).trim()),
  }
}

/** The build_sale `items` for a tab: ids, quantities, overrides only when set. */
export function checkoutItems(tab: PosTab): Array<{ product: string; quantity: number; price?: number }> {
  return tab.items.map(l => ({
    product: l.productId,
    quantity: l.quantity,
    ...(l.price !== l.listPrice ? { price: l.price } : {}),
  }))
}

export function checkoutProblem(tab: PosTab, business: PosBusiness | null): string | null {
  if (!business) return 'Elegí un negocio primero (b).'
  if (tab.items.length === 0) return 'El carrito está vacío.'
  if (tab.items.some(l => !(l.price > 0))) return 'Hay líneas sin precio.'
  if (tab.paymentMethod === 'debt' && !tab.clientId) return 'Fiado necesita un cliente (l).'

  return null
}

export type PosCommand =
  | { kind: 'open' }
  | { kind: 'park'; label: string | null }
  | { kind: 'resume'; index: number | null }
  | { kind: 'list' }
  | { kind: 'business' }
  | { kind: 'clear' }
  | { kind: 'close' }
  | { kind: 'help' }

export function parsePosArgs(args: string): PosCommand {
  const [head = '', ...rest] = args.trim().split(/\s+/).filter(Boolean)
  const tail = rest.join(' ')

  switch (head.toLowerCase()) {
    case '':
      return { kind: 'open' }
    case 'park':
    case 'guardar':
      return { kind: 'park', label: tail || null }
    case 'resume':
    case 'retomar': {
      const n = Number(tail)

      return { kind: 'resume', index: Number.isInteger(n) && n >= 1 ? n - 1 : null }
    }
    case 'list':
    case 'lista':
      return { kind: 'list' }
    case 'business':
    case 'negocio':
      return { kind: 'business' }
    case 'clear':
    case 'vaciar':
      return { kind: 'clear' }
    case 'close':
    case 'cerrar':
      return { kind: 'close' }
    default:
      return { kind: 'help' }
  }
}

export const HELP_TEXT = [
  '/pos — abre la caja',
  '/pos park [nombre] — guarda el carrito actual',
  '/pos resume [n] — retoma un carrito guardado',
  '/pos list — lista los carritos guardados',
  '/pos business — cambia de negocio',
  '/pos clear — vacía el carrito actual',
  '/pos close — cierra el panel',
].join('\n')

export function describeParked(parked: PosTab[]): string {
  if (parked.length === 0) return 'No hay carritos guardados.'

  return parked
    .map((tab, i) => {
      const { total } = cartTotals(tab)
      const client = tab.clientName ? ` · ${tab.clientName}` : ''

      return `${i + 1}. ${tab.label} — ${tab.items.length} ítem(s) · ${money(total)}${client}`
    })
    .join('\n')
}
