# 上游同步指南

## 前提条件

ontology 仓库需配置 dual remote：
- origin → 用户 fork（如 sampx/ontology）
- upstream → 上游仓库（如 wopal-cn/ontology）

## Pull Upstream（获取上游更新）

场景：上游 ontology 有了新的通用能力，需要同步到当前 space 分支。

操作步骤（在 ontology 主仓库目录执行）：
- cd <ontology-path>（如 projects/ontology/）
- git fetch upstream
- git log --oneline upstream/main..HEAD  # 查看差异
- cd <space-path>/.wopal/
- git merge upstream/main               # 合并到 space 分支
- 解决冲突（如有）
- wopal space save -m "merge upstream updates"

## Contribute（贡献回上游）

场景：在 space 分支中开发了通用能力，希望贡献到上游 main。

操作步骤：
- cd <ontology-path>
- git log --oneline main..space/<name>  # 识别可贡献的 commits
- git checkout -b contribute/<topic> upstream/main
- git cherry-pick <commit-hash>...       # 选择性挑选
- git push origin contribute/<topic>
- gh pr create --repo wopal-cn/ontology --title "feat: ..."

注意事项：
- 只贡献通用能力，space 特有内容不贡献
- cherry-pick 前仔细 review commit 内容
- PR 描述说明改动意图