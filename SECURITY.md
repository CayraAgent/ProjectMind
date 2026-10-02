# Security Policy

ProjectMind executes repository-defined verification commands. Treat a repository as executable code and only run ProjectMind in repositories you trust.

## Reporting a vulnerability

Please do not open public issues for vulnerabilities that could enable arbitrary code execution, secret exposure, verification bypass, or forged ProofPacks. Report them privately to the maintainers through GitHub Security Advisories once the public repository is available.

## Trust model

An AI agent may request verification and record claims, but it cannot directly create a `VERIFIED` result. Verification status is computed from recorded evidence and repository state.
