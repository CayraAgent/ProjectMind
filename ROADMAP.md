# Roadmap — v0.3 application candidate

This plan stops at the Claude for Open Source application milestone. Program criteria must be checked against Anthropic's official page at application time. A release or contributor target is not an acceptance guarantee.

## v0.1 — trustworthy development preview → stable CLI

Implemented in the foundation PR:

- initialization, validated intent/config, JS/TS AST scanning and a basic graph
- explicit evidence bindings and fresh repository-state verification
- bounded execution, ProofPack, MCP stdio and GitHub Action
- missing-evidence → targeted-test → VERIFIED regression demo
- root package build/pack and production-dependency smoke check
- reproducible dependency lockfile and CI

Before `v0.1.0` can be released:

- [x] structured Node test results: distinguish zero tests/skips from relevant executed cases
- [x] reviewed ProofPack schema and compatibility fixture
- [x] TS config aliases/workspace resolution with unresolved-import reporting
- [ ] deleted-symbol/base-ref comparison fixtures
- [ ] reproducible CI-published package and full consumer/action validation
- [ ] cross-platform runner decision; tested OS support documented
- [ ] npm namespace ownership and distribution naming confirmed
- [ ] clear demo recording and first real repository pilot

## v0.2 — real-world verification

- [ ] Project Constitution and architecture/dependency/sensitive-path rules
- [ ] claim-to-evidence reporting with explicit strength levels
- [ ] Python parser/import/pytest support
- [ ] versioned provider/plugin SDK with example provider
- [ ] Claude Code and generic MCP compatibility pilots
- [ ] at least two real repositories using the released tool

Release gate: stable JS/TS and usable Python behavior, CI/CLI/MCP integration, meaningful provider regression tests and contributor documentation.

## v0.3 — community and application checkpoint

- [ ] Engineering Memory Lite retrieval for decision/constraint/incident
- [ ] contributor scaffold and 30–40 useful independently scoped issues
- [ ] community-written providers/detectors/adapters reviewed and merged
- [ ] three stable public releases, recent development, real usage and healthy CI
- [ ] target 25 genuine external contributors with merged contributions
- [ ] collect actual reach/adoption metrics; prepare the application from real data

Contributor growth depends on people choosing to participate. Do not invent contributors, users, stars, downloads or releases; do not manufacture tiny PRs solely to inflate metrics.

After the checkpoint, revise the next plan. Cloud, dashboards, cross-repository intelligence, organization governance, time travel, advanced runtime sandboxes and signed provenance are outside this implementation scope.
