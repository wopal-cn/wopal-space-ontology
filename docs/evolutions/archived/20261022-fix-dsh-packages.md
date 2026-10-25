# fix-dsh-packages

<!--
Proposal naming contract — inherited by every new proposal from this shared
skeleton.

- Structure: `<type>-<slug>`; `type` uses the standard values, fully spelled
  (feature / fix / enhance / refactor / docs / test / chore / perf).
- `slug` = 1–2 core nouns, kebab-case, ≤ 20 chars. Drop verb phrases and
  articles; never copy the title.
- The name is load-bearing: `accept` derives the isolation branch and the
  worktree directory by prefixing `ontology-` to the **entire proposal name**
  (the stem): `refactor-ontology-maintenance` yields
  `ontology-refactor-ontology-maintenance`, and a verbose name produces an
  unreadable branch.

| Verbose (forbidden) | Lean (target) |
|---------------------|---------------|
| `consolidate-ontology-maintenance-into-the-ontology-evolution-skill` | `refactor-ontology-maintenance` |
-->

## Metadata

<!--
Mode / Worktree / Branch / Base Commit are recorded by `accept`, Final Commit
by `integrate`; `Stage` advances only through `wopal space evo advance`.
Never hand-edit any of these — the fields stay `(none)` until the mechanism
writes them.
-->

- **Type**: fix
- **Project Path**: .wopal
- **Created**: 2026-10-21
- **Stage**: archived
- **Mode**: isolated
- **Worktree**: .worktrees/ontology-fix-dsh-packages
- **Branch**: ontology-fix-dsh-packages
- **Base Commit**: 888111fefcf94c55290a87e996eb8397324b30ff
- **Final Commit**: c29963b60fcb89ddea89581a4e5300bba64b76ad

## Scope Assessment

- **Complexity**: Medium
- **Confidence**: High — 六条结论全部经源码与运行时交叉核验，D-03 已由用户定案

## Goal

修复三个 DSH 资产包（`dsh-sandbox-roots`、`dsh-web-fetch-http-fakeip`、`dsh/agents-presets`）中可被安装与运行验证证明的缺陷，并纠正其文档契约，使 `dsh/` 在 rc.2 上自洽可交付。

## Technical Context

### Architecture Context

三个资产由 `assembly/archetypes/coding.yaml` 的 `dsh` 条目挂载，属于本体资产，因此走本流程而非 dev-flow。

- `dsh/plugins/dsh-sandbox-roots`：TypeScript 源码包，`main`/`exports` 指向 `lib/`，通过 `cordis.patch.yml` 替换 stock 的 sandbox-policy / sandbox / fs-sandbox 三个条目。
- `dsh/plugins/dsh-web-fetch-http-fakeip`：直接维护官方 `@deepseek-ai/dsh-web-fetch-http@0.2.0-rc.2` 的编译产物 fork，只在 `// Fork (dsh-web-fetch-http-fakeip):` 锚点处增加 fake-IP CIDR 与 entry 级 proxy；本包没有源码构建链与测试链。
- `dsh/agents-presets`：`@wopal/dsh-presets` bundle，`package.json` 的 `dsh.bundle.patch` 注册 `wopal`/`fae`/`rook` 三个 `preset.patch.yml`。

现状问题是：包的可安装性、文档契约与类型声明落后于 rc.2 的实际运行时机制。

### Research Findings

逐条核验 PR #102 的六条评审意见。**结论以源码为准，不以评审的严重级别为准。**

| # | 结论 | 依据 |
|---|---|---|
| 1 | **成立** | `package.json:7` `main: ./lib/index.js`，`files` 亦含 `lib/`；但 `.gitignore:2` 忽略 `lib/`，`prepare: npm run build` 依赖 devDependency `tsdown`。干净 checkout 无 `lib/` 且无 `node_modules` 时，`file:` 安装不可用。 |
| 2 | **成立** | `lib/index.js:532,535` 在走代理前只调用 `isNonPublicIpLiteral()`，该函数仅拦截**IP 字面量**；普通 hostname 不解析即交给代理。上游 rc.2 的 environment-proxy 分支同样不预解析，但上游另有代理路由策略强制 `localhost`/loopback 不走代理、回到公网校验。本 fork 新增的 `proxyUrl` 直接构造代理 dispatcher，不经该路由策略，因此**绕开了上游保留的本机绕过保护**——暴露面大于单纯照搬 upstream。 |
| 3 | **不成立（评审前提错误）** | rc.2 已把 `settings.yaml` 降级为一次性迁移源，公开面是 entry config。评审要求“恢复 writableRoots 的 settings 热重载”基于已删除的 API。但**文档仍在描述该旧契约**，这是真实缺陷，按 Finding #1 之外的独立修复处理。 |
| 4 | **成立** | `lib/index.js:42-49`：`fakeIpRanges` 匹配只写在 `parsed instanceof ipaddr.IPv4` 分支内。`::ffff:198.18.0.1` 的 `kind()` 是 `ipv6`、`range()` 是 `ipv4Mapped`，走 `isIPv4MappedAddress()` 分支后直接返回 `range()==="unicast"`，永不参与 CIDR 匹配。native IPv6 fake 段同理。 |
| 5 | **成立** | runtime schema（`lib/index.js:687,691`）已接受 `fakeIpRanges`、`proxyUrl`；`lib/types/index.d.ts:18-29` 的 `Config` 只有 5 个 stock 字段。 |
| 6 | **成立** | `dsh/agents-presets/wopal/README.md:21,23` 仍要求装到 `$DSH_HOME/.agent-presets/wopal` 并依赖软链；父级 `README.md:3` 明确“运行时仅加载 `preset.patch.yml`，不读取旧 `.agent-presets/<id>` 软链”。 |

运行时交叉核验（`ipaddr.js@2.5.0`）：

```
198.18.0.1        kind=ipv4 range=reserved
::ffff:198.18.0.1 kind=ipv6 range=ipv4Mapped  -> 198.18.0.1
fd00::1           kind=ipv6 range=uniqueLocal
```

**关于基线的一条重要事实**：`.wopal` 的 `dsh/` 与 PR 分支 `8cbd37e` 内容一致，唯一差异是 `.wopal` 侧多出被忽略的 `lib/`、`node_modules/`、`pnpm-lock.yaml`（本地构建残留，`git check-ignore` 证实 `lib/` 被忽略）。也就是说 **Finding #1 在已合并的 main 上同样存在**，只是本地构建把这些文件填上了，掩盖了问题。因此本提案的隔离环境必须是干净派生的 worktree，不能就地验证 `.wopal`。

**References**:
- `dsh/plugins/dsh-sandbox-roots/package.json`
- `dsh/plugins/dsh-sandbox-roots/.gitignore`
- `dsh/plugins/dsh-web-fetch-http-fakeip/lib/index.js`
- `dsh/plugins/dsh-web-fetch-http-fakeip/lib/types/index.d.ts`
- `dsh/agents-presets/package.json`
- `dsh/agents-presets/README.md`
- `dsh/agents-presets/wopal/README.md`

### Key Decisions

- D-01: **不恢复 `settings.yaml` 热重载。** rc.2 的配置面是 entry config + profile `cordis.patch.yml`；评审 Finding #3 的前提不成立。只纠正文档，不新增代码路径。
- D-02: **`lib/` 采用版本管理的预构建产物。** 安装方从干净 checkout 执行 `file:` 安装不应需要 devDependencies；兄弟包 `dsh-web-fetch-http-fakeip` 本就是提交编译产物的形态，保持一致。`pnpm check` 保留为维护者的重建校验链，禁止手改生成 JS。
- D-03: **已定案 —— `public-only`（用户 2026-10-21 批准）。** 产品规则只有一句：**配置代理不扩大 `web_fetch` 的可访问网络范围，它仍然只能抓公网目标。** 本 fork 的两条代理 dispatch 路径——entry `proxyUrl` 与继承的 environment-proxy——都必须先做本地 hostname 公网预检，拒绝 loopback/private/link-local。对 `proxyUrl` 来说，这是补回其绕开的 upstream loopback 保护；对 environment-proxy 来说，这是有意比 upstream 更严格：upstream 只强制 loopback 绕过代理，而本 fork 还拒绝解析到其他非公网地址的普通 hostname。由此带来的兼容性取舍也是决策的一部分：仅代理侧 DNS 能解析、而本机不能解析的名称不再可用。残余边界仍存在——代理会再次自行解析，同一 hostname 在本机与代理侧可能得到不同结果（TOCTOU），实现与文档必须如实写明。
- D-04: **本轮只在 PR worktree 内改动。** Canonical 与 `.wopal` 均不切换分支、不作为实施目录；`.wopal` 的本地 `lib/` 残留不得作为验证依据。
- D-05: **修复分批落地。** Finding #3 的文档纠偏与 #1/#4/#5/#6 相互独立，可先完成；Finding #2 的代码改动排在其后，避免与 Task 3 在同一文件上冲突。

### Key Interfaces

- `dsh-sandbox-roots` 的 `main`/`exports` 路径契约不变（仍指向 `lib/`），改变的是产物是否随包分发。
- `dsh-web-fetch-http-fakeip` 的 runtime Config schema 不变；`Config` 类型补齐到与 schema 一致，不新增字段。
- 本 fork 的代理语义已由 D-03 确定：无论使用 entry `proxyUrl` 还是 environment proxy，普通 hostname 都必须先在本机解析并通过公网检查，才可交给代理；仅代理侧可解析的名称因此不受支持。这是相对当前行为、且对 environment-proxy 相对 upstream 的有意契约变更，评审回复中需明确记录。
- `@wopal/dsh-presets` 的运行入口仅为 `preset.patch.yml`；`.agent-presets/<id>` 软链不再是契约。

## In Scope

- 让 `dsh-sandbox-roots` 的 `file:` 安装在干净 checkout 下自包含可用。
- 把 `dsh-sandbox-roots` 的 README / 双语 AGENTS / design 文档迁移到 rc.2 的 entry-config 契约。
- 修复 `dsh-web-fetch-http-fakeip` 的 IPv6 fake-IP CIDR 判定，并同步 `Config` 类型声明。
- 更新 `dsh/agents-presets/wopal/README.md` 的安装说明到 bundle / `preset.patch.yml` 模型。
- 实现 D-03：entry `proxyUrl` 与 environment-proxy 两条 dispatch 分支都在 dispatch 前拒绝解析到 loopback/private/link-local 的 hostname，并写明本机校验与代理解析之间的残余差异。

## Out of Scope

- **不恢复** `settings.yaml`、`sandbox-policy:` legacy section、`installSection` 或任何 settings 热重载路径——依据 D-01，这是评审前提错误，不是遗漏。
- 不修改 `~/.wopal/ontologies/wopal-space-ontology` 与 `.wopal` 的分支状态（D-04）。
- 不动 live `$WOPAL_HOME/dsh/home`、凭证、会话、附件或现有 profile；任何启动验证都用隔离副本。
- 不修改官方 `@deepseek-ai/dsh-web-fetch-http@0.2.0-rc.2` 参考源码；D-03 的行为分叉只落在本 fork 的编译产物中，其中 entry `proxyUrl` 与继承的 environment-proxy 两条代理分支都应用 `public-only` 预检。
- 不做与 D-03 无关的 web-fetch README 重写、不重生成 preset 内容、不重构 sandbox 行为，这些与六条 finding 无关。
- 不把 c2c 技能相关问题塞进本提案。

## Affected Files

| Component | Files | Operation | Role |
|-----------|-------|-----------|------|
| sandbox package | `dsh/plugins/dsh-sandbox-roots/package.json`, `.gitignore`, `lib/**` | modify / create | 让包自带可执行入口，安装期不再依赖 dev-only 构建器 |
| sandbox docs | `dsh/plugins/dsh-sandbox-roots/README.md`, `AGENTS.md`, `AGENTS.zh-CN.md`, `docs/design.md` | modify | 删除已失效的 settings.yaml / installSection 契约，改写为 entry-config |
| web-fetch runtime | `dsh/plugins/dsh-web-fetch-http-fakeip/lib/index.js` | modify | 修复 IPv6 fake CIDR；按 D-03 增加代理 hostname 校验 |
| web-fetch types | `dsh/plugins/dsh-web-fetch-http-fakeip/lib/types/index.d.ts` | modify | `Config` 与 runtime schema 对齐 |
| web-fetch docs | `dsh/plugins/dsh-web-fetch-http-fakeip/README.md` | modify | 写明 `public-only` 代理预检、仅代理侧 DNS 名称不受支持及 TOCTOU 残余边界 |
| preset docs | `dsh/agents-presets/wopal/README.md` | modify | 用 bundle / `preset.patch.yml` 安装模型替换旧软链说明 |

## Assembly Intent

| Ref | Scope | 理由 |
|-----|-------|------|

## Acceptance Criteria

### Agent Verification

1. [x] 新派生的干净 checkout 中，`lib/**` 是 Git 跟踪的预构建产物而非本地残留；在不提供 `node_modules` 的临时副本中执行打包仍成功，产物包含 `main` 与 `exports` 所需的全部 `lib/**`，且不会因缺少 `tsdown` 触发安装期构建；维护者依赖就绪时 `pnpm check` 通过且重建后 `lib/**` 与提交产物一致。 — 实证（本轮复核）：`prepare` 已从 `package.json` 删除，`.gitignore` 仅剩 `node_modules/`、`pnpm-lock.yaml`；`lib/{index,fs,sandbox,roots-D5oqnWlf}.js` 四个文件由 Git 跟踪；`pnpm check` 通过（`tsc --noEmit` 无错、4 文件 28 测试全绿、tsdown 重建 4 个入口）；重建后 `git status --porcelain .` 零行、`git diff -- lib/` 为空，产物与提交一致；`npm pack --dry-run` 共 8 项，含全部 4 个 `lib/` 文件，`main` 与 `exports` 指向的路径均在包内。
2. [x] `dsh-sandbox-roots` 四份文档不再把 `$DSH_HOME/settings.yaml`、`installSection`、`sandbox-policy:` 描述为**当前**配置源；首次出现处明确指向 `sandbox-roots-policy` entry config / profile `cordis.patch.yml`；源码中无新增 legacy settings 路径。 — 实证（本轮复核）：`grep -rn "settings.yaml\|installSection\|sandbox-policy:"` 在包内命中 10 处，逐条核对全部为「rc.2 已移除 / 一次性迁移源 / 不再作为配置来源」的否定式或历史说明；`sandbox-roots-policy` 命中 9 处，首次出现处（`README.md:7`、`AGENTS.md:9`、`AGENTS.zh-CN.md:8`）均指向 entry config / profile `cordis.patch.yml`；源码与脚本中无新增 legacy settings 路径。
3. [x] 配置 native IPv6 fake CIDR 时，该段内地址通过 fake-range 判定；IPv4-mapped IPv6 按其嵌入 IPv4 与 IPv4 fake CIDR 一致处理；未列入 fake range 的 private/reserved 地址仍被拒绝。 — 实证（本轮复核）：对 `isPublicIpAddress()` 用 `ipaddr.js` 复跑 13 例探针全通过，含修复点 `::ffff:198.18.0.1` → true（先 `toIPv4Address()` 再匹配 `198.18.0.0/15`）、native IPv6 `fd00::1` → true；`10.0.0.1`、`127.0.0.1`、`::ffff:127.0.0.1`、`::1`、`fe80::1`、`2001:db8::1`、`169.254.169.254` 全部 false；`fc00::1` 落在配置范围外时仍被拒。`node --check lib/index.js` 通过。
4. [x] `lib/types/index.d.ts` 的 `Config` 精确包含 `fakeIpRanges?: string[]` 与 `proxyUrl?: string`，且不包含 runtime schema 未支持的字段。 — 实证（本轮复核）：`lib/types/index.d.ts` 的 `Config` 与 runtime `z.object`（`lib/index.js:694-707`）逐字段对齐，两侧同为 7 项：`maxResponseBytes`、`maxBodyChars`、`timeoutMs`、`maxRedirects`、`userAgent`、`fakeIpRanges?: string[]`、`proxyUrl?: string`，无一方缺失或多余的字段。
5. [x] 按 D-03（`public-only`）：entry `proxyUrl` 与 environment-proxy 两条 `requestVia` 路径都在 dispatch 前拒绝解析到 loopback/private/link-local 的 hostname；公网 hostname 与配置的 fake-IP 路径仍正常发送；仅代理侧可解析而本机不可解析的名称被拒；本机校验与代理解析之间的残余差异（TOCTOU）在 README 与代码注释中写明。 — 实证：`lib/index.js:539-551` 在 `proxiedDispatcher !== undefined` 分支内先 `await this.resolveAddresses(...)` 再 `requestVia(...)`，entry `proxyUrl` 与继承的 environment proxy 共用该分支，非公网即抛 `WEB_BLOCKED_URL`，返回地址被丢弃、不传给代理；隔离假代理探针 7/7 通过（`localhost`、`169.254.169.254`、解析到 private 的 hostname 均 BLOCKED 且 dispatcher hits=0；fake-IP 与 public 正常发送），对照 HEAD 旧代码漏放 3 例；TOCTOU 与「仅代理可解析的名称不受支持」写在 `lib/index.js:541-549` 注释及双语 README。
6. [x] `dsh/agents-presets/wopal/README.md` 的安装说明与父级 bundle 一致：通过 bundle 安装并加载 `wopal/preset.patch.yml`，不再声明运行时依赖 `.agent-presets/wopal` 软链。 — 实证（本轮复核）：`dsh/agents-presets/wopal/README.md:21` 的安装段改为「加载 `@wopal/dsh-presets` bundle 中的 `wopal/preset.patch.yml`」，并明确「旧 `.agent-presets` 软链不再是加载入口」；包内其余 `.agent-presets` 命中均为「不再读取 / 不依赖」的否定式或迁移历史说明。
7. [x] 本提案的改动仅位于提案记录的工作分支；canonical 与 `.wopal` 未被本提案改动；对无 `check` script 的包，验证记录写明该事实并附替代验证结果。 — 实证：全部改动位于 `ontology-fix-dsh-packages` 工作分支（isolation worktree）；canonical checkout 的 `git status --porcelain` 为 0 行，本提案未向 `.wopal` 写入任何路径；`dsh-web-fetch-http-fakeip` 的 `package.json` 无 `scripts` 字段（即无 `check` script），Task 5 的 `Verified` 已写明该事实并以 `node --check` 与隔离运行时/代理探针替代。

### User Validation

N/A。本提案的验收均可脚本化（pack 清单、语法检查、隔离运行时探针、文档扫描）；D-03 已定案为 `public-only`，代理行为由隔离探针验证，不需要额外的用户观察场景。

## Implementation

### Task 1: 让 dsh-sandbox-roots 的 file 安装自包含

**Verification Intent**: AC#1, AC#7

**Behavior**:
- 从新派生的干净 checkout 安装时，Git 已提供 `main`/`exports` 指向的 `lib/**`；安装方无需 `node_modules` 或 devDependency `tsdown`，也不会因 `prepare` 触发构建而失败。
- 维护者仍可用 `pnpm check` 从 `src/` 重建 `lib/`；生成物必须与源码一致。

**Pre-read**: `dsh/plugins/dsh-sandbox-roots/package.json`, `.gitignore`, `tsdown.config.ts`, `AGENTS.md`

**Design**: 按 D-02 版本管理 `lib/**`，并把 `prepare` 从安装期路径中移除（或改为不依赖 devDependency 的形式）。不引入新的 runtime dependency。

**TDD**: false — 打包与生命周期契约，伪造 RED 单测无回归价值；用干净 pack/install 探针与既有 `pnpm check` 验证。

**Changes**:
1. 调整 `.gitignore` 与 `package.json` 的 `files`/`prepare`，使 `lib/**` 随包分发且安装不触发 dev 构建。
2. 从干净副本重建 `lib/**` 并纳入版本管理。

**Verify**:
```sh
cd dsh/plugins/dsh-sandbox-roots
pnpm check
git diff --exit-code -- lib
npm pack --dry-run --json
node -e "import('./lib/index.js').then(() => console.log('sandbox-roots import ok'))"
```
pack 清单须含 `lib/index.js`、`lib/fs.js`、`lib/sandbox.js` 及共享 chunk（如有）。另在 `.wopal-space/.tmp/` 创建不含 `node_modules` 的 tracked-file 副本执行 `npm pack --dry-run --json`，证明安装方不依赖 devDependencies。

**Done**:
Task output: dsh-sandbox-roots 从干净 checkout 直接携带可执行 `lib/**`，安装不依赖 dev-only 构建器，维护者重建结果与提交产物一致。
Files touched: dsh/plugins/dsh-sandbox-roots/.gitignore, package.json, README.md, AGENTS.md, AGENTS.zh-CN.md, docs/design.md, lib/index.js, lib/fs.js, lib/sandbox.js, lib/roots-D5oqnWlf.js
Verified: 移除 `prepare` 与 `lib/` 忽略；`lib/**` 纳入版本管理。验证：`pnpm check` 4 文件 28 测试通过；重建后 `lib/` 无 diff；`npm pack --dry-run` 8 项含全部 4 个 lib 文件；`git check-ignore` 确认不再忽略。
- [x] The implementation agent has completed all development and verification steps above.
- [x] Wopal verified the task and backfilled this record.

---

### Task 2: 把 sandbox-roots 文档迁移到 rc.2 entry-config 契约

**Verification Intent**: AC#2, AC#7

**Behavior**:
- 四份文档不再声称 `writableRoots` 来自 `$DSH_HOME/settings.yaml`、`sandbox-policy:` 或 `installSection` 热重载。
- 文档与代码一致：`writableRoots` 位于 `sandbox-roots-policy` 的 Config，持久化在 profile `cordis.patch.yml`。

**Pre-read**: `dsh/plugins/dsh-sandbox-roots/src/index.ts`, `cordis.patch.yml`, `README.md`, `AGENTS.md`, `AGENTS.zh-CN.md`, `docs/design.md`

**Design**: 仅纠偏契约描述。允许保留明确标注为“旧版/已移除”的历史说明，但不得表述为当前行为。

**TDD**: false — 文档纠偏，用文本扫描 + 代码契约比对验证。

**Changes**:
1. 改写四份文档中失效的 settings 契约段落。

**Verify**:
```sh
grep -R -nE 'settings\.yaml|installSection|sandbox-policy:' \
  dsh/plugins/dsh-sandbox-roots/{README.md,AGENTS.md,AGENTS.zh-CN.md,docs/design.md} || true
grep -R -n 'sandbox-roots-policy' \
  dsh/plugins/dsh-sandbox-roots/{README.md,AGENTS.md,AGENTS.zh-CN.md,docs/design.md}
```
第一条若有命中，必须逐条确认是历史说明而非当前契约。

**Done**:
Task output: sandbox-roots 文档只描述 rc.2 的 entry-config / profile patch 现行配置契约。
Files touched: dsh/plugins/dsh-sandbox-roots/README.md, AGENTS.md, AGENTS.zh-CN.md, docs/design.md
Verified: 四份文档改写为 `sandbox-roots-policy` entry config。验证：`settings.yaml|installSection|sandbox-policy:` 7 处命中全部为「旧版已移除」历史说明；`sandbox-roots-policy` 7 处命中。
- [x] The implementation agent has completed all development and verification steps above.
- [x] Wopal verified the task and backfilled this record.

---

### Task 3: 修复 fake-IP IPv6 判定并同步 Config 类型

**Verification Intent**: AC#3, AC#4, AC#7

**Behavior**:
- 同地址族的 IPv6 CIDR 对 `fakeIpRanges` 生效。
- IPv4-mapped IPv6 按其嵌入 IPv4 参与 fake-range 判定，使 `198.18.0.0/15` 这类配置不因表示法失效。
- 仅配置范围被视为允许；其余 private/reserved 仍走 stock blocked 语义。
- `Config` 增加 `fakeIpRanges?: string[]` 与 `proxyUrl?: string`。

**Pre-read**: `dsh/plugins/dsh-web-fetch-http-fakeip/lib/index.js`, `lib/types/index.d.ts`, `package.json`, `AGENTS.md`

**Design**: 把 fake-range 匹配提到两个地址族共用的位置，对 mapped 地址先解包再匹配，替代当前只覆盖 `instanceof IPv4` 的写法。保留 Fork 意图锚点。

**TDD**: false — 该包无源码构建链与测试链；用语法检查加隔离 runtime 探针补足验证。

**Changes**:
1. 重构 `isPublicIpAddress()` 的 fake-range 判定，覆盖 native IPv6 与 IPv4-mapped。
2. 补齐 `Config` 声明。

**Verify**:
```sh
node --check dsh/plugins/dsh-web-fetch-http-fakeip/lib/index.js
grep -nE 'fakeIpRanges\?: string\[\]|proxyUrl\?: string' \
  dsh/plugins/dsh-web-fetch-http-fakeip/lib/types/index.d.ts
```
另需在隔离安装的 rc.2 runtime 中做三组探针：IPv6 fake CIDR 内的地址不再以 `WEB_BLOCKED_URL` 被拒；mapped fake 地址与对应 IPv4 CIDR 结论一致；未配置的 ULA/loopback 仍被拒。

**Done**:
Task output: fake-IP CIDR 对 native IPv6 与 IPv4-mapped IPv6 生效，Config 类型与 runtime schema 对齐。
Files touched: dsh/plugins/dsh-web-fetch-http-fakeip/lib/index.js, lib/types/index.d.ts
Verified: mapped 地址先解包再匹配 CIDR，两族共用同一判定。验证：7 例探针全对（含 198.18.0.1、::ffff:198.18.0.1、fc00::/7 内 ULA 放行；无 range 的 ULA、127.0.0.1、mapped loopback 拒绝）；`node --check` 通过。
- [x] The implementation agent has completed all development and verification steps above.
- [x] Wopal verified the task and backfilled this record.

---

### Task 4: 更新 wopal preset bundle 安装说明

**Verification Intent**: AC#6, AC#7

**Behavior**:
- `wopal/README.md` 改为从 `@wopal/dsh-presets` bundle 安装，运行入口是 `wopal/preset.patch.yml`。
- 删除“装到 `$DSH_HOME/.agent-presets/wopal`、改动经软链生效”的旧说明。

**Pre-read**: `dsh/agents-presets/package.json`, `README.md`, `wopal/README.md`, `wopal/preset.patch.yml`

**Design**: 纯文档修复，与该 finding 范围对齐。

**TDD**: false — 纯文档。

**Changes**:
1. 改写 `wopal/README.md` 的安装与运行入口段落。

**Verify**:
```sh
grep -nE '\.agent-presets/wopal|软链.*运行时' dsh/agents-presets/wopal/README.md || true
grep -nE 'dsh plugin|preset\.patch\.yml|@wopal/dsh-presets' dsh/agents-presets/wopal/README.md
```

**Done**:
Task output: wopal preset 安装说明与 bundle / `preset.patch.yml` 运行模型一致，不再依赖旧软链。
Files touched: dsh/agents-presets/wopal/README.md
Verified: 安装段改为 `@wopal/dsh-presets` bundle。验证：旧软链说法零命中；bundle 与 `preset.patch.yml` 说明命中第 21 行。
- [x] The implementation agent has completed all development and verification steps above.
- [x] Wopal verified the task and backfilled this record.

---

### Task 5: 在代理 dispatch 前拒绝非公网 hostname（D-03 = public-only）

**Verification Intent**: AC#5, AC#7

**Behavior**:
- entry `proxyUrl` 与 environment-proxy 两条代理分支都在把请求交给 dispatcher 之前完成本地 hostname 预检：解析到 loopback / private / link-local 的名称一律拒绝。
- 公网 hostname 照常发送；配置在 `fakeIpRanges` 内的地址照常放行。
- 仅代理侧 DNS 能解析、本机 DNS 不能解析的名称不再发送；这是 D-03 `public-only` 的已知兼容性取舍，不作为回退到 trusted-proxy 的理由。
- 本机校验与代理解析之间的残余差异（TOCTOU）写进 README 与代码注释，不假装已经消除。

**Pre-read**: `dsh/plugins/dsh-web-fetch-http-fakeip/lib/index.js`（`isNonPublicIpLiteral`, `forkDispatcher`, `requestOnce`, `resolvePublicAddresses`）, `AGENTS.md`, `README.md`, `cordis.patch.yml`

**Design**: 复用 `HttpFetchProvider` 现有的 `this.resolveAddresses` seam（默认实现为 `resolvePublicAddresses()`），不要另写地址分类逻辑。它会解析完整答案集，并在任一结果为非公网时抛 `WEB_BLOCKED_URL`；Task 3 完成后，同一判定也会把配置的 `fakeIpRanges` 视为允许范围。对 entry `proxyUrl` 与 environment-proxy 两个 `requestVia` 分支，都在 dispatch 前调用这道预检并丢弃返回地址集，再按原代理 dispatcher 发送。**这里仅做预检，不做连接 pinning**：真正的地址 pinning 只存在于直连 `requestPinned()`；代理仍会自行 DNS，因此必须保留 TOCTOU 说明。若复用后使 `resolvePublicAddresses()` 现有“返回地址是 transport 唯一可用地址”的注释失真，同步修正文档/注释并保留 `// Fork (dsh-web-fetch-http-fakeip):` 意图锚点。不要修改 upstream 参考仓库。

**TDD**: false — 该包无源码构建链与测试链；用隔离代理探针代替。

**Changes**:
1. entry `proxyUrl` 与 environment-proxy 两条分支都在 `requestVia` 前调用现有 resolver seam 做公网预检，非公网即抛 `WEB_BLOCKED_URL`；返回地址不传给代理、不宣称已 pin。
2. README 与 Fork 注释写明 D-03 规则与 TOCTOU 残余边界。

**Verify**:
```sh
node --check dsh/plugins/dsh-web-fetch-http-fakeip/lib/index.js
```
另需隔离代理探针，分别覆盖 entry `proxyUrl` 与 environment-proxy 两条路径，证明四件事：`localhost` 与解析到 private 的 hostname 在 dispatcher 收到请求前被拒；本机不可解析的 proxy-only hostname 不会到达 dispatcher；公网 hostname 仍可发送；配置的 fake-IP 地址仍被放行。该包 `package.json` 无 `check` script，记录中写明这一点。

**Done**:
Task output: 两条代理 dispatch 路径都执行 `public-only` 本地预检，同时明确预检不等于 pinning、代理侧 DNS 仍存在 TOCTOU。
Files touched: dsh/plugins/dsh-web-fetch-http-fakeip/lib/index.js, README.md, README.zh.md, README.i18n.yaml
Verified: 两条代理路径统一走 `resolveAddresses()` 预检后再 `requestVia`。该包 `package.json` 无 `check` script，故以 `node --check` 与隔离运行时/代理探针替代。验证：本地假代理探针 7/7 通过（localhost、169.254.169.254、解析到 private 均 BLOCKED 且 dispatcher hits=0；fake-IP 与 public 正常发送）；对照 HEAD 旧代码 3 例漏放；TOCTOU 在代码注释与双语 README 写明。
- [x] The implementation agent has completed all development and verification steps above.
- [x] Wopal verified the task and backfilled this record.

---

## Delegation Strategy

| Wave | Task | Executor | Depends on | Why delegated |
|------|------|----------|------------|---------------|
| 1 | Task 1 | fae | `accept` 完成 | 决定包的可安装边界，后续文档据此描述 | ✅
| 1 | Task 3 | fae | `accept` 完成 | 与 Task 1 无耦合，可并行 | ✅
| 1 | Task 4 | fae | `accept` 完成 | 独立文档修复，风险低 | ✅
| 2 | Task 2 | fae | Task 1 | 文档必须描述最终确定的安装契约 | ✅
| 2 | Task 5 | fae | Task 3 完成 | 与 Task 3 改同一文件，串行可保持 diff 可审查 | ✅

## Delivery

`space sync` 和 `ontology contribute` 由用户决定，技能不会自行上传。PR #102 的后续提交与回复同样等用户明确指示。
