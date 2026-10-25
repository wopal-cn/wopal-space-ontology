# Ontology 消费统一 SDK 与内部 DSH adapter

## Metadata

- **Type**: refactor
- **Project Path**: .wopal
- **Created**: 2026-10-10
- **Stage**: draft
- **Mode**: (none)
- **Worktree**: (none)
- **Branch**: (none)
- **Base Commit**: (none)
- **Final Commit**: (none)

## Scope Assessment

- **Complexity**: Medium
- **Confidence**: High

## Goal

让 ontology 只提供声明、配置和兼容素材，通过目标 Ellamaka/统一SDK物化，保留兼容旧源码和所有用户参数；旧产品使用兼容旧装配声明。

## Technical Context

### Architecture Context

前置为 ontology internal-adapter-assembly 已完成，以及 Ellamaka refactor-sdk-unified-sdk 的正式精确SDK和内部adapter制品。Wopal CLI计划可并行；本计划可直接用SDK验证声明，不以其CLI实现作为必需条件。当前 plugins/dsh-adapter 外部源是旧产品兼容资产；禁止因内部化删除它或升级其依赖而破坏降级。

### Key Decisions

- D-01: 目标态按本项目DESIGN、Ellamaka API与工具设计实施；不分析GAPS。
- D-02: 保留 dsh-adapter 配置键、外部兼容身份和旧素材；新版默认装配已无外部 adapter；旧源码保留但不装配。
- D-03: 固定DSH版本由产品拥有，ontology模板不得自己拼Home指纹或承诺另版DSH。

### Key Interfaces

新管理资源统一使用 `/wopalspace`，资源路径以稳定 `spaceId` 寻址，CLI 的 name/id 兼容转换由 wrapper 承担；不得在下游自行改名或新增 `/workspace` 别名。所有新 DTO 与错误状态以 Ellamaka 生产者 Plan 的固定契约为准。

硬契约为已交付精确产品/SDK版本的生成 OpenAPI 3.1；当前待实施接口由 `.wopal-space/plans/ellamaka/refactor-sdk-unified-sdk.md` 的 Key Interfaces / Endpoint Catalog 及 DTO、错误、兼容条款定义，通用规则见 `projects/ellamaka/docs/API-CONTRACT.md`。修改时先修订设计与计划，不能在下游实现中猜测。SDK 包名保持 @wopal/ellamaka-sdk，HTTP 客户端保留 /v2 的 createOpencodeClient；本地入口 /local 提供 createLocalClient({homePath,ellamakaExecutable?})。HTTP 客户端保留原 data/error 包装，本地返回业务 DTO。

- 本地 setup 不启动引擎：inspect、prepareOntology、prepareRuntime、configureGithub、configureProvider 和 wopalspace/已有配置读取按 API 表执行。
- DSH 的 runtime 必须来自目标 Ellamaka 制品。外部本地 SDK 委托该产品 init；HTTP 宿主与内部调用使用本产品 Bridge。
- 所有公开管理操作及 onboarding state/probe/execute/cancel/complete/stream 进入 PublicApi/OpenAPI；不暴露安装 Ellamaka 制品的 endpoint。
- Home 在 HTTP 服务启动时固定；异机路径由服务端解释，修改 Home 返回 HOME_RESTART_REQUIRED。
- local 的进度回调与 AbortSignal 是执行选项；HTTP 使用已有 SSE/cancel。错误 INVALID_INPUT/AUTH_REQUIRED/FORBIDDEN_TARGET/OPERATION_BUSY/CONFLICT/CAPABILITY_UNAVAILABLE/OPERATION_TIMEOUT 和取消语义按 API 表。

## In Scope

- profile/preset声明、装配默认值和必要的消费入口与SDK契约一致。
- SDK 消费后的模板/配置回归；外部 adapter 装配调整由独立前置提案完成，本计划不重复实施。
- 用户级/空间级配置分发边界和私有覆盖保持。

## Out of Scope

- 阶段 3 的 Config Engine：不新增通用 config.operation、PATCH/reset-key、逐项来源/tui 配置读面、设置面板或 config 命令族。阶段 4 的 Plan Scheduler、DAG/cron/审批 API 与 UI 同样不在本轮。

- 不落地 enhance-session-assembly 的 Skill、Rule、Tool 子提案，不替换现有角色灵魂或权限。
- 不在本轮改 skills/rules/agents 或发布上游；不accept/advance/integrate此草案。

## Affected Files

| Component | Files | Operation | Role |
| --- | --- | --- | --- |
| 声明与模板 | assembly、config、dsh/profiles、dsh/agents-presets | 按实际需要修改 | 服务消费的数据输入 |
| 兼容素材 | plugins/dsh-adapter | 保留/验证 | 旧产品兼容，不增加行为 |
| 文档 | docs/DESIGN*.md | 对齐 | 配置与执行所有权 |

## Acceptance Criteria

### Agent Verification

1. [ ] 直接SDK与CLI wrapper物化同一fixture，bundles/默认配置/注册信息相同；用户已有值不被覆盖。
2. [ ] SDK消费后的新版装配仍无外部adapter引用；内部provider独立可用，保留的旧源码不被安装/执行或升级依赖。
3. [ ] 声明无固定活动dsh/home假设，runtime root来自产品返回的environment；profile无跨源码写入链接。
4. [ ] settings.jsonc的dsh-adapter字段、JSONC格式、三层覆盖保持；非法参数和不兼容包真实报错。
5. [ ] 节点persona、技能范围和预设定义保持内容与权限；未实施Session Assembly子提案。

### User Validation

#### Scenario 1: 真实空间内参数与工具显示
- Goal: 观察当前空间的 preset、权限、sandbox 参数和工具说明是否清楚可用。
- 验证环境：复用已存在的 `/Users/sam/tmp/wopal-e2e/home`；工作目录为当前 `wopal-workspace`。保留其现有配置、凭证和运行数据，不清空、不重置 onboarding 状态，不使用 `/Users/sam/.wopal`。
- 准备工作：Agent 完成相关自动验证，并确认候选分支、构建与依赖就绪；检查是否有进程占用该 Home。不同入口依次验证，不同时写同一环境。需要切换或停止已有非本次验证进程时由用户配合。
- 验证边界：空 Home 冷启动、数据复制、故障注入和产品版本切换保护属于 Agent Verification，在临时 fixture 中完成；用户不需要破坏现有 Home 来触发这些场景。个人 token/key 由用户自行输入。
- 脚本约定：引用 `projects/ellamaka/AGENTS.md` 的 Verification Entry Points。以下命令从空间根执行；`dev.sh` 来自已准备好的 Ellamaka 候选分支。若实施工作树位置不同，Agent 在交付验收时回填实际脚本绝对路径，不让用户猜路径。
- Precondition：上游精确 SDK/内部 adapter 制品已交付；按 ontology 演进机制进入已准备好的实施分支验证视图，不直接更新中央 main。
- 启动命令：

```bash
WOPAL_HOME=/Users/sam/tmp/wopal-e2e/home ./.worktrees/ellamaka-feature-upgrade-dsh-v0.2/scripts/dev.sh serve --port 3018 --app-port 3019
```

- User Actions：打开脚本实际输出的 Workbench 地址，进入当前 `wopal-workspace`，查看 DSH 插件和 preset 说明、权限/sandbox 选择及正常助理交互；沿用已有配置，不创建新的 fixture 空间。
- 通过判据：当前已选参数和模式可识别，工具说明与实际交互一致，错误提示可理解。旧产品兼容性由 Agent 在临时环境自动验证，不要求用户在此 Home 中反复切换版本。
- 失败反馈：记录具体页面、操作步骤、截图与脱敏错误；由 Agent 检查脚本输出的日志位置。
- 停止命令：

```bash
./.worktrees/ellamaka-feature-upgrade-dsh-v0.2/scripts/dev.sh stop frontend
./.worktrees/ellamaka-feature-upgrade-dsh-v0.2/scripts/dev.sh stop backend
```

- [ ] 用户已完成上述功能验证并确认结果符合预期

## Implementation

### Task 1: SDK声明与模板消费

**Verification Intent**: AC#1, AC#2, AC#3, AC#4

**Behavior**:
- 已有用户patch与默认值合并后仍保留覆盖，当前Home从产品返回结果定位。
- 同一fixture经直接SDK和CLI消费结果等价，不写用户全局能力内容。

**Pre-read**: `docs/DESIGN-assembly.md`, `DESIGN-distribution.md`; 当前assembly/config/dsh素材

**Design**:
只调整消费数据和必要脚本；不新建profile安装器、版本选择或SDK执行器。

**TDD**: true

**Changes**:
1. RED：将全部 Behavior 落成失败测试并确认失败；回填对应 AC 的实际命令。
2. GREEN：复用已有实现完成本组行为，不建立另一套业务规则。
3. REFACTOR：清理重复入口，保持外部契约和拒绝行为，重新验证。

**Verify**: 从相应验证包运行已登记的模板测试；RED阶段回填真实fixture和命令。

**Done**:
任务产出：本组可观察行为及其回归证据。
实际触碰文件：实施完成后记录。
- [ ] 实施 Agent 已完成上述功能开发和验证的所有步骤。

### Task 2: 完整装配与人工观察准备

**Verification Intent**: AC#3, AC#5

**Behavior**:
- 初始化两版fixtureHome保留角色persona和技能范围，内部化不改变权限意图。
- 演进验证视图可退出，不留下不可见能力或未归属链接；流程字段保持机制管理。

**Pre-read**: `docs/DESIGN-capabilities.md`; 当前archetypes/presets；ontology-evolution规则

**Design**:
按ontology自己的隔离/验证流程实施，所有能力资产和记录归同一工作树，当前仅规划。

**TDD**: true

**Changes**:
1. RED：将全部 Behavior 落成失败测试并确认失败；回填对应 AC 的实际命令。
2. GREEN：复用已有实现完成本组行为，不建立另一套业务规则。
3. REFACTOR：清理重复入口，保持外部契约和拒绝行为，重新验证。

**Verify**: 运行ontology文档质量门禁与相关fixture；用户验证只观察界面和参数体验。

**Done**:
任务产出：本组可观察行为及其回归证据。
实际触碰文件：实施完成后记录。
- [ ] 实施 Agent 已完成上述功能开发和验证的所有步骤。

## Delegation Strategy

按用户当前要求人工分批实施，不在规划时委派。实施遵循ontology-evolution的独立审查和用户验收门禁；此文件保持draft，不混用dev-flow Status。

## Done

- [ ] 所有任务实施和 Agent Verification 通过。
- [ ] 用户已完成观察并明确授权整合。

## Reference Documents

- `docs/DESIGN.md`
- `docs/evolutions/internal-adapter-assembly.md`
- `docs/DESIGN-assembly.md`
- `docs/DESIGN-distribution.md`
