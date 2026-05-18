---
name: space-master
description: |
    空间能力全生命周期管理。⚠️ MUST LOAD BEFORE 任何空间操作（技能安装/空间同步/上游贡献）。
    Triggers: 技能查找/安装/卸载、空间 worktree 管理、上游同步、贡献回上游、空间状态检查、多 Space 版本管理。
    🔴 即使用户未明确说"上游同步"，只要涉及 ontology 仓库协作（fork/merge/cherry-pick/PR），就必须加载本技能。
---

## Ontology 日常开发流

`.wopal/` 是运行时 worktree（branch: `space/main`），直接编辑立即影响正在运行的插件。

### 决策树：是否需要隔离开发？

```
需要隔离开发？
├─ YES → 创建 worktree
│    cd ~/.wopal/ontologies/wopal-space-ontology
│    git worktree add ../.worktrees/ontology-<issue> -b feature/<name>
│    → 在 worktree 开发/测试/验证
│    → 合并回 space/main（见下方 Worktree 合并流程）
│
├─ NO → 直接编辑 .wopal/
│    → 立即影响运行插件（无需重启即可生效）
│    → 验证后提交到 fork
```

### Worktree 合并流程

```bash
# 1. Fork 中转层合并
cd ~/.wopal/ontologies/wopal-space-ontology
git checkout space/main
git merge ../.worktrees/ontology-<issue>/main

# 2. 运行时层同步
cd <space-path>/.wopal/
git merge main --no-edit

# 3. 清理 worktree
cd ~/.wopal/ontologies/wopal-space-ontology
git worktree remove ../.worktrees/ontology-<issue>
git branch -D feature/<name>
git push origin --delete feature/<name>  # 如有远程分支
```

### 提交到 Fork

```bash
cd <space-path>/.wopal/
git add . && git commit -m "feat(scope): description"
git push origin space/main

# 验证：重启 OpenCode → 测试功能
```

---

## 技能生命周期

```
Find → Download → Scan → Install → Develop → Optimize → Evaluate
```

---

## 场景路由

| 用户意图 | 参考文档 | 推荐操作 |
|---------|---------|---------|
| 查看空间状态 | — | `wopal space status` |
| 保存空间变更 | — | `wopal space save -m "message"` |
| 贡献到上游 | `references/upstream-sync.md` | 工作流 1: Fork → Upstream |
| 同步上游更新 | `references/upstream-sync.md` | 工作流 2: Upstream → Fork |
| 多用户 Space 管理 | `references/upstream-sync.md` | 工作流 3: 版本矩阵 |
| 查找/搜索技能 | `references/lifecycle-install.md` | `wopal skills find` |
| 下载审查 | `references/lifecycle-install.md` | `wopal skills download` |
| 安全扫描 | `references/lifecycle-install.md` | `wopal skills scan` |
| 安装技能 | `references/lifecycle-install.md` | `wopal skills install` |
| 管理 INBOX | `references/lifecycle-install.md` | `wopal skills inbox` |
| 卸载技能 | `references/lifecycle-install.md` | `wopal skills remove` |
| 创建新技能 | `references/lifecycle-develop.md` | Use `skill-creator` |
| 优化/修复技能 | `references/lifecycle-develop.md` | Edit source + reinstall |
| 评估技能质量 | `references/evaluate-skill.md` | Read reference |

---

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

---

## Post-Install Verification

```bash
ls -la .wopal/skills/<skill-name>/SKILL.md
wopal skills list
```

---

## Tips

1. **Ontology 协作必读** — 贡献/同步上游前读 `references/upstream-sync.md`
2. **Edit in workspace** — `.wopal/skills/<name>/` 可直接编辑
3. **Scan before install** — Downloaded skills need explicit scan
4. **Verify after install** — `ls .wopal/skills/<name>/SKILL.md`

---

## Browse Online

https://skills.sh/

---

## 上下文压缩策略

### 监控信号

收到 `[WOPAL TASK PROGRESS]` 通知时，检查上下文占用信息：

```
[WOPAL TASK PROGRESS]
Context: 55% used ⚠️
```

### 决策规则

| 上下文占用 | 建议 |
|----------|------|
| < 45% | 无需关注 |
| 45-55% | 评估任务复杂度和剩余工作量 |
| ≥ 55% | 建议压缩（子会话质量下降风险） |
| ≥ 75% | 紧急压缩（立即执行） |

### 安全检查

压缩前检查：

- 无关键未提交变更（或已明确暂存）
- 无阻塞依赖（其他任务等待当前任务结果）
- 子会话非 stuck 状态（否则先处理 stuck）

### 执行

**主会话压缩**：

```
context_manage(action="compact")
```

- 压缩后 session 进入 IDLE
- Plugin 自动发送恢复指令（无需手动干预）
- Agent 自动执行恢复协议：重载技能、读取关键文件、搜索记忆

**子会话压缩**：

```
context_manage(action="compact", session_id="wopal-task-xxx")
```

- 压缩后子会话进入 IDLE
- Plugin 发送 `[WOPAL TASK COMPACTED]` 通知到主 Agent
- 主 Agent 使用 `wopal_task_reply` 发送精准恢复指令

### 恢复

**主会话自动恢复**：

Plugin 在压缩后自动注入恢复指令：

```
<system-reminder>
The session context has been compacted. Execute recovery protocol immediately:
1. Read key files from compaction summary (max 3)
2. Search and load task-relevant memories (max 3)
3. Reload previously loaded skills
4. Briefly report what was recovered, then continue previous work
</system-reminder>
```

**子会话手动恢复**：

收到 `[WOPAL TASK COMPACTED]` 后：

```
wopal_task_reply(task_id="wopal-task-xxx", message="继续执行 Task 2 的 compact action 实现")
```

恢复指令应包含：
- 当前任务目标（简要）
- 下一步操作（具体）
- 必需的上下文（Plan 路径、关键决策）

### 最佳实践

1. **预防性压缩**：在 55% 上下文占用时主动压缩，而非等到紧急状态
2. **压缩时机**：任务阶段性完成节点（如一个 Task 完成、测试通过）比中途压缩更安全
3. **恢复准备**：压缩前确保关键信息已写入文件（Plan、日记），而非仅存在于对话历史