# What ProjectMind verifies

`VERIFIED` means all configured required checks and explicitly bound requirement checks succeeded in one fresh execution against the recorded repository state.

A general passing test suite does not automatically verify every requirement. Each requirement starts unbound. A maintainer declares a relevant command and binds it; the verifier checks that exact command, its kind, exit status, run id and repository fingerprint.

```json
{
  "id": "REQ-1",
  "statement": "Blank user is rejected",
  "critical": true,
  "evidenceKinds": ["test"],
  "evidenceCommands": ["node --test --test-reporter=junit tests/blank-user.test.js"],
  "evidenceTests": ["blank user is rejected"]
}
```

Declare that command in `.projectmind/config.json` as well:

```json
{
  "kind": "test",
  "command": "node --test --test-reporter=junit tests/blank-user.test.js",
  "required": true,
  "provider": "node-test-junit",
  "timeoutMs": 60000
}
```

The Node and pytest providers parse JUnit XML, reject zero-test and all-skipped runs, and require each bound exact testcase name to resolve to one passing case. Missing, duplicate, skipped, failed, or unrelated names do not verify the requirement. Python projects write pytest output to `.projectmind/runtime/pytest-junit.xml`; the old report is removed before every run so a failed command cannot reuse it. The operator still reviews test relevance and strength. ProjectMind does not interpret arbitrary prose, verify assertion coverage, or establish that author-written tests are independent. Other runners remain generic checks until they receive a structured provider.

Python files are parsed with the installed Python 3 `ast` module. Local absolute and relative imports become graph edges; missing modules remain unresolved and therefore fail closed under applicable Constitution dependency rules. Python 3 is required when `.py` files are included in a scan.

## Refusal cases

- no intent requirements or no required commands
- unbound requirement, undeclared command, absent evidence kind, or absent structured test name
- failed/timed-out/output-limited command, malformed test report, zero tests, or all tests skipped
- evidence from multiple runs or another repository state
- repository mutation during execution
- invalid JSON contract or unsafe intent id (setup error, exit 1)
- Project Constitution dependency violation or sensitive-path change without its required fresh evidence kinds

Stored ProofPacks are historical artifacts. The CLI does not accept them as current execution evidence. The MCP evidence reader does not refresh a saved verdict.

Claims remain `UNPROVEN` data and are never verification inputs. `claim report` classifies only explicit links as `DECLARED_ONLY`, `EVIDENCE_LINKED`, or `VERIFIED_REQUIREMENT_LINKED`. The strongest level means that every referenced evidence record is passing and belongs to the named verified requirement in the latest historical ProofPack; it does not establish that the free-form claim text is true and never updates a verdict.

## Trust boundary

An agent cannot directly set a verdict through MCP. Removing a `mark_verified` tool alone does not make the system tamper-proof. Anyone with write access to tests/config/source or the artifact directory can weaken checks or forge unsigned JSON. A separately trusted CI runner and reviewed checks provide operational separation; signed provenance is out of scope until a later roadmap.

`preserve` and `outOfScope` remain declarations. Architecture enforcement comes only from the reviewed `.projectmind/constitution.json` contract. Dependency rules use resolved graph import edges; sensitive-path rules require fresh passing evidence kinds when matching files change. The graph's TESTED_BY filename links remain heuristic and are not evidence.

No authentication or secret handling guarantees should be inferred from a passing ProjectMind check. The runner inherits the operator's environment, executes trusted repository shell commands, and provides no sandbox/network isolation. Linux/macOS process groups are terminated on timeout; Windows descendant cleanup is not guaranteed and is not part of the tested platform set.

## ProofPack

A version-1 JSON artifact includes `projectMindVersion`, `scope: declared-command-checks`, intent/bindings, Git HEAD, changed files, recorded commands and logs, run id, before/after fingerprints and computed verdict. It is unsigned. Review logs before sharing: repository tests can print sensitive data.

## ProofPack v1 compatibility

The runtime source of truth is `proofPackSchema` in `packages/core/src/schema.ts`. Every ProofPack is validated before it is written. The generated public [JSON Schema](../schemas/proofpack-v1.schema.json) is checked into the repository for non-TypeScript consumers, and CI regenerates it to detect drift.

`version: 1` accepts backward-compatible additions only after the runtime schema, public schema, fixture, and documentation are updated together. Removing or changing a required field, identifier format, enum meaning, or verification invariant requires a new format version. `projectMindVersion` records the producing implementation and does not replace the format version.

The fixture under `fixtures/proofpack-v1/valid.json` is a compatibility contract. A VERIFIED v1 pack must cover every intent requirement, reference evidence contained in the pack, contain passing required checks, and bind evidence to one run and repository state. JSON Schema validates portable structure; runtime validation also enforces cross-object relationships that JSON Schema cannot fully express.
