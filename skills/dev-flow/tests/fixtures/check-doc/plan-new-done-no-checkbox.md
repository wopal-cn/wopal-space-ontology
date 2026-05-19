# test-plan-new-done-no-checkbox

## Metadata

- **Type**: test
- **Created**: 2026-05-16
- **Status**: planning

## Goal

Test Done field without checkbox.

## Technical Context

### Architecture Context

Current architecture description.

## In Scope

- Test validation.

## Out of Scope

- N/A.

## Affected Files

| Component | Files | Operation | Role |
|-----------|-------|-----------|------|
| Test | `test.py` | 修改 | Test file |

## Acceptance Criteria

### Agent Verification

- [ ] `rg -c 'pattern' test.py` ≥ 1

### User Validation

#### Scenario 1: Test scenario
- Goal: Confirm validation.
- Precondition: Plan created.
- User Actions:
  1. Check Plan.
- Expected Result: Validation fails with MISSING Done checkbox error.

- [ ] 用户已完成上述功能验证并确认结果符合预期

## Implementation

### Task 1: Test Task

**Verification Intent**: AC#1

**Behavior**: Task behavior description.

**Files**: `test.py`

**Pre-read**: N/A

**Design**:
Complete implementation design.

**TDD**: false

**Changes**:
1. Implement function A.

**Verify**: `rg -c 'pattern' test.py` ≥ 1

**Done**:
<!-- MISSING: No checkbox -->
任务产出：test.py 实现完成

---

## Delegation Strategy

N/A — 单一任务，无需并行委派