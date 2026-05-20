# 委派模板

委派 fae 执行 Task 时的消息格式，与 Task 字段顺序约束。

---

## 消息格式

**Plan 驱动任务**（推荐）：

    ## Plan
    读取 Plan 文件，按 Task <N> 执行：
    <Plan 文档绝对路径>

    ## 特别注意
    - <仅在 Plan 之外需要额外强调的事项，无则省略此节>

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

---

## Task 字段顺序与约束

- Verification Intent → Behavior → Files → Pre-read → Design → TDD → Changes → Verify → Done
- **Behavior 必填**：代码 Task（TDD=true）必须在 Behavior 中填写输入/输出映射；非代码 Task 可描述预期状态变化或跳过（TDD=false 时 Behavior 不强制）
- **Design 在 Behavior 后**：先定义"什么是对的"，再写实现设计
- **Changes 编号列表**：使用 `1. 2. 3.` 格式，禁止 checkbox

---

## 委派 prompt 必含项

每次委派 fae 执行 Plan Task 时，prompt 末尾必须附加：

    完成后在 Plan 文件中编辑对应 Task 的 Done checkbox（- [ ] → - [x]），Plan 文件路径：<绝对路径>
    禁止修改 Plan Status

缺少此指令 = fae 不会主动更新 Plan，导致 Done 全部遗漏。

---

## TDD 默认规则

- **代码 Task 默认启用 TDD**：Agent 编写 Plan 时应自动为代码变更 Task 设置 `**TDD**: true`，遵循 RED-GREEN-REFACTOR 流程，并填写 Behavior 字段
- **非代码 Task 显式声明 false**：UI 布局、配置变更、胶水代码、探索性原型等不适合 TDD 的场景，需显式设置 `**TDD**: false`，并在注释中说明理由
- 参考 `references/tdd-guide.md` 的判断启发式
