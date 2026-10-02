import test from "node:test";
import assert from "node:assert/strict";
import { defineVerificationProvider, mergeProviderCommands, PROVIDER_API_VERSION, resolveProviderCommands } from "../packages/sdk/src/index.ts";
import { gitDiffCheckProvider } from "../packages/sdk/src/examples/git-diff-check.ts";
import type { ProjectConfig } from "../packages/core/src/index.ts";

const config: ProjectConfig = {
  version: 1,
  project: { name: "fixture", root: "." },
  scanner: { include: ["."], extensions: [".ts"], exclude: [] },
  verification: { commands: [] },
};
const context = { root: "/fixture", project: config.project };

test("v1 provider resolves validated commands without producing evidence or verdicts", async () => {
  const commands = await resolveProviderCommands(gitDiffCheckProvider, context);
  assert.deepEqual(commands, [{ kind: "static", command: "git diff --check", required: false, provider: "generic-command", timeoutMs: 30_000 }]);
  assert.ok(!("collect" in gitDiffCheckProvider));
  assert.ok(Object.isFrozen(gitDiffCheckProvider.manifest));
});

test("provider commands merge only through the validated ProjectConfig contract", async () => {
  const merged = await mergeProviderCommands(gitDiffCheckProvider, context, config);
  assert.equal(merged.verification.commands[0]?.command, "git diff --check");
  await assert.rejects(mergeProviderCommands(gitDiffCheckProvider, context, {
    ...config,
    verification: { commands: [{ kind: "static", command: "git diff --check", required: true }] },
  }), /Duplicate commands/);
});

test("SDK rejects incompatible, malformed, empty, and duplicate providers fail-closed", async () => {
  assert.throws(() => defineVerificationProvider({
    manifest: { apiVersion: "projectmind.provider/v2" as typeof PROVIDER_API_VERSION, id: "Bad Id", displayName: "Bad", version: "latest", capabilities: ["verification-commands"] },
    commands: () => [],
  }));
  const empty = defineVerificationProvider({
    manifest: { apiVersion: PROVIDER_API_VERSION, id: "dev.example.empty", displayName: "Empty", version: "1.0.0", capabilities: ["verification-commands"] },
    commands: () => [],
  });
  await assert.rejects(resolveProviderCommands(empty, context), /between 1 and 32/);
  const duplicate = defineVerificationProvider({
    manifest: { apiVersion: PROVIDER_API_VERSION, id: "dev.example.duplicate", displayName: "Duplicate", version: "1.0.0", capabilities: ["verification-commands"] },
    commands: () => [{ kind: "lint", command: "npm run lint", required: true }, { kind: "lint", command: "npm run lint", required: false }],
  });
  await assert.rejects(resolveProviderCommands(duplicate, context), /duplicate commands/i);
  const invalidCommand = defineVerificationProvider({
    manifest: { apiVersion: PROVIDER_API_VERSION, id: "dev.example.invalid", displayName: "Invalid", version: "1.0.0", capabilities: ["verification-commands"] },
    commands: () => [{ kind: "lint", command: "npm run lint", required: true, timeoutMs: 700_000 }],
  });
  await assert.rejects(resolveProviderCommands(invalidCommand, context));
});
