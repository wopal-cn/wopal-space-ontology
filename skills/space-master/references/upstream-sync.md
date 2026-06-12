# Ontology 上游协作工作流

本文档描述 ontology 的仓库拓扑、分支命名约定和 agent 驱动的协作工作流。

主要受众是使用 `wopal ontology` CLI 命令族的 agent，而非直接运行 git 命令的人类。

---

## 1. 仓库拓扑

### Clone 模式（默认）

```
┌─ 上游仓库 ──────────────────────────────────────────────────────────┐
│  wopal-cn/wopal-space-ontology   [main]                              │
│  └── 所有 space 的共同上游，承载通用能力                                │
└──────────────────────────────────────────────────────────────────────┘
                               │ clone / fetch
                               ▼
┌─ 本地仓库 ───────────────────────────────────────────────────────────┐
│  ~/.wopal/ontologies/wopal-space-ontology                            │
│  ├── origin → wopal-cn/wopal-space-ontology（或用户 fork）             │
│  └── 本地分支：main / space/<user>/<name> / contribute/* 等            │
└──────────────────────────────────────────────────────────────────────┘
                               │ worktree
                               ▼
┌─ 运行时 worktree ────────────────────────────────────────────────────┐
│  <space>/.wopal/                   [branch: space/<user>/<name>]     │
│  └── agent 直接编辑此目录，影响正在运行的 ellamaka                       │
└──────────────────────────────────────────────────────────────────────┘
```

**要点**：

- `wopal space init` 默认以 clone 方式获取 ontology 仓库。
- 本地仓库是唯一的 git 操作入口。运行时 worktree 是其 git worktree。
- origin 指向 clone source。需要向上游贡献时，CLI 自动创建 fork 并配置 remote（无需手动操作）。

### Fork 模式（可选替代）

用户可在 `wopal setup` 时传入 `--fork`，或后续手动配置 fork remote。Fork 模式下 origin 指向用户 fork，另配置 upstream 指向 wopal-cn/ontology。

本文档的其余部分均基于 clone 模式描述。Fork 模式仅在需要时按需启用。

---

## 2. 分支命名约定

| 前缀 | 格式 | 用途 | 生命周期 |
|------|------|------|----------|
| `main` | `main` | 通用能力基线。所有 space 的共同祖先分支。 | 永久分支 |
| `type/*` | `type/<name>` | 类型特定能力。如 `type/developer`、`type/manager`。在 main 基础上叠加特定角色的能力集。 | 永久分支，随 main 更新同步 |
| `type/<user>/*` | `type/<user>/<name>` | 用户对类型分支的定制。上游不合并此分支，仅供本地使用。 | 永久分支，随对应 type/* 同步 |
| `space/<user>/*` | `space/<user>/<name>` | Space 实例的定制分支。运行时 worktree 挂载在此分支上。 | 永久分支，随 main 更新同步 |
| `contribute/<target>/*` | `contribute/<target>/<topic>` | 向上游贡献的临时分支。从目标分支创建，cherry-pick 后通过 PR 合并。 | 临时分支，合并后删除 |
| `feature/*` | `feature/<topic>` | 本地功能开发分支。用于在隔离环境中开发新能力。 | 临时分支，完成后合并或删除 |

**规则**：

- 永久分支通过 `wopal ontology sync` 从上游同步更新。
- 临时分支在完成使命后应删除，避免分支膨胀。
- Agent 不自行决定分支名称，须与用户确认。

---

## 3. Agent 工作流

以下是 agent 在四种核心操作中的工作模式。

每个工作流遵循相同的模式：

1. **读取状态** — 执行 CLI 命令获取当前 ontology 状态。
2. **解读状态** — 分析输出，识别用户需要关注的信息。
3. **与用户讨论** — 向用户说明当前状况，提出建议。
4. **构建命令** — 根据用户决策构建精确的 CLI 命令。

### 3.1 检查状态

**命令**：`wopal ontology status`

**用途**：了解当前 ontology 的分支、同步状态和未提交变更。

**Agent 步骤**：

1. 执行 `wopal ontology status`，获取 Markdown 格式的状态报告。
2. 解读输出中的关键信息：
   - 当前分支名称
   - 与上游的 divergence（ahead / behind）
   - 未提交的变更文件列表
   - 未推送的 commit 数量
3. 向用户说明当前状态，重点突出需要注意的项（如落后上游较多、有未提交变更等）。
4. 根据状态提出下一步建议（如需要 update、需要 save 等）。

**示例对话**：

```
Agent: 当前 ontology 状态如下：
  - 分支：space/sam/main
  - 上游 main 领先 3 个 commit
  - 有 2 个文件已修改但未提交
  建议先提交本地变更，再同步上游更新。是否现在提交？
```

### 3.2 更新

**命令**：`wopal ontology update`

**用途**：将上游 main 的最新更新合并到当前分支。

**Agent 步骤**：

1. 先执行 `wopal ontology status`，确认当前状态适合更新：
   - 无未提交变更（有则建议先提交）
   - 无未推送的 commit（有则与用户讨论处理方式）
2. 向用户说明即将发生的变更：
   - 将从哪个分支（通常是 main）获取更新
   - 合并到哪个分支（当前分支）
   - 预计影响的范围
3. 用户确认后，执行 `wopal ontology update`。
4. 更新完成后，提示用户重启 ellamaka 以加载新能力。

**安全检查**：

- 当前分支有未提交变更时，不直接执行 update。先让用户决定是提交还是暂存。
- `contribute/*` 等临时分支通常不需要从上游更新。

### 3.3 同步

**命令**：`wopal ontology sync --from <A> --to <B>`

**用途**：将分支 A 的更新合并到分支 B。支持在任意分支对之间同步。

**Agent 步骤**：

1. 先执行 `wopal ontology status`，了解两个分支的差异。
2. 与用户讨论同步方向和安全性：
   - `--from` 是源分支（提供更新的分支）
   - `--to` 是目标分支（接收更新的分支）
   - 常见方向：`main → space/<user>/<name>`（获取上游更新）或 `main → type/<name>`（更新类型分支）
3. 评估潜在风险：
   - 目标分支是否有未提交变更
   - 两个分支的 divergence 程度
   - 是否存在已知的冲突区域（如双方都修改了同一文件）
4. 用户确认后，执行命令。
5. 若出现冲突，转至[冲突处理指南](#4-冲突处理指南)。

**典型用法**：

| 场景 | 命令 |
|------|------|
| 同步上游 main 到 space 分支 | `wopal ontology sync --from main --to space/sam/main` |
| 同步上游 main 到 type 分支 | `wopal ontology sync --from main --to type/developer` |
| 同步 type 分支到 space 分支 | `wopal ontology sync --from type/developer --to space/sam/main` |

### 3.4 贡献

**命令**：`wopal ontology contribute`

**用途**：将本地变更贡献回上游仓库。CLI 自动处理分支创建、cherry-pick 和 PR 流程。

**Agent 步骤**：

1. 执行 `wopal ontology status`，获取当前分支状态。
2. 识别可贡献的 commit：
   - 列出当前分支相对于 main 的新增 commit
   - 逐个讨论：哪些是通用能力（应贡献），哪些是 space 定制（不应贡献）
3. 与用户确认贡献范围：
   - 贡献目标分支（默认为 main）
   - 贡献主题（用于分支命名和 PR 标题）
   - 要包含的 commit 列表
4. 用户确认后，执行 `wopal ontology contribute`。CLI 将：
   - 创建 `contribute/<target>/<topic>` 分支
   - Cherry-pick 选定的 commit
   - 如需要，自动 fork 并推送
   - 创建 PR
5. 向用户报告 PR 链接和后续步骤。

**筛选原则**：

| 变更内容 | 是否贡献 | 原因 |
|----------|----------|------|
| `skills/`、`agents/`、`commands/`、`rules/` 的通用逻辑 | 是 | 对所有 space 有价值 |
| `plugins/` 的核心功能修复 | 是 | 插件是通用组件 |
| `config/` 中的全局默认值 | 是 | 初始化依赖 |
| 用户特定路径或配置 | 否 | 仅当前 space 需要 |
| 正在进行中的实验性功能 | 否 | 尚未成熟 |

---

## 4. 冲突处理指南

同步或更新操作可能产生合并冲突。Agent 的处理原则：

**冲突发生时**：

1. 暂停操作，向用户报告冲突的文件列表和冲突性质。
2. 按以下优先级判断处理方式：

| 冲突场景 | 建议处理 | 理由 |
|----------|----------|------|
| 上游修改了通用能力，本地也修改了同一文件 | 保留上游版本，手动移植本地特有改动 | 通用能力应与上游一致 |
| 上游重构了文件结构，本地修改了旧路径的文件 | 以上游新结构为准，将本地逻辑迁移到新路径 | 结构应跟随上游演进 |
| 本地新增的文件与上游新增文件同名 | 对比内容，合并两边的改动 | 双方都有有效新增 |
| 配置文件冲突（如 settings.jsonc） | 合并双方的有效配置项 | 配置需要定制化 |

3. 冲突解决后，完成合并操作并提交。
4. 提示用户重启 ellamaka 验证新能力正常加载。

**预防措施**：

- 定期执行 update，减少积累大量 divergence 后的冲突风险。
- 避免在 space 分支中修改上游频繁变更的核心文件。定制内容应通过 overlay（space 目录的同名覆盖）实现，而非直接修改上游文件。

---

## 5. 常见场景 FAQ

### Q1: Squash merge 后 GitHub 显示 "N commits ahead"，需要修复吗？

**不需要。**

上游采用 squash merge 将 PR 的多个 commit 压缩为一个。本地保留了原始粒度的 commit，所以 git 认为本地领先。这是 squash merge 的正常现象，不影响实际同步。

不要 force push 修复。那会丢失本地的 commit 历史。

### Q2: 多个 space 如何独立演化？

每个 space 使用独立的 `space/<user>/<name>` 分支。它们都从 `main` 获取通用更新，各自保留定制内容。互不干扰。

```
main ──────────────────────────────
  │
  ├─ space/sam/main       (sam 的定制)
  ├─ space/alice/main     (alice 的定制)
  └─ space/bob/main       (bob 的定制)
```

### Q3: 如何知道上游有没有新更新？

执行 `wopal ontology status`。输出中会显示当前分支与上游的 divergence。如果显示 "behind N commits"，说明上游有 N 个新 commit 尚未同步。

### Q4: 贡献的 PR 合并后，本地分支还需要做什么？

PR 合并后，上游 squash merge 会生成一个新的 commit。下次执行 `wopal ontology update` 时，这个新 commit 会合并到本地。本地 `contribute/*` 分支可以删除。

### Q5: Clone 模式下能否向上游贡献？

可以。执行 `wopal ontology contribute` 时，CLI 会自动处理 fork 创建和 PR 提交。Agent 和用户无需手动配置 fork remote。

### Q6: 能力在 space 中孵化成熟后，如何提升到上游？

1. 确认能力已稳定且具有通用价值。
2. 通过 `wopal ontology contribute`，将相关 commit 贡献到上游 main。
3. 上游 review 合并后，所有 space 在下次 update 时自动获取。

---

## 参考文档

- `DESIGN.md` §6.6 — Distribution Summary（clone/fork 分发模型）
- `DESIGN.md` §6.7 — Base Capabilities and Space Overlay（双层能力模型）
- `DISTRIBUTION.md` — ontology 的 Git source、worktree、template handoff 与 runtime loading 契约
- `capability-layers.md` — 能力层级模型与同步契约
