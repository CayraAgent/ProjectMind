# Project Constitution

`.projectmind/constitution.json` is a reviewed, versioned policy contract. `projectmind init` creates an empty version-1 contract and repeated initialization preserves existing rules.

```json
{
  "version": 1,
  "dependencyRules": [
    { "id": "ARCH-1", "from": "packages/core", "cannotImport": "packages/mcp" }
  ],
  "sensitivePaths": [
    { "id": "SEC-1", "prefix": "packages/auth", "requiredEvidenceKinds": ["test", "typecheck"] }
  ]
}
```

Prefixes are normalized repository-relative paths, not globs. Absolute paths, backslashes, `..`, `*`, and `?` are rejected. A prefix matches itself and descendants on path boundaries.

Dependency rules inspect resolved file-to-file `IMPORTS` edges. An unresolved import originating under a governed `from` prefix fails closed because compliance cannot be established. Sensitive-path rules activate when the Git change set includes a matching file and require fresh, passing evidence of every listed kind from the current verification run and repository state.

An error finding forces `NOT_VERIFIED` and is copied into the ProofPack verdict reasons. Constitution files are included in the repository fingerprint even when `.projectmind` is ignored, so editing policy invalidates previously collected evidence. These rules are deterministic repository checks, not a sandbox, permission system, secret scanner, or proof that the declared architecture is complete.
