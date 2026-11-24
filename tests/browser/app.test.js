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
      assert.equal(s.recipes.length, 4);
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
        if (t.startsWith('Any optional extras')) await h.answer('Continue');
        else await h.answer(t.includes('Paprika') ? 'No, add to list' : 'Yes');
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
      await page.select('#sheet select[name=recipe]', await page.$eval('#sheet select[name=recipe]', (sel) => [...sel.options].find((o) => o.text === 'Chicken curry').value));
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
      await h.click('main button', 'Item settings');
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

    ['#49 optional ingredients: marked in the editor, chosen when planning', async () => {
      await h.tab('Recipes');
      await h.click('main button', 'Chicken curry');
      assert.ok((await h.texts('#sheet .ing-list li')).some((t) => t.includes('Spinach') && t.includes('optional')), 'recipe view marks it');
      await h.click('#sheet button', 'Edit');
      const optionalRows = await page.$$eval('#sheet .ing-row', (rows) => rows.filter((r) => r.querySelector('.ing-optional').checked).map((r) => r.querySelector('.ing-name').value));
      assert.deepEqual(optionalRows, ['Spinach']);
      // mark rice optional too, save
      await page.evaluate(() => [...document.querySelectorAll('#sheet .ing-row')].find((r) => r.querySelector('.ing-name').value === 'Basmati rice').querySelector('.ing-optional').click());
      await h.shot('optional-editor');
      await h.click('#sheet button', 'Save recipe');
      const curry = (await h.state()).recipes.find((r) => r.name === 'Chicken curry');
      assert.equal(curry.ingredients.filter((g) => g.optional).length, 2);
      // plan it: tick spinach only
      await h.tab('Shopping');
      if ((await h.state()).shopping.length) { await h.click('main button', 'Clear list'); await h.answer('Clear list'); }
      await h.tab('Week');
      await h.click('main button', 'Add meal');
      await page.select('#sheet select[name=recipe]', curry.id);
      await h.click('#sheet button', 'Add to week');
      const title = await h.promptTitle();
      assert.equal(title, 'Any optional extras this time?');
      assert.equal((await h.texts('#prompt .opt-list label')).length, 2);
      await h.shot('optional-prompt');
      await page.evaluate(() => [...document.querySelectorAll('#prompt .opt-list label')].find((l) => l.textContent.includes('Spinach')).querySelector('input').click());
      await h.answer('Continue');
      for (let i = 0; i < 10; i++) {
        const t = await h.promptTitle();
        if (/ added$/.test(t)) break;
        await h.answer('Yes');
      }
      assert.ok((await h.texts('#prompt p')).some((t) => t.includes('Basmati rice')), 'summary lists rice as left out');
      await h.shot('optional-summary');
      await h.answer('Done');
      const s = await h.state();
      const itemId = (n) => s.items.find((i) => i.name === n).id;
      assert.ok(s.shopping.some((e) => e.itemId === itemId('Spinach')), 'spinach included');
      const meal = s.week.meals[s.week.meals.length - 1];
      assert.ok(!meal.alloc.some((a) => a.itemId === itemId('Basmati rice')), 'rice left out');
    }],

    ['#46 locations: set on items, managed, cupboard grouped/searched/swept by location', async () => {
      await h.tab('Items');
      await h.click('main button', 'Item settings');
      await page.type('#sheet [data-list="locations"] [data-new-entry]', 'Garage');
      await page.keyboard.press('Enter');
      await sleep(200);
      assert.ok((await h.state()).locations.includes('Garage'));
      await h.shot('item-settings-locations');
      await h.click('#sheet button', 'Done');
      await h.click('main button', 'Kitchen roll');
      const locs = await h.texts('#sheet select[name=location] option');
      assert.deepEqual(locs, ['Not set', 'Freezer', 'Fridge', 'Garage', 'Pantry', 'Tall cupboard']);
      await page.select('#sheet select[name=location]', 'Garage');
      await h.click('#sheet button', 'Save');
      assert.equal((await h.state()).items.find((i) => i.name === 'Kitchen roll').location, 'Garage');
      await h.tab('Cupboard');
      await h.click('main button', '+ Add');
      await page.type('#sheet input[name=item]', 'Kitchen roll');
      await h.clickSel('#sheet .sheet-actions .btn.primary');
      await h.click('main .segmented button', 'Location');
      const groups = await h.texts('main .group h3');
      const expected = [...groups].sort((a, b) => (a === 'No location') - (b === 'No location') || a.localeCompare(b));
      assert.deepEqual(groups, expected, `A–Z, No location last: ${groups.join(', ')}`);
      assert.ok(groups.includes('Garage') && groups.includes('Fridge'));
      await h.shot('cupboard-by-location');
      await page.reload();
      await sleep(300);
      assert.equal(await page.$eval('main .segmented [aria-pressed="true"]', (b) => b.textContent), 'Location', 'grouping remembered');
      await h.setValue('#view [data-search]', 'garage');
      assert.deepEqual(await visibleRows(), ['Kitchen roll']);
      await h.setValue('#view [data-search]', '');
      await h.click('main button', 'Sweep');
      assert.equal(await h.promptTitle(), 'Sweep which location?');
      await h.shot('sweep-which');
      await h.click('#prompt button', 'Fridge');
      const fridge = (await h.state()).items.filter((i) => i.location === 'Fridge').map((i) => i.name);
      const swept = [];
      for (let i = 0; i < 20; i++) {
        const t = await h.promptTitle().catch(() => null);
        if (!t) break;
        swept.push(t);
        await h.answer('Still there');
      }
      assert.ok(swept.length > 0 && swept.every((n) => fridge.includes(n)), `swept: ${swept.join(', ')}`);
      await h.click('main .segmented button', 'Category');
      return `swept ${swept.length} fridge items`;
    }],

    ['#50 recipe units: slices of a loaf counted, tbsp of jam checked, editor offers only fitting units', async () => {
      // Item editor shows the bread's recipe unit and size
      await h.tab('Items');
      await h.click('main button', 'Bread');
      assert.equal(await page.$eval('#sheet select[name=packUnit]', (s) => s.value), 'slice');
      assert.equal(await page.$eval('#sheet input[name=packSize]', (i) => i.value), '20');
      assert.match(await page.$eval('#sheet [data-pack-summary]', (p) => p.textContent), /1 loaf = 20 slice/);
      await h.shot('item-pack');
      await page.keyboard.press('Escape');
      await sleep(200);
      // Recipe editor: bread row only offers loaf/slice
      await h.tab('Recipes');
      await h.click('main button', 'Cheese on toast');
      assert.ok((await h.texts('#sheet .ing-list .qty')).some((t) => t.startsWith('2 slices')), 'view shows recipe unit');
      await h.click('#sheet button', 'Edit');
      const breadUnits = await page.evaluate(() => {
        const row = [...document.querySelectorAll('#sheet .ing-row')].find((r) => r.querySelector('.ing-name').value === 'Bread');
        return [...row.querySelectorAll('.ing-unit option')].map((o) => o.value);
      });
      assert.deepEqual(breadUnits, ['loaf', 'slice']);
      await h.shot('recipe-units');
      await page.keyboard.press('Escape');
      await sleep(200);
      // Plan cheese on toast: 2 slices of a 20-slice loaf
      const before = (await h.state());
      const breadId = before.items.find((i) => i.name === 'Bread').id;
      const loaves = before.cupboard[breadId] || 0;
      await h.tab('Week');
      await h.click('main button', 'Add meal');
      await page.select('#sheet select[name=recipe]', before.recipes.find((r) => r.name === 'Cheese on toast').id);
      await h.click('#sheet button', 'Add to week');
      await h.answerPlanning();
      const after = await h.state();
      // #51: the 2 slices are set aside, not removed, until the meal is cooked
      assert.equal(after.cupboard[breadId] || 0, loaves, 'cupboard unchanged by planning');
      const breadMeal = after.week.meals[after.week.meals.length - 1];
      assert.equal(breadMeal.alloc.find((a) => a.itemId === breadId).fromCupboard, 0.1, '0.1 loaf set aside');
      // Plan pancakes with jam: asked whether there's jam, not counted
      await h.click('main button', 'Add meal');
      await page.select('#sheet select[name=recipe]', after.recipes.find((r) => r.name === 'Pancakes').id);
      await h.click('#sheet button', 'Add to week');
      await h.promptTitle();
      await page.evaluate(() => [...document.querySelectorAll('#prompt .opt-list label')].find((l) => l.textContent.includes('jam')).querySelector('input').click());
      await h.answer('Continue');
      let sawJam = false;
      for (let i = 0; i < 10; i++) {
        const t = await h.promptTitle();
        if (/ added$/.test(t)) break;
        if (t === 'Have you got Strawberry jam?') {
          sawJam = true;
          assert.match(await page.$eval('#prompt p:not(.progress)', (p) => p.textContent), /1 tbsp.*jar/);
          await h.shot('unsized-prompt');
        }
        await h.answer('Yes');
      }
      await h.answer('Done');
      assert.ok(sawJam, 'asked about the jam');
      return `bread ${loaves} loaf, 0.1 set aside`;
    }],

    ['#51 cupboard is what’s there: set aside when planned, used up when cooked', async () => {
      // fresh start so earlier steps don't muddy the numbers
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await sleep(300);
      await h.click('main button', 'Try sample data');
      const s0 = await h.state();
      const idOf = (s, n) => s.items.find((i) => i.name === n).id;
      await h.click('main button', 'Add meal');
      await page.select('#sheet select[name=recipe]', s0.recipes.find((r) => r.name === 'Chicken curry').id);
      await h.setValue('#sheet input[name=portions]', 6);
      await h.click('#sheet button', 'Add to week');
      await h.answerPlanning();
      let s = await h.state();
      assert.equal(s.cupboard[idOf(s, 'Chicken breast')], 500, 'planning leaves the chicken in the cupboard');
      // shop: tick everything
      await h.tab('Shopping');
      await page.evaluate(() => document.querySelectorAll('li.shop input[type=checkbox]').forEach((c) => c.click()));
      await sleep(300);
      s = await h.state();
      assert.equal(s.cupboard[idOf(s, 'Chicken breast')], 750, 'bought chicken goes in the cupboard');
      await h.tab('Cupboard');
      const row = await page.evaluate(() => [...document.querySelectorAll('#view li')].find((li) => li.textContent.includes('Chicken breast')).textContent.replace(/\s+/g, ' ').trim());
      assert.match(row, /750 g for this week’s meals/, row);
      await h.shot('cupboard-set-aside');
      // tick cooked during the week: nothing used yet
      await h.tab('Week');
      await h.clickSel('.meal input[data-act=cooked]');
      s = await h.state();
      assert.equal(s.cupboard[idOf(s, 'Chicken breast')], 750, 'ticking cooked alone changes nothing');
      // start a new week: now it's used up
      await h.click('main button', 'Start a new week');
      await h.answer('Start');
      for (let i = 0; i < 10; i++) {
        const t = await h.promptTitle();
        if (t.includes('New week started')) break;
        await h.answer('Yes');
      }
      await h.answer('Done');
      s = await h.state();
      assert.equal(s.cupboard[idOf(s, 'Chicken breast')], undefined, 'chicken used up (issue #51)');
      assert.equal(s.cupboard[idOf(s, 'Basmati rice')], 550);
      assert.equal(s.cupboard[idOf(s, 'Onion')], 1.5);
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
