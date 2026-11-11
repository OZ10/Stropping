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

Without sharing set up, data is saved in the browser on each device (`localStorage`). Use the ⋮ menu to **back up** to a file and **restore** it.

## Sharing with your household

Stropping can keep everyone's phones in sync using [Firebase](https://firebase.google.com/). The free plan is far more than a household needs. The app stays on GitHub Pages; Firebase only stores the data and handles Google sign-in.

This copy is already connected to the Firebase project **`stropping-home`**: a Firestore database (Standard edition, `europe-west2` London), with the rules from `firestore.rules` deployed and the web app config in `firebase-config.js`. After changing the rules, redeploy them with:

```
npx -y firebase-tools@latest deploy --only firestore:rules
```

### One-time setup for a new Firebase project (about 10 minutes)

1. Go to the [Firebase console](https://console.firebase.google.com/) and **Create a project**. You don't need Google Analytics.
2. **Turn on Google sign-in:** *Build → Authentication → Get started → Sign-in method → Google → Enable → Save*.
3. **Allow your site to sign in:** *Authentication → Settings → Authorised domains → Add domain* and enter your GitHub Pages domain, e.g. `oz10.github.io`. (`localhost` is already there for local testing.)
4. **Create the database:** *Build → Firestore Database → Create database*. Pick a location near you and start in **production mode**.
5. **Add the security rules:** in Firestore, open the **Rules** tab, replace everything with the contents of [`firestore.rules`](firestore.rules), and click **Publish**.
6. **Connect the app:** *Project settings (⚙) → General → Your apps → Web (`</>`)*. Register an app (no Firebase Hosting needed) and copy the `firebaseConfig` values into [`firebase-config.js`](firebase-config.js):
   ```js
   window.STROPPING_FIREBASE_CONFIG = {
     apiKey: 'AIza…',
     authDomain: 'your-project.firebaseapp.com',
     projectId: 'your-project',
     appId: '1:…:web:…',
   };
   ```
   These values aren't secret. They only say which project to use. The rules decide who can read or write.
7. Commit and push. GitHub Pages picks up the change.

### Using it

1. On your phone, open ⋮ → **Sign in with Google** → **Create a household**. Everything already on that phone becomes the household's data.
2. Tap **Invite someone** and send the link. It works for 7 days.
3. They open the link, sign in, and they're in. Their phone now shows the shared recipes, cupboard and list.

Changes appear on everyone's phone within a second or two. Without signal (in the supermarket, say), changes are kept on the phone and sync when it reconnects. Each recipe, item and list entry is saved separately, so two people ticking items at the same time don't overwrite each other.

**Leave** or **Sign out** stops syncing. The phone keeps its own copy of the data.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page shell and tab bar |
| `logic.js` | Data model and stock rules (no DOM; runs in Node too) |
| `app.js` | Views, forms and prompts |
| `styles.css` | Styles, including dark mode |
| `sync.js` | Household sharing via Firebase (loads only when configured) |
| `firebase-config.js` | Your Firebase project settings, or `null` for no sharing |
| `firestore.rules` | Database security rules to paste into the Firebase console |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA: offline cache, install metadata, icons |

The original 2016 Android version of Stropping is still in the git history (up to commit `4812342`).
