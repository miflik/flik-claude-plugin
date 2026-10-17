---
name: expenses
description: Record business expenses (gastos) in Flik — one-time ones like a repair, supplies or a purchase, and recurring ones like rent, salaries, utilities or subscriptions — so net profit reflects them. Use for "cargá un gasto", "anotá que pagué la luz", "pagué el alquiler", "tengo un gasto de", "agregar gasto fijo", "sueldo de", "record an expense", "add a cost", "I paid rent", or when the user shares a photo/PDF of a bill or receipt to log as an expense.
argument-hint: "[gasto]"
---

# Expenses (gastos)

Answer in the user's language (default Rioplatense Spanish); money in ARS. Settle the business first (call `list_businesses` if needed) and pass `business_id` on every call.

## 1. Work out each expense
From the message (or the bill/receipt they shared), get for each expense:
- **name**: short and recognizable ("Luz Edenor septiembre", "Alquiler local", "Arreglo heladera").
- **amount**: the total in ARS. If it isn't stated or the receipt is unreadable, ask — never guess an amount.
- **category**: `rent`, `utilities` (luz, gas, agua, internet, teléfono), `salaries`, `insurance`, `maintenance`, `marketing`, `supplies` (insumos, bolsas, artículos de limpieza), `taxes` (AFIP, IIBB, monotributo, municipal), `equipment`, `transportation` (fletes, nafta), `professional-services` (contador, abogado), `other`.
- **one-time or recurring**: default one-time. Treat it as recurring only when the user says it repeats ("todos los meses", "fijo", "mensual") or it is clearly recurring by nature (alquiler, sueldos, abonos). Then pick `frequency`: `daily`, `weekly`, `monthly` (default), `quarterly` or `yearly`.
- **paid and date**: "pagué" / a receipt means paid, on that date. A bill that is still due means unpaid, with `date` as the due date. With no date given, today is used.

Products bought to resell are **not** expenses: that is merchandise and it goes into stock (stock-reorder skill). Point this out if the user tries to log a supplier invoice for goods as a gasto.

## 2. Confirm, then record
Show what you are about to record, one line per expense: name · amount · category · one-time or recurring (frequency) · paid on / due on date. Ask for confirmation, then call `add_expense` once per expense. Report back what was recorded.

If the same expense may already exist (e.g. they already loaded rent as recurring and now say "pagué el alquiler"), mention it and ask before adding a duplicate: a recurring expense already counts every period.

## 3. Afterwards
Offer, briefly, to show how it affects the month's results with `profit_and_loss` (business-health skill). Recurring expenses are prorated to the period there; one-time expenses land in the month of their date.

## Rules
- Never record an expense without the user's confirmation of the amount.
- `add_expense` only creates expenses. Editing, marking as paid or deleting an existing one is done in the Flik app under **Gastos**; tell the user where if they ask.
