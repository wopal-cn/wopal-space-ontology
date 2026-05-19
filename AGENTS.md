# WopalSpace ontology — 本体能力锻造层

> **定位**：WopalSpace 的 Agent 能力研发中心。

---

## 核心能力：技能（Skills）

技能是本项目的**首要产出**，是可复用、可分发、可版本化的 Agent 能力单元。

### 技能开发规范

#### 目录结构

```
skill-name/
├── SKILL.md          # 必须：YAML frontmatter + Markdown 指令
├── scripts/          # 可选：可执行脚本（确定性/重复任务）
├── references/       # 可选：按需加载的参考文档
└── assets/           # 可选：模板、图标等静态资源
```

#### 渐进式披露（三级加载）

| 层级 | 内容 | 限制 | 说明 |
|------|------|------|------|
| 元数据 | name + description | ~100 字 | 始终可见，决定是否触发 |
| 主体 | SKILL.md body | <500 行 | 触发后加载，核心流程 |
| 资源 | scripts/references/assets | 无限制 | 按需读取或执行 |

**原则**：主体超 500 行时拆分到 references/，SKILL.md 中明确指引。

#### Description 编写

**是主要触发机制**，需包含：
1. 技能做什么
2. 何时使用（具体场景/用户短语）
3. 适当"pushy"——宁可多触发也不要漏触发

**示例**：
```yaml
description: |
  Compress official documentation into concise AI references. ⚠️ MUST use when user requests:
  (1) Documentation compression or condensing, (2) Creating AI-friendly reference materials,
  (3) Reducing token usage for large documentation, (4) Extracting technical specifications.
  🔴 Trigger even when user does not explicitly mention "AI reference" if the task involves
  documentation compression or spec extraction.
```

**🚫 禁止包含**：
- 详细执行步骤（属于 SKILL.md body）
- 代码示例或模板（属于 scripts/ 或 assets/）
- 框架/平台特定细节（属于 references/）
- 模糊触发条件（如"相关场景"、"类似任务"）

#### SKILL.md 编写

**结构**：
1. 标题 + 一句话定位
2. 核心流程（步骤化）
3. 输出格式（模板/示例）
4. 注意事项（边缘情况）

**风格**：
- 用祈使句（"执行 X"，而非"你应该执行 X"）
- 解释 **why** 而非堆砌 `MUST`/`ALWAYS`——LLM 理解原理后更可靠
- 避免强制固定步骤顺序，保持适应不同场景的灵活性
- 包含真实示例，展示输入/输出

**🚫 禁止包含**：
- 恶意代码、exploit、数据窃取逻辑
- 过度具体的硬编码参数（应提取到 references/ 或配置文件）
- 冗余的背景介绍（用户不需要知道技能的历史）
- 技能设计原理、优化过程、版本历史等元信息（属于开发者文档，非 Agent 指令）

**必须显式声明**：
- 依赖的其他技能或工具（如"依赖 `skill-master` 技能，执行前必须加载"）
- 必需的环境变量或外部配置
- 与其他技能协作时的调用顺序

#### 质量验证

1. **设计 2-3 个真实测试用例**——用户实际会说的 prompt
2. **迭代循环**：执行 → 评估 → 改进 → 重复
3. **观察重复工作**：多测试用例出现相同脚本 → 提取到 scripts/

#### 资源引用

在 SKILL.md 中清晰指引何时读取：
```markdown
## 参考
- 云平台部署参数见 `references/aws.md`（仅 AWS 场景读取）
- API 规范见 `references/api-schema.md`
```

大参考文件（>300 行）包含目录，便于定位。

---

## 插件开发

**详细规范**：`wopal-plugin/AGENTS.md`

插件是 TypeScript 编写的 OpenCode 运行时扩展，提供：

| 能力 | 描述 |
|------|------|
| **规则注入** | 发现规则文件 → 匹配条件 → 注入系统提示词 |
| **任务委派** | 非阻塞子会话启动、状态监控、双向通信 |
| **记忆系统** | LanceDB 存储、语义检索、蒸馏注入 |
| **上下文管理** | 会话摘要、session title 管理、上下文压缩（由 space-master skill 控制策略） |

---

## 资源层次与归属

### 源码结构

> `.wopal/` 是 `sampx/wopal-space-ontology`（`wopal-cn/ontology` 的 fork）的 git worktree，直接编辑即生效。

```
.wopal/
├── skills/              # 所有技能统一存放
├── commands/            # 命令定义（Agent 通过 permission 控制可见性）
│   ├── *.md             # 共享命令
│   └── wopal/           # Wopal 专属命令
├── rules/               # 规则定义
│   ├── *.md             # 共享规则
│   └── wopal/           # Wopal 专属规则
├── agents/              # Agent 灵魂定义（wopal.md, wopal-cn.md, fae.md, fae-cn.md）
├── wopal-plugin/        # 空间唯一插件（规则注入、任务委派、记忆、上下文管理）
└── config/              # 空间本地配置（不提交到 git）
```

### Agent 技能权限

Agent 通过 `permission.skill` 配置控制技能可见性：

```yaml
# Fae 示例：仅允许特定技能
permission:
  skill:
    "*": deny
    project-worktrees: allow

# Wopal 示例：允许所有技能
permission:
  "*": allow
  project-worktrees: deny

# Rook 示例：仅允许审查技能
permission:
  skill:
    "*": deny
    df-plan-review: allow
    df-implement-review: allow
```

**原则**：技能统一存放在 `skills/` 目录，通过 Permission 实现 Agent 间隔离。修改 `permission.skill` 即可调整 Agent 可用技能。

---

## Agent 生态

### Wopal（主控 Agent）

**定位**：IT 女巫师，研究、方案制定与执行编排的负责人。

**文件位置**：
- 中文灵魂层：`agents/wopal-cn.md`
- 英文灵魂层：`agents/wopal.md`

**职责**：
- 研究、方案设计、任务拆解
- 委派 fae 实施、委派 rook 审查
- 验证产出、推进流程、决策权衡
- 与用户沟通、管理上下文

**协作关系**：主控中枢，所有子代理的委派者。

### fae（执行 Agent）

**定位**：敏捷精灵，专注于实施执行，不负责规划与审查。

**文件位置**：
- 中文灵魂层：`agents/fae-cn.md`
- 英文灵魂层：`agents/fae.md`

**职责**：
- 执行 Wopal 委派的实施类 Task
- 文件编辑、构建运行、测试执行、git 操作
- 返回可验证的执行结果（文件路径、命令输出）

**只读边界**：无。fae 可以修改文件、运行命令、提交代码。

**协作关系**：Wopal 的执行者，rook 的审查对象。

### rook（审查 Agent）

**定位**：职业质疑者，只读审查代理，Plan 与代码质量的守门员。

**文件位置**：
- 中文灵魂层：`agents/rook-cn.md`
- 英文灵魂层：`agents/rook.md`

**专属技能**：
- `df-plan-review` — Plan 质量审查（目标覆盖、任务完整性、依赖正确性、验证可证伪性）
- `df-implement-review` — 代码质量审查（目标验证、bug/security/debt 扫描、测试质量审计）

**职责**：
- Plan 审查：审核方案是否真的能达成目标（不是检查模板是否填完）
- 代码审查：复核 fae 实施结果是否让目标成为事实（不是检查代码是否跑起来）
- 返回结构化报告：PASS / REVISE / BLOCK + Blocker/Warning/Info + 证据锚点

**只读边界**：
- **绝对禁止**：写入文件、修改代码、运行构建/测试、提交 git、修复 bug
- **唯一输出**：通过会话文本输出结构化审查报告

**协作关系**：
- Wopal 在关键节点委派 rook（Plan 写完后、fae 实施后）
- rook 审查 fae 产出，返回判定
- Wopal 根据判定决定推进或要求 fae 修正
- fae 未经 rook 审查不得进入 complete

**委派时机（强制）**：
1. Plan 写完后（approve 前）— 先审方案质量
2. fae 关键实施波次后 — 复核代码质量
3. fae 最终交付后（complete 前）— 完整审查

**修订循环上限**：同一 Plan 或实现最多 3 轮 REVISE/BLOCK 循环，超过 3 轮由用户裁决。

---

## 运行时验证要求

OpenCode / ellamaka 的 agent 与 command 在启动时缓存加载。新增 agent 或 skill 后：

**必须重启运行时**才能稳定识别：
- 新增 agent（如 rook）→ 重启后才能委派
- 新增 skill（如 df-plan-review、df-implement-review）→ 重启后才能触发

**验证步骤**：
1. 重启 OpenCode 运行时
2. 让 Wopal 委派 rook 做一次 Plan 审查
3. 观察 rook 是否返回 PASS/REVISE/BLOCK 结构化结果
4. 让 Wopal 委派 rook 做一次代码审查
5. 观察报告是否包含概要、等级统计、证据锚点、修复建议


