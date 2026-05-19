# Implementation Review Rubric

Detailed verification patterns, classification criteria, and test quality audit procedures for rook's implementation review.

---

## 四层验证模型 (Four-Level Verification)

The core methodology for verifying whether code achieves the goal.

### Level 1: 存在 (Exists)

**Question**: Does the artifact exist at the expected path?

**Check**:
```bash
[ -f "$artifact_path" ] && echo "EXISTS" || echo "MISSING"
```

**Status**:
- ✓ EXISTS: File found at expected location
- ✗ MISSING: File not found

**Blocker if**: Artifact required by goal is MISSING.

---

### Level 2: 实质性 (Substantive)

**Question**: Is the artifact real implementation, not stub/placeholder?

**Check**:
- Line count > minimum threshold (usually 10-15 lines)
- Contains expected patterns (not just empty return)
- No placeholder text

**Stub patterns** (these fail substantive):
- `return null`, `return {}`, `return []`
- `console.log(...)` as only implementation
- `// TODO`, `// FIXME`, `PLACEHOLDER`
- Placeholder text: "Coming soon", "Not implemented"
- Functions with only `pass` or `{}` body

**Status**:
- ✓ SUBSTANTIVE: Real implementation found
- ✗ STUB: Placeholder or minimal implementation

**Blocker if**: Artifact required by goal is STUB.

---

### Level 3: 已连接 (Connected/Wired)

**Question**: Is the artifact connected to the system?

**Check**:
- Component → API: grep for fetch/axios calls
- API → Database: grep for prisma/db queries
- State → Render: grep for state variable in JSX

**Wiring patterns**:
```bash
# Component → API
grep -E "fetch\(|axios\.|useSWR|useQuery" "$component"

# API → Database
grep -E "prisma\.|db\.|query\(|findMany" "$route"

# State → Render
grep -E "\{$state_var\}|\{$state_var\." "$component"
```

**Status**:
- ✓ WIRED: Imported and used
- ⚠️ ORPHANED: Exists but not imported/used
- ⚠️ PARTIAL: Imported but not used (or vice versa)

**Warning if**: Artifact is ORPHANED or PARTIAL.

---

### Level 4: 功能性 (Functional)

**Question**: Does it actually work when invoked?

**Check**: Usually requires human verification for:
- Visual rendering
- User flow completion
- Real-time behavior
- External service integration

**Status**:
- ✓ FUNCTIONAL: Works correctly (usually human-verified)
- ? NEEDS_HUMAN: Cannot verify programmatically
- ✗ BROKEN: Observable malfunction

**Blocker if**: Automation detects BROKEN (e.g., API returns error, test fails).

---

## Stub Detection Patterns

Detailed patterns for detecting placeholder implementations.

### Comment-Based Stubs

```bash
# TODO/FIXME markers
grep -E "(TODO|FIXME|XXX|HACK|PLACEHOLDER)" "$file"

# Placeholder phrases
grep -E "implement|add later|coming soon|will be|not yet" "$file" -i

# Ellipsis markers
grep -E "// \.\.\.|/\* \.\.\. \*/|# \.\.\." "$file"
```

### Output Placeholder Patterns

```bash
# UI placeholder text
grep -E "placeholder|lorem ipsum|coming soon|under construction" "$file" -i
grep -E "sample|example|test data|dummy" "$file" -i
```

### Empty Implementation Patterns

```bash
# Empty returns
grep -E "return null|return undefined|return \{\}|return \[\]" "$file"

# Pass-only functions
grep -E "pass$|\.\.\.|\bnothing\b" "$file"

# Console.log only
grep -E "console\.(log|warn|error).*only" "$file"
```

### Fake Dynamic (Hardcoded)

```bash
# Hardcoded IDs
grep -E "id.*=.*['\"].*['\"]" "$file"

# Hardcoded counts
grep -E "count.*=.*\d+|length.*=.*\d+" "$file"

# Hardcoded display values
grep -E "\$\d+\.\d{2}|\d+ items" "$file"
```

### React Component Stubs

```javascript
// RED FLAGS:
return <div>Component</div>
return <div>Placeholder</div>
return <div>{/* TODO */}</div>
return <p>Coming soon</p>
return null
return <></>

// Empty handlers:
onClick={() => {}}
onChange={() => console.log('clicked')}
onSubmit={(e) => e.preventDefault()}  // Only prevents default
```

### API Route Stubs

```typescript
// RED FLAGS:
export async function POST() {
  return Response.json({ message: "Not implemented" })
}

export async function GET() {
  return Response.json([])  // Empty array, no DB query
}

export async function PUT() {
  return new Response()  // Empty response
}
```

---

## Bug / Security / Debt Classification

### Bug (Logic/Correctness Issues)

**Severity**: Blocker or Warning

**Examples**:
- Null/undefined dereference
- Off-by-one errors in loops
- Type mismatches (string where number expected)
- Unhandled edge cases (empty array, missing key)
- Incorrect conditionals (wrong operator)
- Variable shadowing
- Dead code paths
- Unreachable code
- Missing `await` in async functions
- Incorrect error handling (catch block empty)

**Detection**:
```bash
# Unchecked array access
grep -E "\.length\]\s*==|\.length\]\s*!=" "$file"  # Off-by-one

# Missing await
grep -E "const.*=\s*[a-zA-Z]+\(" "$file"  # Potential async without await

# Empty catch
grep -E "catch\s*\([^)]*\)\s*\{\s*\}" "$file"
```

---

### Security (Vulnerabilities)

**Severity**: Blocker (always)

**Examples**:
- SQL injection
- Command injection
- Path traversal
- XSS (innerHTML, dangerouslySetInnerHTML)
- Hardcoded secrets/credentials
- Insecure crypto (weak hashing, no encryption)
- Unsafe deserialization
- Missing input validation
- Directory traversal
- `eval()` usage
- Insecure random generation
- Authentication bypasses
- Authorization gaps

**Detection**:
```bash
# Hardcoded secrets
grep -E "(password|secret|api_key|token|apikey|api-key)\s*[=:]\s*['\"]\w+['\"]" "$file"

# Dangerous functions
grep -E "eval\(|innerHTML|dangerouslySetInnerHTML|exec\(|system\(|shell_exec" "$file"

# Command injection patterns
grep -E "exec.*\$\{|system.*\$\{" "$file"
```

---

### Debt (Technical Debt)

**Severity**: Warning or Info

**Examples**:
- TODO/FIXME comments
- Placeholder text in output
- Empty return statements
- Empty handler functions
- Fake dynamic (hardcoded values)
- Unused imports/variables
- Poor naming (single-letter variables)
- Commented-out code
- Magic numbers (should be constants)
- Code duplication
- Weak test assertions

**Detection**:
```bash
# Debug artifacts
grep -E "console\.log|debugger;" "$file"

# Commented-out code
grep -E "^\s*//.*[{};]|^\s*#.*:" "$file"

# Magic numbers
grep -E "[^a-zA-Z_]\d{3,}[^a-zA-Z_0-9]" "$file"  # Numbers > 999 not in variable names
```

---

## 测试质量审计 (Test Quality Audit)

Tests are critical evidence for goal verification. Audit them for debt patterns.

### Skipped/Disabled Tests

**Severity**: Blocker (if for critical requirement)

**Detection**:
```bash
# JavaScript/TypeScript
grep -E "skip\(|\.skip|xit|test\.skip|it\.skip|describe\.skip" "$test_file"

# Python
grep -E "@pytest\.mark\.skip|skip_test|unittest\.skip" "$test_file"

# Go
grep -E "t\.Skip|SkipNow" "$test_file"
```

**Blocker if**: Test file exists for requirement but all tests are skipped/disabled.

---

### Circular Proofs (Self-Validating)

**Severity**: Blocker

**Pattern**: System generates expected values, then validates against itself.

**Detection**:
```bash
# Expected = actual
grep -E "expected.*=.*actual|actual.*=.*expected" "$test_file"

# Expected generated from system
grep -E "const expected = .*generate|expected.*from.*system" "$test_file"
```

**Example**:
```typescript
const expected = generateOutput(input)  // Same function being tested
const actual = generateOutput(input)
expect(actual).toEqual(expected)  // Circular proof
```

---

### Placeholder Assertions

**Severity**: Blocker

**Pattern**: Assertion that always passes regardless of implementation.

**Detection**:
```bash
# Always true
grep -E "expect\(true\)\.toBe\(true\)|expect\(false\)\.toBe\(false\)" "$test_file"

# Empty assertion body
grep -E "expect\(.*\)\s*;" "$test_file"  # Expect without matcher
```

**Example**:
```typescript
expect(true).toBe(true)  // Always passes
expect(component).toBeDefined()  // Only checks existence, not behavior
```

---

### Weak Assertions (Existence Only)

**Severity**: Warning or Info

**Pattern**: Assertion checks existence but not behavior/value.

**Detection**:
```bash
# Only existence checks
grep -E "expect.*toBeDefined|expect.*toBeTruthy|expect.*toBeFalsy|expect.*not\.toBeNull" "$test_file"
```

**Example**:
```typescript
expect(result).toBeDefined()  // Weak: only checks exists
expect(result).toEqual({ id: 1, name: 'test' })  // Strong: checks values
```

**Upgrade from weak to strong**: Check actual values, not just existence.

---

### Missing Assertions

**Severity**: Warning

**Pattern**: Test file exists but no `expect` statements.

**Detection**:
```bash
grep -c "expect" "$test_file"  # Count expect statements
# If count == 0 → Missing assertions
```

---

## 审查维度完整清单

### Goal Verification Checklist

- [ ] Extract goal from Plan or prompt
- [ ] Identify must_haves.truths (or derive)
- [ ] Level 1: Verify each artifact exists
- [ ] Level 2: Verify each artifact is substantive (not stub)
- [ ] Level 3: Verify each artifact is wired (connected to system)
- [ ] Level 4: Flag items needing human functional verification
- [ ] Determine overall goal achievement status

### Bug Scan Checklist

- [ ] Check for null/undefined dereference patterns
- [ ] Check for off-by-one errors in loops/indexing
- [ ] Check for missing await in async functions
- [ ] Check for empty catch blocks
- [ ] Check for unreachable/dead code
- [ ] Check for type mismatches

### Security Scan Checklist

- [ ] Check for hardcoded secrets/credentials
- [ ] Check for dangerous functions (eval, innerHTML, exec)
- [ ] Check for injection patterns (SQL, command, path traversal)
- [ ] Check for missing input validation
- [ ] Check for unsafe deserialization

### Debt Scan Checklist

- [ ] Check for TODO/FIXME/PLACEHOLDER markers
- [ ] Check for placeholder text in output
- [ ] Check for empty returns/handlers
- [ ] Check for hardcoded values (fake dynamic)
- [ ] Check for unused imports/variables
- [ ] Check for commented-out code

### Test Quality Audit Checklist

- [ ] Check for skipped/disabled tests
- [ ] Check for circular proofs (expected = actual)
- [ ] Check for placeholder assertions (expect(true).toBe(true))
- [ ] Check for weak assertions (existence only)
- [ ] Check for missing assertions (no expect in test file)

---

## Severity Decision Matrix

| Finding Type | Has file:line + code? | Severity |
|--------------|----------------------|----------|
| Goal not achieved | Yes | Blocker |
| Goal not achieved | No | Flag as "needs investigation" |
| Security vulnerability | Yes | Blocker |
| Security vulnerability | No | Flag as "needs investigation" |
| Bug (correctness) | Yes | Blocker or Warning |
| Bug (correctness) | No | Info |
| Debt (stub/deprecated) | Yes | Warning or Info |
| Debt (stub/deprecated) | No | Info |
| Test quality issue | Yes | Blocker (skipped/disabled) or Warning |
| Test quality issue | No | Info |

---

## Output Template

Use this template for structured findings:

```markdown
### {ID}: {Title}

**位置**: `path/to/file:line`
**代码**: `{snippet}`
**问题**: {Why it's a problem - goal perspective}
**修复建议**: {Concrete action}

**分类**: bug | security | debt | test_quality
**严重等级**: Blocker | Warning | Info
```

---

## Common Patterns Reference

### Pattern: Component Not Wired to API

**Symptom**: Component renders but doesn't fetch data.

**Check**:
```bash
grep -E "fetch\(|axios\.|useSWR|useQuery" "$component"
```

**Finding**: Warning if no API call found.

**Fix**: Add fetch/axios call to data source.

---

### Pattern: API Not Wired to Database

**Symptom**: API returns static/hardcoded data.

**Check**:
```bash
grep -E "prisma\.|db\.|query\(|findMany" "$route"
```

**Finding**: Blocker if goal requires database fetch.

**Fix**: Add database query and return result.

---

### Pattern: State Not Rendered

**Symptom**: State variable exists but not used in JSX.

**Check**:
```bash
grep -E "\{$state_var\}" "$component"
```

**Finding**: Warning if state exists but not rendered.

**Fix**: Render state in JSX: `<div>{state_var}</div>`

---

## Quick Severity Reference

| Pattern | Severity | Blocker condition |
|---------|----------|-------------------|
| Missing file | Blocker | Always |
| Stub implementation | Blocker | Required by goal |
| Orphaned artifact | Warning | Always |
| Hardcoded secret | Blocker | Always |
| SQL injection | Blocker | Always |
| Skipped test | Blocker | For critical requirement |
| Circular proof | Blocker | Always |
| Placeholder assertion | Blocker | Always |
| Weak assertion | Info | Unless multiple |
| TODO comment | Info | Unless in critical path |
| Unused import | Info | Always |

---

## Integration Notes

This rubric is referenced by SKILL.md and should be loaded when detailed verification patterns are needed.

Rook agent loads this file via:
```markdown
**@references/review-rubric.md**
```

The SKILL.md contains the workflow and output structure; this file contains the detailed verification procedures and classification criteria.