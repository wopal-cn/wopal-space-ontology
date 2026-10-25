# enhance-session-skill

## Metadata

- **Type**: enhance
- **Project Path**: .wopal
- **Created**: 2026-10-08
- **Stage**: archived
- **Mode**: isolated
- **Worktree**: .worktrees/ontology-enhance-session-skill
- **Branch**: ontology-enhance-session-skill
- **Base Commit**: 647e387619cc0b7d47985b9921d4d196ad702569
- **Final Commit**: a5970b1f375dc8a76ea40d737d195fd9d4a59914

## Scope Assessment

- **Complexity**: High
- **Confidence**: Medium — Ellamaka Skill Pool、原生 `skill(name)` loader、`messages.transform`、Session metadata 与 wopal-plugin SessionStore 均已存在；主要新增工作是把创建时/运行时 grant、持久 overlay、request-tail catalog 与 Ellamaka runtime permission hook 串成同源闭环，并验证 plugin restart/compaction 恢复。

## Goal

让 Wopal 把 Ellamaka 已发现的 Skill 列表作为任务可用能力池，在创建 Session 时和 Session 运行过程中，为主会话或受管子会话增量激活任务需要的 Skill；目标 Agent 只获得动态 Skill 的 name + description，并继续通过原生 `skill(name)` 按需加载正文、base directory 与资源文件。

## Technical Context

### Architecture Context

本提案是 `enhance-session-assembly` umbrella 下的 Skill 子演进，只处理 Skill。Tool、MCP 与 Rule 动态装配不在本提案中实现。

Ellamaka 当前已经提供：

- Skill discovery（`GET /skill` / SDK `app.skills`），可作为当前引擎已加载 Skill Pool；
- 原生 `skill(name)` progressive disclosure，负责返回 SKILL.md、base directory 与资源文件列表；
- Agent + Session permission 的原生 Skill catalog / execution gate；
- `experimental.chat.messages.transform`，可在每个模型请求尾部追加临时上下文。

wopal-plugin 当前已经有 SessionStore、task launcher、Session metadata 读写与 Skill reload/recovery 机制。

现有角色如 Fae/Rook 通常以 `skill: "*": deny` + 少量 baseline allow 约束默认 Skill。仅把新 Skill 名称告诉模型并不足够：如果运行时 overlay 没有参与原生 `skill(name)` 的 permission ask，Agent 会“看得到但加载不了”。反过来，只增加 allow 而不告诉模型，也会形成“能加载但不知道存在”的双真相源。

Ellamaka 前置 Plan `feature-plugin-runtime-perm-hook` 因此只提供通用 `experimental.permission.rules` per-ask seam。本提案在 ontology/wopal-plugin 侧消费该 seam，但不要求 Ellamaka core 理解 Wopal Skill Overlay。

### Research Findings

DeepSeek Harness 的 Skill Registry/Scope 设计提供两个可复用原则：能力目录与正文加载分离；正文和资源按需加载。Wopal 不复制 DSH Skill Registry：在 Ellamaka 核心下，现有 Skill discovery + native loader 已经承担这些职责，插件只维护 task/session 级“额外激活哪些 Skill”的选择结果。

**References**:
- `labs/ref-repos/deepseek-harness/`
- `docs/DESIGN-capabilities.md`
- `docs/DESIGN-wopal-plugin.md`
- `docs/evolutions/enhance-session-assembly.md`
- `projects/ellamaka/docs/DESIGN.md`

### Key Decisions

- D-01: Ellamaka discovery 是 Skill Pool 真相源；wopal-plugin 不扫描 `.wopal/skills`、不复制 Skill Registry、不自己解析 SKILL.md。
- D-02: Agent `permission.skill` 是角色 baseline；Session Skill Overlay 只记录额外激活的 Skill，分为 creation-time `initial` 与 runtime `runtime`，effective 为两者去重并集。
- D-03: 本阶段只支持 add-only。没有 exact-set、subtract、deny、revoke；运行时 grant 不能撤销 baseline 或已授予 Skill。
- D-04: 所有 grant 在修改状态前用 Ellamaka Skill Pool 按 canonical name 校验；任一 Skill 未发现则整次操作原子失败。
- D-05: Session metadata 是 overlay 的持久真相源；SessionStore 与 digest/cache 只是派生状态，plugin restart/resume/compaction 后必须从 metadata 重建。
- D-06: `messages.transform` 在每个正常 model step 的 retained history 尾部追加一份当前 overlay 的 transient synthetic snapshot，只包含 `name + description` 和调用原生 Skill tool 的提示；不注入 body/location/resource path。
- D-07: snapshot 每请求都发送。transform 内容不落 DB，因此 digest 只能缓存解析/格式化，不能跨请求抑制发送；动态变化只发生在已有稳定 prefix 之后。
- D-08: 原生 `skill(name)` 继续拥有 SKILL.md、base directory、scripts/references/assets 加载与既有 recovery 行为；动态 Skill grant 不隐式授予 bash/read/edit/外部工具权限。
- D-09: `experimental.permission.rules` 与 request-tail catalog 必须读取同一 Session Skill Overlay。仅当 `permission === "skill"` 且 pattern 精确命中 overlay 时追加 allow；不改 `session.permission`。
- D-10: 运行时控制面为 `wopal_skill_grant`，由主控 Wopal 持有；Fae/Rook/Maka 等非主控角色默认 deny。它只管理 Skill，不顺带承载 Tool/Rule capability。
- D-11: runtime grant 不要求修改 Ellamaka run loop；grant 完成后，下一次 `messages.transform` 和之后的 `skill(name)` ask 自然读取最新 overlay。
- D-12: 现有 `loadedSkills` 只表示成功加载过的正文，用于 compaction recovery；它不是授权源，也不能反向写入 overlay。

### Key Interfaces

#### Creation-time grant

```ts
wopal_task({
  ...,
  capabilities?: {
    skills?: string[]
  }
})
```

- `skills` 省略或空数组都不撤销 Agent baseline。
- 非空数组全部验证成功后写入新子 Session 的 `initial` overlay，并在首个 prompt 前持久化。
- creation-time grant 和 runtime grant 使用同一个 Session Skill Overlay service；不得各自维护一套 Skill 选择事实。

#### Persistent Session Skill Overlay

```ts
session.metadata["wopal.sessionAssembly"].skills = {
  initial: string[]
  runtime: string[]
}
```

- 数组使用 canonical Skill names，去重并确定性排序。
- 写入时保留 `wopal.sessionAssembly` 其他字段与其他 metadata namespace。
- metadata 写失败则 grant 失败；不得只更新 SessionStore 后声称授权成功。

#### Runtime grant tool

```ts
wopal_skill_grant({
  skills: string[],
  session_id?: string,
  task_id?: string,
})
```

- `session_id` 与 `task_id` 最多指定一个；都省略时目标是当前 Session。
- `task_id` 只能解析 wopal-plugin 已知且仍受管的子任务 Session；不得对任意未知 Session 越权写入。
- 全部 Skill 先验证，再一次性追加到目标 Session 的 `runtime` overlay；重复 grant 幂等。
- 成功结果返回目标 Session、newly added 与 already active Skill；无效 target 或 Skill 时状态零变化。

#### Runtime publication and authorization

同一个 effective overlay 同时驱动模型可见 catalog 和实际加载 allow：

```text
Session Skill Overlay
       │
       ├── messages.transform
       │      └── request-tail: name + description
       │
       └── experimental.permission.rules
              └── exact skill allow
                         │
                         ▼
                   native skill(name)
```

catalog 不复制 Agent baseline；baseline 仍由 Ellamaka 原生 Skill catalog 表达。动态 snapshot 必须明确这些是“本任务额外激活的 Skill”。

#### Ellamaka plugin hook dependency

本提案依赖 Ellamaka Plan `feature-plugin-runtime-perm-hook` 交付以下通用契约：

```ts
"experimental.permission.rules"?: (
  input: {
    sessionID: string
    agent: string
    permission: string
    patterns: string[]
  },
  output: {
    rules: Permission.Rule[]
  },
) => Promise<void>
```

本提案只在 `permission === "skill"` 时消费该 hook；Tool/Rule 不借此提案顺带进入 runtime permission overlay。

## In Scope

- `wopal_task.capabilities.skills` creation-time Skill grant 与首请求前持久化。
- Session Skill Overlay schema、metadata 读写/合并、SessionStore hydration/cache。
- `wopal_skill_grant` 当前/受管子 Session runtime add-only control surface 与 Wopal-only permission。
- 每请求 request-tail name + description snapshot。
- 消费 `experimental.permission.rules`，使 overlay 中 Skill 通过原生 `skill(name)` permission gate。
- plugin restart/resume/compaction 后 overlay 重建，与现有 loadedSkills/recovery 协同。
- Skill-only 集成测试、context dump 可观察性以及相关 ontology DESIGN 同步。

## Out of Scope

- 动态 Tool、MCP、Rule eligibility/matching/tool/path 条件。
- 直接注入 SKILL.md body、Skill location 或 scripts/references/assets 内容。
- 运行时 revoke/subtract/deny/exact-set。
- 改写 Ellamaka run loop、动态修改 `session.permission`、修改原生 Skill loader。
- 因 Skill grant 自动放宽 bash/read/edit/sandbox/外部工具权限。
- 双核心 DSH Skill Provider/共享 `.wopal/skills` 装载方案；该主题单独设计，不阻塞本提案。

## Affected Files

| Component | Files | Operation | Role |
|-----------|-------|-----------|------|
| Task dispatch | `plugins/wopal-plugin/src/tasks/`, `plugins/wopal-plugin/src/tools/` | modify / create | creation-time grant 与 `wopal_skill_grant` 控制面 |
| Skill overlay state | wopal-plugin Session metadata / SessionStore 相关模块 | modify / create | 持久 overlay、原子 merge、restart hydration |
| Runtime hooks | `plugins/wopal-plugin/src/hooks/` | modify / create | request-tail catalog 与 runtime skill allow |
| Agent permissions | `agents/` | modify | 只允许主控 Wopal 使用 runtime grant tool |
| Tests / observability | wopal-plugin tests、现有 context dump | modify / create | grant、隔离、恢复、cache-safe 注入证据 |
| Design | `docs/DESIGN-capabilities.md`, `docs/DESIGN-wopal-plugin.md` | modify | Skill-only 契约同步 |

## Assembly Intent

| Ref | Scope | 理由 |
|-----|-------|------|

本提案只修改已有 wopal-plugin / Agent / docs 资产内部内容，不新增需要 assembly registration 的 whole capability asset。

## Acceptance Criteria

### Agent Verification

1. [x] 创建 Fae/Rook 等 baseline 未允许目标 Skill 的子 Session 时，`capabilities.skills` 中有效 Skill 在首个模型请求前进入 metadata overlay；第一轮 request-tail 可见 name + description，原生 `skill(name)` 调用通过，未 grant 的 Skill 仍按 baseline deny。— 实证：focused suite 覆盖 `task-launcher.test.ts` / `skill-assembly-hooks.test.ts` / `integration.test.ts`，13 files / 121 tests 全绿。
2. [x] 活跃主/子 Session 使用 `wopal_skill_grant` 追加 Skill 后，不重建 Session、不改 run loop；下一 model step 的 request-tail 出现新 Skill，随后原生 `skill(name)` 可加载；持久 `session.permission`、system prompt 和 tool schema 没有被动态改写。— 实证：focused suite 覆盖 `wopal-skill-grant.test.ts` / `message-hooks.test.ts` / `skill-permission-rules.test.ts` / `integration.test.ts`，13 files / 121 tests 全绿。
3. [x] 当前 Session、目标子 Session、父 Session与兄弟 Session 的 overlay 相互隔离；重复 grant 幂等；未知 Skill、未管理 target、同时指定 session_id/task_id 时整次操作失败且 metadata/SessionStore 零变化。— 实证：`session-skill-overlay.test.ts` / `wopal-skill-grant.test.ts` / `integration.test.ts` 纳入 focused 121/121；并发 grant、非法 target、原子失败均有行为断言。
4. [x] request-tail snapshot 只含 overlay Skill 的 name + description 与加载提示，不含 SKILL.md body/location/resource path；每个请求都重新发布当前完整 overlay snapshot，历史消息和 DB 不被 transform 内容污染。— 实证：`skill-catalog-injector.test.ts` / `message-hooks.test.ts` / `integration.test.ts` 纳入 focused 121/121，含 body/path 零泄漏、每请求重发、history 不变断言。
5. [x] `experimental.permission.rules` 仅对 `permission=skill` 且 exact name 命中的 overlay Skill 追加 allow；其他 permission/pattern 不新增规则，实际 allow 与模型可见 catalog 由同一 overlay 生成。— 实证：`skill-permission-rules.test.ts` / `skill-assembly-hooks.test.ts` / `integration.test.ts` 纳入 focused 121/121，exact/partial/wildcard/other-permission 路径全覆盖。
6. [x] 原生 `skill(name)` 成功后仍返回 Ellamaka 既有 SKILL.md、base directory 和资源文件信息；Skill grant 不改变 bash/read/edit/其他工具权限。— 实证：permission/integration 回归纳入 focused 121/121；`git diff --name-only 7efbb3a..0a0d426` 确认 `NO_ELLAMAKA_NATIVE_CODE`，未修改原生 Skill loader/其他 permission 实现。
7. [x] plugin dispose/recreate、Session resume 与 compaction 后从 metadata 恢复相同 overlay；`loadedSkills` 只影响既有 reload/recovery，不会给未 grant Skill 授权。— 实证：`session-skill-overlay.lifecycle.test.ts` / `compaction.test.ts` / `integration.test.ts` focused 全绿，完整 suite 同时覆盖 `session-store.test.ts`；75 files / 1046 tests 全绿。
8. [x] wopal-plugin typecheck/test、变更文件 lint/format 检查通过；实现不包含 Tool/Rule 动态能力，也不新增 Skill body loader/registry。— 实证：`bun run typecheck` PASS；`bun run test:run` = 75 files / 1046 tests PASS；28 个变更 TS 文件 ESLint + Prettier check PASS；范围检查无 Ellamaka native code，未发现重复 Skill body loader/Tool/Rule 动态装配。

### User Validation

#### Scenario 1: 真实子会话按任务增量加载 Skill

- Goal: 在真实模型会话确认 Wopal 选择一个 Fae baseline 没有的已安装 Skill 后，Fae 能看到额外 Skill 提示并通过原生 `skill` 工具加载，而不是收到整段 Skill body 注入。
- Environment: `plugins/wopal-plugin/AGENTS.md` 记录的真实 Ellamaka runtime 验证入口；Ellamaka 已包含前置 `feature-plugin-runtime-perm-hook` 交付。
- Precondition: feature 实现已通过 Agent Verification；空间中存在一个 Fae baseline 未 allow 的已安装 Skill。
- Launch command: `cd /Volumes/U500G/coding/wopal-workspace && ellamaka run "派发一个 Fae 子任务，并为它增量授予一个其默认没有的已安装 Skill；让 Fae 先加载该 Skill，再只报告 Skill 名称和加载结果，不执行其他改动。" --print-logs --log-level DEBUG`
- User Actions:
  1. 观察 Wopal 的子任务派发和 Skill grant 行为。
  2. 观察 Fae 是否实际调用原生 `skill` 工具加载被授予 Skill。
- Pass criteria: Fae 在没有修改 Agent baseline 的情况下成功调用原生 `skill(name)`；动态提示只展示 Skill name/description；正文与资源基目录由原生 Skill tool 返回；没有权限拒绝或 Tool/Rule 动态装配副作用。
- Failure feedback: 提供主/子 Session ID 与 `<space>/.wopal-space/logs/wopal-plugin.log` 对应时间段日志。

- [x] The user has validated the behavior above and confirmed the result.

## Implementation

### Task 1: 建立 Skill Overlay 状态与原子 grant 控制面

**Verification Intent**: AC#1, AC#2, AC#3

**Behavior**:
- 有效 `capabilities.skills` → 新子 Session 首请求前持久化 initial overlay；省略/空值不撤销 baseline。
- `wopal_skill_grant` 对当前 Session 或已知子 Session 追加 runtime overlay；重复 grant 幂等。
- 任一 Skill 未发现、target 非法或 target 参数冲突 → grant 原子失败，持久/内存状态均不变化。
- 主/父/兄弟 Session grants 不串线；非主控 Agent 无权调用运行时 grant tool。

**Pre-read**: `plugins/wopal-plugin/src/tasks/`, `plugins/wopal-plugin/src/session-store.ts`, `plugins/wopal-plugin/src/tools/`, `agents/wopal.md`, `agents/fae.md`, `agents/rook.md`, Ellamaka Skill discovery SDK 契约。

**Design**: 建立单一 Session Skill Overlay service/状态访问边界，负责 discovery validation、metadata 读写、initial/runtime merge 与 SessionStore hydration。Task launcher 和 runtime tool 都调用该边界，不能各自维护 grant 逻辑。先验证全集、再提交一次 metadata 更新，保证失败原子性；内存 cache 只能在持久写成功后更新。

**TDD**: true

**Changes**:
1. RED: 把 creation-time、runtime grant、幂等、无效输入原子性、target resolution、Session 隔离与角色权限落成失败测试并确认失败。
2. GREEN: 实现 Skill Overlay 状态边界，接入 `wopal_task.capabilities.skills` 和 `wopal_skill_grant`，满足全部 grant 行为。
3. REFACTOR: 统一错误/结果 shape、去重排序和 metadata merge，确保 SessionStore 只是 cache；同步 Agent tool permission。

**Verify**: RED 命令：`cd plugins/wopal-plugin && bun run vitest run src/session-skill-overlay.test.ts src/tasks/task-launcher.test.ts src/tools/wopal-skill-grant.test.ts src/tools/wopal-tools.test.ts`；实施前结果为 4 个 test files failed（新增 overlay/tool 不存在，creation grant/capabilities 尚未接线），29 个既有测试通过。GREEN/最终命令：同一 focused test 命令（40 passed / 0 failed）+ `bun run typecheck` + 对 Task 1 changed TS files 执行本地 Prettier check 与 ESLint；Agent permission 通过 `grep -n wopal_skill_grant agents/{wopal,fae,rook,maka}.md` 验证 Wopal allow、Fae/Rook/Maka deny。

**Done**:
Task output: 建立 `SessionSkillOverlay` 单一状态边界，以 Ellamaka `app.skills` 为 Skill Pool 真相源；grant 先全量校验再一次性合并 Session metadata，成功持久化后才更新 SessionStore cache。`wopal_task.capabilities.skills` 在 child 首 prompt 前写入 initial overlay；新增 `wopal_skill_grant` 支持当前 Session / 当前 Wopal 持有的 managed child 的 runtime add-only grant，task/session target 冲突和未知/越权 target 均零状态变化；重复 grant 幂等。Wopal 独占 grant tool，Fae/Rook/Maka 显式 deny。
Files touched: `plugins/wopal-plugin/src/session-skill-overlay.ts`, `plugins/wopal-plugin/src/session-skill-overlay.test.ts`, `plugins/wopal-plugin/src/session-store.ts`, `plugins/wopal-plugin/src/types.ts`, `plugins/wopal-plugin/src/tasks/task-launcher.ts`, `plugins/wopal-plugin/src/tasks/task-launcher.test.ts`, `plugins/wopal-plugin/src/tasks/simple-task-manager.ts`, `plugins/wopal-plugin/src/tools/wopal-task.ts`, `plugins/wopal-plugin/src/tools/wopal-skill-grant.ts`, `plugins/wopal-plugin/src/tools/wopal-skill-grant.test.ts`, `plugins/wopal-plugin/src/tools/index.ts`, `plugins/wopal-plugin/src/tools/wopal-tools.test.ts`, `plugins/wopal-plugin/src/index.ts`, `agents/wopal.md`, `agents/fae.md`, `agents/rook.md`, `agents/maka.md`.
- [x] The implementation agent has completed all development and verification steps above.

### Task 2: 发布 cache-safe Skill catalog 并接通原生加载权限

**Verification Intent**: AC#2, AC#4, AC#5, AC#6

**Behavior**:
- overlay 非空 → 每个 model request 尾部恰有一份当前完整 name + description snapshot；无 body/path，DB/旧历史不变。
- runtime grant 后下一 step snapshot 自动包含新增 Skill；无需 run loop/session.permission 修改。
- `skill(name)` ask 精确命中 overlay → runtime allow；不命中或其他 permission → 不贡献规则。
- catalog 与 permission rules 使用同一 overlay source，不能各自缓存一份授权清单。
- 原生 Skill tool 输出和其他 Tool permission 行为保持原样。

**Pre-read**: Task 1 产出的 Skill Overlay 边界，`plugins/wopal-plugin/src/hooks/message-hooks.ts`, existing injectors, Ellamaka Plugin SDK 新 hook 契约, Ellamaka native `tool/skill.ts` 行为。

**Design**: 新增独立 Skill catalog injector 和 permission-rules hook consumer，两者只依赖 Task 1 的 overlay reader。catalog 通过既有 `messages.transform` 追加新的 transient synthetic tail message，不复用修改最后一条 user message的旧做法；permission hook 仅生成 exact Skill allows。禁止读取 SKILL.md body/location 作为注入内容。

**TDD**: true

**Changes**:
1. RED: 把每请求 snapshot、runtime 下一 step 可见、无历史/DB 污染、exact permission allow、其他 permission 无影响和 native loader regression 落成失败测试并确认失败。
2. GREEN: 实现 tail catalog injector 与 `experimental.permission.rules` consumer，共用同一 overlay reader，使可见性与实际 load permission 同步转绿。
3. REFACTOR: 收紧输出格式、digest 仅缓存格式化、context dump 可观察性和日志边界，确认没有 system/tool-schema rewrite。

**Verify**: RED 命令：`cd plugins/wopal-plugin && bun run vitest run src/hooks/skill-catalog-injector.test.ts src/hooks/skill-permission-rules.test.ts src/hooks/skill-assembly-hooks.test.ts`；实施前 3 个 test files failed（两个新 hook 模块不存在，`experimental.permission.rules` 未注册）。GREEN/最终：上述 focused tests + `message-hooks.test.ts` + `compaction.test.ts` + `command-hooks.test.ts`，20 passed / 0 failed；`bun run typecheck`、Task 2 changed TS files Prettier check 与 ESLint 全绿。额外控制流实证：Ellamaka `experimental.session.compacting` 在 compaction 的 `messages.transform` 前触发，集成测试先调用真实 compaction hook 后再调用 transform，确认 dynamic catalog 不进入 compaction summary 输入。静态 diff 检查确认本 Task 未修改 system transform、Task 1 overlay/grant 控制面或任何 Ellamaka native Skill loader。

**Done**:
Task output: 新增 append-only Skill catalog injector：每次正常 model request 从共享 `SessionSkillOverlay` 重新读取完整 descriptors，在 retained history 尾部追加一条 transient synthetic user context，只包含 overlay Skill 的 name + description 与 `skill(name)` 加载提示；不改较早消息/system/tool schema，overlay 为空不注入，compaction 中显式跳过以防摘要持久化污染。新增 `experimental.permission.rules` consumer，只在 `permission=skill` 时读取同一 overlay，对请求 patterns 中 exact name 命中的项追加 `allow`，其他 permission/partial/wildcard-like pattern 不贡献规则。`createAllHooks` 将两个消费端绑定到同一个 overlay 实例。已核实 Ellamaka main 运行时包含该 hook；当前 pin 的 `@wopal/ellamaka-plugin@2.0.7` 尚未包含新 hook 的 `Hooks` 类型，因此没有提交虚假的 dependency bump 或本地 module augmentation，正式 package contract 需随 Ellamaka 下一次发布协调。
Files touched: `plugins/wopal-plugin/src/hooks/skill-catalog-injector.ts`, `plugins/wopal-plugin/src/hooks/skill-catalog-injector.test.ts`, `plugins/wopal-plugin/src/hooks/skill-permission-rules.ts`, `plugins/wopal-plugin/src/hooks/skill-permission-rules.test.ts`, `plugins/wopal-plugin/src/hooks/skill-assembly-hooks.test.ts`, `plugins/wopal-plugin/src/hooks/message-hooks.ts`, `plugins/wopal-plugin/src/hooks/message-hooks.test.ts`, `plugins/wopal-plugin/src/hooks/index.ts`, `plugins/wopal-plugin/src/index.ts`.
- [x] The implementation agent has completed all development and verification steps above.

### Task 3: 收口恢复生命周期与真实集成

**Verification Intent**: AC#1, AC#3, AC#7, AC#8

**Behavior**:
- plugin dispose/recreate 或 SessionStore 清空 → 下一次使用从 Session metadata 重建 initial/runtime overlay，grant 不丢失。
- compaction 后 overlay catalog 仍从 metadata 每请求发布；已加载 body 的 reload 继续使用现有 `loadedSkills` 机制，未 grant Skill 不因 loadedSkills 获权。
- creation-time grant 首轮、runtime grant 后续轮、父子兄弟隔离在真实 Session/Plugin 生命周期中成立。
- Tool/Rule 动态能力没有随本提案引入。

**Pre-read**: Task 1/2 产出，现有 plugin lifecycle tests、`skill-reload-injector.ts`、compaction/recovery tests、context dump。

**Design**: 用真实独立插件实例和 Session metadata 做恢复验证，不把同一 closure 的二次调用冒充 restart。Overlay 恢复与 loadedSkills recovery 保持两条职责线：前者决定“额外可加载什么”，后者只提醒“此前加载过什么正文”。最后做完整受影响回归和目标态边界检查。

**TDD**: true

**Changes**:
1. RED: 建立 dispose/recreate、cache clear、compaction、父子/兄弟隔离和 loadedSkills 非授权源的失败测试。
2. GREEN: 补齐 metadata hydration/recovery 接线，使生命周期测试和端到端 creation/runtime grant 场景通过。
3. REFACTOR: 运行插件全量 typecheck/test、lint/format 与设计一致性检查；确认无 Tool/Rule 动态能力和 body loader 重复实现。

**Verify**: RED/恢复验证命令：`cd plugins/wopal-plugin && bun run vitest run src/session-skill-overlay.lifecycle.test.ts src/session-store.test.ts src/hooks/command-hooks.test.ts src/hooks/skill-assembly-hooks.test.ts src/hooks/integration.test.ts src/index.test.ts`；最终结果 96 passed / 0 failed。完整门禁：`bun run typecheck:fix`（无诊断）→ `bun run typecheck` → `bun run test:run`（75 files / 1040 tests 全绿）；本 Task 改动 TS 文件显式 ESLint 与 Prettier check 全绿。仓库 `bun run lint` 因既有配置把整个 `scripts` 忽略而由 ESLint 自身以配置错误退出；全仓 `format:check` 也命中大量既有未格式化文件，但本 Task 改动文件全部通过。真实 `ellamaka run` 从 isolation ontology worktree 可启动到 bootstrap，但该 worktree 不具备完整 space runtime/config 绑定，未形成可判定的模型 smoke，因此不把这条记录为 PASS；真实运行观察保留给 proposal 的 User Validation。

**Done**:
Task output: 补齐 Session Skill Overlay 的恢复生命周期：新插件/新 SessionStore 实例首次读取从 Session metadata 重建 overlay；compaction 后主动丢弃 SessionStore 中的 `skillOverlay` 派生 cache，下一次 catalog/permission 读取重新 hydrate metadata。修正 `loadedSkills` 语义，只在原生 `skill` tool 成功执行后的 `tool.execute.after` 记录，permission deny 或 loader 失败不会污染恢复事实，且 loadedSkills 不参与 overlay 授权。补充 fresh-instance、compaction stale-cache、父子隔离、loadedSkills 非授权源等生命周期测试，并同步 Skill Assembly 设计文档。
Files touched: `plugins/wopal-plugin/src/session-skill-overlay.lifecycle.test.ts`, `plugins/wopal-plugin/src/session-store.ts`, `plugins/wopal-plugin/src/session-store.test.ts`, `plugins/wopal-plugin/src/hooks/command-hooks.ts`, `plugins/wopal-plugin/src/hooks/command-hooks.test.ts`, `plugins/wopal-plugin/src/hooks/skill-assembly-hooks.test.ts`, `plugins/wopal-plugin/src/hooks/integration.test.ts`, `plugins/wopal-plugin/src/index.test.ts`, `docs/DESIGN-capabilities.md`, `docs/DESIGN-wopal-plugin.md`.
- [x] The implementation agent has completed all development and verification steps above.

### Review Rework — Round 1

2026-10-10 第一轮 implementation review 结论 `REVISE`（B0/W4/I4）。本轮逐项处置：

- W-01：真实 plugin server 入口测试新增 `experimental.permission.rules` hook-key 断言，防止字符串漂移静默丢失接线。已核实 npm registry 最新 `@wopal/ellamaka-plugin@2.0.8` 仍未发布该 hook 的 `Hooks` 类型，因此不做虚假 dependency bump；当前 pin 仍为 `2.0.7`，正式类型契约等待 Ellamaka 后续发布包含现有 main hook 定义的新版本。
- W-02：request-tail catalog 在 overlay descriptor lookup 失败时记录日志并 fail-open（本次不注入 snapshot）；runtime permission consumer 在 overlay hydration/read 失败时记录日志并贡献零规则，保留 Agent/Session baseline 的 fail-deny 行为。
- W-03：Skill Pool 增加 30 秒 TTL 派生缓存；空 overlay 的 descriptor 查询不触发 discovery；grant 若在缓存中找不到请求 Skill，会强制刷新一次再判 unknown，避免新安装 Skill 被 stale cache 误拒。
- W-04：同一 Session 的 grant 通过 per-session promise queue 串行化完整 read-modify-write，两个并发 grant 不再覆盖彼此 metadata/cache。
- Requirement Question 1：所有 child `promptAsync` 显式 `wopal_skill_grant: false`，与 `wopal_task: false` 并列；运行时 grant 保持“主控 Wopal only”。
- Info：Task 2 Done 中错误的 `2.0.8` 叙述已修正为实际 pin `2.0.7`。`tool.execute.before` 的 no-op 保留不作为本轮功能修复范围，不影响行为。

TDD 证据：先新增 5 类回归并得到 5 个有效 RED（catalog fail-open、permission fail-deny、空 overlay discovery、同 Session 并发 grant、child grant tool override）；GREEN 后 focused 5 files 为 66 passed。返工后 13 个 proposal-focused files 为 121 passed；最终 `typecheck:fix` 无诊断、`typecheck` PASS、plugin 全量 75 files / 1046 tests 全绿，返工改动 TS 文件 ESLint + Prettier check 全绿。

---

## Delegation Strategy

| Wave | Task | Executor | Depends on | Why delegated |
|------|------|----------|------------|---------------|
| 1 | Task 1 | fae | Ellamaka `feature-plugin-runtime-perm-hook` 已集成交付 | 先建立唯一 overlay truth source 与 grant 控制面，后续两条消费链都依赖它 |
| 2 | Task 2 | fae | Task 1 | catalog 与 runtime allow 强耦合，必须确保同源 |
| 3 | Task 3 | fae | Task 1, Task 2 | 生命周期恢复必须对完整链做真实实例验证 |

## Delivery

- 本提案保持 `draft`，等待用户独立评审和批准；不得因为 umbrella 已存在而自动 accept。
- 直接前置：Ellamaka Plan `feature-plugin-runtime-perm-hook` 必须达到 verified + integrated deliverable，之后本提案才能进入实现。
- 本提案只交付 Skill；Tool/Rule 继续由 umbrella 中的后续独立子提案承载。
- `space sync` 和 `ontology contribute` 由用户决定，本提案不自动上传。
