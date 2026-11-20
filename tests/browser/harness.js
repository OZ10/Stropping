// Shared helpers for the browser tests: a tiny static server, a headless
// Edge/Chrome, and page helpers. Screenshots go to tests/output (git-ignored).
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert').strict;
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'tests', 'output');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};
const BROWSERS = [
  process.env.BROWSER,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/microsoft-edge',
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LOCAL_ONLY = "window.STROPPING_FIREBASE_CONFIG = null;";

/**
 * Serve the repo. `overrides` maps a path to a body string, a function
 * (req) => ({ status, type, body }), or null for a 404.
 */
function startServer(port, overrides = {}) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    if (p in overrides) {
      const o = overrides[p];
      if (o === null) { res.writeHead(404); return res.end(); }
      const r = typeof o === 'function' ? o(req) : { body: o };
      res.writeHead(r.status || 200, { 'Content-Type': r.type || TYPES[path.extname(p)] || 'text/plain', 'Cache-Control': 'no-cache' });
      return res.end(r.body);
    }
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

async function launch() {
  const executablePath = BROWSERS.find((b) => fs.existsSync(b));
  if (!executablePath) throw new Error('No Edge or Chrome found. Set the BROWSER environment variable to its path.');
  fs.mkdirSync(OUT, { recursive: true });
  return puppeteer.launch({ executablePath, headless: true });
}

/** A phone-sized page in its own browser context, collecting console errors. */
async function newPage(browser, { ignoreErrors = [] } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.errors = [];
  const keep = (msg) => !ignoreErrors.some((re) => re.test(msg));
  page.on('pageerror', (e) => { if (keep(e.message)) page.errors.push(`pageerror: ${e.message}`); });
  page.on('console', (m) => { if (m.type() === 'error' && keep(m.text())) page.errors.push(`console: ${m.text()}`); });
  return page;
}

/** Page helpers bound to one page. */
function helpers(page, prefix) {
  const h = {
    sleep,
    async shot(name) { await sleep(250); await page.screenshot({ path: path.join(OUT, `${prefix}-${name}.png`) }); },
    /** Click the first visible element matching `sel` whose text contains `text`. */
    async click(sel, text) {
      await page.waitForFunction((s, t) => [...document.querySelectorAll(s)].some((e) => e.textContent.trim().includes(t) && e.offsetParent !== null), { timeout: 4000 }, sel, text)
        .catch(() => { throw new Error(`Nothing visible matching ${sel} containing "${text}"`); });
      await page.evaluate((s, t) => [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(t) && e.offsetParent !== null).click(), sel, text);
      await sleep(200);
    },
    /** Click a selector directly (e.g. a button inside a specific row). */
    async clickSel(sel) {
      await page.waitForSelector(sel, { timeout: 4000 });
      await page.evaluate((s) => document.querySelector(s).click(), sel);
      await sleep(200);
    },
    tab: (name) => h.click('.tabbar button', name),
    /** Saved app state from localStorage. */
    state: () => page.evaluate(() => JSON.parse(localStorage.getItem('stropping:v1'))),
    promptTitle: async () => {
      await page.waitForSelector('#prompt[open]', { timeout: 4000 });
      return page.$eval('#prompt h2', (e) => e.textContent);
    },
    answer: (label) => h.click('#prompt button', label),
    /** Answer every planning question with `label` until the summary, then close it. */
    async answerPlanning(label = 'Yes') {
      for (let i = 0; i < 15; i++) {
        const t = await h.promptTitle();
        if (/ added$/.test(t)) return h.answer('Done');
        await h.answer(t.startsWith('Any optional extras') ? 'Continue' : label);
      }
      throw new Error('Planning never finished');
    },
    /** Type into an input, replacing its value, and fire input events. */
    async setValue(sel, value) {
      await page.waitForSelector(sel, { timeout: 4000 });
      await page.$eval(sel, (i, v) => { i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }, String(value));
      await sleep(100);
    },
    texts: (sel) => page.$$eval(sel, (es) => es.map((e) => e.textContent.trim())),
  };
  return h;
}

/** Run named steps, printing ✓/✗; stops at the first failure. Returns true if all passed. */
async function steps(title, list) {
  console.log(`\n${title}`);
  for (const [name, fn] of list) {
    try {
      const note = await fn();
      console.log(`  ✓ ${name}${note ? ` (${note})` : ''}`);
    } catch (err) {
      console.log(`  ✗ ${name}\n    ${String(err.stack || err).split('\n').slice(0, 4).join('\n    ')}`);
      return false;
    }
  }
  return true;
}

module.exports = { assert, sleep, startServer, launch, newPage, helpers, steps, LOCAL_ONLY, ROOT, OUT };
