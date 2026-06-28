---
name: space-master
description: |
  空间工作规范总纲。⚠️ MUST LOAD FIRST — Wopal 不确定怎么做或任务意图不明确时，第一个加载本技能。

  Triggers: 任何意图不明确的任务、"用什么流程"、"该加载什么技能"、
  技能管理（安装/卸载/搜索）、空间运维（worktree/同步/上游）、多 Space 管理。
  
  🔴 即使用户未明确说"上游同步"，只要涉及 ontology 仓库协作（update/sync/contribute/PR），就必须加载本技能。
---

# space-master — 空间工作规范总纲

本技能是 Wopal 的空间导航员。加载后，Wopal 应知道本空间有什么流程、什么场景用什么技能、委派的基本原则。

---

## 空间工作体系

本空间支持多种工作流程，按任务类型选择：

| 流程 | 适用场景 | 加载技能 |
|------|---------|---------|
| **dev-flow** | 开发/修复/重构 GitHub Issue、Plan 驱动的小功能迭代 | dev-flow + agents-collab |
| **WSF** | 重量级产品开发（里程碑、阶段、并行 wave） | WSF skill family |
| **spec 驱动** | Spec / OpenSpec / spec-first 流程 | 对应 spec 技能 |
| **无流程** | 单纯研究、讨论、解释、评审、临时小改动 | 无（Wopal 直接处理） |

dev-flow 是默认开发流程。WSF 仅用于产品级里程碑管理。

---

## 场景→技能路由

| 场景 | 加载技能 | 说明 |
|------|---------|------|
| 开发/修复/重构 Issue | dev-flow + agents-collab | 先加载 agents-collab，再走 dev-flow |
| 委派任何子 Agent | agents-collab | 任何委派前必须加载 |
| 空间运维（技能安装/同步/上游） | 仅本技能 | 不加载 dev-flow 或 agents-collab |
| 创建/修改技能 | skill-creator | 独立技能 |
| YouTube 视频分析 | youtube-master | 独立技能 |
| 网页抓取/搜索 | fc-local | 独立技能 |
| 邮件自动化 | automating-mail | 独立技能 |
| 代办事宜管理 | mac-reminder | 独立技能 |
| 配置 ellamaka | ellamaka-config | 独立技能 |

---

## 委派基础原则

**基本分工**：

- 实施类工作（编码、文件操作、构建测试）→ 委派 fae
- 审查类工作（Plan 评审、代码审查）→ 委派 rook
- 规划类工作（研究、设计、拆分）→ Wopal 自己完成

**委派工具**：必须优先用 `wopal_task`。委派机制详情（工具 API、生命周期、通知、纠偏、压缩）见 agents-collab 技能——任何委派前必须加载。

**委派前置检查**（强制，每次委派前执行）：

1. 搜索记忆"委派"关键词，加载路径规则、agent 类型规则、过往教训
2. 检查 prompt 中所有路径：files_to_read、输出路径等 — 必须使用绝对路径或空间根目录相对路径
3. 确认 prompt 包含目标项目路径上下文（如 `projects/gesp/`），防止文件写到错误位置

---

## Ontology 日常开发

`.wopal/` 是运行时 worktree，所在分支即当前空间的空间层分支 `space/<name>`（本空间为 `space/wopal-workspace`）。直接编辑立即影响正在运行的插件。

### 决策树：是否需要隔离开发？

```
需要隔离开发？
├─ YES → 创建 worktree
│    cd ~/.wopal/ontologies/wopal-space-ontology
│    git worktree add ../.worktrees/ontology-<issue> -b feature/<name> space/<name>
│    → 在 worktree 开发/测试/验证
│    → 合并回 space/<name>（见下方 Worktree 合并流程）
│
├─ NO → 直接编辑 .wopal/
│    → 立即影响运行插件（无需重启即可生效）
│    → 验证后 wopal ontology save
```

### Worktree 合并流程

```bash
# 1. 主仓库合并 feature 分支到当前空间层分支
cd ~/.wopal/ontologies/wopal-space-ontology
git checkout space/<name>
git merge feature/<name>

# 2. 运行时层同步（.wopal worktree 即 space/<name> 分支）
cd <space-path>/.wopal/
git merge feature/<name>

# 3. 清理 worktree
cd ~/.wopal/ontologies/wopal-space-ontology
git worktree remove ../.worktrees/ontology-<issue>
git branch -D feature/<name>
git push origin --delete feature/<name>  # 如有远程分支
```

### 提交变更

```bash
# 通过 CLI 提交（推荐）
wopal ontology save -m "feat(scope): description"

# 验证：重启 ellamaka → 测试功能
```

### 能力分层与下放

分支层级关系（main → type/* → space/*）、同步契约、能力孵化与提升流程见 `references/capability-layers.md`。

**核心铁律**：保持分支层级间的 merge 可达性。space 分支删除了上层能力文件时，先恢复再执行同步。

---

## 插件配置（wopal-plugin）

wopal-plugin 的配置采用**分层加载**机制，与 ontology 的用户级/空间级双栈架构一致。

### 配置文件位置

| 层级 | 路径 | 作用域 |
|------|------|--------|
| 用户级 | `WOPAL_HOME/.env`（默认 `~/.wopal/.env`） | 所有空间共享 |
| 空间级 | `<workspace>/.wopal/.env` | 仅当前空间 |

### 环境变量加载规则

插件启动时按以下优先级加载（高层覆盖低层，已存在的系统环境变量永不覆盖）：

```
3. 系统/Shell 环境变量（最高优先，不会被 .env 覆盖）
2. 空间级 .wopal/.env          ← 仅 wopal-space 内生效
1. 用户级 WOPAL_HOME/.env      ← 跨空间默认配置
```

**推荐实践**：
- 用户级 `.env` 放跨空间共享的变量：`WOPAL_LLM_BASE_URL`、`WOPAL_LLM_API_KEY`、`WOPAL_EMBEDDING_BASE_URL` 等
- 空间级 `.env` 放按空间定制的变量：`WOPAL_MEMORY_ENABLED`、LLM 模型覆盖等

**变量命名**：插件只加载 `WOPAL_` 前缀变量。`OPENAI_API_KEY` 等其他变量由宿主环境处理，不会被插件加载。

**非 wopal-space**：在无 `.wopal/` 目录的普通项目中，仅加载用户级 `.env`，功能开关默认全部启用。

### 提示词模板加载规则

插件内置的提示词模板（蒸馏、去重、标题生成）按以下优先级查找：

```
4. 环境变量指定路径    WOPAL_DISTILL_PROMPT_FILE / WOPAL_DEDUP_PROMPT_FILE / WOPAL_TITLE_PROMPT_FILE
3. 空间级模板          .wopal/prompts/<file>     （仅 wopal-space 内生效）
2. 用户级模板          WOPAL_HOME/prompts/<file>
1. 内联默认模板        （硬编码于插件中，无需任何配置即可工作）
```

配置策略：
- 不配置 → 使用内联默认，开箱即用
- 只配用户级 → 所有空间共享同一套定制模板
- 配空间级 → 当前空间使用专属模板，不影响其他空间

### 日志输出位置

| 运行环境 | 日志路径 |
|---------|---------|
| wopal-space 内 | `<workspace>/.wopal-space/logs/wopal-plugin.log` |
| wopal-space 外 | `WOPAL_HOME/logs/wopal-plugin.log` |

### 功能开关

| 变量 | 默认 | 说明 |
|------|------|------|
| `WOPAL_RULES_INJECTION_ENABLED` | `true` | 规则注入模块 |
| `WOPAL_MEMORY_ENABLED` | `true` | 记忆系统（关闭则 Memory Injection 一同失效） |
| `WOPAL_MEMORY_INJECTION_ENABLED` | `true` | 记忆注入（检索结果注入 system prompt） |
| `WOPAL_PLUGIN_LOG_LEVEL` | `info` | 日志级别：trace / debug / info / warn / error / fatal |
| `WOPAL_PLUGIN_LOG_MODULES` | (全部) | 模块过滤（逗号分隔）：core / rules / task / memory / context |

值为 `"false"` 时禁用，其他任意值视为启用。

---

## 技能生命周期

```
Find → Download → Scan → Install → Develop → Optimize → Evaluate
```

| 用户意图 | 参考文档 | 推荐操作 |
|---------|---------|---------|
| 查看 ontology 状态 | — | `wopal ontology status` |
| 保存 ontology 变更 | — | `wopal ontology save -m "message"` |
| 更新 ontology | `references/upstream-sync.md` | `wopal ontology update` |
| 同步分支 | `references/upstream-sync.md` | `wopal ontology sync --from A --to B` |
| 贡献到上游 | `references/upstream-sync.md` | `wopal ontology contribute` |
| 查找/搜索技能 | `references/lifecycle-install.md` | `wopal skills find` |
| 下载审查 | `references/lifecycle-install.md` | `wopal skills download` |
| 安全扫描 | `references/lifecycle-install.md` | `wopal skills scan` |
| 安装技能 | `references/lifecycle-install.md` | `wopal skills install` |
| 管理 INBOX | `references/lifecycle-install.md` | `wopal skills inbox` |
| 卸载技能 | `references/lifecycle-install.md` | `wopal skills remove` |
| 创建新技能 | `references/lifecycle-develop.md` | Use `skill-creator` |
| 优化/修复技能 | `references/lifecycle-develop.md` | Edit source + reinstall |
| 评估技能质量 | `references/evaluate-skill.md` | Read reference |

---

## Quick Commands

```bash
# Ontology 协作
wopal ontology status                          # 查看 ontology 分支与同步状态
wopal ontology save -m "message"               # 提交变更
wopal ontology update                          # 从上游合并更新到当前分支
wopal ontology sync --from main --to space/sam/main  # 在分支间同步
wopal ontology contribute                       # 贡献变更到上游（自动 cherry-pick + PR）

# 技能管理
wopal skills find "query"
wopal skills download owner/repo@skill
wopal skills scan skill-name
wopal skills install /path/to/skill --force
wopal skills remove <skill-name> --force
```

---

## Post-Install Verification

```bash
ls -la .wopal/skills/<skill-name>/SKILL.md
wopal skills list
```

---

## 上下文压缩

上下文压缩策略和操作方法见 agents-collab 技能「子会话上下文压缩」章节。

---

## Tips

1. **Ontology 协作必读** — 贡献/同步上游前读 `references/ontology-maintenance.md`（check 结果解读、下行同步、上行贡献 PR 流程、冲突解决）
2. **能力分层必读** — 修改、裁剪或下放 ontology 能力（plugin/skill/agent）前读 `references/capability-layers.md`（层级模型、同步契约、删除安全）
3. **Agent 驱动的工作流** — ontology 协作操作遵循「读取状态 → 与用户讨论 → 构建命令」模式。先执行 `wopal ontology status` 了解当前状态，再与用户确认后再构建 CLI 命令。不要跳过状态读取步骤。
4. **Edit in workspace** — `.wopal/skills/<name>/` 可直接编辑
5. **Scan before install** — Downloaded skills need explicit scan
6. **Verify after install** — `ls .wopal/skills/<name>/SKILL.md`

---

## Browse Online

https://skills.sh/
