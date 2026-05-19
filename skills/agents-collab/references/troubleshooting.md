---
title: 故障排查详解
---

## 日志位置

`logs/wopal-plugins-debug.log`

## 常见问题

### 任务立即完成（无实际执行）

**现象**：任务返回 completed，但没有实际产出

**原因**：prompt 不够明确，子代理快速"完成"

**解决**：提供详细步骤、验证命令、完成标准

### 收不到完成通知

**现象**：任务已完成，但没有 `[WOPAL TASK COMPLETED]` 通知

**原因**：旧版本 bug

**解决**：更新 wopal-plugin

### 取消返回 "task is not running"

**可能原因**：
1. 任务已经完成
2. 任务还没开始（pending）
3. 竞态条件（已修复）

**排查**：
```bash
tail -50 logs/wopal-plugins-debug.log | grep "cancel"
```

### 任务超时

**现象**：任务因 timeout 被终止

**原因**：执行时间超过 timeout 设置

**解决**：
1. 增加 timeout 参数
2. 检查是否有卡住的命令

### Stale timeout 误杀

**现象**：3 分钟无活动后任务被终止

**案例**：执行 `pnpm test` 超过 3 分钟

**解决**：
1. 设置 `staleTimeout` 参数
2. 长任务改用 CLI 方式

### 斜杠命令不触发

**现象**：prompt 包含 `/xxx` 但命令未执行

**原因**：prompt 没有以 `/xxx` 开头

**解决**：确保 prompt 以 `/xxx` 开头

## 排查命令

```bash
# 查看日志
tail -50 logs/wopal-plugins-debug.log

# 检查 sandbox 状态
wopal fae sandbox list --json

# 检查任务状态
wopal fae task status <task-id> --json

# 检查 session 状态
curl -s "http://localhost:<port>/session/status?directory=/project"
```

## 状态异常处理

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| 一直 running | 任务卡住 | 检查日志，取消重试 |
| 一直 pending | 排队中 | 等待或取消 |
| 无状态返回 | session 不存在 | 创建新 session |
| 取消失败 | 非 running 状态 | 检查状态后处理 |