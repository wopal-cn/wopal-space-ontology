---
name: space-master
description: |
  WopalSpace 空间的根技能与总纲。空间的一切能力——如何运行、如何配置、如何编写命令/规则/技能/模板——都定义在本体（ontology）仓库中，经由中央能力池分发给空间，空间进化通过 space sync 回流。

  必须加载的场景：
  - 空间结构维护：space init/status、.wopal 目录结构、装配模型、空间如何运行与配置
  - 空间能力编写：命令、规则、技能、模板的编写与修改规范
  - AGENTS.md 编写：创建或更新项目级/目录级 AGENTS.md
  - README 编写：创建或更新项目级 README.md
  - 技能生命周期：安装、扫描、移除
  - 意图不明确、不确定用哪个流程/技能时，作为总纲路由到正确技能

  本体维护与进化由 `ontology-evolution` 技能执行，不由本技能执行：本体仓库操作（update、sync、capability list、contribute、PR）直接加载 `ontology-evolution`——本技能只做路由，无需同时加载两者。

  [CRITICAL] 涉及 ontology 仓库协作（update/sync/PR）时，即使用户未明确说"上游同步"，也必须加载 `ontology-evolution`。
---

# space-master

负责 Wopal 的流程选择、场景路由、Ontology 本体维护、AGENTS.md 维护和技能生命周期管理。

---

## 技能使用场景

空间内的技能各司其职。按场景选择，不叠加加载：

| 场景 | 加载 | 要点 |
|------|------|------|
| 开发/修复/重构（Issue/Plan 驱动） | `dev-flow` | 默认开发流程；任务走其状态机（planning → reviewing → executing → verifying → done） |
| 本体维护（实例更新、空间对齐、能力装配、贡献） | `ontology-evolution` | 本体仓库操作一律直接加载该技能；本技能只做路由 |
| 本体能力进化（`.wopal/` 下的 skills、rules、agents、commands、plugins、assembly） | `ontology-evolution` | 对象判据：本体能力资产走本技能；`projects/` 下的代码仓库走 `dev-flow` |
| 委派任何子 Agent（fae/rook/wsf-* 等所有类型） | `agents-collab` | 委派前必须加载；覆盖委派工具 API、任务生命周期、双向通信、进度监控与恢复 |
| 创建/修改/评估技能 | `skill-creator` | 新建、编辑或评估技能必须加载；含描述优化与评估流程 |

本技能直接承担 WopalSpace 的空间治理工作，无需路由：

- **AGENTS.md 维护**：创建/更新项目级或目录级 AGENTS.md——规则审计、内容边界、工作流
- **README 维护**：创建/更新项目级 README.md——面向人类的项目入口文档，按空间能力条件性对齐文档集
- **技能维护**：技能生命周期——安装、扫描、移除

---

## 本体维护

本体维护与能力进化由 **`ontology-evolution` 技能**执行——任何本体仓库操作（实例更新、空间对齐、能力装配、上游贡献）一律直接加载该技能，并按其维护协议（Maintenance Protocols）章节执行。无需同时加载本技能。

该技能是唯一规范单点——命令面、状态解读、双通道与上行闸、执行口径、贡献范围判定。本技能不承载任何维护协议。

## AGENTS.md 维护

创建或更新项目级/目录级 `AGENTS.md` 时，按以下规范开展工作：

1. **规则审计先行**：更新现有 `AGENTS.md` 前，必须逐条审计现有规则（「规则审计」判据）：
   - **删**：代码已删除 / 结构自动保证（单一真相源）/ 只是设计细节、不含可执行约束（长期"工作约束"即使 DESIGN 有描述也要精简保留）/ 纯实现事实
   - **留**：安全边界（删除范围、凭证单写入口）、行为约束、长期工作约束（日志、输出/路由、宿主/发布/DSH、测试与验证、编码纪律）、`Code Review Rules` 章节（标题原样保留，内容照常审计）、User-Supplied Rules
   - **改**：目录描述过时、与设计文档机制冲突、中英版本漂移
2. **更新前出计划**：展示审计分类结果（保留/删除/修正 + 理由）+ 拟变更清单，获用户确认后才动笔
3. **先中文审核版，后英文正式版**：用户确认审核版后，再同步英文版
4. **Code Review Rules 章节**：代码类项目的 `AGENTS.md` 必须包含 `## Code Review Rules` 章节——新建项目按模板生成，更新项目时原样保留（禁止删除、改名、翻译标题；纯文档目录可省略）。章节内只写方向性骨架：通用审查方法引用空间已装配的审查技能、报缺陷边界、项目特有检查点。仅可复用模板不得写入任何具体项目的规则内容
5. 不更新是默认且合法的结果——只有代码、测试、配置和既有文档无法承载边界时才更新

**完整规范**（内容边界、工作流、质量清单）见 `references/agents-md-maintenance.md`。命令 `/cupdate-agent-rules` 仅作入口引导，不承载规范。

## README 维护

创建或更新项目级 `README.md` 时，按以下规范开展工作：

1. **能力感知先行**：读取 `.wopal-space/space-meta.json` 的空间类型（`type`）与已装配技能（`capabilities.skills`）；元数据缺失时探测文件系统（是否存在 `docs/`、`DESIGN.md`、`AGENTS.md`）。文档集对齐仅在空间装配了相关文档集技能时执行，未装配则跳过，绝不假设。
2. **更新前出计划**：展示完整优化方案（目标文件路径、一句话项目描述、模块/核心命令概览、增删改章节、规范文档引用），获用户确认后才动笔
3. **先中文审核版，后英文正式版**：用户偏好语言非英文时，先生成 `README.<locale>.md` 供审核；确认后更新正式英文 `README.md`
4. **命令必须验证**：安装/运行/开发命令一律从 package 与配置文件核实，绝不猜测

**完整规范**（能力感知、模板、质量清单）见 `references/readme-maintenance.md`。命令 `/cupdate-readme` 仅作入口引导，不承载规范。

---

## 技能维护

### 生命周期

```
找 → 下 → 扫 → 装 → 评 → 删
```

```bash
wopal skills find "<query>"              # 搜索注册表
wopal skills download owner/repo@name    # 下载到审核区
wopal skills scan <name>                 # 安全扫描（强制步骤）
wopal skills install /path --force       # 安装到运行时
wopal skills remove <name> --force       # 从空间移除
```

### 技能规则

1. **安装前必须扫描。** `wopal skills scan` 是强制步骤——检查恶意代码、数据外泄、非法触发器。禁止跳过。
2. **变更后必须验证。** 安装或编辑后：`ls -la .wopal/skills/<name>/SKILL.md` 和 `wopal skills list`。
3. **创建/修改走 `skill-creator`。** 新建或编辑技能必须加载 `skill-creator` 技能。

---

## 参考资料

技能正文覆盖核心要点。遇到故障或边缘场景时，**必须阅读参考文档**——完整协议在其中：

| 文档 | 内容 |
|------|------|
| `references/skills-maintenance.md` | 完整生命周期细节、安全扫描检查项、质量评估标准 |
| `references/agents-md-maintenance.md` | AGENTS.md 维护完整规范：内容边界、规则审计判据、工作流、质量清单 |
| `references/readme-maintenance.md` | README 维护完整规范：能力感知、语言版本规则、模板、质量清单 |
