# enhance-session-assembly

## Metadata

- **Type**: enhance
- **Project Path**: .wopal
- **Created**: 2026-09-27
- **Stage**: draft
- **Mode**: (accept 时记录：isolated | quick)
- **Worktree**: (accept 时记录)
- **Branch**: (accept 时记录)
- **Base Commit**: (accept 时记录)
- **Final Commit**: (integrate 时记录：集成到空间分支后的提交)

## Scope Assessment

- **Complexity**: High
- **Confidence**: Low — 讨论稿，产品行为未定稿，尚不可受理实施。

## Goal

在 Wopal 派发任务时，按会话装配本空间武器库中的技能、规则与外部服务，使未授予的武器对子会话不可见、不可用。引擎侧如何装配与动态配置能力尚未定论，本提案不在该结论之前受理实施；**目前仅作为待定设计讨论稿，不进入实施与验收。**

## Technical Context

### Architecture Context

- `projects/ellamaka` 现有 `feature-plugin-config` 交付插件配置整表；CLI `refactor-space-assembly-state` 交付空间物化并从隔离环境支持 `path`/`paths`。引擎会话级权限能力本文讨论尚未定稿，`.wopal-space/plans/ellamaka/feature-ellamaka-session-permissions.md` 尚处 planning，需先与用户完成设计确认。
- 本提案不预先锁定以下未定问题，也不引用状态与边界作为已知事实；各接口与行为以最终设计为唯一依据。

## Open Design Questions（待讨论定稿）

1. **角色基线与显式授予**：未传 `capabilities` 时按角色基线；显式输出应叠加基线还是精确替代？谱面（默认 deny / 默认 allow）如何与引擎现有 `Permission.evaluate` 语义对接？
2. **会话持久的含义**：授予以 Session 持久权限为介质，还是以插件侧的会话数据为介质？压缩与恢复后哪个为准？源与派生冲突时怎么办？
3. **可见性与执行边界**：未授予是仅隐藏工具提示，还是连直接调用也拒绝？引擎是否额外检查授权身份（服务/工具两层）？
4. **外部服务身份**：服务名重名、连接重载、工具热更新下如何稳定解析同构键？是否需要在服务声明中携带稳定 `id`？
5. **规则注入生命周期**：规则按会话装配记录过滤还是由引擎下放会话级规则集合？规则与技能/MCP 是否共用同一授予机制与失效时间？
6. **失败与回滚**：授予失败、装配冲突时子会话如何终止？已 spawn 的子会话清理是否由插件负责？脱离上下文时如何防止幽灵任务？
7. **与用户级/空间级默认的关系**：插件装配与角色基线、空间 settings 默认的优先级顺序是什么？是否允许模型在派发时从武器库自选未授予能力？

## Discussion Baseline（参考，非定稿）

以下条目仅为讨论起点，实施前必须回到对应设计文档确认，不写入最终提案接口：

- `.wopal/docs/DESIGN-wopal-plugin.md` 的 Capability Assembly Module 目前描述 `wopal_task.capabilities` 只接受名称数组并由插件合成权限；若最终引擎会话权限载体不同，则该契约一并修改。
- 引擎现有 `skill` 权限面位于 `packages/opencode/src/tool/skill.ts`、`src/session/system.ts`、`src/tool/registry.ts`；MCP 工具执行位于 `src/session/tools.ts`。上述文件是否可变、以何种方式扩展由引擎 Plan 决定。

## In Scope（定稿后）

- `wopal_task.capabilities` 解析、会话装配、派发失败清理。
- 规则注入按会话装配结果过滤。
- 三插件配置消费不在此提案（另见 `refactor-plugin-config-consumption`）。

## Out of Scope

- 引擎权限、工具可见性、外部服务授权：属于 `feature-plugin-config` 与后续引擎 Plan（未定稿）。
- CLI 装配与同步、通用 paths、私有持有：另有主体。
- 面向用户的 UI/UX 与真实空间迁移落地顺序。

## Acceptance Criteria

### Agent Verification

待设计定稿后按新契约补写；讨论稿不定义最终 AC。

### User Validation

待设计定稿后按场景补写；讨论稿不定义最终验证。

## Implementation

待设计定稿后拆解为一次实施、一次验证的 Task；讨论稿不预写实现细节。

## Delegation Strategy

待设计定稿后确定；讨论稿禁止委派实施。

## Delivery

任何交付须在用户确认设计问题后有真实的实现载体并走一次验收；不得以本讨论稿为施工入口。