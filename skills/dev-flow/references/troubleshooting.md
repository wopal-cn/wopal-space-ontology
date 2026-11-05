# 故障与高级流程

## 错误处理

| 错误 | 处理 |
|------|------|
| `Invalid transition` | 回到正确状态顺序执行 |
| `Plan not found` | 用 `flow.sh plan status <name>` 定位或 `plan new` 创建 |
| `plan check` / `check-doc` failed | 修正报错的生命周期 Metadata（Status、Product/Phase、Project Path）后重试 |
| `Done completion failed` | 勾选所有 Task Done checkbox |
| `Agent Verification failed` | 补齐 Agent Verification checkbox |
| `dirty workspace` | 清理/提交 或使用 worktree 隔离 |
| `working trees containing submodules cannot be moved or removed` | 停止当前步骤，不自动 force、不删分支、不继续 checkout；按下方“被阻止的 worktree 清理”检查并保存现场 |
| `PR not merged yet` | 用户验证后运行 `flow.sh integrate <plan> --confirm`，由 integrate 完成正式 PR 合入 |
| `User Validation gate failed` | 让用户完成验证并勾选最终 checkbox |
| `Integration Commit is missing` | 本次 Delivery 尚未正式集成；完成用户验证后运行 `flow.sh integrate <plan> --confirm` |
| `Recorded Integration Commit ... is not on ...` | Plan 记录与正式分支不一致；先检查负责人 Plan 的 `Integration Commit` / `Integration Branch`，不要用当前 HEAD 代替本次交付提交 |

## 被阻止的 worktree 清理

缓存、`.venv/`、`node_modules/`、`dist/` 等已忽略产物不会阻塞清理。普通删除被 Git 拒绝时，脚本会检查是否有已跟踪修改、未忽略的未跟踪文件或子仓库本地独有工作；只有这些内容不存在时才会自动强制删除干净的 submodule 工作树。

检查发现本地待保留内容时，worktree 和分支都会保留。保存或发布这些内容后重新执行原先失败的 `verify-switch` / `archive` 即可。脚本不初始化 submodule，也不替项目决定如何保存依赖和构建产物。

## 边缘场景

1. 已有 Plan 再次 `plan` — 不重复创建，继续推进
2. `complete` 时 Done 未勾选 — 先勾选再 complete
3. `complete` 时 Agent Verification 未完成 — 先补齐
4. 实施评审未 PASS 时执行 complete — 停止，修复后按 `df-implement-review` 复审
5. 评审预算耗尽仍未 PASS — 保留未解决 finding，交给用户决定下一步
6. PR 尚未正式合入时 `verify --confirm` — 先运行 `integrate --confirm`
7. 目标项目工作区不干净 — 清理或使用 worktree 隔离
8. 参数选择：Issue 驱动传 issue number，无 Issue 传 plan-name
9. **squash 后 verify 仍精确** — `integrate` 记录用户实际验证过的 work-branch SHA 为 `Verification Commit`，并把正式分支生成的提交记录为负责人 Plan 的 `Integration Commit`；verify 校验这条固定提交，不依赖当前 main HEAD。
10. **实施基线可追溯** — `Delivery Base Commit` 是交付开始前的正式分支提交；`Verification Commit` 是用户实际检查的开发提交；`Integration Commit` 是正式交付提交。三者职责不要混用。
11. **main 在开发期间前进** — 默认 squash 仍只增加一条本次 Delivery 提交；verify 读取负责人 Plan 的固定 `Integration Commit`，正式分支后来出现的其他提交不会被误认成本次交付。
12. **历史 Plan** — 缺少新 Delivery 字段的存量 Plan 仍保留旧 merge 检测兼容路径；新 Plan 只使用新的 Verification/Integration Commit 语义。

## PR 工作流（可选）

默认不走 PR。仅当仓库要求 PR 合并或需要 CI/branch protection 时使用：

```text
complete --pr → PR opened → user validation → integrate --confirm → verify --confirm → archive
```
