---
name: tasks
description: Read, fill in and create Flik's shelf-check tasks (tareas de verificación): counting the units of a product and checking its expiry dates, batch by batch. Use for "qué tareas tengo", "tareas pendientes", "completá la tarea", "conté 12 alfajores, 5 vencen en noviembre", "cargá el conteo", "creá tareas para el equipo", "programá controles diarios", "controlar vencimientos", "what tasks are pending", "fill in the task", "create tasks for my staff".
argument-hint: "[ver | completar | crear]"
---

# Shelf-check tasks (tareas)

Flik generates daily tasks from **schedules**: each task asks someone to go to the shelf, count a product's units and read their expiry dates. Completing a task corrects Flik's records. Answer in the user's language (default Rioplatense Spanish). Settle the business first (call `list_businesses` if needed) and pass `business_id` on every call.

## A. See the tasks
- Pending: `list_tasks` (it also generates any task that is due). Show one line per task: product, what to check, and the recorded stock / soonest recorded expiry it shows, so the user knows what to look for.
- History: `list_tasks` with `status: "completed"`. Highlight discrepancies (corrected stock, changed expiry dates) and who did them.

## B. Fill in a task
1. Get the reading from the user. For a **stock + expiry check**, ask for the units **per expiry date** on the shelf ("¿cuántas unidades hay y con qué vencimiento? si hay fechas distintas, decime cuántas de cada una"). Units with no printed date go without a date.
2. Never invent numbers: every quantity and date must come from the user. Dates go as `YYYY-MM-DD`; if the user says only month/year ("vence 11/26"), ask for the day or confirm using the last day of that month.
3. Show what you will submit (e.g. "Alfajor: 3 vencen 15/11/2026, 4 vencen 01/02/2027 → total 7") and wait for a clear "sí / dale".
4. Call `complete_task` with `task_id` and:
   - stock + expiry check → `batches: [{ quantity, expiration_date? }]` (or just `counted_stock` if the product has no expiry);
   - stock count → `counted_stock`;
   - expiry check → `expiration_date`.
   Add `comment` if the user mentioned something (roturas, faltantes, etiquetas).
5. Report the result: whether it matched or what was corrected. Explain that the count replaces the stock and, with dates, the product's batches.

The user can complete several tasks in one message; handle them one at a time, confirming the whole list once before submitting.

## C. Create tasks
1. Call `list_task_schedules` first and mention any existing schedule that already covers what they ask, to avoid duplicates.
2. Every schedule makes **daily** stock + expiry checks; products expiring soon come first. Settle: a `name`, how many products per day (`tasks_per_day`, default 3), `points_per_task` for collaborators (default 10), and the scope: whole catalog, some `categories` (names are fine), or one `product` for a daily check of that product only.
3. Confirm, then call `create_task_schedule`. It generates today's tasks right away; tell the user collaborators will see them in their panel, and offer to list them.

## Rules
- `complete_task` changes stock and expiry records: only with numbers the user gave you and after confirmation.
- Points go to collaborators who complete tasks in the app; tasks completed here are recorded under the owner and earn no points.
- Pausing, editing or deleting a schedule is done in the Flik app under **Tareas**; tell the user where if they ask.
