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

## 同步铁律

### 唯一禁止：`space/main → fork main` 直接 merge

| 方向 | 允许？ | 方式 | 触发时机 |
|------|-------|------|---------|
| `upstream/main → fork main` | ✅ | `git merge` | 上游有更新 |
| `fork main → space/main` | ✅ | `git merge` | 同步上游增强到空间 |
| **`space/main → fork main` 直接 merge** | ❌ **禁止** | — | — |
| `space/main → fork main` 单向下放 | ✅ | `git checkout space/main -- <files>` + 新 commit | 单个能力下放 |
| `fork main → upstream` | ✅ | GitHub PR | 贡献通用能力 |

**禁止原因**：space/main 上对用户级能力的 `git rm`（合理裁剪）若反向 merge 到 fork main，会从 fork main 上永久丢失这些能力，并通过 `~/.wopal` 软链接破坏所有空间的能力栈。

历史教训：fork main 上曾有 `Merge branch 'space/main'` 提交（`d4a717c`），导致装饰性插件一度被反向删除。已通过 `91cf6b0` 部分恢复，但 `wopal-plugin` 等仍需手动下放（见下文操作流程）。

### `space/main` 上 `git rm` 用户级能力：允许且合理

**允许场景**：你认为某些 fork main 上的能力（如装饰性插件）不该出现在 space/main。直接 `git rm` 是合理操作。

**约束**：**只要不做反向 merge**，这些能力仍在 fork main 上、通过 `~/.wopal` 软链接全局可见，没有损失。

**当前实例**：本空间（wopal-workspace）已 git rm 了 `plugins/tui-ellamaka.tsx`、`plugins/ellamaka-theme.json`、`plugins/asset/*.wav` 等装饰性插件。这些文件仍在 fork main 上，通过 `~/.wopal/plugins` 软链接对本空间可见——状态健康。

---

## 操作流程

### 流程 1：能力下放（space/main → fork main 单向）

**场景**：在 space/main 上孵化成熟的能力，希望跨空间共享。

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

### 流程 2：同步上游增强（fork main → space/main）

```bash
cd <workspace>/.wopal
git merge main --no-edit
# 冲突优先保留上游版本，自定义内容手动合并
```

### 流程 3：在 fork main 上直接开发用户级能力

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

### 流程 4：空间裁剪（不删除源文件）

**优先策略**：用 ellamaka 配置层禁用（如 agent 级 `"disable": true`），具体支持范围以 ellamaka 项目源码为准。

**兜底策略**：plugin/skill 等不支持配置禁用的层级，通过"不引用即不加载"自然失效——只要 config 不指向它，文件即使存在也不会被加载。

**已经用 `git rm` 裁剪了怎么办**：不需要修复。只要 fork main 上还在，能力就全局可见。space/main 上的"缺失"是合理状态。

---

## 安全检查脚本

**反向上放前的安全检查**（执行 `git checkout space/main --` 前可选）：

```bash
# 列出 space/main 上 git rm 但 fork main 仍存在的文件
cd ~/.wopal/ontologies/wopal-space-ontology
git log --diff-filter=D --name-only main..space/main | sort -u
```

输出非空 = space/main 上做过裁剪。可以继续单向拉取，**但绝不能直接 merge**。

---

## 常见问题

### Q1: 如何判断能力是用户级还是空间级？

**不用事先判断**。新能力一律从 space/main 开始孵化。使用一段时间后：
- 跨多个空间都用 → 下放到 fork main
- 仅本空间使用 → 保留 space/main

### Q2: 装饰性 plugin 为什么不需要在 space/main 上？

ellamaka 通过 `~/.wopal/plugins` 软链接全局加载 fork main 上的所有 plugin。space/main 上有没有这些文件，对 plugin 加载没有影响。让 fork main 持有即可。

### Q3: 想恢复已被 space/main `git rm` 的能力怎么办？

**不需要恢复**。只要 fork main 上还在，能力就仍然全局可见。space/main 上的"缺失"是合理裁剪状态，不是问题。

### Q4: fork main 上误删了用户级能力怎么办？

用 **新 commit** 修正（不用 rebase 或 revert）：

```bash
cd ~/.wopal/ontologies/wopal-space-ontology
git checkout space/main -- <files>   # 从 space/main 单向拉取
git commit -m "feat(<scope>): restore <capability> as user-level"
```

历史教训参考：fork main 上 `91cf6b0` 是混合提交（加了音效增强但误删 wopal-plugin），已通过 `git checkout space/main --` 在 `24b1bde` 修正恢复。
