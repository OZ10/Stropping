// Browser tests for the app on one device (sharing switched off).
const { assert, sleep, startServer, launch, newPage, helpers, steps, LOCAL_ONLY } = require('./harness');

module.exports = async function appTests() {
  const server = await startServer(8771, { '/firebase-config.js': LOCAL_ONLY, '/sw.js': null });
  const browser = await launch();
  const page = await newPage(browser, { ignoreErrors: [/404/] });
  const h = helpers(page, 'app');
  const visibleRows = () => page.$$eval('#view li[data-search-text]:not([hidden]) .title', (ts) => ts.map((t) => t.textContent));

  const ok = await steps('App (one device)', [
    ['loads with sample data', async () => {
      await page.goto('http://localhost:8771/');
      await h.click('main button', 'Try sample data');
      const s = await h.state();
      assert.equal(s.recipes.length, 3);
      return `${s.items.length} items`;
    }],

    ['plans a meal: cupboard first, rest to the list', async () => {
      await h.click('main button', 'Add meal');
      await page.select('#sheet select[name=recipe]', await page.$eval('#sheet select[name=recipe]', (sel) => [...sel.options].find((o) => o.text === 'Chicken curry').value));
      await h.setValue('#sheet input[name=portions]', 6);
      await h.click('#sheet button', 'Add to week');
      for (let i = 0; i < 10; i++) {
        const t = await h.promptTitle();
        if (/ added$/.test(t)) break;
        await h.answer(t.includes('Paprika') ? 'No, add to list' : 'Yes');
      }
      await h.shot('plan-summary');
      await h.answer('Shopping list');
      const s = await h.state();
      const chicken = s.items.find((i) => i.name === 'Chicken breast');
      assert.equal(s.shopping.find((e) => e.itemId === chicken.id).qty, 250);
    }],

    ['new week: drop the meal, bin the chicken', async () => {
      await h.tab('Week');
      await h.click('main button', 'Start a new week');
      await h.answer('Start');
      for (let i = 0; i < 10; i++) {
        const t = await h.promptTitle();
        if (t.includes('New week started')) break;
        if (t.includes('Did you cook')) await h.answer('Not cooked, drop it');
        else if (t.includes('in date')) await h.answer('No, throw it out');
        else throw new Error(`unexpected prompt ${t}`);
      }
      await h.answer('Done');
      const s = await h.state();
      assert.equal(s.week.meals.length, 0);
      assert.deepEqual(s.lastWeek.dropped, ['Chicken curry']);
    }],

    ['#40 clear the whole shopping list', async () => {
      await h.click('main button', 'Add meal');
      await h.click('#sheet button', 'Add to week');
      await h.answerPlanning();
      await h.tab('Shopping');
      await h.click('main button', 'Clear list');
      await h.answer('Clear list');
      assert.equal((await h.state()).shopping.length, 0);
    }],

    ['#41 recipe instructions saved and shown', async () => {
      await h.tab('Recipes');
      await h.click('main button', 'Pancakes');
      await h.click('#sheet button', 'Edit');
      const text = `Step one.\n\nStep two ${'x'.repeat(300)}\nStep three.`;
      await page.$eval('#sheet textarea[name=instructions]', (t, v) => { t.value = v; }, text);
      await h.click('#sheet button', 'Save recipe');
      await h.click('main button', 'Pancakes');
      assert.equal(await page.$eval('#sheet .method-text', (e) => e.textContent), text);
      assert.equal(await page.$eval('#sheet .sheet-body', (e) => e.scrollWidth > e.clientWidth), false, 'no sideways scroll');
      await page.keyboard.press('Escape');
      await sleep(200);
    }],

    ['#43 default amounts pre-fill', async () => {
      await h.tab('Items');
      await h.click('main button', 'Kitchen roll');
      await h.setValue('#sheet input[name=defaultQty]', 4);
      await h.click('#sheet button', 'Save');
      await h.clickSel('li[data-search-text="kitchen roll"] [data-act=item-to-list]');
      assert.equal(await page.$eval('#prompt input[name=v]', (i) => i.value), '4');
      await h.answer('Add');
      await h.tab('Shopping');
      await h.click('main button', '+ Add');
      await page.type('#sheet input[name=item]', 'Basmati rice');
      assert.equal(await page.$eval('#sheet input[name=qty]', (i) => i.value), '500');
      await page.keyboard.press('Escape');
      await sleep(200);
    }],

    ['#44 frequently bought shortcuts', async () => {
      await h.tab('Shopping');
      await h.click('main button', '+ Add');
      assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.name), undefined, 'keyboard not opened over shortcuts');
      await h.click('#sheet [data-quick]', 'Milk');
      await h.shot('quick-picks');
      const s = await h.state();
      const milk = s.items.find((i) => i.name === 'Milk');
      assert.equal(s.shopping.find((e) => e.itemId === milk.id).qty, 2272);
      assert.ok((await h.texts('#sheet .chip.is-on')).some((t) => t.includes('Milk')));
      await h.click('#sheet button', 'Done');
    }],

    ['#39/#42 categories and units', async () => {
      await h.tab('Items');
      await h.click('main button', 'Units & categories');
      await page.type('#sheet [data-list="categories"] [data-new-entry]', 'Baby');
      await page.keyboard.press('Enter');
      await sleep(200);
      await h.clickSel('#sheet [data-entry="Bakery"] [data-entry-act="rename"]');
      await h.setValue('#prompt input[name=v]', 'Bread & cakes');
      await h.answer('Rename');
      await h.clickSel('#sheet [data-entry="Drinks"] [data-entry-act="delete"]');
      await h.answer('Delete');
      await page.type('#sheet [data-new-unit]', 'punnet');
      await h.clickSel('#sheet [data-new-unit-count]');
      await h.clickSel('#sheet [data-add-unit]');
      await h.shot('units-categories');
      const s = await h.state();
      assert.deepEqual(s.settings.customUnits, [{ name: 'punnet', count: true }]);
      assert.ok(s.settings.categories.includes('Bread & cakes') && !s.settings.categories.includes('Drinks'));
      assert.equal(s.items.find((i) => i.name === 'Bread').category, 'Bread & cakes');
      await h.click('#sheet button', 'Done');
      await h.click('main button', '+ New item');
      await page.type('#sheet input[name=name]', 'Strawberries');
      await page.select('#sheet select[name=unit]', 'punnet');
      await page.select('#sheet select[name=category]', 'Baby');
      await h.click('#sheet button', 'Save');
      await h.tab('Shopping');
      await h.click('main button', '+ Add');
      await page.type('#sheet input[name=item]', 'Strawberries');
      await h.setValue('#sheet input[name=qty]', 1.5);
      await h.clickSel('#sheet .sheet-actions .btn.primary');
      const row = await page.evaluate(() => [...document.querySelectorAll('li.shop')].find((li) => li.textContent.includes('Strawberries')).textContent.replace(/\s+/g, ' '));
      assert.match(row, /2 punnet/);
    }],

    ['#45 labels: filter, manage, tag, add-meal filter', async () => {
      const titles = () => h.texts('main .card.recipe .title');
      await h.tab('Recipes');
      await h.click('main .chip', 'Fast');
      await h.click('main .chip', 'Simple');
      assert.deepEqual(await titles(), ['Pancakes']);
      await page.reload();
      await sleep(300);
      assert.deepEqual(await titles(), ['Pancakes'], 'filter remembered');
      await h.click('main .chip', 'Clear');
      await h.click('main button', 'Labels');
      await page.type('#sheet [data-new-entry]', 'Vegetarian');
      await page.keyboard.press('Enter');
      await sleep(200);
      await h.clickSel('#sheet [data-entry="Gas Hob"] [data-entry-act="rename"]');
      await h.setValue('#prompt input[name=v]', 'Hob');
      await h.answer('Rename');
      await h.click('#sheet button', 'Done');
      await h.click('main button', 'Chicken curry');
      await h.click('#sheet button', 'Edit');
      await h.clickSel('#sheet [data-label-pick] [data-label="Air Fryer"]');
      await h.click('#sheet button', 'Save recipe');
      const curry = (await h.state()).recipes.find((r) => r.name === 'Chicken curry');
      assert.deepEqual([...curry.labels].sort(), ['Air Fryer', 'Hob']);
      await h.tab('Week');
      await h.click('main button', 'Add meal');
      await h.click('#sheet [data-meal-filter] .chip', 'Air Fryer');
      assert.deepEqual(await h.texts('#sheet select[name=recipe] option'), ['Chicken curry']);
      await h.click('#sheet [data-meal-filter] .chip', 'Fast');
      assert.equal(await page.$eval('#sheet [data-submit]', (b) => b.disabled), true);
      await h.click('#sheet button', 'Cancel');
    }],

    ['#47 pick-lists are A–Z; shopping groups keep the household order', async () => {
      const isAlpha = (list) => list.every((v, i) => i === 0 || list[i - 1].localeCompare(v, undefined, { sensitivity: 'base' }) <= 0);
      await h.tab('Items');
      await h.click('main button', 'Onion');
      const cats = await h.texts('#sheet select[name=category] option');
      assert.equal(cats[cats.length - 1], 'Other', 'Other last');
      assert.ok(isAlpha(cats.slice(0, -1)), `categories A–Z: ${cats.join(', ')}`);
      const units = await h.texts('#sheet select[name=unit] option');
      assert.ok(isAlpha(units) && units.includes('punnet'), `units A–Z: ${units.join(', ')}`);
      await page.keyboard.press('Escape');
      await sleep(200);
      await h.click('main button', '+ New item');
      const suggestions = await page.$$eval('#items-dl option', (os) => os.map((o) => o.value));
      assert.ok(isAlpha(suggestions), 'item suggestions A–Z');
      await page.keyboard.press('Escape');
      await sleep(200);
      await h.tab('Recipes');
      const pressed = await page.$$eval('main .chips.filter .chip[aria-pressed="true"]', (cs) => cs.map((c) => c.textContent.trim()));
      const stored = await page.evaluate(() => localStorage.getItem('stropping:recipeFilter'));
      const filters = await h.texts('main .chips.filter .chip[data-label]');
      assert.ok(isAlpha(filters), `label filters A–Z: ${filters.join(', ')}`);
      assert.deepEqual(pressed, [], `no filter left on (pressed: ${pressed.join(', ')}; stored: ${stored})`);
      await h.click('main button', 'Labels');
      assert.ok(isAlpha(await page.$$eval('#sheet [data-entry]', (es) => es.map((e) => e.dataset.entry))), 'Labels screen A–Z');
      assert.equal(await page.$$eval('#sheet [data-entry-act="up"]', (b) => b.length), 0, 'no reordering for labels');
      await h.click('#sheet button', 'Done');
      await h.tab('Shopping');
      const groups = await h.texts('main .group h3');
      const order = (await h.state()).settings.categories;
      const expected = order.filter((c) => groups.map((g) => g.toLowerCase()).includes(c.toLowerCase()));
      assert.deepEqual(groups.map((g) => g.toLowerCase()), expected.map((c) => c.toLowerCase()), 'shopping groups follow the household order');
      return `groups: ${groups.join(' > ')}`;
    }],

    ['#48 cupboard search', async () => {
      await h.tab('Cupboard');
      await h.setValue('#view [data-search]', 'rice');
      assert.deepEqual(await visibleRows(), ['Basmati rice']);
      await h.shot('cupboard-search');
      await h.setValue('#view [data-search]', 'dairy');
      assert.ok((await visibleRows()).includes('Milk'), 'matches category');
      await h.setValue('#view [data-search]', 'zzz');
      assert.equal((await visibleRows()).length, 0);
      assert.equal(await page.$eval('#view .empty-search', (p) => p.hidden), false);
      await h.tab('Items');
      assert.equal(await page.$eval('#view [data-search]', (i) => i.value), '', 'Items keeps its own search');
      await h.tab('Cupboard');
      assert.equal(await page.$eval('#view [data-search]', (i) => i.value), 'zzz', 'Cupboard search kept');
      await h.setValue('#view [data-search]', '');
    }],

    ['no console errors; no sideways scroll on desktop', async () => {
      await page.setViewport({ width: 1280, height: 800 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
      assert.deepEqual(page.errors, []);
    }],
  ]);

  await browser.close();
  server.close();
  return ok;
};
