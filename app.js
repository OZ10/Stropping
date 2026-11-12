/* Stropping — UI. Rules live in logic.js; this file renders views and runs the prompts. */
(function () {
  'use strict';

  const L = window.StroppingLogic;
  const KEY = 'stropping:v1';
  const TAB_KEY = 'stropping:tab';
  const TABS = ['week', 'recipes', 'cupboard', 'shopping', 'items'];

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ICON = {
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7h-2V6.4l-9.3 9.3-1.4-1.4L17.6 5H14zM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/></svg>',
  };

  // ---------- Storage ----------

  let state = load();
  let tab = 'week';
  try { tab = localStorage.getItem(TAB_KEY) || 'week'; } catch (e) { /* storage blocked */ }
  if (!TABS.includes(tab)) tab = 'week';
  let itemFilter = '';

  // ---------- Sharing (sync.js) ----------
  const SHARED_KEY = 'stropping:shared';
  const JOIN_KEY = 'stropping:join';
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const cfg = window.STROPPING_FIREBASE_CONFIG;
  let sync = null;
  let syncStatus = { configured: !!(cfg && cfg.apiKey), ready: false };
  let shadow = clone(state); // state as last saved/synced; commit() diffs against it
  let queued = []; // changes made before sync connected, on a device that was sharing
  let joinPrompted = false;
  let pendingJoin = null;
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
  const shared = () => !!(sync && syncStatus.householdId);
  {
    const params = new URLSearchParams(location.search);
    const code = params.get('join');
    if (code) {
      lsSet(JOIN_KEY, code);
      history.replaceState(null, '', location.pathname);
    }
    pendingJoin = lsGet(JOIN_KEY);
  }

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) {
      setTimeout(() => toast('This browser is blocking storage, so changes won’t be kept.'), 300);
    }
    if (!raw) return L.emptyState();
    try {
      return L.normalise(JSON.parse(raw));
    } catch (e) {
      try { localStorage.setItem(`${KEY}:unreadable-${Date.now()}`, raw); } catch (_) { /* ignore */ }
      setTimeout(() => toast('Saved data couldn’t be read. A copy was kept and the app started empty.'), 300);
      return L.emptyState();
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {
      toast('Couldn’t save. Browser storage may be full or blocked.');
    }
  }

  /**
   * Save changes. Either mutate `state` in place and call commit(), or pass a
   * new state. Flows that awaited the user pass the state they started from as
   * `base`, so only their own changes are applied on top of anything that
   * arrived from other devices in the meantime.
   */
  function commit(next, base) {
    let changes;
    if (next && base) {
      changes = L.diffDocs(L.toDocs(base), L.toDocs(next));
      state = L.applyDocChanges(state, changes);
    } else {
      if (next) state = next;
      changes = L.diffDocs(L.toDocs(shadow), L.toDocs(state));
    }
    shadow = clone(state);
    save();
    render();
    if (!changes.set.length && !changes.del.length) return;
    if (shared()) sync.write(changes);
    else if (lsGet(SHARED_KEY)) queued.push(changes);
  }

  // Called by sync.js with the household's documents whenever they change.
  function onRemote(docs) {
    let next = L.fromDocs(docs);
    if (queued.length && shared()) {
      for (const ch of queued) {
        next = L.applyDocChanges(next, ch);
        sync.write(ch);
      }
      queued = [];
    }
    state = next;
    shadow = clone(state);
    save();
    render();
  }

  function onSyncStatus(st) {
    syncStatus = st;
    if (st.householdId) lsSet(SHARED_KEY, '1');
    else if (st.householdLoaded) { lsSet(SHARED_KEY, null); queued = []; }
    updatePill();
    const section = $('#sheet[open] #household');
    if (section) section.innerHTML = householdHtml();
    const note = $('#sheet[open] #storage-note');
    if (note) note.textContent = storageNote();
    // Opened from an invite link: once signed in, offer to join.
    if (pendingJoin && st.ready) {
      if (st.user && st.householdLoaded) {
        const code = pendingJoin;
        pendingJoin = null;
        lsSet(JOIN_KEY, null);
        joinFlow(code);
      } else if (!st.user && !joinPrompted) {
        joinPrompted = true;
        if (!$('#sheet').open) menuSheet();
        toast('Sign in to join the household you were invited to.');
      }
    }
    if (st.error && st.error !== onSyncStatus.lastError) toast(st.error);
    onSyncStatus.lastError = st.error;
  }

  function updatePill() {
    const pill = $('#sync-pill');
    if (!shared()) { pill.hidden = true; return; }
    pill.hidden = false;
    const offline = !navigator.onLine;
    pill.textContent = offline ? 'Offline' : syncStatus.pending ? 'Saving…' : 'Shared';
    pill.className = `pill${offline ? ' warn' : ''}`;
    pill.title = offline ? 'Changes are saved on this phone and will sync when you’re back online.' : `Shared with ${syncStatus.household ? syncStatus.household.name : 'your household'}`;
  }
  window.addEventListener('online', updatePill);
  window.addEventListener('offline', updatePill);

  window.StroppingApp = {
    attachSync(adapter) { sync = adapter; },
    onRemote,
    onSyncStatus,
  };

  // ---------- Formatting ----------

  // Built-in units that take a plural. Custom units are shown exactly as the household typed them.
  const PLURAL = { pint: 'pints', clove: 'cloves', tin: 'tins', jar: 'jars', pack: 'packs', bottle: 'bottles', bunch: 'bunches', slice: 'slices', pinch: 'pinches' };
  const num = (n) => String(L.round(n));
  function fmtQty(n, unit) {
    const v = num(n);
    if (unit === 'each') return v;
    if (PLURAL[unit]) return `${v} ${L.round(n) === 1 ? unit : PLURAL[unit]}`;
    return `${v} ${unit}`;
  }
  const itemQty = (item, n) => (item.multiUse ? 'In stock' : fmtQty(n, item.unit));
  const fmtDate = (iso) => new Date(`${iso}T00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  function safeUrl(u) {
    try {
      const x = new URL(u);
      return /^https?:$/.test(x.protocol) ? x.href : '';
    } catch (e) { return ''; }
  }
  function host(u) {
    try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  }

  function badges(item) {
    return [
      item.frequent && '<span class="badge freq">Frequent</span>',
      item.shortLife && '<span class="badge short">Short life</span>',
      item.multiUse && '<span class="badge multi">Multi-use</span>',
    ].filter(Boolean).join('');
  }

  /** Group [{item,...}] rows by item category in the standard order. */
  function byCategory(rows) {
    const groups = new Map();
    for (const row of rows) {
      const cat = row.item.category;
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(row);
    }
    // Household's category order; anything unknown (e.g. mid-sync) goes at the end.
    const order = L.categoriesFor(state);
    const cats = [...order.filter((c) => groups.has(c)), ...[...groups.keys()].filter((c) => !order.includes(c)).sort()];
    return cats.map((c) => [c, groups.get(c).sort((a, b) => a.item.name.localeCompare(b.item.name))]);
  }

  const withCurrent = (list, sel) => (sel && !list.includes(sel) ? [...list, sel] : list);
  const unitOptions = (sel) => withCurrent(L.unitsFor(state), sel)
    .map((u) => `<option value="${esc(u)}"${u === sel ? ' selected' : ''}>${esc(u)}</option>`).join('');
  const catOptions = (sel) => withCurrent(L.categoriesFor(state), sel)
    .map((c) => `<option value="${esc(c)}"${c === sel ? ' selected' : ''}>${esc(c)}</option>`).join('');
  const itemsDatalist = () => `<datalist id="items-dl">${state.items.map((i) => `<option value="${esc(i.name)}">`).join('')}</datalist>`;

  function empty(text, extra = '') {
    return `<div class="empty"><p>${esc(text)}</p>${extra}</div>`;
  }

  // ---------- Views ----------

  const VIEWS = { week: renderWeek, recipes: renderRecipes, cupboard: renderCupboard, shopping: renderShopping, items: renderItems };

  function render() {
    $('#view').innerHTML = VIEWS[tab]();
    $$('.tabbar [data-tab]').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
    const n = state.shopping.filter((e) => !e.done).length;
    const c = $('#shop-count');
    c.hidden = !n;
    c.textContent = n;
    if (tab === 'items') applyItemFilter();
  }

  function go(t) {
    tab = t;
    try { localStorage.setItem(TAB_KEY, t); } catch (e) { /* ignore */ }
    render();
    window.scrollTo(0, 0);
  }

  function renderWeek() {
    const meals = state.week.meals;
    const toBuy = state.shopping.filter((e) => !e.done).length;
    const fresh = !state.items.length && !state.recipes.length;
    let body;
    if (meals.length) {
      body = `<ul class="cards">${meals.map(mealCard).join('')}</ul>`;
    } else if (fresh) {
      body = empty('Welcome! Add your recipes, then plan them into the week. Stropping checks the cupboard and builds your shopping list.',
        '<div class="row-btns"><button class="btn primary" data-act="new-recipe">+ Add a recipe</button><button class="btn" data-act="sample">Try sample data</button></div>');
    } else if (!state.recipes.length) {
      body = empty('No recipes yet. Add one, then plan it into the week.', '<button class="btn primary" data-act="new-recipe">+ Add a recipe</button>');
    } else {
      body = empty('Nothing planned yet. Add a meal and Stropping will work out what you need to buy.');
    }
    const lw = state.lastWeek;
    const lastWeek = lw ? `<p class="hint">Last week: ${[
      lw.cooked.length && `${lw.cooked.length} cooked`,
      lw.carried.length && `${lw.carried.length} carried over`,
      lw.dropped.length && `${lw.dropped.length} dropped`,
      lw.binned.length && `${lw.binned.length} short-life item${lw.binned.length === 1 ? '' : 's'} thrown out`,
    ].filter(Boolean).join(', ') || 'no meals planned'}.</p>` : '';

    return `
      <div class="head">
        <div><h2>This week</h2><p class="sub">Started ${esc(fmtDate(state.week.start))}</p></div>
        ${state.recipes.length ? '<button class="btn primary" data-act="add-meal">+ Add meal</button>' : ''}
      </div>
      ${body}
      ${toBuy ? `<button class="banner" data-act="go" data-tab="shopping"><span><strong>${toBuy}</strong> ${toBuy === 1 ? 'item' : 'items'} on the shopping list</span><span aria-hidden="true">→</span></button>` : ''}
      ${fresh ? '' : `<section class="panel">
        <h3>Ready for next week’s shop?</h3>
        <p>Confirm which meals you cooked. Ingredients for uncooked meals go back in the cupboard, and short-life items get an in-date check.</p>
        <button class="btn" data-act="new-week">Start a new week</button>
        ${lastWeek}
      </section>`}`;
  }

  function mealCard(m) {
    const url = safeUrl(m.url);
    return `<li class="card meal${m.cooked ? ' is-done' : ''}">
      <label class="check" title="Cooked"><input type="checkbox" data-act="cooked" data-id="${m.id}"${m.cooked ? ' checked' : ''}><span class="sr">Mark ${esc(m.name)} cooked</span></label>
      <div class="grow">
        <div class="title">${esc(m.name)}</div>
        <div class="sub">${plural(m.portions, 'portion')}${m.cooked ? ' · cooked' : ''}</div>
      </div>
      ${url ? `<a class="icon-btn" href="${esc(url)}" target="_blank" rel="noopener" aria-label="Open recipe for ${esc(m.name)}">${ICON.link}</a>` : ''}
      <button class="icon-btn" data-act="remove-meal" data-id="${m.id}" aria-label="Remove ${esc(m.name)}">${ICON.x}</button>
    </li>`;
  }

  function renderRecipes() {
    const planned = new Set(state.week.meals.map((m) => m.recipeId));
    const list = [...state.recipes].sort((a, b) => a.name.localeCompare(b.name));
    return `
      <div class="head">
        <div><h2>Recipes</h2><p class="sub">${plural(list.length, 'recipe')}</p></div>
        <button class="btn primary" data-act="new-recipe">+ New recipe</button>
      </div>
      ${list.length ? `<ul class="cards">${list.map((r) => `
        <li><button class="card recipe" data-act="view-recipe" data-id="${r.id}">
          <span class="grow">
            <span class="title">${esc(r.name)}</span>
            <span class="sub">Serves ${r.serves} · ${plural(r.ingredients.length, 'ingredient')}${host(r.url) ? ` · ${esc(host(r.url))}` : ''}</span>
          </span>
          ${planned.has(r.id) ? '<span class="badge plan">This week</span>' : ''}
        </button></li>`).join('')}</ul>`
        : empty('No recipes yet. Add a name, a link and the ingredients for the number of portions it makes.')}`;
  }

  function renderCupboard() {
    const rows = Object.entries(state.cupboard).map(([id, qty]) => ({ item: L.itemById(state, id), qty })).filter((r) => r.item);
    return `
      <div class="head">
        <div><h2>Store cupboard</h2><p class="sub">${plural(rows.length, 'item')} in stock</p></div>
        <div class="row-btns">
          ${rows.length ? '<button class="btn" data-act="sweep">Sweep</button>' : ''}
          <button class="btn primary" data-act="add-cupboard">+ Add</button>
        </div>
      </div>
      ${rows.length ? byCategory(rows).map(([cat, list]) => `
        <section class="group"><h3>${esc(cat)}</h3><ul class="rows">${list.map(({ item, qty }) => `
          <li><button class="row-main" data-act="edit-cupboard" data-id="${item.id}">
            <span class="grow"><span class="title">${esc(item.name)}</span>${badges(item)}</span>
            <span class="qty">${esc(itemQty(item, qty))}</span>
          </button></li>`).join('')}</ul></section>`).join('')
        : empty('The cupboard is empty. Add what you have in stock, or tick things off the shopping list and they’ll be added here.')}
      ${rows.length ? '<p class="hint">Sweep goes through each item so you can confirm it’s still there.</p>' : ''}`;
  }

  function renderShopping() {
    const rows = state.shopping.map((e) => ({ e, item: L.itemById(state, e.itemId) })).filter((r) => r.item);
    const toBuy = rows.filter((r) => !r.e.done).length;
    const ticked = rows.length - toBuy;
    return `
      <div class="head">
        <div><h2>Shopping list</h2><p class="sub">${toBuy ? `${toBuy} to buy` : 'All done'}</p></div>
        <button class="btn primary" data-act="add-shopping">+ Add</button>
      </div>
      ${rows.length ? byCategory(rows).map(([cat, list]) => `
        <section class="group"><h3>${esc(cat)}</h3><ul class="rows">${list.map(({ e, item }) => `
          <li class="shop${e.done ? ' is-done' : ''}">
            <label class="check"><input type="checkbox" data-act="bought" data-id="${e.id}"${e.done ? ' checked' : ''}><span class="sr">Bought ${esc(item.name)}</span></label>
            <button class="row-main" data-act="edit-shopping" data-id="${e.id}">
              <span class="grow"><span class="title">${esc(item.name)}</span>${e.reserved > L.EPS ? '<span class="sub">for this week’s meals</span>' : ''}</span>
              <span class="qty">${item.multiUse ? '' : esc(fmtQty(L.buyQty(state, e), item.unit))}</span>
            </button>
          </li>`).join('')}</ul></section>`).join('')
        : empty('Nothing on the list. Plan some meals, or add items yourself.')}
      ${rows.length ? `<div class="foot">
        ${ticked ? `<button class="btn" data-act="clear-bought">Clear ${plural(ticked, 'ticked item')}</button>` : ''}
        <button class="btn danger-text" data-act="clear-list">Clear list</button>
      </div>` : ''}
      ${rows.length ? '<p class="hint">Ticking an item puts it in the cupboard, apart from the amount set aside for this week’s meals.</p>' : ''}`;
  }

  function renderItems() {
    const rows = state.items.map((item) => ({ item }));
    const onList = new Set(state.shopping.filter((e) => !e.done).map((e) => e.itemId));
    return `
      <div class="head">
        <div><h2>Items</h2><p class="sub">Ingredients and household items</p></div>
        <div class="row-btns">
          <button class="btn" data-act="lists">Units &amp; categories</button>
          <button class="btn primary" data-act="new-item">+ New item</button>
        </div>
      </div>
      ${rows.length ? `<input type="search" class="search" data-filter placeholder="Search items" aria-label="Search items" value="${esc(itemFilter)}">` : ''}
      ${rows.length ? byCategory(rows).map(([cat, list]) => `
        <section class="group" data-group><h3>${esc(cat)}</h3><ul class="rows">${list.map(({ item }) => `
          <li data-name="${esc(item.name.toLowerCase())}">
            <button class="row-main" data-act="edit-item" data-id="${item.id}">
              <span class="grow"><span class="title">${esc(item.name)}</span>${badges(item)}</span>
              <span class="sub" title="${item.defaultQty > 0 ? 'Default amount' : 'Unit'}">${esc(item.defaultQty > 0 && !item.multiUse ? fmtQty(item.defaultQty, item.unit) : item.unit)}</span>
            </button>
            ${onList.has(item.id) ? '<span class="on-list">On list</span>' : `<button class="btn small" data-act="item-to-list" data-id="${item.id}" aria-label="Add ${esc(item.name)} to shopping list">+ List</button>`}
          </li>`).join('')}</ul></section>`).join('')
        : empty('No items yet. Items are created automatically when you add ingredients to a recipe, or you can add them here.')}
      <p class="hint empty-search" hidden>No items match.</p>`;
  }

  function applyItemFilter() {
    const q = itemFilter.trim().toLowerCase();
    let any = false;
    $$('[data-group]').forEach((g) => {
      let shown = 0;
      $$('li[data-name]', g).forEach((li) => {
        const ok = !q || li.dataset.name.includes(q);
        li.hidden = !ok;
        if (ok) shown++;
      });
      g.hidden = !shown;
      if (shown) any = true;
    });
    const msg = $('.empty-search');
    if (msg) msg.hidden = any || !state.items.length;
  }

  // ---------- Dialogs ----------

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 3500);
  }

  /** Open the form sheet. onSubmit(form) runs on submit; return false to keep it open. */
  function openSheet({ title, html, onMount, onSubmit, autofocus = true }) {
    const d = $('#sheet');
    d.innerHTML = `<form class="sheet-inner">
      <header class="sheet-head"><h2 tabindex="-1" autofocus>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Close">${ICON.x}</button></header>
      <div class="sheet-body">${html}</div>
    </form>`;
    const form = $('form', d);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (onSubmit && onSubmit(form) !== false) d.close();
    });
    if (!d.open) d.showModal();
    if (onMount) onMount(d, form);
    const first = autofocus && $('input:not([type=hidden]):not([type=checkbox]), select', d);
    if (first && !first.value) first.focus();
  }
  const closeSheet = () => $('#sheet').close();

  /**
   * Ask a question in a modal. buttons: [{label, value, style}].
   * With `input`, resolves { value, input } (input is the number entered).
   * A button whose value is null, or pressing Escape, resolves null.
   */
  function ask({ title, text = '', html = '', buttons, input, progress, stack }) {
    return new Promise((resolve) => {
      const d = $('#prompt');
      d.innerHTML = `<form class="prompt-inner">
        ${progress ? `<p class="progress">${esc(progress)}</p>` : ''}
        <h2>${esc(title)}</h2>
        ${text ? `<p>${esc(text)}</p>` : ''}${html}
        ${input ? `<label class="field"><span>${esc(input.label)}</span>${input.type === 'text'
          ? `<input name="v" type="text" autocomplete="off" maxlength="${input.maxlength || 100}" autocapitalize="${input.caps || 'sentences'}" value="${esc(input.value)}">`
          : `<input name="v" type="number" min="0" step="any" inputmode="decimal" value="${esc(input.value)}">`}</label>` : ''}
        <div class="prompt-actions${stack ? ' stack' : ''}">${buttons.map((b, i) => `<button type="button" class="btn ${b.style || ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>
      </form>`;
      const field = $('input[name=v]', d);
      let settled = false;
      const finish = (v) => {
        if (settled) return;
        settled = true;
        d.close();
        resolve(v);
      };
      const press = (b) => {
        if (b.value === null) return finish(null);
        if (!input) return finish(b.value);
        if (input.type === 'text') {
          const t = field.value.trim();
          if (b.needsInput && !t) {
            field.setCustomValidity('Please fill this in');
            field.reportValidity();
            return;
          }
          return finish({ value: b.value, input: t });
        }
        const v = parseFloat(field.value);
        if (b.needsInput && !(v >= 0)) {
          field.setCustomValidity('Enter an amount');
          field.reportValidity();
          return;
        }
        finish({ value: b.value, input: v >= 0 ? v : null });
      };
      d.onclick = (e) => {
        const b = e.target.closest('[data-i]');
        if (b) press(buttons[+b.dataset.i]);
      };
      d.oncancel = (e) => { e.preventDefault(); finish(null); };
      $('form', d).onsubmit = (e) => {
        e.preventDefault();
        const primary = buttons.find((b) => (b.style || '').includes('primary'));
        if (primary) press(primary);
      };
      if (field) field.oninput = () => field.setCustomValidity('');
      d.showModal();
      if (field) { field.focus(); field.select(); } else {
        const p = $('.btn.primary', d);
        if (p) p.focus();
      }
    });
  }

  const confirm = (title, text, label = 'OK', style = 'primary') =>
    ask({ title, text, buttons: [{ label: 'Cancel', value: false }, { label, value: true, style }] });

  const CANCEL = { label: 'Cancel', value: null, style: 'quiet' };

  // Questions asked by the flows in logic.js.
  async function flowAsk(q) {
    const item = q.item;
    switch (q.kind) {
      case 'multi':
        return ask({
          progress: `Planning ${q.meal.name}`,
          title: `Have you got ${item.name}?`,
          text: `${item.name} is multi-use, so Stropping can’t tell how much is left. Is there enough for this meal?`,
          buttons: [CANCEL, { label: 'No, add to list', value: false }, { label: 'Yes', value: true, style: 'primary' }],
        });
      case 'frequent':
        return ask({
          progress: `Planning ${q.meal.name}`,
          title: `Still got ${item.name}?`,
          text: `The cupboard says ${fmtQty(q.qty, item.unit)}, but ${item.name} gets used outside recipes and may have run out. This meal needs ${fmtQty(q.need, item.unit)}.`,
          buttons: [CANCEL, { label: 'No, add to list', value: false }, { label: 'Yes', value: true, style: 'primary' }],
        });
      case 'cooked':
        return ask({
          progress: `Last week · meal ${q.index + 1} of ${q.total}`,
          title: `Did you cook ${q.meal.name}?`,
          text: `${plural(q.meal.portions, 'portion')}. If you drop it, its ingredients go back in the cupboard.`,
          stack: true,
          buttons: [
            { label: 'Yes, cooked', value: 'cooked', style: 'primary' },
            { label: 'Not cooked, keep it for this week', value: 'carry' },
            { label: 'Not cooked, drop it', value: 'drop' },
            CANCEL,
          ],
        });
      case 'shortlife-meal':
        return ask({
          progress: 'In-date check',
          title: `Is the ${item.name} still in date?`,
          text: `${q.meal.name} wasn’t cooked last week. ${fmtQty(q.qty, item.unit)} of ${item.name} is set aside for it.`,
          buttons: [CANCEL, { label: 'No, buy fresh', value: false }, { label: 'Yes', value: true, style: 'primary' }],
        });
      case 'shortlife':
        return ask({
          progress: 'In-date check',
          title: `Is the ${item.name} still in date?`,
          text: `${item.name} (${fmtQty(q.qty, item.unit)}) is short-life and wasn’t used last week.`,
          buttons: [CANCEL, { label: 'No, throw it out', value: false }, { label: 'Yes, keep it', value: true, style: 'primary' }],
        });
      case 'sweep': {
        const res = await ask({
          progress: `Sweep · ${q.index + 1} of ${q.total}`,
          title: item.name,
          text: item.multiUse ? 'Still in stock?' : 'Still in the cupboard? Change the amount if it’s different.',
          input: item.multiUse ? null : { label: `Amount (${item.unit})`, value: num(q.qty) },
          buttons: [
            { label: 'Stop', value: null, style: 'quiet' },
            { label: 'Gone', value: 'gone' },
            { label: 'Gone, add to list', value: 'gone-list' },
            { label: 'Still there', value: 'keep', style: 'primary' },
          ],
        });
        if (res == null) return null;
        const value = item.multiUse ? res : res.value;
        if (value === 'keep') return { action: 'keep', qty: item.multiUse ? undefined : res.input };
        return { action: 'gone', addToList: value === 'gone-list' };
      }
      default:
        throw new Error(`Unknown question ${q.kind}`);
    }
  }

  // ---------- Flows ----------

  async function planFlow(recipeId, portions) {
    const base = state;
    const res = await L.planMeal(base, recipeId, portions, flowAsk);
    if (!res) { toast('Cancelled. Nothing was changed.'); return; }
    commit(res.state, base);
    const line = (r) => {
      const u = r.item.unit;
      if (r.status === 'have') return 'in the cupboard';
      if (r.status === 'on-list') return 'already on the list';
      if (r.item.multiUse) return 'added to the list';
      if (r.status === 'buy') return r.fromCupboard > L.EPS ? `${fmtQty(r.toShop, u)} to buy, ${fmtQty(r.fromCupboard, u)} from the cupboard` : `${fmtQty(r.toShop, u)} to buy`;
      return `${fmtQty(r.fromCupboard, u)} from the cupboard`;
    };
    const buy = res.report.filter((r) => r.status === 'buy');
    const have = res.report.filter((r) => r.status !== 'buy');
    const list = (rows) => `<ul class="summary">${rows.map((r) => `<li><strong>${esc(r.item.name)}</strong><span>${esc(line(r))}</span></li>`).join('')}</ul>`;
    const html = (buy.length ? `<h3>Added to the shopping list</h3>${list(buy)}` : '<p>Everything’s in the cupboard, so nothing needs buying.</p>')
      + (have.length ? `<h3>Already got</h3>${list(have)}` : '');
    const v = await ask({
      title: `${res.meal.name} added`,
      text: `${plural(res.meal.portions, 'portion')} planned for this week.`,
      html,
      buttons: [{ label: 'Done', value: 'ok', style: buy.length ? '' : 'primary' }, buy.length && { label: 'Shopping list', value: 'shop', style: 'primary' }].filter(Boolean),
    });
    go(v === 'shop' ? 'shopping' : 'week');
  }

  async function newWeekFlow() {
    const n = state.week.meals.length;
    const ok = await confirm('Start a new week?',
      n ? `First confirm which of this week’s ${plural(n, 'meal')} you cooked. Then Stropping checks your short-life items.`
        : 'No meals were planned this week. Stropping will check the short-life items in your cupboard.',
      'Start');
    if (!ok) return;
    const base = state;
    const res = await L.startNewWeek(base, flowAsk);
    if (!res) { toast('Cancelled. Nothing was changed.'); return; }
    commit(res.state, base);
    go('week');
    const s = res.summary;
    const lines = [
      s.cooked.length && `<li><strong>Cooked</strong><span>${esc(s.cooked.join(', '))}</span></li>`,
      s.carried.length && `<li><strong>Kept for this week</strong><span>${esc(s.carried.join(', '))}</span></li>`,
      s.dropped.length && `<li><strong>Dropped, ingredients back in the cupboard</strong><span>${esc(s.dropped.join(', '))}</span></li>`,
      s.binned.length && `<li><strong>Thrown out</strong><span>${esc(s.binned.join(', '))}</span></li>`,
    ].filter(Boolean);
    const v = await ask({
      title: 'New week started',
      html: lines.length ? `<ul class="summary">${lines.join('')}</ul>` : '<p>All checked.</p>',
      buttons: [{ label: 'Done', value: 'ok' }, { label: 'Plan meals', value: 'plan', style: 'primary' }],
    });
    if (v === 'plan') addMealSheet();
  }

  async function sweepFlow() {
    if (!Object.keys(state.cupboard).length) { toast('The cupboard is empty.'); return; }
    const base = state;
    const res = await L.sweep(base, flowAsk);
    commit(res.state, base);
    toast(`Checked ${res.reviewed} of ${plural(res.total, 'item')}${res.removed ? `, ${res.removed} removed` : ''}.`);
  }

  // ---------- Sheets ----------

  function addMealSheet(recipeId) {
    if (!state.recipes.length) { toast('Add a recipe first.'); go('recipes'); return; }
    const recipes = [...state.recipes].sort((a, b) => a.name.localeCompare(b.name));
    const sel = recipes.find((r) => r.id === recipeId) || recipes[0];
    openSheet({
      title: 'Add a meal to this week',
      html: `
        <label class="field"><span>Recipe</span><select name="recipe">${recipes.map((r) => `<option value="${r.id}"${r === sel ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Portions</span><input name="portions" type="number" min="1" step="1" inputmode="numeric" required value="${sel.serves}"></label>
        <div class="sheet-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Add to week</button></div>`,
      onMount: (d, form) => {
        form.recipe.addEventListener('change', () => {
          const r = state.recipes.find((x) => x.id === form.recipe.value);
          if (r) form.portions.value = r.serves;
        });
      },
      onSubmit: (form) => {
        const id = form.recipe.value;
        const p = parseInt(form.portions.value, 10);
        setTimeout(() => planFlow(id, p));
      },
    });
  }

  function viewRecipe(id) {
    const r = state.recipes.find((x) => x.id === id);
    if (!r) return;
    let portions = r.serves;
    const url = safeUrl(r.url);
    const ingList = () => r.ingredients.map((g) => {
      const item = L.itemById(state, g.itemId);
      if (!item) return '';
      const need = L.scaleQty(r, g.qty, portions);
      const have = L.cupQty(state, item.id);
      let status;
      if (item.multiUse) status = have ? '<span class="ok">In cupboard</span>' : '<span class="need">Not in cupboard</span>';
      else if (have >= need - L.EPS) status = '<span class="ok">In cupboard</span>';
      else if (have > L.EPS) status = `<span class="need">Have ${esc(fmtQty(have, item.unit))}</span>`;
      else status = '<span class="need">To buy</span>';
      return `<li><span class="grow"><span class="title">${esc(item.name)}</span>${badges(item)}</span><span class="qty">${esc(fmtQty(need, item.unit))}${status}</span></li>`;
    }).join('');
    openSheet({
      title: r.name,
      html: `
        ${url ? `<a class="ext" href="${esc(url)}" target="_blank" rel="noopener">${ICON.link}<span>Open recipe on ${esc(host(url))}</span></a>` : ''}
        <div class="stepper"><span>Portions</span>
          <button type="button" class="icon-btn" data-step="-1" aria-label="Fewer portions">−</button>
          <output>${portions}</output>
          <button type="button" class="icon-btn" data-step="1" aria-label="More portions">+</button>
          <span class="sub">Recipe serves ${r.serves}</span>
        </div>
        ${r.ingredients.length ? `<ul class="ing-list">${ingList()}</ul>` : '<p class="hint">No ingredients yet.</p>'}
        ${r.instructions ? `<section class="method"><h3>Instructions</h3><div class="method-text">${esc(r.instructions)}</div></section>` : ''}
        <div class="sheet-actions">
          <button type="button" class="btn danger-text" data-del>Delete</button>
          <span class="grow"></span>
          <button type="button" class="btn" data-edit>Edit</button>
          <button class="btn primary">Add to week</button>
        </div>`,
      onMount: (d) => {
        d.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
          portions = Math.max(1, portions + Number(b.dataset.step));
          $('output', d).textContent = portions;
          const ul = $('.ing-list', d);
          if (ul) ul.innerHTML = ingList();
        }));
        $('[data-edit]', d).addEventListener('click', () => editRecipe(r.id));
        $('[data-del]', d).addEventListener('click', async () => {
          if (!(await confirm(`Delete ${r.name}?`, 'Meals already planned this week stay on the plan.', 'Delete', 'danger'))) return;
          state.recipes = state.recipes.filter((x) => x.id !== r.id);
          closeSheet();
          commit();
          toast('Recipe deleted.');
        });
      },
      onSubmit: () => { setTimeout(() => planFlow(r.id, portions)); },
    });
  }

  const ingRow = (name = '', qty = '', unit = 'each') => `<div class="ing-row">
    <input class="ing-name" list="items-dl" maxlength="100" placeholder="Ingredient" value="${esc(name)}" aria-label="Ingredient" autocomplete="off">
    <input class="ing-qty" type="number" min="0" step="any" inputmode="decimal" placeholder="Qty" value="${esc(qty)}" aria-label="Quantity">
    <select class="ing-unit" aria-label="Unit">${unitOptions(unit)}</select>
    <button type="button" class="icon-btn" data-remove-row aria-label="Remove ingredient">${ICON.x}</button>
  </div>`;

  function editRecipe(id) {
    const r = state.recipes.find((x) => x.id === id) || { name: '', url: '', serves: 4, ingredients: [], instructions: '' };
    const rows = r.ingredients.map((g) => {
      const item = L.itemById(state, g.itemId);
      return item ? ingRow(item.name, num(g.qty), item.unit) : '';
    }).join('') || ingRow();
    openSheet({
      title: id ? 'Edit recipe' : 'New recipe',
      html: `
        <label class="field"><span>Name</span><input name="name" required maxlength="200" value="${esc(r.name)}" autocomplete="off"></label>
        <label class="field"><span>Web link <em>optional</em></span><input name="url" type="text" inputmode="url" maxlength="2000" placeholder="https://…" value="${esc(r.url)}" autocomplete="off"></label>
        <label class="field narrow"><span>Serves</span><input name="serves" type="number" min="1" step="1" inputmode="numeric" required value="${r.serves}"></label>
        <fieldset class="ings"><legend>Ingredients</legend>
          <div class="ing-rows">${rows}</div>
          <button type="button" class="btn small" data-add-row>+ Add ingredient</button>
          <p class="hint">Quantities are for the number of portions above. New names are added to your items list.</p>
        </fieldset>
        <label class="field"><span>Instructions <em>optional</em></span>
          <textarea name="instructions" rows="8" maxlength="${L.MAX_INSTRUCTIONS}" placeholder="Method, tips, cooking times…">${esc(r.instructions || '')}</textarea>
        </label>
        ${itemsDatalist()}
        <div class="sheet-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save recipe</button></div>`,
      onMount: (d) => {
        const sync = (row) => {
          const item = L.findItemByName(state, $('.ing-name', row).value);
          const sel = $('.ing-unit', row);
          sel.disabled = !!item;
          if (item) sel.value = item.unit;
        };
        $$('.ing-row', d).forEach(sync);
        const rowsEl = $('.ing-rows', d);
        rowsEl.addEventListener('input', (e) => {
          if (e.target.classList.contains('ing-name')) sync(e.target.closest('.ing-row'));
          if (e.target.classList.contains('ing-qty')) e.target.setCustomValidity('');
        });
        rowsEl.addEventListener('click', (e) => {
          const b = e.target.closest('[data-remove-row]');
          if (!b) return;
          b.closest('.ing-row').remove();
          if (!$('.ing-row', rowsEl)) rowsEl.insertAdjacentHTML('beforeend', ingRow());
        });
        $('[data-add-row]', d).addEventListener('click', () => {
          rowsEl.insertAdjacentHTML('beforeend', ingRow());
          $('.ing-row:last-child .ing-name', rowsEl).focus();
        });
      },
      onSubmit: (form) => {
        const rowsData = $$('.ing-row', form).map((row) => ({
          row,
          name: $('.ing-name', row).value.trim(),
          qty: parseFloat($('.ing-qty', row).value),
          unit: $('.ing-unit', row).value,
        })).filter((x) => x.name);
        const bad = rowsData.find((x) => !(x.qty > 0));
        if (bad) {
          const q = $('.ing-qty', bad.row);
          q.setCustomValidity(`Enter how much ${bad.name} is needed`);
          q.reportValidity();
          return false;
        }
        let url = form.url.value.trim();
        if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
        const data = {
          name: form.name.value.trim(),
          url,
          serves: Math.max(1, parseInt(form.serves.value, 10) || 1),
          ingredients: rowsData.map((x) => ({
            itemId: (L.findItemByName(state, x.name) || L.addItem(state, { name: x.name, unit: x.unit })).id,
            qty: L.round(x.qty),
          })),
          instructions: form.instructions.value.replace(/\s+$/, '').slice(0, L.MAX_INSTRUCTIONS),
        };
        const existing = state.recipes.find((x) => x.id === id);
        if (existing) Object.assign(existing, data);
        else state.recipes.push({ id: L.uid(), ...data });
        commit();
        toast('Recipe saved.');
        return true;
      },
    });
  }

  function editItem(id) {
    const item = L.itemById(state, id) || { name: '', unit: 'each', category: 'Other', frequent: false, shortLife: false, multiUse: false, defaultQty: 0, frequentBuy: false };
    const flag = (name, title, desc) => `<label class="toggle"><input type="checkbox" name="${name}"${item[name] ? ' checked' : ''}>
      <span><strong>${title}</strong><small>${desc}</small></span></label>`;
    openSheet({
      title: id ? 'Edit item' : 'New item',
      html: `
        <label class="field"><span>Name</span><input name="name" required maxlength="100" value="${esc(item.name)}" autocomplete="off"></label>
        <div class="two">
          <label class="field"><span>Unit</span><select name="unit">${unitOptions(item.unit)}</select></label>
          <label class="field"><span>Category</span><select name="category">${catOptions(item.category)}</select></label>
        </div>
        <div class="default-qty">
          <label class="field"><span>Default amount <em data-default-unit>(${esc(item.unit)})</em></span>
            <input name="defaultQty" type="number" min="0" step="any" inputmode="decimal" placeholder="None" value="${item.defaultQty > 0 ? num(item.defaultQty) : ''}">
          </label>
          <p class="hint">Filled in for you when you add this item to the shopping list or cupboard.</p>
        </div>
        <fieldset class="flags"><legend>Options</legend>
          ${flag('frequent', 'Frequently used', 'Also used outside recipes, like milk. Before it’s taken from the cupboard you’ll be asked whether it’s really still there.')}
          ${flag('shortLife', 'Short life', 'Goes off quickly, like chicken. If it isn’t used in a week, you’ll be asked to check it’s still in date.')}
          ${flag('multiUse', 'Multi-use', 'Lasts for many meals, like spices. Tracked as in stock or not, and you’ll always be asked whether you have it.')}
        </fieldset>
        <fieldset class="flags"><legend>Shopping</legend>
          ${flag('frequentBuy', 'Frequently bought', 'Bought most weeks, like bread. Shown as a one-tap shortcut when you add things to the shopping list.')}
        </fieldset>
        ${id ? '<p class="hint">Changing the unit doesn’t convert amounts already in the cupboard or on the list.</p>' : ''}
        <div class="sheet-actions">
          ${id ? '<button type="button" class="btn danger-text" data-del>Delete</button>' : ''}
          <span class="grow"></span>
          <button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button>
        </div>`,
      onMount: (d, form) => {
        form.name.addEventListener('input', () => form.name.setCustomValidity(''));
        // Default amount: label follows the unit; not used for multi-use items.
        const syncDefault = () => {
          $('[data-default-unit]', d).textContent = `(${form.unit.value})`;
          $('.default-qty', d).hidden = form.multiUse.checked;
        };
        form.unit.addEventListener('change', syncDefault);
        form.multiUse.addEventListener('change', syncDefault);
        syncDefault();
        const del = $('[data-del]', d);
        if (del) del.addEventListener('click', async () => {
          const used = L.itemUsage(state, id);
          if (used.length) {
            await ask({ title: `${item.name} is used in recipes`, text: `Remove it from ${used.map((r) => r.name).join(', ')} first.`, buttons: [{ label: 'OK', value: true, style: 'primary' }] });
            return;
          }
          if (!(await confirm(`Delete ${item.name}?`, 'It will also be removed from the cupboard and shopping list.', 'Delete', 'danger'))) return;
          L.deleteItem(state, id);
          closeSheet();
          commit();
        });
      },
      onSubmit: (form) => {
        const name = form.name.value.trim();
        const clash = L.findItemByName(state, name);
        if (clash && clash.id !== id) {
          form.name.setCustomValidity('There’s already an item with this name');
          form.name.reportValidity();
          return false;
        }
        const data = {
          name, unit: form.unit.value, category: form.category.value,
          frequent: form.frequent.checked, shortLife: form.shortLife.checked, multiUse: form.multiUse.checked,
          defaultQty: parseFloat(form.defaultQty.value) > 0 ? L.round(parseFloat(form.defaultQty.value)) : 0,
          frequentBuy: form.frequentBuy.checked,
        };
        const existing = L.itemById(state, id);
        if (existing) {
          Object.assign(existing, data);
          if (data.multiUse && L.cupQty(state, id) > 0) L.setCup(state, id, 1);
        } else {
          L.addItem(state, data);
        }
        commit();
        return true;
      },
    });
  }

  // ---------- Units & categories (#39, #42) ----------

  function listsHtml() {
    const cats = L.categoriesFor(state);
    const catRows = cats.map((c, n) => {
      const fixed = c === L.FALLBACK_CATEGORY;
      return `<li data-cat="${esc(c)}">
        <span class="grow"><span class="title">${esc(c)}</span><span class="sub">${plural(L.categoryUsage(state, c).length, 'item')}${fixed ? ' · always kept' : ''}</span></span>
        <button type="button" class="icon-btn" data-cat-act="up"${n === 0 ? ' disabled' : ''} aria-label="Move ${esc(c)} up">↑</button>
        <button type="button" class="icon-btn" data-cat-act="down"${n === cats.length - 1 ? ' disabled' : ''} aria-label="Move ${esc(c)} down">↓</button>
        ${fixed ? '<span class="icon-spacer"></span><span class="icon-spacer"></span>'
          : `<button type="button" class="icon-btn" data-cat-act="rename" aria-label="Rename ${esc(c)}">✎</button>
             <button type="button" class="icon-btn" data-cat-act="delete" aria-label="Delete ${esc(c)}">${ICON.x}</button>`}
      </li>`;
    }).join('');
    const custom = state.settings.customUnits;
    const unitRows = custom.map((u) => `<li data-unit="${esc(u.name)}">
        <span class="grow"><span class="title">${esc(u.name)}</span><span class="sub">${u.count ? 'Whole numbers' : 'Measured'} · ${plural(L.unitUsage(state, u.name).length, 'item')}</span></span>
        <button type="button" class="icon-btn" data-unit-act="delete" aria-label="Delete ${esc(u.name)}">${ICON.x}</button>
      </li>`).join('');
    return `
      <section class="settings-block">
        <h3>Categories</h3>
        <p class="hint">The shopping list and cupboard are grouped in this order.</p>
        <ul class="rows edit-list">${catRows}</ul>
        <div class="add-row">
          <input data-new-cat maxlength="${L.MAX_CATEGORY_NAME}" placeholder="New category" aria-label="New category name" autocomplete="off">
          <button type="button" class="btn" data-add-cat>Add</button>
        </div>
      </section>
      <section class="settings-block">
        <h3>Units</h3>
        <p class="hint">Built in: ${esc(L.UNITS.join(', '))}.</p>
        ${custom.length ? `<ul class="rows edit-list">${unitRows}</ul>` : ''}
        <div class="add-row">
          <input data-new-unit maxlength="${L.MAX_UNIT_NAME}" placeholder="New unit, e.g. punnet" aria-label="New unit name" autocomplete="off">
          <button type="button" class="btn" data-add-unit>Add</button>
        </div>
        <label class="check-line"><input type="checkbox" data-new-unit-count>
          <span>Bought in whole numbers, like tins or packs. The shopping list rounds these up.</span></label>
      </section>
      <div class="sheet-actions"><button type="button" class="btn primary" data-close>Done</button></div>`;
  }

  function listsSheet() {
    openSheet({
      title: 'Units & categories',
      autofocus: false,
      html: `<div class="lists" data-lists>${listsHtml()}</div>`,
      onSubmit: () => false, // pressing Enter in a box shouldn't close the sheet
      onMount: (d) => {
        const box = $('[data-lists]', d);
        const refresh = () => { box.innerHTML = listsHtml(); };
        const attempt = async (fn) => {
          try {
            if ((await fn()) === false) return;
            commit();
            refresh();
          } catch (err) {
            await ask({ title: 'Can’t do that', text: err.message, buttons: [{ label: 'OK', value: true, style: 'primary' }] });
          }
        };
        const addCat = () => attempt(() => {
          const input = $('[data-new-cat]', box);
          L.addCategory(state, input.value);
        });
        const addUnit = () => attempt(() => {
          L.addUnit(state, $('[data-new-unit]', box).value, $('[data-new-unit-count]', box).checked);
        });
        box.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter') return;
          if (e.target.matches('[data-new-cat]')) { e.preventDefault(); addCat(); }
          if (e.target.matches('[data-new-unit]')) { e.preventDefault(); addUnit(); }
        });
        box.addEventListener('click', (e) => {
          if (e.target.closest('[data-add-cat]')) return addCat();
          if (e.target.closest('[data-add-unit]')) return addUnit();
          const catBtn = e.target.closest('[data-cat-act]');
          if (catBtn) {
            const name = catBtn.closest('[data-cat]').dataset.cat;
            const act = catBtn.dataset.catAct;
            if (act === 'up' || act === 'down') return attempt(() => L.moveCategory(state, name, act === 'up' ? -1 : 1));
            if (act === 'rename') {
              return attempt(async () => {
                const res = await ask({
                  title: `Rename ${name}`,
                  input: { type: 'text', label: 'New name', value: name, maxlength: L.MAX_CATEGORY_NAME },
                  buttons: [{ label: 'Cancel', value: null }, { label: 'Rename', value: 'ok', style: 'primary', needsInput: true }],
                });
                if (!res || res.input === name) return false;
                L.renameCategory(state, name, res.input);
              });
            }
            if (act === 'delete') {
              return attempt(async () => {
                const n = L.categoryUsage(state, name).length;
                const ok = await confirm(`Delete ${name}?`,
                  n ? `Its ${plural(n, 'item')} will move to “${L.FALLBACK_CATEGORY}”.${everyone()}` : `No items use it.${everyone()}`, 'Delete', 'danger');
                if (!ok) return false;
                L.removeCategory(state, name);
              });
            }
          }
          const unitBtn = e.target.closest('[data-unit-act]');
          if (unitBtn) {
            const name = unitBtn.closest('[data-unit]').dataset.unit;
            return attempt(() => L.removeUnit(state, name));
          }
          return undefined;
        });
      },
    });
  }

  /** Item name field with "create new item" options, plus a quantity. */
  function pickerHtml(qtyLabel) {
    return `
      <label class="field"><span>Item</span><input name="item" list="items-dl" required maxlength="100" autocomplete="off" placeholder="Start typing…"></label>
      <div class="new-fields" hidden>
        <p class="hint">New item. It will be added to your items list.</p>
        <div class="two">
          <label class="field"><span>Unit</span><select name="unit">${unitOptions('each')}</select></label>
          <label class="field"><span>Category</span><select name="category">${catOptions('Other')}</select></label>
        </div>
      </div>
      <label class="field qty-field"><span>${esc(qtyLabel)} <em data-unit></em></span><input name="qty" type="number" min="0" step="any" inputmode="decimal" required></label>
      ${itemsDatalist()}`;
  }

  function mountPicker(d, form) {
    // Pre-fill the item's default amount until the user types their own.
    let typedQty = false;
    form.qty.addEventListener('input', () => { typedQty = true; });
    const sync = () => {
      const item = L.findItemByName(state, form.item.value);
      if (!typedQty) {
        const sq = item ? L.suggestedQty(state, item) : null;
        form.qty.value = sq == null ? '' : num(sq);
      }
      $('.new-fields', d).hidden = !(form.item.value.trim() && !item);
      $('[data-unit]', d).textContent = `(${item ? item.unit : form.unit.value})`;
      const multi = !!(item && item.multiUse);
      $('.qty-field', d).hidden = multi;
      form.qty.required = !multi;
    };
    form.item.addEventListener('input', sync);
    form.unit.addEventListener('change', sync);
    sync();
  }

  function resolvePicked(form) {
    const name = form.item.value.trim();
    const item = L.findItemByName(state, name) || L.addItem(state, { name, unit: form.unit.value, category: form.category.value });
    return { item, qty: item.multiUse ? 1 : parseFloat(form.qty.value) };
  }

  function addCupboardSheet() {
    openSheet({
      title: 'Add to the cupboard',
      html: `${pickerHtml('Amount')}<div class="sheet-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Add</button></div>`,
      onMount: mountPicker,
      onSubmit: (form) => {
        const { item, qty } = resolvePicked(form);
        if (item.multiUse) L.setCup(state, item.id, 1);
        else L.setCup(state, item.id, L.cupQty(state, item.id) + qty);
        commit();
        toast(`${item.name} added to the cupboard.`);
        return true;
      },
    });
  }

  /** One-tap buttons for items marked "Frequently bought". */
  function quickPicksHtml() {
    const items = state.items.filter((i) => i.frequentBuy).sort((a, b) => a.name.localeCompare(b.name));
    if (!items.length) {
      return '<p class="hint">Tip: tick <strong>Frequently bought</strong> on items you buy most weeks and they’ll appear here as shortcuts.</p>';
    }
    const onList = new Set(state.shopping.filter((e) => !e.done).map((e) => e.itemId));
    return `<h3>Frequently bought</h3><div class="chips">${items.map((i) => {
      const sq = L.suggestedQty(state, i);
      const amount = i.multiUse || sq == null ? '' : `<small>${esc(fmtQty(sq, i.unit))}</small>`;
      return onList.has(i.id)
        ? `<button type="button" class="chip is-on" disabled aria-label="${esc(i.name)} is on the list">✓ ${esc(i.name)}</button>`
        : `<button type="button" class="chip" data-quick="${i.id}">+ ${esc(i.name)}${amount}</button>`;
    }).join('')}</div>`;
  }

  async function quickAdd(itemId, d) {
    const item = L.itemById(state, itemId);
    if (!item) return;
    let qty = item.multiUse ? 1 : L.suggestedQty(state, item);
    if (qty == null) {
      const res = await ask({
        title: `Add ${item.name} to the list`,
        input: { label: `Quantity (${item.unit})`, value: '' },
        buttons: [{ label: 'Cancel', value: null }, { label: 'Add', value: 'add', style: 'primary', needsInput: true }],
      });
      if (!res || !(res.input > 0)) return;
      qty = res.input;
    }
    L.addToShopping(state, item.id, qty, 0);
    commit();
    const box = $('[data-quick-box]', d);
    if (box) box.innerHTML = quickPicksHtml();
  }

  function addShoppingSheet() {
    openSheet({
      title: 'Add to the shopping list',
      autofocus: !state.items.some((i) => i.frequentBuy), // keep the keyboard from covering the shortcuts
      html: `<section class="quick" data-quick-box>${quickPicksHtml()}</section>
        ${pickerHtml('Quantity')}<div class="sheet-actions"><button type="button" class="btn" data-close>Done</button><button class="btn primary">Add</button></div>`,
      onMount: (d, form) => {
        mountPicker(d, form);
        $('[data-quick-box]', d).addEventListener('click', (e) => {
          const b = e.target.closest('[data-quick]');
          if (b) quickAdd(b.dataset.quick, d);
        });
      },
      onSubmit: (form) => {
        const { item, qty } = resolvePicked(form);
        L.addToShopping(state, item.id, qty, 0);
        commit();
        toast(`${item.name} added to the list.`);
        return true;
      },
    });
  }

  function householdHtml() {
    const st = syncStatus;
    if (!st.configured) {
      return '<p class="hint">Sharing with your household isn’t set up yet. See “Sharing with your household” in the README.</p>';
    }
    if (!st.ready) return `<h3>Household</h3><p class="hint">${esc(st.error || 'Connecting…')}</p>`;
    if (!st.user) {
      return `<h3>${pendingJoin ? 'You’ve been invited to a household' : 'Share with your household'}</h3>
        <p>${pendingJoin ? 'Sign in with Google to join it.' : 'Sign in to keep recipes, the cupboard and the shopping list in sync on everyone’s phone.'}</p>
        <button type="button" class="btn primary" data-h="signin">Sign in with Google</button>`;
    }
    const who = `<p class="hint">Signed in as ${esc(st.user.name)} · <button type="button" class="link-btn" data-h="signout">Sign out</button></p>`;
    if (!st.householdLoaded) return `<h3>Household</h3><p class="hint">Loading…</p>${who}`;
    if (!st.householdId) {
      return `<h3>Share with your household</h3>
        <p>Create a household and invite others, or join one with an invite.</p>
        <div class="row-btns"><button type="button" class="btn primary" data-h="create">Create a household</button><button type="button" class="btn" data-h="join">Join with a code</button></div>
        ${who}`;
    }
    const h = st.household;
    const members = h ? h.members.map((m) => `<li>${esc(m.name)}${m.uid === st.user.uid ? ' <span class="sub">(you)</span>' : ''}</li>`).join('') : '';
    return `<h3>${esc(h ? h.name : 'Household')}</h3>
      ${members ? `<ul class="members">${members}</ul>` : ''}
      <div class="row-btns"><button type="button" class="btn primary" data-h="invite">Invite someone</button><button type="button" class="btn" data-h="leave">Leave</button></div>
      ${who}`;
  }

  async function householdAction(action) {
    try {
      if (action === 'signin') await sync.signIn();
      if (action === 'signout') {
        if (shared() && !(await confirm('Sign out?', 'This device keeps a copy of the data but stops syncing with your household.', 'Sign out'))) return;
        await sync.signOut();
      }
      if (action === 'create') {
        const res = await ask({
          title: 'Create a household',
          text: 'Everything on this device (recipes, items, cupboard and shopping list) becomes the household’s. You can then invite others.',
          input: { type: 'text', label: 'Household name', value: 'Our kitchen' },
          buttons: [{ label: 'Cancel', value: null }, { label: 'Create', value: 'create', style: 'primary', needsInput: true }],
        });
        if (!res) return;
        toast('Creating household…');
        await sync.createHousehold(res.input, L.toDocs(state));
        toast(`${res.input} created. Now invite someone.`);
      }
      if (action === 'join') {
        const res = await ask({
          title: 'Join a household',
          text: 'Enter the code from your invite, or just open the invite link on this phone.',
          input: { type: 'text', label: 'Invite code', value: '', caps: 'characters' },
          buttons: [{ label: 'Cancel', value: null }, { label: 'Join', value: 'join', style: 'primary', needsInput: true }],
        });
        if (res) await joinFlow(res.input);
      }
      if (action === 'invite') await inviteFlow();
      if (action === 'leave') {
        if (!(await confirm('Leave this household?', 'This device keeps a copy of the data, but it will no longer sync. Others in the household keep everything.', 'Leave', 'danger'))) return;
        await sync.leave();
        toast('You’ve left the household.');
      }
    } catch (err) {
      console.error(err);
      toast(err.message || 'Something went wrong.');
    }
  }

  async function joinFlow(code) {
    if (!sync || !syncStatus.user) { toast('Sign in first.'); return; }
    const hasLocal = state.items.length || state.recipes.length;
    if (syncStatus.householdId) {
      if (!(await confirm('Switch household?', 'You’ll leave your current household and join the new one.', 'Switch'))) return;
    } else if (hasLocal) {
      const v = await ask({
        title: 'Join this household?',
        text: 'The household’s recipes, cupboard and shopping list will replace what’s on this device.',
        buttons: [{ label: 'Cancel', value: null }, { label: 'Back up, then join', value: 'backup' }, { label: 'Join', value: 'join', style: 'primary' }],
      });
      if (!v) return;
      if (v === 'backup') exportData();
    }
    try {
      toast('Joining…');
      await sync.join(code);
      toast('You’ve joined the household.');
      go('week');
    } catch (err) {
      console.error(err);
      toast(err.message || 'Couldn’t join.');
    }
  }

  async function inviteFlow() {
    const code = await sync.invite();
    const link = `${location.origin}${location.pathname}?join=${code}`;
    const canShare = !!navigator.share;
    const v = await ask({
      title: 'Invite someone',
      html: `<p>Send them this link. They open it on their phone and sign in with Google. It works for 7 days.</p>
        <p class="invite-link">${esc(link)}</p>
        <p class="hint">Or they can enter the code <strong class="code">${esc(code)}</strong> under ⋮ → Join with a code.</p>`,
      buttons: [{ label: 'Close', value: null }, { label: 'Copy link', value: 'copy', style: canShare ? '' : 'primary' },
        ...(canShare ? [{ label: 'Share…', value: 'share', style: 'primary' }] : [])],
    });
    if (v === 'share') {
      navigator.share({ title: 'Join our Stropping household', text: 'Join my household on Stropping so we share recipes and the shopping list:', url: link }).catch(() => {});
    } else if (v === 'copy') {
      try {
        await navigator.clipboard.writeText(link);
        toast('Invite link copied.');
      } catch (e) {
        toast(`Couldn’t copy. The code is ${code}.`);
      }
    }
  }

  const storageNote = () => (shared()
    ? 'Your data is shared with your household and also kept on this device for offline use.'
    : 'Your data is stored in this browser, on this device only. Back it up now and then.');
  const everyone = () => (shared() ? ' This also affects everyone in your household.' : '');

  function menuSheet() {
    openSheet({
      title: 'Stropping',
      html: `
        <section id="household" class="household">${householdHtml()}</section>
        <div class="menu">
          <button type="button" data-m="export"><strong>Back up data</strong><small>Download a file you can restore later or on another device.</small></button>
          <button type="button" data-m="import"><strong>Restore from backup</strong><small>Replace everything here with a backup file.</small></button>
          <button type="button" data-m="sample"><strong>Load sample data</strong><small>A few recipes and items to try things out.</small></button>
          <button type="button" data-m="erase" class="danger"><strong>Erase all data</strong><small>Start again from scratch.</small></button>
          <input type="file" accept="application/json,.json" hidden>
        </div>
        <details class="about"><summary>How it works</summary>
          <p><strong>Plan a meal</strong> and Stropping takes what it can from the cupboard and adds the rest to the shopping list, scaled to your portions.</p>
          <p><strong>Tick items off</strong> while shopping. What you buy for planned meals is set aside for them; anything extra goes into the cupboard.</p>
          <p><strong>Start a new week</strong> to confirm what you cooked. Ingredients for uncooked meals go back in the cupboard, and short-life items get an in-date check.</p>
          <p><strong>Sweep</strong> the cupboard now and then to bring it back in line with reality.</p>
        </details>
        <p class="hint" id="storage-note">${storageNote()}</p>`,
      onMount: (d) => {
        $('#household', d).addEventListener('click', (e) => {
          const b = e.target.closest('[data-h]');
          if (b) householdAction(b.dataset.h);
        });
        const file = $('input[type=file]', d);
        d.querySelector('.menu').addEventListener('click', async (e) => {
          const b = e.target.closest('[data-m]');
          if (!b) return;
          const m = b.dataset.m;
          if (m === 'export') exportData();
          if (m === 'import') file.click();
          if (m === 'sample') { closeSheet(); loadSample(); }
          if (m === 'erase') {
            if (!(await confirm('Erase all data?', `Recipes, items, cupboard and shopping list will all be deleted. This can’t be undone.${everyone()}`, 'Erase', 'danger'))) return;
            closeSheet();
            commit(L.emptyState());
            go('week');
          }
        });
        file.addEventListener('change', async () => {
          const f = file.files[0];
          if (!f) return;
          try {
            const next = L.normalise(JSON.parse(await f.text()));
            if (!(await confirm('Restore this backup?', `It has ${plural(next.recipes.length, 'recipe')} and ${plural(next.items.length, 'item')}. Everything currently here will be replaced.${everyone()}`, 'Restore'))) return;
            closeSheet();
            commit(next);
            go('week');
            toast('Backup restored.');
          } catch (err) {
            toast(`Couldn’t read that file. ${err.message || ''}`);
          }
          file.value = '';
        });
      },
    });
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `stropping-backup-${L.today()}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async function loadSample() {
    const hasData = state.items.length || state.recipes.length;
    if (hasData && !(await confirm('Replace your data?', `Loading sample data replaces everything currently here.${everyone()}`, 'Replace', 'danger'))) return;
    commit(L.sampleState());
    go('week');
    toast('Sample data loaded. Try adding a meal.');
  }

  // ---------- Events ----------

  const ACTIONS = {
    menu: menuSheet,
    go: (_, el) => go(el.dataset.tab),
    sample: loadSample,
    'add-meal': () => addMealSheet(),
    'remove-meal': async (id) => {
      const meal = state.week.meals.find((m) => m.id === id);
      if (!meal) return;
      if (!(await confirm(`Remove ${meal.name}?`, meal.cooked ? 'It’s marked as cooked, so nothing goes back in the cupboard.' : 'Its ingredients go back in the cupboard, and anything not yet bought comes off the list.', 'Remove'))) return;
      if (meal.cooked) {
        state.week.meals = state.week.meals.filter((m) => m.id !== id);
        commit();
      } else {
        commit(L.removeMeal(state, id));
      }
    },
    'new-week': newWeekFlow,
    'new-recipe': () => editRecipe(null),
    'view-recipe': viewRecipe,
    'add-cupboard': addCupboardSheet,
    'edit-cupboard': async (id) => {
      const item = L.itemById(state, id);
      if (!item) return;
      if (item.multiUse) {
        const v = await ask({ title: item.name, text: 'In stock. Mark it as run out?', buttons: [{ label: 'Cancel', value: null }, { label: 'Run out', value: 'gone', style: 'danger' }, { label: 'Run out, add to list', value: 'list', style: 'primary' }] });
        if (!v) return;
        L.setCup(state, id, 0);
        if (v === 'list') L.addToShopping(state, id, 1, 0);
        commit();
        return;
      }
      const res = await ask({
        title: item.name,
        input: { label: `Amount in the cupboard (${item.unit})`, value: num(L.cupQty(state, id)) },
        buttons: [{ label: 'Remove', value: 'remove', style: 'danger-text' }, { label: 'Cancel', value: null }, { label: 'Save', value: 'save', style: 'primary', needsInput: true }],
      });
      if (!res) return;
      L.setCup(state, id, res.value === 'remove' ? 0 : res.input);
      commit();
    },
    sweep: sweepFlow,
    'add-shopping': addShoppingSheet,
    'edit-shopping': async (id) => {
      const e = state.shopping.find((x) => x.id === id);
      const item = e && L.itemById(state, e.itemId);
      if (!item) return;
      const reservedNote = e.reserved > L.EPS ? `${fmtQty(e.reserved, item.unit)} of this is for this week’s meals.` : '';
      const res = await ask({
        title: item.name,
        text: reservedNote,
        input: item.multiUse || e.done ? null : { label: `Quantity to buy (${item.unit})`, value: num(L.buyQty(state, e)) },
        buttons: [{ label: 'Remove from list', value: 'remove', style: 'danger-text' }, { label: 'Cancel', value: null },
          ...(item.multiUse || e.done ? [] : [{ label: 'Save', value: 'save', style: 'primary', needsInput: true }])],
      });
      if (!res) return;
      // Look the entry up again: another device may have changed the list while the dialog was open.
      const cur = state.shopping.find((x) => x.id === id);
      if (!cur) return;
      const action = typeof res === 'string' ? res : res.value;
      if (action === 'remove') state.shopping = state.shopping.filter((x) => x !== cur);
      else {
        cur.qty = L.round(res.input);
        cur.reserved = Math.min(cur.reserved, cur.qty);
        if (cur.qty <= L.EPS) state.shopping = state.shopping.filter((x) => x !== cur);
      }
      commit();
    },
    'clear-bought': () => { L.clearBought(state); commit(); },
    'clear-list': async () => {
      const n = state.shopping.length;
      if (!n) return;
      const forMeals = state.shopping.some((e) => !e.done && e.reserved > L.EPS);
      const ok = await confirm('Clear the shopping list?',
        `This removes all ${plural(n, 'item')}.${forMeals ? ' This week’s planned meals will assume you already have their ingredients.' : ''}${everyone()}`,
        'Clear list', 'danger');
      if (!ok) return;
      L.clearShopping(state);
      commit();
      toast('Shopping list cleared.');
    },
    'new-item': () => editItem(null),
    lists: listsSheet,
    'edit-item': editItem,
    'item-to-list': async (id) => {
      const item = L.itemById(state, id);
      if (!item) return;
      if (item.multiUse) {
        L.addToShopping(state, id, 1, 0);
        commit();
        toast(`${item.name} added to the list.`);
        return;
      }
      const res = await ask({
        title: `Add ${item.name} to the list`,
        input: { label: `Quantity (${item.unit})`, value: L.suggestedQty(state, item) == null ? '' : num(L.suggestedQty(state, item)) },
        buttons: [{ label: 'Cancel', value: null }, { label: 'Add', value: 'add', style: 'primary', needsInput: true }],
      });
      if (!res || !(res.input > 0)) return;
      L.addToShopping(state, id, res.input, 0);
      commit();
      toast(`${item.name} added to the list.`);
    },
  };

  document.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('.tabbar [data-tab]');
    if (tabBtn) { go(tabBtn.dataset.tab); return; }
    const el = e.target.closest('[data-act]');
    if (!el || el.tagName === 'INPUT' || el.closest('dialog')) return;
    const fn = ACTIONS[el.dataset.act];
    if (fn) fn(el.dataset.id, el);
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.matches('[data-act=cooked]')) { L.setCooked(state, el.dataset.id, el.checked); commit(); }
    if (el.matches('[data-act=bought]')) { L.setBought(state, el.dataset.id, el.checked); commit(); }
  });

  document.addEventListener('input', (e) => {
    if (e.target.matches('[data-filter]')) {
      itemFilter = e.target.value;
      applyItemFilter();
    }
  });

  const sheet = $('#sheet');
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet || e.target.closest('[data-close]')) sheet.close();
  });

  render();

  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
