const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function send(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

let footerTimer = null;
let footerRefreshQueued = false;
let footerState = {
  mode: "clock",
  scheduledTimeMs: null,
};
let accountsCache = [];
let accountHealthCache = {};
let pendingCapture = null;

function ensureFooterTimer() {
  if (footerTimer) return;
  footerTimer = setInterval(renderFooterStatus, 1000);
}

function queueFooterRefresh() {
  if (footerRefreshQueued) return;
  footerRefreshQueued = true;
  setTimeout(async () => {
    footerRefreshQueued = false;
    await syncFooterStatus();
  }, 1200);
}

function renderFooterStatus() {
  const el = $("#statusText");
  if (!el) return;

  if (footerState.mode === "countdown" && footerState.scheduledTimeMs) {
    const remainingMs = footerState.scheduledTimeMs - Date.now();
    if (remainingMs > 0) {
      el.textContent = `下次 ${formatClock(footerState.scheduledTimeMs)} · ${formatDuration(remainingMs)}`;
      return;
    }
    el.textContent = "正在自动查询…";
    queueFooterRefresh();
    return;
  }

  if (footerState.mode === "waiting") {
    el.textContent = "等待自动查询…";
    queueFooterRefresh();
    return;
  }

  el.textContent = formatClock(Date.now());
}

async function syncFooterStatus() {
  const r = await send({ type: "getFooterStatus" });
  if (r.ok && r.settings?.monitorEnabled) {
    const scheduledTimeMs = Date.parse(r.alarmInfo?.scheduledTime || "");
    if (Number.isFinite(scheduledTimeMs)) {
      footerState = { mode: "countdown", scheduledTimeMs };
    } else {
      footerState = { mode: "waiting", scheduledTimeMs: null };
    }
  } else {
    footerState = { mode: "clock", scheduledTimeMs: null };
  }
  ensureFooterTimer();
  renderFooterStatus();
}

// ===== Tab navigation with persistence =====
async function getActiveTab() {
  const result = await chrome.storage.local.get("activeTab");
  return result.activeTab || "usage";
}

async function setActiveTab(tab) {
  await chrome.storage.local.set({ activeTab: tab });
}

function switchTab(tabName) {
  $$(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === tabName);
  });
  $$(".tab-panel").forEach((p) => {
    p.classList.toggle("active", p.id === `tab-${tabName}`);
  });
  // The global refresh button only makes sense on usage/accounts tabs —
  // hide it on settings where it would be a blind operation.
  const refreshBtn = $("#refreshAll");
  refreshBtn.style.display = tabName === "settings" ? "none" : "";
}

async function setupTabs() {
  for (const tab of $$(".tab")) {
    tab.addEventListener("click", async () => {
      const tabName = tab.dataset.tab;
      switchTab(tabName);
      await setActiveTab(tabName);
      if (tabName === "accounts") refreshCaptureStatus();
      if (tabName === "usage") maybeAutoQuery();
    });
  }
  // Restore last active tab.
  const activeTab = await getActiveTab();
  switchTab(activeTab);
}

// Auto-query if usage tab has no data yet.
async function maybeAutoQuery() {
  const data = await chrome.storage.session.get(["lastSnapshots", "lastQueryAt"]);
  if (!data.lastSnapshots || data.lastSnapshots.length === 0) {
    const btn = $("#refreshAll");
    if (!btn.classList.contains("spinning")) {
      btn.click();
    }
  }
}

// ===== Init =====
async function init() {
  await setupTabs();
  const { ok, accounts, settings, health, notifyState } = await send({ type: "getAccounts" });
  if (!ok) return;
  accountsCache = accounts;
  accountHealthCache = health || {};
  applySettings(settings);

  const last = await send({ type: "getLastSnapshots" });
  const snapshots = last.ok ? last.lastSnapshots || [] : [];
  renderUsage(accounts, snapshots);
  renderManageList(accounts);
  updateAccountCount(accounts.length);
  await syncFooterStatus();
  const activeTab = await getActiveTab();
  if (activeTab === "accounts") {
    refreshCaptureStatus();
  }

  // If on usage tab and no data, auto-query.
  if (activeTab === "usage") {
    maybeAutoQuery();
  }
}

$("#testNotification").addEventListener("click", async () => {
  const btn = $("#testNotification");
  btn.disabled = true;
  btn.textContent = "测试中…";
  const r = await send({ type: "testNotification" });
  btn.disabled = false;
  btn.textContent = "测试通知";
  if (r.ok) {
    alert("已触发测试通知。若仍未看到，请检查 Chrome 和 macOS 的通知权限。");
  } else {
    alert(`测试通知失败：${r.error || "未知错误"}`);
  }
});

chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (!document.body) return;
  const affectsAccounts = areaName === "local" && (changes.opencodeAccounts || changes.opencodeAccountHealth);
  const affectsSnapshots = areaName === "session" && (changes.lastSnapshots || changes.lastQueryAt);
  if (!affectsAccounts && !affectsSnapshots) return;

  const state = await send({ type: "getAccounts" });
  if (state.ok) {
    accountsCache = state.accounts;
    accountHealthCache = state.health || {};
    renderManageList(accountsCache);
    updateAccountCount(accountsCache.length);
  }

  const last = await send({ type: "getLastSnapshots" });
  if (state.ok) {
    renderUsage(accountsCache, last.ok ? last.lastSnapshots || [] : []);
  }
});

// Toggle manual form visibility.
$("#toggleManual").addEventListener("click", (e) => {
  e.preventDefault();
  const section = $("#manualSection");
  const link = $("#toggleManual");
  if (section.style.display === "none") {
    section.style.display = "block";
    link.textContent = "收起手动添加";
  } else {
    section.style.display = "none";
    link.textContent = "自动捕获失败？手动添加";
  }
});

// Refresh capture: reload the opened opencode.ai tab to trigger webRequest capture.
$("#refreshCapture").addEventListener("click", async () => {
  const mode = $("#refreshCapture").dataset.action || "capture";
  if (mode === "open_go") {
    await openOpenCodeEntry();
    return;
  }
  if (mode === "logout_and_go") {
    await openOpenCodeNewAccountEntry();
    return;
  }
  await fetchCurrentLoginState();
});

$("#usageNewAccount").addEventListener("click", async () => {
  try {
    await openOpenCodeNewAccountEntry();
  } catch (error) {
    alert(`打开失败：${error.message}`);
  }
});

// ===== Usage tab =====
function renderUsage(accounts, snapshots) {
  const list = $("#accountList");
  const snapByAcct = new Map((snapshots || []).map((s) => [s.accountId, s]));

  if (!accounts.length) {
    renderHealthBanner(accounts);
    list.innerHTML = emptyStateHtml();
    return;
  }

  renderHealthBanner(accounts);

  // Summary bar: aggregate max usage across all accounts
  renderSummaryBar(accounts, snapByAcct);

  list.innerHTML = accounts
    .map((acct) => renderUsageCard(acct, snapByAcct.get(acct.id)))
    .join("");
  bindOpenButtons();
  bindSwitchToAccountsButtons();
}

function renderHealthBanner(accounts) {
  const banner = $("#authHealthBanner");
  const invalidAccounts = (accounts || []).filter((account) => isAccountAuthInvalid(account.id));
  if (!invalidAccounts.length) {
    banner.style.display = "none";
    banner.innerHTML = "";
    return;
  }

  banner.style.display = "flex";
  banner.innerHTML = `
    <span>${invalidAccounts.length} 个账号需要更新登录状态</span>
    <button class="btn btn-ghost" data-switch-accounts="1">去更新</button>
  `;
}

function renderSummaryBar(accounts, snapByAcct) {
  const bar = $("#summaryBar");
  let max5h = 0, maxWeek = 0, maxMonth = 0;
  for (const acct of accounts) {
    const s = snapByAcct.get(acct.id);
    if (!s?.ok?.go?.active) continue;
    max5h = Math.max(max5h, s.go.rollingUsage?.usagePercent || 0);
    maxWeek = Math.max(maxWeek, s.go.weeklyUsage?.usagePercent || 0);
    maxMonth = Math.max(maxMonth, s.go.monthlyUsage?.usagePercent || 0);
  }
  if (max5h === 0 && maxWeek === 0 && maxMonth === 0) {
    bar.style.display = "none";
    return;
  }
  bar.style.display = "flex";
  bar.innerHTML = [
    chipHtml("5h 最高", max5h),
    chipHtml("周最高", maxWeek),
    chipHtml("月最高", maxMonth),
  ].join("");
}

function chipHtml(label, pct) {
  const cls = pct >= 100 ? "danger" : pct >= 80 ? "warn" : "";
  return `<div class="summary-chip ${cls}"><span class="num">${pct}%</span><span class="label">${label}</span></div>`;
}

function renderUsageCard(acct, snap) {
  const cls = snap && !snap.ok ? "account-card error" : "account-card";
  const invalidAuth = isAccountAuthInvalid(acct.id);
  const invalidAuthBody = invalidAuth
    ? `<div class="account-callout invalid">
        <span>登录失效，需要到账号页更新登录状态。</span>
        <button class="inline-link-btn" data-switch-accounts="1">去更新</button>
      </div>`
    : "";
  let body = `<div class="empty-state" style="padding:12px"><p style="font-size:10px">尚未查询</p></div>`;
  if (snap) {
    body = snap.ok
      ? renderSnapshotBody(snap)
      : invalidAuth
        ? invalidAuthBody
        : `<div class="error-msg">${escapeHtml(snap.error || "查询失败")}</div>`;
  }
  return `<div class="${cls}" data-account-id="${escapeHtml(acct.id)}">
    <div class="account-card-head">
      <div class="account-head-left">
        <div class="account-name">${escapeHtml(acct.name)}</div>
        ${invalidAuth ? '<span class="account-health-badge">登录失效</span>' : ""}
      </div>
      <button class="btn-icon btn-icon-open" data-open="${escapeHtml(acct.id)}" data-workspace-id="${escapeHtml(acct.workspaceId)}" title="打开用量页">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>
      </button>
    </div>${body}</div>`;
}

function renderSnapshotBody(snap) {
  const go = snap.go;
  if (!go?.active) return `<div class="empty-state" style="padding:12px"><p style="font-size:10px">Go 订阅未激活</p></div>`;

  const rows = [
    ["5h", go.rollingUsage],
    ["周", go.weeklyUsage],
    ["月", go.monthlyUsage],
  ].map(([label, u]) => renderUsageRow(label, u, snap.timestamp)).join("");

  let extra = "";
  if (snap.billing?.balanceUsd != null) {
    extra += `<div class="balance-line">余额 $${snap.billing.balanceUsd.toFixed(2)}</div>`;
  }
  if (snap.usageList?.summary) {
    const s = snap.usageList.summary;
    extra += `<div class="usage-detail">${s.count} 条调用 · $${s.totalCostUsd.toFixed(4)} · ${formatTokens(s.totalInputTokens)} 入 / ${formatTokens(s.totalOutputTokens)} 出</div>`;
    const top = Object.entries(s.byModel).sort((a, b) => b[1].costUsd - a[1].costUsd).slice(0, 2);
    for (const [model, m] of top) {
      extra += `<div class="usage-detail">${escapeHtml(model)}: ${m.count} 次 · $${m.costUsd.toFixed(4)}</div>`;
    }
  }

  let warn = "";
  if (snap.warnings?.length) {
    warn = snap.warnings.map((w) => `<span class="warning-badge">${escapeHtml(w)}</span>`).join(" ");
  }

  return `<div class="usage-rows">${rows}</div>${extra}${warn}`;
}

function renderUsageRow(label, usage, snapshotTimestamp) {
  if (!usage) {
    return `<div class="usage-row"><span class="usage-row-label">${label}</span><div class="usage-bar"></div><span class="usage-row-pct">—</span><span class="usage-row-reset"></span></div>`;
  }
  const pct = usage.usagePercent;
  const fillCls = pct >= 100 ? "full" : pct >= 80 ? "warn" : "ok";
  const pctCls = pct >= 100 ? "full" : pct >= 80 ? "warn" : "";
  const resetAt = formatResetAt(snapshotTimestamp, usage.resetInSec, usage.resetIn);
  return `<div class="usage-row">
    <span class="usage-row-label">${label}</span>
    <div class="usage-bar"><div class="usage-bar-fill ${fillCls}" style="width:${Math.min(pct, 100)}%"></div></div>
    <span class="usage-row-pct ${pctCls}">${pct}%</span>
    <span class="usage-row-reset">${escapeHtml(resetAt)}</span>
  </div>`;
}

function emptyStateHtml() {
  return `<div class="empty-state">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"><path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/></svg>
    <p>尚无账号数据</p>
    <p class="sub">前往「账号」标签页添加</p>
  </div>`;
}

// ===== Accounts management tab =====
function renderManageList(accounts) {
  const list = $("#accountManageList");
  if (!accounts.length) {
    list.innerHTML = `<div class="empty-state" style="padding:16px"><p>还没有保存的账号</p></div>`;
    return;
  }
  list.innerHTML = accounts
    .map((a) => `<div class="manage-item">
      <div class="manage-item-info">
        <div class="manage-item-name">${escapeHtml(a.name)}${isAccountAuthInvalid(a.id) ? ' <span class="account-health-badge">登录失效</span>' : ""}</div>
        <div class="manage-item-ws">${escapeHtml(a.workspaceId)}</div>
      </div>
      <div class="manage-item-actions">
        <button class="btn-icon btn-icon-rename" data-rename="${escapeHtml(a.id)}" data-name="${escapeHtml(a.name)}" title="改名">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 20 9-9-3-3-9 9-4 1 1-4Z"/></svg>
        </button>
        <button class="btn-icon btn-icon-open" data-open="${escapeHtml(a.id)}" data-workspace-id="${escapeHtml(a.workspaceId)}" title="打开用量页">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>
        </button>
        <button class="btn-icon btn-icon-danger" data-delete="${escapeHtml(a.id)}" title="删除">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
        </button>
      </div>
    </div>`)
    .join("");

  bindRenameButtons();
  bindOpenButtons();

  for (const btn of $$("[data-delete]")) {
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.dataset.delete;
      if (!confirm("删除这个账号？")) return;
      const r = await send({ type: "deleteAccount", accountId: id });
      if (r.ok) {
        // If the deleted account matches the pending capture, drop it so the
        // accounts tab doesn't keep showing stale "可直接添加账号" state.
        if (pendingCapture) {
          const stillExists = r.accounts.some((a) => a.workspaceId === pendingCapture.workspaceId);
          if (!stillExists) {
            pendingCapture = null;
            await send({ type: "clearCaptured" }).catch(() => {});
          }
        }
        await refreshAccountsUi(r.accounts);
      }
    });
  }
}

function bindSwitchToAccountsButtons() {
  for (const btn of $$('[data-switch-accounts]')) {
    if (btn.dataset.switchAccountsBound === "1") continue;
    btn.dataset.switchAccountsBound = "1";
    btn.addEventListener("click", async () => {
      switchTab("accounts");
      await setActiveTab("accounts");
      await refreshCaptureStatus();
    });
  }
}

function bindRenameButtons() {
  for (const btn of $$('[data-rename]')) {
    if (btn.dataset.renameBound === "1") continue;
    btn.dataset.renameBound = "1";
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.dataset.rename;
      const currentName = e.currentTarget.dataset.name || "";
      const nextName = prompt("输入新的账号名称", currentName)?.trim();
      if (!nextName || nextName === currentName) return;
      const r = await send({ type: "updateAccount", account: { id, name: nextName } });
      if (!r.ok) {
        alert(r.error || "改名失败");
        return;
      }
      await refreshAccountsUi(r.accounts);
    });
  }
}

function bindOpenButtons() {
  for (const btn of $$('[data-open]')) {
    if (btn.dataset.openBound === "1") continue;
    btn.dataset.openBound = "1";
    btn.addEventListener("click", async (e) => {
      const accountId = e.currentTarget.dataset.open;
      const workspaceId = e.currentTarget.dataset.workspaceId;
      try {
        await openAccountUsagePage(accountId, workspaceId);
      } catch (error) {
        alert(`打开失败：${error.message}`);
      }
    });
  }
}

async function refreshAccountsUi(accounts) {
  const state = await send({ type: "getAccounts" });
  const nextAccounts = state.ok ? state.accounts : accounts;
  accountsCache = nextAccounts;
  accountHealthCache = state.ok ? state.health || {} : accountHealthCache;
  renderManageList(nextAccounts);
  const last = await send({ type: "getLastSnapshots" });
  renderUsage(nextAccounts, last.ok ? last.lastSnapshots || [] : []);
  updateAccountCount(nextAccounts.length);
  if ($("#tab-accounts")?.classList.contains("active")) {
    await refreshCaptureStatus();
  }
}

async function openAccountUsagePage(accountId, workspaceId) {
  if (!accountId || !workspaceId) {
    throw new Error("账号信息不完整。");
  }
  const url = `https://opencode.ai/workspace/${encodeURIComponent(workspaceId)}/go?_acct=${encodeURIComponent(accountId)}`;
  await chrome.tabs.create({ url, active: true });
}

async function openOpenCodeEntry() {
  const r = await send({ type: "openOpenCodeEntry" });
  if (!r?.ok) throw new Error(r?.error || "无法打开 OpenCode 页面。");
}

async function openOpenCodeNewAccountEntry() {
  pendingCapture = null;
  await send({ type: "clearCaptured" }).catch(() => {});
  const r = await send({ type: "openOpenCodeNewAccount" });
  if (!r?.ok) throw new Error(r?.error || "无法打开 OpenCode 页面。");
}

function downloadJsonFile(fileName, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

$("#backupAccounts").addEventListener("click", async () => {
  const btn = $("#backupAccounts");
  btn.disabled = true;
  btn.textContent = "备份中…";
  const r = await send({ type: "exportAccounts" });
  btn.disabled = false;
  btn.textContent = "备份";
  if (!r.ok) {
    alert(r.error || "备份失败");
    return;
  }
  downloadJsonFile(r.fileName || "opencode-accounts-backup.json", r.payload);
});

$("#importAccounts").addEventListener("click", () => {
  const input = $("#importAccountsFile");
  input.value = "";
  input.click();
});

$("#importAccountsFile").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const btn = $("#importAccounts");
  btn.disabled = true;
  btn.textContent = "导入中…";
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    const r = await send({ type: "importAccounts", payload });
    if (!r.ok) {
      alert(r.error || "导入失败");
      return;
    }
    // Import replaces accounts from external data — invalidate any stale
    // browser capture so the accounts tab returns to its initial state and
    // the user can freshly "刷新登录状态" instead of seeing the pre-import
    // "账号已添加" message.
    pendingCapture = null;
    await send({ type: "clearCaptured" }).catch(() => {});
    await refreshAccountsUi(r.accounts);
    alert(`导入完成：新增 ${r.addedCount} 个，覆盖 ${r.replacedCount} 个。`);
  } catch (e) {
    alert(`导入失败：${e.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "导入";
    event.target.value = "";
  }
});

// ===== Capture status =====
function isOpenCodeUrl(url) {
  try {
    const host = new URL(url).hostname;
    return host === "opencode.ai" || host.endsWith(".opencode.ai");
  } catch {
    return false;
  }
}

async function getActiveBrowserTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function getExistingAccountByWorkspace(workspaceId) {
  return accountsCache.find((account) => account.workspaceId === workspaceId) || null;
}

function getOpenCodePathname(url) {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return "";
  }
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

function isAccountAuthInvalid(accountId) {
  return accountHealthCache?.[accountId]?.status === "invalid_auth";
}

async function fetchCurrentLoginState() {
  const btn = $("#refreshCapture");
  pendingCapture = null;
  btn.disabled = true;
  btn.textContent = "刷新中…";
  // User clicked the "刷新登录状态" button — allow reload. They accept
  // the popup will close if the cache is stale and a reload is needed.
  // Add a popup-side timeout: when reload is needed the tab navigates and
  // the popup usually closes, but background tabs keep the popup alive —
  // don't let the button hang forever waiting for SW.
  const timeoutMs = 20000;
  const timeout = new Promise((resolve) => {
    setTimeout(() => resolve({ ok: false, error: "TIMEOUT" }), timeoutMs);
  });
  try {
    const captured = await Promise.race([
      send({ type: "captureFromActiveTab", allowReload: true }),
      timeout,
    ]);
    if (captured.error === "TIMEOUT") {
      btn.disabled = false;
      btn.textContent = "刷新登录状态";
      await refreshCaptureStatus("刷新登录状态超时，请确认 opencode.ai 已登录后重试。", true);
      return;
    }
    btn.disabled = false;
    btn.textContent = "刷新登录状态";
    if (!captured.ok) {
      await refreshCaptureStatus(captured.error || "刷新登录状态失败，请确认当前页面已登录。", true);
      return;
    }
    pendingCapture = captured.capture || null;
    const state = await send({ type: "getAccounts" });
    if (state.ok) {
      accountsCache = state.accounts;
      accountHealthCache = state.health || {};
    }
    await refreshCaptureStatus();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = "刷新登录状态";
    await refreshCaptureStatus(`刷新登录状态出错：${e.message || "未知错误"}`, true);
  }
}

async function refreshCaptureStatus(errorText = "", allowManual = false) {
  const statusEl = $("#captureStatus");
  const previewEl = $("#capturePreview");
  const saveBtn = $("#saveAccount");
  const toggleManual = $("#toggleManual");
  const manualSection = $("#manualSection");
  const refreshBtn = $("#refreshCapture");
  const helpEl = $("#captureHelp");

  function showState({
    text,
    type = "idle",
    showPreview = false,
    workspaceText = "",
    showSave = false,
    saveText = "保存",
    showRefresh = false,
    refreshText = "刷新登录状态",
    refreshAction = "capture",
    showManual = false,
    helpText = "切到已登录的 opencode.ai 页面后，先刷新登录状态，再添加或更新账号。",
  }) {
    statusEl.className = `capture-status ${type}`;
    statusEl.textContent = text;
    statusEl.style.display = "block";
    previewEl.style.display = showPreview ? "block" : "none";
    if (showPreview) {
      $("#captureWs").textContent = workspaceText || "(未识别)";
    }
    saveBtn.style.display = showSave ? "block" : "none";
    saveBtn.disabled = !showSave;
    saveBtn.textContent = saveText;
    refreshBtn.style.display = showRefresh ? "block" : "none";
    refreshBtn.disabled = false;
    refreshBtn.textContent = refreshText;
    refreshBtn.dataset.action = refreshAction;
    toggleManual.style.display = showManual ? "block" : "none";
    manualSection.style.display = "none";
    helpEl.textContent = helpText;
  }

  const activeTab = await getActiveBrowserTab();
  const activePath = getOpenCodePathname(activeTab?.url);
  if (!isOpenCodeUrl(activeTab?.url)) {
    pendingCapture = null;
    showState({
      text: "当前标签页不是 OpenCode，可先打开 OpenCode 并登录。",
      showRefresh: true,
      refreshText: "登录 OpenCode Go",
      refreshAction: "open_go",
      showSave: false,
      showManual: false,
      helpText: "点击下方按钮前往 OpenCode 登录页，完成登录后回到这里刷新登录状态。如需注册新账号，请使用「注册/登录新账号」入口。",
    });
    return;
  }

  // On /auth page: user hasn't logged in yet. No point capturing — just guide.
  if (activePath.startsWith("/auth")) {
    pendingCapture = null;
    showState({
      text: "请先完成 OpenCode 登录，登录成功后会自动跳转到 workspace 页面。",
      showRefresh: true,
      refreshText: "已完成登录，刷新状态",
      refreshAction: "capture",
      showSave: false,
      showManual: false,
      helpText: "登录成功后页面会自动跳转到 workspace，届时回到这里即可自动刷新登录状态。若仍停留在登录页，请先完成登录。",
    });
    return;
  }

  // On workspace page: auto-capture silently. No reload, no button click needed.
  const wsMatch = String(activeTab?.url || "").match(/\/workspace\/(wrk_[A-Z0-9]+)/);
  if (wsMatch) {
    // If we already have a fresh pending capture for this tab, don't re-capture.
    const tabId = activeTab?.id;
    const cacheFresh = pendingCapture?.cookie && pendingCapture?.workspaceId === wsMatch[1];
    if (!cacheFresh) {
      const captured = await send({ type: "captureFromActiveTab" });
      if (captured.ok) {
        pendingCapture = captured.capture || null;
        const state = await send({ type: "getAccounts" });
        if (state.ok) {
          accountsCache = state.accounts;
          accountHealthCache = state.health || {};
        }
      } else if (captured.error === "NO_CACHE") {
        // Silent mode hit a cache miss. Don't treat as error — just show
        // "可刷新登录状态" and let user click the button to trigger reload.
        const isAcctPage = String(activeTab?.url || "").includes("_acct=");
        showState({
          text: errorText || (isAcctPage
            ? "当前是扩展打开的账号页面，可刷新登录状态切换回浏览器原生登录态。"
            : "当前 workspace 页面可刷新登录状态。"),
          showRefresh: true,
          refreshText: "刷新登录状态",
          refreshAction: "capture",
          showSave: false,
          showManual: allowManual,
          helpText: isAcctPage
            ? "点击下方「刷新登录状态」会跳转到 opencode.ai/auth 以浏览器当前登录态自动登录，popup 会关闭。刷新后回到这里即可继续。"
            : "点击下方「刷新登录状态」会重新加载当前 opencode.ai 页面以捕获登录信息（popup 会关闭）。如已登录，刷新后回到这里即可继续。",
        });
        return;
      } else if (errorText) {
        // Caller-supplied error wins over auto-capture failure.
        showState({
          text: errorText,
          showRefresh: true,
          refreshText: "刷新登录状态",
          refreshAction: "capture",
          showManual: allowManual,
          helpText: "必须先成功登录，才能保存账号。如果刚完成登录，可再次刷新登录状态；若登录已失效，请使用「注册/登录新账号」入口重新登录。",
        });
        return;
      }
    }

    if (!pendingCapture?.cookie || !pendingCapture?.workspaceId) {
      showState({
        text: errorText || "未能捕获登录状态，请确认已登录后重试。",
        showRefresh: true,
        refreshText: "刷新登录状态",
        refreshAction: "capture",
        showManual: allowManual,
        helpText: "必须先成功登录，才能保存账号。如已登录但仍失败，可使用「注册/登录新账号」入口重新登录。",
      });
      return;
    }

    const existing = getExistingAccountByWorkspace(pendingCapture.workspaceId);
    const unchanged = existing && sameLoginCookie(existing.cookie, pendingCapture.cookie);
    const existingInvalid = existing && isAccountAuthInvalid(existing.id);
    showState({
      text: existing
        ? existingInvalid
          ? `账号「${existing.name}」的已保存登录状态已失效，可更新账号。`
          : `账号「${existing.name}」已添加，当前已保存状态仍可用。`
        : "已获取当前登录状态，可直接添加账号。",
      type: existingInvalid ? "idle" : "ok",
      showPreview: true,
      workspaceText: pendingCapture.workspaceId,
      showSave: !!existingInvalid || !existing,
      saveText: existing ? "更新账号" : "添加账号",
      showRefresh: true,
      refreshText: existing && !existingInvalid ? "注册/登录新账号" : "刷新登录状态",
      refreshAction: existing && !existingInvalid ? "logout_and_go" : "capture",
      showManual: false,
      helpText: existing && !existingInvalid
        ? unchanged
          ? "当前账号已添加，且当前登录状态与已保存状态一致。如需继续添加其他账号，可退出当前 OpenCode 会话后注册或登录新账号。"
          : "检测到新的登录状态，但当前已保存状态仍可用。如需继续添加其他账号，可退出当前 OpenCode 会话后注册或登录新账号。"
        : "登录状态确认成功后，即可添加或更新账号。",
    });
    return;
  }

  // On opencode.ai but not /auth and not /workspace — unknown page.
  pendingCapture = null;
  showState({
    text: "当前不在 workspace 页面，无法刷新登录状态。",
    showRefresh: true,
    refreshText: "登录 OpenCode Go",
    refreshAction: "open_go",
    showSave: false,
    showManual: false,
    helpText: "请切到 opencode.ai 的 workspace 页面后再刷新登录状态。",
  });
}

// ===== Refresh all =====
$("#refreshAll").addEventListener("click", async () => {
  const btn = $("#refreshAll");
  btn.classList.add("spinning");
  const r = await send({ type: "queryAll" });
  btn.classList.remove("spinning");
  if (!r.ok) return;
  const state = await send({ type: "getAccounts" });
  const accounts = state.ok ? state.accounts : accountsCache;
  accountsCache = accounts;
  accountHealthCache = state.ok ? state.health || {} : accountHealthCache;
  renderUsage(accounts, r.results);
  renderManageList(accounts);
  updateAccountCount(accounts.length);
  // Sync the capture panel so its "登录失效" status matches the freshly
  // refreshed health badges on the account list above. Clear pendingCapture
  // so refreshCaptureStatus re-reads from the webRequest cache instead of
  // showing stale popup-memory state. This never reloads the tab.
  if ($("#tab-accounts")?.classList.contains("active")) {
    pendingCapture = null;
    await refreshCaptureStatus();
    // Brief feedback so the user sees something happened. The capture panel
    // already re-rendered above; this just confirms the refresh landed.
    const statusEl = $("#captureStatus");
    if (statusEl.style.display === "block") {
      const origText = statusEl.textContent;
      statusEl.textContent = "✓ 已刷新";
      setTimeout(() => { if (statusEl.textContent === "✓ 已刷新") statusEl.textContent = origText; }, 1200);
    }
  }
});

// ===== Save account =====
$("#saveAccount").addEventListener("click", async () => {
  if (!pendingCapture?.cookie || !pendingCapture?.workspaceId) return;
  const btn = $("#saveAccount");
  const existing = getExistingAccountByWorkspace(pendingCapture.workspaceId);
  if (existing && !isAccountAuthInvalid(existing.id)) {
    alert(`账号「${existing.name}」已添加，无需重复保存。`);
    await refreshCaptureStatus();
    return;
  }
  btn.disabled = true;
  btn.textContent = existing ? "更新中…" : "添加中…";
  const r = await send({
    type: "saveCurrentAccount",
    cookie: pendingCapture.cookie,
    workspaceId: pendingCapture.workspaceId,
    overwrite: !!existing,
  });
  btn.disabled = false;
  btn.textContent = existing ? "更新账号" : "添加账号";
  if (r.ok) {
    if (r.unchanged) {
      alert(`账号「${r.account?.name || existing?.name || ""}」已添加，无需重复保存。`);
      await refreshCaptureStatus();
      return;
    }
    pendingCapture = null;
    await send({ type: "clearCaptured" });
    await refreshAccountsUi(r.accounts);
    const snapshots = r.allResults || (r.snapshot ? [r.snapshot] : []);
    renderUsage(r.accounts, snapshots);
    btn.textContent = existing ? "✓ 已更新" : "✓ 已添加";
    setTimeout(() => {
      btn.textContent = existing ? "更新账号" : "添加账号";
    }, 1500);
  } else {
    alert(r.error || "保存失败");
    await refreshCaptureStatus(r.error || "保存失败", true);
  }
});

// ===== Manual save =====
$("#saveManual").addEventListener("click", async () => {
  const cookie = $("#manualCookie").value.trim();
  const workspaceId = $("#manualWs").value.trim();
  if (!cookie) { alert("请粘贴 Cookie"); return; }
  if (!workspaceId) { alert("请填写 Workspace ID"); return; }
  const name = $("#manualName").value.trim() || undefined;
  const btn = $("#saveManual");
  btn.disabled = true;
  btn.textContent = "保存中…";
  let r = await send({ type: "saveCurrentAccount", name, workspaceId, cookie });
  if (r.ok && r.unchanged) {
    btn.disabled = false;
    btn.textContent = "手动保存";
    alert(`账号「${r.account?.name || workspaceId}」已添加，无需重复保存。`);
    return;
  }
  if (!r.ok && r.error === "duplicate") {
    const ex = r.existingAccount;
    const ok = confirm(`已存在账号「${ex.name}」(${ex.workspaceId})，检测到登录状态变化。\n是否更新账号？`);
    if (!ok) {
      btn.disabled = false;
      btn.textContent = "手动保存";
      return;
    }
    r = await send({ type: "saveCurrentAccount", name, workspaceId, cookie, overwrite: true });
    if (r.ok && r.unchanged) {
      btn.disabled = false;
      btn.textContent = "手动保存";
      alert(`账号「${r.account?.name || workspaceId}」已添加，无需重复保存。`);
      return;
    }
  }
  btn.disabled = false;
  btn.textContent = "手动保存";
  if (r.ok) {
    pendingCapture = null;
    await send({ type: "clearCaptured" });
    $("#manualWs").value = "";
    $("#manualCookie").value = "";
    $("#manualName").value = "";
    await refreshAccountsUi(r.accounts);
    const snapshots = r.allResults || (r.snapshot ? [r.snapshot] : []);
    renderUsage(r.accounts, snapshots);
  } else {
    alert(r.error || "保存失败");
  }
});

// ===== Settings =====
function applySettings(settings) {
  if (!settings) return;
  $("#warnPercent").value = settings.warnPercent ?? 90;
  $("#monitorEnabled").checked = !!settings.monitorEnabled;
  $("#pollInterval").value = settings.pollIntervalMinutes ?? 5;
}

$("#saveSettings").addEventListener("click", async () => {
  const settings = {
    warnPercent: Number($("#warnPercent").value) || 90,
    monitorEnabled: $("#monitorEnabled").checked,
    pollIntervalMinutes: Number($("#pollInterval").value) || 5,
  };
  const r = await send({ type: "saveSettings", settings });
  if (r.ok) {
    const btn = $("#saveSettings");
    btn.textContent = "✓ 已保存";
    await syncFooterStatus();
    setTimeout(() => (btn.textContent = "保存设置"), 1500);
  } else {
    alert(r.error);
  }
});

// ===== Diagnostics =====
$("#runDiag").addEventListener("click", async () => {
  const out = $("#diagOutput");
  out.style.display = "block";
  out.textContent = "诊断中…";
  const r = await send({ type: "debugDnr" });
  if (!r.ok) { out.textContent = `失败: ${r.error}`; return; }
  $("#copyDiag").style.display = "block";
  const lines = [];
  lines.push(`===== OpenCode Usage Monitor 诊断 =====`);
  lines.push(`时间: ${new Date(r.swTimestamp).toISOString()}`);
  lines.push(`账号数: ${r.accounts?.length || 0}`);
  lines.push(`DNR 规则数: ${r.rules?.length || 0}`);
  lines.push("");
  lines.push(`--- 设置 ---`);
  lines.push(`警告阈值: ${r.settings?.warnPercent}%`);
  lines.push(`后台监测: ${r.settings?.monitorEnabled ? "开启" : "关闭"}`);
  lines.push(`轮询间隔: ${r.settings?.pollIntervalMinutes} 分钟`);
  lines.push("");
  lines.push(`--- Alarm 状态 ---`);
  if (r.alarmInfo) {
    lines.push(`下次触发: ${r.alarmInfo.scheduledTime}`);
    lines.push(`距下次: ${r.alarmInfo.secondsUntilNext} 秒`);
    lines.push(`周期: ${r.alarmInfo.periodInMinutes} 分钟`);
  } else {
    lines.push(`Alarm 未设置（后台监测可能未开启或 SW 未初始化）`);
  }
  lines.push("");
  lines.push(`--- 捕获状态 ---`);
  if (r.captured) {
    lines.push(`workspace: ${r.captured.workspaceId || "无"}`);
    lines.push(`email: ${r.captured.email || "无"}`);
    lines.push(`cookie长度: ${r.captured.cookieLen}`);
    lines.push(`捕获时间: ${new Date(r.captured.capturedAt).toISOString()}`);
  } else {
    lines.push(`未捕获`);
  }
  lines.push("");
  lines.push(`--- 已保存账号 ---`);
  for (const a of r.accounts || []) {
    lines.push(`  [${a.name}] ${a.workspaceId} cookieLen=${a.cookieLen}`);
  }
  lines.push("");
  lines.push(`--- DNR 规则 ---`);
  for (const rule of r.rules || []) {
    lines.push(`  #${rule.id}: len=${rule.cookieLen} filter=${rule.filter}`);
  }
  lines.push("");
  lines.push(`--- 查询历史 ---`);
  lines.push(`上次查询: ${r.lastQueryAt ? new Date(r.lastQueryAt).toISOString() : "无"}`);
  lines.push("");
  lines.push(`--- 通知状态 ---`);
  lines.push(`上次尝试: ${r.notifyState?.lastAttemptAt || "无"}`);
  lines.push(`最近错误: ${r.notifyState?.lastError || "无"}`);
  const notifyAccounts = Object.entries(r.notifyState?.accounts || {});
  if (notifyAccounts.length) {
    for (const [accountId, state] of notifyAccounts) {
      lines.push(`  ${accountId}: lastNotifiedAt=${state.lastNotifiedAt ? new Date(state.lastNotifiedAt).toISOString() : "无"} error=${state.lastNotificationError || "无"}`);
    }
  }
  out.textContent = lines.join("\n");
});

// Copy diagnostics.
$("#copyDiag")?.addEventListener("click", async () => {
  const text = $("#diagOutput").textContent;
  if (!text || text === "诊断中…") return;
  try {
    await navigator.clipboard.writeText(text);
    const btn = $("#copyDiag");
    const orig = btn.textContent;
    btn.textContent = "✓ 已复制";
    setTimeout(() => (btn.textContent = orig), 1500);
  } catch (e) {
    alert("复制失败: " + e.message);
  }
});

// ===== Helpers =====
function formatClock(ts) {
  return new Date(ts).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatResetAt(snapshotTimestamp, resetInSec, fallback = "") {
  const baseMs = Date.parse(snapshotTimestamp || "");
  const seconds = Number(resetInSec || 0);
  if (!Number.isFinite(baseMs) || !Number.isFinite(seconds)) return fallback;

  const resetAt = new Date(baseMs + Math.max(0, seconds) * 1000);
  const now = new Date();
  const resetDay = startOfDay(resetAt);
  const today = startOfDay(now);
  const dayDiff = Math.round((resetDay - today) / 86400000);
  const hhmm = `${String(resetAt.getHours()).padStart(2, "0")}:${String(resetAt.getMinutes()).padStart(2, "0")}`;

  if (dayDiff === 0) return `今天 ${hhmm}`;
  if (dayDiff === 1) return `明天 ${hhmm}`;
  if (dayDiff === 2) return `后天 ${hhmm}`;

  const mmdd = `${String(resetAt.getMonth() + 1).padStart(2, "0")}${String(resetAt.getDate()).padStart(2, "0")}`;
  return `${mmdd} ${hhmm}`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function formatTokens(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

function updateAccountCount(n) {
  $("#accountCount").textContent = `${n} 个账号`;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );
}

init();
