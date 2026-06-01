# Ontology — Distribution

> **Status**: Active
> **Updated**: 2026-06-01
> **Parent Architecture**: `../../docs/products/wopal-space/DESIGN-wopalspace.md`
> **Project Design**: `./DESIGN.md`

## 0. Change Log

| Date | Type | Summary |
|---|---|---|
| 2026-06-01 | Updated | 明确 `wopal-space-ontology` 作为 P1 canonical source identity 和 CLI release carrier。 |
| 2026-05-30 | Updated | 优化语言表达，通顺自然。 |
| 2026-05-30 | Updated | 精简为分发特有内容，避免与 `DESIGN.md` 重复。 |
| 2026-05-30 | Created | 定义 ontology 的 Git source 分发、clone/fork/worktree 物化与 init/runtime handoff 契约。 |

---

## 1. Scope

本文件定义 ontology 的分发方式：Git source 的 clone / fork / worktree 物化。

ontology 的分发天然是 Git 仓库模型。wopal-cli 的 `wopal space init` / `wopal setup` 封装了这个过程，将其与 space runtime 初始化串联。

能力边界、模板语义与运行态维护设计见 `DESIGN.md`。

---

## 2. Distribution Model

P1 的 ontology 分发模型：

```text
ontology source repo
  -> local clone or local fork clone
  -> space/<name> branch
  -> <space>/.wopal/ worktree
  -> CLI renders deterministic runtime skeleton from templates
  -> ellamaka loads commands/agents/plugins/config at runtime
```

### Supported source inputs

1. 默认 canonical ontology source
2. 用户显式提供的 GitHub ontology URL
3. 已存在于本地 ontology directory 下的 ontology name

路径解析遵循"先复用本地已有 ontology，再按目标 source 补齐本地 repo"的原则。

P1 canonical identity 是 `wopal-space-ontology`。同一个 identity 用于默认 local ontology directory、setup source metadata、初始化后的 `STRUCTURE.md` 记录，以及承载 CLI artifacts 的 public GitHub Release carrier。自定义 ontology URL 保持为显式 override。

---

## 3. Materialization Contract

ontology 的安装形态是 materialization（而不是 archive extraction）。

`wopal space init` / `wopal setup` 负责：

1. 解析目标 ontology source
2. 准备本地 ontology repo
3. 创建 `space/<space-name>` 分支
4. 在 `<space>/.wopal/` 建立 worktree

P1 目标语义：

1. 默认使用 clone-based canonical source flow
2. fork flow 是显式选择的替代模式
3. 每个 space 拥有独立的 `space/<name>` 分支
4. `.wopal/` 是 ontology worktree，不是复制目录

---

## 4. Template and Runtime Skeleton Contract

ontology 通过 `.wopal/templates/wopalspace-schema.yaml` 与相关模板，为 CLI 提供确定性初始化输入。

CLI 消费 ontology templates 时负责：

1. 创建 `<space>/AGENTS.md`
2. 创建 `<space>/.gitignore`
3. 创建 `.wopal-space/STRUCTURE.md`
4. 创建 `.wopal-space/REGULATIONS.md`
5. 创建 `.wopal-space/memory/USER.md`
6. 创建 `.wopal-space/memory/MEMORY.md`
7. 补齐 schema 中声明的固定目录

Contract：

1. ontology 声明 template 和 schema，CLI 负责确定性 materialization。
2. rerun 时补齐缺失项，已有文件的用户内容保持不动。
3. `/init` 在初始化之后承接智能校准，与首次确定性 materialization 分工协作。

---

## 5. Runtime Loading Handoff

ontology 被 materialize 后，ellamaka 在 wopal-space mode 下负责运行时加载：

1. `.wopal/config/settings.jsonc`
2. `.wopal/agents/*.md`
3. `.wopal/commands/*.md`
4. `.wopal/plugins/`
5. 其他声明式 ontology contents

运行时边界：

1. plugin 依赖由 ellamaka 在启动时按 path plugin 语义处理。
2. `~/.wopal/ellamaka/*` 全局运行目录由 ellamaka 管理。
3. CLI 的 global setup 由 wopal-cli 负责。
4. `/init` 的结构维护与差异吸收由 ontology command 在运行时承接。

---

## 6. Out of Scope for P1

1. binary installer
2. release asset metadata
3. package manager integration
4. 在分发阶段替代 ellamaka runtime loading
5. 在分发阶段替代 CLI 的 global setup / engine install

---

## 7. Related Documents

| Document | Purpose |
|---|---|
| `./DESIGN.md` | ontology 的能力边界、模板、命令、规则与 runtime 维护设计 |
| `../../docs/products/wopal-space/DESIGN-wopalspace.md` | 产品级 setup integration flow 与系统分层 |
| `../../projects/wopal-cli/docs/DESIGN.md` | CLI 的 deterministic init 与 runtime handoff 设计 |
| `../../projects/wopal-cli/docs/DISTRIBUTION.md` | CLI 对 ontology materialization 的消费契约 |
| `../../projects/ellamaka/docs/DESIGN.md` | ellamaka 的 wopal-space mode 与 runtime loading 设计 |
| `../../projects/ellamaka/docs/DISTRIBUTION.md` | ellamaka 对 ontology runtime loading 的消费契约 |
