---
name: tdd-adversarial-test
description: Use when fixing bugs or changing business rules. Write a failing Vitest test first, then the fix, and prove tests can fail; cover edge cases adversarially.
---
# TDD and adversarial testing
1. Reproduce the bug or rule as a failing test next to existing tests (bunx vitest run <file>). Confirm it fails for the right reason.
2. Implement the smallest fix; rerun until green.
3. Prove the test is meaningful: temporarily break the code mentally or actually and confirm the test would fail. Never write assertions that cannot fail.
4. Add edge cases: empty input, null, very long text, Arabic/RTL text, concurrency/double submit, network timeout, expired session.
5. Test concrete values from the user's rules (prices, limits, permissions). Do not test copy, styling or snapshots.
6. Report which tests ran and their result; never claim untested behavior works.
