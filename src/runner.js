const { spawn } = require('child_process');
const { generateConfig, startSingBox } = require('./singbox');
const http = require('http');
const net = require('net');
const path = require('path');
const os = require('os');

const BASE_PORT = 12080;
const PARALLEL = 20;

function waitForPort(port, timeoutMs = 2000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function tryConnect() {
      const sock = net.createConnection(port, '127.0.0.1');
      sock.on('connect', () => { sock.destroy(); resolve(); });
      sock.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error('timeout'));
        else setTimeout(tryConnect, 50);
      });
    }
    tryConnect();
  });
}

// Returns { ok, country } — uses ipinfo.io to verify AND get country in one request
function verifySingBox(port) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: 'http://ipinfo.io/json',
      method: 'GET',
      headers: { Host: 'ipinfo.io', Accept: 'application/json' },
      timeout: 3000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve({ ok: false });
        try {
          const info = JSON.parse(data);
          resolve({ ok: !!info.ip, country: info.country || null });
        } catch {
          resolve({ ok: false });
        }
      });
    });
    req.on('error', () => resolve({ ok: false }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false }); });
    req.end();
  });
}

async function testOneViaBox(proxy, port) {
  const configPath = path.join(os.tmpdir(), `cli-proxy-sb-${port}.json`);
  generateConfig(proxy, configPath, port);
  const sb = startSingBox(configPath);
  sb.stderr.on('data', () => {});

  try {
    await waitForPort(port);
    const result = await verifySingBox(port);
    if (result.ok) {
      return { proxy, singbox: sb, port, country: result.country };
    }
  } catch {}

  sb.kill('SIGTERM');
  return null;
}

async function findVerifiedProxy(candidates, onBatch) {
  for (let i = 0; i < candidates.length; i += PARALLEL) {
    const batch = candidates.slice(i, i + PARALLEL);
    const ports = batch.map((_, j) => BASE_PORT + j);

    if (onBatch) onBatch(batch, i);

    const results = await Promise.all(
      batch.map((proxy, j) => testOneViaBox(proxy, ports[j]))
    );

    let winner = null;
    for (const r of results) {
      if (!r) continue;
      if (!winner) winner = r;
      else r.singbox.kill('SIGTERM');
    }

    if (winner) return winner;
  }

  return null;
}

function runCommand(command, args, singbox, port) {
  return new Promise((resolve) => {
    const localProxy = `http://127.0.0.1:${port}`;
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: {
        ...process.env,
        HTTP_PROXY: localProxy,
        HTTPS_PROXY: localProxy,
        ALL_PROXY: localProxy,
        http_proxy: localProxy,
        https_proxy: localProxy,
        all_proxy: localProxy,
      },
    });

    child.on('close', (code) => {
      singbox.kill('SIGTERM');
      resolve(code ?? 1);
    });

    child.on('error', (err) => {
      console.error(`Failed to run command: ${err.message}`);
      singbox.kill('SIGTERM');
      resolve(1);
    });
  });
}

async function startDirect(proxy) {
  const port = BASE_PORT;
  const configPath = path.join(os.tmpdir(), `cli-proxy-sb-${port}.json`);
  generateConfig(proxy, configPath, port);
  const sb = startSingBox(configPath);
  sb.stderr.on('data', () => {});
  await waitForPort(port);
  return { singbox: sb, port };
}

module.exports = { findVerifiedProxy, runCommand, startDirect };
