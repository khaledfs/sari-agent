# Testing & QA rules

Migrated from `docs/WORKING_INSTRUCTIONS.md` §8 (verification) plus the repo's established gates.

## Validation gate — run before considering any change done
```bash
npx tsc --noEmit            # must be clean
npm run lint                # must exit 0 (repo-wide)
npm test                    # vitest unit suite, all green
npm run smoke               # integration checks against a RUNNING dev server
```
- `npm run build` includes TypeScript; if `tsc` alone errors inside `.next` generated types, try a clean `.next` / full build. A build failure on an offline Google Fonts fetch is environmental — tsc + lint are the real gates there.
- Smoke's admin section needs `ADMIN_EMAIL`/`ADMIN_PASSWORD` env; OpenAI-dependent checks are opt-in via `SMOKE_AI=1` (cost) — the default suite stays deterministic.
- All three locale JSON files must parse after any i18n change.

## Dry-run-by-default scripts (safety-critical)
- Every DB-writing script under `scripts/` is **dry-run by default**; a real write requires an explicit **`--apply`** flag (`--dry` is a no-op alias). The shared gate is `scripts/_script-mode.js` (`resolveMode` + `printModeBanner` — loud mode/target-DB banner on every run).
- Any NEW script that writes to the DB must use the same gate. Never invert this (audit finding: `--dry`-as-opt-in caused bare runs to write to the real shared cluster).
- `npm run sync:products` / `npm run seed:customers` are dry by default — append `-- --apply` to write.
- The DB is a real shared Atlas cluster — treat writes with care; migrations/backfills run `--dry` first and real writes need owner approval.
