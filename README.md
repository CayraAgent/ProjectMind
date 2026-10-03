# ProjectMind

[![CI](https://github.com/CayraAgent/ProjectMind/actions/workflows/ci.yml/badge.svg)](https://github.com/CayraAgent/ProjectMind/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)

**Your agent writes code. ProjectMind checks the evidence.**

An open-source, local-first verification and project-intelligence layer for AI coding agents and human developers. No model API or cloud account is required.

**Intent → Change → Evidence → Verdict**

## Status: v0.1 development preview

The initial bootstrap has been recovered and hardened. This is a development preview, not a stable release. JS/TS scanning uses the TypeScript compiler AST, Python scanning uses Python 3 `ast`, and deterministic policies and structured test providers remain independent of any model.

Implemented:

- project detection, idempotent initialization, validated JSON contracts
- JS/TS functions, typed arrows, classes, methods, imports and reexports
- TypeScript `paths`/`baseUrl`, NodeNext JS-to-TS and local workspace import resolution, with explicit unresolved-import diagnostics
- conservative file-level change and reverse-import impact analysis
- deterministic Project Constitution enforcement for dependency boundaries and sensitive paths
- explicit requirement-to-command-and-test evidence bindings
- fresh, single-run evidence tied to Git HEAD and repository content
- timeouts, bounded logs, fail-closed verification and JSON ProofPacks
- official MCP SDK stdio server, with command execution disabled by default
- reusable generic MCP compatibility pilot and tested Claude Code project configuration
- GitHub Action with an explicit trust gate, check result, summary and artifact
- self-hosted repository pilot: ProjectMind verifies its own reviewed trust-boundary intent in CI
- development packaging and CI on Node 22 / 24
- deterministic local Engineering Memory retrieval for decisions, constraints and incidents

`VERIFIED` means the declared checks ran successfully for the recorded repository state. It does not mean arbitrary natural-language requirements were mathematically proved, the software is bug-free, or a malicious author could not forge a local artifact. Read [verification semantics](docs/VERIFICATION.md).

## Development setup

Requires Node 22.18+ and pnpm 11.25.0.

```bash
pnpm install --frozen-lockfile
pnpm validate
pnpm pack:check
node scripts/package-smoke.mjs ../projectmind-preview.tgz
pnpm pack:repro
pnpm projectmind verify
```

## Try it on your repository

Install the development preview from npm:

```bash
npm install --global @callabens/projectmind@next
projectmind --help
```

Run the source CLI by absolute path from the root of a trusted Git repository with at least one commit. `init` detects package scripts but does not execute them.

```bash
node /path/to/ProjectMind/apps/cli/src/index.ts init
node /path/to/ProjectMind/apps/cli/src/index.ts intent create "Keep login working" --require "Login succeeds"
node /path/to/ProjectMind/apps/cli/src/index.ts verify
# NOT_VERIFIED: REQ-1 has no explicit evidence binding; exit 2
node /path/to/ProjectMind/apps/cli/src/index.ts intent bind REQ-1 \
  --command "node --test --test-reporter=junit tests/login.test.js" \
  --test "login succeeds"
node /path/to/ProjectMind/apps/cli/src/index.ts verify
```

Review `.projectmind/config.json` before execution. For Node’s built-in test runner, `init` creates a `node-test-junit` command automatically. Python projects receive a `pytest-junit` command that writes its report under derived runtime state. Bind each test requirement to that exact configured command and one or more exact testcase names. Generic test commands cannot prove a test requirement.

Use `changes --base <git-ref>` for committed changes against a fetched ref. Without `--base`, the default is working-tree changes against HEAD. ProjectMind reconstructs deleted JS/TS symbols from the comparison commit and reports them separately from symbols present in changed files.

For a runnable example, see [examples/basic-ts](examples/basic-ts/README.md). The regression suite exercises missing evidence → targeted test added → VERIFIED → failing behavior → NOT_VERIFIED.

Run `pnpm demo` for the deterministic recording flow: an unbound passing test fails closed, an exact binding verifies, and a real regression returns the verdict to `NOT_VERIFIED`. See the [demo recording guide](docs/DEMO.md).

Free-form claims can carry explicit evidence, intent, and requirement links. `projectmind claim report` reports their historical linkage strength without treating claim text as evidence or changing verification state.

## MCP and CI

- [Claude Code setup](integrations/claude-code/README.md)
- [Generic MCP setup](integrations/generic-mcp/README.md)
- [GitHub Action setup](integrations/github-action/README.md)
- [Provider SDK v1](docs/PROVIDERS.md)
- [Engineering Memory Lite](docs/MEMORY.md)

The MCP server exposes `projectmind_request_verification`, never a status-setting tool. Execution requires an operator to enable `PROJECTMIND_ALLOW_EXECUTION=1` at server startup.

## Self-hosted pilot

This repository checks in its reviewed [ProjectMind configuration](.projectmind/config.json), [Constitution](.projectmind/constitution.json), and [trust-boundary intent](.projectmind/intents/PM-0001.json). CI runs ProjectMind against those contracts and uploads the resulting historical ProofPack. See [self-hosting notes](docs/SELF-HOSTING.md).

## Principles

Local first · Model agnostic · Deterministic core · AI optional · Evidence > claims · No self-verification API · Git native · Open formats · Extensible · Secure by default

See [architecture](docs/ARCHITECTURE.md), [Project Constitution](docs/CONSTITUTION.md), [platform support](docs/PLATFORMS.md), [roadmap](ROADMAP.md), [contributing](CONTRIBUTING.md), and [security policy](SECURITY.md).

Maintainers preparing a package release should follow the fail-closed [release readiness guide](docs/RELEASING.md). The distribution name is not considered confirmed until the intended npm maintainer account controls it.

## ProofPack format

ProjectMind validates each generated ProofPack against its versioned runtime contract before writing it. Non-TypeScript consumers can use the checked-in [ProofPack v1 JSON Schema](schemas/proofpack-v1.schema.json) and [compatibility fixture](fixtures/proofpack-v1/valid.json). Cross-object lineage checks remain enforced by ProjectMind’s runtime validator.
