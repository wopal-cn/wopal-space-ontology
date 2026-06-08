

# WopalSpace Ontology

WopalSpace 灵魂、规约与能力基因工具包 — Agent 开发规范、规则体系、技能与工作流。

## 项目定位

WopalSpace Ontology 是一个面向 AI Agent 软件开发的工作空间框架，提供了：

- **Agent 体系**: 多种专业化 Agent（wopal 主控、rook 审查、fae 执行、translator 翻译）
- **技能体系**: 开发、审查、自动化等各类技能
- **命令体系**: Issue/Plan 驱动的开发工作流
- **规则体系**: 代码规范、记忆管理、业务规则
- **插件体系**: wopal-plugin 核心插件（记忆、任务、通知）
- **模板体系**: 标准化的文档模板

## 核心工作流

### Issue / Plan 驱动开发

```
planning → executing → verifying → done
```

主要命令：
- `issue create` - 创建 Issue
- `plan` - 创建 Plan
- `approve` - 审批 Plan 进入执行
- `complete` - 标记任务完成
- `verify` - 用户验证
- `archive` - 归档

### 子 Agent 协作

通过 `wopal_task` 工具启动子任务：
- `wopal_task` - 启动任务
- `wopal_task_output` - 查看状态
- `wopal_task_reply` - 通信
- `wopal_task_abort` - 中止
- `wopal_task_finish` - 终结

## 目录结构

```
├── agents/              # Agent 灵魂定义
├── commands/           # 命令规范
├── rules/              # 开发规则
├── skills/             # 技能定义
│   ├── agents-collab/  # Agent 协作
│   ├── dev-flow/       # 开发流程
│   ├── df-plan-review/
│   ├── df-implement-review/
│   └── ...
├── plugins/            # 插件
│   └── wopal-plugin/  # 核心插件
├── docs/               # 文档
├── scripts/           # 脚本工具
└── templates/          # 模板
```

## 快速开始

### 初始化空间

```bash
/init
```

### 创建 Issue

```bash
issue create --title "feat(scope): description"
```

### 创建 Plan

```bash
plan <issue_number> --type feature
```

### 审批执行

```bash
approve <issue_number> --confirm
```

### 完成验证

```bash
verify <issue_number> --confirm
complete <issue_number> --pr
```

## 核心能力

### 记忆系统

- 自动蒸馏会话记忆
- 向量检索
- 记忆分类（Profile/Preference/Knowledge/Fact/Gotcha/Experience/Requirement）

### 任务管理

- 子会话生命周期
- 状态通知
- 上下文压缩
- 并发控制

### 规则注入

- 关键词匹配
- Agent 作用域
- 自动加载

## 开发规范

详见 [AGENTS.md](./AGENTS.md)

## 相关文档

- [SKILL.md](./skills/dev-flow/SKILL.md) - 开发流程技能
- [agents/wopal.md](./agents/wopal.md) - 主控 Agent 定义
- [plugins/wopal-plugin/AGENTS.md](./plugins/wopal-plugin/AGENTS.md) - 插件开发规范

## License

MIT