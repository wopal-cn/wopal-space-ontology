---
name: dsh-web-fetch-http-fakeip
description: 官方 dsh-web-fetch-http 的 @wopal fork 插件——双运行时（ellamaka/官方 dsh）安装与依赖解析边界、fork 修改约束与验证要求
---

# dsh-web-fetch-http-fakeip — Agent 规范

官方 `@deepseek-ai/dsh-web-fetch-http` 的 fork：放行 Clash TUN fake-ip 段
（198.18.0.0/15）使 `ctx.web` / `web_fetch` 在用户代理环境下可用，其余 SSRF
防护全部保留。本包直接修改 `lib/index.js`，无独立构建链。

权威文档：

- 上游参考源码（与本包同版本）：`labs/ref-repos/deepseek-harness/`（下称 REF）
- 替换契约：`cordis.patch.yml` 头部注释（禁改 `name`、先 disable 后 insert 新 id）

## 插件依赖解析边界（最高优先级）

两个运行时共用同一个安装器：官方 pluginManager 的 pnpm，作用于 profile
自己的 `package.json`。`ellamaka dsh plugin add <目录>` 直接转发给它。本包是
标准 dsh bundle，不需要任何特殊打包；但 spec 形式决定装进 profile 的东西
（在 dsh 0.2.0-rc.2 实测）：

- **`file:<绝对路径>`**：把包按 `files` 字段拷进 `<profile>/node_modules/`，
  并在那里安装它的 `dependencies`。`ellamaka dsh plugin add <目录>` 记录的就
  是这种；有 registry 依赖的包也只能用这种。
- **裸路径**：记为 `link:<绝对路径>`，即指向源码目录的软链。它的
  `dependencies` **不会安装**，任何 `import` 都会 `ERR_MODULE_NOT_FOUND`。
  只适用于运行时 import 全部另有出处的包的边改边测。

由此得到的规则：

- **registry 依赖**（`dependencies`）只在 `file:` 安装时装进 profile，且只放
  真正的第三方包；把 `@deepseek-ai/*` 写在这里会让宿主已有的模块多出一份实
  例，且插件内部解析会命中 profile 那份。
- **peer**（`peerDependencies`）由 dsh loader 从安装作用域解析，与 spec 形式
  无关：`link:` 安装同样能解析。不存在也不需要任何逐插件链接步骤。
- **pnpm** 是宿主前置条件，与官方 `dsh` CLI 一致：双方都不随包分发、也不代
  为安装。缺失时安装入口直接给出明确报错。
- **源码目录不携带会被 `file:` 拷走的东西**：安装只取 `files` 字段，因此
  `node_modules/`、`lib/`、`pnpm-lock.yaml` 属于本地开发状态，不进版本控制。
  不要在此处做任何 peer 实体化（旧 `link-peers` 那类）或 `npm install`，
  都不需要。

## fork 修改约束

- fork 修改点必须携带 `// Fork (dsh-web-fetch-http-fakeip): ...` 注释锚点，
  说明修改意图与放行范围；与上游 diff 保持最小。
- 升级上游版本时：重新套用全部 Fork 锚点修改，不得引入锚点之外的改动。

## 验证要求

本包无测试链，验证按目标运行时执行：

- ellamaka：`ellamaka dsh plugin --profile web add <目录>` 重装后由用户重启
  引擎验证（重启永远由用户执行）。
- 官方 dsh：在**隔离副本**的 `$DSH_HOME` 下 `dsh web` 启动验证插件树
  零错误；禁止对着任何 live home 做启动实验。
- 每次修改后核对：`cordis.patch.yml` 的 disable/insert 对与上游 provider id
  的对应关系未被破坏。
