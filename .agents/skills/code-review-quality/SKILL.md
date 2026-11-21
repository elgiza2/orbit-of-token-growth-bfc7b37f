---
name: code-review-quality
description: Use before finishing any change to review the diff for bugs, security leaks, silent failures and performance regressions.
---
# Code review checklist
Review `git diff` and check:
1. Correctness: edge cases, unhandled promise rejections, swallowed errors, race conditions.
2. Security: no secrets in client code, RLS/owner checks on every data access, public routes verify callers, no service-role client in browser graph.
3. Data safety: no full card numbers/CVC/passwords stored server-side.
4. Performance: no extra blocking requests on startup, no loaders where cached data exists.
5. Sibling paths: if fixing one path, fix the same assumption in related routes/fetchers.
Fix findings before reporting completion.
