# cli-proxy2 Project Guide

## What this project is
A Node.js CLI tool that fetches free proxies from multiple sources, verifies them through sing-box, and routes subprocess traffic through a working proxy.

## Key files
- `src/index.js` — CLI entry point using commander
- `src/proxy-fetcher.js` — multi-source fetching, self-healing sources, GitHub auto-discovery
- `src/proxy-store.js` — tracks used proxies in JSON file
- `src/proxy-tester.js` — fast parallel TCP pre-test (available but not used in main flow)
- `src/runner.js` — starts sing-box, verifies proxy through it, runs user command
- `src/singbox.js` — generates sing-box config (mixed inbound, http/socks outbound)
- `sources.json` — single source of truth for all proxy sources (auto-created from INITIAL_SOURCES on first run, self-healing/updating)
- `used-proxies.json` — indexed list of used proxies with country, protocol, timestamp

## Architecture decisions
- **sing-box mixed inbound** (not TUN) — TUN requires root and the old TUN config was removed in sing-box 1.12+. Mixed inbound on localhost works everywhere including Termux.
- **No pre-test step** — direct TCP pre-tests gave false positives. All verification goes through sing-box with a real HTTP request to ipinfo.io (also captures country).
- **Country filtering at verification** — `--countries` is enforced by checking ipinfo.io response country, not at fetch time (most sources don't support country filtering). Proxies with wrong country are rejected even if they work. When countries are specified, `--pool` is ignored and ALL fetched proxies are tested (since only a small % will match).
- **--use-proxy <index>** — reuses a saved proxy by index from used-proxies.json, skips all scanning. Uses `startDirect()` in runner.js.
- **Parallel verification** — 20 sing-box instances on ports 12080-12099 tested simultaneously per batch.
- **Self-healing sources** — sources track failCount/lastOk/totalFetched. Only truly unavailable URLs (HTTP error/timeout) increment failCount. Empty responses don't count as failures. Removal requires 10+ consecutive unavailable AND (never worked OR stale >30 days). Seed sources never removed. Dead sources always replaced via GitHub code search (6 queries). All discovered URLs validated (must return 5+ proxies) before adding. Fallback pool of known repos used when sources removed. Source count never shrinks. GitLab (requires auth), Codeberg (0 proxy repos), SearXNG (unreliable) were tested and removed — GitHub only.
- **Env var proxy routing** — subprocess gets HTTP_PROXY/HTTPS_PROXY/ALL_PROXY pointing to local sing-box port.

## Commands
- `npm install` — install dependencies
- `node src/index.js --help` — show usage
- `node src/index.js -- curl ifconfig.me` — basic test run

## Conventions
- No TypeScript, plain Node.js CommonJS modules
- Single dependency: commander
- All async operations use Promise-based patterns

## IMPORTANT: After every feature or edit
Always update these three files to stay in sync:
1. `README.md` — user-facing docs (options table, usage examples, how it works)
2. `.claude/CLAUDE.md` — project guide for Claude (architecture decisions, key files)
3. `.claude/MEMORY.md` — technical gotchas and lessons learned
