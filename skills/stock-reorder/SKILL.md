---
name: stock-reorder
description: Decide what to reorder and how much, find dead stock tying up capital, and load supplier deliveries (factura / remito / lista) into Flik stock. Use for "qué tengo que reponer", "qué me falta", "armar pedido al proveedor", "stock parado", "cargar este remito / factura", "llegó mercadería", "what should I reorder", "low stock", "load this invoice", or when the user shares a photo/PDF of a supplier document.
argument-hint: "[reponer | stock parado | cargar remito]"
---

# Stock and reordering

Two jobs: (A) recommend what to buy, and (B) load what arrived. Answer in the user's language (default Rioplatense Spanish); money in ARS.

Settle the business first (call `list_businesses` if needed) and pass `business_id` on every call.

## A. What to reorder

1. Call `inventory_report` with `include: ["low_stock", "dead_stock", "valuation"]` (default `dead_stock_days` 60; use 30 for fast-moving shops like kioscos if the user agrees).
2. Get sales velocity: `top_products` for the last 30 days (`start_date`/`end_date`, `sort_by: "units"`, `limit` 50). Units ÷ 30 = average daily sales.
3. For each low-stock product, suggest a quantity:
   `suggested = ceil(daily_sales × (lead_time_days + cover_days)) − current_stock`
   Default lead time 3 days and cover 14 days unless the user tells you their supplier cadence; say which assumptions you used. Round up to the supplier's pack size when the product name shows it ("x12", "caja x24").
   If a low-stock product has no recent sales, flag it instead of reordering ("está bajo el mínimo pero no se vende — ¿vale la pena reponer?").
4. Present one table grouped by priority: **top sellers that are low** first, then the rest. Columns: producto, stock actual, mínimo, venta diaria, sugerido.
5. Mention `productsWithoutThreshold`: products with no minimum set can't be flagged — offer to suggest minimums (≈ daily sales × lead time). The connector can't set minimums, so give the list for the user to enter in the Flik app (product → stock mínimo).

Flik has no purchase-order tool. Offer to format the list as a message ready to send to the supplier (WhatsApp/email text).

## Dead stock
From `dead_stock`, highlight the products with most `tiedUpCapital` and the total `deadStockCapital`. Suggest concrete moves: a promo or discount, a combo with a top seller, moving it to a visible spot, or stopping reorders. Don't change prices here — hand off to the pricing-margins skill if the user wants a markdown.

## B. Load a supplier delivery

When the user shares a factura/remito/presupuesto/list (text, photo or PDF):

1. Read every line carefully: description, quantity **as written**, pack size if the line is in boxes/packs (e.g. "caja x24" → `pack_size: 24`), barcode, supplier code, cost per line unit. Never convert packs to units yourself — the server does it. Never put a sale price in `cost`.
2. Call `stock_suggestions` with `items` and, when printed, `document` (`type`, `provider`, `provider_tax_id`, `number`, `date`). The document number lets Flik refuse loading the same remito twice.
3. Show the suggestions back to the user: matched products with the quantity to add and the new cost, and lines proposed as **new products** (these need a sale price). Point out low-confidence name matches.
4. Wait for confirmation. Then call `apply_stock` with `skip` (indexes to decline) and `overrides` (index + corrected name/quantity/price/cost). Use `force_duplicates: true` only if the user explicitly says the document really must be loaded again.
5. Confirm what was applied and if the cost changed noticeably vs. the previous cost, mention that prices may need review (pricing-margins skill).

## Rules
- Nothing changes stock until `apply_stock`, and `apply_stock` only runs after a clear "sí / dale / ok".
- Never edit stock quantities via `update_product` to "fix" counts unless the user explicitly asks for a stock adjustment and confirms the exact numbers.
