# Standard shape of a feature task

Migrated from `docs/WORKING_INSTRUCTIONS.md` §8–§9.

## Workflow for every meaningful change
1. **Read** nearby existing code and match its patterns (imports, error style, naming).
2. **Implement** the smallest change that satisfies the request (MVP-first; obey `.claude/rules/*`).
3. **Validate** — the full gate in `.claude/rules/testing-qa.md`: `npx tsc --noEmit` · `npm run lint` · `npm test` · `npm run smoke` (all clean/green). All three locale JSONs must parse if i18n was touched.
4. **Update docs:**
   - `docs/DEV_NOTES.md` (local) when the feature is non-trivial (new model, new API surface, new flows, important caveats).
   - `PROGRESS.md` (local) with the what-was-done entry.
   - `.claude/rules/*` only if a **rule** or process changed (not for every tweak).

   | Change | DEV_NOTES? | rules/? |
   |---|---|---|
   | New model / API / major flow | Yes | Only if rules change |
   | Bugfix, small UI tweak | Optional note if behavior mattered | No |
   | New global rule ("never X", "always Y") | Short pointer | Yes |
5. **Commit** — conventional style matching history: `feat(scope): …` / `fix(scope): …` / `perf(scope): …` / `chore: …`, one focused commit per work item.
