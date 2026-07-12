---
trigger: model_decision
description: 开发 Chrome/Edge/Firefox 浏览器扩展时遵守此规则。覆盖 Manifest V3 规范、项目结构、权限管理、Service Worker 生命周期、安全策略、发布与分发。
keywords:
  - 'browser extension'
  - 'chrome extension'
  - 'manifest v3'
  - 'mv3'
  - 'service worker'
  - 'webextension'
---

# Chrome 浏览器扩展开发规范

## 版本要求

- 必须使用 **Manifest V3**（MV2 已停止审核）
- Chrome 85+ 支持，Edge 同理
- 如需兼容 Firefox，使用 WebExtensions API

## 项目结构

```
my-extension/
├── manifest.json              # 核心清单（必需，根目录）
├── background.js              # Service Worker（后台脚本，事件驱动）
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── options/
│   ├── options.html
│   └── options.js
├── content-scripts/
│   └── content.js             # 内容脚本（注入网页 DOM）
├── lib/
│   └── protocol.js            # 公共模块
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── _locales/
│   ├── en/messages.json       # 国际化
│   └── zh_CN/messages.json
├── package.json
└── vite.config.ts             # 推荐 Vite 构建
```

### 结构原则

- `manifest.json` **必须**放在项目根目录
- Service Worker 作为协调者（路由 + 权限 + 状态管理）
- UI 代码保持在 UI 文件中（popup/options）
- 页面交互逻辑保持在 content script 中
- 公共逻辑提取到 `lib/` 目录
- 构建产物输出到 `dist/`，加载时指向此目录

## manifest.json 规范

```json
{
  "manifest_version": 3,
  "name": "__MSG_extName__",
  "version": "1.0.0",
  "description": "__MSG_extDescription__",
  "permissions": [
    "storage",
    "alarms",
    "notifications"
  ],
  "host_permissions": [
    "https://example.com/*"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "content_scripts": [{
    "matches": ["https://example.com/*"],
    "js": ["content-scripts/content.js"],
    "run_at": "document_idle"
  }],
  "options_ui": {
    "page": "options/options.html",
    "open_in_tab": true
  },
  "default_locale": "en",
  "web_accessible_resources": [{
    "resources": ["assets/*"],
    "matches": ["https://example.com/*"]
  }]
}
```

## 权限管理

### 最小权限原则

- **只申请真正需要的权限**，每多一个权限就多一份审核风险
- `host_permissions` 使用具体域名，避免 `<all_urls>` 除非绝对必要
- 非必需的权限使用 `chrome.permissions.request()` 按需动态请求

```javascript
// 动态请求权限
chrome.permissions.request({
  permissions: ['activeTab'],
  origins: ['https://example.com/*']
}, (granted) => {
  if (!granted) {
    // 权限被拒绝时优雅降级
    notifyUser('部分功能需要授权才能使用');
  }
});
```

### 权限分类

| 权限类别 | 清单字段 | 说明 |
|----------|----------|------|
| 浏览器 API | `permissions` | `storage`, `alarms`, `notifications`, `tabs`, `webRequest` 等 |
| 主机访问 | `host_permissions` | `https://example.com/*`，指定可访问的域名 |
| 可选权限 | `optional_permissions` | 运行时动态请求，减少初次安装时的审核压力 |

## Service Worker 生命周期

### 核心规则

- Service Worker **不是常驻的**，浏览器会闲置后销毁
- 所有状态必须持久化（`chrome.storage`），不能依赖全局变量
- 使用 `chrome.alarms` API 实现定时任务

```javascript
// 正确：使用 storage 持久化状态
const STORAGE_KEY = 'appState';

async function getState() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || {};
}

async function saveState(partial) {
  const current = await getState();
  await chrome.storage.local.set({ [STORAGE_KEY]: { ...current, ...partial } });
}
```

### 初始化策略

```javascript
// 三重保障：模块级别 + onInstalled + onStartup
(async () => {
  // 1. 模块级别 — Service Worker 每次唤醒时执行
  await initAlarm();
  await initDnrRules();
})();

chrome.runtime.onInstalled.addListener(() => {
  // 2. 安装/更新时执行
  migrateState();
});

chrome.runtime.onStartup.addListener(() => {
  // 3. 浏览器启动时执行
  verifyState();
});
```

### 定时任务

```javascript
const ALARM_NAME = 'my-extension-monitor';

async function syncAlarm(settings) {
  if (settings.monitorEnabled) {
    await chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: settings.interval,
      periodInMinutes: settings.interval,
    });
  } else {
    await chrome.alarms.clear(ALARM_NAME);
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    performBackgroundTask();
  }
});
```

## 通信机制

### Popup ↔ Service Worker

```javascript
// popup.js — 发送消息
function send(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

// background.js — 接收消息（必须支持异步）
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'getData': {
          const data = await getData();
          sendResponse({ ok: true, data });
          return;
        }
        default:
          sendResponse({ ok: false, error: `Unknown: ${message.type}` });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true; // 异步响应时必须返回 true
});
```

### Content Script ↔ Service Worker

```javascript
// content-script.js — 发送请求
chrome.runtime.sendMessage({ type: 'pageAction', payload: { url: location.href } });

// Service Worker — 响应
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // sender.tab 包含来自哪个标签页的信息
});
```

### Popup ↔ Content Script（直接通信）

```javascript
// popup.js — 向当前标签页的 content script 发消息
async function sendToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  
  chrome.tabs.sendMessage(tab.id, message, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Content script not available');
    }
  });
}
```

## 安全规范

### 禁止项

- **禁止**执行远程代码（所有 JavaScript 必须打包在扩展内）
- **禁止**使用 `eval()` 或 `new Function()`
- **禁止**从 CDN 加载外部脚本

### CSP 安全

```json
// manifest.json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

### web_accessible_resources 精确控制

```json
{
  "web_accessible_resources": [{
    "resources": ["images/*", "fonts/*"],
    "matches": ["https://specific-domain.com/*"],
    "use_dynamic_url": true
  }]
}
```

### 数据存储安全

- 敏感数据（如 API key、cookie）使用 `chrome.storage.local`（不自动同步到云端）
- `chrome.storage.sync` 只用于用户偏好设置（每键最大 8KB，总额 100KB）
- 大体积数据使用 IndexedDB
- 不要将敏感信息硬编码在代码中

## 网络请求拦截

### 使用 declarativeNetRequest（推荐）

MV3 中 `webRequest` 的 blocking 模式已被移除，网络请求拦截应使用声明式 API：

```json
{
  "permissions": ["declarativeNetRequest"],
  "declarative_net_request": {
    "rule_resources": [{
      "id": "ruleset_1",
      "enabled": true,
      "path": "rules.json"
    }]
  }
}
```

```json
// rules.json
[{
  "id": 1,
  "priority": 1,
  "action": { "type": "block" },
  "condition": {
    "urlFilter": "||ads.example.com",
    "resourceTypes": ["script", "image"]
  }
}]
```

### webRequest 只读观察

如果只需要**读取**请求头（不修改），可以使用 webRequest 的非 blocking 模式：

```javascript
// 只读观察请求头 — 合法使用
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const cookie = extractCookie(details.requestHeaders);
    if (cookie) storeCapturedCookie(cookie);
  },
  { urls: ["https://api.example.com/*"] },
  ["requestHeaders", "extraHeaders"]
);
```

## 内容脚本 (Content Script)

```javascript
// content-script.js — 注入网页的脚本
// 注意：内容脚本运行在隔离的 world 中，不会与页面 JS 冲突

// 读取页面信息
const pageData = {
  title: document.title,
  url: location.href,
  selectedText: window.getSelection()?.toString(),
};

// 发送到 Service Worker
chrome.runtime.sendMessage({ type: 'pageData', payload: pageData });

// 接收来自 popup/background 的消息
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'getPageContent') {
    sendResponse({ content: document.body.innerText });
  }
});
```

## 图标要求

| 尺寸 | 用途 | 是否必需 |
|------|------|----------|
| 16x16 | 浏览器工具栏、地址栏 | 推荐 |
| 48x48 | 扩展管理页面 | 推荐 |
| 128x128 | Chrome Web Store 展示、安装对话框 | **必需** |

## 国际化（推荐）

```json
// _locales/en/messages.json
{
  "extName": { "message": "My Extension" },
  "extDescription": { "message": "Description here" }
}

// _locales/zh_CN/messages.json
{
  "extName": { "message": "我的扩展" },
  "extDescription": { "message": "扩展描述" }
}

// manifest.json 引用
{
  "name": "__MSG_extName__",
  "description": "__MSG_extDescription__",
  "default_locale": "en"
}
```

## 开发与构建

### 推荐工具链

- **Vite** + **CRXJS** 插件 — 支持热重载开发
- **TypeScript** — 类型安全
- **ESLint + Prettier** — 代码规范

```bash
# 开发
npm create vite@latest my-extension -- --template vanilla-ts
cd my-extension
npm install @crxjs/vite-plugin
# npm run dev → 热重载开发

# 构建
npm run build
# 产物在 dist/ 目录，加载为已解压扩展即可
```

### 调试技巧

- `chrome://extensions/` — 加载/管理扩展
- `chrome://inspect/#service-workers` — 调试 Service Worker
- Service Worker 使用 `console.log()` 输出日志，可在背景页审查中查看

## Service Worker 常见陷阱

| 错误做法 | 正确做法 | 原因 |
|----------|----------|------|
| 使用全局变量存状态 | 持久化到 `chrome.storage` | SW 随时可能被销毁 |
| 异步 `onMessage` 不返回 `true` | `return true` 标记异步 | 否则回调会被立即清理 |
| 用 `fetch` 发请求不带 `credentials: "omit"` | 明确指定凭据策略 | 避免浏览器自动泄露 cookies |
| 依赖 `setTimeout` 做定时任务 | 使用 `chrome.alarms` | SW 休眠后定时器失效 |
| 在 SW 中操作 DOM | SW 不能访问 DOM | 使用 content script 操作页面 |

## 发布与分发

### Chrome Web Store

1. 注册开发者：`$5` 一次性费用
2. 准备素材：128x128 图标 + 1280x800 截图（最多 5 张）
3. 打包：`zip -r extension.zip . -x "*.git*" "node_modules/*" ".svn*" ".DS_Store" "src/*"`
4. 提交流程：
   - 上传 ZIP
   - 填写商品详情（名称、描述、分类）
   - 填写隐私权规范（单一用途、权限理由、数据收集声明）
   - 提交审核（1-3 个工作日）

### 多平台分发

| 平台 | 费用 | 备注 |
|------|------|------|
| Chrome Web Store | $5（一次性） | **推荐**，用户安装体验最好 |
| Edge Add-ons | 免费 | Chrome 代码基本兼容 |
| Firefox Add-ons | 免费 | 需兼容 WebExtensions API |
| 自托管 | 免费 | 仅限 Linux 直接安装；Windows/macOS 需"加载已解压扩展"方式 |

### 自托管分发（内部/技术用户）

```bash
# 1. 打包 ZIP
zip -r my-extension-v1.0.zip . -x "*.git*" "node_modules/*" ".DS_Store" "src/*"

# 2. 上传到服务器

# 3. 用户安装步骤（macOS/Linux/Windows 通用）：
#    a. 下载并解压 ZIP
#    b. 打开 chrome://extensions/
#    c. 开启"开发者模式"
#    d. 点击"加载已解压的扩展程序" → 选择解压后的文件夹

# 4. 用户更新步骤：
#    a. 下载新版本 ZIP 并解压覆盖
#    b. 在 chrome://extensions/ 点击扩展的刷新按钮
```
