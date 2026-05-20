# PR 工作流（高级可选）

默认主流程不走 PR。只在这些情况下使用 `--pr`：
- 目标仓库要求通过 PR 合并代码
- 明确需要 GitHub Review / CI / branch protection

## 最小记忆

```text
complete --pr → PR opened → PR merged → verify --confirm → archive
```

不确定时不要走 PR 路径。