---
name: df-implement-review
description: |
  Review implementation results for goal achievement and code quality. ⚠️ MUST use when:
  (1) Wopal delegates rook to review fae implementation output, (2) Prompt contains "review_type: implementation",
  (3) Prompt contains changed code file list or Plan path + implementation scope, (4) Any code review request from Wopal.
  🔴 Trigger even when user does not explicitly mention "review" if the task involves verifying implementation results.
  This skill is rook-exclusive (only rook agent can load it).
---

# df-implement-review — Implementation Review Skill

Review fae's implementation results to verify goal achievement and scan for bugs/security/debt.

## Two-Layer Review Method

### Layer 1: Goal Verification

**Do NOT trust "completed" claims.** Verify the goal is actually achieved.

1. Read Plan's `must_haves.truths` (or derive from goal)
2. For each truth, check if code makes it true
3. Use four-level verification model (see references/review-rubric.md)

### Layer 2: Problem Scanning

After goal verification, scan for:

| Category | Examples |
|----------|----------|
| **bug** | Logic errors, null/undefined checks, type mismatches, unhandled edge cases, dead code |
| **security** | Injection, XSS, hardcoded secrets, unsafe deserialization, missing validation |
| **debt** | TODO/FIXME, placeholder text, empty handlers, fake dynamic (hardcoded), weak tests |

---

## Output Structure

```markdown
# 审查报告

## 概要
- 审查类型: Code
- 判定: PASS | REVISE | BLOCK
- 统计: Blocker N / Warning N / Info N

## Blocker
### B-01: {Issue Title}
- 位置: `path/to/file:line`
- 代码: `{具体代码片段}`
- 问题: {为什么阻碍目标达成}
- 修复建议: {具体可执行的修复方案}

## Warning
{Warning 项，格式同 Blocker}

## Info
{Info 项，可省略 file:line}

## Positive Findings
- {已验证通过的亮点项}
```

---

## Evidence Rules

**Blocker requirements**:
1. Location: `file:line`
2. Code snippet: ≥ 1 line
3. Problem: Why it blocks goal (not "bad code", but "goal X cannot be achieved")
4. Fix: Concrete action (not "optimize", but "change to Y command")

**Warning requirements**:
1. Location: `file:line`
2. Code snippet: present
3. Problem: Risk scenario (not "might have issue", but "in Z scenario leads to Y")

**Info can omit**: Location and code, but must be specific suggestion

---

## Workflow

1. **Read context** — Load all files from prompt's `files_to_read`
2. **Extract goal** — Parse Plan's goal and must_haves.truths
3. **Verify goal achievement** — Apply four-level model to each truth
4. **Scan for problems** — bug / security / debt classification
5. **Run test quality audit** — Check for skipped tests, weak assertions, circular proofs
6. **Determine verdict** — PASS / REVISE / BLOCK based on findings
7. **Output structured report** — With evidence anchors

---

## Test Quality Audit (Critical)

Tests often hide the biggest debt. Check:

| Pattern | Why it's debt | Detection |
|---------|---------------|-----------|
| `skipped/disabled` tests | Requirements not proven | `grep -n "skip|xit|test.skip"` |
| Circular proofs | System generates its own expected values | `grep -n "expected.*=.*actual"` |
| Weak assertions | Only check existence, not behavior | `grep -n "expect.*toBeDefined|expect.*toBeTruthy"` |
| Placeholder assertions | `expect(true).toBe(true)` | `grep -n "expect\(true\)"` |
| Missing assertions | No `expect` in test file | `grep -c "expect" file == 0` |

**Blocker if**: Test file exists for requirement but all tests are skipped/disabled or assertions are placeholders.

---

## Depth Modes

| Mode | When to use | What it checks |
|------|-------------|----------------|
| `standard` | Default | Goal verification + pattern scanning |
| `deep` | Complex changes | Cross-file call chains + import graph + type consistency |

Prompt should specify `depth: standard | deep`. Default to `standard`.

---

## References

For detailed verification patterns, stub detection, and test audit procedures:

**@references/review-rubric.md**

Key sections:
- 四层验证模型 (存在 → 实质性 → 已连接 → 功能性)
- Stub detection patterns (TODO, placeholder, empty return, fake dynamic)
- Test quality audit checklist
- Bug/Security/Debt classification criteria

---

## Examples

### Example 1: Goal Verification

**Plan truth**: "User can send a message"

**Code found**:
```typescript
// components/Chat.tsx:45
const handleSubmit = (e) => {
  e.preventDefault()
  console.log(data)  // Only logs
}
```

**Finding**:
- **B-01**: Message submission not implemented
- 位置: `components/Chat.tsx:45-47`
- 代码: `console.log(data)`
- 问题: Handler only logs, no API call → goal "send message" not achieved
- 修复建议: Add `fetch('/api/messages', { method: 'POST', body: data })`

---

### Example 2: Stub Detection

**Plan truth**: "Messages are fetched from database"

**Code found**:
```typescript
// api/messages/route.ts:12
export async function GET() {
  return Response.json([])  // Empty array, no DB query
}
```

**Finding**:
- **B-02**: API returns hardcoded empty data
- 位置: `api/messages/route.ts:12`
- 代码: `return Response.json([])`
- 问题: No database query, always returns empty → goal "fetch from database" not achieved
- 修复建议: Add `const messages = await prisma.message.findMany()` before return

---

### Example 3: Test Quality Audit

**Test file**: `tests/chat.test.ts`

**Code found**:
```typescript
describe('Chat', () => {
  it.skip('sends message', () => { ... })  // Skipped
  it('renders', () => {
    expect(true).toBe(true)  // Placeholder assertion
  })
})
```

**Finding**:
- **B-03**: Test suite disabled for critical requirement
- 位置: `tests/chat.test.ts:5-7`
- 代码: `it.skip('sends message', ...)`
- 问题: Requirement "send message" has skipped test → not proven by tests
- 修复建议: Enable test with real assertions: `expect(mockFetch).toHaveBeenCalledWith('/api/messages')`

---

## Critical Rules

**ALWAYS**:
- Read actual code files, not just SUMMARY.md claims
- Check four levels: exists → substantive → wired → functional
- Include `file:line` evidence for Blocker/Warning
- Run test quality audit when tests exist

**NEVER**:
- Trust "completed" without code evidence
- Flag style preferences as warnings
- Skip test quality audit
- Report findings without concrete location

---

## Integration with rook

This skill is loaded by rook agent. Workflow:

1. Wopal delegates rook with `review_type: implementation`
2. Rook reads prompt and loads this skill
3. Rook follows workflow above
4. Rook outputs PASS / REVISE / BLOCK verdict
5. Wopal acts on verdict (continue / request fix / escalate)

**Revision loop limit**: Max 3 rounds of REVISE/BLOCK per implementation.

---

## Quick Reference

| Verdict | Condition |
|---------|-----------|
| **PASS** | All truths verified, no Blocker, Warning ≤ 2 |
| **REVISE** | Warning ≥ 3 or Info ≥ 5, no Blocker |
| **BLOCK** | ≥ 1 Blocker found |

| Evidence Level | Required for |
|----------------|--------------|
| `file:line + code snippet` | Blocker, Warning |
| Specific description | Info |

| Test Debt Pattern | Severity |
|-------------------|----------|
| All tests skipped/disabled | Blocker |
| Circular/placeholder assertions | Blocker |
| Missing assertions | Warning |
| Weak assertions (existence only) | Info |