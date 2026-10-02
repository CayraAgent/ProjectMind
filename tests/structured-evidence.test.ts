import test from "node:test";
import assert from "node:assert/strict";
import { parseNodeTestJunit } from "../packages/evidence/src/index.ts";
import { verifyIntent } from "../packages/verifier/src/index.ts";
import type { EvidenceRecord, IntentContract, ProjectConfig, TestCaseEvidence } from "../packages/core/src/index.ts";

const state = "a".repeat(64);
const command = "node --test --test-reporter=junit tests/auth.test.js";
const config: ProjectConfig = {
  version: 1,
  project: { name: "fixture", root: "." },
  scanner: { include: ["."], extensions: [".js"], exclude: [] },
  verification: { commands: [{ kind: "test", command, required: true, provider: "node-test-junit" }] },
};
function intent(testNames = ["login succeeds"]): IntentContract {
  return {
    version: 1,
    id: "PM-0001",
    title: "Login contract",
    createdAt: "2026-10-02T09:00:00.000Z",
    requirements: [{
      id: "REQ-1",
      statement: "Login succeeds",
      critical: true,
      evidenceKinds: ["test"],
      evidenceCommands: [command],
      evidenceTests: testNames,
    }],
    preserve: [],
    outOfScope: [],
  };
}
function evidence(cases: TestCaseEvidence[], overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    version: 1,
    id: "ev_fixture",
    kind: "test",
    command,
    startedAt: "2026-10-02T09:00:00.000Z",
    finishedAt: "2026-10-02T09:00:01.000Z",
    durationMs: 1000,
    exitCode: 0,
    stdout: "<testsuites/>",
    stderr: "",
    runId: "run-1",
    repositoryState: state,
    repositoryStateAfter: state,
    provider: "node-test-junit",
    testSummary: {
      provider: "node-test-junit",
      discovered: cases.length,
      passed: cases.filter((item) => item.status === "passed").length,
      failed: cases.filter((item) => item.status === "failed").length,
      skipped: cases.filter((item) => item.status === "skipped").length,
      cases,
    },
    ...overrides,
  };
}
const passing: TestCaseEvidence = { id: "test_login", name: "login succeeds", status: "passed" };

test("Node JUnit parser records passed, skipped, and failed testcases", () => {
  const summary = parseNodeTestJunit(`<?xml version="1.0"?><testsuites>
    <testcase name="login succeeds" time="0.005" classname="test" file="auth.test.js"/>
    <testcase name="blank is rejected"><skipped type="skipped"/></testcase>
    <testcase name="expired session fails"><failure type="testCodeFailure">boom</failure></testcase>
  </testsuites>`);
  assert.deepEqual({ discovered: summary.discovered, passed: summary.passed, failed: summary.failed, skipped: summary.skipped }, { discovered: 3, passed: 1, failed: 1, skipped: 1 });
  assert.deepEqual(summary.cases.map((item) => [item.name, item.status]), [
    ["login succeeds", "passed"],
    ["blank is rejected", "skipped"],
    ["expired session fails", "failed"],
  ]);
  assert.equal(summary.cases[0]?.durationMs, 5);
  assert.equal(parseNodeTestJunit('<testsuites><testcase name="A &amp; B"/></testsuites>').cases[0]?.name, "A & B");
});

test("zero discovered tests fail a required structured command", () => {
  const result = verifyIntent(config, intent(), [evidence([])], state);
  assert.equal(result.status, "NOT_VERIFIED");
  assert.equal(result.requiredCommandResults[0]?.status, "FAIL");
});

test("a skipped bound test does not verify its requirement", () => {
  const result = verifyIntent(config, intent(), [evidence([{ ...passing, status: "skipped" }])], state);
  assert.equal(result.status, "NOT_VERIFIED");
  assert.equal(result.requirements[0]?.status, "FAILED");
});

test("an unrelated passing test cannot satisfy a named test binding", () => {
  const result = verifyIntent(config, intent(), [evidence([{ ...passing, name: "another behavior" }])], state);
  assert.equal(result.status, "NOT_VERIFIED");
  assert.match(result.reasons.join(" "), /structured test binding/);
});

test("duplicate matching test names are ambiguous and refused", () => {
  const result = verifyIntent(config, intent(), [evidence([passing, { ...passing, id: "test_login_2" }])], state);
  assert.equal(result.status, "NOT_VERIFIED");
});

test("a failed testcase fails the command and the bound requirement", () => {
  const result = verifyIntent(config, intent(), [evidence([{ ...passing, status: "failed" }], { exitCode: 1 })], state);
  assert.equal(result.status, "NOT_VERIFIED");
  assert.equal(result.requiredCommandResults[0]?.status, "FAIL");
  assert.equal(result.requirements[0]?.status, "FAILED");
});

test("missing or malformed structured output fails closed", () => {
  const missing = evidence([passing]);
  delete missing.testSummary;
  assert.equal(verifyIntent(config, intent(), [missing], state).status, "NOT_VERIFIED");
  const malformed = evidence([passing], { evidenceError: "Invalid JUnit XML" });
  assert.equal(verifyIntent(config, intent(), [malformed], state).status, "NOT_VERIFIED");
  assert.throws(() => parseNodeTestJunit("not xml"), /JUnit/);
  assert.throws(() => parseNodeTestJunit('<!DOCTYPE testsuites [<!ENTITY x "boom">]><testsuites/>'), /document types/);
});

test("one uniquely matching passed testcase verifies the requirement", () => {
  const result = verifyIntent(config, intent(), [evidence([passing, { id: "other", name: "another behavior", status: "passed" }])], state);
  assert.equal(result.status, "VERIFIED");
  assert.equal(result.requirements[0]?.status, "VERIFIED");
});
