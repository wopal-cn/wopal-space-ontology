# 实施评审手册 — 常见问题模式与排查方法

四个核心问题背后的具体排查方法。当某项检查需要详细步骤、常见问题清单或具体案例时，加载本文件。

目录：
1. [通读一遍建立三张清单](#1-通读一遍建立三张清单)
2. [Q1 半成品与未接通代码排查](#2-q1--半成品与未接通代码排查)
3. [Q2 对外接口与共用逻辑排查（防误伤）](#3-q2--对外接口与共用逻辑排查防误伤)
4. [Q3 常见 Bug 与边界漏洞清单](#4-q3--常见-bug-与边界漏洞清单)
5. [Q4 测试有效性与文档同步](#5-q4--测试有效性与文档同步)
6. [Q4 精简度标签（Lean tags）](#6-q4--精简度标签lean-tags)
7. [批量排查命令（Probes）](#7-批量排查命令probes)
8. [能力资产规范检查（进化提案）](#8-能力资产规范检查进化提案)
9. [严重度判定参考](#9-严重度判定参考)
10. [评审实例](#10-评审实例)

---

## 1. 通读一遍建立三张清单

先把改动（`git diff`、`git diff --cached`、`git show <hash>` 或 `git diff <A>..<B>`）和被修改的文件完整读一遍。不要边读边跑搜索命令来回切换——反复重读文件最浪费上下文。在通读过程中顺手建好三张清单：

1. **承诺清单（Claims）**——每条要交付的功能或验收标准（Plan / 提案里定下的目标，或本次改动声称要做的事）。
2. **对外接口（Contract surface）**——diff 改动的每个导出函数/类、参数与返回值、数据结构（schema）、共享类型、配置项，外加**参数没变但内部逻辑变了**的函数。
3. **疑点标记（Flags）**——读代码时顺手记下的疑似半成品、没接通的入口、假测试、冗余代码或被替换掉的旧引用，留到后面集中核实。

建好清单后，四个问题全部围绕这三张清单做定点核实，绝不回头重扫已经读过的文件。

## 2. Q1 — 半成品与未接通代码排查

搜到特征词只是线索，不是最终结论——要按**"承诺的功能或调用方是不是真的依赖这段逻辑"**来定性。

**注释占位（未完成的 TODO）**
```javascript
// TODO: implement later
// FIXME: this is broken
// HACK: temporary
// PLACEHOLDER
// ... (该写业务逻辑的地方是空的)
```
排查命令：`rg -n 'TODO|FIXME|XXX|HACK|PLACEHOLDER' <被改文件>`

**占位文案**
```
"placeholder"   "lorem ipsum"   "coming soon"   "under construction"
"TBD"           "Not implemented"
```
排查命令：`rg -ni 'placeholder|lorem ipsum|coming soon|under construction|TBD|not implemented' <被改文件>`

**空实现**
```javascript
return null   return undefined   return {}   return []
```
```python
pass   return None   return {}   return []
```
排查命令：`rg -n 'return null|return undefined|return \{\}|return \[\]|pass\s*$' <被改文件>`——有些场景确实该返回空值；要看调用方或承诺的功能是不是指望它返回真实数据。

**只打日志不干活的函数**——函数体里只有日志打印或原样转发，没有实际业务处理。逐个检查新增或修改的 handler。

**写死的假动态值**
```jsx
<div>Message 1</div>        // 本应从 state/props 读取
const id = "fixed-id"       // 本应动态生成
const count = 3             // 本应计算得出
```
对照承诺清单定性：如果功能要求是动态数据，代码里却写死常量，直接标 **BLOCKER**。

**前端空壳组件**
```jsx
return <div>Component</div>
return <p>Coming soon</p>
return null
onClick={() => {}}
onSubmit={(e) => e.preventDefault()}
```

**API 路由空壳**
```typescript
export async function GET() { return Response.json([]) }   // 写死空数组，根本没查数据源
export async function POST() { return new Response() }     // 空响应体
```

**数据库表结构缺失**——数据模型缺少完成该功能必需的字段或关联关系。

**Hook / 工具函数空壳**
```typescript
export function useAuth() { return { user: null, login: () => {}, logout: () => {} } }
```

**新写代码的接通检查（防"写了但没接上"）：**
- 声明了 → 有地方 import（`rg <symbol>`）
- import 了 → 真正调用了（不只是写在文件头）
- 调用了 → 从真实入口可达（路由、页面渲染树、CLI 命令、定时任务入口）
- 组件 → 数据源：请求确实 `await` 了、拿到数据了、渲染出来了
- 状态 → 界面：state 变量真正出现在渲染输出里
- 接口 → 存储：数据库查询真正执行并把结果返回，而不是查完直接丢弃
- 路由 → 注册：新写的路由/子命令/任务已经在总入口注册，能被框架加载到

## 3. Q2 — 对外接口与共用逻辑排查（防误伤）

这是编译和测试最容易漏掉的地方。最常溜过去的坑是：**函数签名没变但行为悄悄变了**，或者**把以前没写测试的老调用方搞坏了**。

### 第一步——列出所有对外接口与共用逻辑

从 diff 中列出其他代码可能依赖的每一项改动：

- 导出的函数/类——参数、返回类型、抛出的异常
- 数据结构——schema 字段、JSON 返回格式、枚举值、数据库列
- 共享类型 / 常量 / 配置项名称
- **参数和返回类型没变，但内部逻辑变了的函数**——最危险、最隐蔽的一类
- 测试公共设施——fixture、mock、辅助函数（改了它们可能导致原本能抓 bug 的老测试失效）

### 第二步——找出所有调用方

在全项目搜索 `rg <symbol>`，特别注意 **diff 之外**的文件。如果调用方太多，先用 `rg -l <symbol>` 列出文件，挑选几类有代表性的调用点核对，并在报告里如实说明哪些没查完。

### 第三步——核对破坏类型

| 破坏类型 | 重点查什么 |
|---|---|
| 参数/返回值变化 | 增删参数、收窄或放宽类型、修改返回类型。强类型能抓大部分，但遇到 `any`、`as` 强转或动态语言就会漏掉 |
| 空值变化 | 以前保证不返回 `null`/空数组，现在可能返回 `null`（或反过来）。老调用方直接 `.map()` 或链式调用就会崩溃 |
| 同步变异步 | 以前直接返回值，现在返回 Promise；动态语言或没加 `await` 的调用方会静默出错 |
| 顺序变化 | 调用方依赖的数组排序、事件触发顺序、遍历顺序变了 |
| 重复调用副作用变化 | 以前重试是安全的（幂等），现在重试会重复扣款/重复写入（或反过来） |
| 副作用变化 | 以前是纯函数，现在悄悄改了全局状态；或者把调用方依赖的副作用删掉了 |
| 报错方式变化 | 错误码、HTTP 状态码、报错文案格式变了——很多调用方会按报错信息做分支处理 |
| 默认行为变化 | 同样的正常输入，现在走到了别的分支或返回了不一样的结果 |
| 性能骤降 | 高频路径从 O(n) 变成 O(n²)，数据量一大直接卡死 |
| 数据结构未同步迁移 | 字段改名或删除了，但还有老代码在读旧字段名；或者删掉了枚举值 |

对每个调用方问一句：它依赖上面表格里的哪条假设？改完之后这条假设还成立吗？

### 严重度

- diff 之外的调用方在具体输入下会报错或行为错乱 → **BLOCKER**
- 行为确实变了，但可能是按计划有意调整的 → **WARNING** 或放进 `Serious Logic Risks`
- 调用方太多没查全 → 写入 `UNCOVERED STEPS`，绝不假装全查过了

## 4. Q3 — 常见 Bug 与边界漏洞清单

对着改动的每一段代码排查以下问题。**只报告能写出具体触发场景的真实问题。**

**并发与状态冲突**
- 多个异步操作同时读写同一个共享状态，存在竞态条件（race condition）
- 共享计数器或标志位"先检查再修改"（非原子操作），并发下会覆盖彼此结果
- 重复触发：按钮连点或请求重入时，上一次还没跑完又进了下一次
- 半截失败：多步修改里第 1 步已落盘、第 2 步报错退出，没有回滚导致数据残缺
- 闭包拿到了过期的循环变量或旧的 React props/state

**资源未释放**
- 打开的文件句柄、数据库连接、流（stream）没有在所有分支上关闭
- 报错分支漏掉清理（正常走完会关闭，进 `catch` 或提前 `return` 就漏关了）
- 连接池借出的连接没归还（高并发下会把连接池耗尽）
- 每次渲染或每次调用都新建文件监听、定时器、事件订阅，却没有销毁

**边界值与数值计算**
- 范围、数组切片、分页计算的差一错误（off-by-one）
- 空数组、空对象、缺字段时没判空就直接访问属性
- `0`、负数、超大数进入除法、内存分配或数组下标
- 累加器、计数器、缓冲区溢出或未设上限

**异步处理**
- 漏写 `await`（需要等结果或等落盘的地方变成了后台裸跑）
- 未捕获的 Promise 报错（floating promise）
- 乱序覆盖：先发出的慢请求比后发出的快请求晚回来，把新数据覆盖成了旧数据
- 调用外部接口/外部命令没设超时（timeout），网络卡住时永远挂起

**错误处理**
- `catch` 吞掉异常后什么都不做，带着损坏的状态继续往下跑
- 本该立刻中止的操作只打了一行日志就继续执行
- 实际执行失败却返回成功状态（例如 HTTP 200 里包着错误文本，调用方以为成功了）
- 发生部分失败后状态不一致，既没清理也没回滚

**类型与运行时脱节**
- 对未经校验的外部数据直接用 `as` 强制转换类型
- 外部传入的参数还没过校验就直接拿去用
- 某个字段在合法情况下也可能缺失，代码却直接当非空字段用
- `JSON.parse`、环境变量、URL 查询参数没做校验就直接当成强类型结构使用

**安全漏洞**
- 用户输入未做参数化或转义，直接拼进 SQL、Shell 命令或模板
- `innerHTML` / `dangerouslySetInnerHTML` 混入了用户可控内容
- 不安全的反序列化（`eval`、直接反序列化不可信数据）
- 请求体还没做权限和格式校验就被业务代码消费；或者校验逻辑可被绕过
- 新增的接口/命令漏掉了同类接口都有的登录鉴权检查
- 代码、配置文件、日志或报错信息里硬编码或泄露了密钥/Token

排查命令：`rg -n 'eval\(|dangerouslySetInnerHTML|innerHTML|exec\(|spawn\(' <被改文件>`；逐个检查新增的 POST/PUT 接口是否先校验后使用，新增路由是否挂载了鉴权中间件。

## 5. Q4 — 测试有效性与文档同步

### 测试有效性——常见假测试套路

| 假测试模式 | 排查命令 | 判定 |
|---|---|---|
| 被跳过/禁用的测试 | `rg -n 'it\.skip|xdescribe|xit|@pytest\.mark\.skip|t\.Skip' <测试文件>` | 涉及核心承诺功能标 **BLOCKER** |
| 自己证自己（循环证明） | 期望值（expected）是用被测函数自己算出来的 | **BLOCKER** |
| 假断言（占位断言） | `rg -n 'expect\(true\)|expect\(false\)|expect\(1\)'` | **BLOCKER** |
| 弱断言（只查存不存在） | `rg -n 'toBeDefined|toBeTruthy|not\.toBeNull'` | 整个测试文件全是弱断言标 **WARNING**；单条标 INFO |
| 根本没写断言 | `rg -c 'expect\|assert' <file>` 结果为 0 | **WARNING** |
| 只测顺风局，漏掉关键分支 | 直接读测试代码 | 漏测核心异常/边界分支标 **WARNING** |

衡量标准只有一条：**如果把对应的业务功能改坏，这个测试会报错变红吗？** 把功能代码删了还能绿的测试就是摆设。

### 文档未同步

改了对外接口或命令用法，却不更新对应的文档，等于误导用户。直接复用 Q2 整理出的对外接口清单，对每一项变更（API、数据结构、CLI 参数、配置项、行为变化）：

1. 找出文档里写它的地方——`rg '<symbol>' docs/ README* AGENTS.md` 以及公开的注释文档。
2. 检查本次 diff 有没有同步更新这些文档。行为变了但文档没动 → **WARNING**（REVISE：补齐文档更新）。
3. 如果项目规范（如 `AGENTS.md`）明确规定"改代码必须同步改对应文档" → 违反直接标 **BLOCKER**。

纯粹的内部重构、对外行为毫无变化的，不需要改文档。如果文档在当前仓库之外看不到 → 列入 `Needs Human`。

## 6. Q4 — 精简度标签（Lean tags）

用五个标签抓冗余代码。每条问题写一行：位置、删什么、用什么替。**给不出具体替换方案的只是抱怨，不能算问题。**

| 标签 | 抓什么问题 | 替换方案 |
|---|---|---|
| `delete:` | 没人用的死代码、未使用的配置/导出、由于本次重构被弃用的孤儿文件 | 直接删掉，无需替代 |
| `stdlib:` | 标准库或项目已安装的包本来就有，却自己手写了一遍 | 写出标准库/已装包的具体函数名 |
| `native:` | 第三方包或大段代码在干操作系统/运行时自带的功能 | 写出平台自带的具体特性或命令 |
| `yagni:` | 只有一个实现的接口、只造一种对象的工厂、没人传的配置项、只做原样转发的中间层 | 在出现第二个真实需求前，直接内联 |
| `shrink:` | 同一段逻辑可以用更短、更直白的代码写出来 | 给出精简后的具体写法 |

### 重点抓什么

- **本次改动留下的孤儿代码与孤儿测试**：对 diff 里删掉的每一个 `import` 或函数调用，在全项目搜一下（`rg <符号或模块名>`）还有没有生产代码在用。如果生产代码已经是 0 引用（或者只剩它自己的测试文件在测它），必须把**旧模块和它的测试文件**一起标 `delete:`。
- 死代码、大段注释掉的旧代码、没人用的导出（`export`）和命令行参数
- 项目里 0 引用的第三方依赖（全项目搜 `rg <包名>`，注意同时检查静态 `import`、动态 `await import()` 和副作用导入 `import "pkg"`）——标 `delete:` 删掉该依赖
- 手写的重试、格式校验、路径匹配、深拷贝等工具函数，而运行时标准库或已安装的包本来就有——标 `stdlib:`
- 只做一层透传的包装函数、单产品工厂、单实现接口——标 `yagni:`
- 两处写了完全一样的逻辑，删掉一处直接复用另一处即可——标 `delete:` 或 `shrink:`，并指明保留哪一处
- 用一行内置方法就能替代的冗长手写循环——标 `shrink:` 并给出简写方案

### 提出 `stdlib:` 与 `native:` 替换前的兼容性核查

在建议用标准库或系统命令替换前，必须核实两件事：
1. **运行时最低版本**：查看 `package.json` 的 `engines`、`pyproject.toml` 的 `requires-python`、`go.mod` 等，确认该内置 API 在项目支持的最低版本中已经存在（例如 `path.matchesGlob` 需要 Node >=20.17 / >=22.5）。
2. **跨平台兼容性**：如果 `native:` 建议调用系统外部命令（如 `zip`、`tar`、`sed`），确认该项目支持的所有目标操作系统（macOS / Linux / Windows）默认都自带该命令和对应参数。

### 绝对不要标为冗余的内容

- 能护住核心逻辑的最精简测试——一个冒烟测试、一条 `assert` 自检、一个小巧的单元测试文件。那是质量底线，不是赘肉。
- 外部输入边界上的安全校验、防止数据丢失的错误处理、权限与安全防护——绝不能为了省行数而删减。
- 纯个人偏好（"换我写会换一种目录结构"）、变量起名风格、代码格式偏好。

### 严重度

| 情形 | 严重度 |
|---|---|
| 本次 diff 切换了调用方，导致被替换的旧代码/旧测试在生产代码中变成 0 引用（本次制造的孤儿） | **WARNING**（REVISE） |
| 重复造轮子——项目里明明已有现成实现（报告需点名具体的 `file:line`） | **WARNING**（REVISE） |
| 标准库或几行代码就能搞定，却新引入了一个重量级第三方依赖 | **WARNING**（REVISE） |
| 历史遗留的死代码 / 没人用的依赖（或在全仓瘦身审查模式下） | INFO（如果掩盖了功能缺失则升为 WARNING） |
| 单实现接口、提前透支的扩展点 | INFO |
| `shrink:` 代码简化建议 | INFO |

**先保正确，再求精简**——绝不能为了省几行代码牺牲正确性。如果某条精简建议与 Q1–Q3 的正确性/安全性冲突，无条件保正确性，放弃该精简建议。

### 汇总指标

报告末尾附上：`net: -N lines, -M dependencies possible`（合计可精简的真实代码行数与依赖数）。如果代码已经很干净，写 `Lean already. Ship.`。

## 7. 批量排查命令（Probes）

### 改动审查命令（模式 1 与模式 2 — 针对 Diff）

通读完 diff 后，针对被修改的文件一次性运行以下命令（把 `<被改文件>` 替换为实际路径）：

```bash
FILES='<被改文件>'
rg -n 'TODO|FIXME|XXX|HACK|PLACEHOLDER' $FILES
rg -ni 'placeholder|lorem ipsum|coming soon|under construction|TBD|not implemented' $FILES
rg -n 'return null|return undefined|return \{\}|return \[\]|pass\s*$' $FILES
rg -n 'console\.log|print\(' $FILES
rg -n 'eval\(|dangerouslySetInnerHTML|innerHTML|exec\(|spawn\(' $FILES
rg -n 'it\.skip|xdescribe|xit|describe\.skip|@pytest\.mark\.skip|t\.Skip' $FILES
rg -n 'expect\(true\)|expect\(false\)|expect\(1\)' $FILES
rg -n 'toBeDefined|toBeTruthy|toBeFalsy|not\.toBeNull' $FILES
```

- **调用方排查（Q2）**：对 diff 修改的每个导出函数/类/类型，运行 `rg -l '<符号名>' <项目路径>` 找出所有调用方（重点看 diff 之外的文件）。
- **孤儿代码排查（Q4）**：对 diff 中**删掉**的每个 `import` 或旧函数调用，运行 `rg -l '<旧模块或旧函数名>' <项目路径>`，检查它是否已经变成 0 生产引用（以及它的测试文件是否成了孤儿测试）。
- **精简度排查（Q4）**：运行 `rg -n 'class |interface |factory' $FILES` 排查过度抽象，并检查本次新增的每个第三方依赖在项目里的实际引用次数。

### 全仓瘦身扫描命令（模式 3 — Repo audit，针对现有项目或目录）

当不看 diff、直接对现有项目或目录做**全仓瘦身审查（Repo audit）**时，先跑以下静态扫描命令把底数摸清，避免纯靠肉眼漏掉孤儿文件或误判动态导入：

1. **核对依赖清单与实际引用次数**：
   - 读取 `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod`。
   - 对每个生产依赖，在源码目录（如 `src/`）统计引用次数（`rg '<包名>' src/`），注意同时排查静态 `import`、动态 `await import('<包名>')` 以及副作用导入 `import '<包名>'`。
   - 0 引用的依赖标 `delete:`；只在 1 个地方用到且能被标准库几行代码替代的标 `stdlib:` 或 `native:`。
2. **扫描 0 引用的孤儿文件**：
   - 列出 `src/` 下所有非入口文件，检查每个文件名（去掉后缀）在 `src/` 下是否有被其他文件引用。
   - 如果某个源文件在 `src/` 下是 0 引用，只有 `tests/` 里的测试文件在引用它，说明它是**死代码配孤儿测试**——把源文件和对应测试文件一起标 `delete:`。
3. **扫描 0 外部引用的导出符号（死导出）**：
   - 提取 `src/` 下所有的 `export function|const|class|type|interface` 名称，统计每个符号在 `src/` 下的被引用文件数。
   - 只有定义文件自己用到（或只有测试文件用到）的导出，标 `delete:`（若文件内部自用则去掉 `export`，若内部也不用则整段删掉）。
4. **排查单实现抽象与冗余大文件**：
   - 运行 `rg -n 'interface |abstract class |Factory|Manager|Adapter' src/`，并按行数排序查看最大的源文件（`wc -l`）。
5. **排查遗留欠账标记、跳过测试与过期文档（分析技术债时必跑）**：
   - 运行 `rg -n 'TODO|FIXME|XXX|HACK|PLACEHOLDER' src/` 和 `rg -n 'it\.skip|xdescribe|xit|describe\.skip|@pytest\.mark\.skip|t\.Skip' tests/`，把代码里留下的半成品欠账和失效测试一并揪出来。
   - 报告按收益从高到低分组输出：**可删减的依赖** → **死文件与死导出（`delete:`）** → **标准库/原生替换（`stdlib:` / `native:`）** → **过度抽象与重复逻辑（`yagni:` / `shrink:`）**（如有遗留 `TODO`/失效测试/过期文档则单列一组**遗留欠账与测试/文档缺口**），末尾汇总 `net: -N lines, -M dependencies possible`。

## 8. 能力资产规范检查（进化提案）

当传入的参数包含进化提案（evolution proposal）路径时，说明本次落地的是空间的能力资产（技能、规则、Agent）。对照平台规范逐项检查落地文件：

| 规范要求 | 检查方法 |
|---|---|
| 文件头包含 `name` + `description` | 直接读文件开头的 YAML frontmatter |
| 触发条件写在 `description` 里 | `description` 明确写了什么场景下触发；不能把触发时机藏在正文后半截 |
| 正文只留工作流 + 输出格式 + 核心红线 | 没有长篇大论的说教或背景铺垫；详细目录和长篇案例下沉到 `references/` |
| `scripts/` 只放确定性、可复用的脚本 | 一次性命令片段不要塞进 `scripts/` |
| 目录结构守规矩 | 目录和文件命名与其他技能保持一致，不自创奇怪的子目录或文件格式 |
| 说人话、指令明确 | 无论是人还是 Agent，读一遍就能明白具体步骤；满篇技术黑话、翻译腔或模棱两可的表述直接作为问题报出 |

严重度：违反上述规范要求 → **WARNING**（REVISE）；落地后根本无法正常工作（如缺 frontmatter、引用的文件不存在）→ **BLOCKER**。

这项检查与 `df-proposal-review` 前后呼应：提案评审查的是**计划写得对不对**，这里查的是**实际写出来的文件合不合格**。

## 9. 严重度判定参考

| 具体场景 | 正确判定 |
|---|---|
| 函数只打了一行日志，但承诺的功能是"处理并保存消息" | BLOCKER（Q1 半成品空壳） |
| 函数逻辑写对了，但全项目没有任何地方调用它 | WARNING（Q1 写了没接通） |
| Diff 把工具函数的空输入返回值从 `[]` 改成了 `null`，而 diff 外有调用方直接对返回值调 `.map()` | BLOCKER（Q2 破坏现有调用方） |
| 接口原本报错返回 4xx，现在改成返回 HTTP 200 带错误对象，导致按状态码判断的调用方失效 | 按影响定 WARNING 或 BLOCKER（Q2） |
| 验证某项核心承诺功能的唯一测试被标了 `.skip` | BLOCKER（Q4 假测试） |
| 测试里写 `expect(true).toBe(true)` | BLOCKER（Q4 假断言） |
| 测试里先写了 `toBeDefined`，后面紧跟着两条具体的值断言 | 正常，不报错 |
| 4 行简单的输入清洗逻辑在两处出现，且规则稳定 | 正常，不报错 |
| 两处复制粘贴的校验逻辑已经出现不一致（改了一处漏了另一处） | WARNING（Q4 逻辑分叉） |
| 数据库查询执行了，但返回结果被丢弃，直接返回写死的 `{ ok: true }` | BLOCKER（Q1 假实现） |
| 删掉了一个还在被别处 import 的函数（编译或打包会直接报错） | 不报——编译报错归 CI 管 |
| 两个异步写操作存在明确的交错覆盖场景 | BLOCKER（Q3 并发竞态） |
| 代码能跑通，但违反了设计文档明确写死的边界约束（标了"必须/严禁"的规则） | BLOCKER（Q1 违反设计约束） |
| 改了文档里明确描述的接口参数或行为，但 diff 里没改文档 | WARNING（Q4 文档未同步） |
| 新建的 `retry.ts` 与项目已有的 `src/lib/http.ts:88` 退避重试逻辑重复 | WARNING（Q4 重复造轮子） |
| Diff 把命令从调 `lib/doctor.ts` 改成调 `lib/inspect.ts`，导致 `lib/doctor.ts` 和 `tests/lib/doctor.test.ts` 在生产代码中变成 0 引用 | WARNING（Q4 `delete:` 本次改动留下的孤儿代码与测试） |
| `package.json` 里装着 `eventsource`，但 `rg 'eventsource' src/` 显示 0 引用 | INFO（Q4 `delete:` 移除无用依赖） |
| 定义了 `AbstractStore` 接口，但全项目只有一个 `FileStore` 实现 | INFO（Q4 `yagni:` 单实现接口） |
| 新落地的技能把触发条件藏在正文第 4 节，没写进 `description` | WARNING（能力资产规范） |
| 新落地的技能文件头缺少 `description` 字段 | BLOCKER（能力资产规范） |
| 担心改完后的界面样式好不好看 | 列入 `Needs Human`（请人眼确认） |
| "要是让我写，我会换一种模块划分方式" | 个人偏好，不报错 |

裁决规则：只要有 1 条 Blocker → **BLOCK**；没有 Blocker 但有 Warning → **REVISE**；其余 → **PASS**。按问题性质裁决，不搞凑数计分。

## 10. 评审实例

### 实例 A — Q1 抓到的半成品空壳

**承诺功能**："从数据库读取消息列表"。代码里有路由文件：

```typescript
// api/messages/route.ts:8
export async function GET() {
  return Response.json([])
}
```

```yaml
finding:
  check: Q1_stub
  severity: blocker
  location: "api/messages/route.ts:8-10"
  evidence: "GET 处理函数直接返回写死的空数组，根本没查数据库"
  impact: "接口永远返回空列表，承诺的功能实际上没做"
  fix: "连接数据库查询消息列表并返回真实查询结果"
```

### 实例 B — Q2 抓到的静默行为破坏

**Diff 改动**：为了迎合一个新调用方，把某工具函数在空输入时的返回值从 `[]` 改成了 `null`。原本的老测试没有覆盖空输入场景。

```typescript
// utils/filter.ts:12  (改动行)
if (!list.length) return null          // 原来是: return list
```

```yaml
finding:
  check: Q2_regression
  severity: blocker
  location: "utils/filter.ts:12"
  evidence: "rg 'filter\(' src/ 找到 14 处调用，其中 9 处在 diff 之外；有 3 处拿到返回值后直接调用 .map() 或 .length"
  impact: "那 3 处老调用方一旦遇到空列表，运行时会直接抛出 TypeError 崩溃，而现有测试全部显示通过"
  fix: "恢复空输入返回空数组 [] 的行为，只在需要 null 的那一个新调用方做转换；或者把全部 14 处调用点都改好并补齐空输入测试"
```

### 实例 C — 调用方太多时的如实划界

某次 diff 重写了被 60 个文件引用的公共函数 `formatDate`。把 60 个文件挨个读完不现实，也会撑爆上下文。

**正确做法**：先提炼出函数的**对外约定**——参数类型、支持的输入格式、返回的字符串格式、时区处理方式，对比新旧版本有哪些差异。用 `rg -l` 列出所有调用方，按使用场景（页面展示、接口序列化、缓存 key 拼接等）挑 3–5 个代表性调用点深读。剩下的如实写进 `UNCOVERED STEPS` 或 `Needs Human` 并说明原因。

### 实例 D — Q4 抓到的"自己证自己"假测试

```typescript
// tests/parser.test.ts:14-16
const expected = parse(input)
const actual = parse(input)
expect(actual).toEqual(expected)
```

```yaml
finding:
  check: Q4_test_integrity
  severity: blocker
  location: "tests/parser.test.ts:14-16"
  evidence: "expected 和 actual 都是调同一个被测函数 parse(input) 算出来的"
  impact: "哪怕 parse 函数写错了、返回乱码，两边结果也一样，测试永远不会报错"
  fix: "把 expected 改成手写的、确定的期望结果"
```

### 实例 E — Q4 附带具体替换方案的精简发现

**Diff 改动**：新建了 `src/lib/slug.ts`（18 行）手写字符串转 URL slug 的逻辑。搜了一下项目发现 `package.json` 已经安装了 `lodash`，里面的 `kebabCase` 就能直接搞定，而且 `rg "kebabCase" src/` 显示项目里已有两个文件在用它。

```
src/lib/slug.ts:L1-18: stdlib(已安装依赖): 手写了 18 行 slug 转换。项目已装的 lodash.kebabCase 完全覆盖该功能，且已在 2 个文件中使用。替换方案：删掉此文件，直接 import kebabCase。
```

判定为 **WARNING**（重复造轮子，放着项目现成工具不用）；计入结尾精简指标：`net: -18 lines`。

### 实例 F — 重大逻辑风险（请用户拍板，不直接判挂）

```typescript
// src/jobs/purge.ts:18
await deleteAllUserContent(userId)
```

操作不可逆、影响极大，但也可能确实是产品需求要求的硬删除。把它单独列在 `Serious Logic Risks (Discuss with User)` 提醒用户确认，不直接拿它改变 PASS/BLOCK 裁决。
