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

The current implementation is still concentrated in `background.js` and `popup/popup.js`. Future work must avoid stacking a second main responsibility directly into either file.

| Directory / File | Responsibility |
|---|---|
| `manifest.json` | MV3 config, 8 permissions + host_permissions scoped to `opencode.ai` |
| `background.js` | Service Worker: account CRUD, cookie capture, DNR sync, queries, notifications, alarms, and message dispatch |
| `popup/popup.js` | Popup entry and UI logic: usage display, account management, login-state refresh, settings, and diagnostics |
| `popup/popup.html` | Popup page structure, `<script type="module">` loads popup.js |
| `popup/popup.css` | Popup styles; keep the visual language light, clear, and consistent with the current UI |
| `lib/protocol.js` | Server-function request protocol, argument serialization, and response normalization |
| `lib/seroval-parser.js` | Seroval parser; pure string parsing, CSP-safe (no eval/new Function) |

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
- Popup ↔ Service Worker communication uses `chrome.runtime.sendMessage`; the Service Worker dispatches with `switch(message.type)` + `return true` for async responses. The message router owns dispatch only and must not keep absorbing long business implementations. Use verb-noun message types such as `getAccounts`, `captureFromActiveTab`, and `saveCurrentAccount`.
- Alarm polling uses `chrome.alarms` instead of `setTimeout/setInterval`; pollIntervalMinutes is configurable. Sync alarm state on every SW wake (module level), with `onStartup` and `onInstalled` as supplemental fallbacks.
- Notification system supports 4 types: auth invalid, usage warning (>warnPercent%), usage exhausted (100%), usage recovered. Minimum 30-minute repeat window (NOTIFY_REPEAT_MS) per account per type. Notification IDs use the format `oc:{kind}:{accountId}:{timestamp}`.
- Account data model: `{ id, name, workspaceId, cookie, includeUsageList }`. `id` is generated as `acct_{timestamp}_{random}`, `workspaceId` is the global unique identifier. Import merges deduplicated by `workspaceId`.
- Never use `eval`, `new Function`, or external CDN scripts in the extension. seroval-parser.js uses pure string parsing (verified CSP-safe).
- Currently distributed via ontology git repository, not depending on Chrome Web Store auto-update. Users install via "Load unpacked", and must reload the extension after updates.
- Pure helpers for URL parsing, auth cookie extraction, workspace recognition, and login-state comparison must have a single canonical implementation. When the same logic appears a second time, extract a shared module before continuing.
- `_acct`, DNR injection, webRequest capture, and the browser's native login state are one protocol. Define that protocol in one place; do not let multiple files each invent their own if/else interpretation.
- `_acct` pages are protocol views, not the browser's native login state. When refreshing login state from an `_acct` page, hand control back to `https://opencode.ai/auth`; do not keep stitching the browser session onto the original `_acct` workspace.
- In popup code, state resolution and DOM rendering must stay separate. Dynamic lists must use event delegation; do not add more `dataset.*Bound`-style rebinding patches.
- `background.js` and `popup/popup.js` are current entry files. When new logic crosses into a second main responsibility, extract a module first; do not keep piling protocol logic, state machines, or notification templates back into the entry files.
- Silent checks read cache first and do not reload the page. Only explicit user actions such as “Refresh Login State” may navigate, reload, or jump to auth.
- Structural refactors start with tests, then code movement. Without regression coverage, do not perform large “behavior-preserving” restructures by inspection alone.

## 5. Testing

- Use the lightest local testing setup that is sufficient. The goal is coverage for pure logic first, not immediate full automation of Chrome APIs.
- The following changes must add or update automated tests:
  - URL / cookie / workspace / `_acct` protocol rules
  - account import/export and merge logic
  - usage aggregation, warning thresholds, and reset-time formatting
  - popup account-page state resolution
  - notification-state merge logic
  - DNR rule construction
- The following areas are not required to be automated first, but must stay thin and must have manual verification: `chrome.tabs.*`, `chrome.runtime.*`, `chrome.webRequest`, `chrome.declarativeNetRequest`, real popup open/close behavior, and real page navigation.
- Before structural refactors, add regression coverage at least for normal workspace silent detection, `_acct` fallback to the browser's native login state, import/merge behavior, and notification-state updates.
- When tests are added, place them under a local `tests/` directory and cover pure helpers, protocol rules, state resolution, and notification state before considering heavier browser integration tests.

## 6. User-Supplied Rules

- (This section is maintained by the user. The agent must not add, modify, delete, or reorder content here.)
