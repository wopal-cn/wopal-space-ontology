# 240-enhance-wopal-cli-isolated-evo-flow

## Metadata

- **Issue**: #240
- **Type**: enhance
- **Target Project**: wopal-cli
- **Product**:
- **Phase**:
- **Project Path**: projects/wopal-cli
- **Created**: 2026-09-28
- **Status**: done
- **Verification Commit**: 197f17301be7e7f68da3ca5c314859622ac19601
- **Worktree**:
  - branch: wopal-cli-240-enhance-wopal-cli-isolated-evo-flow
  - path: /Volumes/U500G/coding/wopal-workspace/.worktrees/wopal-cli-240-enhance-wopal-cli-isolated-evo-flow
- **Base Commit**: 8326099a82533264e879b7799c660fca2fa1469e
- **Final Commit**: 03e4ea1ed63ec2746cc5734d9d10a5abe3902123

## Scope Assessment

- **Complexity**: High — 七个行为组横跨 6 个源文件 + 1 个新模块 + 设计文档 + 多套测试：记录保全（commit/accept）、阶段即时镜像（advance）、验证期窗口与集成门控（commit 窗口 + `integrate --confirm` + stage 守卫）、验证切换与直连集成（`switch` 只移动分支占用权；`integrate` 在无 worktree 时直连分支）、归档预检放宽（`archive` 不因不相关未提交改动阻断）、DESIGN 契约同步、全链路场景测试。多处共享文件（`space-proposal.ts`、`space.ts`）强制串行实施。
- **Confidence**: High — 四处断点均已逐行代码实证（见 Research Findings）；目标流程由用户定稿（Issue #240 + `refactor-evolution-flow` 提案的 D-07/D-08）；唯一需“定稿”的验证期阶段语义已在 Key Decisions D-02 钉死，无未决分歧。

## Goal

把 isolated（隔离）模式的进化实施链路修顺，让目标流程从机制上完整可走：

```
实施（不提交）→ 主控验证并填写记录 → 每完成一个 task 一次提交（该 task 代码 + 记录）到工作分支
→ rook 实施评审 → 通过 → 用户验证（先询问用户选择验证方式，优先推荐分支切换；可选先集成后验证）
→ 用户明确确认 → 集成（integrate）→ 归档
```

另放宽 `archive` 预检：空间工作区的不相关未提交改动不再阻断归档（不随行、保持原状；对齐 dev-flow 脏检查口径）。

## Technical Context

### Architecture Context

机制车道现有命令族 `space evo new/status/check/advance/accept/commit/integrate/archive`（注册于 `projects/wopal-cli/src/commands/space.ts`；实现于 `src/lib/space-evo-*.ts` 与 `src/lib/space-proposal.ts`）。isolated 模式拓扑：

- 空间分支（`space/<name>`）检出在 `.wopal`（空间 worktree）；
- `accept` 从 `.wopal` 派生隔离 worktree（`<space>/.worktrees/ontology-<slug>`，独立分支 `ontology-<slug>`），并把提案记录镜像进去；
- 提案记录存在**两份副本**：`.wopal` 侧（命令写入的元数据权威）与隔离工作区侧（实施期主控回填的任务记录）；
- `integrate` 在 `.wopal` 内把隔离分支 squash 进空间分支并原子登记稀疏范围；`archive` 清理隔离 worktree 与分支。

现状与用户定稿流程（Issue #240「目标流程」）有四处断点，另有若干代码/文档偏差：

1. **记录被静默吞掉**：`commitIsolated` 提交前无条件用 `.wopal` 权威副本覆盖隔离工作区副本（`space-proposal.ts:477` → `syncProposalIntoWorktree`），不检测副本是否被修改；主控在隔离工作区回填的完成记录随即无声消失。
2. **跨分支绕道**：因 1，主控无法在隔离分支把「代码+记录」作为一个提交落盘，实际退化为在空间分支另发记录提交（实测三次：`4c15291` / `6edf893` / `45f86b6`）。
3. **集成无用户确认门、验证被迫后置**：`integrate` 无确认门且要求 stage `implementing`（集成先于用户验证）；机制没有把 `.wopal` 切到隔离分支供真机验证的手段（同一分支不能同时挂在两个 worktree，手工序列有陷阱）。
4. **归档阻断过宽**：`archive` 以「空间工作区存在未提交改动」为由整体拒绝（`space-evo-archive.ts:198-206`，`SPACE_EVO_ARCHIVE_DIRTY`），即便这些改动与提案无关、归档记录提交按名绝不会携带它们；2026-09-28 实测把 `refactor-plugin-config-consumption` 的归档卡在与提案无关的在途设计改动上。

另有一处历史遗留状态与新语义兼容：`refactor-plugin-config-consumption` 提案处于 `validating` 且已记录 `Final Commit`（在旧流程下先集成），新语义按「先集成后验证」路径继续（验证在集成视图进行，随后归档），无需回退。

### Research Findings

对 issue 三条断言逐条代码实证，并补出五处连带偏差（④⑤⑥⑦⑧）：

- ① 覆盖式吞记录：`src/lib/space-proposal.ts:468-477`（prior bytes 注释自陈仅作失败回滚）+ `:543-557`（`syncProposalIntoWorktree` 无条件覆盖）；调用点唯一。
- ② accept 镜像同类覆盖：`src/lib/space-evo-accept.ts:599-617`（`mirrorIntoWorktree` 全量写 canonical 后提交；adopt/re-attach 场景会吞掉隔离分支上的记录）。
- ③ 阶段只写空间侧：`src/lib/space-evo-state.ts:714-724`（`advanceProposal` 仅在 `.wopal` 写 `Stage`）；一旦 ① 移除，阶段行两侧分叉，integrate 的 squash 会在同一行出现双方不同修改而冲突。
- ④ `--paths` 帮助示例带 `.wopal/` 前缀（`src/commands/space.ts:2234`、`:2236`、`:2468`），按 `space-proposal.ts:454-457` 的判定（相对**被提交侧工作区根**）解析为 `<工作区根>/.wopal/...`，照抄必被 `SPACE_EVO_COMMIT_TARGET_INVALID` 拒绝；选项描述「Repository-relative path(s)」未点明基准。
- ⑤ `integrate` 脏工作区拒绝语指向本体侧脚本 `evo.sh commit`（`space-proposal.ts:888`，另一处 `:1001` 同），而非 CLI `wopal space evo commit`；现有测试 `tests/lib/space-integrate.integration.test.ts:282` 断言旧文案，需同步更新。
- ⑥ DESIGN 漂移：`docs/DESIGN-evolution.md:73` 写隔离基座为 `$WOPAL_HOME/.worktrees/`；实际（空间场景）= `<space>/.worktrees/ontology-<slug>`（`src/lib/ontology/worktree.ts:114-123`；实测 `wopal-workspace/.worktrees/ontology-refactor-plugin-config-consumption` 存在）。
- ⑦ 集成强依赖隔离 worktree 在场：`resolveIsolatedTarget` 要求记录 worktree 存在且检出记录分支（`space-proposal.ts:686-693`），realign 也走 worktree 侧 `git reset --hard`（`:1136-1140`）。验证视图（`.wopal` 已检出特性分支、worktree 已让位）之后若要集成，现状必须先重建 worktree——**冗余**。修正：集成支持「直连分支」模式（worktree 缺失不再是拒绝条件；realign 改用 ref 更新，`gitUpdateRef` 原语已存在）。
- ⑧ 归档预检过宽（对齐 dev-flow 修正）：`space-evo-archive.ts:198-206` 在 sparse 健康检查后做 `gitStatusPorcelain(spaceWorktreePath)` **全量**脏检查，任何未提交改动（含与提案无关者）一律 `SPACE_EVO_ARCHIVE_DIRTY` 拒绝——理由注释「an uncommitted anything blocks the record commit」不成立：记录提交严格按名（`gitCommitPaths`，`raw.ts:299-321`「a pre-existing staged entry elsewhere in the index stays staged and never rides along」），失败回滚同样按名（`gitResetPaths`，`raw.ts:233-238`），移动是文件系统 rename，清理只触达提案声明的 Worktree/Branch——不相关改动既不会随行也不会被触碰。需保留的是 `:226-253` 的隔离 worktree 未提交守卫（`--force` 删除会销毁未提交内容）与内容守卫。dev-flow 对照：脏检查为路径感知（`scripts/lib/git.py:18-48` `is_repo_dirty(repo_path, ignore_paths)`；`commands/approve.py:207-213` 以 `ignore_paths=[plan_path]` 排除命令自身将提交的文件），Plan 文件脏时由 `lib/plan_commit.py` 代提交而非拒绝，worktree 脏仅警告不阻断。

切换能力参照：dev-flow `verify-switch`（`.wopal/skills/dev-flow/scripts/commands/verify_switch.py:162-228`）先移除 worktree 再在 canonical path checkout 特性分支——同一 Git 分支独占约束、同一顺序；evo 的「切回」只需把 `.wopal` checkout 回空间分支（**不重挂 worktree**），集成直连特性分支 ref 完成。范围扩宽借鉴 `accept` 的 `widenOverBranch`（按分支变更推导，`space-evo-accept.ts:522-540`），不依赖 worktree 的 pattern 列表。

**参考资料**：
- `.wopal/docs/evolutions/refactor-evolution-flow.md`（技能侧提案；其 D-07/D-08 定义评审门与验证/集成时序；Out of Scope 明确 CLI 侧由 #240 承接）
- `.wopal/docs/evolutions/refactor-plugin-config-consumption.md`（实测会话：三次跨分支记录提交与两轮评审的实际形态）
- `.wopal/skills/dev-flow/scripts/commands/verify_switch.py`（验证切换参照实现）

### Key Decisions

- D-01 **副本保全模型（去覆盖）**：任何命令不再全量覆盖隔离工作区的提案副本。命令自有字段（`Mode` / `Worktree` / `Branch` / `Base Commit` / `Stage` / `Final Commit`）以**字段级写入**同步；主控回填写入（Done 勾选、任务产出、实际触碰文件）只存在于隔离工作区副本，随主控提交入库。`commit` 删除提交前覆盖；`accept` 镜像改为字段级同步 + 提交；`archive` 镜像发生在隔离 worktree 删除前（终局清理、文件移动语义），维持现状，不在本决定内。
- D-02 **验证期与确认后阶段语义（定稿）**：`validating` 承载用户验证期全程——(a) 主控在全部提交与 rook 评审通过后执行 `advance --to validating` 进入验证期；(b) 主控先询问用户选择验证方式，优先推荐分支切换（`switch` 进出隔离视图、验证后切回）；「先集成后验证」为用户显式可选项；(c) 验证期返工：isolated = 特性分支新提交（仍隔离）——`commit` 合法窗口扩展为 `implementing ∪ validating`，且视图内（`.wopal` 已检出记录分支）proposal 提交就地落在 `.wopal`（免切回、免重建 worktree）；quick = 空间分支提交；已集成（先集成路径）后 = 空间分支新提交（instant 模式，不二次 squash）；(d) 集成门控 = 合法 stage `validating` + `--confirm`（用户明确确认验证通过后由主控执行），确认本身不改变 stage；(e) 用户确认后 `integrate --confirm` → `advance --to archived` → `archive`。状态机五词与推进边不变（`accepted→implementing→validating→archived`）；唯一几何变化：`integrate` 的合法 stage 从 `implementing` 迁至 `validating`。理由：阶段名必须与活动对应（验证期 = validating），`status` 对用户可读；集成门控是命令级用户门，不引入第六个状态。
- D-03 **验证切换（新命令 `space evo switch <name>`）**：单命令双向，**只做「分支占用权」移动，不重建任何 worktree**。进入 = 确保 `.wopal` 干净且在空间分支 → 隔离 worktree 在场则（干净预检后）移除、缺失则直接继续 → 按分支变更扩宽 `.wopal` 稀疏范围（新目录物化、运行时可见）→ `.wopal` checkout 隔离分支 → 断言；切回 = `.wopal` checkout 回空间分支（**唯一动作**）。**为何进入前必须移除隔离 worktree**：Git 拒绝同一分支被两个 worktree 同时检出，而运行时只读 `.wopal`，故须让隔离 worktree 释放 `ontology-<slug>` 分支（顺序同 dev-flow `verify-switch`：先移除、再在 canonical path checkout）；移除只删检出目录，**分支与其全部提交始终留在 git 中**。**为何切回不重挂**：集成不需要 worktree 在场——`integrate` 支持直连分支模式（D-07/Key Interfaces #3），验证通过路径为「`.wopal` 回空间分支 → integrate 直接 squash 特性分支 → archive 删分支」，全程零多余的 worktree 创建；验证失败则视图内就地修复提交（D-02c），同样不经过 worktree。**无持久化状态**：扩宽按分支变更推导（幂等），无旁路文件、不写提案元数据（元数据写入仍只在受理/集成/归档三时点）。失败语义：预检先于一切变更；进入半途失败尽力回滚（`.wopal` 回空间分支、范围回滚；worktree 已移除不回补——该状态是合法态，重跑 enter 即可直接完成，因 enter 允许 worktree 缺失）；切回报错可重跑；任何消息不得建议删除分支。
- D-04 **按任务提交纪律（机制支撑）**：D-01 + D-02 之后，主控在隔离工作区**按任务**编辑记录（Done 勾选 / 回填）→ 每完成一个 task 一次 `space evo commit <name>`，**同一提交携带该 task 的代码与记录**；CLI 不再产生跨分支的记录提交。`advance` 的阶段镜像在隔离工作区**提交**（保持工作区 clean，满足 `switch` / `integrate` 的干净前置）。
- D-05 **文档与示例同步范围**：仅 `docs/DESIGN-evolution.md`（生命周期图、Stage × Command Matrix、命令契约、Isolation Modes、Command Surface）+ CLI 帮助文本修正（④⑤⑥）。ontology-evolution 技能正文由 `refactor-evolution-flow` 提案承接，不在本 Plan。
- D-06 **不新增能力声明**：evo 命令族为 human-only（无 `result` 声明）；本 Plan 不改机器能力契约、不加 JSON 面、不动 `space sync` / `ontology contribute` 行为。
- D-07 **集成直连分支模式（无需 worktree）**：验证视图验证通过后，`.wopal` 回空间分支即可 `integrate --confirm`，直接对特性分支 ref 做 squash 与登记——**不重建隔离 worktree**。身份判据从「worktree 存在且检出记录分支」放宽为「记录 Branch 的 ref 存在」；worktree 在场时维持现行清洁检查与隔离断言，缺失时跳过（无 worktree 即无可遗漏的未提交内容）；范围扩宽按分支变更推导（`widenOverBranch` 语义）；realign 在 worktree 缺失时改用 ref 更新（`gitUpdateRef`；分支未被检出时安全），在场时维持 worktree 侧 reset。理由：视图验证后重建 worktree 是无谓的检出级开销，且失败返工已由视图内就地提交承接（D-02c）。
- D-08 **归档预检放宽（对齐 dev-flow 脏检查）**：移除 `archive` 对空间工作区的**全量**未提交检查（含 `SPACE_EVO_ARCHIVE_DIRTY` 错误码），不设替代阻断——记录提交与失败回滚本就按名，不相关改动不可能随行/被触碰；安全由既有机制（按名暂存、隔离 worktree 守卫、内容守卫）承担。存在未提交改动时命令正常成功（退出码 0），以 warnings 提示「未随行路径数、保持原状」。保留全部既有守卫：sparse 健康、stage / branch / naming、隔离 worktree 未提交（含 ignored）、未集成分支内容。理由：dev-flow 的脏检查是路径感知的（排除命令自身将提交的文件），对无关在途改动从不阻断；evo 归档与之对齐，终结「在途改动卡死归档」的摩擦。

### Key Interfaces

以下为本次钉死的外部契约；实施中需要改签名或错误码时必须先回报修订 Plan。错误码沿用 `src/lib/error-codes.ts` 的 `SPACE_EVO_*` 集中定义。

**1. `wopal space evo commit <name>`（isolated 模式）**

```typescript
// 合法 stage 窗口：implementing | validating（原：仅 implementing）
// 提交内容：显式 --paths，或默认 = 工作区跟踪变更 ∪ 提案文件（现状不变）
// 行为变化：提交前不再以 canonical 副本覆盖隔离工作区提案副本；
//           副本当前字节即提交内容（主控回填随之入库）
// 视图态（新增）：记录的 worktree 缺失且 .wopal 检出记录分支时，提交落在 .wopal
//           （特性分支；仍无登记——登记属 integrate）；其余缺失场景维持拒绝（含指引）
// 错误码：不变（SPACE_EVO_COMMIT_*）
```

**2. `wopal space evo advance <name> --to <stage>`**

```typescript
// isolated 且记录的隔离 worktree 存在时：
//   1) 快照工作区副本字节 → 仅字段写入更新其 Stage（保留其余内容）
//   2) 空间侧记录 + 按名提交（现状不变）
//   3) 在隔离 worktree 按名提交提案文件（消息同空间侧：docs(evolutions): <slug> -> <to>）
//      —— 成功后隔离 worktree 保持 clean
// 空间侧提交失败 → 恢复工作区副本原字节（零残留）
// 镜像提交失败 → 空间侧记录已成立；报错指引在工作区提交/协调（两侧内容一致、可恢复）
// worktree 不存在 → 仅空间侧记录，成功（现状语义）
// 重推当前 stage：no-op、零写入（不变）
// 新增错误码：SPACE_EVO_ADVANCE_MIRROR_FAILED
```

**3. `wopal space evo integrate [name] --confirm`**

```typescript
// 合法 stage：validating（原：implementing）
// 未带 --confirm：拒绝、零副作用
//   新增错误码：SPACE_EVO_INTEGRATE_CONFIRM_REQUIRED
//   指引语义：集成仅在用户明确确认验证通过后执行；确认后加 --confirm 重跑
// 自动解析（省略 name）：候选 = Mode isolated 且 Stage ∈ {implementing, validating}
//   唯一候选自动采用；0/多个拒绝并列出（现状语义）
// 两态执行（D-07）：
//   - worktree 在场：现行路径（清洁检查 + 隔离断言），范围可沿用 worktree patterns；
//   - worktree 缺失（验证视图后的默认路径）：直连分支模式——
//       身份 = 记录 Branch 的 ref 存在；跳过 worktree 专属检查；
//       范围按分支变更推导扩宽；squash 后 realign 用 ref 更新（分支未被检出，安全）；
//       其余（登记、Final Commit、回滚）不变
// 脏隔离 worktree 拒绝语改为指向 CLI：`wopal space evo commit <name>`
```

**4. `wopal space evo switch <name>`（新命令，human-only）**

```typescript
interface SpaceEvoSwitchResult {
  direction: "enter" | "back";
  proposal: string;  // docs/evolutions/<name>.md
  branch: string;    // 切换后 .wopal 所在分支
}
// 方向判定：back ⇔ .wopal 当前在记录的隔离分支上；否则 enter
// enter 前置（全部先于第一个变更；任一不满足 → 拒绝、零变更）：
//   - 提案存在、Mode isolated、Worktree/Branch 已记录、记录 Branch ref 存在、Final Commit 未记录
//   - Stage = validating
//   - .wopal 在注册空间分支、干净、稀疏一致
//   - 隔离 worktree 在场时：须清洁（含 ignored 检查）、在记录分支（缺失是合法态，直接继续）
//   - 目标分支与 .wopal 未跟踪文件（含 ignored）无物化冲突
// enter 效果：隔离 worktree 在场则移除（prune）→ 按分支变更扩宽 .wopal 稀疏范围
//            → .wopal checkout 隔离分支 → 断言（分支 = 记录分支、稀疏一致）
//            —— 不重建/不回补 worktree；原范围仅本次命令内存留存，供失败回滚
// back 前置：.wopal 干净、在记录分支
// back 效果：.wopal checkout 注册空间分支（唯一动作；不重挂、不恢复范围——
//            扩宽是 integrate 需要的终态）
// 失败语义：预检失败零变更；enter 半途失败尽力回滚（分支/范围；worktree 不回补——
//           合法态，重跑 enter 直接恢复）；back 失败报错可重跑；任何消息不得建议删除分支
// 错误码：SPACE_EVO_SWITCH_NOT_FOUND / _STAGE_INVALID / _MODE_INVALID / _BRANCH_INVALID /
//         _DIRTY / _WORKTREE_INVALID / _ISOLATION_FAILED / _FAILED
```

**5. 帮助文本基准**：`commit --paths` 说明与示例以「被提交侧工作区根」为基准（isolated = 隔离工作区；quick / instant = `.wopal`）；不得再出现 `.wopal/` 前缀示例。`space evo` 组帮助列九命令（new/status/check/advance/accept/commit/integrate/switch/archive）。

**6. DESIGN 契约**：`docs/DESIGN-evolution.md` 的 Evolution Lifecycle、Stage × Command Matrix、Command Contracts（commit / advance / accept / integrate / switch）、Isolation Modes、Command Surface 与新行为一致（含隔离基座 `<space>/.worktrees/`）。

**7. `wopal space evo archive <name>` 预检口径（修正）**

```typescript
// 移除：空间工作区全量未提交检查与 SPACE_EVO_ARCHIVE_DIRTY 拒绝
// 记录提交不变：按名 [relative, datedRel]——不相关改动不随行、保持原状（修改仍修改、暂存仍暂存）
// 提案文件自身带未提交字节：不拒绝——工作区字节即归档记录（提交携带最终字节）
// 未提交改动在场时：命令成功（退出码 0），经 warnings 提示未随行路径数
// 保留不变：sparse 健康（_SPARSE_UNHEALTHY）、stage / branch / naming、
//           隔离 worktree 未提交含 ignored（_WORKTREE_DIRTY）、未集成分支内容（_BRANCH_NOT_INTEGRATED）
// 文件头预检清单、帮助 NOTES 与 docs/DESIGN-evolution.md 的 archive 节同步（去除「a clean space worktree」）
```

## In Scope

- 记录保全：`commit` 去覆盖（D-01）；`accept` 镜像字段级化。
- 阶段即时镜像：`advance` 的隔离工作区 `Stage` 同步 + 镜像提交（D-04）。
- 验证期窗口：`commit` 合法 stage 扩展 `{implementing, validating}`（D-02c）。
- 集成门控与直连模式：`integrate --confirm` + stage `validating` + 候选解析 + 无 worktree 直连分支执行（D-02d、D-07）。
- 验证切换：`space evo switch` 双向命令（进入时移除隔离 worktree、切回仅 checkout；无重挂、无持久化状态）（D-03）；验证失败在视图内就地修复提交（D-02c）。
- 归档预检放宽：空间工作区不相关未提交改动不再阻断 `archive`；记录提交按名、不随行（D-08）。
- 文档与示例：DESIGN-evolution.md 契约同步；CLI 帮助修正（④⑤⑥）。
- 测试：上述行为的集成测试 + 一条全链路场景测试（按任务提交 → 切换 → 集成 squash 无冲突）。

## Out of Scope

- ontology-evolution 技能正文（`SKILL.md` / `references` / `templates`）——由进化提案 `refactor-evolution-flow` 承接。
- `archive` 的镜像与清理序列（终局语义不变）；仅其预检口径放宽（D-08 / Task 9）。
- `space sync` / `ontology contribute` 行为；机器能力（`result` 声明、JSON 面）——不变。
- 新增记录类命令（`record` 等）或 `fix` 类命令——不引入（沿用 D-06 精神）。
- quick 模式的验证形态：quick 无隔离视图，验证在空间分支进行；本 Plan 只保证其 commit 窗口与回归不变。
- 切换不引入持久化状态（不写提案 Metadata、不设旁路状态文件；稀疏扩宽为幂等结果，随 integrate 收敛）。

## Affected Files

| Component | Files | Operation | Role |
|-----------|-------|-----------|------|
| 提案写引擎 | `src/lib/space-proposal.ts` | 修改 | commit 去覆盖 + 视图态目标；integrate 确认门 / stage 守卫 / 直连模式 / 候选 / 文案 |
| 状态机 | `src/lib/space-evo-state.ts` | 修改 | advance 的 Stage 镜像 |
| 受理 | `src/lib/space-evo-accept.ts` | 修改 | 镜像字段级化（保全记录） |
| 归档 | `src/lib/space-evo-archive.ts` | 修改 | 预检放宽：移除空间工作区全量脏检查；未随行提示 |
| 验证切换 | `src/lib/space-evo-switch.ts` | 创建 | switch 双向实现（分支占用权移动；不重挂、无持久化状态） |
| 错误码 | `src/lib/error-codes.ts` | 修改 | `SPACE_EVO_SWITCH_*`、`_INTEGRATE_CONFIRM_REQUIRED`、`_ADVANCE_MIRROR_FAILED`；删除 `SPACE_EVO_ARCHIVE_DIRTY` |
| 命令面 | `src/commands/space.ts` | 修改 | switch 注册；integrate 选项；帮助文本修正；advance 调用点 |
| 设计契约 | `docs/DESIGN-evolution.md` | 修改 | 生命周期 / 矩阵 / 契约（含 archive 预检） / 模式 / 命令面同步 |
| 测试 | `tests/lib/`、`tests/commands/` | 修改/创建 | 行为断言更新与新用例；全链路场景 |

## Acceptance Criteria

### Agent Verification

1. [x] **记录不丢（commit）**：isolated 模式下在隔离工作区副本编辑提案（勾选 Done + 回填文件清单）后执行 `space evo commit <name>`——该次提交的提案 blob 与编辑后字节一致；`.wopal` 侧副本不被该提交改写。错误/拒绝路径零残留。（→ Task 1） 验证命令：`cd /Volumes/U500G/coding/wopal-workspace/.worktrees/wopal-cli-240-enhance-wopal-cli-isolated-evo-flow && pnpm test:run tests/lib/space-proposal.integration.test.ts tests/commands/space-evo-commit.integration.test.ts`（全绿）
2. [x] **记录不丢（accept 重跑）**：对已存在隔离 worktree 的提案重跑 `accept`（adopt 或 re-attach 路径）——隔离分支上的记录字段不被 canonical 副本覆盖；仅 `Mode` / `Worktree` / `Branch` / `Base Commit` / `Stage` 被同步；字段本就一致时不产生镜像提交（幂等）。（→ Task 2） 验证命令：`cd /Volumes/U500G/coding/wopal-workspace/.worktrees/wopal-cli-240-enhance-wopal-cli-isolated-evo-flow && pnpm test:run tests/lib/space-evo-lifecycle.integration.test.ts`（全绿）
3. [x] **阶段即时一致与验证期窗口**：isolated 提案任一真实 stage 跃迁后，两侧副本 `Stage` 字段立即相同且隔离 worktree 保持 clean（镜像已提交）；worktree 缺失时仅空间侧记录且命令成功；重推当前 stage 仍为零写入 no-op；`commit` 在 `validating` 下允许（proposal 模式），`quick` / `instant` 行为不变。（→ Task 3、Task 4） 验证命令：`cd /Volumes/U500G/coding/wopal-workspace/.worktrees/wopal-cli-240-enhance-wopal-cli-isolated-evo-flow && pnpm test:run tests/lib/space-evo-lifecycle.integration.test.ts`（全绿）；T4 窗口+集成：验证命令：`cd /Volumes/U500G/coding/wopal-workspace/.worktrees/wopal-cli-240-enhance-wopal-cli-isolated-evo-flow && pnpm test:run tests/lib/space-integrate.integration.test.ts tests/commands/space-evo-integrate.integration.test.ts tests/commands/space-evo-commit.integration.test.ts`（全绿）
4. [x] **按任务提交与 squash 干净（cross-Task）**：全链路场景中主控**按任务**提交——每完成一个 task 一次提交（该 task 代码 + 记录同一提交）；`advance → switch 往返 → integrate --confirm` 后空间分支包含全部代码与记录，squash 无冲突、无跨分支记录提交形态。（→ Task 7） 验证命令：`cd /Volumes/U500G/coding/wopal-workspace/.worktrees/wopal-cli-240-enhance-wopal-cli-isolated-evo-flow && pnpm test:run tests/lib/space-evo-flow.integration.test.ts`（全绿）
5. [x] **集成门控与直连模式**：未带 `--confirm` 的 `integrate` 被拒绝、零副作用、指引含确认门语义；stage ≠ `validating`（如 `implementing`）被拒绝并指引 `advance --to validating`；带 `--confirm` 且 `validating` 可执行；省略 name 时唯一候选（`implementing` / `validating` 中的 isolated）可解析，0/多个拒绝并列出；**隔离 worktree 缺失（视图验证通过后的状态）时可直接集成**（直连分支：squash、登记、Final Commit、realign 全部完成，无任何 worktree 创建）；worktree 在场时维持原清洁/隔离断言；脏隔离 worktree 拒绝语指向 `wopal space evo commit <name>`。（→ Task 4） 验证命令：`cd /Volumes/U500G/coding/wopal-workspace/.worktrees/wopal-cli-240-enhance-wopal-cli-isolated-evo-flow && pnpm test:run tests/lib/space-integrate.integration.test.ts tests/commands/space-evo-integrate.integration.test.ts tests/commands/space-evo-commit.integration.test.ts`（全绿）
6. [x] **验证切换往返**：`switch` 进入后 `.wopal` 位于隔离分支、隔离 worktree 已移除、`.wopal` 范围覆盖隔离分支内容（含新目录物化）；再次执行切回后 `.wopal` 恢复空间分支（**不重建 worktree**，全程零 worktree 创建）；验证失败可在视图内就地修复提交（proposal 提交落在 `.wopal`、仍在特性分支、无登记）；enter / back 各拒绝路径零变更；全程不产生任何状态文件。（→ Task 5、Task 6） 验证命令：`cd /Volumes/U500G/coding/wopal-workspace/.worktrees/wopal-cli-240-enhance-wopal-cli-isolated-evo-flow && pnpm test:run tests/lib/space-evo-switch.integration.test.ts tests/lib/space-evo-lifecycle.integration.test.ts`（全绿）；T6 视图态提交：验证命令：`cd /Volumes/U500G/coding/wopal-workspace/.worktrees/wopal-cli-240-enhance-wopal-cli-isolated-evo-flow && pnpm test:run tests/commands/space-evo-commit.integration.test.ts tests/lib/space-proposal.integration.test.ts`（全绿）
7. [x] **回归（cross-Task）**：`quick / instant / accept（首次派生）/ advance（边与 no-op）/ archive（镜像与清理序列、隔离守卫）` 既有行为不变（预检放宽见 AC#9）；`space-proposal / space-integrate / space-evo-lifecycle / space-evo-commit / space-evo-integrate / space-evolution / worktree` 既有测试全绿（含文案断言更新项）。（→ 全部 Task） 验证命令：`cd /Volumes/U500G/coding/wopal-workspace/.worktrees/wopal-cli-240-enhance-wopal-cli-isolated-evo-flow && pnpm build && pnpm exec vitest run --maxWorkers=2`（141 files / 2257 tests 全绿）
8. [x] **文档与示例**：`docs/DESIGN-evolution.md` 与新契约一致（生命周期含验证切换与确认门；矩阵含 `validating` 行内的 commit / switch / integrate（--confirm）；契约节含 switch、确认门与直连集成（不重挂）语义；隔离基座 `<space>/.worktrees/`；命令面九命令）；CLI 帮助无 `.wopal/` 前缀的 `--paths` 示例且基准说明存在；`src/commands/space.ts` 中 `.wopal/` 前缀的 `--paths` 示例零命中。（→ Task 8） 验证命令：`cd /Volumes/U500G/coding/wopal-workspace/.worktrees/wopal-cli-240-enhance-wopal-cli-isolated-evo-flow && pnpm format:check && pnpm build && test -z "$(rg -n '\.wopal/.*--paths|--paths.*\.wopal/' src/commands/space.ts)"`（format/build 通过、扫描零命中）；帮助面回归：`cd /Volumes/U500G/coding/wopal-workspace/.worktrees/wopal-cli-240-enhance-wopal-cli-isolated-evo-flow && pnpm exec vitest run tests/commands/space-evo-commit.integration.test.ts tests/commands/space-evo-integrate.integration.test.ts`（22 通过）
9. [x] **归档预检放宽**：空间工作区存在与提案无关的未提交改动（修改 / 未跟踪 / 已暂存）时 `archive` 成功——提案移入 `archived/`、记录提交仅含提案新旧两路径、不相关改动保持原状（修改仍修改、暂存仍暂存、未跟踪仍在）；提案文件自身带未提交字节时其工作区字节进入归档记录；`--keep-worktree` / quick / isolated 行为与现状一致；隔离 worktree（含 ignored）与 sparse 守卫不变；有未提交改动时输出非致命提示、退出码 0；帮助 NOTES 与 `docs/DESIGN-evolution.md` 无「a clean space worktree」表述。（→ Task 9） 验证命令：`cd /Volumes/U500G/coding/wopal-workspace/.worktrees/wopal-cli-240-enhance-wopal-cli-isolated-evo-flow && pnpm test:run tests/lib/space-evo-lifecycle.integration.test.ts && test -z "$(rg -n 'clean space worktree' src/commands/space.ts docs/DESIGN-evolution.md)"`（全绿）

### User Validation

说明：机制行为（分支 / 范围 / 门控 / 提交形态）均可由集成测试断言；此处只留 agent 无法替代的一项——`switch` 后**真实运行时**从 `.wopal` 加载隔离分支内容、切回后恢复——按 `projects/wopal-cli/docs/DESIGN-testing.md` Manual Run 机制执行（真实 `$WOPAL_HOME` 操作由用户本人执行；agent 只准备构建与演示提案）。

#### Scenario 1: 隔离视图真机往返（switch 进入/切回 + 运行时加载观察）
- Goal: 确认 `space evo switch` 能让 ellamaka 真实加载隔离分支内容（新技能出现在已加载技能面），切回后恢复正常
- 验证环境: `projects/wopal-cli/docs/DESIGN-testing.md` Manual Run（本地构建产物运行）；TUI 入口见 `projects/ellamaka/AGENTS.md`（Manual Verification Entry Points）
- Precondition: 主控已构建本地 CLI 产物（机制见 `docs/DESIGN-testing.md` Manual Run）；`.wopal` 干净（无未提交变更）；主控已在空间准备演示提案 `uat-switch-demo`（accept isolated → advance implementing → 新增技能 `skills/uat-switch-demo/SKILL.md`（含可识别标记 `UAT-SWITCH-TOKEN`）→ 提交 → advance validating），并给出提案名
- 启动命令: `cd projects/wopal-cli && node dist/cli.js space evo switch uat-switch-demo`
- User Actions:
  1. 执行启动命令，观察回执（方向 enter、`.wopal` 已切至隔离分支）；可用 `git -C .wopal branch --show-current` 复核
  2. 启动 TUI（`cd projects/ellamaka && ./scripts/dev.sh tui`）并新开会话，查看技能清单中是否出现 `uat-switch-demo` / 标记 `UAT-SWITCH-TOKEN`
  3. 再次执行 `node dist/cli.js space evo switch uat-switch-demo`（方向 back），重启 TUI 复核技能消失、`.wopal` 回到空间分支
- 通过判据: 进入后 `.wopal` 分支 = 隔离分支，且 TUI 技能面可见 `UAT-SWITCH-TOKEN`；切回后 `.wopal` 分支 = `space/wopal-workspace`，TUI 技能面不再出现该标记；切回后隔离 worktree 未被重建（`ls .worktrees/ | grep uat-switch-demo` 无输出）；两次切换回执与 `git -C .wopal branch --show-current` 一致；`.wopal-space/logs/dev/` 无新增技能装载类 error
- 失败反馈: 贴出两次 switch 回执、`git -C .wopal branch --show-current` 与 `git -C .wopal sparse-checkout list` 输出、TUI 技能面截图/文本及 `.wopal-space/logs/dev/<scope>/ellamaka-dev-tui.log` 相关片段

（验证完成后清理：经用户明确指示后，主控回收演示提案与分支。）

- [x] 用户已完成上述功能验证并确认结果符合预期

## Implementation

### Task 1: commit 去覆盖 — 隔离提交携带工作区记录

**Verification Intent**: AC#1

**Behavior**:
- Given isolated 提案与隔离 worktree，副本勾选一条 Done 并回填文件清单；When `applySpaceCommit(<name>)`（未给 `--paths`）；Then 该次提交的 `docs/evolutions/<name>.md` blob === 编辑后副本字节；`.wopal` 侧副本内容不变。
- Given 副本被编辑且空间侧副本未变；When commit；Then 不发生任何 canonical 覆盖（无警告即携带）。
- Given commit 因目标校验失败被拒（未知路径 / 私有路径等）；Then 零变更（副本字节与 index 原样）。

**Pre-read**: `src/lib/space-proposal.ts`（`applySpaceCommit` / `commitIsolated` / `syncProposalIntoWorktree`）；`tests/lib/space-proposal.integration.test.ts`、`tests/commands/space-evo-commit.integration.test.ts`

**Design**:
删除提交前的 canonical 覆盖与配套 `priorCopy` / `restoreFileBytes` 回滚逻辑（`syncProposalIntoWorktree` 全仓无其他调用点，一并移除）。副本内容即提交内容；「两侧一致」改由 D-02 的 advance 镜像与 accept 字段级镜像负责。`--paths` 合法性判定与默认目标集不变。

**TDD**: true

**Changes**:
1. RED：写失败测试——隔离副本编辑后 commit，提交 blob 必须含编辑；现行为覆盖后丢失（红）。
2. GREEN：移除提交前覆盖及回滚代码，使测试转绿；更新受影响的既有测试。
3. REFACTOR：清理孤儿函数与过时注释。

**Verify**: `cd projects/wopal-cli && pnpm test:run -- tests/lib/space-proposal.integration.test.ts tests/commands/space-evo-commit.integration.test.ts` 全绿

**Done**:
任务产出：isolated commit 不再吞记录。
实际触碰文件：`src/lib/space-proposal.ts`、`tests/lib/space-proposal.integration.test.ts`。
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤.

---

### Task 2: accept 镜像字段级化 — 重跑 / re-attach 不吞记录

**Verification Intent**: AC#2

**Behavior**:
- Given isolated worktree 副本含已提交或已落盘的记录字段；When accept adopt / re-attach 后镜像执行；Then 记录字段保持不变，仅 `Mode` / `Worktree` / `Branch` / `Base Commit` / `Stage` 与 canonical 一致；镜像提交仅含该文件。
- Given 副本与 canonical 五个字段已一致；Then 不产生镜像提交（幂等）。
- Given 首次 fresh derive；Then 结果与现状一致（副本五字段被写入）。

**Pre-read**: `src/lib/space-evo-accept.ts`（`acceptProposal` / `mirrorIntoWorktree`）；`tests/lib/space-evo-lifecycle.integration.test.ts`

**Design**:
`mirrorIntoWorktree` 改为对副本当前字节做 `setProposalField`（五个命令字段，Stage 的 draft→accepted 规则沿用空间侧判定），有差异才按名提交；字段缺失（副本损坏）→ 响亮失败，不静默跳过。不再整文件写 canonical。

**TDD**: true

**Changes**:
1. RED：失败测试——副本记录字段在 adopt / re-attach 后不丢、幂等不产生空提交。
2. GREEN：字段级镜像实现至绿；更新相关既有用例。
3. REFACTOR：抽共享字段写入辅助（若与 advance 镜像形态可共用）。

**Verify**: `cd projects/wopal-cli && pnpm test:run -- tests/lib/space-evo-lifecycle.integration.test.ts` 全绿

**Done**:
任务产出：accept 镜像字段级化。
实际触碰文件：`src/lib/space-evo-accept.ts`、`tests/lib/space-evo-lifecycle.integration.test.ts`。
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤.

---

### Task 3: advance 阶段即时镜像

**Verification Intent**: AC#3

**Behavior**:
- Given isolated 提案、worktree 存在、stage=`implementing`；When `advanceProposal(…, to="validating")`；Then 空间侧记录提交存在；隔离工作区副本 `Stage`=`validating` 且已提交（`git status --porcelain` 为空）；两侧 `Stage` 相等。
- Given 工作区副本含未提交记录编辑；When advance；Then 编辑保留（仅 `Stage` 字段变化），并随镜像提交入库。
- Given worktree 不存在；Then 空间侧记录成功、命令成功（无镜像）。
- Given 空间侧提交失败；Then 副本恢复为原字节（零残留）。
- Given 重复推进当前 stage；Then no-op、零写入（不变）。

**Pre-read**: `src/lib/space-evo-state.ts`（`advanceProposal`）、`src/lib/space-proposal.ts`（`setProposalField` / `recordProposalWrite` / `resolveRecordedWorktree` / `worktreeExists` / `parseProposalMetadata`）、`src/lib/space-evo-accept.ts`（镜像提交消息风格）

**Design**:
事务次序 = 预检（解析提案与 worktree）→ 写副本（先快照字节，仅字段写入，不提交）→ 空间侧 `recordProposalWrite` → 镜像提交（`gitCommitPaths` 按名）。空间侧失败回滚副本字节；镜像提交失败给出可恢复指引（两侧内容一致、副本未提交）。`advanceProposal` 入参补 `spacePath`（命令调用点与测试同步）。

**TDD**: true

**Changes**:
1. RED：测试 advance 后两侧 `Stage` 一致且副本 clean；worktree 缺失路径成功；回滚路径零残留。
2. GREEN：实现镜像与回滚；扩参调用点。
3. REFACTOR：抽共用镜像辅助。

**Verify**: `cd projects/wopal-cli && pnpm test:run -- tests/lib/space-evo-lifecycle.integration.test.ts` 全绿

**Done**:
任务产出：advance 阶段即时镜像。
实际触碰文件：`src/lib/space-evo-state.ts`、`src/lib/error-codes.ts`、`src/commands/space.ts`、`tests/lib/space-evo-lifecycle.integration.test.ts`。
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤.

---

### Task 4: 验证期窗口、集成门控与直连集成

**Verification Intent**: AC#5、AC#3（窗口部分）

**Behavior**:
- Given isolated 提案 stage=`validating`；When `integrate`（无 `--confirm`）；Then 抛 `SPACE_EVO_INTEGRATE_CONFIRM_REQUIRED`，指引含确认门语义；空间与隔离侧 ref / index / 范围零变化。
- Given stage=`validating` 且带 `--confirm`、worktree 在场；Then 正常集成（既有序列不变）。
- Given **视图验证通过后的状态**（记录 worktree 缺失、记录 Branch ref 存在、`.wopal` 在空间分支、stage=`validating`）；When `integrate --confirm`；Then 直连分支完成：squash 特性分支、范围按分支变更扩宽、staged 路径可见断言通过、登记、Final Commit 记录、realign 以 ref 更新落定（分支不再携带空间分支缺失的提交）；**全程不创建任何 worktree**。
- Given stage=`implementing`（带 `--confirm`）；Then 拒绝并指引 `advance --to validating`。
- Given 省略 name：唯一 isolated 候选（`validating` 或 `implementing`）自动解析后按上述守卫处理；0 / 多候选拒绝并列出候选名。
- Given 隔离 worktree（在场且）脏；Then 拒绝语指向 `wopal space evo commit <name>`（invisible 路径同）。
- Given 提案 stage=`validating`；When proposal 模式 `commit`（isolated / quick）；Then 允许；`instant` 行为不变。

**Pre-read**: `src/lib/space-proposal.ts`（`applySpaceIntegrate` / `resolveIsolatedTarget` / `inFlightIsolatedProposals` / `COMMIT_STAGE` / realign 段）、`src/commands/space.ts`（`evoIntegrateSubcommand` / `evoCommitSubcommand`）、`tests/lib/space-integrate.integration.test.ts:282`

**Design**:
`COMMIT_STAGE` 单值改 `COMMIT_STAGES=[implementing, validating]`（判断处同步）；`integrate` 增 `--confirm` 选项（缺省拒绝，先于一切变更）与 stage=`validating` 守卫；`inFlightIsolatedProposals` 候选集合扩为 `{implementing, validating}`；两处 `evo.sh` 文案改为 CLI 指路。**直连模式（D-07）**：记录 worktree 缺失时，身份判据退为「记录 Branch ref 存在」；跳过 worktree 清洁/隔离断言；范围扩宽复用 `widenOverBranch` 语义（按 `spaceBranch...branch` 变更推导，不必读 worktree patterns）；realign 改用 `gitUpdateRef`（分支未被检出时安全），worktree 在场时维持 `gitResetHardTo`。既有 integrate 测试夹具同步推进到 `validating`（worktree 在场路径），并新增直连模式用例。

**TDD**: true

**Changes**:
1. RED：门控 / stage / 候选 / 文案 / 窗口扩展 / 直连模式各写失败测试。
2. GREEN：实现至绿；更新既有用例与夹具（含 `space-integrate.integration.test.ts` 文案断言）。
3. REFACTOR：守卫消息模板统一；两态执行分派清晰化。

**Verify**: `cd projects/wopal-cli && pnpm test:run -- tests/lib/space-integrate.integration.test.ts tests/commands/space-evo-integrate.integration.test.ts tests/commands/space-evo-commit.integration.test.ts` 全绿

**Done**:
任务产出：验证期窗口、集成门控与直连集成。
实际触碰文件：`src/lib/space-proposal.ts`、`src/lib/error-codes.ts`、`src/commands/space.ts`、`tests/lib/space-integrate.integration.test.ts`、`tests/lib/space-proposal.integration.test.ts`、`tests/lib/space-evo-lifecycle.integration.test.ts`、`tests/commands/space-evo-integrate.integration.test.ts`、`tests/commands/space-evo-commit.integration.test.ts`。
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤.

---

### Task 5: `space evo switch`（进入 / 切回）

**Verification Intent**: AC#6

**Behavior**:
- Given isolated 提案 stage=`validating`、`Final Commit` 未记录、隔离 worktree 干净、`.wopal` 在空间分支且干净；When `switch`；Then 回执 `direction=enter`；`.wopal` 分支 = 隔离分支；隔离 worktree 已移除并 prune；`.wopal` 稀疏范围覆盖隔离分支变更路径（新目录在盘上物化）；稀疏一致断言通过；除 git 状态外无持久化副作用（不新建/修改任何状态文件）。
- Given 隔离 worktree 缺失（合法态：已移除/未重建）；When `switch`；Then enter 直接继续（不报错、不重建 worktree）。
- Given 处于隔离视图（`.wopal` 在记录分支）；When `switch`；Then 回执 `direction=back`；`.wopal` checkout 回空间分支；**不创建 worktree**（`.worktrees/ontology-<slug>` 仍不存在）；不恢复范围（保持扩宽）。
- 拒绝路径（各零变更）：stage ≠ `validating`；`Final Commit` 已记录；`.wopal` 脏 / off-branch / 稀疏不健康；隔离 worktree 在场但脏（含 ignored）/ 分支不符；目标分支与 `.wopal` 未跟踪文件（含 ignored）物化冲突。
- Given enter 半途 git 失败（如 checkout 被拒）；Then 主错误清晰，尽力回滚（`.wopal` 回空间分支、范围回滚；worktree 不回补——合法态，重跑 enter 可直接恢复）。
- Given 提案 validating 且记录 worktree 缺失；When `check`；Then 不报告「已集成」类误导信息，改为说明当前处于验证态（`switch` / `integrate` 可用）。

**Pre-read**: `src/lib/space-evo-accept.ts`（`widenOverBranch` 范围推导语义）、`src/lib/space-proposal.ts`（`resolveIsolatedTarget` / `pendingContent`）、`src/lib/space-evo-state.ts`（check 的 isolation 报告）、`src/lib/ontology/sparse.ts`、`src/lib/ontology/worktree.ts`（`getOntologyWorktreeBase`）、`.wopal/skills/dev-flow/scripts/commands/verify_switch.py`（序列参照）

**Design**:
新模块 `src/lib/space-evo-switch.ts` + `space.ts` 注册子命令（human-only；组帮助更新为九命令）。方向判定契约见 Key Interfaces #4；**无任何持久化状态**（扩宽前原范围仅保存在本次命令内存，失败回滚用）。enter 序列按 D-03（移除先于 checkout = Git 分支独占约束，顺序同 dev-flow `verify_switch.py` 步骤 3→4）：worktree 在场则干净预检后 `gitWorktreeRemove` + prune（缺失则跳过）→ 按分支变更（`spaceBranch...branch`）推导并 `widenSparsePatterns` 扩宽 `.wopal` → `gitCheckout` 隔离分支 → 断言。back 序列 = `gitCheckout` 空间分支（唯一动作）。check 的 isolation 消息按「validating + worktree 缺失 = 正常验证态」修正。新建 `SPACE_EVO_SWITCH_*` 错误码。

**TDD**: true

**Changes**:
1. RED：enter / back 全行为与各拒绝路径失败测试（含「切回不重建 worktree」断言）。
2. GREEN：实现至绿；注册命令与帮助；修正 check 消息。
3. REFACTOR：范围推导与 accept 的 widenOverBranch 语义抽共享辅助。

**Verify**: `cd projects/wopal-cli && pnpm test:run -- tests/lib/space-evo-switch.integration.test.ts tests/lib/space-evo-lifecycle.integration.test.ts` 全绿

**Done**:
任务产出：switch 双向（无重挂）。
实际触碰文件：`src/lib/space-evo-switch.ts`、`src/lib/space-evolution.ts`、`src/lib/space-evo-accept.ts`、`src/lib/space-proposal.ts`、`src/lib/space-evo-state.ts`、`src/lib/error-codes.ts`、`src/commands/space.ts`、`tests/lib/space-evo-switch.integration.test.ts`、`tests/lib/space-evo-lifecycle.integration.test.ts`。
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤.

---

### Task 6: 视图态 `commit`（验证期就地修复提交）

**Verification Intent**: AC#6（修复路径）

**Behavior**:
- Given isolated 提案、记录 worktree 缺失、`.wopal` 检出记录分支（验证视图）、stage=`validating`；When 在 `.wopal` 编辑后执行 `commit <name>`（默认目标）；Then 提交落在 `.wopal`（特性分支），提案 blob = 编辑后字节；`localState` 不变（无登记，登记属 integrate）；空间分支 ref 不变。
- Given 视图态提交新增路径；Then 仅扩宽 `.wopal` 范围并随提交入库，无登记。
- Given 记录 worktree 缺失且 `.wopal` 不在记录分支；Then 拒绝（含指引；不产生任何变更）。
- Given quick / instant 模式；Then 行为不变。

**Pre-read**: `src/lib/space-proposal.ts`（`applySpaceCommit` / `commitIsolated` / `resolveIsolatedTarget`）、`src/lib/space-evo-switch.ts`（Task 5 产出）

**Design**:
扩展 isolated 提交的目标解析：记录 worktree 缺失**且** `.wopal` 检出记录分支时，目标 = `.wopal` 自身；其余缺失场景维持拒绝。提交尾部复用 `commitIsolated` 既有形态（按名暂存、扩宽、无登记、无镜像——视图态单副本）。错误码不变；指引文案覆盖「视图态可提交 / 其余先 switch 或 re-accept」。

**TDD**: true

**Changes**:
1. RED：视图态提交落点、无登记、拒绝路径失败测试。
2. GREEN：扩展目标解析至绿；更新受影响用例。
3. REFACTOR：与 `commitIsolated` 共有尾部整理。

**Verify**: `cd projects/wopal-cli && pnpm test:run -- tests/commands/space-evo-commit.integration.test.ts tests/lib/space-proposal.integration.test.ts` 全绿

**Done**:
任务产出：视图态就地修复提交。
实际触碰文件：`src/lib/space-proposal.ts`、`tests/lib/space-proposal.integration.test.ts`、`tests/commands/space-evo-commit.integration.test.ts`。
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤.

---

### Task 7: 全链路场景测试（按任务提交 → 切换 → 集成）

**Verification Intent**: AC#4

**Behavior**:
- 单一真实 git 场景（两个任务批次，验证按任务粒度）：new → accept（isolated）→ advance implementing →（任务 A）改代码（新技能路径）+ 填写任务 A 记录（Done 勾选 / 回填）→ `evo commit <name>`（提交 1 = A 代码 + A 记录）→（任务 B）补任务 B 改动 + 记录 → `evo commit <name>`（提交 2 = B 代码 + B 记录）→ advance validating → `switch`（enter：断言 `.wopal` 分支 / 范围 / 物化、worktree 已移除）→ 失败返工腿：视图内编辑 + `evo commit`（提交落在 `.wopal`、无登记）→ `switch`（back：断言 `.wopal` 回空间分支、**worktree 未被重建**）→ `integrate --confirm`（直连模式）→ 断言：空间分支包含全部代码与记录；squash 无冲突；无跨分支记录提交形态；`Final Commit` 记录；从 enter 到 integrate 全程 `.worktrees/ontology-<slug>` 不存在（零 worktree 创建）。
- 反例：场景中任何时点未 `--confirm` 的 `integrate` 均被拒绝。
- RED 确认：该场景在旧行为下必红（记录被吞 / squash 冲突 / 门控缺失 / 集成要求 worktree），以证明测试能抓住坏实现。

**Pre-read**: `tests/helpers/space-sync-fixture.ts`、`tests/lib/space-evo-lifecycle.integration.test.ts`、`tests/lib/space-integrate.integration.test.ts`

**Design**:
新增独立场景测试文件（如 `tests/lib/space-evo-flow.integration.test.ts`），只走公开命令面（lib 函数或 CLI），不 mock git。该测试是 AC#4 的最终证明，覆盖 T1 / T3 / T4 / T5 / T6 的交互。

**TDD**: true

**Changes**:
1. RED：场景测试（在 T1–T6 完成后应全绿；先在含缺口的基线确认其失败点与预期一致）。
2. GREEN：无需生产实现（若暴露缺口，回报并回到相应 Task 修复后重跑）。
3. REFACTOR：抽场景辅助。

**Verify**: `cd projects/wopal-cli && pnpm test:run -- tests/lib/space-evo-flow.integration.test.ts` 全绿

**Done**:
任务产出：全链路场景测试。
实际触碰文件：`tests/lib/space-evo-flow.integration.test.ts`。
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤.

---

### Task 8: DESIGN 契约与 CLI 帮助同步

**Verification Intent**: AC#8

**Behavior**:
- `docs/DESIGN-evolution.md`：生命周期含「实施 → commit →（rook）→ advance validating → 用户验证（先询问用户选择、优先分支切换 switch；可选先集成后验证）→ 用户确认 → integrate --confirm（直连分支，无需 worktree）→ advance archived → archive」；Stage × Command Matrix 的 `implementing` 行含 commit，`validating` 行含 commit / switch / integrate（--confirm）；`space evo commit` 契约无「提交前刷新副本」表述、明确副本即提交内容、advance 镜像与视图态目标；`space evo integrate` 契约含确认门、`validating` 守卫与直连模式；新增 `space evo switch` 契约（进入移除 worktree、切回仅 checkout、不重挂）；Isolation Modes 基座改 `<space>/.worktrees/`；Command Surface 九命令。
- CLI 帮助：`commit --paths` 示例无 `.wopal/` 前缀、描述明示基准（被提交侧工作区根）；`integrate` 帮助含 `--confirm` 注记与直连模式说明；`switch` 帮助含双向与「切回不重挂」语义。
- 扫描：`src/commands/space.ts` 无 `.wopal/` 前缀的 `--paths` 示例。

**Pre-read**: `docs/DESIGN-evolution.md`、`src/commands/space.ts`（帮助文本）

**Design**:
文档随已定稿契约（Key Interfaces）与实施结果落笔；只改本文件与帮助文本，不动技能正文（D-05）。TDD=false（文档 / 文案，无逻辑变更；可执行判据由 AC#8 的扫描承担）。

**TDD**: false

**Changes**:
1. 同步 DESIGN-evolution.md 各节与新契约。
2. 修正 CLI 帮助示例 / 描述。
3. 自查 AC#8 各扫描点。

**Verify**: `cd projects/wopal-cli && pnpm format:check && test -z "$(rg -n '\.wopal/.*--paths|--paths.*\.wopal/' src/commands/space.ts)"`（零命中；`pnpm format:check` 通过）

**Done**:
任务产出：设计契约与帮助同步。
实际触碰文件：`docs/DESIGN-evolution.md`、`src/commands/space.ts`。
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤.

---

### Task 9: `archive` 预检放宽 — 对齐 dev-flow 脏检查

**Verification Intent**: AC#9

**Behavior**:
- Given 空间工作区存在与提案无关的未提交改动（修改 / 未跟踪 / 已暂存）；When `archive <name>`；Then 命令成功、提案移入 `archived/`、记录提交仅含提案新旧两路径；不相关改动保持原状（修改仍修改、暂存仍暂存、未跟踪仍在）；输出未随行提示、退出码 0。
- Given 提案文件自身带未提交字节；Then 不拒绝：工作区字节进入归档记录。
- Given 空间工作区干净；Then 行为与现状一致（`--keep-worktree`、quick / isolated 同现状）。
- 保留不变（各零副作用拒绝）：sparse 失配（`_SPARSE_UNHEALTHY`）；stage / branch / naming；隔离 worktree 未提交含 ignored（`_WORKTREE_DIRTY`）；未集成分支内容（`_BRANCH_NOT_INTEGRATED`）。

**Pre-read**: `src/lib/space-evo-archive.ts`（预检段 `:184-206`、隔离守卫 `:226-253`、文件头预检清单 `:15-23`）、`src/lib/git/raw.ts:299-321`（`gitCommitPaths` 按名语义）、`src/lib/git/query.ts:158-164`（`gitStatusPorcelain`）、`tests/lib/space-evo-lifecycle.integration.test.ts:2167-2205`（现状拒绝用例，改写）、`.wopal/skills/dev-flow/scripts/lib/git.py:18-48`（`is_repo_dirty` 路径排除参照）

**Design**:
删除空间工作区全量脏检查与 `SPACE_EVO_ARCHIVE_DIRTY` 错误码；不设替代阻断（记录提交与回滚按名即安全）。未提交改动在场时经 `warnings` 输出一条非致命提示（「N 条未提交路径未随行」），退出码 0。文件头预检清单、CLI 帮助 NOTES（`src/commands/space.ts`）、`docs/DESIGN-evolution.md` 的 archive 预检描述同步去除「a clean space worktree」。

**TDD**: true

**Changes**:
1. RED：改写 `:2167-2205` 用例为「无关未提交改动不阻断、记录不含无关路径、改动保持原状」；新增提案文件脏（字节入档）与暂存项不随行用例（现行为红）。
2. GREEN：移除守卫与错误码、加未随行提示，至全绿；更新受影响既有用例。
3. REFACTOR：清理注释与帮助 / 文档表述。

**Verify**: `cd projects/wopal-cli && pnpm test:run -- tests/lib/space-evo-lifecycle.integration.test.ts` 全绿

**Done**:
任务产出：archive 预检与 dev-flow 对齐（不相关未提交改动不阻断、不随行）。
实际触碰文件：`src/lib/space-evo-archive.ts`、`src/lib/error-codes.ts`、`src/commands/space.ts`、`docs/DESIGN-evolution.md`、`tests/lib/space-evo-lifecycle.integration.test.ts`。
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤.

---

## Delegation Strategy

| Wave | Task | 执行者 | 依赖 | 委派理由 |
|------|------|--------|------|---------|
| 1 | Task 1 → Task 2 → Task 3 | fae A（同一会话串行） | 无 | 三者同为「记录保全 + 阶段镜像」一组，共享 `space-proposal.ts` / `space-evo-state.ts` / `space-evo-accept.ts` 与测试夹具；串行实施避免同文件并发 |
| 2 | Task 4 | fae B | Wave 1 | 验证期窗口与门控改同一批文件（`space-proposal.ts` / `space.ts`），须待 Wave 1 落定 |
| 3 | Task 5 → Task 6 | fae C | Wave 2 | switch 双向与视图态提交易强耦合（同一验证视图生命周期；T5 新模块 + T6 扩展 `space-proposal.ts`）；`space.ts`/`space-proposal.ts` 须待 Wave 2 后 |
| 4 | Task 7、Task 8 | fae D、fae E（并行） | Wave 3 | T7 只新增测试文件；T8 改文档与帮助，与 T7 文件不相交，可并行 |
| 5 | Task 9 | fae F | Wave 4 | 与 Task 8 共享 `docs/DESIGN-evolution.md` 与帮助文本、与 Task 4 共享 `error-codes.ts`、与 Task 2 / 3 共享 lifecycle 测试；串行收尾，避免同文件并发 |

并行纪律（同一 worktree 共用）：提交必须显式 `--paths`；因并发被拒时原样重试；禁自行处置他人文件与工作区状态；工作区保护禁令（禁 `reset` / `checkout` / `restore` / `clean` / `stash` 及任何触碰工作区的操作）；未提交变更一律上报不处置。
