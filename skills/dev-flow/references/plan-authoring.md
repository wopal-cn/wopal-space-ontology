# Plan 编写与委派

Plan 质量门、AC 分类、TDD 规则、委派 prompt 格式。

---

## Plan 质量门

进入 `approve` 前 Plan 必须达到可执行质量。校验覆盖 Task 字段（Verification Intent / Behavior / Design / TDD / Verify / Done）。`approve` 被 check-doc 阻断时先修 Plan 再重试。

### Acceptance Criteria

**Agent Verification**：agent 在 `complete` 前完成勾选，机器可验证项。每条必须写具体命令和预期输出（如 `rg -c 'pattern' file` ≥ 1），禁止纯描述性条目。

**User Validation**：用户人工验证，用于 UI/UX、业务流程、集成行为。禁止放入 Agent 可自动验证的项。Agent 不得代勾选 User Validation 最终 checkbox。

### TDD 默认规则

- 代码 Task 默认启用 TDD（`**TDD**: true`），遵循 RED-GREEN-REFACTOR，填写 Behavior 字段
- 非代码 Task 显式 `**TDD**: false`，注释说明理由（如"纯 UI 样式调整"）
- 参考 `references/tdd-guide.md` 的判断启发式

---

## Task 字段顺序与约束

`Verification Intent → Behavior → Files → Pre-read → Design → TDD → Changes → Verify → Done`

- **Behavior 必填**：代码 Task（TDD=true）必须写输入/输出映射
- **Design 在 Behavior 后**：先定义"什么是对的"，再写实现设计
- **Changes 编号列表**：`1. 2. 3.` 格式，禁止 checkbox

---

## 委派 prompt 格式

**Plan 驱动任务**（推荐）：

    ## Plan
    读取 Plan 文件，按 Task <N> 执行：
    <Plan 文档绝对路径>

    ## 特别注意
    - <仅在 Plan 之外需要额外强调的事项，无则省略>

    ## 完成标准
    - <简要列出关键验证点>

    ## Task Report
    完成时输出：Goal/Accomplished/Files/Status

**无 Plan 的临时任务**：

    ## 目标
    <一句话>

    ## 文件
    - /path/to/file

    ## 步骤
    1. 读取相关文件
    2. 修改文件
    3. 运行验证

    ## 完成标准
    - 功能验证通过

    ## Task Report
    完成时输出：Goal/Accomplished/Files/Status

**原则**：有 Plan 时 Plan 是单一信息源，prompt 不重复 Plan 内容。细节让 fae 从 Plan 自行读取。

### 委派 prompt 必含项

每次委派 fae 执行 Plan Task 时，prompt 末尾必须附加：

    完成后在 Plan 文件中编辑对应 Task 的 Done checkbox（- [ ] → - [x]），Plan 文件路径：<绝对路径>
    禁止修改 Plan Status

缺少此指令 = fae 不会主动更新 Plan，导致 Done 全部遗漏。
