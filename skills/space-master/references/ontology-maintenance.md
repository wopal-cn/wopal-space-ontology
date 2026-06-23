# Ontology Maintenance — Agent Operations Guide

机制设计（四层检测原理、PR merge 策略、超集不变量、上行链条 U1-U5、贡献路径）见 ontology DESIGN §6.8。本指南只定义 agent 执行本体维护时的操作规则：看到什么信号，做什么操作。

---

## 触发条件

- 用户要求检查/更新/贡献本体
- `/ontology-maintain` 命令
- 定期维护

---

## 操作流程

### 第一步：Check

```
wopal ontology check
```

获取四层检测结果：每个段的 tree hash 门控、文件差异清单、方向信号（downstream/upstream）、merge 冲突预测。

### 第二步：解读信号，确定操作

按优先级从高到低检查：

| 优先级 | 检查项 | 条件 | 操作 |
|--------|--------|------|------|
| 1 | worktree 状态 | 有未提交变更 | 先提交 |
| 2 | D1-D4 downstream | merge-tree clean | `ontology update` |
| 3 | D1-D4 downstream | merge-tree conflicts | cherry-pick 具体变更，手动解决冲突 |
| 4 | D5 超集 | FAIL | merge main 到 type/coding 修复 |
| 5 | D6 downstream | space 落后 type/coding | `space update` |
| 6 | U1 upstream | space 有有价值变更 | 与用户讨论是否贡献 |
| 7 | U2/U3 upstream | 本地有未推送变更 | push |
| 8 | U4/U5 upstream | fork 有待贡献上游的变更 | 与用户讨论是否 PR |

**关键原则**：agent 不自动执行贡献——贡献涉及"哪些变更有普遍价值"的语义判断，必须与用户讨论后决定。下行同步（update）在 merge-tree clean 时可以自动建议执行。

### 第三步：执行下行同步（如有 downstream 信号）

**ontology update（HOME 级）**：

1. `wopal ontology update --confirm`（merge-tree clean 时自动 merge）
2. 如有冲突 → 报告冲突文件 → 手动解决 → commit
3. D5 超集 FAIL → merge main 到 type/coding → commit
4. fork 模式 → push 到 origin

**space update（Space 级）**：

1. `wopal space update --confirm`（在 space worktree 中 merge type/coding）
2. 如有冲突 → 手动解决（保留空间定制 + 接收本体变更）→ `git add` → `git commit --no-edit`

### 第四步：执行上行贡献（如有 upstream 信号 + 用户确认）

上行是链条，必须从 U1 开始逐级上行：

**U1（space → type/coding）**：

贡献路径选择（与用户讨论后决定）：

| 变更适用范围 | 贡献到 | 方式 |
|-------------|--------|------|
| 同类空间通用 | type/coding | 直接 PR 或精选 PR |
| 所有空间通用 | main | 精选 PR（贡献分支） |
| 本空间特有 | 不贡献 | 留在 space 分支 |

直接 PR：差异全是通用变更 → 从 space 分支创建 PR 到父层（squash merge）。

精选 PR：混合了通用和私有变更 → 从目标层创建贡献分支 → cherry-pick 选定提交 → PR 贡献分支到目标层。

**U2/U3（local → origin）**：

```
git push origin main
git push origin type/coding
```

**U4/U5（origin → upstream）**：

跨仓库 PR。选择有价值的提交 → cherry-pick 到 contribute 分支 → push → 创建 PR（base = upstream 目标分支）。

---

## 冲突解决规则

### 预测

check 第四层（`git merge-tree`）在执行前预测冲突。clean 时自动 merge；conflicts 时报告冲突文件列表。

### 解决

agent 手动编辑冲突文件，保留双方有价值的改动：

| 冲突类型 | 解决策略 |
|---------|---------|
| `settings.jsonc`（尾换行 + 配置块） | 合并保留两者（配置块 + 尾换行） |
| 上游修改了通用能力，本地也修改了同一文件 | 以上游版本为基，移植本地特有改动 |
| 双方新增同名文件 | 对比内容，合并两边改动 |
| 上游删除了文件（下行信号） | 确认删除是否适用于本地空间 |

解决后：`git add <resolved-files>` → `git commit --no-edit` 完成 merge。

---

## PR 规范

所有上行回流采用 PR merge（squash merge）。提交标题遵循 Conventional Commits 格式。贡献分支是临时分支，PR 合并后删除。

---

## 验证

每次操作后验证：
- 下行同步后：重跑 check 确认 downstream 信号消失
- 上行贡献后：确认 PR 创建成功，等待合并
- 超集修复后：D5 段 PASS
