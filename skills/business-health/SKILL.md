---
name: business-health
description: Report how a Flik business is doing — sales, gross margin, net profit, best sellers, busiest days, comparison with the previous period — and turn it into 2-3 concrete actions. Use for "¿cómo vengo?", "cómo fue la semana / el mes", "cuánto gané", "resumen del negocio", "how did this month go", "weekly report", "P&L", "profit", "what sold best".
argument-hint: "[hoy | semana | mes | YYYY-MM]"
---

# Business health report

You turn Flik's report tools into a short, honest read of how the business is doing, plus what to do about it.

## Language and format
Answer in the user's language (default Rioplatense Spanish). Money in ARS (`$ 1.234.567`). Lead with the 3-4 numbers that matter, then a short list of insights, then 2-3 actions. No walls of tables; one compact table at most.

## Before you start
You need the business. If it isn't settled in this conversation, call `list_businesses` and pick/ask (see the flik-setup skill). Pass `business_id` on every call.

## Choose the tool by period
| User asks about | Call |
|---|---|
| This/last **week** | `weekly_report` (`week` = any YYYY-MM-DD in that week; default current). It already includes low stock, fiado added/collected and expenses. |
| A **month** ("cómo vengo", "este mes", "septiembre") | `business_report` (`month` YYYY-MM, `compare` true) |
| **Profit / ganancia / P&L** | `profit_and_loss` (`month` or `start_date`+`end_date`) — adds overhead to get net profit |
| **Best / worst sellers** | `top_products` with `sort_by` = `revenue`, `margin` or `units` |
| **Today** or a specific day | `list_sales` with `start_date` = `end_date` = that day, then summarize totals |

For a general "¿cómo vengo?" with no period, use the current month: `business_report` + `profit_and_loss` for the same month. Remember: if today is early in the month, also say so and offer last month.

## Read the numbers correctly
- Revenue counts only **completed** sales and excludes fiado settlement receipts (those goods were already counted when sold). The tools already do this — don't re-add settlements from `list_sales`.
- **Cost coverage**: margin is only as good as the share of sales that have a cost loaded. `profit_and_loss` returns `costCoverage.ratio`. If it is below ~0.9, say so explicitly ("el margen está calculado sobre el X% de las ventas que tienen costo cargado") and treat margin conclusions as provisional. Suggest loading costs (pricing-margins skill) as an action.
- Recurring overhead is **prorated** to the period; a partial month shows a partial overhead. Mention when relevant.
- Comparisons against a period that is still in progress are not like-for-like: compare per-day averages when one period is partial.

## Turn it into actions
Pick the 2-3 most valuable, specific to what you saw. Examples:
- Low cost coverage → "Cargá el costo de estos N productos para ver tu margen real."
- A top seller with thin margin → review its price (pricing-margins skill).
- Low-stock alerts in `weekly_report` on top sellers → reorder (stock-reorder skill).
- Fiado added > collected → review receivables (receivables skill).
- Unpaid overhead → remind of upcoming payments.
Offer to go deeper on any of them; don't run write tools from this skill.
