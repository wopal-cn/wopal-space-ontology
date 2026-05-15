---
trigger: model_decision
description: Astro 项目开发时遵守此规则。
keywords:
  - 'astro'
---
# Astro 开发规范

## Astro 组件

```astro
---
// Frontmatter: 导入、接口、属性、逻辑
import { Icon } from 'astro-icon/components';
import type { Props } from '~/types';

const { prop1 = 'default', prop2 } = Astro.props;
---

<!-- Template: JSX-like syntax -->
<div class={prop1}>
  {condition && <Component />}
</div>
```

- 使用 `---` 分隔符将 frontmatter 与模板分开
- 属性接口在 frontmatter 顶部命名为 `Props`
- 使用 Astro 的 `class:list` 处理条件类
- 使用 `set:html` 插入原始 HTML，而非 `dangerouslySetInnerHTML`

## 路由

- `src/pages/` 中的基于文件的路由
- 静态：`.astro` 文件预渲染
- 动态：设置 `export const prerender = false;` 用于 SSR
- API 路由：`.ts` 文件导出返回 Response 的 GET/POST 函数
- 捕获全部：用于嵌套路由的 `[...param].astro`

## 样式

- 所有样式使用 Tailwind CSS
- 使用 `class:list` 指令处理条件类
- 除非必要，否则避免内联样式
- 暗色模式：一致使用 `dark:` 前缀

## 导入

- 所有 src 导入使用 `~` 别名：`import { foo } from '~/lib/server/db'`
- 分组导入：外部包优先，然后是本地导入
- Astro 文件中非 TypeScript 导入需显式文件扩展名

## React 组件集成

- 使用 hooks 的函数式组件（`useState`, `useEffect`）
- 使用 `export default function ComponentName()`
- 接口类型化属性
- `useEffect` 返回函数中清理
- 使用 try/catch 处理错误，记录到控制台

## 命名约定

- **文件**: kebab-case（`toggle-theme.astro`, `auth-buttons-client.tsx`）
- **组件**: PascalCase（`ToggleTheme`, `AuthButtonsClient`）
- **函数/变量**: camelCase（`getUserFromGitHubId`, `validateSessionToken`）
- **常量**: SCREAMING_SNAKE_CASE（`APP_BLOG`, `BLOG_BASE`）
- **接口/类型**: PascalCase，通常以 `...Props` 或 `...Result` 结尾

## 环境变量

- 存储在 `.env`（git 忽略）
- 通过 `import.meta.env.PROD`, `import.meta.env.DEV` 访问

## 错误处理

- 服务端：返回适当的 HTTP 状态码（401, 404, 500）
- 客户端：async 操作使用 try/catch，记录错误，显示用户反馈
- API 路由：始终检查 `context.locals.session` 认证状态
