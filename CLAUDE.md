# Microsoft Reward V2

Edge Manifest V3 extension that automates Bing searches to earn Microsoft Rewards points using `chrome.debugger` (CDP).

## Commands

```bash
bun install                  # Install dependencies
bun run build                # Build extension (extension/build.ts)
cd extension && bun run build.ts  # Alternative: build from extension dir
```

## Loading the extension

1. `edge://extensions` → Developer mode ON
2. "Load unpacked" → select the `extension/` folder
3. Click the extension icon → check PC / Mobile → Start

## Architecture

```
extension/
  manifest.json         # Manifest V3
  popup.html            # Popup UI
  build.ts              # Bun build script (entrypoints: background.ts, popup.ts)
  src/
    background.ts       # Service worker: orchestration only (startSearches, performNextSearch, stopSearches, event listeners)
    popup.ts            # Popup logic: start/stop, progress display, rewards UI
    utils.ts            # Shared helpers: randomInt(), shuffle()
    cdp.ts              # CDP wrappers: cdpSend(), typeText(), pressEnter(), pressKey(), waitForPageLoad()
    state.ts            # Bot state: getState(), setState(), updateState() with mutex
    human-behavior.ts   # Human simulation: scrolling, mouse moves, random result clicks
    rewards.ts          # Rewards API: fetchRewardsInfo(), getRemainingSearches()
    terms.ts            # Search terms: fetchTrendingTerms() from Google Trends + static fallback
    tab-manager.ts      # Tab lifecycle: ensureTab() with debugger recovery
    search-terms.ts     # Static list of ~50 search terms
    types.ts            # Shared types (BotState, RewardsInfo, SearchMode, messages)
```

### Module dependency graph

```
background.ts  ←  orchestration entry point
  ├── cdp.ts           ← utils.ts
  ├── human-behavior.ts ← cdp.ts, state.ts, utils.ts
  ├── rewards.ts       ← types.ts
  ├── state.ts         ← types.ts
  ├── tab-manager.ts   ← cdp.ts, state.ts, types.ts
  ├── terms.ts         ← search-terms.ts, utils.ts
  └── utils.ts

popup.ts  ←  standalone UI entry point
  └── types.ts
```

### Data flow

1. **Popup** sends `start`/`stop`/`fetch-rewards` messages to the service worker
2. **background.ts** receives messages, calls `startSearches()` which sets up tab + debugger + state, then schedules searches via `chrome.alarms`
3. Each alarm triggers `performNextSearch()` which: gets terms → ensures tab → sets UA → types search → waits for load → simulates human behavior → schedules next alarm
4. **State** is persisted in `chrome.storage.session` — popup listens to `storage.onChanged` for live updates
5. `updateState()` uses a Promise-chain mutex to prevent read-modify-write race conditions

## Rules

- **Package manager**: Always use `bun` / `bunx` — never npm, yarn, or pnpm
- **Language**: TypeScript only, strict mode enabled
- **Browser**: Extension runs inside Edge — uses `chrome.debugger` API for CDP, no Puppeteer
- **User-Agent switching**: The bot switches UA between PC (Edge) and Mobile (Safari/iPhone) via `Emulation.setUserAgentOverride` — never hardcode a single UA
- **Search terms**: Trending terms fetched from Google Trends RSS, mixed with static fallback in `search-terms.ts` (~50 terms), cached in session storage
- **No credentials in code**: User must be logged in to their Microsoft account before starting — never store or automate credential entry
- **Error handling**: Catch errors per search iteration so one failure doesn't stop the entire batch — always log with `[MSR]` prefix
- **MV3 constraints**: All event listeners must be registered at top-level in the service worker — no lazy registration
- **State management**: Use `chrome.storage.session` for bot state — survives service worker restarts. Use `updateState()` mutex for read-modify-write operations
- **Module boundaries**: Keep modules focused — orchestration in `background.ts`, CDP in `cdp.ts`, etc. Constants stay in the module that uses them (no shared config file)
