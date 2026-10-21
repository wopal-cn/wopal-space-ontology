# dsh-sandbox-roots 实现规格（design of record）

版本锚点：部署闭包 = `~/.wopal/dsh/closures/892d593303e0/node_modules/@deepseek-ai/*`，
全部 `0.1.2-rc.1`；cordis `4.0.2`；schemastery `3.18.2`。
代码事实的参考源码（与部署同版本）：`labs/ref-repos/deepseek-harness/`（下称 REF）。

## 0. 已核实的事实（勿再推导，直接采用）

- `writableRoots(policy)`（REF `packages/sandbox/sandbox/src/roots.ts:52`）是闭集自由函数：
  `mode !== 'workspace-write' → []`；否则 `[workspaceRoot, '/tmp', os.tmpdir()]` 各自
  `canonicalPath`（`realpathSync.native`，失败保留原拼写）去重。**无法通过改 policy
  对象让其多放行目录；只有替换消费方才能并入额外根。**
- `SandboxPolicyService`（REF `packages/sandbox/sandbox-policy/src/index.ts`）：
  `constructor(ctx)` 调 `super(ctx, 'sandboxPolicy')`；`static Config = z.object({
  mode: z.union([...]).default('read-only'), workspaceRoot: z.string() })`；
  `static inject = ['sessionProjections']`；构造器里
  `ctx.sessionProjections.register({key:'sandboxMode', ...})` 和
  `ctx.inject(['systemPrompt'], ...)`（后者注册名为 `sandbox:policy` 的 prompt context，
  文案来自模块私有 `renderPolicyContext`；同名 context 重复注册会抛错，因此**不重注册
  prompt context**）。`resolve(request)`：`mode = request.mode ?? overrideOf(session) ??
  defaultMode`；`workspaceRoot = resolveWorkspaceRoot(session?.header.cwd ?? this.workspaceRoot)`；
  带 session 时附 `sessionId`。
- `SandboxedFileSystem`（REF `packages/fs/fs-sandbox/src/index.ts`）：继承
  `LocalFileSystem`（`@deepseek-ai/dsh-fs-local`），`static inject = ['sandboxPolicy']`；
  `writeText(target, content, expected?, signal?, sandboxPolicy?)` /
  `editText(...)` 先过私有 `checkedTarget` 再委托 super；`checkedTarget` 中
  `mode==='danger-full-access'` 放行、`'read-only'` 抛
  `FsError(..., 'FS_SANDBOX_DENIED')`、`'workspace-write'` 用
  `await this.resolve(target.displayPath)` 取 fresh target（`fresh.targetKey` 为规范键），
  对 `writableRoots(policy)` 逐根 `await isPathUnder(fresh.targetKey, root)`，全部未包含
  则抛 `FS_SANDBOX_DENIED`。`isPathUnder`（REF `packages/fs/fs-sandbox/src/containment.ts`）
  是纯 fs 检查，**部署闭包不带 src，运行时不可深导 `@deepseek-ai/dsh-fs-sandbox/src/*`，
  必须把 containment.ts 复制进本包**。
- `LocalSandboxProvider`（REF `packages/sandbox/sandbox-local/src/index.ts`）：
  `confine(argv, policy)` 返回 `ConfinedArgv = { argv, enforcement, denialSignatures,
  runnerFailureRules }`；darwin 链是 `['seatbelt']` 唯一候选（免 probe，
  `enforcement: 'full'`）；`runnerArgv('seatbelt', policy)` =
  `[seatbeltExec()即'sandbox-exec', ...seatbeltProfileArgs(policy)]`，confine 再
  拼接 `'--'` 与原 argv。Seatbelt 常量（REF `sandbox-local/src/index.ts`）：
  `denialSignatures: ['operation not permitted']`；
  `runnerFailureRules: [{ fatalSignatures: ['sandbox-exec: '] }]`。
  `seatbeltProfileArgs(policy)`（REF `sandbox-local/src/profiles.ts`）：
  `forms = ['(version 1)', '(allow default)', '(deny file-write*)',
  '(allow file-write* (literal "/dev/null"))']`，若 `writableRoots(policy)` 非空再追加
  `(allow file-write* (subpath "…")…)`（逐根 `sbplString`：反斜杠与双引号转义后双引号包裹），
  返回 `['-p', forms.join(' ')]`。bwrap/landlock 构建器同样在 profiles.ts，PoC 不支持。
- bash 链路：`dsh-bash-sandbox` `inject = ['subprocess','sandbox','sandboxPolicy']`，
  每次调用 `ctx.sandboxPolicy.resolve({session})` 后把 policy 交给
  `ctx.sandbox.confine(command, policy)`（REF `packages/shell/bash-sandbox/src/index.ts:85-122`）。
  所以**替换 `sandbox` provider 行后，额外根经 policy 对象自动到达 bash**。
- settings（REF `packages/settings/settings/src/index.ts`）：
  `installSection(owner, ns, schema, entry, hooks)`；解析层叠 = schema 默认 →
  composition base（entry）→ user 文档节，`mergeLayers` 递归对象合并（部分字段可行）；
  `hooks.setSource(() => resolved)` 提供**同步**读取最新值的函数；
  `hooks.onChange()` 在变更时触发；ns 必须小写连字符，冲突抛 `SettingsConflictError`。
  消费模板：REF `packages/llm/llm-deepseek/src/index.ts:405-498`。
- patch 行语义：后层按 id 覆盖整行（含 `name`，换名会 dispose 旧实现并 import 新模块，
  REF `vendor/loader/src/config/entry.ts:194-245`）；config 整体替换不深合并，
  换 config 的行必须复述全部所需键。
- 依赖方：fs 门禁消费方 = `tool-fs` 等 fs 工具；进程 wrap 消费方 =
  `bash-sandbox`、`pwsh-sandbox`、`terminal-bash`。除 fs-sandbox 与 sandbox-local 外
  没有其他 `writableRoots()` 直接消费方（已 grep 核实）。

## 1. 目标

在 `workspace-write` 模式下，把 settings 文档（`$DSH_HOME/settings.yaml` 的
`sandbox-policy:` 节，热重载）里 `writableRoots` 列出的目录并入：

1. fs 工具（write/edit）allow-list；
2. 进程沙箱（macOS Seatbelt profile）allow-list；
3. 策略对象本身（`policy.writableRoots`，供上述两者读取）。

非目标：`read-only` / `danger-full-access` 语义不变；bwrap/Landlock/Windows-ACL
的额外根支持（配置了 writableRoots 时非 darwin 平台 confine 显式报错）；
prompt context 文案定制；mode/workspaceRoot 的 settings 热更新。

## 2. 包结构（本仓库）

```
src/
  index.ts      SandboxRootsPolicyService（row: sandbox-policy）
  fs.ts         SandboxRootsFileSystem（row: fs-sandbox）
  sandbox.ts    SandboxRootsSandboxProvider（row: sandbox）
  internal/
    roots.ts        expandRoots + 首根包含判定（纯函数，测试主对象）
    containment.ts  复制自 REF packages/fs/fs-sandbox/src/containment.ts（isPathUnder）
    seatbelt.ts     复制并扩展 REF sandbox-local/src/profiles.ts 的 Seatbelt 表单构造
tests/          vitest，`tests/*.test.ts`
```

导出映射：`.`→`src/index.ts`，`./fs`→`src/fs.ts`，`./sandbox`→`src/sandbox.ts`；
三者均 default 导出对应 class（loader 取 default）。

## 3. src/index.ts — SandboxRootsPolicyService

```ts
export class SandboxRootsPolicyService extends SandboxPolicyService {
  static inject = ['sessionProjections']   // 与 stock 相同
  // 字段：private source: () => string[] = () => this.baseRoots
  //       private readonly baseRoots: string[]   // 构造时 config.writableRoots ?? []
```

- `static Config`（schemastery z）：完整复述 stock 两键并新增
  `writableRoots: z.array(z.string()).default([])`（mode union `.default('read-only')`、
  `workspaceRoot: z.string()` 无 schema 默认，语义与 stock 一致）。
- 构造器：`super(ctx, config)`；保存 baseRoots；随后
  `ctx.inject(['settings'], (settingsCtx) => settingsCtx.settings.installSection(
    ctx, 'sandbox-policy', <仅含 writableRoots 可选字段的 section schema>,
    { writableRoots: config.writableRoots ?? [] },
    { setSource: src => { this.source = src }, onChange: () => {} }))`。
  settings 缺席时 inject 不触发，source 回落 baseRoots（llm-deepseek 模式）。
  section schema 用 zod（`zod.object({ writableRoots: zod.array(zod.string()).optional() })`），
  与 stock 服务内部 `zod` 用法一致；**不要**把 mode/workspaceRoot 放进 section schema
  （用户写了会被 schema 拒绝，fail loud，符合"settings 只管可写根"的边界）。
- `override resolve(request)`：调 `super.resolve(request)` 得 base；当且仅当
  `base.mode === 'workspace-write'` 时附
  `writableRoots: [...new Set((this.source() ?? []).map(expandRoot))]`
  （expandRoot：`~`→home，`resolvePath` 绝对化，`canonicalPath` 规范化；列表去重；
  空列表时**不附**该字段，保持 stock 形状）。返回类型 =
  `SandboxExecutionPolicy & { writableRoots?: string[] }`。
- 其他成员一概不覆盖（defaultMode/workspaceRoot/overrideOf/投影注册/prompt 注册
  全部走 stock）。`installSection` 的 ns 为 `sandbox-policy`；若与其他注册冲突会
  在加载期抛错（fail loud，属预期）。

注意：settings 热更新只影响 `writableRoots`；`source()` 每次 resolve 调用，
无需缓存与 onChange 逻辑。

## 4. src/fs.ts — SandboxRootsFileSystem

```ts
export default class SandboxRootsFileSystem extends SandboxedFileSystem {
  static inject = ['sandboxPolicy']
  override async writeText(target, content, expected?, signal?, sandboxPolicy?) {
    const bypass = await this.extraRootTarget(target, sandboxPolicy)
    if (bypass !== undefined) {
      return LocalFileSystem.prototype.writeText.call(this, bypass, content, expected, signal)
    }
    return super.writeText(target, content, expected, signal, sandboxPolicy)
  }
  // editText 同构（editText 签名照抄 stock）
  private async extraRootTarget(target, sandboxPolicy?): Promise<FsTarget | undefined> {
    const policy = (sandboxPolicy ?? this.ctx.sandboxPolicy.resolve()) as WithExtras
    if (policy.mode !== 'workspace-write') return undefined
    const extras = policy.writableRoots ?? []
    if (extras.length === 0) return undefined
    const fresh = await this.resolve(target.displayPath)
    for (const root of extras) if (await isPathUnder(fresh.targetKey, root)) return fresh
    return undefined
  }
}
```

- 语义：目标规范化后落在任一**额外根**内 → 直接走
  `LocalFileSystem.prototype.writeText/editText`（跨代调用，绕过 stock fence 的
  私有 checkedTarget）；否则完全走 stock 路径（标准三根与拒绝语义零漂移）。
- `WithExtras = SandboxExecutionPolicy & { writableRoots?: string[] }`（本包类型）。
- `Config` 继承 stock（`export type Config = SandboxedFileSystem 的 Config`，
  即 `LocalConfig`）；不新增配置。

## 5. src/sandbox.ts — SandboxRootsSandboxProvider

```ts
export default class SandboxRootsSandboxProvider extends LocalSandboxProvider {
  override confine(argv: readonly string[], policy: SandboxPolicy): ConfinedArgv {
    const extras = (policy as WithExtras).writableRoots ?? []
    if (policy.mode !== 'workspace-write' || extras.length === 0) return super.confine(argv, policy)
    if (process.platform !== 'darwin') {
      throw new Error(`dsh-sandbox-roots: writableRoots (${extras.length} root(s)) requires the macOS Seatbelt runner; unsupported runner platform ${process.platform}`)
    }
    const roots = [...new Set([...writableRootsOf(policy), ...extras])]  // 均已规范化
    return {
      argv: ['sandbox-exec', '-p', seatbeltProfile(roots), '--', ...argv],
      enforcement: 'full',
      denialSignatures: ['operation not permitted'],
      runnerFailureRules: [{ fatalSignatures: ['sandbox-exec: '] }],
    }
  }
}
```

- `seatbeltProfile(roots)`：复刻 stock `seatbeltProfileArgs` 的 forms
  （含 `/dev/null` literal 项）+ 追加 `(allow file-write* (subpath …))`，
  返回 join 后的单串（本包自行组装 `-p` 之外的 argv，见上）。
  `writableRootsOf(policy)` = 复刻 stock `writableRoots`（workspaceRoot/'/tmp'/tmpdir()
  canonical 去重）。两个纯函数放 `src/internal/seatbelt.ts` / `src/internal/roots.ts`。
- `Config` 继承 stock（runnerCommand/runnerFailureSignatures/probeTimeoutMs 语义不变；
  `runnerCommand` 存在时 extras 行为未定义——在 README 标注，不做特判）。

## 6. cordis.patch.yml（bundle patch，已生成）

覆盖 `sandbox-policy`（复述 base 的 mode/workspaceRoot `!!js` 表达式）、`sandbox`、
`fs-sandbox` 三行。安装方式（集成阶段）：
`dsh plugin --profile web add labs/research/dsh-sandbox-roots`（link 安装，
`prepare` 脚本已定义）。

## 7. 测试计划（TDD，vitest，先红后绿）

`tests/roots.test.ts`（纯函数）：
- expandRoot：`~`、`~/x`、相对路径、重复条目去重；缺失路径保留拼写。
- seatbeltProfile：仅标准根的输出与 stock 形态逐字符一致（硬编码期望串作 parity
  快照：`(version 1)` + `(allow default)` + `(deny file-write*)` + dev/null literal
  + workspace/tmp 子路径项）；含额外根时出现额外 subpath 项。
- 首根包含判定（fs bypass 决策的纯部分）：命中返回 true、未命中 false、extras 空 false。

`tests/policy.test.ts`（class，最小 fake 依赖）：
- 用独立 cordis Context（`new Context()` 根 ctx）+ `ctx.set`/fake 注册
  `sessionProjections`（仅需 `register()` 返回 disposer 的最小对象）；settings 服务
  缺席 → 构造成功且 `resolve()` 不附 writableRoots（config.writableRoots 为空时）。
  fake settings：实现 `installSection(ctx, ns, schema, entry, hooks)` 契约
  （立即 `hooks.setSource(() => fakeValue)` 并可触发 `hooks.onChange`），验证
  resolve() 附上清单且 `~` 已展开；settings 值变更后再次 resolve 反映新值（热重载）。
- resolve 在 `read-only` 模式不附 writableRoots。

`tests/sandbox.test.ts`（class）：
- darwin 上 confine（policy 含 writableRoots）→ argv 前缀 `['sandbox-exec','-p',<profile>,'--']`、
  enforcement 'full'、denialSignatures/runnerFailureRules 与 stock seatbelt 常量一致；
  无 extras → 委托 super（若因沙箱环境 probe 失败抛 SandboxUnavailableError 亦算通过，
  用 `t.throws` 断言即可）。
- 非 darwin 模拟（可 monkey-patch `process.platform` 后还原）+ extras → 显式报错。

`tests/fs.test.ts`：以纯 helper 测试为主；若能以最小依赖实例化
SandboxRootsFileSystem（fake ctx 提供 sandboxPolicy.resolve）则加
extra-root bypass / stock 拒绝两条；不可行则记录并交由部署实机验证。

## 8. 命令与验收

```sh
pnpm install            # registry（npmmirror）
pnpm typecheck && pnpm test && pnpm build
```

验收：三条全绿；`lib/` 产出 `index.js`、`fs.js`、`sandbox.js`；
`node -e "import('file:///...lib/index.js')"` 可加载（ESM 无缺依赖报错）。

## 9. 边界禁令

- 只在 `labs/research/dsh-sandbox-roots/` 内创建/修改文件。
- 禁止 git 操作（含 add/commit/stash）、禁止删除任何既有文件、禁止 `rm`。
- 禁止读取任何 `.env` / 凭据文件。
- 参考源码只读；不改 REF 仓库任何文件。