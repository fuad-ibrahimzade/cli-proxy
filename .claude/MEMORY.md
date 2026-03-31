# cli-proxy2 Project Memory

## Project overview
Node.js CLI tool that routes any command through free proxies via sing-box. Sources self-heal and auto-discover from GitHub.

## Key technical details
- sing-box 1.13+ removed old TUN `inet4_address` field — use `mixed` inbound instead
- TUN mode requires root, won't work in Termux — mixed inbound on localhost is the solution
- Direct TCP proxy pre-tests give false positives — must verify through sing-box with real HTTP request
- Verification uses ipinfo.io/json — gets both connectivity check AND country code in one request
- ProxyScrape API: `format=json` is premium-only, use plain text format (no format param)
- ProxyScrape: empty `country=` param returns 0 results — omit param entirely when no countries specified
- GitHub code search API works without auth but is rate-limited
- MuRongPIG/Proxy-Master repo has 100k+ entries, too large — was replaced with sunny9577
- `--countries` filter: most GitHub sources don't support country param — country is verified at sing-box verification step via ipinfo.io response, not at fetch time. When `--countries` is used, pool size is set to all fetched proxies (ignoring `--pool`) since only ~1-2% match a specific country
- `execFileSync` for curl verification blocks event loop — use async `http.request` instead
- Source removal must be conservative: only remove if URL truly unreachable (not empty response), 10+ consecutive fails, and stale >30 days or never worked. User may only run once a week — thresholds must account for infrequent usage. Seed sources never removed. Dead sources always replaced via GitHub code search (6 queries). Discovered URLs validated (fetchFromSource, must return 5+ proxies) before adding. FALLBACK_DISCOVERY_URLS pool used as extra when sources removed. Source count should never shrink.
- GitLab: requires auth (401 on blob search) — removed
- Codeberg: 0 proxy repos found — removed
- SearXNG: public instances unreliable (empty responses, errors) — removed
Always test a discovery source actually works before adding it to code.
- Geonode API: JSON format, needs special parser (source.format='geonode'), 283 HTTP + 1024 SOCKS5, no auth, limit=500 per page
- spys.me: plain text with extra metadata after ip:port (spaces), existing parser handles it fine, ~400 HTTP + 400 SOCKS
- free-proxy-list.com: API returned empty — not added
- proxifly API (api.proxifly.dev): returned empty — not added (GitHub raw lists work though)

## used-proxies.json format
Each entry has: `index`, `address`, `protocol`, `country`, `usedAt`
Old formats (plain strings or missing index) are auto-migrated on load.
`--use-proxy <index>` reuses a saved proxy via `startDirect()` in runner.js.

## File structure
See CLAUDE.md for full details.

## sources.json
Single source of truth — no duplicate hardcoded list. INITIAL_SOURCES in proxy-fetcher.js only used to create sources.json when missing. After that, sources.json is self-managing (health tracking, discovery, removal).

## Ports
- sing-box verification uses ports 12080+ (default 20 parallel instances, configurable via `--parallel`)
- Final proxy for user command reuses the winning instance's port
- `--use-proxy` always uses port 12080

## Workflow rule
ALWAYS update README.md, .claude/CLAUDE.md, and .claude/MEMORY.md after every feature or edit.
