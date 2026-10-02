import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseProject } from "../packages/parser/src/index.ts";
import { buildMindGraph } from "../packages/graph/src/index.ts";
import { initializeProject } from "../packages/core/src/project.ts";
import { parsePytestJunit } from "../packages/evidence/src/index.ts";

test("Python AST scanner records functions, classes, tests, and local imports", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pm-python-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "src", "app"), { recursive: true });
  await mkdir(join(root, "tests"));
  await writeFile(join(root, "src", "app", "utils.py"), "def helper():\n    return True\n");
  await writeFile(join(root, "src", "app", "service.py"), "import os\nimport definitely_missing_projectmind\nfrom .utils import helper\nclass Service:\n    async def run(self):\n        return helper()\n");
  await writeFile(join(root, "tests", "test_service.py"), "from src.app.service import Service\ndef test_service():\n    assert Service\n");
  const parsed = await parseProject(root, [".py"], []);
  assert.ok(parsed.files.some((item) => item.path === "tests/test_service.py" && item.type === "TEST"));
  assert.ok(parsed.symbols.some((item) => item.name === "Service" && item.type === "CLASS"));
  assert.ok(parsed.symbols.some((item) => item.name === "run" && item.type === "FUNCTION"));
  const graph = await buildMindGraph(root, { version: 1, project: { name: "python-fixture", root: "." }, scanner: { include: ["."], extensions: [".py"], exclude: [] }, verification: { commands: [] } });
  assert.equal(graph.parser, "typescript-ast-5.9+python-ast-3");
  assert.ok(graph.edges.some((edge) => edge.type === "IMPORTS" && edge.metadata?.specifier === ".utils"));
  assert.ok(graph.edges.some((edge) => edge.type === "IMPORTS" && edge.metadata?.specifier === "src.app.service"));
  assert.ok(!graph.unresolvedImports.some((item) => item.specifier === "os"));
  assert.ok(graph.unresolvedImports.some((item) => item.specifier === "definitely_missing_projectmind"));
});

test("Python project initialization configures structured pytest evidence", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pm-python-init-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "tests"));
  await writeFile(join(root, "pyproject.toml"), "[project]\nname = \"python-fixture\"\n");
  const config = await initializeProject(root);
  assert.ok(config.scanner.extensions.includes(".py"));
  assert.deepEqual(config.verification.commands, [{ kind: "test", command: "python -m pytest --junitxml=.projectmind/runtime/pytest-junit.xml", required: true, provider: "pytest-junit" }]);
});

test("pytest JUnit output becomes structured testcase evidence", () => {
  const summary = parsePytestJunit('<?xml version="1.0"?><testsuites><testsuite><testcase classname="tests.test_auth" name="test_login" time="0.01"/><testcase name="test_skip"><skipped/></testcase></testsuite></testsuites>');
  assert.equal(summary.provider, "pytest-junit");
  assert.deepEqual({ discovered: summary.discovered, passed: summary.passed, skipped: summary.skipped }, { discovered: 2, passed: 1, skipped: 1 });
  assert.equal(summary.cases[0]?.name, "test_login");
});
