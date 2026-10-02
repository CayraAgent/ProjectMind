import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { recordMemory, searchMemory } from "../packages/memory/src/index.ts";

const exec = promisify(execFile);
const cli = resolve("apps/cli/src/index.ts");

async function fixture(t: test.TestContext): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pm-memory-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, ".projectmind", "memory"), { recursive: true });
  return root;
}

test("Engineering Memory retrieves ranked decisions, constraints, and incidents", async (t) => {
  const root = await fixture(t);
  await recordMemory(root, "decision", "Use PostgreSQL for transactional account data");
  await recordMemory(root, "constraint", "Account data must remain local during tests");
  await recordMemory(root, "incident", "PostgreSQL connection pool exhausted during import");
  const results = await searchMemory(root, "PostgreSQL account");
  assert.equal(results.length, 3);
  assert.equal(results[0]?.item.type, "decision");
  assert.deepEqual(results[0]?.matchedTerms, ["postgresql", "account"]);
  assert.ok((results[0]?.score ?? 0) > (results[1]?.score ?? 0));
});

test("memory retrieval filters types, limits results, and rejects empty queries", async (t) => {
  const root = await fixture(t);
  await recordMemory(root, "decision", "Keep verification deterministic");
  await recordMemory(root, "constraint", "Verification must remain deterministic");
  const filtered = await searchMemory(root, "deterministic", { type: "constraint", limit: 1 });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.item.type, "constraint");
  await assert.rejects(searchMemory(root, "---"), /letter or number/);
  await assert.rejects(searchMemory(root, "verification", { limit: 0 }), /1 to 50/);
});

test("memory retrieval fails closed on a malformed stored record", async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, ".projectmind", "memory", "mem_aaaaaaaaaaaaaaaaaaaaaaaa.json"), JSON.stringify({ id: "mem_aaaaaaaaaaaaaaaaaaaaaaaa", text: "missing fields" }));
  await assert.rejects(searchMemory(root, "missing"), /Invalid memory record/);
});

test("CLI recall reports memory as context and not evidence", async (t) => {
  const root = await fixture(t);
  await recordMemory(root, "constraint", "Never let memory set a verification verdict");
  const { stdout } = await exec(process.execPath, ["--experimental-strip-types", cli, "recall", "verification verdict", "--type", "constraint"], { cwd: root });
  assert.match(stdout, /ENGINEERING MEMORY \(declared local records; never verification evidence\)/);
  assert.match(stdout, /Never let memory set a verification verdict/);
  assert.match(stdout, /Matches: 1/);
});
