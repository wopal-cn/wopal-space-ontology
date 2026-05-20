# 故障参考

## 边缘场景

1. **已有 Plan 再次执行 `plan`**：不重复创建，继续基于现有 Plan 推进。
2. **`complete` 时 Done 未勾选**：先勾选 Implementation 中所有 Task 的 Done checkbox。
3. **`complete` 时 Agent Verification 未完成**：先补齐 `Agent Verification`。
4. **rook 审查返回 BLOCK**：停止推进，根据 Blocker 要求 fae 修复，修复后重新委派 rook。
5. **rook 审查连续 3 轮 BLOCK/REVISE**：保留分歧注释，停止循环，由用户在 approve/complete 时裁决。
6. **`verify --confirm` 时 PR 未 merged**：先等 PR merge。
7. **`verify --confirm` 时用户未勾选最终 checkbox**：先让用户完成 User Validation。
8. **目标项目工作区不干净**：先清理/提交当前变更，或改用 `--worktree`。
9. **参数选择规则**：Issue 驱动一律传 issue number；无 Issue 的 Plan 驱动一律传 plan-name。

## 错误处理

| 错误 | 处理 |
|------|------|
| `Invalid transition` | 回到正确状态顺序执行 |
| `Plan not found` | 先运行 `plan` |
| `check-doc failed` | 修好 Plan 再 `approve` |
| `Done completion failed` | 勾选 Implementation 中所有 Task Done checkbox，再 `complete` |
| `Agent Verification failed` | 补齐 Agent Verification checkbox，再 `complete` |
| `dirty workspace` | 先清理/提交，或改用 `--worktree` |
| `PR not merged yet` | 等 merge 后再 `verify --confirm` |
| `User Validation gate failed` | 让用户完成验证并勾选最终 checkbox |
