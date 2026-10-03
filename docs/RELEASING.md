# Release readiness

ProjectMind is still a development preview. Do not publish a stable package until every roadmap release gate is complete and the npm distribution name is confirmed under the maintainer account.

## Confirm the distribution name

Search results and an unclaimed-looking registry page are not proof of ownership. Sign in to the intended npm maintainer account, create or reserve the chosen unscoped package or organization scope, and record the exact name. Never put an npm token in the repository or command history.

Run the local gate with that exact name:

```bash
pnpm release:check --name @scope/projectmind
```

The first public artifact may be a reviewed development preview on the non-default `next` tag:

```bash
pnpm release:check --channel preview --name projectmind
```

Preview versions must use `x.y.z-dev.N`; they never satisfy the stable release gate and must not receive the `latest` tag.

The stable command intentionally exits with status 2 for a development version or when public/provenance settings differ from policy. `--json` emits a machine-readable blocker report.

## Stable publication checklist

1. Complete every `v0.1.0` release gate in `ROADMAP.md`.
2. Confirm the npm name and update package imports, documentation, and lockfile together.
3. Remove the development suffix, set `private` to `false`, and add `publishConfig` with public access and provenance in one reviewed release PR.
4. Run `pnpm validate`, `pnpm pack:repro`, the package smoke test, and `pnpm release:check --name <confirmed-name>`.
5. Inspect the tarball contents and published-package metadata before approving the provenance-enabled GitHub release workflow.

The readiness command validates metadata; it does not authenticate to npm, reserve a name, publish a package, or prove that the operator controls a namespace.
