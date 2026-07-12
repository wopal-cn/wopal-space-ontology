---
name: OpenCode Usage Monitor AGENT RULES
description: Chrome 扩展，多账号 OpenCode AI 用量监控，自动采集 cookie 并轮询用量。
---

# Agent Development Rules

## 1. Canonical References

Canonical references:

- Referral Rules: `.wopal/rules/chrome-extension.md`

## 2. Architecture and Directories

运行时流：用户访问 opencode.ai 时 webRequest 捕获 cookie → 保存至 session storage → 通过 DNR 动态规则在 `_acct` 协议请求中注入对应 cookie → alarm 定时轮询所有账号用量 → popup 从 storage 读取快照并组合账号页状态。

当前实现仍主要集中在 `background.js` 和 `popup/popup.js` 两个入口文件中；后续开发必须避免继续在这两个文件里直接堆叠第二类职责。

| 目录 / 文件 | 职责 |
|---|---|
| `manifest.json` | MV3 配置，权限、host_permissions 与入口声明 |
| `background.js` | Service Worker：账号 CRUD、cookie 捕获、DNR 同步、查询、通知、alarm、message 分发 |
| `popup/popup.js` | Popup 入口与 UI 逻辑：用量展示、账号管理、登录状态刷新、设置、诊断 |
| `popup/popup.html` | Popup 页面结构 |
| `popup/popup.css` | Popup 样式，保持轻量、清晰、与整体风格一致 |
| `lib/protocol.js` | server function 请求协议、参数序列化、响应规范化 |
| `lib/seroval-parser.js` | Seroval 解析器，纯字符串解析，CSP 安全 |

## 3. Development Commands (build format test)

| Scenario | Command | When |
|---|---|---|
| Dev load | 打开 `chrome://extensions/` → 开启开发者模式 → 加载已解压的扩展 → 选择此目录 | 首次加载或源码变更后重新加载 |
| Pack for store | `zip -r extension.zip . -x "*.git*" ".DS_Store"` | 准备 Chrome Web Store 或 Edge Add-ons 提交包 |

无构建工具链（纯 JavaScript ES modules，无需编译）。

## 4. Implementation Rules

- 遵循 `.wopal/rules/chrome-extension.md` 中的 MV3 扩展开发规范。
- 所有源文件使用 ES modules（`"type": "module"`），Service Worker 的 `background.type` 设为 `"module"`。
- 所有持久化状态写入 `chrome.storage.local`（账号、设置、健康状态）；临时捕获数据写入 `chrome.storage.session`，禁止依赖 Service Worker 全局变量。
- Cookie 捕获架构：webRequest `onBeforeSendHeaders` 只读观察 opencode.ai 请求头 → 提取 Cookie → 存入 session storage。Service Worker 模块级初始化即注册此监听器，不依赖生命周期事件。
- DNR 动态规则管理：每账号一条，ID 从 1000 起递增（`1000 + index`），urlFilter 匹配 `||opencode.ai/*_acct=<accountId>`，动作类型 `modifyHeaders` 设置 Cookie 头。规则变更必须先移除所有现有规则再添加新规则，防止 ID 冲突。
- server function 请求使用 `credentials: "omit"` 阻止浏览器自动发送 cookie，由 DNR 规则注入对应账号的 cookie。禁止共享/泄露不同账号间的 cookie 数据。
- Popup ↔ Service Worker 通信使用 `chrome.runtime.sendMessage` 消息模式；Service Worker 端使用 `switch(message.type)` 分发 + `return true` 支持异步响应。**message router 只负责分发，不继续承载长业务实现**。消息类型以 `getAccounts`、`captureFromActiveTab`、`saveCurrentAccount` 等动宾短语命名。
- Alarm 轮询使用 `chrome.alarms` 而非 `setTimeout/setInterval`，pollIntervalMinutes 默认可配置。每次 SW 唤醒（模块级）时同步 alarm 状态，`onStartup` 和 `onInstalled` 作为补充。
- 通知系统支持 4 种类型：auth 失效、用量警告（>warnPercent%）、用量耗尽（100%）、用量恢复。同账号同类型通知最小间隔 30 分钟（NOTIFY_REPEAT_MS），通过通知 ID 解析 `oc:{kind}:{accountId}:{timestamp}` 格式来区分。
- 账号数据模型：`{ id, name, workspaceId, cookie, includeUsageList }`。`id` 使用 `acct_{timestamp}_{random}` 生成，`workspaceId` 为全局唯一标识符。导入备份时依据 `workspaceId` 去重合并。
- 禁止在扩展中使用 `eval`、`new Function`、外部 CDN 加载脚本。seroval-parser.js 使用纯字符串解析（已验证 CSP 安全）。
- 当前通过 ontology git 仓库分发，不依赖 Chrome Web Store 自动更新。用户通过「加载已解压的扩展」安装，更新时需重新加载。
- URL / cookie / workspace / 登录态比较这类纯 helper 只允许保留一份权威实现；出现第二处同类逻辑时，必须先抽共享模块。
- `_acct`、DNR 注入、webRequest 捕获、浏览器原生登录态属于同一套协议；协议规则必须集中定义，禁止分散在多个文件各写一套判断。
- `_acct` 页面不是浏览器原生登录态。此页面刷新登录状态时，必须交回 `https://opencode.ai/auth`，禁止在原 `_acct` workspace 上继续拼浏览器 session。
- Popup 中“状态判定”和“DOM 渲染”必须分开；动态列表默认使用事件委托，禁止继续增加 `dataset.*Bound` 式补丁。
- `background.js` / `popup/popup.js` 是现有入口文件。新增逻辑一旦跨入第二个主职责，必须先抽模块，再继续实现，禁止继续把协议、状态机或通知模板直接堆回入口文件。
- 静默检查优先读缓存，不主动 reload；只有用户明确点击“刷新登录状态”这类显式动作时，才允许导航、reload 或跳转 auth。
- 结构重构先补测试，再拆代码。没有回归护栏时，不得做大范围行为保持重构。

## 5. Testing

- 当前项目先采用**最轻本地测试**；重点是给纯逻辑加护栏，不要求一开始就把 Chrome API 全量自动化。
- 以下改动**必须补自动测试**：
  - URL / cookie / workspace / `_acct` 协议规则
  - 账号导入导出与合并逻辑
  - 用量统计、告警阈值、重置时间文案
  - popup 账号页状态解析
  - 通知状态合并逻辑
  - DNR rule 构造逻辑
- 以下部分**不强制先做自动化**，但必须保持边界薄并补手工验证：`chrome.tabs.*`、`chrome.runtime.*`、`chrome.webRequest`、`chrome.declarativeNetRequest`、真实 popup 开关与页面跳转。
- 结构性重构前必须先补 regression test；至少兜住普通 workspace 静默识别、`_acct` 页面切回浏览器原生登录态、导入合并、通知状态更新。
- 新增测试时，优先放在模块根下的 `tests/` 目录，先覆盖纯 helper、协议规则、状态解析和通知状态，再考虑更重的浏览器集成测试。

## 6. User-Supplied Rules

- （此节由用户自行维护，Agent 不得增删改其中的内容）
