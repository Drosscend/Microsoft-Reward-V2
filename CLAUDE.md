# Microsoft Reward V2

Edge Manifest V3 extension that automates Bing searches to earn Microsoft Rewards points using `chrome.debugger` (CDP).

## Commands

```bash
bun install                  # Install dependencies
bun run build                # Build extension (extension/build.ts)
bun run typecheck            # tsc --noEmit
bun test                     # Unit tests (*.test.ts next to the module)
cd extension && bun run build.ts  # Alternative: build from extension dir
```

## Loading the extension

1. `edge://extensions` → Developer mode ON
2. "Load unpacked" → select the `extension/` folder
3. Click the extension icon → check the tasks → Start

## Architecture

```
extension/
  manifest.json         # Manifest V3
  popup.html            # Popup UI
  build.ts              # Bun build script (entrypoints → background.js, popup.js at root)
  src/
    shared/
      types.ts          # Shared types (BotState, RewardsInfo, SearchMode, messages)
      utils.ts          # Shared helpers: randomInt(), shuffle()
    modules/
      logger/
        logger.ts       # Activity logger: console + session storage
        index.ts        # → logActivity, clearActivityLog
      state/
        state.ts        # Bot state with mutex-protected updates
        index.ts        # → getDefaultState, getState, setState, updateState
      cdp/
        cdp.ts          # CDP wrappers: cdpSend(), typeText(), pressEnter(), pressKey(), waitForPageLoad()
        index.ts        # → cdpSend, typeText, pressEnter, pressKey, waitForPageLoad
      tabs/
        tab-manager.ts  # Tab lifecycle: ensureTab() with debugger recovery
        index.ts        # → ensureTab
      rewards/
        rewards.ts      # Rewards API: fetchRewards() (progress + explore cards), getRemainingSearches()
        types.ts        # Module-private: Promotion interface
        index.ts        # → fetchRewards, getRemainingSearches
      cards/
        explore-bing.ts    # Explore Bing: opens each card's bing.com destination and searches its topic
        index.ts           # → performExploreBing
      search/
        search.ts          # performNextSearch + startSearchPhase (extracted from background)
        human-behavior.ts  # Human simulation: scrolling, mouse moves, random result clicks
        terms.ts           # Search terms: Google Trends seeds expanded by Google Autocomplete
        index.ts           # → performNextSearch, startSearchPhase, getSearchTerms
      icon/
        icon.ts         # Dynamic toolbar icon from raw ImageData: blue when idle, green while running
        index.ts        # → setIconDefault, setIconRunning
    ui/
      popup.ts          # Popup logic: start/stop, progress display, rewards UI
    workers/
      background.ts     # Service worker: thin orchestration shell + MV3 event listeners
```

### Module dependency graph

```
workers/background.ts  ←  orchestration entry point (thin shell)
  ├── modules/cards/     ← cdp, logger, state, shared
  ├── modules/search/    ← cdp, logger, rewards, state, tabs, shared
  ├── modules/rewards/   ← logger, shared
  ├── modules/state/     ← shared
  ├── modules/logger/    ← shared
  └── modules/cdp/       ← shared

ui/popup.ts  ←  standalone UI entry point
  └── shared/types.ts
```

### Data flow

1. **Popup** sends `start`/`stop`/`fetch-rewards` messages to the service worker
2. **background.ts** receives messages, calls `startSearches()` which sets up tab + debugger + state, runs the Explore Bing phase, then delegates to `startSearchPhase()` for alarm-based searches
3. Each alarm triggers `performNextSearch()` (in `modules/search/`) which: gets terms → ensures tab → types search → waits for load → simulates human behavior → schedules next alarm
4. **State** is persisted in `chrome.storage.session` — popup listens to `storage.onChanged` for live updates
5. `updateState()` uses a Promise-chain mutex to prevent read-modify-write race conditions
6. Each module exposes its public API via `index.ts` barrel exports — internal types/helpers stay private

## Rules

- **Rewards site**: Edge forbids extensions from scripting, debugging or calling the server actions of rewards.bing.com, so daily set and more activities stay manual (popup links)
- **Package manager**: Always use `bun` / `bunx` — never npm, yarn, or pnpm
- **Language**: TypeScript only, strict mode enabled
- **Browser**: Extension runs inside Edge — uses `chrome.debugger` API for CDP, no Puppeteer
- **User-Agent**: Never override it (no `Emulation.setUserAgentOverride`); the bot keeps the browser's native UA
- **Search terms**: Google Trends RSS seeds (Rewards account country) expanded with Google Autocomplete (browser language), cached in session storage. No static fallback: if no terms come back, the bot refuses to start
- **No credentials in code**: User must be logged in to their Microsoft account before starting — never store or automate credential entry
- **Error handling**: Catch errors per search iteration so one failure doesn't stop the entire batch — always log with `[MSR]` prefix
- **MV3 constraints**: All event listeners must be registered at top-level in the service worker — no lazy registration
- **State management**: Use `chrome.storage.session` for bot state — survives service worker restarts. Use `updateState()` mutex for read-modify-write operations
- **Module boundaries**: Each module in `modules/` has an `index.ts` barrel export as its public API. Internal types/helpers are not exported. Constants stay in the module that uses them (no shared config file). Import other modules via their `index.ts` (e.g., `../cdp`, `../state`)
