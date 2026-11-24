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
 *   recipes:  [{ id, name, url, serves, ingredients: [{ itemId, qty, optional }], instructions, labels: [name] }]
 *   labels:   [name]  household's recipe labels (always shown alphabetically)
 *   locations: [name] where items are kept (Fridge, Pantry…); items[].location ('' = not set)
 *   cupboard: { [itemId]: qty }            multi-use items: 1 = in stock
 *   shopping: [{ id, itemId, qty, reserved, done, added }]
 *             reserved = amount already promised to planned meals
 *             added    = amount put into the cupboard when ticked (to undo)
 *   week:     { id, start, meals: [{ id, recipeId, name, url, portions, cooked,
 *               alloc: [{ itemId, need, fromCupboard, toShop }] }] }
 *   lastWeek: summary of the previous week, or null
 *   settings: { customUnits: [{ name, count }], categories: [name] }
 *             household's own units (count = bought in whole numbers) and
 *             category list in shopping-list order ("Other" always present)
 */
(function (root) {
  'use strict';

  // Built-in units. Households can add their own (settings.customUnits).
  const UNITS = ['each', 'g', 'kg', 'ml', 'l', 'pint', 'tsp', 'tbsp', 'clove', 'bulb', 'tin', 'jar', 'pack', 'box',
    'bottle', 'bunch', 'loaf', 'slice', 'pinch'];
  // Built-in units you can only buy whole numbers of.
  const COUNT_UNITS = new Set(['each', 'clove', 'bulb', 'tin', 'jar', 'pack', 'box', 'bottle', 'bunch', 'loaf', 'slice']);
  // Units that convert automatically (#50): [group, size in the group's base unit].
  const UNIT_FACTORS = {
    g: ['weight', 1], kg: ['weight', 1000],
    ml: ['volume', 1], l: ['volume', 1000], pint: ['volume', 568.261], tsp: ['volume', 5], tbsp: ['volume', 15],
  };
  // Default categories, in shopping-list order. Households can edit them (settings.categories).
  const CATEGORIES = ['Fruit & veg', 'Meat & fish', 'Dairy & eggs', 'Bakery', 'Cupboard', 'Herbs & spices', 'Frozen', 'Drinks', 'Household', 'Other'];
  const FALLBACK_CATEGORY = 'Other'; // always present; can't be renamed or deleted
  const MAX_CUSTOM = 50; // max custom units, and max categories (also in firestore.rules)
  const MAX_UNIT_NAME = 20;
  const MAX_CATEGORY_NAME = 50;
  // Recipe labels (#45): household list (own sync doc, meta/labels) + per-recipe selection.
  const DEFAULT_LABELS = ['Simple', 'Fast', 'From Freezer', 'Slow Cooker', 'Oven', 'Gas Hob', 'Air Fryer'];
  const MAX_LABELS = 50; // household label list (also in firestore.rules)
  const MAX_LABEL_NAME = 30;
  const MAX_RECIPE_LABELS = 20; // labels on one recipe (also in firestore.rules)
  // Item locations (#46): household list (own sync doc, meta/locations). '' = not set.
  const DEFAULT_LOCATIONS = ['Fridge', 'Freezer', 'Pantry', 'Tall cupboard'];
  const MAX_LOCATIONS = 50; // also in firestore.rules
  const MAX_LOCATION_NAME = 50;
  const EPS = 1e-6;

  const MAX_INSTRUCTIONS = 20000; // also enforced in firestore.rules
  const cleanInstructions = (v) => (typeof v === 'string' ? v.slice(0, MAX_INSTRUCTIONS) : '');
  // A recipe ingredient. Optional ones (#49) are only used when picked for that meal.
  // `unit` is the recipe's own unit (#50); '' means the item's unit.
  const cleanIngredient = (g) => ({
    itemId: g.itemId, qty: round(g.qty), optional: !!g.optional,
    unit: typeof g.unit === 'string' ? g.unit.slice(0, MAX_UNIT_NAME) : '',
  });
  // Default amount to buy/stock for an item; 0 means "no default set".
  const cleanDefault = (v) => (Number(v) > 0 ? Math.min(round(v), 1000000) : 0);

  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Data model version, stored on the week. 2 (#51): the cupboard holds what's
  // physically there; planned meals' ingredients are set aside, not removed,
  // and are used up when the meal is confirmed cooked at the start of a new week.
  const MODEL = 2;
  const newWeek = (meals = []) => ({ id: uid(), start: today(), meals, model: MODEL });

  // ---------- Settings: custom units and editable categories ----------

  const defaultSettings = () => ({ customUnits: [], categories: [...CATEGORIES] });

  /** Sanitise settings from storage or sync: trims, de-duplicates, caps sizes, keeps "Other". */
  function cleanSettings(raw) {
    const out = defaultSettings();
    if (!raw || typeof raw !== 'object') return out;
    const taken = new Set(UNITS);
    out.customUnits = (Array.isArray(raw.customUnits) ? raw.customUnits : [])
      .map((u) => ({ name: String((u && u.name) || '').trim().slice(0, MAX_UNIT_NAME), count: !!(u && u.count) }))
      .filter((u) => {
        const key = u.name.toLowerCase();
        if (!u.name || taken.has(key)) return false;
        taken.add(key);
        return true;
      })
      .slice(0, MAX_CUSTOM);
    if (Array.isArray(raw.categories)) {
      const cats = cleanNameList(raw.categories, MAX_CUSTOM, MAX_CATEGORY_NAME);
      out.categories = cats.includes(FALLBACK_CATEGORY) ? cats : [...cats.slice(0, MAX_CUSTOM - 1), FALLBACK_CATEGORY];
    }
    return out;
  }

  /** Trim, drop blanks, de-duplicate (ignoring case) and cap a list of names. */
  function cleanNameList(list, maxItems, maxLen) {
    const seen = new Set();
    const out = [];
    for (const v of Array.isArray(list) ? list : []) {
      const n = String(v == null ? '' : v).trim().slice(0, maxLen);
      if (n && !seen.has(n.toLowerCase())) {
        seen.add(n.toLowerCase());
        out.push(n);
      }
    }
    return out.slice(0, maxItems);
  }

  const cleanLabels = (raw) => (Array.isArray(raw) ? cleanNameList(raw, MAX_LABELS, MAX_LABEL_NAME) : [...DEFAULT_LABELS]);
  const cleanRecipeLabels = (raw) => cleanNameList(raw, MAX_RECIPE_LABELS, MAX_LABEL_NAME);
  const cleanLocations = (raw) => (Array.isArray(raw) ? cleanNameList(raw, MAX_LOCATIONS, MAX_LOCATION_NAME) : [...DEFAULT_LOCATIONS]);
  const cleanItemLocation = (v) => (typeof v === 'string' ? v.trim().slice(0, MAX_LOCATION_NAME) : '');

  function emptyState() {
    return {
      version: 1, items: [], recipes: [], cupboard: {}, shopping: [], week: newWeek(), lastWeek: null,
      settings: defaultSettings(), labels: [...DEFAULT_LABELS], locations: [...DEFAULT_LOCATIONS],
    };
  }

  const unitsFor = (s) => [...UNITS, ...s.settings.customUnits.map((u) => u.name)];
  const categoriesFor = (s) => s.settings.categories;
  const validUnit = (s, unit) => (unitsFor(s).includes(unit) ? unit : 'each');
  const validCategory = (s, cat) => (categoriesFor(s).includes(cat) ? cat : FALLBACK_CATEGORY);
  const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();

  function addUnit(s, name, count) {
    const n = String(name || '').trim();
    if (!n) throw new Error('Enter a name for the unit.');
    if (n.length > MAX_UNIT_NAME) throw new Error(`Unit names can be up to ${MAX_UNIT_NAME} characters.`);
    if (unitsFor(s).some((u) => sameName(u, n))) throw new Error(`There’s already a unit called “${n}”.`);
    if (s.settings.customUnits.length >= MAX_CUSTOM) throw new Error(`You can have up to ${MAX_CUSTOM} of your own units.`);
    s.settings.customUnits.push({ name: n, count: !!count });
  }

  const unitUsage = (s, name) => s.items.filter((i) => i.unit === name || i.packUnit === name);

  function removeUnit(s, name) {
    const used = unitUsage(s, name);
    if (used.length) throw new Error(`${name} is used by ${used.length === 1 ? used[0].name : `${used.length} items`}. Change ${used.length === 1 ? 'its' : 'their'} unit first.`);
    s.settings.customUnits = s.settings.customUnits.filter((u) => u.name !== name);
  }

  /** Validate a new name for an entry in an editable list (categories, labels). `except` is the entry being renamed. */
  function checkListName(list, name, { noun, maxLen, except }) {
    const n = String(name || '').trim();
    if (!n) throw new Error(`Enter a name for the ${noun}.`);
    if (n.length > maxLen) throw new Error(`${noun[0].toUpperCase()}${noun.slice(1)} names can be up to ${maxLen} characters.`);
    if (list.some((c) => c !== except && sameName(c, n))) throw new Error(`There’s already a ${noun} called “${n}”.`);
    return n;
  }

  /** Swap an entry with its neighbour (delta -1 = up, +1 = down). */
  function moveInList(list, name, delta) {
    const from = list.indexOf(name);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= list.length) return;
    [list[from], list[to]] = [list[to], list[from]];
  }

  const checkCategoryName = (s, name, except) => checkListName(categoriesFor(s), name, { noun: 'category', maxLen: MAX_CATEGORY_NAME, except });

  /** New categories go just above "Other". */
  function addCategory(s, name) {
    const n = checkCategoryName(s, name);
    if (s.settings.categories.length >= MAX_CUSTOM) throw new Error(`You can have up to ${MAX_CUSTOM} categories.`);
    const at = s.settings.categories.indexOf(FALLBACK_CATEGORY);
    s.settings.categories.splice(at < 0 ? s.settings.categories.length : at, 0, n);
    return n;
  }

  /** Rename a category and move its items with it. */
  function renameCategory(s, from, to) {
    if (from === FALLBACK_CATEGORY) throw new Error(`“${FALLBACK_CATEGORY}” can’t be renamed.`);
    const n = checkCategoryName(s, to, from);
    s.settings.categories = s.settings.categories.map((c) => (c === from ? n : c));
    for (const i of s.items) if (i.category === from) i.category = n;
    return n;
  }

  /** Delete a category; its items move to "Other". */
  function removeCategory(s, name) {
    if (name === FALLBACK_CATEGORY) throw new Error(`“${FALLBACK_CATEGORY}” can’t be deleted.`);
    s.settings.categories = s.settings.categories.filter((c) => c !== name);
    for (const i of s.items) if (i.category === name) i.category = FALLBACK_CATEGORY;
  }

  const moveCategory = (s, name, delta) => moveInList(s.settings.categories, name, delta);

  const categoryUsage = (s, name) => s.items.filter((i) => i.category === name);

  // ---------- Recipe labels (#45) ----------

  const checkLabelName = (s, name, except) => checkListName(s.labels, name, { noun: 'label', maxLen: MAX_LABEL_NAME, except });

  function addLabel(s, name) {
    const n = checkLabelName(s, name);
    if (s.labels.length >= MAX_LABELS) throw new Error(`You can have up to ${MAX_LABELS} labels.`);
    s.labels.push(n);
    return n;
  }

  /** Rename a label everywhere, including on recipes. */
  function renameLabel(s, from, to) {
    const n = checkLabelName(s, to, from);
    s.labels = s.labels.map((l) => (l === from ? n : l));
    for (const r of s.recipes) r.labels = r.labels.map((l) => (l === from ? n : l));
    return n;
  }

  /** Delete a label and take it off every recipe. */
  function removeLabel(s, name) {
    s.labels = s.labels.filter((l) => l !== name);
    for (const r of s.recipes) r.labels = r.labels.filter((l) => l !== name);
  }

  const labelUsage = (s, name) => s.recipes.filter((r) => r.labels.includes(name));

  // ---------- Item locations (#46) ----------

  const checkLocationName = (s, name, except) => checkListName(s.locations, name, { noun: 'location', maxLen: MAX_LOCATION_NAME, except });

  function addLocation(s, name) {
    const n = checkLocationName(s, name);
    if (s.locations.length >= MAX_LOCATIONS) throw new Error(`You can have up to ${MAX_LOCATIONS} locations.`);
    s.locations.push(n);
    return n;
  }

  /** Rename a location and move its items with it. */
  function renameLocation(s, from, to) {
    const n = checkLocationName(s, to, from);
    s.locations = s.locations.map((l) => (l === from ? n : l));
    for (const i of s.items) if (i.location === from) i.location = n;
    return n;
  }

  /** Delete a location; its items become "not set". */
  function removeLocation(s, name) {
    s.locations = s.locations.filter((l) => l !== name);
    for (const i of s.items) if (i.location === name) i.location = '';
  }

  const locationUsage = (s, name) => s.items.filter((i) => i.location === name);

  /** Recipes that have ALL of the selected labels (all recipes when none are selected). */
  const recipesWithLabels = (s, selected) => s.recipes.filter((r) => selected.every((l) => r.labels.includes(l)));

  /** Validate and fill defaults on loaded or imported data. Throws on junk. */
  function normalise(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.items) || !Array.isArray(raw.recipes)) {
      throw new Error('This does not look like Stropping data.');
    }
    const s = emptyState();
    s.settings = cleanSettings(raw.settings);
    s.labels = cleanLabels(raw.labels);
    s.locations = cleanLocations(raw.locations);
    s.items = raw.items.filter((i) => i && i.id && i.name).map((i) => ({
      id: String(i.id),
      name: String(i.name),
      unit: validUnit(s, i.unit),
      category: validCategory(s, i.category),
      frequent: !!i.frequent,
      shortLife: !!i.shortLife,
      multiUse: !!i.multiUse,
      defaultQty: cleanDefault(i.defaultQty),
      frequentBuy: !!i.frequentBuy,
      location: cleanItemLocation(i.location),
      ...cleanPack(s, validUnit(s, i.unit), i.packUnit, i.packSize),
    }));
    const ids = new Set(s.items.map((i) => i.id));
    s.recipes = raw.recipes.filter((r) => r && r.id && r.name).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      url: r.url ? String(r.url) : '',
      serves: Number(r.serves) > 0 ? Number(r.serves) : 1,
      ingredients: (Array.isArray(r.ingredients) ? r.ingredients : [])
        .filter((g) => g && ids.has(g.itemId))
        .map(cleanIngredient),
      instructions: cleanInstructions(r.instructions),
      labels: cleanRecipeLabels(r.labels),
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
        model: Number(raw.week.model) || 1,
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

  function addItem(s, {
    name, unit = 'each', category = 'Other', frequent = false, shortLife = false, multiUse = false,
    defaultQty = 0, frequentBuy = false, location = '', packUnit = '', packSize = 0,
  }) {
    const existing = findItemByName(s, name);
    if (existing) return existing;
    const item = {
      id: uid(), name: String(name).trim(),
      unit: validUnit(s, unit),
      ...cleanPack(s, validUnit(s, unit), packUnit, packSize),
      category: validCategory(s, category),
      frequent: !!frequent, shortLife: !!shortLife, multiUse: !!multiUse,
      defaultQty: cleanDefault(defaultQty),
      frequentBuy: !!frequentBuy,
      location: s.locations.includes(location) ? location : '',
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

  // ---------- Unit conversion (#50) ----------
  //
  // An item has the unit you buy it in (item.unit) and optionally a smaller
  // unit recipes use (item.packUnit) with how many are in one (item.packSize,
  // 0 = not known). Recipes can use any unit that converts to either.

  /** Validated recipe unit + size for an item. */
  function cleanPack(s, itemUnit, packUnit, packSize) {
    const pu = typeof packUnit === 'string' && packUnit !== itemUnit && unitsFor(s).includes(packUnit) ? packUnit : '';
    return { packUnit: pu, packSize: pu ? cleanDefault(packSize) : 0 };
  }

  const unitGroup = (u) => (UNIT_FACTORS[u] ? UNIT_FACTORS[u][0] : null);
  /** The unit plus any it converts to automatically (g → g, kg). */
  const groupUnits = (u) => (unitGroup(u) ? Object.keys(UNIT_FACTORS).filter((x) => unitGroup(x) === unitGroup(u)) : [u]);

  /** Convert between units in the same group; null if they don't convert. */
  function convertUnits(qty, from, to) {
    if (from === to) return qty;
    if (!unitGroup(from) || unitGroup(from) !== unitGroup(to)) return null;
    return (qty * UNIT_FACTORS[from][1]) / UNIT_FACTORS[to][1];
  }

  /** Units a recipe may use for this item. */
  const unitsForItem = (item) => [...new Set([...groupUnits(item.unit), ...(item.packUnit ? groupUnits(item.packUnit) : [])])];

  /**
   * An amount in a recipe's unit, in the item's own unit; null when it can't
   * be worked out (e.g. tsp of a jar of jam with no size given).
   */
  function toItemUnit(item, qty, unit) {
    const u = unit || item.unit;
    const direct = convertUnits(qty, u, item.unit);
    if (direct != null) return round(direct);
    if (item.packUnit && item.packSize > 0) {
      const inPack = convertUnits(qty, u, item.packUnit);
      if (inPack != null) return round(inPack / item.packSize);
    }
    return null;
  }

  /** Units bought in whole numbers: built-in countable units plus custom units marked as such. */
  const isCountUnit = (s, unit) => COUNT_UNITS.has(unit) || s.settings.customUnits.some((u) => u.name === unit && u.count);

  /** Amount to suggest when adding an item: its default, else 1 for countable units, else null. */
  const suggestedQty = (s, item) => (item.defaultQty > 0 ? item.defaultQty : isCountUnit(s, item.unit) ? 1 : null);

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
    return item && isCountUnit(s, item.unit) ? Math.ceil(e.qty - EPS) : round(e.qty);
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
   * Tick or untick a list entry. Ticking puts what was bought into the cupboard;
   * the part bought for planned meals stays set aside for them (multi-use items
   * are simply marked in stock).
   */
  function setBought(s, entryId, done) {
    const e = s.shopping.find((x) => x.id === entryId);
    if (!e || e.done === done) return;
    const item = itemById(s, e.itemId);
    if (done) {
      let added = 0;
      if (item && item.multiUse) added = cupQty(s, e.itemId) > EPS ? 0 : 1;
      else added = buyQty(s, e);
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
   * shortfall on the shopping list. Asks which optional extras to include
   * (answer: list of item ids), then about multi-use and frequently used items.
   * Returns { state, meal, report } or null if cancelled.
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

    // Optional extras (#49): ask once, up front, which to include this time.
    const optionals = recipe.ingredients
      .filter((g) => g.optional && itemById(s, g.itemId))
      .map((g) => ({ item: itemById(s, g.itemId), need: scaleQty(recipe, g.qty, meal.portions), unit: g.unit || itemById(s, g.itemId).unit }));
    let included = new Set();
    if (optionals.length) {
      const chosen = await ask({ kind: 'optional', meal, options: optionals });
      if (chosen == null) return null;
      included = new Set(chosen);
    }

    for (const ing of recipe.ingredients) {
      const item = itemById(s, ing.itemId);
      if (!item) continue;
      const recipeUnit = ing.unit || item.unit;
      const recipeNeed = scaleQty(recipe, ing.qty, meal.portions);
      if (ing.optional && !included.has(item.id)) {
        report.push({ item, need: recipeNeed, unit: recipeUnit, status: 'skipped' });
        continue;
      }

      // Amount in the item's own unit; null when it can't be counted (#50).
      const need = item.multiUse ? null : toItemUnit(item, recipeNeed, recipeUnit);

      // In-stock check instead of counting: multi-use items, and recipe units
      // that don't convert (e.g. tsp of a jar of jam with no size given).
      if (need == null) {
        if (answered.has(item.id)) continue;
        if (unboughtEntry(s, item.id)) {
          answered.set(item.id, true);
          report.push({ item, need: recipeNeed, unit: recipeUnit, status: 'on-list' });
          continue;
        }
        const kind = item.multiUse ? 'multi' : 'unsized';
        const has = await ask({ kind, item, meal, need: recipeNeed, unit: recipeUnit });
        if (has == null) return null;
        answered.set(item.id, has);
        if (has) {
          if (item.multiUse) setCup(s, item.id, 1);
          else if (cupQty(s, item.id) <= EPS) setCup(s, item.id, 1);
          report.push({ item, need: recipeNeed, unit: recipeUnit, status: 'have' });
        } else {
          setCup(s, item.id, 0);
          addToShopping(s, item.id, 1, 0);
          report.push({ item, need: recipeNeed, unit: recipeUnit, status: 'buy', toShop: 1, inStockCheck: true });
        }
        continue;
      }

      // Only what isn't already set aside for other planned meals is free to use.
      let avail = available(s, item.id);
      if (item.frequent && avail > EPS && !answered.has(item.id)) {
        const has = await ask({ kind: 'frequent', item, meal, need, qty: avail });
        if (has == null) return null;
        answered.set(item.id, has);
        if (!has) {
          setCup(s, item.id, cupQty(s, item.id) - avail); // the free amount has gone
          avail = 0;
        }
      }
      // Set aside, not removed: it stays in the cupboard until the meal is cooked (#51).
      const take = round(Math.min(avail, need));
      const short = round(need - take);
      if (short > EPS) addToShopping(s, item.id, short, short);
      meal.alloc.push({ itemId: item.id, need, fromCupboard: take, toShop: short });
      report.push({ item, need, unit: item.unit, fromCupboard: take, toShop: short, status: short > EPS ? 'buy' : 'cupboard' });
    }

    s.week.meals.push(meal);
    return { state: s, meal, report };
  }

  /** How much of an allocation is in hand (set aside from the cupboard, or bought). */
  function heldFor(s, a) {
    const e = unboughtEntry(s, a.itemId);
    const stillToBuy = Math.min(a.toShop, e ? e.reserved : 0);
    return round(a.fromCupboard + (a.toShop - stillToBuy));
  }

  /** Amount of an item in the cupboard that's set aside for this week's planned meals. */
  const setAsideFor = (s, itemId) => round(s.week.meals.reduce(
    (t, m) => t + m.alloc.filter((a) => a.itemId === itemId).reduce((u, a) => u + heldFor(s, a), 0), 0));

  /** What's in the cupboard and not set aside for a planned meal. */
  const available = (s, itemId) => Math.max(0, round(cupQty(s, itemId) - setAsideFor(s, itemId)));

  /** A meal that won't be cooked: its ingredients stay in the cupboard; anything not yet bought comes off the list. */
  function releaseMeal(s, meal) {
    for (const a of meal.alloc) if (a.toShop > EPS) unreserve(s, a.itemId, a.toShop);
  }

  /** A cooked meal: use up what was set aside for it, and drop anything still on the list for it. */
  function consumeMeal(s, meal) {
    for (const a of meal.alloc) {
      const used = heldFor(s, a);
      if (a.toShop > EPS) unreserve(s, a.itemId, a.toShop);
      if (used > EPS) setCup(s, a.itemId, cupQty(s, a.itemId) - used);
    }
  }

  /** Take a meal off the plan. If it's marked cooked its ingredients are used up; otherwise they stay. */
  function removeMeal(state, mealId) {
    const s = clone(state);
    const meal = s.week.meals.find((m) => m.id === mealId);
    if (!meal) return s;
    if (meal.cooked) consumeMeal(s, meal);
    else releaseMeal(s, meal);
    s.week.meals = s.week.meals.filter((m) => m !== meal);
    return s;
  }

  /** Data saved before #51 already had planned meals' ingredients removed from the cupboard. */
  const needsMigration = (s) => !(s.week.model >= MODEL);

  /** Put those ingredients back once, so they're used up when the meal is cooked rather than twice. */
  function migrate(state) {
    const s = clone(state);
    for (const m of s.week.meals) {
      for (const a of m.alloc) {
        const held = heldFor(s, a);
        if (held > EPS) setCup(s, a.itemId, cupQty(s, a.itemId) + held);
      }
    }
    s.week.model = MODEL;
    return s;
  }

  function setCooked(s, mealId, cooked) {
    const meal = s.week.meals.find((m) => m.id === mealId);
    if (meal) meal.cooked = !!cooked;
  }

  /**
   * Close the current week and start a new one:
   *  1. ask about every meal not already ticked as cooked: cooked / carry over / drop
   *  2. cooked meals use up their ingredients from the cupboard (#51); dropped
   *     meals release theirs (they stay in the cupboard, unbought ones come off the list)
   *  3. for carried-over meals, check short-life ingredients are still in date
   *  4. check every other short-life item in the cupboard that no cooked meal used
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
      else dropped.push(meal);
    }

    for (const meal of cooked) consumeMeal(s, meal);
    for (const meal of dropped) releaseMeal(s, meal);
    s.week.meals = carried; // what's still planned (and still set aside)

    const used = new Set(cooked.flatMap((m) => m.alloc.filter((a) => a.need > EPS).map((a) => a.itemId)));
    const checked = new Set();

    for (const meal of carried) {
      for (const a of meal.alloc) {
        const item = itemById(s, a.itemId);
        if (!item || !item.shortLife) continue;
        const held = heldFor(s, a);
        if (held <= EPS) continue;
        checked.add(item.id);
        const ok = await ask({ kind: 'shortlife-meal', item, meal, qty: held });
        if (ok == null) return null;
        if (!ok) {
          // Throw out what was held for the meal and buy it again.
          setCup(s, item.id, cupQty(s, item.id) - held);
          const stillToBuy = round(a.toShop - (held - a.fromCupboard));
          addToShopping(s, item.id, held, held);
          a.toShop = round(stillToBuy + held);
          a.fromCupboard = 0;
          binned.push(item.name);
        }
      }
    }

    const toCheck = Object.keys(s.cupboard)
      .map((id) => itemById(s, id))
      .filter((item) => item && item.shortLife && !used.has(item.id) && !checked.has(item.id) && available(s, item.id) > EPS)
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const item of toCheck) {
      const qty = available(s, item.id);
      const ok = await ask({ kind: 'shortlife', item, qty });
      if (ok == null) return null;
      if (!ok) {
        setCup(s, item.id, cupQty(s, item.id) - qty);
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
   * Go through cupboard items and confirm they're still there. Pass { location }
   * to sweep just one location ('' = items with no location set).
   * ask() answers: { action: 'keep', qty? } | { action: 'gone', addToList } | null (stop, keep progress).
   */
  async function sweep(state, ask, { location } = {}) {
    const s = clone(state);
    const items = Object.keys(s.cupboard)
      .map((id) => itemById(s, id))
      .filter((item) => item && (location === undefined || item.location === location))
      .sort((a, b) => categoriesFor(s).indexOf(a.category) - categoriesFor(s).indexOf(b.category) || a.name.localeCompare(b.name));
    let reviewed = 0;
    let removed = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const qty = cupQty(s, item.id);
      const ans = await ask({ kind: 'sweep', item, qty, setAside: setAsideFor(s, item.id), index: i, total: items.length });
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
      chicken: add('Chicken breast', 'g', 'Meat & fish', { shortLife: true, defaultQty: 500 }),
      mince: add('Beef mince', 'g', 'Meat & fish', { shortLife: true, defaultQty: 500 }),
      onion: add('Onion', 'each', 'Fruit & veg'),
      garlic: add('Garlic', 'clove', 'Fruit & veg'),
      spinach: add('Spinach', 'g', 'Fruit & veg', { shortLife: true, defaultQty: 200 }),
      tomatoes: add('Chopped tomatoes', 'tin', 'Cupboard'),
      coconut: add('Coconut milk', 'tin', 'Cupboard'),
      rice: add('Basmati rice', 'g', 'Cupboard', { defaultQty: 500 }),
      pasta: add('Spaghetti', 'g', 'Cupboard', { defaultQty: 500 }),
      flour: add('Plain flour', 'g', 'Cupboard', { defaultQty: 1500 }),
      milk: add('Milk', 'ml', 'Dairy & eggs', { frequent: true, defaultQty: 2272, frequentBuy: true }),
      eggs: add('Eggs', 'each', 'Dairy & eggs', { frequent: true, defaultQty: 6, frequentBuy: true }),
      butter: add('Butter', 'g', 'Dairy & eggs', { frequent: true, defaultQty: 250, frequentBuy: true }),
      cheddar: add('Cheddar', 'g', 'Dairy & eggs', { defaultQty: 400 }),
      cumin: add('Ground cumin', 'tsp', 'Herbs & spices', { multiUse: true }),
      paprika: add('Paprika', 'tsp', 'Herbs & spices', { multiUse: true }),
      oil: add('Olive oil', 'tbsp', 'Cupboard', { multiUse: true }),
      kitchenRoll: add('Kitchen roll', 'pack', 'Household', { frequentBuy: true }),
      bread: add('Bread', 'loaf', 'Bakery', { frequentBuy: true, packUnit: 'slice', packSize: 20 }),
      jam: add('Strawberry jam', 'jar', 'Cupboard', { packUnit: 'tsp' }),
    };
    const where = {
      Fridge: [i.chicken, i.mince, i.spinach, i.milk, i.eggs, i.butter, i.cheddar],
      Pantry: [i.onion, i.garlic, i.tomatoes, i.coconut, i.rice, i.pasta, i.flour, i.bread, i.jam],
      'Tall cupboard': [i.cumin, i.paprika, i.oil, i.kitchenRoll],
    };
    for (const [loc, list] of Object.entries(where)) for (const itemId of list) itemById(s, itemId).location = loc;
    const recipe = (name, serves, labels, list, instructions = '') => s.recipes.push({
      id: uid(), name, url: '', serves, instructions, labels,
      ingredients: list.map(([itemId, qty, opt, unit]) => ({ itemId, qty, optional: opt === 'optional', unit: unit || '' })),
    });
    recipe('Chicken curry', 4, ['Gas Hob'], [[i.chicken, 500], [i.onion, 1], [i.garlic, 3], [i.tomatoes, 1], [i.coconut, 1],
      [i.cumin, 2], [i.paprika, 1], [i.oil, 1], [i.spinach, 100, 'optional'], [i.rice, 300]]);
    recipe('Spaghetti bolognese', 4, ['Simple', 'Gas Hob'], [[i.mince, 500], [i.onion, 1], [i.garlic, 2], [i.tomatoes, 2], [i.pasta, 400],
      [i.oil, 1], [i.cheddar, 50, 'optional']]);
    recipe('Cheese on toast', 1, ['Fast', 'Oven'], [[i.bread, 2, '', 'slice'], [i.cheddar, 40], [i.butter, 10]]);
    recipe('Pancakes', 2, ['Simple', 'Fast', 'Gas Hob'], [[i.flour, 100], [i.eggs, 2], [i.milk, 300], [i.butter, 20], [i.jam, 1, 'optional', 'tbsp']],
      '1. Whisk the flour, eggs and milk into a smooth batter. Rest for 10 minutes.\n'
      + '2. Melt a little butter in a frying pan over a medium heat.\n'
      + '3. Pour in a thin layer of batter, cook for about a minute, flip and cook the other side.\n'
      + '4. Repeat with the rest of the batter.');
    Object.assign(s.cupboard, {
      [i.rice]: 1000, [i.pasta]: 500, [i.onion]: 3, [i.garlic]: 6, [i.tomatoes]: 2, [i.flour]: 1000,
      [i.milk]: 1000, [i.eggs]: 6, [i.butter]: 250, [i.cumin]: 1, [i.paprika]: 1, [i.oil]: 1, [i.chicken]: 500,
      [i.bread]: 1, [i.jam]: 1,
    });
    return s;
  }

  // ---------- Sync documents ----------
  //
  // For sharing, state is stored as one small document per entity so that two
  // people editing different things never overwrite each other. Paths:
  //   items/{id}  recipes/{id}  shopping/{id}  cupboard/{itemId}  meals/{id}
  //   meta/week  meta/settings  meta/labels  meta/locations

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
    d.set('meta/week', { id: s.week.id, start: s.week.start, model: s.week.model || MODEL, lastWeek: s.lastWeek ? clone(s.lastWeek) : null });
    d.set('meta/settings', clone(s.settings));
    // Separate from settings so an older app version saving settings can't drop the labels.
    d.set('meta/labels', { labels: [...s.labels] });
    d.set('meta/locations', { locations: [...s.locations] });
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
          // Lenient: a custom unit/category can arrive a moment before the settings doc.
          id, name: String(data.name || ''),
          unit: typeof data.unit === 'string' && data.unit ? data.unit : 'each',
          category: typeof data.category === 'string' && data.category ? data.category : FALLBACK_CATEGORY,
          frequent: !!data.frequent, shortLife: !!data.shortLife, multiUse: !!data.multiUse,
          defaultQty: cleanDefault(data.defaultQty),
          frequentBuy: !!data.frequentBuy,
          location: cleanItemLocation(data.location),
          packUnit: typeof data.packUnit === 'string' ? data.packUnit : '',
          packSize: cleanDefault(data.packSize),
        });
      } else if (coll === 'recipes') {
        s.recipes.push({
          id, name: String(data.name || ''), url: data.url || '', serves: Number(data.serves) > 0 ? Number(data.serves) : 1,
          ingredients: (Array.isArray(data.ingredients) ? data.ingredients : []).filter(Boolean).map(cleanIngredient),
          instructions: cleanInstructions(data.instructions),
          labels: cleanRecipeLabels(data.labels),
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
      } else if (coll === 'meta' && id === 'settings') {
        s.settings = cleanSettings(data);
      } else if (coll === 'meta' && id === 'labels') {
        s.labels = cleanLabels(data.labels);
      } else if (coll === 'meta' && id === 'locations') {
        s.locations = cleanLocations(data.locations);
      }
    }
    s.week.meals.sort((a, b) => a.at - b.at);
    if (meta) {
      s.week.id = meta.id || s.week.id;
      s.week.start = meta.start || s.week.start;
      s.week.model = Number(meta.model) || 1;
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
    UNITS, CATEGORIES, FALLBACK_CATEGORY, MAX_UNIT_NAME, MAX_CATEGORY_NAME, EPS, MAX_INSTRUCTIONS, uid,
    unitsFor, categoriesFor, addUnit, removeUnit, unitUsage,
    addCategory, renameCategory, removeCategory, moveCategory, categoryUsage,
    DEFAULT_LABELS, MAX_LABEL_NAME, addLabel, renameLabel, removeLabel, labelUsage, recipesWithLabels,
    DEFAULT_LOCATIONS, MAX_LOCATION_NAME, addLocation, renameLocation, removeLocation, locationUsage, round, today, emptyState, normalise, sampleState,
    itemById, findItemByName, addItem, itemUsage, deleteItem, isCountUnit, suggestedQty,
    convertUnits, unitsForItem, toItemUnit, groupUnits,
    cupQty, setCup,
    addToShopping, buyQty, setBought, clearBought, clearShopping, unreserve,
    scaleQty, planMeal, removeMeal, setCooked, startNewWeek, sweep, heldFor,
    setAsideFor, available, needsMigration, migrate, MODEL,
    SYNC_COLLECTIONS, toDocs, fromDocs, diffDocs, applyDocChanges,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StroppingLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
