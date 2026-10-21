---
name: dsh-sandbox-roots
description: 沙箱可写根扩展插件（@wopal/dsh-sandbox-roots）——插件依赖解析边界与 TDD 强制
---

# dsh-sandbox-roots — Agent 规范

在 `workspace-write` 沙箱模式下，把 settings（`sandbox-policy:` 节，热重载）
声明的 `writableRoots` 并入 fs 工具 allow-list、进程沙箱 allow-list 与策略
对象。实现规格（design of record）：`docs/design.md`——含上游版本锚点、
已核实事实与逐文件设计，**实现前必读，本文件不复述其内容**。

权威文档：

- 实现规格：`docs/design.md`
- 上游参考源码（与部署闭包同版本）：`labs/ref-repos/deepseek-harness/`（REF）

## 开发命令

```bash
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest run
pnpm build       # tsdown，产物进 lib/
pnpm check       # typecheck + test + build 全链
```

## TDD 强制

`src/` 全部逻辑（含 `internal/` 纯函数与三个服务子类）必须有先行的失败
测试（`tests/*.test.ts`）再实现；重构同步调整测试。上游行为复刻类代码
（如 `internal/containment.ts` 复制自 REF）同样以测试锁定行为。

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

## 上游对齐约束

- 闭包内官方包不带 `src/`，运行时不可深导 `@deepseek-ai/*` 的 `src/*`；
  需要的上游实现按 `docs/design.md` 的指示复制进 `internal/` 并以测试锁定。
- 覆盖官方服务（sandbox-policy / fs-sandbox / sandbox provider 三行）时，
  `static Config` 必须完整复述 stock 字段再加新增字段（patch 行 config 整体
  替换、不深合并）。

## 验证要求

- 自动化：`pnpm check` 全绿是提交前置条件。
- ellamaka：`ellamaka dsh plugin --profile web add <目录>` 重装后由用户重启
  引擎验证（重启永远由用户执行）。
- 官方 dsh：在**隔离副本**的 `$DSH_HOME` 下 `dsh web` 启动验证插件树
  零错误；禁止对着任何 live home 做启动实验。
