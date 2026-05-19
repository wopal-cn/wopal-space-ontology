---
name: space-master
description: |
  空间工作规范总纲。⚠️ MUST LOAD FIRST — Wopal 不确定怎么做或任务意图不明确时，第一个加载本技能。

  Triggers: 任何意图不明确的任务、"用什么流程"、"该加载什么技能"、
  技能管理（安装/卸载/搜索）、空间运维（worktree/同步/上游）、多 Space 管理。
  
  🔴 即使用户未明确说"上游同步"，只要涉及 ontology 仓库协作（fork/merge/cherry-pick/PR），就必须加载本技能。
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

`.wopal/` 是运行时 worktree（branch: `space/main`），直接编辑立即影响正在运行的插件。

### 决策树：是否需要隔离开发？

```
需要隔离开发？
├─ YES → 创建 worktree
│    cd ~/.wopal/ontologies/wopal-space-ontology
│    git worktree add ../.worktrees/ontology-<issue> -b feature/<name>
│    → 在 worktree 开发/测试/验证
│    → 合并回 space/main（见下方 Worktree 合并流程）
│
├─ NO → 直接编辑 .wopal/
│    → 立即影响运行插件（无需重启即可生效）
│    → 验证后提交到 fork
```

### Worktree 合并流程

```bash
# 1. Fork 中转层合并
cd ~/.wopal/ontologies/wopal-space-ontology
git checkout space/main
git merge ../.worktrees/ontology-<issue>/main

# 2. 运行时层同步
cd <space-path>/.wopal/
git merge main --no-edit

# 3. 清理 worktree
cd ~/.wopal/ontologies/wopal-space-ontology
git worktree remove ../.worktrees/ontology-<issue>
git branch -D feature/<name>
git push origin --delete feature/<name>  # 如有远程分支
```

### 提交到 Fork

```bash
cd <space-path>/.wopal/
git add . && git commit -m "feat(scope): description"
git push origin space/main

# 验证：重启 OpenCode → 测试功能
```

---

## 技能生命周期

```
Find → Download → Scan → Install → Develop → Optimize → Evaluate
```

| 用户意图 | 参考文档 | 推荐操作 |
|---------|---------|---------|
| 查看空间状态 | — | `wopal space status` |
| 保存空间变更 | — | `wopal space save -m "message"` |
| 贡献到上游 | `references/upstream-sync.md` | 工作流 1: Fork → Upstream |
| 同步上游更新 | `references/upstream-sync.md` | 工作流 2: Upstream → Fork |
| 多用户 Space 管理 | `references/upstream-sync.md` | 工作流 3: 版本矩阵 |
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
# 空间管理
wopal space status              # 查看空间全貌
wopal space save -m "message"   # 保存变更

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

1. **Ontology 协作必读** — 贡献/同步上游前读 `references/upstream-sync.md`
2. **Edit in workspace** — `.wopal/skills/<name>/` 可直接编辑
3. **Scan before install** — Downloaded skills need explicit scan
4. **Verify after install** — `ls .wopal/skills/<name>/SKILL.md`

---

## Browse Online

https://skills.sh/