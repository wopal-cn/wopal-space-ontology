# test-plan-old-valid

## Metadata

- **Type**: test
- **Created**: 2026-05-16
- **Status**: planning

## Goal

Test old template format validation (backward compat).

## Technical Context

Current architecture without new subsections.

## In Scope

- Test old format validation.

## Out of Scope

- N/A.

## Affected Files

| Component | Files | Operation | Role |
|-----------|-------|-----------|------|
| Test | `test.py` | 修改 | Test file |

## Test Plan

##### Case U1: Unit test
- Goal: Verify basic functionality
- Fixture: Test data
- Execution:
  - [ ] Step 1: Run test
- Expected Result: Test passes

## Acceptance Criteria

- [ ] `rg -c 'pattern' test.py` ≥ 1

## Implementation

### Task 1: Test Task

**Files**: `test.py`

**Design**:
Complete implementation design.

**Changes**:
- [ ] Step 1: Implement function A.
- [ ] Step 2: Implement function B.

**Verification**:
- [ ] Step 1: Run test.

## Delegation Strategy

N/A — 单一任务，无需并行委派