const fs = require('node:fs');
const { spawn } = require('node:child_process');

const REQUEST = '.veril/run-request.json';
const RESULTS = '.veril/results.json';
const POLL_MS = 300;
const CASE_TIMEOUT_MS = 15_000;
const SERVER_WAIT_MS = 60_000;
const MAX_BODY_CHARS = 64 * 1024;

const dev = spawn('npm', ['run', 'dev'], { stdio: 'inherit', shell: true });
dev.on('exit', (code) => process.exit(code ?? 0));

let lastRequestId = null;

function readRequest() {
  try {
    return JSON.parse(fs.readFileSync(REQUEST, 'utf8'));
  } catch {
    return null;
  }
}

function contentTypeFor(body) {
  try {
    JSON.parse(body);
    return 'application/json';
  } catch {
    return 'text/plain';
  }
}

async function callOnce(origin, c) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), CASE_TIMEOUT_MS);
  try {
    const res = await fetch(`${origin}${c.path}`, {
      method: c.method || 'GET',
      headers: c.body !== undefined ? { 'content-type': contentTypeFor(c.body) } : undefined,
      body: c.body,
      signal: ctl.signal,
    });
    const text = await res.text();
    return { id: c.id, status: res.status, body: text.slice(0, MAX_BODY_CHARS) };
  } finally {
    clearTimeout(timer);
  }
}

async function call(origin, c) {
  const deadline = Date.now() + SERVER_WAIT_MS;
  for (;;) {
    try {
      return await callOnce(origin, c);
    } catch (err) {
      const refused = /ECONNREFUSED|fetch failed|socket hang up/i.test(String(err?.cause?.code ?? err?.message ?? err));
      if (!refused || Date.now() > deadline) return { id: c.id, status: 0, body: '' };
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function run(request) {
  const origin = `http://localhost:${Number(request.port) || 3000}`;
  const results = [];
  for (const c of request.cases ?? []) results.push(await call(origin, c));
  fs.writeFileSync(RESULTS, JSON.stringify({ requestId: request.requestId, results, at: new Date().toISOString() }));
  console.log(`Veril checks: ${results.length} ran.`);
}

(function poll() {
  const request = readRequest();
  if (request?.requestId && request.requestId !== lastRequestId) {
    lastRequestId = request.requestId;
    run(request).catch((err) => console.error('Veril checks failed:', err?.message ?? err)).finally(() => setTimeout(poll, POLL_MS));
    return;
  }
  setTimeout(poll, POLL_MS);
})();
