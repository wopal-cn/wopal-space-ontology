# Ontology 协作工作流

本文档是 ontology 的 Agent 协作工作流指南，定义 agent 如何消费 `wopal ontology` CLI 命令完成本体维护、能力提升和上游协作。

主要受众是 agent，而非直接运行 git 命令的人类。

---

## 1. 仓库拓扑

### Clone 模式（默认）

```
┌─ 上游本体 ─────────────────────────────────────────────────────────┐
│  wopal-cn/ontology                               [main]             │
│  ├── main                        ← 通用能力基线                       │
│  ├── type/coding                 ← 编码类型变体                       │
│  └── type/content                ← 内容类型变体                       │
└─────────────────────────────────────────────────────────────────────┘
                               │ clone / fetch
                               ▼
┌─ 本地仓库 ──────────────────────────────────────────────────────────┐
│  ~/.wopal/ontologies/wopal-space-ontology                           │
│  ├── origin → wopal-cn/ontology（上游即 origin）                      │
│  └── 本地分支：main / type/* / space/<name> / contribute/*    │
└─────────────────────────────────────────────────────────────────────┘
                               │ worktree
                               ▼
┌─ 运行时 worktree ───────────────────────────────────────────────────┐
│  <space>/.wopal/                  [branch: space/<name>]     │
│  └── agent 直接编辑，影响正在运行的 ellamaka                            │
└─────────────────────────────────────────────────────────────────────┘
```

Clone 模式：origin 即上游。`update` 从 origin 拉取。`contribute` 时 CLI 自动 fork 并创建 PR。

### Fork 模式

```
┌─ 上游本体 ─────────────────────────────────────────────────────────┐
│  wopal-cn/ontology                                                 │
└─────────────────────────────────────────────────────────────────────┘
                               │ fork
                               ▼
┌─ 复制本体 ─────────────────────────────────────────────────────────┐
│  <user>/wopal-space-ontology                                       │
│  ├── upstream → wopal-cn/ontology（上游）                            │
│  ├── origin → <user>/wopal-space-ontology（用户 fork）                │
│  ├── main / type/*              ← 上游镜像 + 用户自建 type             │
│  └── space/<name>        ← 空间实例分支                         │
└─────────────────────────────────────────────────────────────────────┘
                               │ worktree
                               ▼
┌─ 运行时 worktree ───────────────────────────────────────────────────┐
│  <space>/.wopal/                  [branch: space/<name>]     │
└─────────────────────────────────────────────────────────────────────┘
```

Fork 模式：`update` 从 upstream 拉取更新到空间实例。`contribute` 直接 push 到 fork 再 PR。

---

## 2. 能力分层与分支命名

三层能力模型：`main`（通用层）→ `type/<name>`（类型层）→ `space/<name>`（空间层）。

| 分支 | 定位 | 生命周期 |
|------|------|----------|
| `main` | 通用能力基线，所有空间共享 | 永久 |
| `type/<name>` | 上游维护的类型变体（如 type/coding） | 永久，随 main 更新 |
| `type/<user>/<name>` | 用户自建类型变体 | 永久，维护人在 fork 中 |
| `space/<name>` | 空间实例分支，运行时 worktree 挂载 | 永久 |
| `contribute/<target>/<slug>` | 向上游贡献的临时 PR 分支 | 临时，合并后删除 |
| `feature/<name>` | 开发分支，dev-flow worktree 使用 | 临时，合并后删除 |

---

## 3. Agent 工作流

### 3.1 检查状态

**命令**：`wopal ontology status`

Agent 解读三段输出并决策：

```markdown
## Ontology
- Mode: fork
- Upstream: wopal-cn/ontology
- Fork: sampx/wopal-space-ontology
- Types: common (main), coding (type/coding)

### Instance
- Branch: space/sampx/wopal-workspace
- User: sampx
- Type: common → main
- Status: clean

### Ahead / Behind
| Relation | Baseline | Ahead | Behind |
|---|---|---:|---:|
| Upstream | upstream/main | 55 | 9 |
| Fork | origin/main | 55 | 0 |
| Remote | origin/space/sampx/ws | 0 | 0 |
```

Agent 解读：
- 上游有 9 个新提交 → 建议 `update`
- Fork 无偏差 → fork 镜像与上游同步良好
- Remote 0/0 → 无需 push
- ahead 55 → 空间积累了相当多的定制，可能值得 contribute

### 3.2 更新

**命令**：`wopal ontology update`

**Agent 步骤**：
1. 确保 worktree clean（dirty 时先让用户提交）
2. 说明将从哪个 remote 拉取、哪个 type 分支、合并到当前空间实例
3. 用户确认后执行 `wopal ontology update`
4. 成功 → 报告 behind 变化；fast-forward 失败 → 报告 diverged，转冲突处理
5. 如有 agent/skill/rule 变更，提醒重启 ellamaka

### 3.3 分支间迁移（apply）

**命令**：`wopal ontology apply --from <A> --to <B>`

**用途**：在同一 repo 内将变更从 A 分支迁移到 B 分支。

**Agent 步骤**：
1. 执行 `ontology status` 确认 worktree clean
2. 与用户讨论方向：`--from` 是源，`--to` 是目标
3. 常见场景：
   - `apply --from main --to type/coding` — main 更新传播到 type
   - `apply --from type/coding --to space/sampx/ws` — type 更新传播到空间实例
   - `apply --from space/sampx/ws --to type/coding` — 空间能力提升到 type
4. 执行 `wopal ontology apply --from <A> --to <B>`
5. 成功 → 报告 merged；冲突 → 转 §4 冲突处理

### 3.4 贡献（contribute）

**命令**：`wopal ontology contribute --source <branch> --target <target> --commits <hash1,hash2>`

**Agent 步骤**：
1. 执行 `ontology status` 获取 ahead 信息
2. 用 `git log <target>..<source> --oneline` 列出可贡献的 commit
3. 与用户逐个讨论筛选原则：

| 变更内容 | 是否贡献 | 原因 |
|----------|----------|------|
| skills/、agents/、commands/、rules/ 的通用逻辑 | 是 | 对所有空间有价值 |
| plugins/ 的核心功能修复 | 是 | 插件是通用组件 |
| templates/ 的通用模板 | 是 | 初始化依赖 |
| 用户特定路径或配置 | 否 | 仅当前空间需要 |
| 实验中未成熟的功能 | 否 | 尚未稳定验证 |

4. 确认贡献的 commit 列表和 target 分支
5. 执行 `wopal ontology contribute --source <branch> --target <target> --commits <hash1,hash2>`
6. 报告 PR URL

### 3.5 能力提升（Promotion）

空间孵化出新能力后，提升到上层分支的流程：

**空间 → type**：
1. 确认能力适用于同类空间（非私有限定）
2. `wopal ontology apply --from space/sampx/ws --to type/coding`
3. 在 type 分支验证功能
4. 讨论是否进一步 contribute 到上游

**空间 → main（不推荐直接）**：
1. 先提升到 type 分支验证
2. 稳定后 contribute 到 main
3. 禁止跳过 type 层直接 space → main contribute

---

## 4. 冲突处理指南

同步或迁移操作可能产生合并冲突。Agent 的处理原则：

**冲突发生时**：
1. 暂停操作，向用户报告冲突文件列表和冲突性质
2. 按以下优先级判断处理：

| 冲突场景 | 处理 |
|----------|------|
| 上游修改了通用能力，本地也修改了同一文件 | 保留上游版本，手动移植本地特有改动 |
| 上游重构了文件结构，本地修改了旧路径文件 | 以上游新结构为准，将本地逻辑迁移到新路径 |
| 本地新增文件与上游新增文件同名 | 对比内容，合并两边的改动 |
| 配置文件冲突 | 合并双方的有效配置项 |

3. 冲突解决后，完成合并操作并提交
4. 提示用户重启 ellamaka 验证新能力加载

**预防**：
- 定期执行 update，减少积累大量 divergence 后的冲突风险
- 空间定制优先用 overlay（space 目录同名覆盖），不直接修改上游文件

---

## 5. 多级 Fork 链

用户的复制本体可被他人 fork 为上游：

```
A 的 fork 是 B 的上游
  → B 的 upstream remote 指向 A 的 fork
  → B 执行 ontology status → Upstream behind > 0
  → B 执行 ontology update → 从 A 的 fork 拉取更新
```

Agent 无需知道 fork 链深度——`ontology status` 的 `Upstream` 行自动反映最近上游的差距，`update` 自动从 `upstream` remote 拉取。多级 fork 对 CLI 和 agent 透明。

## 6. 常见场景 FAQ

### Q1: Fork 很久没同步上游，ahead/behind 都很大，怎么办？

1. 先判断 ahead 中哪些是通用能力（应贡献），哪些是空间定制
2. 将通用能力的部分 contribute 到上游
3. 收到上游合并后，再 update
4. 空间定制保留在 space 分支

### Q2: Clone 模式和 Fork 模式如何选择？

- 大多数用户使用 Clone 模式——无需 fork，contribute 时 CLI 自动处理
- Fork 模式适合本体缔造者：长期维护 type 分支、多设备同步、多级 fork 链

### Q3: 上游新增了一个 type 分支，我的 fork 如何获取？

执行 `wopal ontology update`——fork 模式会 `git fetch upstream` 拉取所有分支，包括新 type。新 type 会出现在 `ontology status` 的 Types 列表和 `ontology list` 中。

### Q4: 贡献的 PR 合并后，本地分支还需要做什么？

PR 合并后，下次 `wopal ontology update` 会拉取上游的新 commit。本地 `contribute/*` 分支可以在主仓库中手动删除。

---

## 参考文档

- `.wopal/docs/DESIGN.md` §6.8 — Ontology Branch Model
- `.wopal/docs/DESIGN.md` §6.9 — Agent Ontology Maintenance Workflow
- `capability-layers.md` — 能力层级模型与同步契约
- `commands/wopal/ontology-maintain.md` — `/ontology-maintain` 命令
