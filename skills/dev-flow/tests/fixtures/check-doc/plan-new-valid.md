# test-plan-new-valid

## Metadata

- **Type**: test
- **Created**: 2026-05-16
- **Status**: planning

## Goal

Test new template format validation.

## Technical Context

### Architecture Context

Current architecture description.

### Research Findings

Research conclusion summary.

**参考资料**：
- `projects/space-flow/agents/wsf-planner.md`

### Key Decisions

- D-01: Use new format.

### Key Interfaces

Key interface definitions.

## In Scope

- Test new format validation.

## Out of Scope

- N/A.

## Affected Files

| Component | Files | Operation | Role |
|-----------|-------|-----------|------|
| Test | `test.py` | 修改 | Test file |

## Acceptance Criteria

### Agent Verification

- [ ] `rg -c '### Architecture Context' file.md` ≥ 1
- [ ] `python -m pytest tests/ -v` 全部 pass

### User Validation

#### Scenario 1: Verify new format
- Goal: Confirm new format works.
- Precondition: Plan created.
- User Actions:
  1. Check Plan structure.
- Expected Result: Plan passes validation.

- [ ] 用户已完成上述功能验证并确认结果符合预期

## Implementation

### Task 1: Test Task

**Verification Intent**: AC#1, AC#2

**Behavior**: Task produces correct output.

**Files**: `test.py`

**Pre-read**: N/A

**Design**:
Complete implementation design.

**TDD**: false

**Changes**:
1. Implement function A.
2. Implement function B.

**Verify**: `rg -c 'pattern' test.py` ≥ 1

**Done**:
任务产出：test.py 实现完成
- [ ] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

---

## Delegation Strategy

N/A — 单一任务，无需并行委派