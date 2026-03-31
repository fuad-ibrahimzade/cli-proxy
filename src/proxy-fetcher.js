const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DEFAULT_SOURCES_FILE = path.join(__dirname, '..', 'sources.json');

const SEED_SOURCES = [
  { name: 'proxyscrape/http', url: 'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000' },
  { name: 'proxyscrape/socks5', url: 'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=5000', protocol: 'socks5' },
  { name: 'TheSpeedX/http', url: 'https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt' },
  { name: 'TheSpeedX/socks5', url: 'https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks5.txt', protocol: 'socks5' },
  { name: 'clarketm/http', url: 'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt' },
  { name: 'monosans/http', url: 'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt' },
  { name: 'monosans/socks5', url: 'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt', protocol: 'socks5' },
  { name: 'hookzof/http', url: 'https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt' },
  { name: 'roosterkid/http', url: 'https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt' },
  { name: 'proxifly/http', url: 'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/http/data.txt' },
  { name: 'proxifly/socks5', url: 'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks5/data.txt', protocol: 'socks5' },
  { name: 'sunny9577/http', url: 'https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/proxies.txt' },
];

// GitHub search queries to discover new proxy lists
const GITHUB_SEARCH_QUERIES = [
  'free proxy list filename:http.txt',
  'proxy list filename:proxies.txt',
  'free proxy filename:socks5.txt',
];

function loadSources(filePath) {
  const file = filePath || DEFAULT_SOURCES_FILE;
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch {}
  return [...SEED_SOURCES];
}

function saveSources(sources, filePath) {
  const file = filePath || DEFAULT_SOURCES_FILE;
  fs.writeFileSync(file, JSON.stringify(sources, null, 2));
}

function httpGet(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location, timeoutMs).then(resolve, reject);
      }
      if (res.statusCode >= 400) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function parseText(text, defaultProtocol = 'http') {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes(':'))
    .map((line) => {
      let proto = defaultProtocol;
      let clean = line;
      if (clean.startsWith('socks5://')) { proto = 'socks5'; clean = clean.slice(9); }
      else if (clean.startsWith('socks4://')) { proto = 'socks4'; clean = clean.slice(9); }
      else if (clean.startsWith('http://')) { proto = 'http'; clean = clean.slice(7); }
      else if (clean.startsWith('https://')) { proto = 'http'; clean = clean.slice(8); }
      const [ip, portStr] = clean.split(':');
      const port = parseInt(portStr, 10);
      if (!ip || isNaN(port) || port < 1 || port > 65535) return null;
      if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return null;
      return { protocol: proto, ip, port };
    })
    .filter(Boolean);
}

async function fetchFromSource(source) {
  const text = await httpGet(source.url);
  return parseText(text, source.protocol || 'http');
}

async function discoverGitHub() {
  const discovered = [];
  for (const query of GITHUB_SEARCH_QUERIES) {
    try {
      const url = `https://api.github.com/search/code?q=${encodeURIComponent(query)}&per_page=10`;
      const data = JSON.parse(await httpGet(url, 10000));
      if (!data.items) continue;
      for (const item of data.items) {
        // Only raw text files from github repos
        if (!item.html_url || !item.repository) continue;
        const repo = item.repository.full_name;
        const filePath = item.path;
        const rawUrl = `https://raw.githubusercontent.com/${repo}/HEAD/${filePath}`;
        const name = `${repo}/${filePath}`.replace(/\//g, '/');
        const proto = filePath.includes('socks5') ? 'socks5' : 'http';
        discovered.push({ name, url: rawUrl, protocol: proto });
      }
    } catch {}
  }
  return discovered;
}

async function fetchProxies({ countries = [], protocol, sourcesFile } = {}) {
  const filePath = sourcesFile || DEFAULT_SOURCES_FILE;
  let sources = loadSources(filePath);

  // Ensure seed sources exist
  for (const seed of SEED_SOURCES) {
    if (!sources.find((s) => s.url === seed.url)) {
      sources.push(seed);
    }
  }

  console.log(`  Fetching from ${sources.length} sources...`);

  // Fetch all sources in parallel, track which ones fail
  const results = await Promise.all(sources.map(async (s) => {
    try {
      const proxies = await fetchFromSource(s);
      if (proxies.length) {
        console.log(`    ${s.name}: ${proxies.length} proxies`);
        return { source: s, proxies, ok: true };
      }
      return { source: s, proxies: [], ok: false };
    } catch {
      return { source: s, proxies: [], ok: false };
    }
  }));

  // Track consecutive failures
  const now = Date.now();
  const alive = [];
  const dead = [];
  for (const r of results) {
    if (r.ok) {
      r.source.failCount = 0;
      r.source.lastOk = now;
      alive.push(r.source);
    } else {
      r.source.failCount = (r.source.failCount || 0) + 1;
      if (r.source.failCount >= 3 && !SEED_SOURCES.find((s) => s.url === r.source.url)) {
        dead.push(r.source);
        console.log(`    Removing dead source: ${r.source.name}`);
      } else {
        alive.push(r.source);
      }
    }
  }

  // Discover new sources from GitHub (non-blocking, don't fail if rate-limited)
  try {
    const discovered = await discoverGitHub();
    let added = 0;
    for (const d of discovered) {
      const exists = alive.find((s) => s.url === d.url);
      if (!exists) {
        alive.push(d);
        added++;
      }
    }
    if (added) console.log(`    Discovered ${added} new sources from GitHub`);
  } catch {}

  // Save updated sources
  saveSources(alive, filePath);

  // Merge and deduplicate proxies
  const seen = new Set();
  const all = [];
  for (const r of results) {
    for (const p of r.proxies) {
      const key = `${p.ip}:${p.port}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (protocol && protocol !== p.protocol) continue;
      all.push(p);
    }
  }

  return all;
}

module.exports = { fetchProxies, loadSources, saveSources, SEED_SOURCES };
