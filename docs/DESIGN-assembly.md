# DESIGN — Assembly Model

> **Status**: Active
> **Updated**: 2026-09-27
> **Parent**: `./DESIGN.md`（ontology overall design: Module Architecture section）
> **Parent Architecture**: `../../docs/products/wopal-space/DESIGN.md`
> **Parent Product**: `../../docs/products/wopal-space/PRD.md`

---

## Assembly Definitions vs Capability Assets

装配相关的定义集中在 `.wopal/assembly/`，与可被装配的能力资产在根目录就区分开：

```
.wopal/
├── assembly/                  # 装配定义
│   ├── archetypes/            # 类型装配单
│   │   ├── coding.yaml
│   │   └── content.yaml
│   ├── schemas/               # 空间骨架声明
│   │   ├── coding-space-schema.yaml
│   │   └── content-space-schema.yaml
│   └── templates/             # 渲染素材
│       ├── STRUCTURE.md
│       ├── REGULATIONS.md
│       ├── root-AGENTS.md
│       └── memory/
├── agents/                    # 能力资产
├── skills/
├── rules/
├── commands/
├── plugins/
├── scripts/
└── config/                    # 运行配置（settings 类）
```

装配定义与能力资产是两个层级的语义：装配定义回答「空间该长什么样、该装什么能力」，能力资产是「可被装配的武器本身」。

装配定义不物化进空间：空间只承载物化结果（能力资产与 `.wopal-space/` 运行态），装配源头保留在中央仓库。CLI 初始化时从中央仓库读取装配定义，按定义物化到空间。

## Archetype Manifest

装配单声明一个空间类型的全部装配决策，是空间初始化的唯一依据：

```yaml
# 示例: .wopal/assembly/archetypes/coding.yaml
version: 1
type: coding
description: 全栈工程研发空间

# 空间骨架。省略时按约定取 <type>-space-schema.yaml
# schema: coding-space-schema.yaml

# 该空间挂载的 Agent（四维核心角色跨类型常驻，不随类型变化）
agents:
  - wopal.md
  - fae.md
  - rook.md
  - maka.md

# 该空间所需技能（目录形态，无扩展名）
skills:
  - dev-flow
  - agents-collab
  - git-worktrees

# 该空间加载的规则（文件须显式扩展名）
rules:
  - typescript.md
  - python.md
  - business-rules.md

# 该空间加载的命令（文件须显式扩展名；`wopal`、`wopal/`、`wopal/*` 等价声明整个命名空间）
commands:
  - init.md
  - commit.md
  - review.md
  - wopal/memo.md

# 该空间加载的插件：键 = settings 顶层段名，值 = 装配进该段的插件名。
# 段名是开放的装配类目：今天 ellamaka / tui 两段，将来新的消费运行时
# 加一个键即可（如 dsh），物化规则不变。
plugins:
  ellamaka:
    - wopal-plugin
    - dsh-adapter
  tui:
    - tui-ellamaka

# 类目之外的任意目录与文件：通用路径装配（见 Generic Path Assembly）
paths:
  - dsh                    # 整个 dsh 目录（dsh/ 与 dsh/* 等价）
  # - docs/notes.md        # 单文件须显式扩展名
  # - scripts/emt.noext    # 无扩展名文件用 .noext 标记
```

装配单覆盖五类可装配能力：`agents`、`skills`、`rules`、`commands`、`plugins`，以及类目之外资产用的 `paths` 段。前四类按**能力引用**声明（语法见 Capability Reference Syntax and Resolution）；`plugins` 按「settings 段名 → 插件名列表」的映射声明，键是装配目标段名（`ellamaka` 段对应引擎的 server 插件装配，`tui` 段对应 TUI 插件装配），值是物化时在能力资产目录下解析为对应资产、并写入该段 `plugin` 数组的插件名。物化规则对每个段键一致：`settings[<段>].plugin += ../plugins/<插件名>`。`paths` 段声明五类之外的任意目录与文件，语法与能力引用一致（无类目前缀）。

类目之外的资产由 `paths` 段装配；新的类型化扩展类目（如 `scripts`）在出现真实需求时按后续演进定义。

## Space Schema

装配单通过 `schema` 字段选择空间骨架。骨架声明该类型空间的结构：需要哪些运行时文件、哪些目录、哪些空间级文件。

`schema` 字段可省略，此时按约定取同名骨架 `<type>-space-schema.yaml`。约定覆盖多数场景，显式声明服务于复用既有骨架的定制类型——例如行业类型放置自己的装配单、但沿用 `coding` 的空间结构时，写入 `schema: coding-space-schema.yaml` 即可。

```yaml
# 示例: .wopal/assembly/schemas/coding-space-schema.yaml
version: 1
runtime:
  path: .wopal-space
  files:
    - template: STRUCTURE.md
      target: STRUCTURE.md
    - template: REGULATIONS.md
      target: REGULATIONS.md
    - template: memory/USER.md
      target: memory/USER.md
  dirs:
    - path: memory/diary
      keep: [.gitkeep]
    - path: logs
    - path: .tmp
    - path: INBOX
space:
  files:
    - template: root-AGENTS.md
      target: AGENTS.md
    - template: gitignore
      target: .gitignore
  dirs:
    - path: projects
    - path: docs
```

`runtime` 描述空间运行态（`.wopal-space/`）结构，`space` 描述空间根目录结构。`files` 声明「模板素材 → 目标路径」的映射，`dirs` 声明需要创建的目录。

不同类型的空间结构不同：coding 空间需要 `projects/`，content 空间需要 `contents/`。骨架按类型选择，使空间结构成为类型差异的一部分。

模板素材统一存放于 `assembly/templates/`，多套骨架共用。骨架只声明映射关系，不重复承载素材内容。

### Schema Consumption Rules

CLI 读取骨架后按以下规则消费：

- `runtime.path` 指向 `.wopal-space/`，其中 `files.target` 是相对 runtime path 的路径。
- `space.files.target` 是相对 space root 的路径。
- `template` 从 `assembly/templates/` 读取。
- `keep` 表示创建目录后可写入 `.gitkeep` 保留空目录。
- 必需模板缺失时，CLI 以 fail fast 方式报告缺失模板与 ontology source/path，并保持 space registry 与 active space 状态不变。

骨架决定该类型空间的最小结构。扩展目录（如 `labs/`、`external/`）由用户创建后经 `/init` 扫描写入实例 `STRUCTURE.md`。

## Materialization Flow

空间初始化时，CLI 依次执行：

1. 读取 `.wopal/assembly/archetypes/<type>.yaml`，得到装配决策
2. 按 `schema` 字段读取 `.wopal/assembly/schemas/<schema>.yaml`，得到空间骨架
3. 按骨架创建目录、渲染模板文件到空间根与 `.wopal-space/`
4. 按装配单（能力类目与 `paths` 段）通过 Git sparse-checkout 在 `<space>/.wopal/` worktree 内物化对应资产
5. 写入空间根仓库的装配状态记录，并仅提交 CLI 管理的 `space-meta.json`

空间内正常修改与提交，进化经 `space sync` 汇入 local main。已有空间重复运行 `space init` 时，以当前空间分支的装配单和空间装配选择重装配；main 已更新而空间分支未接收时先完成显式 `space sync`。重复物化保留用户已编辑内容，只补齐缺失项和安全维护 CLI 拥有的规则，无变化时不写入状态或生成 Git 提交。

### Capability Reference Syntax and Resolution

装配单与 `space capability` 用**能力引用**声明能力：`<kind>:<path>`——类目（`agent|skill|rule|command|plugin`）加仓库内相对路径。解析是**严格映射**：形态由结尾机械判定，逐项检查存在性；不隐式补扩展名、不做候选探测。

| 形态 | 写法 | 映射目标 |
|------|------|----------|
| 单文件 | `<path>.<ext>`（扩展名显式，不限类型） | `<cat>/<path>.<ext>`，须存在且为文件 |
| 无扩展名文件 | `<path>.noext`（保留标记） | `<cat>/<path>`，须存在且为文件 |
| 文件集合 | `<dir>/*.<ext>`（含 `*.<noext>`） | `<cat>/<dir>/` 下**一级**、对应形态的文件（不递归） |
| 目录 | `<path>`、`<path>/`、`<path>/*`（三者等价） | `<cat>/<path>/`，须存在且为目录；物化整棵子树 |

- **尾 `/` 是目录的权威标记**：名字自带扩展名形态的目录（如 `v1.2/`）须带 `/`，才能与同名文件区分。
- **通配符只能出现在末段**且只取一级子项；不带扩展名的 `*`（`<dir>/*`）是目录的等价写法，不是文件集合。
- **路径必须是仓库相对路径**：禁止前导 `/`、`.`/`..` 段、反斜杠与空段；扩展名不设白名单，任意文件都可装配。
- **`.noext` 按末尾剥除一层解析**；真实名为 `x.noext` 的文件用 `x.noext.noext` 表达。
- 目录引用规范化存储：`<path>/`、`<path>/*` 归一为 `<path>`；末段含 `.` 的目录名保留尾 `/` 消歧。
- 任一引用无法解析为存在的文件或目录时 fail fast，报告引用、类目与 ontology source，并给出可操作提示（缺扩展名 → 补 `<ext>` 或 `.noext`；指向目录 → 补 `/`）。
- 解析只产出仓库路径；消费方从路径派生运行时注册名的规则由各自加载器定义，不属于装配契约。

### Generic Path Assembly

`paths` 段在五类能力之外声明任意目录或文件，值是无类目前缀的仓库相对路径，形态语法与能力引用一致：

| 形态 | 写法 | 例 |
|------|------|-----|
| 目录（含子树） | `<path>`、`<path>/`、`<path>/*` | `dsh` |
| 单文件 | `<path>.<ext>` | `docs/notes.md` |
| 无扩展名文件 | `<path>.noext` | `scripts/emt.noext` |
| 一级文件集合 | `<dir>/*.<ext>` | `assets/*.json` |

- **物化**：与能力引用共用同一条 sparse 机制，原样落到 `<space>/.wopal/<path>`。
- **校验**：条目须存在于当前树；不得与保留目录（`assembly/`、`config/`、`docs/`）、仓库根文件或五类能力类目目录（`agents/`、`skills/`、`rules/`、`commands/`、`plugins/`）重叠——冲突拒绝并提示改用对应类目。
- **删除与重命名**：整条路径的删除须同步清理装配单引用（防悬空）；条目内部文件的增删改按普通内容变更处理。
- **空间选择**：`path:<ref>` 与能力引用共用 `space capability add/remove --local`。`path:dsh` 指整个目录，`path:assets/catalog.json` 指单文件；无需额外的 `file:` 类别。共享池资产可由 `include` 额外挂载，装配单的完整路径声明可由 `exclude` 在本空间停用。`private` 保留给明确登记的未提交、未跟踪内容。装配单声明目录时，其内部文件增删改仍是内容变更，不生成逐文件选择。选择的最小单位是完整声明项或与既有声明不重叠的独立资产；重叠、父子包含与根级文件/保留目录引用在写入前拒绝。
- **运行时消费**：不承诺被任何运行时自动加载；消费方式由使用方自行约定。

### Sparse Materialization Mechanics

物化使用 Git `sparse-checkout`（non-cone 模式，支持文件级路径），机制约束如下：

- **始终装配清单（每个空间都有）**：以下内容无条件包含在稀疏范围内、本地不能停用/卸载；其中前几项缺失即破坏装配/运行/演化闭环。完整清单：

  | 成员 | 说明 |
  |------|------|
  | `assembly/archetypes/<type>.yaml` | 装配定义 |
  | `assembly/schemas/<schema>.yaml` | 装配定义 |
  | `assembly/templates/` | 装配定义 |
  | `.gitignore` | 装配安全：不带上它，空间里的 `.env` 会被误提交 |
  | `AGENTS.md`、`AGENTS.zh-CN.md` | 本体维护的项目规范 |
  | `README.md`、`README.en.md`、`LICENSE` | 本体内容的说明书与授权，随内容分发 |
  | `config/`、`docs/` | 运行与设计契约 |

  其余根条目各归其位：`.env.example` 走专用通道（`space init` 由它给空间种子出 `.wopal/.env`，模板本身不物化）；`.skill-lock.json` 是技能安装记录，本地忽略、不提交、不随装配；`package.json` 被 git 忽略，本体根目录不应存在该文件。扩展类目（`scripts/` 等）、能力资产和空间私有装配状态各归其位。
- **`.gitignore` 必须物化**：gitignore 规则只对工作区内存在的 `.gitignore` 生效。它若落在稀疏范围外，磁盘上不存在该文件，规则失效——用户放入的敏感文件（如 `.env`）会被当作普通游离文件纳入版本控制。这是安全约束，不是便利性选择。
- **稀疏范围是白名单**：不在范围内的文件不会出现在磁盘上。装配区内的文件即该空间当前拥有的能力，运行时按目录扫描加载，无需读取装配记录做过滤。
- **有效范围**：稀疏范围由当前空间分支的类型装配单（能力类目与 `paths` 段）、空间级能力与 `path:` 选择，以及尚未跟踪的私有内容和游离文件保盘路径共同确定。选择只影响本空间物化；已提交内容随 Git 进入 local main，其他空间仍须由其装配声明或本地选择决定是否物化。下行重算以合并后的同一棵树解析所有引用；冲突、悬空或能力缺失先拒绝，不能清扫私有内容。
- **共享新增**：新内容通过空间分支提交。新增整项资产时由提案/集成上下文明确归属；类型默认挂载则同一变更更新装配单，仅当前空间挂载则登记完整能力或 `path:` 身份的 `include`。两种情况下内容都可上行，空间选择不是上行闸的保护对象。
- **私有能力**：未提交的私有内容须显式登记完整能力身份、保留在本空间，且不得与本体 Git 树中已有的同名能力重叠。未登记的未跟踪文件在同步期间仅受保盘保护，不被自动收养；私有能力与上游新增能力同名时同步拒绝并给出人工选择，不覆盖文件。
- **空间卸载**：显式 `space capability remove <kind>:<ref> --local` 记录或撤销完整资产的本地选择；`add --local` 恢复挂载。修改、删除已装配资产内部文件都是 Git 内容变更，不能被推断为卸载。共享删除完整资产时须满足全部适用装配单的引用完整性，否则拒绝提交或同步。

### Cross-Space Path Integrity

`paths` 是类型默认声明，不是普通目录扫描清单。已声明目录内部文件的增删改作为 Git 内容变更进入 local main；其他声明同一路径的空间在各自 sync 后接收。整条路径删除须在同一候选树中移除所有仍指向它的装配引用；整条路径重命名须同步更新引用。此规则同样适用于能力目录和单文件。写入、集成与 sync 上行先以候选结果树校验全部适用装配单，再推进 local main；引用形态、碰撞和缺失均是拒绝条件。

其他空间尚未 sync 时，其旧分支上的资产和声明保持配对。下行先预测合并与未跟踪/私有路径碰撞，再以合并后的树及该空间选择计算范围；只有引用校验与索引预检全部通过才推进分支和物化。另一个空间对旧路径的独有修改若与删除或重命名冲突，sync 保持旧状态并报告冲突，绝不自动认领或覆盖。上述常驻内容（根级文件与保留目录）由专用规则管理，不进入通用 `path:` 选择。

## Assembly Facts and Ownership

装配由两类持久事实和 Git refs 共同决定：

| 事实 | 真相源 | 更新者 | 持久性与用途 |
|------|--------|--------|-------------|
| 共享内容与类型默认组合 | 本体 Git 分支中的资产与 `assembly/archetypes/<type>.yaml` | 本体能力编辑与 `space capability` 共享操作 | commit 携带内容差异，`space sync` 上行后在能力池复用 |
| 空间身份与装配选择 | 空间根仓库跟踪的 `.wopal-space/space-meta.json` | CLI init、`space capability --local` 与新增共享资产的集成操作 | 类型、骨架、ontology 来源和能力/`path:` 级选择同文件保存，由 CLI 在实际变更时限定路径提交；其他空间不读此仓库的选择 |

`space sync` 的进度与对齐情况由本体 `main` 和 `space/<name>` refs 的祖先关系计算。上次同步提交可作为本地诊断记录，但不是下行决策输入，也不作为根仓库受跟踪文件的高频字段。状态显示分别报告双向提交差异、稀疏健康、本地挂载与私有内容，不使用一个混合含义的 revision 一致性布尔值。

`space-meta.json` 的最小结构为 `version`、`type`、`schema`、`source.ontology` 与 `include`、`exclude`、`private` 三组规范引用身份（如 `skill:dev-flow`、`path:dsh`）。`include` 挂载未在类型默认组合中的已提交共享资产；`exclude` 仅在本空间停用类型默认的完整声明；`private` 登记明确保留、尚未进入本体 Git 的未跟踪内容。三组互斥，引用以其规范形态校验；`include` 在候选本体树中必须存在，`private` 不得与共享树同名。快照 revision、时间戳和物化能力清单均由 refs、当前装配单及选择计算，不作为持久判定输入。CLI 原子替换文件，状态缺失或损坏时拒绝重算，不用空集合修复。文件入空间根 Git 只备份装配选择；`private` 的实际未跟踪文件须单独导出/备份，元数据提交不代表内容已备份。有效装配按完整资产身份计算：

```text
物化资产 =（当前类型装配单的能力与 paths ∪ include ∪ private）− exclude
```

**本地选择读法**：`include` = 额外挂载（类型默认之外、额外要的共享资产），`exclude` = 本地停用（类型默认之内、本空间不要的），`private` = 私有持有（共享池之外、未提交的内容）。三组均为相对类型默认的**差量**，不是完整清单。内容进入 local main 但仅在一个空间选择挂载，属于**装配隔离**，不是资产保密；不执行 `ontology contribute` 仅阻止向上游传播，不阻止本机其他空间主动挂载。

稀疏范围由有效资产的路径、必要装配定义以及当前未登记未跟踪文件的临时保盘路径派生；状态只持有资产身份，不存资产内部文件路径。`include` 的共享文件即使仅本空间挂载，仍能随空间分支提交进入 local main；`private` 对应内容保持未跟踪，任何写入命令拒绝将它暂存。同步上行前用 Git 的无 rename 路径差异与私有资产根路径交叉检查，阻止手动提交泄漏；`include`、`exclude` 不参与上行闸。

共享内容提交与装配状态调整互不暗示。`space evo commit/integrate` 对已装配目录内部普通文件的新增、修改、删除保留 Git 语义，不逐文件登记装配选择。新建整项能力或类目外资产由提案的 `Assembly Intent` 为每个规范引用明确 `type-default` 或 `space-local` 归属，一次登记完整身份与内容提交；无归属的新资产拒绝自动收养并提示补齐提案声明，即时修复模式只编辑已持有资产。整项共享删除/重命名同时处理全部适用装配单的引用与本空间无效选择，拒绝悬空结果。显式 `remove --local` 才能产生 `exclude`；恢复以完整资产身份匹配。内部文件删除既不能产生 `exclude`，也不能产生私有登记。

CLI 命令在同一操作中维护空间根仓库的 `space-meta.json`：只有状态字节变化才限定路径提交，保留其他已暂存与未提交文件。首次 init 创建尚无提交的根仓库时，CLI 先对新状态文件作 intent-to-add，再仅提交该文件；后续提交不再重复该初始化步骤。根仓库无有效分支、同一状态文件含未受本次操作管理的修改或处于未完成 Git 操作时先拒绝。操作回执分别报告本体内容提交、空间状态提交与各自的同步状态。状态提交不触发网络推送；本体上行由显式 `space sync` 与 `ontology contribute` 持有。空间根仓库的远端发布是独立动作，若提供 CLI 发布入口，须预览将随当前分支一同发布的全部提交，不得声称仅推送状态文件。跨两个仓库和网络不存在单一 Git 原子事务；CLI 在提交前完成预检，在未发布阶段按已记录的旧 refs 和文件内容安全恢复本次写入，已提交或推送的部分失败须明确回执和幂等重试入口，绝不静默覆写并发更新。

未登记的游离文件只在当前同步中得到保盘保护，不被自动登记或提交。私有能力卸载时先把内容安全保留在 CLI 管理的 `.wopal-space/state/held/`，再撤销登记和收窄范围；不隐式删除用户文件。私有能力与本体将引入的同名资产发生碰撞时停止并列出双方路径，用户明确选择保持私有身份或转为共享；任何重算不得默默覆盖私有内容。

### Protected Paths

装配运行所需的结构定义不可缺失：装配单（`assembly/archetypes/`）、骨架（`assembly/schemas/`）、模板（`assembly/templates/`）、仓库根 `.gitignore`、根 `AGENTS.md` 与 `AGENTS.zh-CN.md`（本体维护规范）。这些路径的内容可自由修改并随同步上行，但**删除与重命名**会使空间无法物化。`README.md`、`README.en.md`、`LICENSE` 属始终装配清单但不进入防删集合：其删除是普通内容变更，重跑 `space init` 会补齐缺失的托管文件。`.env.example` 不属于保护集合：它不入装配范围，空间侧的环境契约由 `space init` 种子的 `.env` 实例承载（用户资产，`.gitignore` 覆盖）。

保护机制在写入侧实现，判据是"路径是否落在保护集合内"：

| 操作 | 受保护路径 | 装配单声明的能力路径 | 其他路径 |
|------|-----------|---------------------|----------|
| 修改内容 | 允许，随同步上行 | 允许，随同步上行 | 允许，随同步上行 |
| 删除 | 恢复 | 文件级删除作为共享内容变更；完整能力的本地卸载由显式 `remove --local` 执行 | 正常删除 |
| 重命名 | 恢复 | 按遮蔽旧路径 + 新增新路径处理 | 正常重命名 |

受保护路径的删除或重命名由写入命令在提交前从索引与工作区一并恢复，不产生提交。恢复使用路径级操作（`git restore --staged --worktree <path>`），不触碰用户的其他未提交改动。


## Configuration Layers and Write Authority

三层配置，各司其职：

| 层级 | 文件 | 作用域 | Git 跟踪 | 职责 |
|------|------|--------|----------|------|
| 全局 | `~/.wopal/config/settings.jsonc` | 所有空间 | 否 | 跨空间共享的 provider、model、全局功能开关 |
| 空间级（公共）| `.wopal/config/settings.jsonc` | 当前空间 | 是 | 空间共享的 ellamaka 运行配置，随仓库传播 |
| 空间级（私有）| `.wopal/config/settings.local.jsonc` | 当前空间 | 否（git 忽略）| 覆盖公共默认值的本地开发者配置 |

CLI 只写 `settings.local.jsonc`，永不改写 `settings.jsonc`——后者随 space 分支经 `space sync` 汇入 central main，任何实例相关内容写入都会污染中央能力池。

### Plugin Assembly Layers

插件装配由装配单驱动，空间级配置承载物化结果：

| 类别 | 承载文件 | 分发方式 |
|------|---------|---------|
| 空间插件 | 空间级 `.wopal/config/settings.local.jsonc` | CLI 按装配单生成，git 忽略，可再生 |

共享 `settings.jsonc` 不硬编码插件引用。装配单的 `plugins` 字段是插件声明的唯一真相源：CLI 在 `space init` 与 `space capability add/remove` 时读取装配单，按声明的段把插件引用生成到空间级 `settings.local.jsonc` 的对应段——`ellamaka` 段写 `ellamaka.plugin`（引擎的 server 插件装配），`tui` 段写 `tui.plugin`（TUI 插件装配）。两类装配项由消费方各自装载：引擎按 `ellamaka.plugin` 装 server 插件，TUI 运行时按 `tui.plugin` 装 TUI 插件。该文件可由 CLI 再生——换机器后重新按装配单装配即恢复，因此不进入版本控制。

**插件条目只含路径引用，零内联配置。** 插件引用生成时只写路径（如 `["../plugins/dsh-adapter"]`），不携带 options——条目是纯装配事实，保证可再生。插件的行为配置统一放 settings 的 `wopal.pluginConfig.<插件名>` 节，走配置继承链（用户全局默认 → 空间覆写）。装配单可以为插件声明默认配置（`configDefaults`），CLI 装配时把默认值补丁写进 `wopal.pluginConfig` 节而不是内联进条目——默认值与用户调整都落在继承链上，设置面板与 `wopal config schema` 因此天然覆盖插件配置。

插件在 settings 中的引用使用相对空间 config 目录的路径（`../plugins/<name>`），使同一份配置在所有空间与机器上一致。

## Assets Outside the Manifest

以下资产不进入装配单，由各自机制承载：

| 资产 | 归属 | 理由 |
|------|------|------|
| `assembly/` | 装配定义 | 装配单、骨架与模板本身是物化源头，作为始终装配清单成员随装配物化；不作为能力资产被装配单声明 |
| `prompts/` | wopal-plugin | 插件运行时的提示词资产，随插件分发；插件目录与用户级同名文件可覆盖，源码内保留默认值 |
| 插件静态资源 | 所属插件目录 | 随插件走，如 `plugins/tui-ellamaka/asset/` |
| `config/settings.jsonc` | 空间配置 | 空间共享运行配置，随 main 分发；不承载插件引用 |
| `.env.example` | 专用通道 | 模板供 `space init` 给空间种子 `.wopal/.env`；模板本身不随装配物化 |
| `.skill-lock.json` | 本地状态 | 技能安装记录；被 git 忽略，不提交、不随装配 |
| `package.json` | 本地忽略 | 工具链产物；被 git 忽略，本体根目录不应存在该文件 |

需要装配上表之外的任意目录或文件时，使用装配单 `paths` 段（见 Generic Path Assembly），不要借用现有类目目录；上表列出的专属通道保持不变。

## Permission Ownership and User Override

Agent 的权限基准属于角色本身，写在 `agents/<name>.md` 的 frontmatter `permission:` 中，随装配物化进入空间 worktree。权限不进入类型装配单：装配单声明「装配哪些能力」，不承载权限数值。

用户若要为本空间覆盖某 agent 的权限，写入 `.wopal/config/settings.local.jsonc` 的 `ellamaka.agent.<name>.permission`。该文件被 git 忽略，覆盖只作用于当前空间，不会随 space 分支提交回 central main。ellamaka 的加载顺序保证 `settings.local.jsonc` 深合并覆盖 `settings.jsonc`，因此本地覆盖天然生效。

## Template Contract

各模板的 schema、字段、生成规则与消费规则在此定义。

### `STRUCTURE.md` Schema and Generation Rules

`STRUCTURE.md` 是空间实例的 compact 结构事实文件。它会进入 Agent 启动上下文，因此实例文件只保留低 token、高价值、可行动的空间索引，不承载全量扫描清单。

文件由两层组成：

1. **YAML frontmatter**：机器可解析的启动索引，用于定位空间组件、固定运行态目录和已确认的高价值 repo。
2. **Markdown table**：Agent / 人类可读的空间资产地图，用于解释已确认资产路径、类型、层级和职责。

frontmatter 生成规则：

- 保留 `version`、`space`、`space-component-type`、`ontology-worktree`、`space-runtime` 和 `repos`。
- `space-runtime` 保留目录 / 文件用途描述，因为它直接进入 Agent 启动上下文；`.wopal-space/` 不进入 Markdown table。
- `repos` 只记录 pinned / high-value repo，不记录 scan 发现的全量 repo；大量低频 repo 留在 scan 输出或用户手工说明中。
- frontmatter 不记录 `collection`、普通 module、全量 `AGENTS.md`、docs 子目录或临时扫描结果。
- 用户未知 key 必须保留；结构 key 由 `/init` 在展示 diff 并获得用户确认后更新。

Markdown table schema：

| Field | Meaning |
|---|---|
| `path` | 相对 space root 的路径 |
| `type` | 组件类型，如 `ontology-worktree`、`space-runtime`、`projects`、`contents`、`labs`、`docs` |
| `level` | 结构层级，如 `worktree`、`repo`、`clone`、`module`、`collection`、`dir` |
| `description` | Agent 可读职责说明，不写规则正文 |

Markdown table 维护规则：

- 表格分为 managed block 与 user block；managed block 可由 `/init` 在确认后重写，user block 永不修改。
- managed block 默认只放 `.wopal` 固定关键模块、frontmatter pinned repos、用户确认的重要 module / collection。
- root `AGENTS.md` 是 ellamaka 启动入口，不进入表格。
- `wopal space scan` 发现的新 repo 或 `AGENTS.md` 模块不自动进入表格；`/init` 只报告并等待用户确认。
- 用户从 managed table 删除的非固定资产，不得因再次扫描被静默补回。

描述来源规则：

- 受控 repo / module 的首选描述来源是对应 `AGENTS.md` frontmatter `description`。
- 次选来源是 `AGENTS.md` positioning / 第一段、`README.md` 第一段或 package metadata description。
- CLI scan 只提取已有描述，不生成描述；需要新描述时由 `/init` 展示方案并等待用户确认。

维护边界：

- CLI 按模板创建初始 `STRUCTURE.md`，并由 `wopal space scan` 提供 repo / module 事实扫描 JSON。
- `/init` 负责后续结构校准：消费 scan JSON、对照 compact schema 生成更新方案、保留用户描述，并在用户确认后写入。
- schema 与生成规则维护在设计文档和模板说明中；空间实例的 `STRUCTURE.md` 聚焦结构事实。

### Minimal Space Template

初始化模板表达可启动 WopalSpace 的最小协议，聚焦通用结构而非特定 space 的组织习惯。

CLI 首次初始化必须创建：

```text
<space>/
  AGENTS.md
  .gitignore
  .wopal/
  .wopal-space/
    STRUCTURE.md
    REGULATIONS.md
    memory/
      USER.md
      MEMORY.md
      diary/
    logs/
    .tmp/
    INBOX/
    backup/
```

工作容器（如 `projects/`、`contents/`、`docs/`）由骨架声明决定，随空间类型不同。`labs/`、`external/`、`scripts/` 属于特定 space 的组织扩展，不进入最小模板；若用户后续创建这些目录，由 `/init` 扫描后再写入实例 `STRUCTURE.md`。

空间骨架声明确定性创建结构与模板映射，Consumption rules are in Schema Consumption Rules.

`.gitignore` 由 CLI 首次渲染；重复初始化时若已存在 `.gitignore`，CLI 保留现有内容，并报告缺失的 WopalSpace 建议忽略项。

### `root-AGENTS.md` Template

`root-AGENTS.md` 作为模板存在，实例化目标是 space root 的 `AGENTS.md`。它定位为空间启动提示与用户个性化规则入口。

模板职责：

1. 提醒 Agent 在上下文压缩或信息缺失时可重新读取 `.wopal-space/STRUCTURE.md`、`.wopal-space/REGULATIONS.md`、`.wopal-space/memory/USER.md` 与 `.wopal-space/memory/MEMORY.md`。
2. 提供用户空间个性化规则的写入位置。

空间事实由 `STRUCTURE.md` 承载，工作规则由 `REGULATIONS.md` 承载，详细技能路由由 `space-master` 承载；本体维护与进化流程的执行协议在 `ontology-evolution` 技能（由 `wopal/ontology-maintain` 命令触发）。

### `REGULATIONS.md` Template

`REGULATIONS.md` 初始化时写入通用空间守则，之后作为用户可持续维护的运行态文件。ontology 守则升级通过 diff/建议呈现，由用户确认后吸收。

模板应包含以下通用规则族：

- 安全红线：误删防护、工作边界、目录保护、敏感信息保护。
- Git 基本法：实施前检查、提交前检查、提交格式、历史不可变原则。
- 子代理委托：任何委派前加载 `agents-collab`，并遵守路径与目标项目上下文检查。
- 记忆与进化：长期记忆写入需去重、展示、等待用户确认。
- 核心技能入口：介绍 `space-master`、`agents-collab`、`dev-flow` 三个空间核心技能；本体维护与进化的执行协议见 `ontology-evolution`。

核心技能概要：

| 技能 | 空间职责 | 触发场景 |
|---|---|---|
| `space-master` | 空间技能根与流程路由总入口 | 任务意图不清、空间运维、技能体系、流程选择、多 Space 管理；本体维护与进化路由至 `ontology-evolution` |
| `agents-collab` | 子代理协作协议 | 任何 fae、rook 或 general 子代理委派前 |
| `dev-flow` | Issue/Plan 驱动开发状态机 | Issue、Plan、审批、执行、验证、归档 |
