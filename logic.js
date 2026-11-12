/*
 * Stropping — data model and stock rules.
 *
 * No DOM access in this file: everything here works on a plain state object so
 * it can be tested in Node. Flows that need the user's input (planning a meal,
 * starting a new week, sweeping the cupboard) take an async `ask(question)`
 * callback; returning null/undefined from it cancels the flow.
 *
 * State shape:
 *   items:    [{ id, name, unit, category, frequent, shortLife, multiUse }]
 *   recipes:  [{ id, name, url, serves, ingredients: [{ itemId, qty }] }]
 *   cupboard: { [itemId]: qty }            multi-use items: 1 = in stock
 *   shopping: [{ id, itemId, qty, reserved, done, added }]
 *             reserved = amount already promised to planned meals
 *             added    = amount put into the cupboard when ticked (to undo)
 *   week:     { id, start, meals: [{ id, recipeId, name, url, portions, cooked,
 *               alloc: [{ itemId, need, fromCupboard, toShop }] }] }
 *   lastWeek: summary of the previous week, or null
 */
(function (root) {
  'use strict';

  const UNITS = ['each', 'g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'clove', 'tin', 'jar', 'pack', 'bottle', 'bunch', 'slice', 'pinch'];
  // Units you can only buy whole numbers of.
  const COUNT_UNITS = new Set(['each', 'clove', 'tin', 'jar', 'pack', 'bottle', 'bunch', 'slice']);
  const CATEGORIES = ['Fruit & veg', 'Meat & fish', 'Dairy & eggs', 'Bakery', 'Cupboard', 'Herbs & spices', 'Frozen', 'Drinks', 'Household', 'Other'];
  const EPS = 1e-6;

  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const newWeek = (meals = []) => ({ id: uid(), start: today(), meals });

  function emptyState() {
    return { version: 1, items: [], recipes: [], cupboard: {}, shopping: [], week: newWeek(), lastWeek: null };
  }

  /** Validate and fill defaults on loaded or imported data. Throws on junk. */
  function normalise(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.items) || !Array.isArray(raw.recipes)) {
      throw new Error('This does not look like Stropping data.');
    }
    const s = emptyState();
    s.items = raw.items.filter((i) => i && i.id && i.name).map((i) => ({
      id: String(i.id),
      name: String(i.name),
      unit: UNITS.includes(i.unit) ? i.unit : 'each',
      category: CATEGORIES.includes(i.category) ? i.category : 'Other',
      frequent: !!i.frequent,
      shortLife: !!i.shortLife,
      multiUse: !!i.multiUse,
    }));
    const ids = new Set(s.items.map((i) => i.id));
    s.recipes = raw.recipes.filter((r) => r && r.id && r.name).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      url: r.url ? String(r.url) : '',
      serves: Number(r.serves) > 0 ? Number(r.serves) : 1,
      ingredients: (Array.isArray(r.ingredients) ? r.ingredients : [])
        .filter((g) => g && ids.has(g.itemId))
        .map((g) => ({ itemId: g.itemId, qty: round(g.qty) })),
    }));
    for (const [id, q] of Object.entries(raw.cupboard || {})) {
      if (ids.has(id) && Number(q) > EPS) s.cupboard[id] = round(q);
    }
    s.shopping = (Array.isArray(raw.shopping) ? raw.shopping : [])
      .filter((e) => e && ids.has(e.itemId))
      .map((e) => ({
        id: e.id || uid(), itemId: e.itemId, qty: round(e.qty), reserved: round(e.reserved),
        done: !!e.done, added: round(e.added),
      }));
    if (raw.week && Array.isArray(raw.week.meals)) {
      s.week = {
        id: raw.week.id || uid(),
        start: raw.week.start || today(),
        meals: raw.week.meals.map((m) => ({
          id: m.id || uid(), recipeId: m.recipeId, name: String(m.name || 'Meal'), url: m.url || '',
          portions: Number(m.portions) || 1, cooked: !!m.cooked, at: Number(m.at) || 0,
          alloc: (Array.isArray(m.alloc) ? m.alloc : []).map((a) => ({
            itemId: a.itemId, need: round(a.need), fromCupboard: round(a.fromCupboard), toShop: round(a.toShop),
          })),
        })),
      };
    }
    s.lastWeek = raw.lastWeek || null;
    return s;
  }

  // ---------- Items ----------

  const itemById = (s, id) => s.items.find((i) => i.id === id);
  const findItemByName = (s, name) => {
    const n = String(name || '').trim().toLowerCase();
    return n ? s.items.find((i) => i.name.toLowerCase() === n) : undefined;
  };

  function addItem(s, { name, unit = 'each', category = 'Other', frequent = false, shortLife = false, multiUse = false }) {
    const existing = findItemByName(s, name);
    if (existing) return existing;
    const item = {
      id: uid(), name: String(name).trim(),
      unit: UNITS.includes(unit) ? unit : 'each',
      category: CATEGORIES.includes(category) ? category : 'Other',
      frequent: !!frequent, shortLife: !!shortLife, multiUse: !!multiUse,
    };
    s.items.push(item);
    return item;
  }

  /** Recipes that use an item. */
  const itemUsage = (s, id) => s.recipes.filter((r) => r.ingredients.some((g) => g.itemId === id));

  function deleteItem(s, id) {
    s.items = s.items.filter((i) => i.id !== id);
    delete s.cupboard[id];
    s.shopping = s.shopping.filter((e) => e.itemId !== id);
  }

  const isCountUnit = (unit) => COUNT_UNITS.has(unit);

  // ---------- Cupboard ----------

  const cupQty = (s, id) => s.cupboard[id] || 0;
  function setCup(s, id, qty) {
    if (!itemById(s, id)) return;
    const q = round(qty);
    if (q > EPS) s.cupboard[id] = q;
    else delete s.cupboard[id];
  }

  // ---------- Shopping list ----------

  const unboughtEntry = (s, itemId) => s.shopping.find((e) => e.itemId === itemId && !e.done);

  /** Add to the list, merging with an unticked entry for the same item. */
  function addToShopping(s, itemId, qty, reserved = 0) {
    let e = unboughtEntry(s, itemId);
    if (!e) {
      e = { id: uid(), itemId, qty: 0, reserved: 0, done: false, added: 0 };
      s.shopping.push(e);
    }
    e.qty = round(e.qty + qty);
    e.reserved = round(e.reserved + reserved);
    return e;
  }

  /** Amount to actually buy: whole numbers for countable units. */
  function buyQty(s, e) {
    const item = itemById(s, e.itemId);
    return item && isCountUnit(item.unit) ? Math.ceil(e.qty - EPS) : round(e.qty);
  }

  /** Take back an amount reserved for a meal from the unticked list entry. Returns how much was taken back. */
  function unreserve(s, itemId, amount) {
    const e = unboughtEntry(s, itemId);
    if (!e || amount <= EPS) return 0;
    const r = Math.min(e.reserved, amount);
    e.reserved = round(e.reserved - r);
    e.qty = round(e.qty - r);
    if (e.qty <= EPS) s.shopping = s.shopping.filter((x) => x !== e);
    return r;
  }

  /**
   * Tick or untick a list entry. Ticking puts anything beyond what planned meals
   * need into the cupboard (multi-use items are simply marked in stock).
   */
  function setBought(s, entryId, done) {
    const e = s.shopping.find((x) => x.id === entryId);
    if (!e || e.done === done) return;
    const item = itemById(s, e.itemId);
    if (done) {
      let added = 0;
      if (item && item.multiUse) added = cupQty(s, e.itemId) > EPS ? 0 : 1;
      else added = Math.max(0, round(buyQty(s, e) - e.reserved));
      setCup(s, e.itemId, cupQty(s, e.itemId) + added);
      e.added = added;
      e.done = true;
    } else {
      setCup(s, e.itemId, cupQty(s, e.itemId) - (e.added || 0));
      e.added = 0;
      e.done = false;
      // Merge back into another unticked entry for the same item, if any.
      const other = s.shopping.find((x) => x !== e && x.itemId === e.itemId && !x.done);
      if (other) {
        other.qty = round(other.qty + e.qty);
        other.reserved = round(other.reserved + e.reserved);
        s.shopping = s.shopping.filter((x) => x !== e);
      }
    }
  }

  const clearBought = (s) => { s.shopping = s.shopping.filter((e) => !e.done); };

  /**
   * Empty the whole list. Ticked items stay in the cupboard; amounts that were
   * set aside for planned meals are treated as already in hand, so if such a
   * meal is later dropped they go back to the cupboard.
   */
  const clearShopping = (s) => { s.shopping = []; };

  // ---------- Recipes & meals ----------

  const scaleQty = (recipe, qty, portions) => round((qty * portions) / (recipe.serves || 1));

  /**
   * Plan a recipe for this week. Uses what's in the cupboard and puts any
   * shortfall on the shopping list. Asks about multi-use and frequently used
   * items. Returns { state, meal, report } or null if cancelled.
   */
  async function planMeal(state, recipeId, portions, ask) {
    const s = clone(state);
    const recipe = s.recipes.find((r) => r.id === recipeId);
    if (!recipe) throw new Error('Recipe not found');
    const meal = {
      id: uid(), recipeId, name: recipe.name, url: recipe.url || '', portions: Number(portions) || recipe.serves,
      cooked: false, at: Date.now(), alloc: [],
    };
    const report = [];
    const answered = new Map();

    for (const ing of recipe.ingredients) {
      const item = itemById(s, ing.itemId);
      if (!item) continue;
      const need = scaleQty(recipe, ing.qty, meal.portions);

      if (item.multiUse) {
        if (answered.has(item.id)) continue;
        if (unboughtEntry(s, item.id)) {
          answered.set(item.id, true);
          report.push({ item, need, status: 'on-list' });
          continue;
        }
        const has = await ask({ kind: 'multi', item, meal, need });
        if (has == null) return null;
        answered.set(item.id, has);
        if (has) {
          setCup(s, item.id, 1);
          report.push({ item, need, status: 'have' });
        } else {
          setCup(s, item.id, 0);
          addToShopping(s, item.id, 1, 0);
          report.push({ item, need, status: 'buy', toShop: 1 });
        }
        continue;
      }

      let avail = cupQty(s, item.id);
      if (item.frequent && avail > EPS && !answered.has(item.id)) {
        const has = await ask({ kind: 'frequent', item, meal, need, qty: avail });
        if (has == null) return null;
        answered.set(item.id, has);
        if (!has) {
          setCup(s, item.id, 0);
          avail = 0;
        }
      }
      const take = round(Math.min(avail, need));
      setCup(s, item.id, avail - take);
      const short = round(need - take);
      if (short > EPS) addToShopping(s, item.id, short, short);
      meal.alloc.push({ itemId: item.id, need, fromCupboard: take, toShop: short });
      report.push({ item, need, fromCupboard: take, toShop: short, status: short > EPS ? 'buy' : 'cupboard' });
    }

    s.week.meals.push(meal);
    return { state: s, meal, report };
  }

  /** How much of an allocation is physically held (taken from the cupboard or already bought). */
  function heldFor(s, a) {
    const e = unboughtEntry(s, a.itemId);
    const stillToBuy = Math.min(a.toShop, e ? e.reserved : 0);
    return round(a.fromCupboard + (a.toShop - stillToBuy));
  }

  /** Give a meal's ingredients back: to the cupboard if held, off the list if not yet bought. */
  function releaseMeal(s, meal) {
    for (const a of meal.alloc) {
      let back = a.fromCupboard;
      if (a.toShop > EPS) back += a.toShop - unreserve(s, a.itemId, a.toShop);
      if (back > EPS) setCup(s, a.itemId, cupQty(s, a.itemId) + back);
    }
  }

  function removeMeal(state, mealId) {
    const s = clone(state);
    const meal = s.week.meals.find((m) => m.id === mealId);
    if (!meal) return s;
    releaseMeal(s, meal);
    s.week.meals = s.week.meals.filter((m) => m !== meal);
    return s;
  }

  function setCooked(s, mealId, cooked) {
    const meal = s.week.meals.find((m) => m.id === mealId);
    if (meal) meal.cooked = !!cooked;
  }

  /**
   * Close the current week and start a new one:
   *  1. ask about every meal not already ticked as cooked: cooked / carry over / drop
   *     (dropped meals give their ingredients back to the cupboard)
   *  2. for carried-over meals, check short-life ingredients are still in date
   *  3. check every short-life item in the cupboard that no cooked meal used
   * Returns { state, summary } or null if cancelled.
   */
  async function startNewWeek(state, ask) {
    const s = clone(state);
    const cooked = s.week.meals.filter((m) => m.cooked);
    const pending = s.week.meals.filter((m) => !m.cooked);
    const carried = [];
    const dropped = [];
    const binned = [];

    for (let i = 0; i < pending.length; i++) {
      const meal = pending[i];
      const ans = await ask({ kind: 'cooked', meal, index: i, total: pending.length });
      if (ans == null) return null;
      if (ans === 'cooked') cooked.push(meal);
      else if (ans === 'carry') carried.push(meal);
      else {
        releaseMeal(s, meal);
        dropped.push(meal);
      }
    }

    const used = new Set(cooked.flatMap((m) => m.alloc.filter((a) => a.need > EPS).map((a) => a.itemId)));

    for (const meal of carried) {
      for (const a of meal.alloc) {
        const item = itemById(s, a.itemId);
        if (!item || !item.shortLife) continue;
        const held = heldFor(s, a);
        if (held <= EPS) continue;
        const ok = await ask({ kind: 'shortlife-meal', item, meal, qty: held });
        if (ok == null) return null;
        if (!ok) {
          addToShopping(s, item.id, held, held);
          a.toShop = round(a.toShop + a.fromCupboard);
          a.fromCupboard = 0;
          binned.push(item.name);
        }
      }
    }

    const toCheck = Object.keys(s.cupboard)
      .map((id) => itemById(s, id))
      .filter((item) => item && item.shortLife && !used.has(item.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const item of toCheck) {
      const ok = await ask({ kind: 'shortlife', item, qty: cupQty(s, item.id) });
      if (ok == null) return null;
      if (!ok) {
        setCup(s, item.id, 0);
        binned.push(item.name);
      }
    }

    const summary = {
      start: s.week.start,
      cooked: cooked.map((m) => m.name),
      carried: carried.map((m) => m.name),
      dropped: dropped.map((m) => m.name),
      binned,
    };
    s.lastWeek = summary;
    s.week = newWeek(carried.map((m) => ({ ...m, cooked: false })));
    return { state: s, summary };
  }

  /**
   * Go through every cupboard item and confirm it's still there.
   * ask() answers: { action: 'keep', qty? } | { action: 'gone', addToList } | null (stop, keep progress).
   */
  async function sweep(state, ask) {
    const s = clone(state);
    const items = Object.keys(s.cupboard)
      .map((id) => itemById(s, id))
      .filter(Boolean)
      .sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name));
    let reviewed = 0;
    let removed = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const qty = cupQty(s, item.id);
      const ans = await ask({ kind: 'sweep', item, qty, index: i, total: items.length });
      if (ans == null) break;
      reviewed++;
      if (ans.action === 'gone') {
        setCup(s, item.id, 0);
        removed++;
        if (ans.addToList && !unboughtEntry(s, item.id)) addToShopping(s, item.id, item.multiUse ? 1 : qty, 0);
      } else if (ans.qty != null && !item.multiUse && Number(ans.qty) >= 0) {
        setCup(s, item.id, Number(ans.qty));
      }
    }
    return { state: s, reviewed, removed, total: items.length };
  }

  // ---------- Sample data ----------

  function sampleState() {
    const s = emptyState();
    const add = (name, unit, category, flags = {}) => addItem(s, { name, unit, category, ...flags }).id;
    const i = {
      chicken: add('Chicken breast', 'g', 'Meat & fish', { shortLife: true }),
      mince: add('Beef mince', 'g', 'Meat & fish', { shortLife: true }),
      onion: add('Onion', 'each', 'Fruit & veg'),
      garlic: add('Garlic', 'clove', 'Fruit & veg'),
      spinach: add('Spinach', 'g', 'Fruit & veg', { shortLife: true }),
      tomatoes: add('Chopped tomatoes', 'tin', 'Cupboard'),
      coconut: add('Coconut milk', 'tin', 'Cupboard'),
      rice: add('Basmati rice', 'g', 'Cupboard'),
      pasta: add('Spaghetti', 'g', 'Cupboard'),
      flour: add('Plain flour', 'g', 'Cupboard'),
      milk: add('Milk', 'ml', 'Dairy & eggs', { frequent: true }),
      eggs: add('Eggs', 'each', 'Dairy & eggs', { frequent: true }),
      butter: add('Butter', 'g', 'Dairy & eggs', { frequent: true }),
      cheddar: add('Cheddar', 'g', 'Dairy & eggs'),
      cumin: add('Ground cumin', 'tsp', 'Herbs & spices', { multiUse: true }),
      paprika: add('Paprika', 'tsp', 'Herbs & spices', { multiUse: true }),
      oil: add('Olive oil', 'tbsp', 'Cupboard', { multiUse: true }),
      kitchenRoll: add('Kitchen roll', 'pack', 'Household'),
    };
    const recipe = (name, serves, list) => s.recipes.push({
      id: uid(), name, url: '', serves, ingredients: list.map(([itemId, qty]) => ({ itemId, qty })),
    });
    recipe('Chicken curry', 4, [[i.chicken, 500], [i.onion, 1], [i.garlic, 3], [i.tomatoes, 1], [i.coconut, 1],
      [i.cumin, 2], [i.paprika, 1], [i.oil, 1], [i.spinach, 100], [i.rice, 300]]);
    recipe('Spaghetti bolognese', 4, [[i.mince, 500], [i.onion, 1], [i.garlic, 2], [i.tomatoes, 2], [i.pasta, 400],
      [i.oil, 1], [i.cheddar, 50]]);
    recipe('Pancakes', 2, [[i.flour, 100], [i.eggs, 2], [i.milk, 300], [i.butter, 20]]);
    Object.assign(s.cupboard, {
      [i.rice]: 1000, [i.pasta]: 500, [i.onion]: 3, [i.garlic]: 6, [i.tomatoes]: 2, [i.flour]: 1000,
      [i.milk]: 1000, [i.eggs]: 6, [i.butter]: 250, [i.cumin]: 1, [i.paprika]: 1, [i.oil]: 1, [i.chicken]: 500,
    });
    return s;
  }

  // ---------- Sync documents ----------
  //
  // For sharing, state is stored as one small document per entity so that two
  // people editing different things never overwrite each other. Paths:
  //   items/{id}  recipes/{id}  shopping/{id}  cupboard/{itemId}  meals/{id}  meta/week

  const SYNC_COLLECTIONS = ['items', 'recipes', 'shopping', 'cupboard', 'meals', 'meta'];

  /** JSON with sorted keys, so documents compare equal regardless of key order. */
  function stableJson(v) {
    if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
    if (v && typeof v === 'object') {
      return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(',')}}`;
    }
    return JSON.stringify(v === undefined ? null : v);
  }

  function toDocs(s) {
    const d = new Map();
    for (const i of s.items) d.set(`items/${i.id}`, clone(i));
    for (const r of s.recipes) d.set(`recipes/${r.id}`, clone(r));
    for (const e of s.shopping) d.set(`shopping/${e.id}`, clone(e));
    for (const [id, qty] of Object.entries(s.cupboard)) d.set(`cupboard/${id}`, { qty });
    s.week.meals.forEach((m, n) => d.set(`meals/${m.id}`, { ...clone(m), at: m.at || n }));
    d.set('meta/week', { id: s.week.id, start: s.week.start, lastWeek: s.lastWeek ? clone(s.lastWeek) : null });
    return d;
  }

  /**
   * Rebuild state from documents. Deliberately lenient: unlike normalise() it
   * keeps references to items it hasn't seen yet, because during sync a recipe
   * can arrive a moment before the item it uses.
   */
  function fromDocs(d) {
    const s = emptyState();
    let meta = null;
    for (const [path, data] of d) {
      const [coll, id] = path.split('/');
      if (!data || !id) continue;
      if (coll === 'items') {
        s.items.push({
          id, name: String(data.name || ''), unit: UNITS.includes(data.unit) ? data.unit : 'each',
          category: CATEGORIES.includes(data.category) ? data.category : 'Other',
          frequent: !!data.frequent, shortLife: !!data.shortLife, multiUse: !!data.multiUse,
        });
      } else if (coll === 'recipes') {
        s.recipes.push({
          id, name: String(data.name || ''), url: data.url || '', serves: Number(data.serves) > 0 ? Number(data.serves) : 1,
          ingredients: (Array.isArray(data.ingredients) ? data.ingredients : []).map((g) => ({ itemId: g.itemId, qty: round(g.qty) })),
        });
      } else if (coll === 'shopping') {
        s.shopping.push({ id, itemId: data.itemId, qty: round(data.qty), reserved: round(data.reserved), done: !!data.done, added: round(data.added) });
      } else if (coll === 'cupboard') {
        if (Number(data.qty) > EPS) s.cupboard[id] = round(data.qty);
      } else if (coll === 'meals') {
        s.week.meals.push({
          id, recipeId: data.recipeId, name: String(data.name || 'Meal'), url: data.url || '',
          portions: Number(data.portions) || 1, cooked: !!data.cooked, at: Number(data.at) || 0,
          alloc: (Array.isArray(data.alloc) ? data.alloc : []).map((a) => ({
            itemId: a.itemId, need: round(a.need), fromCupboard: round(a.fromCupboard), toShop: round(a.toShop),
          })),
        });
      } else if (coll === 'meta' && id === 'week') {
        meta = data;
      }
    }
    s.week.meals.sort((a, b) => a.at - b.at);
    if (meta) {
      s.week.id = meta.id || s.week.id;
      s.week.start = meta.start || s.week.start;
      s.lastWeek = meta.lastWeek || null;
    }
    return s;
  }

  /** Documents to write and delete to get from `before` to `after` (both Maps from toDocs). */
  function diffDocs(before, after) {
    const set = [];
    const del = [];
    for (const [k, v] of after) {
      if (!before.has(k) || stableJson(before.get(k)) !== stableJson(v)) set.push([k, v]);
    }
    for (const k of before.keys()) if (!after.has(k)) del.push(k);
    return { set, del };
  }

  function applyDocChanges(s, changes) {
    const d = toDocs(s);
    for (const [k, v] of changes.set) d.set(k, v);
    for (const k of changes.del) d.delete(k);
    return fromDocs(d);
  }

  const api = {
    UNITS, CATEGORIES, EPS, uid, round, today, emptyState, normalise, sampleState,
    itemById, findItemByName, addItem, itemUsage, deleteItem, isCountUnit,
    cupQty, setCup,
    addToShopping, buyQty, setBought, clearBought, clearShopping, unreserve,
    scaleQty, planMeal, removeMeal, setCooked, startNewWeek, sweep, heldFor,
    SYNC_COLLECTIONS, toDocs, fromDocs, diffDocs, applyDocChanges,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StroppingLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
