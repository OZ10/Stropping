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
  // Search text for the Items and Cupboard tabs, kept per tab while the app is open.
  const searches = { items: '', cupboard: '' };

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
      const s = L.normalise(JSON.parse(raw));
      // Data from before #51 had planned meals' ingredients already removed: put them back once.
      return L.needsMigration(s) ? L.migrate(s) : s;
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
    // Household data from before #51: convert once and write it back, so other
    // phones see it already converted. (The conversion sets absolute amounts, so
    // two phones doing it at the same moment write the same values.)
    if (L.needsMigration(next)) {
      shadow = clone(next);
      state = L.migrate(next);
      commit();
      return;
    }
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
  const PLURAL = {
    pint: 'pints', clove: 'cloves', bulb: 'bulbs', tin: 'tins', jar: 'jars', pack: 'packs', box: 'boxes',
    bottle: 'bottles', bunch: 'bunches', loaf: 'loaves', slice: 'slices', pinch: 'pinches',
  };
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

  // Lists you pick from are alphabetical (#47). The shopping list and cupboard
  // groups keep the household's own category order (see byCategory).
  const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });
  const alphabetical = (list, last) => [...list.filter((x) => x !== last).sort(byName), ...(list.includes(last) ? [last] : [])];
  /** Group [{item,...}] rows by location, A–Z, with "not set" ('') last. */
  function byLocation(rows) {
    const groups = new Map();
    for (const row of rows) {
      const loc = row.item.location || '';
      if (!groups.has(loc)) groups.set(loc, []);
      groups.get(loc).push(row);
    }
    return alphabetical([...groups.keys()], '').map((l) => [l, groups.get(l).sort((a, b) => byName(a.item.name, b.item.name))]);
  }

  // Cupboard grouping (category or location), remembered on this device.
  const CUP_GROUP_KEY = 'stropping:cupGroup';
  let cupGroup = 'category';
  try { cupGroup = localStorage.getItem(CUP_GROUP_KEY) === 'location' ? 'location' : 'category'; } catch (e) { /* ignore */ }

  const withCurrent = (list, sel) => (sel && !list.includes(sel) ? [...list, sel] : list);
  const unitOptions = (sel) => alphabetical(withCurrent(L.unitsFor(state), sel))
    .map((u) => `<option value="${esc(u)}"${u === sel ? ' selected' : ''}>${esc(u)}</option>`).join('');
  const catOptions = (sel) => alphabetical(withCurrent(L.categoriesFor(state), sel), L.FALLBACK_CATEGORY)
    .map((c) => `<option value="${esc(c)}"${c === sel ? ' selected' : ''}>${esc(c)}</option>`).join('');
  const locOptions = (sel) => `<option value="">Not set</option>${alphabetical(withCurrent(state.locations, sel))
    .map((l) => `<option value="${esc(l)}"${l === sel ? ' selected' : ''}>${esc(l)}</option>`).join('')}`;
  const itemsDatalist = () => `<datalist id="items-dl">${alphabetical(state.items.map((i) => i.name)).map((n) => `<option value="${esc(n)}">`).join('')}</datalist>`;

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
    if (tab in searches) applySearch();
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
        <p>Confirm which meals you cooked: their ingredients are used up from the cupboard. Uncooked meals can be kept or dropped, and short-life items get an in-date check.</p>
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

  // ---------- Recipe labels (#45) ----------

  /** Labels used by at least one recipe, alphabetically. */
  const labelsInUse = () => alphabetical([...new Set(state.recipes.flatMap((r) => r.labels))]);

  /** Toggle buttons for filtering recipes by label. */
  function labelFilterHtml(selected) {
    const labels = labelsInUse();
    if (!labels.length) return '';
    return `<div class="chips filter" role="group" aria-label="Filter recipes by label">
      ${labels.map((l) => `<button type="button" class="chip" data-act="filter-label" data-label="${esc(l)}" aria-pressed="${selected.includes(l)}">${esc(l)}</button>`).join('')}
      ${selected.length ? '<button type="button" class="chip clear" data-act="filter-clear">Clear</button>' : ''}
    </div>`;
  }

  const labelTags = (labels) => (labels.length
    ? `<span class="tags">${labels.map((l) => `<span class="tag">${esc(l)}</span>`).join('')}</span>` : '');

  const toggleIn = (list, value) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  // The Recipes tab filter is remembered on this device only.
  const FILTER_KEY = 'stropping:recipeFilter';
  let recipeFilter = [];
  try { recipeFilter = JSON.parse(localStorage.getItem(FILTER_KEY)) || []; } catch (e) { recipeFilter = []; }
  function setRecipeFilter(next) {
    recipeFilter = next;
    try { localStorage.setItem(FILTER_KEY, JSON.stringify(next)); } catch (e) { /* ignore */ }
    render();
  }

  function labelsSheet() {
    const html = () => `<section class="settings-block">
        <p class="hint">Tag recipes so you can filter them, for example by Fast or Air Fryer.</p>
        ${orderedListHtml(LABEL_LIST, 'New label')}
      </section>
      <div class="sheet-actions"><button type="button" class="btn primary" data-close>Done</button></div>`;
    openSheet({
      title: 'Recipe labels',
      autofocus: false,
      html: `<div class="lists" data-lists>${html()}</div>`,
      onSubmit: () => false,
      onMount: (d) => {
        const box = $('[data-lists]', d);
        const refresh = () => { box.innerHTML = html(); };
        box.addEventListener('keydown', (e) => handleOrderedListEvent(e, box, [LABEL_LIST], refresh));
        box.addEventListener('click', (e) => handleOrderedListEvent(e, box, [LABEL_LIST], refresh));
      },
    });
  }

  function renderRecipes() {
    const planned = new Set(state.week.meals.map((m) => m.recipeId));
    // Drop filters for labels no recipe uses any more (renamed or deleted).
    const active = recipeFilter.filter((l) => labelsInUse().includes(l));
    const list = L.recipesWithLabels(state, active).sort((a, b) => a.name.localeCompare(b.name));
    const total = state.recipes.length;
    let body;
    if (!total) body = empty('No recipes yet. Add a name, a link and the ingredients for the number of portions it makes.');
    else if (!list.length) body = empty('No recipes have all of these labels.', '<button class="btn" data-act="filter-clear">Clear filter</button>');
    else {
      body = `<ul class="cards">${list.map((r) => `
        <li><button class="card recipe" data-act="view-recipe" data-id="${r.id}">
          <span class="grow">
            <span class="title">${esc(r.name)}</span>
            <span class="sub">Serves ${r.serves} · ${plural(r.ingredients.length, 'ingredient')}${host(r.url) ? ` · ${esc(host(r.url))}` : ''}</span>
            ${labelTags(r.labels)}
          </span>
          ${planned.has(r.id) ? '<span class="badge plan">This week</span>' : ''}
        </button></li>`).join('')}</ul>`;
    }
    return `
      <div class="head">
        <div><h2>Recipes</h2><p class="sub">${active.length ? `${list.length} of ${plural(total, 'recipe')}` : plural(total, 'recipe')}</p></div>
        <div class="row-btns">
          <button class="btn" data-act="labels">Labels</button>
          <button class="btn primary" data-act="new-recipe">+ New recipe</button>
        </div>
      </div>
      ${labelFilterHtml(active)}
      ${body}`;
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
      ${rows.length ? `<div class="toolbar">
        <div class="segmented" role="group" aria-label="Group by">
          <span>Group by</span>
          <button type="button" data-act="cup-group" data-by="category" aria-pressed="${cupGroup === 'category'}">Category</button>
          <button type="button" data-act="cup-group" data-by="location" aria-pressed="${cupGroup === 'location'}">Location</button>
        </div>
        ${searchBox('Search the cupboard')}
      </div>` : ''}
      ${rows.length ? (cupGroup === 'location' ? byLocation(rows) : byCategory(rows)).map(([group, list]) => `
        <section class="group" data-group><h3>${esc(group || 'No location')}</h3><ul class="rows">${list.map(({ item, qty }) => {
          // Show the other grouping as a hint on each row.
          const other = cupGroup === 'location' ? item.category : item.location;
          const aside = item.multiUse ? 0 : L.setAsideFor(state, item.id); // #51: still here, but promised to a meal
          const sub = [other, aside > L.EPS && `${fmtQty(Math.min(aside, qty), item.unit)} for this week’s meals`].filter(Boolean).join(' · ');
          return `
          <li data-search-text="${esc(`${item.name} ${item.category} ${item.location}`.toLowerCase())}"><button class="row-main" data-act="edit-cupboard" data-id="${item.id}">
            <span class="grow"><span class="title">${esc(item.name)}</span>${badges(item)}${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</span>
            <span class="qty">${esc(itemQty(item, qty))}</span>
          </button></li>`;
        }).join('')}</ul></section>`).join('')
        : empty('The cupboard is empty. Add what you have in stock, or tick things off the shopping list and they’ll be added here.')}
      <p class="hint empty-search" hidden>Nothing in the cupboard matches.</p>
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
      ${rows.length ? '<p class="hint">Ticking an item puts it in the cupboard. Anything bought for this week’s meals is set aside for them until they’re cooked.</p>' : ''}`;
  }

  function renderItems() {
    const rows = state.items.map((item) => ({ item }));
    const onList = new Set(state.shopping.filter((e) => !e.done).map((e) => e.itemId));
    return `
      <div class="head">
        <div><h2>Items</h2><p class="sub">Ingredients and household items</p></div>
        <div class="row-btns">
          <button class="btn" data-act="lists" title="Categories, locations and units">Item settings</button>
          <button class="btn primary" data-act="new-item">+ New item</button>
        </div>
      </div>
      ${rows.length ? searchBox('Search items') : ''}
      ${rows.length ? byCategory(rows).map(([cat, list]) => `
        <section class="group" data-group><h3>${esc(cat)}</h3><ul class="rows">${list.map(({ item }) => `
          <li data-search-text="${esc(item.name.toLowerCase())}">
            <button class="row-main" data-act="edit-item" data-id="${item.id}">
              <span class="grow"><span class="title">${esc(item.name)}</span>${badges(item)}</span>
              <span class="sub" title="${item.defaultQty > 0 ? 'Default amount' : 'Unit'}">${esc(item.defaultQty > 0 && !item.multiUse ? fmtQty(item.defaultQty, item.unit) : item.unit)}</span>
            </button>
            ${onList.has(item.id) ? '<span class="on-list">On list</span>' : `<button class="btn small" data-act="item-to-list" data-id="${item.id}" aria-label="Add ${esc(item.name)} to shopping list">+ List</button>`}
          </li>`).join('')}</ul></section>`).join('')
        : empty('No items yet. Items are created automatically when you add ingredients to a recipe, or you can add them here.')}
      <p class="hint empty-search" hidden>No items match.</p>`;
  }

  const searchBox = (placeholder) =>
    `<input type="search" class="search" data-search placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" value="${esc(searches[tab])}">`;

  /** Hide rows (and empty groups) on the current tab that don't match its search box. */
  function applySearch() {
    const q = (searches[tab] || '').trim().toLowerCase();
    const rows = $$('#view li[data-search-text]');
    $$('#view [data-group]').forEach((g) => {
      let shown = 0;
      $$('li[data-search-text]', g).forEach((li) => {
        const ok = !q || li.dataset.searchText.includes(q);
        li.hidden = !ok;
        if (ok) shown++;
      });
      g.hidden = !shown;
    });
    const msg = $('#view .empty-search');
    if (msg) msg.hidden = !rows.length || rows.some((li) => !li.hidden);
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
  function ask({ title, text = '', html = '', buttons, input, progress, stack, collect }) {
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
        // `collect(dialog)` reads extra controls (e.g. tick boxes) before the dialog closes.
        if (collect) return finish({ value: b.value, data: collect(d) });
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
      case 'optional': {
        const res = await ask({
          progress: `Planning ${q.meal.name}`,
          title: 'Any optional extras this time?',
          text: 'Tick the ones you want for this meal. The rest are left out.',
          html: `<div class="opt-list">${q.options.map((o) => `<label class="check-line">
              <input type="checkbox" value="${esc(o.item.id)}">
              <span><strong>${esc(o.item.name)}</strong>${o.item.multiUse ? '' : ` · ${esc(fmtQty(o.need, o.unit))}`}</span>
            </label>`).join('')}</div>`,
          collect: (d) => $$('.opt-list input:checked', d).map((i) => i.value),
          buttons: [CANCEL, { label: 'Continue', value: 'ok', style: 'primary' }],
        });
        return res ? res.data : null;
      }
      case 'multi':
        return ask({
          progress: `Planning ${q.meal.name}`,
          title: `Have you got ${item.name}?`,
          text: `${item.name} is multi-use, so Stropping can’t tell how much is left. Is there enough for this meal?`,
          buttons: [CANCEL, { label: 'No, add to list', value: false }, { label: 'Yes', value: true, style: 'primary' }],
        });
      case 'unsized':
        // A recipe unit Stropping can't count, e.g. tsp from a jar with no size given (#50).
        return ask({
          progress: `Planning ${q.meal.name}`,
          title: `Have you got ${item.name}?`,
          text: `This meal uses ${fmtQty(q.need, q.unit)}. Stropping doesn’t know how much is in a ${item.unit} of ${item.name}, so it can’t keep count. Is there enough?`,
          buttons: [CANCEL, { label: `No, add a ${item.unit} to the list`, value: false }, { label: 'Yes', value: true, style: 'primary' }],
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
          text: `${plural(q.meal.portions, 'portion')}. If you cooked it, its ingredients are used up from the cupboard. If you drop it, they stay.`,
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
          text: item.multiUse ? 'Still in stock?' : `Still in the cupboard? Change the amount if it’s different.${q.setAside > L.EPS ? ` ${fmtQty(q.setAside, item.unit)} of it is set aside for this week’s meals.` : ''}`,
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
      if (r.item.multiUse || r.inStockCheck) return 'added to the list';
      if (r.status === 'buy') return r.fromCupboard > L.EPS ? `${fmtQty(r.toShop, u)} to buy, ${fmtQty(r.fromCupboard, u)} from the cupboard` : `${fmtQty(r.toShop, u)} to buy`;
      return `${fmtQty(r.fromCupboard, u)} from the cupboard`;
    };
    const buy = res.report.filter((r) => r.status === 'buy');
    const have = res.report.filter((r) => r.status !== 'buy' && r.status !== 'skipped');
    const skipped = res.report.filter((r) => r.status === 'skipped');
    const list = (rows) => `<ul class="summary">${rows.map((r) => `<li><strong>${esc(r.item.name)}</strong><span>${esc(line(r))}</span></li>`).join('')}</ul>`;
    const html = (buy.length ? `<h3>Added to the shopping list</h3>${list(buy)}` : '<p>Everything’s in the cupboard, so nothing needs buying.</p>')
      + (have.length ? `<h3>Already got</h3>${list(have)}` : '')
      + (skipped.length ? `<h3>Left out this time</h3><p>${esc(skipped.map((r) => r.item.name).join(', '))}</p>` : '');
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
      s.dropped.length && `<li><strong>Dropped, ingredients left in the cupboard</strong><span>${esc(s.dropped.join(', '))}</span></li>`,
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
    // With locations in use, offer to sweep one place at a time (#46).
    const stocked = Object.keys(state.cupboard).map((id) => L.itemById(state, id)).filter(Boolean);
    const locs = alphabetical([...new Set(stocked.map((i) => i.location || ''))], '');
    let opts = {};
    if (locs.some((l) => l)) {
      const count = (l) => stocked.filter((i) => (i.location || '') === l).length;
      const choice = await ask({
        title: 'Sweep which location?',
        text: 'Check everything, or just one place at a time.',
        stack: true,
        buttons: [
          { label: `Everything (${stocked.length})`, value: '*', style: 'primary' },
          ...locs.map((l) => ({ label: `${l || 'No location'} (${count(l)})`, value: l })),
          { label: 'Cancel', value: null, style: 'quiet' },
        ],
      });
      if (choice == null) return;
      if (choice !== '*') opts = { location: choice };
    }
    const base = state;
    const res = await L.sweep(base, flowAsk, opts);
    commit(res.state, base);
    const where = 'location' in opts ? ` in ${opts.location || 'items with no location'}` : '';
    toast(`Checked ${res.reviewed} of ${plural(res.total, 'item')}${where}${res.removed ? `, ${res.removed} removed` : ''}.`);
  }

  // ---------- Sheets ----------

  function addMealSheet(recipeId) {
    if (!state.recipes.length) { toast('Add a recipe first.'); go('recipes'); return; }
    let picked = []; // label filter for this sheet only
    const matching = () => L.recipesWithLabels(state, picked).sort((a, b) => a.name.localeCompare(b.name));
    const options = (list, selId) => list.map((r) => `<option value="${r.id}"${r.id === selId ? ' selected' : ''}>${esc(r.name)}</option>`).join('');
    const first = matching();
    const sel = first.find((r) => r.id === recipeId) || first[0];
    openSheet({
      title: 'Add a meal to this week',
      html: `
        <div data-meal-filter>${labelFilterHtml(picked)}</div>
        <label class="field"><span>Recipe</span><select name="recipe">${options(first, sel.id)}</select></label>
        <p class="hint" data-no-match hidden>No recipes have all of these labels.</p>
        <label class="field"><span>Portions</span><input name="portions" type="number" min="1" step="1" inputmode="numeric" required value="${sel.serves}"></label>
        <div class="sheet-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" data-submit>Add to week</button></div>`,
      onMount: (d, form) => {
        const setPortions = () => {
          const r = state.recipes.find((x) => x.id === form.recipe.value);
          if (r) form.portions.value = r.serves;
        };
        form.recipe.addEventListener('change', setPortions);
        const filterBox = $('[data-meal-filter]', d);
        filterBox.addEventListener('click', (e) => {
          const b = e.target.closest('[data-act]');
          if (!b) return;
          picked = b.dataset.act === 'filter-clear' ? [] : toggleIn(picked, b.dataset.label);
          filterBox.innerHTML = labelFilterHtml(picked);
          const list = matching();
          const keep = list.some((r) => r.id === form.recipe.value) ? form.recipe.value : list[0] && list[0].id;
          form.recipe.innerHTML = options(list, keep);
          $('[data-no-match]', d).hidden = list.length > 0;
          form.recipe.disabled = !list.length;
          $('[data-submit]', d).disabled = !list.length;
          setPortions();
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
      const unit = g.unit || item.unit;
      const need = L.scaleQty(r, g.qty, portions); // in the recipe's unit
      const needItem = item.multiUse ? null : L.toItemUnit(item, need, unit); // in the item's unit, if countable
      const have = L.available(state, item.id); // not counting what's set aside for planned meals
      let status;
      if (needItem == null) status = have ? '<span class="ok">In cupboard</span>' : '<span class="need">Not in cupboard</span>';
      else if (have >= needItem - L.EPS) status = '<span class="ok">In cupboard</span>';
      else if (have > L.EPS) status = `<span class="need">Have ${esc(fmtQty(have, item.unit))}</span>`;
      else status = '<span class="need">To buy</span>';
      const opt = g.optional ? '<span class="opt-note">optional</span>' : '';
      return `<li><span class="grow"><span class="title">${esc(item.name)}</span>${opt}${badges(item)}</span><span class="qty">${esc(fmtQty(need, unit))}${status}</span></li>`;
    }).join('');
    openSheet({
      title: r.name,
      html: `
        ${labelTags(r.labels)}
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

  const ingRow = (name = '', qty = '', unit = 'each', optional = false) => `<div class="ing-row">
    <input class="ing-name" list="items-dl" maxlength="100" placeholder="Ingredient" value="${esc(name)}" aria-label="Ingredient" autocomplete="off">
    <input class="ing-qty" type="number" min="0" step="any" inputmode="decimal" placeholder="Qty" value="${esc(qty)}" aria-label="Quantity">
    <select class="ing-unit" aria-label="Unit">${unitOptions(unit)}</select>
    <label class="ing-opt" title="Only used when you choose it for that meal"><input type="checkbox" class="ing-optional"${optional ? ' checked' : ''}><span>Optional</span></label>
    <button type="button" class="icon-btn" data-remove-row aria-label="Remove ingredient">${ICON.x}</button>
  </div>`;

  function editRecipe(id) {
    const r = state.recipes.find((x) => x.id === id) || { name: '', url: '', serves: 4, ingredients: [], instructions: '', labels: [] };
    // Household labels, plus any this recipe has that were since removed from the list.
    const pickable = alphabetical([...state.labels, ...r.labels.filter((l) => !state.labels.includes(l))]);
    const rows = r.ingredients.map((g) => {
      const item = L.itemById(state, g.itemId);
      return item ? ingRow(item.name, num(g.qty), g.unit || item.unit, g.optional) : '';
    }).join('') || ingRow();
    openSheet({
      title: id ? 'Edit recipe' : 'New recipe',
      html: `
        <label class="field"><span>Name</span><input name="name" required maxlength="200" value="${esc(r.name)}" autocomplete="off"></label>
        <label class="field"><span>Web link <em>optional</em></span><input name="url" type="text" inputmode="url" maxlength="2000" placeholder="https://…" value="${esc(r.url)}" autocomplete="off"></label>
        <label class="field narrow"><span>Serves</span><input name="serves" type="number" min="1" step="1" inputmode="numeric" required value="${r.serves}"></label>
        <fieldset class="label-pick"><legend>Labels</legend>
          ${pickable.length ? `<div class="chips" data-label-pick>${pickable.map((l) => `<button type="button" class="chip" data-label="${esc(l)}" aria-pressed="${r.labels.includes(l)}">${esc(l)}</button>`).join('')}</div>`
            : '<p class="hint">No labels yet. Add some with the Labels button on the Recipes tab.</p>'}
        </fieldset>
        <fieldset class="ings"><legend>Ingredients</legend>
          <div class="ing-rows">${rows}</div>
          <button type="button" class="btn small" data-add-row>+ Add ingredient</button>
          <p class="hint">Quantities are for the number of portions above. New names are added to your items list. Tick <strong>Optional</strong> for extras you only sometimes add; you’ll be asked each time you plan the meal.</p>
        </fieldset>
        <label class="field"><span>Instructions <em>optional</em></span>
          <textarea name="instructions" rows="8" maxlength="${L.MAX_INSTRUCTIONS}" placeholder="Method, tips, cooking times…">${esc(r.instructions || '')}</textarea>
        </label>
        ${itemsDatalist()}
        <div class="sheet-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save recipe</button></div>`,
      onMount: (d) => {
        // Existing items offer only the units they can be measured in (#50):
        // their own unit, its conversions, and their recipe unit if set.
        const sync = (row) => {
          const item = L.findItemByName(state, $('.ing-name', row).value);
          const sel = $('.ing-unit', row);
          const current = sel.value;
          if (item) {
            const allowed = alphabetical(L.unitsForItem(item));
            sel.innerHTML = allowed.map((u) => `<option value="${esc(u)}">${esc(u)}</option>`).join('');
            sel.value = allowed.includes(current) ? current : item.unit;
            sel.disabled = allowed.length < 2;
            sel.dataset.restricted = '1';
          } else if (sel.dataset.restricted) {
            sel.innerHTML = unitOptions(current);
            sel.disabled = false;
            delete sel.dataset.restricted;
          }
        };
        $$('.ing-row', d).forEach(sync);
        const picker = $('[data-label-pick]', d);
        if (picker) picker.addEventListener('click', (e) => {
          const b = e.target.closest('[data-label]');
          if (b) b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
        });
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
          optional: $('.ing-optional', row).checked,
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
          ingredients: rowsData.map((x) => {
            const item = L.findItemByName(state, x.name) || L.addItem(state, { name: x.name, unit: x.unit });
            // Store the recipe's unit only when it differs from the item's own (#50).
            return { itemId: item.id, qty: L.round(x.qty), optional: x.optional, unit: x.unit === item.unit ? '' : x.unit };
          }),
          instructions: form.instructions.value.replace(/\s+$/, '').slice(0, L.MAX_INSTRUCTIONS),
          labels: $$('[data-label-pick] [aria-pressed="true"]', form).map((b) => b.dataset.label),
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
    const item = L.itemById(state, id) || { name: '', unit: 'each', category: 'Other', frequent: false, shortLife: false, multiUse: false, defaultQty: 0, frequentBuy: false, location: '' };
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
        <label class="field"><span>Location</span><select name="location">${locOptions(item.location)}</select></label>
        <div class="default-qty">
          <label class="field"><span>Default amount <em data-default-unit>(${esc(item.unit)})</em></span>
            <input name="defaultQty" type="number" min="0" step="any" inputmode="decimal" placeholder="None" value="${item.defaultQty > 0 ? num(item.defaultQty) : ''}">
          </label>
          <p class="hint">Filled in for you when you add this item to the shopping list or cupboard.</p>
        </div>
        <fieldset class="pack" data-pack>
          <legend>Smaller unit for recipes <em>optional</em></legend>
          <p class="hint">For things you buy whole but use in parts, like a loaf used by the slice or a jar of jam used by the tsp.</p>
          <div class="two">
            <label class="field"><span>Recipes use</span><select name="packUnit" data-pack-unit></select></label>
            <label class="field" data-pack-size><span>How many in 1 <em data-pack-of></em>?</span>
              <input name="packSize" type="number" min="0" step="any" inputmode="decimal" placeholder="Not sure" value="${item.packSize > 0 ? num(item.packSize) : ''}">
            </label>
          </div>
          <p class="hint" data-pack-summary></p>
        </fieldset>
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
        // Smaller unit for recipes (#50): options exclude the item's own unit and its conversions.
        let packSel = item.packUnit || '';
        const syncPack = () => {
          const unit = form.unit.value;
          const choices = alphabetical(withCurrent(L.unitsFor(state), packSel)).filter((u) => !L.groupUnits(unit).includes(u));
          if (!choices.includes(packSel)) packSel = '';
          form.packUnit.innerHTML = `<option value="">None</option>${choices.map((u) => `<option value="${esc(u)}"${u === packSel ? ' selected' : ''}>${esc(u)}</option>`).join('')}`;
          $('[data-pack-of]', d).textContent = unit;
          $('[data-pack-size]', d).hidden = !packSel;
          $('[data-pack]', d).hidden = form.multiUse.checked;
          const size = parseFloat(form.packSize.value);
          const usable = packSel ? alphabetical([...new Set([...L.groupUnits(unit), ...L.groupUnits(packSel)])]).join(', ') : '';
          $('[data-pack-summary]', d).textContent = !packSel ? ''
            : size > 0 ? `1 ${unit} = ${fmtQty(size, packSel)}. Recipes can use ${usable}, and Stropping counts what’s used.`
              : `Without a size, Stropping can’t count how much ${packSel} is used, so it will ask whether you have ${form.name.value.trim() || 'it'} instead. Recipes can use ${usable}.`;
        };
        form.unit.addEventListener('change', () => { syncDefault(); syncPack(); });
        form.multiUse.addEventListener('change', () => { syncDefault(); syncPack(); });
        form.packUnit.addEventListener('change', () => { packSel = form.packUnit.value; syncPack(); });
        form.packSize.addEventListener('input', syncPack);
        syncDefault();
        syncPack();
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
          location: form.location.value,
          packUnit: form.packUnit.value !== form.unit.value ? form.packUnit.value : '',
          packSize: 0,
        };
        if (data.packUnit) data.packSize = parseFloat(form.packSize.value) > 0 ? L.round(parseFloat(form.packSize.value)) : 0;
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

  // ---------- Editable ordered lists: categories (#39) and recipe labels (#45) ----------

  const CATEGORY_LIST = {
    key: 'categories',
    noun: 'category',
    maxLen: L.MAX_CATEGORY_NAME,
    reorderable: true, // the order is the shopping list's aisle order
    names: () => L.categoriesFor(state),
    fixed: L.FALLBACK_CATEGORY,
    usage: (n) => plural(L.categoryUsage(state, n).length, 'item'),
    add: (n) => L.addCategory(state, n),
    move: (n, delta) => L.moveCategory(state, n, delta),
    rename: (from, to) => L.renameCategory(state, from, to),
    remove: (n) => L.removeCategory(state, n),
    removeText: (n) => {
      const k = L.categoryUsage(state, n).length;
      return k ? `Its ${plural(k, 'item')} will move to “${L.FALLBACK_CATEGORY}”.` : 'No items use it.';
    },
  };

  const LABEL_LIST = {
    key: 'labels',
    noun: 'label',
    maxLen: L.MAX_LABEL_NAME,
    reorderable: false, // always shown alphabetically
    names: () => alphabetical(state.labels),
    fixed: null,
    usage: (n) => plural(L.labelUsage(state, n).length, 'recipe'),
    add: (n) => L.addLabel(state, n),
    rename: (from, to) => L.renameLabel(state, from, to),
    remove: (n) => L.removeLabel(state, n),
    removeText: (n) => {
      const k = L.labelUsage(state, n).length;
      return k ? `It will be taken off ${plural(k, 'recipe')}.` : 'No recipes use it.';
    },
  };

  const LOCATION_LIST = {
    key: 'locations',
    noun: 'location',
    maxLen: L.MAX_LOCATION_NAME,
    reorderable: false, // always shown alphabetically
    names: () => alphabetical(state.locations),
    fixed: null,
    usage: (n) => plural(L.locationUsage(state, n).length, 'item'),
    add: (n) => L.addLocation(state, n),
    rename: (from, to) => L.renameLocation(state, from, to),
    remove: (n) => L.removeLocation(state, n),
    removeText: (n) => {
      const k = L.locationUsage(state, n).length;
      return k ? `Its ${plural(k, 'item')} will have no location.` : 'No items use it.';
    },
  };

  /** Rows plus an "add" box for one editable list. */
  function orderedListHtml(list, placeholder) {
    const names = list.names();
    const rows = names.map((name, n) => {
      const fixed = name === list.fixed;
      return `<li data-entry="${esc(name)}">
        <span class="grow"><span class="title">${esc(name)}</span><span class="sub">${list.usage(name)}${fixed ? ' · always kept' : ''}</span></span>
        ${list.reorderable ? `<button type="button" class="icon-btn" data-entry-act="up"${n === 0 ? ' disabled' : ''} aria-label="Move ${esc(name)} up">↑</button>
        <button type="button" class="icon-btn" data-entry-act="down"${n === names.length - 1 ? ' disabled' : ''} aria-label="Move ${esc(name)} down">↓</button>` : ''}
        ${fixed ? '<span class="icon-spacer"></span><span class="icon-spacer"></span>'
          : `<button type="button" class="icon-btn" data-entry-act="rename" aria-label="Rename ${esc(name)}">✎</button>
             <button type="button" class="icon-btn" data-entry-act="delete" aria-label="Delete ${esc(name)}">${ICON.x}</button>`}
      </li>`;
    }).join('');
    return `${names.length ? `<ul class="rows edit-list" data-list="${list.key}">${rows}</ul>` : ''}
      <div class="add-row" data-list="${list.key}">
        <input data-new-entry maxlength="${list.maxLen}" placeholder="${esc(placeholder)}" aria-label="New ${list.noun} name" autocomplete="off">
        <button type="button" class="btn" data-add-entry>Add</button>
      </div>`;
  }

  /** Commit after a successful edit; show the reason if it was refused. Return false from fn to cancel quietly. */
  async function attemptEdit(fn, refresh) {
    try {
      if ((await fn()) === false) return;
      commit();
      refresh();
    } catch (err) {
      await ask({ title: 'Can’t do that', text: err.message, buttons: [{ label: 'OK', value: true, style: 'primary' }] });
    }
  }

  /**
   * Wire up add / move / rename / delete for any ordered lists inside `box`.
   * Returns true if the event was handled.
   */
  function handleOrderedListEvent(e, box, lists, refresh) {
    const holder = e.target.closest('[data-list]');
    const list = holder && lists.find((l) => l.key === holder.dataset.list);
    if (!list) return false;
    const add = () => attemptEdit(() => list.add($('[data-new-entry]', holder).value), refresh);
    if (e.type === 'keydown') {
      if (e.key !== 'Enter' || !e.target.matches('[data-new-entry]')) return false;
      e.preventDefault();
      add();
      return true;
    }
    if (e.target.closest('[data-add-entry]')) { add(); return true; }
    const btn = e.target.closest('[data-entry-act]');
    if (!btn) return false;
    const name = btn.closest('[data-entry]').dataset.entry;
    const act = btn.dataset.entryAct;
    if ((act === 'up' || act === 'down') && list.reorderable) attemptEdit(() => list.move(name, act === 'up' ? -1 : 1), refresh);
    if (act === 'rename') {
      attemptEdit(async () => {
        const res = await ask({
          title: `Rename ${name}`,
          input: { type: 'text', label: 'New name', value: name, maxlength: list.maxLen },
          buttons: [{ label: 'Cancel', value: null }, { label: 'Rename', value: 'ok', style: 'primary', needsInput: true }],
        });
        if (!res || res.input === name) return false;
        return list.rename(name, res.input);
      }, refresh);
    }
    if (act === 'delete') {
      attemptEdit(async () => {
        if (!(await confirm(`Delete ${name}?`, `${list.removeText(name)}${everyone()}`, 'Delete', 'danger'))) return false;
        return list.remove(name);
      }, refresh);
    }
    return true;
  }

  // ---------- Item settings: categories (#39), locations (#46), units (#42) ----------

  function listsHtml() {
    const custom = [...state.settings.customUnits].sort((a, b) => byName(a.name, b.name));
    const unitRows = custom.map((u) => `<li data-unit="${esc(u.name)}">
        <span class="grow"><span class="title">${esc(u.name)}</span><span class="sub">${u.count ? 'Whole numbers' : 'Measured'} · ${plural(L.unitUsage(state, u.name).length, 'item')}</span></span>
        <button type="button" class="icon-btn" data-unit-act="delete" aria-label="Delete ${esc(u.name)}">${ICON.x}</button>
      </li>`).join('');
    return `
      <section class="settings-block">
        <h3>Categories</h3>
        <p class="hint">The shopping list and cupboard are grouped in this order.</p>
        ${orderedListHtml(CATEGORY_LIST, 'New category')}
      </section>
      <section class="settings-block">
        <h3>Locations</h3>
        <p class="hint">Where things are kept. The cupboard can be grouped and swept by location.</p>
        ${orderedListHtml(LOCATION_LIST, 'New location, e.g. Garage')}
      </section>
      <section class="settings-block">
        <h3>Units</h3>
        <p class="hint">Built in: ${esc(alphabetical(L.UNITS).join(', '))}.</p>
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
      title: 'Item settings',
      autofocus: false,
      html: `<div class="lists" data-lists>${listsHtml()}</div>`,
      onSubmit: () => false, // pressing Enter in a box shouldn't close the sheet
      onMount: (d) => {
        const box = $('[data-lists]', d);
        const refresh = () => { box.innerHTML = listsHtml(); };
        const addUnit = () => attemptEdit(() => {
          L.addUnit(state, $('[data-new-unit]', box).value, $('[data-new-unit-count]', box).checked);
        }, refresh);
        const lists = [CATEGORY_LIST, LOCATION_LIST];
        box.addEventListener('keydown', (e) => {
          if (handleOrderedListEvent(e, box, lists, refresh)) return;
          if (e.key === 'Enter' && e.target.matches('[data-new-unit]')) { e.preventDefault(); addUnit(); }
        });
        box.addEventListener('click', (e) => {
          if (handleOrderedListEvent(e, box, lists, refresh)) return;
          if (e.target.closest('[data-add-unit]')) { addUnit(); return; }
          const unitBtn = e.target.closest('[data-unit-act]');
          if (unitBtn) attemptEdit(() => L.removeUnit(state, unitBtn.closest('[data-unit]').dataset.unit), refresh);
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
        <label class="field"><span>Location</span><select name="location">${locOptions('')}</select></label>
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
    const item = L.findItemByName(state, name)
      || L.addItem(state, { name, unit: form.unit.value, category: form.category.value, location: form.location.value });
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
          <p><strong>The cupboard</strong> shows what’s physically there. Ingredients for planned meals stay in it, marked as set aside, until the meal is cooked.</p>
          <p><strong>Plan a meal</strong> and Stropping sets aside what it can from the cupboard and adds the rest to the shopping list, scaled to your portions.</p>
          <p><strong>Tick items off</strong> while shopping and they go into the cupboard, set aside for the meals they were bought for.</p>
          <p><strong>Start a new week</strong> to confirm what you cooked: those ingredients are used up. Uncooked meals can be kept or dropped, and short-life items get an in-date check.</p>
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
      const what = meal.cooked
        ? 'It’s marked as cooked, so its ingredients will be used up from the cupboard.'
        : 'Its ingredients stay in the cupboard, and anything not yet bought comes off the list.';
      if (!(await confirm(`Remove ${meal.name}?`, what, 'Remove'))) return;
      commit(L.removeMeal(state, id));
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
    labels: labelsSheet,
    'cup-group': (_, el) => {
      cupGroup = el.dataset.by === 'location' ? 'location' : 'category';
      try { localStorage.setItem(CUP_GROUP_KEY, cupGroup); } catch (e) { /* ignore */ }
      render();
    },
    'filter-label': (_, el) => setRecipeFilter(toggleIn(recipeFilter.filter((l) => labelsInUse().includes(l)), el.dataset.label)),
    'filter-clear': () => setRecipeFilter([]),
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
    // Dialogs handle their own clicks. Use the event path, not el.closest(), because
    // a dialog may have re-rendered and detached the clicked element already.
    const inDialog = e.composedPath().some((n) => n.tagName === 'DIALOG');
    if (!el || el.tagName === 'INPUT' || inDialog) return;
    const fn = ACTIONS[el.dataset.act];
    if (fn) fn(el.dataset.id, el);
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.matches('[data-act=cooked]')) { L.setCooked(state, el.dataset.id, el.checked); commit(); }
    if (el.matches('[data-act=bought]')) { L.setBought(state, el.dataset.id, el.checked); commit(); }
  });

  document.addEventListener('input', (e) => {
    if (e.target.matches('[data-search]')) {
      searches[tab] = e.target.value;
      applySearch();
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
