import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { loadConfig, loadConstitution } from "../packages/core/src/project.ts";
import { loadIntent } from "../packages/intent/src/index.ts";

test("checked-in self-hosting contracts are valid and explicitly bound", async () => {
  const root = resolve(".");
  const [config, constitution, intent] = await Promise.all([
    loadConfig(root),
    loadConstitution(root),
    loadIntent(root, "PM-0001"),
  ]);
  assert.equal(config.project.name, "projectmind");
  assert.ok(config.verification.commands.some((item) => item.required && item.provider === "node-test-junit"));
  assert.ok(config.verification.commands.some((item) => item.required && item.kind === "typecheck"));
  assert.equal(intent.requirements.length, 4);
  assert.ok(intent.requirements.every((item) => item.evidenceCommands?.length === 1 && item.evidenceTests?.length === 1));
  assert.ok(constitution.dependencyRules.length >= 2);
  assert.ok(constitution.sensitivePaths.some((item) => item.prefix === "packages/verifier" && item.requiredEvidenceKinds.includes("test") && item.requiredEvidenceKinds.includes("typecheck")));
});
