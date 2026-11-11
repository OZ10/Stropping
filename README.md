# Stropping

Recipes, store cupboard and shopping list in one place. A small web app that installs on your phone as a PWA and works offline.

## What it does

- **Recipes**: name, web link, and ingredients for a given number of portions. Quantities scale to however many portions you plan.
- **Items**: every ingredient or household item you use. Each can be marked:
  - **Frequently used** (e.g. milk): before it's taken from the cupboard, you're asked whether it's really still there.
  - **Short life** (e.g. chicken): if it wasn't used last week, you're asked whether it's still in date.
  - **Multi-use** (e.g. spices): tracked as in stock or not, and you're always asked whether you have it.
- **Store cupboard**: what you have and how much. **Sweep** goes through it item by item to confirm.
- **Shopping list**: grouped by category. Ticking an item puts it in the cupboard, apart from the amount set aside for planned meals.

### How they fit together

1. **Plan a meal** for the week. Stropping takes what it can from the cupboard and puts the shortfall on the shopping list.
2. **Shop** and tick things off.
3. **Start a new week.** You're asked, meal by meal, whether each one was cooked. Uncooked meals can be kept for the new week, or dropped, which puts their ingredients back in the cupboard. Short-life items that weren't used get an in-date check.

## Running it

There's no build step. It's plain HTML, CSS and JavaScript.

- **Quick look:** open `index.html` in a browser. Everything works except offline/install.
- **Locally with offline support:** serve the folder, e.g. `npx serve .` or `python -m http.server`, then open the address it prints.
- **On your phone:** host it anywhere static. GitHub Pages works well (Settings → Pages → deploy from `master`, root). Then open it on your phone and use *Add to Home Screen* / *Install app*.

Data is saved in the browser on each device (`localStorage`). Use the ⋮ menu to **back up** to a file and **restore** it, including onto another device.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page shell and tab bar |
| `logic.js` | Data model and stock rules (no DOM; runs in Node too) |
| `app.js` | Views, forms and prompts |
| `styles.css` | Styles, including dark mode |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA: offline cache, install metadata, icons |

The original 2016 Android version of Stropping is still in the git history (up to commit `4812342`).
