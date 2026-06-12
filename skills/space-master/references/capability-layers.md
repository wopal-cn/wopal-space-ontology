# 能力层级与同步契约

ontology 的能力按分支层级组织。每个层级承载不同成熟度的能力，层级之间通过 `wopal ontology` CLI 命令同步。

本节描述层级结构、能力分类、同步契约和删除安全。仓库拓扑和 CLI 命令详情见 `upstream-sync.md`。

---

## 层级模型

ontology 使用三层分支结构承载不同粒度的能力：

```
main                    ← 通用能力，所有空间共享
  └── type/<name>       ← 类型特定能力，某类空间共享
        └── space/<user>/<name>  ← 空间实例定制，单个空间独享
```

| 层级 | 分支命名 | 定位 | 变更权限 |
|------|---------|------|---------|
| 通用层 | `main` | 所有空间共享的基线能力 | 维护者提交 + PR 审核 |
| 类型层 | `type/<name>` | 某类空间共享的能力变体 | 维护者提交 + PR 审核 |
| 空间层 | `space/<user>/<name>` | 单个空间实例的定制 | 空间所有者直接编辑 |

`main` 是 ontology 的权威分支。`type/<name>` 从 `main` 分出，承载特定场景的定制。`space/<user>/<name>` 从 `type/<name>` 分出，是当前运行的空间实例。

---

## 能力分类

| 分类 | 属性 | 所属层级 | 典型例子 |
|------|------|---------|---------|
| **通用能力** | 跨所有空间共享、稳定 | `main` | 核心 agent 定义、基础技能、空间模板、wopal-plugin |
| **类型能力** | 某类空间共享、该类型的定制 | `type/<name>` | 前端项目空间的专属技能、特定技术栈的规则变体 |
| **空间能力** | 单个空间独享、实例级定制 | `space/<user>/<name>` | 用户个人偏好命令、空间专属配置覆盖、实验性技能 |
| **孵化能力** | 从空间层起步，验证后提升 | 先 `space/<user>/<name>`，后 `type/<name>` 或 `main` | 大多数新能力 |

核心原则：**能力在空间中孵化，成熟后提升到类型层或通用层**。

不需要事先判断一个能力属于哪个层级。新能力一律从 `space/<user>/<name>` 开始。使用一段时间后，根据实际需求决定是否提升：

- 多个同类空间都需要 → 提升到 `type/<name>`
- 所有空间都需要 → 提升到 `main`
- 仅当前空间使用 → 保留在 `space/<user>/<name>`

---

## 同步契约

层级之间的同步通过 `wopal ontology` CLI 命令完成，agent 负责读取状态、与用户讨论、构建命令。

### 契约 1：通用层 → 类型层

```
main ──merge──→ type/<name>
```

**场景**：`main` 有了新的通用能力或重要修复，类型层需要同步。

**操作**：`wopal ontology sync --from main --to type/<name>`

**安全检查**：
- 同步前确认 `type/<name>` 没有删除 `main` 上的文件
- 若有删除，agent 应提示用户：是保留本地修改还是接受上游版本

**要点**：通用更新应尽量及时同步到类型层，避免积累过多差异导致合并冲突。

### 契约 2：类型层 → 空间层

```
type/<name> ──merge──→ space/<user>/<name>
```

**场景**：类型层有了更新，当前空间实例需要跟进。

**操作**：`wopal ontology update`

**安全检查**：
- `wopal ontology status` 会显示空间层与类型层的差异
- agent 应向用户解释将要合并的变更内容
- 空间层的本地定制不会丢失（merge 保留双方变更）

**要点**：这是最常见的同步方向，定期执行即可保持空间与类型层对齐。

### 契约 3：空间层 → 类型层（贡献）

```
space/<user>/<name> ──cherry-pick + PR──→ type/<name>
```

**场景**：空间中孵化出一个能力，适合提升到类型层。

**操作**：`wopal ontology contribute --target type/<name>`

**安全检查**：
- agent 应与用户讨论：哪些 commit 适合贡献，哪些属于空间私有定制
- 只 cherry-pick 通用性的变更，不包含空间特定的路径、配置或个人偏好

**要点**：贡献是单向的。cherry-pick 到类型分支后创建 PR，经审核后合入。

### 契约 4：空间层 → 通用层（贡献）

```
space/<user>/<name> ──cherry-pick + PR──→ main
```

**场景**：空间中孵化出一个能力，适合提升到通用层。

**操作**：`wopal ontology contribute --target main`

**安全检查**：
- 与契约 3 相同的 commit 筛选讨论
- 额外确认该能力确实适用于所有空间，而非仅特定类型

**要点**：提升到 `main` 是最高级别的贡献，审核更严格。能力应先经过多个空间验证后再考虑。

---

## 删除安全

删除是层级同步中最容易出问题的操作。Git merge 会传播删除——如果低层级删除了高层级的文件，merge 会把删除带到高层级。

### 规则

| 场景 | 行为 | 处理方式 |
|------|------|---------|
| `main` 删除文件 | 删除通过 sync 传播到 `type/<name>` 和 `space/<user>/<name>` | 正常接受，这是维护者的意图 |
| `type/<name>` 删除文件 | 删除通过 update 传播到 `space/<user>/<name>` | 正常接受，类型层决定该类型不需要该能力 |
| `space/<user>/<name>` 删除文件 | **不会**传播到 `type/<name>` 或 `main` | 安全——贡献是 cherry-pick，不是 merge |
| `space/<user>/<name>` 隐藏能力 | 通过 ellamaka 配置禁用或"不引用即不加载" | 优先于删除，避免影响后续同步 |

### 向上 merge 前的检查

`wopal ontology status` 会报告层级间的文件差异。agent 在执行向上 sync 前，应检查输出中是否有删除标记（D 状态的文件），并与用户确认：

- 删除的是废弃文件 → 可以同步
- 删除的是高层级能力 → 先在低层级恢复，再执行同步

### 空间裁剪策略

优先用 ellamaka 配置层禁用不需要的能力（如 agent 级 `"disable": true`）。若配置不支持，通过"不引用即不加载"自然失效——只要配置不指向它，文件存在也不会被加载。

---

## ellamaka 双扫描模型

ellamaka 启动时独立扫描两个目录加载能力：

```
$WOPAL_HOME/{agents,skills,commands,rules,plugins}
    ← ontology main 的 symlink 或 managed copy
    ← 通用基础能力（跨空间共享）

<space>/.wopal/{agents,skills,commands,rules,plugins}
    ← space/<user>/<name> 分支的 worktree
    ← 空间定制与扩展
```

同名能力由 space overlay 覆盖 base，ellamaka 按目录优先级顺序串行合并。

### 为什么层级重要

双扫描模型意味着两个目录是**独立加载**的，不需要 space 分支是 main 的超集。这也解释了为什么层级间同步需要显式操作而不是隐式覆盖：

- `main` 的变更通过 `wopal ontology sync` 传播到类型层和空间层
- 空间层的定制通过 overlay 机制直接生效，无需 merge 到 main
- 贡献（cherry-pick + PR）是显式的、可审核的，防止未经验证的能力污染上层

具体加载机制（哪些覆盖、哪些补充、哪些合并）以 ellamaka 项目源码为准。
