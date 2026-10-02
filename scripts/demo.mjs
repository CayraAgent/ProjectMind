import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(projectRoot, "apps/cli/src/index.ts");
const args = process.argv.slice(2);
const keep = args.includes("--keep");
const paceIndex = args.indexOf("--pace");
const pace = paceIndex >= 0 ? Number(args[paceIndex + 1]) : 0;
if (!Number.isFinite(pace) || pace < 0 || pace > 10_000) throw new Error("--pace must be between 0 and 10000 milliseconds.");

const root = mkdtempSync(join(tmpdir(), "projectmind-demo-"));
const wait = () => pace > 0 ? new Promise((resolveDelay) => setTimeout(resolveDelay, pace)) : Promise.resolve();
const heading = async (text) => {
  await wait();
  console.log(`\n=== ${text} ===\n`);
};
const show = async (command, commandArgs, expectedCodes = [0]) => {
  await wait();
  console.log(`$ ${command}`);
  const result = spawnSync(process.execPath, commandArgs, { cwd: root, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
  if (result.stdout.trim()) console.log(result.stdout.trim());
  if (result.stderr.trim()) console.error(result.stderr.trim());
  if (!expectedCodes.includes(result.status ?? 1)) throw new Error(`${command} exited ${result.status ?? "without a status"}.`);
  return result;
};

try {
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "tests"));
  writeFileSync(join(root, ".gitignore"), ".projectmind/\n");
  writeFileSync(join(root, "package.json"), JSON.stringify({
    name: "projectmind-demo",
    type: "module",
    scripts: { test: "node --test tests/login.test.js" },
  }, null, 2));
  writeFileSync(join(root, "src/login.js"), "export const login = (user) => Boolean(user?.trim());\n");
  writeFileSync(join(root, "tests/login.test.js"), 'import test from "node:test"; import assert from "node:assert/strict"; import { login } from "../src/login.js"; test("valid user can log in", () => assert.equal(login("demo"), true));\n');
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["-c", "user.name=ProjectMind Demo", "-c", "user.email=demo@example.com", "commit", "-qm", "demo fixture"], { cwd: root });

  console.log("ProjectMind trust-gate demo");
  console.log("Isolated temporary repository; no network or model API is used.");

  await heading("1. Initialize and declare intent");
  await show("projectmind init", ["--experimental-strip-types", cli, "init"]);
  await show('projectmind intent create "Protect login" --require "Valid user can log in"', ["--experimental-strip-types", cli, "intent", "create", "Protect login", "--require", "Valid user can log in"]);

  await heading("2. A passing but unbound test is not proof");
  const unbound = await show("projectmind verify", ["--experimental-strip-types", cli, "verify"], [2]);
  if (!unbound.stdout.includes("NOT_VERIFIED") || !unbound.stdout.includes("structured test binding is missing")) throw new Error("Expected the unbound requirement to fail closed.");

  await heading("3. Bind exact command and testcase");
  const config = JSON.parse(readFileSync(join(root, ".projectmind/config.json"), "utf8"));
  const testCommand = config.verification.commands.find((item) => item.provider === "node-test-junit")?.command;
  if (!testCommand) throw new Error("Demo initialization did not create structured Node test evidence.");
  await show("projectmind intent bind REQ-1 --command <configured> --test \"valid user can log in\"", ["--experimental-strip-types", cli, "intent", "bind", "REQ-1", "--command", testCommand, "--test", "valid user can log in"]);
  const verified = await show("projectmind verify", ["--experimental-strip-types", cli, "verify"]);
  if (!verified.stdout.includes("\nVERIFIED\n") || !verified.stdout.includes("ProofPack:")) throw new Error("Expected bound fresh evidence to verify.");

  await heading("4. Break behavior; stale success cannot be reused");
  writeFileSync(join(root, "src/login.js"), "export const login = () => false;\n");
  const broken = await show("projectmind verify", ["--experimental-strip-types", cli, "verify"], [2]);
  if (!broken.stdout.includes("NOT_VERIFIED")) throw new Error("Expected the regression to fail closed.");

  await heading("Demo complete");
  console.log("Observed: NOT_VERIFIED -> VERIFIED -> NOT_VERIFIED");
  console.log("Every verdict came from fresh, explicitly bound repository evidence.");
  if (keep) console.log(`Demo repository kept at: ${root}`);
} finally {
  if (!keep) rmSync(root, { recursive: true, force: true });
}
