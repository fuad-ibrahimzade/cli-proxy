const fs = require('fs');
const path = require('path');

function proxyKey(proxy) {
  return `${proxy.ip}:${proxy.port}`;
}

function loadUsedList(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(data)) return [];
    // Migrate old formats: plain strings or missing index
    return data.map((entry, i) => {
      if (typeof entry === 'string') return { index: i + 1, address: entry };
      if (!entry.index) entry.index = i + 1;
      return entry;
    });
  } catch {
    return [];
  }
}

function loadUsed(filePath) {
  const list = loadUsedList(filePath);
  return new Set(list.map((e) => e.address));
}

function saveUsedList(filePath, list) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(list, null, 2));
}

function markUsed(filePath, proxy, country) {
  const list = loadUsedList(filePath);
  list.push({
    index: list.length + 1,
    address: proxyKey(proxy),
    protocol: proxy.protocol || 'http',
    country: country || null,
    usedAt: new Date().toISOString(),
  });
  saveUsedList(filePath, list);
}

module.exports = { proxyKey, loadUsed, loadUsedList, markUsed };
