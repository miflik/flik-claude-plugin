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
- **Skills**: `flik-setup`, `business-health`, `stock-reorder`, `pricing-margins`, `receivables`, `expenses`. You can call them directly, e.g. `/flik:business-health semana`.

## Privacy

Claude only sees the data of the businesses you sign in to, and only when a tool is called. Access is granted per account through OAuth and can be revoked at any time by disconnecting the connector. Data is processed by Flik under the [Flik terms and privacy policy](https://miflik.com).

## Support

Questions or problems: open an issue in this repository or contact Flik through https://miflik.com.

## License

MIT
