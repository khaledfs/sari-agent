# SARI — project context index

SARI is a **Next.js B2B wholesale app** (Hebrew RTL primary, `next-intl` he/ar/en, MongoDB via
Mongoose) for a baking/food-service supplier. Three audiences: **customers** (catalog, cart,
orders, ledger, AI assistant), **admin** (full console), and **field agents** (scoped console +
customer messaging + payment collection).

@AGENTS.md

## Session start — read the local snapshot first
Read **`PROGRESS.md`** and **`docs/DEV_NOTES.md`** at session start (both are **local-only,
git-ignored** — they hold the current-state snapshot, internal/customer detail, and the resume
checklist; never move their content into tracked files).

## Binding rules
@.claude/rules/architecture.md
@.claude/rules/api-contracts.md
@.claude/rules/auth-scope.md
@.claude/rules/i18n-rtl.md
@.claude/rules/money-ledger.md
@.claude/rules/testing-qa.md

## Background context
@.claude/context/domain-glossary.md
@.claude/context/data-model.md
@.claude/context/deployment.md

## Playbooks (open on demand)
- `.claude/commands/deploy.md` — the deploy routine
- `.claude/commands/audit.md` — the read-only test audit
- `.claude/commands/new-feature.md` — standard shape of a feature task (validation gate + docs update + commit)
