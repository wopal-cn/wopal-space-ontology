# Implementation Review Rubric

审查方法论与问题模式参考。rook 只使用 `read` / `glob` / `grep` / `lsp` 等只读工具。

> 本源文件提炼自 WSF `verification-patterns.md` 的四层验证模型、存根模式与连接检测方法论。

---

## 核心原则

**存在 ≠ 实现**。文件存在不意味着功能有效。rook 必须逐层验证：

1. **存在** — 预期路径下有文件
2. **实质性** — 内容是真实实现，不是占位符
3. **已连接** — 已接入系统其他部分（import → use → render）
4. **功能性** — 调用时实际工作（通常需人工验证）

1-3 层 rook 可独立完成。第 4 层标注为 `NEEDS_HUMAN`。

---

## 通用存根模式

以下模式无论语言和文件类型，均表明占位符代码。

### 基于注释的存根

```javascript
// TODO: implement later
// FIXME: this is broken
// XXX: hack
// HACK: temporary
// PLACEHOLDER

// ...
/* ... */

# ... (Python/Shell)
```

rook 用 `grep` 工具检查，pattern: `(TODO|FIXME|XXX|HACK|PLACEHOLDER|\.\.\.)`

### 占位符文本

```
"placeholder"
"lorem ipsum"
"coming soon"
"under construction"
"TBD"
"Not implemented"
```

rook 用 `grep` 工具检查，pattern: `(placeholder|lorem ipsum|coming soon|under construction|TBD|not implemented)`

### 空实现

```javascript
return null
return undefined
return {}
return []
```

```python
pass
return None
return {}
return []
```

rook 用 `grep` 工具检查，pattern: `(return null|return undefined|return \{\}|return \[\])`

### 仅日志函数

```javascript
function handler(data) {
  console.log(data)   // ← 仅日志，无实际逻辑
}
```

### 假动态真硬编码

```jsx
// 应来自 state/props，实为硬编码
<div>Message 1</div>
<div>Message 2</div>

// ID 应为动态生成
const id = "fixed-id"

// 计数应为计算结果
const count = 3

// 显示值应为格式化结果
const price = "$9.99"
```

---

## 前端组件模式

### 实质性检查

以下均为存根，应被标记为 Blocker（若目标要求该组件有实际功能）：

```jsx
// 空壳
return <div>Component</div>
return <div>Placeholder</div>
return <p>Coming soon</p>
return <div>{/* TODO */}</div>

// 空返回
return null
return <></>

// 空事件处理器
onClick={() => {}}
onChange={() => console.log('clicked')}
onSubmit={(e) => e.preventDefault()}     // 仅阻止默认行为
```

**rook 检查方法**：
1. `read` 组件文件，扫描 return 语句
2. 检查 JSX 是否包含实质性元素（`className`, `onClick`, 动态表达式 `{...}`）
3. 检查是否使用 props 或 state（`props.X`, `useState`, `{variable}`）

### 连接检查：组件 → API

组件渲染了，但数据从哪来？

```jsx
// ✅ 正确：组件调用 API 获取数据
useEffect(() => {
  fetch('/api/messages').then(r => r.json()).then(setMessages)
}, [])

// ❌ 问题：fetch 存在但响应未消费
fetch('/api/messages')  // 无 await，无 .then，无赋值

// ❌ 问题：fetch 被注释掉
// fetch('/api/messages').then(r => r.json()).then(setMessages)
```

**rook 检查方法**：
- 用 `grep` 工具在组件文件中搜索 `fetch\(|axios\.|useSWR|useQuery`
- 用 `read` 确认调用是否被 await/消费/未被注释
- 若组件需要数据但无 API 调用 → Warning

### 连接检查：状态 → 渲染

状态变量存在，但 JSX 里用了吗？

```jsx
// ❌ 状态存在但未渲染
const [messages, setMessages] = useState([])
return <div>No messages</div>    // 永远显示"无消息"

// ❌ 渲染了错误的状态
const [messages, setMessages] = useState([])
return <div>{otherData.map(...)}</div>   // 用的是别的变量
```

**rook 检查方法**：用 `read` 比对 useState 变量名与 JSX `{...}` 中的引用。

---

## API 路由模式

### 实质性检查

以下均为存根：

```typescript
// 空响应
export async function GET() {
  return Response.json([])           // 空数组，无 DB 查询
}

export async function POST() {
  return new Response()              // 空响应体
}

// 占位符消息
export async function PUT() {
  return Response.json({ message: "Not implemented" })
}

// 仅日志
export async function POST(req) {
  console.log(await req.json())
  return Response.json({ ok: true }) // 无实际处理
}
```

### 连接检查：API → 数据库

API 路由返回数据，但数据从哪来？

```typescript
// ✅ 正确：查询数据库并返回结果
export async function GET() {
  const messages = await prisma.message.findMany()
  return Response.json(messages)
}

// ❌ 查询了但未返回结果
await prisma.message.findMany()
return Response.json({ ok: true })   // 返回静态值，不是查询结果

// ❌ 查询未 await（返回 Promise 不是数据）
const messages = prisma.message.findMany()
return Response.json(messages)       // 返回的是 Promise 对象
```

**rook 检查方法**：
- 用 `grep` 工具在路由文件中搜索 `prisma\.|db\.|query\(|findMany|create|update|delete`
- 用 `read` 确认查询结果是否被 await 且被 return

### 输入验证

API 是否校验了输入？若 POST/PUT 路由直接使用 `req.json()` 不作任何校验 → Warning。

```typescript
// ✅ 有校验
const body = schema.parse(await req.json())

// ❌ 无校验
const body = await req.json()
// 直接使用 body.field...  未验证字段存在性/类型
```

**rook 检查方法**：用 `grep` 工具搜索 `schema\.parse|validate|zod|yup|joi`。

---

## 数据库模式存根

若变更包含数据库 schema 文件（`schema.prisma` / `schema.ts` / `*.sql`）：

```prisma
// ❌ 空壳模型
model User {
  id String @id
  // TODO: add fields
}

// ❌ 仅 id + 一个字段
model Message {
  id      String @id
  content String
  // 缺少: createdAt, userId, chatId
}

// ❌ 缺少关键关系
model Order {
  id     String @id
  // 缺少: userId, items (relation), total, status, createdAt
}
```

**rook 检查方法**：`read` schema 文件，检查每个模型是否有 ≥ 3 个业务字段、相应关系是否定义。

---

## 自定义 Hooks/工具存根

```typescript
// ❌ 空壳 hook
export function useAuth() {
  return { user: null, login: () => {}, logout: () => {} }
}

// ❌ 仅日志 hook
export function useCart() {
  const [items, setItems] = useState([])
  return { items, addItem: () => console.log('add'), removeItem: () => {} }
}

// ❌ 硬编码返回
export function useUser() {
  return { name: "Test User", email: "test@example.com" }
}
```

**rook 检查方法**：`read` hooks 文件，检查返回值和函数体是否有实质逻辑（调用 API、操作 state、副作用）。

---

## 测试质量审计

测试是目标达成的重要证据。不能只看测试是否存在，要审测试是否真的证明了什么。

### 跳过/禁用的测试

```typescript
it.skip('sends message', () => { ... })
it.skip('renders correctly')
describe.skip('Chat', () => { ... })
xit('loads data')
xdescribe('Messages')
```

```python
@pytest.mark.skip
def test_send():
    ...
```

```go
t.Skip("not implemented")
t.SkipNow()
```

**判定**：若某需求对应的测试全部被跳过/禁用 → Blocker。

### 循环证明

系统生成期望值，再用同一个系统验证——什么都没证明。

```typescript
// ❌ 循环证明
const expected = generateOutput(input)   // 被测函数
const actual = generateOutput(input)     // 同一函数
expect(actual).toEqual(expected)          // 自己证明自己

// ❌ 系统自己生成期望数据
const expected = await system.createTestData()
const actual = await system.getData()
expect(actual).toEqual(expected)
```

**判定**：循环证明 → Blocker。

### 占位断言

永远通过的断言，无论实现如何变化都不会失败。

```typescript
expect(true).toBe(true)
expect(false).toBe(false)
expect(1).toBe(1)
expect("test").toBe("test")
```

**rook 检查方法**：用 `grep` 工具搜索 `expect\(true\)|expect\(false\)|expect\(1\)|expect\("test"\)`。

**判定**：占位断言 → Blocker。

### 弱断言（仅检查存在性）

```typescript
expect(result).toBeDefined()
expect(component).toBeTruthy()
expect(data).not.toBeNull()
expect(response).toBeTruthy()
```

只检查"东西存在"，不检查"值对不对"。以下为强断言对比：

```typescript
// ❌ 弱断言
expect(result).toBeDefined()

// ✅ 强断言
expect(result).toEqual({ id: 1, name: 'test', email: 'test@example.com' })
expect(result.id).toBe(1)
expect(result.items).toHaveLength(3)
```

**判定**：单个弱断言 → Info。若某测试文件中所有断言均为弱断言 → Warning。

### 缺少断言

测试文件存在，但内部没有任何 `expect` / `assert` 语句。

**rook 检查方法**：用 `grep` 工具对测试文件搜索 `expect|assert`，命中数为 0 → 测试为空壳。

**判定**：缺少断言 → Warning。

---

## 审查清单

rook 完成文件读取后，逐项回答以下问题：

### 目标验证

- [ ] 从 Plan 提取了目标（goal / must_haves.truths）
- [ ] 每个目标对应的文件是否存在（Level 1）
- [ ] 每个文件是否有实质实现，不是存根（Level 2）
- [ ] 每个文件是否接入系统（import → use → render，Level 3）
- [ ] 标注需要人工功能验证的项（Level 4）

### 存根扫描

- [ ] 检查 TODO/FIXME/PLACEHOLDER 注释
- [ ] 检查 "coming soon" / "not implemented" 占位文本
- [ ] 检查 `return null` / `return {}` / `return []` 空实现
- [ ] 检查硬编码 ID/计数/显示值（假动态）
- [ ] 检查空事件处理器（`onClick={() => {}}`）
- [ ] 检查 API 返回占位符数据（空数组、静态消息）
- [ ] 若涉及 schema，检查模型是否有空壳

### 测试质量

- [ ] 检查跳过的测试（`skip` / `xit` / `xdescribe`）
- [ ] 检查循环证明（`expected = same_system(...)`）
- [ ] 检查占位断言（`expect(true).toBe(true)`）
- [ ] 检查弱断言（仅 `toBeDefined` / `toBeTruthy`）
- [ ] 检查测试文件是否缺少断言

---

## 判定参考

| 情形 | 判定 |
|------|------|
| 目标对应的文件缺失 | Blocker |
| 目标对应的文件是存根 | Blocker |
| 安全漏洞（硬编码密钥、eval、XSS） | Blocker |
| 测试全部跳过 / 循环证明 / 占位断言 | Blocker |
| 文件未接入系统（存在但孤立） | Warning |
| API 无输入校验 | Warning |
| 测试全是弱断言 | Warning |
| TODO/FIXME 标记（非关键路径） | Info |
| 单个弱断言 | Info |
| 硬编码 ID/文本（非目标要求动态的场景） | Info |

---

## 人工验证指引

以下情况 rook 应标注 `NEEDS_HUMAN`，而非自行判断：

- 视觉外观是否正确
- 用户流程是否完整可用
- WebSocket / SSE 实时行为
- 外部服务集成（Stripe、邮件）
- 错误消息是否清晰有帮助
- 移动端响应式
- 无障碍性

---

*本文件为 `df-implement-review` SKILL.md 的参考附件。rook 通过 `@references/review-rubric.md` 加载。*
