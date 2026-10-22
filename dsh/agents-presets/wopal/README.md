# wopal — 全能巫师（dsh preset 样例）

**来源灵魂**: `.wopal/agents/wopal.md`（persona 完整复刻其正文）
**角色**: 万能巫师，理解意图、调动所有能力与技能、委派协作、自我规划。
**位置在意图翻译表**: `AGENT-TOOL-MAP.review.md` 第 4.1 节

## 装了哪些工具（为什么）

| 工具组 | 对应权限 | 说明 |
|---|---|---|
| 文件 + shell + 技能(全) + ask + todo + plan + 委派 + goal | 近乎全开 | wopal 权限几乎无 deny，dsh 给最全工具集，作为编排者 |

fae 是它的执行者、rook 是它的审查者——wopal 通过委派组把工作发出去，自己只规划与验证（见 persona Phase 3/4）。

## persona 裁剪点

- **[CSS-1]** Phase 7 `memory_manage command=search` → 改为「主动召回记忆/空间上下文」原则。原因：dsh 无 memory_manage 工具。

## 安装与运行

本目录是生成源，DSH 0.2 运行时加载 `@wopal/dsh-presets` 标准 bundle 中的 `wopal/preset.patch.yml`。生成、安装（`ellamaka dsh plugin --profile web add <agents-presets 目录>`）、配置及回退步骤见 [bundle 说明](../README.md)。修改后重新生成、安装，在新会话验证；旧 `.agent-presets` 软链不再是加载入口。

wopal 技能全开，`skill-filesystem.config.customSkillDirs` 应指向空间技能根（含 agents-collab / space-master 等）——当前样例留空，需按安装时技能根实际路径补齐。

> **skills/ 目录说明**：`skills/` 保存随 wopal preset 发售的两个技能（editing-cordis-compositions、cordis-plugin-development）。每个技能正文开头有「dsh in ellamaka (WopalSpace deployment constraints)」约束节，记录本部署对官方 dsh CLI 约定的覆盖（DSH_HOME、~/.dsh、官方 preset 安装路径等）。本目录由 git 版本管理，运行时侧不再回写。
