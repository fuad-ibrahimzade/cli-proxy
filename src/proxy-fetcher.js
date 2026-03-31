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
  { name: 'spys.me/http', url: 'https://spys.me/proxy.txt' },
  { name: 'spys.me/socks', url: 'https://spys.me/socks.txt', protocol: 'socks5' },
  { name: 'geonode/http', url: 'https://proxylist.geonode.com/api/proxy-list?limit=500&page=1&sort_by=lastChecked&sort_type=desc&protocols=http', format: 'geonode' },
  { name: 'geonode/socks5', url: 'https://proxylist.geonode.com/api/proxy-list?limit=500&page=1&sort_by=lastChecked&sort_type=desc&protocols=socks5', format: 'geonode', protocol: 'socks5' },
];

// GitHub search queries to discover new proxy lists
const GITHUB_SEARCH_QUERIES = [
  'free proxy list filename:http.txt',
  'proxy list filename:proxies.txt',
  'free proxy filename:socks5.txt',
  'proxy list filename:socks4.txt',
  'free proxy list filename:proxy.txt',
  'updated proxy list filename:https.txt',
];

// Fallback proxy list aggregator URLs
const FALLBACK_DISCOVERY_URLS = [
  'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies.txt',
  'https://raw.githubusercontent.com/ErcinDedeworked/proxies-txt/main/proxies.txt',
  'https://raw.githubusercontent.com/zloi-user/hideip.me/main/http.txt',
  'https://raw.githubusercontent.com/zloi-user/hideip.me/main/socks5.txt',
  'https://raw.githubusercontent.com/Zaeem20/FREE_PROXY_LIST/master/http.txt',
  'https://raw.githubusercontent.com/Zaeem20/FREE_PROXY_LIST/master/socks5.txt',
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

  if (source.format === 'geonode') {
    try {
      const data = JSON.parse(text);
      if (!data.data || !Array.isArray(data.data)) return [];
      return data.data
        .map((p) => ({
          protocol: (p.protocols && p.protocols[0]) || source.protocol || 'http',
          ip: p.ip,
          port: parseInt(p.port, 10),
        }))
        .filter((p) => p.ip && p.port);
    } catch { return []; }
  }

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
        if (!item.html_url || !item.repository) continue;
        const repo = item.repository.full_name;
        const filePath = item.path;
        const rawUrl = `https://raw.githubusercontent.com/${repo}/HEAD/${filePath}`;
        const name = `github:${repo}/${filePath}`;
        const proto = filePath.includes('socks5') ? 'socks5' : 'http';
        discovered.push({ name, url: rawUrl, protocol: proto, discoveredFrom: 'github' });
      }
    } catch {}
  }
  return discovered;
}

// GitHub is the only platform with working free proxy list discovery
// GitLab: requires auth (401), Codeberg: 0 proxy repos, SearXNG: unreliable instances
async function discoverAll() {
  return discoverGitHub().catch(() => []);
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
        return { source: s, proxies, status: 'ok' };
      }
      // Fetched successfully but 0 valid proxies — might be empty temporarily
      return { source: s, proxies: [], status: 'empty' };
    } catch (err) {
      // URL is truly unreachable (HTTP error, timeout, DNS fail)
      return { source: s, proxies: [], status: 'unavailable', error: err.message };
    }
  }));

  // Update source health — only count truly unavailable fetches as failures
  const now = Date.now();
  const alive = [];
  let removedCount = 0;
  const isSeed = (s) => SEED_SOURCES.find((seed) => seed.url === s.url);

  for (const r of results) {
    const s = r.source;
    if (r.status === 'ok') {
      s.failCount = 0;
      s.lastOk = now;
      s.totalFetched = (s.totalFetched || 0) + r.proxies.length;
      alive.push(s);
    } else if (r.status === 'empty') {
      // Source responded but had no proxies — don't count as failure
      // Could be temporary (rate limit, empty list update)
      alive.push(s);
    } else {
      // Truly unavailable — increment fail counter
      s.failCount = (s.failCount || 0) + 1;
      s.lastError = r.error;

      // Only remove if: not a seed, 5+ consecutive unavailable, AND never worked OR last worked > 7 days ago
      const neverWorked = !s.lastOk;
      const stale = s.lastOk && (now - s.lastOk) > 30 * 24 * 60 * 60 * 1000;
      if (!isSeed(s) && s.failCount >= 10 && (neverWorked || stale)) {
        removedCount++;
        console.log(`    Removing dead source: ${s.name} (unavailable ${s.failCount} times)`);
      } else {
        alive.push(s);
      }
    }
  }

  // Discover new sources — try harder if sources were removed
  const needReplacements = removedCount > 0;
  let added = 0;

  // Discover from all platforms in parallel (GitHub, GitLab, Codeberg, SearXNG)
  try {
    const discovered = await discoverAll();
    // Filter out already-known URLs
    const newOnes = discovered.filter((d) => !alive.find((s) => s.url === d.url));
    // Validate discovered sources actually have proxies (in parallel, with timeout)
    if (newOnes.length) {
      const validated = await Promise.all(newOnes.map(async (d) => {
        try {
          const proxies = await fetchFromSource(d);
          return proxies.length >= 5 ? d : null; // At least 5 proxies to be worth adding
        } catch { return null; }
      }));
      for (const d of validated) {
        if (d) { alive.push(d); added++; }
      }
    }
  } catch {}

  // If sources were removed, also try fallback URLs as new sources
  if (needReplacements) {
    for (const url of FALLBACK_DISCOVERY_URLS) {
      if (!alive.find((s) => s.url === url)) {
        const name = url.split('githubusercontent.com/')[1] || url;
        const proto = url.includes('socks5') ? 'socks5' : 'http';
        alive.push({ name, url, protocol: proto });
        added++;
      }
    }
  }

  if (added) console.log(`    Added ${added} new sources${needReplacements ? ' (replacing removed)' : ''}`);

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
