---
name: flik-setup
description: Connect Claude to a Flik POS account and choose which business to work on. Use when the user first asks about their Flik business, when a Flik tool returns an authentication / "not logged in" / 401 error, when they have several businesses and it is unclear which one they mean, or when they say things like "conectá Flik", "cambiá de negocio", "switch business", "which store am I on".
---

# Flik setup and business selection

Flik is an Argentine point-of-sale system. All of its data is reached through the `flik` MCP server bundled with this plugin. Tools are named like `list_businesses`, `business_report`, `inventory_report`, etc.

## Language
Write to the user in the language they use. Default to Rioplatense Spanish (vos) when unclear. Money is ARS: format as `$ 12.345,67`.

## 1. Make sure the connection works
Call `list_businesses` (no arguments).

- **It returns businesses** → connected. Go to step 2.
- **Authentication error / 401 / "not logged in"** → the user has not signed in yet. Explain how, depending on where they are:
  - Claude Code: run `/mcp`, select `plugin:flik:flik`, choose *Authenticate*, and sign in with their Flik account in the browser.
  - Claude desktop / Cowork / claude.ai: open *Customize → Connectors* (or the plugin's *Connectors* tab), find **Flik**, click *Connect*, and sign in.
  Then ask them to retry. Do not ask for passwords or tokens in the chat — sign-in only happens on miflik.com.
- **No businesses** → their account has no business yet; they need to create one at https://miflik.com first.

## 2. Pick the business
Every Flik tool takes a required `business_id` (the id *or* the exact business name).

- One business → use it silently.
- Several → if the user's request names one, use it; otherwise list them by name and ask which. Once chosen, you may call `switch_business` with that id so it becomes the default, and keep passing `business_id` explicitly anyway.
- Remember the chosen business for the rest of the conversation; don't ask again unless the user switches.

## 3. Say what you can do
After connecting, briefly offer the main flows (one line each, no tool names):
- How the business is doing (day / week / month, profit, best sellers)
- What to reorder and what stock is stuck
- Prices and margins to fix
- Who owes money (fiado) and what to collect first

## Ground rules for every Flik task
- **Reads are free; writes need explicit confirmation.** Before calling any tool that changes data (`update_product`, `create_product`, `delete_product`, `apply_stock`, `create_client`, `update_client`, `delete_client`, `complete_sale`), show exactly what will change and wait for a clear "sí / ok / dale". Never delete without being asked to.
- If `search_products` or `list_clients` fail with a search-index error, tell the user search is temporarily unavailable and work from report tools instead (they return product and client ids that `get_product` / `get_client` accept), or ask for the product's barcode/SKU.
