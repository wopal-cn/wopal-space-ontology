# dsh-sandbox-roots — 可配置的沙箱额外可写根

为 DeepSeek Harness (`dsh`) 沙箱提供 settings 驱动的额外可写目录能力：在保持
`workspace-write` 模式闭环的前提下，允许把指定目录（如 `~/.wopal/dsh`、`~/.Trash`）
加入写白名单，使会话内维护 dsh 配置、执行 `trash` 删除等操作无需逐次提权。

## 形态

一个 out-of-tree dsh bundle（`dsh.bundle` patch 层），零修改官方源码。
bundle patch 按官方语法禁用三行 stock 插件并以新 id 插入本包实现
（dsh 按 id 覆盖行时若 `name` 与现值不同会被跳过，换实现 = 禁用 + 插入）：

| stock 行（禁用） | 本包行（insert，新 id） | 本包导出 | 职责 |
|--------|---------|------|------|
| `sandbox-policy` | `sandbox-roots-policy` | `.` | 策略解析 + settings 热重载 `writableRoots` |
| `sandbox` | `sandbox-roots-sandbox` | `./sandbox` | 进程沙箱 wrap（macOS Seatbelt）并入额外根 |
| `fs-sandbox` | `sandbox-roots-fs` | `./fs` | fs 工具门禁 allow-list 并入额外根 |

服务名（`ctx.sandboxPolicy` / `ctx.sandbox` / `ctx.fs`）来自类继承，消费方注入不受 row id 影响。

## 配置

值放 `$DSH_HOME/settings.yaml`（热重载，Settings-Plugins 页可见）：

```yaml
sandbox-policy:
  writableRoots:
    - ~/.wopal/dsh
    - ~/.Trash
```

- 仅 `workspace-write` 模式生效；`read-only` / `danger-full-access` 维持 stock 语义。
- 支持 `~` 展开；路径以 `realpathSync.native` 规范化后参与匹配，软链接无法绕过。
- 目录不存在时该根匹配不到任何路径（保守，与 stock 语义一致）。
- `mode` / `workspaceRoot` 仍由 profile patch 的插件 config 决定，settings 中不生效。

## 安装（ellamaka 部署）

```sh
ellamaka dsh plugin --profile web add /path/to/dsh-sandbox-roots   # 转给官方 dsh 安装器，记为 file:<绝对路径>
```

运行中的容器经组合文件监听热挂载；bundle patch 变更在下次重放或重启时生效。
包内零 node_modules（peer 由 dsh loader 从安装作用域解析，与安装方式无关），
`lib/` 由 `prepare` 脚本（tsdown）预构建。

## 已知限制

- 进程沙箱额外根仅支持 macOS Seatbelt；其余平台配置了 `writableRoots` 时
  `confine` 显式报错（fail loud），bwrap / Landlock / Windows-ACL 支持延后。
- `trash` 对外置卷文件依赖该卷的 `.Trashes/<uid>/`（macOS 卷语义，与沙箱无关）；
  首次在 Finder 中对外置盘文件执行"移到废纸篓"即可自动创建。
- `sandbox` 行的 `runnerCommand` 覆盖与额外根互不感知：配置了 `writableRoots`
  时本包直接组装 Seatbelt wrap，不读 `runnerCommand`（行为未定义，不做特判）。
- 系统提示词的 `sandbox:policy` 上下文沿用 stock 文案，不列举额外根。
- `mode` / `workspaceRoot` 不随 settings 热更新。

## 实施要点（迁移自实施过程的坑）

- **热挂载核心行有风险**：运行中替换 `ctx.fs` / `ctx.sandbox` 等会话正踩着的
  服务会导致会话异常；本插件的生效时机交给 boot（重启）最稳。
- **live-home quarantine**：引擎运行期间，引擎进程外不得写入
  `$WOPAL_HOME/dsh/home/profiles/`（组合重放以 mtime/size 为键，会竞争）；
  安装一律走 `ellamaka dsh plugin`（转发给官方 pnpm 安装器，串行化由它负责）。
- **裸包名解析**：Bun 宿主无 Node internal loader，Bridge 在组合期把 patch 行
  裸包名改写为实体入口的绝对 `file://` URL；插件运行时对 peer 的 import
  从实体出发 parent-walk，经 `profiles/node_modules` 共享层命中闭包。