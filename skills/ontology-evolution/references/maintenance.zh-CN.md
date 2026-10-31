# 本体与空间维护参考

在做状态检查、空间 / 本体同步、能力装配或本地能力选择时读取本文件。上游 GitHub PR 的创建、修改和收尾另见 [`contribution.zh-CN.md`](contribution.zh-CN.md)。

## 命令面

| 命令 | 作用 |
|------|------|
| `wopal space status` | 查看空间分支与 `local main` 的差异、装配状态、稀疏一致性、本地 include / exclude 选择和未登记文件 |
| `wopal space sync [--confirm]` | 在空间分支与 `local main` 之间对齐：先向上整合空间独有进化，再向下 fast-forward |
| `wopal space capability add/remove <kind>:<name> [--local]` | 不带 `--local` 修改类型默认装配；带 `--local` 调整当前空间的 include / exclude 覆盖 |
| `wopal ontology capability list` | 查看中央能力池拥有的能力 |
| `wopal ontology status` | 查看本体 downstream / upstream 差异和 contribution 状态 |
| `wopal ontology sync [--confirm]` | 对齐 `upstream ⇄ origin ⇄ local main` 来源链；clone 模式按实际拓扑收缩 |

## 如何读状态

`wopal space status` 重点区分：

- **to contribute**：空间分支有尚未进入 `local main` 的共享变化。
- **behind local main**：空间需要吸收本体主线变化。
- **include**：当前空间额外挂载的共享能力。
- **exclude**：当前空间停用的类型默认能力。
- **未登记文件**：临时的未跟踪 working-tree 内容；status 只负责报告和保护候选，不把它当成持久能力状态。

`wopal ontology status` 同时报告：

- **Downstream**：`upstream → origin → local main`。
- **Upstream**：`local main → origin → upstream` 的待贡献文件集。
- 本地 / 远端 `contribute/*` 分支、worktree 与 PR 状态。

“已合并、等待收尾”不代表已经获得删除授权，但它也不是可以被动忽略的提示。状态一旦显示某个已合并 PR 仍保留 contribution 资源，Agent 必须在同一次交互中报告具体残留并取得用户的清理决定后再结束；如果当前指令已经授权清理该 PR，就立即按 `contribution.zh-CN.md` 执行。普通同步仍然绝不自动获得删除权限。

## 能力池、类型默认装配与空间本地覆盖

`space capability` 有两个通道：

- **类型默认通道**（不带 `--local`）：把能力加入或移出当前空间类型的 archetype 默认装配。
- **空间本地通道**（带 `--local`）：类型默认没有但当前空间需要时写 `include`；类型默认有但当前空间不要时写 `exclude`。

能力内容与装配范围是两个独立事实。正式保留的新能力进入本体 Git 能力池；是否加入类型默认装配或只在当前空间挂载由装配动作决定。`include` / `exclude` 只决定当前空间的装配差量，不决定共享内容是否可以上行。

目标契约下，`space capability add` 遇到当前 Space worktree 中完整、但能力池尚无的新能力时，会先安全纳管该资产，再完成用户选择的类型默认或空间本地装配。**在 CLI 自动纳管尚未实现的版本中，维护者应手工完成等价动作：先扩宽 sparse 范围并把完整资产提交到注册 Space 分支，再更新 archetype 或空间 `include`。**

## 未跟踪工作区保护

未跟踪文件不是一种能力状态，也不会自动登记。sync、重物化或 sparse range 变化在触及这些路径前必须检测碰撞并停止，不能覆盖或删除。决定保留的完整能力进入 Space 分支；其他临时文件继续作为普通 working-tree 内容，直到用户移动或删除。

## 执行原则

- CLI 默认可以提供 dry-run 预览；用户已经明确要求执行时，可直接使用 `--confirm`，不要再叠加一次无意义确认。
- 同步授权只覆盖同步，不自动包含 PR 创建、review-fix push、合并或删除。
- 冲突、范围不清或状态不一致时停止，不靠 reset / stash / force 处理现场。

## 准备上游贡献

在创建 PR 前：

1. 先列出所有待贡献路径并按主题 / 能力分组。
2. 区分真正共享的能力变化与只属于某个空间 / 类型的变化。
3. 让用户决定哪些组进入本次 contribution。
4. 一个主题一个 PR；共享文件里的无关 hunk 也要排除。

一旦开始创建、修改、重试或收尾 contribution，转到 [`contribution.zh-CN.md`](contribution.zh-CN.md)，不要在本文件里自行补 Git/GitHub 流程。
