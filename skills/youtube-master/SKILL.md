---
name: youtube-master
description: |
  YouTube video transcript fetcher + summary/analyzer. ⚠️ MUST use when: (1) User provides YouTube URL + "总结/分析/提取", (2) "总结这个视频"、"视频内容分析"、"这个视频讲了什么", (3) "youtube summary"、"summarize this video"、"video analysis", (4) "YouTube 字幕"、"get transcript", (5) User only provides YouTube URL and context implies processing needed ("看看这个"、"帮我分析"). 🔴 Trigger on ANY YouTube URL when user wants to understand video content.
version: 1.0.0
metadata:
  openclaw:
    requires:
      anyBins:
        - bun
---

# youtube-master — YouTube 字幕获取 + 视频总结

一键获取 YouTube 视频字幕并按意图总结。字幕通过 InnerTube API 直接获取，无 API key，自动处理反爬和缓存。

## Script Directory

`{baseDir}` = SKILL.md 所在目录路径。`${BUN_X}` 运行时检测：已安装 bun → `bun`；否则提示安装。

脚本位于 `{baseDir}/scripts/`：
- `main.ts` — 字幕获取 CLI（主入口）

## 核心流程

### Step 1: 识别 YouTube URL

支持多种格式，正则或肉眼识别均可：
- 完整 URL：`https://www.youtube.com/watch?v=VIDEO_ID`
- 短 URL：`https://youtu.be/VIDEO_ID`
- Shorts：`https://www.youtube.com/shorts/VIDEO_ID`
- 嵌入 URL：`https://www.youtube.com/embed/VIDEO_ID`
- 纯视频 ID：`VIDEO_ID`（11 字符，字母数字混合）

### Step 2: 获取字幕

**固定输出到 `.wopal-space/.tmp/`**，避免污染工作空间：

```bash
${BUN_X} {baseDir}/scripts/main.ts '<youtube-url>' \
  --languages zh,en \
  --chapters \
  --output-dir .wopal-space/.tmp/youtube-transcript
```

关键点：
- URL 必须**单引号**（zsh glob 问题，`?` 会触发匹配失败）
- 默认参数：`--languages zh,en --chapters`（中文优先、按章节分段）
- 输出目录固定：`.wopal-space/.tmp/youtube-transcript`

### Step 3: 读取字幕文件

脚本完成后读取：
- `meta.json` — 视频元数据（标题、频道、时长、章节、封面路径）
- `transcript.md` — 格式化字幕（按章节分段、带时间戳）

路径格式：`.wopal-space/.tmp/youtube-transcript/{channel-slug}/{title-slug}/`

### Step 4: 判断用户意图

根据用户请求选择总结模式：
- "总结"/"概要"/"讲了什么" → **速览**（默认）
- "详细总结"/"完整分析" → **详细**
- "分析"/"知识点"/"教程" → **分析**
- 提出具体问题 → **信息提取**

### Step 5: 输出总结

读取 `references/summary-templates.md`，选择对应模板：
1. 提取 meta.json 中的标题、频道、时长、URL
2. 处理 transcript.md 内容
3. 按模板格式输出总结

## 总结模式

| 模式 | 适用场景 | 输出结构 |
|------|----------|----------|
| **速览**（默认） | 快速了解视频核心观点 | 标题 + 3-5 要点 + 推荐指数 |
| **详细** | 深入理解完整内容 | 章节总结 + 要点列表 + 术语解释 |
| **分析** | 教程/讲座/技术视频 | 知识点表格 + 实操步骤 + 延伸资源 |
| **信息提取** | 回答具体问题 | 直接回答，引用时间戳原文 |

长视频（字幕超 5000 字）优先用速览模式；如需详细分析可分章节处理。

## 字幕获取选项

| 选项 | 说明 | 默认 |
|------|------|------|
| `--languages <codes>` | 语言优先级，逗号分隔 | `en` |
| `--chapters` | 按视频描述中的章节分段 | off |
| `--no-timestamps` | 移除时间戳标记 | off |
| `--translate <code>` | 翻译字幕（如 `zh-Hans`） | |
| `--list` | 列出可用字幕语言（不下载） | |
| `--speakers` | 输出 speaker-identification 格式 | off |
| `--refresh` | 强制刷新缓存 | |
| `--output-dir <dir>` | 输出目录 | `youtube-transcript` |

常用组合：
```bash
# 列出可用字幕
${BUN_X} {baseDir}/scripts/main.ts '<url>' --list

# 英文字幕 + 章节 + 无时间戳
${BUN_X} {baseDir}/scripts/main.ts '<url>' --languages en --chapters --no-timestamps

# 中文翻译
${BUN_X} {baseDir}/scripts/main.ts '<url>' --translate zh-Hans
```

## 输出目录结构

```
.wopal-space/.tmp/youtube-transcript/
├── .index.json                     # 视频ID → 目录映射（缓存查找）
└── {channel-slug}/{title-slug}/
    ├── meta.json                   # 元数据（title, channel, duration, chapters）
    ├── transcript-raw.json         # 原始字幕片段（缓存）
    ├── transcript-sentences.json   # 按句子分割的字幕
    ├── transcript.md               # Markdown 字幕（章节分段）
    └── imgs/cover.jpg              # 视频封面（可选）
```

缓存机制：首次获取后保存 raw 数据，后续请求直接读取缓存（无需网络请求）。`--refresh` 强制刷新。

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| **无字幕** | 告知用户视频无字幕，建议 `--list` 查看可用语言 |
| **语言不存在** | 建议先用 `--list` 查看可用字幕，然后选择正确语言代码 |
| **视频不可用** | 明确报错：已删除/私有/地区限制 |
| **反爬/Blocked** | 脚本自动重试 alternate clients + yt-dlp 兜底；如仍失败提示设置 `YOUTUBE_TRANSCRIPT_COOKIES_FROM_BROWSER` |
| **年龄限制** | 需要登录验证，提示设置浏览器 cookies |

反爬失败时的解决方案：
```bash
# 使用浏览器 cookies
YOUTUBE_TRANSCRIPT_COOKIES_FROM_BROWSER=safari \
  ${BUN_X} {baseDir}/scripts/main.ts '<url>' --languages zh,en
```

## Speaker Identification（可选）

`--speakers` 模式需要 AI 后处理：

1. 运行脚本获取 raw transcript：
   ```bash
   ${BUN_X} {baseDir}/scripts/main.ts '<url>' --speakers --output-dir .wopal-space/.tmp/youtube-transcript
   ```

2. 读取 `{baseDir}/prompts/speaker-transcript.md`

3. 处理 raw transcript：识别对话者（从标题/频道/描述提取姓名）、标注对话轮次、按章节分段

4. 输出带 speaker label 的格式化字幕

此模式适用于访谈/对话类视频。

## 参考

- 总结模板：`references/summary-templates.md`（选择总结模式时读取）
- Speaker 识别提示词：`prompts/speaker-transcript.md`（仅 `--speakers` 模式读取）