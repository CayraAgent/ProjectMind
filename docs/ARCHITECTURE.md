# Architecture — v0.1 development preview

The deterministic core is model-independent. No LLM decides a verdict.

| Area | Responsibility |
| --- | --- |
| `core` | Data contracts, runtime schema validation, project configuration, stable SHA-256 identifiers |
| `parser` | TypeScript compiler AST traversal for JS/TS; sorted scanning without following symlinks |
| `graph` | Symbols, containment, imports, declared package dependencies, labelled test-name heuristics |
| `git` | Working-tree/base-ref changes, reverse-import impact, repository content fingerprint |
| `intent` | Requirement declarations and explicit command bindings |
| `evidence` | Fresh command execution, bounded output, timeouts, one run id, Node JUnit parsing |
| `verifier` | Pure declared-check verdict; orchestration rescans and rejects repository drift |
| `proofpack` | Runtime-validated JSON artifacts with intent, changes, evidence, scope and verdict |
| `mcp` | Official SDK stdio transport, validated tool arguments, operator-controlled execution |
| `report` / CLI | Human-readable output and exit codes |
| `memory` | Basic local decision/constraint/incident records; not evidence |
| `policy` / `sdk` | Bootstrap placeholders; not enforcement or a stable plugin API |

The directory structure separates responsibilities; this preview builds one distributable from a root manifest. Individual directories are not separately published packages. The pnpm workspace includes the runnable example. Do not add Turbo solely to orchestrate one distributable.

## Verification transaction

1. Capture Git commit and repository fingerprint.
2. Load validated config and intent; scan current source and compute conservative impact.
3. Run each configured command with one shared run id. Record state before/after each command.
4. Require successful exact-command bindings for every requirement and all required checks. Test requirements also require one uniquely matching passed testcase for each bound name.
5. Reject mixed runs, absent/stale evidence, timeouts, failed commands and repository drift.
6. Write an unsigned JSON ProofPack and return exit 0 for VERIFIED, 2 for NOT_VERIFIED, 1 for setup/contract errors.

Changing only generated graphs/evidence/proofs does not invalidate the fingerprint. Intent/config are included even when `.projectmind` is ignored by Git.

The fingerprint includes HEAD, Git-tracked and nonignored untracked file bytes/modes, symlink targets, and intent/config inputs. It excludes ignored files, dependency installations and generated ProjectMind artifacts. It is not a hermetic environment hash. Submodules are unsupported; invoke from the repository root.

## Incremental interfaces

Public contracts currently have version 1 and are development-preview formats. ProofPack v1 has a generated public JSON Schema and a checked-in compatibility fixture. An interface change must carry a compatibility note and tests before a stable release. The SDK/provider placeholders do not constitute a compatibility commitment yet.
