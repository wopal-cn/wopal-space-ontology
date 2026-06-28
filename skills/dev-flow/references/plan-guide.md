# Plan 编写指南

## TDD 指南

### 何时使用 TDD

**核心启发式**：能在编写 `fn` 之前用 `expect(fn(input)).toBe(output)` 描述行为吗？

- 能 → 使用 TDD（`**TDD**: true`）
- 不能 → 使用标准 Task，事后按需加测试

**适合 TDD 的场景**：有明确输入/输出的业务逻辑、API 端点、数据转换、验证规则、算法、状态机。

**不适合 TDD 的场景**：UI 布局/样式、配置更改、胶水代码、探索性原型、无业务逻辑的简单 CRUD。

### TDD Task 写法示例

```markdown
**Verification Intent**: AC#1, AC#2

**Behavior**:
输入 → 输出映射：
- valid_email("user@example.com") → true
- valid_email("") → false
- valid_email("no-at-sign") → false

**Files**: `src/validators/email.py`, `tests/test_email_validator.py`

**Pre-read**: `src/validators/pattern.py`

**Design**:
分三阶段实现（RED → GREEN → REFACTOR）：
1. RED：编写测试覆盖上述 Behavior 中的输入/输出映射，运行测试确认失败
2. GREEN：实现 email 验证函数，最小代码使测试通过
3. REFACTOR：提取正则常量，清理实现（如需）

**TDD**: true

**Changes**:
1. 创建 `tests/test_email_validator.py`，编写 3 个测试用例覆盖 Behavior
2. 在 `src/validators/email.py` 实现 `valid_email()` 函数
3. 提取 `EMAIL_REGEX` 常量，消除硬编码

**Verify**:
`python -m pytest tests/test_email_validator.py -v` 全部 pass

**Done**:
任务产出：email 验证函数含 3 个测试用例，RED→GREEN→REFACTOR 三阶段完成
- [ ] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）
```

### TDD 关键字段

| 字段 | TDD 下的要求 |
|------|-------------|
| **Behavior** | 必填且详细。列出具体的输入/输出映射 |
| **Design** | 按 RED → GREEN → REFACTOR 三阶段描述 |
| **Changes** | 三步对应三阶段，编号列表 |
| **Verify** | 运行测试命令，确认全部通过 |

### TDD 提交建议

TDD Task 产生 2-3 个原子提交（每个阶段一个）：

```
test(scope): add failing test for email validation
feat(scope): implement email validation
refactor(scope): extract regex to constant
```

- RED 阶段提交：测试存在且失败
- GREEN 阶段提交：最小实现使测试通过
- REFACTOR 阶段提交：仅在有实际改进时提交

### TDD 错误处理

| 阶段 | 问题 | 处理 |
|------|------|------|
| RED | 测试没有失败 | 功能可能已存在或测试有误，调查后再继续 |
| GREEN | 测试没有通过 | 调试实现，持续迭代直到通过，不要跳到重构 |
| REFACTOR | 测试失败 | 撤销重构，用更小的步骤重试 |

**RED 不失败是最常见的陷阱**：意味着测试没有真正覆盖预期行为，必须修复后才能继续。

---

## Task 字段格式速查

**Behavior**（TDD=true 时）：
```
输入 → 输出映射：
- valid_email("user@example.com") → true
- valid_email("") → false
```

**Design**：
```
技术方案、关键实现思路、需要注意的约束。
至少写 2-3 句话，不能留空。
```

**Changes**（禁止 checkbox）：
```
1. 创建 tests/test_xxx.py
2. 实现 xxx 函数
3. 提取常量
```

**Verify**：
```
`cd projects/xxx && pnpm test:run` 全部通过
```

---

## Agent Verification 规则

Agent Verification 承载所有可自动化的验证项（包括单 Task 内验证和跨 Task 集成验证）。

**可识别的命令模式**：`rg`, `grep`, `find`, `cat`, `ls`, `python`, `node`, `bash`, `pytest`, `npm test`, `bun test`, `cargo test`, `go test`, `cargo build`, `tsc`, `npm run build`, `flow.sh`, `git`, `gh`

**禁止的纯描述性条目**：❌ "代码构建通过" / "单元测试通过" / "功能正常" / "无报错"

**正确格式**：
```markdown
- [ ] `rg -c '### Architecture Context' templates/plan.md` ≥ 1（Architecture Context 子节存在）
- [ ] `python -m pytest tests/ -v` 全部 pass
```

**跨 Task 验证**：放在 Agent Verification 列表末尾，标注"（跨 Task）"。

---

## User Validation 规则

User Validation 只承载人工感知验证项：UI / UX、交互体验、业务流程、视觉确认。

**禁止的自动化验证项**：❌ `npm test` / `pytest` / `cargo test` / `eslint` / `prettier` 等

**正确场景**：
```markdown
#### Scenario 1: 新功能验证
- Goal: 确认功能行为符合预期
- Precondition: 已构建包含变更的 CLI
- User Actions:
  1. 运行命令观察输出
  2. 确认行为正确
- Expected Result: 输出符合预期

- [ ] 用户已完成上述功能验证并确认结果符合预期
```

---

## Metadata 填写规则

Metadata 中的项目信息（`Project Path`、`Project Type`、`Target Project`）必须从空间的 `STRUCTURE.md` 查询。

**填写步骤**：
1. 根据 Plan 涉及的代码路径判断属于哪个域（ontology / projects / contents / ...）
2. 在 `STRUCTURE.md` frontmatter 或表格中匹配对应的 path/type/repo
3. 填写映射：

| STRUCTURE.md type | Project Type | Project Path 示例 |
|---|---|---|
| `ontology-worktree` | ontology-worktree | `.wopal/` |
| `projects` | projects | `projects/<name>/` |
| `contents` | contents | `contents/<name>/` |

**常见错误**：
- 把子目录（如 `.wopal/plugins/wopal-plugin/`）当作项目根路径 — 应取 worktree 根 `.wopal/`
- 把 ontology worktree 归为普通项目 — 它是独立 repo 的 worktree

---

## 委派 prompt 格式

**Plan 驱动任务**（推荐）：

    ## Plan
    读取 Plan 文件，按 Task <N> 执行：
    <Plan 文档绝对路径>

    ## 上下文
    - 实施工作路径: 项目目录绝对路径 (worktree 绝对路径)
    - 每完成一个 task 的实施和验证, commit git
    - 遵循项目和模块开发规范 (AGENTS.md)
    - <仅在 Plan 之外需要额外强调的事项，无则省略>

    ## 完成标准
    - <简要列出关键验证点>

    ## Task Report
    完成时输出：Goal/Accomplished/Files/Status

**无 Plan 的临时任务**：

    ## 目标
    <一句话>

    ## 上下文
    - 项目路径: /path/to/file

    ## 步骤
    1. 读取相关文件
    2. 修改文件
    3. 运行验证

    ## 完成标准
    - 功能验证通过

    ## Task Report
    完成时输出：Goal/Accomplished/Files/Status

**原则**：有 Plan 时 Plan 是单一信息源，prompt 不重复 Plan 内容。

### 委派 prompt 必含项

每次委派 fae 执行 Plan Task 时，prompt 末尾必须附加：

    完成后在 Plan 文件中编辑对应 Task 的 Done checkbox（- [ ] → - [x]），Plan 文件路径：<绝对路径>
    禁止修改 Plan Status

缺少此指令 = fae 不会主动更新 Plan，导致 Done 全部遗漏。

---

## 常见错误 TOP 5

| Error | 原因 | Fix |
|-------|------|-----|
| `missing Design` | 跳过了 Design 字段 | 补 `**Design**:` + 实施方案 |
| `TDD=true requires Behavior` | 有 TDD 标记但没写 Behavior | 补 `**Behavior**:` + 输入→输出映射 |
| `Changes must not use checkbox` | Changes 用了 `- [ ] Step N:` | 改为编号列表 `1. 2. 3.` |
| `Agent Verification: no executable commands` | AC 写了纯描述 | 改为 `` `rg -c 'pattern' file` ≥ 1 `` 格式 |
| `placeholder: 'TBD'` | 残留占位符 | 替换为实际内容或删除该行 |

---

## 验证与推进

```bash
flow.sh plan check <plan-name-or-path>
```

- 先 `--check`，再 `approve`
- `approve` 不是第一次检查，而是进入"等待用户评审方案"的节点
- 如果 `approve` 被校验拦下，修好 Plan 后重新执行 `approve`

---

## 分支归属详细说明

Plan 在不同阶段归属于不同分支。

### 阶段归属

| 阶段 | 归属分支 | Plan 状态 | 说明 |
|------|---------|----------|------|
| `planning` | 集成分支（main 或 space/<name>） | `planning` | Plan 基线在集成分支上提交 |
| `approve --confirm` | 集成分支 → 创建 feature 分支 | `executing` | 先在集成分支提交 executing + Worktree 元数据，再创建 worktree |
| 实施（executing） | feature 分支 | `executing` | 实施在 feature 分支的 worktree 中进行 |
| `complete` | feature 分支 | `verifying` | Plan-only 提交活动 Plan（脏实施树报错退出） |
| 用户验证 | feature 分支 | `verifying` | 用户在 feature 分支上验证实施结果 |
| `verify --confirm` | 集成分支 | `done` | Plan-only 提交到集成分支 |
| `archive` | 集成分支 | 归档 | 移至 done/，清理 worktree |

### Plan-only commit 原则

生命周期脚本只提交 Plan 状态变更，不提交实施代码。代码提交由实施 agent（fae）负责。脚本在遇到脏实施树时报错退出，而非代为提交代码。
