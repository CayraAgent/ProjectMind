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

The Node provider parses JUnit XML, rejects zero-test and all-skipped runs, and requires each bound exact testcase name to resolve to one passing case. Missing, duplicate, skipped, failed, or unrelated names do not verify the requirement. The operator still reviews test relevance and strength. v0.1 does not interpret arbitrary prose, verify assertion coverage, or establish that author-written tests are independent. Other runners remain generic checks until they receive a structured provider.

## Refusal cases

- no intent requirements or no required commands
- unbound requirement, undeclared command, absent evidence kind, or absent structured test name
- failed/timed-out/output-limited command, malformed test report, zero tests, or all tests skipped
- evidence from multiple runs or another repository state
- repository mutation during execution
- invalid JSON contract or unsafe intent id (setup error, exit 1)

Stored ProofPacks are historical artifacts. The CLI does not accept them as current execution evidence. The MCP evidence reader does not refresh a saved verdict.

## Trust boundary

An agent cannot directly set a verdict through MCP. Removing a `mark_verified` tool alone does not make the system tamper-proof. Anyone with write access to tests/config/source or the artifact directory can weaken checks or forge unsigned JSON. A separately trusted CI runner and reviewed checks provide operational separation; signed provenance is out of scope until a later roadmap.

`preserve` and `outOfScope` are declarations in this version. The graph's TESTED_BY filename links are explicitly heuristic. Neither is verification evidence or architecture enforcement.

No authentication or secret handling guarantees should be inferred from a passing ProjectMind check. The runner inherits the operator's environment, executes trusted repository shell commands, and provides no sandbox/network isolation. Linux/macOS process groups are terminated on timeout; Windows descendant cleanup is not guaranteed and is not part of the tested platform set.

## ProofPack

A version-1 JSON artifact includes `projectMindVersion`, `scope: declared-command-checks`, intent/bindings, Git HEAD, changed files, recorded commands and logs, run id, before/after fingerprints and computed verdict. It is unsigned. Review logs before sharing: repository tests can print sensitive data.
