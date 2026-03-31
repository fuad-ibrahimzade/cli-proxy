const { spawn, execSync } = require('child_process');
const { generateConfig, startSingBox } = require('./singbox');
const net = require('net');
const path = require('path');
const os = require('os');

const BASE_PORT = 12080;
const PARALLEL = 10;

function waitForPort(port, timeoutMs = 3000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function tryConnect() {
      const sock = net.createConnection(port, '127.0.0.1');
      sock.on('connect', () => { sock.destroy(); resolve(); });
      sock.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error('timeout'));
        else setTimeout(tryConnect, 80);
      });
    }
    tryConnect();
  });
}

function verifySingBox(port) {
  try {
    const result = execSync(
      `curl -s --max-time 3 --proxy http://127.0.0.1:${port} http://httpbin.org/ip`,
      { timeout: 4000 }
    );
    return result.toString().includes('origin');
  } catch {
    return false;
  }
}

async function testOneViaBox(proxy, port) {
  const configPath = path.join(os.tmpdir(), `cli-proxy-sb-${port}.json`);
  generateConfig(proxy, configPath, port);
  const sb = startSingBox(configPath);
  sb.stderr.on('data', () => {});

  try {
    await waitForPort(port);
    if (verifySingBox(port)) {
      return { proxy, singbox: sb, port };
    }
  } catch {}

  sb.kill('SIGTERM');
  return null;
}

async function findVerifiedProxy(candidates, onTry) {
  // Process in batches of PARALLEL, stop as soon as we find one
  for (let i = 0; i < candidates.length; i += PARALLEL) {
    const batch = candidates.slice(i, i + PARALLEL);
    const ports = batch.map((_, j) => BASE_PORT + j);

    if (onTry) onTry(batch);

    const results = await Promise.all(
      batch.map((proxy, j) => testOneViaBox(proxy, ports[j]))
    );

    // Kill all sing-box processes except the winner
    let winner = null;
    for (const r of results) {
      if (!r) continue;
      if (!winner) {
        winner = r;
      } else {
        r.singbox.kill('SIGTERM');
      }
    }

    // Also kill losers that returned null (already killed above, but be safe)
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

module.exports = { findVerifiedProxy, runCommand };
