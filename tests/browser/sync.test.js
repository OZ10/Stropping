// Household sharing across two simulated phones, using an in-memory fake of
// Firebase (tests the app's sync code, not the real service or its rules).
const FAKE = require('./fake-firebase');
const { assert, sleep, startServer, launch, newPage, helpers, steps } = require('./harness');

const FAKE_CONFIG = "window.STROPPING_FIREBASE_CONFIG = { apiKey: 'fake', projectId: 'fake', authDomain: 'fake' };";

async function device(browser, uid, name, seed) {
  const page = await newPage(browser, { ignoreErrors: [/404/] });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const m = req.url().match(/firebasejs\/[^/]+\/firebase-(app|auth|firestore)\.js$/);
    if (m) return req.respond({ status: 200, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAKE[m[1]] });
    return req.continue();
  });
  await page.evaluateOnNewDocument((u, n, s) => {
    window.__fakeUid = u;
    window.__fakeName = n;
    if (s) window.__fake = { store: new Map(s) };
  }, uid, name, seed);
  return page;
}

module.exports = async function syncTests() {
  const server = await startServer(8772, { '/firebase-config.js': FAKE_CONFIG, '/sw.js': null });
  const browser = await launch();
  const a = await device(browser, 'u1', 'Alex');
  const ha = helpers(a, 'sync-a');
  const store = (p) => p.evaluate(() => [...window.__fake.store]);
  const count = (entries, re) => entries.filter(([k]) => re.test(k)).length;
  let hid; let code; let b; let hb;

  const ok = await steps('Sharing (fake Firebase, two devices)', [
    ['A signs in and creates a household from local data', async () => {
      await a.goto('http://localhost:8772/');
      await ha.click('main button', 'Try sample data');
      await ha.clickSel('[data-act=menu]');
      await ha.click('#household button', 'Sign in with Google');
      await ha.click('#household button', 'Create a household');
      await ha.answer('Create');
      await sleep(600);
      const s = await store(a);
      hid = s.find(([k]) => /^households\/[^/]+$/.test(k))[0].split('/')[1];
      assert.equal(count(s, /\/recipes\//), 3);
      assert.ok(count(s, /\/items\//) >= 19);
      assert.equal(count(s, /\/meta\//), 4, 'week, settings, labels, locations');
      assert.equal(await a.$eval('#sync-pill', (p) => p.textContent), 'Shared');
    }],

    ['A creates an invite link', async () => {
      await ha.click('#household button', 'Invite someone');
      const link = await a.$eval('.invite-link', (e) => e.textContent);
      code = link.split('join=')[1];
      assert.match(code, /^[A-Z2-9]{8}$/);
      await ha.answer('Close');
      await a.keyboard.press('Escape');
      await sleep(200);
    }],

    ['A plans a meal; it is written to the household', async () => {
      await ha.click('main button', 'Add meal');
      await ha.click('#sheet button', 'Add to week');
      await ha.answerPlanning();
      await sleep(300);
      assert.equal(count(await store(a), /\/meals\//), 1);
    }],

    ['B opens the invite link, signs in and joins', async () => {
      b = await device(browser, 'u2', 'Sam', await store(a));
      hb = helpers(b, 'sync-b');
      await b.goto(`http://localhost:8772/?join=${code}`);
      await sleep(500);
      assert.ok(!b.url().includes('join='), 'code removed from the address');
      await hb.click('#household button', 'Sign in with Google');
      await sleep(700);
      const s = await hb.state();
      assert.equal(s.recipes.length, 3);
      assert.equal(s.week.meals.length, 1);
      const members = (await store(b)).find(([k]) => k === `households/${hid}`)[1].members;
      assert.deepEqual(members, ['u1', 'u2']);
      await b.keyboard.press('Escape');
    }],

    ['A receives remote changes (add + delete)', async () => {
      const s = await ha.state();
      const milk = s.items.find((i) => i.name === 'Milk').id;
      await a.evaluate((h, m) => window.__fake.set(`households/${h}/shopping/remote1`, { id: 'remote1', itemId: m, qty: 2000, reserved: 0, done: false, added: 0 }), hid, milk);
      const pancakes = s.recipes.find((r) => r.name === 'Pancakes').id;
      await a.evaluate((h, id) => window.__fake.del(`households/${h}/recipes/${id}`), hid, pancakes);
      await sleep(400);
      const after = await ha.state();
      assert.ok(after.shopping.some((e) => e.id === 'remote1'));
      assert.equal(after.recipes.length, 2);
    }],

    ['A ticks an item: only the changed documents are written', async () => {
      const before = await a.evaluate(() => window.__fake.writes);
      await ha.tab('Shopping');
      await a.evaluate(() => [...document.querySelectorAll('li.shop')].find((li) => li.textContent.includes('Milk')).querySelector('input').click());
      await sleep(300);
      assert.equal(await a.evaluate(() => window.__fake.writes) - before, 2, 'list entry + cupboard entry');
    }],

    ['B leaves the household', async () => {
      await hb.clickSel('[data-act=menu]');
      await hb.click('#household button', 'Leave');
      await hb.answer('Leave');
      await sleep(400);
      const members = (await store(b)).find(([k]) => k === `households/${hid}`)[1].members;
      assert.deepEqual(members, ['u1']);
      assert.equal(await b.$eval('#sync-pill', (p) => p.hidden), true);
    }],

    ['no console errors', async () => {
      assert.deepEqual([...a.errors, ...b.errors], []);
    }],
  ]);

  await browser.close();
  server.close();
  return ok;
};
