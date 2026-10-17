export type PaymentMethod =
  | 'cash'
  | 'creditCard'
  | 'debitCard'
  | 'transfer'
  | 'mercadopago'
  | 'other'
  | 'debt'

export type PosLine = {
  productId: string
  name: string
  /** Catalog price when the line was added. */
  listPrice: number
  /** Effective unit price; differs from listPrice after an override. */
  price: number
  quantity: number
  stock: number | null
}

export type PosDiscount = { type: 'amount' | 'percent'; value: number } | null

export type PosTab = {
  id: string
  label: string
  items: PosLine[]
  paymentMethod: PaymentMethod
  discount: PosDiscount
  clientId: string | null
  clientName: string | null
  createdAt: number
}

export type PosHit = { productId: string; name: string; price: number; stock: number | null }
export type PosClient = { clientId: string; name: string }
export type PosBusiness = { id: string; name: string }
export type PosView = 'cart' | 'business' | 'client' | 'parked' | 'done'
export type PosStatus = { kind: 'info' | 'error' | 'busy'; text: string } | null

export type PosCart = { tabs: PosTab[]; activeTabId: string }

export type PosUi = {
  view: PosView
  status: PosStatus
  /** Which cart line's price is being edited, if any. */
  editIndex: number | null
  isDiscountOpen: boolean
  search: { query: string; hits: PosHit[] }
  clients: { query: string; hits: PosClient[] }
  businesses: PosBusiness[]
  lastSale: { saleId: string; saleNumber: number | null; total: number; warnings: string[] } | null
}

declare module 'claude-code' {
  interface PluginState {
    'flik': {
      business: PosBusiness | null
      cart: PosCart
      ui: PosUi
      parked: PosTab[]
    }
  }
}
