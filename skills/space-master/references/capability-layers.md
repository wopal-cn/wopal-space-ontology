# 能力分层与同步契约

本节定义 ontology fork main 与 space/main 之间的能力分层模型、同步铁律以及下放/裁剪流程。

`upstream/main` ↔ `fork main` 的外部协作见 `upstream-sync.md`，本节专注于 ontology 仓库内部的两个分支关系。

---

## 双栈独立扫描

ellamaka 启动时**独立扫描两个目录**加载能力（agents / skills / plugins / commands / rules）：

```
~/.wopal/{agents,skills,plugins,commands,rules}
    ← 软链接到 ~/.wopal/ontologies/wopal-space-ontology/ 的 fork main checkout
    ← 用户级能力全集（跨空间共享）

<workspace>/.wopal/{agents,skills,plugins,commands,rules}
    ← space/<name> 分支的 worktree
    ← 空间级裁剪与扩展
```

**关键含义**：space/main **不需要是 fork main 的超集**。两个目录独立扫描。装饰性能力（如音效、主题）只在 fork main 上存在即可，通过 `~/.wopal/plugins` 软链接对所有空间全局可见。

ellamaka 的具体加载机制（哪些是覆盖、哪些是补充、哪些是合并）以项目源码和文档为准，本节仅描述 ontology 仓库层的契约。

---

## 能力分类

| 类型 | 定义 | 仓库归属 | 典型例子 |
|------|------|---------|---------|
| **用户级** | 跨空间共享、稳定的通用能力 | fork main | agents、skills、rules、装饰性 plugins（音效/主题）、功能性 plugins（wopal-plugin） |
| **空间级** | 特定空间的定制、未成熟的实验性能力 | space/main | 空间专属 templates、配置覆盖 |
| **过渡期** | 在 space/main 孵化，成熟后下放 | 先 space/main，后 fork main | 大多数新能力默认从空间级开始 |

**关键承认**：能力归属是**事后追溯**的，不是事前明确的。新能力默认从空间级开始孵化，使用一段时间后再决定是否下放。

---

## 同步原则

### 默认目标：保持 `space/main → fork main` 可直接 merge

| 方向 | 允许？ | 方式 | 触发时机 |
|------|-------|------|---------|
| `upstream/main → fork main` | ✅ | `git merge` | 上游有更新 |
| `fork main → space/main` | ✅ | `git merge` | 同步用户级增强到空间 |
| `space/main → fork main` | ✅ | `git merge` | space/main 没有删除 fork main 上的用户级能力 |
| `space/main → fork main` 单向下放 | ✅ | `git checkout space/main -- <files>` + 新 commit | 只下放单个能力 |
| `fork main → upstream` | ✅ | GitHub PR | 贡献通用能力 |

**核心判断**：频繁优化 plugin、skill、agent 时，`space/main → fork main` 直接 merge 最省心。为了让这个路径可用，space/main 应尽量保留 fork main 上的用户级能力文件。

### 唯一风险：删除会随 merge 向上传播

space/main 上对用户级能力的 `git rm` 若直接 merge 到 fork main，会从 fork main 上删除这些能力，并通过 `~/.wopal` 软链接影响所有空间。

**处理规则**：如果 space/main 已经删除了 fork main 上的用户级能力，先把这些文件从 fork main 放回 space/main，再执行向上 merge。

```bash
cd <workspace>/.wopal
git checkout main -- <deleted-user-level-files>
git add <deleted-user-level-files>
git commit -m "fix(<scope>): restore user-level capabilities for merge"
```

历史教训：fork main 上曾有 `Merge branch 'space/main'` 提交（`d4a717c`），导致用户级插件被反向删除。后续通过恢复插件文件、恢复 wopal-plugin、再重新 merge 的方式修正。

---

## 操作流程

### 流程 1：日常同步（space/main → fork main）

**场景**：space/main 上频繁优化 plugin、skill、agent，希望同步到用户级 fork main。

```bash
cd ~/.wopal/ontologies/wopal-space-ontology
git checkout main

# 先检查 space/main 是否删除了 fork main 上的文件
git diff --name-status main...space/main | awk '$1 ~ /^D/ {print}'

# 若没有需要保护的用户级删除，直接 merge
```

**输出非空时**：先回到 `<workspace>/.wopal`，按“恢复被删除的用户级能力”流程处理，再回来 merge。

### 流程 2：恢复被删除的用户级能力（main → space/main）

**场景**：space/main 删除了主题、声音通知、用户级插件等能力，导致不能安全向上 merge。

```bash
cd <workspace>/.wopal
git checkout main -- <files-or-dirs>
git status
git add <files-or-dirs>
git commit -m "fix(<scope>): restore user-level capabilities for merge"
```

恢复后，space/main 与 fork main 在这些文件上重新对齐，后续可直接 merge。

### 流程 3：能力下放（space/main → fork main 单向）

**场景**：只想下放一个能力，不想把 space/main 上其他优化一起 merge。

```bash
cd ~/.wopal/ontologies/wopal-space-ontology
git checkout main                               # 确认在 fork main
git checkout space/main -- <files-or-dirs>      # 单向拉取文件状态
git status                                       # 检查变更范围
git add <files>
git commit -m "feat(<scope>): promote <capability> to user-level"
```

**注意**：不要 push（push 是用户权限）。

**下放后**：下一次 `fork main → space/main` merge 时不会冲突（内容已一致）。

### 流程 4：同步上游增强（fork main → space/main）

```bash
cd <workspace>/.wopal
git merge main --no-edit
# 冲突优先保留上游版本，自定义内容手动合并
```

### 流程 5：在 fork main 上直接开发用户级能力

适合从一开始就明确是用户级的能力：

```bash
cd ~/.wopal/ontologies/wopal-space-ontology
git checkout main
# 直接修改 agents/skills/plugins/rules
git commit -m "feat(<scope>): description"

# 同步到所有空间
cd <workspace>/.wopal
git merge main --no-edit
```

### 流程 6：空间裁剪（不删除源文件）

**优先策略**：用 ellamaka 配置层禁用（如 agent 级 `"disable": true`），具体支持范围以 ellamaka 项目源码为准。

**兜底策略**：plugin/skill 等不支持配置禁用的层级，通过"不引用即不加载"自然失效——只要 config 不指向它，文件即使存在也不会被加载。

**已经用 `git rm` 裁剪了怎么办**：不是灾难，但会阻止直接向上 merge。若后续需要 `space/main → fork main` merge，先从 main 放回这些文件。

---

## 安全检查脚本

**向上 merge 前的安全检查**：

```bash
cd ~/.wopal/ontologies/wopal-space-ontology
git diff --name-status main...space/main | awk '$1 ~ /^D/ {print}'
```

输出非空 = space/main 删除了文件。逐项判断：
- 删除的是临时/废弃文件 → 可以 merge
- 删除的是用户级能力 → 先恢复到 space/main，再 merge

---

## 常见问题

### Q1: 如何判断能力是用户级还是空间级？

**不用事先判断**。新能力一律从 space/main 开始孵化。使用一段时间后：
- 跨多个空间都用 → 下放到 fork main
- 仅本空间使用 → 保留 space/main

### Q2: 装饰性 plugin 是否必须在 space/main 上？

从加载角度看，不一定必须存在。ellamaka 可通过 `~/.wopal/plugins` 软链接全局加载 fork main 上的 plugin。

从 Git 同步角度看，建议保留。这样 `space/main → fork main` 可以直接 merge，不会把 fork main 上的用户级能力删掉。

### Q3: 想恢复已被 space/main `git rm` 的能力怎么办？

从 fork main 放回 space/main：

```bash
cd <workspace>/.wopal
git checkout main -- <files>
git commit -m "fix(<scope>): restore user-level capabilities for merge"
```

### Q4: fork main 上误删了用户级能力怎么办？

用 **新 commit** 修正（不用 rebase 或 revert）：

```bash
cd ~/.wopal/ontologies/wopal-space-ontology
git checkout space/main -- <files>   # 从 space/main 单向拉取
git commit -m "feat(<scope>): restore <capability> as user-level"
```

历史教训参考：fork main 上 `91cf6b0` 是混合提交（加了音效增强但误删 wopal-plugin），已通过 `git checkout space/main --` 在 `24b1bde` 修正恢复。
