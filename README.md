# cli-proxy

A Node.js CLI tool that fetches free proxies from multiple sources, verifies them through [sing-box](https://sing-box.sagernet.org/), and routes any command's traffic through a working proxy.

## Features

- **Multi-source proxy fetching** — pulls from 12+ sources in parallel (ProxyScrape API, GitHub proxy lists)
- **Self-healing sources** — dead sources are auto-removed after 3 consecutive failures; new sources are discovered from GitHub automatically
- **sing-box verification** — proxies are tested through sing-box in batches of 20 in parallel, ensuring they actually work before running your command
- **Proxy reuse prevention** — tracks used proxies in a JSON file with index, country, protocol, and timestamp
- **Reuse saved proxies** — `--use-proxy <index>` to instantly reuse a known-good proxy without scanning
- **Protocol support** — HTTP and SOCKS5 proxies, routed through sing-box's mixed inbound
- **Custom sources** — add your own proxy list URLs to `sources.json`

## Requirements

- Node.js >= 16
- [sing-box](https://sing-box.sagernet.org/) installed and in PATH
- `curl` (used internally for proxy verification)

### Install sing-box

```bash
# Termux (Android)
pkg install sing-box

# Linux
# See https://sing-box.sagernet.org/installation/package-manager/

# Windows
# See https://sing-box.sagernet.org/installation/package-manager/
```

## Install

```bash
git clone <repo-url>
cd cli-proxy2
npm install
```

## Usage

```bash
# Basic — run any command through a proxy
node src/index.js -- curl ifconfig.me

# Filter by country
node src/index.js --countries "us,de" -- curl ifconfig.me

# Filter by protocol
node src/index.js --protocol socks5 -- wget -qO- ifconfig.me

# Custom proxies file (tracks used proxies)
node src/index.js --proxies-file ./my-proxies.json -- curl ifconfig.me

# Increase proxy pool size if defaults fail
node src/index.js --pool 500 -- curl ifconfig.me

# Point to custom sources file
node src/index.js --sources-file ./my-sources.json -- curl ifconfig.me

# Reuse a previously saved proxy by index (skips all scanning)
node src/index.js --use-proxy 1 -- curl ifconfig.me
```

## Options

| Option | Default | Description |
|---|---|---|
| `--proxies-file <path>` | `used-proxies.json` | JSON file to track used proxies |
| `--countries <list>` | *(all)* | Comma-separated country codes (e.g. `us,tr,de`) |
| `--protocol <proto>` | `all` | `http`, `socks5`, or `all` |
| `--sources-file <path>` | `sources.json` | JSON file with proxy sources |
| `--pool <n>` | `200` | Max proxies to test per run |
| `--use-proxy <index>` | | Reuse a saved proxy by its index (skips scanning) |

## How It Works

1. **Fetch** — pulls proxy lists from all sources in `sources.json` in parallel (~5000+ unique proxies)
2. **Deduplicate** — merges all lists, removes duplicates and already-used proxies
3. **Verify** — tests 20 proxies at a time through sing-box (mixed HTTP/SOCKS5 inbound → remote proxy outbound → ipinfo.io). First working proxy wins, and its country is recorded.
4. **Run** — starts sing-box with the verified proxy on a local port, sets `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY` env vars, and spawns your command
5. **Cleanup** — kills sing-box after your command exits, marks the proxy as used with index, country, protocol, and timestamp

### used-proxies.json format

```json
[
  {
    "index": 1,
    "address": "1.2.3.4:8080",
    "protocol": "http",
    "country": "US",
    "usedAt": "2026-03-31T16:00:00.000Z"
  }
]
```

Use `--use-proxy 1` to reuse proxy #1 directly without any scanning.

## Sources

### Built-in sources (12)

- ProxyScrape API (HTTP + SOCKS5)
- TheSpeedX/SOCKS-List (HTTP + SOCKS5)
- clarketm/proxy-list
- monosans/proxy-list (HTTP + SOCKS5)
- hookzof/socks5_list
- roosterkid/openproxylist
- proxifly/free-proxy-list (HTTP + SOCKS5)
- sunny9577/proxy-scraper

### Self-healing

Each source in `sources.json` tracks:
- `failCount` — incremented on each failed fetch, reset to 0 on success
- `lastOk` — timestamp of last successful fetch

After **3 consecutive failures**, non-seed sources are automatically removed. Seed (built-in) sources are never removed.

### Auto-discovery

On each run, the tool searches GitHub's code search API for new proxy list repositories and adds any new URLs it finds to `sources.json`.

### Custom sources

Edit `sources.json` directly to add your own:

```json
[
  {
    "name": "my-custom-list",
    "url": "https://example.com/proxies.txt",
    "protocol": "http"
  }
]
```

The file expects one `ip:port` per line (plain text). Protocols like `socks5://ip:port` are also parsed.

## Architecture

```
src/
  index.js          — CLI entry point (commander)
  proxy-fetcher.js  — multi-source fetching, self-healing, GitHub discovery
  proxy-store.js    — load/save/check used proxies (JSON file)
  proxy-tester.js   — fast parallel TCP pre-test (currently unused, available)
  runner.js         — sing-box lifecycle + subprocess execution
  singbox.js        — sing-box config generation (mixed inbound)
```

### sing-box config

The tool generates a sing-box config with:
- **Inbound**: `mixed` type on `127.0.0.1:<port>` (supports both HTTP and SOCKS5 clients)
- **Outbound**: `http` or `socks` type pointing to the remote proxy
- **Route**: all traffic → proxy outbound

This avoids TUN mode (which requires root) and works in Termux, regular Linux, and Windows.

## Troubleshooting

**"No proxy passed sing-box verification"**
- Increase pool: `--pool 500`
- Try a different protocol: `--protocol http`
- Free proxies are unreliable — run again to get a fresh batch

**"All fetched proxies have been used"**
- Delete `used-proxies.json` to reset

**sing-box not found**
- Install sing-box and ensure it's in your PATH

**curl hangs with no output**
- The proxy may have died mid-session. Run again to get a new one.
- Add `--max-time` to curl: `-- curl --max-time 10 ifconfig.me`

## License

MIT
