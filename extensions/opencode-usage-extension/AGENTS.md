---
name: OpenCode Usage Monitor AGENT RULES
description: Chrome extension for multi-account OpenCode AI usage monitoring, auto-captures cookies and polls usage.
---

# Agent Development Rules

## 1. Canonical References

Canonical references:

- Referral Rules: `.wopal/rules/chrome-extension.md`

## 2. Architecture and Directories

Runtime flow: user visits opencode.ai → webRequest captures cookie headers → saves to session storage → DNR dynamic rules inject the matching cookie on `_acct` queries → alarm polls all accounts periodically → popup reads snapshots from session storage.

| Directory / File | Responsibility |
|---|---|
| `manifest.json` | MV3 config, 8 permissions + host_permissions scoped to `opencode.ai` |
| `background.js` | Service Worker: account CRUD, webRequest cookie capture, DNR rule sync, alarm polling, notification management |
| `popup/popup.js` | Popup UI logic: usage visualization (5h/week/month windows), account management (auto-capture + manual add), settings, diagnostics panel |
| `popup/popup.html` | Popup page structure, `<script type="module">` loads popup.js |
| `popup/popup.css` | Popup styles, 360px width, GitHub-inspired color scheme |
| `lib/protocol.js` | Protocol layer: builds SolidStart server function requests, serializes args, parses Seroval responses, normalizes data |
| `lib/seroval-parser.js` | Seroval stream decoder, pure string parser, CSP-safe (no eval/new Function) |

## 3. Development Commands (build format test)

| Scenario | Command | When |
|---|---|---|
| Dev load | Open `chrome://extensions/` → enable Developer mode → Load unpacked → select this directory | First load or after source changes |
| Pack for store | `zip -r extension.zip . -x "*.git*" ".DS_Store"` | Preparing Chrome Web Store or Edge Add-ons submission |

No build toolchain (plain JavaScript ES modules, no compilation required).

## 4. Implementation Rules

- Follow the MV3 extension conventions in `.wopal/rules/chrome-extension.md`.
- All source files use ES modules (`"type": "module"`); Service Worker `background.type` must be `"module"`.
- All persistent state goes to `chrome.storage.local` (accounts, settings, health); transient capture data goes to `chrome.storage.session`. Never rely on Service Worker global variables.
- Cookie capture architecture: webRequest `onBeforeSendHeaders` read-only observes opencode.ai request headers → extracts Cookie header → stores in session storage. Register this listener at module-load time, not via lifecycle events.
- DNR dynamic rule management: one rule per account, IDs start at 1000 (`1000 + index`), urlFilter matches `||opencode.ai/*_acct=<accountId>`, action type `modifyHeaders` sets the Cookie header. Always remove existing rules before adding new ones to prevent ID conflicts.
- Server function requests use `credentials: "omit"` to prevent the browser from auto-sending cookies; DNR rules inject the corresponding account cookie. Never share or leak cookie data between different accounts.
- Popup ↔ Service Worker communication via `chrome.runtime.sendMessage` message pattern; Service Worker dispatches with `switch(message.type)` + `return true` for async responses. Message types named with verb-noun phrases like `getAccounts`, `triggerCapture`, `saveCurrentAccount`.
- Alarm polling uses `chrome.alarms` instead of `setTimeout/setInterval`; pollIntervalMinutes is configurable. Sync alarm state on every SW wake (module level), with `onStartup` and `onInstalled` as supplemental fallbacks.
- Notification system supports 4 types: auth invalid, usage warning (>warnPercent%), usage exhausted (100%), usage recovered. Minimum 30-minute repeat window (NOTIFY_REPEAT_MS) per account per type. Notification IDs use the format `oc:{kind}:{accountId}:{timestamp}`.
- Account data model: `{ id, name, workspaceId, cookie, includeUsageList }`. `id` is generated as `acct_{timestamp}_{random}`, `workspaceId` is the global unique identifier. Import merges deduplicated by `workspaceId`.
- Never use `eval`, `new Function`, or external CDN scripts in the extension. seroval-parser.js uses pure string parsing (verified CSP-safe).
- Currently distributed via ontology git repository, not depending on Chrome Web Store auto-update. Users install via "Load unpacked", and must reload the extension after updates.

## 5. Testing

- Follow TDD: write a failing test first, then implement code to make it pass.
- The project currently lacks a test framework and test infrastructure. When adding new features, set up a `vitest` environment; prioritize unit tests for pure functions in `lib/` (seroval parser, data normalization, warning logic).
- Manual test coverage: single/multi-account cookie capture, DNR rule injection verification, alarm polling triggers, notification dedup, account import/export round-trip, state recovery after long-running SW reawakening.

## 6. User-Supplied Rules

- (This section is maintained by the user. The agent must not add, modify, delete, or reorder content here.)
