const fs = require('node:fs');

const READY = '.veril/ready';
const TIMEOUT_MS = 10 * 60 * 1000;
const POLL_MS = 300;
const started = Date.now();

console.log('Waiting for the project files…');

(function poll() {
  if (fs.existsSync(READY)) {
    console.log('Project files received — installing packages.');
    process.exit(0);
  }
  if (Date.now() - started > TIMEOUT_MS) {
    console.error('The project files never arrived. Reload the page.');
    process.exit(1);
  }
  setTimeout(poll, POLL_MS);
})();
