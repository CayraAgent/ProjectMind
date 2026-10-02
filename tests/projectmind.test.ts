import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { initializeProject, loadConfig } from "../packages/core/src/project.ts";
import { buildMindGraph, persistMindGraph } from "../packages/graph/src/index.ts";
import { createIntent } from "../packages/intent/src/index.ts";
import { collectVerificationEvidence } from "../packages/evidence/src/index.ts";
import { verifyIntent } from "../packages/verifier/src/index.ts";
import { summarizeChanges } from "../packages/git/src/index.ts";
import { createProofPack } from "../packages/proofpack/src/index.ts";

const execFileAsync = promisify(execFile);

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "projectmind-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({
    name: "fixture-app",
    scripts: {
      test: "node -e \"process.exit(0)\"",
      typecheck: "node -e \"process.exit(0)\""
    }
  }, null, 2));
  await writeFile(join(root, "src", "auth.ts"), `export function login(user: string) { return user.length > 0; }\n`);
  await writeFile(join(root, "src", "index.ts"), `import { login } from "./auth.ts";\nexport const run = () => login("demo");\n`);
  await execFileAsync("git", ["init", "-q"], { cwd: root });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  await execFileAsync("git", ["config", "user.name", "ProjectMind Test"], { cwd: root });
  await execFileAsync("git", ["add", "."], { cwd: root });
  await execFileAsync("git", ["commit", "-qm", "fixture"], { cwd: root });
  return root;
}

test("initialization builds a usable graph", async () => {
  const root = await fixture();
  const config = await initializeProject(root);
  const graph = await buildMindGraph(root, config);
  await persistMindGraph(root, graph);

  assert.equal(config.project.name, "fixture-app");
  assert.ok(graph.nodes.some((node) => node.type === "FUNCTION" && node.name === "login"));
  assert.ok(graph.edges.some((edge) => edge.type === "IMPORTS"));
});

test("verification derives VERIFIED from passing evidence", async () => {
  const root = await fixture();
  const config = await initializeProject(root);
  const graph = await buildMindGraph(root, config);
  await persistMindGraph(root, graph);
  const intent = await createIntent(root, "Keep authentication working", ["Authentication remains functional"], [], []);
  const evidence = await collectVerificationEvidence(root, config);
  const result = verifyIntent(config, intent, evidence);

  assert.equal(result.status, "VERIFIED");
  assert.equal(result.requirements[0]?.status, "VERIFIED");
});

test("verification refuses missing required evidence", async () => {
  const root = await fixture();
  const config = await initializeProject(root);
  const intent = await createIntent(root, "Runtime behavior is safe", ["Runtime behavior is independently observed"], [], [], ["runtime"]);
  const result = verifyIntent(config, intent, []);

  assert.equal(result.status, "NOT_VERIFIED");
  assert.equal(result.requirements[0]?.status, "UNVERIFIED");
});

test("change summary and ProofPack preserve intent/change/evidence lineage", async () => {
  const root = await fixture();
  const config = await initializeProject(root);
  const graph = await buildMindGraph(root, config);
  await persistMindGraph(root, graph);
  const intent = await createIntent(root, "Change auth", ["Auth behavior has evidence"], [], []);
  await writeFile(join(root, "src", "auth.ts"), `export function login(user: string) { return user.trim().length > 0; }\n`);
  const change = await summarizeChanges(root, graph);
  const evidence = await collectVerificationEvidence(root, config);
  const verification = verifyIntent(config, intent, evidence);
  const proof = await createProofPack(root, config.project.name, intent, change, evidence, verification);

  assert.ok(change.files.includes("src/auth.ts"));
  assert.ok(change.changedSymbols.some((symbol) => symbol.name === "login"));
  assert.equal(proof.intent.id, intent.id);
  assert.equal(proof.verification.status, "VERIFIED");

  const persisted = JSON.parse(await readFile(join(root, ".projectmind", "latest-proof.json"), "utf8")) as { id: string };
  assert.equal(persisted.id, proof.id);
});

test("config can be loaded after initialization", async () => {
  const root = await fixture();
  await initializeProject(root);
  const config = await loadConfig(root);
  assert.equal(config.version, 1);
  assert.ok(config.verification.commands.some((command) => command.kind === "test"));
});
