import { defineVerificationProvider, PROVIDER_API_VERSION } from "../index.ts";

export const gitDiffCheckProvider = defineVerificationProvider({
  manifest: {
    apiVersion: PROVIDER_API_VERSION,
    id: "dev.projectmind.git-diff-check",
    displayName: "Git diff check",
    version: "1.0.0",
    capabilities: ["verification-commands"],
  },
  commands: () => [{ kind: "static", command: "git diff --check", required: false, provider: "generic-command", timeoutMs: 30_000 }],
});
