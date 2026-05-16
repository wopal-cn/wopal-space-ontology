# Plan 校验规则

`flow.sh plan <issue> --check` / `flow.sh plan --title ... --check` 和 `flow.sh approve` 都会走 Plan 质量校验。

## 校验目的

Plan 必须达到"可执行"质量，而不是只有标题和空提纲。校验不通过时，先修 Plan，再推进流程。

## 重点检查项

| 类别 | 要求 |
|------|------|
| 文件命名 | 需符合 plan 命名规范 |
| 占位符 | 不得残留 TODO / FIXME / `path/to/` / `REQ-xxx` 等 |
| **Technical Context** | 顶层非空即可（4 子节均为可选，至少填写一个子节） |
| **Technical Context 子节** | 若填写 `### Research Findings`，必须附带参考资料列表（文件路径或 URL） |
| Scope Assessment | `Complexity` / `Confidence` 不能是占位符 |
| **Task 字段** | 每个 Task 必须有 `Verification Intent` / `Behavior` / `Design` / `Verify` / `Done` |
| **Task 字段顺序** | `Behavior` 必须在 `Design` 之前（TDD 驱动） |
| **Task TDD 标记** | 若 `**TDD**: true`，`Behavior` 必填且详细 |
| **Changes 格式** | 使用编号列表（1. 2. 3.），**禁止使用 checkbox** |
| **Done checkbox** | 每个 Task 仅一个 checkbox，位于 `**Done**` 字段内 |
| Affected Files | 已填写 |
| **Agent Verification** | 至少一条含可执行命令（检测 shell 命令模式） |
| **User Validation** | 至少一个 Scenario + 最终确认 checkbox，**禁止含构建/测试命令** |

## Agent Verification 校验规则

Agent Verification 承载所有可自动化的验证项（包括单 Task 内验证和跨 Task 集成验证）。

### 命令化检测

校验脚本会检测条目是否包含可执行命令：

**可识别的命令模式**：
- Shell 工具：`rg`, `grep`, `find`, `cat`, `ls`, `python`, `node`, `bash`
- 测试框架：`pytest`, `npm test`, `bun test`, `cargo test`, `go test`
- 构建工具：`cargo build`, `tsc`, `npm run build`
- CLI 自测：`flow.sh`, `git`, `gh`

**禁止的纯描述性条目**：
- ❌ "代码构建通过"
- ❌ "单元测试通过"
- ❌ "功能正常"
- ❌ "无报错"

### 正确格式示例

```markdown
- [ ] `rg -c '### Architecture Context' templates/plan.md` ≥ 1（Architecture Context 子节存在）
- [ ] `python -m pytest tests/ -v` 全部 pass
- [ ] `bash scripts/flow.sh plan 140 --check` 返回 0
```

### 跨 Task 验证

跨 Task 集成验证（如集成测试、E2E 测试）现在统一归入 Agent Verification，在验收阶段由 Agent 执行。

**建议**：跨 Task 验证项放在 Agent Verification 列表末尾，标注"（跨 Task）"。

## User Validation 校验规则

User Validation 只承载人工感知验证项：UI / UX、交互体验、业务流程、视觉确认。

### 排除规则

校验脚本会负向检测以下禁止项：

**禁止的自动化验证项**：
- ❌ 编译 / 构建：`npm build`, `cargo build`, `tsc`, `go build`
- ❌ 单元测试 / 集成测试：`npm test`, `pytest`, `bun test`, `cargo test`
- ❌ Lint / 格式化：`eslint`, `prettier`, `ruff`, `flake8`
- ❌ CLI 自测：任何 Agent 可在终端执行的命令

### 正确场景示例

```markdown
#### Scenario 1: 新模板编写体验验证
- Goal: 确认 Planner 使用新模板编写方案时，引导注释充分
- Precondition: 开发任务就绪，需从零编写一份 Plan
- User Actions:
  1. 加载 dev-flow 技能，执行 `flow.sh plan` 创建新 Plan
  2. 按新模板引导注释逐章节填写 Plan 内容
  3. 观察引导注释是否清晰
  4. 执行 `flow.sh plan --check` 确认校验通过
- Expected Result: 引导注释帮助 Planner 无歧义地完成填写，校验一次性通过

- [ ] 用户已完成上述功能验证并确认结果符合预期
```

## 新旧模板兼容

校验脚本通过识别模板版本区分新旧校验规则：

### 识别机制

- **新模板**：检测 `### Architecture Context` 子节存在 → 走新校验分支
- **旧模板**：无该子节 → 走旧校验分支（保留原校验逻辑）

### 兼容策略

| 模板版本 | 校验分支 | 说明 |
|---------|---------|------|
| 新模板 | 新规则 | Technical Context 子节检查 + Task 新字段检查 + Agent/User 验证分层检查 |
| 旧模板 | 旧规则 | 原校验逻辑保留（Changes checkbox + Step completion） |

**存量 Plan 文件**：新模板对存量 Plan 无影响，存量 Plan 校验沿用旧规则。

## 使用方式

### Issue 驱动

```bash
flow.sh plan <issue> --check
```

### Plan 驱动

无 Issue 模式可通过原始 plan 创建参数定位 Plan 再校验：

```bash
flow.sh plan --title "<title>" --project <name> --type <type> --check
```

## 推进规则

- 先 `--check`，再 `approve`
- `approve` 不是第一次检查，而是进入"等待用户评审方案"的节点
- 如果 `approve` 被校验拦下，修好 Plan 后重新执行 `approve`