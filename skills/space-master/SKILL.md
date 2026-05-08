---
name: space-master
description: |
    空间能力全生命周期管理。⚠️ MUST LOAD BEFORE 任何空间操作（技能安装/空间同步/上游贡献）。
    Triggers: 技能查找/安装/卸载, 空间 worktree 管理, 上游同步, 贡献回上游, 空间状态检查。
---

## 核心工作流

### 技能生命周期

```
Find → Download → Scan → Install → Develop → Optimize → Evaluate
```

### 空间 Worktree 管理

```
Status → Save → Pull → Contribute
```

## 场景路由

| 用户意图 | 参考文档 | 推荐操作 |
|---------|---------|---------|
| 查看空间状态 | — | `wopal space status` |
| 保存空间变更 | — | `wopal space save` |
| 拉取上游更新 | `references/upstream-sync.md` | 指导用户手动 git 操作 |
| 贡献回上游 | `references/upstream-sync.md` | 指导用户 cherry-pick + PR |
| 查找/搜索技能 | `references/lifecycle-install.md` | `wopal skills find` |
| 下载审查 | `references/lifecycle-install.md` | `wopal skills download` |
| 安全扫描 | `references/lifecycle-install.md` | `wopal skills scan` |
| 安装技能 | `references/lifecycle-install.md` | `wopal skills install` |
| 管理 INBOX | `references/lifecycle-install.md` | `wopal skills inbox` |
| 卸载技能 | `references/lifecycle-install.md` | `wopal skills remove` |
| 创建新技能 | `references/lifecycle-develop.md` | Use `skill-creator` |
| 优化/修复技能 | `references/lifecycle-develop.md` | Edit source + reinstall |
| 评估技能质量 | `references/evaluate-skill.md` | Read reference |

## Quick Commands

```bash
# 空间管理
wopal space status              # 查看空间全貌
wopal space save -m "message"   # 保存变更

# 技能管理
wopal skills find "query"
wopal skills download owner/repo@skill
wopal skills scan skill-name
wopal skills install /path/to/skill --force
wopal skills remove <skill-name> --force
```

## Post-Install Verification

```bash
ls -la .wopal/skills/<skill-name>/SKILL.md
wopal skills list
```

## Evaluate Skills

**For detailed evaluation with scoring rubric, read `references/evaluate-skill.md`.**

Quick check:

```bash
ls -la <skill-path>/
wc -l <skill-path>/SKILL.md
find <skill-path> -type f
```

| Dimension | What to Check |
|-----------|---------------|
| Content | SKILL.md depth, examples, edge cases |
| Utility | Problem-solving ability |
| Executability | Scripts, clear workflow |
| Compliance | Directory/naming/metadata |
| Maintainability | Dependencies, update needs |

| Score | Action |
|-------|--------|
| ≥4 stars | Install |
| 3 stars | Backup/Fix |
| ≤2 stars | Delete |

## Tips

1. **Verify after install** — `ls .wopal/skills/<name>/SKILL.md`
2. **Edit in workspace** — `.wopal/skills/<name>/` 可直接编辑
3. **Scan before install** — Downloaded skills need explicit scan

## Browse Online

https://skills.sh/
