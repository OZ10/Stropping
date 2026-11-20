// Runs every test: logic first (Node only), then the browser tests (Edge/Chrome).
//   npm install   (once, fetches the browser driver)
//   npm test      (everything)
//   npm test -- logic | app | sync | offline   (just some)
const path = require('path');

const only = new Set(process.argv.slice(2));
const want = (name) => !only.size || only.has(name);

(async () => {
  let ok = true;
  if (want('logic')) {
    const logic = require('./logic.test.js');
    console.log('Logic');
    await logic.run();
    if (process.exitCode) ok = false;
  }
  for (const name of ['app', 'sync', 'offline']) {
    if (!want(name)) continue;
    try {
      const fn = require(path.join(__dirname, 'browser', `${name}.test.js`));
      if (!(await fn())) ok = false;
    } catch (err) {
      ok = false;
      console.log(`\n${name}: could not run\n  ${err.message}`);
    }
  }
  console.log(ok ? '\nAll tests passed.' : '\nSome tests FAILED.');
  process.exitCode = ok ? 0 : 1;
})();
