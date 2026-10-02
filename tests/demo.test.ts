import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

test("recording demo deterministically shows fail-closed, verified, then regression", async () => {
  const { stdout } = await exec(process.execPath, ["scripts/demo.mjs"], { cwd: process.cwd(), maxBuffer: 4 * 1024 * 1024 });
  assert.match(stdout, /A passing but unbound test is not proof/);
  assert.match(stdout, /structured test binding is missing/);
  assert.match(stdout, /\nVERIFIED\n/);
  assert.match(stdout, /ProofPack: proof_/);
  assert.match(stdout, /Observed: NOT_VERIFIED -> VERIFIED -> NOT_VERIFIED/);
  assert.doesNotMatch(stdout, /projectmind-demo-[A-Za-z0-9]/);
});
