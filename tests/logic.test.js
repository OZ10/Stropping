// Tests for logic.js (stock rules, sync documents, settings). Run: node tests/logic.test.js
const assert = require('assert').strict;
const path = require('path');
const L = require(path.join(__dirname, '..', 'logic.js'));

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const id = (s, name) => L.findItemByName(s, name).id;
const recipe = (s, name) => s.recipes.find((r) => r.name === name).id;
const list = (s, name) => s.shopping.find((e) => e.itemId === id(s, name));
const scripted = (answers) => async (q) => {
  const key = `${q.kind}:${q.item ? q.item.name : q.meal.name}`;
  if (!(key in answers)) throw new Error(`Unexpected question ${key}`);
  return answers[key];
};
const yes = async () => true;

// ---------- Planning, shopping, weekly review ----------

test('plan a scaled meal: cupboard first, shortfall to the list, multi-use asked', async () => {
  let t = L.sampleState();
  t = (await L.planMeal(t, recipe(t, 'Chicken curry'), 6, scripted({
    'multi:Ground cumin': true, 'multi:Paprika': false, 'multi:Olive oil': true,
  }))).state;
  assert.equal(L.cupQty(t, id(t, 'Chicken breast')), 0);
  assert.equal(list(t, 'Chicken breast').qty, 250);
  assert.equal(list(t, 'Chicken breast').reserved, 250);
  assert.equal(L.cupQty(t, id(t, 'Onion')), 1.5);
  assert.equal(L.cupQty(t, id(t, 'Chopped tomatoes')), 0.5);
  assert.equal(list(t, 'Coconut milk').qty, 1.5);
  assert.equal(L.buyQty(t, list(t, 'Coconut milk')), 2, 'tins rounded up to buy');
  assert.equal(list(t, 'Paprika').qty, 1);
  assert.equal(list(t, 'Paprika').reserved, 0);
  assert.equal(list(t, 'Ground cumin'), undefined);
  assert.equal(L.cupQty(t, id(t, 'Basmati rice')), 550);
  assert.equal(t.week.meals.length, 1);
});

test('frequently used items are double-checked; cancelling changes nothing', async () => {
  let s = L.sampleState();
  s = (await L.planMeal(s, recipe(s, 'Pancakes'), 2, scripted({
    'frequent:Milk': false, 'frequent:Eggs': true, 'frequent:Butter': true,
  }))).state;
  assert.equal(L.cupQty(s, id(s, 'Milk')), 0);
  assert.equal(list(s, 'Milk').qty, 300);
  assert.equal(L.cupQty(s, id(s, 'Eggs')), 4);
  const before = JSON.stringify(s);
  assert.equal(await L.planMeal(s, recipe(s, 'Pancakes'), 2, async () => null), null);
  assert.equal(JSON.stringify(s), before);
});

test('ticking puts the surplus in the cupboard; unticking reverses it', async () => {
  let s = L.sampleState();
  s = (await L.planMeal(s, recipe(s, 'Chicken curry'), 6, scripted({
    'multi:Ground cumin': true, 'multi:Paprika': false, 'multi:Olive oil': true,
  }))).state;
  L.setBought(s, list(s, 'Coconut milk').id, true);
  assert.equal(L.cupQty(s, id(s, 'Coconut milk')), 0.5);
  L.setBought(s, list(s, 'Paprika').id, true);
  assert.equal(L.cupQty(s, id(s, 'Paprika')), 1);
  L.setBought(s, list(s, 'Paprika').id, false);
  assert.equal(L.cupQty(s, id(s, 'Paprika')), 0);
  L.setBought(s, list(s, 'Chicken breast').id, true);
  assert.equal(L.cupQty(s, id(s, 'Chicken breast')), 0, 'bought chicken is reserved for the curry');
});

test('new week: dropped meals return ingredients, short-life items get checked', async () => {
  let s = L.sampleState();
  s = (await L.planMeal(s, recipe(s, 'Chicken curry'), 6, scripted({
    'multi:Ground cumin': true, 'multi:Paprika': false, 'multi:Olive oil': true,
  }))).state;
  s = (await L.planMeal(s, recipe(s, 'Pancakes'), 2, scripted({
    'frequent:Milk': false, 'frequent:Eggs': true, 'frequent:Butter': true,
  }))).state;
  L.setBought(s, list(s, 'Coconut milk').id, true);
  L.setBought(s, list(s, 'Chicken breast').id, true);
  L.clearBought(s);
  const asked = [];
  const r = await L.startNewWeek(s, async (q) => {
    asked.push(`${q.kind}:${q.item ? q.item.name : q.meal.name}`);
    if (q.kind === 'cooked') return q.meal.name === 'Pancakes' ? 'cooked' : 'drop';
    if (q.kind === 'shortlife') return q.item.name !== 'Chicken breast';
    throw new Error(`unexpected ${q.kind}`);
  });
  s = r.state;
  assert.deepEqual(asked, ['cooked:Chicken curry', 'cooked:Pancakes', 'shortlife:Chicken breast']);
  assert.equal(L.cupQty(s, id(s, 'Chicken breast')), 0, 'binned');
  assert.equal(L.cupQty(s, id(s, 'Onion')), 3, 'onions returned');
  assert.equal(L.cupQty(s, id(s, 'Coconut milk')), 2, '0.5 surplus + 1.5 returned');
  assert.equal(list(s, 'Spinach'), undefined, 'unbought spinach for the dropped meal is off the list');
  assert.equal(s.week.meals.length, 0);
  assert.deepEqual(r.summary.cooked, ['Pancakes']);
});

test('carried-over meals: out-of-date short-life items go back on the list', async () => {
  let s = L.sampleState();
  s = (await L.planMeal(s, recipe(s, 'Spaghetti bolognese'), 4, yes)).state;
  L.setBought(s, list(s, 'Beef mince').id, true);
  L.clearBought(s);
  const r = await L.startNewWeek(s, async (q) => {
    if (q.kind === 'cooked') return 'carry';
    if (q.kind === 'shortlife-meal') { assert.equal(q.qty, 500); return false; }
    return true;
  });
  s = r.state;
  assert.equal(s.week.meals.length, 1);
  assert.equal(list(s, 'Beef mince').reserved, 500);
  const pasta = L.cupQty(s, id(s, 'Spaghetti'));
  s = L.removeMeal(s, s.week.meals[0].id);
  assert.equal(list(s, 'Beef mince'), undefined);
  assert.equal(L.cupQty(s, id(s, 'Spaghetti')), pasta + 400);
});

test('sweep: gone / add to list / change amount / stop keeps progress', async () => {
  const s = L.sampleState();
  let n = 0;
  const r = await L.sweep(s, async (q) => {
    if (++n > 3) return null;
    if (q.item.name === 'Basmati rice') return { action: 'gone', addToList: true };
    if (q.item.name === 'Onion') return { action: 'keep', qty: 1 };
    return { action: 'keep' };
  });
  assert.equal(r.reviewed, 3);
  assert.ok(r.total > 3);
});

test('#40 clear list: a later-dropped meal treats its shortfall as in hand', async () => {
  let c = L.sampleState();
  c = (await L.planMeal(c, recipe(c, 'Chicken curry'), 6, yes)).state;
  L.addToShopping(c, id(c, 'Kitchen roll'), 2);
  L.clearShopping(c);
  assert.equal(c.shopping.length, 0);
  c = L.removeMeal(c, c.week.meals[0].id);
  assert.equal(L.cupQty(c, id(c, 'Chicken breast')), 750, '500 from cupboard + 250 assumed in hand');
});

test('#43 default amounts', () => {
  const c = L.sampleState();
  assert.equal(L.suggestedQty(c, L.findItemByName(c, 'Basmati rice')), 500);
  assert.equal(L.suggestedQty(c, L.findItemByName(c, 'Onion')), 1, 'countable without default → 1');
  assert.equal(L.suggestedQty(c, L.findItemByName(c, 'Ground cumin')), null, 'tsp without default → none');
  assert.equal(L.normalise({ items: [{ id: 'a', name: 'X', defaultQty: -3 }], recipes: [] }).items[0].defaultQty, 0);
  assert.equal(L.fromDocs(L.toDocs(c)).items.find((i) => i.name === 'Basmati rice').defaultQty, 500);
});

// ---------- Storage and sync documents ----------

test('normalise round trip; junk rejected', () => {
  const s = L.sampleState();
  assert.deepEqual(L.normalise(JSON.parse(JSON.stringify(s))), s);
  assert.throws(() => L.normalise({ foo: 1 }));
});

test('sync documents round trip without spurious diffs; meal order kept', async () => {
  let p = L.sampleState();
  p = (await L.planMeal(p, recipe(p, 'Pancakes'), 2, yes)).state;
  p = (await L.planMeal(p, recipe(p, 'Chicken curry'), 4, yes)).state;
  const rt = L.fromDocs(L.toDocs(p));
  assert.deepEqual(rt, p);
  assert.deepEqual(rt.week.meals.map((m) => m.name), ['Pancakes', 'Chicken curry']);
  const d = L.diffDocs(L.toDocs(p), L.toDocs(rt));
  assert.equal(d.set.length + d.del.length, 0);
});

test('two devices editing at once merge without losing either change', async () => {
  let p = L.sampleState();
  p = (await L.planMeal(p, recipe(p, 'Chicken curry'), 4, yes)).state;
  const server = L.toDocs(p);
  const devA = L.fromDocs(server);
  const devB = L.fromDocs(server);
  const baseA = JSON.parse(JSON.stringify(devA));
  L.setBought(devA, devA.shopping.find((e) => e.itemId === id(devA, 'Coconut milk')).id, true);
  const baseB = JSON.parse(JSON.stringify(devB));
  L.addItem(devB, { name: 'Bin bags', unit: 'pack', category: 'Household' });
  L.addToShopping(devB, id(devB, 'Bin bags'), 1);
  const chA = L.diffDocs(L.toDocs(baseA), L.toDocs(devA));
  const chB = L.diffDocs(L.toDocs(baseB), L.toDocs(devB));
  assert.deepEqual(chA.set.map(([k]) => k.split('/')[0]), ['shopping'], 'A writes only the list entry');
  assert.deepEqual(chB.set.map(([k]) => k.split('/')[0]).sort(), ['items', 'shopping']);
  for (const [k, v] of [...chA.set, ...chB.set]) server.set(k, v);
  const merged = L.fromDocs(server);
  assert.ok(merged.shopping.find((e) => e.itemId === id(merged, 'Coconut milk')).done);
  assert.ok(merged.shopping.find((e) => e.itemId === id(merged, 'Bin bags')));
});

test('a flow started on an old base applies onto newer state', async () => {
  const server = L.toDocs(L.sampleState());
  const base = L.fromDocs(server);
  const flow = await L.planMeal(base, recipe(base, 'Spaghetti bolognese'), 4, yes);
  const current = L.fromDocs(server);
  L.addToShopping(current, id(current, 'Eggs'), 6);
  const out = L.applyDocChanges(current, L.diffDocs(L.toDocs(base), L.toDocs(flow.state)));
  assert.ok(out.shopping.find((e) => e.itemId === id(out, 'Eggs')), 'remote change survives');
  assert.ok(out.week.meals.some((m) => m.name === 'Spaghetti bolognese'));
});

test('a recipe arriving before its items keeps its ingredients', () => {
  const p = L.sampleState();
  const partial = new Map([...L.toDocs(p)].filter(([k]) => !k.startsWith('items/')));
  assert.ok(L.fromDocs(partial).recipes[0].ingredients.length > 0);
});

// ---------- Settings: units (#42), categories (#39), labels (#45) ----------

test('#42 custom units: rounding, validation, removal', () => {
  const u = L.sampleState();
  assert.ok(L.unitsFor(u).includes('pint'));
  L.addUnit(u, 'punnet', true);
  L.addUnit(u, 'oz', false);
  assert.throws(() => L.addUnit(u, 'Punnet', true), /already/);
  assert.throws(() => L.addUnit(u, 'G', false), /already/);
  assert.throws(() => L.addUnit(u, ' ', false), /Enter/);
  const straw = L.addItem(u, { name: 'Strawberries', unit: 'punnet', category: 'Fruit & veg' });
  assert.equal(L.suggestedQty(u, straw), 1);
  assert.equal(L.buyQty(u, L.addToShopping(u, straw.id, 1.5)), 2, 'whole-number unit rounds up');
  const cheese = L.addItem(u, { name: 'Parmesan', unit: 'oz' });
  assert.equal(L.buyQty(u, L.addToShopping(u, cheese.id, 1.5)), 1.5, 'measured unit not rounded');
  assert.throws(() => L.removeUnit(u, 'punnet'), /used by Strawberries/);
  assert.equal(L.addItem(u, { name: 'Bad', unit: 'furlong' }).unit, 'each');
});

test('#39 categories: add, rename, delete, reorder, persist', () => {
  const u = L.sampleState();
  L.addCategory(u, 'Baby');
  const cats = L.categoriesFor(u);
  assert.equal(cats[cats.length - 1], 'Other');
  assert.equal(cats[cats.length - 2], 'Baby');
  assert.throws(() => L.addCategory(u, 'bakery'), /already/);
  L.renameCategory(u, 'Fruit & veg', 'Produce');
  assert.equal(L.findItemByName(u, 'Onion').category, 'Produce');
  assert.throws(() => L.renameCategory(u, 'Other', 'Misc'), /can’t be renamed/);
  L.renameCategory(u, 'Produce', 'produce');
  L.removeCategory(u, 'Household');
  assert.equal(L.findItemByName(u, 'Kitchen roll').category, 'Other');
  assert.throws(() => L.removeCategory(u, 'Other'), /can’t be deleted/);
  L.moveCategory(u, 'Frozen', -1);
  const ci = L.categoriesFor(u);
  assert.ok(ci.indexOf('Frozen') < ci.indexOf('Herbs & spices'));
  assert.deepEqual(L.normalise(JSON.parse(JSON.stringify(u))).settings, u.settings);
  assert.deepEqual(L.fromDocs(L.toDocs(u)).settings, u.settings);
  assert.deepEqual(L.normalise({ items: [], recipes: [] }).settings.categories, L.CATEGORIES);
  const junk = L.normalise({ items: [], recipes: [], settings: { customUnits: [{ name: 'g' }, { name: ' bag ' }, { name: 'BAG' }, 5], categories: ['A', 'a', '', 'B'] } });
  assert.deepEqual(junk.settings.customUnits, [{ name: 'bag', count: false }]);
  assert.deepEqual(junk.settings.categories, ['A', 'B', 'Other']);
});

test('#45 labels: filter, rename/delete cascade, own sync doc', () => {
  const lb = L.sampleState();
  const names = (rs) => rs.map((r) => r.name).sort();
  assert.deepEqual(lb.labels, L.DEFAULT_LABELS);
  assert.deepEqual(names(L.recipesWithLabels(lb, ['Simple', 'Fast'])), ['Pancakes']);
  L.addLabel(lb, 'Vegetarian');
  assert.throws(() => L.addLabel(lb, 'fast'), /already a label/);
  L.renameLabel(lb, 'Gas Hob', 'Hob');
  assert.equal(L.labelUsage(lb, 'Hob').length, 3);
  L.removeLabel(lb, 'Simple');
  assert.ok(!lb.recipes.some((r) => r.labels.includes('Simple')));
  const docs = L.toDocs(lb);
  assert.deepEqual(docs.get('meta/labels'), { labels: lb.labels });
  assert.ok(!('labels' in docs.get('meta/settings')));
  assert.deepEqual(L.fromDocs(new Map([...docs].filter(([k]) => k !== 'meta/labels'))).labels, L.DEFAULT_LABELS);
  const rl = L.normalise({ items: [], recipes: [{ id: 'r', name: 'R', labels: [' Fast ', 'fast', '', 7, 'Oven'] }] }).recipes[0].labels;
  assert.deepEqual(rl, ['Fast', '7', 'Oven']);
});

module.exports = { test, tests, L, id, recipe, list, yes };

// Run when called directly (other test files can add tests before running).
if (require.main === module) run();

async function run() {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`  ✓ ${t.name}`);
    } catch (err) {
      failed++;
      console.log(`  ✗ ${t.name}\n    ${err.stack.split('\n').slice(0, 3).join('\n    ')}`);
    }
  }
  console.log(failed ? `\n${failed} of ${tests.length} logic tests FAILED` : `\nAll ${tests.length} logic tests passed`);
  if (failed) process.exitCode = 1;
}
module.exports.run = run;
