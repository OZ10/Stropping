// The service worker: a new version shows after one reload, and the app opens offline.
const { assert, sleep, startServer, launch, newPage, steps } = require('./harness');

module.exports = async function offlineTests() {
  let version = 'A';
  const server = await startServer(8773, {
    '/firebase-config.js': () => ({ body: `window.STROPPING_FIREBASE_CONFIG = null; window.__ver = '${version}';` }),
  });
  const browser = await launch();
  const page = await newPage(browser);

  const ok = await steps('Offline and updates (service worker)', [
    ['page is controlled by the service worker', async () => {
      await page.goto('http://localhost:8773/');
      await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, { timeout: 10000 }).catch(() => {});
      await page.reload();
      await sleep(400);
      assert.equal(await page.evaluate(() => !!navigator.serviceWorker.controller), true);
      assert.equal(await page.evaluate(() => window.__ver), 'A');
    }],
    ['a new version shows after one reload', async () => {
      version = 'B';
      await page.reload();
      await sleep(400);
      assert.equal(await page.evaluate(() => window.__ver), 'B');
    }],
    ['opens offline from the saved copy', async () => {
      await page.setOfflineMode(true);
      await page.reload();
      await sleep(800);
      assert.equal(await page.evaluate(() => window.__ver), 'B');
      assert.equal(await page.$eval('#view h2', (e) => e.textContent), 'This week');
      await page.setOfflineMode(false);
    }],
    ['no page errors', async () => {
      assert.deepEqual(page.errors.filter((e) => e.startsWith('pageerror')), []);
    }],
  ]);

  await browser.close();
  server.close();
  return ok;
};
