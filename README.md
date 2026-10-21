# Flik POS for Claude

Manage and optimize your [Flik](https://miflik.com) point-of-sale business by talking to Claude. The plugin connects Claude to your Flik account and adds guided workflows for the questions a store owner asks every day:

| Ask Claude… | What it does |
|---|---|
| "¿Cómo vengo este mes?" / "How did this week go?" | Sales, gross margin, net profit, best sellers and comparison with the previous period, with 2–3 concrete actions. |
| "¿Qué tengo que reponer?" / "Cargá este remito" | Reorder list based on low stock and sales velocity, dead stock tying up capital, and loading supplier invoices or delivery notes into stock. |
| "¿Qué productos tienen mal margen?" / "Aumentá un 8%" | Finds missing costs and low or negative margins, and proposes per-product price changes. |
| "¿Quién me debe?" | Fiado (store credit) outstanding, aging, collection priorities and ready-to-send reminder messages. |
| "Anotá que pagué la luz" / "El alquiler son $350.000 por mes" | Records one-time and recurring expenses (gastos) so net profit reflects them. |

Claude always shows you the exact changes and asks before it writes anything to Flik (prices, stock, clients, sales, expenses).

### `/pos` — sell from Claude Code

In Claude Code the plugin also adds a cashier pane. Type `/pos` to open it beside the transcript: search a product by name, barcode or SKU, pick a hit with `1`–`9`, adjust quantities or override a line's price, choose the payment method (cash, cards, transfer, MercadoPago, fiado), attach a client (`l`), add a whole-cart discount (`d`), and press `c` to charge. Carts can be parked (`h`) and resumed later (`r`), and several tabs can be open at once. The sale goes through the same `build_sale` / `complete_sale` tools, so stock, the cash-register session and fiado accounts are updated exactly as from the app.

```
/pos                 open the cashier pane
/pos park [nombre]   park the current cart
/pos resume [n]      resume a parked cart
/pos list            list parked carts
/pos business        switch business
```

**Barcode scanners.** A USB/Bluetooth keyboard-wedge scanner works out of the box. Set its suffix to **Enter / CR** (most scanners have a setup barcode for this in their manual; a Tab suffix will not work — to check, scan into any text editor: Enter starts a new line). Then scan either into the pane's `Buscar` field or straight at the Claude prompt: a digits-only message is treated as a scan, the pane opens if it was closed, and the product is added to the cart instead of being sent to Claude. While results are listed, typing a single digit and Enter picks that result, so the keyboard never has to leave the field. Two options under `/config` → Flik: **Scan barcodes at the prompt** (turn off to send digit-only messages to Claude) and **Barcode pattern** (a regex; the default covers EAN-8/UPC-A/EAN-13/ITF-14 — widen it if your scanner adds a prefix or suffix).

## Install

### Claude desktop, Cowork and claude.ai
1. Go to **Customize → Plugins → Add marketplace** and enter `https://github.com/miflik/flik-claude-plugin`.
2. Install **Flik POS**.
3. Open the plugin's **Connectors** tab, click **Connect** on Flik and sign in with your Flik account.

### Claude Code
```
/plugin marketplace add miflik/flik-claude-plugin
/plugin install flik@flik
/mcp        # select plugin:flik:flik → Authenticate
```

Then ask something like *"¿cómo vengo esta semana?"*. If your account has several businesses, Claude will ask which one to work on.

## What's inside

- **Connector**: the Flik MCP server at `https://miflik.com/api/mcp`, which uses OAuth sign-in on miflik.com. The plugin contains no keys or credentials.
- **Skills**: `flik-setup`, `business-health`, `stock-reorder`, `pricing-margins`, `receivables`, `expenses`, `tasks`. You can call them directly, e.g. `/flik:business-health semana`.
- **Cashier pane** (`hooks/`): the `/pos` command and its pane, a Claude Code mod that calls the connector's tools directly — no model turn, no extra credentials. Tests: `claude plugin test .`

### What the cashier pane runs and sends

The `/pos` mod (`hooks/register.tsx`) runs no shell commands, starts no processes, spawns no agents and fetches no URLs. Its only way out is `$.mcp.call`, which calls a tool on the Flik MCP server bundled in `.mcp.json` (`https://miflik.com/api/mcp`, run by Claude Code as `plugin:flik:flik`). If that server is not connected in the session, it uses the **claude.ai Flik** connector instead, which is the same Flik server reached through claude.ai. The call goes through Claude Code's MCP client with the OAuth sign-in you already gave the connector. The mod adds no credentials of its own, and nothing is sent to Claude or to any other host.

The tool name in that call is one of five, and each one runs only when you act in the pane:

| Tool | When | What it sends to Flik |
|---|---|---|
| `list_businesses` | The pane opens with no business chosen yet, or you press `b` / run `/pos business` | Nothing (lists your account's businesses) |
| `search_products` | You submit the `Buscar` field, or scan a barcode at the prompt (see below) | Business id, the text or barcode you typed, and a result limit of 9 |
| `list_clients` | You search in the client view (`l`) | Business id, the search text, and a result limit of 9 |
| `build_sale` | You press `c` (Cobrar) | Business id, payment method, cart lines (product id, quantity, and unit price when you overrode it), client id and discount if you set them |
| `complete_sale` | Right after `build_sale` succeeds and its total matches the pane's total | Business id and the sale token `build_sale` returned |

`complete_sale` records a real sale in Flik: it updates stock, the open cash-register session and, for fiado, the client's account. That is why it only runs when you press `c`.

**Hooks.** The mod listens to these Claude Code events:

- `session.start`: registers the `/pos` command and loads the chosen business and parked carts from the plugin's local storage (`$.store`, on your machine only).
- `command.run` for `/pos`: opens, closes or updates the pane as in the command list above.
- `prompt.submit`: looks at each prompt you type. If **Scan barcodes at the prompt** is on and the whole prompt matches **Barcode pattern** (digits only, by default), the mod keeps that prompt from reaching Claude, opens the pane, and looks the code up with `search_products` as described above. Every other prompt passes through unchanged and is not stored or sent anywhere by the mod. Prompts sent by timers or other sessions are always passed through.
- `ui.render` and `ui.close` for the pane: draw it and clear its status line.

The chosen business and parked carts are kept in `$.store` so they survive a restart. They are never sent anywhere except as the arguments listed above.

## Privacy

Claude only sees the data of the businesses you sign in to, and only when a tool is called. Access is granted per account through OAuth and can be revoked at any time by disconnecting the connector. Data is processed by Flik under the [Flik terms and privacy policy](https://miflik.com).

## Support

Questions or problems: open an issue in this repository or contact Flik through https://miflik.com.

## License

MIT
