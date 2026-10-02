# Provider SDK v1

Provider SDK v1 lets an explicitly installed, trusted package contribute verification commands. It does not let a provider create `EvidenceRecord` objects, set repository fingerprints, write ProofPacks, or choose a verdict. ProjectMind executes merged commands later through its normal bounded runner and applies freshness, run-lineage, requirement-binding, and policy checks.

The development-preview import is:

```ts
import {
  PROVIDER_API_VERSION,
  defineVerificationProvider,
  mergeProviderCommands,
} from "projectmind/provider-sdk";
```

A provider declares an exact API version, reverse-domain-style identifier, SemVer implementation version, and its single v1 capability:

```ts
export const provider = defineVerificationProvider({
  manifest: {
    apiVersion: PROVIDER_API_VERSION,
    id: "com.example.static-checks",
    displayName: "Example static checks",
    version: "1.0.0",
    capabilities: ["verification-commands"],
  },
  commands: () => [{
    kind: "static",
    command: "example-check --no-write",
    required: false,
    provider: "generic-command",
    timeoutMs: 30000,
  }],
});
```

`resolveProviderCommands` accepts 1–32 commands and validates every item against the same command schema as `.projectmind/config.json`. Duplicate commands, unsupported API versions, malformed manifests, invalid evidence kinds/providers, and out-of-range timeouts fail closed. `mergeProviderCommands` returns a validated config value; it does not write the config or run anything.

## Trust boundary

Provider modules are executable Node.js code and therefore must be treated like build plugins or test dependencies. ProjectMind never discovers or imports repository files as providers automatically. Installation and import must be an explicit operator action. Review the package and every resulting shell command before saving it to `.projectmind/config.json` or enabling MCP/CI execution.

A provider cannot bypass the verifier merely by returning a passing command definition: requirements still need explicit bindings, structured test requirements still require built-in structured providers and exact testcase names, and all evidence must come from one fresh unchanged repository-state run.

The packaged `projectmind/provider-examples/git-diff-check` example contributes optional `git diff --check` static evidence and demonstrates the complete v1 surface.
