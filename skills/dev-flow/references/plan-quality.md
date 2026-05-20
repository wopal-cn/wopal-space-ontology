# Plan 质量门

进入 `approve` 前，Plan 必须达到可执行质量。校验覆盖 Task 新字段（Verification Intent / Behavior / Design / TDD / Verify / Done）。

实施过程中每完成 Task 运行 Verify 后勾选 Done。实施完成后补齐 `Agent Verification`，再执行 `complete`。

Delegation Strategy 的详细规则见模板注释（Wave 分配、委派规则、Autonomous 标记等）。

---

## Acceptance Criteria 的使用方式

### Agent Verification

由 agent 在 `complete` 前完成并勾选，用于机器可验证项。

**命令化要求**：每条必须写具体命令和预期输出（如 `rg -c 'pattern' file` ≥ 1），禁止纯描述性条目（如"代码构建通过"）。同时承载单 Task 内验证和跨 Task 集成验证。

### User Validation

由用户在真实验证后确认，用于人工感知项，如 UI / UX、业务流程、集成行为。

**排除规则**：禁止放入 Agent 可自动验证的项（构建、测试、lint、CLI 自测）。详细规则见 `references/plan-validation.md`。

关键约束：
- Agent 不得代勾选 User Validation 最终 checkbox
- `verify --confirm` 会严格检查这道门

## TDD 默认规则

- **代码 Task 默认启用 TDD**：Plan 编写时应自动为代码变更 Task 设置 `**TDD**: true`
- **非代码 Task 显式声明 false**：不适合 TDD 的场景需显式设置 `**TDD**: false` 并说明理由
- 参考 `references/tdd-guide.md` 的判断启发式
