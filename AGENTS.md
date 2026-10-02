# ProjectMind contributor instructions

Read README.md, docs/ARCHITECTURE.md, and docs/VERIFICATION.md before changing verification behavior.

- Preserve local-first, deterministic core, AI-optional, model-agnostic design.
- Claims, graph heuristics, and successful unrelated commands are never sufficient evidence.
- Never introduce a tool that lets an agent set verification status.
- Keep execution opt-in at the MCP boundary and fail closed on invalid contracts.
- Keep requirement bindings explicit and all evidence bound to one run and repository state.
- Add a regression test for any verification bypass fixed.
- Run `pnpm validate` and package smoke checks for release/build changes.
- Stay within the v0.3 application-candidate roadmap. Do not add cloud, organization, cross-repo, or advanced sandbox features yet.
- Do not claim that unsigned local ProofPacks resist a malicious local writer.
- Do not publish a stable release or npm package until the corresponding readiness gates are met.
