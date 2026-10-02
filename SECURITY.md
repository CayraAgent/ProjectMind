# Security Policy

This is a development preview. No stable version is currently declared supported.

Report command-execution, verification-bypass, secret-exposure or path-traversal vulnerabilities privately through [GitHub Security Advisories](https://github.com/CayraAgent/ProjectMind/security/advisories/new) when enabled. If private reporting is unavailable, request a private reporting channel in a public issue without exploit details.

## Execution

CLI `verify` executes repository-defined shell commands. Review config, scripts, tests and dependencies before using it. MCP command execution is disabled by default and requires `PROJECTMIND_ALLOW_EXECUTION=1` set by the operator at server startup. Tool arguments cannot supply arbitrary commands. This opt-in authorizes repository code execution, including code later changed by an agent; use a disposable, unprivileged environment without production secrets.

CI must use `pull_request`, not `pull_request_target`, for untrusted PR execution. Do not pass secrets to fork checks. The composite action requires `trust-repository-code: 'true'` and exposes the result as a check/summary without a write-scoped GitHub token.

## Limits

No sandbox, cryptographic signatures, remote trust service, malicious-maintainer defense, full environment fingerprint or mathematical proof is provided. Freshness checks reject stale/mutating repository evidence, but cannot stop a malicious process from editing then restoring files between observations. Local writers can forge unsigned artifacts. See [the full semantics](docs/VERIFICATION.md).
