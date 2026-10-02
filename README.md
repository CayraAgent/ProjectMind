# ProjectMind

> **Your agent writes code. ProjectMind proves it works.**

ProjectMind is an open-source, local-first verification and project-intelligence layer for AI coding agents and human developers.

It models three things explicitly:

**Intent → Change → Evidence**

ProjectMind does not let an agent mark its own work as verified. Verification is derived from repository state and recorded evidence.

## Principles

- Local first
- Model agnostic
- Deterministic core
- AI optional
- Evidence > claims
- No self-verification
- Git native
- Open formats
- Extensible
- Secure by default

## Current status

`v0.1.0-dev` implements the first vertical slice:

- repository initialization and project detection
- JS/TS source scanning
- basic symbol/import graph generation
- intent contracts
- command evidence collection
- verification
- JSON ProofPacks
- semantic change summary
- minimal MCP stdio server
- composite GitHub Action

Python, richer semantic parsing, policy enforcement, and the plugin SDK are being expanded toward the v0.3 application-candidate milestone.

## Quick start

Requires Node.js 22.6+.

```bash
npm run projectmind -- init
npm run projectmind -- intent create "Add refresh-token rotation" --require "Refresh tokens are single-use" --require "Existing sessions remain compatible"
npm run projectmind -- scan
npm run projectmind -- changes
npm run projectmind -- verify
```

Project state is stored under `.projectmind/` using open JSON files.

## MCP

Run the local stdio MCP server with:

```bash
npm run projectmind -- mcp
```

The server intentionally exposes `request_verification`, but **does not expose any `mark_verified` tool**.

## Development

```bash
npm test
npm run typecheck
npm run build
npm run validate
```

See [CONTRIBUTING.md](CONTRIBUTING.md), [ROADMAP.md](ROADMAP.md), and [SECURITY.md](SECURITY.md).
