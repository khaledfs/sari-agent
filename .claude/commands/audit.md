# Read-only test audit

How to run the independent QA audit (the format of `docs/TESTS-CHECK.md`). Role: **verify, don't improve. Read-only.**

## Ground rules
- Do NOT run seed/migration/backfill/sync scripts. Do not "fix" anything mid-audit.
- Touch only the seeded demo customer and the default admin — never real customer data.
- Evidence standard: every PASS carries the command + observed output. Anything not executed is marked **NOT TESTED**. No "should work".

## Steps
1. Record the commit under audit (`git rev-parse HEAD`, clean tree) and start a dev server.
2. Static analysis:
   - `npx tsc --noEmit`
   - `npm run lint` (repo-wide — the canonical gate) and `npx eslint src` separately
   - `npm run build`
3. `npm test` — full unit suite, record the count.
4. `npm run smoke` against the running server (admin section via `ADMIN_EMAIL`/`ADMIN_PASSWORD`; `SMOKE_AI=1` only if OpenAI cost is acceptable).
5. Probe security boundaries directly (curl/fetch): unauth → 401, customer token on admin endpoints → 401/403, cross-customer access → 404, agent cross-scope → 404, admin-only surface as agent → 403 `FORBIDDEN_SCOPE`.
6. Spot-check documentation claims (PROGRESS.md "✅ Done" items) against the running system; report mismatches with evidence.
7. Write the report in the TESTS-CHECK.md format: executive summary (high/medium/low risk), per-area PASS/FAIL with commands, an Untested section.
