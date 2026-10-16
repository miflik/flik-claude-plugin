---
name: receivables
description: Review money owed by clients on store credit (fiado / cuenta corriente) in Flik — total outstanding, who owes most, how old the debts are — and plan collections, including drafting polite reminder messages. Use for "quién me debe", "cuánto me deben", "fiado", "cuentas corrientes", "deudores", "cobrar", "mandar recordatorio", "who owes me", "receivables", "outstanding debt".
argument-hint: "[cliente]"
---

# Receivables (fiado)

Answer in the user's language (default Rioplatense Spanish); money in ARS. Settle the business first (call `list_businesses` if needed) and pass `business_id` on every call.

## 1. Overview
Call `receivables_report` (optionally `client_id` for one client; find the id with `list_clients` `search`, or from a previous report). Present:
- Total outstanding and number of clients owing.
- Aging: 0-30 / 31-60 / 61-90 / 90+ days. Money older than 60 days is at risk; say how much.
- Top clients by amount, with their oldest debt age.
Voided debts from refunded sales are already excluded.

For trend questions ("¿estoy fiando más de lo que cobro?"), use `weekly_report` with `include: ["receivables"]` for the last few weeks — it reports fiado added vs. collected per week.

## 2. Prioritize collections
Rank clients by a mix of amount and age: big **and** old first, then old small debts (cheap to close), then big recent ones. Give a short list with a suggested approach per client (recordatorio amable, pedir pago parcial, no seguir fiando hasta regularizar). Offer an optional policy suggestion if the 90+ bucket is significant (e.g. a credit limit or maximum days).

## 3. Reminder messages
If asked, draft short WhatsApp-style messages per client: friendly, specific amount, no threats, easy way to pay. Use `get_client` for the client's name and phone. Example tone:
> Hola Marta, ¿cómo andás? Te escribo de [negocio] para recordarte que quedó un saldo de $ 18.500 en tu cuenta. Cuando puedas pasá o avisame y te paso el alias. ¡Gracias!

You can't send messages from Flik — give the text (and phone if available) for the user to send.

## Rules
- Don't record payments or change debts: there is no tool for it, and payments are registered at the till in the Flik app. Tell the user where to do it if they ask.
- Client data is personal: only show phone/email when needed for the task.
