# Changelog

## Unreleased — 0.1.0-dev

- Recover the original local bootstrap and establish the public GitHub project.
- Replace regex JS/TS extraction with TypeScript AST scanning.
- Require explicit requirement-to-command evidence bindings.
- Parse Node JUnit evidence and bind requirements to exact passing testcase names; reject empty, skipped, failed, duplicate, unrelated, or malformed reports.
- Bind evidence to one run, Git HEAD and repository content; refuse stale/mutating runs.
- Bound output and execution time, and isolate child commands from Node test-worker context.
- Validate contracts and intent ids; preserve config on repeated initialization.
- Use the official MCP SDK; require operator opt-in for execution.
- Add CI, lockfile, consumer packaging checks and a root composite Action.
- Document trust limits and scope the roadmap to the v0.3 application candidate.

No stable release or npm publication has occurred.
