# Contributing to ProjectMind

ProjectMind is designed to be contributor-friendly. Small, isolated integrations are preferred over changes that couple unrelated subsystems.

## Setup

```bash
git clone <your-fork>
cd ProjectMind
npm test
npm run typecheck
```

Node 22.6+ is required. The repository is dependency-light by design.

## Contribution areas

Good first contribution categories include:

- language support
- test/evidence providers
- framework detection
- agent adapters
- documentation
- fixtures and regression tests

Every behavioral change should include a test. Changes to verification semantics should also include a short rationale in the PR description.

## Pull requests

Keep PRs focused. Explain:

1. the problem,
2. the intended behavior,
3. how it was verified,
4. any known limitations.

ProjectMind follows the rule it enforces elsewhere: claims are not evidence.
