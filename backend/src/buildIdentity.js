/**
 * Build identity — the `version` + `sha` half of the health contract.
 *
 * Switchyard's delivery reconciler polls this service's health endpoint and
 * reads these two fields to record what is actually running: the observed half
 * of the estate's delivery ledger (SWY-192 defines the contract, SERV-128 owns
 * the rollout). An observation is the half that is supposed to be trustworthy —
 * a report says what someone MEANT to deploy, an observation says what
 * answered — so a process reporting a plausible version it did not ship becomes
 * a real row in that ledger, indistinguishable from a real deploy.
 *
 * ── Why the blank check is not paranoia ────────────────────────────────────
 *
 * These arrive from Docker `ARG`s promoted to `ENV`. An ARG that is declared but
 * never passed expands to an EMPTY STRING, not to an unset variable, so
 * `ENV APP_VERSION=${APP_VERSION}` sets the key to `""`. A
 * `process.env.APP_VERSION || 'dev'` would catch that, but `??` would not — and
 * either way the rule is worth stating once, here, rather than being re-derived
 * at each call site.
 */

/** What a process reports when it was not built by a release. */
export const DEV_VERSION = 'dev';

/** Trim, then treat blank and whitespace-only as absent. */
function present(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Resolve what this build honestly reports.
 *
 * `version` is bare semver or the literal `dev` — never a `v` prefix, because
 * Switchyard compares it with strict equality against the image's
 * `org.opencontainers.image.version` label, which `docker/metadata-action`
 * stamps bare. A prefix files every deploy report as `claimed_not_confirmed`,
 * permanently.
 *
 * `sha` is the full 40-character commit or `null` — never abbreviated, since
 * the cross-service comparison is an equality test, not a prefix match.
 *
 * Takes the environment as a parameter so the blank/unset/set cases are
 * testable without mutating global state.
 */
export function resolveBuildIdentity(env = process.env) {
  return {
    version: present(env.APP_VERSION) ?? DEV_VERSION,
    sha: present(env.GIT_SHA) ?? null,
  };
}
