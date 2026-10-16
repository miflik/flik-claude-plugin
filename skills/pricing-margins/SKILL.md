---
name: pricing-margins
description: Find products with missing costs, low or negative margins, or prices left behind by inflation, and propose price updates to apply in Flik after the user confirms. Use for "qué productos tienen mal margen", "actualizar precios", "aumentar un X%", "estoy perdiendo plata con algo", "cargar costos", "remarcar", "markup", "margin analysis", "update prices", "which products lose money".
argument-hint: "[margen | aumentar X% | cargar costos]"
---

# Pricing and margins

Goal: protect margin with specific, reviewed price changes. Answer in the user's language (default Rioplatense Spanish); money in ARS. Use the term the user uses — many Argentine merchants think in **markup** (`(price − cost) / cost`), others in **margin** (`(price − cost) / price`). Say which one you're showing.

Settle the business first (call `list_businesses` if needed) and pass `business_id` on every call.

## 1. Diagnose
1. `profit_and_loss` for the current month (or last month if early in the month): overall gross margin and `costCoverage`.
2. `top_products` for the same range with `sort_by: "revenue"` (limit 30) and again with `sort_by: "margin"` (limit 30). Products that rank high on revenue but low on margin are the priority.
3. For candidate products, `get_product` (by id from the reports) to read current `price`, `cost`, `ivaRate` and price unit.

## 2. Classify
- **Sin costo cargado** — cost missing: margin unknown. If coverage is low, fixing this comes before any pricing advice. Offer to load costs: the user can dictate them, or load a supplier invoice (stock-reorder skill), which records cost per product.
- **Margen negativo** — price ≤ cost: urgent.
- **Margen bajo** — below the user's target. Ask their target if unknown; otherwise use 30% markup as a neutral placeholder and say it's an assumption (pharmacy/kiosco/almacén targets vary a lot).
- **OK**.

## 3. Propose
For each product to change, show: producto, costo, precio actual, markup actual, **precio sugerido**, markup nuevo. Rules for suggestions:
- `suggested = cost × (1 + target_markup)`, rounded to a sensible retail ending (nearest $10 under $1.000, $50 or $100 above — ask if they prefer another rounding).
- For an across-the-board increase ("aumentá todo un 8%"), still produce the per-product list first; allow filtering by category.
- Flag big jumps (>20%) on top sellers — they may hurt volume; suggest staging them.
- Never invent costs. Never lower a price below cost.

## 4. Apply (only after confirmation)
Ask for an explicit confirmation of the list ("¿Aplico estos N cambios?"). The user may remove items or edit prices. Then call `update_product` once per product with only `productId` and the changed field (`price`, or `cost` when loading costs). Report back what was updated and anything that failed. If there are more than ~30 changes, confirm in batches.

## Notes
- Inflation context: when costs rise often, suggest re-running this review after each supplier delivery.
- This skill does not create promotions or discounts; for dead stock markdowns, propose the new price and apply it the same way.
