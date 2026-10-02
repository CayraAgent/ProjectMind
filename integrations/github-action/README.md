# GitHub Action

The composite action lives at the repository root. Replace `<reviewed-commit-sha>` with a reviewed full commit SHA before use; no stable action tag exists yet.

```yaml
permissions:
  contents: read
steps:
  - uses: actions/checkout@v4
    with:
      fetch-depth: 0
  - uses: CayraAgent/ProjectMind@<reviewed-commit-sha>
    with:
      intent-id: PM-0001
      trust-repository-code: 'true'
```

Commit reviewed `.projectmind/config.json`, intent contracts, and the current-intent pointer in the target repository. The target's own dependencies must be installed separately. The action installs only ProjectMind's dependencies, runs fresh verification, fails the check on missing/failed evidence, writes a step summary, and uploads an unsigned ProofPack artifact.

Use `base-ref` for committed-change comparison and `working-directory` for a nested independent Git repository. Input values pass through environment variables and quoted shell arrays. The workflow must have read-only permissions; never run untrusted PR code with production secrets or `pull_request_target`.

This version does not post a PR conversation comment. The verdict appears as the Actions check and summary. A future comment integration must preserve the separation between untrusted execution and token-bearing reporting.
