# Self-hosted repository pilot

ProjectMind is its first real repository pilot. The repository checks in reviewable control inputs rather than generated evidence:

- `.projectmind/config.json` declares the exact test, typecheck, build, and lint commands.
- `.projectmind/constitution.json` prevents core-to-MCP and SDK-to-verifier dependency directions and requires fresh test plus typecheck evidence for trust-sensitive paths.
- `.projectmind/intents/PM-0001.json` binds four trust-boundary requirements to exact regression testcase names.
- `.projectmind/current-intent.json` selects that intent.

Run the same pilot locally from the repository root:

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm projectmind verify
```

A successful run must execute all configured commands in one run, preserve the repository fingerprint, find one uniquely matching passing testcase for every requirement, and satisfy active Constitution rules. The CLI then writes `.projectmind/latest-proof.json` and a timestamped proof under `.projectmind/proofs/`.

Evidence, graphs, runtime files, and ProofPacks are derived local artifacts and remain ignored by Git. CI uploads the latest ProofPack for inspection instead of committing it. The artifact is unsigned historical evidence under the documented trust model, not malicious-writer-resistant provenance.

This pilot demonstrates self-hosting on a non-fixture TypeScript repository. It does not replace the roadmap requirement for an independent external repository, a released-package adoption pilot, or the interactive Claude Code pilot.
