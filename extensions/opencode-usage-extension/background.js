// Service worker: account storage, cookie capture, DNR cookie injection,
// snapshot queries, alarm-based monitoring.

import {
  SERVER_FUNCTIONS,
  DEFAULT_BASE_URL,
  callServerFunction,
  normalizeLiteSubscription,
  normalizeBilling,
  summarizeUsageRows,
  warningsForSnapshot,
} from "./lib/protocol.js";

const STORAGE_KEY = "opencodeAccounts";
const SETTINGS_KEY = "opencodeSettings";
const HEALTH_KEY = "opencodeAccountHealth";
const NOTIFY_STATE_KEY = "opencodeNotifyState";
const ALARM_NAME = "opencode-monitor";

const DEFAULT_SETTINGS = {
  warnPercent: 90,
  pollIntervalMinutes: 5,
  monitorEnabled: false,
};
const NOTIFY_REPEAT_MS = 30 * 60 * 1000;

const OPENCODE_REFERRAL_URL = "https://opencode.ai/go?ref=SHWS6GTKT2";
const OPENCODE_AUTH_URL = "https://opencode.ai/auth";
const OPENCODE_LOGOUT_URL = "https://opencode.ai/auth/logout";

const BACKUP_FORMAT = "opencode-usage-monitor.accounts.v1";

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------- Account storage ----------

export async function getAccounts() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}

async function saveAccounts(accounts) {
  await chrome.storage.local.set({ [STORAGE_KEY]: accounts });
  await syncDnrRules(accounts);
  await pruneAccountHealth(accounts);
  await pruneNotifyState(accounts);
}

async function getAccountHealth() {
  const result = await chrome.storage.local.get(HEALTH_KEY);
  return result[HEALTH_KEY] || {};
}

async function saveAccountHealth(health) {
  await chrome.storage.local.set({ [HEALTH_KEY]: health });
  await syncActionBadge(health);
}

async function getNotifyState() {
  const result = await chrome.storage.local.get(NOTIFY_STATE_KEY);
  return result[NOTIFY_STATE_KEY] || { lastAttemptAt: null, lastError: "", accounts: {} };
}

async function saveNotifyState(state) {
  await chrome.storage.local.set({ [NOTIFY_STATE_KEY]: state });
}

async function pruneAccountHealth(accounts) {
  const current = await getAccountHealth();
  const ids = new Set(accounts.map((account) => account.id));
  const next = Object.fromEntries(
    Object.entries(current).filter(([accountId]) => ids.has(accountId)),
  );
  await saveAccountHealth(next);
}

async function pruneNotifyState(accounts) {
  const current = await getNotifyState();
  const ids = new Set(accounts.map((account) => account.id));
  const next = {
    ...current,
    accounts: Object.fromEntries(
      Object.entries(current.accounts || {}).filter(([accountId]) => ids.has(accountId)),
    ),
  };
  await saveNotifyState(next);
}

async function syncActionBadge(health) {
  const invalidCount = Object.values(health || {}).filter((item) => item?.status === "invalid_auth").length;
  if (!chrome.action) return;
  await chrome.action.setBadgeBackgroundColor({ color: "#cf222e" }).catch(() => {});
  await chrome.action.setBadgeText({ text: invalidCount > 0 ? String(Math.min(invalidCount, 99)) : "" }).catch(() => {});
  await chrome.action.setTitle({
    title: invalidCount > 0
      ? `OpenCode 用量：${invalidCount} 个账号需要更新登录状态`
      : "OpenCode 用量",
  }).catch(() => {});
}

function createAccountId() {
  return `acct_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function ensureUniqueAccountId(preferredId, usedIds) {
  let id = preferredId || createAccountId();
  while (usedIds.has(id)) {
    id = createAccountId();
  }
  usedIds.add(id);
  return id;
}

function normalizeImportedAccount(raw) {
  const workspaceId = String(raw?.workspaceId || "").trim();
  const cookie = String(raw?.cookie || "").trim();
  if (!workspaceId || !/^wrk_[A-Z0-9]+$/.test(workspaceId)) {
    throw new Error("备份文件中的 workspaceId 无效。");
  }
  if (!cookie) {
    throw new Error(`账号 ${workspaceId} 缺少 cookie。`);
  }
  return {
    id: raw?.id ? String(raw.id).trim() : "",
    name: String(raw?.name || `Account ${workspaceId.slice(-6)}`).trim() || `Account ${workspaceId.slice(-6)}`,
    workspaceId,
    cookie,
    includeUsageList: !!raw?.includeUsageList,
  };
}

function normalizeImportedPayload(payload) {
  const accounts = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.accounts)
      ? payload.accounts
      : null;
  if (!accounts?.length) {
    throw new Error("备份文件中没有可导入的账号。");
  }
  return accounts.map(normalizeImportedAccount);
}

function mergeImportedAccounts(existingAccounts, importedAccounts) {
  const merged = new Map(existingAccounts.map((account) => [account.workspaceId, account]));
  const usedIds = new Set(existingAccounts.map((account) => account.id));
  let addedCount = 0;
  let replacedCount = 0;

  for (const imported of importedAccounts) {
    const existing = merged.get(imported.workspaceId);
    const id = existing?.id || ensureUniqueAccountId(imported.id, usedIds);
    merged.set(imported.workspaceId, {
      id,
      name: imported.name,
      workspaceId: imported.workspaceId,
      cookie: imported.cookie,
      includeUsageList: imported.includeUsageList,
    });
    if (existing) {
      replacedCount += 1;
    } else {
      addedCount += 1;
    }
  }

  return {
    accounts: Array.from(merged.values()),
    addedCount,
    replacedCount,
  };
}

function buildBackupPayload(accounts) {
  return {
    format: BACKUP_FORMAT,
    exportedAt: new Date().toISOString(),
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      workspaceId: account.workspaceId,
      cookie: account.cookie,
      includeUsageList: !!account.includeUsageList,
    })),
  };
}

function buildBackupFileName() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `opencode-accounts-backup-${stamp}.json`;
}

function resolveIncludeUsageList(existingAccount, requestedValue) {
  return typeof requestedValue === "boolean"
    ? requestedValue
    : !!existingAccount?.includeUsageList;
}

function getAuthCookieValue(cookieHeader) {
  const match = String(cookieHeader || "").match(/(?:^|;\s*)auth=([^;]+)/);
  return match ? match[1] : "";
}

function sameLoginCookie(left, right) {
  const leftAuth = getAuthCookieValue(left);
  const rightAuth = getAuthCookieValue(right);
  if (leftAuth && rightAuth) return leftAuth === rightAuth;
  return String(left || "").trim() === String(right || "").trim();
}

function hasAuthCookie(cookieHeader) {
  return !!getAuthCookieValue(cookieHeader);
}

function isAuthFailureError(error) {
  return /Cookie expired or not logged in|not logged in|expired|re-save this account/i.test(
    String(error || ""),
  );
}

function isAccountAuthInvalid(health, accountId) {
  return health?.[accountId]?.status === "invalid_auth";
}

function startOfDayTs(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function formatResetAt(snapshotTimestamp, resetInSec, fallback = "") {
  const baseMs = Date.parse(snapshotTimestamp || "");
  const seconds = Number(resetInSec || 0);
  if (!Number.isFinite(baseMs) || !Number.isFinite(seconds)) return fallback;

  const resetAt = new Date(baseMs + Math.max(0, seconds) * 1000);
  const now = new Date();
  const resetDay = startOfDayTs(resetAt);
  const today = startOfDayTs(now);
  const dayDiff = Math.round((resetDay - today) / 86400000);
  const hhmm = `${String(resetAt.getHours()).padStart(2, "0")}:${String(resetAt.getMinutes()).padStart(2, "0")}`;

  if (dayDiff === 0) return `今天 ${hhmm}`;
  if (dayDiff === 1) return `明天 ${hhmm}`;
  if (dayDiff === 2) return `后天 ${hhmm}`;

  const mmdd = `${String(resetAt.getMonth() + 1).padStart(2, "0")}${String(resetAt.getDate()).padStart(2, "0")}`;
  return `${mmdd} ${hhmm}`;
}

function getUsageWindows(snapshot) {
  return [
    ["5小时", snapshot.go?.rollingUsage],
    ["周", snapshot.go?.weeklyUsage],
    ["月", snapshot.go?.monthlyUsage],
  ]
    .filter(([, usage]) => usage)
    .map(([label, usage]) => ({ label, ...usage }));
}

function getUsageNotificationStatus(snapshot, warnPercent) {
  if (!snapshot?.ok || !snapshot.go?.active) return { state: "none" };
  const windows = getUsageWindows(snapshot);
  if (!windows.length) return { state: "none" };

  const exhausted = windows.filter((window) => window.usagePercent >= 100);
  if (exhausted.length) {
    const latestResetSec = Math.max(...exhausted.map((window) => Number(window.resetInSec || 0)));
    const labels = exhausted.map((window) => window.label).join("、") || "当前";
    const nextReset = formatResetAt(snapshot.timestamp, latestResetSec, "稍后");
    return {
      state: "exhausted",
      labels,
      availableAt: nextReset,
    };
  }

  const top = windows.reduce((best, current) =>
    !best || current.usagePercent > best.usagePercent ? current : best,
  null);
  if (top && top.usagePercent >= warnPercent) {
    return {
      state: "warning",
      label: top.label,
      usagePercent: top.usagePercent,
      resetAt: formatResetAt(snapshot.timestamp, top.resetInSec, "稍后"),
    };
  }

  return { state: "available" };
}

function buildNotificationId(kind, accountId) {
  return `oc:${kind}:${accountId}:${Date.now()}`;
}

function parseNotificationId(notificationId) {
  const match = String(notificationId || "").match(/^oc:([^:]+):([^:]+):(\d+)$/);
  if (!match) return null;
  return { kind: match[1], accountId: match[2], timestamp: Number(match[3]) };
}

function getCaptureWorkspaceId(details, referer) {
  const urlMatch = details.url?.match(/\/workspace\/(wrk_[A-Z0-9]+)/);
  if (urlMatch) return urlMatch[1];
  const wsMatch = referer?.match(/\/workspace\/(wrk_[A-Z0-9]+)/);
  return wsMatch ? wsMatch[1] : null;
}

function isPreferredCaptureRequest(details, referer) {
  try {
    const url = new URL(details.url);
    if (url.origin !== "https://opencode.ai") return false;
    if (url.searchParams.has("_acct")) return false;
    if (url.pathname === "/_server") return true;
    if (/^\/workspace\/wrk_[A-Z0-9]+(?:\/|$)/.test(url.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

function captureScore(data) {
  let score = data.cookie?.length || 0;
  if (hasAuthCookie(data.cookie)) score += 1000;
  if (data.workspaceId) score += 500;
  if (data.url?.includes("/_server")) score += 250;
  if (data.url?.includes("/workspace/")) score += 200;
  return score;
}

function extractCookieHeader(requestHeaders) {
  const cookieHeaders = (requestHeaders || [])
    .filter((header) => header.name?.toLowerCase() === "cookie")
    .map((header) => String(header.value || "").trim())
    .filter(Boolean);
  if (!cookieHeaders.length) return "";

  const cookieMap = new Map();
  for (const headerValue of cookieHeaders) {
    for (const part of headerValue.split(/;\s*/)) {
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      const name = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (!name) continue;
      cookieMap.set(name, value);
    }
  }

  return Array.from(cookieMap.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function isCaptureCandidate(captured, since, tabId) {
  return !!(
    captured?.cookie
    && captured.capturedAt >= since
    && captured.tabId === tabId
    && hasAuthCookie(captured.cookie)
  );
}

async function getSettings() {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(result[SETTINGS_KEY] || {}) };
}

async function saveSettings(partial) {
  const current = await getSettings();
  const next = { ...current, ...partial };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  await syncAlarm(next);
  return next;
}

// ---------- Cookie auto-capture via webRequest ----------

// webRequest.onBeforeSendHeaders can read the Cookie request header even when
// it's HttpOnly (chrome.cookies API cannot). We observe opencode.ai requests
// and stash the latest real browser cookie + workspace pair.

const CAPTURE_KEY = "opencodeCaptured";
const CAPTURE_WAIT_MS = 15000;
const CAPTURE_POLL_MS = 250;
const CAPTURE_SETTLE_MS = 400;
const CAPTURE_MIN_COLLECT_MS = 700;
const TEMP_CAPTURE_RULE_ID = 999999;

async function getCaptured() {
  const result = await chrome.storage.session.get(CAPTURE_KEY);
  return result[CAPTURE_KEY] || null;
}

async function setCaptured(data) {
  const current = await getCaptured();
  const sameCookie = current?.cookie && data.cookie === current.cookie;
  await chrome.storage.session.set({
    [CAPTURE_KEY]: {
      ...data,
      workspaceId: data.workspaceId || (sameCookie ? current?.workspaceId : null),
      capturedAt: data.capturedAt || Date.now(),
    },
  });
}

async function clearCaptured() {
  await chrome.storage.session.remove(CAPTURE_KEY);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isOpenCodeUrl(url) {
  try {
    const host = new URL(url).hostname;
    return host === "opencode.ai" || host.endsWith(".opencode.ai");
  } catch {
    return false;
  }
}

function capturedForResponse(captured) {
  return captured
    ? {
        cookieLen: captured.cookie?.length || 0,
        cookieHead: (captured.cookie || "").slice(0, 40),
        workspaceId: captured.workspaceId,
        email: captured.email,
        capturedAt: captured.capturedAt,
        tabId: captured.tabId,
      }
    : null;
}

async function findOpenCodeTab() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active?.id && isOpenCodeUrl(active.url)) return active;
  return null;
}

// Find an existing opencode.ai tab to reuse, preferring the active one.
// Covers opencode.ai and any subdomain (auth.opencode.ai, etc.).
async function findReusableOpenCodeTab() {
  const tabs = await chrome.tabs.query({
    url: ["https://opencode.ai/*", "https://*.opencode.ai/*"],
  });
  if (!tabs.length) return null;
  const active = tabs.find((t) => t.active && t.id);
  return active || tabs.find((t) => t.id) || null;
}

// Focus the window that owns the given tab so the user actually sees it.
async function focusTabWindow(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.windowId != null) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
  } catch {
    // tab may have been closed; ignore.
  }
}

async function openReferralThenAuth(tabId) {
  await chrome.tabs.update(tabId, { url: OPENCODE_REFERRAL_URL, active: true });
  await sleep(1500);
  await chrome.tabs.update(tabId, { url: OPENCODE_AUTH_URL, active: true });
}

// Login entry: go straight to /auth. Reuse an existing opencode tab if any,
// otherwise open a new one. Activates the target tab (popup will close —
// Chrome closes the popup whenever it loses focus, this is unavoidable).
async function openOpenCodeEntryFlow() {
  const reuse = await findReusableOpenCodeTab();
  if (reuse?.id) {
    await chrome.tabs.update(reuse.id, { url: OPENCODE_AUTH_URL, active: true });
    await focusTabWindow(reuse.id);
    return { openedNew: false };
  }
  const tab = await chrome.tabs.create({ url: OPENCODE_AUTH_URL, active: true });
  if (!tab?.id) throw new Error("无法打开 OpenCode 登录页面。");
  return { openedNew: true };
}

// New-account entry: logout → referral → /auth. Reuse any existing opencode
// tab (regardless of how many); only create a new tab when none exists.
async function openOpenCodeNewAccountFlow() {
  await clearCaptured().catch(() => {});
  const reuse = await findReusableOpenCodeTab();
  let tabId = reuse?.id;
  if (tabId) {
    await chrome.tabs.update(tabId, { url: OPENCODE_LOGOUT_URL, active: true });
    await focusTabWindow(tabId);
  } else {
    const tab = await chrome.tabs.create({ url: OPENCODE_LOGOUT_URL, active: true });
    tabId = tab?.id;
  }
  if (!tabId) throw new Error("无法打开 OpenCode 页面。");
  await sleep(900);
  await openReferralThenAuth(tabId);
}

async function openAccountNotificationTarget(kind, accountId) {
  const accounts = await getAccounts();
  const account = accounts.find((item) => item.id === accountId);
  if (!account) {
    await openOpenCodeEntryFlow();
    return;
  }

  const url = kind === "auth"
    ? `${DEFAULT_BASE_URL}/workspace/${encodeURIComponent(account.workspaceId)}/go`
    : `${DEFAULT_BASE_URL}/workspace/${encodeURIComponent(account.workspaceId)}/go?_acct=${encodeURIComponent(account.id)}`;
  await chrome.tabs.create({ url, active: true });
}

async function waitForBestCapture(since, tabId, timeoutMs = CAPTURE_WAIT_MS) {
  const deadline = Date.now() + timeoutMs;
  const minCollectUntil = Math.min(deadline, Date.now() + CAPTURE_MIN_COLLECT_MS);
  let best = null;
  let lastImprovedAt = 0;

  while (Date.now() < deadline) {
    const captured = await getCaptured();
    if (isCaptureCandidate(captured, since, tabId)) {
      const better =
        !best
        || captureScore(captured) > captureScore(best)
        || (captureScore(captured) === captureScore(best) && captured.capturedAt > best.capturedAt);
      if (better) {
        best = { ...captured };
        lastImprovedAt = Date.now();
      }
    }

    if (best && Date.now() >= minCollectUntil && Date.now() - lastImprovedAt >= CAPTURE_SETTLE_MS) {
      return best;
    }
    await sleep(CAPTURE_POLL_MS);
  }

  return best;
}

// Fetch the workspace page HTML with the captured cookie and extract the
// user email from the server-rendered user-menu component. The request uses
// the _acct query param so DNR injects the right cookie (credentials:"omit"
// means the browser cookie won't be sent; DNR supplies it).
async function fetchAccountEmail(cookie, workspaceId, accountId) {
  try {
    const sep = accountId ? "?_acct=" + encodeURIComponent(accountId) : "";
    const res = await fetch(
      `https://opencode.ai/workspace/${workspaceId}/go${sep}`,
      {
        headers: { "User-Agent": "opencode-usage-ext/1.0" },
        credentials: "omit",
        redirect: "manual",
      },
    );
    if (res.status !== 200) return null;
    const html = await res.text();
    const m = html.match(/data-component="user-menu"[^>]*>[\s\S]*?>([^<]+@[^<]+)</);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

function buildTempCaptureRule(accountId, cookie) {
  return {
    id: TEMP_CAPTURE_RULE_ID,
    priority: 10,
    action: {
      type: "modifyHeaders",
      requestHeaders: [
        { header: "cookie", operation: "set", value: cookie },
      ],
    },
    condition: {
      urlFilter: `||opencode.ai/*_acct=${accountId}`,
      resourceTypes: ["xmlhttprequest", "other", "main_frame", "sub_frame"],
    },
  };
}

async function installTempCaptureRule(accountId, cookie) {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [TEMP_CAPTURE_RULE_ID],
    addRules: [buildTempCaptureRule(accountId, cookie)],
  });
}

async function removeTempCaptureRule() {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [TEMP_CAPTURE_RULE_ID],
  });
}

async function validateCapturedCookie(captured) {
  if (!captured?.cookie || !captured.workspaceId || !hasAuthCookie(captured.cookie)) {
    return { ok: false, error: "捕获到的登录状态不完整。" };
  }

  const accountId = `acct_probe_${Date.now().toString(36)}`;
  await installTempCaptureRule(accountId, captured.cookie);
  try {
    await callServerFunction(
      { baseUrl: DEFAULT_BASE_URL, accountId },
      SERVER_FUNCTIONS.billingInfo,
      [captured.workspaceId],
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    await removeTempCaptureRule().catch(() => {});
  }
}

async function triggerCapture() {
  await clearCaptured();
  const tab = await findOpenCodeTab();
  if (!tab?.id) {
    throw new Error("未找到已打开的 opencode.ai 标签页。请先打开 opencode.ai 并完成登录。");
  }

  const accounts = await getAccounts();
  const health = await getAccountHealth();
  const startedAt = Date.now();
  await chrome.tabs.reload(tab.id, { bypassCache: true });
  const deadline = Date.now() + CAPTURE_WAIT_MS;
  let since = startedAt;
  let lastError = "";

  while (Date.now() < deadline) {
    const captured = await waitForBestCapture(since, tab.id, deadline - Date.now());
    if (!captured?.cookie) break;
    if (!captured.workspaceId) {
      lastError = "已捕获 cookie，但未识别 workspace。请让 opencode.ai 停在 workspace 页面后重试。";
      since = captured.capturedAt + 1;
      continue;
    }

    const existing = accounts.find((account) => account.workspaceId === captured.workspaceId);
    if (existing && !isAccountAuthInvalid(health, existing.id)) {
      return { captured, tabId: tab.id, tabUrl: tab.url };
    }

    const validation = await validateCapturedCookie(captured);
    if (validation.ok) {
      if (existing && sameLoginCookie(existing.cookie, captured.cookie)) {
        health[existing.id] = {
          status: "valid",
          lastCheckedAt: new Date().toISOString(),
          lastError: "",
        };
        await saveAccountHealth(health);
      }
      return { captured, tabId: tab.id, tabUrl: tab.url };
    }
    lastError = validation.error || "捕获到的登录状态无效。";
    since = captured.capturedAt + 1;
  }

  throw new Error(
    lastError
      ? `捕获到的登录状态无效：${lastError}`
      : "刷新已打开的 opencode.ai 页面后仍未捕获有效登录状态，请确认页面已登录完成。",
  );
}

function setupWebRequestCapture() {
  // Capture Cookie header from any opencode.ai request (not just /_server).
  // The workspace HTML page also sends cookies, so we can capture even if
  // the page hasn't fully hydrated yet. /_server requests give us the
  // workspaceId from the Referer; navigation requests give it from the URL.
  const captureFromDetails = (details) => {
    if (!details.url?.startsWith("https://opencode.ai/")) return;
    const referer = details.requestHeaders?.find(
      (h) => h.name.toLowerCase() === "referer",
    )?.value;
    if (!isPreferredCaptureRequest(details, referer)) return;
    const cookieHeader = extractCookieHeader(details.requestHeaders);
    if (!cookieHeader) return;
    if (!hasAuthCookie(cookieHeader)) return;
    // Skip requests that are tagged with _acct — those are our own DNR-injected
    // queries, not real user navigation. We only want the browser's real cookie.
    if (details.url.includes("_acct=")) return;
    const workspaceId = getCaptureWorkspaceId(details, referer);
    setCaptured({
      cookie: cookieHeader,
      workspaceId,
      tabId: details.tabId,
      url: details.url,
      capturedAt: Date.now(),
    }).catch(() => {});
  };

  // Match all opencode.ai requests, including navigation and XHR.
  chrome.webRequest.onBeforeSendHeaders.addListener(
    captureFromDetails,
    { urls: ["https://opencode.ai/*"] },
    ["requestHeaders", "extraHeaders"],
  );
}

// ---------- DNR rule management ----------

// Each account gets one dynamic DNR rule. The rule matches requests to
// /_server?_acct=<accountId> and sets the Cookie header to the saved value.
// credentials:"omit" on the fetch side keeps the browser cookie out so the
// DNR-injected value is authoritative.
async function syncDnrRules(accounts) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map((r) => r.id);

  const addRules = accounts.map((acct, index) => ({
    id: 1000 + index,
    priority: 1,
    action: {
      type: "modifyHeaders",
      requestHeaders: [
        { header: "cookie", operation: "set", value: acct.cookie },
      ],
    },
    condition: {
      urlFilter: `||opencode.ai/*_acct=${acct.id}`,
      resourceTypes: ["xmlhttprequest", "other", "main_frame", "sub_frame"],
    },
  }));

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
  } catch (e) {
    console.error("[opencode-monitor] syncDnrRules failed:", e, "rules:", addRules);
    throw e;
  }
}

// ---------- Snapshot query ----------

export async function queryAccount(account, settings) {
  const opts = { baseUrl: DEFAULT_BASE_URL, accountId: account.id };
  const workspaceId = account.workspaceId;
  if (!workspaceId) {
    throw new Error("Workspace id not set for this account.");
  }

  const [billing, lite] = await Promise.all([
    callServerFunction(opts, SERVER_FUNCTIONS.billingInfo, [workspaceId]).catch((e) => {
      throw new Error(`billing: ${e.message} [cookieLen=${account.cookie?.length || 0}]`);
    }),
    callServerFunction(opts, SERVER_FUNCTIONS.liteSubscription, [workspaceId]).catch((e) => {
      throw new Error(`subscription: ${e.message} [cookieLen=${account.cookie?.length || 0}]`);
    }),
  ]);

  const snapshot = {
    timestamp: new Date().toISOString(),
    accountId: account.id,
    accountName: account.name,
    workspaceId,
    billing: normalizeBilling(billing),
    go: normalizeLiteSubscription(lite),
  };

  if (account.includeUsageList) {
    const rows = await callServerFunction(opts, SERVER_FUNCTIONS.usageList, [workspaceId, 0]).catch(
      () => null,
    );
    if (Array.isArray(rows)) {
      snapshot.usageList = {
        count: rows.length,
        summary: summarizeUsageRows(rows),
      };
    }
  }

  snapshot.warnings = warningsForSnapshot(snapshot, settings.warnPercent);
  snapshot.ok = true;
  return snapshot;
}

async function queryAllAccounts() {
  const accounts = await getAccounts();
  const settings = await getSettings();
  const results = await Promise.all(
    accounts.map((acct) =>
      queryAccount(acct, settings).catch((e) => ({
        accountId: acct.id,
        accountName: acct.name,
        ok: false,
        error: e.message,
        timestamp: new Date().toISOString(),
      })),
    ),
  );
  await chrome.storage.session.set({ lastSnapshots: results, lastQueryAt: Date.now() });
  await updateAccountHealthFromResults(accounts, results, settings);
  return results;
}

async function updateAccountHealthFromResults(accounts, results, settings) {
  const previous = await getAccountHealth();
  let notifyState = await getNotifyState();
  const next = {};

  for (const account of accounts) {
    const result = results.find((item) => item.accountId === account.id);
    if (!result) continue;

    const prevUsageState = previous[account.id]?.usageState || "none";

    if (result.ok) {
      const usageStatus = getUsageNotificationStatus(result, settings.warnPercent);
      next[account.id] = {
        status: "valid",
        usageState: usageStatus.state,
        lastCheckedAt: result.timestamp || new Date().toISOString(),
        lastError: "",
      };

      if (prevUsageState !== "exhausted" && usageStatus.state === "exhausted") {
        notifyState = await notifyUsageExhausted(account, usageStatus, notifyState);
      } else if (prevUsageState === "exhausted" && usageStatus.state !== "exhausted") {
        notifyState = await notifyUsageRecovered(account, notifyState);
      } else if ((prevUsageState === "none" || prevUsageState === "available") && usageStatus.state === "warning") {
        notifyState = await notifyUsageWarning(account, usageStatus, notifyState);
      }

      continue;
    }

    const invalidAuth = isAuthFailureError(result.error);
    next[account.id] = {
      status: invalidAuth ? "invalid_auth" : "error",
      usageState: "none",
      lastCheckedAt: result.timestamp || new Date().toISOString(),
      lastError: result.error || "",
    };

    if (invalidAuth) {
      const previousInvalid = previous[account.id]?.status === "invalid_auth";
      const lastNotifiedAt = notifyState.accounts?.[account.id]?.authLastNotifiedAt || notifyState.accounts?.[account.id]?.lastNotifiedAt || 0;
      if (!previousInvalid || Date.now() - lastNotifiedAt >= NOTIFY_REPEAT_MS) {
        notifyState = await notifyInvalidAuth(account, notifyState);
      }
    }
  }

  await saveAccountHealth(next);
}

async function createNotification(id, options) {
  return new Promise((resolve) => {
    chrome.notifications?.create(id, options, (notificationId) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        resolve({ ok: false, error: runtimeError.message || "通知发送失败" });
        return;
      }
      resolve({ ok: !!notificationId, id: notificationId, error: notificationId ? "" : "通知未显示" });
    });
  });
}

async function notifyInvalidAuth(account, notifyState) {
  const result = await createNotification(buildNotificationId("auth", account.id), {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "OpenCode 登录已失效",
    message: `${account.name} 需要重新登录并更新账号。`,
    priority: 2,
  });

  const prev = notifyState.accounts?.[account.id] || {};
  const nextState = {
    ...notifyState,
    lastAttemptAt: new Date().toISOString(),
    lastError: result.ok ? "" : result.error || "通知发送失败",
    accounts: {
      ...(notifyState.accounts || {}),
      [account.id]: {
        ...prev,
        lastNotifiedAt: result.ok ? Date.now() : prev.lastNotifiedAt || 0,
        lastNotificationError: result.ok ? "" : result.error || "通知发送失败",
        authLastNotifiedAt: result.ok ? Date.now() : prev.authLastNotifiedAt || 0,
        authLastNotificationError: result.ok ? "" : result.error || "通知发送失败",
      },
    },
  };
  await saveNotifyState(nextState);
  return nextState;
}

async function notifyUsageWarning(account, usageStatus, notifyState) {
  const result = await createNotification(buildNotificationId("usage-warning", account.id), {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "OpenCode 用量接近上限",
    message: `${account.name} 的「${usageStatus.label}」窗口已达 ${usageStatus.usagePercent}%，预计 ${usageStatus.resetAt} 重置。`,
    priority: 1,
  });

  const prev = notifyState.accounts?.[account.id] || {};
  const nextState = {
    ...notifyState,
    lastAttemptAt: new Date().toISOString(),
    lastError: result.ok ? "" : result.error || "通知发送失败",
    accounts: {
      ...(notifyState.accounts || {}),
      [account.id]: {
        ...prev,
        lastNotifiedAt: result.ok ? Date.now() : prev.lastNotifiedAt || 0,
        lastNotificationError: result.ok ? "" : result.error || "通知发送失败",
        usageState: "warning",
        usageLastNotifiedAt: result.ok ? Date.now() : prev.usageLastNotifiedAt || 0,
        usageLastNotificationError: result.ok ? "" : result.error || "通知发送失败",
      },
    },
  };
  await saveNotifyState(nextState);
  return nextState;
}

async function notifyUsageExhausted(account, usageStatus, notifyState) {
  const result = await createNotification(buildNotificationId("usage-exhausted", account.id), {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "OpenCode 账号额度已用尽",
    message: `${account.name} 的「${usageStatus.labels}」窗口已用尽，预计 ${usageStatus.availableAt} 可恢复使用。`,
    priority: 2,
  });

  const prev = notifyState.accounts?.[account.id] || {};
  const nextState = {
    ...notifyState,
    lastAttemptAt: new Date().toISOString(),
    lastError: result.ok ? "" : result.error || "通知发送失败",
    accounts: {
      ...(notifyState.accounts || {}),
      [account.id]: {
        ...prev,
        lastNotifiedAt: result.ok ? Date.now() : prev.lastNotifiedAt || 0,
        lastNotificationError: result.ok ? "" : result.error || "通知发送失败",
        usageState: "exhausted",
        usageAvailableAt: usageStatus.availableAt,
        usageLastNotifiedAt: result.ok ? Date.now() : prev.usageLastNotifiedAt || 0,
        usageLastNotificationError: result.ok ? "" : result.error || "通知发送失败",
      },
    },
  };
  await saveNotifyState(nextState);
  return nextState;
}

async function notifyUsageRecovered(account, notifyState) {
  const result = await createNotification(buildNotificationId("usage-recovered", account.id), {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "OpenCode 账号已恢复可用",
    message: `${account.name} 现在可以继续使用这个账号了。`,
    priority: 2,
  });

  const prev = notifyState.accounts?.[account.id] || {};
  const nextState = {
    ...notifyState,
    lastAttemptAt: new Date().toISOString(),
    lastError: result.ok ? "" : result.error || "通知发送失败",
    accounts: {
      ...(notifyState.accounts || {}),
      [account.id]: {
        ...prev,
        lastNotifiedAt: result.ok ? Date.now() : prev.lastNotifiedAt || 0,
        lastNotificationError: result.ok ? "" : result.error || "通知发送失败",
        usageState: "available",
        usageAvailableAt: "",
        usageLastNotifiedAt: result.ok ? Date.now() : prev.usageLastNotifiedAt || 0,
        usageLastNotificationError: result.ok ? "" : result.error || "通知发送失败",
      },
    },
  };
  await saveNotifyState(nextState);
  return nextState;
}

async function sendTestNotification() {
  const notifyState = await getNotifyState();
  const result = await createNotification(`oc:test:${Date.now()}`, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "OpenCode 用量通知测试",
    message: "如果你看到了这条通知，说明浏览器扩展通知链路正常。",
    priority: 2,
  });
  const nextState = {
    ...notifyState,
    lastAttemptAt: new Date().toISOString(),
    lastError: result.ok ? "" : result.error || "通知发送失败",
  };
  await saveNotifyState(nextState);
  return result;
}

// ---------- Alarm-based background monitoring ----------

async function syncAlarm(settings) {
  if (settings.monitorEnabled && settings.pollIntervalMinutes > 0) {
    await chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: settings.pollIntervalMinutes,
      periodInMinutes: settings.pollIntervalMinutes,
    });
  } else {
    await chrome.alarms.clear(ALARM_NAME);
  }
}

async function getAlarmInfo() {
  try {
    const alarm = await chrome.alarms.get(ALARM_NAME);
    if (!alarm) return null;
    return {
      scheduledTime: new Date(alarm.scheduledTime).toISOString(),
      periodInMinutes: alarm.periodInMinutes,
      secondsUntilNext: Math.round((alarm.scheduledTime - Date.now()) / 1000),
    };
  } catch (e) {
    return { error: e.message };
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    console.log("[opencode-monitor] alarm fired, querying all accounts…");
    queryAllAccounts().catch((e) => {
      console.error("[opencode-monitor] alarm query failed:", e);
    });
  }
});

chrome.notifications?.onClicked.addListener((notificationId) => {
  const parsed = parseNotificationId(notificationId);
  if (!parsed?.accountId) return;
  openAccountNotificationTarget(parsed.kind, parsed.accountId).catch((e) => {
    console.error("[opencode-monitor] notification click open failed:", e);
  });
  chrome.notifications.clear(notificationId, () => {});
});

// ---------- Message API for popup ----------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case "getAccounts": {
          const accounts = await getAccounts();
          const settings = await getSettings();
          const health = await getAccountHealth();
          const notifyState = await getNotifyState();
          sendResponse({ ok: true, accounts, settings, health, notifyState });
          return;
        }
        case "getFooterStatus": {
          const settings = await getSettings();
          const alarmInfo = await getAlarmInfo();
          sendResponse({ ok: true, settings, alarmInfo });
          return;
        }
        case "testNotification": {
          const result = await sendTestNotification();
          sendResponse({ ok: result.ok, error: result.error || "" });
          return;
        }
        case "openOpenCodeEntry": {
          const result = await openOpenCodeEntryFlow();
          sendResponse({ ok: true, ...result });
          return;
        }
        case "openOpenCodeNewAccount": {
          await openOpenCodeNewAccountFlow();
          sendResponse({ ok: true });
          return;
        }
        case "exportAccounts": {
          const accounts = await getAccounts();
          sendResponse({
            ok: true,
            fileName: buildBackupFileName(),
            payload: buildBackupPayload(accounts),
          });
          return;
        }
        case "importAccounts": {
          const importedAccounts = normalizeImportedPayload(message.payload);
          const existingAccounts = await getAccounts();
          const merged = mergeImportedAccounts(existingAccounts, importedAccounts);
          await saveAccounts(merged.accounts);
          sendResponse({
            ok: true,
            accounts: merged.accounts,
            importedCount: importedAccounts.length,
            addedCount: merged.addedCount,
            replacedCount: merged.replacedCount,
          });
          return;
        }
        case "triggerCapture": {
          const result = await triggerCapture();
          sendResponse({
            ok: true,
            captured: capturedForResponse(result.captured),
            capture: {
              cookie: result.captured.cookie,
              workspaceId: result.captured.workspaceId,
              capturedAt: result.captured.capturedAt,
            },
            tabId: result.tabId,
          });
          return;
        }
        case "clearCaptured": {
          await clearCaptured();
          sendResponse({ ok: true });
          return;
        }
        case "saveCurrentAccount": {
          // If no cookie provided, auto-trigger capture first.
          let cookie = message.cookie;
          let workspaceId = message.workspaceId;
          if (!cookie) {
            const result = await triggerCapture();
            const captured = result.captured;
            if (captured) {
              cookie = captured.cookie;
              if (!workspaceId) workspaceId = captured.workspaceId;
            }
          }
          if (!cookie) {
            sendResponse({
              ok: false,
              error: "未捕获到 cookie。请在浏览器里打开 opencode.ai 的 workspace 页面（页面正常加载后扩展会自动捕获），然后重试。",
            });
            return;
          }
          if (!workspaceId) {
            sendResponse({ ok: false, error: "Workspace ID is required." });
            return;
          }
          // Check for duplicate workspace.
          const accounts = await getAccounts();
          const health = await getAccountHealth();
          const existing = accounts.find((a) => a.workspaceId === workspaceId);
          const sameCookie = existing ? sameLoginCookie(existing.cookie, cookie) : false;
          const existingAuthInvalid = existing ? isAccountAuthInvalid(health, existing.id) : false;
          const includeUsageList = resolveIncludeUsageList(existing, message.includeUsageList);
          const requestedName = typeof message.name === "string" ? message.name.trim() : "";
          const effectiveName = requestedName || existing?.name || `Account ${workspaceId.slice(-6)}`;
          const nameChanged = !!(existing && requestedName && requestedName !== existing.name);

          if (
            existing
            && !existingAuthInvalid
            && !nameChanged
            && includeUsageList === !!existing.includeUsageList
          ) {
            sendResponse({
              ok: true,
              unchanged: true,
              account: existing,
              accounts,
            });
            return;
          }

          if (existing && existingAuthInvalid && !sameCookie && !message.overwrite) {
            sendResponse({
              ok: false,
              error: "duplicate",
              existingAccount: {
                name: existing.name,
                workspaceId: existing.workspaceId,
                cookieChanged: true,
              },
            });
            return;
          }
          const id = existing?.id || createAccountId();
          let account = {
            id,
            name: effectiveName,
            workspaceId,
            cookie,
            includeUsageList,
          };
          const tempAccounts = existing
            ? accounts.map((a) => (a.id === id ? account : a))
            : [...accounts, account];
          await syncDnrRules(tempAccounts);
          try {
            if (!requestedName && !existing) {
              const email = await fetchAccountEmail(cookie, workspaceId, id);
              if (email) {
                account = { ...account, name: email };
              }
            }
            const finalAccounts = existing
              ? accounts.map((a) => (a.id === id ? account : a))
              : [...accounts, account];
            const settings = await getSettings();
            const snap = await queryAccount(account, settings);
            const otherAccounts = finalAccounts.filter((a) => a.id !== id);
            const otherSnaps = await Promise.all(
              otherAccounts.map((a) =>
                queryAccount(a, settings).catch((e) => ({
                  accountId: a.id,
                  accountName: a.name,
                  ok: false,
                  error: e.message,
                  timestamp: new Date().toISOString(),
                })),
              ),
            );
            await saveAccounts(finalAccounts);
            const allResults = [snap, ...otherSnaps];
            await chrome.storage.session.set({ lastSnapshots: allResults, lastQueryAt: Date.now() });
            await updateAccountHealthFromResults(finalAccounts, allResults, settings);
            sendResponse({
              ok: true,
              account,
              accounts: finalAccounts,
              validated: true,
              snapshot: snap,
              allResults,
              updated: !!existing && !sameCookie,
              unchanged: false,
            });
          } catch (e) {
            await syncDnrRules(accounts);
            sendResponse({
              ok: false,
              error: `Cookie 验证失败：${e.message}`,
            });
          }
          return;
        }
        case "deleteAccount": {
          const accounts = await getAccounts();
          const next = accounts.filter((a) => a.id !== message.accountId);
          await saveAccounts(next);
          sendResponse({ ok: true, accounts: next });
          return;
        }
        case "updateAccount": {
          const accounts = await getAccounts();
          const next = accounts.map((a) =>
            a.id === message.account.id ? { ...a, ...message.account } : a,
          );
          await saveAccounts(next);
          sendResponse({ ok: true, accounts: next });
          return;
        }
        case "queryAll": {
          const results = await queryAllAccounts();
          sendResponse({ ok: true, results });
          return;
        }
        case "queryOne": {
          const accounts = await getAccounts();
          const settings = await getSettings();
          const acct = accounts.find((a) => a.id === message.accountId);
          if (!acct) {
            sendResponse({ ok: false, error: "Account not found." });
            return;
          }
          const snapshot = await queryAccount(acct, settings);
          sendResponse({ ok: true, snapshot });
          return;
        }
        case "saveSettings": {
          const next = await saveSettings(message.settings || {});
          sendResponse({ ok: true, settings: next });
          return;
        }
        case "getLastSnapshots": {
          const data = await chrome.storage.session.get(["lastSnapshots", "lastQueryAt"]);
          sendResponse({ ok: true, ...data });
          return;
        }
        case "debugDnr": {
          const rules = await chrome.declarativeNetRequest.getDynamicRules();
          const accounts = await getAccounts();
          const captured = await getCaptured();
          const settings = await getSettings();
          const alarmInfo = await getAlarmInfo();
          const notifyState = await getNotifyState();
          const lastData = await chrome.storage.session.get(["lastSnapshots", "lastQueryAt"]);
          sendResponse({
            ok: true,
            rules: rules.map((r) => ({
              id: r.id,
              filter: r.condition?.urlFilter || r.condition?.regexFilter,
              cookieLen: r.action?.requestHeaders?.[0]?.value?.length || 0,
              cookieHead: (r.action?.requestHeaders?.[0]?.value || "").slice(0, 40),
            })),
            accounts: accounts.map((a) => ({
              name: a.name,
              workspaceId: a.workspaceId,
              cookieLen: a.cookie?.length || 0,
              cookieHead: (a.cookie || "").slice(0, 40),
              id: a.id,
            })),
            captured: capturedForResponse(captured),
            settings,
            alarmInfo,
            notifyState,
            lastQueryAt: lastData.lastQueryAt || null,
            swTimestamp: Date.now(),
          });
          return;
        }
        default:
          sendResponse({ ok: false, error: `Unknown message: ${message.type}` });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true; // async response
});

// On startup/install, sync DNR rules and alarm.
async function bootstrap() {
  try {
    const accounts = await getAccounts();
    await syncDnrRules(accounts);
    const settings = await getSettings();
    await syncAlarm(settings);
    await syncActionBadge(await getAccountHealth());
  } catch (e) {
    console.error("[opencode-monitor] bootstrap failed:", e);
  }
}

// Set up webRequest capture at module load (service worker restart safe).
setupWebRequestCapture();

// Sync alarm on every service worker startup — onStartup only fires when the
// browser starts, not when the SW wakes from idle. Module-level execution
// runs every time the SW restarts, so the alarm is always in sync.
(async () => {
  try {
    const settings = await getSettings();
    await syncAlarm(settings);
    const accounts = await getAccounts();
    await syncDnrRules(accounts);
    await syncActionBadge(await getAccountHealth());
  } catch (e) {
    console.error("[opencode-monitor] SW init failed:", e);
  }
})();

chrome.runtime.onInstalled.addListener(bootstrap);
chrome.runtime.onStartup.addListener(bootstrap);
