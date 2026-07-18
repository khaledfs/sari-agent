# Working instructions — moved

The project rules that lived here were migrated (2026-07-18) into **`.claude/rules/`**, the
single source of truth, loaded automatically via `CLAUDE.md`:

- `.claude/rules/architecture.md` — service layer, thin routes, data boundaries, SSE, client state, UX guardrails
- `.claude/rules/api-contracts.md` — response shape, status codes, stable error codes
- `.claude/rules/auth-scope.md` — session/JWT, scope resolver, restricted-account guard, stable auth flows
- `.claude/rules/i18n-rtl.md` — three locales, logical CSS, reduced motion
- `.claude/rules/money-ledger.md` — agorot integers, immutable ledger, pricing snapshots, stock commitment
- `.claude/rules/testing-qa.md` — the validation gate, dry-run-by-default scripts

Process playbooks: `.claude/commands/` · background context: `.claude/context/`.
The full pre-migration text is in this file's git history.
