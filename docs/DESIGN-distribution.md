# Ontology — Distribution

> **Status**: Active
> **Updated**: 2026-10-20
> **Parent**: `./DESIGN.md`
> **Parent Architecture**: `../../docs/products/wopal-space/DESIGN.md`
> **Parent Product**: `../../docs/products/wopal-space/PRD.md`

---

## Scope

本文件定义 ontology 的分发方式：中央能力池（local main）与空间装配 worktree（sparse-checkout 物化）。

ontology 的分发天然是 Git 仓库模型。确定性的 ontology acquisition、Space init/sync 等 application workflow 由 Ellamaka monorepo 内 private `@wopal/wopalspace` 单点实现，并通过统一公开 `@wopal/ellamaka-sdk` 暴露稳定契约：Wopal CLI 使用 `/local`，Ellamaka Server/Onboarding composition 在仓库内直接调用 private implementation。分发模型详见 `DESIGN.md` 的 Ontology 协作模型章节。

能力边界、模板语义与运行态维护设计见 `DESIGN.md`。

---

## Distribution Model

ontology 分发模型：

```text
ontology source repo (upstream/main)
  -> local ontology clone (local main)          # 中央能力池，用户级唯一真相源
  -> space/<name> branch + sparse-checkout      # 空间装配 worktree，按装配单物化
  -> private `@wopal/wopalspace` materializes the Space assembly from templates
  -> ellamaka loads commands/agents/plugins/config at runtime
```

### Supported source inputs

1. 默认 canonical ontology source
2. 用户显式提供的 GitHub ontology URL
3. 已存在于本地 ontology directory 下的 ontology name

路径解析遵循"先复用本地已有 ontology，再按目标 source 补齐本地 repo"的原则。

P1 canonical identity 是 `wopal-space-ontology`。同一个 identity 用于默认 local ontology directory、setup source metadata、初始化后的 `STRUCTURE.md` 记录，以及承载 CLI artifacts 的 public GitHub Release carrier。自定义 ontology URL 保持为显式 override。

---

## Materialization Contract

ontology 的安装形态是 Git 仓库 + 装配 worktree。

Ellamaka 共享本地服务实现以下步骤，Wopal CLI 与远程 onboarding 调用同一服务：

1. 解析目标 ontology source
2. 准备本地 ontology repo（clone/fork，物化 local main）
3. 读取 `assembly/archetypes/<type>.yaml` 装配单与其 `schema` 指向的骨架
4. 创建 `space/<space-name>` 分支
5. 在 `<space>/.wopal/` 建立装配 worktree（sparse-checkout 按装配单物化）

P1 目标语义：

1. 默认使用 clone-based canonical source flow
2. fork flow 是显式选择的替代模式
3. 每个 space 拥有独立的 `space/<name>` 分支与装配 worktree
4. `.wopal/` 是装配 worktree，不是复制目录，也不持有独立能力演化
5. 空间根仓库跟踪 `.wopal-space/space-meta.json` 中的身份和本空间装配选择，由实际准备/演进操作在变更时限定路径提交；本体 Git refs 提供同步进度

---

## Template and Runtime Skeleton Contract

ontology 通过 `assembly/schemas/` 下的类型骨架与 `assembly/templates/` 素材，为共享初始化服务提供声明输入。装配单的 `schema` 字段选择该类型所用骨架。

共享服务消费 ontology templates 时负责：

1. 创建 `<space>/AGENTS.md`
2. 创建 `<space>/.gitignore`
3. 创建 `.wopal-space/STRUCTURE.md`
4. 创建 `.wopal-space/REGULATIONS.md`
5. 创建 `.wopal-space/memory/USER.md`
6. 创建 `.wopal-space/memory/MEMORY.md`
7. 补齐骨架中声明的固定目录

Contract：

1. ontology 声明装配单、骨架与模板，共享服务负责确定性 materialization。
2. rerun 时补齐缺失项，已有文件的用户内容保持不动。
3. `/init` 在初始化之后承接智能校准，与首次确定性 materialization 分工协作。

---

## User and Space Capability Source Contract

共享 setup 自动创建用户级 `agents/skills/rules/commands` 目录，但不把 ontology 的 agents/skills/rules/commands/plugins 整体 symlink/copy 到用户级目录。Ontology 内容通过对应空间的装配 worktree 分发；用户自己安装的全局能力保持独立。Runtime 仍可扫描 `$WOPAL_HOME/plugins` 等由其 owning 安装流程创建的全局来源，但 Setup 不因此自动创建或填充这些目录。

DSH preset 是声明式 bundle，源位于 ontology `dsh/agents-presets`，按目标产品的标准供应链快照安装到选定 profile；不依赖全局 `.agent-presets` 链接。

### DSH Bundles and Profile Boundary

本体仓库的 DSH 资产与宿主运行态 Profile 严格分层：

1. **本体能力资产**：`dsh/` 目录仅维护跨版本的声明式预设包（`dsh/agents-presets`，即 `@wopal/dsh-presets`）与扩展插件包（`dsh/plugins/*`）。这些包将 `@deepseek-ai/*` 声明为兼容版本范围的 `peerDependencies`（如 `^0.2.0-rc.2`），不锁定单一预发布版本号，也不在本体仓库中维护 `dsh/profiles/` 基线目录。
2. **宿主 Profile 初始化**：`$WOPAL_HOME/dsh/home/profiles/<profile>/`（`web` 与 `ellamaka-tools`）的目录结构、初始 `package.json`、`cordis.patch.yml`、`pnpm-workspace.yaml` 与 `cordis.yml` 合成根锚点由 Ellamaka 的 CorePreparation（`@wopal/ellamaka-cordis`）在产品启动准备阶段通过官方 `initProfile` 初始化与管理（详见 `../../projects/ellamaka/docs/DESIGN-dsh-base.md`）。
3. **标准供应链安装**：当用户或空间启用本体提供的 DSH 预设或插件包时，通过目标产品标准的 DSH 插件供应链（以 `file:` 本地包快照方式）安装到对应 profile 中。禁止对 profiles 根目录或插件包进行跨目录软链接。

### Space Overlay

`<space>/.wopal/{agents,skills,commands,rules,plugins}` 是 space overlay 层。同名能力由 overlay 覆盖 base，ellamaka 按目录优先级顺序加载：

```text
$WOPAL_HOME/{agents,skills,commands,rules,plugins}  # base
-> <space>/.wopal/{agents,skills,commands,rules,plugins}  # overlay，优先级最高
```

空间 overlay 层由装配 worktree 物化（sparse-checkout 真实文件），空间内可写可进化。空间提交的共享内容经 `space sync` 汇入 local main；对类型默认能力的本地卸载只改变本空间挂载选择，不阻断共享内容上行。有效范围与本地状态契约见 `./DESIGN-assembly.md` 的 Assembly Facts and Ownership。

---

## Runtime Loading Handoff

ontology 被 materialize 后，ellamaka 在 wopal-space mode 下负责运行时加载：

1. `.wopal/config/settings.jsonc`
2. `.wopal/agents/*.md`
3. `.wopal/commands/*.md`
4. `.wopal/plugins/`
5. 其他声明式 ontology contents

运行时边界：

1. plugin 依赖由 ellamaka 在启动时按 path plugin 语义处理。
2. `~/.wopal/ellamaka/*` 全局运行目录由 ellamaka 管理。
3. global setup、ontology lifecycle 与 Space application workflow 由 private `@wopal/wopalspace` implementation 完成；Wopal CLI 只通过公开 `@wopal/ellamaka-sdk/local` 消费并负责终端命令与呈现。
4. `/init` 的结构维护与差异吸收由 ontology command 在运行时承接。

---

## Out of Scope for P1

1. binary installer
2. release asset metadata
3. package manager integration
4. 在分发阶段替代 ellamaka runtime loading
5. 在本体内容中实现全局业务服务或产品 binary installer

---

## Reference Documents

| Document                                  | Purpose                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| `../../projects/wopal-cli/docs/DESIGN.md` | CLI 对 WopalSpace shared application services 的命令投影与 runtime handoff |
| `../../projects/ellamaka/docs/DESIGN.md`  | ellamaka 的 wopal-space mode 与 runtime loading 设计                       |
