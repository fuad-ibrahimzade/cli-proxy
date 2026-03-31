# cli-proxy2 Project Memory

## Project overview
Node.js CLI tool that routes any command through free proxies via sing-box. Sources self-heal and auto-discover from GitHub.

## Key technical details
- sing-box 1.13+ removed old TUN `inet4_address` field — use `mixed` inbound instead
- TUN mode requires root, won't work in Termux — mixed inbound on localhost is the solution
- Direct TCP proxy pre-tests give false positives — must verify through sing-box with real HTTP request
- ProxyScrape API: `format=json` is premium-only, use plain text format (no format param)
- ProxyScrape: empty `country=` param returns 0 results — omit param entirely when no countries specified
- GitHub code search API works without auth but is rate-limited
- MuRongPIG/Proxy-Master repo has 100k+ entries, too large — was replaced with sunny9577

## File structure
See CLAUDE.md for full details.

## Ports
- sing-box verification uses ports 12080-12099 (20 parallel instances)
- Final proxy for user command reuses the winning instance's port
