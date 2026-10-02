import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { initializeProject, loadConfig } from "../packages/core/src/project.ts";
import { createIntent, bindRequirement, loadIntent } from "../packages/intent/src/index.ts";
import { collectVerificationEvidence, collectCommandEvidence } from "../packages/evidence/src/index.ts";
import { verifyIntent } from "../packages/verifier/src/index.ts";
import { verifyProject } from "../packages/verifier/src/project.ts";
import { repositoryState, changedFiles } from "../packages/git/src/index.ts";
import { buildMindGraph } from "../packages/graph/src/index.ts";
import { parseProject } from "../packages/parser/src/index.ts";
import { writeJson } from "../packages/core/src/index.ts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const exec = promisify(execFile);
const cli = resolve("apps/cli/src/index.ts");
async function fixture(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), "pm-hardening-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "src"));
  await mkdir(join(root, "tests"));
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "auth-demo", type: "module", scripts: { test: "node --experimental-strip-types --test tests/login.test.js" } }));
  await writeFile(join(root, "src/auth.ts"), 'export const login = (user: string): boolean => user.trim().length > 0;\n');
  await writeFile(join(root, "tests/login.test.js"), 'import test from "node:test"; import assert from "node:assert/strict"; import { login } from "../src/auth.ts"; test("login", () => assert.equal(login("demo"), true));\n');
  await exec("git", ["init", "-q"], { cwd: root });
  await exec("git", ["-c", "user.name=ProjectMind Test", "-c", "user.email=test@example.com", "add", "."], { cwd: root });
  await exec("git", ["-c", "user.name=ProjectMind Test", "-c", "user.email=test@example.com", "commit", "-qm", "fixture"], { cwd: root });
  const config = await initializeProject(root);
  await createIntent(root, "Preserve login", ["Login succeeds"], [], []);
  return { root, config };
}

test("passing project checks cannot verify an unbound requirement", async (t) => {
  const { root } = await fixture(t);
  const { result } = await verifyProject(root);
  assert.equal(result.requiredCommandResults[0]?.status, "PASS");
  assert.equal(result.status, "NOT_VERIFIED");
  assert.equal(result.requirements[0]?.status, "UNVERIFIED");
});

test("bound fresh evidence verifies; same-commit source edit invalidates it", async (t) => {
  const { root, config } = await fixture(t);
  await bindRequirement(root, "REQ-1", config.verification.commands[0]!.command, undefined, ["login"]);
  const intent = await loadIntent(root);
  const evidence = await collectVerificationEvidence(root, config);
  const original = await repositoryState(root);
  assert.equal(verifyIntent(config, intent, evidence, original).status, "VERIFIED");
  await writeFile(join(root, "src/auth.ts"), "export const login = () => false;\n");
  const changed = await repositoryState(root);
  assert.notEqual(original, changed);
  assert.equal(verifyIntent(config, intent, evidence, changed).status, "NOT_VERIFIED");
});

test("command mutating a source file cannot verify its own output", async (t) => {
  const { root, config } = await fixture(t);
  config.verification.commands = [{ kind: "test", command: `node -e "require('fs').writeFileSync('src/auth.ts', 'export const login = () => false;')"`, required: true, provider: "node-test-junit" }];
  await writeJson(join(root, ".projectmind/config.json"), config);
  await bindRequirement(root, "REQ-1", config.verification.commands[0]!.command, undefined, ["login"]);
  const { result } = await verifyProject(root);
  assert.equal(result.status, "NOT_VERIFIED");
  assert.ok(result.reasons.some((reason) => /changed/.test(reason)));
});

test("independent runs and an unconfigured command do not satisfy verification", async (t) => {
  const { root, config } = await fixture(t);
  await bindRequirement(root, "REQ-1", config.verification.commands[0]!.command, undefined, ["login"]);
  const intent = await loadIntent(root);
  const a = await collectVerificationEvidence(root, config);
  const b = await collectVerificationEvidence(root, config);
  assert.equal(verifyIntent(config, intent, [...a, ...b], await repositoryState(root)).status, "NOT_VERIFIED");
  const record = { ...a[0]!, command: "some other passing test" };
  assert.equal(verifyIntent(config, intent, [record], await repositoryState(root)).status, "NOT_VERIFIED");
  assert.equal(verifyIntent(config, intent, a).status, "NOT_VERIFIED");
});

test("required failure, empty intent, and missing required commands fail closed", async (t) => {
  const { root, config } = await fixture(t);
  await bindRequirement(root, "REQ-1", config.verification.commands[0]!.command, undefined, ["login"]);
  const intent = await loadIntent(root);
  const evidence = await collectVerificationEvidence(root, config);
  const state = await repositoryState(root);
  assert.equal(verifyIntent(config, intent, [{ ...evidence[0]!, exitCode: 1 }], state).status, "NOT_VERIFIED");
  assert.equal(verifyIntent(config, { ...intent, requirements: [] }, evidence, state).status, "NOT_VERIFIED");
  assert.equal(verifyIntent({ ...config, verification: { commands: [] } }, intent, evidence, state).status, "NOT_VERIFIED");
});

test("timeouts and excessive output are bounded, recorded failures", async (t) => {
  const { root } = await fixture(t);
  const timeout = await collectCommandEvidence(root, { kind: "test", command: `node -e "setInterval(() => {}, 1000)"`, required: true, timeoutMs: 300 });
  assert.equal(timeout.termination, "timeout");
  assert.notEqual(timeout.exitCode, 0);
  assert.ok(timeout.durationMs < 5000);
  const flood = await collectCommandEvidence(root, { kind: "test", command: `node -e "process.stdout.write('x'.repeat(2*1024*1024))"`, required: true });
  assert.equal(flood.termination, "output-limit");
  assert.ok(flood.stdout.length <= 20_000);
});

test("init preserves configuration; invalid config and intent paths are rejected", async (t) => {
  const { root, config } = await fixture(t);
  config.verification.commands[0]!.timeoutMs = 1234;
  await writeJson(join(root, ".projectmind/config.json"), config);
  assert.equal((await initializeProject(root)).verification.commands[0]?.timeoutMs, 1234);
  await assert.rejects(loadIntent(root, "../../outside"));
  await assert.rejects(bindRequirement(root, "REQ-1", "unregistered"));
  await writeJson(join(root, ".projectmind/config.json"), { ...config, version: 2 });
  await assert.rejects(loadConfig(root));
});

test("AST scanner ignores comment/string traps and recognizes typed arrows, methods, and reexports", async (t) => {
  const { root, config } = await fixture(t);
  await writeFile(join(root, "src/index.ts"), `// function phantom() {} import "./fake";\nconst text = 'class Fake {}';\nexport { login } from "./auth.js";\nexport const typed = (x: number): number => x;\nconst single = x => x;\nexport class Service { async work() { return import("./auth.js"); } }\nconst dep = require("./auth.js");\n`);
  const graph = await buildMindGraph(root, config);
  assert.equal(graph.parser, "typescript-ast-5.9");
  for (const name of ["typed", "single", "Service", "work"]) assert.ok(graph.nodes.some((node) => node.name === name));
  for (const name of ["phantom", "Fake"]) assert.ok(!graph.nodes.some((node) => node.name === name));
  assert.ok(graph.edges.some((edge) => edge.type === "IMPORTS"));
  const nodes = graph.nodes.map((node) => node.id);
  assert.deepEqual(nodes, (await buildMindGraph(root, config)).nodes.map((node) => node.id));
  await writeFile(join(root, "src/broken.ts"), "export function broken( {");
  await assert.rejects(buildMindGraph(root, config), /Cannot parse/);
});

test("graph resolves tsconfig aliases, NodeNext paths, workspace packages, cycles, and reports unresolved imports", async (t) => {
  const { root, config } = await fixture(t);
  await mkdir(join(root, "src", "lib"), { recursive: true });
  await mkdir(join(root, "packages", "shared", "src"), { recursive: true });
  await writeFile(join(root, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      module: "NodeNext",
      moduleResolution: "NodeNext",
      baseUrl: ".",
      paths: { "@app/*": ["src/*"] },
    },
  }));
  await writeFile(join(root, "packages", "shared", "package.json"), JSON.stringify({
    name: "@demo/shared",
    type: "module",
    exports: "./src/index.ts",
  }));
  await writeFile(join(root, "packages", "shared", "src", "index.ts"), "export const shared = true;\n");
  await writeFile(join(root, "src", "lib", "a.ts"), 'export { b } from "./b.js"; export const a = true;\n');
  await writeFile(join(root, "src", "lib", "b.ts"), 'export { a } from "./a.js"; export const b = true;\n');
  await writeFile(join(root, "src", "consumer.ts"), [
    'import { a } from "@app/lib/a.js";',
    'import { shared } from "@demo/shared";',
    'import "missing-package";',
    'import "node:path";',
    "export const result = a && shared;",
  ].join("\n"));

  const graph = await buildMindGraph(root, config);
  const pathById = new Map(graph.nodes.map((node) => [node.id, node.path]));
  const imports = graph.edges.filter((edge) => edge.type === "IMPORTS").map((edge) => [pathById.get(edge.from), pathById.get(edge.to)]);
  assert.ok(imports.some(([from, to]) => from === "src/consumer.ts" && to === "src/lib/a.ts"));
  assert.ok(imports.some(([from, to]) => from === "src/consumer.ts" && to === "packages/shared/src/index.ts"));
  assert.ok(imports.some(([from, to]) => from === "src/lib/a.ts" && to === "src/lib/b.ts"));
  assert.ok(imports.some(([from, to]) => from === "src/lib/b.ts" && to === "src/lib/a.ts"));
  assert.deepEqual(graph.unresolvedImports, [{ sourcePath: "src/consumer.ts", specifier: "missing-package", reason: "not-found" }]);
  assert.deepEqual(graph.unresolvedImports, (await buildMindGraph(root, config)).unresolvedImports);
});

test("scanner includes and exclusions apply; symlink sources are not followed", async (t) => {
  const { root } = await fixture(t);
  await mkdir(join(root, "vendor"));
  await writeFile(join(root, "vendor/file.ts"), "export const outside = () => 1;");
  await symlink(join(root, "vendor/file.ts"), join(root, "src/linked.ts"));
  const parsed = await parseProject(root, [".ts"], [], ["src"]);
  assert.deepEqual(parsed.files.map((item) => item.path), ["src/auth.ts"]);
  assert.equal((await parseProject(root, [".ts"], ["src"], ["."])).files.length, 1);
  await assert.rejects(parseProject(root, [".ts"], [], ["../outside"]));
});

test("Git filename parsing handles newlines; generated ProofPacks do not pollute changes", async (t) => {
  const { root } = await fixture(t);
  await writeFile(join(root, "src/odd\nname.ts"), "export const n = 1;");
  await writeJson(join(root, ".projectmind/latest-proof.json"), { arbitrary: true });
  const files = await changedFiles(root);
  assert.ok(files.includes("src/odd\nname.ts"));
  assert.ok(!files.some((path) => path.includes("latest-proof")));
});

test("CLI demo: missing requirement, added targeted test, VERIFIED, then failing behavior", async (t) => {
  const { root, config } = await fixture(t);
  await createIntent(root, "Login contract", ["Login succeeds", "Blank user is rejected"], [], []);
  await bindRequirement(root, "REQ-1", config.verification.commands[0]!.command, undefined, ["login"]);
  await assert.rejects(exec(process.execPath, [cli, "verify"], { cwd: root }), (error: unknown) => {
    const e = error as { code: number; stdout: string };
    return e.code === 2 && e.stdout.includes("NOT_VERIFIED") && e.stdout.includes("REQ-2");
  });
  await writeFile(join(root, "tests/blank.test.js"), 'import test from "node:test"; import assert from "node:assert/strict"; import { login } from "../src/auth.ts"; test("blank rejected", () => assert.equal(login("  "), false));\n');
  const command = "node --experimental-strip-types --test --test-reporter=junit tests/blank.test.js";
  config.verification.commands.push({ kind: "test", command, required: true, provider: "node-test-junit" });
  await writeJson(join(root, ".projectmind/config.json"), config);
  await exec(process.execPath, [cli, "intent", "bind", "REQ-2", "--command", command, "--test", "blank rejected"], { cwd: root });
  const { stdout } = await exec(process.execPath, [cli, "verify"], { cwd: root });
  assert.match(stdout, /\nVERIFIED\n/);
  const proof = JSON.parse(await readFile(join(root, ".projectmind/latest-proof.json"), "utf8"));
  assert.ok(proof.evidence.every((item: { stdout: string }) => /tests 1/.test(item.stdout)));
  assert.equal(proof.scope, "declared-command-checks");
  assert.ok(proof.verification.repositoryState);
  assert.equal(proof.verification.requirements.length, 2);
  await writeFile(join(root, "src/auth.ts"), "export const login = (user: string) => user.length > 0;\n");
  await assert.rejects(exec(process.execPath, [cli, "verify"], { cwd: root }), (e: unknown) => (e as { code: number }).code === 2);
});

test("real MCP client negotiates stdio, validates inputs, and cannot execute by default or set a verdict", async (t) => {
  const { root } = await fixture(t);
  const client = new Client({ name: "projectmind-test", version: "1.0" });
  const transport = new StdioClientTransport({ command: process.execPath, args: [cli, "mcp"], cwd: root, env: { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")), PROJECTMIND_ALLOW_EXECUTION: "0" } });
  t.after(() => client.close());
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.equal(tools.length, 8);
  assert.ok(!tools.some((item) => /mark.*verif/.test(item.name)));
  const context = await client.callTool({ name: "projectmind_get_project_context", arguments: {} });
  assert.equal(context.isError, undefined);
  const blocked = await client.callTool({ name: "projectmind_request_verification", arguments: {} });
  assert.equal(blocked.isError, true);
  const invalid = await client.callTool({ name: "projectmind_get_intent", arguments: { id: "../../outside" } });
  assert.equal(invalid.isError, true);
  const claimed = await client.callTool({ name: "projectmind_record_claim", arguments: { text: "Everything passed" } });
  assert.match(JSON.stringify(claimed.content), /UNPROVEN/);
});

test("base-ref comparison includes committed changes and rejects option-shaped refs", async (t) => {
  const { root } = await fixture(t);
  await writeFile(join(root, "src/auth.ts"), "export const login = () => true;\n");
  await exec("git", ["add", "src/auth.ts"], { cwd: root });
  await exec("git", ["-c", "user.name=ProjectMind Test", "-c", "user.email=test@example.com", "commit", "-qm", "auth change"], { cwd: root });
  assert.ok(!(await changedFiles(root)).includes("src/auth.ts"));
  assert.ok((await changedFiles(root, "HEAD~1")).includes("src/auth.ts"));
  await assert.rejects(changedFiles(root, "--output=outside"));
});

test("ignored intent edits still invalidate evidence", async (t) => {
  const { root, config } = await fixture(t);
  await writeFile(join(root, ".gitignore"), ".projectmind/\n");
  await bindRequirement(root, "REQ-1", config.verification.commands[0]!.command, undefined, ["login"]);
  const evidence = await collectVerificationEvidence(root, config);
  const before = await repositoryState(root);
  const intent = await loadIntent(root);
  intent.requirements[0]!.statement = "A different behavior";
  await writeJson(join(root, ".projectmind/intents", `${intent.id}.json`), intent);
  const after = await repositoryState(root);
  assert.notEqual(before, after);
  assert.equal(verifyIntent(config, intent, evidence, after).status, "NOT_VERIFIED");
});

test("operator-enabled MCP requests run fresh checks and return a derived verdict", async (t) => {
  const { root, config } = await fixture(t);
  await bindRequirement(root, "REQ-1", config.verification.commands[0]!.command, undefined, ["login"]);
  const client = new Client({ name: "projectmind-enabled-test", version: "1.0" });
  const transport = new StdioClientTransport({ command: process.execPath, args: [cli, "mcp"], cwd: root, env: { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")), PROJECTMIND_ALLOW_EXECUTION: "1" } });
  t.after(() => client.close());
  await client.connect(transport);
  const result = await client.callTool({ name: "projectmind_request_verification", arguments: {} });
  const blocks = result.content as Array<{ type: string; text: string }>;
  const value = JSON.parse(blocks[0]!.text);
  assert.equal(value.verification.status, "VERIFIED");
  assert.ok(value.proofId);
});
