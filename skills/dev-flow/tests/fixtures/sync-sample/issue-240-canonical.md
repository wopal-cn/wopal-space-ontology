## Goal

把 isolated（隔离）模式下的进化实施链路修顺，让下面这条流程从头到尾能实际走通：

```
实施（不提交）→ 主控验证并填写记录 → 每完成一个 task 一次提交（该 task 代码 + 记录）到工作分支
→ rook 实施评审 → 通过 → 用户验证 → 用户明确确认 → 集成（integrate）→ 归档
```

当前有四个断点挡在路上：**记录会被静默吞掉**、**提交只能跨分支绕道**、**集成没有用户确认门且验证被迫后置**、**归档被无关的未提交改动阻断**。

## Context

### 问题与原因（2026-09-27 实测，refactor-plugin-config-consumption 实施与评审）

**① 记录编辑被静默吞掉。**
- 现象：主控在隔离工作区给提案勾选完成、回填文件清单后执行提交，记录无声消失——没有报错、没有警告。
- 原因：隔离提交前会无条件用 `.wopal` 权威副本覆盖隔离工作区的提案副本，且不检查副本是否被人改过（`projects/wopal-cli/src/lib/space-proposal.ts:477`）。

**② 主控无法把「代码+记录」一次提交到工作分支。**
- 目标：实施不提交；主控验证后把「代码 + 记录」作为**一个提交**，落在工作分支（isolated = 隔离分支；quick = 空间分支）。
- 现状：因为 ① 的覆盖逻辑，主控在隔离分支上做不到这点；实际只能退化为「在空间分支另发一个记录提交」的跨分支变通——本次真实发生了三次（`4c15291` / `6edf893` / `45f86b6`），正是要根除的形态。

**③ 集成没有用户确认门；验证被迫在集成之后。**
- 现象：`integrate` 目前无需任何确认即可执行，集成先于用户验证发生。
- 原因：命令没有确认门；且机制没有「把 `.wopal` 切到隔离分支供用户真机验证、之后再切回」的能力（dev-flow 的 verify-switch 在 evo 家族没有等价物；手工做有陷阱：同一分支不能同时挂在两个 worktree）。

**④ 归档被无关的未提交改动阻断。**
- 现象：`space evo archive` 以「空间工作区存在未提交改动」为由整体拒绝（2026-09-28 实测：consumption 归档被与提案无关的在途设计改动卡住）。
- 原因：预检做的是全空间工作区全量脏检查；但归档记录提交严格按名、不相关改动本不可能随行——按 dev-flow 的路径感知脏检查放宽即可（隔离 worktree / sparse / 内容守卫保留）。

### 顺手修清楚的附带问题

- `evo commit --help` 的示例路径带 `.wopal/` 前缀，照抄会被判 invalid 拒绝；正确基准 = **被提交侧工作区根**（isolated = 隔离工作区；quick/instant = `.wopal`）。
- `integrate` 遇到脏工作区被拒时的提示应直接指路（「先把工作区里的改动提交掉」）。

### 目标流程（用户已定稿）

```
实施（隔离分支，不提交）
→ 主控趁会话存活验证（有问题同会话返工）
→ 主控提交「代码+记录」到工作分支
→ rook 实施评审（强制）
→ 通过 → 用户验证：
     先询问用户选择验证方式；优先推荐：分支切换（把 .wopal 切到隔离分支观察，验证后切回）
     可选：先集成后验证（用户显式选择）
→ 用户明确确认 → integrate（用户门控）→ 归档
```

## Scope

### In（解决方案）

1. **去掉覆盖式覆盖**：隔离提交不再用 `.wopal` 副本覆盖隔离工作区副本；记录编辑随提交正常入库。
2. **阶段即时同步**：`advance` 在隔离工作区存在时，把阶段变更立即写进工作区副本（不再依赖「下次提交时归一」），保证两侧始终可无冲突地 squash 合并。
3. **验证切换（新能力）**：等价 dev-flow verify-switch 的 `space evo switch`：把 `.wopal` 切到隔离分支供真机验证；切回仅切分支（不重挂 worktree）、不引入持久化状态。
4. **集成门控**：`integrate` 增加确认门（对齐 `--confirm` 约定）；未确认时拒绝并给出指引。验证期与确认后的阶段语义在 `DESIGN-evolution.md` 定稿。
5. **文档修正**：`--paths` 示例与基准说明；`integrate` 脏工作区拒绝信息的指路语；`DESIGN-evolution.md` 契约同步。
6. **归档预检放宽**：空间工作区的不相关未提交改动不再阻断 `archive`（记录提交按名、不随行）；对齐 dev-flow 的路径感知脏检查。

### Out

- 技能文档正文（由进化提案 `refactor-evolution-flow` 承接）。
- 归档与交付终端（`space sync` / `ontology contribute`）行为不变。

## Acceptance Criteria

（plan 阶段细化；此处为方向）

1. **记录不丢**：在隔离工作区编辑提案副本后执行提交——编辑不被覆盖，且随本次提交入库。
2. **阶段一致**：`advance` 执行后，两个副本的阶段字段立即一致（不需等到提交）。
3. **单提交（按 task）**：每完成一个 task，主控在隔离分支用**一个提交**携带「该 task 代码 + 记录」；集成后 squash 干净，无跨分支记录提交。
4. **验证切换**：执行切换后 `.wopal` 位于隔离分支、运行时加载特性分支内容；切回后恢复空间分支（不重建 worktree）。
5. **门控**：未确认的 `integrate` 被拒绝（含指引）；确认后可执行。
6. **回归**：quick / instant / accept / advance 行为不变；`projects/wopal-cli` 测试全绿。
7. **归档预检放宽**：存在无关未提交改动时 `archive` 正常成功——记录提交仅含提案新旧两路径、改动保持原状。

## Related Resources

| 类型 | 链接/路径 |
|------|----------|
| 实测会话 | `refactor-plugin-config-consumption` 实施与评审（2026-09-27） |
| 技能侧提案 | `.wopal/docs/evolutions/refactor-evolution-flow.md` |
| 参照实现 | dev-flow 的 `verify-switch` 与 `--confirm` 门控 |
| 设计契约 | `projects/wopal-cli/docs/DESIGN-evolution.md` |
| Plan | [20260929-240-enhance-wopal-cli-isolated-evo-flow](https://github.com/sampx/wopal-space/blob/main/.wopal-space/plans/wopal-cli/done/20260929-240-enhance-wopal-cli-isolated-evo-flow.md) |


