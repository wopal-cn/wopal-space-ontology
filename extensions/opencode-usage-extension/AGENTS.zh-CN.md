---
name: OpenCode Usage Monitor AGENT RULES
description: Chrome 扩展，多账号 OpenCode AI 用量监控，自动采集 cookie 并轮询用量。
---

# Agent Development Rules

## 1. Canonical References

Canonical references:

- Referral Rules: `.wopal/rules/chrome-extension.md`

## 2. Architecture and Directories

运行时流：用户访问 opencode.ai 时 webRequest 捕获 cookie → 保存至 session storage → 通过 DNR 动态规则在 _acct 查询中注入对应 cookie → alarm 定时轮询所有账号用量 → popup 从 session storage 读取快照展示。

| Directory / File | Responsibility |
|---|---|
| `manifest.json` | MV3 配置，8 项权限 + host_permissions 限定 `opencode.ai` |
| `background.js` | Service Worker：账号 CRUD、webRequest cookie 捕获、DNR 规则同步、alarm 轮询、通知管理 |
| `popup/popup.js` | Popup UI 逻辑：用量可视化（5h/周/月三个窗口）、账号管理（自动捕获+手动添加）、设置、诊断面板 |
| `popup/popup.html` | Popup 页面结构，`<script type="module">` 加载 popup.js |
| `popup/popup.css` | Popup 样式，360px 宽度，GitHub 风格配色 |
| `lib/protocol.js` | 协议层：构建 SolidStart server function 请求、序列化参数、解析 Seroval 响应、数据规范化 |
| `lib/seroval-parser.js` | Seroval 流解码器，纯字符串解析，CSP 安全（无 eval/new Function） |

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
- Popup ↔ Service Worker 通信使用 `chrome.runtime.sendMessage` 消息模式；Service Worker 端使用 `switch(message.type)` 分发 + `return true` 支持异步响应。消息类型以 `getAccounts`、`triggerCapture`、`saveCurrentAccount` 等动宾短语命名。
- Alarm 轮询使用 `chrome.alarms` 而非 `setTimeout/setInterval`，pollIntervalMinutes 默认可配置。每次 SW 唤醒（模块级）时同步 alarm 状态，`onStartup` 和 `onInstalled` 作为补充。
- 通知系统支持 4 种类型：auth 失效、用量警告（>warnPercent%）、用量耗尽（100%）、用量恢复。同账号同类型通知最小间隔 30 分钟（NOTIFY_REPEAT_MS），通过通知 ID 解析 `oc:{kind}:{accountId}:{timestamp}` 格式来区分。
- 账号数据模型：`{ id, name, workspaceId, cookie, includeUsageList }`。`id` 使用 `acct_{timestamp}_{random}` 生成，`workspaceId` 为全局唯一标识符。导入备份时依据 `workspaceId` 去重合并。
- 禁止在扩展中使用 `eval`、`new Function`、外部 CDN 加载脚本。seroval-parser.js 使用纯字符串解析（已验证 CSP 安全）。
- 当前通过 ontology git 仓库分发，不依赖 Chrome Web Store 自动更新。用户通过「加载已解压的扩展」安装，更新时需重新加载。

## 5. Testing

- 遵循 TDD：先编写失败测试，再实现代码使其通过。
- 当前项目无测试框架和测试基础设施。新增功能时需建立 `vitest` 测试环境，优先为 `lib/` 目录下的纯函数（seroval 解析器、数据规范化、告警逻辑）编写单元测试。
- 手动测试覆盖场景：单账号/多账号 cookie 捕获、DNR 规则注入验证、alarm 轮询触发、通知去重、账号导入导出来回路、长期运行后 SW 重新唤醒的状态恢复。

## 6. User-Supplied Rules

- （此节由用户自行维护，Agent 不得增删改其中的内容）
