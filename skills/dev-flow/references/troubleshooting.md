# 故障与高级流程

## 错误处理

| 错误 | 处理 |
|------|------|
| `Invalid transition` | 回到正确状态顺序执行 |
| `Plan not found` | 先运行 `plan` |
| `check-doc failed` | 修好 Plan 再 `approve` |
| `Done completion failed` | 勾选所有 Task Done checkbox |
| `Agent Verification failed` | 补齐 Agent Verification checkbox |
| `dirty workspace` | 清理/提交 或 `--worktree` |
| `PR not merged yet` | 等 merge 后再 `verify --confirm` |
| `User Validation gate failed` | 让用户完成验证并勾选最终 checkbox |

## 边缘场景

1. 已有 Plan 再次 `plan` — 不重复创建，继续推进
2. `complete` 时 Done 未勾选 — 先勾选再 complete
3. `complete` 时 Agent Verification 未完成 — 先补齐
4. rook BLOCK 后 complete — 停止，修复后重新审查
5. rook 连续 3 轮 BLOCK/REVISE — 保留分歧注释，用户裁决
6. PR 未 merge 时 `verify --confirm` — 等 merge
7. 目标项目工作区不干净 — 清理或 `--worktree`
8. 参数选择：Issue 驱动传 issue number，无 Issue 传 plan-name

## PR 工作流（可选）

默认不走 PR。仅当仓库要求 PR 合并或需要 CI/branch protection 时使用：

```text
complete --pr → PR opened → PR merged → verify --confirm → archive
```
