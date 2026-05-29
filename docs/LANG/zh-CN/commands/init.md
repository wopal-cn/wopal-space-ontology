---
description: 校准空间运行时结构
---

# 校准空间运行时结构

面向已有空间的维护场景：消费 `wopal space scan` 获取 repo / module 事实清单，对照 `STRUCTURE.md` compact schema 生成更新方案，校验 runtime 骨架与模板差异，在用户确认后写入变更。

**输入参数**: `$ARGUMENTS`

**参数说明**: 可选的关注范围或约束；未提供时执行全量校准。

---

## 核心原则

- `/init` 是已有空间的维护入口，不是 `wopal space init` 的替代；初始化走 CLI。
- 调用 `wopal space scan` 获取 repo / worktree 与 `AGENTS.md` 模块规范的事实清单；`/init` 不负责任何递归扫描。
- 对照 compact schema 生成 frontmatter / table diff：managed block 可由 `/init` 重写；user block 永不修改；用户从 managed table 删除的非固定资产不得静默补回。
- 运行时 `.wopal-space/` 只校验固定目录与文件是否存在，不深扫 runtime 内容，不把 runtime 写入 table。
- 所有写入操作必须先展示结构化报告并获得用户明确确认；未确认前不动任何文件。
- 每项发现标注分类：**缺失**（不存在）、**漂移**（存在但与声明不一致）、**模板差异**（实例与模板有出入）。

## Step 1: 收集上下文

读取以下来源构建空间状态快照：

1. `.wopal-space/STRUCTURE.md` — 提取 frontmatter、managed table、user table。
2. `wopal space scan` JSON — repo / module 事实清单。
3. `.wopal-space/` — 校验固定 dirs 与 files 存在性，不深扫。
4. 空间根目录 — 检查 `AGENTS.md` 和 `.gitignore` 是否存在。
5. `.wopal/templates/` — 参考模板用于差异比对。
6. `.wopal/templates/wopalspace-schema.yaml` — 规范布局参考。

若 `STRUCTURE.md` 不存在，报告并提示先运行 `wopal space init`，终止。

**Output**: 结构声明快照、scan 事实清单、runtime 存在性校验结果、模板差异候选。

## Step 2: 生成校准方案

1. 对照 compact schema 与 managed/user block 规则，生成 frontmatter / table diff 方案。
2. 识别缺失项、漂移项、未声明 scan 发现项。
3. 对每个有对应模板的运行时文件，展示 diff 摘要，高亮用户自定义内容。

**Output**: 结构化 diff 报告，逐项标注类型（缺失 / 漂移 / 模板差异）与处理建议。

## Step 3: 报告并确认

1. 展示完整结构化报告。
2. 仅当现有信息不足以判断状态时才提问：结构歧义、声明与事实冲突需决策、managed table stale 条目是否删除。
3. 等待用户明确说"可以"后再进入写入。

**Output**: 待用户确认的变更方案。

## Step 4: 确认后写入

仅执行用户批准的变更：

1. 创建缺失的目录 / 文件。
2. 更新 `STRUCTURE.md` 的 managed frontmatter 和 managed table。
3. 保留所有用户手写内容，不覆盖 user block。

**Output**: 已更新的文件路径与变更摘要。

## 完成后响应

用用户语言回复：

1. 更新的文件路径
2. 变更摘要（frontmatter / table / runtime 各层）
3. 需人工处理的模板差异
4. 未声明的 scan 发现项建议
