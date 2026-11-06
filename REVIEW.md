# Review instructions

Review-only guidance. This file describes what a review of *this* repo is for.

## What this review is for

Cook Book is a small Vue 3 + Express + Prisma + Postgres recipe app, shipped as
one Docker image to GHCR by release-please. **The container runs
`prisma migrate deploy` on every start**, so a bad migration does not fail a
test — it stops prod booting, or changes data nobody can recover. Attention
goes there first.

### What CI proves
`ci.yml` builds the frontend and image. Once the COOK-5 harness lands it also
runs the Vitest suites (backend against a Postgres 16 service, frontend under
jsdom) in a `test` job; until then the repo has no automated tests, so a green
check says little about behaviour. A green check on a docs-only PR means nothing.

## Severity
- **Blocking:** data loss, a migration that is not additive/expand-only without
  a stated rollback, a broken `/api/health` contract (`version`, `sha`), an
  unauthenticated write that was not there before, a destructive default in a
  script (seed, import) that can reach `NODE_ENV=production`.
- **Advisory:** everything else. Style is not a finding.

## Always check
1. **Migrations** (`backend/prisma/migrations/`): additive and idempotent in
   effect; new NOT NULL columns have defaults or a backfill; foreign keys have an
   explicit ON DELETE; the previous released image must still run against the
   new schema (rollback story — see `docs/runbook.md`).
2. **API shape**: changes to a response must stay compatible with the shared
   recipe presenter and the example fixture; partial `PUT` must not blank
   omitted fields.
3. **Server-side input handling**: URL imports validate the hostname, not a
   substring; no DB or network access in preview paths.
4. **Conventional commits**: release-please derives the version from the PR
   title/commits. A `feat:` or `fix:` that is really breaking needs `!`.
5. **Tests**: a behaviour change without a test that would fail without it is
   advisory; gutting an existing test is blocking.
6. **Visible UI changes** carry a screenshot (Trestle URL) in the PR body.

## Verification bar
Quote the file and line for every finding; say what you ran or read to confirm.
If you could not verify, call it *unverified*, not *false*.

## Re-reviews
On a new push, check only whether earlier findings were addressed and what the
new commits changed.

## Summary shape
Verdict first, then blocking findings, then advisory, then what you checked.

## Reviewing a plan

Switchyard's plan pass reads this section when a COOK `decision` ticket's plan is
reviewed.

1. **What the pass verifies against this tree.** Cited paths, symbols and line
   numbers exist; ruling premises hold against `backend/prisma/schema.prisma`
   and the migrations; claimed current behaviour matches the routes/services
   named; criteria are checkable by `make test` or a named command. Anything
   it cannot check from the checkout is *unverified*, never *false*.
2. **Standing.** Advisory threads on a passing check; blocking only for a hole a
   person would bounce (data loss, un-rollbackable migration, a criterion no
   command can verify). Scrutiny goes to a ruling's recommended option;
   non-recommended options get an honesty check only. It never picks a ruling,
   never supersedes, and never approves a plan carrying a human-only ruling.
3. **Exit condition — ready for a human when:** no blocking finding on the
   recommended path; every migration step names its rollback; every criterion
   names how it is verified; prod-data assumptions cite how they were measured.
