# refactor-dev-flow-issue-sync

## Metadata

- **Type**: refactor
- **Project Path**: .wopal
- **Created**: 2026-09-28
- **Stage**: archived
- **Mode**: isolated
- **Worktree**: .worktrees/ontology-refactor-dev-flow-issue-sync
- **Branch**: ontology-refactor-dev-flow-issue-sync
- **Base Commit**: 65e074a3e63a7e9df9ccb8edaa11d158b1d8ade6
- **Final Commit**: fbcb9b3e2bbe2ed6d0c0762ffa36868f3b576738

## Scope Assessment

- **Complexity**: High — 四组行为横跨同步管线（`issue.py`/`plan.py`）、三条消费路径（手动 sync / 状态机自动同步 / 归档链接刷新）的收敛、approve 事务化（`approve.py`）、双语技能文档与参考文档的表述对齐；`issue.py`/`plan.py` 的多任务文件冲突强制两波实施。
- **Confidence**: High — 全部关键主张已逐条 file:line 实证：规范 vs 实现漂移、死代码零调用、approve 两缺陷（含提交 `c594069` 占位符与工作区未提交 SHA 行的实测）、历史沿革（`0a125aa`/`b06b96c`/`adc5977`）、真实 Issue 形态抽样（含 legacy 结构占比）。设计定向由 Wopal 给定；两处补充决策（章节同步不做状态门、legacy In/Out 兜底）已在 Key Decisions 写明理由。

## Goal

把 dev-flow 的 Plan → Issue 正文同步按规范恢复为**外科式三章节同步 + 链接行更新**的单一实现：Plan 的 `Goal` / `In Scope` / `Out of Scope` / `Acceptance Criteria` 映射进 Issue 对应章节（只替换映射范围，其余内容逐字保留，幂等），链接行维持 `| Plan |` 更新语义；同时收敛重复的行替换逻辑、清除旧正文生成器死代码、修复 approve 两处状态一致性缺陷、对齐全部文档与 CLI help 表述，使「代码与说明一致」。

## Technical Context

### Architecture Context

**规范声称 vs 实现真相（漂移主线）**：

- 规范：`.wopal/skills/dev-flow/references/issue-guide.md:86-101` 明文映射——Plan `Goal` → Issue `## Goal`；Plan `In Scope`/`Out of Scope` → Issue `## Scope`；Plan `Acceptance Criteria` → Issue `## Acceptance Criteria`；「只要映射章节发生变化，必须立即同步」。`SKILL.md:83/232/291` 与 `SKILL.zh-CN.md:81/230/289` 同款表述（`sync ... Mandatory after Plan content changes`）。
- 实现：只有链接行。`scripts/commands/sync.py:79-145`（`sync_plan_to_issue`）与 `scripts/issue.py:278-312`（`sync_plan_to_issue_body`，docstring 原文：`Only updates the | Plan | row, preserving all other Issue body content`）都只替换 `| Plan | ... |` 行，不触碰任何正文章节。
- 规范内部矛盾：`issue-guide.md:94` 的第四条映射「Plan `Related Resources` → Issue `## Related Resources`」不成立——Plan 模板（`templates/plan.md`）没有 `Related Resources` 章节；Issue 侧的 Plan 链接行由链接同步（`plan.py:420-447`）负责。需一并修正。

**同步时点（实现面）**：手动 `flow.sh sync <issue-or-plan> [--body-only|--labels-only]`（`commands/sync.py:216-266`）；状态机自动调用（`sync_plan_to_issue_body`）共五处，均在 Plan 批准之后：`approve.py:415`、`complete.py:388` 与 `complete.py:422`、`verify.py:417`、`archive.py:553`（归档后 `archive.py:670` 另走 `update_issue_plan_link` 刷新归档路径链接，`plan.py:506-577`）。

**技术债（同案清理）**：

- 死代码：`plan.py:332-417` 的 `_extract_plan_section`（围栏感知节抽取）、`_extract_subsection`、`_extract_acceptance_criteria`（编号 checkbox 转换）、`_render_issue_section` 全仓零调用（grep 复核：仅定义处）；`plan.py:445-447` `build_issue_body_from_plan` 名不符实（实际只产链接行，经 `issue.py:19-22` `_get_plan_functions` 调用）。
- 重复实现：行替换逻辑两份——`sync.py:104-131`（内联）与 `issue.py:326-340`（`_replace_plan_row_in_body`）；归档链接刷新是同一债务类的第三处（`plan.py:549-561`，按名称替换 URL 并带兜底正则）。
- approve 状态一致性：[D-1] worktree 创建失败路径（`approve.py:381-386`）在 Plan 已更新并提交为 executing（`approve.py:347-357`）之后打印「Plan 状态保持 planning，未进入 executing」——状态与提示均不实，且无回滚；[D-2] `Base Commit` 记录在 `commit_and_push_plan` 之后（`approve.py:389-404`），导致批准提交内是占位符、SHA 留在工作区未提交。

### Research Findings

**历史沿革（为何目标是「外科式恢复」而非回退到旧生成器）**：

- `0a125aa`（2026-05-17）：完整正文生成器已合并为唯一实现 `dev_flow/domain/plan/body.py#build_issue_body_from_plan`——从 Plan 抽取 Goal/Background/In Scope/Out of Scope/AC，**整文覆盖写入** Issue。
- `b06b96c`（2026-05-27，「simplify issue system」）：生成器收缩为链接行构建器（`build_issue_body_from_plan` → `build_plan_link_for_issue`）；但调用侧仍把返回值当整文覆盖写，产生覆盖缺陷（提交信息声称「preserves Context」，实际由调用侧行为决定）。
- `adc5977`（2026-05-29，rook-fix）：把 `sync_plan_to_issue_body` 修为「只替换 `| Plan |` 行、保留其余」——即现行实现。
- 结论：回退到整文覆盖会重复历史错误；目标 = 外科式恢复（只替换映射章节，保留非映射内容）。

**死代码来源**：`29cd19a` 建立扁平结构时把旧 `body.py` 的抽取/渲染 helper 一并移植进 `scripts/plan.py`；`cc9c4cc` 删除旧 `dev_flow` 包后，这些 helper 失去调用链，成为遗骸（本次 grep 复核：四个 helper 仅剩定义处，零调用）。

**真实 Issue 形态（恢复时的保全对象）**：

- 规范五段：`## Goal` / `## Context` / `## Scope`（`### In` + `### Out`）/ `## Acceptance Criteria` / `## Related Resources`；Roadmap 生成 Issue 在 Goal 前含 `- **Product**` / `- **Phase**` 元信息行（`issue-guide.md:78-84`；`commands/plan.py:125-156` 至今仍从 Issue body 解析该两行），Slice Issue 含 `## Depends on` / `## Demo`。
- 实测 #240（canonical）：`## Scope` 带 `### In（解决方案）`/`### Out`；Related Resources 表为 `| 类型 | 链接/路径 |` 表头，Plan 行为 `| Plan | [240-enhance-wopal-cli-isolated-evo-flow](...) |`。
- 开放 Issue 结构抽样（12 个）：canonical 3 个（#239/#237/#156）；**legacy 顶层 `## In Scope`/`## Out of Scope` 6 个**（#123/#49/#137/#135/#141/#154）；非同构 3 个（#169/#166 中文结构、#196 有 `## Scope` 无子节）。

**approve 修法可行性复核（钉契约用）**：

- `commit_and_push_plan` 提交的是 **Plan 所属仓库（空间仓库）** 的文件（`lib/plan_commit.py:44-48`、`lib/project.py:136-167`；实测 `c594069` 即空间仓库提交）；`Base Commit` 取值来自**项目仓库**——普通模式读项目 main HEAD（`approve.py:398`），existing-worktree 模式读已有 worktree 分支 HEAD（`approve.py:396`）。两者均与空间仓库的提交序列无依赖，**可前置到提交之前计算并写入**。
- 实测两缺陷：`git show c594069:.wopal-space/plans/wopal-cli/240-enhance-wopal-cli-isolated-evo-flow.md` 内 `Base Commit` 为占位符；工作区同名文件含未提交行 `8326099a82533264e879b7799c660fca2fa1469e`；`git -C projects/wopal-cli rev-parse main` 与之一致。
- 失败回滚可行：批准前状态在 `approve.py:168-173` 已知；Worktree 块由本次运行写入（`approve.py:310`），可字段级移除；回滚提交复用 `commit_and_push_plan`（消息前缀 `rollback`）。
- 边界确认：existing-worktree 模式的创建/校验失败全部发生在状态转换之前（`approve.py:220-283`），无需回滚。

**测试面现状**：`tests/python/unit/test_sync_preserves_context.py`（锁定「只更新链接行、保留 Context」）、`tests/python/unit/test_plan_link_contract.py::TestSyncPlanToIssueBody::test_preserves_other_sections`、`tests/python/integration/test_issue_contract.py`（五段结构契约）、`tests/python/unit/test_approve.py`（mock 全链）。恢复后按 `AGENTS.md` §5 R1-R6 改写/扩展。

**参考资料**：

- `.wopal/skills/dev-flow/references/issue-guide.md`（映射规范与五段结构）
- `.wopal/docs/evolutions/archived/20260518-142-chore-dev-flow-consolidate-sync-impls-and-update-exec-discipline.md`（label 家族归并先例：domain 单一实现、command 适配器）
- `.wopal/docs/evolutions/archived/20260424-114-fix-dev-flow-defer-plan-link-association-until-approve.md`（链接行「批准后关联」语义由来）
- `.wopal/docs/evolutions/archived/20260527-dev-flow-add-roadmap-workflow.md`（Roadmap/slice 形态来源）

### Key Decisions

- D-01 **恢复范围 = 三章节 + 链接行**：同步只替换 Issue 的 `## Goal`、`## Scope`、`## Acceptance Criteria` 三个映射章节的**正文**（章节标题不动），并维持 Related Resources 的 `| Plan |` 行更新；`## Context`、Roadmap 元信息行、`## Depends on` / `## Demo`、其它表格行与一切非映射内容逐字保留。理由：规范要求与历史教训（整文覆盖已被 `adc5977` 否决）的交点；「必须立即同步」的语义由章节更新承载。
- D-02 **Scope 渲染与 legacy 兜底**：存在规范 `## Scope` 时，其正文渲染为 `### In` / `### Out` 两个规范子节；不存在 `## Scope` 但存在 legacy 顶层 `## In Scope` / `## Out of Scope` 时，就地替换两个章节各自的正文、保留原（legacy）标题，不做结构重写。理由：开放 Issue 抽样 6/12 为 legacy 形态，不做兜底会让半数在途 Issue 的 Scope 静默不同步；结构重写违反「只替换正文」的外科原则。
- D-03 **章节同步不做状态门**：`planning` / `draft` 状态下三章节正文照常同步；仅链接行维持既有「未批准 → `| Plan | _待关联_ |`」语义（构建侧 `plan.py:432-434`，行写入遵循构建结果）。理由：规范「只要映射章节变化必须立即同步」无状态限定；链接行的时机门是机制性的（批准前 Plan blob URL/分支未稳定，见 #114 沿革），章节没有对应约束；自动调用点全部在批准之后，实际噪声面仅限显式手动命令。
- D-04 **单实现归属 = `issue.py` 领域层，command 层为适配器**：`commands/sync.py` 不再内联行替换，改为调用 `issue.py` 的统一函数；归档的链接刷新（`plan.py:506-577`）接入同一行替换原语（其 state-dir 分支行为保持现状）。理由：label 家族已是此方向（`sync.py:20-27` 从 `issue.py` 导入；#142 先例），状态机四命令已直接调用 `issue.py`。
- D-05 **死代码处理（Wopal 二选一的回答）**：`_extract_plan_section` 与 `_extract_acceptance_criteria` **提升为同步管线的真实组成**（迁入 `issue.py`，前者修复为「围栏感知且保留围栏内容」——现实现会把代码块整体丢弃）；`_extract_subsection`、`_render_issue_section` **删除**（新管线不需要：AC 子节随整节提取保留；渲染由新的规范渲染器承担）。理由：提升的两者是恢复后构建器的真实依赖；其余两者无设计位点，保留即债务。
- D-06 **`build_issue_body_from_plan` 退役**：调用点直连 `build_plan_link_for_issue`；`_get_plan_functions` 随之调整；模块头注释同步（`plan.py:10`）。理由：名不符实本身是「代码与说明不一致」的实例。
- D-07 **approve 失败回滚契约**：任何「状态字段已写入之后」的失败（worktree 创建失败、批准提交失败）都回滚到批准前字段形态——`Status` 恢复原值、移除本次写入的 Worktree 块、`Base Commit` 恢复原值；worktree 失败路径追加一个 `rollback` 提交并打印提示（含「已回滚」与「未进入 executing」，并给出回滚后的真实状态值），全部失败路径退出码 1 且可重试。
- D-08 **Base Commit 前置**：在状态转换提交**之前**计算并写入（普通模式 = 项目 main HEAD；existing-worktree 模式 = worktree 分支 HEAD），使批准提交内含真实 SHA、批准完成后无未提交残留。`--no-worktree` 模式不写 Worktree 块，Base Commit 计算逻辑同样前置。
- D-09 **文档对齐清单**：`references/issue-guide.md`（映射修正为三章节 + 链接行说明 + 保全语义）；`SKILL.md` 与 `SKILL.zh-CN.md` 三处同步表述；`references/commands.md`（sync 段与自动同步时点）；`flow.py` help 文案。删除一切与新行为矛盾的旧表述。
- D-10 **验证边界**：同步的 GitHub 真实渲染由用户观察（UAT 探针）；approve 两缺陷的判定可由自动测试全覆盖（行为断言），另设一次性真机探针场景供用户观察成功路径提交内容。理由：验证隔离守则禁止 Agent 在空间内项目文件上做写操作验证；GitHub 渲染属用户感知面。

### Key Interfaces

硬约束（入册即红线，实施中如需变更必须回报修订）：

1. **`flow.sh sync` 正文语义**：`--body-only` 或全量时，一次调用完成「三章节外科替换 + 链接行更新」；`--labels-only` 不触碰 body。退出码语义不变（0 成功 / 1 失败）。
2. **替换边界**：每个目标章节的替换范围 = 标题行之后到下一个 `## ` 标题之前（围栏感知，不因代码块内的 `## ` 误断）；标题行本身不动；替换后与相邻章节保持恰好一个空行；连续两次同步字节一致（幂等）。
3. **保全承诺**：三章节与链接行之外的 Issue body 内容逐字节不变——含 `## Context`、Roadmap 元信息行、`## Depends on` / `## Demo`、其它表格行。
4. **缺节与兜底**：目标章节缺失 → 跳过该目标并告警（非致命，其余目标照常）；`## Scope` 缺失且 legacy `## In Scope`/`## Out of Scope` 存在 → 就地更新 legacy 正文。不插入、不重写、不规范化非标准 Issue 结构。
5. **渲染规范**：`## Scope` 正文 = `### In` + `### Out`；`## Acceptance Criteria` 正文保留 `### Agent Verification` / `### User Validation` 子节，编号 checkbox（`1. [ ]` / `1. [x]`）转 `- [ ]` / `- [x]`；`## Goal` 正文 = Plan 对应节内容（trim 后）。
6. **链接行语义**：仍以 `build_plan_link_for_issue` 为唯一构建源；`planning`/`draft` 时构建结果为 `| Plan | _待关联_ |`；行更新仅限 Related Resources 章节内；无 Related Resources 章节时按现有兜底追加。
7. **自动同步时点**：`approve` / `complete` / `verify` / `archive` 的自动调用与手动命令走**同一实现**，同步内容同为「三章节 + 链接行」；归档后的链接刷新（`update_issue_plan_link`）复用同一行替换原语。
8. **approve 契约**：成功路径的批准提交内含真实 `Base Commit`，批准后该字段无未提交残留；worktree 创建失败或提交失败时，Plan 字段回滚到批准前形态且提示真实（无「未进入 executing」类失实文案）。

## In Scope

- 恢复三章节外科同步：提取（围栏感知、保留围栏内容）、渲染（Scope 子节化、AC 子节保留 + checkbox 转换）、替换（幂等、逐字节保全）。
- legacy 兜底（顶层 `## In Scope`/`## Out of Scope` 就地更新）与缺节跳过告警。
- 单实现收敛：`commands/sync.py` 适配器化；归档链接刷新接入同一原语；`build_issue_body_from_plan` 退役。
- 死代码处置：两个 helper 提升（迁入并修复围栏保留）、两个 helper 删除。
- 测试改写与新增（按 R1-R6；fixtures 用真实 Issue 样本）。
- approve 两缺陷修复（回滚 + Base Commit 前置，覆盖普通 / existing-worktree / no-worktree 三模式）。
- 文档对齐：`issue-guide.md`、`SKILL.md`、`SKILL.zh-CN.md`、`commands.md`、`flow.py` help。
- UAT 探针准备（`sync-probe` / `approve-probe`，实施期由主控准备并在第二拍回填具体标识，验证后清理）。

## Out of Scope

- 不重写 `update_issue_plan_link` 的 state-dir 分支行为（保持字节现状；仅其 body 计算路径接入统一原语）——该分支的存废缺少实证，另行处置。
- 不新增「缺失章节插入 / Issue 结构规范化」能力（缺节跳过，理由见 D-01/D-02 的外科原则）。
- 不改变 `check_doc_plan` / `validation.py` 的 Plan 校验规则（本次只改同步与文档）。
- 不恢复 roadmap/decompose 命令（已于 `1229995`/`4875469` 废弃清理）。
- 不改 `RESULT_PUSH_FAILED` 的既有语义（Issue #215 行为保持）。
- 不做 dev-flow 之外的任何技能/仓库变更；不做 `space sync` / `ontology contribute`（交付终端由用户拍板）。

## Affected Files

| Component | Files | Operation | Role |
|-----------|-------|-----------|------|
| 同步管线 | `.wopal/skills/dev-flow/scripts/issue.py` | 修改 | 三章节提取/渲染/替换单一实现；`sync_plan_to_issue_body` 恢复正文同步 |
| Plan 域 | `.wopal/skills/dev-flow/scripts/plan.py` | 修改 | helper 迁出；`build_issue_body_from_plan` 退役；`update_issue_plan_link` 接统一原语；删残留死代码 |
| 手动 sync | `.wopal/skills/dev-flow/scripts/commands/sync.py` | 修改 | 降为适配器，调 `issue.py` 单实现 |
| approve | `.wopal/skills/dev-flow/scripts/commands/approve.py` | 修改 | 回滚例程 + Base Commit 前置 |
| CLI help | `.wopal/skills/dev-flow/scripts/flow.py` | 修改 | sync 描述与新行为一致 |
| 技能主文档 | `.wopal/skills/dev-flow/SKILL.md` | 修改 | 三处同步表述 |
| 技能主文档（中文） | `.wopal/skills/dev-flow/SKILL.zh-CN.md` | 修改 | 对应三处 |
| Issue 指南 | `.wopal/skills/dev-flow/references/issue-guide.md` | 修改 | 映射修正（三章节 + 链接行）、保全语义 |
| 命令参考 | `.wopal/skills/dev-flow/references/commands.md` | 修改 | sync 段与自动同步时点表述 |
| 单测（同步） | `.wopal/skills/dev-flow/tests/python/unit/test_sync_preserves_context.py` | 修改 | 按新契约改写 |
| 单测（链接契约） | `.wopal/skills/dev-flow/tests/python/unit/test_plan_link_contract.py` | 修改 | `TestSyncPlanToIssueBody` 按新契约改写 |
| 单测（新管线） | `.wopal/skills/dev-flow/tests/python/unit/test_issue_sync_sections.py` | 创建 | 提取/渲染/替换/幂等/保全/边界 |
| 单测（approve） | `.wopal/skills/dev-flow/tests/python/unit/test_approve.py` | 修改 | 回滚与提交内容断言 |
| 样本 | `.wopal/skills/dev-flow/tests/fixtures/`（新增同步样本子目录） | 创建 | 真实 Issue/Plan 样本（R2） |

## Acceptance Criteria

### Agent Verification

1. [ ] **三章节同步与保全**：给定规范 Issue body（含 `## Context`、Goal 前元信息行、`## Depends on`/`## Demo`、Related Resources 表）与含 `Goal`/`In Scope`/`Out of Scope`/`Acceptance Criteria` 的 Plan，同步后：三章节内容与 Plan 一致（`## Scope` 呈现 `### In`/`### Out`，AC 呈现两个子节且编号 checkbox 已转 `- [ ]`），链接行被更新，其余内容逐字节不变；连跑两次输出一致。（→ Task 1）
2. [ ] **边界行为**：Plan 某映射节缺失时 Issue 侧目标跳过并告警、其余目标照常；legacy 顶层 `## In Scope`/`## Out of Scope` 就地更新且原标题保留；围栏代码块内出现 `## ` 字样不误断章节且代码块内容保留；`planning` 状态下行结果为 `_待关联_`、章节照常更新。（→ Task 1）
3. [ ] **单实现与清理**：行替换/正文同步全仓仅一处实现；手动 sync、状态机自动同步、归档链接刷新、`sync_plan_to_issue_body` 全部经同一原语；`_extract_subsection`、`_render_issue_section`、`build_issue_body_from_plan` 全仓零引用；`_get_plan_functions` 不再返回名不符实符号。（→ Task 2）
4. [ ] **approve 状态一致性**：worktree 创建失败 → `Status` 回滚为批准前值、Worktree 块被移除、无 executing 残留、提示真实；批准提交失败 → 字段同样回滚；成功路径 → 批准提交内含真实 `Base Commit`（普通模式 = 项目 main HEAD；existing-worktree = worktree 分支 HEAD）、工作区无未提交残留。（→ Task 4）
5. [ ] **文档一致性**：`issue-guide.md` 映射为三章节 + 链接行说明，旧四映射（含 `Plan Related Resources`）零命中；`SKILL.md`/`SKILL.zh-CN.md`/`commands.md`/`flow.py` help 与新行为一致（逐处关键词抽查零矛盾）。（→ Task 3）
6. [ ] **回归**：`.wopal/skills/dev-flow` 测试全绿（含 archive/complete/verify/approve 既有用例按新契约改造后），无新增失败。

### User Validation

#### Scenario 1: 真实 Issue 的三章节同步与保全观察
- Goal: 在 GitHub 真实渲染面上确认「三章节更新 + 其余保全 + 幂等 + checkbox 可勾选」。
- 验证环境: 本空间；`gh` 已认证；scratch 探针已就绪——探针 Plan：`242-test-probe-sync-probe`（executing，approve --no-worktree 直达）；关联 scratch Issue：#242（body 含 Context、Goal 前元信息行、Depends on/Demo 模拟段与额外表格行）。
- Precondition: 探针 Plan `242-test-probe-sync-probe` 处于 executing 状态且含四个映射节内容；Issue #242 已创建并关联。
- 启动命令: `cd /Volumes/U500G/coding/wopal-workspace/.wopal/skills/dev-flow && bash scripts/flow.sh sync 242-test-probe-sync-probe --body-only`
- User Actions:
  1. 在 GitHub 打开 Issue #242（https://github.com/sampx/wopal-space/issues/242），对照 Plan 检查 `## Goal` / `## Scope`（`### In`/`### Out`）/ `## Acceptance Criteria`（含两个子节、`- [ ]` 行）；
  2. 检查 `## Context`、Goal 前元信息行、`## Depends on` / `## Demo` 与其它表格行原样保留；
  3. 再次执行启动命令，刷新 Issue 对比；
  4. 清理（验证通过后由主控执行）：`bash scripts/flow.sh reset 242-test-probe-sync-probe`；`bash scripts/flow.sh issue close 242`；trash 探针 Plan 文件。
- 通过判据: 三章节与 Plan 一致且 GitHub 上 checkbox 可交互渲染；非映射内容零变化；第二次运行后内容无差异（幂等）；无报错。
- 失败反馈: 贴出 Issue body 原文（`bash scripts/flow.sh issue view 242` 输出）与期望差异点。

- [x] 用户已完成上述功能验证并确认结果符合预期（2026-09-29 用户确认；由主控自验并呈证据；因 CLI 缺陷 #243 未走验证视图，在隔离工作区等价执行）

#### Scenario 2: approve 真机探针（成功路径 + 失败回滚）
- Goal: 在真机上确认批准提交内含真实 `Base Commit`、无残留行；并确认 worktree 创建失败时状态回滚、提示真实。
- 验证环境: 本空间；scratch 探针已就绪——探针 Plan：`test-probe-approve-probe`（reviewing，目标项目：wopal-cli）；派生 worktree 路径：`.worktrees/wopal-cli-test-probe-approve-probe`。
- Precondition: 探针 Plan `test-probe-approve-probe` 已通过 `plan check` 且处于 reviewing；`.worktrees/wopal-cli-test-probe-approve-probe` 不存在。
- 启动命令:
  1. `touch /Volumes/U500G/coding/wopal-workspace/.worktrees/wopal-cli-test-probe-approve-probe`
  2. `cd /Volumes/U500G/coding/wopal-workspace/.wopal/skills/dev-flow && bash scripts/flow.sh approve test-probe-approve-probe --confirm`
  3. `trash /Volumes/U500G/coding/wopal-workspace/.worktrees/wopal-cli-test-probe-approve-probe`
  4. `bash scripts/flow.sh approve test-probe-approve-probe --confirm`
- User Actions:
  1. 执行 1-2：确认命令失败且提示「已回滚 / 未进入 executing」，检查探针 Plan 的 `Status` 回到 reviewing；
  2. 执行 3-4：确认成功；`git -C /Volumes/U500G/coding/wopal-workspace log -1 --stat -- .wopal-space/plans/wopal-cli/test-probe-approve-probe.md` 查看批准提交含真实 `Base Commit`（等于 `git -C /Volumes/U500G/coding/wopal-workspace/projects/wopal-cli rev-parse main`），且 `git -C /Volumes/U500G/coding/wopal-workspace status --short -- .wopal-space/plans/wopal-cli/test-probe-approve-probe.md` 无输出（无未提交的 Base Commit 行）；
  3. 清理（验证通过后由主控执行）：`bash scripts/flow.sh reset test-probe-approve-probe`；`git -C /Volumes/U500G/coding/wopal-workspace/projects/wopal-cli worktree remove /Volumes/U500G/coding/wopal-workspace/.worktrees/wopal-cli-test-probe-approve-probe`；`git -C /Volumes/U500G/coding/wopal-workspace/projects/wopal-cli branch -D wopal-cli-test-probe-approve-probe`；trash 探针 Plan 文件。
- 通过判据: 失败路径无 executing 残留、提示与真实状态一致；成功路径提交内容与工作区形态符合上述断言。
- 失败反馈: 贴出命令输出、`git log -1 --stat` 与 `git status --short` 输出。

- [x] 用户已完成上述功能验证并确认结果符合预期（2026-09-29 用户确认；由主控自验并呈证据；因 CLI 缺陷 #243 未走验证视图，在隔离工作区等价执行）

## Implementation

### Task 1: Plan → Issue 三章节同步管线（提取/渲染/外科替换）

**Verification Intent**: AC#1、AC#2

**Behavior**:
- Given 规范 Issue body + 含四个映射节的 Plan；When 执行同步；Then 三章节被替换为规范渲染、其余字节不变、幂等。
- Given Plan 节缺失 / legacy 顶层 In/Out / 围栏内含 `## ` 字样 / planning 状态；When 同步；Then 按 D-02/D-03 与 Key Interfaces 4/5 的行为呈现。
- 提取侧：围栏代码块被完整保留（现 `_extract_plan_section` 会丢弃代码块内容，为缺陷修复点）。

**Pre-read**: `.wopal/skills/dev-flow/references/issue-guide.md`；`.wopal/skills/dev-flow/scripts/issue.py`；`.wopal/skills/dev-flow/scripts/plan.py`（Body 区）；`.wopal/skills/dev-flow/AGENTS.md`（R1-R6）；`.wopal/skills/dev-flow/tests/python/support/bootstrap.py`

**Design**: 管线单置于 `issue.py`（提取 → 渲染 → 替换）；`_extract_plan_section`/`_extract_acceptance_criteria` 自 `plan.py` 迁入并更名公开、前者修复围栏内容保留；替换原语围栏感知、按「标题后至下个 `## ` 前」划定范围；`sync_plan_to_issue_body` 保持函数名与签名（四个自动调用点不动），内部改为三章节 + 行，链接行构建改经 `build_plan_link_for_issue`（`_get_plan_functions` 第三项随之调整，包装函数的删除在 Task 2 收口）。测试 fixtures 从真实样本录制（canonical 与 legacy 各一），按 R2 注明来源；同形用例参数化（R3）。

**TDD**: true

**Changes**:
1. RED：新增 `tests/python/unit/test_issue_sync_sections.py`（+ fixtures），覆盖三章节替换、保全、幂等、缺节、legacy、围栏、checkbox 转换；改写 `TestSyncPlanToIssueBody`；
2. GREEN：实现管线并接通 `sync_plan_to_issue_body`；
3. REFACTOR：清理两侧 docstring/注释（含 `sync.py:119-121` 的失实注释）。

**Verify**: `cd /Volumes/U500G/coding/wopal-workspace/.wopal/skills/dev-flow && python -m pytest tests/python/unit/test_issue_sync_sections.py tests/python/unit/test_plan_link_contract.py -v`

**Done**:
任务产出：三章节同步管线落地，`sync_plan_to_issue_body` 恢复正文同步。
实际触碰文件：`skills/dev-flow/scripts/issue.py`、`skills/dev-flow/scripts/plan.py`、`skills/dev-flow/tests/python/unit/test_issue_sync_sections.py`（新增）、`skills/dev-flow/tests/python/unit/test_plan_link_contract.py`、`skills/dev-flow/tests/fixtures/sync-sample/`（新增）。
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤

### Task 2: 消费者收敛与死代码归零

**Verification Intent**: AC#3、AC#6

**Behavior**:
- Given 手动 sync / 自动 sync / 归档刷新三条路径；When 触发；Then 均进入同一行替换与章节同步实现（无第二份内联逻辑）。
- Given 全仓检索；Then `_extract_subsection`、`_render_issue_section`、`build_issue_body_from_plan` 零引用；`plan.py` 不再含正文生成逻辑。

**Pre-read**: `.wopal/skills/dev-flow/scripts/commands/sync.py`；`.wopal/skills/dev-flow/scripts/issue.py`；`.wopal/skills/dev-flow/scripts/plan.py`；`.wopal/skills/dev-flow/tests/python/unit/test_sync_preserves_context.py`；`.wopal/skills/dev-flow/tests/python/unit/test_archive.py`

**Design**: `commands/sync.py` 改为调用 `issue.py` 统一函数（labels 先例同构）；`update_issue_plan_link` 的 body 计算接入统一原语、state-dir 分支行为保持现状（Out of Scope 明示）；`build_issue_body_from_plan` 删除并调整 `_get_plan_functions`；`test_sync_preserves_context.py` 按新契约改写（同一决策的旧断言删除，R5）。

**TDD**: true

**Changes**:
1. RED：改写手动路径测试为新契约（三章节 + 行 + 保全）；
2. GREEN：收敛实现与删除/退役死代码；
3. REFACTOR：统一 docstring 与模块头注释（`plan.py:1-12`、`issue.py:1-9`）。

**Verify**: `cd /Volumes/U500G/coding/wopal-workspace/.wopal/skills/dev-flow && python -m pytest tests/python/unit/ -v && rg -n "_extract_subsection|_render_issue_section|build_issue_body_from_plan" scripts/`（rg 零命中）

**Done**:
任务产出：单实现收敛完成，死代码归零——手动 sync / 自动同步 / 归档刷新 / `sync_plan_to_issue_body` 全走 `issue.py` 一处；三个死符号在 `scripts/` 零命中（fixture 历史样本数据除外）。
实际触碰文件：`skills/dev-flow/scripts/commands/sync.py`、`skills/dev-flow/scripts/issue.py`、`skills/dev-flow/scripts/plan.py`、`skills/dev-flow/tests/python/unit/test_sync_preserves_context.py`。
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤

### Task 3: 文档对齐（双语 + 指南 + 参考 + help）

**Verification Intent**: AC#5

**Behavior**:
- Given 五处文档载体；When 按新行为修正；Then 旧矛盾表述零命中、新语义逐处可检索。

**Pre-read**: `.wopal/skills/dev-flow/references/issue-guide.md`；`.wopal/skills/dev-flow/SKILL.md`；`.wopal/skills/dev-flow/SKILL.zh-CN.md`；`.wopal/skills/dev-flow/references/commands.md`；`.wopal/skills/dev-flow/scripts/flow.py`

**Design**: `issue-guide.md` §Issue 同步规则重写：三章节映射 + 链接行说明 + 保全承诺 + 缺节/legacy 行为；删除不成立映射（`issue-guide.md:94`）；「必须立即同步」与命令示例保留。`SKILL.md` 三处（`:83` 命令表备注、`:232` 流程行、`:291` 验证期表述）+ `SKILL.zh-CN.md` 对应三处：表述统一为「三章节 + 链接行」。`commands.md` sync 段补「同步内容」与自动时点一句。`flow.py:86-88` help 改为与新行为一致的描述。

**TDD**: false（文档修正；判据为可检索文本契约）

**Changes**:
1. 重写 `issue-guide.md` 同步规则节；
2. 对齐 `SKILL.md` / `SKILL.zh-CN.md` 三处；
3. 补 `commands.md` 与 `flow.py` help；
4. 自查：旧四映射句、旧 help 句零命中。

**Verify**: `rg -n "Plan Related Resources" .wopal/skills/dev-flow/`（零命中）等逐项抽查

**Done**:
任务产出：五处文档与实现一致——三章节（Goal/Scope/AC）+ `| Plan |` 链接行表述统一，旧矛盾表述（`Plan Related Resources` 映射、旧 help 句）零命中。
实际触碰文件：`skills/dev-flow/references/issue-guide.md`、`skills/dev-flow/SKILL.md`、`skills/dev-flow/SKILL.zh-CN.md`、`skills/dev-flow/references/commands.md`、`skills/dev-flow/scripts/flow.py`。
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤

### Task 4: approve 状态一致性（回滚 + Base Commit 前置）

**Verification Intent**: AC#4

**Behavior**:
- Given reviewing 状态 Plan（普通模式）；When worktree 创建失败；Then `Status` 回到 reviewing、Worktree 块移除、提示含「未进入 executing」且与真实状态一致、退出码 1、可直接重试。
- Given 批准提交失败；When 返回；Then 字段回滚、无半提交状态。
- Given 成功批准（普通 / existing-worktree / no-worktree 三模式）；Then 提交内含真实 `Base Commit`；批准后工作区无未提交残留。

**Pre-read**: `.wopal/skills/dev-flow/scripts/commands/approve.py`；`.wopal/skills/dev-flow/scripts/lib/plan_commit.py`；`.wopal/skills/dev-flow/scripts/lib/worktree.py`；`.wopal/skills/dev-flow/tests/python/unit/test_approve.py`；`.wopal/skills/dev-flow/AGENTS.md`（R1-R6）

**Design**: 引入字段快照（Status / Worktree / Base Commit 前值）与统一回滚例程；Base Commit 计算 + 写入移动到状态转换提交之前（复用 `approve.py:396/398` 的两模式取数逻辑）；失败路径回滚后走 `commit_and_push_plan`（消息前缀 `rollback`，推送失败沿用 #215 规则）；消息给出回滚后的真实状态值。测试按 R1 做行为断言（文件/提交产物层面与关键子串），并处理被覆盖旧断言的删除（R5）。

**TDD**: true

**Changes**:
1. RED：扩展 `test_approve.py`（失败回滚、两模式成功提交内容）；
2. GREEN：实现回滚例程与 Base Commit 前置；
3. REFACTOR：清理 `approve.py:341` 等过时注释。

**Verify**: `cd /Volumes/U500G/coding/wopal-workspace/.wopal/skills/dev-flow && python -m pytest tests/python/unit/test_approve.py -v`

**Done**:
任务产出：approve 事务化落地——状态写入后任何失败回滚到批准前字段形态（worktree 失败附 `rollback` 提交 + 真实提示；提交失败附暂存区复位，无半提交残留）；Base Commit 前置使批准提交内含真实 SHA。
实际触碰文件：`skills/dev-flow/scripts/commands/approve.py`、`skills/dev-flow/tests/python/unit/test_approve.py`。
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤

## Delegation Strategy

| Wave | Task | 执行者 | 依赖 | 委派理由 |
|------|------|--------|------|---------|
| 1 | Task 1 同步管线 | fae | 无 | 核心行为，独占 `issue.py`/`plan.py` 改动窗口 |
| 1 | Task 3 文档对齐 | fae | 无（契约已在本提案钉死） | 文档文件与其它任务不相交，可并行 |
| 1 | Task 4 approve 修复 | fae | 无 | `approve.py` 与其它任务不相交，可并行 |
| 2 | Task 2 收敛清理 | fae | Task 1 | 与 Task 1 同触 `issue.py`/`plan.py`，必须串行 |

并行纪律：Wave 1 三任务文件不相交；Task 2 在 Task 1 完成后启动。串行任务继承前序任务的测试基线；实施不提交、记录由主控回填（按 evo 流程）；每完成一个 task 由主控把「该 task 代码 + 提案记录」作为一个提交落在工作分支。

## Delivery

`space sync` 与 `ontology contribute` 由用户拍板，技能不自动上行。
